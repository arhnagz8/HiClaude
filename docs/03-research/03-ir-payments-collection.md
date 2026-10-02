---
title: Iranian Toman collection and payment verification - gateways, card-to-card, Bale, USDT, identity inquiry, SMS, e-invoice
owner_agent: 03-ir-payments-collection
as_of: 2026-10-02
confidence: medium
status: draft
---

# Collecting Toman and verifying payment in Iran (1405 / 2026-10)

## خلاصه برای مالک (۱۱ بولت)

- **محدودیت این گزارش:** سهمیهٔ جستجوی وب کل جلسه (۲۰۰ جستجو، مشترک بین همهٔ ایجنت‌ها) تمام شد؛ از ۴۰ جستجوی هدف فقط ۲۹ جستجو انجام شد. برای جبران، مشخصات فنی را مستقیم از کد منبع SDKهای npm/PyPI خواندم. هر چیزی که تأیید نشد `null / UNVERIFIED` است و راه راستی‌آزمایی دارد.
- **درگاه‌ها:** زرین‌پال، زیبال، آیدی‌پی، نکست‌پی، وندار «پرداخت‌یار» هستند؛ درگاه مستقیم یعنی بانک/PSP (سپ، به‌پرداخت ملت، پارسیان، سداد، سپهر). شاپرک به پرداخت‌یارها دستور داده پذیرندهٔ فروش رمزارز/VPN/قمار را قطع کنند و بانک مرکزی بارها درگاه صرافی‌های رمزارز را بسته است.
- **ریسک اصلی کسب‌وکار شما:** اگر درگاه کار شما را «معامله ارز/رمزارز» تشخیص دهد، درگاه قطع یا تسویه نگه داشته می‌شود. راه قانونی: محصول را دقیق و صادقانه (کارت پیش‌پرداخت/شارژ/اشتراک خدمات آنلاین با قیمت تومانی) معرفی کنید، تصمیم را به درگاه بسپارید، پاسخ کتبی پشتیبانی را نگه دارید، و از روز اول **درگاه دوم + کارت‌به‌کارت + USDT** داشته باشید. هیچ توصیفی خلاف واقع نمی‌نویسیم.
- **کارمزد زرین‌پال (منبع واحد، اطمینان کم):** ۰٫۵٪ تا سقف ۱۶٬۰۰۰ تومان + ۵۰۰ تومان ثابت؛ یعنی حدود ۱٪ برای سفارش ۱۰۰ هزار تومانی و حدود ۰٫۰۵۵٪ برای سفارش ۳۰ میلیونی. کف مقرراتی شاپرک (از ۴ تیر ۱۴۰۲): ۱۲۰ تومان ثابت یا ۰٫۰۲٪ با سقف ۴٬۰۰۰ تومان.
- **سقف‌های ۱۴۰۵:** کارت‌به‌کارت ۱۵ میلیون تومان در روز برای هر کارت (منابع متعدد)؛ خرید اینترنتی ۴۰۰ میلیون تومان در روز برای هر فرد؛ بیشترین مبلغ هر پرداخت زرین‌پال ۱۰۰ میلیون تومان.
- **کارت‌به‌کارت:** کارمزد دریافت‌کننده صفر است ولی خطر مسدودی حساب، کلاهبرداری مثلثی، رسید جعلی و مالیات (معیار گزارش‌شده: بیش از ۱۰۰ واریز در ماه و بیش از ۳۵ میلیون تومان) دارد. ساختار قانونی: حساب کسب‌وکار ثبت‌شده، مبلغ یکتا، تطبیق نام پرداخت‌کننده، تأیید سمت سرور؛ **هرگز** تقسیم پرداخت برای دور زدن سقف یا استفاده از کارت/حساب دیگران.
- **بله:** `https://tapi.bale.ai/bot{token}/` با `sendInvoice`، `answerPreCheckoutQuery`، `inquireTransaction`؛ مبلغ به ریال؛ `provider_token` یا شمارهٔ کارت است یا (شمارهٔ درگاه + پذیرنده) یا کیف‌پول بله. کارمزد/سقف/سطح احراز کیف‌پول بله راستی‌آزمایی نشد.
- **استعلام هویت:** جیبیت و فینوتک endpointهای مشخص دارند (تطبیق موبایل با کد ملی، مالکیت کارت، شبا). قیمت هر استعلام منتشر نشده (`null`). رضایت صریح کاربر و حداقل‌سازی داده الزامی است؛ مشورت حقوقی لازم.
- **USDT:** برای هر سفارش یک آدرس مشتق‌شده (HD) و پایش با TronGrid/RPC/TONAPI؛ پیش از اعتبار دادن، فهرست تحریم OFAC و فهرست مسدودی تتر را چک کنید. چون کارمزد شبکه حدود ۱ تتر است، پرداخت تتری برای سفارش‌های زیر حدود ۱۰ تتر (≈۲٫۶ میلیون تومان) منطقی نیست.
- **مودیان:** مسیر فنی (توکن، امضای JWS، رمزنگاری JWE، دسترسی از IP ایران، فیلدهای فاکتور) از SDKها مشخص شد؛ اما «چه کسی مشمول است، آستانه‌ها و جریمه‌ها» راستی‌آزمایی نشد و باید با حسابدار رسمی تأیید شود.
- **این سند تحلیل است، نه مشاورهٔ حقوقی/مالیاتی.** پیش از راه‌اندازی با وکیل و مشاور مالیاتی دارای مجوز مشورت کنید.

## TL;DR (EN)

- **Coverage:** 29 WebSearch queries completed (target 40+); the shared 200-per-session cap was reached and one further query was refused. Compensation: 36 package sources (npm/PyPI SDKs) read directly for API contracts. Everything unsourced is `null / UNVERIFIED`. Overall confidence: API shapes medium-high, fees/caps/regulation medium-low.
- **Gateway fee (Zarinpal-type payment-yar):** `min(0.5% x amount, 16,000 Toman) + 500 Toman` = 1,000 / 5,500 / 16,500 / 16,500 Toman for orders of 100k / 1M / 10M / 30M Toman (1.000% / 0.550% / 0.165% / 0.055%). Single secondary source, confidence low; ask `feeCalculation.json` at runtime.
- **Regulated floor (CBI fee reform, effective 2023-06-25):** 1,200 Rial fixed below 6,000,000 Rial, else 0.02% capped at 40,000 Rial (= 120 / 200 / 2,000 / 4,000 Toman for the four order sizes). Confidence medium.
- **1405 caps:** card-to-card 15,000,000 Toman per sending card per day (high; 5 press sources), internet purchase 400,000,000 Toman per person per day (medium), 200,000,000 per card (low); Zarinpal max single payment 100,000,000 Toman (error -41 text).
- **Eligibility risk:** Shaparak told payment-yars to cut merchants selling crypto, VPN, betting; CBI directive forces crypto exchanges onto PSPs, not payment-yars. Gift-card / virtual-card / USDT-backed top-up classification is not named in anything seen -> UNVERIFIED and treated as `risk_label: high`.
- **Verification rule:** never trust the callback; verify server-side with the amount from our DB; unverified payments are returned to the payer (Pay.ir: after 30 min; Zarinpal reversal window 30 min; IDPay verify window; Mellat verify->settle else reverse).
- **Card-to-card:** receiver fee 0; sender cap 15M/day; tax visibility reported at >100 deposits and >35M Toman per month (both conditions); account-freeze and triangular-fraud risk; lawful structure = registered business account + unique amount + payer-name match + server-side confirmation.
- **Bale:** `https://tapi.bale.ai/bot{token}/{method}`; amount in Rial; statuses `pending|paid|failed|rejected`; `setWebhook` has only `url` (no secret token seen) -> secret path + `inquireTransaction`.
- **Identity/SMS:** Jibit `https://napi.jibit.ir/ide` and Finnotech OAuth2 `dev/v2/oauth2/token` endpoints captured; 4 SMS providers' OTP-template endpoints plus Bale Safir OTP captured; prices all `null`.
- **USDT:** contracts TRC20 `TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t` and BEP20 `0x55d398326f99059fF775485246999027B3197955` corroborated by exchange-API samples in ccxt source; TronGrid `GET /v1/accounts/{addr}/transactions/trc20`, header `Tron-Pro-Api-Key`, unauthenticated tier 3 QPS (third-party doc). At 257,000 Toman/USDT a 1 USDT chain fee is 25.7% of a 1M Toman order -> minimum viable USDT order about 10 USDT.
- **Moadian:** technical flow and Iranian-IP requirement captured; legal scope, thresholds and penalties UNVERIFIED.
- **Deliverables:** `data/gateways.json` (94 records), `data/collection_methods.json` (81), `data/identity_vendors.json` (66), `scripts/research/03_fee_stack.py`, `scripts/research/03_build_data.py`.

## Research coverage and method notes

| Item | What happened |
|---|---|
| WebSearch | 29 queries returned results (standard 24, extended 5); the 30th was refused: "web search budget (200 of 200) used" (shared across agents). |
| WebFetch | Tried once each: docs.zarinpal.com, idpay.ir, help.zibal.ir, kavenegar.com, developers.tron.network, docs.etherscan.io - all `EGRESS_BLOCKED`. A one-shot probe of ~60 more domains (news sites, vendors, explorers, treasury.gov, toncenter.com) was also blocked. Not retried. |
| Package registries | npm, PyPI and packagist are reachable. 36 packages were downloaded and read (`P1..P36` below): API paths, params, enums, error maps. This is *evidence of API shape*, not of price or policy, and may lag the live API. |
| GitHub | The GitHub MCP is scoped to this repo only; no outside repo was added (not asked by the owner). |
| Quality rule | Any number that moves money and has fewer than 2 independent sources is `confidence: low`. Search results are model summaries; they are cited "per search summary". |

Queries performed (to avoid duplication on re-run): Zarinpal fee 1405; Zarinpal prohibited categories (EN); CBI/Shaparak cutting exchange gateways; IDPay fee; Zibal fee/settlement; Vandar fee; Zarinpal terms crypto; PSP fee cap circular; Shaparak notices (crypto/VPN/gambling/gift cards); Zarinpal API v4 (EN); Asan Pardakht; direct bank gateways + Enamad; internet-gateway cap 1405; fee reform 4 Tir; Paya cycles/holidays; NextPay; Pay.ir; digital-goods eligibility (gift cards, ChatGPT); card-to-card cap 1405; account freezing/triangular fraud; tax triggers (100 deposits / 35M); card-to-card receipt verification; Bale sendInvoice (EN, FA); Bale base URL/inquireTransaction; Bale mini-app initData (FA, EN); Bale wallet levels; Melalweb Bale plugin.

## Facts table

Units: IRT = Toman, IRR = Rial (1 IRT = 10 IRR). `as_of` is 2026-10-02 unless a date is part of the fact. Source ids are in the Sources section (S = search summary, P = package source read directly, BP = round-0 business plan).

| id | fact | value | unit | as_of | confidence | sources |
|---|---|---|---|---|---|---|
| F01 | Zarinpal is a payment-yar that fronts 6 IPGs: Asan Pardakht (AP), Pasargad, Sepehr, Iran Kish, Behpardakht, Saman | 6 | gateways | 2026-10-02 | medium | S28 |
| F02 | Shaparak ordered payment-yars/PSPs to cut e-payment for merchants selling crypto, VPN, betting/gambling | notice | - | undated | medium | S5 |
| F03 | CBI directive: crypto exchanges must take gateways from banks/PSPs, not payment-yars; re-opening tied to 10 conditions | directive | - | undated (2024-25?) | low | S4, S6, S8, S9 |
| F04 | CBI/Shaparak banned fund transfers inside/between payment-yars and wallet services outside e-money rules | ban | - | undated | low | S11 |
| F05 | Zarinpal executive terms last updated 8 Tir 1404 | 2025-06-29 | date | 2026-10-02 | medium | S3 |
| F06 | Zarinpal commission | 0.5 | pct | 2026-10-02 | low | S1, BP |
| F07 | Zarinpal commission cap | 16,000 | IRT | 2026-10-02 | low | S1, BP |
| F08 | Zarinpal fixed fee per transaction | 500 | IRT | 2026-10-02 | low | S1, BP |
| F09 | Shaparak fee floor: 1,200 IRR if purchase < 6,000,000 IRR else 0.02% capped at 40,000 IRR, from 4 Tir 1402 | 1,200 / 0.02% / 40,000 | IRR | 2023-06-25 | medium | S18, S19, S20, S21 |
| F10 | Zarinpal max single payment (error -41 text) | 100,000,000 | IRT | 2026-10-02 | medium | P3 |
| F11 | Zarinpal authority lifetime window (error -42) | 30 min to 45 days | - | 2026-10-02 | medium | P3, P2 |
| F12 | Zarinpal reversal window (error -63) | 30 | minutes | 2026-10-02 | medium | P3, P1 |
| F13 | Zarinpal v4 base URLs and endpoints (request/verify/inquiry/reverse/unVerified/feeCalculation/refresh, StartPay) | see 1.6 | - | 2026-10-02 | high | P1, P2, P3 |
| F14 | Zarinpal amount unit is chosen by `currency` = IRT or IRR; SDK validator minimum 1000 | 1000 | unit of `amount` | 2026-10-02 | medium | P1, P2 |
| F15 | Zarinpal `cardPan` restricts payment to given 16-digit card(s) | feature | - | 2026-10-02 | medium | P1 |
| F16 | Zarinpal refunds via GraphQL `AddRefund` (method PAYA or CARD) | feature | - | 2026-10-02 | medium | P1 |
| F17 | Zibal: `POST /v1/request\|verify\|inquiry` at `gateway.zibal.ir`, amount in Rial, sandbox merchant `zibal`, redirect needs a valid Referer | see 1.6 | - | 2026-10-02 | high | P3, P4 |
| F18 | Zibal settlement: transactions up to 21:00 settle next business morning; minimum settlement 1,000 (manual) / 10,000 (auto) | 21:00 | time | 2026-10-02 | low | S25 |
| F19 | IDPay: `https://api.idpay.ir/v1.1/payment`, headers X-API-KEY / X-SANDBOX, amount Rial | see 1.6 | - | 2026-10-02 | high | P3, P9 |
| F20 | IDPay error 54 = verification window elapsed; error 13 = IP mismatch; error 38 = callback domain mismatch | codes | - | 2026-10-02 | medium | P3 |
| F21 | NextPay endpoints: `nextpay.org/nx/gateway/{token,verify,payment/{id}}` | see 1.6 | - | 2026-10-02 | medium | P5, P8 |
| F22 | NextPay "1%, min 1, max 800 Toman" (legacy, conflicts with F09) | 800 | IRT cap | 2026-10-02 | low | S27 |
| F23 | Pay.ir: `pay.ir/pg/send\|verify`; unverified successful payment is returned to the payer after 30 minutes | 30 | minutes | 2021-07-14 | medium | P7 |
| F24 | Vandar settles up to 39 times/day (Paya cycle or instant) | 39 | per day | 2026-10-02 | low | S26 |
| F25 | Mellat BPM flow: bpPayRequest -> startpay.mellat -> bpVerifyRequest -> bpInquiryRequest -> bpSettleRequest, bpReversalRequest on failure | flow | - | 2026-10-02 | medium | P5 |
| F26 | Parsian PEC SOAP: Sale / Confirm / Reverse / MultiplexedSale at `pec.shaparak.ir/NewIPGServices/...` | endpoints | - | 2026-10-02 | medium | P6 |
| F27 | Paya cycles 03:45, 09:45, 12:45, 18:45; holiday single cycle 03:45 | 4 cycles | hh:mm | undated | low | S22, S23, S24 |
| F28 | Satna customer orders accepted until 14:30 (13:30 Thursday; interbank settlement 14:00 Thursday) | 14:30 | time | undated | low | S24 |
| F29 | Card-to-card cap per sending card per day, 1405 (raised from 10M) | 15,000,000 | IRT | 2026-10-02 | high | S13, S14, S15, S16, S17 |
| F30 | Internet purchase cap per natural person per day (all cards), 1405 | 400,000,000 | IRT | 2026-10-02 | medium | S12, S16 |
| F31 | Internet purchase cap per single card per day, 1405 | 200,000,000 | IRT | 2026-10-02 | low | S12 |
| F32 | Tax-visibility criteria for bank accounts: > 100 deposit transactions per month AND total > 35,000,000 Toman; tax only if deposits are proven to be income | 100 / 35,000,000 | count / IRT | 2026-10-02 | medium | S29 |
| F33 | CBI invoked its anti-money-laundering powers to block accounts of crypto platforms and payment-yars; police warn accounts can be blocked overnight | event | - | undated | medium | S30, S36 |
| F34 | Unique-amount tail pattern for card-to-card (1..999 Toman) + SMS-reading app | 1-999 | IRT | 2026-10-02 | medium | S31 |
| F35 | Bale API base URL | `https://tapi.bale.ai/bot{token}/{method}` | - | 2026-10-02 | high | P17, P18, P19 |
| F36 | Bale payment methods: sendInvoice, createInvoiceLink, answerPreCheckoutQuery, inquireTransaction | 4 | methods | 2026-10-02 | high | P18, P19, P20 |
| F37 | Bale LabeledPrice.amount is in Rial | IRR | unit | 2026-10-02 | medium | P18, S33 |
| F38 | Bale provider_token: card number, or port+acceptor numbers, or Bale wallet number | 3 | options | 2026-10-02 | medium | P17, S32 |
| F39 | Bale transaction statuses | pending, paid, failed, rejected | - | 2026-10-02 | medium | P19 |
| F40 | Bale invoice title 1-32 chars, description 1-255 chars | 32 / 255 | chars | 2026-10-02 | medium | P17 |
| F41 | Bale payer is charged a fee (docstring) | fee | - | 2024-01-22 | low | P17 |
| F42 | Bale `setWebhook` takes only `url` | url | - | 2026-06-29 | low | P20 |
| F43 | Bale mini app object `window.Bale.WebApp`, raw `initData` string for validation | - | - | 2026-10-02 | low | S34 |
| F44 | Rubika bot API v3 has inline "Payment" button and `UpdatedPayment` (Paid / NotPaid) | - | - | 2025-11-11 | medium | P21 |
| F45 | Eitaa bots use Eitaayar API `eitaayar.ir/api/{token}` (send-only in wrapper) | - | - | 2025-02-11 | low | P22 |
| F46 | Kavenegar REST: `api.kavenegar.com/v1/{key}/sms/send.json`, `verify/lookup.json` (template + token..token3) | - | - | 2026-10-02 | high | P14, P15 |
| F47 | SMS.ir: `api.sms.ir/v1/send/bulk`, `send/verify` (templateId), header X-API-KEY | - | - | 2026-06-06 | medium | P14 |
| F48 | Ghasedak: `gateway.ghasedak.me/rest/api/v1/WebService/SendOTPSMS` etc., header ApiKey | - | - | 2026-06-06 | medium | P14 |
| F49 | Melipayamak: REST `rest.payamak-panel.com/api/SendSMS/` + SOAP `api.payamak-panel.com/post/` | - | - | 2024-11-16 | medium | P16 |
| F50 | Jibit identicator API `https://napi.jibit.ir/ide` incl. mobile-national-code matching | - | - | 2025-10-14 | high | P10, P11 |
| F51 | Finnotech OAuth2 client-credentials `dev/v2/oauth2/token`, cardToIban, ibanInquiry, mobileCardVerification | - | - | 2024-01-31 | medium | P12, P13 |
| F52 | USDT-TRC20 contract | TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t | address | 2026-10-02 | medium | P30, P25 |
| F53 | USDT-BEP20 contract | 0x55d398326f99059fF775485246999027B3197955 | address | 2026-10-02 | medium | P30 |
| F54 | TronGrid: `/v1/accounts/{address}/transactions/trc20`, `/v1/contracts/{contract}/events`, header Tron-Pro-Api-Key; daily-quota 403 | - | - | 2026-10-02 | high | P23, P24 |
| F55 | TronGrid unauthenticated tier (third-party CLI doc) | 3 | QPS | 2026-04-20 | low | P25 |
| F56 | TONAPI REST needs no key; streaming and webhooks need a tonconsole.com key | - | - | 2026-09-20 | medium | P26 |
| F57 | Chainalysis sanctions-oracle bindings exist (build id prefix 40c57923) | - | - | 2026-07-31 | low | P29 |
| F58 | Moadian: prod `tp.tax.gov.ir/req/api/{self-tsp\|tsp}/sync/{PURPOSE}`, sandbox `sandboxrc.tax.gov.ir`, JWS+JWE, Iranian IP | - | - | 2025-07-19 | medium | P27, P28 |
| F59 | Reference USDT price used for maths | 257,000 | IRT per USDT | 2026-10-02 | low | BP |
| F60 | Moadian scope, thresholds, penalties | null | - | - | UNVERIFIED | - |
| F61 | Etherscan V1 deprecated 2025-08-15; V2 base `https://api.etherscan.io/v2/api` with `chainid` (BSC = 56), one key for all chains; free-plan coverage of BSC unverified | 2025-08-15 | date | 2026-09-27 | medium | P33, P34 |
| F62 | Bale Safir OTP API: `POST https://safir.bale.ai/api/v2/auth/token` (client_credentials) then `POST /send_otp {phone, otp}` (unofficial SDK) | - | - | 2025-06-27 | medium | P36 |

## Details

### 1. Payment gateways (درگاه پرداخت)

#### 1.1 Landscape and legal frame

| Layer | Examples | What it means for us |
|---|---|---|
| Shaparak + bank/PSP gateways (درگاه مستقیم) | Sep (Saman Kish), Behpardakht Mellat, Parsian PEC, Sadad (Melli), Sepehr (Saderat), Asan Pardakht (AP), Pasargad, Iran Kish | Lowest fee (regulated floor, F09) but needs a contract, Enamad (نماد اعتماد), business documents; bank scrutinises the category. |
| Payment-yar (پرداخت‌یار) | Zarinpal, IDPay, Zibal, NextPay, Vandar, Pay.ir, Shepa, Paystar, ParsPal, RayanPay, SizPay (names from the rade.ir directory and SDK lists) | One API, fast onboarding, adds a margin (F06-F08). Under CBI rules they cannot serve crypto exchanges (F03) and cannot move money between merchants or run wallets (F04). |
| Merchant (us) | the reseller | Must be a documented business; owns payer verification, refunds, tax invoices. |

Regulatory events seen in search summaries (dates mostly not visible): Shaparak told payment-yars to cut crypto/VPN/betting merchants (F02); CBI blocked exchange gateways more than once (S7, S10); a CBI directive moved exchanges to PSPs (F03). **A claim of a specific Dey 1404 / 1405 closure was NOT confirmed** by anything read; it stays an open question (section Open questions, Q1).

#### 1.2 Eligibility for digital-goods and currency-related merchants

- **What is prohibited in what we saw:** sale of crypto/currency, VPN, betting/gambling, anything "contrary to law and CBI requirements" (S3, S5). Digital goods as a class are not listed as prohibited in anything seen (nor confirmed as allowed); gift cards, virtual cards and USDT-backed top-ups are **not named** either way -> UNVERIFIED (`gateways.json -> zarinpal.prohibited_categories`).
- **Why our model is exposed:** the money flow is Toman in, USDT out. A gateway compliance reviewer can read this as currency exchange. The round-0 plan already noted Zarinpal's terms forbid currency/crypto trading (BP section 5).
- **Lawful way to handle it (no misrepresentation):**
  1. Describe the product accurately in onboarding, in the PSP's own category vocabulary (for example "prepaid virtual cards, top-ups and digital subscriptions for online services, priced in Toman, suppliers are foreign"), and let the PSP decide.
  2. Ask support, in writing, whether this category is accepted; keep the reply with the contract.
  3. Be accurate about what is sold. Services priced and invoiced in Toman are one thing; selling USDT or foreign currency itself (or anything that works like an exchange) falls in the prohibited class and must not go through these gateways - use other rails or do not offer it. Do **not** hide the nature of the business, do not use another person's Enamad/merchant code, do not rotate merchant accounts to escape a decision.
  4. Accept the residual risk (suspension, settlement hold) and carry fallbacks: a second gateway, card-to-card to a business account, Paya/Satna, USDT.
- **Documents seen:** Zibal lists national card, birth certificate, mobile in the applicant's name, valid Enamad and tax-file information (S25, low); NextPay lists national card, company registration number, active bank account, IBAN (S27, low). Zarinpal publishes an Enamad guide and a "gateway without Enamad?" article (answer not seen).
- **Risk labels:** all gateways `risk_label: high` for this use case (the label is about our category, not about the provider's quality).

#### 1.3 Fees (what is known)

| Gateway type | Formula | Confidence | Note |
|---|---|---|---|
| Zarinpal (payment-yar) | `min(0.5% x A, 16,000) + 500` Toman | low (single secondary source + round-0) | An older page shows 0.05%/12,000; treated as outdated. Use `POST /pg/v4/payment/feeCalculation.json` to get `fee` and `fee_type` (Merchant or Payer) at runtime. First-month-free and "golden Tuesday" promotions are not modelled. |
| Direct bank/PSP gateway | regulated floor: 1,200 Rial if A < 6,000,000 Rial else 0.02% capped at 40,000 Rial, plus any bank schedule | medium (floor), contract-specific (rest) | Some guilds are exempt (S21). "Direct gateways have no fee" (S28) is read as "no payment-yar margin". |
| NextPay | "1%, min 1, max 800 Toman" | low, conflicting | Almost certainly legacy: an 800 Toman cap cannot coexist with the floor of up to 4,000 Toman per transaction. |
| Zibal, IDPay, Vandar, Pay.ir, Sep, Mellat, Parsian | not found | UNVERIFIED (`null`) | Zibal offers payer-pays or deducted fee modes (S25, API param `feeMode`). |
| VAT on PSP fee | not found | UNVERIFIED | The fee-stack script shows VAT 9/10/12% as sensitivity only. Rate belongs to 04-legal. |

#### 1.4 Limits (1405)

| Limit | Value | Confidence | Source |
|---|---|---|---|
| Single payment, Zarinpal | 100,000,000 Toman | medium | P3 (-41) |
| Internet purchases per natural person per day (all cards) | 400,000,000 Toman | medium | S12, S16 |
| Internet purchases per card per day | 200,000,000 Toman | low | S12 |
| Zibal minimum | amount > 1,000 Rial | medium | P3 (105) |
| Pay.ir minimum | amount > 10,000 Rial | low | P7 |
| Zarinpal minimum | `amount >= 1000` in SDK validator (unit depends on `currency`) | medium | P1 |

Zibal status codes 8 and 9 expose the issuer-side daily internet-payment count and amount limits; they are payer-side declines and must produce a "try another card/method" message, not a retry loop.

#### 1.5 Settlement (تسویه) and the Iranian banking calendar

- **Paya cycles** (F27): 03:45, 09:45, 12:45, 18:45 on business days; one cycle (03:45) on holidays. The schedule changed more than once; the year of the latest change is not visible in the summaries (low).
- **Satna** (F28): customer-to-customer orders until 14:30; Thursday 13:30; interbank settlement 14:00 on Thursdays.
- **Zibal**: auto daily, cut-off 21:00 -> next business morning; minimum 1,000 Toman manual / 10,000 Toman auto (F18). **Vandar**: up to 39 times a day (F24). Zarinpal's standard cycle and instant-settlement tariff: UNVERIFIED.
- **Today** (10 Mehr 1405) is a Friday: card payments and card-to-card work 24/7, but settlements wait for the next business-day Paya cycle. The treasury module must use the real banking calendar (Friday weekend, Thursday short day, official holidays) when it forecasts when Toman becomes spendable at the exchange.
- **Pricing implication:** a gateway order paid on Thursday evening may only be liquid Saturday; float cost should be charged per day of settlement lag (see 12-pricing-treasury).

#### 1.6 API contracts (what an adapter must implement)

All paths below were read from SDK source (P-sources). Where two SDKs agree, confidence is high; otherwise medium. Perishable: re-test each in the vendor sandbox before go-live.

| Gateway | Create | Redirect | Verify (server-side) | Inquiry / reverse / refund | Unit | Sandbox |
|---|---|---|---|---|---|---|
| **Zarinpal v4** | `POST https://payment.zarinpal.com/pg/v4/payment/request.json` `{merchant_id (UUID), amount, currency?, callback_url, description, mobile?, email?, cardPan?, referrer_id?}` -> `data.authority` (regex `^[AS][0-9a-zA-Z]{35}$`) | `GET /pg/StartPay/{authority}`; callback `?Authority=&Status=OK\|NOK` (P35) | `POST .../verify.json {merchant_id, amount, authority}` -> `code 100` ok / `101` already verified | `inquiry.json`, `reverse.json` (30 min), `unVerified.json`, `refresh.json {authority, expire}`; refunds: GraphQL `https://next.zarinpal.com/api/v4/graphql/` mutation `AddRefund(session_id, amount, method: PAYA\|CARD, reason)` with Bearer token | `currency` IRT or IRR | host `https://sandbox.zarinpal.com` |
| **Zibal** | `POST https://gateway.zibal.ir/v1/request {merchant, amount, callbackUrl, orderId?, mobile?, allowedCards?, checkMobileWithCard?, feeMode?, ...}` -> `{result:100, trackId}` | `https://gateway.zibal.ir/start/{trackId}` (valid `Referer` required) | `POST /v1/verify {merchant, trackId}` -> `100` ok / `201` already verified | `POST /v1/inquiry` | Rial | `merchant: "zibal"` |
| **IDPay** | `POST https://api.idpay.ir/v1.1/payment {order_id, amount, name?, phone?, mail?, desc?, callback}` headers `X-API-KEY`, `X-SANDBOX` | link from response | `POST /payment/verify {id, order_id}` | `POST /payment/inquiry`; statuses 1,2,3,4,5,6,7,8,10,100,101,200 (see JSON) | Rial | header `X-SANDBOX: 1` |
| **NextPay** | `POST https://nextpay.org/nx/gateway/token {api_key, order_id, amount, callback_uri}` -> `trans_id` | `https://nextpay.org/nx/gateway/payment/{trans_id}` | `POST /nx/gateway/verify {api_key, trans_id, amount}` -> `code 0` | - | unverified | unverified |
| **Pay.ir** | `POST https://pay.ir/pg/send {api, amount, redirect, ...}` | `https://pay.ir/pg/{token}` | `POST https://pay.ir/pg/verify {api, token}` | auto-return after 30 min if not verified | Rial (> 10,000) | api key `test` |
| **Mellat BPM** | SOAP `https://bpm.shaparak.ir/pgwchannel/services/pgw?wsdl` `bpPayRequest(...)` -> `ResCode,RefId` | POST `RefId` to `.../startpay.mellat` | `bpVerifyRequest` -> `bpInquiryRequest` -> `bpSettleRequest` | `bpReversalRequest` | Rial | bank test terminal |
| **Parsian PEC** | SOAP `.../NewIPGServices/Sale/SaleService.asmx?WSDL` | `https://pec.shaparak.ir/NewIPG/?Token=` | `.../Confirm/ConfirmService.asmx` | `.../Reverse/ReversalService.asmx` | Rial | bank test |
| **Sadad / Sepehr** | Sadad `POST https://sadad.shaparak.ir/api/v0/Request/PaymentRequest`; Sepehr `GET https://sepehr.shaparak.ir:8081/V1/PeymentApi/GetToken` | gateway page | Sadad `.../Advice/Verify`; Sepehr `.../Advice` | Sadad refund `https://refund.sadadpsp.ir/api/v1/refund/{Register,Confirm,Cancel}` | Rial | bank test |
| **Sep (Saman), Vandar, AP, Digipay** | not found in registries | - | - | - | - | contract documents needed |

**Key error codes** (full maps in `gateways.json`): Zarinpal -9 validation, -10 IP/merchant invalid, -11 inactive, -12 too many attempts, -14 callback domain mismatch, -15 suspended, -16/-17 merchant level, -41 max amount, -42 authority lifetime, -50 verify amount mismatch, -51 failed, -54 invalid authority, -55 not found, -63 reversal window expired; Zibal 102-116, 201-203; IDPay 11-54 (13 IP, 38 callback domain, 54 verify window); Mellat 0, 11-25, 41-48, 51-62, 111-114.

**IP whitelist and rate limits:** Zarinpal (-10), IDPay (13), Zibal (115), NextPay (1029) and Mellat (421) all have IP checks, so the production egress IP must be fixed and registered. Numeric rate limits were not found; Zarinpal -12 signals "too many attempts in a short window".

**Adapter contract (suggested for `packages/contracts`, English, integer money):**

```ts
interface PaymentGateway {
  id: 'zarinpal' | 'zibal' | 'idpay' | 'nextpay' | 'vandar' | 'mellat' | 'parsian' | string
  createPayment(i: { orderId: string; amountIRT: number; callbackUrl: string; description: string;
                     payerCardPan?: string[]; payerMobile?: string; expiresInSec?: number }): Promise<{ providerRef: string; redirectUrl: string; expiresAt: Date }>
  verify(i: { providerRef: string; expectedAmountIRT: number }): Promise<{ state: 'paid' | 'already_verified' | 'failed' | 'pending';
                     amountIRT: number; cardPanMasked?: string; bankRef?: string; feeIRT?: number; raw: unknown }>
  inquiry(i: { providerRef: string }): Promise<{ state: string; raw: unknown }>
  refund(i: { providerRef: string; amountIRT: number; reason: string }): Promise<{ refundRef: string; state: string }>
  listUnverified?(): Promise<Array<{ providerRef: string; amountIRT: number }>>
  feeQuote?(i: { amountIRT: number }): Promise<{ feeIRT: number; payer: 'merchant' | 'customer' }>
}
```

Rules the adapters must enforce: (1) internal amounts are integer IRT; convert to Rial (x10) at the edge and assert `rial % 10 == 0`; (2) `verify` always compares the provider amount with the amount stored before redirect, never with callback fields; (3) `verify` is idempotent (codes 101/201 are success only if our order is already marked paid with the same reference); (4) a reconciliation job lists unverified payments and compares daily with the settlement report; (5) the callback endpoint answers 200 fast and verifies in a worker (verify within the first minutes because unverified payments are returned: F12, F23, F20); (6) provider error codes map to `{retryable, userMessageKey, alertOps}` (e.g. -12 retry with backoff, -15 or 115/13 alert the owner and fail over to the second gateway).

**Lawful payer-ownership control:** Zarinpal `cardPan` and Zibal `allowedCards` + `checkMobileWithCard` bind a payment to the customer's own card. Use them with the card number the customer registered after a card-owner/name match (section 4). This reduces victim-funded (triangular) fraud without any evasion.

#### 1.7 Disputes and refunds

- **Pre-fulfilment problems:** the gateway reverses unverified payments (F12, F23); do not fulfil before verify.
- **Post-fulfilment disputes:** Iranian card payments are push payments; the issuing bank/Shaparak complaint channel and the cyber police are the usual routes. We did not find a chargeback-style SLA. Zarinpal refunds go via GraphQL (`PAYA` to the account or `CARD`), reasons `CUSTOMER_REQUEST | DUPLICATE_TRANSACTION | SUSPICIOUS_TRANSACTION | OTHER`.
- **Customer terms must disclose:** third-party suspension risk, refund policy for digital goods, and that a refund returns Toman at the original price, not a currency amount.

#### 1.8 Incidents

See 1.1. Specific Dey 1404/1405 gateway closures: not confirmed in this run. Treat "gateway blackout" and "category-based suspension" as separate simulator scenarios (outage vs policy cut).

### 2. Card-to-card collection (کارت‌به‌کارت)

#### 2.1 Caps, tax, freeze

| Topic | Fact | Confidence |
|---|---|---|
| Cap | 15,000,000 Toman per sending card per day in 1405 (up from 10,000,000) | high |
| Receiver fee | 0 (sender-side tariff UNVERIFIED) | low |
| Tax visibility | more than 100 deposit transactions per month **and** more than 35,000,000 Toman total; tax applies only when the deposits are shown to be income (circular 200/5549 per summary); rates reported 15-25% natural persons, 25% legal persons | medium |
| Freeze | CBI used its AML powers to block accounts of crypto platforms and payment-yars; police warn of overnight blocks after fraud complaints | medium |

**Do-not-design list (guardrail, CLAUDE.md section 3):** we do not provide or support splitting an order into several transfers or days to get around the 15M cap, rented/borrowed/third-party cards or accounts, many personal accounts to hide volume, or hiding the business purpose from the bank. **Lawful alternative:** route orders above the cap to a gateway (limits in 1.4), Paya/Satna transfer (below), or USDT; register the business and open a business account; issue invoices (section 6); keep payer KYC.

#### 2.2 Unique-amount strategy

Pattern (F34): add a small tail of 1..999 Toman to the order total so that the bank notification identifies the order.

```
quote_total = ceil_to_integer_IRT(price_incl_all_fees)
tail = 1 + (hash(order_id) mod 999)
while exists(open_order where dest_card == this_card and total == quote_total + tail): tail = next_free(tail)
payable = quote_total + tail          # shown to the customer to the last Toman
ttl = price_lock_ttl                   # the tail is released when the order expires
```

Properties: the tail is revenue for the merchant, so fold it into the price (the pricing engine should not show it as a fee); worst-case overhead 999 Toman = 1.0% of a 100,000 Toman order but 0.003% of a 30M order (see fee stack). Uniqueness scope is per destination card and open-order set; with N open orders at the same base price the tail space (999) bounds concurrency, so keep several destination cards or fall back to manual review when the pool is exhausted. An exact-amount mismatch (customer typed a different amount) goes to manual review, never auto-credit.

#### 2.3 Receipt verification options

| Option | How | Strength | Weakness / note |
|---|---|---|---|
| Gateway-style card-bound pay link | use a gateway with `cardPan`/`allowedCards` | strongest | only if the gateway accepts the category |
| Bank SMS parsing on a business-owned phone | an app reads the bank's deposit SMS and matches amount + time (pattern in S31) | cheap, near real-time | SMS can be forged into the bank's SMS thread; contains amount/time, not reliable payer identity; never accept forwarded screenshots/SMS from the customer |
| Bank statement / open-banking | Finnotech `oak:card-statement:get`, `oak:card-balance:get` (P12) | authoritative | consent, contract and price UNVERIFIED |
| Payer identity check | card-owner name match (Jibit `matching?cardNumber&name`, Finnotech `mobileCardVerification`) | blocks third-party-funded orders | per-call price UNVERIFIED |
| Operator check in the bank app | human compares amount, time, reference | fallback | cost per receipt is a scenario parameter (fee stack) |

Recommended layering: unique amount -> automatic match from the business phone's bank SMS **and** statement check for orders above a threshold -> payer name match -> operator approval above a value threshold or on any mismatch.

#### 2.4 Fraud patterns and controls

| Pattern | Mechanism | Control |
|---|---|---|
| Fake receipt | edited screenshot / forged SMS | never use customer-supplied proof; match only against our own bank data |
| Triangular fraud (کلاهبرداری مثلثی) | a fraudster sells something to a victim, tells the victim to pay "the seller" (our account) while placing an order with us | payer-name match to the verified customer; hold fulfilment until the paying card belongs to the customer; keep an audit log; answer bank/police requests |
| Reversal / complaint after delivery | victim files a bank/police complaint, our account is frozen | business account, separate from personal funds; small float of Toman; fast legal contact |
| Overpayment/underpayment | wrong amount typed | exact-match rule + manual review |

#### 2.5 Account-freeze risk and the lawful structure

Many unrelated inbound transfers into a personal card look like unlicensed money services to a bank's monitoring and attract police freezes after any victim complaint (S30, S36). The sustainable structure: a registered business entity, a business account, a PSP/gateway as the main rail (with c2c as a secondary rail), invoices through Moadian, tax filings, payer KYC, retained logs, and quick cooperation with bank requests. Do **not** use rented or third-party accounts: a market for "rental accounts" is visible in search results, but it is exactly the borrowed-identity/account practice this project does not support, and it carries high freeze and legal risk.

#### 2.6 Orders above the cap

Above 15M Toman use, in this order: gateway (single-payment ceiling 100M at Zarinpal, 400M per person per day), Paya/Satna transfer with reference matching (caps UNVERIFIED; read the 1405 table in S13/S14), or USDT. The checkout must show only the methods that can legally carry the amount.

### 3. Bale (بله), other messengers, and SMS

#### 3.1 Bale Bot API payments

- **Base:** `https://tapi.bale.ai/bot{token}/{method}`; files `https://tapi.bale.ai/file/bot{token}/{path}` (P17, P18).
- **Methods:** `sendInvoice {chat_id, title (1-32), description (1-255), payload, provider_token, prices:[{label, amount}], photo_url?}`, `createInvoiceLink {title, description, payload, provider_token, prices}`, `answerPreCheckoutQuery {pre_checkout_query_id, ok, error_message?}`, `inquireTransaction {transaction_id}` -> `{id, status, userID, amount, createdAt, provider_payment_charge_id?}` with status `pending|paid|failed|rejected` (P18, P19, P20).
- **Flow (as implemented by an SDK):** `sendInvoice` -> user pays -> `pre_checkout_query` arrives (answer within about 10 s) -> answer `ok` -> poll `inquireTransaction(pre_checkout_query.id)` every ~2 s until `paid` or `failed` -> `successful_payment` message carries `invoice_payload` and charge ids. Idempotency key = charge id (store uniquely). Match `payload` (our order id) and `total_amount` (Rial).
- **Unit:** Rial (F37); an invoice for 5,000,000 Toman is `amount: 50000000`.
- **`provider_token`:** card number, or port number + acceptor number, or Bale wallet number (F38). How the token is issued and approved by Bale: UNVERIFIED.
- **Fees/limits/KYC/settlement:** the SDK docstring says a fee is charged from the payer (F41); amount, merchant-side fee, wallet KYC levels, per-transaction and daily limits, settlement time: UNVERIFIED (`collection_methods.json -> bale_wallet`). The round-0 plan noted that crypto services are forbidden on payment-yars and wallets; a USDT-funded reseller on a messenger wallet carries the same classification risk.
- **Webhook security:** `setWebhook` takes only `url` in all typings read (F42). Use an unguessable path, TLS, and always re-confirm through `inquireTransaction`; never trust the update body for money.
- **Mini apps:** docs page "مینی‌اپ‌ها در بله" exposes `window.Bale.WebApp` with a raw `initData` string for server-side validation (F43). The algorithm was not seen. **Placeholder to be verified in a sandbox bot:** treat as Telegram-compatible: parse `initData`, remove `hash`, sort remaining `key=value` lines, join with `\n`, `secret = HMAC_SHA256(key="WebAppData", msg=bot_token)`, expected `= hex(HMAC_SHA256(key=secret, msg=data_check_string))`, compare in constant time, reject stale `auth_date`. Implement it behind an `InitDataValidator` interface with a flag `compat: 'telegram' | 'bale'` and a test that uses a real captured `initData`.
- **Telegram:** no Toman payment method; the Telegram Mini App simply opens our own web checkout (gateway, card-to-card, USDT) inside the web view.

#### 3.2 Eitaa, Rubika, Soroush Plus (brief)

| Messenger | Evidence | Payment capability |
|---|---|---|
| Rubika | Bot API v3 `https://botapi.rubika.ir/v3/{token}/{method}`; inline "Payment" button `{id, title, amount, description}`; update `UpdatedPayment` with `payment_id` and `Paid\|NotPaid` (P21) | exists at SDK level; fees/settlement UNVERIFIED |
| Eitaa | Eitaayar API `https://eitaayar.ir/api/{token}` with getMe/sendMessage/sendFile in the wrapper (P22) | none seen |
| Soroush Plus | nothing found | UNVERIFIED (may be inactive) |

#### 3.3 SMS providers (OTP and notifications)

| Provider | Base | OTP/template call | Other | Price per SMS |
|---|---|---|---|---|
| Kavenegar | `https://api.kavenegar.com/v1/{apikey}/` | `POST verify/lookup.json {receptor, token, token2?, token3?, template}` | `sms/send.json {sender, receptor, message, date?}`, `sms/status.json`, `account/info.json` (credit) | null |
| SMS.ir | `https://api.sms.ir/v1/` header `X-API-KEY` | `POST send/verify {mobile, templateId, parameters[]}` | `send/bulk`, `GET send/{id}`, `GET credit` | null |
| Ghasedak | `https://gateway.ghasedak.me/rest/api/v1/WebService/` header `ApiKey` | `POST SendOTPSMS {receptor, type:1, template, param1..3}` | `SendSingleSMS`, `SendBulkSMS`, `GetDeliveries2`, `GetCredit` | null |
| FarazSMS / IPPanel | `https://ippanel.com/api/select` (username + password) | pattern API | credit method | null |
| Melipayamak | REST `https://rest.payamak-panel.com/api/SendSMS/`; SOAP `http://api.payamak-panel.com/post/` | shared-service/template | - | null |
| Bale Safir (OTP over Bale, unofficial SDK evidence) | `https://safir.bale.ai/api/v2` | `POST /send_otp {phone, otp}` with Bearer token from `POST /auth/token` (client_credentials, form-urlencoded) | response returns remaining balance | null |

Phone formats differ (Kavenegar/SMS.ir/Ghasedak want `9121234567` without leading 0; FarazSMS wants `+98...`). Line and template requirements (service line vs promotional line, approval of templates, sender-line leasing) were not retrieved -> UNVERIFIED; a template/OTP endpoint exists at all four providers. **Design defaults (owner can change):** 6-digit code, 120 s TTL, 5 attempts, 60 s resend cooldown, per-mobile and per-IP rate limit, never log codes, keep two SMS providers behind one `SmsProvider {send, sendPattern, getStatus, getCredit}` interface; Bale Safir OTP is an optional extra channel for users who have Bale (never the only channel).

### 4. Identity and inquiry APIs

| Vendor | Auth | Capabilities captured | Price per call |
|---|---|---|---|
| **Jibit (جیبیت)** | `POST https://napi.jibit.ir/ide/v1/tokens/generate {apiKey, secretKey}` -> access + refresh tokens (SDK defaults: ~30 min access, 24 h refresh) | `GET /v1/services/matching` with (nationalCode + mobileNumber) = mobile<->national-ID match (Shahkar-style); (cardNumber + name); (cardNumber + nationalCode + birthDate); (iban + nationalCode + birthDate); (iban + name); (bank + depositNumber + ...); `GET /v1/cards?number=` (+`iban=true`/`deposit=true`); `GET /v1/ibans?value=`; `GET /v1/deposits?bank=&number=&iban=true`; `GET /v1/services/availability`; `GET /v1/services/identity/similarity`; postal, foreigner, corporation, military-service, "sana" endpoints | null |
| **Finnotech (فینوتک)** | OAuth2 `POST /dev/v2/oauth2/token` (Basic clientId:secret; `grant_type=client_credentials`, `nid`, `scopes`) | `cardToIban` (`facility:card-to-iban:get`), `ibanInquiry` (`oak:iban-inquiry:get`), deposit->iban, `mobileCardVerification` (`kyc:mobile-card-verification:post`), card information, balance/statement, blacklist, video KYC; Shahkar scope not seen | null |
| Zibal, Vandar | not retrieved | UNVERIFIED | null |
| Shahkar direct (CRA) | licensed operators only | UNVERIFIED | - |

- **Birth-date format conflict:** node-jibit strips `/` from a Jalali date (`yyyyMMdd`) while the Python wrapper says `yyyy-MM-dd`; test both in the sandbox.
- **Mobile<->national ID:** Jibit exposes a `matched:boolean` check; whether it is backed by Shahkar is not stated -> verify with the vendor before relying on it as "Shahkar".
- **Suggested identity ladder (design, not law):** L0 SMS OTP; L1 mobile<->national-ID match (consent text shown); L2 card-owner name match before a first card-to-card or card-bound gateway payment; L3 (high value or flagged) manual or video KYC.
- **Legal basis and consent:** UNVERIFIED here. Minimum design: explicit, purpose-limited consent recorded with timestamp; store the boolean result and vendor trace id, not the raw registry answer; retention limit; access logging. Hand to 04-legal-tax-compliance-ir; this is not legal advice.

### 5. Collecting USDT from customers

#### 5.1 Address strategy

| Option | Chains | Pros | Cons | Recommendation |
|---|---|---|---|---|
| Per-order derived address (HD, server holds only the xpub for derivation) | TRON, BSC | exact attribution, no memo needed, EVM mistakes recoverable | sweeping costs (energy/gas), activation of TRON addresses | default for TRC20 and BEP20 |
| Single address + unique amount | any | no sweeping | collisions, sender can short-pay by dust, weak attribution | fallback only |
| Single address + memo/comment | TON | native on TON | customers forget the comment | TON default, with manual-review queue |

Key handling (hot keys, cold treasury, who can sweep) belongs to 09-platform-tech-security; this document only fixes the interface: `deriveAddress(orderId)`, `getIncomingTransfers(address, sinceBlock)`, `sweep(address)`.

#### 5.2 Chain monitors

| Chain | Endpoint(s) | Auth | Limits | Evidence |
|---|---|---|---|---|
| TRON | TronGrid `GET /v1/accounts/{address}/transactions/trc20` (the SDK passes an options object; query names such as `only_to`, `contract_address`, `min_timestamp`, `limit` are recalled, verify), `GET /v1/contracts/{contract}/events`, `GET /v1/transactions/{id}/events` | header `Tron-Pro-Api-Key`; a 403 "Exceed the user daily usage" signals quota exhaustion | unauthenticated 3 QPS per a third-party CLI doc (low); keyed free/paid tiers UNVERIFIED (`null`) | P23, P24, P25 |
| BSC | Etherscan API V2 `GET https://api.etherscan.io/v2/api?chainid=56&module=account&action=tokentx&contractaddress=<USDT>&address=<deposit>` (module/action names recalled from V1) **or** BSC JSON-RPC `eth_getLogs` on the USDT contract, `topic0 = keccak256("Transfer(address,address,uint256)")`, filter `to` | one Etherscan key for all chains / RPC provider key | V1 and the bscscan.com API were deprecated on 2025-08-15 (etherscan-api README); client libraries default to 5 req/s; **free-plan coverage of chain 56, daily caps and prices UNVERIFIED** | P32, P33, P34 |
| TON | TONAPI `/v2/accounts/{id}/jettons/history`, `/v2/events/{event_id}`, streaming SSE/WebSocket and webhooks | key optional for REST, required for streaming/webhooks (tonconsole.com) | pricing UNVERIFIED | P26 |

Webhooks vs polling: webhooks (TONAPI, provider webhooks) reduce latency but need public ingress and signature checks; polling with a cursor plus a reconciliation sweep is the robust baseline. Use at least two independent data sources for any credit above a threshold.

#### 5.3 Confirmations (configurable, not facts)

Credit only after the chain's irreversible view: TRON solidified/confirmed block (TronGrid exposes a `confirmed` view); BSC a configured number of confirmations or fast-finality signal; TON masterchain-finalised transaction. Concrete block counts and times were not verified -> `confirmations_required` is a per-chain config with an owner-chosen default.

#### 5.4 AML and sanctions screening of sender addresses

Pipeline: (1) extract `from` of each transfer; (2) check the SDN digital-currency address list (OFAC publishes the SDN list including digital-currency addresses; open mirrors exist) and an internal blocklist; (3) optionally call a screening API; (4) check the issuer freeze status of the address (the Tether contract has a blacklist); (5) on a hit: do not credit, do not spend, quarantine, notify compliance, consult counsel; (6) store the screening result with the credit.

| Source | Access | Status |
|---|---|---|
| OFAC SDN list (digital-currency addresses) | free, public | not fetchable here (treasury.gov blocked); verify format and cadence |
| Chainalysis free sanctions screening (API and on-chain oracle on EVM) | free with registration (per prior knowledge) | only package bindings seen (P29, build id prefix `40c57923`); UNVERIFIED |
| Commercial: TRM Labs, Elliptic, Chainalysis KYT, Scorechain, AMLBot | paid | not priced |
| Issuer freeze lists | on-chain | verify per chain |

**Limit of the control:** when customers pay from an Iranian exchange hot wallet, the `from` address is the exchange's, not the customer's. Screening therefore tells us about the *exchange cluster*; the customer's identity comes from our own KYC. Whether Iranian exchange clusters are designated (the OFAC claim in STATUS) is for 05-sanctions to adjudicate; this module must expose a policy switch `blockedClusters` and a manual-review queue rather than hard-code a position.

#### 5.5 Energy and gas for sweeping

TRON: a USDT transfer consumes energy and bandwidth; options are staking TRX for energy, renting energy from a marketplace (example API: TronZap, P31) or burning TRX as fallback; a transfer to an address that never held USDT costs more, and new addresses may need activation. Commonly cited magnitudes (~65k energy to an existing holder, about double to a new holder) are recalled, **not verified** (`null` in JSON). BSC: gas in BNB at each derived address (gas-drip) or spend directly from derived keys. TON: jetton transfers need TON for fees. Because the sweep cost is unknown, the fee stack treats it as a scenario grid (0.10 / 0.50 / 1.00 / 3.00 USDT per payment).

#### 5.6 Wrong network, wrong token, underpay, overpay (policy proposal, owner decides)

| Case | Proposed policy |
|---|---|
| Underpay within tolerance | accept and annotate (tolerance is an owner parameter, `null` in JSON) |
| Underpay beyond tolerance | hold; offer top-up to the same address within TTL, else refund minus network fee |
| Overpay | credit note (non-withdrawable) or refund minus network fee |
| Late payment after quote TTL | re-quote at the current rate with the customer's consent, else refund minus fee |
| Wrong token (e.g. other TRC20) | no auto-credit; manual recovery SOP with a recovery fee |
| Wrong network | EVM address is identical on all EVM chains, so a mistake there is recoverable if we hold the derived key; TRON/TON mistakes need a recovery SOP |
| Hit on sanctions screen | quarantine (5.4) |

#### 5.7 Economic viability

At the reference rate 257,000 Toman/USDT (BP, 2026-10-02) a 100,000 Toman order is 0.389 USDT and a 1,000,000 Toman order is 3.891 USDT. The customer's exchange withdrawal fee is about 1 USDT on TRC20 (BP): 25.7% of the 1M order. **Policy:** offer USDT payment from about 10 USDT (about 2.57M Toman) and hide it below; at 30,000,000 Toman (116.7 USDT) a 1 USDT sweep+AML cost is 0.86%.

### 6. E-invoice (سامانه مودیان)

**Known (technical, from SDK source P27, P28):** a taxpayer or its service provider uses a *fiscal ID* (tax memory ID), a private key (+ certificate) and an *economic code*. Calls go to `https://tp.tax.gov.ir/req/api/{self-tsp|tsp}/sync/{GET_TOKEN | GET_SERVER_INFORMATION | INQUIRY_BY_UID | GET_FISCAL_INFORMATION | GET_ECONOMIC_CODE_INFORMATION}` and `.../async/normal-enqueue` for sending; sandbox `https://sandboxrc.tax.gov.ir/...`. Invoices are signed (JWS) and encrypted (JWE) with the server's public key, queued asynchronously, then polled by UID until `SUCCESS | FAILED | PENDING | IN_PROGRESS`. The fiscal information response includes `saleThreshold`. Invoice header fields seen: `taxid, inno, indatim, inty (1|2|3), ins, inp, tins, tob, bid, tinb, tprdis, tdis, tadis, tvam, tbill, setm`; body: `sstid, sstt, mu, am, fee, prdis, dis, adis, vra, vam, tsstam`. **The SDK README warns to reach the tax API from an Iranian IP** -> the e-invoice adapter probably must run on Iranian infrastructure (flag for 09-platform).

**Not verified (null in JSON):** who is obliged and since when, the sales thresholds per phase, penalties for non-issuance, B2C-specific rules (invoice type for unregistered consumers), VAT rate for 1405 (04-legal), and third-party service providers. These need the official portals (intamedia.ir, tax.gov.ir) and a licensed accountant.

**Integration design:** an `EInvoiceProvider` adapter with `submit(invoice) -> {uid}`, `status(uid)`, and a retry queue; store `taxid`, `inno`, UID and status per order; issue after payment verification and fulfilment; refunds produce a corrective/return invoice (`ins`). The pricing engine must itemise VAT per line in a way that maps to `vra/vam/tsstam`.

### 7. Fee stack (Python: `scripts/research/03_fee_stack.py`)

Formulas: gateway PSP `min(0.5% x A, 16,000) + 500`; direct-bank floor `1,200 IRR if A_IRR < 6,000,000 else min(0.02% x A_IRR, 40,000 IRR)`; card-to-card receiver fee 0 plus operator cost (scenario); USDT cost = sweep+AML per payment (scenario). Fees round up; Decimal arithmetic; integers out.

**Gateway - Zarinpal-like (min(0.5% x A, 16,000) + 500 Toman)**

| Order (Toman) | Fee (Toman) | Fee % | w/o fixed 500 | % | +VAT 9% | +VAT 10% | +VAT 12% |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 100,000 | 1,000 | 1.000% | 500 | 0.500% | 1,090 | 1,100 | 1,120 |
| 1,000,000 | 5,500 | 0.550% | 5,000 | 0.500% | 5,995 | 6,050 | 6,160 |
| 10,000,000 | 16,500 | 0.165% | 16,000 | 0.160% | 17,985 | 18,150 | 18,480 |
| 30,000,000 | 16,500 | 0.055% | 16,000 | 0.053% | 17,985 | 18,150 | 18,480 |

(VAT columns are sensitivity only; no VAT rate was verified.)

**Direct bank gateway - regulated floor**

| Order (Toman) | Fee (Toman) | Fee % |
|---:|---:|---:|
| 100,000 | 120 | 0.120% |
| 1,000,000 | 200 | 0.020% |
| 10,000,000 | 2,000 | 0.020% |
| 30,000,000 | 4,000 | 0.013% |

**NextPay legacy figure (1%, min 1, max 800) - do not use:** 800 / 800 / 800 / 800 Toman (0.800% / 0.080% / 0.008% / 0.003%).

**Card-to-card (manual): receiver bank fee 0; operator-cost scenarios**

| Order (Toman) | single c2c possible (<= 15M) | op. 1,000 | % | op. 3,000 | % | op. 10,000 | % |
|---:|:--:|---:|---:|---:|---:|---:|---:|
| 100,000 | yes | 1,000 | 1.000% | 3,000 | 3.000% | 10,000 | 10.000% |
| 1,000,000 | yes | 1,000 | 0.100% | 3,000 | 0.300% | 10,000 | 1.000% |
| 10,000,000 | yes | 1,000 | 0.010% | 3,000 | 0.030% | 10,000 | 0.100% |
| 30,000,000 | **NO** | 1,000 | 0.003% | 3,000 | 0.010% | 10,000 | 0.033% |

**USDT on-chain - sweep+AML cost per payment, at 257,000 Toman/USDT (grids at 200,000 and 320,000 are in the script output)**

| Order (Toman) | Order (USDT) | 0.10 USDT | % | 0.50 USDT | % | 1.00 USDT | % | 3.00 USDT | % |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 100,000 | 0.389 | 25,700 | 25.700% | 128,500 | 128.500% | 257,000 | 257.000% | 771,000 | 771.000% |
| 1,000,000 | 3.891 | 25,700 | 2.570% | 128,500 | 12.850% | 257,000 | 25.700% | 771,000 | 77.100% |
| 10,000,000 | 38.911 | 25,700 | 0.257% | 128,500 | 1.285% | 257,000 | 2.570% | 771,000 | 7.710% |
| 30,000,000 | 116.732 | 25,700 | 0.086% | 128,500 | 0.428% | 257,000 | 0.857% | 771,000 | 2.570% |

**Feasibility by order size**

| Order (Toman) | single c2c <= 15M | Zarinpal single <= 100M | gateway per-person/day <= 400M | USDT >= 10 USDT |
|---:|:--:|:--:|:--:|:--:|
| 100,000 | yes | yes | yes | NO |
| 1,000,000 | yes | yes | yes | NO |
| 10,000,000 | yes | yes | yes | yes |
| 30,000,000 | **NO** | yes | yes | yes |

**Reading the stack:** (1) gateway fees are tiny in absolute terms above 10M Toman because of the cap; the fixed 500 Toman matters only for small orders; (2) card-to-card is "free" at the bank but its real cost is operator time and fraud risk, which dominates below about 1M Toman; (3) a 30M Toman order cannot be paid by one card-to-card transfer in 1405 and must use a gateway, Paya/Satna or USDT; (4) USDT collection is uneconomic for orders below about 10 USDT because of network and sweep costs.

## Implications

**Pricing engine** (`packages/core`): load `collection_methods.json`; `collectionFee(method, amountIRT)` returns an itemised line (`gateway_fee`, `vat_on_fee`, `unique_tail` folded in, `chain_cost`). Available methods per cart are filtered by caps and minima (c2c <= 15M, USDT >= ~10 USDT, gateway <= its single-payment ceiling). Fee parameters are records overridable from the admin panel. Round customer prices up; do not surface the c2c tail as a fee. Whether a different price by payment method is allowed (discount for c2c, surcharge for gateway) is UNVERIFIED -> ask 04-legal; the default is a single all-in price.

**Adapters** (`packages/live`, fixture-tested): `PaymentGateway` (Zarinpal, Zibal, IDPay first; Mellat/Parsian SOAP later), `BaleInvoice`, `ChainMonitor` (TronGrid, EVM RPC/Etherscan V2, TONAPI), `SmsProvider` (Kavenegar first, second provider as failover), `IdentityProvider` (Jibit, Finnotech), `EInvoiceProvider` (Moadian, Iran-hosted). Mock adapters in `packages/sim` must reproduce: callback replay, verify idempotency, unverified-payment auto-return after 30 minutes, amount mismatch, Paya/holiday settlement lag.

**Simulator** (`packages/sim`): scenario events - gateway outage; category-based gateway cut (account suspended, settlement held); c2c account freeze; Iranian holiday/Friday settlement lag; internet shutdown (c2c and gateway down while on-chain USDT still works); change of per-card caps; fee reform. Use the structural facts above and the **assumption** priors in `collection_methods.json -> simulation_priors_ASSUMPTIONS` (operator minutes per receipt, fake-receipt share, third-party-funded share, payment completion rate, underpay and wrong-network shares); every one is `low`/`UNVERIFIED` and must be swept in the tornado analysis.

**Owner decisions**: (1) choose the legal entity and open a business account before scaling card-to-card; (2) pick 2 gateways (one payment-yar, one direct PSP) and ask each for a written category answer; (3) approve the payer-ownership rule (card-bound payments, name match) - it is the main lawful defence against triangular fraud; (4) choose USDT tolerance, minimum order and confirmation policy; (5) choose SMS provider pair; (6) decide the stored-balance policy: **avoid customer wallet balances** (credit notes only, non-withdrawable) because of F04.

## Conflicts and adjudication

| # | Conflict | Sources | Adjudication | Confidence |
|---|---|---|---|---|
| C1 | Zarinpal fee: 0.5% cap 16,000 + 500 vs an older 0.05% cap 12,000 | S1 | Use the newer figure; mark low because it is a single secondary source; use `feeCalculation.json` at runtime. | low |
| C2 | NextPay "1% max 800 Toman" vs the regulated floor up to 4,000 Toman | S27 vs S18-S21 | Treat NextPay figure as legacy; never use for pricing. | low |
| C3 | "Direct gateways have no fee" vs regulated per-transaction floor | S28 vs S18-S21 | Interpret as "no payment-yar margin"; the floor applies. | medium |
| C4 | Card-to-card cap 10M vs 15M | older vs 1405 articles (S13-S17) | 15M for 1405; note the source is press, not the CBI circular. | high |
| C5 | Internet purchase cap 400M per person vs 200M per card | S12, S16 | Both can be true (sum vs single card); model both; 200M is single-source (low). | medium/low |
| C6 | Zarinpal amount unit: SDK default IRR vs wrapper default IRT | P1, P2 | Always send `currency` explicitly; keep integer IRT internally. | medium |
| C7 | Jibit birth date: `yyyyMMdd` Jalali vs `yyyy-MM-dd` | P10, P11 | Unresolved; sandbox test. | low |
| C8 | Paya cycle schedules differ across summaries; year of latest change not visible | S22-S24 | Use the 4-cycle table as latest, low confidence; re-read before settlement promises. | low |
| C9 | Dey 1404/1405 gateway-closure claim in the brief | none confirmed | Not asserted; open question Q1. | - |

## Open questions (with verify_how and follow-up search queries)

| # | Question | verify_how / queries to run when the search quota is restored |
|---|---|---|
| Q1 | Were gateways cut for crypto-related merchants in Dey 1404 or 1405, and did the rules change? | Search (FA, extended): "قطع درگاه پرداخت رمزارز دی ۱۴۰۴", "شاپرک ابلاغیه ۱۴۰۵ پرداخت‌یار رمزارز", "بانک مرکزی بخشنامه ۱۴۰۵ پرداخت‌یار". Read Zoomit/ArzDigital articles for dates. |
| Q2 | Exact prohibited-category lists and onboarding documents of Zarinpal, IDPay, Zibal, NextPay, Vandar (gift cards, virtual cards, prepaid top-ups) | Read each terms page in a browser; ask support in writing; keep replies. |
| Q3 | Current fee schedules (Zarinpal pricing page, Zibal, IDPay, Vandar), VAT on fees, instant-settlement tariffs | Zarinpal `feeCalculation.json`; PSP pricing pages; ask 04-legal for VAT. |
| Q4 | Settlement cycles per gateway; current Paya/Satna table | Panel settings; CBI/Shetab notices; query "ساعت تسویه پایا ۱۴۰۵". |
| Q5 | Card-to-card "managed verification" products from PSPs (card-bound transfer with callback) | Query "کارت به کارت درگاهی تایید خودکار پرداخت‌یار", "وب‌سرویس تایید کارت به کارت". |
| Q6 | Bale wallet fees, limits, KYC levels, settlement, how `provider_token` is obtained, mini-app initData algorithm | Read docs.bale.ai payments and miniapp pages; test with a real bot and capture `initData`. |
| Q7 | Identity vendors' per-call prices, SLAs, Shahkar scope, legal basis and consent wording | Vendor price lists/contracts; 04-legal. Queries "قیمت استعلام شاهکار", "قیمت استعلام کارت به شبا جیبیت". |
| Q8 | SMS price per message, line types, template approval, OTP rules | Provider panels; queries "تعرفه پیامک خدماتی ۱۴۰۵". |
| Q9 | TronGrid keyed-tier limits and prices; Etherscan V2 free-tier chain coverage (BSC); TONAPI/TonCenter limits | Provider pricing pages; test with a key; query "Etherscan API V2 free tier BNB Smart Chain 2026". |
| Q10 | OFAC SDN list digital-currency address file format; Chainalysis free API terms; issuer blacklist checks per chain | treasury.gov SDN list page; Chainalysis docs; contract `isBlackListed` ABI. |
| Q11 | USDT TRC20 energy per transfer, energy price, activation fee; BSC gas per transfer; TON fees | Mainnet measurement + provider quotes. |
| Q12 | Moadian: who is obliged, thresholds per phase, penalties, B2C rules, approved third-party providers | intamedia.ir, tax.gov.ir; query "سامانه مودیان مرحله ۱۴۰۵ آستانه فروش جریمه عدم صدور صورتحساب الکترونیکی". |
| Q13 | Is a price difference by payment method allowed in Iran? | 04-legal. |

## Sources

Search-summary sources (page not opened; WebFetch blocked) - **S**:

- [S1] https://www.zarinpal.com/blog/?p=4071 - Zarinpal blog, fee 0.5% cap 16,000 +500 - supports F06-F08.
- [S2] https://www.zarinpal.com/pricing - pricing page listed in results; not seen.
- [S3] https://www.zarinpal.com/terms.html - Zarinpal terms, updated 8 Tir 1404 - F05, prohibited-category frame.
- [S4] https://www.zoomit.ir/tech-iran/432535-regulatory-directive-cryptocurrency-market-by-central-bank/ - CBI directive, exchanges -> PSPs - F03.
- [S5] https://mihanblockchain.com/online-payment-of-iranian-cryptocurrency-exchanges-should-be-banned/ - Shaparak cut notice - F02.
- [S6] https://arzdigital.com/blog/report-cbi-new-instructions-crypto/ - F03.
- [S7] https://mihanblockchain.com/iranian-exchanges-direct-rial-payment-halt/ - direct rial deposit halt.
- [S8] https://mihanblockchain.com/iran-central-bank-conditions-crypto-exchanges/ - conditions for re-opening.
- [S9] https://fararu.com/fa/news/831729/%D9%86%D8%A8%D8%B1%D8%AF-%D8%B4%D8%A7%D9%BE%D8%B1%DA%A9-%D8%B5%D8%B1%D8%A7%D9%81%DB%8C-%D9%87%D8%A7%DB%8C-%D8%A7%DB%8C%D8%B1%D8%A7%D9%86%DB%8C-%D8%A7%D8%B1%D8%B2-%D8%AF%DB%8C%D8%AC%DB%8C%D8%AA%D8%A7%D9%84-%D8%A7%D8%AC%D8%B1%D8%A7%DB%8C-%D8%B4%D8%B1%D8%B7-%D8%B4%D8%B1%D9%88%D8%B7-%DA%AF%D8%A7%D9%86%D9%87-%DB%8C%D8%A7-%D9%BE%D8%A7%DB%8C%D8%A7%D9%86-%DA%A9%D8%A7%D8%B1 - "10 conditions".
- [S10] https://www.zoomit.ir/tech-iran/368633-central-bank-to-ban-payment-gateways-crypto-trading/ - CBI closes exchange gateways.
- [S11] https://www.zoomit.ir/tech-iran/388644-payment-gateways-crypto-trading/ - F04.
- [S12] https://www.zarinpal.com/blog/%D8%B3%D9%82%D9%81-%D8%AA%D8%B1%D8%A7%DA%A9%D9%86%D8%B4-%D8%AF%D8%B1%DA%AF%D8%A7%D9%87-%D9%BE%D8%B1%D8%AF%D8%A7%D8%AE%D8%AA-%D8%A7%DB%8C%D9%86%D8%AA%D8%B1%D9%86%D8%AA%DB%8C/ - F30, F31.
- [S13] https://www.zoomit.ir/howto/463880-iran-bank-cards-money-transfer-limit/ - F29.
- [S14] https://fararu.com/fa/news/978296/%D8%B3%D9%82%D9%81-%D8%AA%D8%B1%D8%A7%DA%A9%D9%86%D8%B4-%D8%A8%D8%A7%D9%86%DA%A9%DB%8C-1405 - F29.
- [S15] https://www.jamaran.news/%D8%A8%D8%AE%D8%B4-%D8%A7%D9%82%D8%AA%D8%B5%D8%A7%D8%AF-13/1720067-%D8%B3%D9%82%D9%81-%DA%A9%D8%A7%D8%B1%D8%AA-%D8%A8%D9%87-%DA%A9%D8%A7%D8%B1%D8%AA-%DA%A9%D8%A7%D8%B1%D8%AA%D8%AE%D9%88%D8%A7%D9%86-%D8%AF%D8%B1-%D8%B3%D8%A7%D9%84-%DA%86%D9%82%D8%AF%D8%B1-%D8%A7%D8%B3%D8%AA - F29.
- [S16] https://nabzgheymat.ir/%D8%B3%D9%82%D9%81-%D8%AA%D8%B1%D8%A7%DA%A9%D9%86%D8%B4%D9%87%D8%A7%DB%8C-%D8%A8%D8%A7%D9%86%DA%A9%DB%8C-%D8%AF%D8%B1-%DB%B1%DB%B4%DB%B0%DB%B5-%DA%86%D9%82%D8%AF%D8%B1-%D8%A7%D8%B3%D8%AA/ - F29, F30.
- [S17] https://www.eghtesadnews.com/%D8%A8%D8%AE%D8%B4-%D8%A7%D8%AE%D8%A8%D8%A7%D8%B1-%D8%A7%D9%82%D8%AA%D8%B5%D8%A7%D8%AF%DB%8C-67/790333-%D8%B3%D9%82%D9%81-%D8%A7%D9%86%D9%88%D8%A7%D8%B9-%D8%AA%D8%B1%D8%A7%DA%A9%D9%86%D8%B4-%D8%A8%D8%A7%D9%86%DA%A9%DB%8C-%D8%AF%D8%B1-%D8%B3%D8%A7%D9%84-%D8%AC%D8%AF%D9%88%D9%84 - F29.
- [S18] https://www.zarinpal.com/blog/?p=5947 - fee reform 4 Tir - F09.
- [S19] https://www.zoomit.ir/tech-iran/406506-receiving-fees-from-purchase-transactions/ - F09.
- [S20] https://ecoiran.com/fa/tiny/news-38727 - F09.
- [S21] https://www.eghtesadnews.com/%D8%A8%D8%AE%D8%B4-%D8%A7%D8%AE%D8%A8%D8%A7%D8%B1-%D8%A7%D9%82%D8%AA%D8%B5%D8%A7%D8%AF%DB%8C-67/583952-%D8%A7%D8%AE%D8%B0-%DA%A9%D8%A7%D8%B1%D9%85%D8%B2%D8%AF-%D8%A7%D8%B2-%D8%AA%D8%B1%D8%A7%DA%A9%D9%86%D8%B4-%D9%87%D8%A7%DB%8C-%D8%A7%DB%8C%D9%86-%D8%A7%D8%B5%D9%86%D8%A7%D9%81-%D8%AD%D8%B0%D9%81-%D8%B4%D8%AF - guild exemptions - F09.
- [S22] https://iranbroker.net/?p=200635 - Paya hours - F27.
- [S23] https://bankavl.com/%D8%A8%D8%AE%D8%B4-%D8%A7%D8%AE%D8%A8%D8%A7%D8%B1-2/50674-%D8%B3%D8%A7%D8%B9%D8%AA-%D8%AA%D8%B3%D9%88%DB%8C%D9%87-%D8%B3%D8%A7%D9%85%D8%A7%D9%86%D9%87-%D9%BE%D8%A7%DB%8C%D8%A7-%D8%AA%D8%BA%DB%8C%DB%8C%D8%B1-%DA%A9%D8%B1%D8%AF - Paya hours - F27.
- [S24] https://www.etemadonline.com/%D8%A8%D8%AE%D8%B4-%D8%A7%D9%82%D8%AA%D8%B5%D8%A7%D8%AF%DB%8C-22/552925-%D8%B3%D8%A7%D8%B9%D8%AA-%DA%A9%D8%A7%D8%B1%DB%8C-%D8%B3%D8%A7%D8%AA%D9%86%D8%A7-%D8%A7%D9%81%D8%B2%D8%A7%DB%8C%D8%B4-%DB%8C%D8%A7%D9%81%D8%AA - Satna hours - F28.
- [S25] https://digiato.com/promoted/a-complete-look-at-payment-gateways-in-iran-why-to-choose-zibal - sponsored; F18.
- [S26] https://www.rade.ir/ipg/703615-%D9%88%D9%86%D8%AF%D8%A7%D8%B1/ - F24.
- [S27] https://docs.nextpay.world/guide/nextpay/getting-started/requirements - F22.
- [S28] https://www.zarinpal.com/landing/asanpardakht/ - F01.
- [S29] https://www.mahaksoft.com/89985/bank-transaction-tax/ - F32.
- [S30] https://arzdigital.com/blog/report-iran-crypto-exchanges-blocked/ - F33.
- [S31] https://ka.wordpress.org/plugins/?p=285839 - F34.
- [S32] https://python-bale-bot.readthedocs.io/en/latest/examples.invoice.html - F38.
- [S33] https://vec.wordpress.org/plugins/?p=356754 - Bale WooCommerce plugin, F37.
- [S34] https://docs.bale.ai/miniapp - mini apps (title/summary only) - F43.
- [S35] https://www.zarinpal.com/docs/sdk/python/method/verify - verify codes.
- [S36] https://bankavl.com/%D8%A8%D8%AE%D8%B4-%D8%A7%D8%AE%D8%A8%D8%A7%D8%B1-2/62096-%D9%87%D8%B4%D8%AF%D8%A7%D8%B1-%D9%BE%D9%84%DB%8C%D8%B3-%D8%AD%D8%B3%D8%A7%D8%A8-%D8%AA%D8%A7%D9%86-%D9%85%D9%85%DA%A9%D9%86-%D8%A7%D8%B3%D8%AA-%DB%8C%DA%A9-%D8%B4%D8%A8%D9%87-%D9%85%D8%B3%D8%AF%D9%88%D8%AF-%D8%B4%D9%88%D8%AF - police warning - F33.
- [BP] docs/business-plan-full-context.md - round-0 plan (section 5; USDT 257,000 Toman at ~10 Mehr 1405).

Package sources read directly (registry tarballs; evidence of API shape, may lag the live API) - **P**:

- [P1] npm `zarinpal-node-sdk` 2.2.0 (2025-07-01). [P2] npm `zarinpal-checkout` 1.1.1 (2026-07-11). [P3] npm `irpayments` 1.97.0 (2026-07-08; Zarinpal/Zibal/IDPay drivers and Persian error maps). [P4] npm `zibal` 2.0.0 (2026-08-22). [P5] npm `ipg-node` 1.2.2 (2022-06-01; Mellat, Sadad, Sepehr, NextPay). [P6] npm `pec-payment-sdk` 1.1.2 (2026-06-01). [P7] npm `payir-v2` 1.2.1 (2021-07-18). [P8] PyPI `nextpay` 1.0.0 (2022-08-26). [P9] npm `idpay-node` 1.0.81 (2021-08-29). [P10] npm `node-jibit` 1.0.8 (2023-02-28). [P11] PyPI `jibit` 1.2.4 (2025-10-14). [P12] npm `finnotech-client-sdk` 1.1.2 (2023-06-07). [P13] npm `finnotech-js` 1.0.0 (2024-01-31). [P14] npm `@alikhangholi/iran-sms` 1.0.2 (2026-06-06). [P15] npm `kavenegar` 1.1.4 (2018-10-06). [P16] PyPI `melipayamak` 1.0.1 (2024-11-16) and npm `melipayamak-api-ts`. [P17] PyPI `python-bale-bot` 2.5.0 (2024-01-22). [P18] PyPI `baleio` 0.1.0 (2026-07-06). [P19] PyPI `pyrobale` 0.7.0 (2026-06-24). [P20] npm `balebaazoo` 1.4.1 (2026-06-29). [P21] PyPI `rubika-bot-api` 1.2.0 (2025-11-11). [P22] PyPI `eitaapy` 1.2.0 (2025-02-11). [P23] npm `trongrid` 1.2.6 (2020-03-17). [P24] PyPI `tronpy` 0.6.2 (2026-01-08). [P25] npm `trongrid-cli` 0.1.2 (2026-04-20). [P26] PyPI `pytonapi` 2.3.0 (2026-09-20). [P27] npm `moadian` 1.0.5 (2025-07-19). [P28] npm `taxapi` 1.1.0 (2024-06-02). [P29] npm `@gitmyabi/chainalysis-sanctions-oracle` 1.0.0. [P30] PyPI `ccxt` (sample responses in gate/coinex/weex sources list the USDT contracts). [P31] npm `tronzap-sdk` 1.0.4 (2025-06-28). [P32] PyPI `aioetherscan` 0.9.4 (2024-06-20). [P33] npm `etherscan-api` 12.2.0 (2026-09-27; V1 deprecation note, V2 base URL, bsc=56). [P34] npm `@n4mchun/etherscan-sdk` 0.1.0 (2026-02-03; V2 base URL, BNB=56, default 5 req/s). [P35] npm `easypay.js` 1.0.15 (2025-08-21; Zarinpal/IDPay/Zibal/PayStar drivers; callback `Status`/`Authority`). [P36] npm `bale-otp` 1.0.0 (2025-06-27, unofficial; Bale Safir OTP).

*Compliance note: this document is analysis for product design, not legal, tax or financial advice; confirm every regulatory point with a licensed Iranian lawyer and tax adviser before launch.*
