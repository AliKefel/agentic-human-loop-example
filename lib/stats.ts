/**
 * Fund Overview stats (SPEC §5.1, M9). PURE and client-safe: type-only imports plus the pure
 * queue-stats helpers, no I/O. `loadFundStats` (lib/stats-server.ts) fetches the rows.
 *
 * Shared definitions:
 * - "terminal" here means a run that reached a business outcome: status offer_sent | passed.
 *   cancelled / failed runs are NOT terminal for the rates below.
 * - "human decision" = an approval decided by a person (isHumanDecision from queue-stats: not
 *   pending, has decided_at, and not closed by a run cancel). Same rule as the review-queue strip.
 * - Days are UTC calendar days (YYYY-MM-DD) of runs.started_at.
 */
import { decisionMs, isHumanDecision } from "@/lib/harness/queue-stats";
import type { AgentCallRow, AgentId, ApprovalRow, HarnessConfig, Pitch, Run, RunStatus, ToolCallRow } from "@/lib/types";

export type FundStats = {
  kpis: { totalRuns: number; offersSent: number; capitalCommitted: number; avgCostPerRun: number; avgHumanWaitMs: number; automationRate: number; escalationRate: number; overrideRate: number };
  /** Denominators / counts behind the KPI rates (for tile sub-labels and empty states). */
  kpiBasis: { terminalRuns: number; autoRuns: number; decidedApprovals: number; overrides: number; escalatedRuns: number; pendingApprovals: number };
  outcomesByDay: Array<{ day: string; offer_sent: number; passed: number; escalated: number; in_review: number; cancelled: number }>;
  costPerRun: Array<{ label: string; cost: number }>;
  budgetCap: number;
  outcomesByAutonomy: Array<{ level: string; auto: number; human: number; escalated: number }>;
  waitHistogram: Array<{ bucket: string; count: number }>;
  latencyByAgent: Array<{ agent: string; p50: number; p95: number }>;
  reliability: Array<{ event: string; count: number }>;
  tokensByRun: Array<{ label: string; lead: number; market: number; finance: number; product: number; skeptic: number }>;
  sectorMix: Array<{ sector: string; count: number }>;
};

export type StatsInput = { runs: Run[]; pitches: Pitch[]; approvals: ApprovalRow[]; agentCalls: AgentCallRow[]; toolCalls: ToolCallRow[]; config: HarnessConfig; now?: number };

const MIN = 60_000;
/** Human wait buckets, lower bound inclusive / upper bound exclusive: [0,1m) [1m,5m) [5m,30m) [30m,2h) [2h,∞). */
export const WAIT_BUCKETS = [
  { label: "<1m", maxMs: MIN },
  { label: "1–5m", maxMs: 5 * MIN },
  { label: "5–30m", maxMs: 30 * MIN },
  { label: "30m–2h", maxMs: 120 * MIN },
  { label: ">2h", maxMs: Infinity },
] as const;

/** Audit events in the dashboard activity feed. Lives here (not in the "use client" feed module) so the server page can read it. */
export const ACTIVITY_FEED_SIZE = 15;
/** Number of most recent runs in the cost and token-burn series. */
export const RECENT_RUNS = 30;
/** Max days on the outcomes-over-time axis. */
export const MAX_DAYS = 30;
const DAY_MS = 86_400_000;

const AGENTS: AgentId[] = ["lead", "market", "finance", "product", "skeptic"];
const AGENT_LABEL: Record<AgentId, string> = { lead: "Lead", market: "Market", finance: "Finance", product: "Product", skeptic: "Skeptic" };
const OUTCOME_OF: Record<RunStatus, keyof Omit<FundStats["outcomesByDay"][number], "day">> = {
  offer_sent: "offer_sent",
  passed: "passed",
  escalated: "escalated",
  // still open — working, or waiting on a human / the founder
  queued: "in_review", triage: "in_review", planning: "in_review", analyzing: "in_review", synthesizing: "in_review", policy_check: "in_review",
  awaiting_founder: "in_review", awaiting_approval: "in_review", in_review: "in_review",
  // stopped without an outcome
  cancelled: "cancelled", failed: "cancelled",
};

const isTerminal = (r: Pick<Run, "status">) => r.status === "offer_sent" || r.status === "passed";
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const ratio = (n: number, d: number) => (d ? n / d : 0);
const dayOf = (t: number) => new Date(t).toISOString().slice(0, 10);
const byStarted = (a: Run, b: Run) => Date.parse(a.started_at) - Date.parse(b.started_at);

/** Nearest-rank percentile: the smallest value with at least p% of values ≤ it. `sorted` ascending, non-empty. */
export function percentile(sorted: number[], p: number): number {
  return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)];
}

export function computeStats({ runs, pitches, approvals, agentCalls, toolCalls, config, now = Date.now() }: StatsInput): FundStats {
  const pitchById = new Map(pitches.map((p) => [p.id, p]));
  const approvalsByRun = new Map<string, ApprovalRow[]>();
  for (const a of approvals) approvalsByRun.set(a.run_id, [...(approvalsByRun.get(a.run_id) ?? []), a]);
  const hasApproval = (r: Run) => (approvalsByRun.get(r.id)?.length ?? 0) > 0;
  // "ever escalated": an escalation approval exists, or the run is escalated right now.
  const everEscalated = (r: Run) => r.status === "escalated" || (approvalsByRun.get(r.id) ?? []).some((a) => a.kind === "escalation");
  const label = (r: Run) => `${pitchById.get(r.pitch_id)?.company ?? "Unknown"} · L${r.autonomy_level}`;

  // ── KPIs ──────────────────────────────────────────────────────────────
  const offers = runs.filter((r) => r.status === "offer_sent");
  const terminal = runs.filter(isTerminal);
  const autoRuns = terminal.filter((r) => !hasApproval(r));
  const decided = approvals.filter(isHumanDecision);
  const overrides = decided.filter((a) => a.is_override).length;
  const escalatedRuns = runs.filter(everEscalated).length;
  const kpis: FundStats["kpis"] = {
    totalRuns: runs.length,
    offersSent: offers.length,
    // Σ final_terms.amount over offer_sent runs.
    capitalCommitted: offers.reduce((n, r) => n + (r.final_terms?.amount ?? 0), 0),
    // mean(runs.cost_usd) over all runs.
    avgCostPerRun: mean(runs.map((r) => r.cost_usd)),
    // mean(decided_at − created_at) over human-decided approvals.
    avgHumanWaitMs: mean(decided.map(decisionMs)),
    // terminal runs (offer_sent | passed) with no approval row ÷ terminal runs.
    automationRate: ratio(autoRuns.length, terminal.length),
    // runs ever escalated ÷ total runs.
    escalationRate: ratio(escalatedRuns, runs.length),
    // human decisions with is_override ÷ human decisions.
    overrideRate: ratio(overrides, decided.length),
  };
  const kpiBasis: FundStats["kpiBasis"] = {
    terminalRuns: terminal.length, autoRuns: autoRuns.length, decidedApprovals: decided.length, overrides, escalatedRuns,
    pendingApprovals: approvals.filter((a) => a.status === "pending").length,
  };

  // ── 1. Outcomes over time: every UTC day from the first run to today, at most MAX_DAYS. ──
  const outcomesByDay: FundStats["outcomesByDay"] = [];
  if (runs.length) {
    const first = Math.min(...runs.map((r) => Date.parse(r.started_at)));
    const lastDay = Date.parse(dayOf(Math.max(now, ...runs.map((r) => Date.parse(r.started_at)))));
    const firstDay = Math.max(Date.parse(dayOf(first)), lastDay - (MAX_DAYS - 1) * DAY_MS);
    const index = new Map<string, FundStats["outcomesByDay"][number]>();
    for (let t = firstDay; t <= lastDay; t += DAY_MS) {
      const row = { day: dayOf(t), offer_sent: 0, passed: 0, escalated: 0, in_review: 0, cancelled: 0 };
      index.set(row.day, row);
      outcomesByDay.push(row);
    }
    for (const r of runs) {
      const row = index.get(dayOf(Date.parse(r.started_at)));
      if (row) row[OUTCOME_OF[r.status]]++;
    }
  }

  // ── 2 & 7. The RECENT_RUNS most recent runs, oldest → newest. ──
  const recent = [...runs].sort(byStarted).slice(-RECENT_RUNS);
  const costPerRun = recent.map((r) => ({ label: label(r), cost: r.cost_usd }));
  const tokensFor = new Map<string, Record<AgentId, number>>();
  for (const c of agentCalls) {
    const t = tokensFor.get(c.run_id) ?? { lead: 0, market: 0, finance: 0, product: 0, skeptic: 0 };
    t[c.agent] += c.input_tokens + c.output_tokens;
    tokensFor.set(c.run_id, t);
  }
  const tokensByRun = recent.map((r) => ({ label: label(r), ...(tokensFor.get(r.id) ?? { lead: 0, market: 0, finance: 0, product: 0, skeptic: 0 }) }));

  // ── 3. Outcomes by autonomy level. escalated = ever escalated; human = an approval/exception
  //       row and never escalated; auto = terminal with no approval row. Others are not counted. ──
  const outcomesByAutonomy = ([0, 1, 2, 3] as const).map((lvl) => {
    const at = runs.filter((r) => r.autonomy_level === lvl);
    const esc = at.filter(everEscalated);
    const human = at.filter((r) => !everEscalated(r) && (approvalsByRun.get(r.id) ?? []).some((a) => a.kind === "approval" || a.kind === "exception"));
    const auto = at.filter((r) => isTerminal(r) && !hasApproval(r));
    return { level: `L${lvl}`, auto: auto.length, human: human.length, escalated: esc.length };
  });

  // ── 4. Human wait histogram over human-decided approvals. ──
  const waitHistogram = WAIT_BUCKETS.map((b) => ({ bucket: b.label as string, count: 0 }));
  for (const a of decided) {
    const ms = decisionMs(a);
    waitHistogram[WAIT_BUCKETS.findIndex((b) => ms < b.maxMs)].count++;
  }

  // ── 5. Latency p50 / p95 per agent over ok agent calls (agents without ok calls are omitted). ──
  const latencyByAgent = AGENTS.flatMap((agent) => {
    const xs = agentCalls.filter((c) => c.agent === agent && c.status === "ok").map((c) => c.latency_ms).sort((a, b) => a - b);
    return xs.length ? [{ agent: AGENT_LABEL[agent], p50: percentile(xs, 50), p95: percentile(xs, 95) }] : [];
  });

  // ── 6. Reliability events. A retry is an attempt > 1 on the primary model; fallback attempts count as fallbacks. ──
  const count = (pred: (c: AgentCallRow) => boolean) => agentCalls.filter(pred).length;
  const reliability = [
    { event: "Retries", count: count((c) => c.attempt > 1 && !c.fallback_used) },
    { event: "Fallbacks", count: count((c) => c.fallback_used) },
    { event: "Timeouts", count: count((c) => c.status === "timeout") },
    { event: "Schema fails", count: count((c) => c.status === "schema_fail") },
    { event: "Budget skips", count: count((c) => c.status === "skipped_budget") },
    { event: "Denied tools", count: toolCalls.filter((t) => !t.permitted).length },
  ];

  // ── 8. Sector mix: runs per pitch sector, count desc then name. ──
  const sectors = new Map<string, number>();
  for (const r of runs) {
    const s = pitchById.get(r.pitch_id)?.sector ?? "Unknown";
    sectors.set(s, (sectors.get(s) ?? 0) + 1);
  }
  const sectorMix = [...sectors].map(([sector, n]) => ({ sector, count: n })).sort((a, b) => b.count - a.count || a.sector.localeCompare(b.sector));

  return { kpis, kpiBasis, outcomesByDay, costPerRun, budgetCap: config.budgets.max_usd, outcomesByAutonomy, waitHistogram, latencyByAgent, reliability, tokensByRun, sectorMix };
}
