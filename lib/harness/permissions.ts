import type { AgentId, HarnessConfig, Pitch } from "@/lib/types";
import { TOOL_DATA_SCOPE, TOOL_NAMES, runTool, type ToolName } from "@/lib/tools";
import { pitchFacts } from "./planner";

/**
 * Trust boundary (SPEC §2.6). The harness — never the model — decides what each agent may
 * use (tools) and see (data scopes). Both checks read config.permissions[agent].
 */

export type PermissionCheck = { allowed: boolean; reason?: string };

export const isToolName = (t: string): t is ToolName => (TOOL_NAMES as string[]).includes(t);

/** A tool is allowed only if it is in permissions[agent].tools AND its data scope is in permissions[agent].data. */
export function checkTool(config: HarnessConfig, agent: AgentId, tool: string): PermissionCheck {
  if (!isToolName(tool)) return { allowed: false, reason: `unknown tool "${tool}"` };
  const perms = config.permissions[agent];
  if (!perms) return { allowed: false, reason: `no permissions configured for agent "${agent}"` };
  const scope = TOOL_DATA_SCOPE[tool];
  if (!perms.tools.includes(tool)) return { allowed: false, reason: `tool "${tool}" is not granted to ${agent} (requires ${scope} access)` };
  if (!perms.data.includes(scope)) return { allowed: false, reason: `data scope "${scope}" is not granted to ${agent}` };
  return { allowed: true };
}

/** The tool_result text the model sees for a denied call. */
export function deniedMessage(tool: string): string {
  return isToolName(tool) ? `PERMISSION DENIED: ${tool} requires ${TOOL_DATA_SCOPE[tool]} access` : `PERMISSION DENIED: ${tool} is not a known tool`;
}

const json = (v: unknown) => JSON.stringify(v, null, 2);

/** Renderers per data scope. "pitch" is the trusted facts; the untrusted pitch text is added by the prompt builder. */
const SCOPES: Record<string, (p: Pitch) => string> = {
  pitch: (p) => pitchFacts(p),
  market: (p) => `Market data (${p.sector}):\n${json(runTool("market_size_lookup", {}, p))}`,
  financials: (p) => `Financials (verified):\n${json(runTool("valuation_calculator", {}, p))}`,
  deals: (p) => `Comparable deals (${p.sector}):\n${json(runTool("comparable_deals_search", {}, p))}`,
  portfolio: (p) => `Fund portfolio holdings (${p.sector}) — CONFIDENTIAL to the fund:\n${json(runTool("portfolio_lookup", {}, p))}`,
  // "memories" is rendered by the synthesis prompt (M7), not here.
};

/** Context block for an agent's prompt containing ONLY its granted data scopes. */
export function dataContext(config: HarnessConfig, agent: AgentId, pitch: Pitch): string {
  const granted = config.permissions[agent]?.data ?? [];
  return granted
    .filter((s) => SCOPES[s])
    .map((s) => SCOPES[s](pitch))
    .join("\n\n");
}
