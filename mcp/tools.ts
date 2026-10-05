import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { HarnessConfig, Pitch } from "@/lib/types";
import { TOOL_DEFS, runTool } from "@/lib/tools";
import { checkTool, deniedMessage } from "@/lib/harness/permissions";
import { SEED_PITCHES } from "@/lib/mock/seed-pitches";
import { CONFIG_V1 } from "@/lib/mock/seed-config";

export type TankResolvers = {
  /** Resolve a pitch by slug; null when unknown. */
  getPitch: (slug: string) => Promise<Pitch | null>;
  /** The active harness config (the permission matrix). */
  getConfig: () => Promise<HarnessConfig>;
};

/** Default resolvers: seeded pitches + CONFIG_V1, no database needed. */
export function seedResolvers(): TankResolvers {
  return {
    getPitch: async (slug) => {
      const i = SEED_PITCHES.findIndex((p) => p.slug === slug);
      if (i < 0) return null;
      return { ...SEED_PITCHES[i], id: `seed-${slug}`, created_at: new Date(0).toISOString() };
    },
    getConfig: async () => CONFIG_V1,
  };
}

const AGENTS = ["lead", "market", "finance", "product", "skeptic"] as const;
const inputSchema = { pitch_slug: z.string().describe("Pitch slug, e.g. brewbot"), agent: z.enum(AGENTS).describe("The agent on whose behalf the tool is called; permissions are enforced per agent") };

const fail = (text: string) => ({ isError: true as const, content: [{ type: "text" as const, text }] });

/** MCP server exposing the deal tools. Every call goes through the same checkTool() permission matrix as the harness. */
export function createTankServer({ getPitch, getConfig }: TankResolvers): McpServer {
  const server = new McpServer({ name: "deep-water-tools", version: "0.1.0" });
  for (const def of TOOL_DEFS) {
    server.registerTool(def.name, { description: def.description, inputSchema }, async ({ pitch_slug, agent }) => {
      try {
        const config = await getConfig();
        const check = checkTool(config, agent, def.name);
        if (!check.allowed) return fail(deniedMessage(def.name));
        const pitch = await getPitch(pitch_slug);
        if (!pitch) return fail(`Unknown pitch: ${pitch_slug}`);
        return { content: [{ type: "text" as const, text: JSON.stringify(runTool(def.name, {}, pitch), null, 2) }] };
      } catch (e) {
        return fail(`Tool error: ${e instanceof Error ? e.message : String(e)}`);
      }
    });
  }
  return server;
}
