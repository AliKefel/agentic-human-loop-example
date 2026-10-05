import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getRepo } from "@/lib/harness/repo";
import { NotFoundError } from "@/lib/harness/errors";
import { AutoAdvance } from "@/components/run/auto-advance";
import { RunActions } from "@/components/run/run-actions";
import { getActingUser } from "@/lib/current-user";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const [{ run, pitch }, user] = await Promise.all([load(id), getActingUser()]);
  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-3">{pitch.company}<Badge>{run.status.replace(/_/g, " ")}</Badge></CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <AutoAdvance runId={run.id} status={run.status} />
        <RunActions runId={run.id} status={run.status} canResume={user.role === "general_partner"} />
        {run.degraded && <p><Badge variant="outline">degraded</Badge> {Object.entries(run.state.shark_failures).map(([a, f]) => `${a}: ${f}`).join(", ")}</p>}
        <p>Steps: {run.step_count} · Tokens: {run.tokens_used.toLocaleString()} · Cost: ${run.cost_usd.toFixed(4)}</p>
        {run.state.triage && <p>Triage: {run.state.triage.fast_pass ? "fast-pass" : "full review"} — {run.state.triage.reason}</p>}
        {run.state.prescan && <p>Prescan flags: {run.state.prescan.length ? run.state.prescan.map((f) => f.code).join(", ") : "none"}</p>}
        {run.plan && <p>Plan: {run.plan.sharks.join(", ")} — {run.plan.rationale}</p>}
        {run.decision && <p>Decision: {run.decision.outcome.replace(/_/g, " ")} ({run.decision.rule}) — {run.decision.explanation}</p>}
        {run.error && <p className="text-destructive">Error: {run.error}</p>}
      </CardContent>
    </Card>
  );
}

async function load(id: string) {
  const repo = getRepo();
  try {
    const run = await repo.getRun(id);
    const pitch = await repo.getPitch(run.pitch_id);
    return { run, pitch };
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
}
