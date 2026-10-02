# Brief 04 — legal-tax-compliance-ir

**Goal:** Map the Iranian legal / tax / regulatory obligations and *lawful* structures for this business, with exact steps, costs and timelines to register and operate; produce Persian customer-facing and internal legal templates. (Analysis — not legal advice; say so.)
**Deliverables:** `docs/03-research/04-legal-tax-ir.md`, `data/tax.json`, `data/legal_checklist.json`, and templates in `docs/08-compliance-risk/templates/`:
`terms-of-service.fa.md`, `privacy-policy.fa.md`, `refund-policy.fa.md`, `risk-disclosure.fa.md`, `kyc-aml-policy.fa.md`.

## Checklist
1. Legal status of crypto & FX-related services in Iran (2026): CBI, parliament, Cyber Police (FATA), Ministry of Industry (e-commerce), Shaparak, CBI crypto-asset regulation/نظام‌نامه; mining vs trading.
   How a **reseller of foreign digital services paid in Toman** is classified; the line between "digital-goods reseller" and "unlicensed exchange house / PSP", and what crosses it.
2. **Entity options**: individual / sole proprietor / LLC (مسئولیت محدود) / joint-stock — registration steps, documents, **costs and timelines in 2026**, Chamber of Commerce, tax ID (کد اقتصادی), Enamad requirements,
   online-seller licence categories, .ir/.com domain rules, hosting-in-Iran requirements.
3. **Taxes**: VAT rate in 1405 and whether it applies to our services (resale of foreign digital services; FX margin); income-tax brackets/rates for individuals vs legal entities;
   treatment of FX gains/inventory revaluation; **Moadian e-invoicing** obligations/thresholds/penalties; bank-account turnover tax triggers; bookkeeping; withholding; deadlines.
4. **AML**: obligations for non-bank businesses (customer due diligence, record retention, suspicious-transaction reporting, thresholds).
5. **Consumer & e-commerce law**: mandatory disclosures, 7-day withdrawal right and exceptions for digital goods, refund rules, dispute channels, data-protection/data-residency expectations, advertising rules (e.g. claims like "legal/licensed"), liability for third-party suspension.
6. **Sanctions exposure for an Iranian operator** as described by credible sources — describe exposure and compliant behaviour only, no avoidance structures.
7. **Criminal-law risk areas** for card/USDT intermediaries (being used by fraudsters, account rental, laundering predicates) and how legitimate operators protect themselves (KYC, logs, cooperation with authorities).
8. **Lawful scale paths**: business accounts, PSP/gateway, licensed partnerships/OTC, regulated cooperation.
9. A **checklist with cost/time per step** and a **go/no-go risk matrix** (what must be true before launching; what would force a pause).
10. Persian templates: practical, with `[placeholders]`, plain language, include third-party-suspension disclosure, refund tiers by fulfilment mode, price-lock terms, rush-tier terms, KYC/AML internal policy. Mark "needs lawyer review".

## JSON
`data/tax.json`: Records for vat_rate_pct, corporate/individual brackets, moadian thresholds, turnover-tax triggers, penalties, filing deadlines. `data/legal_checklist.json`: ordered steps with `cost_irt`, `duration_days`, `prerequisites`, `owner_action`, `source`.
