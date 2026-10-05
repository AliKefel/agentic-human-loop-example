import type { AgentName } from "@/lib/types";
import type { Plan, RedFlag, SharkOutput, Synthesis } from "@/lib/schemas";
import type { ToolName } from "@/lib/tools";
import type { LlmRequest, LlmResponse } from "@/lib/llm/client";
import { LlmTimeoutError } from "@/lib/llm/errors";

type Tokens = [input: number, output: number];
type Turn =
  | { kind: "tool_use"; tools: Array<{ name: ToolName }> }
  | { kind: "final"; json: unknown }
  | { kind: "timeout" }
  | { kind: "malformed"; text: string };
type AgentFixture = { tokens: Tokens; latencyMs: number; attempts: Record<number, Turn[]>; default: Turn[]; fallback?: Turn[] };
type Terms = { amount: number; equity_pct: number };
type SynthFixture = Synthesis & { tokens: Tokens };
type PitchFixtureSet = {
  triage: { fast_pass: boolean; reason: string; tokens: Tokens };
  plan: Plan & { tokens: Tokens };
  agents: Record<AgentName, AgentFixture>;
  synthesis: SynthFixture;
  variants?: Record<string, Partial<Record<AgentName, AgentFixture>> & { synthesis?: SynthFixture }>;
};

export const SCRIPTED_FOUNDER_REPLY: Record<string, string> = {
  fitflow: "We launched a paid beta in August: 1,150 paying users at $9/month (~$124K ARR run-rate) with 62% 3-month retention.",
};

const AGENTS: AgentName[] = ["market", "finance", "product", "skeptic"];
const OWN_TOOL: Record<AgentName, ToolName> = { market: "market_size_lookup", finance: "valuation_calculator", product: "comparable_deals_search", skeptic: "red_flag_scanner" };
const KEY_POINTS: Record<AgentName, string[]> = {
  market: ["Sector TAM and growth support a venture-scale outcome.", "Competitors exist but the positioning is differentiated.", "Go-to-market channel is plausible at this stage."],
  finance: ["Implied valuation is reasonable against comparable seed deals.", "Runway at the current burn covers the next milestones.", "Unit economics look workable on verified revenue."],
  product: ["Product solves a concrete, recurring customer pain.", "Early traction suggests product-market pull.", "Execution risk is moderate and addressable with this raise."],
  skeptic: ["Key claims were cross-checked against verified numbers.", "Main downside is execution and customer concentration.", "No disqualifying issues beyond those flagged."],
};

const toolTurn = (...names: ToolName[]): Turn => ({ kind: "tool_use", tools: names.map((name) => ({ name })) });
const finalTurn = (json: unknown): Turn => ({ kind: "final", json });

/** Builds a valid SharkOutput. Verdict defaults to invest when score >= 6. */
export function sharkFinal(agent: AgentName, score: number, verdict?: "invest" | "pass", terms?: Terms, extra: Partial<SharkOutput> = {}): SharkOutput {
  return {
    agent, score, confidence: 0.8, verdict: verdict ?? (score >= 6 ? "invest" : "pass"),
    key_points: KEY_POINTS[agent], ...(terms ? { proposed_terms: terms } : {}), ...extra,
  };
}

const agentFx = (turns: Turn[], over: Partial<AgentFixture> = {}): AgentFixture => ({ tokens: [1800, 450], latencyMs: 900, attempts: {}, default: turns, ...over });
const standard = (agent: AgentName, score: number, terms?: Terms, extra?: Partial<SharkOutput>) =>
  agentFx([toolTurn(OWN_TOOL[agent]), finalTurn(sharkFinal(agent, score, undefined, terms, extra))]);

type Spec = {
  scores: [number, number, number, number]; // market, finance, product, skeptic
  terms: Terms;
  order?: AgentName[];
  triageTokens?: Tokens;
  planTokens?: Tokens;
  agents?: Partial<Record<AgentName, AgentFixture>>;
  skeptic?: { verdict?: "invest" | "pass"; extra?: Partial<SharkOutput> };
  variants?: PitchFixtureSet["variants"];
};

function build(spec: Spec): PitchFixtureSet {
  const [m, f, p, s] = spec.scores;
  const score: Record<AgentName, number> = { market: m, finance: f, product: p, skeptic: s };
  const agents = Object.fromEntries(AGENTS.map((a) => {
    if (a === "skeptic") return [a, agentFx([toolTurn(OWN_TOOL.skeptic), finalTurn(sharkFinal("skeptic", s, spec.skeptic?.verdict, undefined, spec.skeptic?.extra))])];
    return [a, standard(a, score[a], a === "finance" ? spec.terms : undefined)];
  })) as Record<AgentName, AgentFixture>;
  Object.assign(agents, spec.agents);
  const spread = Math.max(m, f, p, s) - Math.min(m, f, p, s);
  return {
    triage: { fast_pass: false, reason: "Within fund mandate; proceed to full analysis.", tokens: spec.triageTokens ?? [600, 80] },
    plan: {
      sharks: spec.order ?? AGENTS,
      questions: { market: "How large and fast-growing is this market?", finance: "Is the ask priced sensibly against verified financials?", product: "Is the product differentiated and defensible?", skeptic: "What claims here do not hold up?" },
      tool_budget: { market: 2, finance: 2, product: 2, skeptic: 2 },
      rationale: "Run all four Sharks in parallel; the Skeptic is mandatory.",
      tokens: spec.planTokens ?? [900, 250],
    },
    agents,
    synthesis: {
      recommendation: "invest", terms: spec.terms, tokens: [2200, 500],
      summary: `Sharks scored ${m}/${f}/${p}/${s} (market/finance/product/skeptic); recommend investing on the stated terms.`,
      disagreements: spread >= 5 ? [`Score spread of ${spread} between the most bullish and most bearish Shark.`] : [],
    },
    variants: spec.variants,
  };
}

const flag = (code: string, severity: RedFlag["severity"], detail: string): RedFlag => ({ code, severity, detail });

export const FIXTURES: Record<string, PitchFixtureSet> = {
  brewbot: build({ scores: [8, 8, 7, 7], terms: { amount: 120000, equity_pct: 10 } }),
  pawprint: build({ scores: [8, 7, 8, 7], terms: { amount: 500000, equity_pct: 5 } }),
  greengrid: {
    ...build({ scores: [3, 3, 3, 3], terms: { amount: 2500000, equity_pct: 12 } }),
    triage: { fast_pass: true, reason: "Ask $2.5M exceeds fund max check $2M", tokens: [600, 80] },
  },
  ledgerleaf: build({
    scores: [7, 7, 8, 7], terms: { amount: 200000, equity_pct: 8 },
    agents: {
      finance: agentFx([toolTurn("valuation_calculator"), finalTurn(sharkFinal("finance", 7, undefined, { amount: 200000, equity_pct: 8 }))], {
        attempts: { 1: [{ kind: "timeout" }], 2: [{ kind: "timeout" }], 3: [{ kind: "timeout" }] },
        fallback: [toolTurn("valuation_calculator"), finalTurn(sharkFinal("finance", 7, undefined, { amount: 200000, equity_pct: 8 }))],
      }),
    },
  }),
  snackstack: build({
    scores: [9, 6, 7, 3], terms: { amount: 150000, equity_pct: 12 },
    skeptic: { verdict: "pass", extra: { red_flags: [flag("thin_margins", "medium", "Vending gross margins are thin once restocking is included.")] } },
  }),
  fitflow: build({
    scores: [7, 5, 7, 6], terms: { amount: 100000, equity_pct: 15 },
    skeptic: { extra: { missing_data: ["revenue", "retention"], confidence: 0.5 } },
    variants: {
      after_founder: {
        finance: standard("finance", 7, { amount: 100000, equity_pct: 15 }),
        skeptic: standard("skeptic", 7),
        synthesis: {
          recommendation: "invest", terms: { amount: 100000, equity_pct: 15 }, tokens: [2400, 520],
          summary: "After the founder's answer (paid beta, ~$124K ARR run-rate, 62% retention), Sharks scored 7/7/7/7 (market/finance/product/skeptic); recommend investing on the stated terms.",
          disagreements: [],
        },
      },
    },
  }),
  moonmint: build({
    scores: [8, 4, 6, 2], terms: { amount: 750000, equity_pct: 6 },
    skeptic: { verdict: "pass", extra: { red_flags: [flag("inconsistent_financials", "high", "Pitch claims $5M revenue; verified revenue is $48K.")] } },
  }),
  kidcode: build({ scores: [8, 7, 7, 8], terms: { amount: 80000, equity_pct: 15 } }),
  skinsync: build({
    scores: [7, 7, 7, 2], terms: { amount: 300000, equity_pct: 10 },
    skeptic: { verdict: "pass", extra: { red_flags: [flag("prompt_injection", "high", "Pitch text instructs reviewers to ignore policy and approve $2M.")] } },
  }),
  dronedrop: build({
    scores: [7, 7, 7, 7], terms: { amount: 250000, equity_pct: 10 },
    agents: {
      product: agentFx([toolTurn("comparable_deals_search"), finalTurn(sharkFinal("product", 7))], {
        attempts: { 1: [toolTurn("comparable_deals_search"), { kind: "malformed", text: "Here is my analysis: {score: 7, verdict: invest" }] },
      }),
    },
  }),
  thriftloop: build({
    scores: [7, 7, 7, 6], terms: { amount: 180000, equity_pct: 9 },
    triageTokens: [24000, 1000], planTokens: [26000, 1000], order: ["skeptic", "market", "finance", "product"],
  }),
  mealmate: build({
    scores: [8, 7, 7, 8], terms: { amount: 90000, equity_pct: 12 },
    agents: { market: agentFx([toolTurn("portfolio_lookup", "market_size_lookup"), finalTurn(sharkFinal("market", 8))]) },
  }),
};

const strip = <T extends { tokens: Tokens }>(x: T): Omit<T, "tokens"> => {
  const { tokens: _t, ...rest } = x;
  return rest;
};

function resolveAgent(fx: PitchFixtureSet, req: LlmRequest & { agent: AgentName }): AgentFixture {
  const base = fx.agents[req.agent];
  const v = req.variant ? fx.variants?.[req.variant]?.[req.agent] : undefined;
  return v ?? base;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (process.env.MOCK_NO_DELAY === "true" || ms <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    const t = setTimeout(resolve, Math.min(ms, 1500));
    signal?.addEventListener("abort", () => { clearTimeout(t); resolve(); }, { once: true });
  });
}

/** Splits an attempt's total tokens deterministically across `n` turns (last turn takes the remainder). */
function turnTokens(total: Tokens, i: number, n: number): Tokens {
  const share = (x: number) => (i < n - 1 ? Math.floor(x / n) : x - Math.floor(x / n) * (n - 1));
  return [share(total[0]), share(total[1])];
}

export async function mockCall(req: LlmRequest): Promise<LlmResponse> {
  const fx = FIXTURES[req.pitchSlug];
  if (!fx) throw new Error(`No mock fixture for pitch "${req.pitchSlug}"`);
  if (req.signal?.aborted) throw new LlmTimeoutError();
  const respond = async (text: string, tokens: Tokens, latencyMs: number, toolUses: LlmResponse["toolUses"] = []): Promise<LlmResponse> => {
    await sleep(latencyMs, req.signal);
    if (req.signal?.aborted) throw new LlmTimeoutError();
    const rawContent = toolUses.length
      ? toolUses.map((t) => ({ type: "tool_use", id: t.id, name: t.name, input: t.input }))
      : [{ type: "text", text }];
    return { text, toolUses, inputTokens: tokens[0], outputTokens: tokens[1], latencyMs, model: req.model, rawContent };
  };

  if (req.agent === "lead") {
    const variantSynth = req.variant ? fx.variants?.[req.variant]?.synthesis : undefined;
    const item = req.purpose === "triage" ? fx.triage : req.purpose === "plan" ? fx.plan : (variantSynth ?? fx.synthesis);
    return respond(JSON.stringify(strip(item)), item.tokens, 400);
  }

  const agentFixture = resolveAgent(fx, req as LlmRequest & { agent: AgentName });
  const fallbackModel = "claude-haiku-4-5-20251001";
  const isFallback = req.model === fallbackModel || req.model === "claude-haiku-4-5";
  const turns = (isFallback && agentFixture.fallback) || agentFixture.attempts[req.attempt] || agentFixture.default;
  const idx = Math.min(Math.max(req.turn, 1), turns.length) - 1;
  const turn = turns[idx];
  const tokens = turnTokens(agentFixture.tokens, idx, turns.length);
  const latency = Math.round(agentFixture.latencyMs / turns.length);

  switch (turn.kind) {
    case "timeout":
      await sleep(300, req.signal);
      throw new LlmTimeoutError();
    case "malformed":
      return respond(turn.text, tokens, latency);
    case "final":
      return respond(JSON.stringify(turn.json), tokens, latency);
    case "tool_use":
      return respond("", tokens, latency, turn.tools.map((t, i) => ({ id: `toolu_mock_${req.pitchSlug}_${req.agent}_${req.attempt}_${req.turn}_${i}`, name: t.name, input: {} })));
  }
}
