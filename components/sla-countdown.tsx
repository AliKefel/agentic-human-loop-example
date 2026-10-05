"use client";

import { useEffect, useState } from "react";
import { cn } from "cn";

/** Current time, re-rendered every `intervalMs` (default 30 s). */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function compact(ms: number): string {
  const m = Math.max(0, Math.floor(ms / 60_000));
  if (m >= 1440) return `${Math.floor(m / 1440)}d ${Math.floor((m % 1440) / 60)}h`;
  if (m >= 60) return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
  return `${m}m`;
}

/** SLA countdown (SPEC §2.9): "3h 12m left", red "overdue 1h 05m" once past due. Ticks every 30 s. */
export function SlaCountdown({ due, className }: { due: string; className?: string }) {
  const now = useNow();
  const left = new Date(due).getTime() - now;
  const overdue = left < 0;
  return (
    <span
      suppressHydrationWarning
      data-overdue={overdue || undefined}
      title={new Date(due).toLocaleString()}
      className={cn("font-mono text-xs tabular-nums", overdue ? "font-semibold text-destructive" : "text-muted-foreground", className)}
    >
      {overdue ? `overdue ${compact(-left)}` : `${compact(left)} left`}
    </span>
  );
}
