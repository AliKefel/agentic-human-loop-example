import { randomUUID } from "node:crypto";
import { NotFoundError } from "./errors";
import { initialRunState } from "./run-state";
import { SEED_USERS } from "@/lib/mock/seed-users";
import { CONFIG_V1 } from "@/lib/mock/seed-config";
import { SEED_PITCHES } from "@/lib/mock/seed-pitches";
import type { AgentCallRow, ApprovalRow, AuditRow, CheckpointRow, FounderMessageRow, HarnessConfig, IncidentRow, MemoryRow, Pitch, Run, ToolCallRow, User } from "@/lib/types";
import type { Repo } from "./repo";

const SEED_MEMORIES: Omit<MemoryRow, "id" | "created_at" | "source_run_id">[] = [
  { scope: "founder", subject: "Jordan Lee", sector: "Food & Beverage", content: '2025-03: Pitched "MealMate v1" (campus dining app). Passed — no revenue, unclear CAC. Founder was coachable and returned with paying customers.' },
  { scope: "partner", subject: "Pat Partner", sector: null, content: "Prefers stakes ≤ 10%; pushes back on valuations above 20x revenue." },
  { scope: "partner", subject: "Gen GP", sector: null, content: "Will not approve any deal with unresolved revenue discrepancies; wants a handoff note on every escalation." },
  { scope: "firm", subject: "BrewBot (2026 Q2 review)", sector: "Food & Beverage", content: "Hardware-heavy F&B deals: partners historically cut equity asks by ~2 points when gross margin < 40%." },
];

const clone = <T>(v: T): T => structuredClone(v);
const lc = (s: string) => s.toLowerCase();

function deepFreeze<T>(o: T): T {
  if (o && typeof o === "object" && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o as object)) deepFreeze(v);
  }
  return o;
}

/** In-memory Repo for tests and mock-mode. Arrays are exposed (readonly) so tests can inspect them. */
export class MemoryRepo implements Repo {
  private _runs: Run[] = [];
  private _checkpoints: CheckpointRow[] = [];
  private _agentCalls: AgentCallRow[] = [];
  private _toolCalls: ToolCallRow[] = [];
  private _approvals: ApprovalRow[] = [];
  private _founderMessages: FounderMessageRow[] = [];
  private _memories: MemoryRow[] = [];
  private _incidents: IncidentRow[] = [];
  private _auditLog: AuditRow[] = [];

  get runs(): ReadonlyArray<Readonly<Run>> { return this._runs; }
  get checkpoints(): ReadonlyArray<Readonly<CheckpointRow>> { return this._checkpoints; }
  get agentCalls(): ReadonlyArray<Readonly<AgentCallRow>> { return this._agentCalls; }
  get toolCalls(): ReadonlyArray<Readonly<ToolCallRow>> { return this._toolCalls; }
  get approvals(): ReadonlyArray<Readonly<ApprovalRow>> { return this._approvals; }
  get founderMessages(): ReadonlyArray<Readonly<FounderMessageRow>> { return this._founderMessages; }
  get memories(): ReadonlyArray<Readonly<MemoryRow>> { return this._memories; }
  get incidents(): ReadonlyArray<Readonly<IncidentRow>> { return this._incidents; }
  get auditLog(): ReadonlyArray<Readonly<AuditRow>> { return this._auditLog; }

  private pitches: Pitch[];
  private configs: HarnessConfig[];
  private users: User[];
  private auditSeq = 0;

  constructor(opts: { config?: HarnessConfig } = {}) {
    const now = new Date().toISOString();
    this.pitches = SEED_PITCHES.map((p, i) => ({ ...clone(p), id: `10000000-0000-0000-0000-${String(i + 1).padStart(12, "0")}`, created_at: now }));
    this.configs = [clone(opts.config ?? CONFIG_V1)];
    this.users = clone(SEED_USERS);
    for (const m of SEED_MEMORIES) this._memories.push({ ...m, id: randomUUID(), source_run_id: null, created_at: now });
  }

  async getPitch(id: string) {
    const p = this.pitches.find((x) => x.id === id);
    if (!p) throw new Error(`pitches: not found (${id})`);
    return clone(p);
  }
  async getPitchBySlug(slug: string) {
    const p = this.pitches.find((x) => x.slug === slug);
    if (!p) throw new Error(`pitches: not found (slug ${slug})`);
    return clone(p);
  }
  async getConfig(version: number) {
    const c = this.configs.find((x) => x.version === version);
    if (!c) throw new Error(`harness_configs: version ${version} not found`);
    return clone(c);
  }
  async getActiveConfig() {
    const c = this.configs.find((x) => x.is_active);
    if (!c) throw new Error("harness_configs: no active config");
    return clone(c);
  }
  async getUser(id: string) {
    const u = this.users.find((x) => x.id === id);
    if (!u) throw new Error(`users: not found (${id})`);
    return clone(u);
  }

  async createRun(r: Pick<Run, "pitch_id" | "config_version" | "autonomy_level" | "started_by">) {
    const run: Run = {
      id: randomUUID(),
      pitch_id: r.pitch_id,
      config_version: r.config_version,
      autonomy_level: r.autonomy_level,
      status: "queued",
      plan: null,
      state: initialRunState(),
      degraded: false,
      replans: 0,
      step_count: 0,
      tokens_used: 0,
      cost_usd: 0,
      decision: null,
      recommendation: null,
      final_terms: null,
      started_by: r.started_by,
      started_at: new Date().toISOString(),
      completed_at: null,
      error: null,
    };
    this._runs.push(run);
    return clone(run);
  }
  async getRun(id: string) {
    await Promise.resolve(); // yield so concurrent callers interleave
    const r = this._runs.find((x) => x.id === id);
    if (!r) throw new Error(`runs: not found (${id})`);
    return clone(r);
  }
  async updateRun(id: string, patch: Partial<Run>, expectStep?: number) {
    // No await between check and write: the CAS is atomic.
    const i = this._runs.findIndex((x) => x.id === id);
    if (i < 0) throw new NotFoundError("runs", id);
    if (expectStep !== undefined && this._runs[i].step_count !== expectStep) return null;
    this._runs[i] = { ...this._runs[i], ...clone(patch), id };
    return clone(this._runs[i]);
  }

  async addCheckpoint(c: { run_id: string; seq: number; node: string; state: unknown; duration_ms: number }) {
    if (this._checkpoints.some((x) => x.run_id === c.run_id && x.seq === c.seq)) throw new Error(`checkpoints: duplicate (run_id, seq) (${c.run_id}, ${c.seq})`);
    this._checkpoints.push({ id: randomUUID(), ...clone(c), created_at: new Date().toISOString() });
  }
  async lastCheckpoint(runId: string, filter?: { excludeNodes?: string[] }) {
    const rows = this._checkpoints.filter((x) => x.run_id === runId && !filter?.excludeNodes?.includes(x.node));
    if (!rows.length) return null;
    const top = rows.reduce((a, b) => (b.seq > a.seq ? b : a));
    return clone({ seq: top.seq, node: top.node, state: top.state as any });
  }

  async addAgentCall(a: Omit<AgentCallRow, "id" | "created_at">) {
    const id = randomUUID();
    this._agentCalls.push({ ...clone(a), id, created_at: new Date().toISOString() });
    return id;
  }
  async addToolCall(t: Omit<ToolCallRow, "id" | "created_at">) {
    this._toolCalls.push({ ...clone(t), id: randomUUID(), created_at: new Date().toISOString() });
  }

  async addApproval(a: Omit<ApprovalRow, "id" | "created_at" | "status" | "decided_by" | "reason" | "decided_at" | "final_terms" | "is_override">) {
    const row: ApprovalRow = { ...clone(a), id: randomUUID(), status: "pending", decided_by: null, reason: null, decided_at: null, final_terms: null, is_override: false, created_at: new Date().toISOString() };
    this._approvals.push(row);
    return clone(row);
  }
  async getApproval(id: string) {
    const a = this._approvals.find((x) => x.id === id);
    if (!a) throw new Error(`approvals: not found (${id})`);
    return clone(a);
  }
  async decideApprovalRow(id: string, patch: Pick<ApprovalRow, "status" | "decided_by" | "reason" | "final_terms" | "is_override">) {
    const i = this._approvals.findIndex((x) => x.id === id);
    if (i < 0) throw new NotFoundError("approvals", id);
    if (this._approvals[i].status !== "pending") return null;
    this._approvals[i] = { ...this._approvals[i], ...clone(patch), decided_at: new Date().toISOString() };
    return clone(this._approvals[i]);
  }
  async pendingApprovalForRun(runId: string) {
    const a = this._approvals.filter((x) => x.run_id === runId && x.status === "pending").at(-1);
    return a ? clone(a) : null;
  }

  async addFounderMessage(m: { run_id: string; direction: "to_founder" | "from_founder"; body: string; author_id: string | null }) {
    this._founderMessages.push({ ...clone(m), id: randomUUID(), created_at: new Date().toISOString() });
  }
  async addMemory(m: { scope: "firm" | "founder" | "partner"; subject: string; sector: string | null; content: string; source_run_id: string | null }) {
    this._memories.push({ ...clone(m), id: randomUUID(), created_at: new Date().toISOString() });
  }
  /** Case-insensitive exact match on subject/sector; newest first; default limit 10. */
  async findMemories(q: { scope: "firm" | "founder" | "partner"; subject?: string; sector?: string; limit?: number }) {
    return this._memories
      .filter((m) => m.scope === q.scope && (q.subject === undefined || lc(m.subject) === lc(q.subject)) && (q.sector === undefined || (m.sector !== null && lc(m.sector) === lc(q.sector))))
      .map((m, idx) => ({ m, idx }))
      .sort((a, b) => (a.m.created_at < b.m.created_at ? 1 : a.m.created_at > b.m.created_at ? -1 : b.idx - a.idx))
      .map((x) => x.m)
      .slice(0, q.limit ?? 10)
      .map(clone);
  }

  async addIncident(i: Omit<IncidentRow, "id" | "created_at" | "resolved_at" | "status">) {
    const row: IncidentRow = { ...clone(i), id: randomUUID(), status: "open", resolved_at: null, created_at: new Date().toISOString() };
    this._incidents.push(row);
    return clone(row);
  }

  async audit(e: { actor_id: string | null; actor_role: string; action: string; entity: string; entity_id?: string; details?: Record<string, unknown> }) {
    this._auditLog.push(deepFreeze({ id: ++this.auditSeq, actor_id: e.actor_id, actor_role: e.actor_role, action: e.action, entity: e.entity, entity_id: e.entity_id ?? null, details: clone(e.details ?? {}), created_at: new Date().toISOString() }));
  }
}
