"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { answerFounderAction, scriptedFounderReplyAction, type FounderResult } from "@/app/actions/founder";
import type { FounderMessageRow } from "@/lib/types";

type Props = { runId: string; messages: FounderMessageRow[]; awaiting: boolean; mock: boolean };

/** Founder Q&A (SPEC §2.10): the thread, "Answer as founder", and (Mock mode) the scripted reply. */
export function FounderPanel({ runId, messages, awaiting, mock }: Props) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [pending, start] = useTransition();

  const send = (fn: () => Promise<FounderResult>) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) {
        toast.error("Could not send the founder's answer", { description: res.error });
        return;
      }
      setBody("");
      toast.success("Founder answered", { description: "Skeptic and Finance Sharks are re-running." });
      router.refresh(); // status is now analyzing → AutoAdvance drives the run
    });

  return (
    <section className="space-y-3 rounded-md border p-3" data-testid="founder-panel">
      <div className="flex items-center gap-2">
        <span className="font-medium">Founder Q&amp;A</span>
        {awaiting && <Badge variant="outline" className="border-warning/40 text-warning">waiting for founder</Badge>}
      </div>
      <ol className="space-y-2">
        {messages.map((m) => (
          <li key={m.id} className={m.direction === "to_founder" ? "mr-8 rounded-md bg-muted p-2" : "ml-8 rounded-md bg-primary/10 p-2"}>
            <p className="text-xs text-muted-foreground">{m.direction === "to_founder" ? "Lead Shark → founder" : "Founder"} · <span suppressHydrationWarning>{new Date(m.created_at).toLocaleString()}</span></p>
            <p className="whitespace-pre-wrap">{m.body}</p>
          </li>
        ))}
      </ol>
      {awaiting && (
        <div className="space-y-2">
          <Label htmlFor="founder-answer">Answer as founder</Label>
          <Textarea id="founder-answer" value={body} maxLength={4000} onChange={(e) => setBody(e.target.value)} placeholder="Paste or type the founder's reply…" />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={pending || !body.trim()} onClick={() => send(() => answerFounderAction(runId, body))} data-testid="founder-answer">Send answer</Button>
            {mock && (
              <Button size="sm" variant="outline" disabled={pending} onClick={() => send(() => scriptedFounderReplyAction(runId))} data-testid="founder-scripted">
                Use scripted founder reply
              </Button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
