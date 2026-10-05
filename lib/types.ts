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
export type HarnessConfig = z.infer<typeof HarnessConfigSchema> & { id: string; version: number; is_active: boolean; created_at: string; created_by: string | null };
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
