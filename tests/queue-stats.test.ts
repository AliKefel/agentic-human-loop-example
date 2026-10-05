import { describe, expect, it } from "vitest";
import { computeQueueStats } from "@/lib/harness/queue-stats";
import type { ApprovalRow } from "@/lib/types";

const row = (status: ApprovalRow["status"], mins: number, over: Partial<ApprovalRow> = {}): ApprovalRow => ({
  id: "x", run_id: "r", kind: "approval", status, required_role: "partner", rule_fired: "r", ai_recommendation: "invest",
  original_terms: null, final_terms: null, decided_by: null, reason: null, is_override: false,
  sla_due: "2026-01-02T00:00:00.000Z", created_at: "2026-01-01T00:00:00.000Z",
  decided_at: new Date(Date.parse("2026-01-01T00:00:00.000Z") + mins * 60e3).toISOString(), ...over,
});

describe("computeQueueStats", () => {
  it("pending, overdue, median, approval + override rates; ignores cancel-closed rows", () => {
    const now = Date.parse("2026-01-01T12:00:00.000Z");
    const s = computeQueueStats(
      [{ sla_due: "2026-01-01T11:00:00.000Z" }, { sla_due: "2026-01-01T13:00:00.000Z" }],
      [row("approved", 10), row("modified", 30, { is_override: true }), row("rejected", 20, { is_override: true }), row("rejected", 5, { reason: "run cancelled" })],
      now,
    );
    expect(s).toEqual({ pending: 2, overdue: 1, medianDecisionMs: 20 * 60e3, approvalRate: 2 / 3, overrideRate: 2 / 3 });
    expect(computeQueueStats([], [], now)).toMatchObject({ medianDecisionMs: null, approvalRate: null, overrideRate: null });
  });
});
