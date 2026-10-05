"use client";

import { Lock, TriangleAlert } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TOOL_DATA_SCOPE, TOOL_NAMES } from "@/lib/tools/catalog";
import { CONFIG_AGENTS, DATA_SCOPES } from "@/lib/harness/config-constants";
import type { ConfigDraft } from "@/lib/types";
import { cn } from "cn";

type Perms = ConfigDraft["permissions"];
type Kind = "tools" | "data";

const AGENT_LABEL: Record<string, string> = { lead: "Lead Shark", market: "Market Shark", finance: "Finance Shark", product: "Product Shark", skeptic: "Skeptic Shark" };
const TOOL_LABEL: Record<string, string> = { market_size_lookup: "Market size", valuation_calculator: "Valuation", comparable_deals_search: "Comparable deals", red_flag_scanner: "Red-flag scan", portfolio_lookup: "Portfolio" };

/** Agents × (5 tools + 6 data scopes), a Switch per cell (SPEC §2.6). A tool runs only if its data scope is also granted. */
export function PermissionMatrix({ value, onChange, disabled }: { value: Perms; onChange: (p: Perms) => void; disabled?: boolean }) {
  const has = (agent: string, kind: Kind, key: string) => !!value[agent]?.[kind].includes(key);
  const toggle = (agent: string, kind: Kind, key: string, on: boolean) => {
    const cur = value[agent] ?? { tools: [], data: [] };
    const list = on ? [...cur[kind].filter((k) => k !== key), key] : cur[kind].filter((k) => k !== key);
    onChange({ ...value, [agent]: { ...cur, [kind]: list } });
  };
  const header = (label: string, sub: string, confidential = false) => (
    <div className={cn("flex flex-col items-center gap-0.5 text-center leading-tight", confidential && "text-warning")}>
      <span className="flex items-center gap-1 whitespace-nowrap">{confidential && <Lock className="size-3" aria-hidden />}{label}</span>
      <span className="text-[10px] font-normal text-muted-foreground">{confidential ? "confidential" : sub}</span>
    </div>
  );

  return (
    <div className="space-y-2" data-testid="permission-matrix">
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead rowSpan={2} className="align-bottom">Agent</TableHead>
              <TableHead colSpan={TOOL_NAMES.length} className="border-l text-center">Tools</TableHead>
              <TableHead colSpan={DATA_SCOPES.length} className="border-l text-center">Data scopes</TableHead>
            </TableRow>
            <TableRow className="hover:bg-transparent">
              {TOOL_NAMES.map((t, i) => (
                <TableHead key={t} className={cn("h-auto py-2", i === 0 && "border-l")}>{header(TOOL_LABEL[t] ?? t, `needs ${TOOL_DATA_SCOPE[t]}`, TOOL_DATA_SCOPE[t] === "portfolio")}</TableHead>
              ))}
              {DATA_SCOPES.map((s, i) => (
                <TableHead key={s} className={cn("h-auto py-2", i === 0 && "border-l")}>{header(s, "scope", s === "portfolio")}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {CONFIG_AGENTS.map((agent) => (
              <TableRow key={agent}>
                <TableCell className="whitespace-nowrap font-medium">{AGENT_LABEL[agent] ?? agent}</TableCell>
                {TOOL_NAMES.map((t, i) => {
                  const on = has(agent, "tools", t);
                  const scope = TOOL_DATA_SCOPE[t];
                  const orphan = on && !has(agent, "data", scope);
                  return (
                    <TableCell key={t} className={cn("text-center", i === 0 && "border-l", scope === "portfolio" && "bg-warning/5")}>
                      <div className="flex items-center justify-center gap-1">
                        <Switch checked={on} disabled={disabled} onCheckedChange={(c) => toggle(agent, "tools", t, c)} aria-label={`${AGENT_LABEL[agent]} may use ${t}`} data-testid={`perm-${agent}-tool-${t}`} />
                        {orphan && (
                          <Tooltip>
                            <TooltipTrigger asChild><TriangleAlert className="size-3.5 text-warning" aria-label="missing data scope" /></TooltipTrigger>
                            <TooltipContent>Needs the “{scope}” data scope too — without it every call is denied.</TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </TableCell>
                  );
                })}
                {DATA_SCOPES.map((s, i) => (
                  <TableCell key={s} className={cn("text-center", i === 0 && "border-l", s === "portfolio" && "bg-warning/5")}>
                    <Switch checked={has(agent, "data", s)} disabled={disabled} onCheckedChange={(c) => toggle(agent, "data", s, c)} aria-label={`${AGENT_LABEL[agent]} may see ${s} data`} data-testid={`perm-${agent}-data-${s}`} />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">
        Checked by the harness before every tool call: a tool runs only when both the tool and its data scope are granted. Denied calls are not executed and are audited as <code className="font-mono">tool.denied</code>.
      </p>
    </div>
  );
}
