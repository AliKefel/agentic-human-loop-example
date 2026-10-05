"use client";

import { Bar, BarChart, CartesianGrid, Cell, LabelList, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { money } from "@/lib/format";
import type { ValuationPoint } from "@/lib/run-view";

const config = {
  valuation: { label: "Implied valuation" },
  founder: { label: "Founder ask", color: "var(--chart-2)" },
  shark: { label: "Shark proposal", color: "var(--chart-1)" },
} satisfies ChartConfig;

/** Founder's implied valuation (ask ÷ equity) vs each Shark's proposed-terms valuation (SPEC §5.3). */
export function ValuationChart({ data }: { data: ValuationPoint[] }) {
  const sharks = data.filter((d) => d.kind === "shark");
  return (
    <div className="space-y-2" data-testid="valuation-chart">
      <ChartContainer config={config} className="h-56 w-full">
        <BarChart data={data} margin={{ top: 20, right: 8, left: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="who" tickLine={false} axisLine={false} tickMargin={8} />
          <YAxis tickLine={false} axisLine={false} width={56} tickFormatter={(v: number) => money(v)} />
          <ChartTooltip cursor={{ fillOpacity: 0.3 }} content={<ChartTooltipContent hideIndicator formatter={(v) => <span className="font-mono tabular-nums">{money(Number(v))} post-money</span>} />} />
          <Bar dataKey="valuation" radius={[4, 4, 0, 0]} maxBarSize={56} isAnimationActive={false}>
            {data.map((d) => <Cell key={d.who} fill={d.kind === "founder" ? "var(--color-founder)" : "var(--color-shark)"} />)}
            <LabelList dataKey="valuation" position="top" className="fill-foreground" fontSize={11} formatter={(v: unknown) => money(Number(v))} />
          </Bar>
        </BarChart>
      </ChartContainer>
      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-chart-2" aria-hidden />Founder ask</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-chart-1" aria-hidden />Shark proposal</span>
        {!sharks.length && <span>No Shark has proposed terms yet.</span>}
      </div>
    </div>
  );
}

