# STATUS — live progress log (authoritative; update after every meaningful step)

_Last updated: 2026-10-02 (session start of long mission)_

## Done
- [x] Round 0 research: first-pass business plan (`docs/business-plan-full-context.md`) + `scripts/pricing_model.py` (pushed, commit d79cd2a).
- [x] Constitution `CLAUDE.md`, `docs/MISSION.md`, skeleton dirs.

## Environment facts (verified)
- Node v22.22.0, npm 10.9.4, pnpm 10.28, Python 3.11, 4 CPUs, 15 GB RAM, 30 GB disk free.
- npm registry + PyPI reachable. `github.com` root returns 400 (native prebuild downloads may fail → avoid native deps; use `node:sqlite`).
- Chromium: `/opt/pw-browsers/chromium` (symlink → chromium-1194/chrome-linux/chrome); use `executablePath`.
- Workflow concurrency cap = 2 agents per workflow (CPUs−2) → run several workflows in parallel.
- WebFetch blocked for mpay.cards, app.mpay.cards, core.telegram.org, nobitex, zarinpal, docs.bale.ai, web.archive.org, … → WebSearch only.
- Attribution: commits end with `Co-Authored-By: Claude <noreply@anthropic.com>` + `Claude-Session: https://claude.ai/code/session_01HLs2jsUgwgkHLJ9FA128Hx` (no model names).

## In progress
- Phase 1 research — 3 workflows launched 2026-10-02 (each specialist → independent verifier). If the session restarts, check
  `/workflows` / TaskList first; resume with `Workflow({scriptPath, resumeFromRunId})` (completed agents return cached results).
  | Workflow | Run ID | Task ID | Specialists |
  |---|---|---|---|
  | rails | wf_367e3693-fcb | wofyo8wgo | 02-ir-exchanges-usdt-rails, 03-ir-payments-collection, 01-card-providers, 09-platform-tech-security |
  | market | wf_949ffd8f-46f | wlu8t1j1m | 06-service-catalog-demand, 07-competitor-benchmark-ir, 08-macro-fx-scenarios, 10-ops-growth |
  | legal | wf_bbc3c65d-69a | wza7pbmzh | 04-legal-tax-compliance-ir, 05-sanctions-counterparty-risk, 11-ux-product-fa |
  Script files: `/root/.claude/projects/-home-user-HiClaude/e0406b7e-eb00-55e4-8e8b-4850c515b2e9/workflows/scripts/research-specialists-<runid>.js`
  Expected outputs: `docs/03-research/NN-*.md`, `data/*.json` (validate: `node scripts/validate-data.mjs`). Not yet committed.
- Phase 0 DONE: architecture/sim/api specs + `packages/contracts` (18 tests green), pushed (commit 1f2c101).
- Phase 2 wave 1 builders launched (background Agents; briefs in `docs/06-implementation-playbook/briefs/`):
  | Agent | Brief | Area | Notes |
  |---|---|---|---|
  | B1 | B1-core.md | `packages/core` | pure pricing/rates/ledger/state machine/treasury/risk/payments |
  | B2 | B2-app-foundation.md | `packages/app` (db, repos, settings, staff, customers, catalog, notifications, jobs, fakes) | no core import |
  | B4 | B4-sim-world.md | `packages/sim` world components (macro, exchange, bank, gateway, chain, provider, competitors, scenarios) | no app/core import |
  Builders do NOT commit; lead commits after review. If the session restarts: check TaskList / agent output files in
  `/tmp/claude-0/-home-user-HiClaude/e0406b7e-eb00-55e4-8e8b-4850c515b2e9/tasks/` (never `cat` them whole) and re-launch a builder with the same brief if its package is incomplete.

## Next actions
1. Write architecture spec v1 (`docs/05-architecture/architecture.md`) + `packages/contracts` (ports, schemas, events, Clock/Rng).
2. When research lands: commit, then brief 12 (pricing-treasury-economics) as a stage-2 specialist that consumes 01/02/03/06/07/08.
3. Spawn builders in waves: (core) → (app) → (api, web-customer, web-admin, sim-world, live) in parallel.
4. Debate workflow → ADRs → calibrate sim → scenario suite → persona E2E → synthesis.
5. Heartbeat armed via `send_later` (re-arm after each wake until all Definition-of-Done boxes are checked).

## Decisions so far
- Stack: TypeScript monorepo (npm workspaces), Fastify API, `node:sqlite`, React+Vite SPA, vitest, Playwright (system Chromium).
- Brand placeholder: "کارتینو / Kartino" (configurable in `brand.config.ts`).
- Messenger bot lives inside `apps/api` (webhooks) — one deployable.

## Open risks / notes
- OFAC designation of 4 Iranian exchanges (2026-06-02) is reported by Elliptic/Chainalysis/Scorechain but denied/rumor-labelled by some Iranian outlets → compliance specialist must adjudicate.
- mpay.cards: no public API/partner program found; Trustpilot ~3/5 with fund-loss complaints → treat as high counterparty risk.
