/** Field-level diff between two harness configs (SPEC §5.6). PURE, client-safe. */
import type { HarnessConfig } from "@/lib/types";

export type DiffEntry = { path: string; before: unknown; after: unknown };

const IGNORED = new Set(["id", "version", "created_at", "is_active", "created_by"]);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Value equality (arrays by contents, objects by keys). */
export function sameValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => sameValue(x, b[i]));
  if (isObj(a) && isObj(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    return [...keys].every((k) => sameValue(a[k], b[k]));
  }
  return Object.is(a, b) || (a == null && b == null);
}

function walk(a: unknown, b: unknown, path: string, out: DiffEntry[]) {
  if (isObj(a) && isObj(b)) {
    const keys = [...Object.keys(a), ...Object.keys(b).filter((k) => !(k in a))];
    for (const k of keys) {
      if (!path && IGNORED.has(k)) continue;
      walk(a[k], b[k], path ? `${path}.${k}` : k, out);
    }
    return;
  }
  // Leaves, arrays (one entry for the whole array) and added / removed subtrees.
  if (!sameValue(a, b)) out.push({ path, before: a, after: b });
}

/** Deep diff with dotted paths, in `a`'s key order then keys only in `b`. Ignores id/version/created_at/is_active/created_by. */
export function diffConfigs(a: HarnessConfig, b: HarnessConfig): DiffEntry[] {
  const out: DiffEntry[] = [];
  walk(a, b, "", out);
  return out;
}
