import type { AuditFilter, AuditRow, User } from "@/lib/types";

/** Audit page / CSV filters (SPEC §5.7), parsed from URL search params. Unknown or malformed values are ignored. */

export const AUDIT_PAGE_SIZE = 50;
export const AUDIT_ROLES = ["analyst", "partner", "general_partner", "system"] as const;
export const CSV_HEADER = "created_at,actor,role,action,entity,entity_id,details";

type Params = Record<string, string | string[] | undefined>;
export type AuditQuery = { actor?: string; role?: string; action?: string; from?: string; to?: string };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (s: string | undefined): s is string => !!s && DATE.test(s) && !Number.isNaN(new Date(`${s}T00:00:00.000Z`).getTime());

/** The normalized, validated filter fields (also used to rebuild links). */
export function parseAuditQuery(sp: Params, users: User[]): AuditQuery {
  const q: AuditQuery = {};
  const actor = first(sp.actor);
  if (actor && users.some((u) => u.id === actor)) q.actor = actor;
  const role = first(sp.role);
  if (role && (AUDIT_ROLES as readonly string[]).includes(role)) q.role = role;
  const action = first(sp.action)?.trim().slice(0, 100);
  if (action) q.action = action;
  const from = first(sp.from);
  if (validDate(from)) q.from = from;
  const to = first(sp.to);
  if (validDate(to)) q.to = to;
  return q;
}

/** Dates are UTC days: `from` starts at 00:00Z, `to` is inclusive of that day (exclusive bound = next day 00:00Z). */
export function auditFilterFromQuery(q: AuditQuery, page: { limit: number; offset: number }): AuditFilter {
  const next = q.to ? new Date(new Date(`${q.to}T00:00:00.000Z`).getTime() + 86400e3).toISOString() : undefined;
  return {
    ...(q.actor ? { actorId: q.actor } : {}), ...(q.role ? { role: q.role } : {}), ...(q.action ? { actionContains: q.action } : {}),
    ...(q.from ? { from: `${q.from}T00:00:00.000Z` } : {}), ...(next ? { to: next } : {}), ...page,
  };
}

export function parsePage(sp: Params): number {
  const n = Number.parseInt(first(sp.page) ?? "1", 10);
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 100000) : 1;
}

export function auditSearchString(q: AuditQuery, extra: Record<string, string> = {}): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...q, ...extra })) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** RFC 4180 field: quoted when it contains a comma, quote, CR or LF; quotes doubled. */
export function csvField(v: string): string {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function auditCsv(rows: AuditRow[], users: User[]): string {
  const name = new Map(users.map((u) => [u.id, u.name]));
  const lines = rows.map((r) =>
    [r.created_at, r.actor_id ? (name.get(r.actor_id) ?? r.actor_id) : "System", r.actor_role, r.action, r.entity, r.entity_id ?? "", JSON.stringify(r.details)].map(csvField).join(","),
  );
  return [CSV_HEADER, ...lines].join("\r\n") + "\r\n";
}
