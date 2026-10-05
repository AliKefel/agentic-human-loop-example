import { Check, X } from "lucide-react";
import { cn } from "cn";
import type { Step } from "@/lib/run-view";

/** Intake → Triage → Plan → Analyze → Synthesize → Policy → Human → Outcome (current highlighted, skipped dimmed). */
export function StatusStepper({ steps }: { steps: Step[] }) {
  return (
    <div className="relative overflow-x-auto">
      <ol className="flex min-w-max items-center gap-1" aria-label="Run progress" data-testid="status-stepper">
        {steps.map((s, i) => (
          <li key={s.key} className="flex items-center gap-1" aria-current={s.state === "current" ? "step" : undefined} data-state={s.state}>
            {i > 0 && <span aria-hidden className={cn("h-px w-4 sm:w-6", s.state === "upcoming" || s.state === "skipped" ? "bg-border" : "bg-primary/50")} />}
            <span
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium whitespace-nowrap",
                s.state === "done" && "border-success/30 bg-success/10 text-foreground",
                s.state === "current" && "border-primary bg-primary text-primary-foreground shadow-sm",
                s.state === "upcoming" && "border-border text-muted-foreground",
                s.state === "skipped" && "border-dashed border-border text-muted-foreground/60 line-through decoration-muted-foreground/40",
                s.state === "failed" && "border-destructive/40 bg-destructive/10 text-destructive",
              )}
            >
              {s.state === "done" && <Check className="size-3 text-success" aria-hidden />}
              {s.state === "failed" && <X className="size-3" aria-hidden />}
              {s.state === "current" && <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-primary-foreground" />}
              <span className="capitalize">{s.label}</span>
              <span className="sr-only">({s.state})</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
