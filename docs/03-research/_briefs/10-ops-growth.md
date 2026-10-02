# Brief 10 — ops-growth

**Goal:** Operating model and growth model for an Iranian online FX-services reseller, quantified for the simulator (CAC, conversion, retention, support load, staffing, costs).
**Deliverables:** `docs/03-research/10-ops-growth.md`, `data/ops_growth.json`, and Persian SOPs in `docs/07-operations/`: `sop-order-fulfilment.fa.md`, `sop-treasury-reconciliation.fa.md`, `sop-support-scripts.fa.md`, `sop-incident-runbook.fa.md`, `kpi-dashboard.fa.md`.

## Checklist
1. **Routines & SOPs (fa)**: order intake → payment verification → fulfilment → QC → delivery → support → reconciliation → treasury replenishment → price review → incidents; shift schedules; staffing ratios per volume (orders per operator-hour by task type);
   error rates; training; security hygiene; handover; escalation matrix; **support macros in Persian** (declined card, wrong network, late payment, refund, vendor suspended the account, price changed during checkout).
2. **KPI definitions & targets**: SLA, first-response, fulfilment time by tier, refund rate, fraud rate, NPS, take-rate, float utilisation.
3. **Growth unit economics in Iran**: organic Persian SEO (keyword volumes), Telegram channels/ads availability, Instagram/Aparat/Eitaa/Rubika/Bale, influencer/seller partnerships, university/freelancer communities, B2B accounts (agencies, dev shops), referral programme design & typical payouts,
   content marketing, price-comparison sites (Torob/Emalls) fees/CPC → **CAC ranges, visit→signup→first-order conversion, AOV, repeat/retention curves, referral coefficient, seasonality**; legal limits on marketing claims.
4. **Trust-building playbook** (Enamad, reviews, transparency, SLA guarantees, sample orders) and **reputation dynamics** (effect of a failure or a negative-review wave on conversion).
5. **≥8 customer personas/segments** (student, freelancer dev, designer, gamer, small-business ads manager, importer, immigration applicant, traveller, parent paying tuition, …) with order profiles (basket, frequency, price sensitivity, channel).
6. **Costs 2026**: salaries (support/operator/dev) in Toman, co-working/office, tools, payroll/insurance, hosting; inflation indexation assumptions.
7. **Competitor-response & price-war** defensive moves; loyalty tiers.
8. **Fraud ops**: fake-receipt detection checklist, velocity rules, step-up verification, lawful blacklist norms, dispute handling for C2C/gateway/USDT.
9. **First-90-days launch plan** with budget & milestones under 50M / 300M / 1B Toman starting capital.

## JSON
`data/ops_growth.json`: Records for channels (cac_irt, conversion, saturation), segments (share, aov_usd, orders_per_year, price_sensitivity, preferred_channel), retention curve, referral coefficient, staffing (orders_per_operator_hour by task), salaries, opex lines, error/refund/fraud rates, SLA targets.
