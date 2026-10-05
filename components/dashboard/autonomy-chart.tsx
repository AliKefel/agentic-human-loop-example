"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import type { FundStats } from "@/lib/stats";

const config = {
  auto: { label: "Auto (no human)", color: "var(--chart-1)" },
  human: { label: "Human approval / exception", color: "var(--chart-2)" },
  escalated: { label: "Escalated", color: "var(--destructive)" },
} satisfies ChartConfig;
const NAME: Record<string, string> = { L0: "L0 · Human decides", L1: "L1 · Approval", L2: "L2 · Assisted", L3: "L3 · Full auto" };

/** 3. Outcomes by autonomy level — grouped bars L0–L3 × auto / human / escalated. */
export function AutonomyChart({ data }: { data: FundStats["outcomesByAutonomy"] }) {
  return (
    <ChartContainer config={config} className="h-64 w-full" data-testid="chart-autonomy">
      <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barGap={2}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="level" tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis tickLine={false} axisLine={false} width={28} allowDecimals={false} />
        <ChartTooltip cursor={{ fillOpacity: 0.3 }} content={<ChartTooltipContent labelFormatter={(l) => NAME[String(l)] ?? String(l)} />} />
        <ChartLegend content={<ChartLegendContent className="flex-wrap gap-x-4 gap-y-1" />} />
        {(Object.keys(config) as (keyof typeof config)[]).map((k) => (
          <Bar key={k} dataKey={k} fill={`var(--color-${k})`} radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} />
        ))}
      </BarChart>
    </ChartContainer>
  );
}
