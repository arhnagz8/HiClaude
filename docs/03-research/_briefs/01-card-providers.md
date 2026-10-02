# Brief 01 — card-providers

**Goal:** Everything about mpay.cards and every credible alternative that could supply the owner with USDT-funded virtual cards
or voucher/gift-card inventory — fees, limits, KYC, reliability, API/reseller availability — with Iran-eligibility judged candidly.
**Deliverables:** `docs/03-research/01-card-providers.md`, `data/providers.json`, `scripts/research/01_provider_costs.py`.

## Checklist
1. **mpay.cards / app.mpay.cards** — entity, jurisdiction, team, funding (Dec-2025 $3M round: verify), launch/domain age; product line (virtual, physical roadmap);
   plans/tiers (card-country choice); networks/BINs/regions/billing-address behaviour; **complete fee table** (account, issue ≈$4.99?, min load ≈$25?,
   top-up % and fixed, network/deposit fees, non-USD FX, declines, inactivity, freeze/closure, refund/withdraw of unused balance);
   limits (per card/day/month/balance); funding networks (TRC20/BEP20…), min deposit, credit time, confirmations; KYC stance and what triggers it;
   supported/blocked merchants & MCCs, known decline patterns (AI vendors, ads, travel); ToS highlights (prohibited uses, restricted jurisdictions,
   termination, forfeiture, liability); support channels and response; uptime/incident history; **every review source** (Trustpilot, scam-checkers, Reddit,
   Persian forums/Telegram) summarised with dates; evidence of any API / B2B / partner / reseller / affiliate / referral programme and its mechanics.
2. **≥10 alternatives** (e.g. PintoPay, Wanttopay, VirtCardPay, AnyXPay, uCards, Kripicard, PayX, MPChat/MP Card, RedotPay, Cryptomus, plus any others you find):
   issuer/jurisdiction, same fee fields, API/reseller/B2B availability, KYC, **Iran-eligibility wording from ToS (quote it)**, incidents, networks.
3. **Voucher / gift-card aggregators with APIs and crypto payment** (Bitrefill, Reloadly, CryptoRefills, Coinsbee, Piaxis, …): API terms, catalogue, Iran-eligibility,
   reseller discounts/commission.
4. **Card-issuing-as-a-service / BIN sponsors** (Stripe Issuing, Marqeta, Lithic, Rain, Reap, Wallester, …): realistic eligibility for an Iranian-operated business
   (state candidly, with evidence), and what a lawful path would require (legal counsel). No circumvention structures.
5. **Normalised all-in provider cost** (Python) for $25 / $50 / $100 / $500 top-ups and "new card + top-up", per provider, with assumptions explicit.
6. **Supplier strategy**: primary / secondary / contingency, counterparty-risk mitigations (float caps, sweep cadence, reconciliation, monitoring signals).
7. **ProviderAdapter capability matrix**: operations each provider really exposes (issue, top-up, reveal details, freeze, balance, webhooks, rate limits) → what must be operator-assisted.

## data/providers.json structure
```
{ "providers": [ { "id": "mpay", "name": "...", "url": "...", "type": "usdt_card|voucher_api|baas",
   "jurisdiction": <Record>, "fees": { "issue_usd": <Record>, "min_load_usd": <Record>, "topup_pct": <Record>, "topup_fixed_usd": <Record>,
   "network_fee_usdt": <Record>, "fx_pct_non_usd": <Record>, "decline_fee_usd": <Record>, "monthly_usd": <Record> },
   "limits": { ... }, "networks": <Record(array)>, "kyc": <Record>, "iran_eligibility": <Record>, "api": <Record>, "reseller_program": <Record>,
   "reputation": { "trustpilot": <Record>, "incidents": <Record(array)> }, "capabilities": { "issue": "api|operator|none", ... } } ],
  "normalized_cost_table": { "<provider>": { "topup_25": <Record>, "topup_100": <Record>, ... } } }
```
