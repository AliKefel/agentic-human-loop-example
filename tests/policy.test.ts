import { describe, expect, it } from "vitest";
import { decide, requiredRoleFor, type PolicyInput } from "@/lib/harness/policy";
import { CONFIG_V1 } from "@/lib/mock/seed-config";
import type { RedFlag, SharkOutput, Synthesis } from "@/lib/schemas";
import type { AgentName } from "@/lib/types";

const out = (agent: AgentName, score: number, extra: Partial<SharkOutput> = {}): SharkOutput => ({
  agent, score, confidence: 0.8, verdict: score >= 6 ? "invest" : "pass", key_points: ["a", "b"], ...extra,
});
const outputs = (m: number, f: number, p: number, s: number, skeptic: Partial<SharkOutput> = {}) => ({
  market: out("market", m), finance: out("finance", f), product: out("product", p), skeptic: out("skeptic", s, skeptic),
});
const invest = (amount: number, equity_pct: number): Synthesis => ({ recommendation: "invest", terms: { amount, equity_pct }, summary: "s", disagreements: [] });
const pass: Synthesis = { recommendation: "pass", terms: null, summary: "s", disagreements: [] };
const high: RedFlag = { code: "prompt_injection", severity: "high", detail: "x" };

function input(over: Partial<PolicyInput> = {}): PolicyInput {
  return {
    autonomyLevel: 2, config: CONFIG_V1, prescan: [], outputs: outputs(8, 8, 7, 7), failures: {},
    degraded: false, founderAsked: false, synthesis: invest(120000, 10), ...over,
  };
}

type Case = { name: string; in: Partial<PolicyInput>; outcome: string; rule: string; role?: string };

const cases: Case[] = [
  // 1. escalate — every level
  { name: "high prescan flag at L2", in: { prescan: [high] }, outcome: "escalate", rule: "escalate.red_flag", role: "general_partner" },
  { name: "high prescan flag at L3", in: { autonomyLevel: 3, prescan: [high] }, outcome: "escalate", rule: "escalate.red_flag", role: "general_partner" },
  { name: "high prescan flag at L0", in: { autonomyLevel: 0, prescan: [high] }, outcome: "escalate", rule: "escalate.red_flag", role: "general_partner" },
  { name: "high shark red flag at L1", in: { autonomyLevel: 1, outputs: outputs(8, 8, 7, 7, { red_flags: [{ code: "inconsistent_financials", severity: "high", detail: "d" }] }) }, outcome: "escalate", rule: "escalate.red_flag", role: "general_partner" },
  { name: "escalate beats need_info and degraded", in: { prescan: [high], degraded: true, outputs: outputs(8, 8, 7, 7, { missing_data: ["revenue"] }) }, outcome: "escalate", rule: "escalate.red_flag", role: "general_partner" },
  { name: "medium flags do not escalate", in: { prescan: [{ code: "x", severity: "medium", detail: "" }] }, outcome: "auto_send", rule: "l2.auto_send" },
  // 2. need_info
  { name: "skeptic missing_data", in: { outputs: outputs(8, 8, 7, 7, { missing_data: ["revenue", "retention"] }) }, outcome: "need_info", rule: "need_info.missing_data" },
  { name: "missing_data after founder asked → not need_info", in: { founderAsked: true, outputs: outputs(8, 8, 7, 7, { missing_data: ["revenue"] }) }, outcome: "auto_send", rule: "l2.auto_send" },
  { name: "empty missing_data → not need_info", in: { outputs: outputs(8, 8, 7, 7, { missing_data: [] }) }, outcome: "auto_send", rule: "l2.auto_send" },
  // 3. exception.degraded
  { name: "degraded run", in: { degraded: true, failures: { product: "skipped_budget" } }, outcome: "exception", rule: "exception.degraded", role: "partner" },
  { name: "degraded run over partner limit → GP", in: { degraded: true, synthesis: invest(500000, 5) }, outcome: "exception", rule: "exception.degraded", role: "general_partner" },
  { name: "skeptic absent from outputs", in: { outputs: { market: out("market", 8), finance: out("finance", 8) } }, outcome: "exception", rule: "exception.degraded", role: "partner" },
  { name: "degraded pass → min partner", in: { degraded: true, synthesis: pass }, outcome: "exception", rule: "exception.degraded", role: "partner" },
  // 4. exception.disagreement
  { name: "spread exactly 5 → exception", in: { outputs: outputs(9, 7, 7, 4) }, outcome: "exception", rule: "exception.disagreement", role: "partner" },
  { name: "spread 6 → exception", in: { outputs: outputs(9, 6, 7, 3) }, outcome: "exception", rule: "exception.disagreement", role: "partner" },
  { name: "spread 4.9 → no exception", in: { outputs: outputs(9, 9, 9, 4.1) }, outcome: "auto_send", rule: "l2.auto_send" },
  // 5. L0
  { name: "L0 invest small → partner", in: { autonomyLevel: 0 }, outcome: "needs_approval", rule: "l0.human_decides", role: "partner" },
  { name: "L0 invest large → GP", in: { autonomyLevel: 0, synthesis: invest(250001, 5) }, outcome: "needs_approval", rule: "l0.human_decides", role: "general_partner" },
  { name: "L0 pass → partner", in: { autonomyLevel: 0, synthesis: pass }, outcome: "needs_approval", rule: "l0.human_decides", role: "partner" },
  // L1
  { name: "L1 pass → auto_pass", in: { autonomyLevel: 1, synthesis: pass }, outcome: "auto_pass", rule: "l1.auto_pass" },
  { name: "L1 invest → approval (partner)", in: { autonomyLevel: 1 }, outcome: "needs_approval", rule: "l1.approval_required", role: "partner" },
  { name: "L1 invest $250,000 → partner", in: { autonomyLevel: 1, synthesis: invest(250000, 10) }, outcome: "needs_approval", rule: "l1.approval_required", role: "partner" },
  { name: "L1 invest $500K → GP", in: { autonomyLevel: 1, synthesis: invest(500000, 5) }, outcome: "needs_approval", rule: "l1.approval_required", role: "general_partner" },
  // L2
  { name: "L2 pass → auto_pass", in: { synthesis: pass }, outcome: "auto_pass", rule: "l2.auto_pass" },
  { name: "L2 boundary 150000 / 15 / avg 7 → auto_send", in: { synthesis: invest(150000, 15), outputs: outputs(7, 7, 7, 7) }, outcome: "auto_send", rule: "l2.auto_send" },
  { name: "L2 amount 150001 → over_threshold", in: { synthesis: invest(150001, 15), outputs: outputs(7, 7, 7, 7) }, outcome: "needs_approval", rule: "l2.over_threshold", role: "partner" },
  { name: "L2 equity 15.1 → over_threshold", in: { synthesis: invest(150000, 15.1) }, outcome: "needs_approval", rule: "l2.over_threshold", role: "partner" },
  { name: "L2 avg 6.75 → over_threshold", in: { outputs: outputs(7, 7, 7, 6) }, outcome: "needs_approval", rule: "l2.over_threshold", role: "partner" },
  { name: "L2 $500K → GP", in: { synthesis: invest(500000, 5) }, outcome: "needs_approval", rule: "l2.over_threshold", role: "general_partner" },
  // L3
  { name: "L3 pass → auto_pass", in: { autonomyLevel: 3, synthesis: pass }, outcome: "auto_pass", rule: "l3.auto_pass" },
  { name: "L3 $2M → auto_send", in: { autonomyLevel: 3, synthesis: invest(2000000, 20) }, outcome: "auto_send", rule: "l3.auto_send" },
  { name: "L3 $500K → auto_send", in: { autonomyLevel: 3, synthesis: invest(500000, 5) }, outcome: "auto_send", rule: "l3.auto_send" },
];

describe("decide (SPEC §2.8)", () => {
  it.each(cases)("$name → $rule", (c) => {
    const d = decide(input(c.in));
    expect(d.outcome).toBe(c.outcome);
    expect(d.rule).toBe(c.rule);
    if (c.role) expect(d.required_role).toBe(c.role);
    else expect(d.required_role).toBeUndefined();
    expect(d.explanation.length).toBeGreaterThan(0);
  });

  it("covers every rule id", () => {
    const ids = new Set(cases.map((c) => c.rule));
    for (const id of [
      "escalate.red_flag", "need_info.missing_data", "exception.degraded", "exception.disagreement",
      "l0.human_decides", "l1.auto_pass", "l1.approval_required", "l2.auto_pass", "l2.auto_send", "l2.over_threshold", "l3.auto_pass", "l3.auto_send",
    ]) expect(ids.has(id), id).toBe(true);
  });

  it("is pure: same input, same output; input not mutated", () => {
    const i = input({ outputs: outputs(9, 7, 7, 4) });
    const snapshot = structuredClone(i);
    expect(decide(i)).toEqual(decide(i));
    expect(i).toEqual(snapshot);
  });
});

describe("requiredRoleFor", () => {
  it("≤ partner_limit → partner, else general_partner", () => {
    expect(requiredRoleFor(250000, CONFIG_V1)).toBe("partner");
    expect(requiredRoleFor(250001, CONFIG_V1)).toBe("general_partner");
    expect(requiredRoleFor(0, CONFIG_V1)).toBe("partner");
  });
});
