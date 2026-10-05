import { NextResponse } from "next/server";
import { z } from "zod";
import { getRepo } from "@/lib/harness/repo";
import { createRun } from "@/lib/harness/runs";
import { NotFoundError } from "@/lib/harness/errors";
import { getActingUser } from "@/lib/current-user";

const Body = z.object({ pitchId: z.string().uuid(), autonomyLevel: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]).optional() });

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request", issues: parsed.error.issues }, { status: 400 });
  try {
    const run = await createRun(getRepo(), { ...parsed.data, user: await getActingUser() });
    return NextResponse.json({ id: run.id });
  } catch (e) {
    if (e instanceof NotFoundError) return NextResponse.json({ error: e.message }, { status: 404 });
    throw e;
  }
}
