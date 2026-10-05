import { z } from "zod";

/** Wire shape of a human decision (server action + API route). Range checks live in decideApproval. */
export const ApprovalActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("approve") }),
  z.object({ type: z.literal("modify"), terms: z.object({ amount: z.number(), equity_pct: z.number() }) }),
  z.object({ type: z.literal("reject") }),
  z.object({ type: z.literal("replan"), agents: z.array(z.enum(["market", "finance", "product", "skeptic"])) }),
]);
export const ReasonSchema = z.string().max(2000).nullable();
