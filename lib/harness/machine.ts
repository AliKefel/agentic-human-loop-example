import { PlanSchema, TriageSchema } from "@/lib/schemas";
import { TERMINAL, WORKING, type ApprovalRow, type PolicyOutcome, type Run, type RunStatus } from "@/lib/types";
import type { Repo } from "./repo";
import { SYSTEM } from "./audit";
import { RUN_CANCELLED_REASON } from "./queue-stats";
import { callAgentJson, type StepCtx } from "./agent";
import { exceedsFundMax, prescan } from "./prescan";
import { buildPlanPrompt, buildTriagePrompt } from "./planner";
import { runSharks } from "./sharks";
import { synthesize } from "./synthesis";
import { decide } from "./policy";
import { checkpointSnapshot, withState } from "./run-state";
import { memoriesForPlanning, memoriesForSynthesis, mergeMemoryIds, rememberOutcome } from "./memory";
import { askFounder, founderQuestion } from "./founder";
import { openEscalationIncident, openFailureIncident } from "./incidents";

export type { StepCtx } from "./agent";
export { checkpointSnapshot, withState } from "./run-state";
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
  const memories = await memoriesForPlanning(ctx.repo, pitch); // founder history, recorded in state.memories_used
  const prompt = buildPlanPrompt(pitch, config, { prescan: run.state.prescan ?? [], founderHistory: memories });
  const plan = await callAgentJson(ctx, { agent: "lead", purpose: "plan", ...prompt, schema: PlanSchema }); // PlanSchema requires skeptic
  return { status: "analyzing", patch: { plan, state: withState(run, { memories_used: mergeMemoryIds(run.state.memories_used, memories) }) } };
};

const analyzing: Handler = async (ctx) => {
  const { run } = ctx;
  if (!run.plan) throw new Error("analyzing without a plan");
  const agents = run.state.rerun ?? run.plan.sharks; // replan / founder answer reruns only the named Sharks
  const results = await runSharks(ctx, agents);
  const shark_outputs = { ...run.state.shark_outputs };
  const shark_failures = { ...run.state.shark_failures };
  for (const r of results) {
    if (r.output) {
      shark_outputs[r.agent] = r.output;
      delete shark_failures[r.agent];
    } else {
      shark_failures[r.agent] = r.failure ?? "failed";
      delete shark_outputs[r.agent];
    }
  }
  const degraded = Object.keys(shark_failures).length > 0;
  return { status: "synthesizing", patch: { state: withState(run, { shark_outputs, shark_failures, rerun: undefined }), degraded } };
};

const synthesizing: Handler = async (ctx) => {
  const memories = await memoriesForSynthesis(ctx.repo, ctx.pitch); // firm memories, same sector
  const synthesis = await synthesize(ctx, memories); // terms already clamped to ask / fund max
  return { status: "policy_check", patch: { state: withState(ctx.run, { synthesis, memories_used: mergeMemoryIds(ctx.run.state.memories_used, memories) }), recommendation: synthesis.recommendation } };
};
/** Run status and approval kind for each policy outcome (SPEC §2.8 / §2.9). */
const OUTCOME_MAP: Record<PolicyOutcome, { status: RunStatus; kind?: ApprovalRow["kind"] }> = {
  auto_send: { status: "offer_sent" },
  auto_pass: { status: "passed" },
  needs_approval: { status: "awaiting_approval", kind: "approval" },
  exception: { status: "in_review", kind: "exception" },
  escalate: { status: "escalated", kind: "escalation" }, // + incident (effects)
  need_info: { status: "awaiting_founder" }, // + to_founder message (effects)
};

const policyCheck: Handler = async (ctx) => {
  const { run, config, repo, pitch } = ctx;
  const synthesis = run.state.synthesis;
  if (!synthesis) throw new Error("policy_check without a synthesis");
  const decision = decide({
    autonomyLevel: run.autonomy_level, config, prescan: run.state.prescan ?? [], outputs: run.state.shark_outputs,
    failures: run.state.shark_failures, degraded: run.degraded, founderAsked: run.state.founder_asked, synthesis,
  });
  const { status, kind } = OUTCOME_MAP[decision.outcome];
  const patch: Partial<Run> = { decision, ...(decision.outcome === "auto_send" ? { final_terms: synthesis.terms } : {}) };
  // Mark the question as asked in the committed state (not in effects) so the next policy pass never re-asks.
  if (decision.outcome === "need_info") patch.state = withState(run, { founder_asked: true });

  const effects = async (committed: Run) => {
    await repo.audit({ ...SYSTEM, action: "policy.decided", entity: "run", entity_id: run.id, details: { rule: decision.rule, outcome: decision.outcome } });
    if (decision.outcome === "auto_send") {
      await repo.audit({ ...SYSTEM, action: "offer.sent", entity: "run", entity_id: run.id, details: { terms: committed.final_terms, rule: decision.rule } });
    }
    if (decision.outcome === "need_info") {
      // Same guard as approvals: never ask the founder on a run a cancel already moved.
      if ((await repo.getRun(run.id)).status !== status) return;
      await askFounder(repo, committed, founderQuestion(run.state.shark_outputs.skeptic?.missing_data ?? []));
      return;
    }
    if (!kind) return;
    // A cancel may have landed after the CAS: never open an approval on a run that is no longer waiting for it.
    if ((await repo.getRun(run.id)).status !== status) return;
    const required_role = decision.required_role ?? "partner";
    const approval = await repo.addApproval({
      run_id: run.id, kind, required_role, rule_fired: decision.rule, ai_recommendation: synthesis.recommendation,
      original_terms: synthesis.terms, sla_due: new Date(Date.now() + config.thresholds.sla_hours[kind] * 3600e3).toISOString(),
    });
    // Close the race window: if a cancel landed while inserting, it could not see this row — close it ourselves.
    if ((await repo.getRun(run.id)).status !== status) {
      await repo.decideApprovalRow(approval.id, { status: "rejected", decided_by: null, reason: RUN_CANCELLED_REASON, final_terms: null, is_override: false });
      return;
    }
    await repo.audit({ ...SYSTEM, action: "approval.requested", entity: "approval", entity_id: approval.id, details: { kind, required_role, rule: decision.rule } });
    if (decision.outcome === "escalate") {
      const flags = [...(run.state.prescan ?? []), ...Object.values(run.state.shark_outputs).flatMap((o) => o?.red_flags ?? [])];
      await openEscalationIncident(repo, committed, pitch, flags);
    }
  };
  return { status, patch, effects };
};

export const HANDLERS: Partial<Record<RunStatus, Handler>> = {
  queued,
  triage,
  planning,
  analyzing,
  synthesizing,
  policy_check: policyCheck,
};

// ---------------------------------------------------------------------------
// advanceRun — exactly one transition per call, CAS on step_count.
// ---------------------------------------------------------------------------

type Usage = StepCtx["usage"];
const NO_USAGE: Usage = { tokens: 0, cost: 0 };

/**
 * A step that lost the CAS may still have spent tokens. Adds that usage to the run without
 * bumping step_count (re-read + CAS on the current step_count, up to 3 tries) so budget
 * accounting never undercounts.
 */
async function addLoserUsage(repo: Repo, runId: string, usage: Usage): Promise<void> {
  if (usage.tokens <= 0 && usage.cost <= 0) return;
  for (let i = 0; i < 3; i++) {
    const cur = await repo.getRun(runId);
    const ok = await repo.updateRun(runId, { tokens_used: cur.tokens_used + usage.tokens, cost_usd: +(cur.cost_usd + usage.cost).toFixed(6) }, cur.step_count);
    if (ok) return;
  }
  console.warn(`run ${runId}: could not record ${usage.tokens} tokens from a lost step after 3 tries`);
}

const lost = async (repo: Repo, runId: string, usage: Usage): Promise<AdvanceResult> => {
  await addLoserUsage(repo, runId, usage);
  return { status: "conflict", run: await repo.getRun(runId) };
};

async function failRun(repo: Repo, run: Run, error: string, usage: Usage = NO_USAGE): Promise<AdvanceResult> {
  const totals = { tokens_used: run.tokens_used + usage.tokens, cost_usd: +(run.cost_usd + usage.cost).toFixed(6) };
  const updated = await repo.updateRun(run.id, { ...totals, status: "failed", error, step_count: run.step_count + 1, completed_at: new Date().toISOString() }, run.step_count);
  if (!updated) return lost(repo, run.id, usage); // lost CAS → no incident: someone else moved the run
  await repo.audit({ ...SYSTEM, action: "run.failed", entity: "run", entity_id: run.id, details: { from: run.status, error } });
  try {
    await openFailureIncident(repo, updated, await repo.getPitch(run.pitch_id), run.status);
  } catch (e) {
    // The failure is already committed; never let incident creation mask it.
    console.error(`run ${run.id}: could not open failure incident`, e);
  }
  return { status: "advanced", run: updated };
}

export async function advanceRun(repo: Repo, runId: string): Promise<AdvanceResult> {
  const run = await repo.getRun(runId);
  if (!WORKING.includes(run.status)) return { status: "idle", run };

  const config = await repo.getConfig(run.config_version);
  if (run.step_count >= config.budgets.max_steps) {
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
    // Lead and Shark LLM calls already retried / fell back inside the handler (reliability.ts); anything
    // that still escapes a handler is unrecoverable for this step and fails the run.
    return failRun(repo, run, e instanceof Error ? e.message : String(e), ctx.usage);
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
  // Lost the CAS: another advance (or a cancel, which bumps step_count) won. Write nothing
  // of this step's results — only its token spend, so the budget never undercounts.
  if (!updated) return lost(repo, run.id, ctx.usage);

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
      // The step is already committed; record the failure rather than un-committing.
      console.error(`run ${run.id}: effects for ${run.status} failed`, e);
      await repo.audit({ ...SYSTEM, action: "run.effects_failed", entity: "run", entity_id: run.id, details: { node: run.status, error: e instanceof Error ? e.message : String(e) } });
    }
  }
  if (updated.status === "offer_sent" || updated.status === "passed") {
    try {
      await rememberOutcome(repo, updated, pitch);
    } catch (e) {
      console.error(`run ${run.id}: could not write outcome memory`, e);
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
