import { describe, it, expect } from "vitest";
import { PlanSchema, SharkOutputSchema, SynthesisSchema } from "@/lib/schemas";
import { costUsd } from "@/lib/llm/pricing";
import { money, pct, duration, usd } from "@/lib/format";

const shark = { agent: "market", score: 7, confidence: 0.8, verdict: "invest", key_points: ["a", "b"] };

describe("schemas", () => {
  it("plan requires skeptic", () => {
    const base = { questions: {}, tool_budget: { market: 2 }, rationale: "r" };
    expect(PlanSchema.safeParse({ ...base, sharks: ["market"] }).success).toBe(false);
    expect(PlanSchema.safeParse({ ...base, sharks: ["market", "skeptic"] }).success).toBe(true);
  });
  it("shark output bounds", () => {
    expect(SharkOutputSchema.safeParse(shark).success).toBe(true);
    expect(SharkOutputSchema.safeParse({ ...shark, score: 11 }).success).toBe(false);
    expect(SharkOutputSchema.safeParse({ ...shark, key_points: ["a"] }).success).toBe(false);
  });
  it("synthesis allows null terms", () => {
    expect(SynthesisSchema.safeParse({ recommendation: "pass", terms: null, summary: "s", disagreements: [] }).success).toBe(true);
  });
});

describe("pricing and format", () => {
  it("costUsd", () => {
    expect(costUsd("claude-sonnet-5-5", 1_000_000, 1_000_000)).toBe(12);
    expect(costUsd("claude-haiku-4-5", 1_000_000, 1_000_000)).toBe(6);
    expect(costUsd("claude-haiku-4-5-20251001", 1_000_000, 0)).toBe(1);
  });
  it("format", () => {
    expect(money(120000)).toBe("$120K");
    expect(money(2_500_000)).toBe("$2.5M");
    expect(money(950)).toBe("$950");
    expect(pct(12)).toBe("12%");
    expect(duration(65_000)).toBe("1m 05s");
    expect(duration(2 * 3600_000 + 3 * 60_000)).toBe("2h 03m");
    expect(usd(0.0123)).toBe("$0.0123");
  });
});
