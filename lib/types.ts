import type { z } from "zod";
import type { HarnessConfigSchema, Plan, RedFlag, SharkOutput, Synthesis } from "@/lib/schemas";

export type AgentName = "market" | "finance" | "product" | "skeptic";
export type AgentId = AgentName | "lead";
export type Purpose = "triage" | "plan" | "analyze" | "synthesize";
export type RunStatus = "queued" | "triage" | "planning" | "analyzing" | "synthesizing" | "policy_check" | "awaiting_founder" | "awaiting_approval" | "in_review" | "escalated" | "offer_sent" | "passed" | "cancelled" | "failed";
export const WORKING: RunStatus[] = ["queued", "triage", "planning", "analyzing", "synthesizing", "policy_check"];
export const WAITING: RunStatus[] = ["awaiting_founder", "awaiting_approval", "in_review", "escalated"];
export const TERMINAL: RunStatus[] = ["offer_sent", "passed", "cancelled", "failed"];
export type Role = "analyst" | "partner" | "general_partner";
export type Terms = { amount: number; equity_pct: number };
export type User = { id: string; name: string; role: Role; approval_limit: number; avatar_color: string };
export type Pitch = { id: string; slug: string; company: string; tagline: string; founder: string; sector: string; ask_amount: number; equity_offered: number; revenue: number; claimed_revenue: number | null; growth_pct: number; monthly_burn: number; pitch_text: string; chaos: Record<string, string>; created_at: string };
/** The editable part of a harness config (what a GP publishes). */
export type ConfigDraft = z.infer<typeof HarnessConfigSchema>;
export type HarnessConfig = ConfigDraft & { id: string; version: number; is_active: boolean; created_at: string; created_by: string | null };
export type RunState = {
  prescan?: RedFlag[];
  triage?: { fast_pass: boolean; reason: string };
  shark_outputs: Partial<Record<AgentName, SharkOutput>>;
  shark_failures: Partial<Record<AgentName, "failed" | "skipped_budget">>;
  synthesis?: Synthesis;
  founder_asked: boolean;
  founder_answers: string[];
  rerun?: AgentName[]; // sharks to run on next analyzing pass (replan/founder)
  memories_used: string[]; // memory ids
};
export type PolicyOutcome = "auto_send" | "auto_pass" | "needs_approval" | "exception" | "escalate" | "need_info";
export type PolicyDecision = { outcome: PolicyOutcome; rule: string; required_role?: Role; explanation: string };
export type Run = { id: string; pitch_id: string; config_version: number; autonomy_level: 0 | 1 | 2 | 3; status: RunStatus; plan: Plan | null; state: RunState; degraded: boolean; replans: number; step_count: number; tokens_used: number; cost_usd: number; decision: PolicyDecision | null; recommendation: "invest" | "pass" | null; final_terms: Terms | null; started_by: string | null; started_at: string; completed_at: string | null; error: string | null };

/** The run columns the what-if simulator reads (Repo.listRunsForSimulation). */
export type SimulationRun = Pick<Run, "id" | "state" | "degraded" | "autonomy_level" | "status" | "started_at">;

export type AgentCallRow = { id: string; run_id: string; agent: AgentId; purpose: Purpose; model: string; attempt: number; fallback_used: boolean; input_tokens: number; output_tokens: number; cost_usd: number; latency_ms: number; status: "ok" | "timeout" | "error" | "schema_fail" | "skipped_budget"; error: string | null; output: unknown | null; created_at: string };
export type ToolCallRow = { id: string; run_id: string; agent_call_id: string | null; agent: string; tool: string; args: Record<string, unknown>; result: unknown | null; latency_ms: number; permitted: boolean; created_at: string };
export type ApprovalRow = { id: string; run_id: string; kind: "approval" | "exception" | "escalation"; status: "pending" | "approved" | "modified" | "rejected" | "replanned"; required_role: Role; rule_fired: string; ai_recommendation: "invest" | "pass"; original_terms: Terms | null; final_terms: Terms | null; decided_by: string | null; reason: string | null; is_override: boolean; sla_due: string; created_at: string; decided_at: string | null };
/** An approval joined with the minimal run + pitch fields the review queue needs. */
export type ApprovalQueueRow = ApprovalRow & { company: string; sector: string; autonomy_level: 0 | 1 | 2 | 3; run_status: RunStatus };
export type MemoryRow = { id: string; scope: "firm" | "founder" | "partner"; subject: string; sector: string | null; content: string; source_run_id: string | null; created_at: string };
export type IncidentRow = { id: string; run_id: string; severity: "sev1" | "sev2" | "sev3"; title: string; owner_id: string | null; status: "open" | "acknowledged" | "resolved"; handoff: Record<string, unknown>; sla_due: string; created_at: string; resolved_at: string | null };
/** An incident joined with the run/pitch fields the incidents board needs. */
export type IncidentListRow = IncidentRow & { company: string; run_status: RunStatus };
/** Structured handoff note stored in incidents.handoff (SPEC §2.12). */
export type IncidentHandoff = { what_happened: string; impact: string; current_state: string; next_action: string };
export type IncidentPatch = Partial<Pick<IncidentRow, "owner_id" | "status" | "handoff" | "resolved_at">>;
export type FounderMessageRow = { id: string; run_id: string; direction: "to_founder" | "from_founder"; body: string; author_id: string | null; created_at: string };
export type CheckpointRow = { id: string; run_id: string; seq: number; node: string; state: unknown; duration_ms: number; created_at: string };
/** Audit listing filter. `from` is inclusive and `to` exclusive (ISO timestamps); actionContains is a case-insensitive substring. */
export type AuditFilter = { actorId?: string; role?: string; actionContains?: string; from?: string; to?: string; entityId?: string; limit: number; offset: number };
export type AuditRow = { id: number; actor_id: string | null; actor_role: string; action: string; entity: string; entity_id: string | null; details: Record<string, unknown>; created_at: string };
/** Serializable review-queue item: the approval plus what the drawer shows (SPEC §5.4). */
export type QueueItem = {
  approval: ApprovalQueueRow;
  scores: { agent: AgentName; score: number; verdict: "invest" | "pass" }[];
  failures: string[];
  summary: string | null;
  disagreements: string[];
  replans: number;
  maxReplans: number;
  fundMax: number;
};
