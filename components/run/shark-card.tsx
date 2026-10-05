import type { LucideIcon } from "lucide-react";
import { Calculator, Loader2, Package, ShieldAlert, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "cn";
import { SHARK_LABEL, type NodeState } from "@/lib/run-view";
import { money, pct } from "@/lib/format";
import type { SharkOutput } from "@/lib/schemas";
import type { AgentName } from "@/lib/types";

const ICON: Record<AgentName, LucideIcon> = { market: TrendingUp, finance: Calculator, product: Package, skeptic: ShieldAlert };

const BADGE_HELP: Record<string, string> = {
  retry: "The call was retried after a timeout, error or invalid JSON.",
  fallback: "The fallback model answered after the primary model failed.",
  timeout: "At least one attempt hit the configured timeout.",
  "schema fail": "At least one response failed schema validation.",
  skipped: "Skipped: the run's token/$ budget could not cover this Shark.",
  "denied tool": "Requested a tool or data source outside its permissions — denied by the harness.",
};
const badgeTone = (b: string) =>
  b === "denied tool" || b.startsWith("timeout") ? "border-destructive/40 bg-destructive/10 text-destructive"
  : b === "skipped" ? "border-dashed border-muted-foreground/50 text-muted-foreground"
  : "border-warning/50 bg-warning/15 text-foreground";

const EMPTY: Record<NodeState, string> = {
  idle: "Waiting for the Lead Shark's plan.",
  running: "Analyzing the pitch…",
  ok: "",
  failed: "Failed after retries and fallback — synthesis proceeds without this Shark.",
  skipped: "Not run.",
  waiting: "",
};

export type SharkCardProps = {
  agent: AgentName;
  state: NodeState;
  output?: SharkOutput;
  badges: string[];
  stats: { latencyMs: number | null; tokens: number; cost: number; attempts: number; model: string | null };
  question?: string;
  skippedReason?: string;
};

/** Shark card (SPEC §5.3): score, verdict, confidence, latency/tokens/cost, reliability badges, key points. */
export function SharkCard({ agent, state, output, badges, stats, question, skippedReason }: SharkCardProps) {
  const Icon = ICON[agent];
  return (
    <Card size="sm" className={cn("h-full", state === "running" && "ring-2 ring-primary/50", state === "skipped" && "opacity-75")} data-testid={`shark-${agent}`} data-state={state}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className={cn("flex size-7 items-center justify-center rounded-md", state === "ok" ? "bg-success/15 text-success" : state === "failed" ? "bg-destructive/10 text-destructive" : state === "running" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground")}>
            {state === "running" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Icon className="size-4" aria-hidden />}
          </span>
          {SHARK_LABEL[agent]} Shark
          {output && (
            <Badge variant="outline" className={cn("ml-auto uppercase", output.verdict === "invest" ? "border-success/40 bg-success/10 text-success" : "border-border text-muted-foreground")}>
              {output.verdict}
            </Badge>
          )}
          {!output && state !== "idle" && <Badge variant="outline" className="ml-auto capitalize text-muted-foreground">{state === "ok" ? "done" : state}</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        {output ? (
          <>
            <div className="flex items-end justify-between gap-3">
              <p className="text-4xl font-semibold leading-none tabular-nums" data-testid={`shark-${agent}-score`}>
                {output.score}<span className="text-base font-normal text-muted-foreground">/10</span>
              </p>
              {output.proposed_terms && (
                <p className="text-right text-xs text-muted-foreground">
                  Proposes<br />
                  <span className="font-medium text-foreground tabular-nums">{money(output.proposed_terms.amount)} for {pct(output.proposed_terms.equity_pct)}</span>
                </p>
              )}
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground"><span>Confidence</span><span className="tabular-nums">{Math.round(output.confidence * 100)}%</span></div>
              <Progress value={output.confidence * 100} className="h-1.5" aria-label={`${SHARK_LABEL[agent]} confidence ${Math.round(output.confidence * 100)}%`} />
            </div>
          </>
        ) : (
          <div className={cn("flex min-h-24 items-center rounded-md border border-dashed px-3 text-xs text-muted-foreground", state === "running" && "animate-pulse border-primary/40")}>
            {state === "skipped" && skippedReason ? skippedReason : EMPTY[state]}
          </div>
        )}
        <p className="flex flex-wrap gap-x-2 text-xs text-muted-foreground tabular-nums">
          <span>{stats.latencyMs !== null ? `${(stats.latencyMs / 1000).toFixed(1)}s` : "—"}</span>·
          <span>{stats.tokens.toLocaleString("en-US")} tok</span>·
          <span>${stats.cost.toFixed(4)}</span>
          {stats.attempts > 1 && <><span>·</span><span>{stats.attempts} attempts</span></>}
        </p>
        {badges.length > 0 && (
          <div className="flex flex-wrap gap-1" data-testid={`shark-${agent}-badges`}>
            {badges.map((b) => (
              <Tooltip key={b}>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className={cn("cursor-default", badgeTone(b))}>{b}</Badge>
                </TooltipTrigger>
                <TooltipContent>{BADGE_HELP[b.replace(/ ×\d+$/, "")] ?? b}</TooltipContent>
              </Tooltip>
            ))}
          </div>
        )}
        {output ? (
          <ul className="list-disc space-y-1 pl-4 text-xs leading-relaxed">
            {output.key_points.map((k, i) => <li key={i}>{k}</li>)}
            {output.red_flags?.map((f, i) => (
              <li key={`rf-${i}`} className={cn(f.severity === "high" ? "text-destructive" : "text-muted-foreground")}>
                <span className="font-mono">{f.code}</span> ({f.severity}) — {f.detail}
              </li>
            ))}
          </ul>
        ) : question ? (
          <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">Question:</span> {question}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
