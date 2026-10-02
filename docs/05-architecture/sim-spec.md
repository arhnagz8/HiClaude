# World Simulator spec v1 (`packages/sim`)

Goal: run the **real application code** (`createApp`) inside a deterministic simulated world for years of virtual time, starting from zero (capital only), and produce
**true financial statements from the ledger** plus operational KPIs — under many macro/regulatory scenarios. Models, not forecasts: every report lists assumptions and sensitivity.

## 1. Time & determinism
- `SimClock` (extends `ManualClock`), event queue ordered by `(time, priority, seq)`; **no wall-clock, no Math.random, no Date.now.**
- Named RNG streams: `rng.fork('macro')`, `'demand:<segment>'`, `'ops'`, `'exchange:<id>'`, `'provider:<id>'`, `'competitor:<id>'`, `'fraud'`, … Adding a stream must not perturb others.
- Iteration over maps/sets must be in insertion/sorted order. Same `(scenario, seed, decisions, code)` ⇒ identical ledger hash (`manifest.json` stores it).
- Calendar: IRST (UTC+03:30). Iranian weekend = Friday (Thursday half-day for banks; Paya/Satna do not settle Thu-afternoon/Fri/holidays). Public holidays from `data/calendar_ir.json`
  (fallback: built-in Nowruz 1–4 & 12–13 Farvardin etc. in `contracts/calendar`). Jalali month/day available for reports.
- Stepping: the runner pops events; between events it calls `app.jobs.tick(now)` on a cadence (5 simulated minutes during 08:00–24:00 IRST, 30 minutes otherwise, and always when an event has occurred).

## 2. World components (each implements contract ports; each has unit tests)
| Component | Implements | Behaviour |
|---|---|---|
| `MacroEngine` | — | USDT/IRT mid-price process; inflation index; demand multiplier; regime switching |
| `ExchangeSim` ×N | `ExchangeAccountPort` (+ ticker) | spread, premium, depth impact, fees, **trading hours / night halt**, per-ID **deposit cap**, **withdrawal lock after IRT deposit**, daily buy cap, network fees, outages, freezes |
| `BankSim` | `BankPort` | our account; c2c credits with delay; Paya/Satna payouts with cycle schedule; gateway settlements |
| `GatewaySim` | `PaymentGatewayPort` | pay page, success/abandon rates, verify, fees, downtime windows, T+n settlement |
| `ChainSim` | `ChainPort` | per-network block time/confirmations/fees, deposit addresses, transfers, AML screen outcomes |
| `ProviderSim` ×P | `CardProviderPort` (+ operator panel facade) | fee schedule, balance, issue/top-up latency & failures, merchant decline model, freeze/exit risk, API vs panel mode |
| `MessengerSim`, `SmsSim`, `IdentitySim` | respective ports | record messages, costs; shahkar/card-owner lookups |
| `CompetitorSim` ×K | — | price policies, rate-lag, promos, entry/exit, price wars; exposes `CompetitorPricePort` to the app |
| `DemandEngine` | — | customer arrivals, segment behaviour, seller choice (logit), payment mistakes, repeat/referral/churn |
| `Marketing` | — | channel spend → signups with saturation; CAC dynamics |
| `Reputation` | — | trust score from delivery speed/failures/reviews; feeds choice & word of mouth |
| `OperatorPool` | uses `app.services.fulfilment` | shifts, speed, error rates, salaries, overtime for rush |
| `SupportDesk` | uses `app.services.support` | ticket generation & resolution capacity |
| `EventScheduler` | — | scenario events (CBI cap cut, halt, gateway blackout, internet shutdown, provider freeze, sanctions action, hack, price war) |
| `OwnerAgent` | uses admin services | policy rules + decision-file hooks; monthly/quarterly decisions |
| `Accountant` | uses `app.services.reports` | month-end statements, identities, digest, hash |

### 2.1 MacroEngine (calibrated from `data/macro_calibration.json`)
- Log-price `x_t`: Markov regime switching `{calm, stress, crisis, recovery}` with per-regime daily vol, drift, jump rate/size; transition matrix per day.
- Overlays: `shock {atDay, pct, durationDays}` (devaluation), `trend {pctPerYear}`, `recovery {pct, days}`, `volatility_spike`.
- Intra-day: weekday effect, night-gap (exchanges halted 21:00–09:00 ⇒ OTC price drifts, exchange price jumps at open).
- Also: `cashDollarPremium`, `inflationIndex(t)` (Toman CPI; salaries/rent/hosting index with lag), `demandMultiplier(t)` (FX stress raises urgency for some segments, lowers affordability for others), `rialStrength = 1/mid`.
- Output API: `mid(t)`, `tickerFor(exchange, t)`, `inflation(t)`, `scenarioState(t)`.

### 2.2 Demand (segments from `data/ops_growth.json`; ≥8 segments)
Per segment: share, arrival rate λ(t)=base·season(t)·macroDemand(t)·marketing(t)·reputation(t), basket distribution over catalog SKUs, amount distribution (lognormal), price sensitivity β_p, speed sensitivity β_s, trust sensitivity β_t, preferred payment methods, channel affinity (web/telegram/bale), fraud propensity, repeat process (Weibull/geometric inter-purchase times with satisfaction), referral coefficient.
Seller choice: multinomial logit over {us} ∪ competitors with utility `U = −β_p·ln(price/ref) − β_s·ln(slaMinutes) + β_t·trust + ε`; outside option = no purchase. Our `price` is the real quote from `PricingService`.
Customer actions through real services: register (OTP), quote, order, pay (method-specific, with mistakes: wrong amount, wrong network, late, duplicate, abandon), receive delivery, confirm/dispute/ticket, repeat.
Fraud segment: fake receipts, stolen-card chargebacks proxies, account takeover attempts — drives `risk` rules and `FRAUD_LOSSES`.

### 2.3 Operators & support
Staff = `{id, role, shift(IRST), tasksPerHour by task type (lognormal), errorRate, salaryIrt/month, overtimeMult}`. They pull from the real operator queue ordered by priority/SLA, take simulated time, then `complete/fail`. Errors create refunds/reworks.
Hiring/firing by `OwnerAgent`. Utilisation and SLA are first-class KPIs.

### 2.4 Competitors
`{id, strategy: follow|undercut|premium|erratic, markupPct (from data/competitors.json distribution), repricingLagHours, promoCalendar, trust, sla}` per product family; price = `theirCost(t − lag) · (1+markup)` + noise; entry/exit with hazard rates; price-war overlay.

### 2.5 OwnerAgent
Deterministic baseline policy (parametrised), evaluated daily/weekly/monthly:
- **Pricing**: nudge `marginPct` by product family to hit a target conversion/win-rate band; widen buffers when realised FX loss > threshold.
- **Treasury**: set target coverage days; capital injections when runway < N days; owner draws when cash > threshold.
- **Staffing**: hire when queue-age p90 > SLA for k days; fire/reduce when utilisation < u for k weeks.
- **Marketing**: monthly budget = f(cash, CAC/LTV); channel mix.
- **Provider/exchange mix**: switch if failure rate or fees worse by margin.
- **Risk**: enable/disable products by risk label, tighten limits after fraud spikes.
Decision-file hook: `decisions.json` = `[{ "date":"2027-01-01","type":"set_margin","family":"ai_subscription","marginPct":0.14 }, ...]` validated by zod (`OwnerDecisionSchema`); applied at the stated date. LLM owner persona writes this file between checkpoints; the sim re-runs deterministically (replay) to the next checkpoint and emits `digest.json` (KPIs, cash, float, rate path, alerts, last decisions).

### 2.6 Accountant
Month-end: income statement, balance sheet, cash flow, KPI row; assertions (A = L+E; Σ entries = 0; unit reconciliation: ledger USDT qty = Σ(exchange + wallet + provider + in-transit) per port balances). Also an inflation-adjusted view (real Toman at start-date prices) and USD view (at mid).

## 3. Scenario format (`data/scenarios/<id>.json`; schema in `packages/sim/src/scenario/schema.ts`)
```
{ "id","title","description","start":"2026-10-02","years":3,
  "capital": { "initialIrt": 500000000, "injections": [...] },
  "macro": { "calibration": "default|<file>", "overlays": [ {"type":"shock","atDay":120,"pct":0.2,"durationDays":3}, ... ] },
  "demand": { "marketMultiplier": 1.0, "segmentOverrides": {...}, "elasticityMultiplier": 1.0 },
  "supply": { "exchanges": {...overrides}, "providers": {...}, "gateway": {...} },
  "regulatory": [ {"day":300,"type":"cbi_deposit_cap","valueIrt":10000000,"durationDays":null}, {"day":420,"type":"night_halt","from":"21:00","to":"09:00","dailyBuyCapUsdt":2000,"durationDays":5}, ... ],
  "events": [ {"day":500,"type":"gateway_blackout","durationDays":21}, {"day":600,"type":"provider_freeze","provider":"mpay","fractionFrozen":0.1}, ... ],
  "competition": { "priceWar": {"day":200,"discountPct":0.08,"durationDays":45}, "entryHazardPerYear":0.5 },
  "owner": { "policy": "baseline|conservative|aggressive", "overrides": {...} },
  "seeds": [1,2,3] }
```
Required scenario set (≥ 10): `base`, `mild-depreciation`, `devaluation-shock`, `sustained-depreciation`, `rial-recovery`, `volatility-spike`, `night-halt-and-cap`, `cbi-deposit-cap-cut`,
`gateway-blackout`, `internet-shutdown`, `provider-freeze`, `sanctions-freeze`, `price-war`, `best-case`, `worst-case`.

## 4. CLI (`packages/sim/src/cli.ts`; root scripts)
```
npm run sim -- --scenario base --seed 1 --years 3 [--start 2026-10-02] [--capital 500000000] [--out reports/<run>] [--db reports/<run>/app.sqlite]
              [--decisions path.json] [--until 2027-04-01] [--digest path.json] [--policy baseline] [--quiet]
npm run sim:suite -- --scenarios all --seeds 3 --years 3           # runs matrix, writes reports/suite-<ts>/
npm run sim:compare -- reports/a reports/b ...                      # comparison table + HTML
npm run sim:sensitivity -- --scenario base --params margin,drift,cac,elasticity --seeds 5
```
## 5. Outputs (`reports/<run>/`)
`manifest.json` (scenario, seed, params hash, code version, ledger hash), `statements.json` (monthly IS/BS/CF + identity checks), `kpis_daily.json`,
`orders_summary.json` (by product/segment/channel/method), `treasury.json` (float, coverage, lots, buys/sweeps, FX gain/loss), `operators.json`, `competitors.json`, `events.jsonl`,
`summary.md` (Persian + English headline: revenue, gross margin, net profit, cash, runway, break-even date, ROI on capital, max drawdown, SLA, refund/fraud rates, key assumptions),
`report.html` (self-contained, inline-SVG charts, RTL Persian labels with English fallbacks), `digest.json` (owner checkpoint).
KPIs (definitions in `packages/sim/src/kpi.ts`): orders, GMV (Toman & USD), AOV, take-rate = (revenue − COGS)/GMV, gross margin %, contribution margin, net margin, CAC, LTV (cohort), payback, repeat rate, retention cohorts,
conversion (visit→signup→first order), SLA attainment by tier, fulfilment time p50/p90, queue age, refund rate, fraud loss rate, support tickets per 100 orders, float utilisation, coverage days, realised/unrealised FX result, provider/exchange concentration, operator utilisation.

## 6. Performance & scale targets
≥ 300 orders/s headless on 4 CPUs (SQLite `:memory:`, WAL not needed), 3 simulated years in ≤ 10 minutes at ~150 orders/day average; memory < 2 GB. Report generation < 30 s.
Use batching/transactions per tick; avoid per-event JSON serialisation in hot paths; ring buffers for histories.

## 7. Validation & tests
Identity checks every month-end; replay determinism (two runs equal); scenario smoke (each scenario runs 90 days in < 60 s); property tests for exchanges (locks, caps), chain (confirmations), provider (fees),
macro (positivity, calibrated moments within tolerance of `macro_calibration.json`); conservation of USDT units; "no free money" test (sim never creates value outside ports).

## 8. Persona runs (LLM personas) — separate from the headless sim
Short-horizon (≈14 simulated days) sessions through the **real UI** with Playwright against `npm run demo`: customer personas (≥5), operator persona, owner persona (reviews dashboard, changes margin, buys float, triggers an event).
The `/api/sim/*` control endpoints advance virtual time so a persona can see rate moves and re-pricing. Each persona writes a report (what they did, friction, income/outcome, screenshots). See Phase 5.
