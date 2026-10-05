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

describe("MemoryRepo.listApprovals", () => {
  it("joins run + pitch fields and filters by status and kind (oldest first)", async () => {
    const { MemoryRepo: R } = await import("@/lib/harness/repo-memory");
    const repo = new R();
    const pitch = await repo.getPitchBySlug("pawprint");
    const run = await repo.createRun({ pitch_id: pitch.id, config_version: 1, autonomy_level: 2, started_by: null });
    await repo.updateRun(run.id, { status: "awaiting_approval" });
    const base = { run_id: run.id, required_role: "partner" as const, rule_fired: "r", ai_recommendation: "invest" as const, original_terms: { amount: 1, equity_pct: 1 }, sla_due: new Date().toISOString() };
    const a1 = await repo.addApproval({ ...base, kind: "approval" });
    const a2 = await repo.addApproval({ ...base, kind: "exception" });
    await repo.decideApprovalRow(a2.id, { status: "approved", decided_by: null, reason: null, final_terms: null, is_override: false });
    const all = await repo.listApprovals();
    expect(all.map((a) => a.id)).toEqual([a1.id, a2.id]);
    expect(all[0]).toMatchObject({ company: "PawPrint DNA", sector: pitch.sector, autonomy_level: 2, run_status: "awaiting_approval", kind: "approval" });
    expect((await repo.listApprovals({ status: "pending" })).map((a) => a.id)).toEqual([a1.id]);
    expect((await repo.listApprovals({ status: "decided" })).map((a) => a.id)).toEqual([a2.id]);
    expect((await repo.listApprovals({ kind: "exception" })).map((a) => a.id)).toEqual([a2.id]);
    expect(await repo.listApprovals({ status: "pending", kind: "exception" })).toEqual([]);
  });

  it("getApproval unknown id throws NotFoundError", async () => {
    const { MemoryRepo: R } = await import("@/lib/harness/repo-memory");
    const { NotFoundError: NF } = await import("@/lib/harness/errors");
    await expect(new R().getApproval("nope")).rejects.toBeInstanceOf(NF);
  });
  it("incidents: get / update (CAS on expected status) / list joined + filtered, oldest first", async () => {
    const { MemoryRepo: R } = await import("@/lib/harness/repo-memory");
    const { NotFoundError: NF } = await import("@/lib/harness/errors");
    const repo = new R();
    const run = await newRun(repo);
    const base = { run_id: run.id, title: "t", owner_id: GP, handoff: { what_happened: "w", impact: "i", current_state: "c", next_action: "" }, sla_due: new Date().toISOString() };
    const i1 = await repo.addIncident({ ...base, severity: "sev1" });
    const i2 = await repo.addIncident({ ...base, severity: "sev3" });
    expect(await repo.getIncident(i1.id)).toMatchObject({ id: i1.id, status: "open", severity: "sev1", resolved_at: null });
    await expect(repo.getIncident("nope")).rejects.toBeInstanceOf(NF);
    await expect(repo.updateIncident("nope", { status: "acknowledged" })).rejects.toBeInstanceOf(NF);
    expect(await repo.updateIncident(i1.id, { status: "acknowledged" }, "resolved")).toBeNull();
    const up = await repo.updateIncident(i1.id, { status: "acknowledged", owner_id: null }, "open");
    expect(up).toMatchObject({ status: "acknowledged", owner_id: null });
    const all = await repo.listIncidents();
    expect(all.map((i) => i.id)).toEqual([i1.id, i2.id]);
    expect(all[0]).toMatchObject({ company: "BrewBot", run_status: "queued" });
    expect((await repo.listIncidents({ status: "open" })).map((i) => i.id)).toEqual([i2.id]);
    expect((await repo.listIncidents({ run_id: "other" }))).toEqual([]);
    expect((await repo.listIncidents({ run_id: run.id })).length).toBe(2);
  });

  it("listFounderMessages returns the run's thread oldest first", async () => {
    const { MemoryRepo: R } = await import("@/lib/harness/repo-memory");
    const repo = new R();
    const run = await newRun(repo);
    const other = await newRun(repo);
    await repo.addFounderMessage({ run_id: run.id, direction: "to_founder", body: "q", author_id: null });
    await repo.addFounderMessage({ run_id: other.id, direction: "to_founder", body: "x", author_id: null });
    await repo.addFounderMessage({ run_id: run.id, direction: "from_founder", body: "a", author_id: GP });
    const msgs = await repo.listFounderMessages(run.id);
    expect(msgs.map((m) => [m.direction, m.body])).toEqual([["to_founder", "q"], ["from_founder", "a"]]);
  });
});

describe("MemoryRepo list-by-run (run detail view)", () => {
  const call = (runId: string, agent: "market" | "finance", attempt: number) => ({ run_id: runId, agent, purpose: "analyze" as const, model: "m", attempt, fallback_used: false, input_tokens: 1, output_tokens: 1, cost_usd: 0, latency_ms: 1, status: "ok" as const, error: null, output: null });

  it("listCheckpoints returns the run's checkpoints by seq ascending", async () => {
    const repo = new MemoryRepo();
    const run = await newRun(repo);
    const other = await newRun(repo);
    await repo.addCheckpoint({ run_id: run.id, seq: 2, node: "planning", state: {}, duration_ms: 5 });
    await repo.addCheckpoint({ run_id: other.id, seq: 1, node: "triage", state: {}, duration_ms: 1 });
    await repo.addCheckpoint({ run_id: run.id, seq: 1, node: "triage", state: { status: "planning" }, duration_ms: 3 });
    const rows = await repo.listCheckpoints(run.id);
    expect(rows.map((c) => [c.seq, c.node])).toEqual([[1, "triage"], [2, "planning"]]);
    expect(rows[0]).toMatchObject({ run_id: run.id, duration_ms: 3, state: { status: "planning" } });
    expect(rows[0].id).toBeTruthy();
    expect(rows[0].created_at).toBeTruthy();
  });

  it("listAgentCalls / listToolCalls return the run's rows oldest first", async () => {
    const repo = new MemoryRepo();
    const run = await newRun(repo);
    const other = await newRun(repo);
    const a1 = await repo.addAgentCall(call(run.id, "finance", 1));
    await repo.addAgentCall(call(other.id, "market", 1));
    const a2 = await repo.addAgentCall(call(run.id, "finance", 2));
    expect((await repo.listAgentCalls(run.id)).map((c) => c.id)).toEqual([a1, a2]);
    await repo.addToolCall({ run_id: run.id, agent_call_id: a1, agent: "finance", tool: "t1", args: {}, result: null, latency_ms: 1, permitted: true });
    await repo.addToolCall({ run_id: other.id, agent_call_id: null, agent: "market", tool: "tx", args: {}, result: null, latency_ms: 1, permitted: true });
    await repo.addToolCall({ run_id: run.id, agent_call_id: a2, agent: "finance", tool: "t2", args: {}, result: null, latency_ms: 1, permitted: false });
    const tools = await repo.listToolCalls(run.id);
    expect(tools.map((t) => [t.tool, t.permitted])).toEqual([["t1", true], ["t2", false]]);
  });

  it("listApprovalsForRun returns all of the run's approvals oldest first", async () => {
    const repo = new MemoryRepo();
    const run = await newRun(repo);
    const other = await newRun(repo);
    const a = await newApproval(repo, run.id);
    await newApproval(repo, other.id);
    await repo.decideApprovalRow(a.id, { status: "approved", decided_by: GP, reason: null, final_terms: null, is_override: false });
    const b = await newApproval(repo, run.id);
    const rows = await repo.listApprovalsForRun(run.id);
    expect(rows.map((x) => [x.id, x.status])).toEqual([[a.id, "approved"], [b.id, "pending"]]);
  });

  it("getMemoriesByIds returns rows in the requested order, skipping unknown ids", async () => {
    const repo = new MemoryRepo();
    const [m1, m2] = repo.memories;
    const got = await repo.getMemoriesByIds([m2.id, "00000000-0000-0000-0000-00000000dead", m1.id]);
    expect(got.map((m) => m.id)).toEqual([m2.id, m1.id]);
    expect(await repo.getMemoriesByIds([])).toEqual([]);
  });
});
