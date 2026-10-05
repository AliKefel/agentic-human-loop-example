"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { money } from "@/lib/format";

export const AUTONOMY_LABELS = ["L0 · Human decides", "L1 · AI recommends", "L2 · AI acts within limits", "L3 · AI acts, human audits"];

export function EnterTankDialog({ pitchId, company, defaultLevel, maxTokens, maxUsd }: { pitchId: string; company: string; defaultLevel: number; maxTokens: number; maxUsd: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [level, setLevel] = useState(String(defaultLevel));
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true);
    try {
      const res = await fetch("/api/runs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pitchId, autonomyLevel: Number(level) }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.id) throw new Error(body.error ?? `Request failed (${res.status})`);
      setOpen(false);
      router.push(`/runs/${body.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start run");
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm">Enter the Tank</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enter the Tank: {company}</DialogTitle>
          <DialogDescription>The sharks will evaluate this pitch under the active harness configuration.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor={`autonomy-${pitchId}`}>Autonomy level</Label>
          <Select value={level} onValueChange={setLevel}>
            <SelectTrigger id={`autonomy-${pitchId}`} className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {AUTONOMY_LABELS.map((l, i) => <SelectItem key={i} value={String(i)}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <p className="text-sm text-muted-foreground">Budget caps: {maxTokens.toLocaleString()} tokens · {money(maxUsd)} spend</p>
        <DialogFooter>
          <Button onClick={start} disabled={busy}>{busy ? "Starting…" : "Start run"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
