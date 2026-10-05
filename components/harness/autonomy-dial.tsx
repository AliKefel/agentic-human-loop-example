"use client";

import { Slider } from "@/components/ui/slider";
import { AUTONOMY_LEVELS } from "@/components/harness/autonomy-levels";
import { cn } from "cn";



/** Autonomy Slider L0–L3 with labelled stops and a description card (SPEC §2.8 / §5.6). */
export function AutonomyDial({ value, onChange, disabled }: { value: number; onChange: (v: 0 | 1 | 2 | 3) => void; disabled?: boolean }) {
  const cur = AUTONOMY_LEVELS[value] ?? AUTONOMY_LEVELS[2];
  return (
    <div className="space-y-4" data-testid="autonomy-dial">
      <div className="px-2">
        <Slider min={0} max={3} step={1} value={[value]} onValueChange={([v]) => onChange(v as 0 | 1 | 2 | 3)} disabled={disabled} aria-label="Autonomy level" />
        <div className="mt-3 grid grid-cols-4 text-center text-xs">
          {AUTONOMY_LEVELS.map((l) => (
            <button
              key={l.level}
              type="button"
              disabled={disabled}
              onClick={() => onChange(l.level)}
              className={cn("rounded-md px-1 py-1 transition-colors disabled:cursor-default", l.level === value ? "font-semibold text-primary" : "text-muted-foreground hover:text-foreground disabled:hover:text-muted-foreground")}
            >
              <div>{l.short}</div>
              <div className="hidden sm:block">{l.name}</div>
            </button>
          ))}
        </div>
      </div>
      <div className="flex gap-3 rounded-lg border bg-muted/40 p-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary"><cur.Icon className="size-4" aria-hidden /></span>
        <div className="space-y-1 text-sm">
          <div className="font-medium">{cur.short} · {cur.name}</div>
          <p className="text-muted-foreground">{cur.does}</p>
          <p className="text-xs text-muted-foreground">{cur.gate}. High-severity red flags always escalate to a General Partner.</p>
        </div>
      </div>
    </div>
  );
}
