"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApprovalDrawer } from "@/components/queue/approval-drawer";
import { QueueTable } from "@/components/queue/queue-table";
import type { ApprovalRow, QueueItem, User } from "@/lib/types";

const TABS: { kind: ApprovalRow["kind"]; label: string }[] = [
  { kind: "approval", label: "Approvals" },
  { kind: "exception", label: "Exceptions" },
  { kind: "escalation", label: "Escalations" },
];

/** Tabs per approval kind (with counts) + the shared review drawer. */
export function QueueBoard({ items, user, memories }: { items: QueueItem[]; user: User; memories: string[] }) {
  const [selected, setSelected] = useState<QueueItem | null>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <Tabs defaultValue="approval">
        <TabsList>
          {TABS.map((t) => (
            <TabsTrigger key={t.kind} value={t.kind} data-testid={`tab-${t.kind}`}>
              {t.label}
              <Badge variant="secondary" className="ml-1">{items.filter((i) => i.approval.kind === t.kind).length}</Badge>
            </TabsTrigger>
          ))}
        </TabsList>
        {TABS.map((t) => (
          <TabsContent key={t.kind} value={t.kind}>
            <QueueTable items={items.filter((i) => i.approval.kind === t.kind)} onSelect={(i) => { setSelected(i); setOpen(true); }} />
          </TabsContent>
        ))}
      </Tabs>
      <ApprovalDrawer item={selected} user={user} memories={memories} open={open} onOpenChange={setOpen} />
    </>
  );
}
