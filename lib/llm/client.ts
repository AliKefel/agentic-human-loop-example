import Anthropic from "@anthropic-ai/sdk";
import { isMockMode } from "@/lib/env";
import { mockCall } from "@/lib/mock/fixtures";
import { LlmTimeoutError } from "./errors";
import type { AgentId, Purpose } from "@/lib/types";

export { LlmTimeoutError };
export type LlmMessage = { role: "user" | "assistant"; content: unknown };
export type LlmToolUse = { id: string; name: string; input: Record<string, unknown> };
export type LlmRequest = { pitchSlug: string; agent: AgentId; purpose: Purpose; system: string; messages: LlmMessage[]; tools?: object[]; model: string; attempt: number; turn: number; signal?: AbortSignal; variant?: string };
export type LlmResponse = { text: string; toolUses: LlmToolUse[]; inputTokens: number; outputTokens: number; latencyMs: number; model: string; rawContent: unknown };

let client: Anthropic | null = null;
export async function callLlm(req: LlmRequest): Promise<LlmResponse> {
  if (isMockMode()) return mockCall(req);
  client ??= new Anthropic({ maxRetries: 0 }); // the harness owns retries (reliability.ts)
  const started = Date.now();
  try {
    const msg = await client.messages.create(
      { model: req.model, max_tokens: 16000, system: req.system, messages: req.messages as Anthropic.MessageParam[], tools: req.tools as Anthropic.Tool[] | undefined },
      { signal: req.signal },
    );
    const text = msg.content.filter((b) => b.type === "text").map((b) => (b as Anthropic.TextBlock).text).join("");
    const toolUses = msg.content.filter((b) => b.type === "tool_use").map((b) => {
      const t = b as Anthropic.ToolUseBlock;
      return { id: t.id, name: t.name, input: t.input as Record<string, unknown> };
    });
    return { text, toolUses, inputTokens: msg.usage.input_tokens, outputTokens: msg.usage.output_tokens, latencyMs: Date.now() - started, model: req.model, rawContent: msg.content };
  } catch (e) {
    if (req.signal?.aborted) throw new LlmTimeoutError();
    throw e;
  }
}
