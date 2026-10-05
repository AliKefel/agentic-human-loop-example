import { describe, expect, it } from "vitest";
import { diffConfigs } from "@/lib/config-diff";
import { CONFIG_V1 } from "@/lib/mock/seed-config";
import type { HarnessConfig } from "@/lib/types";

const v2 = (patch: (c: HarnessConfig) => void): HarnessConfig => {
  const c = structuredClone(CONFIG_V1);
  c.id = "other"; c.version = 2; c.is_active = false; c.created_at = "2026-02-02T00:00:00.000Z"; c.created_by = null;
  patch(c);
  return c;
};

describe("diffConfigs", () => {
  it("is empty for identical configs, ignoring id/version/created_at/is_active/created_by", () => {
    expect(diffConfigs(CONFIG_V1, v2(() => {}))).toEqual([]);
  });

  it("reports thresholds.auto_max_amount with dotted path", () => {
    expect(diffConfigs(CONFIG_V1, v2((c) => { c.thresholds.auto_max_amount = 300000; }))).toEqual([
      { path: "thresholds.auto_max_amount", before: 150000, after: 300000 },
    ]);
  });

  it("deep paths, arrays as one entry, added keys, autonomy and notes", () => {
    const d = diffConfigs(CONFIG_V1, v2((c) => {
      c.autonomy_level = 3;
      c.thresholds.sla_hours.exception = 4;
      c.reliability.backoff_ms = [250, 500];
      c.permissions.market.data = ["pitch", "market", "portfolio"];
      c.notes = "v2";
    }));
    expect(d).toEqual([
      { path: "autonomy_level", before: 2, after: 3 },
      { path: "thresholds.sla_hours.exception", before: 8, after: 4 },
      { path: "reliability.backoff_ms", before: [500, 1000], after: [250, 500] },
      { path: "permissions.market.data", before: ["pitch", "market"], after: ["pitch", "market", "portfolio"] },
      { path: "notes", before: CONFIG_V1.notes, after: "v2" },
    ]);
  });

  it("treats arrays by value (same contents → no entry) and reports missing keys as undefined", () => {
    const b = v2((c) => { c.permissions.market.tools = [...c.permissions.market.tools]; (c.permissions as Record<string, unknown>).intern = { tools: [], data: [] }; });
    expect(diffConfigs(CONFIG_V1, b)).toEqual([{ path: "permissions.intern", before: undefined, after: { tools: [], data: [] } }]);
  });
});
