"use server";
import { revalidatePath } from "next/cache";
import { randomInt } from "node:crypto";
import { z } from "zod";
import { getRepo } from "@/lib/harness/repo";
import { getActingUser } from "@/lib/current-user";
import { actor } from "@/lib/harness/audit";
import { MARKET_DATA } from "@/lib/tools/data";
import { NewPitchSchema } from "@/lib/pitch-form";

const ALNUM = "abcdefghijklmnopqrstuvwxyz0123456789";
const kebab = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "pitch";
const rand4 = () => Array.from({ length: 4 }, () => ALNUM[randomInt(ALNUM.length)]).join("");

export async function createPitch(input: z.input<typeof NewPitchSchema>): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const parsed = NewPitchSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid pitch" };
  const p = parsed.data;
  if (!(p.sector in MARKET_DATA)) return { ok: false, error: "Unknown sector" };
  const repo = getRepo();
  const user = await getActingUser();
  const pitch = await repo.createPitch({
    slug: `${kebab(p.company)}-${rand4()}`,
    company: p.company, tagline: p.tagline, founder: p.founder, sector: p.sector,
    ask_amount: p.ask_amount, equity_offered: p.equity_offered, revenue: p.revenue, claimed_revenue: null,
    growth_pct: p.growth_pct, monthly_burn: p.monthly_burn, pitch_text: p.pitch_text, chaos: {},
  });
  await repo.audit({ ...actor(user), action: "pitch.created", entity: "pitch", entity_id: pitch.id, details: { company: pitch.company } });
  revalidatePath("/pitches");
  return { ok: true, id: pitch.id };
}
