import { getRepo } from "@/lib/harness/repo";
import { getActingUser } from "@/lib/current-user";
import { computeQueueStats } from "@/lib/harness/queue-stats";
import { queueItemFor } from "@/lib/harness/queue-data";
import { QueueStats } from "@/components/queue/queue-stats";
import { QueueBoard } from "@/components/queue/queue-board";

export const dynamic = "force-dynamic";

/** Review Queue (SPEC §5.4). Authority is re-checked on the server when a decision is submitted. */
export default async function QueuePage() {
  const repo = getRepo();
  const user = await getActingUser();
  const [pending, decided, memories] = await Promise.all([
    repo.listApprovals({ status: "pending" }),
    repo.listApprovals({ status: "decided" }),
    repo.findMemories({ scope: "partner", subject: user.name }),
  ]);
  const items = await Promise.all(pending.map((a) => queueItemFor(repo, a)));
  const stats = computeQueueStats(pending, decided, new Date().getTime());
  return (
    <div className="space-y-6">
      <QueueStats stats={stats} />
      <QueueBoard items={items} user={user} memories={memories.map((m) => m.content)} />
    </div>
  );
}
