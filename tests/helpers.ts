import { SEED_PITCHES } from "@/lib/mock/seed-pitches";
import type { Pitch } from "@/lib/types";

export function pitchFixture(slug: string): Pitch {
  const p = SEED_PITCHES.find((x) => x.slug === slug);
  if (!p) throw new Error(`unknown pitch ${slug}`);
  return { ...p, id: `pitch-${slug}`, created_at: "2026-01-01T00:00:00.000Z" };
}
