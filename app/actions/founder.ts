"use server";
import { revalidatePath } from "next/cache";
import { getRepo } from "@/lib/harness/repo";
import { getActingUser } from "@/lib/current-user";
import { answerFounder, MAX_ANSWER_CHARS } from "@/lib/harness/founder";
import { actionFailure, type ActionFailure } from "@/lib/harness/action-error";
import { UUID } from "@/lib/harness/http";
import { isMockMode } from "@/lib/env";
import { SCRIPTED_FOUNDER_REPLY } from "@/lib/mock/fixtures";
import type { RunStatus } from "@/lib/types";

export type FounderResult = { ok: true; status: RunStatus } | ActionFailure;

async function answer(runId: string, body: string): Promise<FounderResult> {
  try {
    const run = await answerFounder(getRepo(), runId, await getActingUser(), body);
    revalidatePath(`/runs/${runId}`);
    return { ok: true, status: run.status };
  } catch (e) {
    return actionFailure(e, `answer founder ${runId}`, "Run not found");
  }
}

/** Answer as founder (SPEC §2.10). Any role (analyst and up); the run must be awaiting_founder. */
export async function answerFounderAction(runId: string, body: string): Promise<FounderResult> {
  if (typeof runId !== "string" || !UUID.test(runId)) return { ok: false, error: "Run not found", code: 404 };
  if (typeof body !== "string" || body.length > MAX_ANSWER_CHARS) return { ok: false, error: `The answer must be at most ${MAX_ANSWER_CHARS} characters`, code: 400 };
  return answer(runId, body);
}

/** Mock mode only: answers with the pitch's scripted founder reply (the reply text never leaves the server). */
export async function scriptedFounderReplyAction(runId: string): Promise<FounderResult> {
  if (!isMockMode()) return { ok: false, error: "Scripted replies are only available in Mock mode", code: 403 };
  if (typeof runId !== "string" || !UUID.test(runId)) return { ok: false, error: "Run not found", code: 404 };
  try {
    const repo = getRepo();
    const pitch = await repo.getPitch((await repo.getRun(runId)).pitch_id);
    const reply = SCRIPTED_FOUNDER_REPLY[pitch.slug];
    if (!reply) return { ok: false, error: `No scripted reply for ${pitch.company}`, code: 400 };
    return answer(runId, reply);
  } catch (e) {
    return actionFailure(e, `scripted founder reply ${runId}`, "Run not found");
  }
}
