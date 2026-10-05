import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/server";
import type { AgentCallRow, ApprovalRow, HarnessConfig, IncidentRow, MemoryRow, Pitch, Run, ToolCallRow, User } from "@/lib/types";
import { NotFoundError } from "./errors";
import { initialRunState } from "./run-state";
import type { Repo } from "./repo";

type Row = Record<string, any>;
const num = (v: unknown) => Number(v);
const numOrNull = (v: unknown) => (v === null || v === undefined ? null : Number(v));

const toPitch = (r: Row): Pitch => ({ ...r, ask_amount: num(r.ask_amount), equity_offered: num(r.equity_offered), revenue: num(r.revenue), claimed_revenue: numOrNull(r.claimed_revenue), growth_pct: num(r.growth_pct), monthly_burn: num(r.monthly_burn) }) as Pitch;
const toUser = (r: Row): User => ({ ...r, approval_limit: num(r.approval_limit) }) as User;
const toRun = (r: Row): Run => ({ ...r, cost_usd: num(r.cost_usd) }) as Run;
const toAgentCall = (r: Row): AgentCallRow => ({ ...r, cost_usd: num(r.cost_usd) }) as AgentCallRow;
const toApproval = (r: Row): ApprovalRow => r as ApprovalRow;
const toMemory = (r: Row): MemoryRow => r as MemoryRow;
const toIncident = (r: Row): IncidentRow => r as IncidentRow;
const toConfig = (r: Row): HarnessConfig => r as HarnessConfig;

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export class SupabaseRepo implements Repo {
  private db: SupabaseClient;
  constructor(db: SupabaseClient = createAdminClient()) {
    this.db = db;
  }

  private fail(table: string, op: string, error: { message: string }): never {
    throw new Error(`${table}: ${op} failed: ${error.message}`);
  }
  private async one(table: string, col: string, val: string | number): Promise<Row> {
    const { data, error } = await this.db.from(table).select("*").eq(col, val).maybeSingle();
    if (error) this.fail(table, "select", error);
    if (!data) throw new Error(`${table}: not found (${col}=${val})`);
    return data;
  }
  private async assertExists(table: string, id: string): Promise<void> {
    const { data, error } = await this.db.from(table).select("id").eq("id", id).maybeSingle();
    if (error) this.fail(table, "select", error);
    if (!data) throw new NotFoundError(table, id);
  }
  private async insert(table: string, row: Row): Promise<Row> {
    const { data, error } = await this.db.from(table).insert(row).select().single();
    if (error) this.fail(table, "insert", error);
    return data;
  }

  async getPitch(id: string) { return toPitch(await this.one("pitches", "id", id)); }
  async getPitchBySlug(slug: string) { return toPitch(await this.one("pitches", "slug", slug)); }
  async getConfig(version: number) { return toConfig(await this.one("harness_configs", "version", version)); }
  async getActiveConfig() { return toConfig(await this.one("harness_configs", "is_active", "true")); }
  async getUser(id: string) { return toUser(await this.one("users", "id", id)); }

  async createRun(r: Pick<Run, "pitch_id" | "config_version" | "autonomy_level" | "started_by">) {
    return toRun(await this.insert("runs", { pitch_id: r.pitch_id, config_version: r.config_version, autonomy_level: r.autonomy_level, started_by: r.started_by, state: initialRunState() }));
  }
  async getRun(id: string) { return toRun(await this.one("runs", "id", id)); }
  async updateRun(id: string, patch: Partial<Run>, expectStep?: number) {
    let q = this.db.from("runs").update(patch).eq("id", id);
    if (expectStep !== undefined) q = q.eq("step_count", expectStep);
    const { data, error } = await q.select().maybeSingle();
    if (error) this.fail("runs", "update", error);
    if (data) return toRun(data);
    await this.assertExists("runs", id);
    return null;
  }

  async addCheckpoint(c: { run_id: string; seq: number; node: string; state: unknown; duration_ms: number }) {
    const { error } = await this.db.from("checkpoints").insert(c);
    if (error) this.fail("checkpoints", "insert", error);
  }
  async lastCheckpoint(runId: string, filter?: { excludeNodes?: string[] }) {
    let q = this.db.from("checkpoints").select("seq,node,state").eq("run_id", runId);
    for (const n of filter?.excludeNodes ?? []) q = q.neq("node", n);
    const { data, error } = await q.order("seq", { ascending: false }).limit(1).maybeSingle();
    if (error) this.fail("checkpoints", "select", error);
    return data ? { seq: data.seq as number, node: data.node as string, state: data.state } : null;
  }

  async addAgentCall(a: Omit<AgentCallRow, "id" | "created_at">) {
    return (await this.insert("agent_calls", a)).id as string;
  }
  async addToolCall(t: Omit<ToolCallRow, "id" | "created_at">) {
    const { error } = await this.db.from("tool_calls").insert(t);
    if (error) this.fail("tool_calls", "insert", error);
  }

  async addApproval(a: Omit<ApprovalRow, "id" | "created_at" | "status" | "decided_by" | "reason" | "decided_at" | "final_terms" | "is_override">) {
    return toApproval(await this.insert("approvals", a));
  }
  async getApproval(id: string) { return toApproval(await this.one("approvals", "id", id)); }
  async decideApprovalRow(id: string, patch: Pick<ApprovalRow, "status" | "decided_by" | "reason" | "final_terms" | "is_override">) {
    const { data, error } = await this.db.from("approvals").update({ ...patch, decided_at: new Date().toISOString() }).eq("id", id).eq("status", "pending").select().maybeSingle();
    if (error) this.fail("approvals", "update", error);
    if (data) return toApproval(data);
    await this.assertExists("approvals", id);
    return null;
  }
  async pendingApprovalForRun(runId: string) {
    const { data, error } = await this.db.from("approvals").select("*").eq("run_id", runId).eq("status", "pending").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error) this.fail("approvals", "select", error);
    return data ? toApproval(data) : null;
  }

  async addFounderMessage(m: { run_id: string; direction: "to_founder" | "from_founder"; body: string; author_id: string | null }) {
    const { error } = await this.db.from("founder_messages").insert(m);
    if (error) this.fail("founder_messages", "insert", error);
  }
  async addMemory(m: { scope: "firm" | "founder" | "partner"; subject: string; sector: string | null; content: string; source_run_id: string | null }) {
    const { error } = await this.db.from("memories").insert(m);
    if (error) this.fail("memories", "insert", error);
  }
  async findMemories(q: { scope: "firm" | "founder" | "partner"; subject?: string; sector?: string; limit?: number }) {
    let b = this.db.from("memories").select("*").eq("scope", q.scope);
    if (q.subject !== undefined) b = b.ilike("subject", escapeLike(q.subject));
    if (q.sector !== undefined) b = b.ilike("sector", escapeLike(q.sector));
    const { data, error } = await b.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(q.limit ?? 10);
    if (error) this.fail("memories", "select", error);
    return (data ?? []).map(toMemory);
  }

  async addIncident(i: Omit<IncidentRow, "id" | "created_at" | "resolved_at" | "status">) {
    return toIncident(await this.insert("incidents", i));
  }

  async audit(e: { actor_id: string | null; actor_role: string; action: string; entity: string; entity_id?: string; details?: Record<string, unknown> }) {
    try {
      const { error } = await this.db.from("audit_log").insert({ actor_id: e.actor_id, actor_role: e.actor_role, action: e.action, entity: e.entity, entity_id: e.entity_id ?? null, details: e.details ?? {} });
      if (error) console.error("audit_log: insert failed:", error.message);
    } catch (err) {
      console.error("audit_log: insert failed:", err);
    }
  }
}
