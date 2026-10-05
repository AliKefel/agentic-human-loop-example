import { getRepo } from "@/lib/harness/repo";
import { listUsers } from "@/lib/current-user";
import { auditCsv, auditFilterFromQuery, parseAuditQuery } from "@/lib/harness/audit-query";
import type { AuditRow } from "@/lib/types";

export const dynamic = "force-dynamic";
const CHUNK = 1000;
const MAX_ROWS = 20000;

/** CSV export of the audit log with the same filters as /audit (no pagination). */
export async function GET(req: Request) {
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const users = await listUsers();
  const q = parseAuditQuery(sp, users);
  const repo = getRepo();
  const rows: AuditRow[] = [];
  while (rows.length < MAX_ROWS) {
    const chunk = await repo.listAudit(auditFilterFromQuery(q, { limit: CHUNK, offset: rows.length }));
    rows.push(...chunk);
    if (chunk.length < CHUNK) break;
  }
  return new Response(auditCsv(rows, users), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="audit-log.csv"', "cache-control": "no-store" },
  });
}
