import type { LucideIcon } from "lucide-react";
import { Calculator, Crown, Merge, Package, Scale, ShieldAlert, TrendingUp, UserCheck } from "lucide-react";
import { cn } from "cn";
import type { GraphNodeId, GraphState, NodeState } from "@/lib/run-view";

type NodeDef = { id: GraphNodeId; label: string; x: number; y: number; r: number; icon: LucideIcon };

const MID = 123;
const SHARK_Y = [30, 92, 154, 216];
const NODES: NodeDef[] = [
  { id: "lead", label: "Lead Shark", x: 70, y: MID, r: 26, icon: Crown },
  { id: "market", label: "Market", x: 300, y: SHARK_Y[0], r: 18, icon: TrendingUp },
  { id: "finance", label: "Finance", x: 300, y: SHARK_Y[1], r: 18, icon: Calculator },
  { id: "product", label: "Product", x: 300, y: SHARK_Y[2], r: 18, icon: Package },
  { id: "skeptic", label: "Skeptic", x: 300, y: SHARK_Y[3], r: 18, icon: ShieldAlert },
  { id: "synthesis", label: "Synthesis", x: 470, y: MID, r: 24, icon: Merge },
  { id: "policy", label: "Policy", x: 572, y: MID, r: 24, icon: Scale },
  { id: "human", label: "Human", x: 668, y: MID, r: 24, icon: UserCheck },
];
const byId = Object.fromEntries(NODES.map((n) => [n.id, n])) as Record<GraphNodeId, NodeDef>;
const EDGES: [GraphNodeId, GraphNodeId][] = [
  ["lead", "market"], ["lead", "finance"], ["lead", "product"], ["lead", "skeptic"],
  ["market", "synthesis"], ["finance", "synthesis"], ["product", "synthesis"], ["skeptic", "synthesis"],
  ["synthesis", "policy"], ["policy", "human"],
];

const STATE_LABEL: Record<NodeState, string> = { idle: "idle", running: "running", ok: "done", failed: "failed", skipped: "skipped", waiting: "waiting" };

const NODE_CLASS: Record<NodeState, { circle: string; icon: string }> = {
  idle: { circle: "fill-card stroke-border", icon: "text-muted-foreground" },
  running: { circle: "fill-primary/15 stroke-primary", icon: "text-primary" },
  ok: { circle: "fill-success/15 stroke-success", icon: "text-success" },
  failed: { circle: "fill-destructive/15 stroke-destructive", icon: "text-destructive" },
  skipped: { circle: "fill-muted stroke-muted-foreground/60", icon: "text-muted-foreground/70" },
  waiting: { circle: "fill-warning/20 stroke-warning", icon: "text-warning" },
};
const EDGE_CLASS: Record<NodeState, string> = {
  idle: "stroke-border",
  running: "stroke-primary",
  ok: "stroke-success/60",
  failed: "stroke-destructive/60",
  skipped: "stroke-muted-foreground/40",
  waiting: "stroke-warning",
};

function edgePath(a: NodeDef, b: NodeDef): string {
  const x1 = a.x + a.r, y1 = a.y, x2 = b.x - b.r, y2 = b.y;
  const dx = (x2 - x1) / 2;
  return `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;
}

/** Live agent graph (SPEC §5.3): Lead → 4 Sharks → Synthesis → Policy → Human. Edge color follows its target node; an edge touching a skipped node is dashed. */
export function AgentGraph({ graph }: { graph: GraphState }) {
  const summary = NODES.map((n) => `${n.label} ${STATE_LABEL[graph[n.id]]}`).join(", ");
  return (
    <div className="space-y-3">
      <svg viewBox="0 0 720 260" className="h-auto w-full" role="img" aria-label={`Agent graph: ${summary}`} data-testid="agent-graph">
        {EDGES.map(([from, to]) => {
          const skipped = graph[to] === "skipped" || graph[from] === "skipped";
          return (
            <path
              key={`${from}-${to}`}
              d={edgePath(byId[from], byId[to])}
              fill="none"
              strokeWidth={graph[to] === "running" ? 2.5 : 1.75}
              strokeDasharray={skipped ? "5 5" : undefined}
              className={cn(EDGE_CLASS[skipped ? "skipped" : graph[to]], graph[to] === "running" && "animate-pulse")}
            />
          );
        })}
        {NODES.map((n) => {
          const st = graph[n.id];
          const Icon = n.icon;
          const big = n.r > 20;
          const iconSize = big ? 22 : 16;
          return (
            <g key={n.id} className={cn(st === "running" && "animate-pulse", st === "skipped" && "opacity-70")} data-node={n.id} data-state={st}>
              <title>{`${n.label}: ${STATE_LABEL[st]}`}</title>
              {(st === "running" || st === "waiting") && (
                <circle cx={n.x} cy={n.y} r={n.r + 6} fill="none" strokeWidth={1.5} className={st === "running" ? "stroke-primary/40" : "stroke-warning/50"} />
              )}
              <circle
                cx={n.x}
                cy={n.y}
                r={n.r}
                strokeWidth={st === "idle" ? 1.5 : 2.5}
                strokeDasharray={st === "skipped" ? "4 3" : undefined}
                className={NODE_CLASS[st].circle}
              />
              <Icon x={n.x - iconSize / 2} y={n.y - iconSize / 2} width={iconSize} height={iconSize} strokeWidth={2} className={NODE_CLASS[st].icon} aria-hidden />
              <text x={n.x} y={n.y + n.r + 14} textAnchor="middle" className="fill-foreground text-[11px] font-medium">
                {n.label}
              </text>
              {big && (
                <text x={n.x} y={n.y + n.r + 27} textAnchor="middle" className="fill-muted-foreground text-[10px]">
                  {STATE_LABEL[st]}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Legend">
        {(["idle", "running", "ok", "failed", "skipped", "waiting"] as NodeState[]).map((s) => (
          <li key={s} className="flex items-center gap-1.5">
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
              <circle cx="7" cy="7" r="5.5" strokeWidth={1.75} strokeDasharray={s === "skipped" ? "2.5 2" : undefined} className={NODE_CLASS[s].circle} />
            </svg>
            {STATE_LABEL[s]}
          </li>
        ))}
      </ul>
    </div>
  );
}
