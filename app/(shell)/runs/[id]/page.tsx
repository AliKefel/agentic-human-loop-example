import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getRepo } from "@/lib/harness/repo";
import { NotFoundError } from "@/lib/harness/errors";
import { AutoAdvance } from "@/components/run/auto-advance";
import { RunActions } from "@/components/run/run-actions";
import { getActingUser } from "@/lib/current-user";
import { DecisionPanel } from "@/components/run/decision-panel";
import { WAITING_FOR_KIND } from "@/lib/harness/approvals";
import { queueItemFor, toQueueRow } from "@/lib/harness/queue-data";
import { FounderPanel } from "@/components/run/founder-panel";
import { SeverityBadge } from "@/components/incidents/severity-badge";
import { loadMemoriesUsed } from "@/lib/harness/memory";
import { isMockMode } from "@/lib/env";
import type { Pitch, Run, User } from "@/lib/types";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const [{ run, pitch }, user] = await Promise.all([load(id), getActingUser()]);
  const repo = getRepo();
  const [review, messages, incidents, memoriesUsed] = await Promise.all([loadReview(run, pitch, user), repo.listFounderMessages(run.id), repo.listIncidents({ run_id: run.id }), loadMemoriesUsed(repo, run)]);
  const awaitingFounder = run.status === "awaiting_founder";
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
        {incidents.map((i) => (
          <p key={i.id} className="flex items-center gap-2" data-testid="run-incident">
            <SeverityBadge severity={i.severity} /> Incident: {i.title} ({i.status}) · <Link href="/incidents" className="text-primary underline-offset-4 hover:underline">View on incidents board</Link>
          </p>
        ))}
        {(awaitingFounder || messages.length > 0) && <FounderPanel runId={run.id} messages={messages} awaiting={awaitingFounder} mock={isMockMode()} />}
        {run.decision && <DecisionPanel decision={run.decision} item={review.item} user={user} memories={review.memories} />}
        {run.final_terms && <p>Final terms: ${run.final_terms.amount.toLocaleString("en-US")} for {run.final_terms.equity_pct}%</p>}
        {memoriesUsed.length > 0 && (
          <div data-testid="memory-used">
            <p className="font-medium">Memory used</p>
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
              {memoriesUsed.map((m) => <li key={m.id}><span className="text-foreground">{m.subject}</span> ({m.scope}) — {m.content}</li>)}
            </ul>
          </div>
        )}
        {run.error && <p className="text-destructive">Error: {run.error}</p>}
      </CardContent>
    </Card>
  );
}

/** The pending approval for a waiting run, shaped for the review drawer. */
async function loadReview(run: Run, pitch: Pitch, user: User) {
  const repo = getRepo();
  const approval = await repo.pendingApprovalForRun(run.id);
  if (!approval || WAITING_FOR_KIND[approval.kind] !== run.status) return { item: null, memories: [] };
  const [item, memories] = await Promise.all([
    queueItemFor(repo, toQueueRow(approval, run, pitch), run),
    repo.findMemories({ scope: "partner", subject: user.name }),
  ]);
  return { item, memories: memories.map((m) => m.content) };
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
