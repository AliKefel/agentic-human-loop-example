import type { ApprovalRow } from "@/lib/types";

export type QueueStats = { pending: number; overdue: number; medianDecisionMs: number | null; approvalRate: number | null; overrideRate: number | null };

/** Closing reason cancelRun writes on a pending approval: a system close, not a human decision. */
export const RUN_CANCELLED_REASON = "run cancelled";

/** A decided approval that a human actually decided (rows closed by a run cancel are excluded). Shared with the Fund Overview stats. */
export function isHumanDecision(a: Pick<ApprovalRow, "status" | "decided_at" | "reason">): boolean {
  return a.status !== "pending" && !!a.decided_at && a.reason !== RUN_CANCELLED_REASON;
}

/** Milliseconds a human took to decide (decided_at − created_at). Only meaningful when isHumanDecision(a). */
export const decisionMs = (a: Pick<ApprovalRow, "created_at" | "decided_at">): number => new Date(a.decided_at!).getTime() - new Date(a.created_at).getTime();

/**
 * Queue stats strip (SPEC §5.4). Decided rows closed by a run cancel are not human decisions
 * and are excluded. Approval rate = (approved + modified) / decided; override rate = is_override / decided.
 */
export function computeQueueStats(pending: Pick<ApprovalRow, "sla_due">[], decided: ApprovalRow[], now: number): QueueStats {
  const human = decided.filter(isHumanDecision);
  const durations = human.map(decisionMs).sort((x, y) => x - y);
  const mid = Math.floor(durations.length / 2);
  const median = !durations.length ? null : durations.length % 2 ? durations[mid] : (durations[mid - 1] + durations[mid]) / 2;
  const rate = (n: number) => (human.length ? n / human.length : null);
  return {
    pending: pending.length,
    overdue: pending.filter((a) => new Date(a.sla_due).getTime() < now).length,
    medianDecisionMs: median,
    approvalRate: rate(human.filter((a) => a.status === "approved" || a.status === "modified").length),
    overrideRate: rate(human.filter((a) => a.is_override).length),
  };
}
