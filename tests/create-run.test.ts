import { describe, expect, it } from "vitest";
import { MemoryRepo } from "@/lib/harness/repo-memory";
import { NotFoundError } from "@/lib/harness/errors";
import { createRun } from "@/lib/harness/runs";
import { initialRunState } from "@/lib/harness/run-state";
import { GP_ID, SEED_USERS } from "@/lib/mock/seed-users";

const gp = SEED_USERS.find((u) => u.id === GP_ID)!;

describe("createRun", () => {
  it("creates a queued run with config defaults, checkpoint 0 and audit", async () => {
    const repo = new MemoryRepo();
    const pitch = await repo.getPitchBySlug("brewbot");
    const run = await createRun(repo, { pitchId: pitch.id, user: gp });
    expect(run.status).toBe("queued");
    expect(run.config_version).toBe(1);
    expect(run.autonomy_level).toBe(2);
    expect(run.started_by).toBe(GP_ID);
    expect(repo.checkpoints).toHaveLength(1);
    expect(repo.checkpoints[0]).toMatchObject({ run_id: run.id, seq: 0, node: "queued", state: initialRunState() });
    expect(repo.auditLog).toHaveLength(1);
    expect(repo.auditLog[0]).toMatchObject({ action: "run.created", entity: "run", entity_id: run.id, actor_id: GP_ID, actor_role: "general_partner" });
    expect(repo.auditLog[0].details).toEqual({ pitch: "brewbot", autonomy_level: 2, config_version: 1 });
  });

  it("honours an explicit autonomy level of 0", async () => {
    const repo = new MemoryRepo();
    const pitch = await repo.getPitchBySlug("brewbot");
    const run = await createRun(repo, { pitchId: pitch.id, autonomyLevel: 0, user: gp });
    expect(run.autonomy_level).toBe(0);
    expect(repo.auditLog[0].details.autonomy_level).toBe(0);
  });

  it("throws NotFoundError for an unknown pitch and writes nothing", async () => {
    const repo = new MemoryRepo();
    await expect(createRun(repo, { pitchId: "00000000-0000-0000-0000-00000000dead", user: gp })).rejects.toBeInstanceOf(NotFoundError);
    expect(repo.runs).toHaveLength(0);
    expect(repo.auditLog).toHaveLength(0);
  });
});

describe("MemoryRepo pitch methods", () => {
  it("listPitches returns 12 seeded pitches; createPitch adds one", async () => {
    const repo = new MemoryRepo();
    expect(await repo.listPitches()).toHaveLength(12);
    const base = await repo.getPitchBySlug("brewbot");
    const { id, created_at, ...rest } = base;
    const made = await repo.createPitch({ ...rest, slug: "new-co-abcd", company: "New Co" });
    expect(made.id).not.toBe(id);
    expect(await repo.listPitches()).toHaveLength(13);
    await expect(repo.createPitch({ ...rest, slug: "new-co-abcd" })).rejects.toThrow();
  });

  it("latestRunsByPitch returns the newest run per pitch", async () => {
    const repo = new MemoryRepo();
    const a = await repo.getPitchBySlug("brewbot");
    const r1 = await repo.createRun({ pitch_id: a.id, config_version: 1, autonomy_level: 2, started_by: GP_ID });
    const r2 = await repo.createRun({ pitch_id: a.id, config_version: 1, autonomy_level: 2, started_by: GP_ID });
    await repo.updateRun(r2.id, { status: "passed" });
    const map = await repo.latestRunsByPitch();
    expect(Object.keys(map)).toEqual([a.id]);
    expect(map[a.id]).toMatchObject({ id: r2.id, status: "passed" });
    expect(map[a.id].id).not.toBe(r1.id);
  });
});
