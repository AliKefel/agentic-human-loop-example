import { NextResponse } from "next/server";
import { getRepo } from "@/lib/harness/repo";
import { cancelRun } from "@/lib/harness/runs";
import { errorResponse, UUID } from "@/lib/harness/http";
import { getActingUser } from "@/lib/current-user";

/** Cancels a non-terminal run (any role). 409 if already terminal. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Run not found" }, { status: 404 });
  try {
    const run = await cancelRun(getRepo(), id, await getActingUser());
    return NextResponse.json({ run });
  } catch (e) {
    return errorResponse(e, `cancel ${id}`);
  }
}
