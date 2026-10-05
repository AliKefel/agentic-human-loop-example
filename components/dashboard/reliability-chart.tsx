"use client";

import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import type { FundStats } from "@/lib/stats";

const config = { count: { label: "Events", color: "var(--warning)" } } satisfies ChartConfig;

/** 6. Reliability events — retries, fallbacks, timeouts, schema fails, budget skips, denied tools. */
export function ReliabilityChart({ data }: { data: FundStats["reliability"] }) {
  return (
    <ChartContainer config={config} className="h-64 w-full" data-testid="chart-reliability">
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 28, left: 0, bottom: 0 }} barCategoryGap={6}>
        <CartesianGrid horizontal={false} />
        <XAxis type="number" tickLine={false} axisLine={false} allowDecimals={false} />
        <YAxis type="category" dataKey="event" tickLine={false} axisLine={false} width={92} />
        <ChartTooltip cursor={{ fillOpacity: 0.3 }} content={<ChartTooltipContent />} />
        <Bar dataKey="count" fill="var(--color-count)" radius={[0, 4, 4, 0]} maxBarSize={22} isAnimationActive={false}>
          <LabelList dataKey="count" position="right" className="fill-muted-foreground" fontSize={11} />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
