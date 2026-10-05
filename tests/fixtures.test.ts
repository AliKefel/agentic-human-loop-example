import { describe, it, expect } from "vitest";
import { callLlm, LlmTimeoutError, type LlmRequest } from "@/lib/llm/client";
import type { AgentId, Purpose } from "@/lib/types";
import { SharkOutputSchema } from "@/lib/schemas";
import { SEED_PITCHES } from "@/lib/mock/seed-pitches";
import { SCRIPTED_FOUNDER_REPLY } from "@/lib/mock/fixtures";

const P = "claude-sonnet-5-5", H = "claude-haiku-4-5-20251001";
const call = (pitchSlug: string, agent: AgentId, attempt: number, turn: number, extra: Partial<LlmRequest> = {}) =>
  callLlm({ pitchSlug, agent, purpose: "analyze", system: "", messages: [], model: P, attempt, turn, ...extra });

it("every non-fast-pass pitch has a valid final fixture for every shark", async () => {
  for (const p of SEED_PITCHES.filter(p => p.slug !== "greengrid")) {
    for (const agent of ["market","finance","product","skeptic"] as const) {
      let attempt = 1, res;
      for (; attempt <= 4; attempt++) {
        try { res = await callLlm({ pitchSlug: p.slug, agent, purpose: "analyze", system: "", messages: [], model: "claude-sonnet-5-5", attempt, turn: 2 });
          const parsed = SharkOutputSchema.safeParse(JSON.parse(res.text)); if (parsed.success) break; } catch { /* timeout fixtures */ }
      }
      expect(attempt, `${p.slug}/${agent}`).toBeLessThanOrEqual(4);
    }
  }
});

describe("mockCall scripted chaos", () => {
  it("ledgerleaf finance attempt 1 times out", async () => {
    await expect(call("ledgerleaf", "finance", 1, 1)).rejects.toBeInstanceOf(LlmTimeoutError);
  });
  it("ledgerleaf finance fallback: tool_use then valid final", async () => {
    const t1 = await call("ledgerleaf", "finance", 4, 1, { model: H });
    expect(t1.toolUses.map(t => t.name)).toEqual(["valuation_calculator"]);
    const t2 = await call("ledgerleaf", "finance", 4, 2, { model: H });
    expect(SharkOutputSchema.safeParse(JSON.parse(t2.text)).success).toBe(true);
    expect(t2.model).toBe(H);
  });
  it("dronedrop product attempt 1 turn 2 is not JSON; attempt 2 is valid", async () => {
    const t1 = await call("dronedrop", "product", 1, 1);
    expect(t1.toolUses[0].name).toBe("comparable_deals_search");
    const bad = await call("dronedrop", "product", 1, 2);
    expect(() => JSON.parse(bad.text)).toThrow();
    const ok = await call("dronedrop", "product", 2, 2);
    expect(SharkOutputSchema.safeParse(JSON.parse(ok.text)).success).toBe(true);
  });
  it("mealmate market turn 1 requests portfolio_lookup and market_size_lookup", async () => {
    const r = await call("mealmate", "market", 1, 1);
    expect(r.toolUses.map(t => t.name)).toEqual(["portfolio_lookup", "market_size_lookup"]);
    expect(r.rawContent).toEqual(expect.arrayContaining([expect.objectContaining({ type: "tool_use", name: "portfolio_lookup" })]));
  });
  it("fitflow skeptic reports missing_data; after_founder variant does not", async () => {
    const before = JSON.parse((await call("fitflow", "skeptic", 1, 2)).text);
    expect(before.missing_data).toEqual(["revenue", "retention"]);
    const after = JSON.parse((await call("fitflow", "skeptic", 1, 2, { variant: "after_founder" })).text);
    expect(after.missing_data).toBeUndefined();
    expect(after.score).toBe(7);
  });
  it("lead purposes return JSON; greengrid fast-passes; thriftloop is heavy", async () => {
    const lead = (slug: string, purpose: string) => callLlm({ pitchSlug: slug, agent: "lead", purpose: purpose as Purpose, system: "", messages: [], model: P, attempt: 1, turn: 1 });
    const g = await lead("greengrid", "triage");
    expect(JSON.parse(g.text).fast_pass).toBe(true);
    const t = await lead("thriftloop", "triage");
    expect([t.inputTokens, t.outputTokens]).toEqual([24000, 1000]);
    const plan = JSON.parse((await lead("thriftloop", "plan")).text);
    expect(plan.sharks[0]).toBe("skeptic");
    expect(plan.tokens).toBeUndefined();
    const syn = JSON.parse((await lead("skinsync", "synthesize")).text);
    expect(syn.terms.amount).toBe(300000);
  });
  it("founder reply exported", () => expect(SCRIPTED_FOUNDER_REPLY.fitflow).toContain("1,150"));
});
