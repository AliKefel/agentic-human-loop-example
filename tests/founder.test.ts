import { describe, expect, it } from "vitest";
import { MemoryRepo } from "@/lib/harness/repo-memory";
import { createRun } from "@/lib/harness/runs";
import { runToRest } from "@/lib/harness/machine";
import { answerFounder, founderQuestion } from "@/lib/harness/founder";
import { ConflictError, ValidationError } from "@/lib/harness/errors";
import { ANALYST_ID, GP_ID, SEED_USERS } from "@/lib/mock/seed-users";
import { SCRIPTED_FOUNDER_REPLY } from "@/lib/mock/fixtures";

const user = (id: string) => SEED_USERS.find((u) => u.id === id)!;
const GP = user(GP_ID);
const ANALYST = user(ANALYST_ID);

async function fitflow(repo: MemoryRepo) {
  const pitch = await repo.getPitchBySlug("fitflow");
  const run = await createRun(repo, { pitchId: pitch.id, autonomyLevel: 2, user: GP });
  return runToRest(repo, run.id);
}

describe("founder Q&A (SPEC §2.10)", () => {
  it("question template", () => {
    expect(founderQuestion(["revenue", "retention"])).toBe("Before we can decide, please share: revenue, retention.");
  });

  it("fitflow → awaiting_founder with one to_founder message, founder_asked set, audited", async () => {
    const repo = new MemoryRepo();
    const run = await fitflow(repo);
    expect(run.status).toBe("awaiting_founder");
    expect(run.state.founder_asked).toBe(true);
    const msgs = await repo.listFounderMessages(run.id);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatchObject({ direction: "to_founder", body: "Before we can decide, please share: revenue, retention.", author_id: null });
    expect(repo.auditLog.find((a) => a.action === "founder.asked")).toMatchObject({ actor_role: "system", entity: "run", entity_id: run.id });
    expect(repo.approvals.some((a) => a.run_id === run.id)).toBe(false);
  });

  it("answerFounder (analyst ok) → analyzing, reruns skeptic + finance only, then offer_sent $100K with the after_founder synthesis", async () => {
    const repo = new MemoryRepo();
    const run = await fitflow(repo);
    const callsBefore = repo.agentCalls.filter((c) => c.run_id === run.id && c.purpose === "analyze").map((c) => c.agent);
    const answered = await answerFounder(repo, run.id, ANALYST, SCRIPTED_FOUNDER_REPLY.fitflow);
    expect(answered).toMatchObject({ status: "analyzing", step_count: run.step_count + 1, state: { rerun: ["skeptic", "finance"], founder_answers: [SCRIPTED_FOUNDER_REPLY.fitflow], founder_asked: true } });
    const msgs = await repo.listFounderMessages(run.id);
    expect(msgs.map((m) => m.direction)).toEqual(["to_founder", "from_founder"]);
    expect(msgs[1]).toMatchObject({ author_id: ANALYST_ID, body: SCRIPTED_FOUNDER_REPLY.fitflow });
    expect(repo.auditLog.find((a) => a.action === "founder.answered")).toMatchObject({ actor_id: ANALYST_ID, entity: "run", entity_id: run.id });
    expect(repo.checkpoints.at(-1)).toMatchObject({ run_id: run.id, seq: run.step_count + 1, node: "founder.answered" });

    const done = await runToRest(repo, run.id);
    expect(done).toMatchObject({ status: "offer_sent", final_terms: { amount: 100000, equity_pct: 15 }, decision: { rule: "l2.auto_send" } });
    const after = repo.agentCalls.filter((c) => c.run_id === run.id && c.purpose === "analyze").map((c) => c.agent);
    const added = after.slice(callsBefore.length);
    expect(new Set(added)).toEqual(new Set(["skeptic", "finance"]));
    expect(done.state.synthesis?.summary).toMatch(/7\/7\/7\/7/);
  });

  it("not awaiting_founder → ConflictError; blank body → ValidationError", async () => {
    const repo = new MemoryRepo();
    const run = await fitflow(repo);
    await expect(answerFounder(repo, run.id, GP, "   ")).rejects.toBeInstanceOf(ValidationError);
    await answerFounder(repo, run.id, GP, "answer");
    await expect(answerFounder(repo, run.id, GP, "again")).rejects.toBeInstanceOf(ConflictError);
    expect((await repo.listFounderMessages(run.id)).filter((m) => m.direction === "from_founder")).toHaveLength(1);
  });

  it("a lost CAS (concurrent answer / cancel) writes no message", async () => {
    const repo = new MemoryRepo();
    const run = await fitflow(repo);
    const orig = repo.updateRun.bind(repo);
    repo.updateRun = async () => null;
    await expect(answerFounder(repo, run.id, GP, "answer")).rejects.toBeInstanceOf(ConflictError);
    repo.updateRun = orig;
    expect((await repo.listFounderMessages(run.id))).toHaveLength(1);
  });
});
