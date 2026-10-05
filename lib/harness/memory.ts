import type { MemoryRow, Pitch, Run, Terms, User } from "@/lib/types";
import { money } from "@/lib/format";
import type { Repo } from "./repo";
import { SYSTEM, actor } from "./audit";

/**
 * Memory (SPEC §2.11). firm: written when a human overrides the AI, read by synthesis (same sector, 5 newest).
 * founder: written when a run reaches offer_sent/passed, read by planning. partner: seeded, shown in the drawer.
 * Memory text is written by the fund (internal notes), not by the founder, so it is not wrapped as untrusted.
 */

export async function memoriesForPlanning(repo: Repo, pitch: Pitch): Promise<MemoryRow[]> {
  return repo.findMemories({ scope: "founder", subject: pitch.founder, limit: 5 });
}

export async function memoriesForSynthesis(repo: Repo, pitch: Pitch): Promise<MemoryRow[]> {
  return repo.findMemories({ scope: "firm", sector: pitch.sector, limit: 5 });
}

/** `<memory id="...">content</memory>` lines for prompts. */
export function formatMemories(ms: MemoryRow[]): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return ms.map((m) => `<memory id="${m.id}">${esc(m.content)}</memory>`).join("\n");
}

/** Appends ids to a run's memories_used, deduped, keeping first-seen order. */
export function mergeMemoryIds(used: string[], ms: MemoryRow[]): string[] {
  return [...new Set([...used, ...ms.map((m) => m.id)])];
}

const fmtTerms = (t: Terms) => `${money(t.amount)} for ${t.equity_pct}%`;
const fmtRec = (rec: string, t: Terms | null) => (t ? `${rec} ${fmtTerms(t)}` : rec);

async function write(repo: Repo, who: { actor_id: string | null; actor_role: string }, m: { scope: MemoryRow["scope"]; subject: string; sector: string | null; content: string; source_run_id: string | null }) {
  await repo.addMemory(m);
  await repo.audit({ ...who, action: "memory.created", entity: "memory", details: { scope: m.scope, subject: m.subject, sector: m.sector, source_run_id: m.source_run_id } });
}

/** Firm memory for a human override: "On {sector} deal {company}, {role} changed {ai} → {human} because: {reason}". */
export async function rememberOverride(
  repo: Repo, run: Run, pitch: Pitch, user: User,
  ai: { rec: string; terms: Terms | null }, human: { status: string; terms: Terms | null }, reason: string,
): Promise<void> {
  const humanText = human.status === "passed" ? "pass" : human.terms ? fmtRec("invest", human.terms) : human.status;
  const content = `On ${pitch.sector} deal ${pitch.company}, ${user.role.replace(/_/g, " ")} changed ${fmtRec(ai.rec, ai.terms)} → ${humanText} because: ${reason}`;
  await write(repo, actor(user), { scope: "firm", subject: pitch.company, sector: pitch.sector, content, source_run_id: run.id });
}

/** Founder memory when a run becomes offer_sent or passed. */
export async function rememberOutcome(repo: Repo, run: Run, pitch: Pitch): Promise<void> {
  const ym = (run.completed_at ?? new Date().toISOString()).slice(0, 7);
  const outcome = run.status === "offer_sent"
    ? `offer sent${run.final_terms ? `: ${fmtTerms(run.final_terms)}` : ""}`
    : `passed${run.decision?.rule ? `: ${run.decision.rule}` : ""}`;
  await write(repo, SYSTEM, { scope: "founder", subject: pitch.founder, sector: pitch.sector, content: `${ym}: Run ${run.id.slice(0, 8)} — ${outcome}`, source_run_id: run.id });
}

/** Memories a run used, in recorded order (ids that no longer exist are skipped). For the run page. */
export async function loadMemoriesUsed(repo: Repo, run: Run): Promise<MemoryRow[]> {
  const ids = new Set(run.state.memories_used);
  if (!ids.size) return [];
  const all = await repo.listMemories();
  const byId = new Map(all.map((m) => [m.id, m]));
  return run.state.memories_used.flatMap((id) => byId.get(id) ?? []);
}
