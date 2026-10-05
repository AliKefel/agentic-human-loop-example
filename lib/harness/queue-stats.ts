import type { ApprovalRow } from "@/lib/types";

export type QueueStats = { pending: number; overdue: number; medianDecisionMs: number | null; approvalRate: number | null; overrideRate: number | null };

/**
 * Queue stats strip (SPEC §5.4). Decided rows closed by a run cancel are not human decisions
 * and are excluded. Approval rate = (approved + modified) / decided; override rate = is_override / decided.
 */
export function computeQueueStats(pending: Pick<ApprovalRow, "sla_due">[], decided: ApprovalRow[], now: number): QueueStats {
  const human = decided.filter((a) => a.status !== "pending" && a.decided_at && a.reason !== "run cancelled");
  const durations = human.map((a) => new Date(a.decided_at!).getTime() - new Date(a.created_at).getTime()).sort((x, y) => x - y);
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
