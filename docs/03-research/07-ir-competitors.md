---
title: Iranian competitor benchmark - virtual cards, FX payments, subscriptions, gift cards, exam/embassy fees
owner_agent: 07-competitor-benchmark-ir
as_of: 2026-10-02
confidence: low
status: draft
---

# Iranian competitor benchmark (brief 07)

Companion files: `data/competitors.json` (machine-readable, validated) and `scripts/research/07_markup_stats.py` (all calculations; `--write` refreshes the derived blocks).
Evidence tags used below: **[F]** fact as reported in a search summary (page not read directly), **[D]** derived by the script from [F] inputs, **[A]** modelling assumption (not an observation).

## خلاصه (برای مالک)

- **محدودیت شواهد (مهم):** سقف جستجوی وب این نشست پر شد (۲۰۰ از ۲۰۰) و همه‌ی سایت‌های رقبا توسط پراکسی مسدود بودند. فقط ۳۸ جستجوی موفق انجام شد (کمتر از ۴۰ هدف) و هیچ صفحه‌ی رقیبی مستقیم دیده نشد؛ همه‌ی ارقام «بر اساس خلاصه‌ی نتایج جستجو»‌اند و اطمینان پایین/متوسط دارند. این گزارش پیش‌نویس است و پس از افزایش سقف جستجو باید دوباره اجرا شود.
- **نقشه‌ی رقبا:** ۳۲ رقیب با پروفایل (۷ مورد با عدد کارمزد یا زمان تحویل) به‌علاوه‌ی ۱۳ نام دیگر: کارت مجازی و پرداخت ارزی (کافه‌ارز، الماس‌پیمنت، دلاری‌شو، فراکنش، تهران کردیت‌کارت، ایرانی‌کارت، سفیرپیمنت، تهران‌پیمنت، ۲۰پیمنت، ارزی‌پی)، گیفت‌کارت و اشتراک (جیب‌استور، گیفت‌کارت۹۸، لایسنس‌مارکت و …). «هایپر‌اکانت»، «دیجیتال‌رو» و «پی‌بال» پیدا نشدند.
- **نرخ مرجع ۱۰ مهر ۱۴۰۵:** دلار آزاد ۲۵۸٬۴۶۵ تومان، نرخ رسمی مرکز مبادله ۱۷۴٬۷۰۴ تومان (شکاف ≈ ۴۸٪)، تتر ≈ ۲۵۶٬۹۰۰ تومان.
- **کارمزدهای دیده‌شده:** دلاری‌شو: صدور ۱۰ دلار، حداقل شارژ ۱۰ دلار، کارمزد ۴٪ (+ ۲٫۹۹٪ تبدیل ارز)؛ تهران کردیت‌کارت: ۶٪ (سفارش ۱٬۰۰۰–۳٬۰۰۰ دلار) و ۵٪ (بالای ۳٬۰۰۰)؛ الماس‌پیمنت: کارمزد ثابت ۱۸ دلار (زیر ۱٬۰۰۰) و ۵۰ دلار (بالای ۱٬۰۰۰) به‌علاوه‌ی «نرخ حواله‌ی مشخص‌شده» (شفاف نیست)؛ بازه‌ی عمومی درگاه‌های ارزی ۲ تا ۵٪ (مقاله‌ی سال ۲۰۲۴).
- **ChatGPT Plus:** حساب‌های «شبه‌رسمی» ۵٫۵۴ تا ۶٫۶۰ میلیون تومان (۷٪ تا ۲۸٪ بالاتر از برابری دلاری ۵٫۱۷ میلیون)؛ حساب‌های ۱ تا ۱٫۳ میلیونی (۷۵ تا ۸۱٪ زیر برابری) محصولی متفاوت و پرریسک‌اند؛ با آن‌ها رقابت قیمتی نکنید.
- **هشدار کلیدی:** کف هزینه‌ی مدل ما برای شارژ ۱۰۰ دلاری ≈ ۷٪ بالاتر از دلار آزاد است ولی کارمزد اعلام‌شده‌ی رقبا ۴ تا ۶٪ است. برای رسیدن به ۴٪ باید کارمزد تأمین‌کننده حدود ۰٫۱٪ باشد (یا ≈ ۲٫۱٪ اگر بافر ریسک صفر شود). پس یا نرخ رقبا بالاتر از بازار است یا هزینه‌ی تأمین‌شان بسیار کمتر است (احتمالاً خنثی‌سازی دوطرفه‌ی «نقد درآمد ارزی» و «پرداخت ارزی»). ارزان‌ترین Plus (۵٫۵۴م) هم ۴٪ زیر کف هزینه‌ی مدل ماست (۵٫۷۷م).
- **جایگاه‌یابی:** در ۵۴ عنوان صفحه، «سرعت» ۲۴٪ و «ارزانی» ۲۶٪ ادعا شده؛ «ضمانت» فقط ۲٪ و «معتبر/اورجینال» ۴٪ ← شکاف برای برند شفاف، با ضمانت، SLA و افشای محدودیت‌ها.
- **مدل انتخاب، کشش قیمتی، فصل‌بندی، اندازه‌ی بازار:** شواهد مستقیم پیدا نشد. آنچه آمده «فرض مدل» (نه واقعیت) با بازه‌ی پایین/پایه/بالا و تحلیل حساسیت است: کشش قیمتیِ بنگاه ≈ منفی ۱۰ (منفی ۵ تا منفی ۲۰)؛ حجم بازار مدل ≈ ۴۷۴ میلیون دلار در سال (۱۸۶ تا ۱٬۲۰۰ میلیون).
- **جنگ قیمت:** اپیزود تاریخی مستندی پیدا نشد؛ مکانیزم‌ها، کف‌ها و الگوهای واکنش برای شبیه‌ساز تعریف شد. در شارژ کارت تقریباً جایی برای تخفیف نیست؛ در اشتراک‌ها جا هست.
- **اقدام بعدی (حدود ۲ ساعت):** «خریدار مخفی» قانونی روی ۱۵ تا ۲۰ رقیب با پروتکل بخش ۸ (قیمت‌های هم‌زمان با نرخ‌های مرجع) و اجرای دوباره‌ی این بریف.
- **هشدار:** این تحلیل مشاوره‌ی حقوقی/مالیاتی نیست و باید با متخصص مجاز تأیید شود. هیچ راهکار دور زدن KYC، تحریم یا محدودیت جغرافیایی ارائه نشده است.

## TL;DR

- **Evidence ceiling.** Session web-search budget exhausted (200/200); 38 successful searches (16 extended), 4 refused; every competitor host returned `EGRESS_BLOCKED` (org egress policy; not retried). Zero pages read directly, so every competitor fact is "per search summary" [S10-S42]. Confidence: low overall; the file is a draft to be re-run.
- **Census (2026-10-02).** 32 profiled competitors (L2 = numeric fee/SLA facts: 7; L1 = product/positioning only: 25) + 13 named-only + 4 adjacent entities; 18 sell cards/FX payments/PM, 14 sell gift cards/subscriptions. `hyper-acc`, `digitalro`, `paybal.ir` not found.
- **Reference rates.** Free-market USD 258,465 IRT (10 Mehr 1405) [S01-S04]; official exchange-centre sell 174,704 IRT on 2026-10-01 [S05]; premium +47.95% [D]; USDT 256,900 IRT [S08].
- **Visible fees [F, low].** Dollarisho: USD 10 issuance, USD 10 min load, 4% fee + 2.99% FX conversion, rate = live Bonbast [S12, S13]. Tehran Credit Card: 2%+4% = 6% (USD 1k-3k), 2%+3% = 5% (>USD 3k) [S14]. Almas: fixed USD 18 (<USD 1k) / USD 50 (>=USD 1k) + opaque house rate [S10]. Generic FX-gateway band 2-5% (2024 article) [S15].
- **ChatGPT Plus (USD 20) [F+D].** Official-like listings 5,539,100 / 6,400,000 / 6,596,200 / 8,890,000 IRT = +7.15% / +23.81% / +27.60% / +71.98% over parity 5,169,300 IRT (median +25.71%, n=4). A gray tier at 0.99-1.3M IRT (-75% to -81%) is a different, high-risk product.
- **Cost floor vs visible fees [D].** Our modelled break-even for a USD 100 load is +6.95% over free USD vs visible competitor fees of 4-6%; matching 4% needs a provider top-up fee of ~0.13% (or ~2.14% with zero risk buffer). Lowest official-like Plus price is 4.05% below our break-even.
- **Archetypes.** A pass-through rate + % fee; B house rate + fixed USD fee; C Toman price list; D bid/ask spread (PM: 4.08-6.73% round trip, undated); E incumbent trust brands (10-16 years); F gray cheap accounts. Incumbents also run cash-out flows, which net against payment demand.
- **Positioning evidence.** Of 54 listed page titles, 24% claim speed, 26% price, 2% a guarantee, 4% authenticity/trust: trust/guarantee is the open lane.
- **Choice model / elasticity.** No empirical estimate possible. Priors [A]: firm-level elasticity -10 (-5 to -20), speed premium 10% (3-25), trust premium 10% (3-25); an 8% undercut multiplies a 10% share by ~2.3x under the blended prior until matched.
- **Market size [A].** Reseller-served GMV USD 474m/yr (p10 186m, p90 1,200m); revenue pool USD 27m (9-80m); ~40k orders/day industry-wide (16k-101k); a new brand at 0.5% share: USD 2.3m GMV in year 1.
- **Price war.** No dated episode found. Percentage-fee card loads have negative headroom (-0.9 to -3.0 pp vs our floor); subscriptions have +14 pp at the median.
- **Next.** Run the 2-hour mystery-shopper protocol (section 8) and re-run this brief after the search cap is raised (`CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION`; allow the competitor hosts under the environment's Network access, Allowed domains).

## 0. How to read this file

| item | value |
|---|---|
| Searches completed / refused | 38 (22 standard, 16 extended) / 4 (budget) - ledger in Appendix A |
| Pages fetched directly | 0 (all hosts blocked; 28 hosts listed in `_meta.evidence_quality`) |
| Evidence levels | L2 numeric fee/SLA facts; L1 product or positioning facts; L0 name only |
| Source labelling | Every [S..] is "per search summary" unless stated "title seen" (title and URL were visible in the result list; content not) |
| Dating | Observations made on 2026-10-02 (Friday, 10 Mehr 1405); some pages in the result sets are older or undated and are flagged |
| Not legal or tax advice | Confirm structure, marketing claims and any netting model with a licensed professional (specialist 04) |

## Facts table

| id | fact | value | unit | as_of | confidence | sources |
|---|---|---|---|---|---|---|
| F01 | Free-market USD, latest registered (other quotes 258,500 / 258,520 / 259,900) | 258,465 | IRT per USD | 2026-10-02 | medium | S01-S04 |
| F02 | USDT price | 256,900 | IRT per USDT | 2026-10-02 | medium | S08 |
| F03 | Official exchange-centre USD sell (buy 173,132) | 174,704 | IRT per USD | 2026-10-01 | medium | S05 |
| F04 | Free / official premium | 47.95 | % | 2026-10-02 | medium | D from F01, F03 |
| F05 | CBI began selling USD 1bn (headline only) | from 8 Mehr (2026-09-30) | text | 2026-09-30 | low | S06 |
| F06 | Dollarisho virtual-card issuance | 10 | USD | 2026-10-02 | low | S12, S13 |
| F07 | Dollarisho minimum load | 10 | USD | 2026-10-02 | low | S12, S13 |
| F08 | Dollarisho payment fee | 4.0 | % of USD amount | 2026-10-02 | low | S13, S15 |
| F09 | Dollarisho FX conversion fee | 2.99 | % per transaction | 2026-10-02 | low | S13 |
| F10 | Dollarisho rate basis | live Bonbast rate (site claim) | text | 2026-10-02 | low | S13 |
| F11 | Tehran Credit Card commission, order USD 1,000-3,000 | 2 + 4 = 6 | % | 2026-10-02 | low | S14, S15 |
| F12 | Tehran Credit Card commission, order > USD 3,000 | 2 + 3 = 5 | % | 2026-10-02 | low | S14, S15 |
| F13 | Almas fixed fee, Mastercard charge < USD 1,000 | 18 | USD | 2026-10-02 | low | S10 |
| F14 | Almas fixed fee, Mastercard charge > USD 1,000 | 50 | USD | 2026-10-02 | low | S10 |
| F15 | Almas usage fee online and at foreign POS (cap USD 5) | 1 | % | 2026-10-02 | low | S10 |
| F16 | Almas invoice formula | (USD amount + centre fee) x specified USD transfer rate | text | 2026-10-02 | low | S10 |
| F17 | Generic FX-gateway fee band (article titled 2024: stale) | 2-5 | % | 2024 | low | S15 |
| F18 | IraniCard Prestige issuance: Gold Express / Platinum Express / Platinum Prestige | 100 / 120 / 395 | USD | 2026-10-02 | low | S27 |
| F19 | Cafearz rechargeable Mastercard delivery | up to 72 | hours | 2026-10-02 | low | S17 |
| F20 | Farakonesh virtual Mastercard delivery | 1-3 | business hours | 2026-10-02 | low | S19 |
| F21 | Farakonesh deposit to a foreign account | 1-3 | days | 2026-10-02 | low | S20 |
| F22 | Cafearz fiat withdrawal fee | 1,000-15,000 | IRT | 2026-10-02 | low | S18 |
| F23 | Cafearz IranBroker rating (n=16) | 3.5 | stars of 5 | 2026-10-02 | low | S16 |
| F24 | Cafearz legal entity registered | 2022-11-23 | date | 2026-10-02 | low | S16 |
| F25 | Years online: IraniCard (est. 1389) / Tehran Payment (1391) / Cafearz brand (1398) / Kifpool (1399) / Safir | 16 / 14 / 7 / 6 / >10 | years | 2026-10-02 | low | S28, S21, S16, S30, S31 |
| F26 | Perfect Money USD round-trip spread at 3 sellers (quotes undated, levels stale) | 4.08 / 4.39 / 6.73 | % | undated | low | S36 |
| F27 | ChatGPT Plus 1-month listing (store not identified) | 5,539,100 | IRT | 2026-10-02 | low | S34a-h |
| F28 | ChatGPT Plus 1-month listing (another sample) | 6,596,200 | IRT | 2026-10-02 | low | S34a-h |
| F29 | ChatGPT Plus listing range seen | 989,000-8,890,000 | IRT | 2026-10-02 | low | S34a-h |
| F30 | Lead's independent Plus range ("depending on account type") | 1,300,000-6,400,000 | IRT | 2026-10-02 | low | S08 |
| F31 | USD 20 parity at F01 | 5,169,300 | IRT | 2026-10-02 | medium | D |
| F32 | Listing age of catalog sellers at observation | 6 h to 48 h | hours | 2026-10-02 | low | S35 |
| F33 | Page titles claiming speed / price / guarantee / authenticity (of 54) | 13 / 14 / 1 / 2 | count | 2026-10-02 | medium | S37 [D] |
| F34 | Almas discloses: cards unusable at ATMs; Iranian-IP use gets the Visa blocked, no reactivation | text | text | 2026-10-02 | low | S11 |
| F35 | Cafearz Android app on Cafe Bazaar and Myket | true | bool | 2026-10-02 | low | S40 |
| F36 | Kifpool exchange fees: store 0.25-0.5%; USDT market 0.2% | see text | % | 2026-10-02 | low | S30 |
| F37 | Kifpool Mastercard price (undated, historical; only USD ~0.97 at today's rate) | 250,000 | IRT | undated | low | S29 |
| F38 | Our modelled break-even, USD 100 load, existing card | +6.95 | % over free USD | 2026-10-02 | medium | D (S09) |
| F39 | Our modelled break-even, ChatGPT Plus, existing card | 5,772,655 (+11.67) | IRT (% over parity) | 2026-10-02 | medium | D (S09) |
| F40 | Adjacent: Iran Tourist Card EUR 22 flat, 7% online top-up (inbound tourists) | 22 / 7 | EUR / % | 2026-10-02 | low | S32 |

## Details

### 1. Competitor landscape

**1.1 Census.** 32 profiled (L2: cafearz, almaspayment, dollarisho, tehrancreditcard, farakonesh, iranicard, kifpool; the other 25 are L1), 13 named-only (Nik Pardakht, Pay98, Virapay, MoboGift, GiftMax, GiftCardStore, Gift Card IM, Sarzamin File, Arzjoo, XPay, DigiDollar, Paymenter, Arzypto), 4 adjacent (mpay, Iran Tourist Card, a Saman-exchange Mastercard, price aggregators). Segment counts among the 32: virtual card 15, FX payment 12, subscription 9, gift card 7, Perfect Money 7, exam/embassy 4, crypto exchange 3, FX-income cash-out 3, physical card 2, shopping 2. This is "brands visible in top search results", not a census of the market.

**1.2 Master table A - cards, FX payments, cash-out, Perfect Money, exchanges.** Trust LB = lower-bound trust points (rubric in `_meta.trust_rubric`; unknown components score 0; "-" = no component known).

| # | id | name (fa) | evidence | what sells | facts seen | trust LB |
|---|---|---|---|---|---|---|
| 1 | cafearz | کافه ارز | L2 | rechargeable Mastercard, virtual Visa/MC, PM/WebMoney, 600+ coins, foreign-site payments | MC up to 72 h; fiat deposit free; IranBroker 3.5/5 (n=16); brand 2019, entity 2022-11-23; association member; Android app | 54.6 |
| 2 | almaspayment | الماس پیمنت | L2 | physical MC, virtual (non-reloadable), reloadable virtual Visa (3 y), FX payment | fixed fee USD 18 / 50; usage fee 1% (cap USD 5); invoice formula; discloses ATM/IP restrictions; FAQ and fee pages | - |
| 3 | dollarisho | دلاری‌شو | L2 | reloadable virtual MC/Visa (USD, EUR, GBP, TRY), foreign-site payments | issue USD 10; min load USD 10; 4% + 2.99%; live Bonbast rate; Apple Pay/Google Pay support | - |
| 4 | tehrancreditcard | تهران کردیت کارت | L2 | virtual Visa (reloadable or not), online FX payment | 2%+4% (USD 1k-3k), 2%+3% (>USD 3k) | - |
| 5 | farakonesh | فراکنش | L2 | virtual MC (EUR load, 1 y), virtual Visa, physical MC, PayPal/PM/WebMoney, store purchases | delivery 1-3 business hours; foreign deposits 1-3 days | 5.0 |
| 6 | iranicard | ایرانی‌کارت | L2 | Prestige physical Visa, FX-income cash-out, international payments | USD 100/120/395; est. 2010; sponsored articles through Sept 2026 | 35.0 |
| 7 | kifpool | کیف پول من | L2 | exchange + Mastercard add-on | exchange fees 0.25-0.5% / 0.2%; card 250,000 IRT (historical) | 17.0 |
| 8 | tehranpayment | تهران پیمنت | L1 | exam/embassy fees, FX, dedicated ChatGPT Plus | est. 2012; Mehr Electronic Exchange Co.; student services (2023) | 48.0 |
| 9 | safirpayment | سفیرپیمنت | L1 | foreign-site payments, cash-out, exam fees, PayPal, store purchases | ">10 years"; current-year content marketing | 20.0 |
| 10 | 20payment | بیست پیمنت | L1 | FX payment on own international accounts, MC issue/top-up, exams, tuition | 24-hour support (claim) | 15.0 |
| 11 | arzipay | ارزی پی | L1 | cash-out (PayPal, PM, WebMoney, WU), PayPal setup, MC top-up | "PayPal in 2 minutes" claim; 2 sponsored articles | 5.0 |
| 12 | arzipayment | ارزی پیمنت | L1 | rechargeable virtual MC | relationship to arzipay.com unknown | - |
| 13 | asancard | آسان‌کارت | L1 | FX payment (Visa, MC, PayPal) | article only | - |
| 14 | mihancard | میهن‌کارت | L1 | virtual MC | "reliable, instant delivery" title | - |
| 15 | cheapsafar | ارزان سفر | L1 | rechargeable MC, student FX payments | student targeting | - |
| 16-18 | sarmayex, payorder, 30pay | سرمایکس، پی‌اردر، ۳۰پی | L1 | Perfect Money (USD) quotes | round-trip spread 4.08 / 4.39 / 6.73% (undated) | - |

**1.3 Master table B - gift cards, subscriptions, card shops.**

| # | id | name (fa) | evidence | what sells | facts seen |
|---|---|---|---|---|---|
| 19 | giftcard98 | گیفت‌کارت ۹۸ | L1 | gift cards; virtual MC/Visa categories | "cheap, instant delivery" |
| 20 | mojogift | موجوگیفت | L1 | virtual Visa (US/CA/UK), gift cards | "original" claim |
| 21 | gamecard | گیم‌کارت | L1 | reloadable USD Visa with USD 1 balance, gift cards | "instant" claim |
| 22 | jibstore | جیب استور | L1 | Apple gift cards, paid apps, Steam, in-game items | 2 sponsored articles |
| 23 | ipinz | آی‌پینز | L1 | Steam (Turkey), gift cards | domain not seen; 2 sponsored articles |
| 24 | giftcardi | گیفت‌کارتی | L1 | cheap gift cards | domain not seen; sponsored article |
| 25 | license-market | لایسنس مارکت | L1 | ChatGPT Plus (instant top-up), Spotify, Netflix, Apple Music "licences" | Virgool blog |
| 26 | numberland | نامبرلند | L1 | virtual numbers, ChatGPT accounts | "money-back guarantee" |
| 27 | zarinacc | زرین اکانت | L1 | ChatGPT accounts | "instant, up to 50% discount" |
| 28 | iranget | ایران گت | L1 | ChatGPT Plus and Pro | discounted |
| 29 | ir-premium | آی‌آر پریمیوم | L1 | ChatGPT Plus | "cheap + instant" |
| 30 | bluespotify | بلو اکانت | L1 | ChatGPT Plus | "lowest price in Iran" |
| 31 | spotifyy | اسپاتیفای‌آی‌آر | L1 | ChatGPT Plus one month | - |
| 32 | diamondland | دایمند لند | L1 | ChatGPT accounts | domain not seen; sponsored article |

**1.4 Field coverage (what we know, of 32 profiles).**

| field | known for | field | known for |
|---|---|---|---|
| fee structure (any numeric) | 9 | trust lower bound | 8 |
| founded year | 5 | delivery SLA | 2 |
| payment methods | 1 | independent rating | 1 |
| 24h/hours support | 1 | mobile app / bot | 1 |
| rush/express | 1 | Enamad | 0 |
| attributable price points | 0 | re-pricing cadence (numeric) | 0 |
| loyalty/referral | 0 | complaint patterns | 0 |

The zeros are measurement gaps, not market facts. Section 8 closes them.

**1.5 Profiles of note.**
- **Cafearz** [F]: exchange + FX-payment hybrid; no explicit trading commission, revenue from the buy/sell spread (IranBroker); fiat deposit free, withdrawal 1,000-15,000 IRT; claims KYC in under 10 minutes; legal entity "Tajareh Hoshmand Bazar Afarin" registered 2022-11-23 while the brand dates to 2019; member of the Iran Blockchain Association; reviews praise speed and quality (n=16) [S16-S18].
- **Almas Payment** [F]: the only competitor in the evidence publishing an explicit invoice formula, a fee/perks page and an FAQ; the formula's "specified transfer rate" is opaque; fixed fees are regressive (18% of a USD 100 load, 3.6% of USD 500, 1.8% of USD 999 if the USD 18 tier applies to virtual loads) [S10, S11].
- **Dollarisho** [F]: pass-through archetype; the 4% + 2.99% stack and the USD 10 issuance make a new USD 50 card cost 24% in explicit fees (14% at USD 100) [S12, S13].
- **Tehran Credit Card** [F]: tiered by size (6% then 5%), suggesting a larger-ticket or B2B orientation; no sub-USD 1,000 tier found [S14].
- **IraniCard, Safir, Tehran Payment** [F]: 10-16 year brands; multi-product (cash-out, payments, exams); paid media presence (IraniCard "reportage September 2026") [S21, S27, S28, S31].
- **Two-sided flows.** Arzipay, IraniCard and Safir sell both FX-income cash-out and FX payments [S23, S28, S31]. In principle such flows can be netted internally (hypothesis: the evidence shows the product mix, not that these firms net), which would remove exchange spread, fees and the 72-hour lock from the funding cost. A new entrant funded only by buying USDT would lack this (see section 7.3 and Implications; legality is for specialist 04).

**1.6 Trust signals, reviews, complaint patterns.** Only one independent rating exists in the evidence (Cafearz 3.5/5, n=16 [S16]). Enamad status is unknown for every competitor. Qualitative signals: guidance articles warn that unrealistic prices signal scams and advise checking registration number, address and responsive support [S42]; promoted articles on ChatGPT accounts concede third-party accounts carry ToS and support risk [S38]; Almas pre-discloses card restrictions [S11]. The lead's research (supplier mpay) reports Trustpilot ~3/5 with fund-loss complaints [S08]. Complaint themes expected but **not observed here** (hypotheses, `verify_how` in the JSON): declined card at specific merchants, balance frozen, slow support, rate changed after order, stacked/hidden fees, vendor suspension of delivered accounts, refund delay.

**1.7 Re-pricing cadence (evidence).** API-driven sellers claim live rates: Dollarisho (Bonbast feed) and Cafearz (live prices) [S13, S41]. Catalog-priced sellers on Emalls showed listings last updated "6 hours ago" and "within 1-2 days" [S35], an upper bound on their refresh interval. No numeric lag was measured; model API-driven sellers as re-pricing on every rates tick and catalog sellers every 6-48 h.

**1.8 Rush/express, loyalty/referral, bots.** No paid rush premium was observed. IraniCard's "Express" cards issue within 5 working days versus 20-60 for the top tier, but these are different products (USD 100/120 vs 395) [S27]. Cafearz offers an Android app [S40]; no Telegram/Bale bot, Mini App, referral or loyalty programme was observed (not searched successfully; UNVERIFIED).

### 2. Effective markups (computed)

**2.1 Method.** `markup_pct = (price_irt / (usd_face x same-day free USD) - 1) x 100` with free USD 258,465 IRT [F01]. Explicit-fee structures are evaluated as `fee_pct(N) = 100 x fee_usd(N) / N`. Sellers' own rate markup is unobserved for every fee-based structure, so explicit fees are lower bounds of all-in cost unless the rate equals the market (Dollarisho claims it does).

**2.2 Price observations (ChatGPT Plus, USD 20, parity 5,169,300 IRT) [D].**

| id | price (IRT) | markup % vs parity | tier | in stats |
|---|---:|---:|---|---|
| obs-plus-001 | 5,539,100 | +7.15 | mid | yes |
| obs-plus-006 (lead's range, high end) | 6,400,000 | +23.81 | mid | yes |
| obs-plus-002 | 6,596,200 | +27.60 | mid | yes |
| obs-plus-003 | 8,890,000 | +71.98 | premium/unknown | yes |
| obs-plus-004 | 989,000 | -80.87 | shared or stale | no |
| obs-plus-005 (lead's range, low end) | 1,300,000 | -74.85 | shared or stale | no |
| obs-plus-stale-001 (aggregator) | 890,000 | -82.78 | stale | no |

Stats, official-like tier (n=4): min 7.15, p10 12.15, p25 19.64, **median 25.71**, p75 38.70, p90 58.66, max 71.98, IQR 19.05 (all %). n<8: quantiles are indicative only. The mid-tier gap (5.54M vs 6.60M, 19%) coexists in the same market, so non-price attributes (guarantee, dedicated email, speed, trust) must carry weight for some buyers. Gift-card prices: only stale aggregator data (Steam USD 20 listed at 437,500 IRT = 21,875 IRT/USD) was found and is excluded [S35].

**2.3 Explicit fee curves, existing card, % of USD notional [D].**

| structure | $20 | $50 | $100 | $250 | $500 | $1,000 | $3,000 |
|---|---:|---:|---:|---:|---:|---:|---:|
| Dollarisho 4% fee | 4.00 | 4.00 | 4.00 | 4.00 | 4.00 | 4.00 | 4.00 |
| Dollarisho 4% + 2.99% FX | 6.99 | 6.99 | 6.99 | 6.99 | 6.99 | 6.99 | 6.99 |
| Dollarisho new card (adds USD 10) | 54.00 | 24.00 | 14.00 | 8.00 | 6.00 | 5.00 | 4.33 |
| Tehran Credit Card | n/a | n/a | n/a | n/a | n/a | 6.00 | 5.00 |
| Almas fixed fee (USD 18 / 50; excludes house-rate markup and usage fee) | 90.00 | 36.00 | 18.00 | 7.20 | 3.60 | 5.00 | 1.67 |

Almas's fixed fee is a large-ticket tariff and should not be read at small sizes. Perfect Money round-trip spreads (user buy / user sell, undated, stale levels): Sarmayex 88,194 / 84,736 = 4.08%; PayOrder 83,178 / 79,678 = 4.39%; 30pay 72,590 / 68,010 = 6.73% [S36].

**2.4 Distribution summary by family (`markup_stats` in the JSON).**

| family | n | median | p10 | p90 | status |
|---|---:|---:|---:|---:|---|
| ai_subscription_plus (% over parity) | 4 | 25.71 | 12.15 | 58.66 | indicative |
| card_load_explicit_fee_pct_usd1000 | 3 | 5.00 | 4.20 | 5.80 | indicative |
| digital_dollar_round_trip_spread_pct | 3 | 4.39 | 4.14 | 6.27 | indicative |
| card_load_explicit_fee_pct_usd100 / usd500 | 2 / 2 | null | null | null | n<3 (values 4.0 and 18.0; 3.6 and 4.0) |
| gift_card, exam_embassy_payment | 0 | null | null | null | no usable observation |
| fx_gateway_commission_band_pct | band | - | low 2.0 | high 5.0 | stale 2024 |

The requested distribution "median/IQR/p10/p90 by product family" cannot be estimated from n<=4. Treat the table as the observed anchors; section 8 collects the rest.

**2.5 Cost floor vs visible levels [D, using the lead's `scripts/pricing_model.py` at zero margin].** Model constants: provider top-up 3.0% (assumed, unpublished), issue USD 4.99, exchange fee 0.35% + spread 0.40%, network 1 USDT, collection 0.5%, risk buffer 2.0%, operator 40,000 IRT/order, USDT 257,000 IRT.

| order | new card | cost (IRT) | cost per USD (IRT) | break-even over free USD |
|---|---|---:|---:|---:|
| USD 20 | no | 5,772,655 | 288,633 | +11.67% |
| USD 20 | yes | 7,097,004 | 354,850 | +37.29% |
| USD 50 | no | 13,973,536 | 279,471 | +8.13% |
| USD 100 | no | 27,641,672 | 276,417 | +6.95% |
| USD 500 | no | 136,986,755 | 273,974 | +6.00% |
| USD 1,000 | no | 273,668,109 | 273,668 | +5.88% |

| reference | competitor visible level % | our break-even % | headroom pp (negative: matching loses money) |
|---|---:|---:|---:|
| load USD 100 (Dollarisho 4%, rate = market) | +4.00 | +6.95 | -2.95 |
| load USD 500 (Dollarisho 4%) | +4.00 | +6.00 | -2.00 |
| load USD 1,000, cheapest of three (4.0 / 5.0 / 6.0) | +4.00 | +5.88 | -1.88 |
| load USD 1,000, median of three | +5.00 | +5.88 | -0.88 |
| ChatGPT Plus, lowest official-like price | +7.15 | +11.67 | -4.52 |
| ChatGPT Plus, median official-like price | +25.71 | +11.67 | +14.03 |

Sensitivity of our break-even (USD 100 load, existing card) to the provider fee and risk buffer:

| provider top-up fee | risk 0% | risk 1% | risk 2% (model) |
|---:|---:|---:|---:|
| 0% | +1.84 | +2.85 | +3.87 |
| 1% | +2.85 | +3.87 | +4.89 |
| 2% | +3.85 | +4.89 | +5.92 |
| 3% (model) | +4.86 | +5.90 | +6.95 |
| 4% | +5.87 | +6.92 | +7.97 |

Provider fee required for our break-even to equal a visible competitor fee: 4% needs 0.13% (risk 2%) or 2.14% (risk 0%); 5% needs 1.11% / 3.14%; 6% needs 2.08% / 4.13%; 7% needs 3.05% / 5.12%. Entry basket (new card + load): our break-even +18.37% (USD 50), +12.07% (USD 100), +8.29% (USD 250), +7.03% (USD 500) against Dollarisho's explicit 24%, 14%, 8%, 6%: they are above our floor at USD 50-100 and roughly level at USD 250-500.

**Reading.** If competitor rates equal the market, a 4-6% visible fee sits at or below our modelled floor, so they either (a) mark up the rate, (b) fund cheaper than we model (netting, direct issuer terms, lower risk cost), or (c) run thin margins. This must be tested with same-day all-in quotes before any price list is fixed. USDT is ~0.6% cheaper than cash USD (256,900 vs 258,465), a small cost edge if competitors price off Bonbast.

### 3. Fee-structure archetypes

| id | archetype | representatives | levers visible to the customer | observed parameters | repricing |
|---|---|---|---|---|---|
| A | live market rate + % fee | Dollarisho, Tehran Credit Card | % fee (+ conversion fee) | 2 / 4 / 6% (low/base/high) [S13-S15] | continuous (live feed claim) |
| B | house rate + fixed USD fee | Almas Payment | fixed fee, opaque rate, usage fee | USD 18 / 50; usage 1% (cap USD 5) [S10] | operator-set; unknown |
| C | Toman price list per SKU | gift-card and subscription shops (11 profiled) | one all-in price | Plus +7% to +72% over parity [D] | catalog edits; listings 6-48 h old [S35] |
| D | bid/ask spread | Cafearz, Perfect Money sellers, Kifpool | spread only | 4.08-6.73% round trip (PM) [S36] | live |
| E | incumbent trust brand, tiered physical cards | IraniCard, Safir, Tehran Payment | tier price, brand age | USD 100-395 issuance [S27] | unknown |
| F | gray cheap accounts | unidentified (0.99-1.3M IRT Plus) | price only | -75% to -81% vs parity [D] | unknown |

Patterns worth noting: (1) fee location shifts by archetype (rate, %, fixed, spread), so naive fee comparisons mislead; compare all-in Toman for the same basket. (2) Fixed-fee structures punish small tickets; % structures are flat; spreads are paid twice on round trips. (3) Ancillary charges: maintenance fees (USD 1/month with a USD 2 month-end balance on one unattributed reloadable Visa [S37]), conversion fees, usage fees, withdrawal fees. (4) Minimums: USD 10 (Dollarisho) vs USD 25 (mpay, our upstream) [S08].

### 4. Positioning gaps, UX patterns, marketing channels

**4.1 Claims in 54 page titles [D].** Titles as listed on 2026-10-02 (cards/FX 41, subscriptions 9, gift cards 4).

| claim | all | cards/FX | subscription | gift card | % of titles |
|---|---:|---:|---:|---:|---:|
| instant / fast / immediate | 13 | 8 | 4 | 1 | 24 |
| cheap / lowest / discount | 14 | 8 | 5 | 1 | 26 |
| reloadable | 8 | 8 | 0 | 0 | 15 |
| fee mentioned ("lowest fee") | 5 | 5 | 0 | 0 | 9 |
| authentic / trusted / legal | 2 | 2 | 0 | 0 | 4 |
| dedicated / own email | 2 | 1 | 1 | 0 | 4 |
| guarantee | 1 | 0 | 1 | 0 | 2 |
| Apple Pay / Google Pay support | 1 | 1 | 0 | 0 | 2 |

Titles are SEO-driven, so frequency reflects search-keyword strategy as much as customer values; the contrast (speed and price ~25% each, guarantee/trust ~2-4%) is still informative.

**4.2 Positioning gaps for our brand** (absence below means "not observed in thin evidence", UNVERIFIED).

| gap | evidence | status |
|---|---|---|
| all-in Toman quote with itemised breakdown, rate snapshot id and price-lock TTL | Almas "specified rate", Dollarisho stacked percentages; aggregator listings 6-48 h stale | reported |
| paid rush tier with SLA | none observed | UNVERIFIED |
| messenger-native (Telegram/Bale Mini App, bot) | only an Android app seen | UNVERIFIED |
| guarantee/refund policy and restriction disclosure | guarantee in 1 of 54 titles; only Almas discloses restrictions | reported |
| B2B invoicing for SMB ad spend | only Tehran Credit Card's tiering hints at large tickets | UNVERIFIED |
| official subscription with disclosed vendor risk vs gray cheap accounts | gray tier at -75% to -81% | reported |
| cash-out and payment netting | present at Arzipay, IraniCard, Safir; absent for a new entrant | reported; legal review needed |

**4.3 UX patterns.** Copy: per-SKU landing pages (Almas 6, Farakonesh 8 in the result set), fee and FAQ pages, size-tiered commissions, a named live rate source, an Android app for repeat buyers, presence on comparison sites (IranBroker, FxPay, Emalls). Avoid: opaque house rates; stacked percentages without an all-in total; fixed fees that explode on small orders; unprovable claims ("lowest price in Iran", "up to 50% discount"; legal limits on marketing claims belong to specialists 04/10); catalog prices with no validity time; selling accounts without disclosing third-party suspension risk.

**4.4 Marketing channels seen.** Sponsored tech-media articles (URL paths marked pr/promoted/advertorial on Zoomit, Zoomg, Digiato) for at least 11 brands including IraniCard through September 2026; business-news placements (Rokna, Jam-e Jam Online); SEO landing pages and blogs (Virgool, own blogs, "best gateways 1405" content); Android app stores (Cafe Bazaar, Myket); comparison and review sites (IranBroker, FxPay, Emalls); seasonal campaigns (a Christmas gift-card campaign) [S39-S41]. Telegram, Instagram and ads were not observed (not searched successfully).

### 5. Customer choice model

**5.1 Evidence available.** (a) Price dispersion of 19% between mid-tier Plus sellers and 7-72% across the range; (b) claim frequencies in section 4.1; (c) paid-media intensity of incumbents; (d) existence of comparison sites (consideration sets > 1). No sales volumes, conversion data or surveys were found, so no elasticity can be estimated empirically.

**5.2 Specification [A].** Mixed multinomial logit over a consideration set of K sellers (prior 3; range 2-5): `U_ij = -b_p[s] x ln(P_ij / P_ref) + b_t[s] x trust_j + b_v[s] x speed_j + e_ij`, segment s drawn per customer.

| segment | share low / base / high | firm-level elasticity | notes |
|---|---|---:|---|
| deal-seeker | 0.20 / 0.30 / 0.45 | -20 | compares 3-5 sellers; gamers, subscription buyers |
| balanced | 0.30 / 0.40 / 0.50 | -8 | price, trust and speed |
| trust/urgency-led | 0.20 / 0.30 / 0.40 | -2 | deadline payers, large tickets, first-timers |
| blended | | -9.8 | prior `-10 (-5 to -20)` |

Other priors [A]: category-level elasticity -0.7 (-0.3 to -1.2; exam, ads and infrastructure inelastic, gaming/streaming/shopping elastic); speed premium (urgent segment) 10% of price (3-25); trust premium 10% (3-25); anchor for the upper range is the 19% gap between mid-tier Plus sellers. Qualitative segment sensitivities (hypotheses to align with brief 10 personas): student/applicant price M, trust H, speed H; freelancer/developer price M, trust H, speed M, repeats monthly and also sells FX; gamer price H, trust M, speed H; SMB ads manager price L-M, trust H, speed H, needs invoices; subscription user price H, trust M, speed M; shopper price H, trust M, speed L; traveller/tuition payer price L, trust H, speed M-H.

**5.3 Identities used (not estimates) [D].** Lerner inversion for a profit-maximising seller: `|e| = 1/m`. Net margins of 2%, 3%, 5%, 8%, 12% imply |e| of 50, 33, 20, 12.5, 8.3: a pure price-taking world, which the observed dispersion contradicts (hence the lower prior). Share response to an undercut d from share s under logit with an outside good: `s' = s x / (1 - s + s x)`, `x = exp(|e| / (1 - s) x d)`.

Share multiplier s'/s at baseline share 10%:

| abs elasticity | 2% undercut | 5% undercut | 8% undercut |
|---:|---:|---:|---:|
| 2 | 1.04x | 1.10x | 1.17x |
| 5 | 1.10x | 1.28x | 1.48x |
| 10 | 1.22x | 1.62x | 2.13x |
| 20 | 1.48x | 2.52x | 3.97x |
| 33 | 1.88x | 4.10x | 6.76x |

Blended segment prior: 1.22x / 1.68x / 2.28x for 2% / 5% / 8% undercuts at share 10% (1.23x / 1.71x / 2.43x at 5%; 1.22x / 1.61x / 2.04x at 20%).

**5.4 Seasonality.** Calendar facts are arithmetic; demand multipliers are not measured (default 1.0 in the simulator; apply as a scenario axis; authoritative calendar belongs to `data/calendar_ir.json` from specialist 08).

| event | date | families | direction | status |
|---|---|---|---|---|
| Black Friday / Cyber Monday | 2026-11-27 / 2026-11-30 (6 / 9 Azar 1405) | gift cards, subscriptions, gaming | up (hypothesis) | UNVERIFIED |
| Yalda night | 2026-12-21 (30 Azar 1405) | gift cards, gaming, subscriptions | up (hypothesis) | UNVERIFIED |
| Christmas gift-card campaigns | late December | gift cards | shops run campaigns [S39] | reported (volume unknown) |
| Nowruz 1406 | ~2027-03-21 (equinox rule; approx.) | FX payments, shopping, travel | pre-holiday buying; banks and Paya closed (supply constraint) | UNVERIFIED |
| University application windows | typically Nov-Jan (US fall), Jan-Mar (others) | exam/embassy, education | up (fees, score reports) | UNVERIFIED |
| Exam sessions | rolling, monthly | exam/embassy | steady with deadline spikes | UNVERIFIED |
| Steam seasonal sales | late June-early July; mid-Dec-early Jan | gift cards, gaming | up | UNVERIFIED |
| Weekend | Thursday afternoon, Friday | all | settlement gaps; evening demand | reported |

**5.5 Calibration plan.** Randomised price-point arms on our own quote page (+/-2%, +/-5%) with at least 2,000 quote views per arm; randomised rush toggle at +5/+10/+20%; trust-badge display test; 300-respondent discrete-choice survey; Google Trends and Torob/Emalls price histories for seasonality.

### 6. Market size (bottom-up, [A] model output)

Model: `GMV = sum over segments of buyers x spend per buyer x share served by resellers`; revenue pool = GMV x take rate; orders/day = GMV / AOV / 365. Inputs are split-lognormal with low = p10, base = median, high = p90, cross-segment correlation 0.5, seed 7, 20,000 draws. **No input is an observation.**

| segment | buyers low / base / high | USD per buyer-year | reseller share | GMV base (USD m) |
|---|---|---|---|---:|
| AI and SaaS subscriptions | 150k / 400k / 1.0m | 120 / 200 / 300 | 0.70 / 0.85 / 0.95 | 68.0 |
| gaming and app-store credit | 500k / 1.5m / 4.0m | 30 / 60 / 120 | 0.80 / 0.90 / 0.95 | 81.0 |
| streaming and consumer subscriptions | 100k / 300k / 800k | 60 / 120 / 200 | 0.70 / 0.85 / 0.95 | 30.6 |
| exams, applications, embassy fees | 30k / 70k / 150k | 300 / 600 / 1,200 | 0.70 / 0.85 / 0.95 | 35.7 |
| freelancers, developers, infrastructure | 80k / 200k / 500k | 200 / 400 / 900 | 0.60 / 0.80 / 0.95 | 64.0 |
| SMB ads and B2B tools | 20k / 60k / 150k | 600 / 1,500 / 4,000 | 0.50 / 0.70 / 0.90 | 63.0 |
| shopping and travel | 300k / 800k / 2.0m | 80 / 150 / 300 | 0.40 / 0.60 / 0.80 | 72.0 |

| output | low (p10) | base (p50) | high (p90) |
|---|---:|---:|---:|
| reseller-served GMV (USD m per year) | 186 | 474 | 1,200 |
| deterministic bounds, all inputs low / base / high (USD m) | 60 | 414 | 2,512 |
| revenue pool, take rate 3 / 6 / 10% (USD m per year) | 8.7 | 27.3 | 80.3 |
| revenue pool at p50 in IRT | | 7.07 trillion IRT | |
| industry orders per day | 15,563 | 39,812 | 100,812 |
| new brand, year-1 GMV: p10 / p50 / p90 of share x GMV, share inputs 0.1 / 0.5 / 2% (USD m) | 0.36 | 2.32 | 12.53 |

Tornado (GMV swing, USD m, one segment low-to-high with the rest at base): SMB ads 534; shopping/travel 470; gaming 444; freelancer infrastructure 418; AI/SaaS 272; exams 165; streaming 148. By parameter across all segments: buyers 890; spend per buyer 632; reseller share 165. Sanity check: the lead's plan of 30 orders/day at USD 100 is ~USD 1.1m/year, about 0.2% of the base GMV. The model's job is structure and sensitivity; the number of buyers and spend per buyer dominate, so they are the first things to measure (verify plan in the JSON: competitor traffic x conversion x AOV, install counts, operator interviews, own funnel).

### 7. Price-war dynamics

**7.1 History.** No dated undercutting episode was found (`episodes_documented` is empty). Verification: Wayback snapshots of rate pages around FX jumps, Torob/Emalls price-history charts for 10 SKUs, Telegram channel archives, two operator interviews.

**7.2 Mechanisms (hypotheses for the simulator).**

| id | pattern | evidence | sim hint |
|---|---|---|---|
| pw-1 | API-driven sellers match within a tick | Dollarisho live Bonbast, Cafearz live prices [S13, S41] | match within 5 min down to floor |
| pw-2 | catalog shops re-price in hours to days | listings 6-48 h old [S35] | undercut lasts until the next catalog edit |
| pw-3 | incumbents answer with trust, speed, guarantees | title claims; sponsored media [S27, S37] | trust-led segment inelastic |
| pw-4 | value shifts between rate, % fee, fixed fee | three structures coexist [S10, S13, S14] | competitor draws an archetype; undercuts the headline lever |
| pw-5 | % fee sellers have little room | computed headroom below | stop-selling or exit at the floor |

**7.3 Undercut headroom [D].** Headroom = competitor visible level minus our modelled break-even (section 2.5): card loads -0.9 to -3.0 pp (no room, if rates equal the market), Plus +14.0 pp at the median but -4.5 pp against the cheapest official-like listing. Implication for the `price-war-8pct` scenario (brief 08): an 8% price cut is infeasible as a sustained cut on percentage-fee loads (it would push sellers below parity) but plausible on catalog-priced subscriptions. With the blended prior, a first mover cutting 8% from 10% share gets ~2.3x share until matched; API-driven rivals match within a tick, catalog rivals within 6-48 h, so on loads the war ends fast and on subscriptions it persists. Structural advantage of two-sided netting: sellers with cash-out flow can sit lower for longer.

### 8. Mystery-shopper protocol and data template

Goal: replace n<=4 with >=8 same-day all-in quotes per basket. Time: ~2 hours for 15 competitors; the cadence test runs unattended for 24 h. Everything below is lawful reading of public price pages and small orders as an ordinary customer under your own identity. Do not use fake or borrowed identities, multiple accounts to farm referral bonuses, chargebacks or refund abuse.

1. At t0 record free USD (tgju, Bonbast, Navasan) and USDT (two exchanges); write the minute.
2. Baskets: B1 new virtual card + USD 50 load; B2 USD 100 reload; B3 USD 500 reload; B4 USD 1,000 reload or quote; B5 ChatGPT Plus 1 month (dedicated); B6 Apple gift card USD 25; B7 Steam USD 20; B8 exam fee payment quote (USD face); B9 PayPal USD 100 top-up and cash-out quote (if offered).
3. For each competitor within 30 minutes of t0: dated full-page screenshot; Toman price, USD face, every fee, rate used, payment methods, SLA text, support hours, Enamad badge, rating counts.
4. 3-5 real small orders: time payment-confirmed to delivery.
5. Cadence test: one A-, one C-, one D-type seller, price every 30 minutes for 24 hours on a volatile day.
6. Reviews: last 20 complaints from nazarkade, Trustpilot, Google Maps, Telegram, X; code the themes in 1.6.
7. CSV `data/raw/competitor_observations.csv` columns: `date, competitor_id, family, product, usd_face, price_irt, fx_basis, fx_rate_irt_per_usd, fee_note, source_url, captured_by`; run `python3 scripts/research/07_markup_stats.py --write`.

## Implications

**Pricing engine (competitor guard, architecture section 7.6).** Until step 8 data exists, keep the guard off or set `R` from the Plus cluster only. Proposed rules once data exists [recommendation derived from observed dispersion, to be validated]: reference price `R` = median same-day all-in price of >=3 official-like competitors, excluding the gray tier and listings older than 48 h; tolerance +2 pp on card loads (visible fee dispersion 4-6%), +10% relative on subscriptions (IQR 19 pp, n=4); never below cost + minimum margin; if `R` is below our floor set `uncompetitive:true` instead of matching. Show an all-in Toman price with itemised lines, rate snapshot id and lock TTL; price rush as its own line, since no competitor displays one.

**Margins.** On card loads the evidence says we cannot win on price at a 3% provider fee and 2% risk buffer; either the provider fee is <= ~2% (verify with specialist 01/12) or we compete on trust, speed and rush. On subscriptions price near the official-like median (+25.7% over parity) leaves headroom, and the lowest listing (+7.15%) is not matchable at our cost.

**Simulator parameters.**

| parameter | value / prior | basis | confidence |
|---|---|---|---|
| active rival count | 32 profiled, 45 named (not a census) | section 1.1 | low |
| archetype mix (profiled) | A 2, B 1, C 11, D 5, E 3, F unidentified | section 3 | low |
| A fee % | 2 / 4 / 6 | S13-S15 | low |
| B fixed fee | USD 18 (<1k) / 50 (>=1k) | S10 | low |
| C markup over parity (Plus) | p10 12.2 / median 25.7 / p90 58.7 | derived n=4 | low |
| D round-trip spread | 4.08 / 4.39 / 6.73 | S36 | low |
| repricing | A, D every rates tick; C every 6-48 h; B unknown | S13, S35 | low |
| delivery SLA | 60-180 min (Farakonesh virtual MC); up to 72 h (Cafearz MC); "instant" claims otherwise | S17, S19 | low |
| trust lower bound | table 1.2 (0-55 points of 100) | rubric | low |
| consideration set | 3 (2-5) | [A] | assumption |
| firm elasticity | -10 (-5 to -20) | [A] | assumption |
| speed / trust premium | 10% (3-25) each | [A] | assumption |
| reseller-served GMV | USD 474m/yr (186-1,200) | [A] | assumption |
| take rate / entrant share | 6% (3-10) / 0.5% (0.1-2) | [A] | assumption |

Use the `*_sim_prior` records only inside the simulator, always with the sensitivity sweep over low/high, and tag outputs as assumption-driven.

**Owner decisions.** (1) Run the mystery-shopper protocol before fixing any price list. (2) Get the actual provider top-up fee and compare to the required ~2% or lower. (3) Decide with specialist 04 whether any netting model (buying USD/USDT from customers who cash out FX income) is lawful and worth the risk; do not implement without that review. (4) Position on transparency, guarantee/SLA, rush and messenger-native ordering. (5) Do not chase gray-tier prices; disclose third-party suspension risk and refund policy in customer terms (CLAUDE.md section 3). (6) Budget sponsored media versus SEO with brief 10.

## Conflicts & adjudication

| # | conflict | sources | adjudication | confidence |
|---|---|---|---|---|
| 1 | Free USD 258,465 / 258,500 / 258,520 / 259,900 / 233,741 | S01-S04; kifpool live page | Use 258,465 (cluster of 3 outlets); 259,900 is an intraday tick; 233,741 is a stale cache (-9.6%), discarded | medium |
| 2 | Plus range 0.989-8.89M vs 1.3-6.4M | S34, S08 | Keep both; official-like cluster 5.54-6.60M (+6.4M); low tier excluded as different product; 8.89M kept as tail | low |
| 3 | Dollarisho "4%" vs "4% + 2.99%" | S13, S15 | Consistent if 2.99% is a separate FX conversion; report 4.0 and 6.99 | low |
| 4 | Almas USD 18 / 50: card type and boundary unclear | S10 | Evaluate as "Mastercard charge"; >=1,000 takes the USD 50 tier; low confidence | low |
| 5 | Stale aggregator prices (Steam USD 20 = 437,500 IRT; Plus 890,000 IRT) | S35 | Excluded (imply 21,875 IRT/USD) | high |
| 6 | PM levels 68-88k IRT vs 258k now | S36 | Levels stale; spreads kept | low |
| 7 | Kifpool Mastercard 250,000 IRT | S29 | Historical (USD ~0.97 today); excluded | high |
| 8 | Free/official gap "~45%" vs computed 47.95% | S07, S01, S05 | Consistent within date drift | medium |
| 9 | Cafearz "since 1398" vs entity registered 2022-11-23 | S16 | Brand predates the entity; verify the corporate history | low |
| 10 | arzipay.com vs arzipayment.com | S23, S37 | Relationship unknown; kept separate | low |
| 11 | Provider top-up fee: lead assumes 3%; other summaries mention "about USD 0.5" and "USD 4 + 3.2%" without naming the provider | S08, search summaries | Unresolved; keep 3% flagged with sensitivity (section 2.5); specialist 01 owns it | low |

## Open questions

| # | question | verify_how |
|---|---|---|
| 1 | Same-day all-in prices of 15 competitors for 8 baskets? | Section 8 protocol; fill the CSV; re-run the script |
| 2 | Actual provider top-up fee (mpay and alternatives)? | Make a real small top-up in the provider panel; read the statement |
| 3 | Is Almas's USD 18/50 for physical or virtual loads; what is the house-rate markup? | Request a quote for USD 100/500/1,000 virtual and physical; compare with free USD |
| 4 | Dollarisho: is 4% charged on load or spend; does 2.99% apply to USD merchants? | Read the terms page; make one USD 10 load and one USD spend |
| 5 | Enamad, registration and years online for each competitor | Click the badge; check enamad.ir; nic.ir WHOIS |
| 6 | Real review distributions and complaint themes | nazarkade, Trustpilot, Google Maps, Telegram, X; code 20 per brand |
| 7 | Re-pricing lag in minutes | 30-minute capture for 24 h on a volatile day |
| 8 | Paid rush offers and premiums | Check checkout of each competitor; record premium and SLA |
| 9 | Referral and loyalty programmes; bots and Mini Apps | Account areas and footers; Telegram/Bale/Eitaa search |
| 10 | Dated price-war episodes | Wayback, Torob/Emalls price history, Telegram archives, operator interviews |
| 11 | Elasticity, speed premium, trust premium | Randomised price and rush tests on our quote page; discrete-choice survey |
| 12 | Market size inputs (buyers, spend, share) | Competitor traffic x conversion x AOV; app installs; operator interviews; own funnel |
| 13 | Legality of cash-out/payment netting for a new entrant | Specialist 04; licensed professional |
| 14 | Identity of hyper-acc, digitalro, paybal.ir; arzipay vs arzipayment relationship | Search once the cap is raised; WHOIS |

## Sources

All competitor and media content is "per search summary" (host blocked by the egress policy; page not read) unless marked "title seen" (title and URL visible in the result list only).

| id | url | what it supports |
|---|---|---|
| S01 | https://rahbordemoaser.ir/fa/news/320286/ | free USD 258,465 on 10 Mehr 1405 |
| S02 | https://www.eghtesadonline.com/fa/news/2166573/ | free-market quotes 10 Mehr 1405 |
| S03 | https://aftabnews.ir/fa/news/1068977/ | free-market quotes 10 Mehr 1405 |
| S04 | https://www.khabarfoori.com/ (article 3249360, 10 Mehr 1405) | free-market quotes |
| S05 | https://mehrnews.com/news/6964370/ | official USD 174,704 sell / 173,132 buy, 9 Mehr |
| S06 | https://www.tabnak.ir/fa/news/1396650/ | CBI USD 1bn sale headline (title seen) |
| S07 | https://www.hamshahrionline.ir/news/1072384/ | free vs government dollar gap (undated) |
| S08 | docs/business-plan-full-context.md | lead's USDT 256,900; Plus range; mpay fees (internal) |
| S09 | scripts/pricing_model.py | lead's cost model (internal) |
| S10 | https://almaspayment.com/%DA%A9%D8%A7%D8%B1%D9%85%D8%B2%D8%AF%D9%87%D8%A7-%D9%88-%D8%A7%D9%85%D8%AA%DB%8C%D8%A7%D8%B2%D9%87%D8%A7/ | Almas fees and formula |
| S11 | https://almaspayment.com/virtual-credit-cards/ | Almas card restrictions, validity |
| S12 | https://dollarisho.com/virtual-mastercard-dollarisho/ | Dollarisho card, wallet-pay support |
| S13 | https://dollarisho.com/rechargeable_mastercard/ | Dollarisho fees, Bonbast basis |
| S14 | https://tehrancreditcard.com/ (online-payment page; tier statement attribution inferred) | Tehran Credit Card tiers |
| S15 | https://blog.paystar.ir/currency-payment-portal/ | 2-5% band; intermediaries; Dollarisho 4% |
| S16 | https://iranbroker.net/exchange/cafearz/ (+ ?p=32829) | Cafearz rating, registration |
| S17 | https://cafearz.com/buy-rechargeable-mastercard | Cafearz MC up to 72 h |
| S18 | https://fxpay.co/exchanges/cafearz/ | Cafearz fiat fees (attribution inferred) |
| S19 | https://farakonesh.org/card/mastercard/virtual/ | Farakonesh virtual MC |
| S20 | https://jamejamonline.ir/fa/news/1464030/ | Farakonesh promotional article |
| S21 | https://iranbroker.net/?p=142630 | Tehran Payment profile |
| S22 | https://digiato.com/article/2023/02/20/provision-exchange-services-students-by-tehran-payment | Tehran Payment student services |
| S23 | https://www.zoomit.ir/pr/366381-arzipay-currency-income/ | Arzipay cash-out (sponsored) |
| S24 | https://www.zoomit.ir/pr/377767-arzipay-currency-paypal/ | Arzipay PayPal (sponsored) |
| S25 | https://nabzebourse.com/fa/news/25263/ | Arzipay instant PayPal |
| S26 | https://www.rokna.net/ (article 1074005) | 20payment services |
| S27 | https://www.zoomit.ir/pr/464989-iranicard-prestige-visa-cards | IraniCard Prestige prices |
| S28 | https://www.zoomit.ir/pr/366628-iranicard-exchange-earnings-payments/ (+ zoomg pr/417843) | IraniCard history; Sept 2026 PR |
| S29 | https://www.zoomg.ir/tech-news/364167-mastercard-kifpool-me/ | Kifpool card, historical |
| S30 | https://iranbroker.net/exchange/kifpoolme/ (+ arzdigital.com/exchange/kifpoolme/) | Kifpool exchange facts |
| S31 | https://safirpayment.com/ (+ /services/, /international-exams/) | Safir services, >10 years |
| S32 | https://www.visitouriran.com/blog/understanding-the-costs-fees-and-limits-of-iran-tourist-debit-card | adjacent tourist card |
| S33 | https://www.zoomit.ir/report/134656-iranian-master-card-details/ | Saman-exchange Mastercard (undated) |
| S34a-h | numberland.ir/account/openai; license-market.ir/product/ChatGPT-Plus; tehranpayment.com/payment/chatgpt-account/; zarinacc.com/product/chatgpt/; iranget.com/products/openai-chatgpt-account; ir-premium.com/product/chatgpt-plus/; bluespotify.ir/product/chatgpt-plus/; spotifyy.ir/product/chatgpt-plus/ | Plus listings (prices not mapped to stores) |
| S35 | https://emalls.ir/ (gift-card and Plus list, category 961) | listing ages; stale prices |
| S36 | https://sarmayex.com/currencies/PMUSD-Perfect-Money-USD (+ payorder.ir, iranperfect.money, tgju PMUSD page) | PM spreads |
| S37 | search-results title set (title seen) | positioning titles; unattributed fee items |
| S38 | https://digiato.com/promoted/buy-chatgpt-account-safely (+ how-to-buy-and-use-chatgpt-premium) | third-party account risk statements |
| S39 | zoomit pr/427722, 423093, 412231, 407380, 447519, 266367; zoomg pr/348764, 335336, 362694, 306888 (title seen) | sponsored-content set; Christmas campaign |
| S40 | https://cafebazaar.ir/app/com.cafearz.app.crypto.cafe_arz (+ myket.ir) | Cafearz Android app (title seen) |
| S41 | https://www.zoomit.ir/howto/439826-international-payment-gateways/ (+ pr/420030) | intermediary list article (title seen) |
| S42 | https://www.zarinpal.com/blog/%D9%88%DB%8C%D8%B2%D8%A7-%DA%A9%D8%A7%D8%B1%D8%AA/ | virtual card advice on scams |

## Appendix A - search ledger (38 completed)

Yield: H = usable numbers, M = structural facts or leads, L = little, 0 = nothing relevant. E = extended mode, S = standard.

| # | mode | topic | yield | # | mode | topic | yield |
|---|---|---|---|---|---|---|---|
| 1 | S | virtual dollar Visa fees 1405 | L | 20 | S | jib.store | M |
| 2 | S | best sites comparison | M | 21 | S | digitalro | 0 |
| 3 | S | Cafearz fees | M | 22 | S | Farakonesh | M |
| 4 | S | Almas Payment | L | 23 | S | Kifpool card | M |
| 5 | S | Arzipay | M | 24 | E | Tehran Credit Card | M |
| 6 | S | 20payment | M | 25 | E | Dollarisho Mastercard | H |
| 7 | S | Tehran Payment | M | 26 | E | PayStar FX gateway guide | H |
| 8 | S | Dollarisho | L | 27 | S | Moneyro (EN) | L |
| 9 | S | giftcard98 | L | 28 | S | NumberLand | L |
| 10 | S | License Market Plus | M | 29 | S | IraniCard | H |
| 11 | E | FX payment rates Mehr 1405 | H | 30 | S | paybal | L |
| 12 | E | IranBroker Cafearz | H | 31 | E | Almas fees and perks | H |
| 13 | S | Nazarkade Cafearz | 0 | 32 | E | Almas virtual cards | H |
| 14 | E | IR users virtual Visa (EN) | L | 33 | E | Cafearz Mastercard | H |
| 15 | E | free USD 10 Mehr | H | 34 | E | Farakonesh virtual MC | H |
| 16 | S | Emalls gift cards | M | 35 | S | Mihan Card | 0 |
| 17 | E | ChatGPT Plus prices | H | 36 | E | Safir Payment | M |
| 18 | E | virtual card fees comparison | H | 37 | E | Perfect Money rates | M |
| 19 | S | hyper-acc | 0 | 38 | E | FX payment vs free rate gap | M |

Refused after the budget ended: price of a USD 100 Mastercard today; complaints and scam reports; Trustpilot reviews; Telegram bots.

## Appendix B - first 40 queries for the re-run (Persian and English)

1. Price capture: "<brand> نرخ دلار امروز" and "قیمت شارژ مستر کارت 100 دلار <brand>" for cafearz, almaspayment, dollarisho, farakonesh, 20payment, tehranpayment, iranicard, safirpayment (8-12 queries).
2. Reviews: "نظرکده <brand>", "<brand> اینماد", "<brand> کلاهبرداری", "<brand> Trustpilot" (8 queries).
3. Channels: "ربات تلگرام <brand>", "مینی اپ بله خرید گیفت کارت", "کد معرف <brand>", "اپلیکیشن <brand>" (4).
4. Price war: "کاهش کارمزد پرداخت ارزی رقابت", "پرداخت ارزی توقف فروش افزایش نرخ دلار", "کاهش قیمت اکانت چت جی پی تی رقبا", "کمپین تخفیف کارمزد پرداخت ارزی" (4).
5. Market size: "تعداد کاربران ایرانی چت جی پی تی", "داوطلبان آیلتس تافل ایران سالانه", "حجم بازار گیفت کارت ایران", "تعداد گیمرهای استیم ایران" (4).
6. Seasonality: "افزایش تقاضای پرداخت ارزی نوروز", "فصل آزمون و پرداخت ارزی", "بلک فرایدی گیفت کارت ایران" (3).
7. Regulation and netting (route to specialist 04 first): "مجوز نقد درآمد ارزی بانک مرکزی", "شاپرک پرداخت ارزی", "ممنوعیت واسطه پرداخت ارزی" (3).
