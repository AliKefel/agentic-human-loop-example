import { z } from "zod";

export const RedFlagSchema = z.object({ code: z.string(), severity: z.enum(["low", "medium", "high"]), detail: z.string() });
export const PlanSchema = z.object({
  sharks: z.array(z.enum(["market", "finance", "product", "skeptic"])).min(1).refine((a) => a.includes("skeptic"), "skeptic required"),
  questions: z.record(z.string(), z.string()),
  tool_budget: z.record(z.string(), z.number().int().min(1).max(3)),
  rationale: z.string(),
});
export const TriageSchema = z.object({ fast_pass: z.boolean(), reason: z.string() });
const TermsSchema = z.object({ amount: z.number().positive(), equity_pct: z.number().positive().max(100) });
export const SharkOutputSchema = z.object({
  agent: z.enum(["market", "finance", "product", "skeptic"]),
  score: z.number().min(1).max(10),
  confidence: z.number().min(0).max(1),
  verdict: z.enum(["invest", "pass"]),
  key_points: z.array(z.string()).min(2).max(5),
  proposed_terms: TermsSchema.optional(),
  red_flags: z.array(RedFlagSchema).optional(),
  missing_data: z.array(z.string()).optional(),
});
export const SynthesisSchema = z.object({
  recommendation: z.enum(["invest", "pass"]),
  terms: TermsSchema.nullable(),
  summary: z.string(),
  disagreements: z.array(z.string()),
});
export const HarnessConfigSchema = z.object({
  autonomy_level: z.number().int().min(0).max(3),
  thresholds: z.object({
    fund_max_check: z.number(),
    auto_max_amount: z.number(),
    auto_max_equity: z.number(),
    auto_min_score: z.number(),
    disagreement_spread: z.number(),
    partner_limit: z.number(),
    sla_hours: z.object({ approval: z.number(), exception: z.number(), escalation: z.number() }),
  }),
  budgets: z.object({ max_tokens: z.number(), max_usd: z.number(), est_tokens_per_shark: z.number(), max_steps: z.number(), max_replans: z.number() }),
  reliability: z.object({ timeout_ms: z.number(), retries: z.number(), backoff_ms: z.array(z.number()), primary_model: z.string(), fallback_model: z.string() }),
  permissions: z.record(z.string(), z.object({ tools: z.array(z.string()), data: z.array(z.string()) })),
  notes: z.string().nullable().optional(),
});
export type Plan = z.infer<typeof PlanSchema>;
export type SharkOutput = z.infer<typeof SharkOutputSchema>;
export type Synthesis = z.infer<typeof SynthesisSchema>;
export type RedFlag = z.infer<typeof RedFlagSchema>;
