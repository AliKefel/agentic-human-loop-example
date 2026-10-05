"use client";

import Link from "next/link";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useNow } from "@/components/sla-countdown";
import { cn } from "cn";
import type { AuditRow, User } from "@/lib/types";

/** Action badge color by prefix (SPEC §5.7): approval green, tool.denied/budget red, incident amber. */
export function actionTone(action: string): string {
  if (action.startsWith("approval.denied")) return "border-red-500/40 bg-red-500/10 text-red-500";
  if (action.startsWith("approval.")) return "border-emerald-500/40 bg-emerald-500/10 text-emerald-500";
  if (action.startsWith("tool.denied") || action.startsWith("budget")) return "border-red-500/40 bg-red-500/10 text-red-500";
  if (action.startsWith("incident")) return "border-amber-500/40 bg-amber-500/10 text-amber-500";
  return "";
}

function relative(iso: string, now: number): string {
  const s = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const initials = (n: string) => n.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();

export function AuditTable({ rows, users }: { rows: AuditRow[]; users: User[] }) {
  const now = useNow();
  if (!rows.length) return <p className="py-10 text-center text-sm text-muted-foreground">No audit events match these filters.</p>;
  const byId = new Map(users.map((u) => [u.id, u]));
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Time</TableHead>
          <TableHead>Actor</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Action</TableHead>
          <TableHead>Entity</TableHead>
          <TableHead>Details</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => {
          const u = r.actor_id ? byId.get(r.actor_id) : undefined;
          return (
            <TableRow key={r.id} data-testid={`audit-row-${r.id}`}>
              <TableCell>
                <Tooltip>
                  <TooltipTrigger asChild><span suppressHydrationWarning className="text-muted-foreground">{relative(r.created_at, now)}</span></TooltipTrigger>
                  <TooltipContent>{r.created_at}</TooltipContent>
                </Tooltip>
              </TableCell>
              <TableCell>
                {r.actor_id ? (
                  <span className="flex items-center gap-2">
                    <Avatar size="sm"><AvatarFallback style={{ backgroundColor: u?.avatar_color, color: "#04121f" }}>{initials(u?.name ?? "?")}</AvatarFallback></Avatar>
                    {u?.name ?? r.actor_id}
                  </span>
                ) : <Badge variant="secondary">System</Badge>}
              </TableCell>
              <TableCell className="text-muted-foreground">{r.actor_role.replace(/_/g, " ")}</TableCell>
              <TableCell><Badge variant="outline" className={cn("font-mono", actionTone(r.action))}>{r.action}</Badge></TableCell>
              <TableCell>
                <span className="text-muted-foreground">{r.entity}</span>{" "}
                {r.entity === "run" && r.entity_id ? (
                  <Link href={`/runs/${r.entity_id}`} className="font-mono text-xs text-primary underline-offset-4 hover:underline">{r.entity_id.slice(0, 8)}</Link>
                ) : r.entity_id ? <span className="font-mono text-xs">{r.entity_id.slice(0, 8)}</span> : null}
              </TableCell>
              <TableCell>
                <HoverCard>
                  <HoverCardTrigger asChild><button type="button" className="text-xs text-primary underline-offset-4 hover:underline">JSON</button></HoverCardTrigger>
                  <HoverCardContent className="w-96 max-h-80 overflow-auto"><pre className="whitespace-pre-wrap break-words font-mono text-xs">{JSON.stringify(r.details, null, 2)}</pre></HoverCardContent>
                </HoverCard>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
