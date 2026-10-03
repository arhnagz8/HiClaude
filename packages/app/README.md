# @hiclaude/app — engine foundation (B2)

Database, repositories, platform services, job runner, composition root (`createApp`) and test fakes.
Engine services (pricing, rates, orders, payments, fulfilment, treasury, ledger, reports, support, expenses) are **B3's** and plug into the slots in `AppServices`.
No import of `@hiclaude/core` here (B3 may add it).

## Layout
```
src/db/           Database wrapper (node:sqlite), migrations runner, migrations/001_init.sql
src/repos/        one typed repo per aggregate (zod-validated JSON columns) + createRepos(db)
src/services/     settings, staff(+rbac), customers, catalog(+validation), notifications(+templates), alerts, audit, paramsLoader
src/crypto/       envelope AES-256-GCM, hmac/timingSafeEqual, scrypt, TOTP, tokens
src/jobs/         JobRunner
src/app.ts        createApp(deps, opts) → App
test/fakes/       in-memory fakes of every port + makeTestApp  (exported as '@hiclaude/app/testing')
test/*.test.ts    162 tests
```

## Using it
```ts
import { createApp } from '@hiclaude/app'
const app = createApp({ clock, rng, params, dbPath: ':memory:', ports, mode: 'sim' }, { dataDir: 'data' })
app.services.customers.walletAdjust(...); await app.tick()            // runs due jobs
```
`createApp` options: `dataDir` (reads `config/*.json`, `catalog.json`, `copy.fa.json`), `catalogPath`, `copyPath`, `seedDemoStaff` (default true unless live), `wireNotifications` (default true).
`mode: 'live'` requires `masterKeyHex` (64 hex chars), never seeds demo staff, uses scrypt N=2^14, random OTP codes and `crypto.randomBytes`.

### makeTestApp (tests, API smoke tests, sim smoke tests)
```ts
import { makeTestApp } from '@hiclaude/app/testing'
const { app, clock, rng, params, ports, fakes, advance } = makeTestApp({ params?: DeepPartial<PlatformParams>, mode?: 'test'|'demo'|'sim', now?, seed?, dataDir?, appOptions? })
```
Starts at 2026-10-02 12:00 IRST on a `ManualClock`, in-memory SQLite, demo staff seeded. `fakes` = `{ exchanges: Record<id, FakeExchange>, gateways: Record<id, FakeGateway>, bank: FakeBank, chain: FakeChain, providers: Record<id, FakeProvider>, telegram, bale: FakeMessenger, sms: FakeSms, identity: FakeIdentity }`.
Every fake logs calls (`.calls`), supports scripted failures (`fake.fail(method | '*', PortErrorCode | PortError, times)`) and exposes controls (`setRates`, `setLimits`, `setBalances`, `addCredit`, `markPaid`, `addIncoming`/`confirm`, `credit`, `makeInitData`, `lastOtp`, `setShahkar`…). `FakeExchange` models buy fee `B·φ/(1+φ)`, the post-purchase withdrawal lock (lots), caps, market hours and clock-driven withdrawals.

## Database (migration 001_init)
customers, identities, sessions (customer **and** staff; PK = SHA-256 of the bearer token), otps, products, product_overrides, quotes, orders (+`idempotency_key` unique, `version`), order_events, payments (unique `tx_hash`, unique `(gateway_id, authority)`), bank_credits (unique `ref`), chain_transfers (unique `(network, tx_hash)`), fulfilment_tasks (+`version`), deliveries (`secret_enc` only), usdt_lots, treasury_actions, rate_snapshots, ledger_accounts, ledger_entries (`seq AUTOINCREMENT`, `id` unique), ledger_lines (denormalised `ts`, index `(account, ts)`), settings, settings_audit, users, audit_log, tickets, ticket_messages, notifications, referrals, kpi_daily, jobs_state, kill_switches, alerts.
The ledger tables are **append-only** (triggers reject UPDATE/DELETE); `LedgerRepo.insertEntry` rejects entries whose `Σirt ≠ 0`.
Later agents add `002_*.sql`; migrations are checksummed — editing an applied file throws.

## Config layering
`deps.params` (usually `defaultPlatformParams()`) ← `<dataDir>/config/<section>.json` (section = top-level PlatformParams key; either the section itself or `{ "<section>": {...}, "provenance": {...} }`; invalid file ⇒ `ConfigFileError` naming the file) ← DB rows `params.<dotted.path>` (versioned, audited in `settings_audit`). `getParams()` is cached, deep-frozen and recomputed after writes; a corrupt DB override falls back to the base (logged).
Non-param flags live under other keys (`flag.*`, `banner.public`, `otp.*`, `catalog.minTierByRisk`, `tier.trustedMinOrders|trustedMinAgeDays`, `referral.windowDays`, `session.customerTtlMs`, `messenger.initDataMaxAgeMs`). Kill switches are a separate table (`all | rates | provider:<id> | product:<id>`).

## Public API (service signatures)
**SettingsService** `getParams()`, `getBaseParams()`, `setParam(path, value, actor, reason?)`, `setParams(entries, actor, reason?)`, `clearParam(path, actor)`, `updatePricingPolicy(patch, actor, reason?) → PricingPolicy` (bumps `pricing.version` only if something changed), `get<T>(key, def?)`, `set(key, value, actor, reason?, expectedVersion?)`, `unset`, `listFlags`, `audit(filter)`, `getBanner/setBanner`, `isKilled(scope, id?)`, `salesBlock({productId?, providerId?})`, `setKillSwitch({scope, scopeId?, on, reason}, actor)`, `listKillSwitches`, `onChange(fn)`, `invalidate()`.
**StaffService** `can(role, perm)`, `require(user, perm)`, `createUser`, `seedDemoStaff()` (owner/owner, admin/admin, operator/operator, support/support, accountant/accountant, viewer/viewer), `login(username, password, {totp?, ttlMs?}) → {token, user, expiresAt}`, `authenticate(token) → StaffUser`, `logout`, `enableTotp(userId, actor) → {secret, uri}`, `setActive`, `setRole`, `changePassword`, `listUsers`, `getUser`, `getByUsername`, `audit(actor, action, target?, data?)`. 5 failed logins ⇒ 15-minute lock; last active owner cannot be removed.
**CustomerService** `requestOtp(phone) → {phone, expiresAt, delivered}`, `verifyOtp(phone, code, {referralCode?, channel?}) → {token, customer, isNew, expiresAt}`, `authenticate(token) → {customer, session}`, `logout`, `authMessenger(platform, initData, {verifiedPhone?, referralCode?})`, `linkMessenger`, `getOrCreateByPhone`, `get/mustGet/getByPhone/list`, `submitKyc(customerId, {nationalId, fullName}) → {status, customer}`, `adminVerifyKyc`, `kycStatus`, `computeTier/recomputeTier/setTier/clearManualTier`, `usedTodayUsdCents`, `limitsFor(customer) → CustomerLimits`, `checkOrderAllowed(customer, usdCents, method)`, `setLimitOverride`, `block/unblock/addFlag/removeFlag/setRiskScore/updateProfile`, `attributeReferral/referralStats/qualifyReferral/rewardReferral`, `walletBalance`, `walletAdjust(customerId, deltaIrt, reason, ref?)`, `onWalletAdjust(hook)`, `toMeDto`.
**CatalogService** `list({includeInactive?, family?, category?})`, `get/getBySlug/require`, `toDto`, `setOverride(id, patch, actor)`, `clearOverride`, `availability(product, now?, {customer?}) → {available, reason?, reasonFa?, providerId?, riskLabel, restrictionNoteFa?}`, `checkAmount/validateAmount`, `validateInputs(product, raw) → sanitized`, `reload()`.
**NotificationService** `enqueue(input)` (sync), `notify(input)` (enqueue+flush, never throws), `flush()`, `retryDue(now?)`, `sendOtp`, `render`, `registerTemplate`, `loadCopy/loadCopyFile`, `listForCustomer/unreadCount/markRead`, `wireEvents(bus)`.
**AlertService** `raise({severity, code, messageFa, data?, dedupeMs?})`, `list`, `ack`, `resolve`, `resolveByCode`, `openCount`. **AuditService** `record(actor, action, target?, data?)`, `list(filter)`.
**JobRunner** `register({name, intervalMs | atIrst:{hour,minute,dayOfMonth?}, handler({now,name,slot}), enabled?, skipInitialCatchUp?})`, `tick(now?)`, `runNow(name)`, `lagMs(name, now?)`, `state(name)`, `list()`, `setEnabled`. Platform jobs registered by createApp: `notifications.dispatch` (1 min), `platform.housekeeping` (daily 03:30 IRST).
**crypto** `encryptSecret/decryptSecret(+aad)`, `encryptJson/decryptJson`, `hmacSha256`, `sha256Hex`, `timingSafeEqualStr`, `hashPassword/verifyPassword`, `totp/verifyTotp/hotp`, `base32Encode/Decode`, `randomToken(rng, mode, bytes)`, `randomDigits`, `DEV_MASTER_KEY_HEX` (INSECURE demo key).

## RBAC matrix (locked by an inline snapshot test)
| permission | owner | admin | operator | support | accountant | viewer |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| dashboard.view | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| orders.view | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| orders.manage | ✓ | ✓ | ✓ |  |  |  |
| orders.refund | ✓ | ✓ |  |  |  |  |
| tasks.view | ✓ | ✓ | ✓ |  |  |  |
| tasks.work | ✓ | ✓ | ✓ |  |  |  |
| payments.view | ✓ | ✓ | ✓ | ✓ | ✓ |  |
| payments.match | ✓ | ✓ |  |  | ✓ |  |
| treasury.view | ✓ | ✓ |  |  | ✓ |  |
| treasury.act | ✓ | ✓ |  |  |  |  |
| rates.view | ✓ | ✓ | ✓ |  | ✓ | ✓ |
| rates.killswitch | ✓ | ✓ |  |  |  |  |
| policy.view | ✓ | ✓ |  |  |  |  |
| policy.edit | ✓ | ✓ |  |  |  |  |
| settings.view | ✓ | ✓ |  |  |  |  |
| settings.edit | ✓ | ✓ |  |  |  |  |
| catalog.view | ✓ | ✓ | ✓ | ✓ |  | ✓ |
| catalog.edit | ✓ | ✓ |  |  |  |  |
| customers.view | ✓ | ✓ | ✓ | ✓ | ✓ |  |
| customers.manage | ✓ | ✓ |  |  |  |  |
| tickets.view | ✓ | ✓ | ✓ | ✓ |  |  |
| tickets.reply | ✓ | ✓ | ✓ | ✓ |  |  |
| tickets.assign | ✓ | ✓ |  | ✓ |  |  |
| reports.view | ✓ | ✓ |  |  | ✓ | ✓ |
| ledger.view | ✓ | ✓ |  |  | ✓ |  |
| expenses.manage | ✓ |  |  |  | ✓ |  |
| audit.view | ✓ | ✓ |  |  | ✓ |  |
| users.view | ✓ | ✓ |  |  |  |  |
| users.manage | ✓ |  |  |  |  |  |
| sim.control | ✓ |  |  |  |  |  |

## Design decisions / assumptions
- **Sessions & tokens**: bearer token = 24–32 random bytes (from the seeded `Rng` unless `mode==='live'`); only its SHA-256 is stored. Customer TTL 30 d, staff 12 h.
- **OTP**: 5 digits; 3 requests/10 min/phone; 5 failed verifications/hour/phone; TTL 5 min; single use; a new request invalidates older codes; demo code `12345` for every mode ≠ live. The clear code is never persisted (the notification row is redacted). `PlatformParams` has no OTP section, so these are `otp.*` flags with defaults in `OTP_DEFAULTS` (proposal: add an `otp` section to contracts).
- **Notifications use an outbox**: `enqueue` is synchronous (deterministic inside sim ticks / event handlers), `flush` (job `notifications.dispatch`) sends. Critical events fail over telegram → bale → SMS; others retry with backoff 1 m/5 m/30 m/2 h/6 h (5 attempts).
- **Costs**: SMS and Shahkar inquiry costs are emitted on `app.costs` (`CostRecorder`); B3's LedgerService should subscribe and book them to 5040 PAYMENT_FEES.
- **Wallet**: `walletAdjust` changes only the customer row, then runs hooks (`onWalletAdjust`) in the same DB transaction — B3 registers one that posts E17/E4; a throwing hook rolls the balance back.
- **Messenger login** needs a *verified* phone (bot contact message) for brand-new users; otherwise `UNAUTHENTICATED(phone_required)` → OTP flow → `linkMessenger`.
- **KYC**: national-id checksum, one account per national id, Shahkar match ⇒ `verified`; mismatch ⇒ rejected (nothing stored); outage ⇒ `pending` (admin approves). Trusted tier: ≥5 completed orders, ≥30 days, risk < threshold (flags `tier.*`).
- **Referrals** (anti-farming per CLAUDE.md §3): self/same-identity/blocked-referrer rejected, window 7 days, only before the first order, one referrer per customer; reward only after `qualifyReferral` (delivered order), paid through the wallet hook.
- **Catalog**: `data/catalog.json` today is a research file (`skus`, not runtime Products) — the loader reports `note` and uses defaults until calibration emits a `products[]` file in the runtime shape (see `ProductSchema` in `src/repos/schemas.ts`). Products table is re-seeded from the file/defaults on every start; overrides (active, margin, min margin, loss-leader, SLA) survive reloads. `catalog.minTierByRisk` flag gates risky products by tier (default permissive); transparency fields (`riskLabel`, `restrictionNoteFa` incl. provider fallback) are always returned.
- **JobRunner**: interval slots are epoch-aligned; daily/monthly slots follow IRST / Jalali calendars; missed slots run once; failures are recorded + deduped alert; `skipInitialCatchUp` seeds a slot without running.
- **node:sqlite** is loaded via `createRequire` with only its ExperimentalWarning suppressed (no global listener removal).
- Money columns are INTEGER; rates in `rate_snapshots` are REAL (market data).
- Passwords: scrypt N=2^14 live, N=2^10 elsewhere (fast demo/test seeding).

## Contract additions (additive)
- `DomainEvent` gained `{ type: 'settings.changed'; at; keys: string[]; actor?: string; scope: 'params'|'flag'|'catalog'|'killswitch' }` in `packages/contracts/src/events.ts`.

## How to extend (B3)
Add services in `src/services/*.ts` taking `AppContext` (`app.ctx`: clock, rng, ids, db, repos, bus, ports, logger, mode, masterKeyHex, params(), costs). Assign them in `createApp` to the matching optional slot of `AppServices` (tighten the `unknown` type), register jobs via `jobs.register`, add tables with `002_*.sql`. Use `db.tx` for every multi-row change; use repo `update(id, patch, expectedVersion)` for orders/tasks (CONFLICT on stale writes).
