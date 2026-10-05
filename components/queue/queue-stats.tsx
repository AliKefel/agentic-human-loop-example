import { Card, CardContent } from "@/components/ui/card";
import type { QueueStats as Stats } from "@/lib/harness/queue-stats";
import { duration } from "@/lib/format";

const pct = (r: number | null) => (r === null ? "—" : `${Math.round(r * 100)}%`);

/** Queue stats strip (SPEC §5.4): pending, overdue, median decision time, approval rate, override rate. */
export function QueueStats({ stats }: { stats: Stats }) {
  const tiles: { label: string; value: string; tone?: string }[] = [
    { label: "Pending", value: String(stats.pending) },
    { label: "Overdue", value: String(stats.overdue), tone: stats.overdue ? "text-destructive" : undefined },
    { label: "Median decision time", value: stats.medianDecisionMs === null ? "—" : duration(stats.medianDecisionMs) },
    { label: "Approval rate", value: pct(stats.approvalRate) },
    { label: "Override rate", value: pct(stats.overrideRate) },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5" data-testid="queue-stats">
      {tiles.map((t) => (
        <Card key={t.label} size="sm">
          <CardContent>
            <div className="text-xs text-muted-foreground">{t.label}</div>
            <div className={`text-2xl font-semibold tabular-nums ${t.tone ?? ""}`}>{t.value}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
