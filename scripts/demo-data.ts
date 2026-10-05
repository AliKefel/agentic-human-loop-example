/**
 * Demo history for the Fund Overview (M9): `pnpm demo:seed`.
 *
 * Runs every seed pitch at L0, L1, L2 and L3 (48 runs) in Mock mode (fixture latencies kept so the
 * latency chart is real; DEMO_FAST=true sets MOCK_NO_DELAY) through the real harness
 * (createRun + runToRest on SupabaseRepo), resolves the waiting runs with a deterministic human
 * policy, acknowledges one incident and resolves another, then back-dates the run history across
 * the last 14 days so the charts have shape.
 *
 * Human policy (deterministic):
 * - approval   → Gen GP approves (an AI pass is confirmed).
 * - exception  → SnackStack: Pat Partner modifies (equity −2 pts, "Cut equity — thin margins"); a GP
 *                does it when the amount is above Pat's limit. Other exceptions: Pat approves within
 *                his limit, Gen GP above it.
 * - escalation → Gen GP rejects with a reason (an AI pass is confirmed instead: Reject is not offered).
 * - awaiting_founder → the scripted founder reply (answerFounder), then runToRest again.
 * - DroneDrop at L0 is cancelled by Avery Analyst (so "cancelled" shows up), and the 6 most recent
 *   runs keep any pending approval so the review queue has live items.
 *
 * Back-dating: runs.started_at / completed_at, checkpoints / agent_calls / tool_calls /
 * founder_messages created_at, approvals created_at / decided_at / sla_due, incidents created_at /
 * sla_due / resolved_at are rewritten by index with direct SQL (pg + SUPABASE_DB_URL). Human waits
 * come from a fixed list spread over the histogram buckets. audit_log is append-only and keeps its
 * real timestamps.
 *
 * Idempotence: every invocation ADDS 48 runs. For a clean demo database run
 *   pnpm db:reset && pnpm demo:seed
 * Needs NODE_OPTIONS=--conditions=react-server (the package.json script sets it) because the repo
 * modules import "server-only".
 */
import fs from "node:fs";
import pg from "pg";

function loadEnv() {
  const txt = fs.readFileSync(".env.local", "utf8");
  for (const line of txt.split("\n")) {
    const i = line.indexOf("=");
    if (i > 0 && !line.startsWith("#")) process.env[line.slice(0, i).trim()] ??= line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
}

const H = 3_600_000;
const M = 60_000;
/** Human decision waits, cycled in decision order: covers <1m, 1–5m, 5–30m, 30m–2h and >2h. */
const WAITS_MS = [35e3, 3 * M + 20e3, 14 * M, 52 * M, 2 * H + 40 * M, 48e3, 9 * M, 85 * M, 4 * M + 10e3, 22 * M, 3 * H + 50 * M, 65 * M, 25e3, 6 * M + 30e3, 2 * H + 10 * M];
const FOUNDER_WAIT_MS = 3 * H + 15 * M;
const CANCEL_WAIT_MS = 40 * M;
const SPACING_MS = 7 * H; // 48 runs × 7 h ≈ 14 days
const NEWEST_OFFSET_MS = 6 * H;
const KEEP_PENDING_FROM = 42; // date positions 42..47 (the 6 newest runs) keep pending approvals
const RUNS = 48;
const CONCURRENCY = 12;

/** Date position of run i (0 = oldest, 47 = newest); 29 is coprime with 48, so this is a permutation that mixes levels across days. */
const positionOf = (i: number) => (i * 29) % RUNS;

type Pause = { start: number; end: number; dur: number };

async function main() {
  loadEnv();
  // Force Mock mode in-process before any harness module is loaded. Mock latencies stay ON by default:
  // Shark calls record wall-clock latency, so with MOCK_NO_DELAY they would all be ~0 ms and the
  // Shark-latency chart would be meaningless. DEMO_FAST=true skips the delays (quick smoke runs).
  process.env.NEXT_PUBLIC_MOCK_MODE = "true";
  process.env.MOCK_NO_DELAY = process.env.DEMO_FAST === "true" ? "true" : "false";
  if (!process.env.SUPABASE_DB_URL) throw new Error("SUPABASE_DB_URL missing in .env.local");

  const { SupabaseRepo } = await import("@/lib/harness/repo-supabase");
  const { createRun, cancelRun } = await import("@/lib/harness/runs");
  const { runToRest } = await import("@/lib/harness/machine");
  const { decideApproval } = await import("@/lib/harness/approvals");
  const { answerFounder } = await import("@/lib/harness/founder");
  const { setIncidentStatus } = await import("@/lib/harness/incidents");
  const { SCRIPTED_FOUNDER_REPLY } = await import("@/lib/mock/fixtures");
  const { SEED_PITCHES } = await import("@/lib/mock/seed-pitches");
  const { SEED_USERS, ANALYST_ID, PARTNER_ID, GP_ID } = await import("@/lib/mock/seed-users");
  const { loadFundStats } = await import("@/lib/stats-server");
  const { WAITING } = await import("@/lib/types");

  const repo = new SupabaseRepo();
  const user = (id: string) => SEED_USERS.find((u) => u.id === id)!;
  const [avery, pat, gp] = [user(ANALYST_ID), user(PARTNER_ID), user(GP_ID)];
  const starters = [avery, pat, gp];

  // ── 1. 48 runs: run i = level * 12 + pitch index. ──
  const pitches = await Promise.all(SEED_PITCHES.map((p) => repo.getPitchBySlug(p.slug)));
  const plan = Array.from({ length: RUNS }, (_, i) => ({ i, level: Math.floor(i / 12) as 0 | 1 | 2 | 3, pitch: pitches[i % 12] }));
  const runIds: string[] = new Array(RUNS);
  console.log(`Running ${RUNS} runs in Mock mode (concurrency ${CONCURRENCY})…`);
  let next = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (next < RUNS) {
      const { i, level, pitch } = plan[next++];
      const run = await createRun(repo, { pitchId: pitch.id, autonomyLevel: level, user: starters[i % 3] });
      runIds[i] = run.id;
      const done = await runToRest(repo, run.id);
      console.log(`  #${String(i).padStart(2)} L${level} ${pitch.slug.padEnd(11)} → ${done.status}`);
    }
  }));

  // ── 2. Resolve waiting runs deterministically (run order, decision counter k). ──
  const waitFor = new Map<string, number>(); // approval id → wait ms
  const founderRuns = new Set<string>();
  let k = 0;
  const log: string[] = [];
  const keep = (i: number) => positionOf(i) >= KEEP_PENDING_FROM;

  const dronedropL0 = plan.find((p) => p.level === 0 && p.pitch.slug === "dronedrop")!;
  {
    const run = await repo.getRun(runIds[dronedropL0.i]);
    if (WAITING.includes(run.status)) {
      const pending = await repo.pendingApprovalForRun(run.id);
      await cancelRun(repo, run.id, avery);
      if (pending) waitFor.set(pending.id, CANCEL_WAIT_MS);
      log.push(`cancel   #${dronedropL0.i} dronedrop L0 (Avery)`);
    }
  }

  for (let round = 0; round < 4; round++) {
    let acted = false;
    for (const { i, level, pitch } of plan) {
      if (keep(i)) continue;
      const run = await repo.getRun(runIds[i]);
      if (run.status === "awaiting_founder") {
        await answerFounder(repo, run.id, avery, SCRIPTED_FOUNDER_REPLY[pitch.slug] ?? "Here are the numbers you asked for.");
        founderRuns.add(run.id);
        const after = await runToRest(repo, run.id);
        log.push(`founder  #${i} ${pitch.slug} L${level} → ${after.status}`);
        acted = true;
        continue;
      }
      if (!WAITING.includes(run.status)) continue;
      const a = await repo.pendingApprovalForRun(run.id);
      if (!a) continue;
      const amount = a.original_terms?.amount ?? 0;
      const aiPass = a.ai_recommendation === "pass";
      let who = gp;
      let action: Parameters<typeof decideApproval>[3] = { type: "approve" };
      let reason: string | null = null;
      if (a.kind === "escalation") {
        reason = aiPass ? "Confirmed pass — the red flag stands." : "Unresolved red flag — not investable as pitched.";
        action = aiPass ? { type: "approve" } : { type: "reject" };
      } else if (a.kind === "exception") {
        if (pitch.slug === "snackstack") {
          const base = a.original_terms ?? { amount: pitch.ask_amount, equity_pct: pitch.equity_offered };
          action = { type: "modify", terms: { amount: base.amount, equity_pct: Math.max(1, base.equity_pct - 2) } };
          reason = "Cut equity — thin margins";
          who = base.amount <= pat.approval_limit ? pat : gp;
        } else {
          who = amount <= pat.approval_limit ? pat : gp;
          if (!aiPass && !a.original_terms) { action = { type: "reject" }; reason = "No terms to approve — passing."; }
        }
      }
      try {
        const after = await decideApproval(repo, a.id, who, action, reason);
        waitFor.set(a.id, WAITS_MS[k++ % WAITS_MS.length]);
        log.push(`${a.kind.padEnd(10)} #${i} ${pitch.slug} L${level}: ${who.name} ${action.type} → ${after.status}`);
        acted = true;
      } catch (e) {
        log.push(`FAILED   #${i} ${pitch.slug} L${level}: ${(e as Error).message}`);
      }
    }
    if (!acted) break;
  }
  console.log("\nHuman decisions:");
  for (const l of log) console.log(`  ${l}`);

  // ── 3. Incidents: acknowledge one, resolve one (in run order). ──
  const order = new Map(runIds.map((id, i) => [id, i]));
  const open = (await repo.listIncidents({ status: "open" })).filter((x) => order.has(x.run_id)).sort((a, b) => order.get(a.run_id)! - order.get(b.run_id)!);
  if (open[0]) await setIncidentStatus(repo, open[0].id, "acknowledged", pat);
  if (open[1]) await setIncidentStatus(repo, open[1].id, "resolved", gp);
  console.log(`\nIncidents: ${open.length} open → acknowledged ${open[0]?.company ?? "-"}, resolved ${open[1]?.company ?? "-"}`);

  // ── 4. Back-date with direct SQL. ──
  const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();
  try {
    const now = Date.now();
    const q = async (sql: string, args: unknown[] = []) => (await db.query(sql, args)).rows; // pg rows (QueryResultRow)
    const updates: Record<string, Array<[string, Record<string, string | null>]>> = { runs: [], checkpoints: [], agent_calls: [], tool_calls: [], founder_messages: [], approvals: [], incidents: [] };
    const iso = (t: number) => new Date(Math.min(t, now - M)).toISOString();
    const ms = (v: Date | string | null) => (v === null ? null : new Date(v).getTime());

    for (let i = 0; i < RUNS; i++) {
      const id = runIds[i];
      const [run] = await q("select started_at, completed_at from runs where id = $1", [id]);
      const approvals = await q("select id, created_at, decided_at, sla_due from approvals where run_id = $1", [id]);
      const msgs = await q("select id, direction, created_at from founder_messages where run_id = $1 order by created_at", [id]);
      const pauses: Pause[] = [];
      for (const a of approvals) {
        const dur = waitFor.get(a.id);
        if (a.decided_at && dur !== undefined) pauses.push({ start: ms(a.created_at)!, end: ms(a.decided_at)!, dur });
      }
      if (founderRuns.has(id)) {
        const asked = msgs.find((m) => m.direction === "to_founder");
        const answered = msgs.find((m) => m.direction === "from_founder");
        if (asked && answered) pauses.push({ start: ms(asked.created_at)!, end: ms(answered.created_at)!, dur: FOUNDER_WAIT_MS });
      }
      const origStart = ms(run.started_at)!;
      const newStart = now - NEWEST_OFFSET_MS - (RUNS - 1 - positionOf(i)) * SPACING_MS + ((i * 37) % 60) * M;
      const delta = newStart - origStart;
      // f(t): shift by delta, then stretch each human pause that ended at or before t to its demo duration.
      const f = (t: number) => t + delta + pauses.filter((p) => p.end <= t).reduce((n, p) => n + p.dur - (p.end - p.start), 0);

      // decideApproval writes runs.completed_at a few ms BEFORE approvals.decided_at, so a pause ending just after completion still counts.
      const done = ms(run.completed_at);
      const completed = done === null ? null : Math.max(f(done), ...pauses.filter((p) => p.end <= done + 10_000).map((p) => f(p.end)));
      updates.runs.push([id, { started_at: iso(newStart), completed_at: completed === null ? null : iso(completed) }]);
      for (const table of ["checkpoints", "agent_calls", "tool_calls"] as const) {
        for (const r of await q(`select id, created_at from ${table} where run_id = $1`, [id])) updates[table].push([r.id, { created_at: iso(f(ms(r.created_at)!)) }]);
      }
      for (const m of msgs) updates.founder_messages.push([m.id, { created_at: iso(f(ms(m.created_at)!)) }]);
      for (const a of approvals) {
        const c = f(ms(a.created_at)!);
        updates.approvals.push([a.id, { created_at: iso(c), decided_at: a.decided_at ? iso(f(ms(a.decided_at)!)) : null, sla_due: new Date(c + ms(a.sla_due)! - ms(a.created_at)!).toISOString() }]);
      }
      for (const inc of await q("select id, created_at, sla_due, resolved_at from incidents where run_id = $1", [id])) {
        const c = f(ms(inc.created_at)!);
        updates.incidents.push([inc.id, { created_at: iso(c), sla_due: new Date(c + ms(inc.sla_due)! - ms(inc.created_at)!).toISOString(), resolved_at: inc.resolved_at ? iso(c + 95 * M) : null }]);
      }
    }

    for (const [table, rows] of Object.entries(updates)) {
      for (let s = 0; s < rows.length; s += 400) {
        const chunk = rows.slice(s, s + 400);
        const cols = Object.keys(chunk[0][1]);
        const args: unknown[] = [];
        const values = chunk.map(([id, v]) => {
          args.push(id, ...cols.map((c) => v[c]));
          const base = args.length - cols.length - 1;
          return `($${base + 1}::uuid, ${cols.map((_, j) => `$${base + 2 + j}::timestamptz`).join(", ")})`;
        });
        await db.query(`update ${table} as t set ${cols.map((c) => `${c} = v.${c}`).join(", ")} from (values ${values.join(", ")}) as v(id, ${cols.join(", ")}) where t.id = v.id`, args);
      }
      console.log(`back-dated ${String(rows.length).padStart(4)} ${table}`);
    }

    // ── 5. Summary. ──
    const byLevel = await q(
      `select autonomy_level as level, count(*)::int as runs,
         count(*) filter (where status='offer_sent')::int as offer_sent, count(*) filter (where status='passed')::int as passed,
         count(*) filter (where status='escalated')::int as escalated,
         count(*) filter (where status in ('awaiting_approval','in_review','awaiting_founder'))::int as waiting,
         count(*) filter (where status in ('cancelled','failed'))::int as cancelled,
         round(avg(cost_usd)::numeric, 4)::float as avg_cost
       from runs where id = any($1::uuid[]) group by 1 order by 1`, [runIds]);
    console.log("\nRuns by autonomy level (this seed):");
    console.table(byLevel.map((r) => ({ level: `L${r.level}`, runs: r.runs, offer_sent: r.offer_sent, passed: r.passed, escalated: r.escalated, waiting: r.waiting, cancelled: r.cancelled, avg_cost: r.avg_cost })));
    const s = await loadFundStats(repo);
    const pctOf = (x: number) => `${(x * 100).toFixed(1)}%`;
    console.log("Fund Overview KPIs (whole DB, last 500 runs):");
    console.table({
      "Total runs": s.kpis.totalRuns, "Offers sent": s.kpis.offersSent, "Capital committed": `$${s.kpis.capitalCommitted.toLocaleString("en-US")}`,
      "Avg cost / run": `$${s.kpis.avgCostPerRun.toFixed(4)}`, "Avg human wait": `${Math.round(s.kpis.avgHumanWaitMs / M)} min`,
      "Automation rate": pctOf(s.kpis.automationRate), "Escalation rate": pctOf(s.kpis.escalationRate), "Override rate": pctOf(s.kpis.overrideRate),
      "Pending approvals": s.kpiBasis.pendingApprovals,
    });
    console.log("Wait histogram:", s.waitHistogram.map((b) => `${b.bucket}=${b.count}`).join("  "));
  } finally {
    await db.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
