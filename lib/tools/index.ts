import type { Pitch } from "@/lib/types";
import type { RedFlag } from "@/lib/schemas";
import { MARKET_DATA, COMPARABLE_DEALS, PORTFOLIO } from "./data";
import type { ToolName } from "./catalog";

export { TOOL_NAMES, TOOL_DATA_SCOPE, TOOL_DEFS } from "./catalog";
export type { ToolName } from "./catalog";

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
