import type { AgentName, ApprovalRow, Run, RunStatus, Terms, User } from "@/lib/types";
import type { Repo } from "./repo";
import { actor } from "./audit";
import { canAct } from "./authority";
import { ConflictError, ForbiddenError, ValidationError } from "./errors";
import { checkpointSnapshot } from "./machine";

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
 * audited on deny) → reason → action validation → approval-row CAS → run CAS (+1 step) →
 * checkpoint → audit `approval.<status>`.
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
  switch (action.type) {
    case "approve":
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
  const is_override = action.type === "modify" || (action.type === "reject" && ai === "invest") || (action.type === "approve" && ai === "pass");
  const status = STATUS_FOR[action.type];

  const decided = await repo.decideApprovalRow(approval.id, { status, decided_by: user.id, reason: why, final_terms: finalTerms, is_override });
  if (!decided) throw new ConflictError("This approval was already decided");

  const terminal = runPatch.status === "offer_sent" || runPatch.status === "passed";
  // A cancel is the only thing that bumps step_count while a run waits; losing the CAS means it landed.
  const updated = await repo.updateRun(run.id, { ...runPatch, step_count: run.step_count + 1, completed_at: terminal ? new Date().toISOString() : null }, run.step_count);
  if (!updated) throw new ConflictError("The run changed while deciding (was it cancelled?)");

  await repo.addCheckpoint({ run_id: run.id, seq: run.step_count + 1, node: `human.${status}`, state: checkpointSnapshot(updated), duration_ms: 0 });
  await repo.audit({
    ...actor(user), action: `approval.${status}`, entity: "approval", entity_id: approval.id,
    details: { run_id: run.id, kind: approval.kind, rule: approval.rule_fired, is_override, reason: why, final_terms: finalTerms, ...(action.type === "replan" ? { agents: runPatch.state?.rerun } : {}) },
  });
  if (runPatch.status === "offer_sent") await repo.audit({ ...actor(user), action: "offer.sent", entity: "run", entity_id: run.id, details: { terms: finalTerms, approval_id: approval.id } });
  return updated;
}
