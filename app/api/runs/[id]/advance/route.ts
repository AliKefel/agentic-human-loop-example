import { NextResponse } from "next/server";
import { getRepo } from "@/lib/harness/repo";
import { advanceRun } from "@/lib/harness/machine";
import { NotFoundError } from "@/lib/harness/errors";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Executes exactly one state transition (SPEC §2.2). 409 when another advance/cancel won the CAS. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Run not found" }, { status: 404 });
  try {
    const { status, run } = await advanceRun(getRepo(), id);
    return NextResponse.json({ status, run }, { status: status === "conflict" ? 409 : 200 });
  } catch (e) {
    if (e instanceof NotFoundError) return NextResponse.json({ error: e.message }, { status: 404 });
    console.error(`advance ${id} failed`, e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
