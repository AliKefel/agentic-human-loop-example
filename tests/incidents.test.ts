import { describe, expect, it } from "vitest";
import { MemoryRepo } from "@/lib/harness/repo-memory";
import { createRun } from "@/lib/harness/runs";
import { advanceRun, HANDLERS, runToRest } from "@/lib/harness/machine";
import { decideApproval } from "@/lib/harness/approvals";
import { handoffIncident, openIncident, setIncidentStatus, severityForFlags } from "@/lib/harness/incidents";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/harness/errors";
import { ANALYST_ID, GP_ID, PARTNER_ID, SEED_USERS } from "@/lib/mock/seed-users";
import type { Run } from "@/lib/types";

const user = (id: string) => SEED_USERS.find((u) => u.id === id)!;
const GP = user(GP_ID);
const PARTNER = user(PARTNER_ID);
const ANALYST = user(ANALYST_ID);

async function toRest(repo: MemoryRepo, slug: string, autonomyLevel: 0 | 1 | 2 | 3 = 2) {
  const pitch = await repo.getPitchBySlug(slug);
  const run = await createRun(repo, { pitchId: pitch.id, autonomyLevel, user: GP });
  return runToRest(repo, run.id);
}
const incidentsOf = (repo: MemoryRepo, run: Run) => repo.incidents.filter((i) => i.run_id === run.id);
const hours = (i: { sla_due: string; created_at: string }) => (new Date(i.sla_due).getTime() - new Date(i.created_at).getTime()) / 3600e3;

describe("severityForFlags", () => {
  it("prompt_injection → sev1 (wins over inconsistent_financials); inconsistent_financials → sev2; other high → sev2", () => {
    expect(severityForFlags([{ code: "prompt_injection", severity: "high", detail: "d" }])).toMatchObject({ severity: "sev1", title: "Prompt injection attempt in pitch" });
    expect(severityForFlags([{ code: "inconsistent_financials", severity: "high", detail: "d" }, { code: "prompt_injection", severity: "high", detail: "d" }]).severity).toBe("sev1");
    expect(severityForFlags([{ code: "inconsistent_financials", severity: "high", detail: "d" }]).severity).toBe("sev2");
    expect(severityForFlags([{ code: "other", severity: "high", detail: "d" }]).severity).toBe("sev2");
  });
});

describe("escalations open incidents", () => {
  it("moonmint → escalated + sev2 incident owned by GP, 8h SLA, structured handoff, audited", async () => {
    const repo = new MemoryRepo();
    const run = await toRest(repo, "moonmint");
    expect(run.status).toBe("escalated");
    const [inc] = incidentsOf(repo, run);
    expect(incidentsOf(repo, run)).toHaveLength(1);
    expect(inc).toMatchObject({ severity: "sev2", status: "open", owner_id: GP_ID });
    expect(hours(inc)).toBeCloseTo(8, 1);
    const h = inc.handoff as Record<string, string>;
    expect(Object.keys(h).sort()).toEqual(["current_state", "impact", "next_action", "what_happened"]);
    expect(h.next_action).toBe("");
    expect(h.what_happened).toMatch(/escalate\.red_flag/);
    expect(h.what_happened).toMatch(/\$48K/);
    expect(h.impact).toBe("$750,000 offer blocked before sending");
    expect(h.current_state).toMatch(/escalated/);
    expect(h.current_state).toMatch(new RegExp(`checkpoint #${run.step_count}\\b`));
    expect(repo.auditLog.find((a) => a.action === "incident.created")).toMatchObject({ actor_role: "system", entity: "incident", entity_id: inc.id });
    // the escalation approval is still created first
    expect(repo.approvals.find((a) => a.run_id === run.id)).toMatchObject({ kind: "escalation", status: "pending" });
  });

  it("skinsync → escalated + sev1 (4h); the injected $2M never appears in any output, synthesis, terms or approval", async () => {
    const repo = new MemoryRepo();
    const run = await toRest(repo, "skinsync");
    expect(run.status).toBe("escalated");
    const [inc] = incidentsOf(repo, run);
    expect(inc).toMatchObject({ severity: "sev1", title: "Prompt injection attempt in pitch" });
    expect(hours(inc)).toBeCloseTo(4, 1);
    const blobs = [
      ...repo.agentCalls.filter((c) => c.run_id === run.id).map((c) => c.output),
      run.state.synthesis, run.final_terms,
      ...repo.approvals.filter((a) => a.run_id === run.id).map((a) => a.original_terms),
    ];
    for (const b of blobs) expect(JSON.stringify(b ?? null)).not.toContain("2000000");
  });

  it("resolving the escalation (GP) does not resolve the incident; partner cannot resolve it", async () => {
    const repo = new MemoryRepo();
    const run = await toRest(repo, "moonmint");
    const a = repo.approvals.find((x) => x.run_id === run.id)!;
    await expect(decideApproval(repo, a.id, PARTNER, { type: "reject" }, "no")).rejects.toBeInstanceOf(ForbiddenError);
    const done = await decideApproval(repo, a.id, GP, { type: "reject" }, "Revenue discrepancy");
    expect(done.status).toBe("passed");
    expect(incidentsOf(repo, run)[0].status).toBe("open");
  });

  it("no incident when a cancel lands before the escalation effects", async () => {
    const repo = new MemoryRepo();
    const pitch = await repo.getPitchBySlug("moonmint");
    const run = await createRun(repo, { pitchId: pitch.id, autonomyLevel: 2, user: GP });
    let r = await repo.getRun(run.id);
    while (r.status !== "policy_check") r = (await advanceRun(repo, run.id)).run;
    const original = HANDLERS.policy_check!;
    HANDLERS.policy_check = async (ctx) => {
      const res = await original(ctx);
      return { ...res, effects: async (committed) => { await repo.updateRun(run.id, { status: "cancelled", step_count: committed.step_count + 1 }); await res.effects!(committed); } };
    };
    try {
      await advanceRun(repo, run.id);
    } finally {
      HANDLERS.policy_check = original;
    }
    expect(incidentsOf(repo, r)).toHaveLength(0);
  });
});

describe("failed runs open sev3 incidents", () => {
  it("a handler error fails the run and opens one sev3 incident (24h) after the CAS", async () => {
    const repo = new MemoryRepo();
    const pitch = await repo.getPitchBySlug("brewbot");
    const run = await createRun(repo, { pitchId: pitch.id, autonomyLevel: 2, user: GP });
    const original = HANDLERS.planning!;
    HANDLERS.planning = async () => { throw new Error("boom"); };
    let done: Run;
    try {
      done = await runToRest(repo, run.id);
    } finally {
      HANDLERS.planning = original;
    }
    expect(done.status).toBe("failed");
    const incs = incidentsOf(repo, done);
    expect(incs).toHaveLength(1);
    expect(incs[0]).toMatchObject({ severity: "sev3", owner_id: GP_ID, status: "open" });
    expect(hours(incs[0])).toBeCloseTo(24, 1);
    expect((incs[0].handoff as Record<string, string>).what_happened).toMatch(/boom/);
    expect((incs[0].handoff as Record<string, string>).current_state).toMatch(/failed/);
  });

  it("max_steps failure opens a sev3 incident", async () => {
    const repo = new MemoryRepo();
    const pitch = await repo.getPitchBySlug("brewbot");
    const run = await createRun(repo, { pitchId: pitch.id, autonomyLevel: 2, user: GP });
    await repo.updateRun(run.id, { step_count: 20 });
    const done = await runToRest(repo, run.id);
    expect(done).toMatchObject({ status: "failed", error: "max_steps_exceeded" });
    expect(incidentsOf(repo, done)).toMatchObject([{ severity: "sev3" }]);
  });

  it("a failRun that loses its CAS opens no incident", async () => {
    const repo = new MemoryRepo();
    const pitch = await repo.getPitchBySlug("brewbot");
    const run = await createRun(repo, { pitchId: pitch.id, autonomyLevel: 2, user: GP });
    const original = HANDLERS.queued!;
    HANDLERS.queued = async () => {
      await repo.updateRun(run.id, { status: "cancelled", step_count: 5 }); // someone else wins
      throw new Error("boom");
    };
    try {
      await advanceRun(repo, run.id);
    } finally {
      HANDLERS.queued = original;
    }
    expect(repo.incidents).toHaveLength(0);
  });
});

describe("incident lifecycle", () => {
  async function setup() {
    const repo = new MemoryRepo();
    const run = await toRest(repo, "moonmint");
    return { repo, run, inc: incidentsOf(repo, run)[0] };
  }

  it("openIncident uses SLA per severity and GP owner", async () => {
    const repo = new MemoryRepo();
    const pitch = await repo.getPitchBySlug("brewbot");
    const run = await createRun(repo, { pitchId: pitch.id, user: GP });
    const inc = await openIncident(repo, run, pitch, { severity: "sev3", title: "t", whatHappened: "w", impact: "i" });
    expect(inc).toMatchObject({ owner_id: GP_ID, severity: "sev3", handoff: { what_happened: "w", impact: "i", next_action: "" } });
    expect(hours(inc)).toBeCloseTo(24, 1);
  });

  it("handoff reassigns owner, stores next action, audits incident.handoff {from,to}", async () => {
    const { repo, inc } = await setup();
    await handoffIncident(repo, inc.id, PARTNER_ID, GP, "Call the founder about revenue");
    const after = await repo.getIncident(inc.id);
    expect(after.owner_id).toBe(PARTNER_ID);
    expect((after.handoff as Record<string, string>).next_action).toBe("Call the founder about revenue");
    expect((after.handoff as Record<string, string>).what_happened).toBe((inc.handoff as Record<string, string>).what_happened);
    expect(repo.auditLog.find((a) => a.action === "incident.handoff")).toMatchObject({ actor_id: GP_ID, entity: "incident", entity_id: inc.id, details: { from: GP_ID, to: PARTNER_ID } });
  });

  it("handoff: only owner or GP; unknown user → ValidationError; resolved → ConflictError; unknown incident → NotFoundError", async () => {
    const { repo, inc } = await setup();
    await expect(handoffIncident(repo, inc.id, ANALYST_ID, PARTNER, "x")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(handoffIncident(repo, inc.id, "not-a-user", GP, "x")).rejects.toBeInstanceOf(ValidationError);
    await handoffIncident(repo, inc.id, PARTNER_ID, GP, "x");
    await handoffIncident(repo, inc.id, ANALYST_ID, PARTNER, "over to you"); // new owner can hand off
    expect((await repo.getIncident(inc.id)).owner_id).toBe(ANALYST_ID);
    await setIncidentStatus(repo, inc.id, "resolved", GP);
    await expect(handoffIncident(repo, inc.id, GP_ID, GP, "x")).rejects.toBeInstanceOf(ConflictError);
    await expect(handoffIncident(repo, "nope", GP_ID, GP, "x")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("acknowledge (any role) then resolve (owner or GP) with resolved_at and audits", async () => {
    const { repo, inc } = await setup();
    await setIncidentStatus(repo, inc.id, "acknowledged", ANALYST);
    expect((await repo.getIncident(inc.id)).status).toBe("acknowledged");
    await expect(setIncidentStatus(repo, inc.id, "acknowledged", GP)).rejects.toBeInstanceOf(ConflictError);
    await expect(setIncidentStatus(repo, inc.id, "resolved", PARTNER)).rejects.toBeInstanceOf(ForbiddenError);
    await setIncidentStatus(repo, inc.id, "resolved", GP);
    const after = await repo.getIncident(inc.id);
    expect(after.status).toBe("resolved");
    expect(after.resolved_at).not.toBeNull();
    expect(repo.auditLog.filter((a) => a.entity_id === inc.id).map((a) => a.action)).toEqual(["incident.created", "incident.acknowledged", "incident.resolved"]);
    await expect(setIncidentStatus(repo, inc.id, "resolved", GP)).rejects.toBeInstanceOf(ConflictError);
  });

  it("the owner (non-GP) may resolve straight from open", async () => {
    const { repo, inc } = await setup();
    await handoffIncident(repo, inc.id, PARTNER_ID, GP, "");
    await setIncidentStatus(repo, inc.id, "resolved", PARTNER);
    expect((await repo.getIncident(inc.id)).status).toBe("resolved");
  });
});
