import "server-only";
import type { AgentCallRow, ApprovalQueueRow, ApprovalRow, FounderMessageRow, HarnessConfig, IncidentListRow, IncidentPatch, IncidentRow, MemoryRow, Pitch, Run, ToolCallRow, User } from "@/lib/types";
import { SupabaseRepo } from "./repo-supabase";

export interface Repo {
  getPitch(id: string): Promise<Pitch>;
  getPitchBySlug(slug: string): Promise<Pitch>;
  /** Ordered by created_at, then company. */
  listPitches(): Promise<Pitch[]>;
  createPitch(p: Omit<Pitch, "id" | "created_at">): Promise<Pitch>;
  /** Most recent run (by started_at) per pitch id; pitches without runs are absent. */
  latestRunsByPitch(): Promise<Record<string, Pick<Run, "id" | "status" | "started_at">>>;
  getConfig(version: number): Promise<HarnessConfig>;
  getActiveConfig(): Promise<HarnessConfig>;
  getUser(id: string): Promise<User>;
  createRun(r: Pick<Run, "pitch_id" | "config_version" | "autonomy_level" | "started_by">): Promise<Run>;
  getRun(id: string): Promise<Run>;
  /** compare-and-set: applies only if expectStep is undefined or run.step_count === expectStep; returns the updated run, or null if the CAS was lost. Unknown id throws NotFoundError (null never means "not found"). There is NO terminal-status guard: callers bump step_count to invalidate in-flight steps. */
  updateRun(id: string, patch: Partial<Run>, expectStep?: number): Promise<Run | null>;
  addCheckpoint(c: { run_id: string; seq: number; node: string; state: unknown; duration_ms: number }): Promise<void>;
  /** Highest-seq checkpoint matching the filter: `excludeNodes` drops by node; `statusIn` keeps only snapshots whose state.status is listed. */
  lastCheckpoint(runId: string, filter?: { excludeNodes?: string[]; statusIn?: string[] }): Promise<{ seq: number; node: string; state: any } | null>;
  addAgentCall(a: Omit<AgentCallRow, "id" | "created_at">): Promise<string>;
  addToolCall(t: Omit<ToolCallRow, "id" | "created_at">): Promise<void>;
  addApproval(a: Omit<ApprovalRow, "id" | "created_at" | "status" | "decided_by" | "reason" | "decided_at" | "final_terms" | "is_override">): Promise<ApprovalRow>;
  getApproval(id: string): Promise<ApprovalRow>;
  /** CAS on status='pending'; null if already decided. Unknown id throws NotFoundError. */
  decideApprovalRow(id: string, patch: Pick<ApprovalRow, "status" | "decided_by" | "reason" | "final_terms" | "is_override">): Promise<ApprovalRow | null>;
  /** Newest pending approval for the run, or null. */
  pendingApprovalForRun(runId: string): Promise<ApprovalRow | null>;
  /** Approvals joined with run/pitch fields; status "decided" = anything but pending. Oldest first (created_at, then id). */
  listApprovals(filter?: { status?: "pending" | "decided"; kind?: ApprovalRow["kind"] }): Promise<ApprovalQueueRow[]>;
  addFounderMessage(m: { run_id: string; direction: "to_founder" | "from_founder"; body: string; author_id: string | null }): Promise<void>;
  /** The run's founder thread, oldest first (created_at, then insertion / id). */
  listFounderMessages(runId: string): Promise<FounderMessageRow[]>;
  addMemory(m: { scope: "firm" | "founder" | "partner"; subject: string; sector: string | null; content: string; source_run_id: string | null }): Promise<void>;
  /** Newest first; ties broken by insertion order (later insert first). subject/sector match case-insensitively. */
  findMemories(q: { scope: "firm" | "founder" | "partner"; subject?: string; sector?: string; limit?: number }): Promise<MemoryRow[]>;
  addIncident(i: Omit<IncidentRow, "id" | "created_at" | "resolved_at" | "status">): Promise<IncidentRow>;
  /** Unknown id throws NotFoundError. */
  getIncident(id: string): Promise<IncidentRow>;
  /** Applies `patch`; if `expectStatus` is given it is a CAS on the current status (null when lost). Unknown id throws NotFoundError. */
  updateIncident(id: string, patch: IncidentPatch, expectStatus?: IncidentRow["status"]): Promise<IncidentRow | null>;
  /** Incidents joined with company + run status, oldest first (created_at, then id). */
  listIncidents(filter?: { status?: IncidentRow["status"]; run_id?: string }): Promise<IncidentListRow[]>;
  audit(e: { actor_id: string | null; actor_role: string; action: string; entity: string; entity_id?: string; details?: Record<string, unknown> }): Promise<void>;
}

let singleton: Repo | null = null;
export function getRepo(): Repo {
  return (singleton ??= new SupabaseRepo());
}
