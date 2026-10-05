"use server";
import { revalidatePath } from "next/cache";
import { getRepo } from "@/lib/harness/repo";
import { getActingUser } from "@/lib/current-user";
import { decideApproval, type ApprovalAction } from "@/lib/harness/approvals";
import { ApprovalActionSchema, ReasonSchema } from "@/lib/harness/approval-input";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/harness/errors";
import { UUID } from "@/lib/harness/http";
import type { RunStatus } from "@/lib/types";

export type DecideResult = { ok: true; runId: string; status: RunStatus } | { ok: false; error: string; code: 400 | 403 | 404 | 409 | 500 };

/** Approve / Modify / Reject / Replan. Authority is enforced in decideApproval (server-side), never by the UI. */
export async function decideApprovalAction(approvalId: string, action: ApprovalAction, reason: string | null): Promise<DecideResult> {
  if (typeof approvalId !== "string" || !UUID.test(approvalId)) return { ok: false, error: "Approval not found", code: 404 };
  const a = ApprovalActionSchema.safeParse(action);
  const r = ReasonSchema.safeParse(reason ?? null);
  if (!a.success || !r.success) return { ok: false, error: "Invalid decision", code: 400 };
  try {
    const run = await decideApproval(getRepo(), approvalId, await getActingUser(), a.data, r.data);
    revalidatePath("/", "layout"); // nav badge, queue, run page
    return { ok: true, runId: run.id, status: run.status };
  } catch (e) {
    if (e instanceof ForbiddenError) return { ok: false, error: e.message, code: 403 };
    if (e instanceof ConflictError) return { ok: false, error: e.message, code: 409 };
    if (e instanceof ValidationError) return { ok: false, error: e.message, code: 400 };
    if (e instanceof NotFoundError) return { ok: false, error: "Approval not found", code: 404 };
    console.error(`decide approval ${approvalId} failed`, e);
    return { ok: false, error: "Something went wrong deciding this approval", code: 500 };
  }
}
