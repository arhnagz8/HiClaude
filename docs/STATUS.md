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
- Phase 0 foundation → Phase 1 research workflows → Phase 2 build.

## Next actions
1. Write architecture spec v1 (`docs/05-architecture/`), scaffold monorepo, `contracts`.
2. Launch research workflows A (market side) and B (legal/tech side).
3. Spawn builders (core/app/api/web/sim).
4. Arm heartbeat via `send_later`.

## Decisions so far
- Stack: TypeScript monorepo (npm workspaces), Fastify API, `node:sqlite`, React+Vite SPA, vitest, Playwright (system Chromium).
- Brand placeholder: "کارتینو / Kartino" (configurable in `brand.config.ts`).
- Messenger bot lives inside `apps/api` (webhooks) — one deployable.

## Open risks / notes
- OFAC designation of 4 Iranian exchanges (2026-06-02) is reported by Elliptic/Chainalysis/Scorechain but denied/rumor-labelled by some Iranian outlets → compliance specialist must adjudicate.
- mpay.cards: no public API/partner program found; Trustpilot ~3/5 with fund-loss complaints → treat as high counterparty risk.
