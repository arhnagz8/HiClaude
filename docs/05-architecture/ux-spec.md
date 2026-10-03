---
title: UX specification v1 - customer site, Telegram/Bale Mini Apps, admin/operator panel
owner_agent: 11-ux-product-fa
as_of: 2026-10-02
confidence: medium (structure and states: high; behavioural assumptions about users: low)
status: draft
---

# UX specification v1 **[CONTRACT for apps/web]**

Audience: the web builders (B7a customer + Mini App, B7b admin) and the persona E2E agents. Written in English; every user-visible string is a key in `data/copy.fa.json` (never hard-code Persian in components). Tokens: `docs/05-architecture/design-tokens.json`. Research and rationale: `docs/03-research/11-ux-fa.md`. Backend contracts: `docs/05-architecture/api-spec.md`, `architecture.md` (order states section 6, pricing section 7).

## 0. Conventions

- **Direction.** Everything is RTL (`<html dir="rtl" lang="fa-IR">`). Wireframes below are drawn in *logical* order: the first element of a row sits at the **right** edge on screen. Use logical CSS (`ms-`, `me-`, `ps-`, `pe-`, `text-start`).
- **Wireframe legend.** `[ Button ]` primary action · `( Button )` secondary · `[x]` checkbox · `(o)` radio · `{Name}` value bound to data · `<key>` a copy key (shortened, in `data/copy.fa.json`) · `...` skeleton/loading · `!` warning icon · `~` live-updating.
- **State vocabulary.** Every screen lists its states: `loading`, `empty`, `error` (network/server), `ready`, plus domain states: `quote-expired`, `price-changed`, `payment-mismatch`, `provider-outage`, `rates-halted`, `kill-switch`, `offline`. A state not applicable is marked "n/a". A screen without defined `loading`, `empty`, `error` is a defect.
- **Numbers.** Display Persian digits; Toman as `۱٬۲۳۴٬۰۰۰ تومان`; USD as `$۱۰۰٫۵۰`; USDT as `۱۰۰٫۵۰ USDT`; Jalali dates. Components `<Money>`, `<Usd>`, `<JalaliDate>`, `<Countdown>` are the only formatters (see `apps/web/src/lib/format.ts`).
- **Hosts.** One codebase, three hosts: `web`, `telegram` (`/tg`), `bale` (`/bale`) through `MessengerHost`. Differences are listed in section 9.
- **Roles for copy.** Customer surfaces never name the upstream provider, exchange or wholesale price; they describe what each charge is for. Admin surfaces show everything.

## 1. Routes and global shell

### 1.1 Customer routes

| route | screen | auth | notes |
|---|---|---|---|
| `/` | C01 Home | public | rate board + calculator |
| `/catalog` | C02 Catalogue | public | filters, search |
| `/p/:slug` | C03 Product detail | public | calculator embedded |
| `/calc` | C04 Calculator (standalone) | public | deep-linkable `?p=<slug>&a=<usd>` |
| `/checkout/:quoteId` | C05 Checkout | login at this point | three+ methods |
| `/orders/:id/pay` | C06 Payment instructions | owner | per method |
| `/orders/:id/receipt` | C07 Receipt upload | owner | card-to-card only |
| `/orders` | C08 Order list | owner | |
| `/orders/:id` | C09 Order detail + timeline | owner | SSE |
| `/orders/:id/reveal` | C10 Card reveal | owner + step-up | one-time |
| `/wallet` | C11 Wallet | owner | |
| `/referral` | C12 Referral | owner | |
| `/support` | C13 Support | public/owner | FAQ public, tickets owner |
| `/login` | C14 Auth | public | OTP or messenger |
| `/kyc` | C15 KYC | owner | |
| `/account` | C16 Profile and settings | owner | |
| `/legal/:page` | C17 Legal pages | public | terms, privacy, refund, risk, complaints, about |
| `/offline`, `/maintenance`, `*` | C18 System screens | public | |

Admin routes: `/admin/login`, `/admin` (dashboard), `/admin/queue`, `/admin/orders/:id`, `/admin/payments`, `/admin/tasks`, `/admin/treasury`, `/admin/pricing`, `/admin/rates`, `/admin/catalog`, `/admin/customers`, `/admin/tickets`, `/admin/reports`, `/admin/audit`, `/admin/users`, `/admin/settings`, `/admin/sim` (demo only).

### 1.2 Global components (all screens)

| component | behaviour | states / copy |
|---|---|---|
| Header | brand, language fixed fa, theme toggle, login/account | `nav.*` |
| Bottom nav (mobile, <= 767 px) | Home · Catalogue · Orders · Wallet · Account; badge on Orders when an order needs action | `nav.bottom` |
| Rates banner | shown when rate status is `stale`, `halted`, `anomaly`, `killed` | `status.rate.*`, `system.ratesHalted*`; `killed` blocks the quote CTA (`error.KILL_SWITCH`), existing locks stay valid |
| Offline banner | `navigator.onLine === false` | `pwa.offline.*`; checkout/receipt/reveal disabled |
| Demo/sim banner | `DEMO=1` only | `sim.banner`, `host.simulated` |
| Toasts | max 1 visible, 4 s, queue; errors persist until dismissed | |
| Live-region | `aria-live=polite` for price and status changes | `a11y.liveStatus`, `a11y.priceUpdated` |
| Skip link, focus ring | always | `nav.main` |

### 1.3 Quote UI state machine (used by C01, C03, C04, C05)

```
        enter amount
 idle ───────────────▶ computing ──ok──▶ locked(remaining) ──timer 0──▶ expired
   ▲                       │                 │   ▲                         │
   │                       └─error──▶ failed│   └── rates move ≥ threshold ┘ (silent re-quote only while editing)
   │                                         │
   └──── edit amount / rush / product ───────┘
 locked ──"continue"──▶ checkout ──server says QUOTE_EXPIRED / price differs──▶ price-changed dialog
```
- While the customer is *editing*, quotes are recomputed silently (debounce 400 ms) and the new price replaces the old with a 200 ms highlight; no dialog.
- Once the customer taps **Continue** (lock accepted), a price change is **never** applied silently: show the price-changed dialog (section 3.2).
- `locked` shows the remaining time (`quote.lock.countdown`) and the explanation `quote.lock.explain`.

## 2. Customer screens

Format per screen: purpose · wireframe · states · data/API · copy namespaces · analytics events (first-party only).

### C01 Home `/`

Purpose: show price transparency within 5 seconds: live rate board, calculator, trust strip, how-it-works.

```
┌─────────────────────────────────────────────┐
│ {Brand}                       ☾  [ورود]       │  header
├─────────────────────────────────────────────┤
│ <home.hero.title>                             │
│ <home.hero.subtitle>                          │
│ ┌───────── Rate board ~ ─────────────────┐   │
│ │ <home.board.title>      {updated: ۱۴:۳۰} │   │
│ │ <home.board.baseRate>   {۲۵۷٬۰۰۰ تومان}  │   │
│ │ Sparkline (24h)   <home.board.baseRateNote>│  │
│ └─────────────────────────────────────────┘   │
│ ┌───────── Calculator (C04 embed) ────────┐   │
│ │ product [ کارت مجازی ▾ ]                  │   │
│ │ amount  [   ۱۰۰   ] USD  ($۵۰)($۱۰۰)($۲۰۰) │   │
│ │ speed   (o)عادی ( )سریع ( )فوری            │   │
│ │ total   ۳۲٬۱۰۳٬۰۰۰ تومان   ⏱ ۲۹:۴۵         │   │
│ │ [ <home.hero.cta> ]   ▸ <quote.showBreakdown>│  │
│ └─────────────────────────────────────────┘   │
│ Trust strip: قیمت نهایی · بازگشت وجه · ریسک · پیگیری · پشتیبانی · اینماد* │
│ <home.how.title>  ①  ②  ③                      │
│ <home.popular.title> [card][card][card]       │
│ <home.recent.title>  (logged in) [reorder]    │
│ FAQ (3) · footer: entity block, legal links   │
└─────────────────────────────────────────────┘
* Enamad badge only if `settings.brand.enamad.url` is set (issued).
```

| state | behaviour |
|---|---|
| loading | skeleton for board and calculator; hero text renders immediately (static) |
| empty | board has no rate: `home.board.empty`; calculator disabled with `quote.unavailable` |
| error | board shows last value with `home.board.stale`; calculator shows `calc.compute.error` + retry |
| rates-halted | warning banner; calculator works with `calc.warning.haltPremium` line |
| kill-switch | calculator CTA disabled; banner `system.salesPaused*`; catalogue still browsable |
| offline | cached shell; board marked stale; CTA disabled |

Data: `GET /public/config` (board, methods, tiers, banners), `POST /quotes`. Copy: `home.*`, `calc.*`, `quote.*`, `rush.*`.

### C02 Catalogue `/catalog`

```
┌ search [ جستجو… ] ───────────── sort [ محبوب ▾ ] ┐
│ chips: همه | کارت مجازی | شارژ | اشتراک | کارت هدیه | خدمات │ risk filter ▾
├──────────────────────────────────────────────┤
│ ┌card────────────┐ ┌card────────────┐         │
│ │ icon  {name}   │ │ ...            │         │
│ │ <catalog.card.from> {از ۳۲٬۱۰۳٬۰۰۰ تومان}  │
│ │ ⏱ {SLA}   ● ریسک: {low|medium|high}        │
│ │ (اپراتور / خودکار)                          │
│ └────────────────┘                           │
└──────────────────────────────────────────────┘
```
States: loading (6 skeleton cards) · empty (`catalog.empty.*` with reset-filters button) · error (`catalog.error.title` + retry) · unavailable product (greyed card + `catalog.card.unavailableReason`, "notify me" `product.notify`) · rates-halted (prices show `~` and the halted banner).
Rule: the "from" price is always the live quote for the product's default amount and normal speed, never a stale list price. A product with `risk_label = high` always shows a visible risk chip (text + colour, `a11y.riskLevel`).

### C03 Product detail `/p/:slug`

```
┌ ← back (BackButton on Mini App)                      ┐
│ {name}  ● ریسک {label}  [⏱ {SLA}]                    │
│ Restriction note: <product.restriction.generic> {product.restriction_note}  (always visible, never collapsed) │
│ ┌ Calculator (C04) ┐                                 │
│ Tabs: توضیحات | شامل چه چیزی است | نحوه‌ی استفاده | پرسش‌های متداول │
│ <product.sla.title> {normal / business hours}         │
│ <product.risk.title> [ <product.risk.readFull> ]      │
│ Required inputs form (email, account id…) <product.inputs.title> │
│ Sticky CTA: [ ادامه — {total} ]  (MainButton on Mini App)      │
└──────────────────────────────────────────────────────┘
```
States: loading · not found (`product.notFound`) · unavailable (`product.unavailable.*`, CTA replaced by notify) · provider-outage (info banner `order.provider.outage` wording adapted: product page says orders will queue; the customer must accept this on checkout) · high-risk (consent checkbox appears at checkout `checkout.consent.highRisk`).

### C04 Live calculator (component and `/calc`)

Inputs: product, amount (USD or fixed options), new card vs top-up of existing card (where relevant), rush tier. Output: the breakdown below plus per-method totals.

```
┌ <calc.title> ───────────────────────────────┐
│ ارزش سرویس                {۲۵٬۶۹۰٬۰۰۰}       │ ← calc.line.service_value
│ کارمزد صدور و شارژ کارت     {۲٬۱۱۶٬۸۵۶}   ⓘ    │ ← provider_fees
│ هزینه‌ی تأمین، تبدیل و قفل قیمت {۱٬۲۰۲٬۷۸۴} ⓘ  │ ← conversion_and_lock
│ کارمزد خدمات {brand}        {۳٬۰۷۷٬۳۶۰}  ⓘ    │ ← service_fee
│ تحویل سریع                 {۰}               │ ← rush
│ مالیات بر ارزش افزوده        {…}  (if applies)  │ ← vat
│ ─────────────────────────────────────────    │
│ <calc.line.total>          {۳۲٬۱۰۳٬۰۰۰ تومان}  │
│ <calc.finalPriceNote>                         │
│ <calc.effectiveRate> {۳۲۰٬۸۷۰ تومان}          │
│ By method:  درگاه ۳۲٬۱۰۳٬۰۰۰ · کارت‌به‌کارت ۳۲٬۰۸۷٬۰۰۰ · تتر ۱۲۴٫۸۰ USDT │
│ Market comparison block (hidden unless data valid; see 8)      │
│ ⏱ <quote.lock.label> ۲۹:۴۵     [ ادامه ]      │
└──────────────────────────────────────────────┘
```
Rules:
1. Display grouping (6 lines) is computed in the web layer from engine lines: `service_value`; `provider_fees`; `conversion_and_lock = exchange_cost + volatility_buffer + rounding + drift`; `service_fee = risk_buffer + margin`; `payment_fee`; `rush`; plus `vat` and `discount` if present. **Invariant (unit test): lines sum exactly to `total`.** The grouping never merges a fee into a line whose label denies it.
2. Amount validation: min/max from the product, `calc.amount.tooLow/tooHigh/overLimit` (with CTA to verify identity for a higher tier), integers only for Toman, up to 2 decimals for USD.
3. Currency input: see section 7.
4. Method totals come from the API (`totals per payment method`); a method that is unavailable for this amount is greyed with the reason (`checkout.method.unavailable.limit|off|tier`).
States: loading (`calc.compute.loading`, previous total dimmed, not blanked) · error (`calc.compute.error`) · blocked (`calc.blocked.title`: kill switch or limits) · uncompetitive (`calc.warning.uncompetitive`, admin-gated; hides "best price" chips) · stale rate (`calc.warning.staleRate`) · halted (`calc.warning.haltPremium`).

### C05 Checkout `/checkout/:quoteId`

Three steps (Stepper): method → pay → review? In practice: **1 Method** (this screen) → **2 Pay** (C06) → **3 Track** (C09). Login is required at the start of this screen (OTP inline, no page change in Mini App: `miniapp.auth.*`).

```
┌ stepper: ① روش پرداخت  ② پرداخت  ③ پیگیری       ┐
│ Summary: {product} · {amount} · {speed} · ⏱ ۲۴:۱۰ │
│ (o) درگاه بانکی      {۳۲٬۱۰۳٬۰۰۰}  کارمزد ۱۶٬۰۰۰ │
│ ( ) کارت‌به‌کارت  ✓ <checkout.method.recommended>   {۳۲٬۰۸۷٬۰۰۰}  سقف روزانه… │
│ ( ) پرداخت با تتر (USDT)   {۱۲۴٫۸۰ USDT}  TRC20/BEP20/TON │
│ ( ) کیف پول  (موجودی {…}) — disabled if insufficient │
│ ( ) واریز بانکی (large amounts only)              │
│ Consents: [x] <checkout.consent.terms>  [x] <checkout.consent.immediate>  [x] high-risk (if label high) │
│ Sticky CTA: [ <checkout.cta.pay> — {total} ]      │
└────────────────────────────────────────────────┘
```
Rules: no method is pre-selected unless it is the only one; "recommended" appears only on the cheapest/fastest for this order; the CTA is disabled until required consents are ticked, and the reason is stated beside it; double-tap protection with `Idempotency-Key` (`checkout.idempotent`); duplicate open order for same product/amount → `checkout.duplicate.*` dialog (view existing / create new). Limit reached → `checkout.limit.daily|openOrders`.
States: loading · error (`checkout.error.title`) · quote-expired (dialog 3.1) · price-changed (dialog 3.2) · method-unavailable (inline) · kill-switch (blocked, locks valid until expiry) · offline (blocked).

### C06 Payment instructions `/orders/:id/pay`

Common header: order code, total, **pay-by timer** (gateway 20 min, card-to-card 45 min, bank 240 min, USDT 60 min from config), status chip.

**Gateway:** summary → redirect to bank page. In Mini Apps the bank page opens in the external browser (`miniapp.payment.external`); on return the app shows `order.pay.again` if unpaid, or the timeline if confirmed. Never trust the callback: the page polls/streams the order until the server marks it verified (`payment.confirmed`).

**Card-to-card:**
```
┌ <checkout.pay.c2c.title>                     ┐
│ ① <c2c.step1>  مبلغ دقیق: {۳۲٬۰۸۷٬۴۲۷ تومان} [کپی]  <c2c.exactNote>
│ ② <c2c.step2>  کارت مقصد: {6037 99** …} [کپی]  بانک {…}  به نام {holder}
│ ⏱ مهلت: ۴۴:۳۰                                  │
│ ! <c2c.ownCardOnly>   ! <c2c.warning>          │
│ [ <c2c.iPaid> ] → C07                          │
└───────────────────────────────────────────────┘
```
Unique amount: a small offset (0-999 IRT, config `uniqueOffsetMaxIrt`) makes matching deterministic; show the **exact** total; if the card rotates (daily cap or operator change) the screen shows `c2c.cardChanged` and the new card only for new orders.

**USDT:** QR + address (LTR, copy), network chips (TRC20, BEP20, TON), exact amount with memo/tag if needed, confirmations needed, pay-by timer, warning "send only on the selected network"; states `awaiting`, `seen on chain (n/N confirmations)`, `confirmed`, `underpaid` (tolerance 0.5 %), `late`.

**Bank transfer (large amounts):** IBAN (LTR), holder, reference code, note `checkout.pay.bank.slow`, then receipt upload as in C07.

**Wallet:** one-tap confirm if the balance suffices.

States (all methods): loading · expired (`order.expired` view with `order.pay.again` = re-quote) · payment-mismatch (C07 panels) · provider-outage not applicable here · offline (instructions cached read-only, "I paid" disabled).

### C07 Receipt upload `/orders/:id/receipt`

Fields: tracking number (`receipt.trackingNo`), payer card last 4 digits (`receipt.payerLast4`), paid-at date/time (Jalali picker, default now), optional image (`receipt.image.*`: JPG/PNG, <= 5 MB, client-side compress, **mask-CVV advice** `receipt.image.noCvv`).
Result panels (after submit; each has a headline, one sentence, and one next action):

| state | key prefix | next actions |
|---|---|---|
| received, under review | `receipt.received.*` | back to timeline; ETA |
| rejected | `receipt.rejected.*` | fix and resubmit (`receipt.attemptsLeft`) |
| mismatch (amount/time) | `receipt.mismatch.*` | pay difference / contact support |
| underpaid | `receipt.under.*` | `receipt.under.payRest` (new payment for the difference); else automatic refund net of fee |
| overpaid | `receipt.over.*` | credit added to wallet (no action) |
| late (after deadline) | `receipt.late.*` | accept new price (`receipt.late.requote`) or refund; per policy `latePayment` |
| third-party payer | `receipt.thirdParty.*` | refunded to the payer; use own card |
| duplicate tracking no. | `receipt.duplicate` | support |

### C08 Order list `/orders`
Tabs: all / open / done (`order.list.filter.*`). Row: code, product, amount, status chip (`status.order.*`), date. States: loading (3 skeleton rows) · empty (`order.list.empty.*` with CTA to catalogue) · error · offline (cached list, stale marker).

### C09 Order detail and timeline `/orders/:id`

```
┌ {code} · {product} · {status chip}               ┐
│ Status hint: <status.orderHint.{status}>           │
│ ETA: <order.eta.dueAt> {۱۵:۱۰}  (queue pos. {n})   │
│ Timeline (vertical stepper, live ~):               │
│  ● ثبت سفارش            ۱۴:۰۲                       │
│  ● پرداخت تأیید شد       ۱۴:۱۱                      │
│  ◉ در حال انجام (current) ۱۴:۱۳  <order.timeline.current> │
│  ○ تحویل                                           │
│  ○ تکمیل                                           │
│ Price lines (same breakdown as the quote, immutable) │
│ Actions by state: [ نمایش اطلاعات کارت ] (delivered) │
│   ( تأیید دریافت ) ( ثبت مشکل ) ( فاکتور ) ( تکرار سفارش ) ( پشتیبانی ) │
│ Live indicator: <order.live.connected|reconnecting> │
└────────────────────────────────────────────────┘
```

State → UI mapping (engine states from architecture section 6):

| order state | chip key | timeline marker | primary action | notes |
|---|---|---|---|---|
| awaiting_payment | `status.order.awaiting_payment` | payment current | pay / cancel | timer visible |
| payment_review | `.payment_review` | payment review | upload more / wait | `order.timeline.paymentReview` |
| paid | `.paid` | paid done | none | brief |
| risk_hold | `.risk_hold` | review | none | `order.hold.body` (neutral, no accusation; `order.hold.mayAsk` if documents may be requested) |
| queued | `.queued` | queued current | upgrade speed (`rush.upgrade.cta`) | `order.eta.waitingFunding` when `waitingFunding`; `order.eta.outsideHours` |
| fulfilling | `.fulfilling` | current | none | operator started: upgrade closes |
| delivered | `.delivered` | delivered | reveal / confirm / dispute | `order.autoComplete` shows auto-complete time (24 h) |
| completed | `.completed` | all done | invoice, repeat | |
| expired | `.expired` | | new quote | |
| cancelled | `.cancelled` | | repeat | |
| failed | `.failed` | | choose refund or retry with another provider (`order.failed.refundOption|retryOption`) | `autoRefundOnFailure` default |
| refund_pending | `.refund_pending` | refund current | none | `order.refund.pending` + target (card/wallet) |
| refunded | `.refunded` | refund done | none | `order.refund.done` |
| disputed | `.disputed` | | add info | `dispute.*` |

Extra states: **provider-outage** (banner `order.provider.outage`; order stays `queued`, refund available at any time via support/cancel button when not yet started) · **delayed** (SLA passed: `notif.order.delayed.*`, apology + rush-fee refund line) · loading (skeleton) · not found (`order.notFound`) · offline (last cached snapshot, `order.offline`).

### C10 Card reveal `/orders/:id/reveal`

Flow: delivered order → [نمایش اطلاعات کارت] → step-up OTP (`auth.stepUp.*`, `reveal.stepUp`) → one-time view with auto-hide (`reveal.hideIn`, TTL `revealTtlMinutes` = 30) → shows PAN (LTR, grouped 4-4-4-4), expiry, CVV, holder, billing note, balance; copy buttons per field; `reveal.screenshotWarn`, `reveal.neverShare`; first-use tips `reveal.firstUse.*` (test with a small amount). Vouchers: code + how to redeem (`reveal.voucher.*`).
States: step-up required · limit reached (`reveal.limitReached`, max 3 reveals) · expired link (`reveal.expiredLink`) · error (`reveal.error`) · hidden (`reveal.hidden` + `reveal.showAgain` consuming a reveal). Screen capture is discouraged, not blockable on the web; Mini Apps use the host flag where available. Never log or send the revealed data to analytics; never include it in notifications.

### C11 Wallet `/wallet`
Balance, history (topup, spend, refund, overpay, referral: `wallet.history.*`), top-up (`wallet.topup.*` via gateway), explainer `wallet.explain`, notice `wallet.noWithdraw` (closed-loop wallet; legal D1). States: loading · empty history · error · top-up pending/confirmed.

### C12 Referral `/referral`
Code, copy link, share (Mini App share sheet), stats (invited/qualified/earned), rules `referral.rules.*`. Self-referral rejected (`referral.self`), invalid code (`referral.invalid`). Reward only after the invitee's first completed order; one reward per distinct verified person. No leaderboard, no multi-tier.

### C13 Support `/support`
Channels (Bale, Telegram, phone, hours `support.hours`, off-hours `support.offHours`), FAQ accordion, new ticket (category, order picker, message, attachment), ticket list with status (`status.ticket.*`) and first-response promise (`support.ticket.firstResponse`), satisfaction rating after close. `support.safety`: staff never ask for card PIN or CVV or one-time codes. States: loading · empty (`empty.tickets`) · error · closed ticket (reopen).

### C14 Auth `/login`
Phone (accepts Persian/Latin digits, normalises, `auth.phoneHelp`) → OTP (5 digits, resend timer `auth.resendIn`, attempts limited) → optional referral code → welcome. In Mini Apps: auto-login by verified `initData` (`miniapp.auth.auto`); phone is requested only when an order needs one (`miniapp.auth.sharePhone` or OTP). Errors: wrong code, expired, rate-limited (`error.RATE_LIMITED`), session expired (`auth.sessionExpired`). Terms acceptance line `auth.terms` links C17.

### C15 KYC `/kyc`
Tiers (`status.tier.*`: new / verified / trusted) with per-order and per-24h limits (`kyc.level.*`). Steps: identity (national id, full name, birth date Jalali) → card ownership (card number first 6 + last 4, name match) → optional enhanced (liveness `kyc.liveness.*`). Consent text `kyc.consent`, "why we ask" `kyc.why`, privacy `kyc.privacy`. Results: pending/verified/rejected with a reason (`kyc.reason.*`, never "fraud"). `kyc.noSplit` is shown beside any limit to say that limits are per person and cannot be increased by splitting orders. States: loading · error · try later (`kyc.tryLater`) · limit reached (`kyc.limitReached.*`).

### C16 Profile and settings `/account`
Name, phone (change = OTP), tier, notification preferences by channel (`profile.notifications.*`; SMS locked to critical), theme, sessions and "log out all", data export, account deletion request (`profile.delete*`, with retention note), language fixed to Persian.

### C17 Legal pages `/legal/:page`
Terms, privacy, refund policy, **risk disclosure** (third-party suspension risk, restriction notes), complaints and contact, about/entity (legal name, registration no., economic code, address: `legal.entity.*`). Versioned (`legal.version`), re-acceptance modal on new version (`legal.accept.*`). Every page carries `legal.notLawAdvice`-style disclaimers only where the text is a template; final texts require a licensed professional. Enamad badge appears only when issued.

### C18 System screens
Offline (`pwa.offline.*`), maintenance, 404, error boundary (`error.INTERNAL`, `error.requestId`), unsupported host (`miniapp.unsupported`), update available (`pwa.update.*`).

## 3. Cross-cutting dialogs and the payment-mismatch matrix

### 3.1 Quote expired
Trigger: timer reached 0 or API `QUOTE_EXPIRED`. Dialog (not toast): title `quote.lock.expired.title`, body `quote.lock.expired.body`, primary `quote.refresh` (re-quote with the current rate), secondary "back". If the customer had already **paid** within the lock, the order is honoured at the locked price regardless of this dialog (the payment path never re-prices).

### 3.2 Price changed
Trigger: re-quote returns a different total than the one the customer accepted. Dialog shows old total, new total, difference with direction (`quote.changed.up|down`, `quote.changed.why`), buttons `quote.changed.accept` and `quote.changed.cancel`. Never auto-accept; never hide a price **increase** behind a "continue" label; a price decrease is also shown (honesty both ways). Accessibility: focus moves to the dialog; `a11y.priceUpdated` announced.

### 3.3 Payment-mismatch matrix

| situation | detected by | customer sees | system action |
|---|---|---|---|
| paid exact | gateway verify / amount match | confirmed | `payment.confirmed` |
| paid less (under) | bank amount < due | `receipt.under.*` + pay-the-rest | wait until deadline; else refund net of fee |
| paid more (over) | amount > due | `receipt.over.*` | excess to wallet |
| paid late | after `payExpiresAt` | `receipt.late.*` | grace period 6 h; accept if price move < 1 %, else refund minus refund fee (config) |
| paid from someone else's card | payer instrument != KYC identity | `receipt.thirdParty.*` | refund to payer, order stays unpaid |
| gateway amount mismatch | verify mismatch | `error.PAYMENT_MISMATCH` + `error.paymentSafe` | reversal by PSP; support ticket auto-created |
| no matching bank credit | operator queue | `receipt.received.*` (waiting) | admin A04 matching |
| duplicate receipt | tracking number reuse | `receipt.duplicate` | flag risk |

### 3.4 Provider outage
Per product: when the provider failure rate crosses the threshold the product shows a banner, orders already paid stay `queued`, new orders show a consent line "this may take longer"; the customer may cancel/refund while the task is not started (`order.provider.outage`). If the outage exceeds the SLA by 2x, auto-apology and optional refund (see notification `order.delayed`).

### 3.5 Rates halted / kill switch
Halted (exchange closed or stale): quotes include the halt premium and a warning; kill switch: new quotes refused (`error.KILL_SWITCH`), locked quotes valid until `lockedUntil`, banner `system.salesPaused*`.

## 4. Admin and operator panel

Desktop-first (>= 1024 px), usable at 768 px; sidebar 15 rem; dense tables with keyboard shortcuts (`admin.shortcut`); every mutating action shows a confirmation with reason field where required and writes the audit log. Dangerous actions require **step-up** (`admin.stepUp.*`) and, above configured thresholds, **two-person approval** (`admin.twoPerson.*`). All text from `admin.*` keys. Tone: terse, factual. Roles: section 5.

### A01 Login `/admin/login`
Username + password + TOTP (`admin.login.*`); demo accounts are visibly labelled; failure `admin.login.failed`; session timeout `admin.session`.

### A02 Dashboard `/admin`
```
┌ KPI tiles: orders today · revenue · open queue · SLA at risk · float coverage (days) · rate status ┐
│ Alerts feed (SSE): paymentReview, slaWarn, providerFail, lowFloat, rateAnomaly, riskFlag, largeOrder     │
│ Mini charts: orders/hour · margin · rate vs competitor reference                                          │
│ Quick actions: kill switch · open queue · pay-matching                                                    │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```
States: loading (`admin.dash.loading`) · empty (new system: onboarding checklist) · error per tile (tile-level retry) · sim banner.

### A03 Order queue `/admin/queue`
Table (virtualised): code · customer · product · amount · status · rush tier · age · SLA remaining (colour by `slaWarnFraction`) · assignee. Tabs (`admin.queue.tab.*`: payments, fulfil, risk, all), filters (`admin.queue.filter.*`: unassigned, mine, rush, overdue), bulk claim, search by code/phone. States: empty (`admin.state.empty`) · loading · error · stale connection (reconnect banner) · conflict (409: "someone else changed this" with refresh).

### A04 Payment matching `/admin/payments`
Split view: left unmatched bank credits/receipts, right candidate orders sorted by `admin.pay.matchScore` (amount exact, time window, payer last 4, name). Actions: approve, reject (reason required), mark underpaid/overpaid, refund. Duplicate-reference warning `admin.pay.duplicateRef`. Receipt viewer with zoom and "hide CVV" reminder. Two-person approval above threshold. States: empty (all matched) · loading · error · mismatch highlighted (amount diff chip) · history tab (`admin.pay.tab.history`).

### A05 Order detail `/admin/orders/:id`
Header (status, tier, SLA), tabs: Overview (customer, price lines **with cost and margin** `admin.order.margin`), Payment, Fulfilment (tasks), Timeline/events, Notes (`admin.order.action.addNote`), Customer history. Actions: approve/reject payment, hold/release (`admin.order.action.*`), cancel, refund (full/partial, reason), retry via another provider. Every action: reason input + audit.

### A06 Fulfilment console `/admin/tasks`
My tasks list (claim/release), task page: instructions for the kind (`issue_card`, `topup_card`, `deliver_voucher`, `pay_service`, `custom`), checklist (`admin.task.checklist.*`: verified details, funded, delivered), delivery payload form (encrypted on save, shown masked), SLA timer (`admin.task.sla.over`), fail with reason (`admin.task.fail`). Operator sees only what is needed (no margin, no treasury). States: no tasks (empty) · waiting funding (blocked, link to treasury) · error on completion (retry) · conflict.

### A07 Treasury dashboard `/admin/treasury`
Balances by wallet/exchange/provider float, **coverage days** per provider vs `minCoverageDays` (`admin.treasury.coverage.low`), in-transit transfers, USDT inventory lots (cost basis, realised FX gain/loss), planned purchases/sweeps with blockers (`admin.treasury.plan.blocked`), reconciliation diff (`admin.treasury.reconcile.diff`), actions (`admin.treasury.action.buy|withdraw|sweep`) with two-person approval above threshold. States: loading · empty · exchange-halted (disabled buy with reason) · reconcile mismatch (red).

### A08 Pricing editor `/admin/pricing`
Form over the pricing policy (margins, buffers, lock minutes, rounding, tiers, rush tiers, payment-method fees) with **live preview** (pick product/amount: itemised result and sensitivity to a +/-2 % rate move), version history and diff, invariant checks (`admin.pricing.invariant`: price >= cost + min margin unless loss-leader), draft vs published, publish with reason + step-up. Competitor reference prices (manual or observed) with timestamp and source; "market comparison on customer site" flag (default off, see section 8).

### A09 Rate monitor and kill switch `/admin/rates`
Per-exchange bid/ask/mid, freshness, dispersion, status chip (ok/stale/anomaly/halted/killed), history chart, `executableAsk` source. Kill switch: scope (all / provider / product), reason (required), confirmation `admin.kill.confirm` + step-up; an auto-trip log shows why. Un-kill needs a reason too. Banner on every admin page while active.

### A10 Catalogue and providers `/admin/catalog`
Product table: name, kind, provider, `risk_label`, `restriction_note`, SLA, enabled, loss-leader flag (`admin.catalog.lossLeader.warn`), price floor. Edit drawer; disabling a product asks what to do with queued orders. Provider health (failure rate, outage toggle).

### A11 Customers and risk flags `/admin/customers`
Search, profile (tier, limits, KYC, lifetime value, refunds), risk flags (`admin.risk.flag.*`, score `admin.risk.score`), actions block/unblock (`admin.customers.confirmBlock`), limit/tier changes with reason. Risk note `admin.risk.note`: flags are signals for review, not verdicts. No data export without owner role.

### A12 Tickets `/admin/tickets`
Inbox with assignment, SLA timers, internal notes (`admin.tickets.internalNote`), canned replies, link to order, close/reopen.

### A13 Reports `/admin/reports`
Statements (income, balance sheet, cash flow) with basis nominal/real/USD, KPIs, ledger explorer, CSV export (owner and accountant only); empty state `admin.reports.empty`; balance check indicator (debits = credits).

### A14 Audit log `/admin/audit`
Immutable table: time, user, action, entity, reason, before/after diff; filters; export for owner. No edit/delete controls exist in the UI.

### A15 Users and RBAC `/admin/users`
User table, role assignment, 2FA status, deactivate, session list; permission matrix view (`admin.users.matrix`).

### A16 Settings `/admin/settings`
Brand (name, logo, primary colour with contrast check), payment method config (cards, IBAN, gateway), business hours, support channels, legal entity details, feature flags (`admin.settings.flags`), notification templates preview (read-only; copy is code-reviewed).

### A17 Simulator panel `/admin/sim` (demo only)
Time controls (pause/resume, speed, advance hour/day/week), scenario picker and events (`sim.event.*`: devaluation, exchange halt, gateway outage, internet shutdown, price war, provider freeze, recovery), reset with confirmation. Never reachable in production builds.

## 5. RBAC matrix (admin)

R = read, W = write/act, A = approve (two-person), - = none.

| area | owner | admin | operator | support | accountant | viewer |
|---|---|---|---|---|---|---|
| Dashboard | R | R | R (own queue) | R (tickets) | R (finance tiles) | R |
| Order queue / detail | RW | RW | RW (assigned/claimable, no margin) | R (no payment actions) | R | R |
| Payment matching | RWA | RW | W (match only, below threshold) | - | R | - |
| Fulfilment console | RW | RW | RW | - | - | - |
| Treasury | RWA | RW | - | - | R | - |
| Pricing editor | RWA | RW (publish needs owner above threshold) | - | - | R | - |
| Rate monitor / kill switch | RWA | RW (kill switch) | R, kill switch (emergency) | R | R | R |
| Catalogue / providers | RW | RW | R | R | R | R |
| Customers / risk | RW | RW | R (limited) | RW (no block) | R | - |
| Tickets | RW | RW | R | RW | - | R |
| Reports / ledger / export | RW | R | - | - | RW | R (no export) |
| Audit log | R | R | - | - | R | - |
| Users / RBAC | RWA | - | - | - | - | - |
| Settings | RWA | RW (no brand-legal) | - | - | - | - |
| Sim panel | RW | R | - | - | - | - |

Rules: threshold-based two-person approval for refunds above X IRT, treasury actions, pricing publish, role changes (X is config, null until the owner decides: `UNVERIFIED`). Sensitive reveals (customer card data) are not available to any admin role in the UI. Every denied action returns the forbidden screen (`admin.forbidden.*`).

## 6. Design system (summary; tokens in `design-tokens.json`)

- Colour, type, spacing, radius, shadow, breakpoints, motion, z-index, layout and Mini App mapping are defined in the tokens file (light and dark). Components must read tokens through CSS variables (`apps/web/src/styles/tokens.css`) and never hard-code hex values.
- Typography: Vazirmatn (self-hosted), base 15 px, line-height 1.75; headings 700; numeric text tabular; LTR islands (`<bdi dir="ltr">`) for card numbers, IBAN, URLs, addresses, tracking numbers.
- Forms: label above input, hint below, error below with icon + text (never colour alone), `aria-describedby`; autofill attributes (`autocomplete="tel"`, `one-time-code`); `inputmode`.
- Buttons: primary (one per view), secondary, ghost, danger; loading state keeps width; min 44 px height.
- Focus ring: 2 px primary with 2 px offset, visible in both themes (>= 3:1).
- Dark mode: follows host/OS unless the user toggles; verified pairs in `11_contrast.py`.

## 7. Currency input behaviour (spec)

1. A text input with `inputmode="numeric"` and `dir="ltr"` for the editable digits but right-aligned text; label and unit suffix (`تومان` / `دلار`) are outside the field.
2. Accepts Persian (۰-۹), Arabic-Indic (٠-٩) and Latin digits, including on paste; strips spaces, commas, `٬`, `،`; ignores other characters.
3. Live grouping with `٬` every three digits, displayed in Persian digits; the caret stays on the same logical digit after reformatting (compute from digits-to-the-right).
4. Toman: integers only; USD: up to 2 decimals using `٫` or `.`; USDT: up to 2 decimals in the UI (6 internally).
5. Normalises to a Latin integer (`IRT` or cents) before submit; never submits formatted strings; shows min/max in the hint; clamps nothing silently (shows `calc.amount.tooLow/tooHigh`).
6. Preset chips (e.g. $50 / $100 / $200) set the value without focusing the keyboard (avoids the Mini App keyboard overlap, `miniapp.keyboardTip`).
7. Negative numbers, exponent notation and leading zeros are rejected.

## 8. Honest conversion, price transparency and rush UX (rules for builders)

### 8.1 Allowed
- Price-lock ring and text countdown; colour switches to warning only in the last 2 minutes; no animation beyond the ring; announced to assistive tech at 5 min, 1 min and expiry.
- Itemised breakdown that sums to the total; tooltips for non-obvious lines (`calc.tip.*`).
- "Savings vs market" only when **all** hold: >= 3 independent observations for the same product/amount/speed; none older than 24 h; real saving; flag `marketComparison.enabled` on; wording «حدود X٪ کمتر از میانگین قیمت‌های بررسی‌شده» with method link; legal review done (open question Q10 in the research doc).
- "Recommended" chip on the cheapest or fastest method for this order.
- Real capacity counters for rush tiers (from `capacityRemaining`), real social proof counts with the window stated.

### 8.2 Banned (reviewed in code review and E2E)
Fake or resettable countdowns · "only N left" without a real counter · pre-selected rush/insurance/extra · confirm-shaming copy · fees revealed on the last step · defaulting to the most expensive method · silently applying a higher price · dark patterns in cancel or refund · mixed-up currency units · urgency colours when nothing is urgent · comparing against an invented "regular price".

### 8.3 Truthful but supplier-neutral price lines
The customer sees six lines: service value, card issue/top-up fee, sourcing/conversion and price-lock, service fee, payment fee, speed fee (+ VAT if applicable). They describe the nature of the charge; they do not name upstream providers or wholesale prices; they never label margin as a tax or government fee; and they always sum to the total. Admin surfaces show the engine's finer lines with cost and margin.

### 8.4 Rush / Express upsell
- Segmented control "سرعت تحویل" under the amount with three options: normal (pre-selected, `rush.noDefault`), fast, express. Each shows promised time (config SLA), the extra price and the capacity chip.
- Capacity chip: `rush.capacity.available` when plenty; `rush.capacity.low` only when remaining <= 20 % of hourly capacity and the number is real; `rush.capacity.full` disables the tier and shows the next slot.
- Guarantee line `rush.guarantee` is always visible next to the control; automatic refund of the rush fee if the SLA is missed (`notif.rush.refunded.*`).
- After hours: `rush.afterHours`; the express tier may be disabled outside business hours.
- Upgrade after ordering: allowed until the task is started; pays only the difference (`rush.upgrade.*`); otherwise `rush.upgrade.tooLate`.
- Metrics (first-party): view rate, selection rate per tier, SLA hit rate, refunds; used by the simulator and pricing review.

## 9. Mini App specifics

| topic | Telegram (`/tg`) | Bale (`/bale`) |
|---|---|---|
| Object | `window.Telegram.WebApp` | `window.Bale.WebApp` (mirrors Telegram's; parity **UNVERIFIED**) |
| Boot | `ready()` + `expand()`; read `initData`, POST `/auth/messenger`; keep the web fallback if verification fails | same |
| Theme | map `themeParams` to tokens (`miniapp.telegramThemeMap`) after the runtime contrast check; semantic colours fixed | if no `themeParams`, use own tokens and `colorScheme` |
| Viewport | use stable viewport height for sticky CTA; min width 320 px; safe-area insets from host + `env()` | same |
| MainButton | one primary action per screen (`host.mainButtonPay`, `host.mainButtonOrder`, text <= 24 chars), shows progress when busy; page's own sticky CTA hidden when `hasMainButton` | fallback: in-page sticky CTA |
| BackButton | visible on every non-root route, calls router back; on checkout with an unpaid order, ask `miniapp.closeConfirm` before closing | same |
| Closing confirmation | enabled during checkout and receipt upload | same |
| Deep links | `startapp` payload grammar: `ref_<CODE>`, `p_<slug>`, `o_<id>`, `calc_<slug>_<usd>`, `kyc`; <= 64 chars `[A-Za-z0-9_-]`; invalid -> home + `miniapp.deeplink.invalid` | Bale equivalent UNVERIFIED; keep the same grammar |
| Sharing | share referral link/text via host share, else copy (`host.shareFailed`) | same |
| Payments | gateway opens externally (`miniapp.payment.external`); the app waits for server verification and refreshes on `visibilitychange` | Bale wallet invoice is a later option (fees, limits UNVERIFIED) |
| Haptics | success/warning/error on payment confirm, mismatch, expiry | if available |
| Networks | filtered in Iran: users need circumvention tools; expect slow/unstable connections | domestic: lower latency |
| Fallback | `miniapp.openWeb` link to full site when a feature is unsupported | same |

## 10. Performance budget and offline (see research doc section 7)
Initial JS <= 170 KB gzip, first-load <= 350 KB, LCP <= 2.5 s on slow 4G, INP <= 200 ms, CLS <= 0.1, all assets self-hosted, no third-party scripts, SSE with poll fallback, service worker caching shell/catalogue/last rate board, offline writes blocked (orders, payments, receipts, reveal), receipt image compression, data-saver mode (`pwa.dataSaver`).

## 11. Notification matrix and templates

Codes: **A** always when the channel is linked · **F** fallback only (no messenger linked or messenger failed) · **O** user opt-in · **-** none. Telegram and Bale are one "messenger" column (the customer's linked messenger). Template keys: `notif.<event>.inapp.title|body`, `notif.<event>.msg`, `notif.<event>.sms`, `notif.<event>.email.subject|body`; buttons `notif.btn.*`. Variables are those listed per event plus `{brand}`; unknown variables fail the build.

### 11.1 Matrix (45 events)

| event | in-app | Telegram/Bale | SMS | e-mail | variables | trigger |
|---|---|---|---|---|---|---|
| `auth.otp` | - | F | A | - | code time brand domain | auth.otp.request, step-up (reveal/KYC) |
| `account.welcome` | A | A | - | - | brand | customer.registered |
| `security.newLogin` | A | A | F | - | brand time | session created on new device |
| `security.reveal` | A | A | - | - | code time | reveal succeeded |
| `order.created` | A | A | - | - | code product amount time url | order.created |
| `order.payReminder` | A | A | - | - | code time url | timer: payExpiresAt minus 10 min |
| `order.expired` | A | A | - | - | code url | order.status_changed -> expired |
| `payment.receiptReceived` | A | A | - | - | code time | payment.receipt_submitted |
| `payment.confirmed` | A | A | F | - | code time url brand | payment.confirmed |
| `payment.rejected` | A | A | A | - | code reason url brand | payment.rejected |
| `payment.under` | A | A | - | - | code amount time url | underpayment detected |
| `payment.over` | A | A | - | - | code amount | overpayment credited to wallet |
| `payment.late` | A | A | - | - | code url | payment after payExpiresAt |
| `payment.mismatch` | A | A | - | - | code amount | gateway verify mismatch |
| `payment.thirdParty` | A | A | - | - | code url | payer instrument != KYC identity |
| `order.riskHold` | A | A | - | - | code time | order.status_changed -> risk_hold |
| `order.started` | A | - | - | - | code | order.status_changed -> fulfilling |
| `order.delayed` | A | A | A | - | code url brand | SLA due passed (rush premium refunded) |
| `order.delivered` | A | A | A | O | code url brand | fulfilment.completed |
| `order.completed` | A | A | - | - | code url | customer.confirmed / auto_complete |
| `order.failed` | A | A | A | - | code url brand | fulfilment.failed (permanent) |
| `order.refundPending` | A | A | - | - | code amount time target | order.status_changed -> refund_pending |
| `order.refunded` | A | A | A | - | code amount target brand | refund.paid |
| `rush.refunded` | A | A | - | - | code amount target | SLA missed on rush tier |
| `dispute.opened` | A | A | - | - | code time | customer.dispute |
| `dispute.resolved` | A | A | - | - | code outcome url | dispute.resolved_* |
| `wallet.topup` | A | A | - | - | amount balance | wallet credited |
| `referral.reward` | A | A | - | - | amount | invitee first order completed |
| `kyc.verified` | A | A | A | - | brand | kyc tier raised |
| `kyc.rejected` | A | A | - | - | reason url | kyc rejected |
| `ticket.reply` | A | A | - | O | id url brand | staff reply on ticket |
| `product.backInStock` | A | O | - | - | product url | product re-enabled (notify-me list) |
| `system.salesPaused` | A | - | - | - | - | killswitch.changed on |
| `system.salesResumed` | A | - | - | - | - | killswitch.changed off |
| `legal.termsUpdated` | A | - | - | A | version url brand | new legal version published |
| `admin.paymentReview` | A | A | - | - | code amount method url | payment.detected / receipt needs staff |
| `admin.slaWarn` | A | A | - | - | code tier time url | fulfilment.sla at slaWarnFraction |
| `admin.slaBreach` | A | - | - | - | code | SLA breached |
| `admin.killSwitch` | A | A | - | - | reason scope url | killswitch.changed |
| `admin.providerFail` | A | A | - | - | provider pct url | risk.scan provider failure rate |
| `admin.lowFloat` | A | A | - | - | provider days min url | treasury coverage < minCoverageDays |
| `admin.rateAnomaly` | A | - | - | - | pct | rates anomaly |
| `admin.riskFlag` | A | - | - | - | customer flag score | risk.flagged |
| `admin.largeOrder` | A | - | - | - | code amount | order above approval threshold |
| `admin.unmatchedPayment` | A | - | - | - | amount time | bank credit unmatched after window |

### 11.2 Delivery rules
1. In-app record is written first and is the source of truth; the messenger message follows within 5 s of the domain event; SMS only for the cells marked A/F.
2. SMS is reserved for OTP and critical order/payment status (cost per SMS UNVERIFIED, specialist 03); Persian SMS is UCS-2: 70 characters for one segment, 67 per segment when concatenated. Every SMS template is <= 2 segments (OTP = 1), verified by the build script.
3. Quiet hours 23:00-08:00 local time: informational and opt-in messages are deferred to 08:00; OTP, payment, delivery and delay/failure messages are not.
4. Failure never blocks the flow: retry with backoff (1 min, 5 min, 30 min), then fall back to the next channel per the matrix.
5. No secret material in any notification: no PAN, CVV, expiry, voucher code, password or full IBAN; only a deep link to the authenticated screen (lint-enforced).
6. Deduplicate by `(event, orderId, channel)` within 10 minutes; group multiple status changes in the same minute into the latest state.
7. Opt-out: messenger and e-mail non-critical messages can be disabled in profile (`profile.notifications.*`); security, payment and delivery notices cannot.
8. Templates are code-reviewed; admins can preview but not edit copy at runtime in v1.

### 11.3 Template samples (from `data/copy.fa.json`)

| key | text |
|---|---|
| `notif.auth.otp.sms` | کد تأیید {brand}: {code} / به کسی ندهید. / @{domain} #{code} |
| `notif.payment.confirmed.msg` | پرداخت سفارش {code} تأیید شد. / تحویل تا حدود {time}. / پیگیری: {url} |
| `notif.payment.confirmed.sms` | {brand}: پرداخت سفارش {code} تأیید شد. پیگیری: {url} |
| `notif.payment.under.msg` | مبلغ واریزی سفارش {code} {amount} کمتر از مبلغ سفارش است. / تا {time} می‌توانید مابه‌التفاوت را پرداخت کنید: {url} |
| `notif.order.delivered.msg` | سفارش {code} آماده است. / برای حفظ امنیت، اطلاعات فقط پس از تأیید کد پیامکی در سایت نمایش داده می‌شود: {url} |
| `notif.order.delivered.sms` | {brand}: سفارش {code} آماده است. دریافت: {url} |
| `notif.order.delayed.msg` | سفارش {code} از زمان تعهدشده عقب افتاده است و بابت آن عذرخواهی می‌کنیم. در حال پیگیری هستیم و نتیجه را همین‌جا اطلاع می‌دهیم. / اگر هزینه‌ی تحویل سریع پرداخت کرده بودید، به‌طور خودکار برگردانده می‌شود. |
| `notif.rush.refunded.msg` | به دلیل تأخیر در سفارش {code}، هزینه‌ی تحویل سریع ({amount}) به {target} برگردانده شد. |
| `notif.order.refunded.msg` | {amount} از سفارش {code} به {target} بازگردانده شد. |
| `notif.order.riskHold.msg` | سفارش {code} برای امنیت شما به‌صورت دستی بررسی می‌شود. معمولاً کمتر از {time} طول می‌کشد و نیازی به اقدام شما نیست. |
| `notif.admin.paymentReview.msg` | پرداخت در انتظار بررسی / سفارش: {code} / مبلغ: {amount} / روش: {method} / باز کردن: {url} |
| `notif.admin.killSwitch.msg` | کلید توقف فعال شد / علت: {reason} / دامنه: {scope} / {url} |

### 11.4 Sample SMS lengths (script-computed)
Sample values: brand «کارتینو», code `12345`. All SMS keys end with `.sms`; `scripts/research/11_build_copy.py` prints the segment count of each; current maximum is 2 segments, OTP is 1 segment.

## 12. Acceptance checklist (for E2E personas and reviewers)

1. Every screen in sections 2 and 4 renders its `loading`, `empty`, `error` states (E2E toggles the mock server).
2. Calculator: lines sum exactly to the total for 20 random products/amounts/tiers (unit test); total updates within 1 s of an amount change; lock countdown matches `lockedUntil`.
3. Quote expiry and price change dialogs appear and never auto-accept.
4. Card-to-card: exact amount shown with the offset; receipt flow reaches each result panel (received, rejected, mismatch, under, over, late, third-party).
5. Order timeline updates by SSE without reload; reconnect banner on drop; offline shows the cached snapshot.
6. Reveal requires step-up, auto-hides, enforces the 3-reveal limit and never appears in logs or notifications.
7. Rush: normal pre-selected; capacity chip appears only with real counters; SLA breach refunds the rush fee and sends `rush.refunded`.
8. Persian digits, Jalali dates and Toman format on every price and date (visual regression); no ASCII digits in running text; no `left/right` CSS (lint).
9. Contrast: `python3 scripts/research/11_contrast.py` passes after any token or brand change; dark mode screenshots reviewed.
10. Mini App (simulated host): theme blending respects the contrast guard; MainButton replaces the sticky CTA; BackButton works; `startapp` deep links open the right screen; closing confirmation during checkout.
11. Performance: bundle-size gate (<= 170 KB gzip initial JS) and Lighthouse slow-4G run in CI.
12. Copy lint: `python3 scripts/research/11_build_copy.py --check` passes (placeholders whitelisted, banned wording absent, SMS segments, matrix complete).
13. RBAC: each role sees only permitted nav items; forbidden direct URL shows `admin.forbidden.*`; operator never sees margin or treasury.
14. Audit: every admin mutation appears in `/admin/audit` with reason and diff.

## 13. Open items needing other owners

| item | owner | note |
|---|---|---|
| `capacityRemaining` per rush tier and `marketComparison` object in `GET /public/config` / `QuoteDto` | api + core | not in api-spec yet |
| Stable line ids in `QuoteDto.lines[]` (`service_value, provider_fees, exchange_cost, conversion_and_lock, volatility_buffer, risk_buffer, service_fee, margin, payment_fee, rush, vat, rounding, discount`) | core | UI grouping depends on them |
| Adopt the three overridden web-snapshot strings (`quote.lockHint`, `quote.savingsNote`, `system.ratesHaltedBody`) and the shorter OTP SMS | web (B7a) | compliance lint |
| Calibrated price parameters | specialist 12 | current example is +24.9 % over reference |
| Two-person approval thresholds, support hours, SLA promises | owner | `null` until decided |
| Bale WebApp parity and `initData` algorithm | live adapters + sandbox bot | UNVERIFIED |

