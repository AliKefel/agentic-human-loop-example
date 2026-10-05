import type { Run, User } from "@/lib/types";
import type { Repo } from "./repo";
import { actor } from "./audit";
import { initialRunState } from "./run-state";

export async function createRun(
  repo: Repo,
  input: { pitchId: string; autonomyLevel?: 0 | 1 | 2 | 3; user: User },
): Promise<Run> {
  const pitch = await repo.getPitch(input.pitchId); // throws NotFoundError
  const config = await repo.getActiveConfig();
  const autonomy = (input.autonomyLevel ?? config.autonomy_level) as 0 | 1 | 2 | 3;
  const run = await repo.createRun({ pitch_id: pitch.id, config_version: config.version, autonomy_level: autonomy, started_by: input.user.id });
  await repo.addCheckpoint({ run_id: run.id, seq: 0, node: "queued", state: initialRunState(), duration_ms: 0 });
  await repo.audit({ ...actor(input.user), action: "run.created", entity: "run", entity_id: run.id, details: { pitch: pitch.slug, autonomy_level: autonomy, config_version: config.version } });
  return run;
}
