import { Construction } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function MilestonePlaceholder({ milestone, title, specSection, bullets }: { milestone: string; title: string; specSection: string; bullets: string[] }) {
  return (
    <Card className="border-dashed">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Construction className="size-5 text-muted-foreground" />
          <CardTitle>{title}</CardTitle>
          <Badge variant="secondary">{milestone}</Badge>
        </div>
        <CardDescription>Not built yet. See docs/SPEC.md {specSection}.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {bullets.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
