/**
 * What-if simulator (SPEC §5.6). PURE and client-safe: re-runs the deterministic policy engine
 * over stored Shark outputs with a (draft) config. Runs that never reached synthesis (e.g. a
 * triage fast-pass) cannot be re-decided and are counted as `skipped`.
 */
import { decide } from "@/lib/harness/policy";
import type { HarnessConfig, PolicyOutcome, Run } from "@/lib/types";

export type SimSummary = {
  auto_send: number; auto_pass: number; needs_approval: number; exception: number; escalate: number; need_info: number;
  /** Estimated human hours: approval 15 min, exception 30, escalation 60, founder question 15. */
  humanHours: number;
  /** Σ synthesis.terms.amount over auto_send outcomes. */
  capitalAuto: number;
  /** Runs re-decided / runs skipped (no synthesis). */
  runs: number; skipped: number;
};

export type SimRun = Pick<Run, "state" | "degraded">;

export const SIM_HOURS = { needs_approval: 0.25, exception: 0.5, escalate: 1, need_info: 0.25 } as const satisfies Partial<Record<PolicyOutcome, number>>;

export function emptySummary(): SimSummary {
  return { runs: 0, skipped: 0, auto_send: 0, auto_pass: 0, needs_approval: 0, exception: 0, escalate: 0, need_info: 0, humanHours: 0, capitalAuto: 0 };
}

export function simulate(runs: SimRun[], config: HarnessConfig, autonomyLevel: number): SimSummary {
  const s = emptySummary();
  const level = Math.min(3, Math.max(0, Math.round(autonomyLevel))) as 0 | 1 | 2 | 3;
  for (const r of runs) {
    const st = r.state;
    const synthesis = st?.synthesis;
    if (!synthesis) { s.skipped++; continue; }
    // state.founder_asked flips to true *after* a need_info decision, so it does not say whether the founder
    // had been asked when the stored outputs were decided. The founder thread does: answers exist only
    // once the founder was asked and the Sharks re-ran with the reply.
    const founderAsked = (st.founder_answers?.length ?? 0) > 0;
    const d = decide({
      autonomyLevel: level, config, synthesis, degraded: r.degraded,
      prescan: st.prescan ?? [], outputs: st.shark_outputs ?? {}, failures: st.shark_failures ?? {}, founderAsked,
    });
    s.runs++;
    s[d.outcome]++;
    s.humanHours += (SIM_HOURS as Partial<Record<PolicyOutcome, number>>)[d.outcome] ?? 0;
    if (d.outcome === "auto_send") s.capitalAuto += synthesis.terms?.amount ?? 0;
  }
  s.humanHours = Math.round(s.humanHours * 100) / 100;
  return s;
}
