"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/browser";

const DEBOUNCE_MS = 250;
/** Child tables filtered by run_id. tool_calls / founder_messages are not in the publication: any change to them also bumps runs/agent_calls/checkpoints. */
const RUN_TABLES = ["checkpoints", "agent_calls", "approvals", "incidents"] as const;

/** Live updates (SPEC §5.3): Supabase Realtime postgres_changes → debounced router.refresh(). Renders nothing. */
export function RealtimeRefresh({ runId }: { runId: string }) {
  const router = useRouter();
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) return; // no browser client configured
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), DEBOUNCE_MS);
    };
    let supabase: ReturnType<typeof createBrowserSupabase>;
    try {
      supabase = createBrowserSupabase();
    } catch {
      return;
    }
    let channel = supabase.channel(`run:${runId}`).on("postgres_changes", { event: "*", schema: "public", table: "runs", filter: `id=eq.${runId}` }, refresh);
    for (const table of RUN_TABLES) {
      channel = channel.on("postgres_changes", { event: "*", schema: "public", table, filter: `run_id=eq.${runId}` }, refresh);
    }
    channel.subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [runId, router]);
  return null;
}
