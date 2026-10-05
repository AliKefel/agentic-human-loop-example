import { getRepo } from "@/lib/harness/repo";
import { getActingUser, listUsers } from "@/lib/current-user";
import { IncidentsBoard } from "@/components/incidents/incidents-board";

export const dynamic = "force-dynamic";

/** Incidents (SPEC §5.5): Open · Acknowledged · Resolved columns, detail Sheet with handoff note. */
export default async function IncidentsPage() {
  const [incidents, users, user] = await Promise.all([getRepo().listIncidents(), listUsers(), getActingUser()]);
  return <IncidentsBoard incidents={incidents} users={users} user={user} />;
}
