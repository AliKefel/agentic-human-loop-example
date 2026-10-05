const trim = (n: number) => n.toFixed(1).replace(/\.0$/, "");
export function money(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e6) return `$${trim(n / 1e6)}M`;
  if (a >= 1e3) return `$${trim(n / 1e3)}K`;
  return `$${Math.round(n)}`;
}
export const pct = (n: number) => `${trim(n)}%`;
export function duration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const p2 = (x: number) => String(x).padStart(2, "0");
  if (s >= 3600) return `${Math.floor(s / 3600)}h ${p2(Math.floor((s % 3600) / 60))}m`;
  if (s >= 60) return `${Math.floor(s / 60)}m ${p2(s % 60)}s`;
  return `${s}s`;
}
export const usd = (n: number) => `$${n.toFixed(4)}`;
