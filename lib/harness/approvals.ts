import type { AgentName, ApprovalRow, Run, RunStatus, Terms, User } from "@/lib/types";
import type { Repo } from "./repo";
import { actor } from "./audit";
import { canAct } from "./authority";
import { ConflictError, ForbiddenError, ValidationError } from "./errors";
import { rememberOutcome, rememberOverride } from "./memory";
import { checkpointSnapshot } from "./run-state";

export { canAct } from "./authority";

export type ApprovalAction = { type: "approve" } | { type: "modify"; terms: Terms } | { type: "reject" } | { type: "replan"; agents: AgentName[] };

/** The waiting run status each approval kind belongs to (SPEC §2.9). */
export const WAITING_FOR_KIND: Record<ApprovalRow["kind"], RunStatus> = {
  approval: "awaiting_approval",
  exception: "in_review",
  escalation: "escalated",
};

const SHARKS: AgentName[] = ["market", "finance", "product", "skeptic"];
const STATUS_FOR: Record<ApprovalAction["type"], Exclude<ApprovalRow["status"], "pending">> = {
  approve: "approved", modify: "modified", reject: "rejected", replan: "replanned",
};

/**
 * A human decision on a pending approval. Order: conflict check → authority (server-side,
 * audited on deny) → reason → action validation → RUN CAS (+1 step, must still be at the step
 * we read in the matching waiting status) → approval-row CAS → checkpoint → audit.
 *
 * Why the run CAS goes first: it serializes deciders (and cancels, which also bump step_count).
 * If it loses, nothing has been written and the caller gets a ConflictError. Once it wins, the
 * decision is committed; the approval CAS should then always succeed. If it does not (an
 * out-of-band write), we audit `approval.decide_inconsistent` instead of `approval.<status>`.
 * A TERMINAL outcome rolls forward (the run is already offer_sent/passed); a non-terminal one
 * (replan) cannot, so the caller gets a ConflictError even though the run has moved.
 * After a decision wins, memory is written: a firm memory on an override, a founder memory on a terminal outcome.
 *
 * AI "pass" approvals (L0 pass, or an escalation/exception the AI would pass): Approve confirms
 * the pass (→ passed, not an override); Modify overrides with terms (→ offer_sent, override);
 * Reject is not offered (ValidationError) since there is no offer to reject.
 */
export async function decideApproval(repo: Repo, approvalId: string, user: User, action: ApprovalAction, reason: string | null): Promise<Run> {
  const approval = await repo.getApproval(approvalId); // NotFoundError
  const run = await repo.getRun(approval.run_id);
  const expected = WAITING_FOR_KIND[approval.kind];
  if (approval.status !== "pending") throw new ConflictError(`Approval already ${approval.status}`);
  if (run.status !== expected) throw new ConflictError(`Run is ${run.status}, not ${expected}`);

  // Authority — Modify is checked against the MODIFIED amount, so editing cannot exceed your limit.
  const amount = action.type === "modify" ? action.terms.amount : (approval.original_terms?.amount ?? 0);
  const auth = canAct(user, approval, amount);
  if (!auth.ok) {
    await repo.audit({
      ...actor(user), action: "approval.denied_insufficient_authority", entity: "approval", entity_id: approval.id,
      details: { run_id: run.id, attempted: action.type, amount, required_role: approval.required_role, kind: approval.kind, approval_limit: user.approval_limit, why: auth.why },
    });
    throw new ForbiddenError(auth.why ?? "Insufficient authority");
  }

  const why = reason?.trim() ? reason.trim() : null;
  if ((action.type === "modify" || action.type === "reject") && !why) throw new ValidationError(`A reason is required to ${action.type}`);

  const config = await repo.getConfig(run.config_version);
  let runPatch: Partial<Run>;
  let finalTerms: Terms | null = null;
  const aiPass = approval.ai_recommendation === "pass";
  switch (action.type) {
    case "approve":
      if (aiPass) {
        runPatch = { status: "passed", final_terms: null }; // confirm the AI's pass
        break;
      }
      if (!approval.original_terms) throw new ValidationError("There are no terms to approve; use Modify to set terms");
      finalTerms = approval.original_terms;
      runPatch = { status: "offer_sent", final_terms: finalTerms };
      break;
    case "modify": {
      const { amount: amt, equity_pct } = action.terms;
      if (!Number.isFinite(amt) || amt <= 0 || amt > config.thresholds.fund_max_check) throw new ValidationError(`Amount must be > 0 and ≤ $${config.thresholds.fund_max_check.toLocaleString("en-US")}`);
      if (!Number.isFinite(equity_pct) || equity_pct <= 0 || equity_pct > 100) throw new ValidationError("Equity must be > 0 and ≤ 100");
      finalTerms = { amount: amt, equity_pct };
      runPatch = { status: "offer_sent", final_terms: finalTerms };
      break;
    }
    case "reject":
      if (aiPass) throw new ValidationError("The AI already recommends pass: Approve confirms the pass, Modify sends an offer instead");
      runPatch = { status: "passed", final_terms: null };
      break;
    case "replan": {
      if (approval.kind !== "exception") throw new ValidationError("Replan is only available for exceptions");
      const agents = [...new Set(action.agents)];
      if (!agents.length || agents.some((a) => !SHARKS.includes(a))) throw new ValidationError("Choose at least one Shark to rerun");
      if (run.replans >= config.budgets.max_replans) throw new ValidationError(`Replan limit reached (${config.budgets.max_replans})`);
      runPatch = { status: "analyzing", state: { ...run.state, rerun: agents }, replans: run.replans + 1 };
      break;
    }
  }

  const ai = approval.ai_recommendation;
  // Override = the human's decision differs from the AI: modified terms, or rejected an AI invest.
  // (Approving an AI pass confirms it; offering on an AI pass goes through Modify, an override.)
  const is_override = action.type === "modify" || (action.type === "reject" && ai === "invest");
  const status = STATUS_FOR[action.type];

  const terminal = runPatch.status === "offer_sent" || runPatch.status === "passed";
  // Run CAS first: another decider, a founder answer or a cancel all bump step_count, so losing means nothing is written.
  const updated = await repo.updateRun(run.id, { ...runPatch, step_count: run.step_count + 1, completed_at: terminal ? new Date().toISOString() : null }, run.step_count);
  if (!updated) throw new ConflictError("The run changed while deciding (already decided or cancelled?)");

  const decided = await repo.decideApprovalRow(approval.id, { status, decided_by: user.id, reason: why, final_terms: finalTerms, is_override });
  await repo.addCheckpoint({ run_id: run.id, seq: run.step_count + 1, node: `human.${status}`, state: checkpointSnapshot(updated), duration_ms: 0 });
  if (!decided) {
    console.error(`approval ${approval.id}: run ${run.id} moved to ${updated.status} but the approval row was no longer pending`);
    await repo.audit({ ...actor(user), action: "approval.decide_inconsistent", entity: "approval", entity_id: approval.id, details: { run_id: run.id, attempted: status, run_status: updated.status } });
  } else {
    await repo.audit({
      ...actor(user), action: `approval.${status}`, entity: "approval", entity_id: approval.id,
      details: { run_id: run.id, kind: approval.kind, rule: approval.rule_fired, is_override, reason: why, final_terms: finalTerms, ...(action.type === "replan" ? { agents: runPatch.state?.rerun } : {}) },
    });
  }
  if (!decided && !terminal) throw new ConflictError("run changed during decision");
  if (runPatch.status === "offer_sent") await repo.audit({ ...actor(user), action: "offer.sent", entity: "run", entity_id: run.id, details: { terms: finalTerms, approval_id: approval.id } });
  // The decision is committed: memory writes must never fail it.
  try {
    const pitch = await repo.getPitch(run.pitch_id);
    if (decided && is_override && why) {
      await rememberOverride(repo, updated, pitch, user, { rec: ai, terms: approval.original_terms }, { status: updated.status, terms: finalTerms }, why);
    }
    if (terminal) await rememberOutcome(repo, updated, pitch);
  } catch (e) {
    console.error(`run ${run.id}: could not write decision memory`, e);
  }
  return updated;
}
