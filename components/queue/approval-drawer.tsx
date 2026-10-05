"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { decideApprovalAction } from "@/app/actions/approvals";
import type { ApprovalAction } from "@/lib/harness/approvals";
import { canAct } from "@/lib/harness/authority";
import { money, pct } from "@/lib/format";
import type { AgentName, QueueItem, User } from "@/lib/types";

export const KIND_LABEL = { approval: "Approval", exception: "Exception", escalation: "Escalation" } as const;
export const ROLE_LABEL = { analyst: "Analyst", partner: "Partner", general_partner: "General Partner" } as const;
const SHARKS: AgentName[] = ["market", "finance", "product", "skeptic"];

/** A button that stays hoverable when disabled so its Tooltip can explain why (SPEC §5.4). */
function Guarded({ why, children }: { why?: string; children: React.ReactNode }) {
  if (!why) return <>{children}</>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="inline-flex" data-testid="authority-tooltip">{children}</span>
      </TooltipTrigger>
      <TooltipContent>{why}</TooltipContent>
    </Tooltip>
  );
}

function ScoreBar({ agent, score, verdict }: QueueItem["scores"][number]) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-16 capitalize text-muted-foreground">{agent}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
        <div className={verdict === "invest" ? "h-full bg-primary" : "h-full bg-destructive"} style={{ width: `${score * 10}%` }} />
      </div>
      <span className="w-8 text-right font-mono tabular-nums">{score}</span>
    </div>
  );
}

type Props = { item: QueueItem | null; user: User; memories: string[]; open: boolean; onOpenChange: (o: boolean) => void };

/** Review drawer: terms, Shark scores, synthesis, partner memory, reason, and the decision buttons. */
export function ApprovalDrawer({ item, user, memories, open, onOpenChange }: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {item && <DrawerBody key={item.approval.id} item={item} user={user} memories={memories} onDone={() => onOpenChange(false)} />}
      </SheetContent>
    </Sheet>
  );
}

function DrawerBody({ item, user, memories, onDone }: { item: QueueItem; user: User; memories: string[]; onDone: () => void }) {
  const router = useRouter();
  const a = item.approval;
  const terms = a.original_terms;
  const [reason, setReason] = useState("");
  const [modifying, setModifying] = useState(false);
  const [amount, setAmount] = useState(String(terms?.amount ?? ""));
  const [equity, setEquity] = useState(String(terms?.equity_pct ?? ""));
  const [replanning, setReplanning] = useState(false);
  const [agents, setAgents] = useState<AgentName[]>([]);
  const [pending, start] = useTransition();

  const base = canAct(user, a, terms?.amount ?? 0);
  const modAmount = Number(amount);
  const mod = canAct(user, a, Number.isFinite(modAmount) ? modAmount : 0);
  const needReason = reason.trim() ? undefined : "A reason is required.";
  const canReplan = a.kind === "exception" && item.replans < item.maxReplans;

  const submit = (action: ApprovalAction, label: string) =>
    start(async () => {
      const res = await decideApprovalAction(a.id, action, reason.trim() || null);
      if (!res.ok) {
        toast.error(`Could not ${label}`, { description: res.error });
        return;
      }
      toast.success(`${label[0].toUpperCase()}${label.slice(1)}: ${a.company}`, { description: `Run is now ${res.status.replace(/_/g, " ")}` });
      onDone();
      if (res.status === "analyzing") router.push(`/runs/${res.runId}`); // the run page auto-advances the replan
      else router.refresh();
    });

  return (
    <>
      <SheetHeader>
        <SheetTitle className="flex flex-wrap items-center gap-2">
          {a.company}
          <Badge variant="secondary">{KIND_LABEL[a.kind]}</Badge>
          <Badge variant="outline" className="font-mono">{a.rule_fired}</Badge>
        </SheetTitle>
        <SheetDescription>
          AI recommends <strong>{a.ai_recommendation}</strong> · requires {ROLE_LABEL[a.required_role]} · L{a.autonomy_level} · {a.sector}
        </SheetDescription>
      </SheetHeader>

      <div className="space-y-5 px-4 text-sm">
        <section>
          <h3 className="mb-1 text-xs font-medium uppercase text-muted-foreground">Proposed terms</h3>
          <p className="text-lg font-semibold">{terms ? `${money(terms.amount)} for ${pct(terms.equity_pct)}` : "No terms (pass)"}</p>
        </section>

        <section className="space-y-1.5">
          <h3 className="mb-1 text-xs font-medium uppercase text-muted-foreground">Shark scores</h3>
          {item.scores.map((s) => <ScoreBar key={s.agent} {...s} />)}
          {item.failures.length > 0 && <p className="text-xs text-destructive">Missing: {item.failures.join(", ")}</p>}
        </section>

        {(item.summary || item.disagreements.length > 0) && (
          <section>
            <h3 className="mb-1 text-xs font-medium uppercase text-muted-foreground">Synthesis</h3>
            {item.summary && <p>{item.summary}</p>}
            {item.disagreements.length > 0 && (
              <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                {item.disagreements.map((d) => <li key={d}>{d}</li>)}
              </ul>
            )}
          </section>
        )}

        <section>
          <h3 className="mb-1 text-xs font-medium uppercase text-muted-foreground">Your partner memory ({user.name})</h3>
          {memories.length ? (
            <ul className="list-disc pl-5">{memories.map((m) => <li key={m}>{m}</li>)}</ul>
          ) : (
            <p className="text-muted-foreground">No memories yet.</p>
          )}
        </section>

        <Separator />

        <section className="space-y-2">
          <Label htmlFor="reason">Reason {modifying ? "(required to modify)" : "(required to modify or reject)"}</Label>
          <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why are you making this call?" />
        </section>

        {modifying && (
          <section className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="amount">Amount ($)</Label>
              <Input id="amount" type="number" min={1} max={item.fundMax} value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="equity">Equity (%)</Label>
              <Input id="equity" type="number" min={0.1} max={100} step={0.1} value={equity} onChange={(e) => setEquity(e.target.value)} />
            </div>
          </section>
        )}

        {replanning && (
          <section className="space-y-2">
            <Label>Sharks to rerun ({item.maxReplans - item.replans} replans left)</Label>
            <div className="flex flex-wrap gap-2">
              {SHARKS.map((s) => {
                const on = agents.includes(s);
                return (
                  <Button key={s} size="sm" type="button" variant={on ? "default" : "outline"} aria-pressed={on} className="capitalize"
                    onClick={() => setAgents((xs) => (on ? xs.filter((x) => x !== s) : [...xs, s]))}>
                    {s}
                  </Button>
                );
              })}
            </div>
          </section>
        )}
      </div>

      <SheetFooter className="flex-row flex-wrap gap-2">
        {modifying ? (
          <>
            <Guarded why={mod.why ?? needReason}>
              <Button disabled={pending || !mod.ok || !!needReason} data-testid="confirm-modify"
                onClick={() => submit({ type: "modify", terms: { amount: modAmount, equity_pct: Number(equity) } }, "modify and approve")}>
                Approve modified terms
              </Button>
            </Guarded>
            <Button variant="ghost" onClick={() => setModifying(false)}>Back</Button>
          </>
        ) : replanning ? (
          <>
            <Guarded why={base.why ?? (agents.length ? undefined : "Choose at least one Shark.")}>
              <Button disabled={pending || !base.ok || !agents.length} onClick={() => submit({ type: "replan", agents }, "replan")}>Rerun selected Sharks</Button>
            </Guarded>
            <Button variant="ghost" onClick={() => setReplanning(false)}>Back</Button>
          </>
        ) : (
          <>
            <Guarded why={base.why ?? (terms ? undefined : "No terms to approve — use Modify.")}>
              <Button disabled={pending || !base.ok || !terms} onClick={() => submit({ type: "approve" }, "approve")} data-testid="approve">Approve</Button>
            </Guarded>
            <Guarded why={base.why}>
              <Button variant="outline" disabled={pending || !base.ok} onClick={() => setModifying(true)} data-testid="modify">Modify</Button>
            </Guarded>
            <Guarded why={base.why ?? needReason}>
              <Button variant="destructive" disabled={pending || !base.ok || !!needReason} onClick={() => submit({ type: "reject" }, "reject")} data-testid="reject">Reject</Button>
            </Guarded>
            {a.kind === "exception" && (
              <Guarded why={base.why ?? (canReplan ? undefined : `Replan limit reached (${item.maxReplans}).`)}>
                <Button variant="secondary" disabled={pending || !base.ok || !canReplan} onClick={() => setReplanning(true)}>Replan</Button>
              </Guarded>
            )}
          </>
        )}
      </SheetFooter>
    </>
  );
}
