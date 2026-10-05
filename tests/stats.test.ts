import { describe, expect, it } from "vitest";
import { computeStats, WAIT_BUCKETS } from "@/lib/stats";
import { CONFIG_V1 } from "@/lib/mock/seed-config";
import { initialRunState } from "@/lib/harness/run-state";
import { pitchFixture } from "./helpers";
import type { AgentCallRow, ApprovalRow, Run, ToolCallRow } from "@/lib/types";

const run = (id: string, slug: string, over: Partial<Run>): Run => ({
  id, pitch_id: `pitch-${slug}`, config_version: 1, autonomy_level: 2, status: "offer_sent", plan: null, state: initialRunState(),
  degraded: false, replans: 0, step_count: 5, tokens_used: 0, cost_usd: 0, decision: null, recommendation: null, final_terms: null,
  started_by: null, started_at: "2026-03-01T10:00:00.000Z", completed_at: null, error: null, ...over,
});
const approval = (id: string, runId: string, over: Partial<ApprovalRow>): ApprovalRow => ({
  id, run_id: runId, kind: "approval", status: "approved", required_role: "partner", rule_fired: "r", ai_recommendation: "invest",
  original_terms: null, final_terms: null, decided_by: "u", reason: null, is_override: false, sla_due: "2026-03-05T00:00:00.000Z",
  created_at: "2026-03-01T00:00:00.000Z", decided_at: "2026-03-01T00:00:00.000Z", ...over,
});
let n = 0;
const call = (runId: string, agent: AgentCallRow["agent"], over: Partial<AgentCallRow>): AgentCallRow => ({
  id: `c${++n}`, run_id: runId, agent, purpose: "analyze", model: "claude-sonnet-5-5", attempt: 1, fallback_used: false, input_tokens: 0, output_tokens: 0,
  cost_usd: 0, latency_ms: 0, status: "ok", error: null, output: null, created_at: "2026-03-01T10:00:00.000Z", ...over,
});
const tool = (runId: string, permitted: boolean): ToolCallRow => ({
  id: `t${++n}`, run_id: runId, agent_call_id: null, agent: "market", tool: "market_size_lookup", args: {}, result: null, latency_ms: 5, permitted, created_at: "2026-03-01T10:00:00.000Z",
});

const pitches = ["brewbot", "pawprint", "moonmint", "greengrid"].map(pitchFixture);
const NOW = Date.parse("2026-03-02T20:00:00.000Z");

describe("computeStats (hand-built dataset: 3 runs, 2 approvals, 6 agent calls)", () => {
  // r1 BrewBot L2 auto offer; r2 PawPrint L1 offer after a 30 s approval; r3 MoonMint L2 escalated then rejected (override) after 3 h.
  const runs = [
    run("r1", "brewbot", { autonomy_level: 2, status: "offer_sent", final_terms: { amount: 100000, equity_pct: 10 }, cost_usd: 0.1, started_at: "2026-03-01T10:00:00.000Z" }),
    run("r2", "pawprint", { autonomy_level: 1, status: "offer_sent", final_terms: { amount: 300000, equity_pct: 12 }, cost_usd: 0.2, started_at: "2026-03-02T09:00:00.000Z" }),
    run("r3", "moonmint", { autonomy_level: 2, status: "passed", cost_usd: 0.3, started_at: "2026-03-02T15:00:00.000Z" }),
  ];
  const approvals = [
    approval("a1", "r2", { kind: "approval", status: "approved", created_at: "2026-03-02T09:05:00.000Z", decided_at: "2026-03-02T09:05:30.000Z" }),
    approval("a2", "r3", { kind: "escalation", status: "rejected", is_override: true, created_at: "2026-03-02T15:10:00.000Z", decided_at: "2026-03-02T18:10:00.000Z" }),
  ];
  const agentCalls = [
    call("r1", "lead", { purpose: "plan", latency_ms: 100, input_tokens: 100, output_tokens: 50 }),
    call("r1", "market", { latency_ms: 300, input_tokens: 1000, output_tokens: 200 }),
    call("r2", "finance", { attempt: 2, latency_ms: 500, input_tokens: 800, output_tokens: 100 }), // retry
    call("r2", "finance", { attempt: 3, fallback_used: true, latency_ms: 700, input_tokens: 600, output_tokens: 100 }), // fallback
    call("r3", "skeptic", { status: "timeout", latency_ms: 20000 }),
    call("r3", "product", { status: "schema_fail", latency_ms: 400, input_tokens: 300, output_tokens: 0 }),
  ];
  const toolCalls = [tool("r1", true), tool("r2", false)];
  const s = computeStats({ runs, pitches, approvals, agentCalls, toolCalls, config: CONFIG_V1, now: NOW });

  it("KPIs", () => {
    expect(s.kpis).toEqual({
      totalRuns: 3,
      offersSent: 2,
      capitalCommitted: 400000,
      avgCostPerRun: expect.closeTo(0.2, 10),
      avgHumanWaitMs: (30_000 + 3 * 3_600_000) / 2,
      automationRate: 1 / 3,
      escalationRate: 1 / 3,
      overrideRate: 1 / 2,
    });
    expect(s.kpiBasis).toEqual({ terminalRuns: 3, autoRuns: 1, decidedApprovals: 2, overrides: 1, escalatedRuns: 1, pendingApprovals: 0 });
  });

  it("outcomes by day fill every day from the first run to today", () => {
    expect(s.outcomesByDay).toEqual([
      { day: "2026-03-01", offer_sent: 1, passed: 0, escalated: 0, in_review: 0, cancelled: 0 },
      { day: "2026-03-02", offer_sent: 1, passed: 1, escalated: 0, in_review: 0, cancelled: 0 },
    ]);
  });

  it("cost per run (oldest → newest) and the budget cap", () => {
    expect(s.costPerRun).toEqual([
      { label: "BrewBot · L2", cost: 0.1 },
      { label: "PawPrint DNA · L1", cost: 0.2 },
      { label: "MoonMint · L2", cost: 0.3 },
    ]);
    expect(s.budgetCap).toBe(0.5);
  });

  it("outcomes by autonomy level", () => {
    expect(s.outcomesByAutonomy).toEqual([
      { level: "L0", auto: 0, human: 0, escalated: 0 },
      { level: "L1", auto: 0, human: 1, escalated: 0 },
      { level: "L2", auto: 1, human: 0, escalated: 1 },
      { level: "L3", auto: 0, human: 0, escalated: 0 },
    ]);
  });

  it("human wait histogram", () => {
    expect(s.waitHistogram).toEqual([
      { bucket: "<1m", count: 1 },
      { bucket: "1–5m", count: 0 },
      { bucket: "5–30m", count: 0 },
      { bucket: "30m–2h", count: 0 },
      { bucket: ">2h", count: 1 },
    ]);
  });

  it("latency p50/p95 over ok calls only (nearest rank)", () => {
    expect(s.latencyByAgent).toEqual([
      { agent: "Lead", p50: 100, p95: 100 },
      { agent: "Market", p50: 300, p95: 300 },
      { agent: "Finance", p50: 500, p95: 700 },
    ]);
  });

  it("reliability events", () => {
    expect(s.reliability).toEqual([
      { event: "Retries", count: 1 },
      { event: "Fallbacks", count: 1 },
      { event: "Timeouts", count: 1 },
      { event: "Schema fails", count: 1 },
      { event: "Budget skips", count: 0 },
      { event: "Denied tools", count: 1 },
    ]);
  });

  it("token burn per run, stacked by agent", () => {
    expect(s.tokensByRun).toEqual([
      { label: "BrewBot · L2", lead: 150, market: 1200, finance: 0, product: 0, skeptic: 0 },
      { label: "PawPrint DNA · L1", lead: 0, market: 0, finance: 1600, product: 0, skeptic: 0 },
      { label: "MoonMint · L2", lead: 0, market: 0, finance: 0, product: 300, skeptic: 0 },
    ]);
  });

  it("sector mix (runs per sector, count desc then name)", () => {
    expect(s.sectorMix).toEqual([
      { sector: "Consumer Health", count: 1 },
      { sector: "Food & Beverage", count: 1 },
      { sector: "Web3", count: 1 },
    ]);
  });
});

describe("computeStats edge cases", () => {
  it("bucket boundaries are lower-inclusive", () => {
    const at = (ms: number, i: number) => approval(`b${i}`, "r", { created_at: "2026-03-01T00:00:00.000Z", decided_at: new Date(Date.parse("2026-03-01T00:00:00.000Z") + ms).toISOString() });
    const s = computeStats({ runs: [], pitches, approvals: [59_999, 60_000, 299_999, 300_000, 1_800_000, 7_199_999, 7_200_000].map(at), agentCalls: [], toolCalls: [], config: CONFIG_V1, now: NOW });
    expect(s.waitHistogram.map((b) => b.count)).toEqual([1, 2, 1, 2, 1]);
    expect(WAIT_BUCKETS.map((b) => b.label)).toEqual(["<1m", "1–5m", "5–30m", "30m–2h", ">2h"]);
  });

  it("cancel-closed and pending approvals are not human decisions; cancelled/failed runs leave the automation denominator", () => {
    const runs = [
      run("w", "brewbot", { status: "awaiting_approval", started_at: "2026-03-02T01:00:00.000Z" }),
      run("q", "brewbot", { status: "analyzing", started_at: "2026-03-02T02:00:00.000Z" }),
      run("c", "greengrid", { status: "cancelled", started_at: "2026-03-02T03:00:00.000Z" }),
      run("f", "greengrid", { status: "failed", started_at: "2026-03-02T04:00:00.000Z" }),
      run("e", "moonmint", { status: "escalated", started_at: "2026-03-02T05:00:00.000Z" }),
      run("p", "greengrid", { status: "passed", autonomy_level: 3, started_at: "2026-03-02T06:00:00.000Z" }),
    ];
    const approvals = [
      approval("x1", "w", { status: "pending", decided_at: null, decided_by: null }),
      approval("x2", "c", { status: "rejected", reason: "run cancelled", is_override: false, created_at: "2026-03-02T03:00:00.000Z", decided_at: "2026-03-02T09:00:00.000Z" }),
      approval("x3", "e", { kind: "escalation", status: "pending", decided_at: null, decided_by: null }),
    ];
    const s = computeStats({ runs, pitches, approvals, agentCalls: [], toolCalls: [], config: CONFIG_V1, now: NOW });
    expect(s.kpis).toMatchObject({ totalRuns: 6, offersSent: 0, capitalCommitted: 0, avgHumanWaitMs: 0, automationRate: 1, escalationRate: 1 / 6, overrideRate: 0 });
    expect(s.kpiBasis).toMatchObject({ terminalRuns: 1, autoRuns: 1, decidedApprovals: 0, pendingApprovals: 2 });
    expect(s.outcomesByDay).toEqual([{ day: "2026-03-02", offer_sent: 0, passed: 1, escalated: 1, in_review: 2, cancelled: 2 }]);
    expect(s.outcomesByAutonomy.find((l) => l.level === "L2")).toEqual({ level: "L2", auto: 0, human: 2, escalated: 1 }); // w (pending) + c (cancelled after reaching the gate)
    expect(s.outcomesByAutonomy.find((l) => l.level === "L3")).toEqual({ level: "L3", auto: 1, human: 0, escalated: 0 });
    expect(s.waitHistogram.every((b) => b.count === 0)).toBe(true);
  });

  it("empty input → zeros, no NaN; day axis limited to the last 30 days; cost series limited to the last 30 runs", () => {
    const empty = computeStats({ runs: [], pitches: [], approvals: [], agentCalls: [], toolCalls: [], config: CONFIG_V1, now: NOW });
    expect(Object.values(empty.kpis).every((v) => v === 0)).toBe(true);
    expect(empty.outcomesByDay).toEqual([]);
    expect(empty.sectorMix).toEqual([]);
    const many = Array.from({ length: 40 }, (_, i) => run(`m${i}`, "brewbot", { started_at: new Date(NOW - (40 - i) * 86_400_000).toISOString(), cost_usd: i }));
    const s = computeStats({ runs: many, pitches, approvals: [], agentCalls: [], toolCalls: [], config: CONFIG_V1, now: NOW });
    expect(s.outcomesByDay).toHaveLength(30);
    expect(s.outcomesByDay.at(-1)?.day).toBe("2026-03-02");
    expect(s.costPerRun).toHaveLength(30);
    expect(s.costPerRun.at(-1)?.cost).toBe(39);
    expect(s.tokensByRun).toHaveLength(30);
  });
});

describe("loadFundStats (MemoryRepo end-to-end)", () => {
  it("fetches runs + related rows through the repo and computes stats", async () => {
    const { MemoryRepo } = await import("@/lib/harness/repo-memory");
    const { createRun } = await import("@/lib/harness/runs");
    const { runToRest } = await import("@/lib/harness/machine");
    const { SEED_USERS, GP_ID } = await import("@/lib/mock/seed-users");
    const { loadFundStats } = await import("@/lib/stats-server");
    const repo = new MemoryRepo();
    const gp = SEED_USERS.find((u) => u.id === GP_ID)!;
    for (const slug of ["brewbot", "pawprint", "mealmate"]) {
      const p = await repo.getPitchBySlug(slug);
      await runToRest(repo, (await createRun(repo, { pitchId: p.id, autonomyLevel: 2, user: gp })).id);
    }
    const s = await loadFundStats(repo);
    expect(s.kpis).toMatchObject({ totalRuns: 3, offersSent: 2, automationRate: 1, escalationRate: 0 });
    expect(s.kpiBasis.pendingApprovals).toBe(1);
    expect(s.reliability.find((r) => r.event === "Denied tools")?.count).toBeGreaterThan(0); // MealMate
    expect(s.latencyByAgent.map((l) => l.agent)).toEqual(["Lead", "Market", "Finance", "Product", "Skeptic"]);
    expect(s.tokensByRun.every((t) => t.lead > 0)).toBe(true);
  });
});
