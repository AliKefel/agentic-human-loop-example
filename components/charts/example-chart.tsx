"use client";

// Pattern to copy for every chart in M8/M9/M10
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

const data = [
  { agent: "Market", ms: 900 },
  { agent: "Finance", ms: 1400 },
  { agent: "Product", ms: 1100 },
  { agent: "Skeptic", ms: 1700 },
  { agent: "Lead", ms: 800 },
];
const config = { ms: { label: "Latency (ms)", color: "var(--chart-1)" } } satisfies ChartConfig;

export function ExampleChart() {
  return (
    <ChartContainer config={config} className="h-56 w-full">
      <BarChart data={data}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="agent" tickLine={false} axisLine={false} />
        <YAxis tickLine={false} axisLine={false} width={40} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="ms" fill="var(--color-ms)" radius={4} />
      </BarChart>
    </ChartContainer>
  );
}
