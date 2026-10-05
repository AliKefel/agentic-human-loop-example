import { describe, expect, it } from "vitest";
import { MemoryRepo } from "@/lib/harness/repo-memory";
import { createRun } from "@/lib/harness/runs";
import { advanceRun, runToRest } from "@/lib/harness/machine";
import { budgetAllows, withReliability } from "@/lib/harness/reliability";
import { LlmTimeoutError } from "@/lib/llm/client";
import { GP_ID, SEED_USERS } from "@/lib/mock/seed-users";
import { CONFIG_V1 } from "@/lib/mock/seed-config";

const GP = SEED_USERS.find((u) => u.id === GP_ID)!;

async function runPitch(slug: string) {
  const repo = new MemoryRepo();
  const pitch = await repo.getPitchBySlug(slug);
  const run = await createRun(repo, { pitchId: pitch.id, user: GP });
  const done = await runToRest(repo, run.id);
  return { repo, run: done };
}

describe("withReliability", () => {
  it("retries then falls back", async () => {
    const calls: string[] = [];
    const slept: number[] = [];
    const r = await withReliability(
      CONFIG_V1.reliability,
      async ({ model, attempt }) => {
        calls.push(`${model}#${attempt}`);
        if (model === "claude-sonnet-5-5") throw new LlmTimeoutError();
        return 1;
      },
      async (ms) => { slept.push(ms); },
    );
    expect(r).toMatchObject({ ok: true, value: 1, fallbackUsed: true, attempts: 4 });
    expect(calls).toEqual(["claude-sonnet-5-5#1", "claude-sonnet-5-5#2", "claude-sonnet-5-5#3", "claude-haiku-4-5-20251001#4"]);
    expect(slept).toEqual([500, 1000]); // backoff between primary failures only
  });

  it("returns on first success without fallback", async () => {
    const flags: boolean[] = [];
    const r = await withReliability(CONFIG_V1.reliability, async ({ attempt, fallback }) => {
      flags.push(fallback);
      if (attempt === 1) throw new Error("schema_fail");
      return "ok";
    }, async () => {});
    expect(r).toEqual({ ok: true, value: "ok", attempts: 2, fallbackUsed: false });
    expect(flags).toEqual([false, false]);
  });

  it("timeout aborts a hung attempt", async () => {
    const cfg = { ...CONFIG_V1.reliability, timeout_ms: 20 };
    const seen: Array<{ attempt: number; fallback: boolean }> = [];
    const r = await withReliability(cfg, ({ attempt, fallback, signal }) => {
      seen.push({ attempt, fallback });
      return new Promise<number>((_, reject) => signal.addEventListener("abort", () => reject(new LlmTimeoutError()), { once: true }));
    }, async () => {});
    expect(r).toMatchObject({ ok: false, attempts: 4, fallbackUsed: true });
    expect(r.value).toBeUndefined();
    expect(seen).toEqual([{ attempt: 1, fallback: false }, { attempt: 2, fallback: false }, { attempt: 3, fallback: false }, { attempt: 4, fallback: true }]);
  });

  it("uses the last backoff value when backoff_ms is shorter than retries", async () => {
    const slept: number[] = [];
    await withReliability({ ...CONFIG_V1.reliability, retries: 3, backoff_ms: [100] }, async () => { throw new Error("x"); }, async (ms) => { slept.push(ms); });
    expect(slept).toEqual([100, 100, 100]);
  });
});

describe("budgetAllows", () => {
  it("allows up to the token cap and below the usd cap", () => {
    expect(budgetAllows(CONFIG_V1, { tokens: 57500, cost: 0.1 }, 2500)).toBe(true);
    expect(budgetAllows(CONFIG_V1, { tokens: 57501, cost: 0.1 }, 2500)).toBe(false);
    expect(budgetAllows(CONFIG_V1, { tokens: 0, cost: 0.5 }, 0)).toBe(false);
  });
});

describe("M4 pitches", () => {
  it("ledgerleaf: 3 timeouts + fallback ok", async () => {
    const { repo, run } = await runPitch("ledgerleaf");
    const finance = repo.agentCalls.filter((a) => a.run_id === run.id && a.agent === "finance");
    expect(finance.map((a) => a.status)).toEqual(["timeout", "timeout", "timeout", "ok"]);
    expect(finance.map((a) => a.attempt)).toEqual([1, 2, 3, 4]);
    expect(finance.map((a) => a.fallback_used)).toEqual([false, false, false, true]);
    expect(finance[3].model).toBe("claude-haiku-4-5-20251001");
    expect(run.state.shark_outputs.finance?.score).toBe(7);
    expect(run.state.shark_failures).toEqual({});
    expect(run.degraded).toBe(false);
  });

  it("dronedrop: schema_fail then ok", async () => {
    const { repo, run } = await runPitch("dronedrop");
    const product = repo.agentCalls.filter((a) => a.run_id === run.id && a.agent === "product");
    expect(product.map((a) => [a.status, a.attempt, a.fallback_used])).toEqual([["schema_fail", 1, false], ["ok", 2, false]]);
    expect(run.state.shark_outputs.product?.score).toBe(7);
    expect(run.state.shark_failures).toEqual({});
    expect(run.degraded).toBe(false);
  });

  it("thriftloop: product skipped_budget, degraded", async () => {
    const { repo, run } = await runPitch("thriftloop");
    const analyze = repo.agentCalls.filter((a) => a.run_id === run.id && a.purpose === "analyze");
    const skipped = analyze.filter((a) => a.status === "skipped_budget");
    expect(skipped).toHaveLength(1);
    expect(skipped[0]).toMatchObject({ agent: "product", input_tokens: 0, output_tokens: 0, cost_usd: 0 });
    expect(analyze.filter((a) => a.status === "ok").map((a) => a.agent).sort()).toEqual(["finance", "market", "skeptic"]);
    expect(run.state.shark_failures).toEqual({ product: "skipped_budget" });
    expect(run.degraded).toBe(true);
    const audits = repo.auditLog.filter((a) => a.action === "budget.exceeded" && a.entity_id === run.id);
    expect(audits).toHaveLength(1);
    expect(audits[0].details).toMatchObject({ agent: "product", used: 52000, cap: 60000 });
  });

  it("a CAS loser's token usage is still added to the run", async () => {
    const repo = new MemoryRepo();
    const pitch = await repo.getPitchBySlug("brewbot");
    const run = await createRun(repo, { pitchId: pitch.id, user: GP });
    await advanceRun(repo, run.id); // queued -> triage
    const [a, b] = await Promise.all([advanceRun(repo, run.id), advanceRun(repo, run.id)]);
    expect([a.status, b.status].sort()).toEqual(["advanced", "conflict"]);
    const after = await repo.getRun(run.id);
    const spent = repo.agentCalls.filter((x) => x.run_id === run.id).reduce((s, x) => s + x.input_tokens + x.output_tokens, 0);
    expect(spent).toBe(2 * (600 + 80)); // both triage calls spent tokens
    expect(after.tokens_used).toBe(spent);
    expect(after.step_count).toBe(2); // usage top-up never bumps step_count
    const spentUsd = repo.agentCalls.filter((x) => x.run_id === run.id).reduce((s, x) => s + x.cost_usd, 0);
    expect(after.cost_usd).toBeCloseTo(spentUsd, 6);
  });
});
