"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import type { FundStats } from "@/lib/stats";

const config = {
  p50: { label: "p50", color: "var(--chart-1)" },
  p95: { label: "p95", color: "var(--chart-2)" },
} satisfies ChartConfig;
const sec = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(ms >= 10_000 ? 0 : 1)}s` : `${ms}ms`);

/** 5. Shark latency — p50 and p95 of successful agent calls per agent. */
export function LatencyChart({ data }: { data: FundStats["latencyByAgent"] }) {
  return (
    <ChartContainer config={config} className="h-64 w-full" data-testid="chart-latency">
      <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barGap={2}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="agent" tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis tickLine={false} axisLine={false} width={52} tickFormatter={sec} />
        <ChartTooltip cursor={{ fillOpacity: 0.3 }} content={<ChartTooltipContent formatter={(v, name) => <span className="flex w-full justify-between gap-3"><span className="text-muted-foreground">{String(name)}</span><span className="font-mono tabular-nums">{Number(v).toLocaleString("en-US")} ms</span></span>} />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="p50" fill="var(--color-p50)" radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
        <Bar dataKey="p95" fill="var(--color-p95)" radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
      </BarChart>
    </ChartContainer>
  );
}
