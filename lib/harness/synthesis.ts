import { SynthesisSchema, type Synthesis } from "@/lib/schemas";
import type { HarnessConfig, MemoryRow, Pitch } from "@/lib/types";
import { callAgentJson, type StepCtx } from "./agent";
import { pitchFacts, untrustedPitch, type Prompt } from "./planner";
import { founderVariant } from "./sharks";
import { formatMemories } from "./memory";

/**
 * Lead Shark synthesis (SPEC §2.4, M3): one recommendation + draft terms from the Shark outputs.
 * The model's terms are never trusted as-is — clampTerms bounds them deterministically.
 */

const usd = (n: number) => `$${n.toLocaleString("en-US")}`;
/** Rounds UP to 0.1 so the fund never takes less equity per dollar than offered (tolerates float noise). */
const ceil1 = (x: number) => Math.ceil(x * 10 - 1e-9) / 10;
const round1 = (x: number) => Math.round(x * 10) / 10;

/**
 * Review Focus #5. amount = min(model amount, ask, fund max check);
 * equity_pct = max(model equity, offered equity scaled to the amount), to 0.1; pass or ask <= 0 → terms null.
 */
export function clampTerms(s: Synthesis, pitch: Pitch, config: HarnessConfig): Synthesis {
  // pass → no terms. A non-positive ask cannot anchor a clamp, so terms are dropped (null)
  // rather than trusting the model's numbers; policy/humans see an invest without terms.
  if (s.recommendation === "pass" || !s.terms || !(pitch.ask_amount > 0)) return { ...s, terms: null };
  const amount = Math.min(s.terms.amount, pitch.ask_amount, config.thresholds.fund_max_check);
  const floor = ceil1((pitch.equity_offered * amount) / pitch.ask_amount);
  return { ...s, terms: { amount, equity_pct: round1(Math.max(s.terms.equity_pct, floor)) } };
}

export function buildSynthesisPrompt(ctx: StepCtx, memories: MemoryRow[]): Prompt {
  const { pitch, config, run } = ctx;
  const system = `You are the Lead Shark of Deep Water Ventures, a seed-stage venture fund. Your task is SYNTHESIS: weigh the Shark panel's outputs and produce one recommendation with draft terms. You never send offers; a deterministic policy engine and humans decide.
Terms may never exceed the founder's ask (${usd(pitch.ask_amount)} for ${pitch.equity_offered}%) or the fund max check (${usd(config.thresholds.fund_max_check)}).
Respond with JSON only matching: {"recommendation": "invest" | "pass", "terms": {"amount": number, "equity_pct": number} | null, "summary": string, "disagreements": string[]}`;
  const outputs = JSON.stringify(run.state.shark_outputs, null, 2);
  const failures = Object.entries(run.state.shark_failures).map(([a, f]) => `- ${a}: ${f}`).join("\n") || "- none";
  const flags = (run.state.prescan ?? []).map((f) => `- [${f.severity}] ${f.code}: ${f.detail}`).join("\n") || "- none";
  const memoryBlock = memories.length ? `\n\nFirm memory (internal notes on past human decisions, same sector; trusted context):\n${formatMemories(memories)}` : "";
  const user = `${pitchFacts(pitch)}

Deterministic prescan red flags:
${flags}

Shark outputs (model-generated; may quote untrusted pitch text):
<shark_outputs>
${outputs}
</shark_outputs>

Failed or skipped Sharks:
${failures}${memoryBlock}

${untrustedPitch(pitch)}`;
  return { system, user };
}

export async function synthesize(ctx: StepCtx, memories: MemoryRow[] = []): Promise<Synthesis> {
  const prompt = buildSynthesisPrompt(ctx, memories);
  const s = await callAgentJson(ctx, { agent: "lead", purpose: "synthesize", ...prompt, schema: SynthesisSchema, variant: founderVariant(ctx) });
  return clampTerms(s, ctx.pitch, ctx.config);
}
