import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AuditTable } from "@/components/audit/audit-table";
import { getRepo } from "@/lib/harness/repo";
import { listUsers } from "@/lib/current-user";
import { AUDIT_PAGE_SIZE, AUDIT_ROLES, auditFilterFromQuery, auditSearchString, parseAuditQuery, parsePage } from "@/lib/harness/audit-query";

export const dynamic = "force-dynamic";

/** Audit log (SPEC §5.7): filters via searchParams, 50 per page, newest first, CSV export. */
export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const users = await listUsers();
  const q = parseAuditQuery(sp, users);
  const page = parsePage(sp);
  const rows = await getRepo().listAudit(auditFilterFromQuery(q, { limit: AUDIT_PAGE_SIZE + 1, offset: (page - 1) * AUDIT_PAGE_SIZE }));
  const hasNext = rows.length > AUDIT_PAGE_SIZE;
  const shown = rows.slice(0, AUDIT_PAGE_SIZE);
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Audit log</CardTitle>
        <Button asChild variant="outline" size="sm"><a href={`/api/audit/export${auditSearchString(q)}`} download>Export CSV</a></Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="audit-actor">Actor</Label>
            <Select name="actor" defaultValue={q.actor ?? "all"}>
              <SelectTrigger id="audit-actor" className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All actors</SelectItem>
                {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="audit-role">Role</Label>
            <Select name="role" defaultValue={q.role ?? "all"}>
              <SelectTrigger id="audit-role" className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All roles</SelectItem>
                {AUDIT_ROLES.map((r) => <SelectItem key={r} value={r}>{r.replace(/_/g, " ")}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="audit-action">Action contains</Label>
            <Input id="audit-action" name="action" defaultValue={q.action ?? ""} placeholder="approval." className="w-44" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="audit-from">From</Label>
            <Input id="audit-from" type="date" name="from" defaultValue={q.from ?? ""} className="w-40" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="audit-to">To</Label>
            <Input id="audit-to" type="date" name="to" defaultValue={q.to ?? ""} className="w-40" />
          </div>
          <Button type="submit">Apply</Button>
          <Button asChild variant="ghost"><Link href="/audit">Reset</Link></Button>
        </form>
        <AuditTable rows={shown} users={users} />
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Page {page}</span>
          <span className="flex gap-2">
            {page > 1 && <Button asChild variant="outline" size="sm"><Link href={`/audit${auditSearchString(q, { page: String(page - 1) })}`}>Previous</Link></Button>}
            {hasNext && <Button asChild variant="outline" size="sm"><Link href={`/audit${auditSearchString(q, { page: String(page + 1) })}`}>Next</Link></Button>}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
