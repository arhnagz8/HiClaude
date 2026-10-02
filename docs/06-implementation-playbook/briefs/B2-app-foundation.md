# Builder brief B2 — `packages/app` foundation (database, repositories, platform services, jobs)

Read first: `/home/user/HiClaude/CLAUDE.md`, `docs/05-architecture/architecture.md` (esp. §3, §9–§13, §17), `docs/05-architecture/api-spec.md`, all of `packages/contracts/src/*`.
You OWN `packages/app/**` **except** the engine services listed under "Not yours" (agent B3 adds them later into the same package). Do not edit other packages (additive contract changes: Edit tool only, report them).
No git commit/push. Installs: `flock /tmp/hiclaude-npm.lock npm install <pkg> -w @hiclaude/app`. Runtime deps allowed: `zod`, `decimal.js`, `@hiclaude/contracts`, `@hiclaude/core` (workspace; *may not exist yet — do NOT import it*). Use **`node:sqlite`** (`DatabaseSync`), never `better-sqlite3`.
Run: `npx tsc --noEmit -p packages/app` and `npx vitest run packages/app` — both must pass.

## Deliverables

### 1. Database layer — `src/db/`
- `Database` wrapper: opens `:memory:` or file (WAL + synchronous=NORMAL for files), `PRAGMA foreign_keys=ON`, prepared-statement cache, `tx(fn)` (nested → savepoints), `run/get/all`, `exec`, `close`. Handles `ExperimentalWarning` quietly (suppress via `process.removeAllListeners('warning')` filter only for that message).
- Migration runner: ordered `src/db/migrations/NNN_name.sql` (loaded via `import.meta` fs read), `schema_migrations` table, idempotent. Migration `001_init.sql` creates **all** tables from architecture §11 with indexes: `customers, identities, sessions, otps, products, product_overrides, quotes, orders, order_events, payments, bank_credits, chain_transfers, fulfilment_tasks, deliveries, usdt_lots, treasury_actions, rate_snapshots, ledger_accounts, ledger_entries, ledger_lines, settings, settings_audit, users, audit_log, tickets, ticket_messages, notifications, referrals, kpi_daily, jobs_state, kill_switches, alerts`. Money columns INTEGER; JSON columns TEXT; `version` columns on orders/tasks; unique indexes for idempotency (`orders(idempotency_key)`, `payments(txHash)`, `bank_credits(ref)`, `quotes(id)`). Ledger: `ledger_entries(id, seq UNIQUE AUTOINCREMENT, ts, kind, memo, refs_json, order_id, product_family, provider_id, exchange_id, customer_id, channel)`, `ledger_lines(entry_id, account, qty, irt)` with indexes on `(account, ts)` and `(order_id)`.
- Later agents may append migrations (`002_*.sql`…) but must not edit `001`.

### 2. Repositories — `src/repos/`
One typed repo per aggregate with `insert/get/update/list` plus the queries below; JSON columns validated with zod at the boundary; row↔domain mappers; no business logic.
Required queries: customers by phone/telegramId/baleId/referralCode; orders by customer/status/code/idempotencyKey, `listActiveByStatus(statuses, limit)`, `countsByStatus()`, orders created since; payments by order/txHash/authority; bank credits unmatched / by ref; chain transfers by address/txHash; tasks queue ordered by `(priority, dueAt)`; lots by availability; rate snapshots latest/range; ledger low-level `insertEntry(entry)` + `listEntries(filter)` + `sumByAccount(range)`; settings get/put with version; audit append/list; notifications queue (pending/retry); kpi_daily upsert/range.

### 3. Services — `src/services/`
- **SettingsService**: `getParams()` returns the effective `PlatformParams` = `defaultPlatformParams()` ← `data/config/*.json` (`loadParamsFromDir(dataDir)`; file names map to top-level keys: `pricing.json`, `paymentMethods.json`, `exchanges.json`, …; each validated) ← DB overrides (`settings` rows keyed by dotted path). `updatePricingPolicy(patch, actor)` bumps `pricing.version`, writes `settings_audit`, publishes an event. `get/set(key)` for flags (`killSwitch.*`, banners). Cached with invalidation on write.
- **StaffService**: users (seeded owner in demo), roles & `can(role, permission)` RBAC matrix (documented table), password (scrypt) + optional TOTP verify, sessions, `audit(actor, action, target, data)`.
- **CustomerService**: `requestOtp(phone)` (normalise via contracts, rate-limits per params: 3/10min, fixed demo code `12345` when `mode ≠ live`), `verifyOtp` → session (random token from `Rng`+hash; store hash), messenger auth via `MessengerPort.verifyInitData`, `getOrCreateByPhone`, referral codes (`publicCode`), referral attribution, KYC submit/verify via `IdentityPort` (Shahkar + national-id checksum), tier computation + `limitsFor(customer)` from `params.risk.tiers`, `usedTodayUsdCents` helper hook (orders repo), wallet balance read; **wallet credit/debit methods only update the customer row via a callback** so B3's LedgerService can post E17/E4 (design the hook: `walletAdjust(customerId, deltaIrt, reason, tx)`).
- **CatalogService**: products from `data/catalog.json` (if present; tolerant of research Record wrappers: unwrap `.value`) else `defaultProducts()`; DB overrides (`product_overrides`: active flag, margin override, SLA) merged; `list()`, `get()`, `availability(product, now, ctx)` (provider enabled + not killed + risk rules), amount validation (`validateAmount(product, usdCents)`), input validation (`validateInputs`).
- **NotificationService**: template registry keyed `event` × `channel` with Persian defaults for all domain events (order created/paid/delivered/failed/refunded, payment mismatch, quote expiring, OTP, ticket reply, KYC); loads overrides from `data/copy.fa.json` (flat key→string; `{{var}}` interpolation); routes to `MessengerPort` (telegram/bale) / `SmsPort` / in-app (DB) based on customer identities and event criticality; delivery records + retry queue (`retryDue(now)`); never throws into the caller.
- **AuditService** (thin) and **AlertService** (`raise({severity, code, messageFa})` stored + event).
- **crypto utils** `src/crypto/`: `encryptSecret(plain, masterKey)` / `decryptSecret` AES-256-GCM envelope (random data key per record wrapped by master key; versioned format), tamper tests; `hmacSha256`, `timingSafeEqualStr`, `hashPassword/verifyPassword` (scrypt), `totp(secret, now)` RFC 6238 + verify with window, `randomToken(rng)` (deterministic from `Rng` in sim; `crypto.randomBytes` when `mode==='live'`).

### 4. Jobs — `src/jobs/JobRunner`
`register({ name, intervalMs? , atIrst?: {hour, minute, dayOfMonth?}, handler })`, `tick(now)` runs due jobs in registration order exactly once per due slot (catch-up policy: run once, skip missed intervals), per-job try/catch → `AlertService`, `jobs_state` persistence (`lastRunAt`, `lastError`, `runs`), `lagMs(name, now)`, `runNow(name)`. Deterministic with `ManualClock`. Daily/monthly IRST scheduling uses contracts `irstParts` (month-start jobs use Jalali month rollover via `jalaliOf`).

### 5. Wiring — `src/app.ts`, `src/index.ts`
`createApp(deps: AppDeps): App` builds: db (+ migrations), event bus (contracts `createEventBus`), id gen, services above, `jobs`. Define the full `AppServices` interface now (so B3 can fill it in): `settings, staff, customers, catalog, notifications, alerts, audit` (yours) and **declared-but-optional engine slots** `pricing?, rates?, orders?, payments?, fulfilment?, treasury?, ledger?, reports?, support?, expenses?` typed as `unknown` placeholders with a clear `// B3` comment. `app.close()`. Export everything needed by API/sim from `src/index.ts`.

### 6. Fakes for tests (reused by B3, API, sim smoke tests) — `test/fakes/`
In-memory, controllable implementations of **every port**: `FakeExchange` (balances, caps, lock, hours, scripted failures), `FakeBank`, `FakeGateway`, `FakeChain`, `FakeProvider` (api/panel modes), `FakeMessenger`, `FakeSms`, `FakeIdentity`, plus `makeTestApp({params?, mode:'test', now?})` returning `{ app, clock, ports, fakes }`. These are test utilities; simple and deterministic (no world model).

## Tests (≥ 60)
Migrations idempotent; every repo round-trip + constraint violations; settings layering/override/audit/version bump; OTP happy path, wrong code, rate limit, expiry; session create/expire; RBAC matrix snapshot test; encryption round trip, tamper detection, wrong key; TOTP vectors (RFC 6238); JobRunner schedule semantics (interval, daily IRST at 00:05, monthly on Jalali day 1) with `ManualClock`; notification routing/fallback/retry; catalog override merge & validation; `makeTestApp` smoke test.

## Not yours (B3 will build; don't implement)
Pricing/Rates/Orders/Payments/Fulfilment/Treasury/Ledger/Reports/Support/Expenses services and the business jobs.

## Return
Files created, public API (service method signatures), DB table list, how to use `makeTestApp`, assumptions, any contract additions.
