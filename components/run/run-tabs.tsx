"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AuditTable } from "@/components/audit/audit-table";
import { MemoryCard } from "@/components/memory/memory-card";
import { FounderPanel } from "./founder-panel";
import { cn } from "cn";
import { SHARK_LABEL, snapshotStatus, snapshotTokens } from "@/lib/run-view";
import type { AgentCallRow, AgentName, AuditRow, CheckpointRow, FounderMessageRow, MemoryRow, Run, ToolCallRow, User } from "@/lib/types";

type Props = {
  run: Run;
  checkpoints: CheckpointRow[];
  agentCalls: AgentCallRow[];
  toolCalls: ToolCallRow[];
  founderMessages: FounderMessageRow[];
  memoriesUsed: MemoryRow[];
  audit: AuditRow[];
  users: User[];
  mock: boolean;
};

const ms = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}s` : `${n}ms`);
const label = (a: string) => (a in SHARK_LABEL ? SHARK_LABEL[a as AgentName] : a === "lead" ? "Lead" : a);

const CALL_TONE: Record<AgentCallRow["status"], string> = {
  ok: "border-success/40 bg-success/10 text-success",
  timeout: "border-destructive/40 bg-destructive/10 text-destructive",
  error: "border-destructive/40 bg-destructive/10 text-destructive",
  schema_fail: "border-warning/50 bg-warning/15 text-foreground",
  skipped_budget: "border-dashed border-muted-foreground/50 text-muted-foreground",
};

function Empty({ text }: { text: string }) {
  return <p className="py-10 text-center text-sm text-muted-foreground">{text}</p>;
}

function Json({ value, trigger }: { value: unknown; trigger: string }) {
  return (
    <HoverCard openDelay={150}>
      <HoverCardTrigger asChild>
        <button type="button" className="max-w-56 truncate text-left font-mono text-xs text-primary underline-offset-4 hover:underline">{trigger}</button>
      </HoverCardTrigger>
      <HoverCardContent className="max-h-80 w-96 overflow-auto">
        <pre className="font-mono text-xs break-words whitespace-pre-wrap">{JSON.stringify(value, null, 2)}</pre>
      </HoverCardContent>
    </HoverCard>
  );
}

const preview = (v: unknown) => {
  const s = JSON.stringify(v) ?? "null";
  return s.length > 48 ? `${s.slice(0, 48)}…` : s;
};

/** Tabs (SPEC §5.3): Timeline · Plan · Agent Calls · Tool Calls · Founder Q&A · Memory used · Audit. */
export function RunTabs({ run, checkpoints, agentCalls, toolCalls, founderMessages, memoriesUsed, audit, users, mock }: Props) {
  const awaitingFounder = run.status === "awaiting_founder";
  const [tab, setTab] = useState(awaitingFounder ? "founder" : "timeline");
  useEffect(() => {
    const onTab = (e: Event) => setTab((e as CustomEvent<string>).detail);
    window.addEventListener("tank:tab", onTab);
    return () => window.removeEventListener("tank:tab", onTab);
  }, []);
  const denied = toolCalls.filter((t) => !t.permitted).length;
  const count = (n: number) => <span className="ml-1 rounded-full bg-background/70 px-1.5 text-[10px] tabular-nums text-muted-foreground">{n}</span>;

  return (
    <Tabs value={tab} onValueChange={setTab} id="run-tabs" className="scroll-mt-4" data-testid="run-tabs">
      <div className="relative -mx-1 overflow-x-auto px-1 pb-1">
        <TabsList>
          <TabsTrigger value="timeline">Timeline{count(checkpoints.length)}</TabsTrigger>
          <TabsTrigger value="plan">Plan</TabsTrigger>
          <TabsTrigger value="agents">Agent Calls{count(agentCalls.length)}</TabsTrigger>
          <TabsTrigger value="tools">Tool Calls{count(toolCalls.length)}{denied > 0 && <span className="ml-1 size-1.5 rounded-full bg-destructive" aria-label={`${denied} denied`} />}</TabsTrigger>
          <TabsTrigger value="founder">Founder Q&amp;A{count(founderMessages.length)}</TabsTrigger>
          <TabsTrigger value="memory">Memory used{count(memoriesUsed.length)}</TabsTrigger>
          <TabsTrigger value="audit">Audit{count(audit.length)}</TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="timeline">
        {checkpoints.length ? (
          <div className="max-h-[28rem] overflow-y-auto">
            <Table data-testid="timeline-table">
              <TableHeader><TableRow><TableHead className="w-12">Seq</TableHead><TableHead>Step</TableHead><TableHead className="text-right">Duration</TableHead><TableHead className="text-right">Cumulative tokens</TableHead><TableHead className="text-right">At</TableHead></TableRow></TableHeader>
              <TableBody>
                {checkpoints.map((c) => {
                  const next = snapshotStatus(c.state);
                  const tokens = snapshotTokens(c.state);
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono text-xs tabular-nums text-muted-foreground">{c.seq}</TableCell>
                      <TableCell>
                        <span className="font-medium">{c.node.replace(/_/g, " ")}</span>
                        {next && next !== c.node && <span className="text-muted-foreground"> → {next.replace(/_/g, " ")}</span>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{ms(c.duration_ms)}</TableCell>
                      <TableCell className="text-right tabular-nums">{tokens === null ? "—" : tokens.toLocaleString("en-US")}</TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground" suppressHydrationWarning>{new Date(c.created_at).toLocaleTimeString()}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        ) : <Empty text="No checkpoints yet." />}
      </TabsContent>

      <TabsContent value="plan" className="space-y-4">
        {run.state.triage && (
          <div className="rounded-md border bg-muted/40 p-3 text-sm">
            <span className="font-medium">Triage:</span> {run.state.triage.fast_pass ? <Badge variant="secondary">fast-pass</Badge> : <Badge variant="outline">full review</Badge>} <span className="text-muted-foreground">{run.state.triage.reason}</span>
            {run.state.prescan && run.state.prescan.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                <span className="text-xs text-muted-foreground">Prescan flags:</span>
                {run.state.prescan.map((f) => <Badge key={f.code} variant="outline" className={cn("font-mono", f.severity === "high" && "border-destructive/40 text-destructive")}>{f.code}</Badge>)}
              </div>
            )}
          </div>
        )}
        {run.plan ? (
          <>
            <p className="text-sm"><span className="font-medium">Rationale:</span> <span className="text-muted-foreground">{run.plan.rationale}</span></p>
            <Table data-testid="plan-table">
              <TableHeader><TableRow><TableHead>Shark</TableHead><TableHead>Question</TableHead><TableHead className="text-right">Tool budget</TableHead></TableRow></TableHeader>
              <TableBody>
                {run.plan.sharks.map((a) => (
                  <TableRow key={a}>
                    <TableCell className="font-medium">{label(a)}{run.state.rerun?.includes(a) && <Badge variant="outline" className="ml-2">rerun</Badge>}</TableCell>
                    <TableCell className="whitespace-normal text-muted-foreground">{run.plan!.questions[a] ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{run.plan!.tool_budget[a] ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        ) : <Empty text={run.state.triage?.fast_pass ? "No plan — the Lead Shark fast-passed this pitch at triage." : "The Lead Shark hasn't planned yet."} />}
      </TabsContent>

      <TabsContent value="agents">
        {agentCalls.length ? (
          <div className="max-h-[28rem] overflow-y-auto">
            <Table data-testid="agent-calls-table">
              <TableHeader><TableRow><TableHead>Agent</TableHead><TableHead>Purpose</TableHead><TableHead className="text-right">Attempt</TableHead><TableHead>Model</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Tokens in / out</TableHead><TableHead className="text-right">Cost</TableHead><TableHead className="text-right">Latency</TableHead></TableRow></TableHeader>
              <TableBody>
                {agentCalls.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{label(c.agent)}</TableCell>
                    <TableCell className="text-muted-foreground">{c.purpose}</TableCell>
                    <TableCell className="text-right tabular-nums">{c.attempt}</TableCell>
                    <TableCell className="font-mono text-xs">{c.model}{c.fallback_used && <Badge variant="outline" className="ml-1.5 border-warning/50 bg-warning/15 text-foreground">fallback</Badge>}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={CALL_TONE[c.status]} title={c.error ?? undefined}>{c.status.replace(/_/g, " ")}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{c.input_tokens.toLocaleString("en-US")} / {c.output_tokens.toLocaleString("en-US")}</TableCell>
                    <TableCell className="text-right tabular-nums">${c.cost_usd.toFixed(4)}</TableCell>
                    <TableCell className="text-right tabular-nums">{ms(c.latency_ms)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : <Empty text="No agent calls yet." />}
      </TabsContent>

      <TabsContent value="tools">
        {toolCalls.length ? (
          <div className="max-h-[28rem] overflow-y-auto">
            <Table data-testid="tool-calls-table">
              <TableHeader><TableRow><TableHead>Agent</TableHead><TableHead>Tool</TableHead><TableHead>Args</TableHead><TableHead>Permitted</TableHead><TableHead className="text-right">Latency</TableHead><TableHead>Result</TableHead></TableRow></TableHeader>
              <TableBody>
                {toolCalls.map((t) => (
                  <TableRow key={t.id} className={cn(!t.permitted && "bg-destructive/10 hover:bg-destructive/15")} data-denied={!t.permitted || undefined}>
                    <TableCell className="font-medium">{label(t.agent)}</TableCell>
                    <TableCell className="font-mono text-xs">{t.tool}</TableCell>
                    <TableCell><Json value={t.args} trigger={preview(t.args)} /></TableCell>
                    <TableCell>{t.permitted ? <span className="text-success" aria-label="permitted">✓</span> : <Badge variant="destructive">✗ denied</Badge>}</TableCell>
                    <TableCell className="text-right tabular-nums">{ms(t.latency_ms)}</TableCell>
                    <TableCell><Json value={t.result} trigger={preview(t.result)} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : <Empty text="No tool calls yet." />}
      </TabsContent>

      <TabsContent value="founder">
        {awaitingFounder || founderMessages.length ? (
          <FounderPanel runId={run.id} messages={founderMessages} awaiting={awaitingFounder} mock={mock} />
        ) : <Empty text="The Lead Shark hasn't asked the founder anything on this run." />}
      </TabsContent>

      <TabsContent value="memory">
        {memoriesUsed.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" data-testid="memory-used">
            {memoriesUsed.map((m) => (
              <div key={m.id} className="space-y-1">
                <Badge variant="outline" className="capitalize">{m.scope} memory</Badge>
                <MemoryCard memory={m} />
              </div>
            ))}
          </div>
        ) : <Empty text="No memories were read on this run." />}
      </TabsContent>

      <TabsContent value="audit">
        <div className="max-h-[28rem] overflow-y-auto">
          <AuditTable rows={audit} users={users} />
        </div>
      </TabsContent>
    </Tabs>
  );
}
