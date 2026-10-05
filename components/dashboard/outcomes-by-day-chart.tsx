"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import type { FundStats } from "@/lib/stats";

const config = {
  offer_sent: { label: "Offer sent", color: "var(--success)" },
  passed: { label: "Passed", color: "var(--chart-2)" },
  escalated: { label: "Escalated", color: "var(--destructive)" },
  in_review: { label: "Open / in review", color: "var(--warning)" },
  cancelled: { label: "Cancelled / failed", color: "var(--muted-foreground)" },
} satisfies ChartConfig;
const KEYS = Object.keys(config) as (keyof typeof config)[];

const fmtDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** 1. Outcomes over time — stacked bar per UTC day of run start, by current outcome. */
export function OutcomesByDayChart({ data }: { data: FundStats["outcomesByDay"] }) {
  return (
    <ChartContainer config={config} className="h-64 w-full" data-testid="chart-outcomes-by-day">
      <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={8} minTickGap={16} tickFormatter={fmtDay} />
        <YAxis tickLine={false} axisLine={false} width={28} allowDecimals={false} />
        <ChartTooltip cursor={{ fillOpacity: 0.3 }} content={<ChartTooltipContent labelFormatter={(d) => fmtDay(String(d))} />} />
        <ChartLegend content={<ChartLegendContent className="flex-wrap gap-x-4 gap-y-1" />} />
        {KEYS.map((k, i) => (
          <Bar key={k} dataKey={k} stackId="o" fill={`var(--color-${k})`} stroke="var(--card)" strokeWidth={1} radius={i === KEYS.length - 1 ? [4, 4, 0, 0] : 0} maxBarSize={36} isAnimationActive={false} />
        ))}
      </BarChart>
    </ChartContainer>
  );
}
