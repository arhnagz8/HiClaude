# Brief 02 — ir-exchanges-usdt-rails

**Goal:** Everything needed to model and automate Toman → USDT conversion: Iranian exchanges, fees, caps, locks, hours, APIs, price feeds, policy timeline.
**Deliverables:** `docs/03-research/02-ir-exchanges-usdt-rails.md`, `data/exchanges.json`, `data/regulatory_limits.json`, `scripts/research/02_conversion_cost.py`.

## Checklist
1. **≥12 exchanges** (Nobitex, Wallex, Bitpin, Ramzinex, Tabdeal, AbanTether, Exir, OMPFinex, Tetherland, Novin Tether, Excoino, Bit24, Arzinja, … verify which exist/operate in 2026).
   Per exchange: status; ownership; security incidents (Nobitex June-2025 hack and recovery); proof-of-reserves; **USDT/IRT trading fee by tier/volume**; typical spread vs mid;
   min order; user levels + KYC; deposit methods (gateway / Paya / Satna / card-to-card / ID-based "شناسه‌دار") and **per-day/per-tx caps**; Toman withdrawal caps/fees/cycles;
   crypto withdrawal caps/fees/minimums **per network** (TRC20, BEP20, TON, ERC20, Polygon, Solana, Arbitrum); address whitelisting; **post-deposit withdrawal lock (72h/48h/24h) and exceptions**;
   trading hours/maintenance; **API** (public price endpoints, private trading/withdraw, auth, rate limits, WebSocket) with exact paths where documented (else `UNVERIFIED`);
   OTC desk terms; business/institutional accounts.
2. **Policy timeline 2022→2026**: each rule's date, issuer (CBI / FATA / Shaparak / ministry), scope (per account / per national ID), enforcement behaviour, durability.
   Build the **current-state matrix** with confidence. Include the last 90 days: Mehr-1405 night halt (21:00–09:00) and 2,000 USDT/day purchase cap (temporary?), the ID-based deposit cap (25M Toman/24h), Dey gateway closure.
3. **P2P / OTC options and risks** (exchange P2P markets, Telegram OTC desks): fees, speed, fraud patterns, lawful safe practices (escrow, verified counterparties).
4. **Network economics** for provider deposits: fees/time/confirmations on TRC20 (energy/bandwidth), BEP20, TON, Polygon, Solana, Arbitrum; provider-supported networks; default + fallback; minimum-deposit traps; address-poisoning risks.
5. **Quantify** (Python): all-in Toman → "USDT credited at provider" cost for $25/$100/$500/$2000 per exchange (trading fee + spread + withdrawal fee + network).
6. **Price-feed design inputs**: documented public endpoints for USDT/IRT bid/ask/depth per exchange, update cadence, typical inter-exchange premium band; aggregators (Bon-Bast, AlanChand, TGJU).
7. **Treasury constraints**: how caps/locks/halts shape the float needed to sustain N dollars/day of demand — give formulas and a worked table.
   Lawful scale only: business accounts, OTC, higher KYC tiers, accounts genuinely owned by the business/real partners with consent. Never borrowed identities, rented cards, or splitting to dodge caps.

## JSON
`data/exchanges.json`: `{ "exchanges": [ { "id","name","status": <Record>, "fees": {"usdt_irt_taker_pct": <Record>, "usdt_irt_maker_pct": <Record>}, "deposit": { "gateway_cap_irt_per_day": <Record>, ... },
"withdraw": { "crypto_lock_hours_after_irt_deposit": <Record>, "network_fees": {"TRC20": <Record>, "BEP20": <Record>, ...}, "min": {...} }, "api": { "public_orderbook_url": <Record>, "auth": <Record>, "rate_limit": <Record> }, "levels": [...] } ], "conversion_cost_table": {...} }`
`data/regulatory_limits.json`: `{ "rules": [ { "id","issuer","scope","effective_from","effective_to|null","status":"active|expired|temporary","value": <Record>,"note" } ], "current_state": {...} }`
