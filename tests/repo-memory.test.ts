import { describe, expect, it } from "vitest";
import { MemoryRepo } from "@/lib/harness/repo-memory";
import { SYSTEM, actor } from "@/lib/harness/audit";
import { NotFoundError } from "@/lib/harness/errors";
import { initialRunState } from "@/lib/harness/run-state";
import { CONFIG_V1 } from "@/lib/mock/seed-config";

const GP = "00000000-0000-0000-0000-000000000003";

async function newRun(repo: MemoryRepo) {
  const pitch = await repo.getPitchBySlug("brewbot");
  return repo.createRun({ pitch_id: pitch.id, config_version: 1, autonomy_level: 2, started_by: GP });
}
async function newApproval(repo: MemoryRepo, runId: string) {
  return repo.addApproval({ run_id: runId, kind: "approval", required_role: "partner", rule_fired: "r", ai_recommendation: "invest", original_terms: { amount: 1, equity_pct: 1 }, sla_due: new Date().toISOString() });
}

describe("MemoryRepo", () => {
  it("seeds pitches, config, users, memories", async () => {
    const repo = new MemoryRepo();
    expect((await repo.getActiveConfig()).version).toBe(1);
    expect((await repo.getConfig(1)).thresholds.auto_max_amount).toBe(150000);
    expect((await repo.getUser(GP)).role).toBe("general_partner");
    const p = await repo.getPitchBySlug("brewbot");
    expect((await repo.getPitch(p.id)).company).toBe("BrewBot");
    expect(await repo.findMemories({ scope: "founder", subject: "Jordan Lee" })).toHaveLength(1);
    await expect(repo.getPitchBySlug("nope")).rejects.toThrow();
  });

  it("accepts a config override", async () => {
    const cfg = { ...CONFIG_V1, budgets: { ...CONFIG_V1.budgets, max_usd: 0.01 } };
    expect((await new MemoryRepo({ config: cfg }).getActiveConfig()).budgets.max_usd).toBe(0.01);
  });

  it("createRun defaults and getRun returns a clone", async () => {
    const repo = new MemoryRepo();
    const run = await newRun(repo);
    expect(run).toMatchObject({ status: "queued", step_count: 0, replans: 0, degraded: false, tokens_used: 0, cost_usd: 0, plan: null, decision: null });
    expect(run.state).toMatchObject({ shark_outputs: {}, shark_failures: {}, founder_asked: false, founder_answers: [], memories_used: [] });
    const a = await repo.getRun(run.id);
    a.status = "failed";
    expect((await repo.getRun(run.id)).status).toBe("queued");
  });

  it("updateRun is compare-and-set on step_count", async () => {
    const repo = new MemoryRepo();
    const run = await newRun(repo);
    const ok = await repo.updateRun(run.id, { status: "triage", step_count: 1 }, 0);
    expect(ok?.status).toBe("triage");
    expect(await repo.updateRun(run.id, { status: "planning" }, 0)).toBeNull();
    expect((await repo.getRun(run.id)).status).toBe("triage");
    expect((await repo.updateRun(run.id, { status: "planning" }))?.status).toBe("planning");
  });

  it("getRun yields so concurrent callers interleave", async () => {
    const repo = new MemoryRepo();
    const run = await newRun(repo);
    const order: string[] = [];
    const p = repo.getRun(run.id).then(() => order.push("get"));
    order.push("sync");
    await p;
    expect(order).toEqual(["sync", "get"]);
  });

  it("decideApprovalRow is CAS on pending", async () => {
    const repo = new MemoryRepo();
    const run = await newRun(repo);
    const ap = await newApproval(repo, run.id);
    expect(ap.status).toBe("pending");
    expect((await repo.pendingApprovalForRun(run.id))?.id).toBe(ap.id);
    const patch = { status: "approved" as const, decided_by: GP, reason: "ok", final_terms: { amount: 1, equity_pct: 1 }, is_override: false };
    const first = await repo.decideApprovalRow(ap.id, patch);
    expect(first?.status).toBe("approved");
    expect(first?.decided_at).toBeTruthy();
    expect(await repo.decideApprovalRow(ap.id, { ...patch, status: "rejected" })).toBeNull();
    expect((await repo.getApproval(ap.id)).status).toBe("approved");
    expect(await repo.pendingApprovalForRun(run.id)).toBeNull();
  });

  it("lastCheckpoint returns highest seq honoring excludeNodes", async () => {
    const repo = new MemoryRepo();
    const run = await newRun(repo);
    await repo.addCheckpoint({ run_id: run.id, seq: 1, node: "triage", state: { a: 1 }, duration_ms: 1 });
    await repo.addCheckpoint({ run_id: run.id, seq: 2, node: "failed", state: { a: 2 }, duration_ms: 1 });
    expect((await repo.lastCheckpoint(run.id))?.seq).toBe(2);
    expect((await repo.lastCheckpoint(run.id, { excludeNodes: ["failed"] }))?.node).toBe("triage");
    expect(await repo.lastCheckpoint("other")).toBeNull();
    await expect(repo.addCheckpoint({ run_id: run.id, seq: 1, node: "x", state: {}, duration_ms: 0 })).rejects.toThrow();
  });

  it("agent calls, tool calls, messages, incidents, memories are recorded", async () => {
    const repo = new MemoryRepo();
    const run = await newRun(repo);
    const id = await repo.addAgentCall({ run_id: run.id, agent: "market", purpose: "analyze", model: "m", attempt: 1, fallback_used: false, input_tokens: 1, output_tokens: 1, cost_usd: 0, latency_ms: 1, status: "ok", error: null, output: {} });
    await repo.addToolCall({ run_id: run.id, agent_call_id: id, agent: "market", tool: "t", args: {}, result: null, latency_ms: 1, permitted: true });
    await repo.addFounderMessage({ run_id: run.id, direction: "to_founder", body: "hi", author_id: null });
    const inc = await repo.addIncident({ run_id: run.id, severity: "sev2", title: "t", owner_id: null, handoff: {}, sla_due: new Date().toISOString() });
    expect(inc.status).toBe("open");
    await repo.addMemory({ scope: "firm", subject: "X", sector: "Fintech", content: "c", source_run_id: run.id });
    expect(repo.agentCalls).toHaveLength(1);
    expect(repo.toolCalls).toHaveLength(1);
    expect(repo.founderMessages).toHaveLength(1);
    expect(repo.incidents).toHaveLength(1);
    expect((await repo.findMemories({ scope: "firm", sector: "Fintech" }))[0].subject).toBe("X");
    expect(await repo.findMemories({ scope: "firm", limit: 1 })).toHaveLength(1);
  });

  it("audit appends frozen entries", async () => {
    const repo = new MemoryRepo();
    await repo.audit({ ...SYSTEM, action: "run.created", entity: "run", entity_id: "r1", details: { a: 1 } });
    await repo.audit({ ...actor(await repo.getUser(GP)), action: "x", entity: "run" });
    expect(repo.auditLog).toHaveLength(2);
    expect(Object.isFrozen(repo.auditLog[0])).toBe(true);
    expect(Object.isFrozen(repo.auditLog[0].details)).toBe(true);
    expect(repo.auditLog[0].actor_role).toBe("system");
    expect(repo.auditLog[1]).toMatchObject({ actor_id: GP, actor_role: "general_partner", details: {} });
  });

  it("createRun state equals initialRunState()", async () => {
    const run = await newRun(new MemoryRepo());
    expect(run.state).toEqual(initialRunState());
  });

  it("unknown ids throw NotFoundError (null means lost CAS only)", async () => {
    const repo = new MemoryRepo();
    await expect(repo.updateRun("nope", { status: "triage" }, 0)).rejects.toBeInstanceOf(NotFoundError);
    await expect(repo.decideApprovalRow("nope", { status: "approved", decided_by: null, reason: null, final_terms: null, is_override: false })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("pendingApprovalForRun returns the newest pending", async () => {
    const repo = new MemoryRepo();
    const run = await newRun(repo);
    await newApproval(repo, run.id);
    const b = await newApproval(repo, run.id);
    expect((await repo.pendingApprovalForRun(run.id))?.id).toBe(b.id);
  });

  it("findMemories is newest first, ties by insertion (later first)", async () => {
    const repo = new MemoryRepo();
    await repo.addMemory({ scope: "firm", subject: "A", sector: "S", content: "1", source_run_id: null });
    await repo.addMemory({ scope: "firm", subject: "B", sector: "S", content: "2", source_run_id: null });
    const got = (await repo.findMemories({ scope: "firm", sector: "S" })).map((m) => m.subject);
    expect(got).toEqual(["B", "A"]);
  });
});
