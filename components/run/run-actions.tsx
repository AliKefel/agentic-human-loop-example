"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { TERMINAL, type RunStatus } from "@/lib/types";

/** Cancel (any non-terminal run, any role) and Resume (failed runs, GP only) — SPEC §5.3 Actions. */
export function RunActions({ runId, status, canResume }: { runId: string; status: RunStatus; canResume: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const showCancel = !TERMINAL.includes(status);
  const showResume = canResume && status === "failed";
  if (!showCancel && !showResume) return null;

  const post = (action: "cancel" | "resume") =>
    start(async () => {
      try {
        const res = await fetch(`/api/runs/${runId}/${action}`, { method: "POST" });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          toast.error(`Could not ${action} run`, { description: body?.error ?? `HTTP ${res.status}` });
          return;
        }
        toast.success(action === "cancel" ? "Run cancelled" : "Run resumed from checkpoint");
        router.refresh();
      } catch {
        toast.error(`Could not ${action} run`, { description: "Network error" });
      }
    });

  return (
    <div className="flex gap-2">
      {showCancel && (
        <Button size="sm" variant="destructive" disabled={pending} onClick={() => post("cancel")} data-testid="cancel-run">
          Cancel run
        </Button>
      )}
      {showResume && (
        <Button size="sm" variant="outline" disabled={pending} onClick={() => post("resume")} data-testid="resume-run">
          Resume from checkpoint
        </Button>
      )}
    </div>
  );
}
