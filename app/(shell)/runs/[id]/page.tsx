import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AutoAdvance } from "@/components/run/auto-advance";
import { RealtimeRefresh } from "@/components/run/realtime-refresh";
import { RunActions } from "@/components/run/run-actions";
import { RunHeader } from "@/components/run/run-header";
import { AgentGraph } from "@/components/run/agent-graph";
import { BudgetMeter } from "@/components/run/budget-meter";
import { DecisionPanel } from "@/components/run/decision-panel";
import { SharkCard } from "@/components/run/shark-card";
import { ScoreRadar } from "@/components/run/score-radar";
import { ValuationChart } from "@/components/run/valuation-chart";
import { RunTabs } from "@/components/run/run-tabs";
import { SeverityBadge } from "@/components/incidents/severity-badge";
import { getRepo } from "@/lib/harness/repo";
import { NotFoundError } from "@/lib/harness/errors";
import { WAITING_FOR_KIND } from "@/lib/harness/approvals";
import { queueItemFor, toQueueRow } from "@/lib/harness/queue-data";
import { getActingUser, listUsers } from "@/lib/current-user";
import { isMockMode } from "@/lib/env";
import { loadRunView } from "@/lib/run-view-server";
import { SHARKS, SHARK_LABEL, deriveGraph, deriveSteps, sharkBadges, sharkStats, valuationData } from "@/lib/run-view";
import { duration } from "@/lib/format";
import type { Repo } from "@/lib/harness/repo";
import type { Pitch, Run, User } from "@/lib/types";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The Tank (SPEC §5.3): live view of one run. Realtime + AutoAdvance keep it current. */
export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const repo = getRepo();
  const [view, user, users] = await Promise.all([load(repo, id), getActingUser(), listUsers()]);
  const { run, pitch, config, agentCalls, toolCalls } = view;
  const review = await loadReview(repo, run, pitch, user);

  const graph = deriveGraph(run, agentCalls, view.approvals);
  const steps = deriveSteps(run, graph);
  const radar = SHARKS.map((a) => ({ agent: SHARK_LABEL[a], score: run.state.shark_outputs[a]?.score ?? 0, scored: !!run.state.shark_outputs[a] }));
  const scored = radar.filter((r) => r.scored);
  const avg = scored.length ? scored.reduce((n, r) => n + r.score, 0) / scored.length : null;
  const pending = view.approvals.filter((a) => a.status === "pending").at(-1) ?? null;

  const denied = toolCalls.filter((t) => !t.permitted).length;
  const reliability = agentCalls.filter((c) => c.status !== "ok").length;
  const facts = [
    { label: "Agent calls", value: String(agentCalls.length) },
    { label: "Failed / skipped attempts", value: String(reliability) },
    { label: "Tool calls", value: denied ? `${toolCalls.length} · ${denied} denied` : String(toolCalls.length), alert: denied > 0 },
    { label: "Elapsed", value: duration(new Date(run.completed_at ?? view.checkpoints.at(-1)?.created_at ?? run.started_at).getTime() - new Date(run.started_at).getTime()) },
  ];

  const actions = <RunActions runId={run.id} status={run.status} canResume={user.role === "general_partner"} review={review} />;

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-4 pb-20 lg:pb-0" data-testid="run-view">
      <RealtimeRefresh runId={run.id} />
      <AutoAdvance runId={run.id} status={run.status} />
      <RunHeader run={run} pitch={pitch} steps={steps} startedBy={view.startedByName} actions={<div className="hidden lg:block">{actions}</div>} />

      {run.error && (
        <Alert variant="destructive">
          <AlertTriangle aria-hidden />
          <AlertTitle>Run failed</AlertTitle>
          <AlertDescription>{run.error}</AlertDescription>
        </Alert>
      )}
      {view.incidents.map((i) => (
        <Alert key={i.id} data-testid="run-incident">
          <AlertTriangle aria-hidden />
          <AlertTitle className="flex flex-wrap items-center gap-2"><SeverityBadge severity={i.severity} /> Incident: {i.title}</AlertTitle>
          <AlertDescription>
            <span>Status {i.status}. <Link href="/incidents" className="text-primary underline-offset-4 hover:underline">View on incidents board</Link></span>
          </AlertDescription>
        </Alert>
      ))}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 [&>*]:min-w-0">
        <Card className="flex flex-col lg:col-span-8">
          <CardHeader>
            <CardTitle>Agent graph</CardTitle>
            <CardDescription>Lead Shark plans, the Sharks analyze in parallel, the policy engine decides who signs off.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col justify-between gap-4">
            <AgentGraph graph={graph} />
            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border text-xs sm:grid-cols-4" data-testid="run-facts">
              {facts.map((f) => (
                <div key={f.label} className="bg-card px-3 py-2">
                  <dt className="text-muted-foreground">{f.label}</dt>
                  <dd className={f.alert ? "text-lg font-semibold tabular-nums text-destructive" : "text-lg font-semibold tabular-nums"}>{f.value}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
        <div className="flex flex-col gap-4 lg:col-span-4">
          <BudgetMeter run={run} config={config} />
          <DecisionPanel
            decision={run.decision}
            recommendation={run.recommendation}
            draftTerms={run.state.synthesis?.terms ?? null}
            finalTerms={run.final_terms}
            summary={run.state.synthesis?.summary ?? null}
            slaDue={pending?.sla_due ?? null}
          />
        </div>

        <section className="grid gap-4 sm:grid-cols-2 lg:col-span-12 xl:grid-cols-4" aria-label="Shark cards">
          {SHARKS.map((a) => (
            <SharkCard
              key={a}
              agent={a}
              state={graph[a]}
              output={run.state.shark_outputs[a]}
              badges={sharkBadges(a, agentCalls, toolCalls)}
              stats={sharkStats(a, agentCalls)}
              question={run.plan?.questions[a]}
              skippedReason={run.state.shark_failures[a] === "skipped_budget" ? "Skipped — the remaining budget couldn't cover this Shark." : run.state.triage?.fast_pass || run.decision?.rule === "triage.fast_pass" ? "Skipped — fast-passed at triage." : run.plan && !run.plan.sharks.includes(a) ? "Not in the Lead Shark's plan." : undefined}
            />
          ))}
        </section>

        <Card className="lg:col-span-6">
          <CardHeader>
            <CardTitle>Shark scores</CardTitle>
            <CardDescription>{avg !== null ? <>Average <span className="font-medium text-foreground tabular-nums">{avg.toFixed(1)}</span> / 10 across {scored.length} Shark{scored.length === 1 ? "" : "s"} · auto-send needs ≥ {config.thresholds.auto_min_score}</> : "0–10 per Shark"}</CardDescription>
          </CardHeader>
          <CardContent><ScoreRadar data={radar} /></CardContent>
        </Card>
        <Card className="lg:col-span-6">
          <CardHeader>
            <CardTitle>Valuation</CardTitle>
            <CardDescription>Founder&apos;s implied post-money (ask ÷ equity) vs each Shark&apos;s proposed terms</CardDescription>
          </CardHeader>
          <CardContent><ValuationChart data={valuationData(pitch, run)} /></CardContent>
        </Card>

        <Card className="min-w-0 lg:col-span-12">
          <CardContent className="min-w-0">
            <RunTabs
              run={run}
              checkpoints={view.checkpoints}
              agentCalls={agentCalls}
              toolCalls={toolCalls}
              founderMessages={view.founderMessages}
              memoriesUsed={view.memoriesUsed}
              audit={view.audit}
              users={users}
              mock={isMockMode()}
            />
          </CardContent>
        </Card>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 px-4 py-3 backdrop-blur lg:hidden">{actions}</div>
    </div>
  );
}

/** The pending approval for a waiting run, shaped for the review drawer. */
async function loadReview(repo: Repo, run: Run, pitch: Pitch, user: User) {
  const approval = await repo.pendingApprovalForRun(run.id);
  if (!approval || WAITING_FOR_KIND[approval.kind] !== run.status) return null;
  const [item, memories] = await Promise.all([
    queueItemFor(repo, toQueueRow(approval, run, pitch), run),
    repo.findMemories({ scope: "partner", subject: user.name }),
  ]);
  return { item, user, memories: memories.map((m) => m.content) };
}

async function load(repo: Repo, id: string) {
  try {
    return await loadRunView(repo, id);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
}
