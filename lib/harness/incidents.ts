import type { RedFlag } from "@/lib/schemas";
import type { IncidentHandoff, IncidentRow, Pitch, Run, User } from "@/lib/types";
import { GP_ID } from "@/lib/mock/seed-users";
import type { Repo } from "./repo";
import { SYSTEM, actor } from "./audit";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "./errors";

/**
 * Incidents and handoff (SPEC §2.12). Created automatically for escalated runs (policy_check
 * effects) and failed runs (failRun, after its CAS wins). Incidents have their own lifecycle
 * (open → acknowledged → resolved): deciding the escalation approval never resolves them.
 *
 * Permissions (documented ruling): any role may acknowledge; only the current owner or a
 * General Partner may hand off (reassign) or resolve.
 */

export type Severity = IncidentRow["severity"];
export const SLA_HOURS: Record<Severity, number> = { sev1: 4, sev2: 8, sev3: 24 };
/** Default owner of every new incident: the General Partner (seed user). */
export const INCIDENT_OWNER_ID = GP_ID;

const usd = (n: number) => `$${n.toLocaleString("en-US")}`;

/** prompt_injection → sev1 (wins); inconsistent_financials or any other high flag → sev2. */
export function severityForFlags(flags: RedFlag[]): { severity: Severity; title: string } {
  const high = flags.filter((f) => f.severity === "high");
  if (high.some((f) => f.code === "prompt_injection")) return { severity: "sev1", title: "Prompt injection attempt in pitch" };
  if (high.some((f) => f.code === "inconsistent_financials")) return { severity: "sev2", title: "Inconsistent financials" };
  const code = high[0]?.code ?? "unknown";
  return { severity: "sev2", title: `High-severity red flag: ${code}` };
}

/** "<status> (last checkpoint #<seq> <node>)" — the handoff note's Current state line. */
async function currentState(repo: Repo, run: Run): Promise<string> {
  const cp = await repo.lastCheckpoint(run.id);
  return cp ? `${run.status} (last checkpoint #${cp.seq} ${cp.node})` : `${run.status} (no checkpoint)`;
}

export async function openIncident(repo: Repo, run: Run, pitch: Pitch, args: { severity: Severity; title: string; whatHappened: string; impact: string }): Promise<IncidentRow> {
  const handoff: IncidentHandoff = { what_happened: args.whatHappened, impact: args.impact, current_state: await currentState(repo, run), next_action: "" };
  const incident = await repo.addIncident({
    run_id: run.id, severity: args.severity, title: args.title.slice(0, 200), owner_id: INCIDENT_OWNER_ID, handoff,
    sla_due: new Date(Date.now() + SLA_HOURS[args.severity] * 3600e3).toISOString(),
  });
  await repo.audit({ ...SYSTEM, action: "incident.created", entity: "incident", entity_id: incident.id, details: { run_id: run.id, company: pitch.company, severity: args.severity, owner_id: INCIDENT_OWNER_ID, title: incident.title } });
  return incident;
}

/** The incident for an escalated run: severity from the high flags, what happened from rule + flag details. */
export async function openEscalationIncident(repo: Repo, run: Run, pitch: Pitch, flags: RedFlag[]): Promise<IncidentRow> {
  const high = flags.filter((f) => f.severity === "high");
  const { severity, title } = severityForFlags(high);
  const details = [...new Set(high.map((f) => `${f.code}: ${f.detail.trim().replace(/\.+$/, "")}`))].join("; ");
  const terms = run.state.synthesis?.terms;
  return openIncident(repo, run, pitch, {
    severity,
    title,
    whatHappened: `Rule ${run.decision?.rule ?? "escalate.red_flag"} fired — ${details || "high-severity red flag"}. Escalated to a General Partner.`,
    impact: terms ? `${usd(terms.amount)} offer blocked before sending` : "Decision blocked pending General Partner review",
  });
}

/** The sev3 incident for a failed run. `run` is the committed (failed) run. */
export async function openFailureIncident(repo: Repo, run: Run, pitch: Pitch, from: string): Promise<IncidentRow> {
  return openIncident(repo, run, pitch, {
    severity: "sev3",
    title: "Run failed",
    whatHappened: `Run failed during ${from}: ${run.error ?? "unknown error"}.`,
    impact: "Run stopped before a decision; no offer sent",
  });
}

const isOwnerOrGp = (inc: IncidentRow, user: User) => user.role === "general_partner" || inc.owner_id === user.id;

/**
 * Reassigns the incident (a handoff, audited `incident.handoff` {from, to}) and stores the
 * human-written Next action. Same owner → only the note changes (audited `incident.note_updated`).
 */
export async function handoffIncident(repo: Repo, incidentId: string, toUserId: string, user: User, nextAction: string): Promise<void> {
  const inc = await repo.getIncident(incidentId); // NotFoundError
  if (inc.status === "resolved") throw new ConflictError("Incident is already resolved");
  if (!isOwnerOrGp(inc, user)) throw new ForbiddenError("Only the incident owner or a General Partner can hand off this incident");
  try {
    await repo.getUser(toUserId);
  } catch (e) {
    if (e instanceof NotFoundError) throw new ValidationError("Unknown user");
    throw e;
  }
  const next = nextAction.trim().slice(0, 2000);
  const handoff = { ...(inc.handoff as IncidentHandoff), next_action: next };
  const updated = await repo.updateIncident(inc.id, { owner_id: toUserId, handoff }, inc.status);
  if (!updated) throw new ConflictError("Incident changed while handing off; try again");
  if (inc.owner_id === toUserId) {
    await repo.audit({ ...actor(user), action: "incident.note_updated", entity: "incident", entity_id: inc.id, details: { next_action: next } });
    return;
  }
  await repo.audit({ ...actor(user), action: "incident.handoff", entity: "incident", entity_id: inc.id, details: { from: inc.owner_id, to: toUserId, next_action: next } });
}

/** open → acknowledged (any role); open|acknowledged → resolved (owner or GP; sets resolved_at). */
export async function setIncidentStatus(repo: Repo, incidentId: string, status: "acknowledged" | "resolved", user: User): Promise<void> {
  const inc = await repo.getIncident(incidentId); // NotFoundError
  if (status === "acknowledged" && inc.status !== "open") throw new ConflictError(`Incident is ${inc.status}, not open`);
  if (status === "resolved") {
    if (inc.status === "resolved") throw new ConflictError("Incident is already resolved");
    if (!isOwnerOrGp(inc, user)) throw new ForbiddenError("Only the incident owner or a General Partner can resolve this incident");
  }
  const patch = status === "resolved" ? { status, resolved_at: new Date().toISOString() } : { status };
  const updated = await repo.updateIncident(inc.id, patch, inc.status);
  if (!updated) throw new ConflictError("Incident changed; try again");
  await repo.audit({ ...actor(user), action: `incident.${status}`, entity: "incident", entity_id: inc.id, details: { from: inc.status, run_id: inc.run_id } });
}
