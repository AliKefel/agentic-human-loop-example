import type { HarnessConfig } from "@/lib/types";

/**
 * Reliability layer (SPEC §2.7): per-attempt timeout, retries with backoff, one fallback
 * attempt, and the per-run budget check. The harness — not the SDK — owns retries.
 */

export type AttemptFn<T> = (args: { model: string; attempt: number; signal: AbortSignal; fallback: boolean }) => Promise<T>;
export type ReliabilityResult<T> = { value?: T; ok: boolean; attempts: number; fallbackUsed: boolean };

/** Real backoff sleep; skipped when MOCK_NO_DELAY=true (tests / fast demos have no artificial waits). */
export const defaultSleep = (ms: number): Promise<void> =>
  process.env.MOCK_NO_DELAY === "true" || ms <= 0 ? Promise.resolve() : new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Attempts 1..retries+1 on the primary model, each bounded by an AbortController that fires
 * after timeout_ms; after failure k (k ≤ retries) sleeps backoff_ms[k-1] (or the last value);
 * then exactly one attempt on the fallback model (attempt = retries+2, fallback = true).
 * `fn` must honour `signal` (callLlm passes it to the SDK / mock). Never throws.
 */
export async function withReliability<T>(
  cfg: HarnessConfig["reliability"],
  fn: AttemptFn<T>,
  sleep: (ms: number) => Promise<void> = defaultSleep,
): Promise<ReliabilityResult<T>> {
  const once = async (model: string, attempt: number, fallback: boolean): Promise<{ ok: true; value: T } | { ok: false }> => {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), cfg.timeout_ms);
    try {
      return { ok: true, value: await fn({ model, attempt, signal: ac.signal, fallback }) };
    } catch {
      return { ok: false };
    } finally {
      clearTimeout(timer);
    }
  };

  const primaryAttempts = cfg.retries + 1;
  for (let attempt = 1; attempt <= primaryAttempts; attempt++) {
    const r = await once(cfg.primary_model, attempt, false);
    if (r.ok) return { value: r.value, ok: true, attempts: attempt, fallbackUsed: false };
    if (attempt <= cfg.retries) {
      const backoff = cfg.backoff_ms[attempt - 1] ?? cfg.backoff_ms.at(-1) ?? 0;
      await sleep(backoff);
    }
  }
  const attempt = primaryAttempts + 1;
  const r = await once(cfg.fallback_model, attempt, true);
  return r.ok ? { value: r.value, ok: true, attempts: attempt, fallbackUsed: true } : { ok: false, attempts: attempt, fallbackUsed: true };
}

/** True when `used.tokens + reservedTokens` fits the token cap and spend is still below the $ cap. */
export function budgetAllows(config: HarnessConfig, used: { tokens: number; cost: number }, reservedTokens: number): boolean {
  return used.tokens + reservedTokens <= config.budgets.max_tokens && used.cost < config.budgets.max_usd;
}
