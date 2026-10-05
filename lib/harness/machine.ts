import { PlanSchema, TriageSchema } from "@/lib/schemas";
import { TERMINAL, WORKING, type Run, type RunState, type RunStatus } from "@/lib/types";
import type { Repo } from "./repo";
import { SYSTEM } from "./audit";
import { callAgentJson, type StepCtx } from "./agent";
import { exceedsFundMax, prescan } from "./prescan";
import { buildPlanPrompt, buildTriagePrompt } from "./planner";

export type { StepCtx } from "./agent";
export type AdvanceResult = { status: "advanced" | "conflict" | "idle"; run: Run };
/**
 * A handler returns the next status and a patch; it never writes the run itself.
 * `effects` (optional) runs ONLY after advanceRun wins the CAS — after the checkpoint is
 * written and before the `run.step` audit — and never for a lost race. Use it for side
 * effects that must happen exactly once per committed step (approvals, incidents, messages).
 */
export type HandlerResult = { status: RunStatus; patch?: Partial<Run>; effects?: (committed: Run) => Promise<void> };
export type Handler = (ctx: StepCtx) => Promise<HandlerResult>;

const usd = (n: number) => `$${n.toLocaleString("en-US")}`;

/** Shallow-merges `partial` over run.state. Handlers use this instead of hand-spreading state. */
export function withState(run: Run, partial: Partial<RunState>): RunState {
  return { ...run.state, ...partial };
}

// ---------------------------------------------------------------------------
// Node handlers — one per WORKING status. Each returns the next status and a
// patch; it never writes the run itself (advanceRun owns the CAS + checkpoint).
// ---------------------------------------------------------------------------

const queued: Handler = async () => ({ status: "triage" });

const triage: Handler = async (ctx) => {
  const { pitch, config, run } = ctx;
  const flags = prescan(pitch); // deterministic, no LLM

  if (exceedsFundMax(pitch, config.thresholds.fund_max_check)) {
    const explanation = `Ask ${usd(pitch.ask_amount)} exceeds fund max check ${usd(config.thresholds.fund_max_check)}.`;
    return {
      status: "passed",
      patch: {
        state: withState(run, { prescan: flags, triage: { fast_pass: true, reason: explanation } }),
        recommendation: "pass",
        decision: { outcome: "auto_pass", rule: "triage.fast_pass", explanation },
      },
    };
  }

  const prompt = buildTriagePrompt(pitch, config);
  const t = await callAgentJson(ctx, { agent: "lead", purpose: "triage", ...prompt, schema: TriageSchema });
  const state = withState(run, { prescan: flags, triage: t });
  if (t.fast_pass) {
    const explanation = `Lead Shark triage: ${t.reason}`;
    return { status: "passed", patch: { state, recommendation: "pass", decision: { outcome: "auto_pass", rule: "triage.fast_pass", explanation } } };
  }
  return { status: "planning", patch: { state } };
};

const planning: Handler = async (ctx) => {
  const { pitch, config, run } = ctx;
  // Founder memories are injected here by the memory milestone (founderHistory); none in M2.
  const prompt = buildPlanPrompt(pitch, config, { prescan: run.state.prescan ?? [], founderHistory: [] });
  const plan = await callAgentJson(ctx, { agent: "lead", purpose: "plan", ...prompt, schema: PlanSchema }); // PlanSchema requires skeptic
  return { status: "analyzing", patch: { plan } };
};

// M3 replaces — temporary stub: parallel Sharks
const analyzingStub: Handler = async () => ({ status: "synthesizing" });
// M3 replaces — temporary stub: Lead Shark synthesis
const synthesizingStub: Handler = async () => ({ status: "policy_check" });
// M5 replaces — temporary stub: deterministic policy engine
const policyCheckStub: Handler = async () => ({
  status: "passed",
  patch: { decision: { outcome: "auto_pass", rule: "m2.stub", explanation: "M2 stub: policy engine not yet implemented (M5)." } },
});

export const HANDLERS: Partial<Record<RunStatus, Handler>> = {
  queued,
  triage,
  planning,
  analyzing: analyzingStub, // M3 replaces
  synthesizing: synthesizingStub, // M3 replaces
  policy_check: policyCheckStub, // M5 replaces
};

/** Full run snapshot per SPEC §2.3 (values after the step), including budget used. */
export function checkpointSnapshot(r: Run) {
  return {
    status: r.status, state: r.state, plan: r.plan, decision: r.decision, degraded: r.degraded,
    recommendation: r.recommendation, final_terms: r.final_terms,
    tokens_used: r.tokens_used, cost_usd: r.cost_usd, step_count: r.step_count, replans: r.replans,
  };
}

// ---------------------------------------------------------------------------
// advanceRun — exactly one transition per call, CAS on step_count.
// ---------------------------------------------------------------------------

async function failRun(repo: Repo, run: Run, error: string, extra: Partial<Run> = {}): Promise<AdvanceResult> {
  const updated = await repo.updateRun(run.id, { ...extra, status: "failed", error, step_count: run.step_count + 1, completed_at: new Date().toISOString() }, run.step_count);
  if (!updated) return { status: "conflict", run: await repo.getRun(run.id) };
  await repo.audit({ ...SYSTEM, action: "run.failed", entity: "run", entity_id: run.id, details: { from: run.status, error } });
  return { status: "advanced", run: updated };
}

export async function advanceRun(repo: Repo, runId: string): Promise<AdvanceResult> {
  const run = await repo.getRun(runId);
  if (!WORKING.includes(run.status)) return { status: "idle", run };

  const config = await repo.getConfig(run.config_version);
  if (run.step_count >= config.budgets.max_steps) {
    // Incident creation is added in M6.
    return failRun(repo, run, "max_steps_exceeded");
  }

  const handler = HANDLERS[run.status];
  if (!handler) return failRun(repo, run, `no handler for status ${run.status}`);

  const pitch = await repo.getPitch(run.pitch_id);
  const ctx: StepCtx = { repo, run, pitch, config, usage: { tokens: 0, cost: 0 } };
  const t0 = Date.now();
  const usageTotals = () => ({ tokens_used: run.tokens_used + ctx.usage.tokens, cost_usd: +(run.cost_usd + ctx.usage.cost).toFixed(6) });

  let result: HandlerResult;
  try {
    result = await handler(ctx);
  } catch (e) {
    // M4 adds retries/fallback; in M2 any handler error fails the run.
    return failRun(repo, run, e instanceof Error ? e.message : String(e), usageTotals());
  }

  const updated = await repo.updateRun(
    run.id,
    {
      ...result.patch,
      status: result.status,
      step_count: run.step_count + 1,
      ...usageTotals(),
      completed_at: TERMINAL.includes(result.status) ? new Date().toISOString() : null,
    },
    run.step_count,
  );
  // Lost the CAS: another advance (or a cancel, which bumps step_count) won. Write nothing.
  if (!updated) return { status: "conflict", run: await repo.getRun(run.id) };

  const duration_ms = Date.now() - t0;
  await repo.addCheckpoint({
    run_id: run.id,
    seq: run.step_count + 1,
    node: run.status,
    state: checkpointSnapshot(updated),
    duration_ms,
  });
  if (result.effects) {
    try {
      await result.effects(updated);
    } catch (e) {
      // The step is already committed; record the failure rather than un-committing (M4 hardens this).
      console.error(`run ${run.id}: effects for ${run.status} failed`, e);
      await repo.audit({ ...SYSTEM, action: "run.effects_failed", entity: "run", entity_id: run.id, details: { node: run.status, error: e instanceof Error ? e.message : String(e) } });
    }
  }
  await repo.audit({ ...SYSTEM, action: "run.step", entity: "run", entity_id: run.id, details: { from: run.status, to: updated.status, duration_ms } });
  return { status: "advanced", run: updated };
}

/** Advances until the run leaves WORKING (or is idle). Conflicts are retried. Used by tests and the demo script. */
export async function runToRest(repo: Repo, runId: string, maxIterations = 50): Promise<Run> {
  let run = await repo.getRun(runId);
  for (let i = 0; i < maxIterations; i++) {
    const r = await advanceRun(repo, runId);
    run = r.run;
    if (r.status === "idle" || !WORKING.includes(run.status)) return run;
  }
  return run;
}
