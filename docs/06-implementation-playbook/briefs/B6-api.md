# Builder brief B6 — `apps/api` (Fastify HTTP layer, bots, demo mode)

Prerequisites (verify first): `packages/app` complete (B2+B3: `createApp`, `app.facade`, `makeTestApp`), `packages/sim` world + `createDemoSim` (B4/B5 — if B5 is not finished, build demo mode against the world only and leave the sim-control routes behind a clearly marked adapter `SimControl` interface that B5's `createDemoSim` will satisfy).
Read first: `/home/user/HiClaude/CLAUDE.md`, `docs/05-architecture/api-spec.md` (**normative route table**), `architecture.md` §11–§14, `packages/contracts/src/api.ts`, `packages/app/README.md`.
You OWN `apps/api/**` and `scripts/demo.mjs`. Additive Edit-only changes to `packages/contracts/src/api.ts` are allowed (report them).
No git commit/push. Installs: `flock /tmp/hiclaude-npm.lock npm install <pkg> -w @hiclaude/api`. Deps allowed: `fastify@^5`, `@fastify/cookie`, `@fastify/static`, `@fastify/rate-limit`, `@fastify/helmet` (or hand-rolled headers), `zod`, workspace packages. Typecheck + tests must pass.

## Deliverables
1. **Server** (`src/server.ts`, `src/buildServer.ts`): `buildServer({ app, mode, simControl? })` returns a Fastify instance (testable via `inject`); `server.ts` boots from env (`MODE=live|demo`, `PORT=8787`, `DATA_DIR`, `DB_PATH`, `MASTER_KEY_HEX`, `STATIC_DIR`), creating the app with **live adapters** (from `@hiclaude/live` if present) or, in demo, the **simulated world** (`createWorld` + `createDemoSim`) with a wall-clock → virtual-clock pump (configurable speed; default 1 virtual minute / 1 real second after startup) so the UI visibly moves. Graceful shutdown, structured logs without PII, request ids, `/health` and `/ready` (db, rate freshness, job lag).
2. **Routes** exactly as `api-spec.md` (customer + admin + demo-only `/sim/*`), all validated with zod schemas from contracts, all responses via `app.facade` DTO mappers (no business logic in routes). Auth: cookie sessions for customers (`sid`) and staff (`ssid`), Bearer for Mini Apps; RBAC check per admin route using `app.services.staff.can`; audit-log every mutating admin call; idempotency keys honoured; optimistic-lock conflicts → 409; rate limits per spec; CSRF double-submit for cookie-authenticated mutating calls from browsers; CSP/security headers; body size limits (receipt images ≤ 2 MB).
3. **SSE**: `/orders/:id/stream` and `/admin/stream` fed by the app event bus (per-order and global channels; heartbeat 15 s; `Last-Event-ID` resume from a small ring buffer).
4. **Gateway callback** `GET /gateway/callback/:gatewayId` → `facade.handleGatewayCallback` → 302 to `/orders/:id` (web route) with state.
5. **Bots**: `POST /hooks/telegram` and `/hooks/bale` (secret-token header verification; update parsing for text commands `/start [ref]`, `/orders`, `/help`, callback queries) producing replies through `MessengerPort`; Mini App launch buttons (`webAppUrl` to `/tg` / `/bale`); referral deep links; notifications are sent by `NotificationService` (not here). A small **bot command router** with Persian copy from `data/copy.fa.json`/defaults and tests with fake messengers.
6. **Static + SPA fallback**: serve `apps/web/dist` (if present) with history fallback; `/api/*` never falls back.
7. **Demo seeding** (`demo.ts`): staff accounts (`owner/owner`, `admin/admin`, `operator/operator`, `support/support`, `accountant/accountant`) clearly flagged demo-only; a few seeded customers/orders so screens are not empty; fixed OTP `12345`; banner "نسخه‌ی نمایشی".
8. **`scripts/demo.mjs`**: builds web if `apps/web/dist` missing (`npm run build`), starts the API in demo mode, prints URLs, handles Ctrl-C.
9. **`.env.example`** at repo root listing every variable with where to obtain it.
10. **Docs**: `apps/api/README.md` — run/dev, env table, route table (generated from the Fastify route list), auth model, demo vs live differences.

## Tests (≥ 80) via `server.inject`
Auth flows (OTP rate limits, wrong code, session expiry, Mini App initData via sim format), catalog/quote/order/payment flows for every method end-to-end against `makeTestApp`, receipts, reveal one-time/TTL, cancel/confirm/dispute, admin RBAC matrix (every admin route × role), audit log entries, idempotency, 409 conflicts, validation errors (422 with Persian message), SSE event delivery, bots command router, gateway callback redirect, health/ready, rate limiting, CSRF, security headers, SPA fallback, body limits.

## Return
Files, route list, env vars, demo credentials, how to run, assumptions, contract additions, open issues.
