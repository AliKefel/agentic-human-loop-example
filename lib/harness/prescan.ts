import type { Pitch } from "@/lib/types";
import type { RedFlag } from "@/lib/schemas";
import { scanRedFlags } from "@/lib/tools";

/**
 * Deterministic prescan (SPEC §2.6): the harness itself scans the pitch during
 * triage — no LLM involved — so policy can act on red flags even if a model is fooled.
 */
export function prescan(pitch: Pitch): RedFlag[] {
  return scanRedFlags(pitch);
}

/** Deterministic fast-pass rule: an ask above the fund's max check is passed without any LLM call. */
export function exceedsFundMax(pitch: Pitch, fundMaxCheck: number): boolean {
  return pitch.ask_amount > fundMaxCheck;
}
