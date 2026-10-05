import { describe, it, expect } from "vitest";
import { runTool, scanRedFlags } from "@/lib/tools";
import { pitchFixture } from "./helpers";

describe("tools", () => {
  it("valuation_calculator computes implied valuation and revenue multiple", () => {
    const r = runTool("valuation_calculator", {}, pitchFixture("brewbot")) as { implied_valuation: number; revenue_multiple: number | null };
    expect(r.implied_valuation).toBe(1_200_000);
    expect(r.revenue_multiple).toBeCloseTo(2.5);
  });
  it("red flags: moonmint revenue mismatch is high", () => {
    expect(scanRedFlags(pitchFixture("moonmint"))).toContainEqual(expect.objectContaining({ code: "inconsistent_financials", severity: "high" }));
  });
  it("red flags: skinsync prompt injection is high", () => {
    expect(scanRedFlags(pitchFixture("skinsync"))).toContainEqual(expect.objectContaining({ code: "prompt_injection", severity: "high" }));
  });
  it("red flags: brewbot is clean", () => {
    expect(scanRedFlags(pitchFixture("brewbot")).filter(f => f.severity === "high")).toEqual([]);
  });
  it("red flags: parses claimed revenue from text when column is null", () => {
    const p = { ...pitchFixture("brewbot"), claimed_revenue: null, revenue: 48000, pitch_text: "We hit $5M in annual revenue." };
    expect(scanRedFlags(p)).toContainEqual(expect.objectContaining({ code: "inconsistent_financials", severity: "high" }));
  });
  it("portfolio_lookup returns confidential holdings for the sector", () => {
    const r = runTool("portfolio_lookup", {}, pitchFixture("brewbot")) as unknown[];
    expect(r.length).toBeGreaterThan(0);
  });
});
