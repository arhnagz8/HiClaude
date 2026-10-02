# Architecture v1 — Persian white-label FX/card reseller platform

Status: authoritative for all builders. Changes to anything marked **[CONTRACT]** must be additive and announced in your return value.
Companion docs: `sim-spec.md` (world simulator), `api-spec.md` (HTTP surface), `ux-spec.md` (written by the UX specialist), `docs/03-research/*` (facts), `data/*.json` (numbers).

---------------------------------------------------------------------------------------------------

## 1. Product in one paragraph
Customers (in Iran) pay in **Toman** (payment gateway, card-to-card with receipt, or USDT on-chain) and receive **foreign-currency digital services** under the
owner's brand: new virtual cards, card top-ups, vouchers/gift cards, "pay-on-your-behalf" services and subscriptions. The owner converts Toman → USDT at Iranian
exchanges, moves USDT to card providers/vendors, and keeps a margin. Prices are **fully dynamic** (USDT/IRT rate, exchange & provider fees, volatility buffer,
rush tier, payment-method fee, VAT, competitor guard). Work that cannot be automated is routed to **operators** with a task queue. Everything is driven through
**ports** so the same code runs against (a) a **simulated world** (mock adapters + agents + virtual clock) and (b) **live adapters**.

## 2. Principles
1. **One engine, many worlds.** `packages/app` is the only business engine. The API server, bots, the simulator and tests all call the same services.
2. **Ports & adapters.** Every external system is an interface in `packages/contracts/src/ports.ts`. Mock (`packages/sim`) and live (`packages/live`) implement them.
3. **Determinism.** Time only via `Clock`, randomness only via seeded `Rng`, ids only via `IdGen`. Same seed + scenario + decisions ⇒ identical ledger.
4. **Integer money.** Toman `Irt`, `MicroUsdt`, `UsdCents`, `Bps`. `decimal.js` for intermediate math, explicit rounding at boundaries. Never floats for balances.
5. **Double-entry ledger is the source of financial truth.** Every value movement posts balanced entries; reports are derived from the ledger only.
6. **Everything dynamic is a parameter.** Margins, buffers, tiers, caps, lock hours, fees live in `PlatformParams` (file defaults ← `data/config/*.json` ← DB overrides edited in admin).
7. **Fail closed.** Stale rates, provider failures, anomalies ⇒ kill switch pauses affected sales; never quote without a fresh rate snapshot.
8. **Transparent reseller.** Product/provider risk labels and restriction notes are first-class data and are shown to customers (see CLAUDE.md §3).

## 3. Repository modules and dependency rules
```
contracts  ←  core  ←  app  ←  api  (apps/api)
   ↑           ↑       ↑
   └───────────┴───────┴── sim (drives app through ports) ,  live (implements ports)
apps/web talks only to apps/api over HTTP (types from contracts).
```
- `contracts`: types, zod schemas, ports, params + defaults, calendar, Clock/Rng/IdGen. **No logic beyond tiny pure helpers.**
- `core`: pure functions, no I/O, no SQLite: pricing, rates aggregation, ledger templates, order state machine, treasury planner, risk policies, money math.
- `app`: services + SQLite repositories + jobs + event bus + `createApp(deps)`. Imports `core`, `contracts`.
- `sim`: imports `app` (to run it) + `contracts`. Never imported by `app`/`core`.
- `live`: imports `contracts` only (+ fetch). Fixture-tested.
- `apps/api`: imports `app`, `contracts`; optionally `sim` (demo mode) and `live`.
- Dependency direction violations are bugs.

## 4. Units, money, rates **[CONTRACT]**
| Name | Type | Meaning |
|---|---|---|
| `Irt` | integer | Toman (1 Toman = 10 Rial). Gateways/banks speak Rial → convert at the adapter boundary only. |
| `MicroUsdt` | integer | 1 USDT = 1,000,000. |
| `UsdCents` | integer | USD cents. Assumption: 1 USD of provider balance = 1 USDT (par); depeg risk is a param (`stablecoin.parHaircutBps`, default 0). |
| `Bps` | integer | 100 bps = 1%. |
| `EpochMs` | integer | UTC milliseconds. Display in IRST = UTC+03:30, no DST (since 2022). |
| rate | number (float) | Toman per 1 USDT, e.g. `257000.5`. Market data, not a balance. |

Rounding: customer-facing prices round **up** to `roundingStepIrt` (default 1,000); payouts/refunds round **down**; fees round **up**; revaluation rounds half-up; all via `core/money`.

## 5. Ledger **[CONTRACT]**
### 5.1 Model
- Functional currency **IRT**. Accounts have a `currency`: `IRT` or `USDT`.
- `JournalEntry { id, ts, kind, memo, refs{orderId?,paymentId?,...}, lines[] }`, `Line { account, qty, irt }`.
  - IRT account: `qty == irt` (Toman).
  - USDT account: `qty` in MicroUsdt, `irt` = book value in Toman. Revaluation lines have `qty = 0` and change only `irt`.
  - **Invariant: Σ `irt` over all lines of an entry = 0.** (Assert on every post; throw on violation.)
- Per-account balance = (qty, irt). Disposals of USDT use **weighted-average book cost** of the account: `irt = round(book_irt * qty_out / qty_balance)`.
- Statements derive from entries only: income statement (period), balance sheet (as of), cash-flow (indirect, from the same entries), trial balance.
- `balance sheet` must satisfy Assets = Liabilities + Equity at all times (retained earnings = cumulative P&L).

### 5.2 Chart of accounts (code — name — type — currency)
```
ASSETS
1010 BANK_IRT                      asset IRT   operating bank balance
1020 GATEWAY_RECEIVABLE            asset IRT   PSP funds verified but not yet settled
1100 EXCHANGE_IRT:<ex>             asset IRT   Toman balance at exchange <ex>
1110 EXCHANGE_USDT:<ex>            asset USDT  USDT at exchange <ex> (locked/unlocked tracked by Treasury lots)
1120 WALLET_USDT                   asset USDT  our on-chain hot wallet
1130 USDT_IN_TRANSIT               asset USDT  withdrawals/sweeps in flight
1200 PROVIDER_BALANCE:<prov>       asset USDT  balance held at card provider / vendor account
1300 PREPAID_INVENTORY             asset IRT   voucher/card inventory bought ahead (optional)
1400 VAT_RECEIVABLE                asset IRT   input VAT (optional)
LIABILITIES
2010 CUSTOMER_PREPAYMENTS          liab  IRT   paid orders not yet delivered (deferred revenue)
2020 CUSTOMER_WALLET               liab  IRT   Toman wallet balances owed to customers
2030 REFUNDS_PAYABLE               liab  IRT
2100 VAT_PAYABLE                   liab  IRT
2110 INCOME_TAX_PAYABLE            liab  IRT
2200 ACCRUED_EXPENSES              liab  IRT
EQUITY
3010 OWNER_CAPITAL                 equity IRT
3020 OWNER_DRAWINGS                equity IRT  (contra)
3900 RETAINED_EARNINGS             equity IRT  (derived at statement time; never posted directly)
REVENUE
4010 SALES_CARD_ISSUE   4020 SALES_TOPUP   4030 SALES_VOUCHER   4040 SALES_SERVICE   4050 SALES_RUSH_PREMIUM   4060 SALES_OTHER
4900 DISCOUNTS_AND_REFERRALS       contra-revenue
COST OF SALES
5010 COGS_PROVIDER_FACE            USDT consumed at book value (face value delivered)
5020 COGS_PROVIDER_FEES            provider issue/top-up/fx fees
5030 NETWORK_FEES                  on-chain + exchange withdrawal fees
5040 PAYMENT_FEES                  gateway, SMS OTP, identity inquiries
5050 EXCHANGE_FEES                 trading fees
5060 EXCHANGE_SPREAD_COST          (ask − mid) × qty at purchase
OPERATING EXPENSES
6010 SALARIES   6020 MARKETING   6030 HOSTING_TOOLS   6040 RENT_OFFICE   6050 LEGAL_ACCOUNTING   6060 SUPPORT_COSTS
6070 FRAUD_LOSSES   6080 REFUND_COSTS   6090 BANK_AND_MISC   6100 DEPRECIATION
OTHER
7010 FX_REVALUATION                gain(−)/loss(+) from marking USDT accounts to market   (shown as other income/expense)
7020 PENALTIES_FINES
8010 INCOME_TAX_EXPENSE
```
Dimensions: entries carry `refs` (orderId, productId, providerId, exchangeId, customerId, channel) so reports can slice margin by product / channel / provider.

### 5.3 Posting templates (the only ways value moves) **[CONTRACT]**
Notation: `P` customer price (Toman), `f` fee, `v` VAT, `q` USDT qty, `m` mid rate, `a` ask rate at execution.
| # | Event | Lines |
|---|---|---|
| E1 | Gateway payment verified | Dr 1020 `P−f`; Dr 5040 `f`; Cr 2010 `P` |
| E1b | Gateway settlement (T+n) | Dr 1010 `P−f`; Cr 1020 `P−f` |
| E2 | Card-to-card confirmed | Dr 1010 `P`; Cr 2010 `P` |
| E3 | USDT payment confirmed (q at mid m) | Dr 1120 (qty q, irt q·m); Cr 2010 (irt q·m) |
| E4 | Wallet spend | Dr 2020 `P`; Cr 2010 `P` |
| E5 | Delivery = revenue recognition | Dr 2010 `P`; Cr 4xxx `P−v−rush`; Cr 4050 `rush`; Cr 2100 `v`. Cost: Dr 5010 `face` + Dr 5020 `fees` (both = USDT book value at mark); Cr 1200:<prov> (qty u, irt book). Discounts: Dr 4900 |
| E6 | Provider top-up (sweep) | Dr 1200:<prov> (qty q, book); Cr 1130 or 1120 (qty q, book). Network fee: Dr 5030; Cr 1120 (qty fee) |
| E7 | IRT deposit to exchange | Dr 1100:<ex> `B`; Cr 1010 `B`; deposit fee Dr 6090 / Cr 1010 |
| E8 | Exchange buy (pay `B` Toman) | fee = `B·φ/(1+φ)`; notional = `B−fee`; qty = notional/a; Dr 1110:<ex> (qty, irt qty·m); Dr 5050 fee; Dr 5060 `notional−qty·m`; Cr 1100:<ex> `B` |
| E9 | Exchange withdrawal | Dr 1130 (qty out, book); Cr 1110:<ex> (qty out, book); fee: Dr 5030; Cr 1110 (fee qty) |
| E10 | Withdrawal arrival | Dr 1120 (qty, book); Cr 1130 (qty, book) |
| E11 | Daily revaluation | for each USDT account: `Δ = qty·m − book`; Dr/Cr account (qty 0, irt Δ); Cr/Dr 7010 |
| E12 | Refund before delivery | Dr 2010 `P`; Cr 2030 `P` (then payout: Dr 2030; Cr 1010 or 2020; fee Dr 6080) |
| E13 | Opex | Dr 6xxx; Cr 1010 (or 2200 if accrued) |
| E14 | Capital / drawings | Dr 1010; Cr 3010 / Dr 3020; Cr 1010 |
| E15 | Tax accrual / payment | Dr 8010; Cr 2110 / Dr 2110 (or 2100); Cr 1010 |
| E16 | Fraud/loss event | Dr 6070 (or 2010 if customer funds); Cr asset |
| E17 | Wallet top-up | Dr 1010 or 1020; Cr 2020 |
| E18 | Provider freeze/write-off | Dr 7020 or 6070 (qty out, book); Cr 1200:<prov> |
`core/ledger/templates.ts` implements each as a pure function returning `JournalEntryInput`; `app/ledger` posts them transactionally.

## 6. Order lifecycle **[CONTRACT]**
States: `awaiting_payment`, `payment_review`, `paid`, `risk_hold`, `queued`, `fulfilling`, `delivered`, `completed`, `expired`, `cancelled`, `failed`, `refund_pending`, `refunded`, `disputed`.
(`quoted` is a Quote object, not an order state: an order is created when the customer picks a payment method.)
| From | Event | To | Guard / side effects |
|---|---|---|---|
| — | `order.created` | awaiting_payment | quote valid; customer limits ok; payment intent created; `payExpiresAt` set by method |
| awaiting_payment | `payment.receipt_submitted` / `payment.detected` | payment_review | c2c receipt or chain tx below required confirmations |
| awaiting_payment, payment_review | `payment.confirmed` | paid | ledger E1/E2/E3/E4; customer notified |
| payment_review | `payment.rejected` | awaiting_payment | attempts < max else `cancelled` |
| awaiting_payment | `timer.pay_window` | expired | no payment; if late payment arrives → late-payment policy (§9.4) |
| paid | `risk.flagged` | risk_hold | operator review |
| risk_hold | `risk.cleared` / `risk.rejected` | queued / refund_pending | |
| paid | auto | queued | creates `FulfilmentTask(s)`; priority by rush tier |
| queued | `fulfilment.started` | fulfilling | requires provider funding available, else stays `queued` with `waitingFunding=true` |
| fulfilling | `fulfilment.completed` | delivered | store delivery payload (encrypted); ledger E5 (revenue + COGS) |
| fulfilling | `fulfilment.retry` | queued | transient failure, attempts < max |
| fulfilling | `fulfilment.failed` | failed | permanent; auto refund policy → refund_pending (or operator retry via another provider → queued) |
| delivered | `customer.confirmed` / `timer.auto_complete` | completed | |
| delivered | `customer.dispute` | disputed | |
| disputed | `dispute.resolved_refund` / `dispute.resolved_reject` | refund_pending / completed | |
| refund_pending | `refund.paid` | refunded | ledger E12 |
| awaiting_payment, payment_review | `customer.cancel` / `operator.cancel` | cancelled | |
Invalid transitions throw `AppError('ORDER_INVALID_TRANSITION')`. Every transition appends an `OrderEvent` and publishes a `DomainEvent`.

## 7. Pricing engine (core/pricing) **[CONTRACT: semantics]**
Pure function `priceQuote(input): QuoteComputation`. All numbers come from inputs (policy, rate snapshot, cost models); nothing hidden.
1. **Funding need** (USD → USDT par): `fundingUsd = A + (newCard ? issueFeeUsd : 0) + A·topupPct + topupFixedUsd + A·vendorFxPct + declineBufferUsd`; `fundingUsdt = fundingUsd·(1+haircut) + networkFeeAllocUsdt`.
2. **Acquisition cost (replacement)**: `unit = rate.executableAsk·(1+exchangeTakerPct)`; `C = fundingUsdt·unit`.
3. **Volatility buffer**: `buf = clamp(z·σd·√τlock + max(0,μd)·τlag + z·σd·√τlag, minPct, maxPct)` with `τlock = lockMinutes/1440` and `τlag = replenishmentLagDays` (inventory re-buy exposure, ≥ lock hours/24). σd and μd come from the rate snapshot (estimated), z default 1.64. Night-halt/stale snapshots add `haltPremiumPct`.
4. **Risk buffer**: `riskPct·C` (declines, refunds, support), param.
5. **Payment-method gross-up**: for fee function `fee(P)=min(cap, pct·P + fixed)`: `P = (T+fixed)/(1−pct)`; if `fee(P) > cap` then `P = T + cap`. (T = target net.)
6. **Margin**: `M = max(minMarginIrt, marginPct·C)`; customer-tier discount reduces `marginPct` (never below `floorMarginPct`); **competitor guard** (optional ref price `R`): ceiling = `R·(1+tolerancePct)`; if price > ceiling reduce M toward floor; if still above ⇒ `uncompetitive:true` (UI may hide "best price" badges; never sell below cost+minMargin unless product flagged `lossLeader`).
7. **Rush**: tier `{id, premiumPct, minPremiumIrt, slaMinutes, capacityPerHour}`; `rushIrt = max(minPremiumIrt, premiumPct·(C+buf+risk+M))`; capacity exhausted ⇒ tier unavailable (UI shows next slot).
8. **VAT** (if `vatApplies`): `vat = round(vatPct·net)`; shown as separate line.
9. **Rounding**: price rounded **up** to `roundingStepIrt`; rounding delta is booked as margin.
10. **USDT-pay variant**: `Pusdt = fundingUsdt·(1+usdtMarginPct)+ rush`, min margin in USDT, round up to 0.01 USDT; smaller buffer (no conversion, no FX exposure on receipt). Also returns Toman-equivalent at `executableBid` for display.
11. **Output**: itemised `lines[]` (service value, provider fees, FX/exchange costs, volatility buffer, payment fee, margin, rush, VAT, rounding), totals per payment method, `effectiveRateIrtPerUsd`, `lockedUntil`, `policyVersion`, `rateSnapshotId`, `uncompetitive`, `warnings[]`.
12. **Invariants (tested)**: price ≥ cost + minMargin (unless lossLeader); monotone in rate and in amount; rush ≥ normal; USDT-pay price ≤ Toman price at bid; idempotent; no NaN; integer outputs.

## 8. Rates (core/rates) and kill switch
- Inputs: `ExchangeTicker[]` per exchange + `ExchangeLimits` (trading open?, caps left) → `RateSnapshot`.
- `executableAsk` = cheapest ask among exchanges that are open and have remaining daily buy cap ≥ min order; otherwise `lastKnownAsk·(1+haltPremiumPct)` and `status:'halted'`.
- `executableBid` analogue for sells. `mid` = median of mids. Outlier rejection: drop exchanges deviating > `anomalyPct` from the median.
- `volatility`: EWMA of hourly log-returns → `dailyPct`; `driftPctPerDay` = EWMA of signed daily returns (floored at 0 for pricing). Windows/halflives are params.
- Status `stale` if newest ticker older than `staleAfterMs`; `anomaly` if cross-exchange dispersion > threshold. **Kill switch** (auto on stale/anomaly > N minutes; manual from admin): quotes refused with `RATES_UNAVAILABLE`; existing locked quotes stay valid until `lockedUntil`.

## 9. Services (packages/app) — responsibilities
| Service | Responsibilities |
|---|---|
| `CatalogService` | products (DB overrides over `data/catalog.json`), availability, per-product risk labels, "from" prices |
| `RateService` | polls `ExchangeAccountPort.ticker`, stores snapshots, exposes current snapshot, kill switch |
| `PricingService` | assembles `PricingInput` (policy + snapshot + cost models + competitor ref + customer tier), calls core, persists `Quote` |
| `CustomerService` | OTP/messenger identity, KYC tiers & limits, risk flags, referral codes, wallet |
| `OrderService` | create order from quote, state machine, timers, events, refunds |
| `PaymentService` | per-method intents: gateway create/verify (callback + poll), c2c unique amount + receipt + bank-statement matching, USDT address/amount allocation + chain polling + AML screen, wallet spend; late/under/over-payment policy; ledger E1–E4 |
| `FulfilmentService` | task creation, API dispatch to `CardProviderPort`, operator queue (claim/complete/fail/release), SLA timers, retries, delivery payload encryption, ledger E5 |
| `TreasuryService` | balances sync, USDT lots (lock/availability), demand forecast, replenishment plan + execution (buy/withdraw/sweep), reconciliation, ledger E6–E11 |
| `LedgerService` | post entries (transactional), statements, trial balance, queries |
| `NotificationService` | templates (`data/copy.fa.json`) → Telegram/Bale/SMS/in-app; per-event routing |
| `SupportService` | tickets, canned responses |
| `StaffService` | users, roles (RBAC), audit log, operator productivity stats |
| `ExpenseService` | recurring opex/payroll/tax accruals (driven by owner decisions) |
| `SettingsService` | param overrides with versioning + audit; feature flags; kill switches |
| `ReportService` | statements, KPIs (orders, AOV, take-rate, SLA, float utilisation, FX effect, cohort retention) |
| `Jobs` | registry of periodic jobs with `tick(now)` (see §10) |

### 9.4 Payment edge cases (must be implemented and tested)
- **Underpayment** (c2c/USDT less than expected): `payment_review`; customer may pay the difference within window, else partial refund minus fee.
- **Overpayment**: excess credited to `CUSTOMER_WALLET`.
- **Late payment** (after `payExpiresAt`): accept at locked price if adverse rate move < `latePayment.acceptIfMovePctBelow` and within `latePayment.graceMs`; otherwise re-quote with shortfall or refund (fee).
- **Duplicate receipt/txHash**: rejected; **wrong network/token** (USDT): flagged for operator, policy-based recovery fee.
- **Gateway verify mismatch** (amount/state): never fulfil; operator alert.
- **C2C unique amount**: `amount = quote + uniqueOffset (1..N Toman)` to disambiguate, matched to bank credits by (amount, time window, sender hint).

## 10. Jobs (virtual-clock driven) — `app.jobs.tick(now)`
| Job | Default cadence | Purpose |
|---|---|---|
| `rates.refresh` | 1 min live / 5 min sim | tickers → snapshot, vol estimate, kill-switch evaluation |
| `payments.poll` | 1 min | bank statement credits, chain transfers, gateway pending verifies |
| `orders.expire` | 1 min | pay windows, quote expiry, auto-complete |
| `fulfilment.dispatch` | 1 min | queued orders → API calls / operator queue (priority + SLA) |
| `fulfilment.sla` | 5 min | breach alerts, escalation |
| `treasury.sync` | 10 min | balances from ports, lock/unlock lots |
| `treasury.plan` | 30 min | replenishment plan → execute within caps/hours |
| `ledger.revalue` | daily 00:05 IRST | E11 |
| `gateway.settle` | daily | E1b |
| `expenses.recurring` | monthly (1st, IRST) | salaries etc. from owner decisions |
| `taxes.accrue` | monthly | VAT/income tax accrual |
| `reports.snapshot` | daily | KPI snapshot for charts |
| `risk.scan` | 10 min | velocity, anomaly, provider failure-rate kill switches |

## 11. Persistence
SQLite via **`node:sqlite`** (`DatabaseSync`, built into Node 22; no native build). WAL, foreign keys on, all writes in transactions, prepared statements.
Money columns INTEGER. JSON columns TEXT (validated by zod at the repository boundary). Migrations: ordered SQL files in `packages/app/src/db/migrations`.
Core tables: `customers, identities, sessions, products, product_overrides, quotes, orders, order_events, payments, bank_credits, chain_transfers, fulfilment_tasks, deliveries(encrypted),
usdt_lots, treasury_actions, rate_snapshots, ledger_accounts, ledger_entries, ledger_lines, settings, settings_audit, users, audit_log, tickets, ticket_messages, notifications, referrals, kpi_daily, jobs_state`.
Sim runs use `:memory:` (or a file for inspection). **Card PAN/CVV/voucher codes are stored envelope-encrypted** (AES-256-GCM, per-record data key wrapped by an app master key from env; demo uses a fixed dev key, clearly marked). Reveal = one-time token with TTL and audit.

## 12. Notifications
Events → templates → channels. Telegram/Bale via `MessengerPort`; SMS via `SmsPort` (OTP + critical status); in-app via SSE. Matrix and copy come from `data/copy.fa.json` (UX specialist). Notification failures never block order flow (retry queue).

## 13. Security
Customer auth: phone OTP (rate-limited, 5 attempts/hour) or messenger `initData` verification; cookie/JWT sessions. Admin/staff: password + TOTP (demo: simplified), RBAC roles
`owner|admin|operator|support|accountant|viewer`, full audit log. Input validation with zod everywhere. CSRF for cookie sessions, CSP, rate limiting, no PII in logs.
Secrets only from env (`.env.example`). Card data encrypted at rest; reveal requires step-up (OTP re-confirm) and is rate-limited. Receipt images stored as blobs on disk (hash-named) with size/type limits.

## 14. Demo mode (`npm run demo`)
`apps/api` boots `createApp()` with **sim adapters** and a live **World** (macro FX process, competitors, exchange/bank/chain/provider sims, optional customer/operator agent traffic).
The web app shows a **Simulation panel** (admin only): advance time, set speed, trigger scenarios/events (devaluation, halt, gateway outage…), watch rate board and prices update.
All calculations (quotes, margins, treasury plans, statements) update automatically as the simulated Rial moves.

## 15. Testing strategy
- `core`: unit + property tests (pricing invariants, ledger balance, state machine, treasury planner, rates).
- `app`: service tests on in-memory SQLite with fake ports; scenario tests for every payment edge case; job tests with `ManualClock`.
- `sim`: deterministic replay test (same seed ⇒ same ledger hash), statement identities (A = L + E), scenario smoke tests.
- `live`: fixture tests (recorded request/response JSON) per adapter; no network in CI.
- `web`: component tests for pricing display/formatting; Playwright E2E (system Chromium) for customer, operator, owner personas.
- Weak-AI readiness: each module README lists inputs, outputs, invariants and "how to extend".

## 16. Build & run
Root `package.json` workspaces: `packages/*`, `apps/*`. Scripts: `test`, `typecheck`, `validate:data`, `dev:api`, `dev:web`, `demo`, `sim`, `build`, `e2e`.
TypeScript strict, ESM, `tsx` runtime for Node entrypoints, Vite for web, vitest for tests. Workspace packages export TS source (`"exports": {".": "./src/index.ts"}`).
Concurrent installs: always `flock /tmp/hiclaude-npm.lock npm install ...`.

## 17. Configuration layering **[CONTRACT]**
`defaults (contracts/src/defaults.ts)` ← `data/config/*.json` (calibrated plain values, produced from research `data/*.json`) ← DB `settings` (admin edits, versioned).
`loadPlatformParams(dataDir)` merges and validates with zod. Research files (Records with provenance) are **not** read at runtime; a calibration step flattens them to `data/config/*.json` and keeps a `provenance` map for audit.

## 18. What is intentionally out of scope for the engine
Real bank/exchange credentials, real KYC vendors and real provider panels are only touched through `packages/live` adapters (fixture-tested here, enabled by the owner during go-live).
We do not implement evasion of KYC/AML, sanctions, geo-restrictions, borrowed identities or referral farming (CLAUDE.md §3).
