import type { Pitch } from "@/lib/types";
import type { RedFlag } from "@/lib/schemas";
import { MARKET_DATA, COMPARABLE_DEALS, PORTFOLIO } from "./data";

export type ToolName = "market_size_lookup" | "valuation_calculator" | "comparable_deals_search" | "red_flag_scanner" | "portfolio_lookup";
export const TOOL_NAMES: ToolName[] = ["market_size_lookup", "valuation_calculator", "comparable_deals_search", "red_flag_scanner", "portfolio_lookup"];
export const TOOL_DATA_SCOPE: Record<ToolName, string> = { market_size_lookup: "market", valuation_calculator: "financials", comparable_deals_search: "deals", red_flag_scanner: "financials", portfolio_lookup: "portfolio" };

const NO_ARGS = { type: "object", properties: {}, additionalProperties: false };
export const TOOL_DEFS: Array<{ name: ToolName; description: string; input_schema: object }> = [
  { name: "market_size_lookup", description: "Total addressable market, growth, and competitors for the pitch's sector.", input_schema: NO_ARGS },
  { name: "valuation_calculator", description: "Implied valuation, revenue multiple, burn multiple, and runway for the pitch's ask.", input_schema: NO_ARGS },
  { name: "comparable_deals_search", description: "Recent comparable seed deals in the same sector.", input_schema: NO_ARGS },
  { name: "red_flag_scanner", description: "Deterministic scan for inconsistent financials, unrealistic growth, and prompt injection.", input_schema: NO_ARGS },
  { name: "portfolio_lookup", description: "The fund's confidential current portfolio holdings in this sector.", input_schema: NO_ARGS },
];

const INJECTION = /(ignore (all )?(previous|prior) instructions|system note to ai|disregard (the )?(rules|polic)|pre-?approved by)/i;
const CLAIMED_REV = /\$\s?([\d.,]+)\s?(k|m|million|thousand)?\s+(in\s+)?(annual\s+)?revenue/i;
const MULTIPLIER: Record<string, number> = { "": 1, k: 1e3, thousand: 1e3, m: 1e6, million: 1e6 };

/** Parses the first "$X[k|m|million|thousand] ... revenue" claim from free text. */
export function parseClaimedRevenue(text: string): number | null {
  const m = text.match(CLAIMED_REV);
  if (!m) return null;
  const base = parseFloat(m[1].replace(/,/g, ""));
  if (Number.isNaN(base)) return null;
  return base * MULTIPLIER[(m[2] ?? "").toLowerCase()];
}

export function scanRedFlags(p: Pitch): RedFlag[] {
  const flags: RedFlag[] = [];
  if (INJECTION.test(p.pitch_text)) flags.push({ code: "prompt_injection", severity: "high", detail: "Pitch text contains instructions aimed at AI reviewers." });
  const claimed = p.claimed_revenue ?? parseClaimedRevenue(p.pitch_text);
  if (claimed && p.revenue > 0 && claimed / p.revenue > 3) flags.push({ code: "inconsistent_financials", severity: "high", detail: `Pitch claims $${claimed.toLocaleString()} revenue; verified revenue is $${p.revenue.toLocaleString()}.` });
  if (claimed && p.revenue === 0 && claimed > 0) flags.push({ code: "inconsistent_financials", severity: "high", detail: "Pitch claims revenue but none is verified." });
  if (p.growth_pct > 250) flags.push({ code: "unrealistic_growth", severity: "medium", detail: `${p.growth_pct}% YoY growth claimed.` });
  if (p.revenue === 0) flags.push({ code: "pre_revenue", severity: "low", detail: "No verified revenue." });
  return flags;
}

export function runTool(name: ToolName, _args: Record<string, unknown>, p: Pitch): unknown {
  switch (name) {
    case "market_size_lookup": return { sector: p.sector, ...(MARKET_DATA[p.sector] ?? { tam_usd: 5e9, cagr_pct: 7, competitors: [] }) };
    case "valuation_calculator": {
      const implied_valuation = Math.round(p.ask_amount / (p.equity_offered / 100));
      return { implied_valuation, revenue_multiple: p.revenue > 0 ? +(implied_valuation / p.revenue).toFixed(2) : null, runway_months: p.monthly_burn > 0 ? Math.round(p.ask_amount / p.monthly_burn) : null, verified_revenue: p.revenue };
    }
    case "comparable_deals_search": return COMPARABLE_DEALS.filter((d) => d.sector === p.sector);
    case "red_flag_scanner": return scanRedFlags(p);
    case "portfolio_lookup": return PORTFOLIO.filter((h) => h.sector === p.sector);
  }
}
