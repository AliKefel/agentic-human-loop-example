"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Lock, RotateCcw, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AutonomyDial } from "@/components/harness/autonomy-dial";
import { PermissionMatrix } from "@/components/harness/permission-matrix";
import { WhatIf } from "@/components/harness/what-if";
import { ConfigDiffView } from "@/components/harness/config-diff-view";
import { publishConfigAction } from "@/app/actions/harness";
import { diffConfigs } from "@/lib/config-diff";
import type { SimRun } from "@/lib/simulate";
import type { ConfigDraft, HarnessConfig } from "@/lib/types";

type Thresholds = ConfigDraft["thresholds"];
type Budgets = ConfigDraft["budgets"];
type Reliability = ConfigDraft["reliability"];

/** Numeric input that keeps the raw text while typing and only commits finite numbers. */
function NumberField({ id, label, hint, value, onChange, step = 1, disabled, prefix, suffix }: {
  id: string; label: string; hint?: string; value: number; onChange: (n: number) => void; step?: number; disabled?: boolean; prefix?: string; suffix?: string;
}) {
  const [text, setText] = useState(String(value));
  const [seen, setSeen] = useState(value);
  if (value !== seen) { setSeen(value); setText(String(value)); } // external reset
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs">{label}</Label>
      <div className="flex items-center gap-1.5">
        {prefix && <span className="text-sm text-muted-foreground">{prefix}</span>}
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          step={step}
          value={text}
          disabled={disabled}
          className="tabular-nums"
          data-testid={`field-${id}`}
          onChange={(e) => {
            setText(e.target.value);
            const n = e.target.value.trim() === "" ? NaN : Number(e.target.value);
            if (Number.isFinite(n)) { setSeen(n); onChange(n); }
          }}
          onBlur={() => setText(String(value))}
        />
        {suffix && <span className="shrink-0 text-xs text-muted-foreground">{suffix}</span>}
      </div>
      {hint && <p className="text-[11px] leading-snug text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Group({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{children}</CardContent>
    </Card>
  );
}

const asConfig = (base: HarnessConfig, d: ConfigDraft): HarnessConfig => ({ ...base, ...d });

/**
 * Draft editor for the next harness version (SPEC §5.6). Local draft state starts from the active
 * config; the what-if panel re-simulates on every change. Publishing is GP-only and enforced on
 * the server — other roles get a read-only view.
 */
export function ConfigEditor({ active, initialDraft, runs, canPublish }: { active: HarnessConfig; initialDraft: ConfigDraft; runs: SimRun[]; canPublish: boolean }) {
  const router = useRouter();
  const [draft, setDraft] = useState<ConfigDraft>(initialDraft);
  const [pending, start] = useTransition();
  const ro = !canPublish;
  const draftConfig = useMemo(() => asConfig(active, draft), [active, draft]);
  const changes = useMemo(() => diffConfigs(active, draftConfig), [active, draftConfig]);

  const setT = (k: keyof Omit<Thresholds, "sla_hours">) => (n: number) => setDraft((d) => ({ ...d, thresholds: { ...d.thresholds, [k]: n } }));
  const setSla = (k: keyof Thresholds["sla_hours"]) => (n: number) => setDraft((d) => ({ ...d, thresholds: { ...d.thresholds, sla_hours: { ...d.thresholds.sla_hours, [k]: n } } }));
  const setB = (k: keyof Budgets) => (n: number) => setDraft((d) => ({ ...d, budgets: { ...d.budgets, [k]: n } }));
  const setR = <K extends keyof Reliability>(k: K) => (v: Reliability[K]) => setDraft((d) => ({ ...d, reliability: { ...d.reliability, [k]: v } }));
  const t = draft.thresholds;
  const b = draft.budgets;
  const r = draft.reliability;

  const publish = () => start(async () => {
    const res = await publishConfigAction(draft);
    if (!res.ok) { toast.error(res.error); return; }
    toast.success(`Published harness config v${res.version} — new runs use it; existing runs keep their version.`);
    router.refresh();
  });

  const publishButton = (
    <Button onClick={publish} disabled={ro || pending || changes.length === 0} data-testid="publish-config">
      {ro ? <Lock className="size-4" aria-hidden /> : <Upload className="size-4" aria-hidden />}
      {pending ? "Publishing…" : `Publish v${active.version + 1}`}
    </Button>
  );

  return (
    <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_480px]">
      <div className="min-w-0 space-y-6" data-testid="config-editor">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium">Draft v{active.version + 1}</span>
            <Badge variant={changes.length ? "default" : "outline"} data-testid="draft-change-count">{changes.length} {changes.length === 1 ? "change" : "changes"} vs v{active.version}</Badge>
            {ro && <Badge variant="outline" className="gap-1"><Lock className="size-3" aria-hidden />Read-only</Badge>}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setDraft(initialDraft)} disabled={ro || pending || changes.length === 0}><RotateCcw className="size-4" aria-hidden />Reset</Button>
            {ro ? (
              <Tooltip>
                <TooltipTrigger asChild><span tabIndex={0} className="inline-flex">{publishButton}</span></TooltipTrigger>
                <TooltipContent>Only a General Partner can publish a new harness version. Switch role to Gen GP to edit.</TooltipContent>
              </Tooltip>
            ) : publishButton}
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Autonomy level</CardTitle>
            <CardDescription>The default autonomy for new runs — how much the harness may decide without a human.</CardDescription>
          </CardHeader>
          <CardContent><AutonomyDial value={draft.autonomy_level} onChange={(v) => setDraft((d) => ({ ...d, autonomy_level: v }))} disabled={ro} /></CardContent>
        </Card>

        <Group title="Policy thresholds" description="Limits the policy engine applies (SPEC §2.8).">
          <NumberField id="auto_max_amount" label="Auto-send max amount" prefix="$" step={10000} value={t.auto_max_amount} onChange={setT("auto_max_amount")} disabled={ro} hint="L2: offers at or below this can be sent with no human." />
          <NumberField id="auto_max_equity" label="Auto-send max equity" suffix="%" value={t.auto_max_equity} onChange={setT("auto_max_equity")} disabled={ro} />
          <NumberField id="auto_min_score" label="Auto-send min avg score" suffix="/ 10" step={0.5} value={t.auto_min_score} onChange={setT("auto_min_score")} disabled={ro} />
          <NumberField id="disagreement_spread" label="Disagreement spread" suffix="points" value={t.disagreement_spread} onChange={setT("disagreement_spread")} disabled={ro} hint="Score spread at or above this → exception." />
          <NumberField id="partner_limit" label="Partner approval limit" prefix="$" step={10000} value={t.partner_limit} onChange={setT("partner_limit")} disabled={ro} hint="Above this a General Partner must approve." />
          <NumberField id="fund_max_check" label="Fund max check" prefix="$" step={100000} value={t.fund_max_check} onChange={setT("fund_max_check")} disabled={ro} hint="Asks above this are fast-passed at triage." />
        </Group>

        <Group title="Human SLAs" description="How long each kind of human decision may wait.">
          <NumberField id="sla_approval" label="Approval" suffix="hours" value={t.sla_hours.approval} onChange={setSla("approval")} disabled={ro} />
          <NumberField id="sla_exception" label="Exception" suffix="hours" value={t.sla_hours.exception} onChange={setSla("exception")} disabled={ro} />
          <NumberField id="sla_escalation" label="Escalation" suffix="hours" value={t.sla_hours.escalation} onChange={setSla("escalation")} disabled={ro} />
        </Group>

        <Group title="Budgets" description="Per-run caps checked before every Shark call.">
          <NumberField id="max_tokens" label="Max tokens" step={1000} value={b.max_tokens} onChange={setB("max_tokens")} disabled={ro} />
          <NumberField id="max_usd" label="Max cost" prefix="$" step={0.05} value={b.max_usd} onChange={setB("max_usd")} disabled={ro} />
          <NumberField id="est_tokens_per_shark" label="Est. tokens per Shark" step={100} value={b.est_tokens_per_shark} onChange={setB("est_tokens_per_shark")} disabled={ro} />
          <NumberField id="max_steps" label="Max steps" value={b.max_steps} onChange={setB("max_steps")} disabled={ro} />
          <NumberField id="max_replans" label="Max replans" value={b.max_replans} onChange={setB("max_replans")} disabled={ro} />
        </Group>

        <Group title="Reliability" description="Timeouts, retries and fallback around every Shark call (SPEC §2.7).">
          <NumberField id="timeout_ms" label="Timeout per attempt" suffix="ms" step={1000} value={r.timeout_ms} onChange={setR("timeout_ms")} disabled={ro} hint="1,000 – 120,000 ms" />
          <NumberField id="retries" label="Retries" value={r.retries} onChange={setR("retries")} disabled={ro} hint="0 – 5 retries after the first attempt" />
          <div className="space-y-1.5">
            <Label htmlFor="backoff_ms" className="text-xs">Backoff schedule (ms)</Label>
            <Input id="backoff_ms" defaultValue={r.backoff_ms.join(", ")} key={initialDraft.reliability.backoff_ms.join(",")} disabled={ro}
              onChange={(e) => { const v = e.target.value.split(",").map((x) => Number(x.trim())).filter((x) => Number.isFinite(x) && x >= 0); setR("backoff_ms")(v); }} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="primary_model" className="text-xs">Primary model</Label>
            <Input id="primary_model" value={r.primary_model} onChange={(e) => setR("primary_model")(e.target.value)} disabled={ro} className="font-mono text-xs" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fallback_model" className="text-xs">Fallback model</Label>
            <Input id="fallback_model" value={r.fallback_model} onChange={(e) => setR("fallback_model")(e.target.value)} disabled={ro} className="font-mono text-xs" />
          </div>
        </Group>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Permission matrix</CardTitle>
            <CardDescription>Trust boundaries: what each agent may use (tools) and see (data scopes). The portfolio is the fund’s confidential holdings.</CardDescription>
          </CardHeader>
          <CardContent><PermissionMatrix value={draft.permissions} onChange={(p) => setDraft((d) => ({ ...d, permissions: p }))} disabled={ro} /></CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Release notes</CardTitle>
            <CardDescription>Why this version exists — shown in the version history.</CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea value={draft.notes ?? ""} onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))} disabled={ro} maxLength={2000} placeholder="e.g. Raise L2 auto-send limit to $300K after Q3 review" data-testid="config-notes" />
          </CardContent>
        </Card>
      </div>

      <aside className="min-w-0 space-y-6 2xl:sticky 2xl:top-4 2xl:self-start">
        <WhatIf runs={runs} current={active} draft={draftConfig} />
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pending changes</CardTitle>
            <CardDescription>Draft v{active.version + 1} vs active v{active.version}</CardDescription>
          </CardHeader>
          <CardContent><ConfigDiffView diff={changes} empty="The draft matches the active config." /></CardContent>
        </Card>
      </aside>
    </div>
  );
}
