import { Bot, Hand, ShieldCheck, Sparkles } from "lucide-react";

/** L0–L3 labels and what each level lets the harness do (SPEC §2.8). Shared by server and client components. */
export const AUTONOMY_LEVELS = [
  { level: 0, short: "L0", name: "Human decides", Icon: Hand, does: "Every outcome — offers and passes — goes to a human. The Sharks only advise.", gate: "Human gate on 100% of runs" },
  { level: 1, short: "L1", name: "Approval required", Icon: ShieldCheck, does: "Passes close automatically; every offer needs a human approval before it is sent.", gate: "Human gate on every offer" },
  { level: 2, short: "L2", name: "Assisted", Icon: Sparkles, does: "Small, high-conviction offers (within the auto-send limits) are sent automatically; larger ones need approval.", gate: "Human gate above the auto-send thresholds" },
  { level: 3, short: "L3", name: "Full auto", Icon: Bot, does: "Any offer up to the fund max check is sent automatically. Only red flags, disagreement and degraded runs reach a human.", gate: "Human gate only on exceptions and escalations" },
] as const;
