---
title: Card providers, voucher aggregators and issuing platforms - cost, eligibility, strategy
owner_agent: 01-card-providers
as_of: 2026-10-02
confidence: low
status: draft
---

# Card providers (mpay.cards and alternatives) - USDT-funded virtual cards and voucher inventory

> **EVIDENCE WARNING (read first).** In this run the session's WebSearch budget was exhausted (200 of 200 calls) before any query could be made, and every provider/aggregator domain returned `EGRESS_BLOCKED` on WebFetch (mpay.cards, trustpilot.com, pintopay.com, bitrefill.com, reloadly.com, wanttopay.com, virtcardpay.com, redotpay.com, docs.stripe.com; one attempt each, per protocol). **No provider page, ToS, review page or API doc was seen first-hand by this specialist.** The mandate asked for 40+ searches; **0 were possible.** Everything below is therefore (a) the repo's first-pass research (secondary, itself compiled from search summaries), (b) specialist 05/06 outputs, (c) clearly labelled analyst recollection, or (d) `null` + `UNVERIFIED` + `verify_how`. Overall confidence is **low**. The file is useful as a *structure, cost model, decision gate and verification plan*, not as a fact base. Section 9 lists the exact searches to run once the budget is raised, so the brief can be re-run cheaply.

## خلاصه (برای مالک)

- **هیچ تأمین‌کننده‌ای هنوز «تأییدشده» نیست.** در این اجرا امکان جست‌وجو و بازکردن سایت‌ها نبود؛ همه‌ی ارقام کارمزد از تحقیق اولیه (منبع ثانویه) آمده و باید با یک تست واقعی کوچک تأیید شوند.
- **mpay.cards (طبق منابع ثانویه):** صدور ویزاکارت مجازی ۴٫۹۹ دلار، حداقل شارژ ۲۵ دلار، کارمزد ماهانه صفر، شبکه‌های TRC20 و BEP20. **درصد کارمزد شارژ منتشر نشده**؛ برای محاسبه موقتاً ۳٪ فرض شده (بازه ۰ تا ۵٪).
- **API و پارتنری:** برای mpay هیچ API عمومی یا برنامه‌ی ری‌سلر/ریفرال مستند پیدا نشد (نبودِ مدرک ≠ مدرکِ نبود). پس همه‌ی عملیات کارت باید **توسط اپراتور در پنل** انجام شود (`ManualPanelProvider`).
- **مهم‌ترین ریسک، «اجازه‌ی شرایط استفاده» است نه کارمزد:** تبلیغ «بدون KYC» یعنی ثبت‌نام آسان؛ نه اینکه ToS استفاده‌ی ساکن ایران را مجاز می‌داند. اگر ToS ایران را ممنوع کرده باشد، حساب بسته یا موجودی نگه‌داشته می‌شود. **قبل از هر خرید جدی، پاسخ کتبی پشتیبانی** درباره‌ی پذیرش مشتری ایرانی بگیرید و ToS را ذخیره کنید.
- **اعتبار:** امتیاز Trustpilot حدود ۳ از ۵ با شکایت «پول بلوکه شد/پشتیبانی جواب نمی‌دهد» (منبع ثانویه، بدون تاریخ). ریسک نگه‌داری وجه بالاست؛ سقف موجودی و شارژ لحظه‌ای (JIT) الزامی است.
- **هزینه‌ی واقعی برای کارت جدید کوچک سنگین است:** با فرض ۳٪، صدور کارت جدید + شارژ ۲۵ دلاری حدود ۲۳٪ بالاسری دارد (۵٫۷۴ دلار)؛ شارژ ۱۰۰ دلاری حدود ۸٪ و ۵۰۰ دلاری حدود ۴٪. پس محصول «کارت جدید با شارژ کم» باید حداقل فروش یا قیمت‌گذاری ویژه داشته باشد (برای بالاسری ≤۸٪ شارژ ≥ حدود ۱۰۰ دلار).
- **جایگزین‌ها (طبق منبع ثانویه):** VirtCardPay صدور ۳$ + حدود ۴٪؛ PintoPay صدور حدود ۳۵$ + حدود ۲٫۵٪؛ Wanttopay صدور رایگان + ۰٫۳۰$ برای هر تراکنش؛ AnyXPay صدور ۵۰$ + ۴٪. بقیه‌ی گزینه‌ها (uCards، Kripicard، PayX، RedotPay، Cryptomus، …) فعلاً **هیچ داده‌ای** ندارند.
- **فروشگاه‌های گیفت‌کارت (Bitrefill، Reloadly، …) و پلتفرم‌های صدور کارت (Stripe، Marqeta، Lithic، Wallester، …):** برای اپراتور ساکن ایران عملاً غیرقابل‌دسترس‌اند؛ مسیر قانونی فقط از طریق مشاور حقوقی و یک نهاد دارای مجوز با افشای کامل مالکیت است، نه پنهان‌کردن هویت یا مکان.
- **راهبرد:** هیچ تأمین‌کننده‌ای «اصلی» نیست تا سه شرط برآورده شود: تأیید کتبی پذیرش، تست زنده‌ی کوچک، بازبینی ToS توسط مشاور. تا آن زمان سامانه در حالت mock/دستی بماند. سقف موجودی هر تأمین‌کننده ≤۵٪ سرمایه و مدت نگه‌داری ≤۳ روز.
- **این سند مشاوره‌ی حقوقی یا مالیاتی نیست**؛ با وکیل و مشاور مالیاتی دارای مجوز تأیید کنید.

## TL;DR

- Evidence status: **0 searches, 0 provider pages fetched**; all provider facts are secondary (repo first-pass) or `UNVERIFIED` (as_of 2026-10-02).
- mpay (secondary): issue **USD 4.99**, min load **USD 25**, monthly **USD 0**, networks **TRC20 + BEP20**; top-up % **unpublished** (placeholder 3.0 %, band 0-5 %); no public API; no partner/referral programme found.
- With the 3.0 % placeholder, mpay overhead above face: top-up only 25/50/100/500 -> **USD 0.75 / 1.50 / 3.00 / 15.00** (3.0 % flat); new card + load -> **USD 5.74 / 6.49 / 7.99 / 19.99** = **22.96 % / 12.98 % / 7.99 % / 4.00 %** of face.
- New-card economics are dominated by the fixed issue fee: for overhead <= 8 % the minimum new-card load is about **USD 99.80**; <= 10 % -> **USD 71.29**; <= 5 % -> **USD 249.50** (mpay, 3 % placeholder).
- Cheapest reported new-card overhead at USD 100: mpay 7.99 (placeholder %), VirtCardPay 7.00, Wanttopay 3.30 (placeholder %), PintoPay 37.75, AnyXPay 54.00. Rankings flip if the placeholders are wrong; do **not** price from this table before a live test.
- Counterparty-loss prior (judgemental, from specialist 05): **2.455 % of float per month**; holding USD 100 for 3 days costs an expected **USD 0.2455**; 30 days -> **USD 2.455**. This is small versus fees *if* float is JIT and tiny, and dominant if float is hoarded.
- Eligibility: **no provider has confirmed Iran-resident business eligibility.** Default for every provider = `unknown_assume_ineligible_until_written_confirmation`; BaaS/issuers and exchange-issued cards = `ineligible_expected`.
- Capability matrix default: all card operations = **panel/operator**; only voucher aggregators and BaaS are plausibly API-first, and both are expected to be ineligible.
- Supplier gate: written eligibility reply + one small live test + counsel-reviewed ToS snapshot before any provider is "primary"; float cap <= 5 % of equity per provider and <= 3 days.
- Not legal advice; guardrails (CLAUDE.md section 3) respected: no KYC/geo/sanctions evasion advice appears here.

## Facts table

| id | fact | value | unit | as_of | confidence | source ids |
|---|---|---|---|---|---|---|
| F01 | mpay product | USDT-funded virtual Visa; physical card "coming soon / selected countries" | - | 2026-10-02 | low | S1 |
| F02 | mpay issue fee (virtual card) | 4.99 | USD, one-off | 2026-10-02 | low | S1 |
| F03 | mpay minimum card load | 25 | USD | 2026-10-02 | low | S1 |
| F04 | mpay monthly fee / account creation | 0 / 0 | USD | 2026-10-02 | low | S1 |
| F05 | mpay top-up % | null (unpublished); placeholder 3.0, band 0-5 | pct | 2026-10-02 | low | S1, S3 |
| F06 | mpay deposit networks | TRC20, BEP20 | - | 2026-10-02 | low | S1 |
| F07 | mpay KYC stance | marketed "no KYC"; triggers unknown | - | 2026-10-02 | low | S1 |
| F08 | mpay API / partner / reseller / referral | none found (absence not proof) | - | 2026-10-02 | low | S1 |
| F09 | mpay Trustpilot | ~3 of 5; complaints: blocked funds, no refund, no support; undated | score | 2026-10-02 | low | S1 |
| F10 | mpay card region | Singapore (reported); billing-address mismatch at sensitive merchants (e.g. OpenAI) | - | 2026-10-02 | low | S1, S4 |
| F11 | mpay Dec-2025 USD 3M round | single secondary mention; amount/date/investors unverified | USD | 2026-10-02 | low | S1 |
| F12 | mpay domain age | registered 2025 (young) | - | 2026-10-02 | low | S1 |
| F13 | PintoPay | issue ~35, load ~2.5 %, ~0.25 "transaction", monthly 0 | USD / pct | 2026-10-02 | low | S1 |
| F14 | VirtCardPay Basic | issue 3 + ~4 % load; 0 % on purchases | USD / pct | 2026-10-02 | low | S1 |
| F15 | Wanttopay Prepaid | issue 0; 0.30 per transaction; monthly 0; load % unknown | USD | 2026-10-02 | low | S1 |
| F16 | AnyXPay | issue ~50 + 4 %; variable | USD / pct | 2026-10-02 | low | S1 |
| F17 | Provider hazards (any severe event, one grey provider) | ~4.4 % per month, ~42 % per year (judgemental) | pct | 2026-10-02 | low | S2 |
| F18 | Expected loss rate on float | 2.455 % of float per month (derived) | pct | 2026-10-02 | low | S2, calc |
| F19 | AWS signup rejects prepaid cards | reported (card-class fact) | - | 2026-10-02 | medium | S4 |
| F20 | Binance stated policy blocks Iran-based users; enforcement gaps reported | policy stated; do not rely on gaps | - | 2022 / 2026-10-02 | low | S5 |
| F21 | Exchange USDT withdrawal fee (TRC20) used in cost model | ~1 | USDT | 2026-10-02 | low | S1 (specialist 02 owns) |

## Details

### 1. mpay.cards

**1.1 Identity and track record (what is and is not known).** Per the repo first-pass [S1], mpay presents itself as a "Web3 payment platform" issuing USDT-funded virtual Visa cards usable wherever Visa is accepted (Amazon, Netflix, AI tools); a physical card is announced as "coming soon / selected countries"; a USD 3M raise was reported for Dec 2025 (single mention, **unverified**: amount, date and investors need a primary press release); the domain was registered in 2025. Legal entity, jurisdiction, licences, team: **not retrieved** (`jurisdiction = null`). Card region is reported as Singapore (BIN/issuer unverified). Verify: Whois of mpay.cards, ToS "company" clause, press release search, LinkedIn/Crunchbase.

**1.2 Fee table (all `low` confidence; source S1 unless stated).**

| Fee field | Value | Status |
|---|---|---|
| Account creation | USD 0 | reported |
| Virtual card issue | USD 4.99 per card, one-off | reported |
| Minimum load | USD 25 | reported |
| Monthly | USD 0 | reported |
| Top-up % | **not published**; placeholder 3.0 % (lead assumption [S3]); peers 2.5-4 % | UNVERIFIED |
| Top-up fixed | null | UNVERIFIED |
| Network/deposit fee (provider side) | null | UNVERIFIED |
| Non-USD FX % | null | UNVERIFIED |
| Decline fee | null | UNVERIFIED |
| Inactivity / dormancy | null | UNVERIFIED |
| Freeze/closure | null | UNVERIFIED |
| Refund / withdrawal of unused balance | null (critical for trapped-balance risk PRV-11) | UNVERIFIED |

**1.3 Limits.** Spend limited to loaded balance (reported). Per-day / per-month / per-card balance caps, minimum deposit, credit time, confirmations: all `null` (verify in the in-account limits screen and with a minimal test deposit).

**1.4 KYC.** Marketed as "no KYC" and available "in most regions subject to regulation" [S1]. This is marketing, not a ToS permission for Iran-resident customers. What triggers KYC (volume, region, merchant, withdrawal) is unknown. Providers marketed as no-KYC commonly reserve the right to request KYC retroactively and to withhold funds on non-response; **verify the clause** and treat any KYC prompt as a monitoring signal that cuts the float cap (section 6).

**1.5 Merchants and declines.** Reported: billing-address mismatch with Singapore-region cards at OpenAI-type gateways [S1, S4]; AWS signup rejects prepaid cards [S4]; Google Cloud trial may reject prepaid (low) [S4]. Everything else (ads platforms, travel, AI vendors) is untested: **a USD 5 test per merchant class** is the verification path (specialist 06 + ops). Caution: *tuning billing details to get past a merchant's geography check would be evasion*; our approach is to label the product, disclose the risk and drop SKUs that need a mismatching address.

**1.6 ToS highlights, support, uptime, incidents.** Not retrieved. Reported complaint themes (undated) [S1]: "scam", funds not returned, support not replying, funds blocked; scam-checkers (gridinsoft, scamadviser) flag the domain with caution scores (scores not captured). No confirmed outage log. Verify: Trustpilot newest 20 reviews with dates, Reddit, Persian Telegram groups/forums, three test support tickets (measure response time).

**1.7 API / B2B / partner / reseller / referral.** None found by the first-pass [S1]; the absence of public docs is not proof of absence of a private programme. Action: email/ticket "business/API/white-label access?" and record the reply. **Do not build revenue on referral mechanics**: multi-account referral farming is prohibited (CLAUDE.md section 3.1); the owner's margin must come from the sale price to customers.

### 2. Alternatives (at least 10 named; only four carry any fee data)

| id | Provider | Reported fees (S1, all low) | Eligibility (Iran) | API / reseller | Role |
|---|---|---|---|---|---|
| pintopay | PintoPay | issue ~35; load ~2.5 %; ~0.25 transaction; monthly 0 | UNKNOWN -> assume ineligible | unknown | secondary candidate, expensive issue |
| virtcardpay | VirtCardPay (Basic) | issue 3; load ~4 %; 0 % on purchases | UNKNOWN -> assume ineligible | unknown | secondary candidate, cheapest issue |
| wanttopay | Wanttopay (Prepaid) | issue 0; 0.30 per transaction; monthly 0; load % unknown | UNKNOWN -> assume ineligible | unknown | contingency |
| anyxpay | AnyXPay | issue ~50; 4 %; variable | UNKNOWN -> assume ineligible | unknown | contingency only |
| ucards | uCards | null | UNKNOWN | unknown | backlog |
| kripicard | Kripicard | null | UNKNOWN | unknown | backlog |
| payx | PayX | null | UNKNOWN | unknown | backlog |
| mpchat | MPChat / MP Card | null | UNKNOWN | unknown | backlog (identity unclear) |
| redotpay | RedotPay | null | UNKNOWN; recollection (unverified): large regulated-style players restrict sanctioned jurisdictions | unknown | backlog |
| cryptomus | Cryptomus | null | UNKNOWN | unknown | backlog |
| binance_card, bybit_card | exchange-issued cards | null | `ineligible_expected` (KYC'd exchange account + stated geo-blocking [S5]) | n/a | excluded |

**Iran-eligibility quotes required by the brief: not obtained.** The ToS pages could not be fetched, so no clause is quoted; `iran_eligibility` carries the value `unknown_assume_ineligible_until_written_confirmation` for every provider and the verification step is mandatory. Never substitute a guess for a quote in the engine: the pricing engine and catalog must treat `UNVERIFIED` eligibility as "provider disabled in live mode".

### 3. Voucher / gift-card aggregators (crypto-payable, API)

Candidates: Bitrefill, Reloadly, CryptoRefills, Coinsbee, Piaxis. Nothing retrieved. Recollection, **unverified, not for money use**: Bitrefill and Reloadly offer business/API access with reseller pricing; marketplaces of this type generally list comprehensively sanctioned jurisdictions (including Iran) as restricted; and the brands behind gift cards are frequently region-locked, so a voucher sold to an Iranian end customer may be unusable or revocable. Fields to capture on the re-run: API terms, catalogue breadth, discount vs face by brand, payment coins, KYB requirements, Iran wording, reseller/affiliate commission. Operational stance: voucher SKUs ship only with `risk_label: high` + restriction note unless an aggregator confirms in writing.

### 4. Card-issuing-as-a-service / BIN sponsors (candid eligibility)

Stripe Issuing, Marqeta, Lithic, Rain, Reap, Wallester (and similar): all are KYB-gated, sanctions-screened, scheme-regulated (Visa/Mastercard programme rules, BIN-sponsor bank obligations). For an **Iran-resident or Iran-controlled operator serving Iran-resident cardholders** the realistic eligibility is **ineligible**:
- US-based platforms (Stripe, Marqeta, Lithic and their sponsor banks) are subject to OFAC rules that broadly bar services to Iran (general legal knowledge, **recollection, not verified in this run**; verify with counsel).
- Non-US issuers (e.g. an Estonia-licensed issuer, a Hong Kong issuer) apply their own sanctions policy and scheme rules; assume refusal of an Iran-nexus programme.
- **Lawful path (no circumvention):** engage a sanctions/payments lawyer; ask whether any licensed issuer will onboard a programme whose real beneficial owner and end-customers are Iran-resident; if the answer is no, do not restructure the programme through nominees, shell entities, or false location/ownership statements. Disclosure of true ownership and customer geography is the non-negotiable condition. Realistic result: no BaaS for the first 12 months; stay on third-party card providers *if and only if* they confirm eligibility, otherwise sell products that do not need a foreign card.

### 5. Normalised all-in provider cost (Python: `scripts/research/01_provider_costs.py`)

Formulas (USD): `topup_cost(A) = A*pct/100 + fixed`; `overhead(A,new) = (issue if new) + topup_cost(A) (+ network_fee/batch)`; `overhead_pct = overhead/A*100`; `counterparty_loss(A,d) = A * 2.455% * d/30`. Assumptions: issue fee additive to the load; `fixed` = the "transaction" fee charged once per load (conservative; ambiguous per-spend vs per-load); network fee = exchange TRC20 withdrawal ~1 USDT per sweep (specialist 02 owns the live value); placeholders for unknown percentages: mpay 3.0 %, Wanttopay 3.0 %. IRT illustration uses 256,900 IRT/USDT (S1; perishable).

**5.1 Overhead above face value (USD, excluding network fee) - central case**

| Case | mpay (3 % placeholder) | VirtCardPay | Wanttopay (3 % placeholder) | PintoPay | AnyXPay |
|---|---|---|---|---|---|
| top-up 25 | 0.75 (3.00 %) | 1.00 (4.00 %) | 1.05 (4.20 %) | 0.875 (3.50 %) | 1.00 (4.00 %) |
| top-up 50 | 1.50 (3.00 %) | 2.00 (4.00 %) | 1.80 (3.60 %) | 1.50 (3.00 %) | 2.00 (4.00 %) |
| top-up 100 | 3.00 (3.00 %) | 4.00 (4.00 %) | 3.30 (3.30 %) | 2.75 (2.75 %) | 4.00 (4.00 %) |
| top-up 500 | 15.00 (3.00 %) | 20.00 (4.00 %) | 15.30 (3.06 %) | 12.75 (2.55 %) | 20.00 (4.00 %) |
| new card + 25 | **5.74 (22.96 %)** | 4.00 (16.00 %) | 1.05 (4.20 %) | 35.875 (143.5 %) | 51.00 (204 %) |
| new card + 50 | 6.49 (12.98 %) | 5.00 (10.00 %) | 1.80 (3.60 %) | 36.50 (73.0 %) | 52.00 (104 %) |
| new card + 100 | **7.99 (7.99 %)** | 7.00 (7.00 %) | 3.30 (3.30 %) | 37.75 (37.75 %) | 54.00 (54.0 %) |
| new card + 500 | 19.99 (4.00 %) | 23.00 (4.60 %) | 15.30 (3.06 %) | 47.75 (9.55 %) | 70.00 (14.0 %) |

In Toman at 256,900 IRT/USDT: mpay new card + 25 = about 1,474,606 IRT; new card + 100 = about 2,052,631 IRT overhead; top-up 100 = 770,700 IRT. Network fee adds USD 1.00 per top-up if every order sweeps separately (batch 1) and USD 0.10 if amortised over 10 orders; batching is therefore worth about USD 0.90 per order at a USD 1 fee.

**5.2 Sensitivity (mpay, new card + load): overhead % of face by assumed top-up %**

| top-up % | 25 | 50 | 100 | 500 |
|---|---|---|---|---|
| 0 | 19.96 | 9.98 | 4.99 | 1.00 |
| 1 | 20.96 | 10.98 | 5.99 | 2.00 |
| 2 | 21.96 | 11.98 | 6.99 | 3.00 |
| 3 | 22.96 | 12.98 | 7.99 | 4.00 |
| 4 | 23.96 | 13.98 | 8.99 | 5.00 |
| 5 | 24.96 | 14.98 | 9.99 | 6.00 |

The unknown top-up % moves the answer by 1 point of face per percentage point, whereas the fixed issue fee moves it by 4.99/A: **at tickets <= USD 50 the issue fee, not the percentage, decides profitability.**

**5.3 Minimum new-card ticket (mpay, 3 % placeholder):** `A >= (issue + fixed)/(m - pct)`: overhead <= 10 % -> USD 71.29; <= 8 % -> USD 99.80; <= 6 % -> USD 166.33; <= 5 % -> USD 249.50.

**5.4 Expected counterparty loss (USD) by days of float held** (prior 2.455 %/month of float, from hazard priors in S2):

| days held | A=25 | A=50 | A=100 | A=500 |
|---|---|---|---|---|
| 1 | 0.0205 | 0.0409 | 0.0818 | 0.4092 |
| 3 | 0.0614 | 0.1228 | 0.2455 | 1.2275 |
| 7 | 0.1432 | 0.2864 | 0.5728 | 2.8642 |
| 14 | 0.2864 | 0.5728 | 1.1457 | 5.7283 |
| 30 | 0.6138 | 1.2275 | 2.4550 | 12.2750 |

Interpretation: with JIT funding the expected-loss charge is about 0.08-0.25 % of the ticket (a pricing line item `risk_buffer`), but the tail is binary (a freeze takes the whole float), so the float cap, not the buffer, is the real control.

### 6. Supplier strategy

| Tier | Candidate | Gate | Notes |
|---|---|---|---|
| Primary | mpay (panel-only) | all three gates below | highest operational familiarity; weakest reputation evidence |
| Secondary | VirtCardPay, then PintoPay | same gates | order by *verified* all-in cost at the typical ticket; PintoPay issue fee is prohibitive for small new cards |
| Contingency | Wanttopay; voucher aggregators if eligible; **pause card SKUs / sell only products that need no foreign card** | same gates | pausing is a legitimate fallback, not a failure |

**Gates (all required before "primary"):** (1) written provider confirmation that Iran-resident business customers are accepted (keep the email); (2) one small live test: deposit, credit time, issue, load, reveal, one spend, statement, withdrawal-of-unused-balance attempt, support ticket; (3) ToS snapshot + hash reviewed by counsel (CTL-22/CTL-27).

**Float and sweep policy (proposals for the owner/ADR, `low` confidence):** per-provider float <= 5 % of equity (S2) and, in the first 90 days, an absolute cap the owner can lose entirely (`null`, owner decision); fund just-in-time per order or per daily batch; maximum 3 days of float held; sweep unused balance back or spend it down weekly where withdrawal is allowed; no stockpiling of pre-loaded cards.

**Reconciliation:** per-deposit credit check within 1 hour of first confirmation; daily provider balance vs ledger `1200 PROVIDER_BALANCE:<id>`; weekly card inventory vs provider panel; month-end write-off entry E18 for any frozen balance.

**Monitoring signals (each halves the float cap and pauses new funding):** credit delay > 2x normal; support response > 48 h; ToS/fee page hash change; decline rate +10 percentage points week-on-week; KYC prompt; slower withdrawals; adverse press or peer-group reports; WHOIS/hosting change.

**Customer terms (CLAUDE.md section 3.2):** every card/voucher SKU needs `risk_label` and `restriction_note`; terms disclose third-party suspension risk and the refund policy (e.g. "card details delivered are non-refundable once revealed unless the provider fails").

### 7. ProviderAdapter capability matrix

Mapped to `ProviderCapabilities` in `packages/contracts/src/ports.ts` (`api | panel | none`; the brief's "operator" = `panel`). `balance` = `accountBalance()`, `payVendor` = vendor payment/voucher purchase. All "api" entries for aggregators/BaaS are recollection (UNVERIFIED) and moot while eligibility is absent.

| Operation | mpay | PintoPay / VirtCardPay / Wanttopay / AnyXPay | Aggregators (Bitrefill-type) | BaaS (Stripe-type) |
|---|---|---|---|---|
| depositAddress / creditStatus | panel (read address; confirm credit manually) | panel (unverified) | api/UNVERIFIED | n/a |
| accountBalance | panel | panel (unverified) | api/UNVERIFIED | api/UNVERIFIED |
| issueCard | panel | panel (unverified) | "purchase voucher" via api/UNVERIFIED | api/UNVERIFIED |
| topUpCard | panel | panel (unverified) | none | api/UNVERIFIED |
| revealCard | panel (operator copies PAN/CVV into the encrypted delivery payload) | panel | api (voucher code) | api (PCI scope!) |
| freezeCard | panel | panel | none | api |
| webhooks | none | unknown (assume none) | UNVERIFIED | UNVERIFIED |
| rate limits | null (verify) | null | null | null |
| payVendor | panel | panel | api | none |

Implementation consequences: `ManualPanelProvider` (all `panel`) is the default adapter; operator tasks carry the exact checklist (verify deposit credited, issue/top up, copy secrets into encrypted delivery, record card ref/last4, record fee actually charged -> ledger E5/E6). Fee realised in the panel must be entered by the operator so `COGS_PROVIDER_FEES` reflects reality rather than the placeholder. Never scrape or automate a provider UI against its terms.

## Implications

- **Pricing engine:** load provider fees from `data/providers.json` (admin overrides win). Until verified, mark mpay `topup_pct` as assumed 3.0 % with a visible `uncompetitive/UNVERIFIED` warning in admin; the `issue_usd` fixed fee must appear as its own quote line so small-ticket new-card orders are priced or blocked (minimum new-card load about USD 100 for <= 8 % overhead, or a separate "card activation" fee).
- **Simulator:** `ProviderSim` parameters: fee schedule (issue 4.99, % band 0-5, min load 25), panel latency, decline model (prepaid class), hazards 0.5 % exit, 1.8 % freeze, 0.2 % insolvency, 2.0 % geo de-risk per month (S2), recovery 5/50/60/50 %. Run a sensitivity on `topup_pct` 0-5 % and on provider count (1 vs 2).
- **Owner decisions:** (1) accept that no provider is verified; authorise a small live test budget; (2) send the eligibility email today; (3) set the absolute float cap; (4) decide the minimum new-card load; (5) choose whether to pause card SKUs if no provider confirms eligibility.
- **Compliance:** "no KYC" is a marketing phrase, not permission. If a provider confirms Iran eligibility in writing, keep the evidence; if it refuses, comply and drop the SKU. Do not use nominee accounts, borrowed identities/cards, VPN/geo-spoofing or billing-address manipulation (guardrail 1).

## Conflicts & adjudication

| # | Conflict | Adjudication |
|---|---|---|
| C1 | mpay issue fee 4.99 / min load 25 are rated `medium` in `data/catalog.json` (S50) and `data/competitors.json`, but derive from one internal chain of secondary summaries | Rated **low** here until verified first-hand; downstream files may keep `medium` only if they cite an independent source. Value unchanged. |
| C2 | mpay top-up % is 3.0 % in the lead's model but "unpublished" in the first-pass text | Not a source conflict: 3.0 % is a placeholder, stored as `topup_pct_assumed`; `topup_pct = null`. |
| C3 | Persian guides say "no KYC"; specialist 05 expects restricted-jurisdiction exposure | Compatible: no-KYC onboarding does not imply Iran is permitted by ToS. Treated as `unknown_assume_ineligible`. |
| C4 | "$0.25 / $0.30 transaction fee" (PintoPay / Wanttopay) could be per spend or per load | Modelled conservatively as per load; flagged for verification. |
| C5 | Binance: stated policy blocks Iran vs relay reporting large flows for an Iranian exchange | Policy governs eligibility; reported gaps are not a basis for the owner's plan. |

## Open questions

| # | Question | verify_how |
|---|---|---|
| Q1 | Does mpay (and each alternative) accept Iran-resident business customers? Exact ToS wording | Read ToS, snapshot+hash, written support question, counsel review |
| Q2 | mpay top-up %, fixed fee, FX %, decline fee, inactivity fee, refund of unused balance | Fund a test account; read fee table; one top-up; statement |
| Q3 | mpay legal entity, jurisdiction, licences, team, the Dec-2025 USD 3M round | Whois, ToS, press release, Crunchbase |
| Q4 | Limits: per-card balance, daily/monthly spend, min deposit, credit time, confirmations | In-account limits screen; test deposit |
| Q5 | Any mpay API / white-label / partner programme | Written enquiry to sales/support; developer docs search |
| Q6 | Trustpilot count/score/newest reviews; Persian forum evidence; outage history | Open pages; search EN/FA; Telegram groups |
| Q7 | Fees, limits and eligibility for uCards, Kripicard, PayX, MPChat, RedotPay, Cryptomus and any others | Section 9 query list |
| Q8 | Aggregator API terms, reseller discounts, Iran wording | Section 9 query list |
| Q9 | Card BIN/region and billing-address behaviour per target merchant | Issue a test card; USD 5 test per merchant class |

## 9. Re-run plan (queries to execute when the search budget is available)

At least 40 searches are required by the brief; none could run. Suggested set (standard first, extended for 2, 6, 14, 27): (1) `mpay.cards fees top-up percentage`, (2) `mpay.cards terms restricted countries Iran`, (3) `mpay.cards Trustpilot reviews 2026`, (4) `mpay.cards scam withdraw funds`, (5) `mpay cards API partner reseller`, (6) `MPay cards $3 million funding round`, (7) `mpay.cards whois company jurisdiction`, (8) `mpay.cards supported merchants declined OpenAI`, (9) `mpay.cards card region billing address Singapore`, (10) `mpay.cards daily limit monthly limit`, (11) `mpay.cards support response`, (12) Persian `کارت مجازی mpay کارمزد شارژ`, (13) `mpay کارت ویزا مجازی تتر آموزش`, (14) `mpay مسدود شدن موجودی`, (15) `PintoPay fees terms restricted countries`, (16) `Wanttopay prepaid card fees`, (17) `VirtCardPay fees plans`, (18) `AnyXPay virtual card fees`, (19) `uCards crypto card fees`, (20) `Kripicard virtual card`, (21) `PayX virtual card crypto`, (22) `MPChat MP Card`, (23) `RedotPay fees restricted countries`, (24) `Cryptomus card fees`, (25) `Bitrefill API reseller affiliate`, (26) `Bitrefill restricted countries Iran`, (27) `Reloadly gift cards API terms`, (28) `CryptoRefills API`, (29) `Coinsbee API affiliate`, (30) `Piaxis gift cards API`, (31) `Stripe Issuing supported countries`, (32) `Marqeta prohibited countries`, (33) `Lithic issuing eligibility`, (34) `Rain card issuing crypto`, (35) `Reap card issuing`, (36) `Wallester restricted countries`, (37) `crypto card provider freeze funds Iran users`, (38) `Visa Mastercard sanctioned countries programme rules virtual card issuers`, (39) Persian `خرید ویزا کارت مجازی از ایران تتر ریسک مسدودی`, (40) Persian `تجربه کارت مجازی mpay pintopay`. Also try WebFetch once per new domain.

## Sources

- [S1] `docs/business-plan-full-context.md` (repo, lead's first-pass; itself compiled from search summaries of mpay.cards, Persian guides linotool / maharatweb / webmastersalam, Trustpilot, gridinsoft, scamadviser) - mpay product, fees, networks, KYC marketing, reputation, alternatives' fees. **Secondary; original pages not seen by this specialist.**
- [S2] `docs/03-research/05-sanctions-counterparty-risk.md` (specialist 05) - hazard priors for custodial card providers; judgemental.
- [S3] `scripts/pricing_model.py` (repo) - 3.0 % top-up placeholder and cost constants.
- [S4] `data/catalog.json` `mpay_and_card_acceptance` (specialist 06) - AWS prepaid, Google Cloud trial, OpenAI billing mismatch; "per search summary".
- [S5] https://blog.amlbot.com/binance-processed-7-8-billion-worth-transactions-for-iranian-crypto-exchange-nobitex-despite-us-sanctions/ - cited by specialist 05 as S39 (Reuters 2022 relay); **per specialist 05, not seen by this specialist.**
- Blocked on WebFetch in this run (one attempt each): mpay.cards, trustpilot.com/review/mpay.cards, pintopay.com, bitrefill.com/faq, reloadly.com, wanttopay.com, virtcardpay.com, redotpay.com, docs.stripe.com/issuing/where-issuing-is-available.
- Data: `data/providers.json` (validated), builder `scripts/research/01_build_data.py`, cost model `scripts/research/01_provider_costs.py`.
