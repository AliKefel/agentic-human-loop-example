import type { Run, RunState } from "@/lib/types";

export function initialRunState(): RunState {
  return { shark_outputs: {}, shark_failures: {}, founder_asked: false, founder_answers: [], memories_used: [] };
}

/** Shallow-merges `partial` over run.state. Handlers use this instead of hand-spreading state. */
export function withState(run: Run, partial: Partial<RunState>): RunState {
  return { ...run.state, ...partial };
}

/** Full run snapshot per SPEC §2.3 (values after the step), including budget used. */
export function checkpointSnapshot(r: Run) {
  return {
    status: r.status, state: r.state, plan: r.plan, decision: r.decision, degraded: r.degraded,
    recommendation: r.recommendation, final_terms: r.final_terms,
    tokens_used: r.tokens_used, cost_usd: r.cost_usd, step_count: r.step_count, replans: r.replans,
  };
}
