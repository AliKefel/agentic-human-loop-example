import { Clock, DollarSign, Inbox, Presentation } from "lucide-react";
import { MilestonePlaceholder } from "@/components/milestone-placeholder";
import { KpiTile } from "@/components/kpi-tile";
import { ExampleChart } from "@/components/charts/example-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Page() {
  return (
    <div className="space-y-6">
      <MilestonePlaceholder milestone="M9" title="Fund Overview dashboard" specSection="§5.1" bullets={["8 KPI tiles", "8 charts", "Live activity feed"]} />
      <div>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">Example KPI tiles (static)</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiTile label="Pitches reviewed" value="12" sub="all time" trend="up" icon={Presentation} />
          <KpiTile label="Capital committed" value="$1.2M" sub="of $10M fund" trend="flat" icon={DollarSign} />
          <KpiTile label="Pending approvals" value="3" sub="oldest 2h" trend="down" icon={Inbox} />
          <KpiTile label="Avg time to decision" value="4.2 min" sub="last 7 days" icon={Clock} />
        </div>
      </div>
      <Card>
        <CardHeader><CardTitle>Example chart: shark latency</CardTitle></CardHeader>
        <CardContent><ExampleChart /></CardContent>
      </Card>
    </div>
  );
}
