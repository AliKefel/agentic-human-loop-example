# UI mockups (reference build)

Captured from the `solution` branch with seeded demo data (`pnpm db:reset && pnpm demo:seed`), 1440 px wide, light mode unless noted. Use them as the visual target for each milestone; exact numbers will differ from run to run.

| Image | Screen | Milestone | SPEC | What to notice |
|---|---|---|---|---|
| `01-fund-overview.png` | Fund Overview `/` | M9 | §5.1 | Eight KPI tiles, eight charts and the live activity feed; the cost chart shows the budget-cap reference line. |
| `02-pitches.png` | Pitches `/pitches` | M1 | §5.2 | Card grid with sector badge, implied valuation, chaos-hint bolt icon and last-run status pill. |
| `03-enter-tank-dialog.png` | Enter the Tank dialog | M1 | §5.2 | Autonomy level select defaults to the active config, with a budget-caps preview before Start run. |
| `04-run-live-ledgerleaf.png` | Run detail, mid-run (LedgerLeaf, L2) | M8 | §5.3 | Finance Shark is running with `retry x1` and `timeout` badges while the other Sharks are done; the stepper sits on Analyze. |
| `05-run-pawprint-awaiting.png` | Run detail, awaiting approval (PawPrint DNA) | M8 / M5 | §5.3 | Waiting (amber) Human node, decision panel with rule `l2.over_threshold` and required role General Partner. |
| `06-run-skinsync-escalated.png` | Run detail, escalated (SkinSync) | M8 / M6 | §5.3 | Incident banner, Skeptic `prompt_injection` red flag, rule `escalate.red_flag`. |
| `07-queue-approvals.png` | Review Queue `/queue` | M5 | §5.4 | Stats strip, tab counts, overdue SLA in red, required-role badge. |
| `08-approval-drawer-denied.png` | Approval drawer as Pat Partner on PawPrint | M5 | §5.4 | Approve is disabled and the tooltip explains the General Partner authority limit. |
| `09-incidents.png` | Incidents `/incidents` | M6 | §5.5 | Open / Acknowledged / Resolved columns with severity badges and SLA countdowns. |
| `10-harness.png` | Harness `/harness` | M10 | §5.6 | Active config, autonomy slider, thresholds, budgets, reliability, permission matrix with the confidential portfolio column. |
| `11-harness-whatif.png` | Harness with a draft (L2 to L3) and what-if simulator | M10 | §5.6 | Current vs draft outcome counts, human-hours and capital auto-committed; pending changes diff below. |
| `12-audit.png` | Audit Log `/audit` | M7 | §5.7 | Filters, Export CSV, action badges and JSON details links per row. |
| `13-memory.png` | Memory `/memory` | M7 | §5.8 | Scope tabs with counts; each memory links back to its source run. |
| `14-fund-overview-dark.png` | Fund Overview, dark mode | M9 | §5.1 / §5 theme | Same dashboard under the `dark` theme tokens; chart colours stay legible. |
