import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createTankServer, seedResolvers, type TankResolvers } from "./tools";

// stdout is the protocol channel: log to stderr only.
const log = (...a: unknown[]) => console.error("[deep-water-tools]", ...a);

async function resolvers(): Promise<TankResolvers> {
  const hasDb = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SECRET_KEY;
  if (process.env.THE_TANK_USE_DB !== "true" || !hasDb) return seedResolvers();
  // Dynamic import: SupabaseRepo is server-only (run with NODE_OPTIONS=--conditions=react-server).
  const { SupabaseRepo } = await import("@/lib/harness/repo-supabase");
  const repo = new SupabaseRepo();
  log("using Supabase repo");
  return {
    getPitch: async (slug) => repo.getPitchBySlug(slug).catch(() => null),
    getConfig: () => repo.getActiveConfig(),
  };
}

async function main() {
  const server = createTankServer(await resolvers());
  await server.connect(new StdioServerTransport());
  log("ready on stdio");
}
main().catch((e) => { log("fatal", e); process.exit(1); });
