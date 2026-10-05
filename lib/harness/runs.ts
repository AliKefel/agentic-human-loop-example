import { TERMINAL, WORKING, type Run, type User } from "@/lib/types";
import type { Repo } from "./repo";
import { actor } from "./audit";
import { ConflictError, ForbiddenError } from "./errors";
import { initialRunState } from "./run-state";

export async function createRun(
  repo: Repo,
  input: { pitchId: string; autonomyLevel?: 0 | 1 | 2 | 3; user: User },
): Promise<Run> {
  const pitch = await repo.getPitch(input.pitchId); // throws NotFoundError
  const config = await repo.getActiveConfig();
  const autonomy = (input.autonomyLevel ?? config.autonomy_level) as 0 | 1 | 2 | 3;
  const run = await repo.createRun({ pitch_id: pitch.id, config_version: config.version, autonomy_level: autonomy, started_by: input.user.id });
  await repo.addCheckpoint({ run_id: run.id, seq: 0, node: "queued", state: initialRunState(), duration_ms: 0 });
  await repo.audit({ ...actor(input.user), action: "run.created", entity: "run", entity_id: run.id, details: { pitch: pitch.slug, autonomy_level: autonomy, config_version: config.version } });
  return run;
}

const CAS_TRIES = 3;

/**
 * Cancels any non-terminal run (working or waiting). Bumping step_count invalidates any
 * in-flight advance, whose CAS then loses. A pending approval is rejected ("run cancelled").
 * Any role (analyst and up) may cancel. Terminal → ConflictError.
 */
export async function cancelRun(repo: Repo, runId: string, user: User): Promise<Run> {
  for (let i = 0; i < CAS_TRIES; i++) {
    const run = await repo.getRun(runId);
    if (TERMINAL.includes(run.status)) throw new ConflictError(`Run is already ${run.status}`);
    const updated = await repo.updateRun(runId, { status: "cancelled", step_count: run.step_count + 1, completed_at: new Date().toISOString() }, run.step_count);
    if (!updated) continue; // an advance committed in between: re-read and try again
    const approval = await repo.pendingApprovalForRun(runId);
    if (approval) await repo.decideApprovalRow(approval.id, { status: "rejected", decided_by: user.id, reason: "run cancelled", final_terms: null, is_override: false });
    await repo.audit({ ...actor(user), action: "run.cancelled", entity: "run", entity_id: runId, details: { from: run.status, ...(approval ? { approval_id: approval.id } : {}) } });
    return updated;
  }
  throw new ConflictError("Run is changing too quickly to cancel; try again");
}

/**
 * Resume from checkpoint (SPEC §2.3): GP only, failed runs only. Restores the last checkpoint
 * whose snapshot status is a WORKING status and continues from that node. Spend is never rolled
 * back: tokens_used / cost_usd keep the run's current totals (including the failed step).
 */
export async function resumeRun(repo: Repo, runId: string, user: User): Promise<Run> {
  if (user.role !== "general_partner") throw new ForbiddenError("Only a General Partner can resume a run");
  const run = await repo.getRun(runId);
  if (run.status !== "failed") throw new ConflictError(`Only failed runs can be resumed (run is ${run.status})`);
  if (run.error === "max_steps_exceeded") throw new ConflictError("cannot resume: max steps exceeded");
  const cp = await repo.lastCheckpoint(runId, { statusIn: WORKING });
  if (!cp) throw new ConflictError("No resumable checkpoint for this run");
  const s = cp.state as Pick<Run, "status" | "state" | "plan" | "decision" | "degraded" | "recommendation" | "final_terms" | "replans">;
  const updated = await repo.updateRun(
    runId,
    {
      status: s.status, state: s.state, plan: s.plan, decision: s.decision, degraded: s.degraded,
      recommendation: s.recommendation, final_terms: s.final_terms, replans: s.replans,
      error: null, completed_at: null, step_count: run.step_count + 1,
    },
    run.step_count,
  );
  if (!updated) throw new ConflictError("Run changed while resuming; try again");
  await repo.audit({ ...actor(user), action: "run.resumed", entity: "run", entity_id: runId, details: { from_seq: cp.seq } });
  return updated;
}
