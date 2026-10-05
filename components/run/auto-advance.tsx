"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { WORKING, type RunStatus } from "@/lib/types";

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => { clearTimeout(t); resolve(); }, { once: true });
  });

/**
 * Drives a run forward one step per POST while it is in a WORKING status (SPEC §2.2).
 * Stops on waiting/terminal/idle; retries 409 conflicts after 300 ms; aborts on unmount.
 * On a network error or non-409 failure it stops and shows an inline error with Retry.
 */
export function AutoAdvance({ runId, status }: { runId: string; status: RunStatus }) {
  const router = useRouter();
  const running = useRef<AbortController | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0); // bumping restarts the loop
  const working = WORKING.includes(status);

  useEffect(() => {
    if (!working || running.current) return; // guard against double loops (StrictMode / re-renders)
    const ac = new AbortController();
    running.current = ac;

    (async () => {
      while (!ac.signal.aborted) {
        let res: Response;
        try {
          res = await fetch(`/api/runs/${runId}/advance`, { method: "POST", signal: ac.signal });
        } catch {
          if (!ac.signal.aborted) setError("Network error while advancing the run.");
          return;
        }
        if (res.status === 409) {
          await sleep(300, ac.signal);
          continue;
        }
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          if (!ac.signal.aborted) setError(`Advance failed (${res.status}${body?.error ? `: ${body.error}` : ""}).`);
          return;
        }
        const body = (await res.json()) as { status: "advanced" | "idle"; run: { status: RunStatus } };
        router.refresh();
        if (body.status === "idle" || !WORKING.includes(body.run.status)) return;
      }
    })().finally(() => {
      if (running.current === ac) running.current = null;
    });

    return () => {
      ac.abort();
      if (running.current === ac) running.current = null;
    };
  }, [runId, working, router, attempt]);

  if (!error) return null;
  return (
    <div role="alert" className="flex items-center gap-3 rounded-md border border-destructive/40 px-3 py-2 text-destructive">
      <span>{error}</span>
      <Button size="sm" variant="outline" onClick={() => { setError(null); setAttempt((n) => n + 1); }}>
        Retry
      </Button>
    </div>
  );
}
