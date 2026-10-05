import { describe, expect, it } from "vitest";
import { MemoryRepo } from "@/lib/harness/repo-memory";
import { createRun } from "@/lib/harness/runs";
import { runToRest } from "@/lib/harness/machine";
import { answerFounder } from "@/lib/harness/founder";
import { SCRIPTED_FOUNDER_REPLY } from "@/lib/mock/fixtures";
import { GP_ID, SEED_USERS } from "@/lib/mock/seed-users";
import type { Role, RunStatus } from "@/lib/types";

const GP = SEED_USERS.find((u) => u.id === GP_ID)!;

// SPEC §4 — Mock mode, L2 Assisted, config v1. All 12 seeded pitches.
const EXPECTED: { slug: string; status: RunStatus; rule: string; role?: Role; kind?: "approval" | "exception" | "escalation"; severity?: "sev1" | "sev2" }[] = [
  { slug: "brewbot", status: "offer_sent", rule: "l2.auto_send" },
  { slug: "pawprint", status: "awaiting_approval", rule: "l2.over_threshold", role: "general_partner" },
  { slug: "greengrid", status: "passed", rule: "triage.fast_pass" },
  { slug: "ledgerleaf", status: "awaiting_approval", rule: "l2.over_threshold", role: "partner" },
  { slug: "snackstack", status: "in_review", rule: "exception.disagreement", role: "partner", kind: "exception" },
  { slug: "fitflow", status: "offer_sent", rule: "l2.auto_send" }, // awaiting_founder → scripted answer → offer_sent
  { slug: "moonmint", status: "escalated", rule: "escalate.red_flag", role: "general_partner", kind: "escalation", severity: "sev2" },
  { slug: "kidcode", status: "offer_sent", rule: "l2.auto_send" },
  { slug: "dronedrop", status: "awaiting_approval", rule: "l2.over_threshold", role: "partner" },
  { slug: "skinsync", status: "escalated", rule: "escalate.red_flag", role: "general_partner", kind: "escalation", severity: "sev1" },
  { slug: "thriftloop", status: "in_review", rule: "exception.degraded", role: "partner", kind: "exception" },
  { slug: "mealmate", status: "offer_sent", rule: "l2.auto_send" },
];

describe("acceptance (SPEC §4, L2)", () => {
  it("covers all 12 seeded pitches", () => expect(new Set(EXPECTED.map((e) => e.slug)).size).toBe(12));

  it.each(EXPECTED)("$slug → $status ($rule)", async (e) => {
    const repo = new MemoryRepo();
    const pitch = await repo.getPitchBySlug(e.slug);
    let run = await runToRest(repo, (await createRun(repo, { pitchId: pitch.id, autonomyLevel: 2, user: GP })).id);
    if (e.slug === "fitflow") {
      expect(run.status).toBe("awaiting_founder");
      expect(repo.founderMessages.filter((m) => m.run_id === run.id && m.direction === "to_founder")).toHaveLength(1);
      await answerFounder(repo, run.id, GP, SCRIPTED_FOUNDER_REPLY.fitflow);
      run = await runToRest(repo, run.id);
      expect(run.final_terms).toEqual({ amount: 100000, equity_pct: 15 });
    }
    expect(run.status).toBe(e.status);
    expect(run.decision?.rule).toBe(e.rule);
    if (e.role) {
      expect(run.decision?.required_role).toBe(e.role);
      expect(repo.approvals.find((a) => a.run_id === run.id)).toMatchObject({ kind: e.kind ?? "approval", status: "pending", required_role: e.role });
    }
    const incidents = repo.incidents.filter((i) => i.run_id === run.id);
    if (e.severity) expect(incidents.map((i) => i.severity)).toEqual([e.severity]);
    else expect(incidents).toHaveLength(0);
    if (e.slug === "thriftloop") expect(run.degraded).toBe(true);
    if (e.slug === "skinsync") {
      const blobs = [
        ...repo.agentCalls.filter((c) => c.run_id === run.id).map((c) => c.output),
        run.state.synthesis, run.final_terms,
        ...repo.approvals.filter((a) => a.run_id === run.id).map((a) => a.original_terms),
      ];
      for (const b of blobs) expect(JSON.stringify(b ?? null)).not.toContain("2000000");
    }
    if (e.slug === "greengrid") expect(repo.agentCalls.filter((c) => c.run_id === run.id && c.purpose === "analyze")).toHaveLength(0);
    if (e.slug === "ledgerleaf") expect(repo.agentCalls.some((c) => c.run_id === run.id && c.agent === "finance" && c.fallback_used && c.status === "ok")).toBe(true);
    if (e.slug === "dronedrop") expect(repo.agentCalls.some((c) => c.run_id === run.id && c.agent === "product" && c.status === "schema_fail")).toBe(true);
    if (e.slug === "mealmate") expect(repo.toolCalls.some((t) => t.run_id === run.id && !t.permitted)).toBe(true);
    if (e.status === "offer_sent") expect(run.final_terms).toEqual((await repo.getRun(run.id)).state.synthesis?.terms);
  });
});
