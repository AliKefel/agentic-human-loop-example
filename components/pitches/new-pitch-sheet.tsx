"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { createPitch } from "@/app/actions/pitches";
import { NewPitchSchema } from "@/lib/pitch-form";

const TEXT = ["company", "tagline", "founder"] as const;
const NUM = [
  ["ask_amount", "Ask ($)"], ["equity_offered", "Equity offered (%)"], ["revenue", "Annual revenue ($)"], ["growth_pct", "Growth (%)"], ["monthly_burn", "Monthly burn ($)"],
] as const;

export function NewPitchSheet({ sectors }: { sectors: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sector, setSector] = useState("");
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const raw: Record<string, unknown> = { sector, pitch_text: f.get("pitch_text") };
    for (const k of TEXT) raw[k] = f.get(k);
    for (const [k] of NUM) { const v = String(f.get(k) ?? "").trim(); raw[k] = v === "" ? undefined : Number(v); }
    const parsed = NewPitchSchema.safeParse(raw);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const i of parsed.error.issues) errs[String(i.path[0])] ??= i.message;
      setErrors(errs);
      return;
    }
    setErrors({});
    start(async () => {
      const res = await createPitch(parsed.data);
      if (!res.ok) { toast.error(res.error); return; }
      toast.success(`${parsed.data.company} added`);
      setOpen(false);
      setSector("");
      router.refresh();
    });
  }

  const err = (k: string) => errors[k] && <p className="text-xs text-destructive">{errors[k]}</p>;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild><Button><Plus /> New pitch</Button></SheetTrigger>
      <SheetContent className="overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>New pitch</SheetTitle>
          <SheetDescription>Add a pitch to the library.</SheetDescription>
        </SheetHeader>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4 px-4">
          {TEXT.map((k) => (
            <div key={k} className="space-y-1.5">
              <Label htmlFor={k} className="capitalize">{k}</Label>
              <Input id={k} name={k} aria-invalid={!!errors[k]} />
              {err(k)}
            </div>
          ))}
          <div className="space-y-1.5">
            <Label htmlFor="sector">Sector</Label>
            <Select value={sector} onValueChange={setSector}>
              <SelectTrigger id="sector" className="w-full" aria-invalid={!!errors.sector}><SelectValue placeholder="Select a sector" /></SelectTrigger>
              <SelectContent>{sectors.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
            {err("sector")}
          </div>
          {NUM.map(([k, label]) => (
            <div key={k} className="space-y-1.5">
              <Label htmlFor={k}>{label}</Label>
              <Input id={k} name={k} type="number" step="any" aria-invalid={!!errors[k]} />
              {err(k)}
            </div>
          ))}
          <div className="space-y-1.5">
            <Label htmlFor="pitch_text">Pitch text</Label>
            <Textarea id="pitch_text" name="pitch_text" rows={6} aria-invalid={!!errors.pitch_text} />
            {err("pitch_text")}
          </div>
          <SheetFooter className="px-0">
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Add pitch"}</Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
