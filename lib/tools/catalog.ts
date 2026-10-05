// Data-free tool catalog: names, data scopes and the model-facing definitions.
// Safe to import from client components (no PORTFOLIO / market data here);
// the executor and its datasets live in ./index and ./data.

export type ToolName = "market_size_lookup" | "valuation_calculator" | "comparable_deals_search" | "red_flag_scanner" | "portfolio_lookup";
export const TOOL_NAMES: ToolName[] = ["market_size_lookup", "valuation_calculator", "comparable_deals_search", "red_flag_scanner", "portfolio_lookup"];
export const TOOL_DATA_SCOPE: Record<ToolName, string> = { market_size_lookup: "market", valuation_calculator: "financials", comparable_deals_search: "deals", red_flag_scanner: "financials", portfolio_lookup: "portfolio" };

const NO_ARGS = { type: "object", properties: {}, additionalProperties: false };
export const TOOL_DEFS: Array<{ name: ToolName; description: string; input_schema: object }> = [
  { name: "market_size_lookup", description: "Total addressable market, growth, and competitors for the pitch's sector.", input_schema: NO_ARGS },
  { name: "valuation_calculator", description: "Implied valuation, revenue multiple, runway, and verified revenue for the pitch's ask.", input_schema: NO_ARGS },
  { name: "comparable_deals_search", description: "Recent comparable seed deals in the same sector.", input_schema: NO_ARGS },
  { name: "red_flag_scanner", description: "Deterministic scan for inconsistent financials, unrealistic growth, and prompt injection.", input_schema: NO_ARGS },
  { name: "portfolio_lookup", description: "The fund's confidential current portfolio holdings in this sector.", input_schema: NO_ARGS },
];
