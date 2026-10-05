import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { CONFIG_V1 } from "@/lib/mock/seed-config";

describe("CONFIG_V1 matches supabase/seed.sql", () => {
  it("has identical thresholds/budgets/reliability/permissions", () => {
    const sql = readFileSync("supabase/seed.sql", "utf8");
    const block = sql.slice(sql.indexOf("insert into harness_configs"), sql.indexOf("insert into pitches"));
    const lits = [...block.matchAll(/'(\{[\s\S]*?\})'/g)].map((m) => JSON.parse(m[1]));
    expect(lits).toHaveLength(4);
    const [thresholds, budgets, reliability, permissions] = lits;
    expect(CONFIG_V1.thresholds).toEqual(thresholds);
    expect(CONFIG_V1.budgets).toEqual(budgets);
    expect(CONFIG_V1.reliability).toEqual(reliability);
    expect(CONFIG_V1.permissions).toEqual(permissions);
    expect(CONFIG_V1.version).toBe(1);
    expect(CONFIG_V1.is_active).toBe(true);
    expect(CONFIG_V1.autonomy_level).toBe(2);
    expect(block).toContain(CONFIG_V1.created_by!);
  });
});
