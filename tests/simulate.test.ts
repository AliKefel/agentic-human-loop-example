import { beforeAll, describe, expect, it } from "vitest";
import { MemoryRepo } from "@/lib/harness/repo-memory";
import { createRun } from "@/lib/harness/runs";
import { runToRest } from "@/lib/harness/machine";
import { answerFounder } from "@/lib/harness/founder";
import { SCRIPTED_FOUNDER_REPLY } from "@/lib/mock/fixtures";
import { simulate, SIM_HOURS } from "@/lib/simulate";
import { CONFIG_V1 } from "@/lib/mock/seed-config";
import { GP_ID, SEED_USERS } from "@/lib/mock/seed-users";
import type { HarnessConfig, Run } from "@/lib/types";

const GP = SEED_USERS.find((u) => u.id === GP_ID)!;
const SLUGS = ["brewbot", "pawprint", "greengrid", "ledgerleaf", "snackstack", "fitflow", "moonmint", "kidcode", "dronedrop", "skinsync", "thriftloop", "mealmate"];

type SimRun = Pick<Run, "id" | "state" | "degraded" | "autonomy_level" | "status" | "started_at">;
let runs: SimRun[] = [];
const bySlug: Record<string, SimRun> = {};

beforeAll(async () => {
  const repo = new MemoryRepo();
  for (const slug of SLUGS) {
    const pitch = await repo.getPitchBySlug(slug);
    const run = await runToRest(repo, (await createRun(repo, { pitchId: pitch.id, autonomyLevel: 2, user: GP })).id);
    bySlug[slug] = run;
  }
  runs = await repo.listRunsForSimulation(100);
});

const withAuto = (amount: number): HarnessConfig => ({ ...CONFIG_V1, thresholds: { ...CONFIG_V1.thresholds, auto_max_amount: amount } });

describe("listRunsForSimulation", () => {
  it("returns only settled runs with the simulation columns, newest first", () => {
    expect(runs).toHaveLength(12);
    expect(Object.keys(runs[0]).sort()).toEqual(["autonomy_level", "degraded", "id", "started_at", "state", "status"]);
    expect(runs[runs.length - 1].id).toBe(bySlug.brewbot.id);
  });
});

describe("simulate (SPEC §5.6) over the 12 L2 seed outcomes", () => {
  it("reproduces SPEC §4 counts with config v1 at L2 (greengrid skipped: no synthesis)", () => {
    const s = simulate(runs, CONFIG_V1, 2);
    expect(s).toEqual({
      runs: 11, skipped: 1,
      auto_send: 3, auto_pass: 0, needs_approval: 3, exception: 2, escalate: 2, need_info: 1,
      humanHours: 3 * 0.25 + 2 * 0.5 + 2 * 1 + 0.25,
      capitalAuto: 120000 + 80000 + 90000,
    });
  });

  it("raising auto_max_amount to $300K moves exactly ledgerleaf and dronedrop to auto_send", () => {
    const before = simulate(runs, CONFIG_V1, 2);
    const after = simulate(runs, withAuto(300000), 2);
    expect(after.auto_send - before.auto_send).toBe(2);
    expect(before.needs_approval - after.needs_approval).toBe(2);
    expect(after.humanHours).toBeCloseTo(before.humanHours - 0.5);
    expect(after.capitalAuto - before.capitalAuto).toBe(200000 + 250000);
    // per-run: pawprint ($500K) stays
    expect(simulate([bySlug.pawprint], withAuto(300000), 2).needs_approval).toBe(1);
    expect(simulate([bySlug.ledgerleaf], withAuto(300000), 2).auto_send).toBe(1);
    expect(simulate([bySlug.dronedrop], withAuto(300000), 2).auto_send).toBe(1);
  });

  it("uses the given autonomy level: L0 sends everything to a human, L3 auto-sends clean offers", () => {
    const l0 = simulate(runs, CONFIG_V1, 0);
    expect(l0.auto_send).toBe(0);
    expect(l0.needs_approval).toBe(6);
    const l3 = simulate(runs, CONFIG_V1, 3);
    expect(l3.auto_send).toBe(6);
    expect(l3.escalate).toBe(2);
  });

  it("is pure and exposes the hour weights", () => {
    expect(SIM_HOURS).toEqual({ needs_approval: 0.25, exception: 0.5, escalate: 1, need_info: 0.25 });
    const copy = structuredClone(runs);
    simulate(runs, CONFIG_V1, 2);
    expect(runs).toEqual(copy);
    expect(simulate([], CONFIG_V1, 2)).toMatchObject({ runs: 0, skipped: 0, humanHours: 0, capitalAuto: 0 });
  });

  it("re-decides a founder-answered run with the founder already asked (fitflow → auto_send)", async () => {
    const repo = new MemoryRepo();
    const pitch = await repo.getPitchBySlug("fitflow");
    const run = await runToRest(repo, (await createRun(repo, { pitchId: pitch.id, autonomyLevel: 2, user: GP })).id);
    await answerFounder(repo, run.id, GP, SCRIPTED_FOUNDER_REPLY.fitflow);
    await runToRest(repo, run.id);
    const s = simulate(await repo.listRunsForSimulation(10), CONFIG_V1, 2);
    expect(s).toMatchObject({ runs: 1, auto_send: 1, need_info: 0, capitalAuto: 100000 });
  });
});
