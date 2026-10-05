/**
 * Delegated authority (SPEC §1, §2.9). PURE and client-safe (type-only imports) so the
 * queue UI can disable buttons with the same rule the server enforces in decideApproval.
 */
import type { ApprovalRow, Role, User } from "@/lib/types";

const RANK: Record<Role, number> = { analyst: 0, partner: 1, general_partner: 2 };
const LABEL: Record<Role, string> = { analyst: "Analyst", partner: "Partner", general_partner: "General Partner" };
const usd = (n: number) => `$${n.toLocaleString("en-US")}`;

/** Whether `user` may decide approval `a` for an offer of `amount` (the modified amount for Modify). */
export function canAct(user: User, a: Pick<ApprovalRow, "kind" | "required_role">, amount: number): { ok: boolean; why?: string } {
  if (user.role === "analyst") return { ok: false, why: "Analysts cannot approve, modify or reject offers (approval limit $0)." };
  if (a.kind === "escalation" && user.role !== "general_partner") return { ok: false, why: "Only a General Partner can resolve escalations." };
  if (RANK[user.role] < RANK[a.required_role]) return { ok: false, why: `Requires a ${LABEL[a.required_role]}; you are acting as a ${LABEL[user.role]}.` };
  if (amount > user.approval_limit) return { ok: false, why: `${usd(amount)} exceeds your approval limit of ${usd(user.approval_limit)}.` };
  return { ok: true };
}
