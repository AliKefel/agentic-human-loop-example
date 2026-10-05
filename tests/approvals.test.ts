import { describe, expect, it } from "vitest";
import { MemoryRepo } from "@/lib/harness/repo-memory";
import { cancelRun, createRun } from "@/lib/harness/runs";
import { advanceRun, HANDLERS, runToRest } from "@/lib/harness/machine";
import { canAct, decideApproval } from "@/lib/harness/approvals";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/harness/errors";
import { ANALYST_ID, GP_ID, PARTNER_ID, SEED_USERS } from "@/lib/mock/seed-users";
import type { ApprovalRow, Run } from "@/lib/types";

const user = (id: string) => SEED_USERS.find((u) => u.id === id)!;
const GP = user(GP_ID);
const PARTNER = user(PARTNER_ID);
const ANALYST = user(ANALYST_ID);

async function toRest(repo: MemoryRepo, slug: string, autonomyLevel: 0 | 1 | 2 | 3 = 2) {
  const pitch = await repo.getPitchBySlug(slug);
  const run = await createRun(repo, { pitchId: pitch.id, autonomyLevel, user: GP });
  return runToRest(repo, run.id);
}
const approvalOf = (repo: MemoryRepo, run: Run) => repo.approvals.find((a) => a.run_id === run.id)!;

describe("policy_check handler", () => {
  it("brewbot at L2 auto-sends with final_terms and audits policy.decided + offer.sent", async () => {
    const repo = new MemoryRepo();
    const run = await toRest(repo, "brewbot");
    expect(run).toMatchObject({ status: "offer_sent", final_terms: { amount: 120000, equity_pct: 10 }, decision: { outcome: "auto_send", rule: "l2.auto_send" } });
    expect(run.completed_at).not.toBeNull();
    expect(repo.approvals.filter((a) => a.run_id === run.id)).toHaveLength(0);
    expect(repo.auditLog.find((a) => a.action === "policy.decided" && a.entity_id === run.id)?.details).toEqual({ rule: "l2.auto_send", outcome: "auto_send" });
    expect(repo.auditLog.some((a) => a.action === "offer.sent" && a.entity_id === run.id)).toBe(true);
  });

  it("pawprint at L2 → awaiting_approval with a GP approval row, sla 24h, audited", async () => {
    const repo = new MemoryRepo();
    const before = Date.now();
    const run = await toRest(repo, "pawprint");
    expect(run).toMatchObject({ status: "awaiting_approval", final_terms: null, decision: { outcome: "needs_approval", rule: "l2.over_threshold", required_role: "general_partner" } });
    const a = approvalOf(repo, run);
    expect(a).toMatchObject({ kind: "approval", status: "pending", required_role: "general_partner", rule_fired: "l2.over_threshold", ai_recommendation: "invest", original_terms: { amount: 500000, equity_pct: 5 } });
    const due = new Date(a.sla_due).getTime() - before;
    expect(due).toBeGreaterThanOrEqual(24 * 3600e3 - 5000);
    expect(due).toBeLessThanOrEqual(24 * 3600e3 + 5000);
    expect(repo.auditLog.find((x) => x.action === "approval.requested")?.details).toEqual({ kind: "approval", required_role: "general_partner", rule: "l2.over_threshold" });
  });

  it("snackstack → in_review exception (8h); moonmint → escalated escalation (4h); fitflow → awaiting_founder, no approval", async () => {
    const repo = new MemoryRepo();
    const snack = await toRest(repo, "snackstack");
    expect(snack.status).toBe("in_review");
    expect(approvalOf(repo, snack)).toMatchObject({ kind: "exception", rule_fired: "exception.disagreement", required_role: "partner" });
    const moon = await toRest(repo, "moonmint");
    expect(moon.status).toBe("escalated");
    expect(approvalOf(repo, moon)).toMatchObject({ kind: "escalation", rule_fired: "escalate.red_flag", required_role: "general_partner" });
    const hrs = (a: ApprovalRow) => (new Date(a.sla_due).getTime() - new Date(a.created_at).getTime()) / 3600e3;
    expect(hrs(approvalOf(repo, snack))).toBeCloseTo(8, 1);
    expect(hrs(approvalOf(repo, moon))).toBeCloseTo(4, 1);
    const fit = await toRest(repo, "fitflow");
    expect(fit).toMatchObject({ status: "awaiting_founder", decision: { outcome: "need_info", rule: "need_info.missing_data" } });
    expect(repo.approvals.some((a) => a.run_id === fit.id)).toBe(false);
  });

  it("the approval effect skips creating an approval when a cancel landed first", async () => {
    const repo = new MemoryRepo();
    const pitch = await repo.getPitchBySlug("pawprint");
    const run = await createRun(repo, { pitchId: pitch.id, user: GP });
    let r = await repo.getRun(run.id);
    while (r.status !== "policy_check") r = (await advanceRun(repo, run.id)).run;
    const original = HANDLERS.policy_check!;
    HANDLERS.policy_check = async (ctx) => {
      const res = await original(ctx);
      return { ...res, effects: async (committed) => { await cancelRun(repo, run.id, GP); await res.effects!(committed); } };
    };
    try {
      await advanceRun(repo, run.id);
    } finally {
      HANDLERS.policy_check = original;
    }
    expect((await repo.getRun(run.id)).status).toBe("cancelled");
    expect(repo.approvals.filter((a) => a.run_id === run.id && a.status === "pending")).toHaveLength(0);
    expect(repo.auditLog.some((a) => a.action === "approval.requested")).toBe(false);
  });
});

describe("canAct", () => {
  const a = (over: Partial<ApprovalRow> = {}) => ({ kind: "approval", required_role: "partner", ...over }) as ApprovalRow;
  it("enforces role order, escalation GP-only, and the approval limit", () => {
    expect(canAct(ANALYST, a(), 0).ok).toBe(false);
    expect(canAct(PARTNER, a(), 250000).ok).toBe(true);
    expect(canAct(PARTNER, a(), 250001).ok).toBe(false);
    expect(canAct(PARTNER, a({ required_role: "general_partner" }), 100).ok).toBe(false);
    expect(canAct(PARTNER, a({ kind: "escalation", required_role: "partner" }), 100).ok).toBe(false);
    expect(canAct(GP, a({ kind: "escalation", required_role: "general_partner" }), 5e6).ok).toBe(true);
    expect(canAct(PARTNER, a(), 250001).why).toMatch(/limit/i);
  });
});

describe("decideApproval", () => {
  it("partner approving pawprint ($500K) → ForbiddenError + audit; run unchanged", async () => {
    const repo = new MemoryRepo();
    const run = await toRest(repo, "pawprint");
    const a = approvalOf(repo, run);
    await expect(decideApproval(repo, a.id, PARTNER, { type: "approve" }, null)).rejects.toBeInstanceOf(ForbiddenError);
    const denied = repo.auditLog.filter((x) => x.action === "approval.denied_insufficient_authority");
    expect(denied).toHaveLength(1);
    expect(denied[0]).toMatchObject({ actor_id: PARTNER_ID, actor_role: "partner", entity: "approval", entity_id: a.id });
    expect((await repo.getRun(run.id)).status).toBe("awaiting_approval");
    expect((await repo.getApproval(a.id)).status).toBe("pending");
  });

  it("analyst approve → ForbiddenError", async () => {
    const repo = new MemoryRepo();
    const run = await toRest(repo, "ledgerleaf");
    await expect(decideApproval(repo, approvalOf(repo, run).id, ANALYST, { type: "approve" }, null)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("GP approve → offer_sent with original terms, checkpoint + audit; double decide → ConflictError", async () => {
    const repo = new MemoryRepo();
    const run = await toRest(repo, "pawprint");
    const a = approvalOf(repo, run);
    const done = await decideApproval(repo, a.id, GP, { type: "approve" }, null);
    expect(done).toMatchObject({ status: "offer_sent", final_terms: { amount: 500000, equity_pct: 5 }, step_count: run.step_count + 1 });
    expect(done.completed_at).not.toBeNull();
    expect(await repo.getApproval(a.id)).toMatchObject({ status: "approved", decided_by: GP_ID, is_override: false, final_terms: { amount: 500000, equity_pct: 5 } });
    expect(repo.auditLog.find((x) => x.action === "approval.approved")).toMatchObject({ actor_id: GP_ID, entity_id: a.id });
    expect(repo.checkpoints.at(-1)).toMatchObject({ run_id: run.id, seq: run.step_count + 1 });
    await expect(decideApproval(repo, a.id, GP, { type: "approve" }, null)).rejects.toBeInstanceOf(ConflictError);
  });

  it("decideApprovalRow CAS loss → ConflictError and the run is not moved", async () => {
    const repo = new MemoryRepo();
    const run = await toRest(repo, "ledgerleaf");
    const a = approvalOf(repo, run);
    const orig = repo.decideApprovalRow.bind(repo);
    repo.decideApprovalRow = async () => null;
    await expect(decideApproval(repo, a.id, PARTNER, { type: "approve" }, null)).rejects.toBeInstanceOf(ConflictError);
    repo.decideApprovalRow = orig;
    expect((await repo.getRun(run.id)).status).toBe("awaiting_approval");
  });

  it("reject / modify require a reason", async () => {
    const repo = new MemoryRepo();
    const run = await toRest(repo, "ledgerleaf");
    const a = approvalOf(repo, run);
    await expect(decideApproval(repo, a.id, PARTNER, { type: "reject" }, null)).rejects.toBeInstanceOf(ValidationError);
    await expect(decideApproval(repo, a.id, PARTNER, { type: "reject" }, "   ")).rejects.toBeInstanceOf(ValidationError);
    await expect(decideApproval(repo, a.id, PARTNER, { type: "modify", terms: { amount: 150000, equity_pct: 8 } }, "")).rejects.toBeInstanceOf(ValidationError);
    expect((await repo.getApproval(a.id)).status).toBe("pending");
  });

  it("reject an AI invest → passed, is_override", async () => {
    const repo = new MemoryRepo();
    const run = await toRest(repo, "ledgerleaf");
    const a = approvalOf(repo, run);
    const done = await decideApproval(repo, a.id, PARTNER, { type: "reject" }, "Too early");
    expect(done).toMatchObject({ status: "passed", final_terms: null });
    expect(await repo.getApproval(a.id)).toMatchObject({ status: "rejected", reason: "Too early", is_override: true });
    expect(repo.auditLog.some((x) => x.action === "approval.rejected")).toBe(true);
  });

  it("modify → offer_sent with the new terms, override; authority uses the modified amount; terms validated", async () => {
    const repo = new MemoryRepo();
    const run = await toRest(repo, "ledgerleaf"); // $200K partner
    const a = approvalOf(repo, run);
    await expect(decideApproval(repo, a.id, PARTNER, { type: "modify", terms: { amount: 300000, equity_pct: 8 } }, "bigger")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(decideApproval(repo, a.id, PARTNER, { type: "modify", terms: { amount: 0, equity_pct: 8 } }, "x")).rejects.toBeInstanceOf(ValidationError);
    await expect(decideApproval(repo, a.id, PARTNER, { type: "modify", terms: { amount: 100000, equity_pct: 0 } }, "x")).rejects.toBeInstanceOf(ValidationError);
    await expect(decideApproval(repo, a.id, PARTNER, { type: "modify", terms: { amount: 100000, equity_pct: 101 } }, "x")).rejects.toBeInstanceOf(ValidationError);
    await expect(decideApproval(repo, a.id, GP, { type: "modify", terms: { amount: 2000001, equity_pct: 8 } }, "x")).rejects.toBeInstanceOf(ValidationError);
    const done = await decideApproval(repo, a.id, PARTNER, { type: "modify", terms: { amount: 180000, equity_pct: 9 } }, "Cut the check");
    expect(done).toMatchObject({ status: "offer_sent", final_terms: { amount: 180000, equity_pct: 9 } });
    expect(await repo.getApproval(a.id)).toMatchObject({ status: "modified", is_override: true, final_terms: { amount: 180000, equity_pct: 9 } });
  });

  it("approving an AI pass is an override (L0)", async () => {
    const repo = new MemoryRepo();
    const run = await toRest(repo, "brewbot", 0);
    const a = approvalOf(repo, run);
    expect(a).toMatchObject({ rule_fired: "l0.human_decides" });
    // force the recorded AI recommendation to pass with terms to exercise the override rule
    (repo.approvals as ApprovalRow[]).find((x) => x.id === a.id)!.ai_recommendation = "pass";
    await decideApproval(repo, a.id, PARTNER, { type: "approve" }, null);
    expect((await repo.getApproval(a.id)).is_override).toBe(true);
  });

  it("run not in the waiting status for the kind → ConflictError; unknown id → NotFoundError", async () => {
    const repo = new MemoryRepo();
    const run = await toRest(repo, "ledgerleaf");
    const a = approvalOf(repo, run);
    await repo.updateRun(run.id, { status: "in_review" });
    await expect(decideApproval(repo, a.id, GP, { type: "approve" }, null)).rejects.toBeInstanceOf(ConflictError);
    await expect(decideApproval(repo, "nope", GP, { type: "approve" }, null)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("replan: exception only, reruns chosen sharks, increments replans, capped by max_replans", async () => {
    const repo = new MemoryRepo();
    const ledger = await toRest(repo, "ledgerleaf");
    await expect(decideApproval(repo, approvalOf(repo, ledger).id, GP, { type: "replan", agents: ["market"] }, null)).rejects.toBeInstanceOf(ValidationError);

    const run = await toRest(repo, "snackstack");
    const a = approvalOf(repo, run);
    await expect(decideApproval(repo, a.id, GP, { type: "replan", agents: [] }, null)).rejects.toBeInstanceOf(ValidationError);
    const re = await decideApproval(repo, a.id, PARTNER, { type: "replan", agents: ["market", "skeptic"] }, null);
    expect(re).toMatchObject({ status: "analyzing", replans: 1, state: { rerun: ["market", "skeptic"] } });
    expect(await repo.getApproval(a.id)).toMatchObject({ status: "replanned", is_override: false });
    expect(repo.auditLog.some((x) => x.action === "approval.replanned")).toBe(true);

    // max_replans reached
    const after = await runToRest(repo, run.id);
    expect(after.status).toBe("in_review");
    await repo.updateRun(run.id, { replans: 2 });
    const a2 = repo.approvals.filter((x) => x.run_id === run.id && x.status === "pending").at(-1)!;
    await expect(decideApproval(repo, a2.id, GP, { type: "replan", agents: ["market"] }, null)).rejects.toBeInstanceOf(ValidationError);
  });
});
