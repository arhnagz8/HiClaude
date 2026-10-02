# Builder brief B5 — `packages/sim` engine (demand, agents, owner, accountant, runner, reports, CLI)

Prerequisites (verify first; stop and report if missing): `packages/core` (B1), `packages/app` foundation + engine (B2, B3: `createApp`, `app.facade`, `app.services`, `app.jobs`), `packages/sim` world (B4: `createWorld`, components, scenarios).
Read first: `/home/user/HiClaude/CLAUDE.md`, `docs/05-architecture/sim-spec.md` (**normative**), `architecture.md`, `packages/sim/README.md` (world), `packages/app/README.md` (facade/services), `packages/contracts/src/*`, research outputs if present: `data/ops_growth.json`, `data/competitors.json`, `data/macro_calibration.json`, `data/calendar_ir.json`, `data/scenarios/*.json`, `data/risk_register.json` (**tolerate absence and Record wrappers `{value,...}`; ship built-in defaults**).
You OWN `packages/sim/src/{demand,agents,owner,accounting,runner,reports,kpi}/**`, `packages/sim/src/{cli,suite,compare,sensitivity}.ts`, tests, and `data/sim/*.json` (your config files). Do not rewrite B4 world files (additive Edit only; report).
No git commit/push. Installs via `flock /tmp/hiclaude-npm.lock npm install …`. `npx tsc --noEmit -p packages/sim` and `npx vitest run packages/sim` must pass.

## Non-negotiables
1. **The simulation drives the REAL application** (`createApp` with `world.ports()`), through `app.facade`/services only. No parallel re-implementation of pricing, orders, payments, treasury or ledger. Statements come from `app.services.ledger`/`reports`.
2. **Determinism**: `(scenario, seed, decisions, code)` ⇒ identical ledger hash. No wall-clock, no `Math.random`, stable iteration, named RNG forks per stream.
3. **Honest modelling**: every behaviour parameter is explicit, documented with its source (research file or "assumption"), overridable by scenario; reports list assumptions and run sensitivity.
4. Guardrails (CLAUDE.md §3) apply to the *simulated actors too*: the fraud segment exists to stress risk controls, not to model evasion tooling for real use.

## Deliverables

### demand/
- `Segments`: ≥ 8 segments (student, freelance developer, designer, gamer, small-business ads manager, importer/trader, immigration/exam applicant, traveller, parent paying tuition, **fraudster** (low share)). Per segment: share, base arrival rate, basket distribution over catalog SKUs/families, amount distribution (lognormal on USD), price sensitivity β_p, speed sensitivity β_s, trust sensitivity β_t, payment-method preferences, channel affinity (web/telegram/bale), repeat-purchase process (inter-purchase time distribution; satisfaction dependent), referral propensity, fraud propensity. Source from `data/ops_growth.json`/`competitors.json` when present else documented defaults.
- `DemandEngine`: arrivals via **15-minute buckets** (Poisson(λ·Δt)) with diurnal profile (IRST: peak 20–23, trough 03–07), weekday/month seasonality (Nowruz, exam seasons from `data/calendar_ir.json` or built-ins), `macro.demandMultiplier(t)`, marketing effect, reputation effect, competitor price effect. Seller choice: multinomial logit over {us, competitors, outside option} with our **real quote** (call `facade.quote` for a representative cart, cached per (family, amount bucket, rush, rate snapshot) to keep it fast) vs `CompetitorSim.priceIndex`.
- `CustomerAgent` lifecycle through the real API surface: register (OTP via SmsSim code), KYC when needed, quote, create order (method per segment preference & limits), pay with **method-faithful mechanics** (gateway: `gateway.simulateCustomerPayment`; c2c: transfer at the exact unique amount via `bank.injectCustomerTransfer` + receipt submission, with mistakes (wrong amount, late, duplicate, abandoned); USDT: `chain.injectIncoming` with underpay/overpay/wrong-network mistakes; wallet), wait, confirm/reveal, dispute/ticket when SLA missed or failure, repeat/referral/churn. Satisfaction model updates `Reputation`.
- `Marketing`: channels (SEO, Telegram channels, Instagram, Bale/Eitaa, influencers, price-comparison sites, referral, B2B) with spend→signup saturation curves, CAC dynamics; budget set by owner decisions.
- `Reputation`: trust ∈ [0,1] updated by SLA outcomes, failures, refunds, reviews; decays; feeds conversion & word-of-mouth.
- Fraud actors: fake receipts, stolen-cardholder disputes (proxy), account-takeover attempts, velocity abuse — exercised against `core/risk`; losses booked via the app (E16) when they slip through.

### agents/
- `OperatorPool`: staff `{id, role, shift (IRST), tasksPerHour by kind (lognormal), errorRate, salaryIrt/month, overtimeMult}`; pulls from the **real operator queue** (`facade.admin.tasks`, claim → work (virtual time) → complete/fail) using `ProviderPanel` for panel-mode providers; error → rework/refund; utilisation stats; hiring/firing API for the owner.
- `SupportDesk`: ticket generation from delays/failures; resolution capacity & quality.
- `CompetitorResponse` hooks (price changes already in `CompetitorSim`).

### owner/
- `OwnerAgent` with a **baseline rule policy** (parametrised: `conservative|baseline|aggressive`): pricing (nudge margin by family to a conversion/win-rate band; widen buffers after FX loss), treasury (coverage days, capital injections when runway < N days, draws above a cash threshold), staffing (hire when queue-age p90 > SLA for k days, reduce when utilisation low), marketing budget (f(cash, CAC/LTV)), provider/exchange mix (switch on failure/fees), risk (tighten limits after fraud spikes), tax/VAT payments, monthly/quarterly cadence. Every decision is logged (`decisions.log.json`) with rationale + KPIs seen.
- `OwnerDecisionSchema` (zod) and **decision-file hook**: `--decisions path.json` list of `{date, type, ...}` applied at the date: `set_margin{family,marginPct}`, `set_buffers`, `set_rush{tier,premiumPct,minPremiumIrt,capacityPerHour}`, `set_target_coverage{days}`, `hire_operator{count,shift}`, `fire_operator`, `set_marketing_budget{monthlyIrt,mix}`, `capital_injection{irt}`, `owner_draw{irt}`, `switch_provider{productId|family,providerId}`, `set_product_active`, `set_risk_limits`, `run_promotion{family,discountPct,days}`, `kill_switch{on,reason}`. Used by the LLM owner persona and by scenario analysis.
- `digest.json` writer (for owner checkpoints): last period KPIs, statements headline, cash/runway, float/coverage, rate path summary, alerts, SLA, top issues, last decisions.

### accounting/
`Accountant`: month-end (IRST/Jalali month boundaries) statements from the app ledger; **identity checks** (A = L + E; Σentries = 0; USDT unit conservation vs port balances; revenue in statements = Σ delivered orders' revenue lines; order-level unit economics sum to ledger gross profit within rounding); nominal / inflation-adjusted (real) / USD views; `ledgerHash()`; break-even date, runway, ROI on capital, max drawdown, payback.

### runner/
`runSimulation(opts): Promise<RunResult>` — creates clock/world/app/agents; loop: pop world+agent events, call `app.jobs.tick(now)` per cadence (see sim-spec §1), step demand buckets, owner schedule, accountant month-ends; progress callback; `--until` support; resumable by deterministic replay; performance: ≥ 300 orders/s headless (profile and optimise hot paths: batch transactions per tick, cache quotes, avoid per-event allocations); memory < 2 GB for 3 years @ ~150 orders/day. Expose `createDemoSim(app, world)` for the API's demo mode (`/api/sim/*`: advance minutes, speed, scenario switch, event injection, state snapshot → `SimStateDto`).

### reports/
Self-contained `report.html` (no external CDN; inline SVG charts; RTL Persian with English fallbacks; print-friendly): headline cards (revenue, gross profit, net profit, cash, runway, break-even, ROI, SLA), monthly income statement table, balance sheet, cash flow, charts: revenue & profit by month, margin by product family/provider/channel, USDT/IRT path with regime shading and event markers, float & coverage days, cash balance, orders & AOV, CAC/LTV/cohort retention heatmap, SLA & queue age, operator utilisation, refund/fraud rates, FX revaluation vs operating profit, competitor price index vs ours. `summary.md` (Persian + English), `statements.json`, `kpis_daily.json`, `orders_summary.json`, `treasury.json`, `operators.json`, `competitors.json`, `events.jsonl`, `manifest.json` (scenario, seed, params hash, git rev if available, ledger hash, runtime).
`compare.ts`: multi-run comparison table + HTML (deltas vs base). `sensitivity.ts`: one-at-a-time sweeps (margin ±, drift, vol, CAC, elasticity, lock hours, deposit cap, provider failure rate) × N seeds ⇒ tornado chart + table. `suite.ts`: scenario × seeds matrix ⇒ `reports/suite-<ts>/index.html` with ranking and per-scenario links.

### data/sim/
`segments.json`, `marketing.json`, `staff.json`, `owner_policies.json` (documented defaults; each value carries a `source` string; plain values, not Records).

## Tests (≥ 100) and acceptance
Unit: demand arrival statistics, logit choice, retention/referral maths, owner policy rules, decision schema, accountant identities, report generation. Integration: **30-day base run** completes < 60 s with all identity checks passing; determinism (two runs ⇒ same ledger hash; different seeds differ); each of the 15 scenarios runs 60 days without invariant violations; fraud agents produce losses ≤ expected bounds; devaluation shock raises quoted prices within the buffer window (assert quote responds to rate changes); gateway blackout shifts payment mix; provider freeze triggers failover; night halt + caps constrain treasury buys; deposit-cap scenario reduces sustainable GMV. A full **3-year `base` run** executes (record runtime) and writes the complete report folder.
`packages/sim/README.md` updated: architecture diagram, parameters table, CLI usage, report guide, how to add a scenario/segment/decision type.

## Return
Files, CLI usage, runtime/throughput measurements, headline numbers of the 3-year base run (revenue, net profit, cash, break-even date), assumptions & parameter sources, deviations, open issues.
