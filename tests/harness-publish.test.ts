import { describe, expect, it } from "vitest";
import { MemoryRepo } from "@/lib/harness/repo-memory";
import { publishConfig, toDraft, validateConfigDraft } from "@/lib/harness/config";
import { createRun } from "@/lib/harness/runs";
import { ForbiddenError, ValidationError } from "@/lib/harness/errors";
import { CONFIG_V1 } from "@/lib/mock/seed-config";
import { ANALYST_ID, GP_ID, PARTNER_ID, SEED_USERS } from "@/lib/mock/seed-users";
import type { HarnessConfig } from "@/lib/types";

const user = (id: string) => SEED_USERS.find((u) => u.id === id)!;
const GP = user(GP_ID);

const draftOf = (c: HarnessConfig = CONFIG_V1) => toDraft(c);
const draft300 = () => { const d = draftOf(); d.thresholds.auto_max_amount = 300000; d.notes = "Raise auto limit"; return d; };

describe("publishConfig (SPEC §5.6, M10)", () => {
  it.each([PARTNER_ID, ANALYST_ID])("non-GP %s → ForbiddenError, nothing published, config.denied audited", async (id) => {
    const repo = new MemoryRepo();
    await expect(publishConfig(repo, draft300(), user(id))).rejects.toBeInstanceOf(ForbiddenError);
    expect((await repo.listConfigs()).map((c) => c.version)).toEqual([1]);
    expect((await repo.getActiveConfig()).version).toBe(1);
    expect(repo.auditLog.map((a) => a.action)).toEqual(["config.denied"]);
    expect(repo.auditLog[0]).toMatchObject({ actor_id: id, entity: "harness_config" });
  });

  it("GP → version 2 active, v1 inactive, audit config.published {version, diff}", async () => {
    const repo = new MemoryRepo();
    const v2 = await publishConfig(repo, draft300(), GP);
    expect(v2).toMatchObject({ version: 2, is_active: true, created_by: GP_ID, notes: "Raise auto limit" });
    expect(v2.thresholds.auto_max_amount).toBe(300000);
    expect((await repo.getActiveConfig()).version).toBe(2);
    const all = await repo.listConfigs();
    expect(all.map((c) => [c.version, c.is_active])).toEqual([[2, true], [1, false]]);
    const a = repo.auditLog.find((x) => x.action === "config.published")!;
    expect(a).toMatchObject({ actor_id: GP_ID, actor_role: "general_partner", entity: "harness_config", entity_id: v2.id });
    expect(a.details.version).toBe(2);
    expect(a.details.diff).toEqual([
      { path: "thresholds.auto_max_amount", before: 150000, after: 300000 },
      { path: "notes", before: CONFIG_V1.notes, after: "Raise auto limit" },
    ]);
    const v3 = await publishConfig(repo, draftOf(), GP);
    expect(v3.version).toBe(3);
    expect((await repo.listConfigs()).filter((c) => c.is_active).map((c) => c.version)).toEqual([3]);
  });

  it("a run created after publishing uses v2; an older run keeps v1", async () => {
    const repo = new MemoryRepo();
    const pitch = await repo.getPitchBySlug("brewbot");
    const old = await createRun(repo, { pitchId: pitch.id, user: GP });
    await publishConfig(repo, draft300(), GP);
    const fresh = await createRun(repo, { pitchId: pitch.id, user: GP });
    expect(fresh.config_version).toBe(2);
    expect((await repo.getRun(old.id)).config_version).toBe(1);
    expect((await repo.getConfig(1)).thresholds.auto_max_amount).toBe(150000);
  });

  const bad: [string, (d: ReturnType<typeof draftOf>) => void, RegExp][] = [
    ["autonomy 4", (d) => { d.autonomy_level = 4; }, /autonomy/i],
    ["negative threshold", (d) => { d.thresholds.auto_max_amount = -1; }, /auto_max_amount/],
    ["zero sla", (d) => { d.thresholds.sla_hours.approval = 0; }, /sla_hours\.approval/],
    ["partner_limit > fund max", (d) => { d.thresholds.partner_limit = 3_000_000; }, /partner_limit/],
    ["retries 6", (d) => { d.reliability.retries = 6; }, /retries/],
    ["timeout 500", (d) => { d.reliability.timeout_ms = 500; }, /timeout_ms/],
    ["missing agent", (d) => { delete (d.permissions as Record<string, unknown>).skeptic; }, /skeptic/],
    ["unknown tool", (d) => { d.permissions.market.tools = ["send_offer"]; }, /send_offer/],
    ["unknown data scope", (d) => { d.permissions.market.data = ["bank_accounts"]; }, /bank_accounts/],
    ["schema: string amount", (d) => { (d.thresholds as Record<string, unknown>).fund_max_check = "lots"; }, /fund_max_check/],
  ];
  it.each(bad)("rejects %s with a readable ValidationError", async (_n, mutate, msg) => {
    const repo = new MemoryRepo();
    const d = draftOf();
    mutate(d);
    expect(() => validateConfigDraft(d)).toThrow(ValidationError);
    await expect(publishConfig(repo, d, GP)).rejects.toThrow(msg);
    expect((await repo.listConfigs()).map((c) => c.version)).toEqual([1]);
  });

  it("accepts the v1 draft as valid", () => {
    expect(validateConfigDraft(draftOf())).toEqual(draftOf());
  });
});
