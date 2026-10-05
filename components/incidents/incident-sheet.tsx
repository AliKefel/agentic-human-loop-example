"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SlaCountdown } from "@/components/sla-countdown";
import { SeverityBadge } from "@/components/incidents/severity-badge";
import { handoffIncidentAction, setIncidentStatusAction, type IncidentResult } from "@/app/actions/incidents";
import type { IncidentHandoff, IncidentListRow, User } from "@/lib/types";

type Props = { incident: IncidentListRow | null; users: User[]; user: User; open: boolean; onOpenChange: (o: boolean) => void };

export function IncidentSheet({ incident, users, user, open, onOpenChange }: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {incident && <SheetBody key={`${incident.id}:${incident.status}:${incident.owner_id}`} incident={incident} users={users} user={user} />}
      </SheetContent>
    </Sheet>
  );
}

function Guarded({ why, children }: { why?: string; children: React.ReactNode }) {
  if (!why) return <>{children}</>;
  return (
    <Tooltip>
      <TooltipTrigger asChild><span tabIndex={0} className="inline-flex">{children}</span></TooltipTrigger>
      <TooltipContent>{why}</TooltipContent>
    </Tooltip>
  );
}

function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <h3 className="text-xs font-medium uppercase text-muted-foreground">{label}</h3>
      <p className="whitespace-pre-wrap">{value || "—"}</p>
    </div>
  );
}

function SheetBody({ incident: i, users, user }: { incident: IncidentListRow; users: User[]; user: User }) {
  const router = useRouter();
  const h = i.handoff as Partial<IncidentHandoff>;
  const [owner, setOwner] = useState(i.owner_id ?? "");
  const [nextAction, setNextAction] = useState(h.next_action ?? "");
  const [pending, start] = useTransition();
  const resolved = i.status === "resolved";
  const ownerOrGp = user.role === "general_partner" || user.id === i.owner_id;
  const authWhy = ownerOrGp ? undefined : "Only the incident owner or a General Partner can do this.";
  const dirty = owner !== (i.owner_id ?? "") || nextAction.trim() !== (h.next_action ?? "");

  const run = (fn: () => Promise<IncidentResult>, ok: string, fail: string) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) {
        toast.error(fail, { description: res.error });
        return;
      }
      toast.success(ok);
      router.refresh();
    });

  const ownerName = (id: string) => users.find((u) => u.id === id)?.name ?? "Unassigned";
  const save = () => run(() => handoffIncidentAction(i.id, owner, nextAction), owner !== i.owner_id ? `Handed off to ${ownerName(owner)}` : "Next action saved", "Could not save handoff");

  return (
    <>
      <SheetHeader>
        <SheetTitle className="flex flex-wrap items-center gap-2">
          <SeverityBadge severity={i.severity} />
          {i.title}
        </SheetTitle>
        <SheetDescription className="flex flex-wrap items-center gap-2">
          {i.company} · <Badge variant="outline">{i.status}</Badge>
          {!resolved && <SlaCountdown due={i.sla_due} />}
        </SheetDescription>
      </SheetHeader>

      <div className="space-y-4 px-4 text-sm">
        <h3 className="text-sm font-semibold">Handoff note</h3>
        <ReadOnly label="What happened" value={h.what_happened ?? ""} />
        <ReadOnly label="Impact" value={h.impact ?? ""} />
        <ReadOnly label="Current state" value={h.current_state ?? ""} />
        <div className="space-y-1">
          <Label htmlFor="next-action">Next action</Label>
          <Textarea id="next-action" value={nextAction} disabled={resolved || !ownerOrGp} onChange={(e) => setNextAction(e.target.value)} placeholder="What should the next owner do?" />
        </div>
        <Separator />
        <div className="space-y-1">
          <Label htmlFor="owner">Owner</Label>
          <Select value={owner} onValueChange={setOwner} disabled={resolved || !ownerOrGp}>
            <SelectTrigger id="owner" className="w-full" data-testid="incident-owner"><SelectValue placeholder="Unassigned" /></SelectTrigger>
            <SelectContent>
              {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">Changing the owner is a handoff and is written to the audit log.</p>
        </div>
        <Link href={`/runs/${i.run_id}`} className="text-primary underline-offset-4 hover:underline">Open run ({i.run_status.replace(/_/g, " ")}) →</Link>
      </div>

      <SheetFooter className="flex-row flex-wrap gap-2">
        {!resolved && (
          <>
            <Guarded why={authWhy ?? (owner ? undefined : "Choose an owner.")}>
              <Button disabled={pending || !ownerOrGp || !dirty || !owner} onClick={save} data-testid="incident-handoff">
                {owner !== i.owner_id ? "Hand off" : "Save note"}
              </Button>
            </Guarded>
            {i.status === "open" && (
              <Button variant="outline" disabled={pending} onClick={() => run(() => setIncidentStatusAction(i.id, "acknowledged"), "Incident acknowledged", "Could not acknowledge")} data-testid="incident-ack">
                Acknowledge
              </Button>
            )}
            <Guarded why={authWhy}>
              <Button variant="secondary" disabled={pending || !ownerOrGp} onClick={() => run(() => setIncidentStatusAction(i.id, "resolved"), "Incident resolved", "Could not resolve")} data-testid="incident-resolve">
                Resolve
              </Button>
            </Guarded>
          </>
        )}
      </SheetFooter>
    </>
  );
}
