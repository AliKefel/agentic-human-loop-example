"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { WORKING, type RunStatus } from "@/lib/types";

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => { clearTimeout(t); resolve(); }, { once: true });
  });

/**
 * Drives a run forward one step per POST while it is in a WORKING status (SPEC §2.2).
 * Stops on waiting/terminal/idle; retries 409 conflicts after 300 ms; aborts on unmount.
 */
export function AutoAdvance({ runId, status }: { runId: string; status: RunStatus }) {
  const router = useRouter();
  const running = useRef<AbortController | null>(null);
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
          return; // aborted or network failure
        }
        if (res.status === 409) {
          await sleep(300, ac.signal);
          continue;
        }
        if (!res.ok) return;
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
  }, [runId, working, router]);

  return null;
}
