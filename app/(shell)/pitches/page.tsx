import { getRepo } from "@/lib/harness/repo";
import { MARKET_DATA } from "@/lib/tools/data";
import { PitchCard } from "@/components/pitches/pitch-card";
import { NewPitchSheet } from "@/components/pitches/new-pitch-sheet";

export const dynamic = "force-dynamic";

export default async function PitchesPage() {
  const repo = getRepo();
  const [pitches, latest, config] = await Promise.all([repo.listPitches(), repo.latestRunsByPitch(), repo.getActiveConfig()]);
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-semibold">Pitches</h1>
          <span className="text-sm text-muted-foreground">{pitches.length} pitches</span>
        </div>
        <NewPitchSheet sectors={Object.keys(MARKET_DATA)} />
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {pitches.map((p) => (
          <PitchCard key={p.id} pitch={p} lastRun={latest[p.id]} defaultLevel={config.autonomy_level} maxTokens={config.budgets.max_tokens} maxUsd={config.budgets.max_usd} />
        ))}
      </div>
    </div>
  );
}
