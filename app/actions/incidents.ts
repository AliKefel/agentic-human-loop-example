"use server";
import { revalidatePath } from "next/cache";
import { getRepo } from "@/lib/harness/repo";
import { getActingUser } from "@/lib/current-user";
import { handoffIncident, setIncidentStatus } from "@/lib/harness/incidents";
import { actionFailure, type ActionFailure } from "@/lib/harness/action-error";
import { UUID } from "@/lib/harness/http";

export type IncidentResult = { ok: true } | ActionFailure;
const bad = (error: string, code: 400 | 404 = 400): ActionFailure => ({ ok: false, error, code });

/** Reassign owner (handoff, audited incident.handoff) and save the Next action note. Owner or GP. */
export async function handoffIncidentAction(incidentId: string, toUserId: string, nextAction: string): Promise<IncidentResult> {
  if (typeof incidentId !== "string" || !UUID.test(incidentId)) return bad("Incident not found", 404);
  // Shape-only check (seed user ids are not RFC v4 UUIDs, so no zod .uuid()); existence is checked in handoffIncident.
  if (typeof toUserId !== "string" || !UUID.test(toUserId)) return bad("Choose an owner");
  if (typeof nextAction !== "string" || nextAction.length > 2000) return bad("Next action must be at most 2000 characters");
  try {
    await handoffIncident(getRepo(), incidentId, toUserId, await getActingUser(), nextAction);
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return actionFailure(e, `handoff incident ${incidentId}`, "Incident not found");
  }
}

/** Acknowledge (any role) or resolve (owner or GP). */
export async function setIncidentStatusAction(incidentId: string, status: "acknowledged" | "resolved"): Promise<IncidentResult> {
  if (typeof incidentId !== "string" || !UUID.test(incidentId)) return bad("Incident not found", 404);
  if (status !== "acknowledged" && status !== "resolved") return bad("Invalid status");
  try {
    await setIncidentStatus(getRepo(), incidentId, status, await getActingUser());
    revalidatePath("/", "layout"); // nav badge counts open incidents
    return { ok: true };
  } catch (e) {
    return actionFailure(e, `set incident ${incidentId} ${status}`, "Incident not found");
  }
}
