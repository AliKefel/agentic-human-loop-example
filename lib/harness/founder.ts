import type { Run, User } from "@/lib/types";
import type { Repo } from "./repo";
import { SYSTEM, actor } from "./audit";
import { ConflictError, ValidationError } from "./errors";
import { checkpointSnapshot, withState } from "./run-state";

/**
 * Founder Q&A (SPEC §2.10). need_info → awaiting_founder with a to_founder message; a human
 * (any role, analyst and up) answers as the founder; the run returns to analyzing and only the
 * Skeptic and Finance Shark rerun. Nothing is held in memory: the run may wait for days.
 */

export const FOUNDER_RERUN = ["skeptic", "finance"] as const;
export const MAX_ANSWER_CHARS = 4000;

/** The Lead Shark's question template for missing data. */
export function founderQuestion(missing: string[]): string {
  return `Before we can decide, please share: ${missing.join(", ")}.`;
}

/** Stores the Lead Shark's question (direction to_founder) and audits founder.asked. */
export async function askFounder(repo: Repo, run: Run, question: string): Promise<void> {
  await repo.addFounderMessage({ run_id: run.id, direction: "to_founder", body: question, author_id: null });
  await repo.audit({ ...SYSTEM, action: "founder.asked", entity: "run", entity_id: run.id, details: { question } });
}

/**
 * Answer as founder. Order: validate → status check → run CAS (+1 step; answer appended,
 * rerun skeptic+finance, status analyzing) → from_founder message → checkpoint → audit.
 * The message is written only after the CAS wins, so a concurrent answer or cancel writes nothing.
 */
export async function answerFounder(repo: Repo, runId: string, user: User, body: string): Promise<Run> {
  const answer = (body ?? "").trim();
  if (!answer) throw new ValidationError("The founder's answer cannot be empty");
  if (answer.length > MAX_ANSWER_CHARS) throw new ValidationError(`The answer must be at most ${MAX_ANSWER_CHARS} characters`);
  const run = await repo.getRun(runId);
  if (run.status !== "awaiting_founder") throw new ConflictError(`Run is ${run.status}, not awaiting_founder`);

  const state = withState(run, { founder_answers: [...run.state.founder_answers, answer], rerun: [...FOUNDER_RERUN], founder_asked: true });
  const updated = await repo.updateRun(run.id, { status: "analyzing", state, step_count: run.step_count + 1 }, run.step_count);
  if (!updated) throw new ConflictError("The run changed while answering (was it cancelled or already answered?)");

  await repo.addFounderMessage({ run_id: run.id, direction: "from_founder", body: answer, author_id: user.id });
  await repo.addCheckpoint({ run_id: run.id, seq: run.step_count + 1, node: "founder.answered", state: checkpointSnapshot(updated), duration_ms: 0 });
  await repo.audit({ ...actor(user), action: "founder.answered", entity: "run", entity_id: run.id, details: { chars: answer.length, rerun: [...FOUNDER_RERUN] } });
  return updated;
}
