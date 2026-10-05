// $ per 1M tokens
const PRICES: Record<string, { in: number; out: number }> = {
  "claude-sonnet-5-5": { in: 2.0, out: 10.0 },
  "claude-haiku-4-5-20251001": { in: 1.0, out: 5.0 },
  "claude-haiku-4-5": { in: 1.0, out: 5.0 },
};
export function costUsd(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICES[model] ?? PRICES["claude-sonnet-5-5"];
  return +((inputTokens * p.in + outputTokens * p.out) / 1e6).toFixed(6);
}
