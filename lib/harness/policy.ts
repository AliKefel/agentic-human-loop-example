/**
 * Deterministic policy engine (SPEC §2.8). PURE: no I/O, no LLM, no repo/next imports.
 * Rules are evaluated in order; the first match wins and its id is stored as `rule`.
 */
import type { RedFlag, SharkOutput, Synthesis } from "@/lib/schemas";
import type { AgentName, HarnessConfig, PolicyDecision, Role } from "@/lib/types";

export type PolicyInput = {
  autonomyLevel: 0 | 1 | 2 | 3;
  config: HarnessConfig;
  prescan: RedFlag[];
  outputs: Partial<Record<AgentName, SharkOutput>>;
  failures: Partial<Record<AgentName, string>>;
  degraded: boolean;
  founderAsked: boolean;
  synthesis: Synthesis;
};

const usd = (n: number) => `$${n.toLocaleString("en-US")}`;

/** ≤ partner_limit → partner, else general_partner. */
export function requiredRoleFor(amount: number, config: HarnessConfig): Role {
  return amount <= config.thresholds.partner_limit ? "partner" : "general_partner";
}

export function decide(i: PolicyInput): PolicyDecision {
  const t = i.config.thresholds;
  const present = Object.values(i.outputs).filter((o): o is SharkOutput => !!o);
  const scores = present.map((o) => o.score);
  const terms = i.synthesis.terms;
  const amount = terms?.amount ?? 0;
  const isPass = i.synthesis.recommendation === "pass";
  const roleByAmount = () => requiredRoleFor(amount, i.config); // amount 0 (no terms) → partner

  // 1. Escalate on any high-severity flag — every autonomy level.
  const high = [...i.prescan, ...present.flatMap((o) => o.red_flags ?? [])].filter((f) => f.severity === "high");
  if (high.length) {
    const codes = [...new Set(high.map((f) => f.code))].join(", ");
    return { outcome: "escalate", rule: "escalate.red_flag", required_role: "general_partner", explanation: `High-severity red flag (${codes}) — escalated to a General Partner.` };
  }

  // 2. Need info: Skeptic reports missing data and the founder has not been asked yet.
  const missing = i.outputs.skeptic?.missing_data ?? [];
  if (missing.length && !i.founderAsked) {
    return { outcome: "need_info", rule: "need_info.missing_data", explanation: `Skeptic Shark needs more data from the founder: ${missing.join(", ")}.` };
  }

  // 3. Exception: degraded run, or the Skeptic's view is missing entirely.
  if (i.degraded || !i.outputs.skeptic) {
    const failed = Object.entries(i.failures).map(([a, f]) => `${a} (${f})`).join(", ");
    const why = !i.outputs.skeptic ? "Skeptic Shark output is missing" : `run is degraded${failed ? `: ${failed}` : ""}`;
    return { outcome: "exception", rule: "exception.degraded", required_role: roleByAmount(), explanation: `Exception — ${why}. A human must review.` };
  }

  // 4. Exception: Sharks disagree.
  const spread = scores.length ? Math.max(...scores) - Math.min(...scores) : 0;
  if (spread >= t.disagreement_spread) {
    return { outcome: "exception", rule: "exception.disagreement", required_role: roleByAmount(), explanation: `Shark scores spread ${spread} (≥ ${t.disagreement_spread}) — the Sharks disagree.` };
  }

  // 5. By autonomy level.
  const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  const offer = terms ? `${usd(terms.amount)} for ${terms.equity_pct}%` : "no terms";
  switch (i.autonomyLevel) {
    case 0:
      return { outcome: "needs_approval", rule: "l0.human_decides", required_role: isPass ? "partner" : roleByAmount(), explanation: `L0 Human decides — a human makes the call on this ${isPass ? "pass" : `offer (${offer})`}.` };
    case 1:
      if (isPass) return { outcome: "auto_pass", rule: "l1.auto_pass", explanation: "L1 — Lead Shark recommends pass; passed automatically." };
      return { outcome: "needs_approval", rule: "l1.approval_required", required_role: roleByAmount(), explanation: `L1 Approval required — every offer (${offer}) needs a human approval.` };
    case 2: {
      if (isPass) return { outcome: "auto_pass", rule: "l2.auto_pass", explanation: "L2 — Lead Shark recommends pass; passed automatically." };
      const within = !!terms && terms.amount <= t.auto_max_amount && terms.equity_pct <= t.auto_max_equity && avg >= t.auto_min_score;
      if (within) return { outcome: "auto_send", rule: "l2.auto_send", explanation: `L2 — offer ${offer} within auto limits (≤ ${usd(t.auto_max_amount)}, ≤ ${t.auto_max_equity}%, avg score ${avg.toFixed(2)} ≥ ${t.auto_min_score}).` };
      return { outcome: "needs_approval", rule: "l2.over_threshold", required_role: roleByAmount(), explanation: `L2 — offer ${offer} (avg score ${avg.toFixed(2)}) exceeds auto-send limits (${usd(t.auto_max_amount)} / ${t.auto_max_equity}% / score ${t.auto_min_score}).` };
    }
    case 3:
      if (isPass) return { outcome: "auto_pass", rule: "l3.auto_pass", explanation: "L3 — Lead Shark recommends pass; passed automatically." };
      if (terms && terms.amount <= t.fund_max_check) return { outcome: "auto_send", rule: "l3.auto_send", explanation: `L3 Full auto — offer ${offer} ≤ fund max ${usd(t.fund_max_check)}.` };
      // Unreachable with clamped synthesis terms; kept as a safe default.
      return { outcome: "needs_approval", rule: "l3.over_fund_max", required_role: "general_partner", explanation: `L3 — offer ${offer} is not within the fund max check ${usd(t.fund_max_check)}.` };
  }
}
