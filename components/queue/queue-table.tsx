"use client";

import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { compact, SlaCountdown, useNow } from "@/components/sla-countdown";
import { KIND_LABEL, ROLE_LABEL } from "@/components/queue/approval-drawer";
import { money, pct } from "@/lib/format";
import type { QueueItem } from "@/lib/types";

/** Review queue rows (SPEC §5.4): company, kind, terms, required role, rule fired, age, SLA countdown. */
export function QueueTable({ items, onSelect }: { items: QueueItem[]; onSelect: (item: QueueItem) => void }) {
  const now = useNow();
  if (!items.length) return <p className="py-10 text-center text-sm text-muted-foreground">Nothing waiting here.</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Company</TableHead>
          <TableHead>Kind</TableHead>
          <TableHead>Proposed terms</TableHead>
          <TableHead>Required role</TableHead>
          <TableHead>Rule fired</TableHead>
          <TableHead>Age</TableHead>
          <TableHead>SLA</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => {
          const a = item.approval;
          return (
            <TableRow key={a.id} className="cursor-pointer" tabIndex={0} data-testid={`queue-row-${a.id}`}
              onClick={() => onSelect(item)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(item); } }}>
              <TableCell className="font-medium">{a.company}</TableCell>
              <TableCell><Badge variant="secondary">{KIND_LABEL[a.kind]}</Badge></TableCell>
              <TableCell>{a.original_terms ? `${money(a.original_terms.amount)} / ${pct(a.original_terms.equity_pct)}` : "—"}</TableCell>
              <TableCell>
                <Badge variant={a.required_role === "general_partner" ? "default" : "outline"}>{ROLE_LABEL[a.required_role]}</Badge>
              </TableCell>
              <TableCell><Badge variant="outline" className="font-mono">{a.rule_fired}</Badge></TableCell>
              <TableCell suppressHydrationWarning className="text-muted-foreground">{compact(now - new Date(a.created_at).getTime())}</TableCell>
              <TableCell><SlaCountdown due={a.sla_due} /></TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
