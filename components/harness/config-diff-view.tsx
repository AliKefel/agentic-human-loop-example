import { ArrowRight } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { DiffEntry } from "@/lib/config-diff";

function show(v: unknown): string {
  if (v === undefined) return "—";
  if (v === null) return "null";
  if (Array.isArray(v)) return v.length ? v.join(", ") : "(none)";
  if (typeof v === "number") return v.toLocaleString("en-US");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/** Field-level diff: dotted path, before (red) → after (green). */
export function ConfigDiffView({ diff, empty = "No differences." }: { diff: DiffEntry[]; empty?: string }) {
  if (!diff.length) return <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground" data-testid="config-diff-empty">{empty}</p>;
  return (
    <div className="overflow-x-auto rounded-lg border" data-testid="config-diff">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[40%]">Field</TableHead>
            <TableHead>Before → after</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {diff.map((d) => (
            <TableRow key={d.path}>
              <TableCell className="font-mono text-xs">{d.path}</TableCell>
              <TableCell>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="rounded bg-destructive/10 px-1.5 py-0.5 font-mono text-xs text-destructive line-through decoration-destructive/40">{show(d.before)}</span>
                  <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" aria-label="changed to" />
                  <span className="rounded bg-success/10 px-1.5 py-0.5 font-mono text-xs text-success">{show(d.after)}</span>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
