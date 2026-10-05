"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Gavel, MessageSquareReply, RotateCcw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApprovalDrawer, KIND_LABEL } from "@/components/queue/approval-drawer";
import { cn } from "cn";
import { TERMINAL, type QueueItem, type RunStatus, type User } from "@/lib/types";

type Props = {
  runId: string;
  status: RunStatus;
  canResume: boolean;
  /** Pending approval shaped for the review drawer (Approve / Modify / Reject / Replan). */
  review?: { item: QueueItem; user: User; memories: string[] } | null;
  className?: string;
};

/**
 * Actions (SPEC §5.3): Cancel (any non-terminal run) · Resume from checkpoint (failed, GP only) ·
 * Review & decide (opens the T10 ApprovalDrawer) · Answer as founder (jumps to the Founder Q&A tab).
 */
export function RunActions({ runId, status, canResume, review, className }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const showCancel = !TERMINAL.includes(status);
  const showResume = canResume && status === "failed";
  const showFounder = status === "awaiting_founder";
  if (!showCancel && !showResume && !review && !showFounder) return null;

  const post = (action: "cancel" | "resume") =>
    start(async () => {
      try {
        const res = await fetch(`/api/runs/${runId}/${action}`, { method: "POST" });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          toast.error(`Could not ${action} run`, { description: body?.error ?? `HTTP ${res.status}` });
          return;
        }
        toast.success(action === "cancel" ? "Run cancelled" : "Run resumed from checkpoint");
        router.refresh();
      } catch {
        toast.error(`Could not ${action} run`, { description: "Network error" });
      }
    });

  const openFounder = () => {
    window.dispatchEvent(new CustomEvent("tank:tab", { detail: "founder" }));
    document.getElementById("run-tabs")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)} data-testid="run-actions">
      {review && (
        <>
          <Button size="sm" onClick={() => setOpen(true)} data-testid="open-review">
            <Gavel aria-hidden /> Review {KIND_LABEL[review.item.approval.kind].toLowerCase()}
          </Button>
          <ApprovalDrawer item={review.item} user={review.user} memories={review.memories} open={open} onOpenChange={setOpen} />
        </>
      )}
      {showFounder && (
        <Button size="sm" onClick={openFounder} data-testid="answer-founder">
          <MessageSquareReply aria-hidden /> Answer as founder
        </Button>
      )}
      {showResume && (
        <Button size="sm" variant="outline" disabled={pending} onClick={() => post("resume")} data-testid="resume-run">
          <RotateCcw aria-hidden /> Resume from checkpoint
        </Button>
      )}
      {showCancel && (
        <Button size="sm" variant="outline" className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={pending} onClick={() => post("cancel")} data-testid="cancel-run">
          <XCircle aria-hidden /> Cancel run
        </Button>
      )}
    </div>
  );
}
