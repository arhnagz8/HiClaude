---
title: Persian-first UX and product research - trust patterns, pain points, design system, microcopy, notifications, Mini Apps, performance, honest conversion, rush upsell
owner_agent: 11-ux-product-fa
as_of: 2026-10-02
confidence: low
status: draft
---

# Persian-first UX and product research (brief 11)

Companions (all produced by this specialist):
- `docs/05-architecture/ux-spec.md` - implementable screen-by-screen specification (IA, wireframes with all states, flows, notification matrix with templates, Mini App rules, performance budget).
- `data/copy.fa.json` - flat key -> Persian string, **1,370 keys** (>= 200 required), linted by `scripts/research/11_build_copy.py`.
- `docs/05-architecture/design-tokens.json` - light/dark tokens, contrast-verified by `scripts/research/11_contrast.py` (50 pairs, 0 failures).
- Scripts: `scripts/research/11_build_copy.py` (build + lint), `11_copy/part1..5*.py` (copy source), `11_contrast.py`, `11_price_example.py`.

Evidence tags: **[R]** repo evidence from other specialists (files named), **[S]** web search summary (page not read directly), **[D]** derived by script, **[P]** practitioner knowledge or design judgement (not verified in this run), **[A]** assumption to be tested.

## خلاصه (برای مالک)

- **محدودیت شواهد:** سقف جستجوی وب نشست تقریباً تمام شده بود؛ فقط ۵ جستجو انجام شد و صفحه‌ی رسمی تلگرام/بله مستقیم دیده نشد (پراکسی مسدود). بنابراین بخش «اعتماد و نقاط درد کاربران ایرانی» عمدتاً از شواهد سایر متخصصان این مخزن و فرضیه‌های برچسب‌دار ساخته شده و باید با «خریدار مخفی» و ۲۰ نظر واقعی هر رقیب تأیید شود.
- **اعتماد چگونه ساخته می‌شود:** مهم‌ترین سیگنال‌ها شفافیت قیمت (قیمت نهایی با همه‌ی کارمزدها پیش از پرداخت)، نشان اعتماد (اینماد، فقط اگر واقعاً صادر شده باشد)، سرعت پاسخ‌گویی، پیگیری مرحله‌به‌مرحله‌ی سفارش و رسید/فاکتور است. در عنوان‌های رقبا «سرعت» ۲۴٪ و «ارزانی» ۲۶٪ ادعا شده ولی «ضمانت» فقط ۲٪ و «معتبر» ۴٪ - جای خالی بازار همین است.
- **ساختار صفحات:** ۱۸ صفحه‌ی مشتری (خانه با تابلوی نرخ، کاتالوگ، جزئیات محصول، ماشین‌حساب زنده، پرداخت با ۳ روش، رسید، خط زمانی سفارش، نمایش کارت، کیف پول، دعوت، پشتیبانی، احراز هویت، حقوقی) و ۱۷ صفحه‌ی ادمین/اپراتور (۱۶ تولیدی و یک پنل شبیه‌ساز دمو)، هرکدام با وایرفریم و همه‌ی حالت‌ها (خالی، در حال بارگذاری، خطا، انقضای قفل قیمت، تغییر قیمت، ناهم‌خوانی پرداخت، قطعی ارائه‌دهنده) در `ux-spec.md`.
- **سیستم طراحی:** فونت وزیرمتن (خودمیزبان، بدون CDN)، اعداد فارسی، «۱٬۲۳۴٬۰۰۰ تومان»، تاریخ شمسی، تم روشن و تاریک؛ تمام جفت‌رنگ‌های متن حداقل نسبت ۴٫۵ به ۱ دارند (۵۰ جفت، صفر خطا).
- **متن‌ها:** ۱٬۳۷۰ کلید متنی فارسی (کمینه‌ی خواسته‌شده ۲۰۰)، لحن «رسمی-صمیمی»، با ابزار کنترل (ارقام فارسی، نیم‌فاصله، فهرست واژه‌های ممنوع مثل «مجوز»، «صرافی»، «تضمین قیمت»).
- **ماتریس اعلان:** ۴۵ رویداد در ۵ کانال (درون‌برنامه، تلگرام/بله، پیامک، ایمیل) با ۱۳۹ قالب؛ پیامک‌ها حداکثر ۱ تا ۲ بخش (۷۰ نویسه‌ی فارسی در هر بخش).
- **مینی‌اپ تلگرام و بله:** هم‌خوانی با تم میزبان، دکمه‌ی اصلی/بازگشت بومی، لینک عمیق `startapp`، اشتراک دعوت؛ تلگرام در ایران نیاز به فیلترشکن دارد، پس وب و بله کانال اصلی‌اند و تلگرام مکمل. نحوه‌ی اعتبارسنجی `initData` بله هنوز تأییدنشده است.
- **بودجه‌ی کارایی برای شبکه‌ی ضعیف:** مسیر اولیه ≤ ۱۷۰ کیلوبایت جاوااسکریپت فشرده، بدون فونت/اسکریپت خارجی، SSE با بازگشت به poll، حالت آفلاین فقط‌خواندنی (سفارش و پرداخت آفلاین ممنوع).
- **تبدیل صادقانه:** قفل قیمت با شمارنده، ریز قیمت کامل که دقیقاً با مجموع برابر است، «صرفه‌جویی نسبت به بازار» فقط وقتی داده‌ی تازه و مستند داریم؛ بدون فوریت جعلی، بدون گزینه‌ی از پیش انتخاب‌شده‌ی گران، بدون پنهان کردن هزینه.
- **هشدار مهم قیمت:** در مثال محاسبه‌شده با پارامترهای موقت پروژه، شارژ ۱۰۰ دلاری ≈ ۳۲٬۱۰۳٬۰۰۰ تومان می‌شود (حدود ۲۴٫۹٪ بالاتر از نرخ مرجع تتر)، در حالی که کارمزد دیده‌شده‌ی رقبا ۴ تا ۶٪ است. این فقط مثال طراحی است نه پیشنهاد قیمت؛ تا متخصص ۱۲ پارامترها را تعیین نکند، جمله‌ی «ارزان‌تر از بازار» در رابط کاربری فعال نمی‌شود.
- **حقوقی:** این سند مشاوره‌ی حقوقی یا مالیاتی نیست؛ نشان اینماد و واژه‌هایی مانند «مجاز/قانونی» را فقط پس از دریافت واقعی و تأیید متخصص مجاز نمایش دهید.

## TL;DR

- Search ceiling: 5 searches this run (4 returned little, `core.telegram.org` `EGRESS_BLOCKED`, not retried); all trust/pain-point statements are repo evidence or labelled hypotheses with `verify_how`. Confidence overall: **low**; design-system and copy deliverables are complete and machine-checked.
- Trust levers ranked [P]+[R]: (1) all-in price before payment, (2) Enamad/identity/legal entity disclosure, (3) response-time promise and visible support hours, (4) live order timeline with ETA, (5) receipt/invoice, (6) honest refund and risk disclosure. Competitor titles: speed 24%, price 26%, guarantee 2%, authenticity 4% (n=54) [R: 07 section 4].
- Customer IA: 18 screens (C01-C18) + global components; admin IA: 17 screens (16 production + 1 demo simulator) + RBAC matrix; every screen has a state table (empty/loading/error/quote-expired/price-changed/payment-mismatch/provider-outage where applicable) in `ux-spec.md`.
- Design system: Vazirmatn self-hosted, base 15 px / line-height 1.75, Persian digits for display, thousands separator U+066C, 8-px radius scale, 44-px touch targets, light + dark; 50 text/UI pairs verified >= 4.5:1 (text) or >= 3:1 (borders) [D: `11_contrast.py`].
- Copy deck: 1,370 keys (249 shared with the web app snapshot + 1,121 new), 139 notification templates, 10 SMS templates (max 2 segments, OTP = 1), tone = formal-friendly (شما، جمله‌های کوتاه، بدون تعارف اغراق‌آمیز).
- Notification matrix: 45 events x 4 channel columns (in-app, Telegram/Bale, SMS, e-mail); SMS only for OTP and critical status; messenger first, SMS fallback.
- Mini Apps: map host `themeParams` onto tokens only when contrast still passes; MainButton replaces the page CTA; BackButton mirrors router history; `startapp=ref_<code>|p_<productId>|o_<orderId>` payloads; Bale mirrors the Telegram object (`window.Bale.WebApp`) but its theme/button parity is UNVERIFIED.
- Performance budget [A]: <= 170 KB gz initial JS, <= 350 KB first-load total, LCP <= 2.5 s on Lighthouse slow-4G profile, quote API p95 <= 800 ms server-side, every asset self-hosted.
- Honest conversion: price-lock countdown (default lock 30 min, `defaults.ts`), itemised lines that sum exactly to the total, "savings vs market" only with fresh, sourced competitor data; no fake scarcity, no pre-ticked rush, no hidden fees.
- Rush UX: tiers normal / fast (+4 %, min 100,000 IRT, SLA 30 min, 20/h) / express (+10 %, min 300,000 IRT, SLA 10 min, 6/h) from `defaults.ts`; capacity chip, after-hours rule, automatic refund of the rush fee when the SLA is missed.
- Pricing flag: with current placeholder parameters a USD 100 new card costs the customer 32,103,000 IRT (+24.9 % vs USDT reference 256,900), far above the 4-6 % competitor fee band -> the UI must not claim savings until specialist 12 calibrates parameters.
- Owner decisions needed: brand name and logo, Enamad status, support hours, rush tier prices, whether to show competitor comparison.

## Facts table

| id | fact | value | unit | as_of | confidence | source ids |
|---|---|---|---|---|---|---|
| F01 | Competitor page titles claiming speed / price / guarantee / authenticity (n=54) | 24 / 26 / 2 / 4 | % of titles | 2026-10-02 | low | R1 |
| F02 | Independent rating found for any competitor (Cafearz) | 3.5 of 5, n=16 | stars | 2026-10-02 | low | R1 |
| F03 | Enamad fee (2-year validity) | 175,000 | IRT | 1405 | low | R2 |
| F04 | Enamad status of every competitor | unknown | - | 2026-10-02 | low | R1 |
| F05 | Price-lock duration default (`pricing.lockMinutes`) | 30 | minutes | 2026-10-02 | n/a (config) | R4 |
| F06 | Pay windows: gateway / card-to-card / bank transfer / USDT | 20 / 45 / 240 / 60 | minutes | 2026-10-02 | n/a (config) | R4 |
| F07 | Rush tiers: normal / fast / express SLA | 120 / 30 / 10 | minutes | 2026-10-02 | n/a (config) | R4 |
| F08 | Rush premium: fast / express | 4 % (min 100,000 IRT) / 10 % (min 300,000 IRT) | % / IRT | 2026-10-02 | n/a (config) | R4 |
| F09 | Rush capacity: fast / express | 20 / 6 | orders per hour | 2026-10-02 | n/a (config) | R4 |
| F10 | Card-to-card cap per card (default) | 15,000,000 | IRT per day | 1405 | low | R3, R4 |
| F11 | Business hours default | 09:00-23:00 | local time | 2026-10-02 | n/a (config) | R4 |
| F12 | USDT reference rate | 256,900 | IRT per USDT | 2026-10-02 | medium | R1 |
| F13 | Worked example: USD 100 new card, gateway, normal speed | 32,103,000 | IRT | 2026-10-02 | low (placeholder parameters) | D1 |
| F14 | Same, card-to-card (no gateway fee) | 32,087,000 | IRT | 2026-10-02 | low | D1 |
| F15 | Same, fast / express | 33,386,000 / 35,312,000 | IRT | 2026-10-02 | low | D1 |
| F16 | Worked example markup vs USDT reference | +24.9 | % | 2026-10-02 | low | D1 |
| F17 | Visible competitor fee band (card loads) | 4 - 6 | % fee | 2026-10-02 | low | R1 |
| F18 | Contrast pairs verified (light + dark) | 50 pairs, 0 failures | WCAG 2.x | 2026-10-02 | high (computed) | D2 |
| F19 | Copy keys / notification templates / SMS templates | 1,370 / 139 / 10 | count | 2026-10-02 | n/a | D3 |
| F20 | Bale mini app object and raw `initData` string | `window.Bale.WebApp` | - | 2026-10-02 | low | R3, S2 |
| F21 | Telegram Mini Apps expose BackButton, MainButton, SecondaryButton, themeParams, viewport height/stable height, safe areas | yes | - | 2026-10-02 | medium | S1 |
| F22 | SMS segment size for Persian (UCS-2) text | 70 chars single, 67 per concatenated segment | characters | - | medium | P |
| F23 | Telegram access from Iran | filtered; users need circumvention tools | - | 2026-10-02 | medium | P |
| F24 | Gateway callback must be verified server-side; unverified payments are reversed by PSP after ~30 min | 30 | minutes | 2026-10-02 | low | R3 |

## Details

### 1. Trust and UX patterns of Iranian users for FX / payment services

**What the repo evidence says [R]**
- Positioning gap: trust/guarantee is the open lane; speed and price are crowded (F01) [R1 section 4].
- Guidance articles for buyers warn that unrealistically low prices signal scams and tell people to check registration and trust badges (per search summary, R1 section 1.6). Therefore a *too-cheap* price harms trust as much as it helps conversion; transparency beats the lowest number.
- Competitor UX patterns seen in search summaries: per-SKU landing pages, fee and FAQ pages, size-tiered commissions, a **named live rate source**, an Android app for repeat buyers, listings on comparison sites (R1 section 4.3). Avoid: opaque "house rates" and stacked fees (R1 section 4.3).
- Enamad is not a licence; gateways usually require it; it costs about 175,000 IRT for two years (F03) and must only be displayed once issued; claiming "licensed/legal/CBI-approved" without holding it is a legal risk (R2: R14 in the legal risk register) [R2].
- Payment-side facts that shape trust UX: card-to-card is a push payment with no chargeback, so the buyer carries the risk -> the site must prove who is receiving the money (legal entity name, destination card holder name shown before payment, same-name rule) [R3].

**Trust levers, ranked for this product [P], each mapped to a UI element**

| rank | lever | why it matters for Iranian buyers [P] | UI element (see `ux-spec.md`) |
|---|---|---|---|
| 1 | All-in price visible before login and before payment | Hidden fees and "house rates" are the most commonly cited reason for distrust in this market (hypothesis H1) | Live calculator on home; itemised breakdown; "no other cost is added" line |
| 2 | Identity of the seller | Scam fear; card-to-card pays a person or company | Footer entity block (legal name, registration no., economic code, address), Enamad badge only if issued, destination-card holder name before pay |
| 3 | Human response time | Money is in flight; silence = fear | Support hours chip, first-response promise, ticket SLA label, WhatsApp-style "typing"-free honest status |
| 4 | Order tracking | "Where is my money?" is the top support question (hypothesis H2) | Order timeline with ETA and SSE live status; every state has a plain-language hint (`status.orderHint.*`) |
| 5 | Receipts and invoices | Needed for accounting, disputes, and for trust | Downloadable invoice per order, payment receipt screen, tracking number echo |
| 6 | Honest risk and refund policy | Provider suspension risk is real (CLAUDE.md guardrail 2) | Risk label chip on every product, restriction note, refund rules link on checkout, consent checkbox for high-risk |
| 7 | Social proof | Reviews on Enamad/nazarkade/Google Maps are checked by careful buyers | Only real, linked reviews; never fabricated counters |

**Pain points to design against (hypotheses; verify with the mystery-shopper protocol R1 section 8)**

| id | hypothesis | evidence level | design answer | verify_how |
|---|---|---|---|---|
| H1 | Quoted price differs from the final price (rate or fee added late) | [P], consistent with R1 "opaque house rates" | Quote lock + sum-exact breakdown; price-changed dialog never auto-accepts | Buy-through at 5 competitors, screenshot quote vs final |
| H2 | Delay with no status ("در حال بررسی") | [P] | Timeline + ETA + queue position + SLA-breach apology + auto rush refund | Read last 20 complaints per brand on nazarkade, Trustpilot, Telegram, X |
| H3 | Money sent by card-to-card but not recognised | [R3] (matching issues), [P] | Unique-amount offset, receipt form with tracking number and last 4 digits, 3 distinct states: received / under review / mismatch | Operator log in the demo; real pilot |
| H4 | Card declines at the merchant or account suspended | [R: STATUS note on mpay.cards Trustpilot ~3/5 with fund-loss complaints, specialist 01] | Risk label, restriction note, "test with a small amount" advice, refund path stated | Specialist 01 review dataset |
| H5 | Support unreachable or generic | [P] | Ticket categories + SLA, channel list (Bale, Telegram, phone) with hours, human escalation | Mystery shopper support test |
| H6 | Fear of sharing card/identity data | [P] | Plain "why we ask", encryption note, no CVV in receipts, one-time reveal with step-up | Usability test, 8 users |
| H7 | Mini-app payment hand-off confusion (bank page opens outside) | [P] | `miniapp.payment.external` copy and return screen | Pilot with 10 Bale users |
| H8 | Rate board looks stale or manipulated | [P] | Show update time, source named as "نرخ پایه"; stale state explicit | Compare to bonbast in pilot |

Verify rule: until real reviews are coded (R1 section 8, 20 reviews per brand), treat H1-H8 as design hypotheses, not facts.

### 2. Information architecture and screens (summary; full wireframes in `ux-spec.md`)

Customer web + Mini App (one React codebase, host abstraction `MessengerHost`): Home (rate board, calculator, trust strip) · Catalogue · Product detail · Live calculator (component, also standalone `/calc`) · Checkout (3+2 payment methods) · Payment instructions per method · Receipt upload · Order list · Order detail/timeline · Card reveal · Wallet · Referral · Support (tickets, FAQ) · Auth (OTP, messenger) · KYC · Profile/settings · Legal pages (terms, privacy, refund, risk, complaints, about) · System states (maintenance, rates halted, 404, offline).

Admin/operator (desktop-first): Dashboard · Order queue · Order detail · Payment matching · Fulfilment console · Treasury · Pricing editor · Rate monitor and kill switch · Catalogue/provider settings · Customers/risk flags · Tickets · Reports · Audit log · Users/RBAC. The RBAC matrix (owner/admin/operator/support/accountant/viewer) is in `ux-spec.md` section 12.

State coverage rule: every screen lists the states it can be in; a screen with no `error`, `loading`, and `empty` state defined is a defect (checked in the web E2E suite).

### 3. Design system (summary; machine-readable in `design-tokens.json`)

| topic | decision | note |
|---|---|---|
| Direction / language | `dir="rtl"`, `lang="fa-IR"` | Use CSS logical properties only (`ms-`, `pe-`, `start-`); never `left/right` |
| Font | Vazirmatn variable woff2, self-hosted, Arabic+Latin+digits subset | No Google Fonts (blocked/slow networks) [P] |
| Base size | 15 px body, line-height 1.75, minimum 15 px | Persian script needs more leading than Latin |
| Numerals | Display in Persian digits U+06F0-06F9; inputs accept Persian, Arabic-Indic and Latin and normalise to Latin before submit | Use `font-variant-numeric: tabular-nums`; wrap LTR values (card numbers, IBAN, addresses, hashes) in `<bdi dir="ltr">` |
| Toman format | `۱٬۲۳۴٬۰۰۰ تومان` (separator U+066C, unit word after number, non-breaking space U+00A0) | Internal integer is IRT; "Rial" is never displayed except for the Bale payment API |
| USD / USDT | `$۱۰۰٫۵۰` and `۱۰۰٫۵۰ USDT` (decimal separator U+066B) | USDT micro units never shown |
| Dates | Jalali (`۱۴۰۵/۰۷/۱۰`, `۱۰ مهر ۱۴۰۵`), time 24 h `۱۴:۳۰`; relative time within 24 h; internal UTC epoch ms; week starts Saturday | Friday weekend noted in ETA logic |
| Currency input | Single text input `inputmode="numeric"`, live thousands grouping, caret kept stable, accepts pasted Latin/Persian digits, strips separators, min/max inline, step buttons for USD amount presets | Never `type="number"` (breaks Persian digits and grouping) |
| Colour | Semantic tokens: bg, surface (1-3), line, line-strong, fg, muted, subtle, primary(+hover, soft, on-primary), success, warning, danger, info, accent (rush) in light and dark | Brand overrides primary only; semantic colours never overridden by host theme |
| Contrast | 50 pairs, 0 failures, text >= 4.5:1, control borders/focus >= 3:1 (WCAG 2.2 AA; SC 1.4.11 and 1.4.3) | Re-run `11_contrast.py` after any brand change |
| Spacing / radius / shadow | 4-px scale 0-64; radii 8/12/16/24/full; shadows card/pop per theme | |
| Touch and layout | 44-px minimum targets; design at 360 px; 16-px gutters; sticky CTA <= 4.5 rem | Mini App viewport minimum 320 px |
| Motion | 120/200/320 ms; reduced-motion respected; no pulsing urgency animation | |
| Accessibility | Visible focus ring, skip link, labelled inputs, `aria-live` for price updates and status, countdown announced at thresholds not every second, risk level has text not only colour, error text linked via `aria-describedby` | Copy keys `a11y.*` |
| Dark mode | Follows host/OS; user toggle in profile; tokens redefined, not inverted | |
| Icons | Mirror directional icons in RTL; never mirror logos, clocks, media controls, numerals | |

### 4. Microcopy deck and tone guide

`data/copy.fa.json` holds 1,370 keys across 34 namespaces (counts: admin 346, notif 145, checkout 102, common 75, order 54, calc 49, status 47, quote 41, kyc 35, home 34, receipt 33, support 33, system 30, reveal 29, auth 26, catalog 26, rush 26, product 24, error 22, nav 22, sim 22, legal 21, profile 19, miniapp 17, referral 17, wallet 16, a11y 13, risk 12, host 11, pwa 10, seo 5, empty 3, notifications 3, brand 2). 249 keys are an exact snapshot of the shared namespaces in `apps/web/src/copy/fa.ts` (auth, common, host, nav, quote, risk, status, system) so the web app keeps working; 3 of those strings are overridden for compliance (see Conflicts).

**Tone guide (لحن)**
1. Formal-friendly: address the reader with «شما»; verbs in polite plain form (می‌بینید، وارد کنید). No slang, no excessive honorifics, no exclamation marks except in success confirmations (at most one per screen).
2. Short sentences: <= 20 words; one idea per sentence; the first sentence says what happened, the second what to do.
3. Always give the next step in errors and holds; never blame the user; money-safety reassurance first when a payment is involved (`error.paymentSafe`).
4. Numbers are always shown with unit and Persian digits; never "ارزان" or "بهترین" without a sourced comparison.
5. Banned wording on customer surfaces (lint-enforced): «مجوز»، «کاملاً قانونی»، «قانونی و مجاز»، «بانک مرکزی»، «بدون ریسک»، «صرافی»، «خرید/فروش دلار»، «تضمین» (except «تضمین نمی‌کنیم»)، «ضمانت». Reason: legal guardrail D9 and R14 [R2]; the product is a reseller of services, not a currency exchange.
6. Typography rules (lint-enforced): ZWNJ in compounds (می‌شود، نمی‌توان، سفارش‌ها، به‌روزرسانی); Persian ی/ک only; Persian punctuation (؟ ، ؛ «»); no ASCII digits in running text; placeholders only from a whitelist; no raw HTML.
7. Never ask for or mention CVV, card PIN or second password in any notification or support text (lint-enforced); card details are shown only in the one-time reveal screen.
8. Every price-affecting string is reviewed against the pricing engine's line ids (`calc.line.*` has one key per engine line).

Sample strings (full set in the JSON):

| key | text |
|---|---|
| `home.hero.title` | کارت مجازی و خدمات دیجیتال، با قیمت نهایی روشن |
| `calc.finalPriceNote` | قیمت نهایی شامل همه‌ی کارمزدها و مالیات است؛ هزینه‌ی دیگری اضافه نمی‌شود. |
| `quote.lock.explain` | قیمت شما برای مدتی ثابت می‌ماند؛ حتی اگر نرخ تغییر کند، همین مبلغ را پرداخت می‌کنید. |
| `receipt.under.body` | کمبود: {amount}. تا پایان مهلت می‌توانید مابه‌التفاوت را واریز کنید؛ در غیر این صورت مبلغ دریافتی پس از کسر کارمزد برگردانده می‌شود. |
| `order.provider.outage` | ارائه‌دهنده‌ی این سرویس موقتاً با مشکل روبه‌رو است. سفارش شما در صف می‌ماند و پس از رفع مشکل انجام می‌شود؛ می‌توانید در هر زمان بازگشت وجه بگیرید. |
| `rush.guarantee` | اگر زمان تعهدشده رعایت نشود، هزینه‌ی تحویل سریع به‌طور خودکار برگردانده می‌شود. |
| `kyc.noSplit` | سقف‌ها برای هر فرد در بازه‌های زمانی تجمیع می‌شود؛ تقسیم سفارش به مبالغ کوچک‌تر راه افزایش سقف نیست. |

### 5. Notification matrix

Cell codes: **A** always (if the channel is linked) · **F** fallback only (no messenger linked or messenger send failed) · **O** user opt-in · **-** none. SMS is reserved for OTP and critical status because it costs money and is unreliable in shutdowns (cost per SMS: UNVERIFIED, see specialist 03). E-mail is optional, used for invoices and legal notices. Telegram and Bale share one column ("messenger"); the customer's linked messenger is used. Full matrix with variables and triggers: `ux-spec.md` section 11; template text: `notif.<event>.<channel>` keys. The build script fails if a matrix cell has no template, a template has no matrix cell, or a template uses a variable the event does not declare.

Delivery rules: (1) in-app always written first (source of truth); (2) messenger within 5 s of the domain event; (3) SMS only when the order is paid and (a) OTP, (b) payment rejected, (c) delivered, (d) delayed/failed/refunded, (e) KYC verified, or as fallback when no messenger is linked; (4) quiet hours 23:00-08:00 local for non-critical messages (O and informational cells are deferred; OTP, payment and delivery are not); (5) a notification failure never blocks the order flow (retry queue, architecture section 12); (6) no secret material (PAN, CVV, voucher code) in any notification, only a deep link to the reveal screen.

### 6. Mini App specifics (Telegram and Bale)

| topic | Telegram | Bale | note |
|---|---|---|---|
| JS object | `window.Telegram.WebApp` [S1] | `window.Bale.WebApp` with `initData`, `initDataUnsafe`, `version` [S2] | Host abstraction `MessengerHost` hides both (`apps/web/src/host`) |
| Auth | Verify signed `initData` server-side (`POST /auth/messenger`) | Same shape; algorithm UNVERIFIED (R3 Q6) | Never trust `initDataUnsafe`; phone number requires explicit share or OTP |
| Theme | `themeParams` + `colorScheme`, mapped to tokens | Parity UNVERIFIED | Blend only if contrast passes (runtime check), semantic colours fixed |
| Main button | Native MainButton replaces page CTA | Parity UNVERIFIED -> fall back to in-page sticky CTA | `hasMainButton` flag |
| Back button | Native BackButton mirrors router history | Same fallback | Hide at root; closing confirmation if an order is mid-checkout |
| Deep link | `t.me/<bot>/<app>?startapp=<payload>` | Bale equivalent UNVERIFIED | Payload grammar below; <= 64 chars, `[A-Za-z0-9_-]` |
| Payments | No Toman payment method in Telegram; open our web checkout; gateway page opens in external browser then returns | Bale wallet invoice possible (R3) but fees/limits UNVERIFIED | `miniapp.payment.external` copy |
| Sharing | `share` sheet with referral link | same | Fallback: copy to clipboard |
| Network | Filtered in Iran, needs circumvention tools [P] | Domestic | Web + Bale are primary channels |

Deep-link payload grammar (ours): `ref_<CODE>` (referral), `p_<productSlug>` (product), `o_<orderId>` (order), `calc_<productSlug>_<amountUsd>` (prefilled calculator), `kyc` (open KYC). Unknown payloads open home and show `miniapp.deeplink.invalid`. Referral rules in the UI are anti-abuse by design: one reward per verified, distinct person (identity-checked), reward only after the invitee's first completed order, self-referral rejected (`referral.self`); we do not build or advise multi-account farming (guardrail 1).

### 7. Performance budget and offline behaviour

All values are targets [A] derived from the Lighthouse mobile profile (slow 4G: ~1.6 Mbps, 150 ms RTT, 4x CPU slowdown; practitioner knowledge, medium) and must be measured in CI (bundle-size gate) and on a throttled device before launch.

| metric | budget | enforcement |
|---|---|---|
| Initial JS, home route | <= 170 KB gzip | bundle-size check in CI |
| First-load total (HTML+CSS+JS+font+critical images) | <= 350 KB | Lighthouse CI |
| Font | one subset woff2 for Vazirmatn (weights 400/500/700 via variable axis) <= ~70 KB (UNVERIFIED, measure after subsetting), `font-display: swap`, preload | build |
| Images | AVIF/WebP, <= 30 KB each above the fold, `loading=lazy` below, `pwa.dataSaver` mode removes decorative images | build |
| LCP / INP / CLS | <= 2.5 s / <= 200 ms / <= 0.1 on slow 4G | Lighthouse CI |
| Quote API | server p95 <= 800 ms; response <= 4 KB | load test in sim |
| Realtime | SSE with 15 s heartbeat; fallback poll 15 s -> 60 s backoff; stop when tab hidden | client |
| Third parties | none (no CDN fonts, analytics, maps, chat widgets from foreign hosts) | CSP `default-src 'self'` |

Offline/PWA: service worker caches the shell, last catalogue and last rate board marked stale (`home.board.stale`); order list and last order detail readable offline; **creating an order, paying, receipt upload and card reveal are blocked offline** (`pwa.offline.checkoutBlocked`); receipt images are compressed client-side (<= ~300 KB target) and uploaded with retry; install prompt after the 2nd visit (`pwa.install.*`); update toast (`pwa.update.*`); internet-shutdown scenario (national intranet only): site hosted domestically must still serve the shell; foreign provider outages are shown as `order.provider.outage` rather than errors.

### 8. Honest conversion tactics (no dark patterns)

Allowed, with the exact UI contract:
1. **Price-lock countdown:** after the quote is computed, show the remaining lock time (default 30 minutes, config) as a ring plus text that updates once per second; announced to screen readers only at 5 min, 1 min and expiry. No pulsing, no red flashing; colour switches to warning only in the last 2 minutes.
2. **Clear fee breakdown:** lines `calc.line.*` map one-to-one to engine lines; they **sum exactly to the total** (illustration below); the rounding delta is absorbed in a labelled line; tooltips explain non-obvious lines.
3. **Savings vs market:** shown only if (a) >= 3 independent competitor price observations exist, (b) none is older than 24 h, (c) the comparison is on the same product, amount and speed, (d) the result is a real saving; the text says «حدود X٪ کمتر از میانگین قیمت‌های بررسی‌شده» and links to the method (`calc.market.source`). Otherwise the block is hidden entirely (`calc.market.hidden` is for the admin preview only). Comparative advertising claims must be reviewed by a licensed professional [R2].
4. **Recommended method badge** only when it is actually cheapest or fastest for this order (`checkout.method.recommended`).
5. **Social proof:** only real counters from the database with time window stated.

Banned: fake countdowns that reset on refresh, "only N left" unless a real capacity counter says so, pre-ticked rush or insurance upsells, confirm-shaming, hidden fees at the last step, defaulting to the most expensive method, auto-accepting a changed price, trial-to-subscription tricks, guilt copy on cancel.

Customer-facing price breakdown that is truthful without exposing the supplier (worked example, **placeholder parameters, not a pricing recommendation**; script `11_price_example.py`; reference rate 256,900 IRT/USDT; sigma_d 1.2 % assumed):

| line (customer wording) | USD 100 new card, gateway, normal | share |
|---|---|---|
| ارزش سرویس (۱۰۰ دلار x نرخ مرجع) | 25,690,000 | 80.0 % |
| کارمزد صدور و شارژ کارت | 2,116,856 | 6.6 % |
| هزینه‌ی تأمین، تبدیل و قفل قیمت | 1,202,784 | 3.7 % |
| کارمزد خدمات {brand} | 3,077,360 | 9.6 % |
| کارمزد درگاه پرداخت | 16,000 | 0.05 % |
| تحویل سریع | 0 | 0 % |
| **جمع** | **32,103,000** | 100 % |

The lines do not name the upstream card provider, the exchange or the wholesale price; they describe *what the charge is for*. This is truthful because the lines sum to the amount charged and each label states the real nature of the cost; it is allowed not to disclose the supplier's identity or the exact wholesale split, but it is **not** allowed to label a margin as a "government fee" or to omit fees. Variants: card-to-card total 32,087,000 (no gateway fee), fast 33,386,000, express 35,312,000, USD 50 top-up of an existing card 15,403,000 [D1].

**Flag for the pricing specialist:** the example is +24.9 % over the USDT reference because the placeholder parameters (margin = max(150,000 IRT, 10 % of cost), volatility buffer 3.69 %, risk 1 %, modelled cost 8.9 % over the service value = issue fee + 3 % load + decline buffer + network allocation + exchange spread/taker fee) are conservative; competitors show 4-6 % fees on card loads (F17), but that band is not like-for-like with a NEW card (USD 4.99 issue fee). Specialist 07 [R1] models the break-even floor for a new card + USD 100 load at about +12.1 % over free USD (+6.95 % for a load only), so about 12.8 pp of this example is buffers and margin above the floor. All of it remains [A] placeholder. If the calibrated price is not competitive, the UI should not say "cheapest"; it should sell on trust, transparency and speed (the open lane, F01).

### 9. Rush / Express upsell UX and capacity messaging

| element | rule |
|---|---|
| Position | A segmented control "سرعت تحویل" under the amount, **after** the price is visible, never inside a modal; default = normal (`rush.noDefault`) |
| Content per tier | Name, promised time (SLA from config), extra price in Toman and as a share of the total, capacity chip |
| Honest guarantee | If the promised time is missed, the rush fee is refunded automatically and the customer is told (`rush.guarantee`, `notif.rush.refunded.*`); the engine already carries `slaMinutes` |
| Capacity | Chip text `rush.capacity.low` appears only when remaining capacity in the current hour is <= 20 % of `capacityPerHour` **and** the counter is real; full -> tier disabled with the next slot (`rush.capacity.full`) |
| After hours | Business hours 09:00-23:00 (config): outside them the clock starts at opening (`rush.afterHours`) and the express tier may be disabled |
| Upgrade later | Possible until an operator has started the task; only the difference is charged (`rush.upgrade.*`); too late -> `rush.upgrade.tooLate` |
| Price change | Adding a tier recomputes the quote; if the lock would be shorter than the pay window it extends no further than policy allows; the user sees the new total before confirming |
| Metrics | Take rate of fast/express, SLA hit rate, refunds paid; the simulator uses the same tier params |

## Implications

**Product**
- Build the calculator as the home page hero; show the rate board with its source and update time; do not show "savings" until data and policy permit.
- Make order tracking and receipts first-class; they are the core trust features and cost little.
- Every state in `ux-spec.md` is a test case for the E2E personas.

**Pricing engine / data contract**
- UI needs from the quote API: `lines[]` with stable ids (`service_value, provider_fees, exchange_cost, conversion_and_lock, volatility_buffer, risk_buffer, service_fee, margin, payment_fee, rush, vat, rounding, discount`), `lockedUntil`, per-method totals, `effectiveRateIrtPerUsd`, `warnings[]`, optional `marketComparison {pctBelowAvg, nObservations, oldestObservationAt}` and rush tier availability `{id, availableNow, nextSlotAt, remaining}`. A customer-facing grouping (6 lines) is rendered from the engine's finer lines; grouping lives in the web layer, the sum must equal the total (invariant test).
- Add `capacityRemaining` per rush tier to `GET /public/config` (not present in the API spec yet; see needs).

**Simulator**
- Parameters to expose: share of customers choosing fast/express (prior [A]: 8 % and 2 %, to be tested with price experiments, R1 section 5.5), conversion drop when the lock expires, fraction of quotes abandoned after a price-change dialog, support contacts per 100 orders by state (H2/H3), share of orders with receipt mismatch. All are [A] priors to calibrate in the pilot.

**Owner decisions**
- Brand name, logo and colour (primary colour change requires re-running the contrast script), support hours and channels, Enamad application, whether to publish competitor comparisons, rush tier prices and capacities, language for Telegram (Persian only at launch).

## Conflicts & adjudication

| id | conflict | adjudication | confidence |
|---|---|---|---|
| C1 | Web snapshot string `quote.lockHint` said «تضمین شده است» but legal guard list bans «تضمین» | Overridden in `data/copy.fa.json` with «قفل است»; web owner must adopt | high |
| C2 | `quote.savingsNote` used «تضمین قیمت آینده نیست»; same lint | Reworded to «پیش‌بینی قیمت آینده نیست» | high |
| C3 | `system.ratesHaltedBody` used «صرافی‌ها» (exchange houses) which implies we are an exchange (legal D2/D3, R2) | Reworded to «بازار ارز» | high |
| C4 | UX wants "savings vs market" as a conversion lever; legal specialist warns about comparative claims and pricing example is +24.9 % over reference vs competitor 4-6 % | Block hidden by default; enabled only by admin flag with fresh sourced data and professional review | medium |
| C5 | Lint originally flagged Persian digits as ASCII (Python `\d` matches Unicode digits) | Fixed the lint to `[0-9]`; 17 false errors cleared | high |
| C6 | Telegram theme parameter names come from practitioner knowledge; official page blocked | Kept, flagged UNVERIFIED in `design-tokens.json` and here; runtime contrast check guards visual risk | medium |

## Open questions

| # | question | verify_how |
|---|---|---|
| Q1 | Real user pain points and review distribution for Iranian card/FX resellers | Code the last 20 reviews per brand (nazarkade, Trustpilot, Google Maps, Telegram, X) per R1 section 8; run 8 moderated usability sessions |
| Q2 | Does Bale's WebApp expose themeParams, MainButton, BackButton, safe-area and `startapp`; what is the `initData` signing algorithm | Read docs.bale.ai/miniapp and test with a real Bale bot (R3 Q6) |
| Q3 | Telegram Mini App current API version, SecondaryButton, safe-area variables, `start_param` limits | Read core.telegram.org/bots/webapps once egress allows |
| Q4 | Enamad eligibility and badge placement rules; whether the badge must link to enamad.ir | Read enamad.ir guidelines; ask the licensed adviser (specialist 04) |
| Q5 | SMS cost, 70/67 segment behaviour and sender-line rules of the chosen SMS provider | Provider test send (specialist 03 Q) |
| Q6 | Actual subset size of Vazirmatn and bundle sizes | Measure in the web build (`npm run build` stats) |
| Q7 | Conversion effect of showing the three payment methods side by side vs recommending one | A/B test after launch (>= 2,000 quote views per arm, R1 section 5.5) |
| Q8 | Whether users trust "کارتینو" placeholder brand; brand name and logo | Owner decision |
| Q9 | Share of users reaching us through Telegram vs Bale vs web | Analytics in pilot (first-party only) |
| Q10 | Legal acceptability of comparative price claims and of the word «واسطه» vs «نماینده» | Licensed professional (specialist 04) |

## Sources

- **[R1]** `docs/03-research/07-ir-competitors.md` and `data/competitors.json` - competitor positioning, UX patterns (section 4.3), trust signals (1.6), rates, mystery-shopper protocol (section 8) - repo evidence (itself per search summaries).
- **[R2]** `docs/03-research/04-legal-tax-ir.md` - Enamad fee F28, copy guard list D1-D9, risk register R09/R14, mandatory disclosures - repo evidence.
- **[R3]** `docs/03-research/03-ir-payments-collection.md` - Bale API and mini-app notes F35-F43, card-to-card rules, payment verification, Q6 - repo evidence.
- **[R4]** `packages/contracts/src/defaults.ts` - lock, pay windows, rush tiers, business hours (configuration, not a research fact).
- **[R5]** `docs/05-architecture/architecture.md`, `docs/05-architecture/api-spec.md` - order lifecycle, pricing steps, endpoints, notification principle.
- **[S1]** https://core.telegram.org/api/bots/webapps (and results from skills.cat, jsr.io, npm typings) - Telegram Mini Apps BackButton, MainButton, SecondaryButton, themeParams, viewport and safe-area - per search summary of 2026-10-02 (page not read; `core.telegram.org/bots/webapps` fetch returned `EGRESS_BLOCKED`).
- **[S2]** https://docs.bale.ai/miniapp - Bale mini app `window.Bale.WebApp`, `initData`, `initDataUnsafe`, `version` - per search summary of 2026-10-02 (page not read).
- **[S3]** https://www.zoomit.ir/report/134656-iranian-master-card-details/ - context on Iranian Mastercard distribution (not used for any number) - per search summary.
- **[D1]** `scripts/research/11_price_example.py` - worked price example, run 2026-10-02.
- **[D2]** `scripts/research/11_contrast.py` - contrast verification, run 2026-10-02.
- **[D3]** `scripts/research/11_build_copy.py` - copy build and lint, run 2026-10-02.
- **[P]** Practitioner knowledge and design judgement of this specialist (RTL/Persian typography conventions, Lighthouse throttling profile, SMS UCS-2 segment sizes, Telegram filtering in Iran) - not verified in this run; each use is tagged and carries `verify_how` above.
