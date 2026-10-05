import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { StatusStepper } from "./status-stepper";
import { cn } from "cn";
import { AUTONOMY_NAME, statusLabel, statusTone, type Step, type StatusTone } from "@/lib/run-view";
import { money, pct } from "@/lib/format";
import type { Pitch, Run } from "@/lib/types";

const TONE: Record<StatusTone, string> = {
  working: "border-primary/30 bg-primary/10 text-primary",
  waiting: "border-warning/40 bg-warning/15 text-foreground",
  success: "border-success/30 bg-success/15 text-success",
  neutral: "border-border bg-secondary text-secondary-foreground",
  danger: "border-destructive/30 bg-destructive/10 text-destructive",
};

export function StatusBadge({ status }: { status: Run["status"] }) {
  const tone = statusTone(status);
  return (
    <Badge variant="outline" className={cn("h-6 px-2.5 text-xs capitalize", TONE[tone])} data-testid="run-status">
      {tone === "working" && <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-primary" />}
      {statusLabel(status)}
    </Badge>
  );
}

/** Header (SPEC §5.3): company, status, autonomy, config version, who started it, and the stepper. */
export function RunHeader({ run, pitch, steps, startedBy, actions }: { run: Run; pitch: Pitch; steps: Step[]; startedBy: string | null; actions?: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{pitch.company}</h1>
              <StatusBadge status={run.status} />
              <Badge variant="secondary" className="h-6">{AUTONOMY_NAME[run.autonomy_level]}</Badge>
              <Badge variant="outline" className="h-6 font-mono">config v{run.config_version}</Badge>
              {run.degraded && <Badge variant="outline" className="h-6 border-warning/40 text-foreground">degraded</Badge>}
            </div>
            <p className="text-sm text-muted-foreground">{pitch.tagline}</p>
            <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span>{pitch.founder} · {pitch.sector}</span>
              <span>Ask <span className="font-medium text-foreground tabular-nums">{money(pitch.ask_amount)}</span> for <span className="font-medium text-foreground tabular-nums">{pct(pitch.equity_offered)}</span></span>
              <span>Started by {startedBy ?? "system"} · <time suppressHydrationWarning dateTime={run.started_at}>{new Date(run.started_at).toLocaleString()}</time></span>
              <Link href="/pitches" className="text-primary underline-offset-4 hover:underline">All pitches</Link>
            </p>
          </div>
          {actions}
        </div>
        <StatusStepper steps={steps} />
      </CardContent>
    </Card>
  );
}
