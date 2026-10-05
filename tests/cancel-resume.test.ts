import { describe, expect, it } from "vitest";
import { MemoryRepo } from "@/lib/harness/repo-memory";
import { cancelRun, createRun, resumeRun } from "@/lib/harness/runs";
import { advanceRun, HANDLERS, runToRest } from "@/lib/harness/machine";
import { ConflictError, ForbiddenError } from "@/lib/harness/errors";
import { ANALYST_ID, GP_ID, PARTNER_ID, SEED_USERS } from "@/lib/mock/seed-users";

const user = (id: string) => SEED_USERS.find((u) => u.id === id)!;
const GP = user(GP_ID);
const PARTNER = user(PARTNER_ID);
const ANALYST = user(ANALYST_ID);

async function start(repo: MemoryRepo, slug: string) {
  const pitch = await repo.getPitchBySlug(slug);
  return createRun(repo, { pitchId: pitch.id, user: GP });
}

/** Fails a brewbot run at the triage step AFTER the triage LLM call spent tokens. Returns a restore fn. */
async function failAtTriage(repo: MemoryRepo, runId: string) {
  await advanceRun(repo, runId); // queued -> triage (checkpoint seq 1, status triage, 0 tokens)
  const original = HANDLERS.triage!;
  HANDLERS.triage = async (ctx) => { await original(ctx); throw new Error("downstream blew up"); };
  const r = await advanceRun(repo, runId);
  expect(r.run.status).toBe("failed");
  expect(r.run.tokens_used).toBe(600 + 80); // failRun recorded the failed step's spend
  return () => { HANDLERS.triage = original; };
}

describe("cancelRun", () => {
  it("cancels a non-terminal run and audits it (analyst may cancel)", async () => {
    const repo = new MemoryRepo();
    const run = await start(repo, "brewbot");
    await advanceRun(repo, run.id);
    const c = await cancelRun(repo, run.id, ANALYST);
    expect(c).toMatchObject({ status: "cancelled", step_count: 2 });
    expect(c.completed_at).not.toBeNull();
    const audit = repo.auditLog.filter((a) => a.action === "run.cancelled");
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actor_id: ANALYST_ID, actor_role: "analyst", entity_id: run.id, details: { from: "triage" } });
    expect((await advanceRun(repo, run.id)).status).toBe("idle");
  });

  it("cancel terminal → ConflictError", async () => {
    const repo = new MemoryRepo();
    const run = await start(repo, "greengrid");
    await runToRest(repo, run.id);
    await expect(cancelRun(repo, run.id, GP)).rejects.toBeInstanceOf(ConflictError);
    expect(repo.auditLog.some((a) => a.action === "run.cancelled")).toBe(false);
  });

  it("cancel mid-run blocks the in-flight step", async () => {
    const repo = new MemoryRepo();
    const run = await start(repo, "brewbot");
    await advanceRun(repo, run.id); // -> triage
    const original = HANDLERS.triage!;
    let release!: () => void;
    let entered!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const inside = new Promise<void>((r) => { entered = r; });
    HANDLERS.triage = async (ctx) => { const res = await original(ctx); entered(); await gate; return res; };
    try {
      const inflight = advanceRun(repo, run.id);
      await inside; // the handler has spent tokens and is about to return
      const c = await cancelRun(repo, run.id, PARTNER);
      expect(c.status).toBe("cancelled");
      release();
      const r = await inflight;
      expect(r.status).toBe("conflict");
      const after = await repo.getRun(run.id);
      expect(after.status).toBe("cancelled");
      expect(after.state.triage).toBeUndefined(); // the in-flight step wrote nothing
      expect(repo.checkpoints.filter((x) => x.run_id === run.id).map((x) => x.seq)).toEqual([0, 1]);
      expect(after.tokens_used).toBe(600 + 80); // but its spend is still accounted
      expect(after.step_count).toBe(2);
    } finally {
      HANDLERS.triage = original;
    }
  });

  it("cancelling a waiting run rejects its pending approval", async () => {
    const repo = new MemoryRepo();
    const run = await start(repo, "brewbot");
    await repo.updateRun(run.id, { status: "awaiting_approval" });
    const approval = await repo.addApproval({ run_id: run.id, kind: "approval", required_role: "partner", rule_fired: "r", ai_recommendation: "invest", original_terms: { amount: 1, equity_pct: 1 }, sla_due: new Date().toISOString() });
    await cancelRun(repo, run.id, GP);
    expect(await repo.getApproval(approval.id)).toMatchObject({ status: "rejected", reason: "run cancelled", decided_by: GP_ID });
    expect((await repo.getRun(run.id)).status).toBe("cancelled");
  });
});

describe("resumeRun", () => {
  it("partner forbidden; GP restores a failed run from the last working checkpoint, keeping spend", async () => {
    const repo = new MemoryRepo();
    const run = await start(repo, "brewbot");
    const restore = await failAtTriage(repo, run.id);
    try {
      await expect(resumeRun(repo, run.id, PARTNER)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(resumeRun(repo, run.id, ANALYST)).rejects.toBeInstanceOf(ForbiddenError);
      // the failed triage step spent tokens (snapshot at seq 1 has 0) — resume must not drop them
      const failed = await repo.getRun(run.id);
      const resumed = await resumeRun(repo, run.id, GP);
      expect(resumed).toMatchObject({ status: "triage", error: null, completed_at: null, step_count: failed.step_count + 1 });
      expect(resumed.tokens_used).toBe(680);
      expect(resumed.cost_usd).toBe(failed.cost_usd);
      expect(resumed.cost_usd).toBeGreaterThan(0);
      const audit = repo.auditLog.filter((a) => a.action === "run.resumed");
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({ actor_id: GP_ID, entity_id: run.id, details: { from_seq: 1 } });
      restore();
      const done = await runToRest(repo, run.id);
      expect(done.status).toBe("offer_sent");
      expect(done.tokens_used).toBeGreaterThan(680);
    } finally {
      restore();
    }
  });

  it("max_steps_exceeded runs cannot be resumed", async () => {
    const repo = new MemoryRepo();
    const run = await start(repo, "brewbot");
    await advanceRun(repo, run.id);
    await repo.updateRun(run.id, { status: "failed", error: "max_steps_exceeded", completed_at: new Date().toISOString() });
    await expect(resumeRun(repo, run.id, GP)).rejects.toThrow(new ConflictError("cannot resume: max steps exceeded"));
  });

  it("resume a non-failed run → ConflictError", async () => {
    const repo = new MemoryRepo();
    const run = await start(repo, "brewbot");
    await expect(resumeRun(repo, run.id, GP)).rejects.toBeInstanceOf(ConflictError);
    await runToRest(repo, run.id);
    await expect(resumeRun(repo, run.id, GP)).rejects.toBeInstanceOf(ConflictError);
  });

  it("restores plan and state from a later checkpoint", async () => {
    const repo = new MemoryRepo();
    const run = await start(repo, "brewbot");
    let r = await repo.getRun(run.id);
    while (r.status !== "synthesizing") r = (await advanceRun(repo, run.id)).run;
    await repo.updateRun(run.id, { status: "failed", error: "boom", step_count: r.step_count + 1, completed_at: new Date().toISOString(), plan: null });
    const resumed = await resumeRun(repo, run.id, GP);
    expect(resumed.status).toBe("synthesizing");
    expect(resumed.plan).toEqual(r.plan);
    expect(resumed.state.shark_outputs).toEqual(r.state.shark_outputs);
    expect(resumed.tokens_used).toBe(r.tokens_used); // unchanged current spend
    expect(repo.auditLog.find((a) => a.action === "run.resumed")?.details).toEqual({ from_seq: 4 });
  });
});
