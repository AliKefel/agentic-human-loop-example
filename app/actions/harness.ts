"use server";
import { revalidatePath } from "next/cache";
import { getRepo } from "@/lib/harness/repo";
import { getActingUser } from "@/lib/current-user";
import { publishConfig } from "@/lib/harness/config";
import { actionFailure, type ActionFailure } from "@/lib/harness/action-error";
import type { ConfigDraft } from "@/lib/types";

export type PublishResult = { ok: true; version: number } | ActionFailure;

/** Publish a new harness config version. GP only and validated on the server (publishConfig), never by the UI. */
export async function publishConfigAction(draft: ConfigDraft): Promise<PublishResult> {
  try {
    const created = await publishConfig(getRepo(), draft, await getActingUser());
    revalidatePath("/", "layout");
    return { ok: true, version: created.version };
  } catch (e) {
    return actionFailure(e, "publish harness config");
  }
}
