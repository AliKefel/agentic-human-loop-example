"use client";

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import type { FundStats } from "@/lib/stats";

const config = {
  lead: { label: "Lead", color: "var(--chart-2)" },
  market: { label: "Market", color: "var(--chart-1)" },
  finance: { label: "Finance", color: "var(--chart-3)" },
  product: { label: "Product", color: "var(--chart-4)" },
  skeptic: { label: "Skeptic", color: "var(--chart-5)" },
} satisfies ChartConfig;
const KEYS = Object.keys(config) as (keyof typeof config)[];
const k = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : String(n));

/** 7. Token burn — input + output tokens per run (last 30), stacked by agent. */
export function TokenBurnChart({ data }: { data: FundStats["tokensByRun"] }) {
  const rows = data.map((d, i) => ({ ...d, n: i + 1 }));
  return (
    <ChartContainer config={config} className="h-64 w-full" data-testid="chart-token-burn">
      <AreaChart data={rows} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="n" tickLine={false} axisLine={false} tickMargin={8} minTickGap={12} tickFormatter={(n: number) => `#${n}`} />
        <YAxis tickLine={false} axisLine={false} width={36} tickFormatter={k} />
        <ChartTooltip content={<ChartTooltipContent indicator="line" labelFormatter={(_, p) => String(p?.[0]?.payload?.label ?? "")} />} />
        <ChartLegend content={<ChartLegendContent className="flex-wrap gap-x-4 gap-y-1" />} />
        {KEYS.map((key) => (
          <Area key={key} dataKey={key} type="monotone" stackId="t" stroke={`var(--color-${key})`} strokeWidth={1.5} fill={`var(--color-${key})`} fillOpacity={0.35} isAnimationActive={false} />
        ))}
      </AreaChart>
    </ChartContainer>
  );
}
