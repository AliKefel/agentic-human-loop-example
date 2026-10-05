"use client";

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { FlaskConical } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { simulate, type SimRun, type SimSummary } from "@/lib/simulate";
import { money } from "@/lib/format";
import type { HarnessConfig } from "@/lib/types";
import { cn } from "cn";

export const WHAT_IF_SIZES = [25, 50, 100] as const;

const chartConfig = {
  current: { label: "Current", color: "var(--chart-2)" },
  draft: { label: "Draft", color: "var(--chart-1)" },
} satisfies ChartConfig;

type Row = { key: keyof SimSummary; label: string; fmt?: (n: number) => string; humanLoad?: boolean; chart?: string };
const ROWS: Row[] = [
  { key: "auto_send", label: "Auto-sent offers", chart: "Auto-sent" },
  { key: "auto_pass", label: "Auto-passed", chart: "Auto-pass" },
  { key: "needs_approval", label: "Needs approval", humanLoad: true, chart: "Approval" },
  { key: "exception", label: "Exceptions", humanLoad: true, chart: "Exception" },
  { key: "escalate", label: "Escalated to GP", humanLoad: true, chart: "Escalated" },
  { key: "need_info", label: "Founder questions", humanLoad: true, chart: "Need info" },
  { key: "humanHours", label: "Est. human-hours", fmt: (n) => `${n.toFixed(2)} h`, humanLoad: true },
  { key: "capitalAuto", label: "Capital auto-committed", fmt: money },
];

function Delta({ a, b, fmt, humanLoad }: { a: number; b: number; fmt: (n: number) => string; humanLoad?: boolean }) {
  const d = Math.round((b - a) * 100) / 100;
  if (d === 0) return <span className="text-muted-foreground">—</span>;
  // More human load is a cost; fewer is a saving. Other rows are neutral (primary).
  const tone = humanLoad ? (d > 0 ? "text-destructive" : "text-success") : "text-primary";
  return <span className={cn("font-medium tabular-nums", tone)}>{d > 0 ? "+" : "−"}{fmt(Math.abs(d))}</span>;
}

/** Re-runs the pure policy engine over the last N settled runs: current config vs draft (SPEC §5.6). */
export function WhatIf({ runs, current, draft }: { runs: SimRun[]; current: HarnessConfig; draft: HarnessConfig }) {
  const [n, setN] = useState<number>(50);
  const slice = useMemo(() => runs.slice(0, n), [runs, n]);
  const cur = useMemo(() => simulate(slice, current, current.autonomy_level), [slice, current]);
  const dra = useMemo(() => simulate(slice, draft, draft.autonomy_level), [slice, draft]);
  const data = ROWS.filter((r) => r.chart).map((r) => ({ outcome: r.chart!, current: cur[r.key], draft: dra[r.key] }));

  return (
    <Card data-testid="what-if">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2"><FlaskConical className="size-4 text-primary" aria-hidden />What-if simulator</CardTitle>
            <CardDescription>
              The deterministic policy engine re-decides stored Shark outputs at each config’s autonomy level (L{current.autonomy_level} current vs L{draft.autonomy_level} draft). No LLM calls.
            </CardDescription>
          </div>
          <Select value={String(n)} onValueChange={(v) => setN(Number(v))}>
            <SelectTrigger size="sm" className="w-[130px] shrink-0" aria-label="Runs to simulate" data-testid="what-if-n"><SelectValue /></SelectTrigger>
            <SelectContent>
              {WHAT_IF_SIZES.map((s) => <SelectItem key={s} value={String(s)}>Last {s} runs</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {cur.runs === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No settled runs with a synthesis yet — run a few pitches to simulate.</p>
        ) : (
          <>
            <div className="overflow-x-auto rounded-lg border">
              <Table data-testid="what-if-table">
                <TableHeader>
                  <TableRow>
                    <TableHead>Outcome</TableHead>
                    <TableHead className="text-right">Current</TableHead>
                    <TableHead className="text-right">Draft</TableHead>
                    <TableHead className="text-right">Δ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ROWS.map((r) => {
                    const fmt = r.fmt ?? ((x: number) => String(x));
                    return (
                      <TableRow key={r.key} className={cn(r.key === "humanHours" && "border-t-2 font-medium")} data-testid={`what-if-${r.key}`}>
                        <TableCell>{r.label}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(cur[r.key])}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(dra[r.key])}</TableCell>
                        <TableCell className="text-right"><Delta a={cur[r.key]} b={dra[r.key]} fmt={fmt} humanLoad={r.humanLoad} /></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <ChartContainer config={chartConfig} className="h-52 w-full" data-testid="what-if-chart">
              <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barGap={2}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="outcome" tickLine={false} axisLine={false} tickMargin={8} interval={0} fontSize={11} />
                <YAxis tickLine={false} axisLine={false} width={28} allowDecimals={false} />
                <ChartTooltip cursor={{ fillOpacity: 0.3 }} content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Bar dataKey="current" fill="var(--color-current)" radius={[4, 4, 0, 0]} maxBarSize={20} isAnimationActive={false} />
                <Bar dataKey="draft" fill="var(--color-draft)" radius={[4, 4, 0, 0]} maxBarSize={20} isAnimationActive={false} />
              </BarChart>
            </ChartContainer>
            <p className="text-xs text-muted-foreground">
              {cur.runs} of {slice.length} runs simulated{cur.skipped ? ` · ${cur.skipped} skipped (no synthesis, e.g. triage fast-pass)` : ""}. Human-hours: approval 15 min, exception 30 min, escalation 60 min, founder question 15 min.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
