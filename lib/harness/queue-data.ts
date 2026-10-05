import "server-only";
import type { AgentName, ApprovalQueueRow, ApprovalRow, Pitch, QueueItem, Run } from "@/lib/types";
import type { Repo } from "./repo";

const ORDER: AgentName[] = ["market", "finance", "product", "skeptic"];

/** Joins an approval with the run details the approval drawer needs. */
export async function queueItemFor(repo: Repo, a: ApprovalQueueRow, run?: Run): Promise<QueueItem> {
  const r = run ?? (await repo.getRun(a.run_id));
  const config = await repo.getConfig(r.config_version);
  return {
    approval: a,
    scores: ORDER.flatMap((agent) => {
      const o = r.state.shark_outputs[agent];
      return o ? [{ agent, score: o.score, verdict: o.verdict }] : [];
    }),
    failures: Object.entries(r.state.shark_failures).map(([agent, f]) => `${agent}: ${f}`),
    summary: r.state.synthesis?.summary ?? null,
    disagreements: r.state.synthesis?.disagreements ?? [],
    replans: r.replans,
    maxReplans: config.budgets.max_replans,
    fundMax: config.thresholds.fund_max_check,
  };
}

export function toQueueRow(a: ApprovalRow, run: Run, pitch: Pitch): ApprovalQueueRow {
  return { ...a, company: pitch.company, sector: pitch.sector, autonomy_level: run.autonomy_level, run_status: run.status };
}
