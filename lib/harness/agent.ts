import type { z } from "zod";
import { callLlm, LlmTimeoutError, type LlmResponse } from "@/lib/llm/client";
import { costUsd } from "@/lib/llm/pricing";
import { extractJson } from "@/lib/llm/json";
import type { AgentCallRow, AgentId, HarnessConfig, Pitch, Purpose, Run } from "@/lib/types";
import type { Repo } from "./repo";
import { withReliability } from "./reliability";

export type StepCtx = { repo: Repo; run: Run; pitch: Pitch; config: HarnessConfig; usage: { tokens: number; cost: number } };

export class AgentCallError extends Error {
  constructor(public readonly status: AgentCallRow["status"], message: string) {
    super(message);
    this.name = "AgentCallError";
  }
}

/** Extracts JSON from model text (fences, prose around JSON). Single parse site for lead calls. */
const parseJsonText = extractJson;

/**
 * An LLM call that must return JSON matching `schema`, run through the reliability layer
 * (SPEC §2.7): retries with backoff on the primary model, then one fallback attempt. Each
 * attempt records exactly one agent_calls row and accumulates tokens/cost into ctx.usage.
 * Throws the last attempt's AgentCallError when every attempt fails.
 */
export async function callAgentJson<T>(
  ctx: StepCtx,
  opts: { agent: AgentId; purpose: Purpose; system: string; user: string; schema: z.ZodType<T>; variant?: string },
): Promise<T> {
  let lastError: unknown = new AgentCallError("error", `${opts.agent}/${opts.purpose}: no attempt made`);
  const r = await withReliability(ctx.config.reliability, async ({ model, attempt, signal, fallback }) => {
    try {
      return await callAgentJsonOnce(ctx, opts, model, attempt, signal, fallback);
    } catch (e) {
      lastError = e;
      throw e;
    }
  });
  if (r.ok) return r.value as T;
  throw lastError;
}

/** One attempt: records exactly one agent_calls row. Throws AgentCallError on timeout / error / schema_fail. */
async function callAgentJsonOnce<T>(
  ctx: StepCtx,
  opts: { agent: AgentId; purpose: Purpose; system: string; user: string; schema: z.ZodType<T>; variant?: string },
  model: string,
  attempt: number,
  signal: AbortSignal,
  fallback: boolean,
): Promise<T> {
  const started = Date.now();
  const base = { run_id: ctx.run.id, agent: opts.agent, purpose: opts.purpose, model, attempt, fallback_used: fallback };

  let res: LlmResponse;
  try {
    res = await callLlm({ pitchSlug: ctx.pitch.slug, agent: opts.agent, purpose: opts.purpose, system: opts.system, messages: [{ role: "user", content: opts.user }], model, attempt, turn: 1, signal, variant: opts.variant });
  } catch (e) {
    const timeout = e instanceof LlmTimeoutError || signal.aborted;
    const status = timeout ? "timeout" : "error";
    const message = e instanceof Error ? e.message : String(e);
    await ctx.repo.addAgentCall({ ...base, input_tokens: 0, output_tokens: 0, cost_usd: 0, latency_ms: Date.now() - started, status, error: message, output: null });
    throw new AgentCallError(status, `${opts.agent}/${opts.purpose}: ${status}: ${message}`);
  }

  const cost = costUsd(res.model, res.inputTokens, res.outputTokens);
  ctx.usage.tokens += res.inputTokens + res.outputTokens;
  ctx.usage.cost = +(ctx.usage.cost + cost).toFixed(6);
  const row = { ...base, model: res.model, input_tokens: res.inputTokens, output_tokens: res.outputTokens, cost_usd: cost, latency_ms: res.latencyMs };

  let raw: unknown;
  try {
    raw = parseJsonText(res.text);
  } catch {
    await ctx.repo.addAgentCall({ ...row, status: "schema_fail", error: "Response was not valid JSON", output: { raw_text: res.text } });
    throw new AgentCallError("schema_fail", `${opts.agent}/${opts.purpose}: schema_fail: response was not valid JSON`);
  }
  const parsed = opts.schema.safeParse(raw);
  if (!parsed.success) {
    const message = parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
    await ctx.repo.addAgentCall({ ...row, status: "schema_fail", error: message, output: raw });
    throw new AgentCallError("schema_fail", `${opts.agent}/${opts.purpose}: schema_fail: ${message}`);
  }
  await ctx.repo.addAgentCall({ ...row, status: "ok", error: null, output: parsed.data });
  return parsed.data;
}
