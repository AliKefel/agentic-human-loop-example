"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ApprovalDrawer, ROLE_LABEL } from "@/components/queue/approval-drawer";
import { SlaCountdown } from "@/components/sla-countdown";
import type { PolicyDecision, QueueItem, User } from "@/lib/types";

/** Decision panel (SPEC §5.3): outcome, rule fired, required role; opens the review drawer while waiting. */
export function DecisionPanel({ decision, item, user, memories }: { decision: PolicyDecision; item: QueueItem | null; user: User; memories: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-2 rounded-md border p-3" data-testid="decision-panel">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">Decision</span>
        <Badge variant="secondary">{decision.outcome.replace(/_/g, " ")}</Badge>
        <Badge variant="outline" className="font-mono">{decision.rule}</Badge>
        {decision.required_role && <Badge>{ROLE_LABEL[decision.required_role]}</Badge>}
        {item && <SlaCountdown due={item.approval.sla_due} />}
      </div>
      <p className="text-muted-foreground">{decision.explanation}</p>
      {item && (
        <>
          <Button size="sm" onClick={() => setOpen(true)} data-testid="open-review">Review &amp; decide</Button>
          <ApprovalDrawer item={item} user={user} memories={memories} open={open} onOpenChange={setOpen} />
        </>
      )}
    </div>
  );
}
