# The Tank

A teaching app for agentic orchestration. AI "Shark" agents (Market, Finance, Product, Skeptic, Lead) evaluate startup pitches for the fictional fund Deep Water Ventures, while a harness, a policy engine and humans decide what actually happens. Built with Next.js, Supabase and shadcn/ui.

## Quickstart

```bash
pnpm i
cp .env.example .env.local   # fill in the Supabase values
pnpm db:reset                # applies the schema and seed data
pnpm dev                     # http://localhost:3000
```

**Mock mode:** with no `ANTHROPIC_API_KEY` (or `NEXT_PUBLIC_MOCK_MODE=true`) every agent call is served from deterministic fixtures, so you can build and test without an API key. Add a key to go live with Claude.

## Docs

- [docs/SPEC.md](docs/SPEC.md): full specification and milestone plan (M1 to M10)
- [docs/HARNESS_SPEC_V2.md](docs/HARNESS_SPEC_V2.md): template you fill in as your design deliverable
- [docs/LANGGRAPH_MAPPING.md](docs/LANGGRAPH_MAPPING.md): how this harness maps to LangGraph concepts

## Scripts

Checks: `pnpm test` · `pnpm typecheck` · `pnpm lint`

`pnpm dev` · `pnpm build` · `pnpm test` · `pnpm db:reset` · `pnpm demo:seed`

`pnpm demo:seed` adds 48 Mock-mode runs (12 pitches × L0–L3), resolves them with a scripted human policy and back-dates them over 14 days for the Fund Overview. It adds runs every time; `pnpm db:reset && pnpm demo:seed` gives a clean demo database (about 2–3 minutes; `DEMO_FAST=true` skips mock latencies).
