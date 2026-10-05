import "server-only";
import type { Repo } from "@/lib/harness/repo";
import { loadMemoriesUsed } from "@/lib/harness/memory";
import type { RunView } from "@/lib/run-view";

/** Audit rows shown on the run page (newest first). */
const AUDIT_LIMIT = 200;

/** Loads everything The Tank renders for one run, with independent queries in parallel. getRun throws NotFoundError. */
export async function loadRunView(repo: Repo, id: string): Promise<RunView> {
  const run = await repo.getRun(id);
  const [pitch, config, checkpoints, agentCalls, toolCalls, approvals, founderMessages, memoriesUsed, audit, incidents, startedBy] = await Promise.all([
    repo.getPitch(run.pitch_id),
    repo.getConfig(run.config_version),
    repo.listCheckpoints(id),
    repo.listAgentCalls(id),
    repo.listToolCalls(id),
    repo.listApprovalsForRun(id),
    repo.listFounderMessages(id),
    loadMemoriesUsed(repo, run),
    repo.listAudit({ entityId: id, limit: AUDIT_LIMIT, offset: 0 }),
    repo.listIncidents({ run_id: id }),
    run.started_by ? repo.getUser(run.started_by).catch(() => null) : Promise.resolve(null),
  ]);
  return { run, pitch, config, checkpoints, agentCalls, toolCalls, approvals, founderMessages, memoriesUsed, audit, incidents, startedByName: startedBy?.name ?? null };
}
