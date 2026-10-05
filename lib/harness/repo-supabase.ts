import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/server";
import type { AgentCallRow, ConfigDraft, SimulationRun, ApprovalQueueRow, AuditFilter, AuditRow, ApprovalRow, CheckpointRow, FounderMessageRow, HarnessConfig, IncidentListRow, IncidentPatch, IncidentRow, MemoryRow, Pitch, Run, ToolCallRow, User } from "@/lib/types";
import { NotFoundError } from "./errors";
import { initialRunState } from "./run-state";
import { WORKING } from "@/lib/types";
import type { Repo } from "./repo";

type Row = Record<string, unknown>;
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

/** PostgREST caps a response (default 1000 rows) and long `in.(…)` lists bloat the URL: page and chunk. */
const PAGE = 1000;
const ID_CHUNK = 100;
const AGENT_CALL_COLS = "id,run_id,agent,purpose,model,attempt,fallback_used,input_tokens,output_tokens,cost_usd,latency_ms,status,error,created_at";
const TOOL_CALL_COLS = "id,run_id,agent_call_id,agent,tool,latency_ms,permitted,created_at";
/** listRuns columns: everything but the heavy plan / state jsonb (the dashboard never reads them). */
const RUN_LIST_COLS = "id,pitch_id,config_version,autonomy_level,status,degraded,replans,step_count,tokens_used,cost_usd,decision,recommendation,final_terms,started_by,started_at,completed_at,error";
const SIM_RUN_COLS = "id,state,degraded,autonomy_level,status,started_at";
const byCreatedThenId = (a: { created_at: string; id: string }, b: { created_at: string; id: string }) =>
  Date.parse(a.created_at) - Date.parse(b.created_at) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
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
    if (!data) throw new NotFoundError(table, `${col}=${val}`);
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

  /** Rows of `table` whose run_id is in `runIds`, chunked by id and paged; merged oldest first (created_at, then id). */
  private async rowsForRuns(table: string, cols: string, runIds: string[]): Promise<Row[]> {
    const out: Row[] = [];
    for (let i = 0; i < runIds.length; i += ID_CHUNK) {
      const chunk = runIds.slice(i, i + ID_CHUNK);
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await this.db.from(table).select(cols).in("run_id", chunk).order("created_at", { ascending: true }).order("id", { ascending: true }).range(from, from + PAGE - 1);
        if (error) this.fail(table, "select", error);
        out.push(...((data ?? []) as unknown as Row[]));
        if (!data || data.length < PAGE) break;
      }
    }
    return out.sort((a, b) => byCreatedThenId(a as { created_at: string; id: string }, b as { created_at: string; id: string }));
  }

  async getPitch(id: string) { return toPitch(await this.one("pitches", "id", id)); }
  async getPitchBySlug(slug: string) { return toPitch(await this.one("pitches", "slug", slug)); }
  async listPitches() {
    const { data, error } = await this.db.from("pitches").select("*").order("created_at", { ascending: true }).order("company", { ascending: true });
    if (error) this.fail("pitches", "select", error);
    return (data ?? []).map(toPitch);
  }
  async createPitch(p: Omit<Pitch, "id" | "created_at">) { return toPitch(await this.insert("pitches", p)); }
  async latestRunsByPitch() {
    const { data, error } = await this.db.from("runs").select("id,pitch_id,status,started_at").order("started_at", { ascending: false });
    if (error) this.fail("runs", "select", error);
    const out: Record<string, Pick<Run, "id" | "status" | "started_at">> = {};
    for (const r of data ?? []) out[r.pitch_id] ??= { id: r.id, status: r.status, started_at: r.started_at };
    return out;
  }
  async getConfig(version: number) { return toConfig(await this.one("harness_configs", "version", version)); }
  async getActiveConfig() { return toConfig(await this.one("harness_configs", "is_active", "true")); }
  async listConfigs() {
    const { data, error } = await this.db.from("harness_configs").select("*").order("version", { ascending: false });
    if (error) this.fail("harness_configs", "select", error);
    return (data ?? []).map(toConfig);
  }
  async insertConfigActivate(draft: ConfigDraft, createdBy: string) {
    // One transaction in SQL (migration 0004): deactivate the active row, insert version max+1 as active.
    const { data, error } = await this.db.rpc("publish_config", { p: draft, p_user: createdBy });
    if (error) this.fail("harness_configs", "publish_config", error);
    if (!data) throw new Error("harness_configs: publish_config returned no row");
    return toConfig(data as Row);
  }
  async getUser(id: string) { return toUser(await this.one("users", "id", id)); }

  async listRuns(limit: number) {
    const out: Run[] = [];
    for (let from = 0; from < limit; from += PAGE) {
      const to = Math.min(limit, from + PAGE) - 1;
      const { data, error } = await this.db.from("runs").select(RUN_LIST_COLS).order("started_at", { ascending: false }).order("id", { ascending: false }).range(from, to);
      if (error) this.fail("runs", "select", error);
      out.push(...(data ?? []).map((r) => toRun({ ...r, plan: null, state: initialRunState() })));
      if (!data || data.length < to - from + 1) break;
    }
    return out;
  }
  async listRunsForSimulation(limit: number): Promise<SimulationRun[]> {
    const out: SimulationRun[] = [];
    for (let from = 0; from < limit; from += PAGE) {
      const to = Math.min(limit, from + PAGE) - 1;
      const { data, error } = await this.db.from("runs").select(SIM_RUN_COLS).not("status", "in", `(${WORKING.join(",")})`).order("started_at", { ascending: false }).order("id", { ascending: false }).range(from, to);
      if (error) this.fail("runs", "select", error);
      out.push(...((data ?? []) as unknown as SimulationRun[]));
      if (!data || data.length < to - from + 1) break;
    }
    return out;
  }
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
  async lastCheckpoint(runId: string, filter?: { excludeNodes?: string[]; statusIn?: string[] }) {
    let q = this.db.from("checkpoints").select("seq,node,state").eq("run_id", runId);
    for (const n of filter?.excludeNodes ?? []) q = q.neq("node", n);
    if (filter?.statusIn) q = q.in("state->>status", filter.statusIn);
    const { data, error } = await q.order("seq", { ascending: false }).limit(1).maybeSingle();
    if (error) this.fail("checkpoints", "select", error);
    return data ? { seq: data.seq as number, node: data.node as string, state: data.state } : null;
  }

  async listCheckpoints(runId: string) {
    const { data, error } = await this.db.from("checkpoints").select("*").eq("run_id", runId).order("seq", { ascending: true });
    if (error) this.fail("checkpoints", "select", error);
    return (data ?? []) as CheckpointRow[];
  }

  async addAgentCall(a: Omit<AgentCallRow, "id" | "created_at">) {
    return (await this.insert("agent_calls", a)).id as string;
  }
  async listAgentCalls(runId: string) {
    const { data, error } = await this.db.from("agent_calls").select("*").eq("run_id", runId).order("created_at", { ascending: true }).order("id", { ascending: true });
    if (error) this.fail("agent_calls", "select", error);
    return (data ?? []).map(toAgentCall);
  }
  async listAgentCallsForRuns(runIds: string[]) {
    return (await this.rowsForRuns("agent_calls", AGENT_CALL_COLS, runIds)).map((r) => toAgentCall({ ...r, output: null }));
  }
  async addToolCall(t: Omit<ToolCallRow, "id" | "created_at">) {
    const { error } = await this.db.from("tool_calls").insert(t);
    if (error) this.fail("tool_calls", "insert", error);
  }
  async listToolCalls(runId: string) {
    const { data, error } = await this.db.from("tool_calls").select("*").eq("run_id", runId).order("created_at", { ascending: true }).order("id", { ascending: true });
    if (error) this.fail("tool_calls", "select", error);
    return (data ?? []) as ToolCallRow[];
  }

  async listToolCallsForRuns(runIds: string[]) {
    return (await this.rowsForRuns("tool_calls", TOOL_CALL_COLS, runIds)).map((r) => ({ ...r, args: {}, result: null }) as ToolCallRow);
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

  async listApprovalsForRun(runId: string) {
    const { data, error } = await this.db.from("approvals").select("*").eq("run_id", runId).order("created_at", { ascending: true }).order("id", { ascending: true });
    if (error) this.fail("approvals", "select", error);
    return (data ?? []).map(toApproval);
  }

  async listApprovalsForRuns(runIds: string[]) {
    return (await this.rowsForRuns("approvals", "*", runIds)).map(toApproval);
  }

  async listApprovals(filter: { status?: "pending" | "decided"; kind?: ApprovalRow["kind"] } = {}): Promise<ApprovalQueueRow[]> {
    let b = this.db.from("approvals").select("*, runs!inner(status, autonomy_level, pitches!inner(company, sector))");
    if (filter.status === "pending") b = b.eq("status", "pending");
    if (filter.status === "decided") b = b.neq("status", "pending");
    if (filter.kind) b = b.eq("kind", filter.kind);
    const { data, error } = await b.order("created_at", { ascending: true }).order("id", { ascending: true });
    if (error) this.fail("approvals", "select", error);
    return (data ?? []).map(({ runs, ...a }: Row & { runs: { status: Run["status"]; autonomy_level: Run["autonomy_level"]; pitches: Pick<Pitch, "company" | "sector"> } }) => ({
      ...toApproval(a), company: runs.pitches.company, sector: runs.pitches.sector, autonomy_level: runs.autonomy_level, run_status: runs.status,
    }));
  }

  async addFounderMessage(m: { run_id: string; direction: "to_founder" | "from_founder"; body: string; author_id: string | null }) {
    const { error } = await this.db.from("founder_messages").insert(m);
    if (error) this.fail("founder_messages", "insert", error);
  }
  async listFounderMessages(runId: string) {
    const { data, error } = await this.db.from("founder_messages").select("*").eq("run_id", runId).order("created_at", { ascending: true }).order("id", { ascending: true });
    if (error) this.fail("founder_messages", "select", error);
    return (data ?? []) as FounderMessageRow[];
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

  async getMemoriesByIds(ids: string[]) {
    const valid = ids.filter((id) => UUID_RE.test(id)); // a malformed id would make Postgres reject the whole query
    if (!valid.length) return [];
    const { data, error } = await this.db.from("memories").select("*").in("id", valid);
    if (error) this.fail("memories", "select", error);
    const byId = new Map((data ?? []).map((r: Row) => [r.id as string, toMemory(r)]));
    return ids.flatMap((id) => byId.get(id) ?? []);
  }

  async listMemories(scope?: "firm" | "founder" | "partner") {
    let b = this.db.from("memories").select("*");
    if (scope) b = b.eq("scope", scope);
    const { data, error } = await b.order("created_at", { ascending: false }).order("id", { ascending: false });
    if (error) this.fail("memories", "select", error);
    return (data ?? []).map(toMemory);
  }

  async addIncident(i: Omit<IncidentRow, "id" | "created_at" | "resolved_at" | "status">) {
    return toIncident(await this.insert("incidents", i));
  }
  async getIncident(id: string) { return toIncident(await this.one("incidents", "id", id)); }
  async updateIncident(id: string, patch: IncidentPatch, expectStatus?: IncidentRow["status"]) {
    let q = this.db.from("incidents").update(patch).eq("id", id);
    if (expectStatus !== undefined) q = q.eq("status", expectStatus);
    const { data, error } = await q.select().maybeSingle();
    if (error) this.fail("incidents", "update", error);
    if (data) return toIncident(data);
    await this.assertExists("incidents", id);
    return null;
  }
  async listIncidents(filter: { status?: IncidentRow["status"]; run_id?: string } = {}): Promise<IncidentListRow[]> {
    let b = this.db.from("incidents").select("*, runs!inner(status, pitches!inner(company))");
    if (filter.status) b = b.eq("status", filter.status);
    if (filter.run_id) b = b.eq("run_id", filter.run_id);
    const { data, error } = await b.order("created_at", { ascending: true }).order("id", { ascending: true });
    if (error) this.fail("incidents", "select", error);
    return (data ?? []).map(({ runs, ...i }: Row & { runs: { status: Run["status"]; pitches: Pick<Pitch, "company"> } }) => ({ ...toIncident(i), company: runs.pitches.company, run_status: runs.status }));
  }

  async listAudit(f: AuditFilter) {
    let b = this.db.from("audit_log").select("*");
    if (f.actorId !== undefined) b = b.eq("actor_id", f.actorId);
    if (f.role !== undefined) b = b.eq("actor_role", f.role);
    if (f.actionContains) b = b.ilike("action", `%${escapeLike(f.actionContains)}%`);
    if (f.entityId !== undefined) b = b.eq("entity_id", f.entityId);
    if (f.from) b = b.gte("created_at", f.from);
    if (f.to) b = b.lt("created_at", f.to);
    const { data, error } = await b.order("created_at", { ascending: false }).order("id", { ascending: false }).range(f.offset, f.offset + f.limit - 1);
    if (error) this.fail("audit_log", "select", error);
    return (data ?? []) as AuditRow[];
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
