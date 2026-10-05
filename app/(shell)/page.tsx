import Link from "next/link";
import { Bot, Clock, Coins, DollarSign, GitBranch, Hourglass, Send, ShieldAlert, Undo2 } from "lucide-react";
import { KpiTile } from "@/components/kpi-tile";
import { ChartCard } from "@/components/dashboard/chart-card";
import { OutcomesByDayChart } from "@/components/dashboard/outcomes-by-day-chart";
import { CostPerRunChart } from "@/components/dashboard/cost-per-run-chart";
import { AutonomyChart } from "@/components/dashboard/autonomy-chart";
import { WaitHistogramChart } from "@/components/dashboard/wait-histogram-chart";
import { LatencyChart } from "@/components/dashboard/latency-chart";
import { ReliabilityChart } from "@/components/dashboard/reliability-chart";
import { TokenBurnChart } from "@/components/dashboard/token-burn-chart";
import { SectorMixChart } from "@/components/dashboard/sector-mix-chart";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { Badge } from "@/components/ui/badge";
import { getRepo } from "@/lib/harness/repo";
import { listUsers } from "@/lib/current-user";
import { loadFundStats, STATS_RUN_LIMIT } from "@/lib/stats-server";
import { money } from "@/lib/format";
import { ACTIVITY_FEED_SIZE } from "@/lib/stats";
import { isMockMode } from "@/lib/env";

export const dynamic = "force-dynamic";

const pct = (r: number, d: number) => (d ? `${Math.round(r * 100)}%` : "—");
/** h:mm (SPEC §5.1). */
function hmm(ms: number): string {
  const m = Math.round(ms / 60_000);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
}
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** Fund Overview (SPEC §5.1, M9): 8 KPIs, 8 charts and a live activity feed over the last 500 runs. */
export default async function Page() {
  const repo = getRepo();
  const [stats, audit, users] = await Promise.all([loadFundStats(repo), repo.listAudit({ limit: ACTIVITY_FEED_SIZE, offset: 0 }), listUsers()]);
  const { kpis: k, kpiBasis: b } = stats;
  const none = k.totalRuns === 0;

  const tiles = [
    { label: "Total runs", value: String(k.totalRuns), sub: `${b.terminalRuns} decided · ${plural(b.pendingApprovals, "pending approval")}`, icon: GitBranch },
    { label: "Offers sent", value: String(k.offersSent), sub: `${pct(k.offersSent / (k.totalRuns || 1), k.totalRuns)} of ${plural(k.totalRuns, "run")}`, icon: Send },
    { label: "Capital committed", value: money(k.capitalCommitted), sub: k.offersSent ? `avg ${money(k.capitalCommitted / k.offersSent)} per offer` : "no offers yet", icon: DollarSign },
    { label: "Avg cost / run", value: `$${k.avgCostPerRun.toFixed(3)}`, sub: `budget cap $${stats.budgetCap.toFixed(2)} per run`, icon: Coins },
    { label: "Avg human wait", value: b.decidedApprovals ? hmm(k.avgHumanWaitMs) : "—", sub: `h:mm over ${plural(b.decidedApprovals, "human decision")}`, icon: Hourglass },
    { label: "Automation rate", value: pct(k.automationRate, b.terminalRuns), sub: `${b.autoRuns} of ${b.terminalRuns} outcomes with no human`, icon: Bot },
    { label: "Escalation rate", value: pct(k.escalationRate, k.totalRuns), sub: `${b.escalatedRuns} of ${plural(k.totalRuns, "run")} escalated to a GP`, icon: ShieldAlert },
    { label: "Override rate", value: pct(k.overrideRate, b.decidedApprovals), sub: `${b.overrides} of ${plural(b.decidedApprovals, "human decision")}`, icon: Undo2 },
  ];

  const anyWait = stats.waitHistogram.some((x) => x.count > 0);
  const anyReliability = stats.reliability.some((x) => x.count > 0);

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6" data-testid="fund-overview">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Fund overview</h1>
          <p className="text-sm text-muted-foreground">How the Sharks and the partners are performing — last {STATS_RUN_LIMIT} runs, all autonomy levels.</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock className="size-3.5" aria-hidden />
          <span>Times in UTC</span>
          {isMockMode() && <Badge variant="outline">Mock LLM</Badge>}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Key metrics" data-testid="kpi-grid">
            {tiles.map((t) => <KpiTile key={t.label} {...t} />)}
          </section>

          {none && (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              No runs yet. Start one from <Link href="/pitches" className="text-primary underline-offset-4 hover:underline">Pitches</Link>, or load demo history with <code className="font-mono">pnpm demo:seed</code>.
            </p>
          )}

          <section className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0" aria-label="Charts">
            <ChartCard title="Outcomes over time" description="Runs per day by current outcome" empty={none} testId="card-outcomes">
              <OutcomesByDayChart data={stats.outcomesByDay} />
            </ChartCard>
            <ChartCard title="Cost per run" description={`Last ${stats.costPerRun.length} runs vs the $${stats.budgetCap.toFixed(2)} budget cap`} empty={none} testId="card-cost">
              <CostPerRunChart data={stats.costPerRun} budgetCap={stats.budgetCap} />
            </ChartCard>
            <ChartCard title="Outcomes by autonomy level" description="Who closed the run: the harness, a human gate, or a GP escalation" empty={none} testId="card-autonomy">
              <AutonomyChart data={stats.outcomesByAutonomy} />
            </ChartCard>
            <ChartCard title="Human wait time" description="Approval created → human decision" empty={!anyWait} emptyText="No human decisions yet." testId="card-wait">
              <WaitHistogramChart data={stats.waitHistogram} />
            </ChartCard>
            <ChartCard title="Shark latency" description="p50 / p95 of successful agent calls" empty={!stats.latencyByAgent.length} emptyText="No successful agent calls yet." testId="card-latency">
              <LatencyChart data={stats.latencyByAgent} />
            </ChartCard>
            <ChartCard title="Reliability events" description="What the harness absorbed so runs could finish" empty={!anyReliability} emptyText="No reliability events — every call succeeded first time." testId="card-reliability">
              <ReliabilityChart data={stats.reliability} />
            </ChartCard>
            <ChartCard title="Token burn" description={`Tokens per run (last ${stats.tokensByRun.length}), stacked by agent`} empty={none} testId="card-tokens">
              <TokenBurnChart data={stats.tokensByRun} />
            </ChartCard>
            <ChartCard title="Sector mix" description="Runs by pitch sector" empty={none} testId="card-sectors">
              <SectorMixChart data={stats.sectorMix} />
            </ChartCard>
          </section>
        </div>

        <aside className="min-w-0 xl:sticky xl:top-4 xl:self-start">
          <ActivityFeed initial={audit} users={users} />
        </aside>
      </div>
    </div>
  );
}
