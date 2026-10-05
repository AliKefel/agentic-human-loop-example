import { Beaker, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function ModeBadge({ mock }: { mock: boolean }) {
  return mock ? (
    <Badge variant="outline"><Beaker /> Mock mode</Badge>
  ) : (
    <Badge><Sparkles /> Live · Claude</Badge>
  );
}
