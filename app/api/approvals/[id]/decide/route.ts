import { NextResponse } from "next/server";
import { z } from "zod";
import { getRepo } from "@/lib/harness/repo";
import { decideApproval } from "@/lib/harness/approvals";
import { ApprovalActionSchema, ReasonSchema } from "@/lib/harness/approval-input";
import { errorResponse, UUID } from "@/lib/harness/http";
import { getActingUser } from "@/lib/current-user";

const Body = z.object({ action: ApprovalActionSchema, reason: ReasonSchema.optional() });

/** Same decision as the server action, over HTTP: 403 insufficient authority, 409 already decided / not waiting, 400 invalid. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Approval not found" }, { status: 404 });
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid decision" }, { status: 400 });
  try {
    const run = await decideApproval(getRepo(), id, await getActingUser(), body.data.action, body.data.reason ?? null);
    return NextResponse.json({ run });
  } catch (e) {
    return errorResponse(e, `decide approval ${id}`);
  }
}
