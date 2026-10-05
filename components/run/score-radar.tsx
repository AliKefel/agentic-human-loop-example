"use client";

import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

export type RadarPoint = { agent: string; score: number; scored: boolean };
const config = { score: { label: "Score", color: "var(--chart-1)" } } satisfies ChartConfig;

/** Radar of Shark scores, 4 axes, domain 0–10 (SPEC §5.3). Unscored Sharks sit at 0 and are marked "n/a". */
export function ScoreRadar({ data }: { data: RadarPoint[] }) {
  if (!data.some((d) => d.scored)) {
    return <Placeholder text="Scores appear once the Sharks report back." />;
  }
  const rows = data.map((d) => ({ ...d, label: d.scored ? d.agent : `${d.agent} (n/a)` }));
  return (
    <ChartContainer config={config} className="mx-auto aspect-square h-64 w-full max-w-sm" data-testid="score-radar">
      <RadarChart data={rows} outerRadius="72%">
        <PolarGrid className="stroke-border" />
        <PolarAngleAxis dataKey="label" tick={{ fontSize: 12 }} />
        <PolarRadiusAxis domain={[0, 10]} tickCount={6} tick={false} axisLine={false} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Radar dataKey="score" fill="var(--color-score)" fillOpacity={0.25} stroke="var(--color-score)" strokeWidth={2} dot={{ r: 4, fillOpacity: 1 }} isAnimationActive={false} />
      </RadarChart>
    </ChartContainer>
  );
}

export function Placeholder({ text }: { text: string }) {
  return <div className="flex h-64 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">{text}</div>;
}
