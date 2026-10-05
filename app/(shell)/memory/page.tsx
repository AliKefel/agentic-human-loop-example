import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MemoryCard } from "@/components/memory/memory-card";
import { getRepo } from "@/lib/harness/repo";

export const dynamic = "force-dynamic";

const SCOPES = [
  { value: "firm", label: "Firm", hint: "Human overrides; read by the Lead Shark at synthesis (same sector)." },
  { value: "founder", label: "Founder", hint: "Outcomes of past runs; read by the Lead Shark at planning." },
  { value: "partner", label: "Partner", hint: "Partner preferences, shown in the approval drawer." },
] as const;

/** Memory (SPEC §5.8): tabs by scope; each memory links to its source run. */
export default async function MemoryPage() {
  const all = await getRepo().listMemories();
  return (
    <Tabs defaultValue="firm">
      <TabsList>
        {SCOPES.map((s) => <TabsTrigger key={s.value} value={s.value}>{s.label} ({all.filter((m) => m.scope === s.value).length})</TabsTrigger>)}
      </TabsList>
      {SCOPES.map((s) => {
        const ms = all.filter((m) => m.scope === s.value);
        return (
          <TabsContent key={s.value} value={s.value} className="space-y-3">
            <p className="text-sm text-muted-foreground">{s.hint}</p>
            {ms.length ? <div className="grid gap-3 md:grid-cols-2">{ms.map((m) => <MemoryCard key={m.id} memory={m} />)}</div> : <p className="py-10 text-center text-sm text-muted-foreground">No {s.label.toLowerCase()} memories yet.</p>}
          </TabsContent>
        );
      })}
    </Tabs>
  );
}
