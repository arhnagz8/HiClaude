# Brief 08 — macro-fx-scenarios

**Goal:** Calibrate the world simulator's macro layer from real history and build the scenario library.
**Deliverables:** `docs/03-research/08-macro-fx.md`, `data/fx_history.json`, `data/macro_calibration.json`, `data/scenarios/*.json` (one file per scenario), `data/calendar_ir.json`, `scripts/research/macro_calibration.py`.

## Checklist
1. **USDT/IRT (open-market dollar) history** 2018→2026: dated anchor points (monthly if possible; daily for the last 120 days) with sources; log-return statistics (daily vol by regime, skew, jump frequency/size, max drawdown, autocorrelation,
   weekday/night-gap behaviour); spread between exchanges; USDT premium vs cash dollar; official vs NIMA vs open-market rates. Compute in Python and store calibrated parameters.
2. **Inflation & costs**: CPI y/y (monthly if possible), wage growth, bank deposit rates, behaviour of USD-denominated assets as inflation hedge; Toman inflation of rent/salary/hosting/ads (for opex indexation in the sim).
3. **Event catalogue 2022-2026** with magnitude & duration: Feb-2026 war, internet shutdowns (Jan→May 2026), CBI interventions, night halts, caps, gateway closures (Dey), sanctions actions, hack incidents, Telegram/WhatsApp filtering changes.
4. **Demand response**: how Iranian demand for USD-denominated services moved around FX shocks (exchange volumes, competitor commentary, news) — direction and rough magnitude, with uncertainty.
5. **Scenario library** (one JSON each, parameterised): `base`, `mild-depreciation`, `devaluation-shock` (+20% in 3 days), `sustained-depreciation` (+60%/yr), `rial-recovery` (−15%), `volatility-spike`, `night-halt-and-cap`,
   `cbi-deposit-cap-cut-10m`, `gateway-blackout-21d`, `internet-shutdown-40d` (traffic −60%), `provider-freeze-10pct`, `sanctions-freeze-event`, `price-war-8pct`, `best-case-growth`, `worst-case`.
   Each: process parameters (drift, vol, jump intensity/size, regime-switch matrix), demand multipliers by segment, supply-side effects, duration, rationale and citations.
6. **Calendar**: Iranian public holidays 1405-1408 (Persian calendar; Nowruz period; Thursday/Friday weekend; bank/Paya non-settlement days); seasonality indices (day-of-week, month, Nowruz, exam seasons).

## JSON
`data/macro_calibration.json`: `{ "usdt_irt": { "spot": <Record>, "regimes": [ {"name","daily_vol": <Record>,"drift_daily": <Record>,"jump_rate_per_year": <Record>,"jump_mean": <Record>,"jump_sd": <Record>} ], "transition_matrix": [[...]], "weekday_effect": {...}, "inter_exchange_premium_pct": <Record> },
"inflation": { "annual_pct": <Record>, "wage_growth_pct": <Record> } }`. Scenario files: `{ "id","title","description","duration_days","fx": {...}, "demand_multipliers": {...}, "supply_effects": [...], "events": [ {"day","type","params"} ], "sources": [...] }`.
