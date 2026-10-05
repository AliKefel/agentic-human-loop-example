"use client";

import { useMemo, useState } from "react";
import { GitCompare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfigDiffView } from "@/components/harness/config-diff-view";
import { diffConfigs } from "@/lib/config-diff";
import type { HarnessConfig } from "@/lib/types";

const LEVEL = ["L0 Human decides", "L1 Approval", "L2 Assisted", "L3 Full auto"];
const when = (iso: string) => new Date(iso).toISOString().slice(0, 16).replace("T", " ") + " UTC";

/** Every published version (newest first) and a field-level Compare between any two (SPEC §5.6). */
export function VersionHistory({ configs, names }: { configs: HarnessConfig[]; names: Record<string, string> }) {
  const [from, setFrom] = useState(String(configs[1]?.version ?? configs[0]?.version ?? 1));
  const [to, setTo] = useState(String(configs[0]?.version ?? 1));
  const a = configs.find((c) => String(c.version) === from);
  const b = configs.find((c) => String(c.version) === to);
  const diff = useMemo(() => (a && b ? diffConfigs(a, b) : []), [a, b]);
  const picker = (id: string, label: string, value: string, set: (v: string) => void) => (
    <div className="flex items-center gap-2">
      <Label htmlFor={id} className="text-xs text-muted-foreground">{label}</Label>
      <Select value={value} onValueChange={set}>
        <SelectTrigger id={id} size="sm" className="w-[90px]" data-testid={id}><SelectValue /></SelectTrigger>
        <SelectContent>{configs.map((c) => <SelectItem key={c.version} value={String(c.version)}>v{c.version}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );

  return (
    <Card data-testid="version-history">
      <CardHeader>
        <CardTitle>Version history</CardTitle>
        <CardDescription>Publishing never edits a version in place. Each run keeps the version it started with.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Version</TableHead>
                <TableHead>Published by</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Autonomy</TableHead>
                <TableHead>Auto-send max</TableHead>
                <TableHead className="w-[40%]">Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {configs.map((c) => (
                <TableRow key={c.version} data-testid={`version-row-${c.version}`}>
                  <TableCell className="font-medium">
                    <span className="flex items-center gap-2">v{c.version}{c.is_active && <Badge className="bg-success/15 text-success hover:bg-success/15">Active</Badge>}</span>
                  </TableCell>
                  <TableCell>{c.created_by ? (names[c.created_by] ?? "Unknown") : "System"}</TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{when(c.created_at)}</TableCell>
                  <TableCell className="whitespace-nowrap">{LEVEL[c.autonomy_level]}</TableCell>
                  <TableCell className="tabular-nums">${c.thresholds.auto_max_amount.toLocaleString("en-US")}</TableCell>
                  <TableCell className="text-muted-foreground">{c.notes || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-2 text-sm font-medium"><GitCompare className="size-4 text-primary" aria-hidden />Compare</span>
            {picker("compare-from", "from", from, setFrom)}
            {picker("compare-to", "to", to, setTo)}
          </div>
          <ConfigDiffView diff={diff} empty={from === to ? "Pick two different versions to compare." : `v${from} and v${to} are identical.`} />
        </div>
      </CardContent>
    </Card>
  );
}
