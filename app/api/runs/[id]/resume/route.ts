import { NextResponse } from "next/server";
import { getRepo } from "@/lib/harness/repo";
import { resumeRun } from "@/lib/harness/runs";
import { errorResponse, UUID } from "@/lib/harness/http";
import { getActingUser } from "@/lib/current-user";

/** Resumes a failed run from its last working checkpoint (General Partner only). 403 / 409. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Run not found" }, { status: 404 });
  try {
    const run = await resumeRun(getRepo(), id, await getActingUser());
    return NextResponse.json({ run });
  } catch (e) {
    return errorResponse(e, `resume ${id}`);
  }
}
