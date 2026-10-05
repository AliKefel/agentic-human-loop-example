import Link from "next/link";
import { Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { EnterTankDialog } from "@/components/pitches/enter-tank-dialog";
import { money, pct } from "@/lib/format";
import type { Pitch, Run } from "@/lib/types";

export function PitchCard({ pitch, lastRun, defaultLevel, maxTokens, maxUsd }: { pitch: Pitch; lastRun?: Pick<Run, "id" | "status">; defaultLevel: number; maxTokens: number; maxUsd: number }) {
  const valuation = pitch.ask_amount / (pitch.equity_offered / 100);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {pitch.company}
          {pitch.chaos.hint && (
            <Tooltip>
              <TooltipTrigger asChild><Zap aria-label="Chaos hint" className="size-4 text-amber-500" /></TooltipTrigger>
              <TooltipContent>{pitch.chaos.hint}</TooltipContent>
            </Tooltip>
          )}
        </CardTitle>
        <CardDescription>{pitch.tagline}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">{pitch.founder}</span>
          <Badge variant="secondary">{pitch.sector}</Badge>
        </div>
        <dl className="grid grid-cols-3 gap-2">
          <div><dt className="text-xs text-muted-foreground">Ask</dt><dd className="font-medium">{money(pitch.ask_amount)}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Equity</dt><dd className="font-medium">{pct(pitch.equity_offered)}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Implied val.</dt><dd className="font-medium">{money(valuation)}</dd></div>
        </dl>
      </CardContent>
      <CardFooter className="justify-between">
        {lastRun ? (
          <Link href={`/runs/${lastRun.id}`}><Badge variant="outline">Last run: {lastRun.status.replace(/_/g, " ")}</Badge></Link>
        ) : <span className="text-xs text-muted-foreground">No runs yet</span>}
        <EnterTankDialog pitchId={pitch.id} company={pitch.company} defaultLevel={defaultLevel} maxTokens={maxTokens} maxUsd={maxUsd} />
      </CardFooter>
    </Card>
  );
}
