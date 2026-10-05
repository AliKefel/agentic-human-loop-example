import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { MemoryRow } from "@/lib/types";

export function MemoryCard({ memory }: { memory: MemoryRow }) {
  return (
    <Card size="sm" data-testid={`memory-${memory.id}`}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {memory.subject}
          {memory.sector && <Badge variant="secondary">{memory.sector}</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p>{memory.content}</p>
        <p className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>{new Date(memory.created_at).toISOString().slice(0, 10)}</span>
          {memory.source_run_id && <Link href={`/runs/${memory.source_run_id}`} className="text-primary underline-offset-4 hover:underline">From run →</Link>}
        </p>
      </CardContent>
    </Card>
  );
}
