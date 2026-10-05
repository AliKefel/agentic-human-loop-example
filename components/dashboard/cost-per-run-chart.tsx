"use client";

import { CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import type { FundStats } from "@/lib/stats";

const config = { cost: { label: "Cost", color: "var(--chart-1)" } } satisfies ChartConfig;
const usd2 = (n: number) => `$${n.toFixed(2)}`;

/** 2. Cost per run — last 30 runs (oldest → newest) against the per-run budget cap. */
export function CostPerRunChart({ data, budgetCap }: { data: FundStats["costPerRun"]; budgetCap: number }) {
  const rows = data.map((d, i) => ({ ...d, n: i + 1 }));
  const max = Math.max(budgetCap, ...data.map((d) => d.cost));
  return (
    <ChartContainer config={config} className="h-64 w-full" data-testid="chart-cost-per-run">
      <LineChart data={rows} margin={{ top: 16, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="n" tickLine={false} axisLine={false} tickMargin={8} minTickGap={12} tickFormatter={(n: number) => `#${n}`} />
        <YAxis tickLine={false} axisLine={false} width={44} domain={[0, Math.ceil(max * 110) / 100]} tickFormatter={usd2} />
        <ReferenceLine y={budgetCap} stroke="var(--destructive)" strokeDasharray="4 4" label={{ value: `Budget cap ${usd2(budgetCap)}`, position: "insideTopRight", fill: "var(--muted-foreground)", fontSize: 11 }} />
        <ChartTooltip
          content={<ChartTooltipContent labelFormatter={(_, p) => String(p?.[0]?.payload?.label ?? "")} formatter={(v) => <span className="font-mono tabular-nums">${Number(v).toFixed(4)}</span>} />}
        />
        <Line dataKey="cost" type="monotone" stroke="var(--color-cost)" strokeWidth={2} dot={{ r: 2.5 }} activeDot={{ r: 4 }} isAnimationActive={false} />
      </LineChart>
    </ChartContainer>
  );
}
