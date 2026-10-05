import "server-only";
import { getRepo, type Repo } from "@/lib/harness/repo";
import { computeStats, type FundStats } from "@/lib/stats";

/** Fund Overview window: the most recent runs considered by every KPI and chart. */
export const STATS_RUN_LIMIT = 500;

/** Fetches the last STATS_RUN_LIMIT runs and their approvals / agent calls / tool calls, then computeStats (pure). */
export async function loadFundStats(repo: Repo = getRepo()): Promise<FundStats> {
  const [runs, pitches, config] = await Promise.all([repo.listRuns(STATS_RUN_LIMIT), repo.listPitches(), repo.getActiveConfig()]);
  const ids = runs.map((r) => r.id);
  const [approvals, agentCalls, toolCalls] = await Promise.all([repo.listApprovalsForRuns(ids), repo.listAgentCallsForRuns(ids), repo.listToolCallsForRuns(ids)]);
  return computeStats({ runs, pitches, approvals, agentCalls, toolCalls, config });
}
