/**
 * Pure view-model helpers for The Tank (/runs/[id], SPEC §5.3). No server imports:
 * client components may import this module. Data loading lives in lib/run-view-server.ts.
 */
import { TERMINAL, WAITING, WORKING } from "@/lib/types";
import type { AgentCallRow, AgentName, ApprovalRow, AuditRow, CheckpointRow, FounderMessageRow, HarnessConfig, IncidentListRow, MemoryRow, Pitch, Run, RunStatus, ToolCallRow } from "@/lib/types";

export type NodeState = "idle" | "running" | "ok" | "failed" | "skipped" | "waiting";
export type GraphNodeId = "lead" | AgentName | "synthesis" | "policy" | "human";
export type GraphState = Record<GraphNodeId, NodeState>;

export const SHARKS: AgentName[] = ["market", "finance", "product", "skeptic"];
export const SHARK_LABEL: Record<AgentName, string> = { market: "Market", finance: "Finance", product: "Product", skeptic: "Skeptic" };

/** Everything the run page renders, loaded in one go by loadRunView. */
export type RunView = {
  run: Run;
  pitch: Pitch;
  config: HarnessConfig;
  checkpoints: CheckpointRow[];
  agentCalls: AgentCallRow[];
  toolCalls: ToolCallRow[];
  approvals: ApprovalRow[];
  founderMessages: FounderMessageRow[];
  memoriesUsed: MemoryRow[];
  audit: AuditRow[];
  incidents: IncidentListRow[];
  startedByName: string | null;
};

type Stage = "lead" | "sharks" | "synthesis" | "policy";
const STAGE_ORDER: Stage[] = ["lead", "sharks", "synthesis", "policy"];
const RUNNING_STAGE: Partial<Record<RunStatus, Stage>> = { triage: "lead", planning: "lead", analyzing: "sharks", synthesizing: "synthesis", policy_check: "policy" };

export const isFastPass = (run: Run) => run.state.triage?.fast_pass === true || run.decision?.rule === "triage.fast_pass";

/** Sharks the analyzing pass works on: a replan / founder rerun subset, else the plan. */
const currentSet = (run: Run): AgentName[] => run.state.rerun ?? run.plan?.sharks ?? [];
const hasOkAnalyze = (calls: AgentCallRow[], agent: AgentName) => calls.some((c) => c.agent === agent && c.purpose === "analyze" && c.status === "ok");

/** Which stage a failed run died in, inferred from what it had committed. */
function failedStage(run: Run): Stage {
  if (!run.plan) return "lead";
  const s = run.state;
  if (s.rerun?.length) return "sharks";
  if (!Object.keys(s.shark_outputs).length && !Object.keys(s.shark_failures).length) return "sharks";
  if (!s.synthesis) return "synthesis";
  return "policy";
}

/**
 * Node state for the live agent graph. `approvals` (optional) decides whether the human node is ok:
 * a decided approval with a human decider (decided_by null = system-rejected on cancel).
 */
export function deriveGraph(run: Run, agentCalls: AgentCallRow[], approvals: { status: ApprovalRow["status"]; decided_by?: string | null }[] = []): GraphState {
  const fast = isFastPass(run);
  const failed = run.status === "failed" ? failedStage(run) : null;
  const running = RUNNING_STAGE[run.status] ?? null;
  const activeIdx = running ? STAGE_ORDER.indexOf(running) : failed ? STAGE_ORDER.indexOf(failed) : STAGE_ORDER.length;
  const after = (st: Stage) => STAGE_ORDER.indexOf(st) > activeIdx; // downstream of the live / failed stage

  const lead: NodeState = failed === "lead" ? "failed" : running === "lead" ? "running" : run.state.triage || run.plan || fast ? "ok" : "idle";

  const shark = (a: AgentName): NodeState => {
    if (fast) return "skipped";
    const inCurrent = currentSet(run).includes(a);
    if ((running === "sharks" || failed === "sharks") && inCurrent) {
      const ok = hasOkAnalyze(agentCalls, a) && !run.state.rerun;
      if (running === "sharks") return ok ? "ok" : "running";
      return ok ? "ok" : "failed";
    }
    if (after("sharks")) return "idle";
    const f = run.state.shark_failures[a];
    if (f === "skipped_budget") return "skipped";
    if (f === "failed") return "failed";
    if (run.state.shark_outputs[a]) return "ok";
    if (run.plan && !run.plan.sharks.includes(a) && activeIdx > STAGE_ORDER.indexOf("sharks")) return "skipped";
    return "idle";
  };

  const tail = (st: "synthesis" | "policy", done: boolean): NodeState => {
    if (fast) return "skipped";
    if (running === st) return "running";
    if (failed === st) return "failed";
    if (after(st)) return "idle";
    return done ? "ok" : "idle";
  };

  const humanDecided = approvals.some((a) => a.status !== "pending" && a.decided_by !== null);
  const human: NodeState = WAITING.includes(run.status) ? "waiting" : WORKING.includes(run.status) ? "idle" : humanDecided ? "ok" : "idle";

  return {
    lead,
    market: shark("market"),
    finance: shark("finance"),
    product: shark("product"),
    skeptic: shark("skeptic"),
    synthesis: tail("synthesis", !!run.state.synthesis),
    policy: tail("policy", !!run.decision),
    human,
  };
}

/** Reliability badges for a Shark card (SPEC §5.3). */
export function sharkBadges(agent: AgentName, agentCalls: AgentCallRow[], toolCalls: Pick<ToolCallRow, "agent" | "permitted">[]): string[] {
  const calls = agentCalls.filter((c) => c.agent === agent);
  const out: string[] = [];
  const retries = calls.filter((c) => c.attempt > 1 && !c.fallback_used).length;
  if (retries) out.push(`retry ×${retries}`);
  if (calls.some((c) => c.fallback_used)) out.push("fallback");
  if (calls.some((c) => c.status === "timeout")) out.push("timeout");
  const schema = calls.filter((c) => c.status === "schema_fail").length;
  if (schema) out.push(`schema fail ×${schema}`);
  if (calls.some((c) => c.status === "skipped_budget")) out.push("skipped");
  if (toolCalls.some((t) => t.agent === agent && !t.permitted)) out.push("denied tool");
  return out;
}

/** Latency of the final ok attempt; tokens and cost summed across every attempt. */
export function sharkStats(agent: AgentName, agentCalls: AgentCallRow[]) {
  const calls = agentCalls.filter((c) => c.agent === agent);
  const lastOk = calls.filter((c) => c.status === "ok").at(-1);
  return {
    attempts: calls.filter((c) => c.status !== "skipped_budget").length,
    latencyMs: lastOk?.latency_ms ?? null,
    model: lastOk?.model ?? null,
    tokens: calls.reduce((n, c) => n + c.input_tokens + c.output_tokens, 0),
    cost: calls.reduce((n, c) => n + c.cost_usd, 0),
  };
}

export type StatusTone = "working" | "waiting" | "success" | "neutral" | "danger";
export function statusTone(s: RunStatus): StatusTone {
  if (WORKING.includes(s)) return "working";
  if (WAITING.includes(s)) return "waiting";
  if (s === "offer_sent") return "success";
  if (s === "passed") return "neutral";
  return "danger";
}
export const statusLabel = (s: RunStatus) => s.replace(/_/g, " ");

export type StepState = "done" | "current" | "skipped" | "upcoming" | "failed";
export type Step = { key: string; label: string; state: StepState };

const fromNode = (n: NodeState): StepState => (n === "running" || n === "waiting" ? "current" : n === "ok" ? "done" : n === "failed" ? "failed" : n === "skipped" ? "skipped" : "upcoming");

/** Intake → Triage → Plan → Analyze → Synthesize → Policy → Human → Outcome. */
export function deriveSteps(run: Run, g: GraphState): Step[] {
  const fast = isFastPass(run);
  const terminal = TERMINAL.includes(run.status);
  const triage: StepState = run.status === "triage" ? "current" : run.state.triage || fast ? "done" : g.lead === "failed" ? "failed" : "upcoming";
  const plan: StepState = fast ? "skipped" : run.status === "planning" ? "current" : run.plan ? "done" : g.lead === "failed" && run.state.triage ? "failed" : "upcoming";
  const sharks = SHARKS.map((a) => g[a]);
  const analyze: StepState = sharks.includes("running") ? "current" : sharks.includes("failed") && run.status === "failed" && g.synthesis !== "failed" && g.policy !== "failed" ? "failed" : sharks.every((s) => s === "skipped") ? "skipped" : sharks.some((s) => s !== "idle") ? "done" : "upcoming";
  const human: StepState = g.human === "idle" && (run.status === "offer_sent" || run.status === "passed") ? "skipped" : fromNode(g.human);
  const outcome: StepState = run.status === "failed" || run.status === "cancelled" ? "failed" : terminal ? "done" : "upcoming";
  return [
    { key: "intake", label: "Intake", state: run.status === "queued" ? "current" : "done" },
    { key: "triage", label: "Triage", state: triage },
    { key: "plan", label: "Plan", state: plan },
    { key: "analyze", label: "Analyze", state: analyze },
    { key: "synthesize", label: "Synthesize", state: fromNode(g.synthesis) },
    { key: "policy", label: "Policy", state: fromNode(g.policy) },
    { key: "human", label: "Human", state: human },
    { key: "outcome", label: terminal ? `Outcome · ${statusLabel(run.status)}` : "Outcome", state: outcome },
  ];
}

/** Post-money valuation implied by terms: amount / (equity / 100). */
export const impliedValuation = (amount: number, equityPct: number) => (equityPct > 0 ? amount / (equityPct / 100) : 0);

export type ValuationPoint = { who: string; valuation: number; kind: "founder" | "shark" };
/** Founder's implied valuation, then each Shark with proposed terms (others omitted). */
export function valuationData(pitch: Pick<Pitch, "ask_amount" | "equity_offered">, run: Run): ValuationPoint[] {
  const out: ValuationPoint[] = [{ who: "Founder ask", valuation: impliedValuation(pitch.ask_amount, pitch.equity_offered), kind: "founder" }];
  for (const a of SHARKS) {
    const t = run.state.shark_outputs[a]?.proposed_terms;
    if (t) out.push({ who: SHARK_LABEL[a], valuation: impliedValuation(t.amount, t.equity_pct), kind: "shark" });
  }
  return out;
}

/** Cumulative tokens recorded in a checkpoint snapshot (null when absent, e.g. the initial queued row). */
export function snapshotTokens(state: unknown): number | null {
  if (state && typeof state === "object" && typeof (state as { tokens_used?: unknown }).tokens_used === "number") return (state as { tokens_used: number }).tokens_used;
  return null;
}
export function snapshotStatus(state: unknown): string | null {
  if (state && typeof state === "object" && typeof (state as { status?: unknown }).status === "string") return (state as { status: string }).status;
  return null;
}

/** Autonomy level names (SPEC §2.8). */
export const AUTONOMY_NAME = ["L0 · Human decides", "L1 · Approval required", "L2 · Assisted", "L3 · Full auto"] as const;
