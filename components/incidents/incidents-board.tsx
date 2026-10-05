"use client";

import { useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SlaCountdown } from "@/components/sla-countdown";
import { SeverityBadge } from "@/components/incidents/severity-badge";
import { IncidentSheet } from "@/components/incidents/incident-sheet";
import type { IncidentListRow, IncidentRow, User } from "@/lib/types";

const COLUMNS: { status: IncidentRow["status"]; label: string }[] = [
  { status: "open", label: "Open" },
  { status: "acknowledged", label: "Acknowledged" },
  { status: "resolved", label: "Resolved" },
];
const SEV_ORDER = { sev1: 0, sev2: 1, sev3: 2 } as const;
export const initials = (name: string) => name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();

export function OwnerAvatar({ owner }: { owner: User | undefined }) {
  return (
    <Avatar size="sm" title={owner?.name ?? "Unassigned"}>
      <AvatarFallback style={owner ? { backgroundColor: owner.avatar_color, color: "#04121f" } : undefined}>{owner ? initials(owner.name) : "?"}</AvatarFallback>
    </Avatar>
  );
}

/** Three columns of incident cards; clicking a card opens the detail Sheet. */
export function IncidentsBoard({ incidents, users, user }: { incidents: IncidentListRow[]; users: User[]; user: User }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const selected = incidents.find((i) => i.id === selectedId) ?? null;
  const userById = (id: string | null) => users.find((u) => u.id === id);

  return (
    <>
      <div className="grid gap-4 md:grid-cols-3">
        {COLUMNS.map((col) => {
          const items = incidents
            .filter((i) => i.status === col.status)
            .sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity] || a.sla_due.localeCompare(b.sla_due));
          return (
            <section key={col.status} className="space-y-3" data-testid={`incidents-${col.status}`}>
              <h2 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                {col.label}
                <Badge variant="secondary">{items.length}</Badge>
              </h2>
              {items.length === 0 && <p className="rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">No incidents</p>}
              {items.map((i) => (
                <Card key={i.id} role="button" tabIndex={0} className="cursor-pointer gap-2 py-4 transition-colors hover:bg-muted/40" data-testid={`incident-card-${i.id}`}
                  onClick={() => { setSelectedId(i.id); setOpen(true); }}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedId(i.id); setOpen(true); } }}>
                  <CardHeader className="px-4">
                    <CardTitle className="flex items-start justify-between gap-2 text-sm">
                      <span className="leading-snug">{i.title}</span>
                      <SeverityBadge severity={i.severity} />
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex items-center justify-between gap-2 px-4 text-xs">
                    <span className="flex items-center gap-2">
                      <OwnerAvatar owner={userById(i.owner_id)} />
                      <span className="font-medium">{i.company}</span>
                    </span>
                    {i.status === "resolved" ? <span className="text-muted-foreground">resolved</span> : <SlaCountdown due={i.sla_due} />}
                  </CardContent>
                </Card>
              ))}
            </section>
          );
        })}
      </div>
      <IncidentSheet incident={selected} users={users} user={user} open={open} onOpenChange={setOpen} />
    </>
  );
}
