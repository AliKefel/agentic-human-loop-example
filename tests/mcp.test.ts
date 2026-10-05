import { describe, it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createTankServer, seedResolvers } from "@/mcp/tools";

async function connect() {
  const server = createTankServer(seedResolvers());
  const client = new Client({ name: "test", version: "0.0.0" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  return client;
}
const text = (r: unknown) => ((r as { content: { text: string }[] }).content[0].text);

describe("MCP tool server", () => {
  it("lists the 5 tools", async () => {
    const c = await connect();
    const { tools } = await c.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(["comparable_deals_search", "market_size_lookup", "portfolio_lookup", "red_flag_scanner", "valuation_calculator"]);
  });
  it("valuation_calculator brewbot/finance", async () => {
    const c = await connect();
    const r = await c.callTool({ name: "valuation_calculator", arguments: { pitch_slug: "brewbot", agent: "finance" } });
    expect(r.isError).toBeFalsy();
    expect(JSON.parse(text(r)).implied_valuation).toBe(1200000);
  });
  it("portfolio_lookup denied for market", async () => {
    const c = await connect();
    const r = await c.callTool({ name: "portfolio_lookup", arguments: { pitch_slug: "brewbot", agent: "market" } });
    expect(r.isError).toBe(true);
    expect(text(r)).toContain("PERMISSION DENIED: portfolio_lookup requires portfolio access");
    expect(text(r)).not.toContain("Brewly");
  });
  it("market_size_lookup allowed for market", async () => {
    const c = await connect();
    const r = await c.callTool({ name: "market_size_lookup", arguments: { pitch_slug: "brewbot", agent: "market" } });
    expect(r.isError).toBeFalsy();
    expect(JSON.parse(text(r)).sector).toBe("Food & Beverage");
  });
  it("unknown slug", async () => {
    const c = await connect();
    const r = await c.callTool({ name: "valuation_calculator", arguments: { pitch_slug: "nope", agent: "finance" } });
    expect(r.isError).toBe(true);
    expect(text(r)).toBe("Unknown pitch: nope");
  });
  it("finance cannot call market_size_lookup", async () => {
    const c = await connect();
    const r = await c.callTool({ name: "market_size_lookup", arguments: { pitch_slug: "brewbot", agent: "finance" } });
    expect(r.isError).toBe(true);
    expect(text(r)).toContain("PERMISSION DENIED");
  });
});
