import { describe, expect, it } from "vitest";
import { checkTool, dataContext } from "@/lib/harness/permissions";
import { CONFIG_V1 } from "@/lib/mock/seed-config";
import type { HarnessConfig } from "@/lib/types";
import { pitchFixture } from "./helpers";

const pitch = pitchFixture("mealmate");

describe("checkTool", () => {
  it("allows a granted tool whose data scope is granted", () => {
    expect(checkTool(CONFIG_V1, "market", "market_size_lookup").allowed).toBe(true);
    expect(checkTool(CONFIG_V1, "skeptic", "red_flag_scanner").allowed).toBe(true);
  });
  it("denies tools not in the agent's tool list", () => {
    const r = checkTool(CONFIG_V1, "market", "portfolio_lookup");
    expect(r.allowed).toBe(false);
    expect(r.reason).toEqual(expect.any(String));
    expect(checkTool(CONFIG_V1, "lead", "red_flag_scanner").allowed).toBe(false);
  });
  it("denies a listed tool when its data scope is not granted", () => {
    const config: HarnessConfig = structuredClone(CONFIG_V1);
    config.permissions.market.tools.push("portfolio_lookup");
    const r = checkTool(config, "market", "portfolio_lookup");
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/portfolio/);
  });
  it("denies unknown tools", () => {
    expect(checkTool(CONFIG_V1, "market", "rm_rf").allowed).toBe(false);
  });
});

describe("dataContext", () => {
  it("never renders confidential portfolio data without the portfolio scope", () => {
    for (const a of ["market", "finance", "product", "skeptic"] as const) {
      expect(dataContext(CONFIG_V1, a, pitch)).not.toContain("CONFIDENTIAL");
    }
  });
  it("renders only granted scopes", () => {
    const market = dataContext(CONFIG_V1, "market", pitch);
    expect(market).toContain(pitch.company);
    expect(market).toMatch(/Market data/);
    expect(market).not.toMatch(/Comparable deals/);
    expect(dataContext(CONFIG_V1, "product", pitch)).toMatch(/Comparable deals/);
    expect(dataContext(CONFIG_V1, "product", pitch)).not.toMatch(/Market data/);
  });
  it("renders portfolio when granted", () => {
    const config: HarnessConfig = structuredClone(CONFIG_V1);
    config.permissions.market.data.push("portfolio");
    expect(dataContext(config, "market", pitch)).toContain("CONFIDENTIAL");
  });
});
