"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ROLE_LABEL } from "@/components/queue/approval-drawer";
import { SlaCountdown } from "@/components/sla-countdown";
import { cn } from "cn";
import { money, pct } from "@/lib/format";
import { impliedValuation } from "@/lib/run-view";
import type { PolicyDecision, Terms } from "@/lib/types";

const OUTCOME_TONE: Record<PolicyDecision["outcome"], string> = {
  auto_send: "border-success/40 bg-success/15 text-success",
  auto_pass: "border-border bg-secondary text-secondary-foreground",
  needs_approval: "border-warning/50 bg-warning/15 text-foreground",
  exception: "border-warning/50 bg-warning/15 text-foreground",
  escalate: "border-destructive/40 bg-destructive/10 text-destructive",
  need_info: "border-primary/40 bg-primary/10 text-primary",
};

const fmtTerms = (t: Terms) => `${money(t.amount)} for ${pct(t.equity_pct)}`;

type Props = {
  decision: PolicyDecision | null;
  recommendation: "invest" | "pass" | null;
  draftTerms: Terms | null;
  finalTerms: Terms | null;
  summary: string | null;
  slaDue: string | null;
};

/** Decision panel (SPEC §5.3): AI recommendation, draft terms, rule fired, required role. Review actions live in RunActions. */
export function DecisionPanel({ decision, recommendation, draftTerms, finalTerms, summary, slaDue }: Props) {
  return (
    <Card size="sm" data-testid="decision-panel">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Decision
          {decision && <Badge variant="outline" className={cn("capitalize", OUTCOME_TONE[decision.outcome])}>{decision.outcome.replace(/_/g, " ")}</Badge>}
          {slaDue && <SlaCountdown due={slaDue} className="ml-auto" />}
        </CardTitle>
        {!decision && <CardDescription>The policy engine runs after synthesis.</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
          <dt className="text-muted-foreground">AI recommendation</dt>
          <dd className="font-medium uppercase">{recommendation ?? <span className="font-normal normal-case text-muted-foreground">pending</span>}</dd>
          <dt className="text-muted-foreground">Draft terms</dt>
          <dd className="tabular-nums">
            {draftTerms ? <>{fmtTerms(draftTerms)} <span className="text-muted-foreground">· {money(impliedValuation(draftTerms.amount, draftTerms.equity_pct))} post</span></> : <span className="text-muted-foreground">—</span>}
          </dd>
          {finalTerms && (
            <>
              <dt className="text-muted-foreground">Final terms</dt>
              <dd className="font-medium tabular-nums text-success">{fmtTerms(finalTerms)}</dd>
            </>
          )}
          <dt className="text-muted-foreground">Rule fired</dt>
          <dd>{decision ? <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">{decision.rule}</code> : <span className="text-muted-foreground">—</span>}</dd>
          <dt className="text-muted-foreground">Required role</dt>
          <dd>{decision?.required_role ? <Badge variant="secondary">{ROLE_LABEL[decision.required_role]}</Badge> : <span className="text-muted-foreground">{decision ? "none (auto)" : "—"}</span>}</dd>
        </dl>
        {decision && <p className="text-xs leading-relaxed text-muted-foreground">{decision.explanation}</p>}
        {summary && <p className="border-l-2 border-primary/40 pl-2 text-xs leading-relaxed">{summary}</p>}
      </CardContent>
    </Card>
  );
}
