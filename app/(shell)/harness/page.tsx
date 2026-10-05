import { CalendarClock, Settings2, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfigEditor } from "@/components/harness/config-editor";
import { VersionHistory } from "@/components/harness/version-history";
import { AUTONOMY_LEVELS } from "@/components/harness/autonomy-levels";
import { getRepo } from "@/lib/harness/repo";
import { getActingUser, listUsers } from "@/lib/current-user";
import { toDraft } from "@/lib/harness/config";
import { money } from "@/lib/format";
import type { SimRun } from "@/lib/simulate";

export const dynamic = "force-dynamic";

/** Runs passed to the client for the what-if simulator (it slices 25 / 50 / 100). */
const SIM_RUN_LIMIT = 100;

/** Harness (SPEC §5.6, M10): active config, draft editor + what-if simulator, version history with diff. */
export default async function Page() {
  const repo = getRepo();
  const [active, configs, users, user, simRuns] = await Promise.all([
    repo.getActiveConfig(), repo.listConfigs(), listUsers(), getActingUser(), repo.listRunsForSimulation(SIM_RUN_LIMIT),
  ]);
  const names = Object.fromEntries(users.map((u) => [u.id, u.name]));
  const canPublish = user.role === "general_partner";
  // Only what the policy engine reads crosses to the client.
  const runs: SimRun[] = simRuns.map((r) => ({
    degraded: r.degraded,
    state: {
      prescan: r.state?.prescan, shark_outputs: r.state?.shark_outputs ?? {}, shark_failures: r.state?.shark_failures ?? {},
      synthesis: r.state?.synthesis, founder_asked: !!r.state?.founder_asked, founder_answers: r.state?.founder_answers ?? [], memories_used: [],
    },
  }));
  const level = AUTONOMY_LEVELS[active.autonomy_level];
  const t = active.thresholds;

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6" data-testid="harness-page">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Harness</h1>
        <p className="text-sm text-muted-foreground">The versioned spec the Sharks run inside: autonomy, policy thresholds, budgets, reliability and trust boundaries.</p>
      </div>

      <Card data-testid="active-config">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2"><Settings2 className="size-4 text-primary" aria-hidden />Active config <span className="font-mono">v{active.version}</span></CardTitle>
              <CardDescription>{active.notes || "No release notes."}</CardDescription>
            </div>
            <Badge variant="outline" className="text-sm">{level.short} · {level.name}</Badge>
          </div>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
          <span className="flex items-center gap-1.5"><UserRound className="size-3.5 text-muted-foreground" aria-hidden />Published by <span className="font-medium">{active.created_by ? (names[active.created_by] ?? "Unknown") : "System"}</span></span>
          <span className="flex items-center gap-1.5"><CalendarClock className="size-3.5 text-muted-foreground" aria-hidden />{new Date(active.created_at).toISOString().slice(0, 16).replace("T", " ")} UTC</span>
          <span className="text-muted-foreground">Auto-send ≤ <span className="text-foreground">{money(t.auto_max_amount)}</span> · ≤ {t.auto_max_equity}% · score ≥ {t.auto_min_score}</span>
          <span className="text-muted-foreground">Partner limit <span className="text-foreground">{money(t.partner_limit)}</span> · fund max <span className="text-foreground">{money(t.fund_max_check)}</span></span>
          <span className="text-muted-foreground">{configs.length} {configs.length === 1 ? "version" : "versions"} published</span>
        </CardContent>
      </Card>

      <ConfigEditor key={active.version} active={active} initialDraft={toDraft(active)} runs={runs} canPublish={canPublish} />

      <VersionHistory key={`h${active.version}`} configs={configs} names={names} />
    </div>
  );
}
