import type { HarnessConfig } from "@/lib/types";

// Mirrors supabase/seed.sql harness config v1 (tests/seed-config.test.ts guards against drift).
export const CONFIG_V1: HarnessConfig = {
  id: "00000000-0000-0000-0000-0000000000c1",
  version: 1,
  is_active: true,
  autonomy_level: 2,
  thresholds: {
    fund_max_check: 2000000,
    auto_max_amount: 150000,
    auto_max_equity: 15,
    auto_min_score: 7,
    disagreement_spread: 5,
    partner_limit: 250000,
    sla_hours: { approval: 24, exception: 8, escalation: 4 },
  },
  budgets: { max_tokens: 60000, max_usd: 0.5, est_tokens_per_shark: 2500, max_steps: 20, max_replans: 2 },
  reliability: { timeout_ms: 20000, retries: 2, backoff_ms: [500, 1000], fallback_model: "claude-haiku-4-5-20251001", primary_model: "claude-sonnet-5-5" },
  permissions: {
    lead: { tools: [], data: ["pitch", "memories"] },
    market: { tools: ["market_size_lookup"], data: ["pitch", "market"] },
    finance: { tools: ["valuation_calculator"], data: ["pitch", "financials"] },
    product: { tools: ["comparable_deals_search"], data: ["pitch", "deals"] },
    skeptic: { tools: ["red_flag_scanner"], data: ["pitch", "financials", "market"] },
  },
  notes: "Initial harness: L2 assisted, conservative auto-send limits.",
  created_by: "00000000-0000-0000-0000-000000000003",
  created_at: "2026-01-01T00:00:00.000Z",
};
