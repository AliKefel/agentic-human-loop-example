import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "cn";
import type { HarnessConfig, Run } from "@/lib/types";

function Meter({ label, used, cap, fmt, testId }: { label: string; used: number; cap: number; fmt: (n: number) => string; testId: string }) {
  const ratio = cap > 0 ? used / cap : 0;
  const tone = ratio >= 1 ? "destructive" : ratio >= 0.8 ? "warning" : "primary";
  return (
    <div className="space-y-1.5" data-testid={testId} data-tone={tone}>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums">
          <span className="font-medium">{fmt(used)}</span>
          <span className="text-muted-foreground"> / {fmt(cap)} · {Math.round(ratio * 100)}%</span>
        </span>
      </div>
      <Progress
        value={Math.min(100, ratio * 100)}
        aria-label={`${label}: ${Math.round(ratio * 100)}% of cap`}
        className={cn("h-2", tone === "warning" && "[&>[data-slot=progress-indicator]]:bg-warning", tone === "destructive" && "[&>[data-slot=progress-indicator]]:bg-destructive")}
      />
    </div>
  );
}

/** Budget meter (SPEC §5.3): tokens and $ vs the run's config caps; warning ≥80%, destructive ≥100%. */
export function BudgetMeter({ run, config }: { run: Run; config: HarnessConfig }) {
  const b = config.budgets;
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Budget</CardTitle>
        <CardDescription>Caps from harness config v{config.version}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Meter label="Tokens" used={run.tokens_used} cap={b.max_tokens} fmt={(n) => n.toLocaleString("en-US")} testId="budget-tokens" />
        <Meter label="Spend" used={run.cost_usd} cap={b.max_usd} fmt={(n) => `$${n.toFixed(n < 1 ? 3 : 2)}`} testId="budget-usd" />
        <Meter label="Steps" used={run.step_count} cap={b.max_steps} fmt={(n) => String(n)} testId="budget-steps" />
        <p className="text-xs text-muted-foreground tabular-nums">Replans {run.replans} / {b.max_replans}</p>
      </CardContent>
    </Card>
  );
}
