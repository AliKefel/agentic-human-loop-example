"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Bot, CheckCircle2, Cog, Gavel, MessageSquare, Radio, Send, ShieldAlert, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { actionTone } from "@/components/audit/audit-table";
import { useNow } from "@/components/sla-countdown";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { cn } from "cn";
import { ACTIVITY_FEED_SIZE } from "@/lib/stats";
import type { AuditRow, User } from "@/lib/types";


function iconFor(action: string): LucideIcon {
  if (action.startsWith("approval.denied") || action.startsWith("tool.denied")) return ShieldAlert;
  if (action.startsWith("approval.")) return Gavel;
  if (action.startsWith("offer.")) return Send;
  if (action.startsWith("incident.")) return AlertTriangle;
  if (action.startsWith("founder.")) return MessageSquare;
  if (action.startsWith("run.step")) return Cog;
  if (action.startsWith("run.")) return Bot;
  return CheckCircle2;
}

function relative(iso: string, now: number): string {
  const s = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/** The run an audit event belongs to, if any (run entity, or details.run_id). */
function runIdOf(r: AuditRow): string | null {
  if (r.entity === "run" && r.entity_id) return r.entity_id;
  const d = r.details?.run_id;
  return typeof d === "string" ? d : null;
}

function detailOf(r: AuditRow): string | null {
  const d = r.details ?? {};
  if (r.action === "run.step" && typeof d.from === "string" && typeof d.to === "string") return `${d.from} → ${d.to}`.replace(/_/g, " ");
  if (typeof d.reason === "string" && d.reason) return `“${d.reason}”`;
  if (typeof d.pitch === "string") return `${d.pitch}${typeof d.autonomy_level === "number" ? ` · L${d.autonomy_level}` : ""}`;
  if (typeof d.rule === "string") return d.rule;
  return null;
}

/** Activity feed (SPEC §5.1): last 15 audit events, live via a Realtime INSERT subscription on audit_log. */
export function ActivityFeed({ initial, users }: { initial: AuditRow[]; users: User[] }) {
  const [rows, setRows] = useState(() => initial.slice(0, ACTIVITY_FEED_SIZE));
  const [live, setLive] = useState(false);
  const now = useNow(15_000);

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) return; // no browser client configured
    let supabase: ReturnType<typeof createBrowserSupabase>;
    try {
      supabase = createBrowserSupabase();
    } catch {
      return;
    }
    const channel = supabase
      .channel("dashboard:audit")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "audit_log" }, (payload) => {
        const row = payload.new as AuditRow;
        setRows((cur) => (cur.some((r) => r.id === row.id) ? cur : [row, ...cur].slice(0, ACTIVITY_FEED_SIZE)));
      })
      .subscribe((status) => setLive(status === "SUBSCRIBED"));
    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  const byId = new Map(users.map((u) => [u.id, u]));
  return (
    <Card className="min-w-0" data-testid="activity-feed">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <CardTitle>Activity</CardTitle>
            <CardDescription>Last {ACTIVITY_FEED_SIZE} audit events</CardDescription>
          </div>
          <span className={cn("flex items-center gap-1.5 text-xs", live ? "text-success" : "text-muted-foreground")} data-testid="feed-live">
            <Radio className={cn("size-3.5", live && "animate-pulse")} aria-hidden /> {live ? "Live" : "Offline"}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        {!rows.length ? (
          <p className="py-10 text-center text-sm text-muted-foreground">No activity yet.</p>
        ) : (
          <ol className="relative space-y-3">
            {rows.map((r) => {
              const Icon = iconFor(r.action);
              const who = r.actor_id ? (byId.get(r.actor_id)?.name ?? "Unknown user") : "System";
              const runId = runIdOf(r);
              const detail = detailOf(r);
              return (
                <li key={r.id} className="flex gap-3 text-sm" data-testid="feed-item">
                  <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border bg-muted/50">
                    <Icon className="size-3.5 text-muted-foreground" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <Badge variant="outline" className={cn("font-mono text-[11px]", actionTone(r.action))}>{r.action}</Badge>
                      <span suppressHydrationWarning className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">{relative(r.created_at, now)}</span>
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      <span className="text-foreground">{who}</span>
                      {detail ? <> · {detail}</> : null}
                      {runId ? <> · <Link href={`/runs/${runId}`} className="text-primary underline-offset-4 hover:underline">run</Link></> : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
