"use client";

import { Cell, Label, Pie, PieChart } from "recharts";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import type { FundStats } from "@/lib/stats";

const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];
const TOP = COLORS.length;

/** 8. Sector mix — donut of runs per sector; the top 5 sectors keep a hue, the rest fold into "Other". */
export function SectorMixChart({ data }: { data: FundStats["sectorMix"] }) {
  const top = data.slice(0, TOP);
  const rest = data.slice(TOP).reduce((n, s) => n + s.count, 0);
  const slices = [...top.map((s, i) => ({ key: `s${i}`, label: s.sector, count: s.count, color: COLORS[i] })), ...(rest ? [{ key: "other", label: `Other (${data.length - TOP})`, count: rest, color: "var(--muted-foreground)" }] : [])];
  const config = Object.fromEntries(slices.map((s) => [s.key, { label: s.label, color: s.color }])) satisfies ChartConfig;
  const total = data.reduce((n, s) => n + s.count, 0);
  return (
    <ChartContainer config={config} className="h-64 w-full" data-testid="chart-sector-mix">
      <PieChart>
        <ChartTooltip content={<ChartTooltipContent nameKey="key" hideLabel />} />
        <Pie data={slices} dataKey="count" nameKey="key" innerRadius="56%" outerRadius="80%" paddingAngle={1.5} stroke="var(--card)" strokeWidth={2} isAnimationActive={false} cy="45%">
          {slices.map((s) => <Cell key={s.key} fill={`var(--color-${s.key})`} />)}
          <Label
            content={({ viewBox }) => {
              if (!viewBox || !("cx" in viewBox) || viewBox.cx === undefined || viewBox.cy === undefined) return null;
              return (
                <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                  <tspan x={viewBox.cx} y={(viewBox.cy ?? 0) - 6} className="fill-foreground text-2xl font-semibold">{total}</tspan>
                  <tspan x={viewBox.cx} y={(viewBox.cy ?? 0) + 14} className="fill-muted-foreground text-xs">runs</tspan>
                </text>
              );
            }}
          />
        </Pie>
        <ChartLegend content={<ChartLegendContent nameKey="key" className="flex-wrap gap-x-3 gap-y-1" />} />
      </PieChart>
    </ChartContainer>
  );
}
