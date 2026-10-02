# Builder brief B1 — `packages/core` (pure domain logic)

You are building the **pure, I/O-free domain core** of the platform. Read first: `/home/user/HiClaude/CLAUDE.md`, `docs/05-architecture/architecture.md` (esp. §4–§9), `packages/contracts/src/*` (types, params, ports).
You OWN only `packages/core/**` (plus `packages/core/README.md`). Do not edit other packages; if contracts need an additive change use the Edit tool (never Write) on the specific file and report it.
No git commit/push. Install deps with `flock /tmp/hiclaude-npm.lock npm install <pkg> -w @hiclaude/core`. Allowed deps: `decimal.js`, `@hiclaude/contracts` (workspace). No other runtime deps.

## Rules
- No SQLite, no fetch, no `Date.now()`, no `Math.random()`. Time and randomness are inputs (`now`, `Rng`).
- Money is integer; intermediate math with `decimal.js`; explicit rounding (customer prices **up**, payouts **down**, fees **up**).
- Every exported function has TSDoc and tests. Pure functions return new objects (no mutation of inputs).
- Public API is exported from `packages/core/src/index.ts`; document it in `packages/core/README.md` (how to call each module, invariants, examples) — other agents implement against that README.
- `npx tsc --noEmit -p packages/core` must pass and `npx vitest run packages/core` must be green.

## Modules to deliver

### 1. `money/` — Decimal helpers
`D(x)`, `mulDivRound(a,b,c,mode)`, `ceilToStep`, `floorToStep`, `bpsOf(amount,bps,mode)`, `pctOf`, `clamp`, `sumInts`. Safe-integer guards that throw `RangeError` on overflow/NaN.

### 2. `rates/`
- `aggregateRates({ now, tickers: ExchangeTicker[], limits: ExchangeLimits[], exchangesParams, prev?: RateSnapshot, vol, params }): RateSnapshot` per architecture §8:
  executableAsk/Bid from exchanges that are open and have cap left (record `executableAskExchangeId`); outlier rejection by `risk.killSwitch.anomalyPct` around the median; `status` ∈ ok/halted/stale/anomaly (never `killed` — that comes from the app's switch); when halted use `lastKnownAsk·(1+haltPremiumPct)`; `excluded[]` with reasons; `mid` = median of mids.
- `class VolatilityEstimator` — `push(ts, mid)`, `estimate(): {dailyPct, driftPctPerDay, windowHours}`. EWMA on hourly log-returns (resample irregular ticks to hourly), halflife param, minimum samples fallback (`defaultDailyPct` e.g. 1.2 %), drift = EWMA of signed returns scaled to per day. Must be deterministic and O(1) per push (ring buffer).
- `evaluateKillSwitch({ snapshot, history, params, now })`: returns `{ on:boolean, reason?:string }` per staleness/anomaly/dispersion rules.

### 3. `pricing/` — the dynamic pricing engine (architecture §7 is normative)
`priceQuote(input: PricingInput): QuoteComputation` — define and export these types. Requirements:
- Inputs include product, provider params (fees), exchange taker fee (of `executableAskExchangeId`), amount, rush tier id, `RateSnapshot`, `PricingPolicy`, `PaymentMethodsParams`, `TaxParams` (VAT), customer tier, optional competitor reference price, rush capacity availability, and `methods: PaymentMethod[]` to quote.
- Output per method: itemised `QuoteLine[]` (service value, provider fees, exchange cost, volatility buffer, risk buffer, payment fee, margin, rush, vat, rounding, discount), `totalIrt|totalMicroUsdt`, `feeIrt`, `effectiveRateIrtPerUsd`, availability + Persian reason when unavailable (method disabled, below min / above max / above per-card cap, tier not allowed, etc.). Lines must sum exactly to the total (rounding line absorbs the remainder).
- Also output: `fundingMicroUsdt`, internal `costIrt`, `marginIrt`, `UnitEconomics`, `uncompetitive`, `warnings[]` (e.g. halted rates widen buffer), `lockedUntil = now + lockMinutes`, and `breakdown` for admin ("why this price").
- Implement: funding need; replacement cost; volatility + replenishment-lag buffer (σ and μ from `rate.volatility`, drift floored by policy; extra `haltPremiumPct` when snapshot.status ≠ ok); risk buffer; gateway/c2c/bank fee **gross-up** with cap/fixed handling (closed form + cap branch); margin = max(minMargin, pct·cost) with family overrides, tier discounts and floor/max clamps; **competitor guard**; **rush tiers** with capacity availability; VAT; rounding up to `roundingStepIrt`; **USDT-pay variant** per §7.10 (smaller buffer: only lock-window σ, no conversion cost, margin `usdt.marginPct`, round up to `roundStepMicroUsdt`; also gives a Toman-equivalent at executableBid for display).
- `solvePriceForTargetMargin` helper (inverse) for admin "what-if" and the sim's owner agent: given a target net margin % return the price.
- `explainQuote(computation): string[]` (Persian/English bullet explanation for admin).
- **Invariants to test (property tests with seeded `createRng` loops ≥ 500 cases):** price ≥ cost + minMargin unless `lossLeader`; monotone non-decreasing in `executableAsk`, in amount and in volatility; rush ≥ normal; USDT-pay Toman-equivalent ≤ IRT price; lines sum to total exactly; integers only; no NaN/Infinity; idempotent; policy changes (margin ±) shift price in the expected direction; bigger `lockMinutes` ⇒ larger buffer.

### 4. `ledger/`
- `accounts.ts`: chart of accounts exactly as architecture §5.2 (code, name, type, currency), `acct(code, qualifier?)` → `"1110:nobitex"`, `accountMeta(code)`, `isUsdtAccount()`.
- `templates.ts`: one pure function per posting template **E1…E18** (§5.3) returning `JournalEntryInput` (inputs: amounts, rates, ids, `ts`). USDT disposal lines need book cost: accept `bookIrt` computed by the caller via `LedgerBook.disposeCost(account, qty)` OR provide `LedgerBook`-aware builders (`buildDelivery(book, ...)`). Document which.
- `book.ts`: `class LedgerBook` — in-memory double-entry engine: `post(entry)` (asserts Σirt = 0, per-account currency rules: IRT accounts qty==irt; USDT accounts may have qty=0 for revaluation lines; no negative USDT qty), `balance(account)`, `trialBalance()`, `disposeCost(account, qty)` (weighted-average book), `revalue(usdtAccounts, mid, ts) → JournalEntryInput` (E11), `snapshot()/restore()`. Used by tests, by the app's LedgerService for validation, and by the sim for fast assertions.
- `statements.ts`: pure builders from **movements**: `buildIncomeStatement(movements, period)`, `buildBalanceSheet(balances, asOf, usdtMarket)`, `buildCashFlow(openingBalances, movements, period)` (indirect; cash = 1010 + 1020 + 1100:* ; USDT inventory change shown as working capital; FX revaluation non-cash adjustment). Input type `AccountMovement { account, debitIrt, creditIrt, qtyDelta }` or equivalent; also helper `movementsFromEntries(entries)`. `check` fields must be exactly 0 in tests. Include `realTerms(statement, inflationIndex)` and `usdTerms(statement, mid)` converters.
- Tests: every template balances (Σirt=0) for random inputs; full-lifecycle test (deposit→buy→withdraw→sweep→order paid→delivered→revalue→refund) leaves A = L + E at every step; weighted-average cost correctness; revaluation sign conventions.

### 5. `orders/` — state machine (§6 normative)
`transition(order, event, ctx): TransitionResult` — pure; `OrderEventInput` union (payment_receipt_submitted, payment_detected, payment_confirmed, payment_rejected, pay_window_elapsed, risk_flagged, risk_cleared, risk_rejected, auto_queue, fulfilment_started, fulfilment_completed, fulfilment_retry, fulfilment_failed, customer_confirmed, auto_complete_elapsed, customer_dispute, dispute_resolved, refund_paid, customer_cancel, operator_cancel). Returns `{ to, effects: Effect[] }` where effects are declarative (`post_ledger:E2`, `create_tasks`, `notify:payment_confirmed`, `schedule_timer`, `start_refund`…). Throws `AppError('ORDER_INVALID_TRANSITION')` with `details {from,event}`. Export `allowedEvents(status)` and a Mermaid/ASCII diagram generator `renderStateMachine()` used by docs. Exhaustive table tests (every status × every event → expected or throws).

### 6. `treasury/`
- `UsdtLotBook` (FIFO): `addLot`, `consume(qty)` returns cost basis, `available(now)`, `lockedUntil`, `unlockSchedule(horizon)`, serialisation.
- `forecastDemand({ history: {day, usdtConsumedMicro}[], backlogMicro, params })` → EMA daily consumption + weekday factors.
- `planReplenishment({ now, state, limitsByExchange, rate, params, regulatory })` → ordered `TreasuryPlanItem[]` (types: `deposit_irt`, `buy_usdt`, `withdraw_usdt`, `sweep_provider`) respecting: exchange trading hours/night halt, per-user daily buy cap, per-ID deposit cap × `depositIdentitiesAvailable`, min order, withdraw min/fees/network, lock timing (don't plan a withdraw of locked lots; schedule it for `withdrawableAt`), cash reserve, provider `maxFloat` and `maxProviderShare`, coverage targets (`target/min/max CoverageDays`), cheapest exchange by all-in cost. Each item carries `blockedReason?` (Persian) when constraints prevent execution so the admin sees *why*.
- `coverage(state, params)`: `{dailyConsumption, targetFloat, effectiveFloat, coverageDays, shortfall}`; closed-form **required float** helper `requiredFloatUsdt(dailyUsdt, lockDays, lagDays, safetyDays)`; `conversionCost(...)` (all-in Toman → USDT credited at provider per exchange/network).
- Tests incl. scenarios: 72 h lock, night halt, 25 M/24 h deposit cap with 1 vs 3 identities, 2,000 USDT/day buy cap, provider float cap, shortage → plan sizes, surplus → no buy.

### 7. `risk/`
`assessOrder({ customer, product, amountUsdCents, method, recentOrders, openOrders, usedTodayUsdCents, params, now })` → `{ allow, reasonCodes, reasonFa, score, flags, limits }` (tier limits, velocity, high-risk product rules, c2c/usdt constraints, new-customer rush restrictions). `scoreCustomer(...)`. `providerHealth({ outcomes, window, threshold })` → degrade/kill decision. Deterministic, explainable.

### 8. `payments/`
`gatewayFee(amount, params)`; `grossUpForFee(target, feeFn)`; `makeUniqueAmount({ base, usedOffsets, maxOffset, rng })`; `matchBankCredits({ credits, pendingPayments, params, now })` → matches/ambiguities/unmatched with reasons (exact amount, window, sender hint, duplicate ref); `evaluateLatePayment({ lockedRate, currentRate, paidAt, expiresAt, params })`; `evaluateUsdtReceipt({ expected, received, network, token?, confirmations, required, tolerance })` → ok/underpaid/overpaid/wrong_network/needs_confirmations with excess/shortfall; `bankCreditDuplicate(...)`. All pure.

### 9. `sla/`
`estimateEta({ queueAheadByTier, staffOnShift, minutesPerTask, tier, now, businessHours })` and `rushCapacity({ tierParams, recentOrdersByTier, staffThroughput })` → availability + next slot. Used by UI and by pricing availability.

### 10. `calendar/`
Settlement helpers using contracts calendar: `nextBankBusinessDay(ms)`, `payaCycles(ms)`, `gatewaySettlementAt(paidAt, delayHours)` (skips Thu-pm/Fri/holiday list passed in), `isTradingOpen(ms, regulatory)`.

## Acceptance (all must hold)
- `npx tsc --noEmit -p packages/core` clean; `npx vitest run packages/core` green; ≥ 150 meaningful tests; no skipped tests.
- `README.md` documents each module with a runnable example.
- A worked example test reproduces the first-pass numbers (`scripts/pricing_model.py`: $100 top-up at 257,000 Toman/USDT) within the intended policy differences and documents the deltas.
- Return summary: files, public API list, invariants tested, assumptions you made, anything the app layer must know.
