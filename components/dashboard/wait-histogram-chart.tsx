"use client";

import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import type { FundStats } from "@/lib/stats";

const config = { count: { label: "Decisions", color: "var(--chart-1)" } } satisfies ChartConfig;

/** 4. Human wait time — histogram of decided_at − created_at over human decisions. */
export function WaitHistogramChart({ data }: { data: FundStats["waitHistogram"] }) {
  return (
    <ChartContainer config={config} className="h-64 w-full" data-testid="chart-wait-histogram">
      <BarChart data={data} margin={{ top: 20, right: 4, left: 0, bottom: 0 }} barCategoryGap={4}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="bucket" tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis tickLine={false} axisLine={false} width={28} allowDecimals={false} />
        <ChartTooltip cursor={{ fillOpacity: 0.3 }} content={<ChartTooltipContent labelFormatter={(b) => `Waited ${b}`} />} />
        <Bar dataKey="count" fill="var(--color-count)" radius={[4, 4, 0, 0]} isAnimationActive={false}>
          <LabelList dataKey="count" position="top" className="fill-muted-foreground" fontSize={11} />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
