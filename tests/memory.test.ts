import { describe, expect, it } from "vitest";
import { MemoryRepo } from "@/lib/harness/repo-memory";
import { createRun, cancelRun } from "@/lib/harness/runs";
import { runToRest } from "@/lib/harness/machine";
import { decideApproval } from "@/lib/harness/approvals";
import { ConflictError } from "@/lib/harness/errors";
import { formatMemories, memoriesForPlanning, memoriesForSynthesis, rememberOutcome } from "@/lib/harness/memory";
import { withState, checkpointSnapshot } from "@/lib/harness/run-state";
import { GP_ID, PARTNER_ID, SEED_USERS } from "@/lib/mock/seed-users";

const user = (id: string) => SEED_USERS.find((u) => u.id === id)!;
const GP = user(GP_ID);
const PARTNER = user(PARTNER_ID);

async function toRest(repo: MemoryRepo, slug: string) {
  const pitch = await repo.getPitchBySlug(slug);
  const run = await createRun(repo, { pitchId: pitch.id, autonomyLevel: 2, user: GP });
  return runToRest(repo, run.id);
}

describe("repo listing", () => {
  it("listMemories newest first, optional scope; listAudit filters, paginates newest first", async () => {
    const repo = new MemoryRepo();
    await repo.addMemory({ scope: "firm", subject: "X", sector: "Fintech", content: "c", source_run_id: null });
    const all = await repo.listMemories();
    expect(all[0].subject).toBe("X");
    expect((await repo.listMemories("partner")).every((m) => m.scope === "partner")).toBe(true);
    expect(all.length).toBe(5);
    for (let i = 0; i < 5; i++) await repo.audit({ actor_id: i % 2 ? GP_ID : null, actor_role: i % 2 ? "general_partner" : "system", action: `a.${i}`, entity: "run", entity_id: `r${i % 2}` });
    const page = await repo.listAudit({ limit: 2, offset: 0 });
    expect(page.map((r) => r.action)).toEqual(["a.4", "a.3"]);
    expect((await repo.listAudit({ limit: 2, offset: 2 })).map((r) => r.action)).toEqual(["a.2", "a.1"]);
    expect((await repo.listAudit({ limit: 10, offset: 0, actorId: GP_ID })).map((r) => r.action)).toEqual(["a.3", "a.1"]);
    expect((await repo.listAudit({ limit: 10, offset: 0, role: "system" })).length).toBe(3);
    expect((await repo.listAudit({ limit: 10, offset: 0, actionContains: "A.2" })).length).toBe(1);
    expect((await repo.listAudit({ limit: 10, offset: 0, entityId: "r1" })).length).toBe(2);
    expect((await repo.listAudit({ limit: 10, offset: 0, from: "2999-01-01T00:00:00Z" })).length).toBe(0);
    expect((await repo.listAudit({ limit: 10, offset: 0, to: "2000-01-01T00:00:00Z" })).length).toBe(0);
  });
});

describe("memory", () => {
  it("run-state helpers", () => {
    expect(typeof withState).toBe("function");
    expect(typeof checkpointSnapshot).toBe("function");
  });

  it("formatMemories", () => {
    expect(formatMemories([{ id: "m1", content: "hello" } as never])).toBe('<memory id="m1">hello</memory>');
  });

  it("planning memories: founder scope, subject = founder (case-insensitive)", async () => {
    const repo = new MemoryRepo();
    const pitch = await repo.getPitchBySlug("mealmate");
    expect((await memoriesForPlanning(repo, pitch)).map((m) => m.subject)).toEqual(["Jordan Lee"]);
    expect(await memoriesForPlanning(repo, { ...pitch, founder: "jordan LEE" })).toHaveLength(1);
    expect(await memoriesForPlanning(repo, { ...pitch, founder: "Nobody" })).toHaveLength(0);
  });

  it("mealmate run records the seeded founder memory id in state.memories_used", async () => {
    const repo = new MemoryRepo();
    const seeded = repo.memories.find((m) => m.subject === "Jordan Lee")!;
    const run = await toRest(repo, "mealmate");
    expect(run.state.memories_used).toContain(seeded.id);
    expect(new Set(run.state.memories_used).size).toBe(run.state.memories_used.length);
  });

  it("terminal runs write a founder memory (offer_sent and passed); cancelled does not", async () => {
    const repo = new MemoryRepo();
    const sent = await toRest(repo, "brewbot");
    const pitch = await repo.getPitch(sent.pitch_id);
    const m = (await repo.findMemories({ scope: "founder", subject: pitch.founder }))[0];
    expect(m).toMatchObject({ scope: "founder", sector: pitch.sector, source_run_id: sent.id });
    expect(m.content).toContain(sent.id.slice(0, 8));
    expect(m.content).toContain("offer sent: $120K for 10%");
    expect(repo.auditLog.find((a) => a.action === "memory.created" && a.details.subject === pitch.founder)?.details).toMatchObject({ scope: "founder" });
    const passed = await toRest(repo, "greengrid");
    const gp = await repo.getPitch(passed.pitch_id);
    expect((await repo.findMemories({ scope: "founder", subject: gp.founder }))[0].content).toContain("passed: triage.fast_pass");
    const before = repo.memories.length;
    const p2 = await repo.getPitchBySlug("pawprint");
    const r2 = await createRun(repo, { pitchId: p2.id, autonomyLevel: 2, user: GP });
    await cancelRun(repo, r2.id, GP);
    expect(repo.memories.length).toBe(before);
    await rememberOutcome(repo, await repo.getRun(r2.id), p2); // direct call still works for terminal helpers
  });

  it("human approval of a waiting run writes a founder memory", async () => {
    const repo = new MemoryRepo();
    const run = await toRest(repo, "pawprint");
    const pitch = await repo.getPitch(run.pitch_id);
    const before = (await repo.findMemories({ scope: "founder", subject: pitch.founder })).length;
    await decideApproval(repo, repo.approvals.find((a) => a.run_id === run.id)!.id, GP, { type: "approve" }, null);
    const after = await repo.findMemories({ scope: "founder", subject: pitch.founder });
    expect(after.length).toBe(before + 1);
    expect(after[0].content).toContain("offer sent: $500K for 5%");
  });

  it("modify-approve LedgerLeaf → firm memory → next Fintech run's synthesis uses it", async () => {
    const repo = new MemoryRepo();
    const run = await toRest(repo, "ledgerleaf");
    const a = repo.approvals.find((x) => x.run_id === run.id)!;
    await decideApproval(repo, a.id, PARTNER, { type: "modify", terms: { amount: 150000, equity_pct: 9 } }, "valuation too rich");
    const firm = (await repo.findMemories({ scope: "firm", sector: "Fintech" }))[0];
    expect(firm).toMatchObject({ scope: "firm", subject: "LedgerLeaf", sector: "Fintech", source_run_id: run.id });
    expect(firm.content).toContain("partner");
    expect(firm.content).toContain("valuation too rich");
    expect(firm.content).toContain("→");
    expect(repo.auditLog.some((x) => x.action === "memory.created" && x.actor_id === PARTNER_ID && x.details.scope === "firm" && x.details.subject === "LedgerLeaf")).toBe(true);
    expect((await memoriesForSynthesis(repo, await repo.getPitch(run.pitch_id))).map((m) => m.id)).toContain(firm.id);
    const next = await toRest(repo, "ledgerleaf");
    expect(next.state.memories_used).toContain(firm.id);
    // non-override approval writes no firm memory
    const before = repo.memories.filter((m) => m.scope === "firm").length;
    const pp = await toRest(repo, "pawprint");
    await decideApproval(repo, repo.approvals.find((x) => x.run_id === pp.id)!.id, GP, { type: "approve" }, null);
    expect(repo.memories.filter((m) => m.scope === "firm").length).toBe(before);
  });

  it("synthesis memories: same sector only, newest 5", async () => {
    const repo = new MemoryRepo();
    for (let i = 0; i < 7; i++) await repo.addMemory({ scope: "firm", subject: `S${i}`, sector: "Fintech", content: `c${i}`, source_run_id: null });
    const pitch = await repo.getPitchBySlug("ledgerleaf");
    const ms = await memoriesForSynthesis(repo, pitch);
    expect(ms.map((m) => m.subject)).toEqual(["S6", "S5", "S4", "S3", "S2"]);
  });

  it("decideApproval: replan whose approval CAS lost → ConflictError + approval.decide_inconsistent", async () => {
    const repo = new MemoryRepo();
    const run = await toRest(repo, "snackstack");
    const a = repo.approvals.find((x) => x.run_id === run.id)!;
    repo.decideApprovalRow = async () => null;
    await expect(decideApproval(repo, a.id, PARTNER, { type: "replan", agents: ["market"] }, null)).rejects.toBeInstanceOf(ConflictError);
    expect(repo.auditLog.some((x) => x.action === "approval.decide_inconsistent")).toBe(true);
  });
});

describe("audit query + csv", () => {
  it("parses/validates params and builds filters", async () => {
    const { parseAuditQuery, auditFilterFromQuery, auditCsv, csvField, CSV_HEADER } = await import("@/lib/harness/audit-query");
    const q = parseAuditQuery({ actor: PARTNER_ID, role: "bogus", action: " approval ", from: "2026-10-01", to: "nope" }, SEED_USERS);
    expect(q).toEqual({ actor: PARTNER_ID, action: "approval", from: "2026-10-01" });
    expect(auditFilterFromQuery({ to: "2026-10-04" }, { limit: 5, offset: 0 }).to).toBe("2026-10-05T00:00:00.000Z");
    expect(csvField('a,"b"')).toBe('"a,""b"""');
    const csv = auditCsv([{ id: 1, actor_id: null, actor_role: "system", action: "x", entity: "run", entity_id: null, details: { a: "q,\"z\"" }, created_at: "2026-10-04T00:00:00Z" }], SEED_USERS);
    expect(csv.split("\r\n")[0]).toBe(CSV_HEADER);
    expect(csv.split("\r\n")[1]).toBe('2026-10-04T00:00:00Z,System,system,x,run,,"{""a"":""q,\\""z\\""""}"');
  });
});
