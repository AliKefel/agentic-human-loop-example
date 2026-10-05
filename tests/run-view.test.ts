import { describe, expect, it } from "vitest";
import { MemoryRepo } from "@/lib/harness/repo-memory";
import { createRun } from "@/lib/harness/runs";
import { runToRest } from "@/lib/harness/machine";
import { deriveGraph, sharkBadges } from "@/lib/run-view";
import { GP_ID, SEED_USERS } from "@/lib/mock/seed-users";
import { initialRunState } from "@/lib/harness/run-state";
import type { AgentCallRow, Run } from "@/lib/types";

const GP = SEED_USERS.find((u) => u.id === GP_ID)!;

async function toRest(repo: MemoryRepo, slug: string) {
  const pitch = await repo.getPitchBySlug(slug);
  const run = await createRun(repo, { pitchId: pitch.id, autonomyLevel: 2, user: GP });
  return runToRest(repo, run.id);
}
const callsFor = (repo: MemoryRepo, runId: string) => repo.agentCalls.filter((c) => c.run_id === runId) as AgentCallRow[];

function call(p: Partial<AgentCallRow>): AgentCallRow {
  return { id: Math.random().toString(36), run_id: "r", agent: "finance", purpose: "analyze", model: "m", attempt: 1, fallback_used: false, input_tokens: 0, output_tokens: 0, cost_usd: 0, latency_ms: 0, status: "ok", error: null, output: null, created_at: "2026-10-04T00:00:00Z", ...p };
}
function runAt(p: Partial<Run>): Run {
  return { id: "r", pitch_id: "p", config_version: 1, autonomy_level: 2, status: "queued", plan: null, state: initialRunState(), degraded: false, replans: 0, step_count: 0, tokens_used: 0, cost_usd: 0, decision: null, recommendation: null, final_terms: null, started_by: null, started_at: "2026-10-04T00:00:00Z", completed_at: null, error: null, ...p };
}
const PLAN = { sharks: ["market", "finance", "product", "skeptic"] as const, questions: {}, tool_budget: {}, rationale: "r" };

describe("deriveGraph", () => {
  it("greengrid fast-pass → passed: lead ok, every shark skipped", async () => {
    const repo = new MemoryRepo();
    const run = await toRest(repo, "greengrid");
    expect(run.status).toBe("passed");
    const g = deriveGraph(run, callsFor(repo, run.id));
    expect(g.lead).toBe("ok");
    expect([g.market, g.finance, g.product, g.skeptic]).toEqual(["skipped", "skipped", "skipped", "skipped"]);
    expect(g.synthesis).toBe("skipped");
    expect(g.policy).toBe("skipped");
    expect(g.human).toBe("idle");
  });

  it("thriftloop budget exhaustion → product skipped, others ok", async () => {
    const repo = new MemoryRepo();
    const run = await toRest(repo, "thriftloop");
    expect(run.state.shark_failures.product).toBe("skipped_budget");
    const g = deriveGraph(run, callsFor(repo, run.id));
    expect(g.product).toBe("skipped");
    expect(g.skeptic).toBe("ok");
    expect(g.synthesis).toBe("ok");
    expect(g.policy).toBe("ok");
  });

  it("ledgerleaf analyzing with only finance timeouts → finance running; sharks with ok calls ok", () => {
    const run = runAt({ status: "analyzing", plan: { ...PLAN, sharks: [...PLAN.sharks] }, state: { ...initialRunState(), triage: { fast_pass: false, reason: "x" } } });
    const calls = [
      call({ agent: "lead", purpose: "triage" }),
      call({ agent: "lead", purpose: "plan" }),
      call({ agent: "market" }),
      call({ agent: "finance", status: "timeout", attempt: 1 }),
      call({ agent: "finance", status: "timeout", attempt: 2 }),
    ];
    const g = deriveGraph(run, calls);
    expect(g.lead).toBe("ok");
    expect(g.finance).toBe("running");
    expect(g.market).toBe("ok");
    expect(g.product).toBe("running");
    expect(g.synthesis).toBe("idle");
    expect(g.policy).toBe("idle");
    expect(g.human).toBe("idle");
  });

  it("pawprint awaiting_approval → human waiting, pipeline ok", async () => {
    const repo = new MemoryRepo();
    const run = await toRest(repo, "pawprint");
    expect(run.status).toBe("awaiting_approval");
    const g = deriveGraph(run, callsFor(repo, run.id));
    expect(g.human).toBe("waiting");
    expect(g.policy).toBe("ok");
    expect(g.synthesis).toBe("ok");
    expect([g.market, g.finance, g.product, g.skeptic].every((s) => s === "ok")).toBe(true);
  });

  it("lead running during triage/planning; queued is idle; decided approval → human ok", () => {
    expect(deriveGraph(runAt({ status: "triage" }), []).lead).toBe("running");
    expect(deriveGraph(runAt({ status: "planning" }), []).lead).toBe("running");
    expect(deriveGraph(runAt({ status: "queued" }), []).lead).toBe("idle");
    const done = runAt({ status: "offer_sent", plan: { ...PLAN, sharks: [...PLAN.sharks] }, decision: { outcome: "needs_approval", rule: "r", explanation: "e" } });
    expect(deriveGraph(done, [], [{ status: "approved" }]).human).toBe("ok");
    expect(deriveGraph(done, [], [{ status: "pending" }]).human).toBe("idle");
  });

  it("failed run marks the node that was running as failed", () => {
    expect(deriveGraph(runAt({ status: "failed", error: "x" }), []).lead).toBe("failed");
    const r = runAt({ status: "failed", plan: { ...PLAN, sharks: [...PLAN.sharks] }, state: { ...initialRunState(), triage: { fast_pass: false, reason: "x" }, shark_outputs: { market: {} as never } } });
    const g = deriveGraph(r, []);
    expect(g.synthesis).toBe("failed");
    expect(g.lead).toBe("ok");
  });
});

describe("sharkBadges", () => {
  it("derives retry / fallback / timeout / schema / skipped / denied tool", () => {
    const calls = [
      call({ agent: "finance", status: "timeout", attempt: 1 }),
      call({ agent: "finance", status: "schema_fail", attempt: 2 }),
      call({ agent: "finance", status: "ok", attempt: 3, fallback_used: true }),
      call({ agent: "market", status: "skipped_budget", attempt: 0 }),
    ];
    const b = sharkBadges("finance", calls, [{ agent: "finance", permitted: false }]);
    expect(b).toEqual(expect.arrayContaining(["retry ×1", "fallback", "timeout", "schema fail ×1", "denied tool"]));
    expect(sharkBadges("market", calls, [])).toEqual(["skipped"]);
  });
});

describe("runActionsFor (mobile action bar only when something applies)", () => {
  it("terminal runs without review/resume have no actions; waiting/failed runs do", async () => {
    const { runActionsFor } = await import("@/lib/run-view");
    expect(runActionsFor("offer_sent", true, false).any).toBe(false);
    expect(runActionsFor("passed", false, false).any).toBe(false);
    expect(runActionsFor("cancelled", true, false).any).toBe(false);
    expect(runActionsFor("failed", false, false).any).toBe(false); // terminal; only a GP may resume
    expect(runActionsFor("failed", true, false)).toMatchObject({ resume: true, cancel: false, any: true });
    expect(runActionsFor("awaiting_founder", false, false)).toMatchObject({ founder: true, cancel: true, any: true });
    expect(runActionsFor("awaiting_approval", false, true)).toMatchObject({ review: true, any: true });
  });
});
