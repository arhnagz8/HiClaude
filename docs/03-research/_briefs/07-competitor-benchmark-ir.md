# Brief 07 — competitor-benchmark-ir

**Goal:** Map the Iranian competitive landscape (virtual cards, FX payments, subscription resale, gift cards, exam/embassy payments); extract price/fee/UX/trust structures and elasticity evidence for the simulator.
**Deliverables:** `docs/03-research/07-ir-competitors.md`, `data/competitors.json`, `scripts/research/07_markup_stats.py`.

## Checklist
1. **≥20 competitors** (cafearz, almaspayment, arzipay, paybal, 20payment, tehranpayment, dollarisho, giftcard98, license-market, hyper-acc, jib.store, digitalro, farakonesh, kifpool, ایرانی‌کارت, … and any bigger ones you discover).
   For each: what they sell; **price list** (issue fee, top-up fee %, fixed fee, minimums, USD sell rate vs the market rate on the same date → effective markup); payment methods; delivery SLA; support channels/hours;
   trust signals (Enamad, years online, reviews on nazarkade / Trustpilot / Telegram); loyalty/referral programmes; bot / mini-app presence; complaint patterns (nazarkade, X, forums);
   **how quickly they re-price after FX moves** (evidence of rate-update cadence); rush/express products and premiums.
2. **Derive**: distribution of effective markups (median/IQR/p10/p90) by product family; fee-structure archetypes; positioning gaps; UX patterns worth copying/avoiding; marketing channels.
3. **Customer choice model** — evidence on price vs trust vs speed; estimated price elasticity (state method and uncertainty); seasonality (Nowruz, exam seasons, Black-Friday), segment behaviours.
4. **Market size** — bottom-up estimate with assumptions (users, spend per user, share served by resellers); clearly marked as estimate with a low/base/high range.
5. **Price-war dynamics** — historical episodes of undercutting; typical response patterns.

## JSON
`data/competitors.json`: `{ "competitors": [ { "id","name","url","segments":[...], "enamad": <Record>, "price_points": [ {"product","price_irt","usd_equiv","fx_rate_same_day","effective_markup_pct","as_of"} ], "repricing_cadence_hours": <Record>,
"payment_methods":[...], "delivery_sla_minutes": <Record>, "trust_score_est": <Record>, "notes": "" } ], "markup_stats": { "<product_family>": {"median": <Record>, "p10": <Record>, "p90": <Record>} }, "elasticity": { "price": <Record>, "speed_premium_willingness_pct": <Record> }, "market_size": {"low": <Record>, "base": <Record>, "high": <Record>} }`.
