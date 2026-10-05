import type { ReactNode } from "react";
import { BarChart3 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "cn";

/** Dashboard chart frame: title + description, the chart, or an empty state when there is no data yet. */
export function ChartCard({ title, description, empty, emptyText, children, className, testId, aside }: {
  title: string; description: ReactNode; empty?: boolean; emptyText?: string; children: ReactNode; className?: string; testId?: string; aside?: ReactNode;
}) {
  return (
    <Card className={cn("min-w-0", className)} data-testid={testId}>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          {aside}
        </div>
      </CardHeader>
      <CardContent>
        {empty ? (
          <div className="flex h-56 flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-center text-sm text-muted-foreground">
            <BarChart3 className="size-5" aria-hidden />
            <span>{emptyText ?? "No data yet — run a pitch to populate this chart."}</span>
          </div>
        ) : children}
      </CardContent>
    </Card>
  );
}
