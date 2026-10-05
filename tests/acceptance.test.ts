import { describe, expect, it } from "vitest";
import { MemoryRepo } from "@/lib/harness/repo-memory";
import { createRun } from "@/lib/harness/runs";
import { runToRest } from "@/lib/harness/machine";
import { GP_ID, SEED_USERS } from "@/lib/mock/seed-users";
import type { Role, RunStatus } from "@/lib/types";

const GP = SEED_USERS.find((u) => u.id === GP_ID)!;

// SPEC §4 — Mock mode, L2 Assisted, config v1. M6 completes the remaining five pitches.
const EXPECTED: { slug: string; status: RunStatus; rule: string; role?: Role }[] = [
  { slug: "brewbot", status: "offer_sent", rule: "l2.auto_send" },
  { slug: "pawprint", status: "awaiting_approval", rule: "l2.over_threshold", role: "general_partner" },
  { slug: "greengrid", status: "passed", rule: "triage.fast_pass" },
  { slug: "ledgerleaf", status: "awaiting_approval", rule: "l2.over_threshold", role: "partner" },
  { slug: "kidcode", status: "offer_sent", rule: "l2.auto_send" },
  { slug: "dronedrop", status: "awaiting_approval", rule: "l2.over_threshold", role: "partner" },
  { slug: "mealmate", status: "offer_sent", rule: "l2.auto_send" },
];

describe("acceptance (SPEC §4, L2)", () => {
  it.each(EXPECTED)("$slug → $status ($rule)", async (e) => {
    const repo = new MemoryRepo();
    const pitch = await repo.getPitchBySlug(e.slug);
    const run = await runToRest(repo, (await createRun(repo, { pitchId: pitch.id, autonomyLevel: 2, user: GP })).id);
    expect(run.status).toBe(e.status);
    expect(run.decision?.rule).toBe(e.rule);
    if (e.role) {
      expect(run.decision?.required_role).toBe(e.role);
      expect(repo.approvals.find((a) => a.run_id === run.id)).toMatchObject({ kind: "approval", status: "pending", required_role: e.role });
    }
    if (e.slug === "greengrid") expect(repo.agentCalls.filter((c) => c.run_id === run.id && c.purpose === "analyze")).toHaveLength(0);
    if (e.slug === "ledgerleaf") expect(repo.agentCalls.some((c) => c.run_id === run.id && c.agent === "finance" && c.fallback_used && c.status === "ok")).toBe(true);
    if (e.slug === "dronedrop") expect(repo.agentCalls.some((c) => c.run_id === run.id && c.agent === "product" && c.status === "schema_fail")).toBe(true);
    if (e.slug === "mealmate") expect(repo.toolCalls.some((t) => t.run_id === run.id && !t.permitted)).toBe(true);
    if (e.status === "offer_sent") expect(run.final_terms).toEqual((await repo.getRun(run.id)).state.synthesis?.terms);
  });
});
