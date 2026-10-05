import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { IncidentRow } from "@/lib/types";

/** sev1 destructive · sev2 warning · sev3 secondary. */
export function SeverityBadge({ severity, className }: { severity: IncidentRow["severity"]; className?: string }) {
  if (severity === "sev1") return <Badge variant="destructive" className={className}>SEV1</Badge>;
  if (severity === "sev2") return <Badge variant="outline" className={cn("border-warning/40 bg-warning/15 text-warning", className)}>SEV2</Badge>;
  return <Badge variant="secondary" className={className}>SEV3</Badge>;
}
