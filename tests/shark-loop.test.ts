import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LlmRequest, LlmResponse } from "@/lib/llm/client";

const calls: LlmRequest[] = [];
let script: ((req: LlmRequest) => Promise<LlmResponse>) | null = null;

vi.mock("@/lib/llm/client", async (orig) => {
  const real = await orig<typeof import("@/lib/llm/client")>();
  return {
    ...real,
    callLlm: async (req: LlmRequest) => {
      calls.push(structuredClone({ ...req, signal: undefined }));
      return script ? script(req) : real.callLlm(req);
    },
  };
});

const { MemoryRepo } = await import("@/lib/harness/repo-memory");
const { createRun } = await import("@/lib/harness/runs");
const { runSharkOnce, BUDGET_EXHAUSTED } = await import("@/lib/harness/sharks");
const { CONFIG_V1 } = await import("@/lib/mock/seed-config");
const { GP_ID, SEED_USERS } = await import("@/lib/mock/seed-users");
const { AgentCallError } = await import("@/lib/harness/agent");

const GP = SEED_USERS.find((u) => u.id === GP_ID)!;
const plan = { sharks: ["market", "skeptic"] as ("market" | "skeptic")[], questions: { market: "Q?", skeptic: "S?" }, tool_budget: { market: 1, skeptic: 1 }, rationale: "r" };

async function ctxFor(slug: string, founder_answers: string[] = []) {
  const repo = new MemoryRepo();
  const pitch = await repo.getPitchBySlug(slug);
  const run = await createRun(repo, { pitchId: pitch.id, user: GP });
  return { repo, run: { ...run, plan, state: { ...run.state, founder_answers } }, pitch, config: CONFIG_V1, usage: { tokens: 0, cost: 0 } };
}

const toolResp = (names: string[], turn: number): LlmResponse => {
  const toolUses = names.map((name, i) => ({ id: `t${turn}_${i}`, name, input: {} }));
  return { text: "", toolUses, inputTokens: 10, outputTokens: 5, latencyMs: 1, model: "claude-sonnet-5-5", rawContent: [{ type: "thinking", thinking: "hmm", signature: "sig" }, ...toolUses.map((t) => ({ type: "tool_use", ...t }))] };
};
const finalResp = (json: unknown): LlmResponse => ({ text: "```json\n" + JSON.stringify(json) + "\n```", toolUses: [], inputTokens: 10, outputTokens: 5, latencyMs: 1, model: "claude-sonnet-5-5", rawContent: [{ type: "text", text: "x" }] });
const good = { agent: "skeptic", score: 7, confidence: 0.7, verdict: "invest", key_points: ["a", "b"] };

beforeEach(() => {
  calls.length = 0;
  script = null;
});

describe("shark tool loop", () => {
  it("mealmate market: denied + allowed results in ONE user message; assistant content appended unchanged", async () => {
    const ctx = await ctxFor("mealmate");
    const out = await runSharkOnce(ctx, "market", "claude-sonnet-5-5", 1, new AbortController().signal);
    expect(out.agent).toBe("market");
    expect(calls).toHaveLength(2);
    expect(calls[0].tools?.length).toBe(5); // every Shark can see every tool
    const msgs = calls[1].messages as Array<{ role: string; content: unknown }>;
    expect(msgs.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(msgs[1].content).toEqual([
      { type: "tool_use", id: "toolu_mock_mealmate_market_1_1_0", name: "portfolio_lookup", input: {} },
      { type: "tool_use", id: "toolu_mock_mealmate_market_1_1_1", name: "market_size_lookup", input: {} },
    ]);
    const results = msgs[2].content as Array<{ type: string; tool_use_id: string; content: string; is_error?: boolean }>;
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({ type: "tool_result", tool_use_id: "toolu_mock_mealmate_market_1_1_0", content: "PERMISSION DENIED: portfolio_lookup requires portfolio access", is_error: true });
    expect(results[1].is_error).toBeUndefined();
    expect(JSON.parse(results[1].content)).toMatchObject({ sector: ctx.pitch.sector });
    expect(JSON.stringify(calls)).not.toContain("CONFIDENTIAL");
    // one agent_calls row, tokens summed over both turns
    expect(ctx.repo.agentCalls).toHaveLength(1);
    expect(ctx.repo.agentCalls[0]).toMatchObject({ input_tokens: 1800, output_tokens: 450, status: "ok", purpose: "analyze" });
  });

  it("thinking blocks are passed back unchanged and agent field is forced", async () => {
    const ctx = await ctxFor("brewbot");
    script = async (req) => (req.turn === 1 ? toolResp(["red_flag_scanner"], 1) : finalResp({ ...good, agent: "market" }));
    const out = await runSharkOnce(ctx, "skeptic", "claude-sonnet-5-5", 1, new AbortController().signal);
    expect(out.agent).toBe("skeptic");
    expect((calls[1].messages[1].content as Array<{ type: string }>)[0]).toEqual({ type: "thinking", thinking: "hmm", signature: "sig" });
  });

  it("budget exceeded: extra tool turn gets TOOL BUDGET EXHAUSTED (not executed), next turn must be final", async () => {
    const ctx = await ctxFor("brewbot");
    script = async (req) => (req.turn <= 2 ? toolResp(["red_flag_scanner"], req.turn) : finalResp(good));
    await runSharkOnce(ctx, "skeptic", "claude-sonnet-5-5", 1, new AbortController().signal);
    expect(calls).toHaveLength(3);
    const lastUser = calls[2].messages.at(-1)!.content as Array<{ content: string; is_error?: boolean }>;
    expect(lastUser[0]).toMatchObject({ content: BUDGET_EXHAUSTED, is_error: true });
    expect(ctx.repo.toolCalls).toHaveLength(1); // only the in-budget call executed
    expect(ctx.repo.agentCalls[0]).toMatchObject({ status: "ok", input_tokens: 30, output_tokens: 15 });
  });

  it("budget-exhausted turn still permission-checks: forbidden tool is denied, recorded and audited", async () => {
    const ctx = await ctxFor("brewbot");
    script = async (req) => (req.turn === 1 ? toolResp(["red_flag_scanner"], 1) : req.turn === 2 ? toolResp(["portfolio_lookup", "red_flag_scanner"], 2) : finalResp(good));
    await runSharkOnce(ctx, "skeptic", "claude-sonnet-5-5", 1, new AbortController().signal);
    const results = calls[2].messages.at(-1)!.content as Array<{ content: string; is_error?: boolean }>;
    expect(results[0]).toEqual(expect.objectContaining({ content: "PERMISSION DENIED: portfolio_lookup requires portfolio access", is_error: true }));
    expect(results[1]).toEqual(expect.objectContaining({ content: BUDGET_EXHAUSTED, is_error: true }));
    const denied = ctx.repo.toolCalls.filter((t) => !t.permitted);
    expect(denied).toHaveLength(1);
    expect(denied[0]).toMatchObject({ agent: "skeptic", tool: "portfolio_lookup", result: { error: "permission_denied" } });
    expect(ctx.repo.toolCalls.filter((t) => t.permitted)).toHaveLength(1); // exhausted permitted call not executed
    expect(ctx.repo.auditLog.filter((a) => a.action === "tool.denied")).toHaveLength(1);
  });

  it("an agent that keeps requesting tools after exhaustion errors with one agent_calls row", async () => {
    const ctx = await ctxFor("brewbot");
    script = async (req) => toolResp(["red_flag_scanner"], req.turn);
    await expect(runSharkOnce(ctx, "skeptic", "claude-sonnet-5-5", 1, new AbortController().signal)).rejects.toBeInstanceOf(AgentCallError);
    expect(calls).toHaveLength(3);
    expect(ctx.repo.agentCalls).toHaveLength(1);
    expect(ctx.repo.agentCalls[0].status).toBe("error");
  });

  it("schema_fail when output violates the contract", async () => {
    const ctx = await ctxFor("brewbot");
    script = async () => finalResp({ ...good, key_points: ["only one"] });
    await expect(runSharkOnce(ctx, "skeptic", "claude-sonnet-5-5", 1, new AbortController().signal)).rejects.toMatchObject({ status: "schema_fail" });
    expect(ctx.repo.agentCalls[0]).toMatchObject({ status: "schema_fail", error: expect.stringMatching(/key_points/) });
  });

  it("timeout records a timeout row", async () => {
    const ctx = await ctxFor("brewbot");
    const ac = new AbortController();
    script = async () => { ac.abort(); throw new Error("aborted"); };
    await expect(runSharkOnce(ctx, "skeptic", "claude-sonnet-5-5", 1, ac.signal)).rejects.toMatchObject({ status: "timeout" });
    expect(ctx.repo.agentCalls[0].status).toBe("timeout");
  });

  it("passes variant after_founder once the founder has answered", async () => {
    const ctx = await ctxFor("fitflow", ["We have revenue now."]);
    await runSharkOnce(ctx, "skeptic", "claude-sonnet-5-5", 1, new AbortController().signal);
    expect(calls.every((c) => c.variant === "after_founder")).toBe(true);
    const ctx2 = await ctxFor("fitflow");
    calls.length = 0;
    await runSharkOnce(ctx2, "skeptic", "claude-sonnet-5-5", 1, new AbortController().signal);
    expect(calls.every((c) => c.variant === undefined)).toBe(true);
  });
});
