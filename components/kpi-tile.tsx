import { ArrowDownRight, ArrowRight, ArrowUpRight, type LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const TREND = {
  up: { Icon: ArrowUpRight, cls: "text-success" },
  down: { Icon: ArrowDownRight, cls: "text-destructive" },
  flat: { Icon: ArrowRight, cls: "text-muted-foreground" },
} as const;

export function KpiTile({ label, value, sub, trend, icon: Icon }: { label: string; value: string; sub?: string; trend?: "up" | "down" | "flat"; icon?: LucideIcon }) {
  const T = trend ? TREND[trend] : null;
  return (
    <Card size="sm">
      <CardContent className="space-y-1">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{label}</span>
          {Icon ? <Icon className="size-4" /> : null}
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold tabular-nums">{value}</span>
          {T ? <T.Icon className={`size-4 ${T.cls}`} /> : null}
        </div>
        {sub ? <div className="text-xs text-muted-foreground">{sub}</div> : null}
      </CardContent>
    </Card>
  );
}
