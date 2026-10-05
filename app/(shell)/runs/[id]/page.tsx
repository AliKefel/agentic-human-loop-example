import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getRepo } from "@/lib/harness/repo";
import { NotFoundError } from "@/lib/harness/errors";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const repo = getRepo();
  try {
    const run = await repo.getRun(id);
    const pitch = await repo.getPitch(run.pitch_id);
    return (
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-3">{pitch.company}<Badge>{run.status.replace(/_/g, " ")}</Badge></CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>Steps: {run.step_count}</p>
          <p className="text-muted-foreground">Run will advance in M2.</p>
        </CardContent>
      </Card>
    );
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
}
