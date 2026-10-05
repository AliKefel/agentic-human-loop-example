import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Guardrail: a "use client" file ships to the browser, together with everything it imports.
 * Importing the tool executor (it pulls in the confidential PORTFOLIO), the repo, or server-only
 * helpers from a client component would leak data or break the build. Use the data-free modules
 * instead: @/lib/tools/catalog, @/lib/harness/config-constants, and `import type` for types.
 */
const ROOTS = ["components", "app"];
const FORBIDDEN: Array<[RegExp, string]> = [
  [/from\s+["']@\/lib\/tools["']/, "@/lib/tools (use @/lib/tools/catalog)"],
  [/from\s+["']@\/lib\/tools\/data["']/, "@/lib/tools/data"],
  [/from\s+["']@\/lib\/harness\/config["']/, "@/lib/harness/config (use @/lib/harness/config-constants)"],
  [/from\s+["']@\/lib\/harness\/repo(-[a-z]+)?["']/, "@/lib/harness/repo*"],
  [/from\s+["']@\/lib\/supabase\/server["']/, "@/lib/supabase/server"],
  [/from\s+["']@\/lib\/current-user["']/, "@/lib/current-user"],
  [/["']server-only["']/, "server-only"],
];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return walk(p);
    return /\.(ts|tsx)$/.test(name) ? [p] : [];
  });
}

/** Value imports only: `import type { X } from "..."` is erased at compile time and is allowed. */
const valueImports = (src: string) => src.split("\n").filter((l) => /^\s*(import|export)\b/.test(l) && !/^\s*(import|export)\s+type\b/.test(l)).join("\n");

describe("client boundary", () => {
  const clientFiles = ROOTS.flatMap(walk).filter((f) => /^\s*["']use client["']/.test(readFileSync(f, "utf8")));

  it("finds the client components", () => {
    expect(clientFiles.length).toBeGreaterThan(5);
  });

  it("no \"use client\" file imports server-only or data-bearing modules", () => {
    const violations = clientFiles.flatMap((f) => {
      const src = valueImports(readFileSync(f, "utf8"));
      return FORBIDDEN.filter(([re]) => re.test(src)).map(([, what]) => `${f} imports ${what}`);
    });
    expect(violations).toEqual([]);
  });
});
