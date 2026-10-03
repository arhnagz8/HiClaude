---
title: Iranian exchanges and the Toman to USDT rail (صرافی‌های ایرانی و ریل تبدیل تومان به تتر)
owner_agent: 02-ir-exchanges-usdt-rails
as_of: 2026-10-02
confidence: medium for the policy timeline and Nobitex API; low for fees, spreads, caps and status of most other venues
status: draft
---

# Iranian exchanges and the Toman to USDT rail

> Rendered by `scripts/research/02_render_doc.py` from `scripts/research/02_doc_template.md`; data in `data/exchanges.json` and `data/regulatory_limits.json`; numbers by `scripts/research/02_conversion_cost.py`. Analysis only, not legal or tax advice: confirm with a licensed Iranian lawyer/tax adviser.


## خلاصه (برای مالک)

- **امروز (۱۰ مهر ۱۴۰۵):** طبق ابلاغ بانک مرکزی، از ۸ مهر ساعت ۲۱ تا ۱۲ مهر ساعت ۲۱ معاملات تتر هر شب از ۲۱ تا ۹ صبح متوقف است و خرید هر کاربر حداکثر ۲٬۰۰۰ تتر در روز است. این محدودیت «موقت» اعلام شده؛ احتمال تمدید هست ولی نرخ پایه‌ای برای آن پیدا نشد.
- **گلوگاه اصلی ظرفیت، سقف واریز شناسه‌دار است:** ۲۵ میلیون تومان در ۲۴ ساعت (با نرخ ۲۵۷٬۰۰۰ حدود ۹۷ تتر). رساندن ۱۰۰ تتر به ارائه‌دهنده حدود ۲۶٫۰۵ میلیون تومان خرج دارد، یعنی بیش از سقف یک روز. برای ۳۰ سفارش ۱۰۰ دلاری در روز حدود ۳۱ «سهمیه‌ی واریز» لازم است. راه‌حل باید قانونی باشد (حساب حقوقی، OTC رسمی، سرمایه‌ی تتری خود مالک، …) و نه تقسیم واریز برای دور زدن سقف.
- **قفل ۷۲ ساعته:** تتر خریداری‌شده با واریز ریالی تا ۷۲ ساعت قابل برداشت نیست (فرض محافظه‌کارانه: برای هر واریز جداگانه). فلوت لازم حدود «مصرف روزانه × (۳ + ۲ روز ذخیره)» است. مثال: ۱٬۰۰۰ تتر در روز یعنی ۵٬۰۰۰ تتر، حدود ۱٫۲۸۵ میلیارد تومان؛ ساختن این فلوت فقط با واریز شناسه‌دار و یک سهمیه ۵۲ روز طول می‌کشد، پس فلوت اولیه باید از مسیر دیگری بیاید.
- **هزینه‌ی تبدیل** (کارمزد معامله ۰٫۲۵٪، اسپرد فرضی ۰٫۱۰٪، کارمزد برداشت ۱ تتر روی TRC20): برای ۲۵ دلار حدود ۴٫۴٪، برای ۱۰۰ دلار حدود ۱٫۳۵٪، برای ۵۰۰ دلار حدود ۰٫۵۵٪ و برای ۲٬۰۰۰ دلار حدود ۰٫۴۰٪ بالاتر از نرخ میانی. کارمزد برداشت ثابت است؛ اگر ۳٫۵ تتر باشد (رمزینکس، TRC20) سفارش ۲۵ دلاری حدود ۱۴٫۴٪ گران می‌شود. تجمیع برداشت‌ها و انتخاب شبکه‌ی ارزان (TON یا BEP20 با حدود ۰٫۸ تتر) مهم‌ترین اهرم هزینه است.
- **ریسک تحریم (مهم‌ترین تغییر ۴ ماه اخیر):** نوبیتکس، والکس، بیت‌پین و رمزینکس در ۱۲ خرداد ۱۴۰۵ (۲۰۲۶-۰۶-۰۲) و آبان‌تتر در ۱۶ مرداد ۱۴۰۵ (۲۰۲۶-۰۸-۰۷، طبق فایل بخش تحریم‌ها) در فهرست SDN آمریکا قرار گرفته‌اند. یعنی پرنقدینگی‌ترین صرافی‌ها «پرریسک»اند. صرافی‌های غیرتحریمی (تبدیل، بیت۲۴، اکسیر، …) داده‌ی بسیار کمی دارند و باید پیش از استفاده راستی‌آزمایی شوند.
- **فریز تتر:** حدود ۵۵۰ میلیون دلار تتر مرتبط با ایران در ۲۰۲۶ فریز شده (دو موج بانک مرکزی: حدود ۳۴۴ میلیون در آوریل و ۱۳۱ میلیون در ژوئیه). آدرس‌های مرتبط با صرافی می‌توانند فریز شوند؛ موجودی را نزد صرافی یا ارائه‌دهنده انبار نکنید.
- **API:** مستندات رسمی نوبیتکس مستقیم خوانده شد: orderbook نسخه ۳ با ۳۰۰ درخواست در دقیقه، WebSocket، **قیمت بازارهای ریالی به «ریال» است (نه تومان)**، حداکثر ۱۰ برداشت رمزارزی و ۳ برداشت ریالی در ۲۴ ساعت، و «برداشت امن» (whitelist). بیت‌پین و والکس قیمت را به تومان می‌دهند. برای بقیه فقط اسناد یا SDK غیررسمی در دسترس بود (اطمینان کمتر).
- **داده‌های کم یا نامطمئن:** سقف جستجوی وب این جلسه (۲۰۰) تمام شد و فقط حدود ۳۰ جستجو از این بخش انجام شد (هدف حداقل ۴۰). بیشتر اعداد کارمزد و سقف «به‌گزارش خلاصه‌ی جستجو» هستند، اسپرد و عمق بازار هیچ‌جا پیدا نشد (فرض مدل، علامت‌گذاری‌شده) و بسیاری از فیلدها null با روش راستی‌آزمایی‌اند.
- **P2P و OTC:** فقط مسیرهای رسمی (OTC خود صرافی‌ها یا کسب‌وکار ثبت‌شده). الگوهای کلاهبرداری: رسید جعلی، پرداخت‌کننده‌ی ثالث و مسدودی حساب، برگشت پایا، آدرس‌مسموم‌سازی. عددی برای کارمزد و سرعت OTC پیدا نشد.
- **شبکه‌ها:** هزینه‌ی واقعی همان کارمزد برداشت صرافی است (کارمزد زنجیره را صرافی می‌دهد). شبکه‌ی پیش‌فرض و جایگزین را از جدول زنده‌ی صرافی انتخاب کنید (نوبیتکس: `GET /v2/options`)، حداقل واریز ارائه‌دهنده را بپرسید و با آدرس‌مسموم‌سازی مقابله کنید.
- **توصیه‌ی عملیاتی:** حداقل مبلغ سفارش و تجمیع برداشت‌ها، فلوت پیش از توقف شبانه، سقف موجودی برای هر صرافی، پایش روزانه‌ی فهرست SDN و اطلاعیه‌ها، و تعریف «توقف شبانه/سقف خرید/سقف واریز/قفل ۷۲ ساعته» به‌صورت پارامتر قابل تغییر در شبیه‌ساز و پنل ادمین.
- **تذکر:** این سند تحلیل است و مشاوره‌ی حقوقی یا مالیاتی نیست. پیش از اجرا با وکیل و مشاور مالیاتی دارای مجوز تأیید کنید.


## TL;DR

- **Regime today (2026-10-02, 10 Mehr 1405):** CBI-ordered nightly USDT trading halt 21:00-09:00 IRST and a 2,000 USDT per user per day buy cap run from 2026-09-30 21:00 to 2026-10-04 21:00 (8-12 Mehr 1405); explicitly temporary, extension risk UNVERIFIED (no base rate: one observed episode) [S1, S2, S3, S4]. Confidence: high for the halt, medium for the cap's exact scope.
- **Binding capacity limit:** ID-based Rial deposit cap of 25,000,000 IRT per 24 h per payer Sheba/ID (about 97.3 USDT at 257,000 IRT/USDT), in force since 2024-09-07 per one summary (2022-12 per another; see C1) [S5, S6, S7, S8]. Crediting 100 USDT at a provider costs about 26.05M IRT, more than one allowance-day. Confidence medium (scope and dating conflict, see Conflicts).
- **72 h lock** on crypto withdrawal after a Rial deposit (FATA-directed, implemented by every exchange; per-deposit rolling lock assumed) [S9, S10, S11, S12]. Float is about D x (3 + g) days of USDT: 1,000 USDT/day needs about 5,000 USDT (1.285B IRT) and about 52 allowance-days to seed from Rial deposits alone.
- **All-in conversion premium over mid** (taker 0.25 %, assumed spread 0.10 %, 1 USDT TRC20 withdrawal): 4.36 % for $25, 1.35 % for $100, 0.55 % for $500, 0.40 % for $2,000; with Ramzinex's reported 3.5 USDT TRC20 fee a $25 ticket costs 14.4 % more than mid. Batching withdrawals is the main cost lever. Spreads are assumptions (no depth data reachable).
- **Sanctions changed the venue map:** Nobitex, Wallex, Bitpin, Ramzinex (OFAC SDN 2026-06-02) [S13, S14, S15] and Aban Tether (2026-08-07, imported from the sanctions specialist's file because 02's own searches missed it) [S16, S17] are SDNs (file 05 counts seven designated domestic-market exchanges including Shelbit and BitBank); files 05 and the risk register advise not to use them as USDT sources. Non-designated venues (Tabdeal, Bit24, Exir, OMPFinex, Tetherland, NovinTether, ...) have very thin data here.
- **Issuer freezes:** about USD 550M of Iran-linked USDT was frozen by Tether in 2026 (CBI wallets: >344M in April, >131M on 2026-07-16) [S18, S19, S16].
- **Nobitex API (official docs source read directly):** `GET https://apiv2.nobitex.ir/v3/orderbook/USDTIRT` 300 req/min; stats 20/min; trades 60/min; WebSocket `wss://ws.nobitex.ir/connection/websocket` (Centrifugo); **Rial-market prices are in Rial**; 10 crypto + 3 Rial withdrawals per 24 h; whitelist ("safe withdrawal") and `GET /v2/options` for live fees and limits [S20, S21, S22, S23]. Bitpin and Wallex quote Toman (unofficial SDK evidence).
- **Policy timeline 2022-2026** (19 rows in Section 5; 17 rules and 8 events in `data/regulatory_limits.json`) with a current-state matrix is in Section 5; the brief's "Dey gateway closure" is evidenced for Dey 1403 (2024-12-26), not Dey 1404.
- **Coverage gap (read first):** the session-wide web-search budget ran out after about 30 searches (mandate: 40+). Fees for most venues are "per search summary"; spreads, depth, KYC levels, OTC terms, business accounts, proof-of-reserves and network fees for most venues are null/UNVERIFIED with `verify_how`.
- **Lawful scale only:** USDT-denominated checkout (blocked by the risk register until counsel approves a screening policy), legal-entity/institutional/OTC terms, higher KYC levels, genuine partner-owned accounts with consent. Never borrowed identities, rented cards or splitting deposits to dodge caps.

## Method and coverage (read first)

| Item | What happened |
|---|---|
| Searches | About 30 web searches in Persian and English (halt and cap, ID-deposit cap, 72 h lock, gateway closure, OFAC/hack/shutdown, fee pages for Nobitex, Wallex, Bitpin, Ramzinex, Tabdeal, AbanTether, price snapshot, API docs). The session-wide WebSearch budget (200, shared with all specialists) was then exhausted. Mandate: at least 40. |
| Fetching | About 40 distinct domains were tried once each: every Iranian exchange, Iranian news, aggregator, Wikipedia and crypto-media/compliance domain returned EGRESS_BLOCKED (not retried); live exchange API hosts returned 403 through the proxy. Reachable: `raw.githubusercontent.com`, `pypi.org`, `pkg.go.dev`, `packagist.org` (and the public GitHub repository-search API, used only to locate documentation/SDK repositories). |
| First-hand evidence | Official Nobitex API docs source (GitHub `nobitex/docs-api`, files `source/includes/_*.md` on branch master) [S24]; Exir Slate docs [S25]; SDK source from PyPI/pkg.go.dev for Tabdeal (official), Bitpin, Wallex, Bit24, AbanTether. |
| Search-summary evidence | Everything about fees, caps, policy and prices. Summaries are produced by a tool; the page itself was not seen. `confidence` fields already reflect that; conflicts are listed. |
| Cross-specialist evidence | Files `data/sanctions_timeline.json` (05) and `data/gateways.json` (03) were read to cross-check facts. They corrected one of my own findings (Aban Tether is designated) and supplied Paya cycle times. They are cited as "file 05/03" and were not re-verified by 02. |
| Known blind spots | P2P/OTC (no searches), spreads and depth, KYC levels, business accounts, network fees outside Nobitex/Ramzinex, proof-of-reserves, anything after the dates of the summaries (e.g. further OFAC actions after 2026-09-17), 2026 status of Exir/OMPFinex/Tetherland/Excoino/Arzinja. |
| Re-run plan | When the budget is raised: (1) one search per venue "NAME کارمزد برداشت تتر TRC20 BEP20 ۱۴۰۵" (one per venue); (2) "حساب حقوقی صرافی رمزارز سقف واریز"; (3) "OTC تتر صرافی حداقل مبلغ"; (4) "برداشت ریالی صرافی چرخه پایا ۱۴۰۵"; (5) "واریز شناسه‌دار سقف هر کد ملی همه صرافی‌ها"; (6) OFAC Recent Actions after 2026-09-17; (7) exchange Telegram channels for the halt extension. |

## Facts table

| id | fact | value | unit | as_of | confidence | source ids |
|---|---|---|---|---|---|---|
| F01 | CBI-ordered nightly USDT trading halt | 21:00-09:00 IRST; 2026-09-30 21:00 to 2026-10-04 21:00 | time window | 2026-10-02 | high | [S1, S2, S26, S3] |
| F02 | USDT buy cap during that regime | 2,000 per user per day (per exchange assumed) | USDT | 2026-10-02 | medium | [S4, S27, S3] |
| F03 | ID-based Rial deposit cap | 25,000,000 | IRT per 24 h per Sheba/ID | 2026-10-02 | medium | [S5, S6, S7, S8, S28] |
| F04 | Crypto withdrawal lock after Rial deposit | 72 | hours | 2026-10-02 | medium | [S9, S10, S11, S12] |
| F05 | Nobitex taker fee, USDT/IRT, base tier | 0.25 (alt 0.20, 0.35) | pct | 2026-10-02 | medium | [S29, S30, S31] |
| F06 | Nobitex fees on USDT-quoted pairs, base tier | maker 0.10 / taker 0.13 (VIP4: 0.07 / 0.10) | pct | 2026-10-02 | medium | [S29, S32] |
| F07 | Wallex Toman-market fee, level 1 | 0.35 (alt 0.20) | pct | 2026-10-02 | low | [S33, S34, S30] |
| F08 | Bitpin base fee | maker 0.20 / taker 0.25 (alt 0.32) | pct | 2026-10-02 | low | [S30, S35] |
| F09 | Ramzinex Toman-market fee, level 1 | maker 0.20 / taker 0.25 | pct | 2026-10-02 | low | [S30, S36] |
| F10 | Tabdeal fee, level 1 (30-day volume below 1,000 USDT) | maker 0.33 / taker 0.35 | pct | 2026-10-02 | low | [S28, S37] |
| F11 | AbanTether explicit fee on USDT buy | 0 to 0.3 (conflicting; spread-embedded) | pct | 2026-10-02 | low | [S30, S35, S38] |
| F12 | USDT withdrawal fee, TRC20, Nobitex | about 1.0 (secondary) | USDT | 2026-10-02 | low | [S39] |
| F13 | USDT withdrawal fee, Ramzinex | TRC20 about 3.5; TON about 0.8 | USDT | 2026-10-02 | low | [S40, S36] |
| F14 | Nobitex minimum order | 3,000,000 Rial (300,000 IRT) in Rial markets; 11 USDT in USDT markets | Rial / USDT | 2026-10-02 | high | [S22, S41] |
| F15 | Nobitex withdrawal count cap | 3 Rial + 10 crypto per 24 h | count | 2026-10-02 | high | [S42] |
| F16 | Nobitex per-Sheba Rial transfer cap | 2,000,000,000 Rial (200M IRT) | Rial | 2026-10-02 | high | [S42] |
| F17 | Nobitex public order book | `GET https://apiv2.nobitex.ir/v3/orderbook/USDTIRT`, 300 req/min, prices in Rial | endpoint | 2026-10-02 | high | [S20, S22] |
| F18 | Nobitex WebSocket | `wss://ws.nobitex.ir/connection/websocket`, Centrifugo, max 100 conn/IP, 450 channels/conn | endpoint | 2026-10-02 | high | [S43] |
| F19 | Nobitex other limits | stats 20/min, trades 60/min, orders 300 per 10 min (shared), withdraw 10 per 3 min, confirm 30/h | req | 2026-10-02 | high | [S21, S23, S20] |
| F20 | Nobitex account-security locks | new-device login: 1 h withdrawal block; leaving safe-withdrawal mode: 24 h; emergency-cancel: 72 h | hours | 2026-10-02 | high | [S44, S45, S46] |
| F21 | Bitpin price unit and order book | Toman (symbol USDT_IRT); `GET https://api.bitpin.ir/api/v1/mth/orderbook/USDT_IRT/` | endpoint | 2026-10-02 | medium | [S47, S48] |
| F22 | Wallex order book | `GET https://api.wallex.ir/v1/depth?symbol=USDTTMN`, Toman | endpoint | 2026-10-02 | medium | [S49, S50] |
| F23 | Tabdeal order book | `GET https://api1.tabdeal.org/r/api/v1/depth?symbol=USDT_IRT` (version segment assumed) | endpoint | 2026-10-02 | medium | [S51] |
| F24 | USDT/IRT quotes on 10 Mehr 1405 | Wallex 255,709; Nobitex 256,500; median of all venues 257,820; min 250,000; max 269,509 | IRT per USDT | 2026-10-02 | medium | [S52] |
| F25 | OFAC designation of four exchanges | Nobitex, Wallex, Bitpin, Ramzinex on 2026-06-02; Nobitex >50 % of 2025 Iranian inflows; four = about USD 7.7bn | event | 2026-10-02 | high | [S13, S14, S15, S53] |
| F26 | OFAC designation of Aban Tether | 2026-08-07 (via file 05) | event | 2026-10-02 | medium | [S16, S17, S54] |
| F27 | Nobitex hack | 2025-06-18; about USD 90M (81-100M) burned | USD | 2026-10-02 | high | [S55, S56, S57, S58] |
| F28 | Tether freezes of Iran-linked USDT in 2026 | about 550 | USD million | 2026-10-02 | medium | [S18, S19, S59] |
| F29 | Exchange payment gateways blocked by CBI | from 6 Dey 1403 (2024-12-26) | date | 2026-10-02 | medium | [S60, S61, S62, S63] |
| F30 | Nobitex Level-2 crypto withdrawal limit | 200M IRT/day (docs sample 2,000,000,000 Rial; monthly total sample 3B IRT) | IRT | 2026-10-02 | low | [S64, S39] |
| F31 | Tabdeal deposit/withdraw minimums | deposit 150,000 IRT; Rial withdrawal 50,000 IRT; deposit max 25M IRT/day | IRT | 2026-10-02 | medium | [S28] |
| F32 | Paya settlement cycles (file 03) | 03:45, 09:45, 12:45, 18:45 IRST; one cycle on holidays | time | 2026-10-02 | low | [S65] |
| F33 | Reference rate used in this document | 257,000 | IRT per USDT | 2026-10-02 | medium | [S52, S39] |
| F34 | Nominal 25M IRT cap in USDT at 257,000 | 97.3 | USDT | 2026-10-02 | derived | `02_conversion_cost.py` |
| F35 | Cost to credit 100 USDT at a provider (Nobitex-style costs) | 26,047,915 | IRT | 2026-10-02 | derived (assumption-based) | `02_conversion_cost.py` |
| F36 | Near-total internet shutdown; Nobitex kept operating | late Feb 2026 | event | 2026-10-02 | medium | [S66, S67] |
| F37 | CBI ban on exchanges using users' Rial balances | in force, date unknown | rule | 2026-10-02 | low | [S68] |

## Data files delivered

| File | Content | Notes |
|---|---|---|
| `data/exchanges.json` | 18 venues with uniform schema (status, ofac_designated, ownership, security incidents, proof of reserves, fees, levels, deposit, withdraw incl. network fees and locks, trading hours, api, otc, business accounts, `conversion_model`, `risk_label`, `restriction_note`), plus `price_feed`, `network_economics`, `otc_p2p`, `assumptions`, `sim_defaults`, `conversion_cost_table`, `treasury_worked_table` | unknown = `null` + `UNVERIFIED` + `verify_how`; spreads and benchmark fees are flagged `ASSUMPTION` |
| `data/regulatory_limits.json` | `rules` (17), `events` (8), `current_state` (8 controls) | the brief's `status: active/expired/temporary` is stored as `rule_status` because the validator reserves `status` for evidence status (verified/reported/UNVERIFIED/conflicting); each rule is itself a Record (`value`, `as_of`, `confidence`, `sources`) |
| `scripts/research/02_build_data.py` | single place for facts, assumptions, source registry | re-run monthly |
| `scripts/research/02_conversion_cost.py` | conversion-cost and treasury tables (reads the JSON; `--write` embeds them) | `--section NAME` prints one table |
| `scripts/research/02_render_doc.py`, `02_doc_template.md` | renders this document | numbered sources are generated from the registry |

## Details

### 1. Exchange landscape (18 venues; status in 2026)

Tier A = deepest liquidity historically (all four SDN-designated in June 2026); B = mid-size with some documentation; C = thin or no evidence. "SDN" = OFAC-designated per the sources above and file 05. Absence from the designation lists is not proof of safety (OFAC FAQ 1257, via file 05: any digital-asset exchange operating in Iran's financial sector is designable) [S54].

| Venue | Tier | 2026 evidence of operation | SDN | Fee evidence | Withdrawal-fee evidence | API evidence |
|---|---|---|---|---|---|---|
| Nobitex (نوبیتکس) | A | operated through the Feb-2026 shutdown; designated Jun 2026 [S66, S13] | yes (2026-06-02) | 0.25 % taker base (conflict) | about 1.0 TRC20 / 0.8 BEP20 (secondary) | official docs, read directly (high) |
| Wallex (والکس) | A | designated Jun 2026 [S13] | yes | 0.35 % (alt 0.20) | none | SDK source (medium) |
| Bitpin (بیت‌پین) | A | applied the Mehr halt [S69] | yes | 0.25 / 0.20 | none | SDK README Aug 2026 (medium) |
| Ramzinex (رمزینکس) | A | designated Jun 2026 | yes | 0.25 / 0.20 | TRC20 3.5, TON 0.8 | Postman docs unseen; host publicapi.ramzinex.com |
| Tabdeal (تبدیل) | B | official SDK/Postman pushed May 2026 [S51, S70] | not named (absence is not proof) | 0.35 / 0.33 | none | official SDK (medium) |
| AbanTether (آبان‌تتر) | B | halt notice 8-12 Mehr [S3]; review Shahrivar 1405 | yes (2026-08-07, via file 05) | explicit 0-0.3 (conflict) | none | org SDK: price lists + OTC orders |
| Bit24 (بیت۲۴) | B | review updated Shahrivar 1405 [S71]; SDK Sep 2026 [S72] | not named | page unseen | none | SDK paths; docs.bit24.cash |
| Exir (اکسیر) | C | none in 2026; named in a CBI ID-deposit-cap notice (undated summary) [S73] | not named | none | none | docs 2022, v0 [S25] |
| OMPFinex | C | indirect (community scanner Aug 2026) | not named | none | none | none |
| Tetherland (تترلند) | C | undated manager interview on the 72 h rule [S10] | not named | none | none | none |
| NovinTether (نوین‌تتر) | C | own 1405 blog [S35] | not named | 0 explicit (spread-embedded) | none | none |
| Excoino (اکسکوینو) | C | none found | not named | none | none | none |
| Arzinja (ارزینجا) | C | none found | not named | none | none | none |
| Arzpaya, Eritron, Rabin Cash | C | listed in a competitor's 1405 fee list [S35] | not named | 0.2 / 0.2+ / 0.2-0.32 | none | none |
| Kifpool, Pingi | C | only as sources for the 72 h rule [S74, S11] | not named | none | none | none |

**Nobitex profile.** Largest Iranian venue (about 11 million users; more than 50 % of Iranian digital-asset inflows in 2025; Wallex about 12 %, Bitpin about 10 %) [S13, S66]. OFAC-designated 2026-06-02 together with three other exchanges and four executives; media describe a Reuters investigation (2026-05-01) of flows for CBI and IRGC [S66]. Hack on 2025-06-18: about USD 90M (range 81-100M by outlet) moved to burn addresses by Predatory Sparrow, source code leaked a day later [S55, S56, S57]. No recovery details or proof-of-reserves page were found (file 05 also lists restoration time as UNVERIFIED). Account model: levels with limits (docs sample for Level 2: 900M Rial/day Rial withdrawal, 2,000M Rial/day crypto, 30,000M Rial/month total) [S64]; API keys with READ/TRADE/WITHDRAW permissions, IP whitelist and Ed25519 signatures (marked experimental in the docs) [S44]; safe-withdrawal whitelist [S45].

**Other venues.** Bitpin: base fee tier below 30M IRT monthly volume; high-volume tiers reported near zero [S30, S35]. Ramzinex: USDT-quoted markets from 0.10 % taker; high tiers reported down to 0.07 % [S36]. Tabdeal: tiers by 30-day USDT volume (L1 below 1,000 USDT 0.35/0.33; L2 1,000-2,000 0.35/0.31; L3 2,000-4,000 0.33/0.28) and a minimum Rial deposit of 150,000 IRT [S28]. AbanTether: instant/OTC-style pricing with the cost sitting in the quote; daily Rial withdrawal up to 2B IRT in separate requests (per summary) [S3]. NovinTether publishes comparison lists in which it appears best; treat as marketing [S35].

### 2. Fees and spreads

All fees are percent of notional on the USDT/IRT (Toman-quoted) market unless stated; tiers depend on 30-day volume. Maker fees are irrelevant for market buys.

| Venue | Taker (used) | Maker | Alternative readings | Adjudication |
|---|---|---|---|---|
| Nobitex | 0.25 | 0.25 (alt 0.13) | 0.20 [S31]; 0.35 [S35]; range 0.25 down to 0.06 over tiers [S29] | 0.25 chosen: two of three independent summaries; the 0.10/0.13 tier table is for USDT-quoted pairs, not USDT/IRT |
| Wallex | 0.35 | 0.35 | 0.20 at level 1 volume 0-20,000 USD [S30] (probably the USDT-base market) | conservative 0.35; low 0.20 in sensitivity |
| Bitpin | 0.25 | 0.20 | 0.32 [S35] | 0.25 |
| Ramzinex | 0.25 | 0.20 | one summary reverses maker/taker | 0.25 (taker >= maker is the normal structure) |
| Tabdeal | 0.35 | 0.33 | "USDT pairs fixed 0.2" (likely USDT-quoted markets) | 0.35 |
| AbanTether | 0.0 explicit | n/a | 0.2 [S35]; about 0.3 [S38] | treated as spread-based; model 0.20 fee plus 0.25 spread |
| NovinTether | 0.0 explicit | n/a | spread-embedded | model spread 0.35 |
| Arzpaya / Eritron / Rabin Cash | 0.2 / 0.2+ / 0.2-0.32 | n/a | competitor list only | low confidence |

**Spread and depth: no evidence.** Only point observations exist: on 10 Mehr 1405 Nobitex showed sell 256,500 and buy 256,499 [S52]; another snapshot of the Nobitex price page showed last 262,510 and best buy 263,004 [S75] (different time). The model therefore uses assumed half-spreads of 0.03/0.10/0.30 % (low/base/high) for tier A, 0.15 % for Tabdeal and 0.25-0.35 % for OTC-style venues, all flagged `ASSUMPTION` in `data/exchanges.json`. `verify_how`: sample the order book of each venue every 10 s for 24 h and compute the cost of a 2,000 USDT market buy.

### 3. Rial deposit rails and caps (Toman to exchange)

- **ID-based deposit (واریز شناسه‌دار)**: a bank transfer carrying a per-user payment ID (general description, not taken from a fetched page). Nobitex lists the endpoint `users/payments/ids-list` under "واریز شتابی" [S44]. Cap **25,000,000 IRT per 24 h** per payer Sheba (instruction text) or national ID (headlines); excess is returned to the payer, only 25M is credited [S6, S73, S8]. One search summary of the ID-cap articles dates the cut to Saturday 17 Shahrivar 1403 (2024-09-07) [S5, S7, S6]; the previous cap is UNVERIFIED (another summary says 50M but dates a 50M-to-25M cut to Azar 1401, see C1). A Tabdeal commissions page (undated in the summary) still quotes "max daily deposit 25M by CBI" [S28]. Whether the cap is per exchange or global is UNVERIFIED.
- **Gateways (درگاه شاپرکی)**: blocked for exchanges from 6 Dey 1403 (2024-12-26); partial conditional reopening in Jan 2025 (ten data items to Shaparak; a few small/medium exchanges); later "blocked again" headline (undated); Wallex said its Rial deposits are direct bank-network transfers [S60, S61, S62, S76, S77]. File 03 found a pattern of recurring cuts but no confirmed Dey-1404/1405 event [S65]. Current per-exchange status is UNVERIFIED.
- **Timing**: Paya cycles 03:45, 09:45, 12:45, 18:45 IRST (changed 2025-07-10 per file 03), single cycle on holidays; Satna cut-off about 14:30 (13:30 on Thursdays); Friday is the weekend [S65]. Analysis (not sourced): combined with the 21:00 trading halt, a deposit that only credits at the 18:45 Paya cycle leaves little or no trading time before 21:00 and waits for 09:00.
- **Daily USDT buy cap (regime)**: 2,000 USDT is 514M IRT at 257,000, far above the 25M ID cap, so it binds only if Rial balance already sits at the exchange.
- **Business/legal-entity accounts and higher KYC levels**: UNVERIFIED for every venue (`business_accounts` is null with `verify_how`). This is the main lawful capacity question for the owner.

### 4. Withdrawals: Rial, crypto, networks, whitelisting, locks

- **Rial withdrawal (Nobitex, official docs)**: `POST /cobank/withdraw`; at most 3 Rial and 10 crypto withdrawals per 24 h; per-destination-Sheba cap 2,000,000,000 Rial (200M IRT); cancellable only while status is New and within 3 minutes; settlement records of type normal/Paya/Satna [S42]. Docs samples show a flat fee of 4,000 IRT and a minimum of 15,000 IRT (may be stale; live values in `GET /v2/options`) [S41].
- **Crypto withdrawal**: `POST /users/wallets/withdraw` (10 per 3 min) then `.../withdraw-confirm` (30/h) unless the address is whitelisted; network code selects the chain; errors include `AmountTooLow`, `AmountTooHigh`, `WithdrawAmountLimitation`, `WithdrawLimitReached`, `NotWhitelistedTargetAddress` [S23]. Network codes in the docs include ETH, BSC, TRX, TON, SOL, MATIC, ARB (which of them carry USDT is in `/v2/options`) [S78].
- **Fees per network**: Nobitex TRC20 about 1.0 and BEP20 about 0.8 USDT (secondary, first-pass doc); Ramzinex TRC20 about 3.5 and TON about 0.8 USDT (per summary). If both low-confidence figures hold, the same network costs 3.5x more at one venue than at another, which would make venue and network choice the largest controllable cost [S39, S40, S36]; verify live.
- **Whitelisting**: Nobitex address book plus "safe withdrawal mode"; whitelisted destinations need no OTP, so API sweeps are automatable; switching the mode off blocks withdrawals for 24 h; new-device login blocks withdrawals for 1 h; the emergency-cancel link blocks new withdrawals for 72 h (unrelated to the FATA lock) [S45, S44, S46].
- **Level caps**: Level 2 about 200M IRT/day crypto (about 778 USDT/day) and about 3B IRT/month total (about 11,673 USDT/month); Level 3 about 1B IRT/day (about 3,891 USDT/day): low confidence (docs sample plus first-pass) [S64, S39].
- **72 h lock**: after a Rial deposit the funded value cannot be withdrawn as crypto for 72 h. Sources disagree on mode: most say the equivalent of each deposit becomes withdrawable 72 h after that deposit; one says the lock follows the first Rial deposit only [S11, S10, S9]. The rule existed by 21 Shahrivar 1402 (2023-09-12) [S12] and is cited by Bit24, Kifpool and Pingi pages. Exceptions (higher KYC, legal entities, on-chain-deposited crypto) are UNVERIFIED; plan with no exceptions.

### 5. Policy timeline 2022 to 2026 and current state

| Date | Issuer | Rule or event | Scope / enforcement | Durability | Conf. | Sources |
|---|---|---|---|---|---|---|
| 2022-12 (Azar 1401) | CBI | per-platform daily cap cut 50M to 25M IRT (single summary; conflicts with next rows) | per platform | unknown | low | [S79] |
| undated | CBI | notices: deposit/withdraw limited to 100M IRT/day per user | exchanges' user notices | unknown | low | [S79] |
| by 2023-09-12 | FATA (Police) | 72 h settlement lock | per user, exchange-implemented | high (still cited 2026) | medium | [S12, S9, S10] |
| 2024-09-07 | Shaparak/CBI | ID-deposit cap cut to 25M IRT per 24 h per Sheba/ID (previous cap UNVERIFIED) | bank returns excess | high | medium | [S5, S6, S7] |
| 2024-10 | CBI | Shaparak Rial-to-crypto restriction; broader deposit/withdraw ban late Oct | after missile attack on Israel | unknown | low | [S80] |
| 2024-11 | CBI | payment services suspended (USDT speculation) | PSPs | unknown | low | [S80] |
| 2024-12 | CBI, Finance Ministry, Cyberspace Council | crypto policy and regulatory framework; CBI sole authority (Feb 2025) | whole sector | medium | low | [S80, S81] |
| 2024-12-26 | CBI/Shaparak | exchange payment gateways blocked | Shaparak gateways | partially reversed Jan 2025 | medium | [S60, S61, S63] |
| 2025-01 | CBI | reopening conditional on ten data items | large exchanges refused at first | unknown | low | [S82, S62] |
| 2025-02 | Authorities | crypto advertising ban | marketing | unknown | low | [S80] |
| 2025-06-18 | event | Nobitex hack, about USD 90M burned | one venue | n/a | high | [S55, S56] |
| undated | CBI | exchanges may not invest users' Rial balances | exchanges | unknown | low | [S68] |
| 2026-01-30 | OFAC (file 05) | first designations of exchanges (Zedcex, Zedxion; UK-registered) | foreign entities | high | medium | [S16] |
| late Feb 2026 | event | near-total internet shutdown; Nobitex kept operating | national | n/a | medium | [S66, S67] |
| 2026-04 and 2026-07-16 | Tether + OFAC (file 05) | CBI USDT wallets frozen: >344M (2 wallets), >131M (4 wallets) | issuer freeze | n/a | medium | [S16, S18] |
| 2026-06-02 | OFAC | Nobitex, Wallex, Bitpin, Ramzinex designated | SDN, secondary exposure | high | high | [S13, S14, S15] |
| 2026-08-07 | OFAC (file 05) | Aban Tether and Shelbit Exchange designated | SDN | high | medium | [S16, S17] |
| 2026-09-17 | OFAC (file 05) | BitBank designated | SDN | high | low | [S16] |
| 2026-09-30 21:00 | CBI via exchanges | nightly halt 21:00-09:00 + 2,000 USDT/user/day buy cap until 2026-10-04 21:00 | all USDT trading | low (temporary) | high / medium | [S1, S2, S3] |

**Last 90 days (2026-07-04 to 2026-10-02):** CBI wallet freeze of >131M on 2026-07-16; Aban Tether designation 2026-08-07; BitBank 2026-09-17; Tether/Senate disclosure of the USD 550M total on 2026-09-28; the halt and buy cap from 2026-09-30; the 25M ID cap and the 72 h lock are still described as in force by the first-pass doc of 2026-10-02 and by undated exchange pages; no gateway event inside the window was found. The brief's "Dey gateway closure" is evidenced for Dey 1403 (2024-12-26) only.

**Current-state matrix (2026-10-02)**

| Control | State | Valid until | Confidence | Note |
|---|---|---|---|---|
| Nightly halt 21:00-09:00 | active | 2026-10-04 21:00, extension UNVERIFIED | high | check Telegram/site banners daily |
| 2,000 USDT/user/day buy cap | active | same | medium | per exchange assumed |
| ID deposit cap 25M IRT/24 h | active | open | medium | scope conflict per Sheba vs national ID |
| 72 h withdrawal lock | active | open | medium | per-deposit rolling assumed |
| Rial gateways for exchanges | UNVERIFIED per venue | n/a | low | ID deposit is the dependable path |
| OFAC SDN: seven domestic-market exchanges per file 05 (Nobitex, Wallex, Bitpin, Ramzinex, Aban Tether, Shelbit, BitBank) | active | open | high / medium | files 04 and 05 agree on the 25M cap, the 72 h lock and the designations; Aug and Sep items come from file 05 |
| Tether issuer freezes | active practice | open | medium | OFAC-listed addresses frozen within hours (file 05) |
| Internet reachability | high risk | n/a | medium | design for outage and multi-venue price feeds |

### 6. P2P and OTC options and risks

No searches could be run on this topic; the section is analysis plus what the SDK evidence shows. Numbers (fees, speed, minimum sizes) are null with `verify_how` in `data/exchanges.json` (`otc_p2p`).

- **Exchange-integrated OTC:** AbanTether exposes OTC market/limit order endpoints (`https://api.abantether.com/order_handler/orders/otc/market|limit`) in its organisation-published SDK [S83]; it is now SDN-designated (above), so treat as high risk. Terms at other venues are unknown.
- **Telegram OTC desks (fraud patterns, analysis):** edited bank receipts; a third-party payer whose money is fraud proceeds, after which your account is blocked ("triangular fraud", also noted in the first-pass doc [S39]); Paya/Satna reversals after USDT has been sent; impersonated admins and look-alike channels or bots; look-alike addresses and address poisoning; pay-first schemes.
- **Lawful safe practices:** use only exchange-integrated or registered OTC businesses with verifiable identity; pay only from your own named account to the counterparty's named account and never through third parties; release Toman only against on-chain-confirmed USDT in your whitelisted wallet and release USDT only after the money is visible in your own bank app; start with a small test; keep contracts and statements for the accountant; never use borrowed or rented accounts or cards and never split payments to evade caps.
- **Exchange P2P markets:** none found; `verify_how`: look for a P2P/escrow tab in each exchange app.
- **Sanctions angle:** OTC USDT of unknown origin may have passed through SDN venues; file 05 and the risk register require address screening and counsel-approved policies before any such flow.

### 7. Network economics for provider deposits

The owner never pays on-chain fees directly when withdrawing from an exchange: the exchange charges a flat USDT fee. On-chain mechanics matter for (a) sweeping customer USDT payments to the treasury, (b) understanding why reported withdrawal fees differ so much between venues (about 1.0 vs 3.5 USDT on TRC20, if both figures hold). Everything in the mechanism column below is **background knowledge, not verified this session**, except where a source is cited.

| Network | Mechanism and cost class | Typical credit time | Exchange fee evidence | Notes |
|---|---|---|---|---|
| TRC20 (TRON) | USDT transfer burns energy (about 65,000 units to an existing holder, about 130,000 to a new holder; both recalled, also flagged unverified in file 03) plus bandwidth; cost in TRX = energy x price(sun) / 1e6; current price must come from `GET /wallet/getenergyprices` | about 1 min | Nobitex about 1.0; Ramzinex about 3.5 | provider default if supported; fee varies 3.5x by venue |
| BEP20 (BNB Smart Chain) | gas in BNB, cents | seconds to a minute | Nobitex about 0.8 | provider-supported per first-pass doc (mpay: TRC20 + BEP20) |
| TON | jetton transfer, fractions of a TON | seconds | Ramzinex about 0.8 [S40] | confirm provider support |
| Polygon, Arbitrum, Solana | cents or less; Solana needs rent for the recipient token account | seconds to minutes | unknown | check provider and exchange support |
| ERC20 | gas-price dependent, often dollars | minutes | unknown | avoid unless the provider demands it |

- **Default and fallback:** default = cheapest network that the provider accepts and the exchange supports, chosen from the live fee table; first-pass doc says mpay accepts TRC20 and BEP20 [S39]. Fallback = a second network on the same provider so a TRON congestion or exchange-network suspension (`WithdrawCurrencyUnavailable`, `<Coin>WithdrawDisabled` errors in Nobitex docs) does not stop fulfilment [S23].
- **Minimum-deposit traps:** provider minimum deposits and crediting thresholds are not known here (card-providers specialist); never send the first transfer without a small test; deposits below the minimum can be lost or need manual recovery.
- **Wrong-network traps:** BEP20, ERC20, Polygon and Arbitrum share the 0x address format; TRON uses `T...` addresses. Always select the network the provider shows next to the address.
- **Address poisoning:** look-alike dust transfers aim to make you copy a wrong address from history. Mitigation: address book/whitelist (Nobitex safe-withdrawal mode), full-address comparison, never copy from transaction history, two-person approval for new addresses (also in the risk register controls) [S45].
- **Issuer risk:** Tether can freeze addresses; about USD 550M of Iran-linked USDT was frozen in 2026 [S18, S19].

### 8. Quantified conversion cost (Python)

Script: `scripts/research/02_conversion_cost.py` reads `data/exchanges.json`. Formula (Q = USDT that must arrive at the provider, w = flat withdrawal fee in USDT, s = ask premium over mid, f = taker fee, R = reference mid):

```
qty_bought  = Q + w
total_irt   = ceil( qty_bought * R * (1 + s) * (1 + f) )      # our cost: round up
premium_pct = (total_irt / (Q * R) - 1) * 100
```

Inputs: R = 257,000 IRT/USDT; taker fees from Section 2; withdrawal fees only where sourced (Nobitex TRC20 1.0, BEP20 0.8; Ramzinex TRC20 3.5, TON 0.8), otherwise the benchmark base of 2.0 USDT (range 1.0-3.5), flagged `*`; spreads are assumptions. SDN = OFAC-designated per Section 5.

**Reference mid R = 257,000 IRT/USDT; spreads are assumptions; \* = withdrawal fee is the BENCHMARK (unknown for that venue); SDN = OFAC-designated venue.**

| Exchange | SDN | Net | w (USDT) | taker % | spread % (assumed) | $25 | $100 | $500 | $2000 |
|---|---|---|--:|--:|--:|--:|--:|--:|--:|
| nobitex | SDN | TRC20 | 1.0 | 0.25 | 0.1 | 4.36% (268,216) | 1.35% (260,479) | 0.55% (258,416) | 0.40% (258,029) |
| nobitex | SDN | BEP20 | 0.8 | 0.25 | 0.1 | 3.56% (266,153) | 1.15% (259,963) | 0.51% (258,313) | 0.39% (258,003) |
| wallex | SDN | TRC20 | 2.0\* | 0.35 | 0.1 | 8.49% (278,810) | 2.46% (263,321) | 0.85% (259,190) | 0.55% (258,416) |
| bitpin | SDN | TRC20 | 2.0\* | 0.25 | 0.1 | 8.38% (278,532) | 2.36% (263,058) | 0.75% (258,932) | 0.45% (258,158) |
| ramzinex | SDN | TRC20 | 3.5 | 0.25 | 0.1 | 14.40% (294,006) | 3.86% (266,927) | 1.05% (259,705) | 0.53% (258,351) |
| ramzinex | SDN | TON | 0.8 | 0.25 | 0.1 | 3.56% (266,153) | 1.15% (259,963) | 0.51% (258,313) | 0.39% (258,003) |
| tabdeal | - | TRC20 | 2.0\* | 0.35 | 0.15 | 8.54% (278,949) | 2.51% (263,452) | 0.90% (259,319) | 0.60% (258,545) |
| abantether | SDN | TRC20 | 2.0\* | 0.2 | 0.25 | 8.49% (278,810) | 2.46% (263,321) | 0.85% (259,190) | 0.55% (258,416) |
| novintether | - | TRC20 | 2.0\* | 0.0 | 0.35 | 8.38% (278,531) | 2.36% (263,057) | 0.75% (258,931) | 0.45% (258,157) |
| arzpaya | - | TRC20 | 2.0\* | 0.2 | 0.35 | 8.59% (279,089) | 2.56% (263,584) | 0.95% (259,449) | 0.65% (258,674) |
| eritron | - | TRC20 | 2.0\* | 0.2 | 0.35 | 8.59% (279,089) | 2.56% (263,584) | 0.95% (259,449) | 0.65% (258,674) |
| rabincash | - | TRC20 | 2.0\* | 0.26 | 0.35 | 8.66% (279,256) | 2.62% (263,741) | 1.01% (259,604) | 0.71% (258,829) |

Cell format: all-in premium over mid % (effective IRT paid per USDT credited).

Decomposition for a $100 credit on TRC20:

| Exchange | withdrawal fee % | spread % | trading fee % | total premium % | Toman for 100 USDT | ID-deposit days at 25M cap |
|---|--:|--:|--:|--:|--:|--:|
| nobitex | 1.00 | 0.10 | 0.25 | 1.35 | 26,047,915 | 2 |
| wallex | 2.00 | 0.10 | 0.36 | 2.46 | 26,332,055 | 2 |
| bitpin | 2.00 | 0.10 | 0.26 | 2.36 | 26,305,815 | 2 |
| ramzinex | 3.50 | 0.10 | 0.26 | 3.86 | 26,692,665 | 2 |
| tabdeal | 2.00 | 0.15 | 0.36 | 2.51 | 26,345,208 | 2 |
| abantether | 2.00 | 0.26 | 0.20 | 2.46 | 26,332,095 | 2 |
| novintether | 2.00 | 0.36 | 0.00 | 2.36 | 26,305,749 | 2 |
| arzpaya | 2.00 | 0.36 | 0.20 | 2.56 | 26,358,361 | 2 |
| eritron | 2.00 | 0.36 | 0.20 | 2.56 | 26,358,361 | 2 |
| rabincash | 2.00 | 0.36 | 0.27 | 2.62 | 26,374,144 | 2 |

Sensitivity (low/base/high assumption sets):

| Exchange | Q | low | base | high | wd fee is benchmark? |
|---|--:|--:|--:|--:|---|
| nobitex | 100 | 1.232 | 1.354 | 1.658 | no |
| nobitex | 500 | 0.431 | 0.551 | 0.852 | no |
| wallex | 100 | 1.232 | 2.459 | 4.174 | yes |
| wallex | 500 | 0.431 | 0.852 | 1.356 | yes |
| bitpin | 100 | 1.232 | 2.357 | 4.143 | yes |
| bitpin | 500 | 0.431 | 0.752 | 1.325 | yes |
| ramzinex | 100 | 3.738 | 3.863 | 4.07 | no |
| ramzinex | 500 | 0.932 | 1.053 | 1.255 | no |
| tabdeal | 100 | 1.253 | 2.511 | 4.278 | yes |
| tabdeal | 500 | 0.451 | 0.903 | 1.457 | yes |
| abantether | 100 | 1.101 | 2.46 | 4.433 | yes |
| abantether | 500 | 0.3 | 0.852 | 1.608 | yes |
| novintether | 100 | 1.152 | 2.357 | 4.328 | yes |
| novintether | 500 | 0.35 | 0.751 | 1.506 | yes |
| arzpaya | 100 | 1.354 | 2.562 | 4.537 | yes |
| arzpaya | 500 | 0.551 | 0.953 | 1.709 | yes |
| eritron | 100 | 1.354 | 2.562 | 4.641 | yes |
| eritron | 500 | 0.551 | 0.953 | 1.81 | yes |
| rabincash | 100 | 1.354 | 2.623 | 4.662 | yes |
| rabincash | 500 | 0.551 | 1.013 | 1.83 | yes |

Benchmark grid (taker 0.25 %, spread 0.10 %), premium % by withdrawal fee and ticket size:

| w (USDT) | $25 | $100 | $500 | $2000 |
|--:|--:|--:|--:|--:|
| 0.8 | 3.56 | 1.15 | 0.51 | 0.39 |
| 1.0 | 4.36 | 1.35 | 0.55 | 0.4 |
| 2.0 | 8.38 | 2.36 | 0.75 | 0.45 |
| 3.5 | 14.4 | 3.86 | 1.05 | 0.53 |

Batching: premium % when k orders share one withdrawal:

| w (USDT) | order $ | k=1 | k=5 | k=10 | k=20 |
|--:|--:|--:|--:|--:|--:|
| 0.8 | 25 | 3.56 | 0.99 | 0.67 | 0.51 |
| 0.8 | 100 | 1.15 | 0.51 | 0.43 | 0.39 |
| 1.0 | 25 | 4.36 | 1.15 | 0.75 | 0.55 |
| 1.0 | 100 | 1.35 | 0.55 | 0.45 | 0.4 |
| 2.0 | 25 | 8.38 | 1.96 | 1.15 | 0.75 |
| 2.0 | 100 | 2.36 | 0.75 | 0.55 | 0.45 |
| 3.5 | 25 | 14.4 | 3.16 | 1.76 | 1.05 |
| 3.5 | 100 | 3.86 | 1.05 | 0.7 | 0.53 |

**Findings.**
1. Below about $100 the withdrawal fee dominates; at $25 and 1 USDT it is 4.0 % of the ticket versus 0.35 % for fees plus spread. Batch to at least `w / 0.005` USDT per sweep (200 USDT at w = 1, 700 USDT at w = 3.5) to keep the fee share at or below 0.5 %.
2. Choosing the cheaper network matters more than choosing the cheaper exchange: Ramzinex TON (0.8) beats Ramzinex TRC20 (3.5) by 10.8 points at $25.
3. Differences between tier-A venues in trading fee (0.25 vs 0.35 %) are smaller than the spread and withdrawal-fee uncertainties; measure before choosing.
4. At $2,000 the all-in premium is about 0.4-0.7 % at every venue, so large tickets are cheap per dollar but run into the deposit cap (below).
5. The 72 h lock adds price risk that is not in these rows; the buffer for it is below.

72 h lock price-risk buffer (z = 1.64; sigma values are placeholders until the macro specialist supplies realised volatility):

| regime | sigma_d % (placeholder) | buffer % = 1.64 x sigma x sqrt(3) |
|---|--:|--:|
| calm | 0.5 | 1.42 |
| base | 1.0 | 2.84 |
| stress | 2.0 | 5.68 |

How many ID-deposit allowance-days each ticket needs (Nobitex-style costs):

| Q (USDT credited) | Toman needed (Nobitex-style costs, TRC20, w=1.0) | cap-days (one allowance) |
|--:|--:|--:|
| 25 | 6,705,404 | 1 |
| 100 | 26,047,915 | 2 |
| 500 | 129,207,972 | 6 |
| 2000 | 516,058,186 | 21 |

### 9. Price-feed design inputs

| Venue | Public depth endpoint | Unit | Rate limit / stream | Evidence |
|---|---|---|---|---|
| Nobitex | `GET https://apiv2.nobitex.ir/v3/orderbook/USDTIRT` (also `/v3/orderbook/all`, `/v2/depth/USDTIRT`, `/v2/trades/USDTIRT`, `/market/stats?srcCurrency=usdt&dstCurrency=rls`, `/v2/options`) | Rial (divide by 10) | 300/min (orderbook, depth), 60/min trades, 20/min stats; WS `wss://ws.nobitex.ir/connection/websocket` channel `public:orderbook-USDTIRT` | official docs [S20, S43, S22] |
| Wallex | `GET https://api.wallex.ir/v1/depth?symbol=USDTTMN` | Toman | UNVERIFIED; socket.io `https://api.wallex.ir/socket.io`; header `x-api-key` | unofficial SDK [S49, S50] |
| Bitpin | `GET https://api.bitpin.ir/api/v1/mth/orderbook/USDT_IRT/` (alt hosts api.bitpin.org, api.bitpin.market) | Toman (symbol says IRT) | 429 retry; WS `wss://centrifugo.bitpin.ir/connection/websocket` prefix `orderbook:` | unofficial SDK README Aug 2026 [S47] |
| Tabdeal | `GET https://api1.tabdeal.org/r/api/v1/depth?symbol=USDT_IRT` | UNVERIFIED | UNVERIFIED; WS `wss://api1.tabdeal.org/stream/` | official SDK source [S51] |
| Exir | `GET https://api.exir.io/v0/orderbooks?symbol=usdt-irt` | UNVERIFIED | socket.io `https://api.exir.io/realtime` | docs of 2022, may be stale [S25] |
| Bit24 | `GET https://rest.bit24.cash/pro/capi/v1/markets/orderbooks` | UNVERIFIED | UNVERIFIED | unofficial SDK [S72] |
| AbanTether | `https://mono.abantether.com/coins/price` (price list, no depth) | UNVERIFIED | UNVERIFIED | org SDK [S83] |
| Ramzinex | host `https://publicapi.ramzinex.com` (paths UNVERIFIED) | UNVERIFIED | UNVERIFIED | PHP SDK page [S84] |
| Aggregators (Bon-Bast, AlanChand, TGJU) | no documented API found | n/a | n/a | use only as secondary anomaly detector |

Design inputs (parameters are assumptions unless cited):
- **Cadence:** Nobitex caches under 1 s; docs say poll every 1-10 s and use WebSocket where possible; use a shared reader for all threads [S20]. Default 5 s REST, stale after 60 s, then the architecture's kill switch.
- **Unit normalisation is mandatory:** Nobitex Rial, Bitpin and Wallex Toman; a 10x error would be catastrophic. Add a startup check comparing each venue to the median and failing closed when the ratio is near 10.
- **Executable ask:** cheapest ask among venues that are open, reachable, not blocked by policy (SDN/disallowed per file 05) and have remaining buy cap; otherwise last known ask times (1 + haltPremium).
- **Dispersion:** snapshot of 10 Mehr 1405: Wallex 255,709; Nobitex 256,500; median 257,820; min 250,000; max 269,509 [S52]. Relative to the median: -0.82 % and -0.51 % for the two tier-A venues; -3.04 % to +4.53 % across all venues. Suggested `anomalyPct`: 2 % within tier A, 5 % across all venues (assumptions).
- **Night gap:** the lead's simulator spec assumes that while exchanges are halted 21:00-09:00 the OTC price drifts and the exchange price jumps at the open [S85]; no source on the size was found (TejaratNews ran a piece asking whether the halt affects the dollar price [S86], content not seen). Use a `haltPremiumPct` placeholder of 1 % until the macro specialist calibrates it.
- **Market orders:** always send a limit `price` with market orders (Nobitex fills at the global price within a 1 % band when omitted) [S22].
- **Using SDN venues' public data:** reading public order books is not a transaction, but whether a business may depend on them needs counsel; keep at least one non-SDN venue in the feed.

### 10. Treasury constraints: caps, locks and halts shape the float

Definitions: D = USDT outflow per day to providers; u = share of D funded by customers' own USDT (no conversion; currently blocked by the risk register pending counsel); D_c = D(1 - u); R = rate; pi = bulk premium (0.45 % here: taker 0.25 %, spread 0.10 %, 1 USDT fee over a 1,000 USDT sweep); cap = 25,000,000 IRT per allowance per 24 h; L = lock days (3); g = safety days (2).

```
Toman to deposit per day   B_day = D_c * R * (1 + pi)
Allowances needed per day  N     = ceil(B_day / cap)
Float (USDT)               F     = D_c * (L + g)        # L days sit locked, g days buffer for halts and delays
Seed time                  T     = ceil(F * R / (k * cap)) days with k allowances
Sustainable demand         D_max(k) = k * cap / (R * (1 + pi))
Batch size for fee share e Q_min = w / e
Halt coverage              add D_c * H days of stock for an H-day purchase freeze
```

R=257,000, bulk premium pi=0.45 %, lock L=3 d, safety g=2 d, cap=25,000,000 IRT per allowance per 24 h

| D (USDT/day) | u (USDT-paid) | D_c | Toman/day to deposit | allowances/day | float USDT | float IRT | days to seed float: 1 / 5 / 20 allowances |
|--:|--:|--:|--:|--:|--:|--:|---|
| 100 | 0% | 100 | 25,815,805 | 2 | 500 | 128,500,000 | 6 / 2 / 1 |
| 100 | 30% | 70 | 18,071,064 | 1 | 350 | 89,950,000 | 4 / 1 / 1 |
| 250 | 0% | 250 | 64,539,511 | 3 | 1,250 | 321,250,000 | 13 / 3 / 1 |
| 250 | 30% | 175 | 45,177,658 | 2 | 875 | 224,875,000 | 9 / 2 / 1 |
| 500 | 0% | 500 | 129,079,022 | 6 | 2,500 | 642,500,000 | 26 / 6 / 2 |
| 500 | 30% | 350 | 90,355,316 | 4 | 1,750 | 449,750,000 | 18 / 4 / 1 |
| 1,000 | 0% | 1,000 | 258,158,043 | 11 | 5,000 | 1,285,000,000 | 52 / 11 / 3 |
| 1,000 | 30% | 700 | 180,710,631 | 8 | 3,500 | 899,500,000 | 36 / 8 / 2 |
| 3,000 | 0% | 3,000 | 774,474,129 | 31 | 15,000 | 3,855,000,000 | 155 / 31 / 8 |
| 3,000 | 30% | 2,100 | 542,131,891 | 22 | 10,500 | 2,698,500,000 | 108 / 22 / 6 |
| 10,000 | 0% | 10,000 | 2,581,580,430 | 104 | 50,000 | 12,850,000,000 | 514 / 103 / 26 |
| 10,000 | 30% | 7,000 | 1,807,106,301 | 73 | 35,000 | 8,995,000,000 | 360 / 72 / 18 |

Sustainable conversion demand by number of allowances:

| k allowances | sustainable USDT/day | ~$100 orders/day |
|--:|--:|--:|
| 1 | 96.8 | 0.97 |
| 2 | 193.7 | 1.94 |
| 3 | 290.5 | 2.91 |
| 5 | 484.2 | 4.84 |
| 10 | 968.4 | 9.68 |
| 20 | 1936.8 | 19.37 |
| 50 | 4842.0 | 48.42 |

Nominal 25M IRT cap in USDT as the Rial weakens:

| R (IRT/USDT) | 25M IRT cap in USDT |
|--:|--:|
| 150,000 | 166.7 |
| 200,000 | 125.0 |
| 257,000 | 97.3 |
| 350,000 | 71.4 |
| 500,000 | 50.0 |

**What the table says.**
1. **One allowance sustains about one $100 order per day.** The first-pass target of 30 orders per day needs about 31 allowances and a 15,000 USDT float (3.86B IRT). The first-pass doc's USD 9,300 float is the 3-day lock component alone [S39].
2. **Seeding from Rial deposits alone is impractical:** a 5,000 USDT float takes 52 allowance-days. In the simulator the owner's initial capital should be modelled as USDT (own holdings or an institutional/OTC purchase), not as Rial that must pass the ID cap.
3. **Level caps bind as well:** Level 2 allows about 778 USDT/day of crypto withdrawal; with Nobitex's 10-withdrawal limit the batch size must be at least D/10 per day.
4. **Exposure at venues is structurally 3 days of purchases.** The risk register's control "exchange balance at most 1 day of conversion needs" cannot hold with a per-deposit 72 h lock; propose "at most L + 1 days" and a per-venue cap (file `data/risk_register.json`, controls[3]).
5. **Halts:** during the 21:00-09:00 halt no purchases are possible and ID deposits credited after the 18:45 Paya cycle wait for the morning. Keep stock for the whole night plus H days if a multi-day freeze is plausible.
6. **Cap erodes with depreciation:** the cap is nominal in Toman; at 500,000 IRT/USDT it would be 50 USDT.

**Lawful scale levers (research only, no evasion).**
- Legal-entity accounts, institutional or OTC desks with the business's own KYC (UNVERIFIED availability; ask each non-designated venue in writing).
- Higher KYC levels (Level 3 about 1B IRT/day crypto withdrawal at Nobitex, low confidence).
- Genuine partners with their own funds, written consent and documented contributions; each person's own cap still applies. Do not coordinate several people or accounts to push one pool of money past a cap that is meant to apply in aggregate; get legal advice first.
- Customer-paid USDT with screening (requires counsel approval per the risk register).
- Two-sided netting: file 07 hypothesises that competitors net customers who sell USDT/FX income against customers who need USDT, which would remove exchange spread, fees and the 72 h lock from part of the funding cost [S87]. Hypothesis only; it can look like unlicensed currency exchange, so it needs the legal specialist (04) and the sanctions specialist (05) before any design work.
- Price and queue rationing: minimum ticket, rush premium, scheduled fulfilment when allowances are exhausted.
- Red lines (CLAUDE.md section 3): borrowed or rented identities or cards, fake KYC, splitting payments to dodge caps, hiding origin from providers.

## Implications

**Product and pricing engine**
- Add `ExchangeLimits` inputs: `idDepositCapIrtPer24h = 25,000,000`, `withdrawLockHours = 72` (mode = per-deposit rolling), `haltWindows` (21:00-09:00 IRST with `until`), `dailyBuyCapUsdt` (regime), `cryptoWithdrawalsPer24h = 10` (Nobitex), `rialWithdrawalsPer24h = 3` (Nobitex).
- Funding need must include the amortised withdrawal fee: `networkFeeAllocUsdt = w / batchSize`; show `batchSize` as a policy and refuse sub-minimum tickets or price them with the full fee.
- Volatility buffer must include the lock horizon: z x sigma_d x sqrt(L days) (1.4-5.7 % for sigma 0.5-2 %); add `haltPremiumPct` while a halt is active.
- Rate service: normalise units, drop outliers, exclude disallowed (SDN) venues from the executable ask, fail closed on stale or ratio-near-10 prices.
- Treat Nobitex `GET /v2/options` as the live source for network fees, minimums, level limits and order minimums; use the equivalent market-info endpoints of other venues (Wallex `/v1/markets`, Bitpin `/api/v1/mkt/markets/`, Tabdeal `/r/api/v1/exchangeInfo`) for precision and minimums.

**Simulator (`ExchangeSim`) defaults** (full detail in `data/exchanges.json` and `data/regulatory_limits.json`)
- fees: taker 0.25 % (range 0.20-0.35); spread 0.10 % base (assumption); venue premium vs median within +/-1 % for tier A, -3 %/+4.5 % across all venues; trading hours 24/7 except scenario halts; ID cap 25M IRT/24 h per allowance, credited at Paya cycles; lock 72 h per deposit; buy cap 2,000 USDT/day only in `night_halt` events; withdrawal fees 0.8-3.5 USDT by network/venue; Nobitex count caps; outage events: hack (restoration time unknown), internet shutdown (API unreachable for days), SDN designation (venue becomes disallowed for sourcing), issuer freeze (address balance frozen).
- Event catalogue with dated precedents: night halt 2026-09-30 21:00 to 2026-10-04 21:00 (about 4 days, 8-12 Mehr), ID cap cut 2024-09-07, gateway closure 2024-12-26, hack 2025-06-18, designations 2026-06-02/08-07/09-17, freezes 2026-04 and 2026-07-16.

**Owner decisions**
1. Which venues: all five liquid venues are SDN; decide with counsel and the sanctions specialist; otherwise run the verification checklist on Tabdeal, Bit24, Exir, OMPFinex, Tetherland (fees, withdrawal fees, spreads, levels, business accounts, OTC).
2. Capacity: one allowance supports about one $100 order per day; choose between legal-entity/OTC terms, a USDT-funded float, and rationing by price.
3. Order policy: minimum ticket (about $50-100) and batched sweeps; choose the cheapest accepted network.
4. Float: seed in USDT, size at D x (L + g), cap per venue, and keep hot-wallet balances small.
5. Monitoring: daily check of exchange notices (halt extension), SDN list monthly, venue test withdrawal monthly.

## Conflicts and adjudication

| # | Conflict | Sources | Adjudication | Confidence |
|---|---|---|---|---|
| C1 | When was the 25M cap introduced: Azar 1401 (Dec 2022, cut from 50M) vs 17 Shahrivar 1403 (2024-09-07) | [S79] vs [S5, S6, S7] | 2024-09-07: the date carries its weekday (a Saturday, consistent) and four outlets report the ID-deposit cap cut; the 2022 item is probably a different measure or mis-dated. Both kept in `regulatory_limits.json` | medium |
| C2 | Scope: per payer Sheba vs per national ID; per exchange vs global | [S6, S73] vs [S8] | model per payer ID per exchange (strictest practical reading); test with a 26M deposit | medium |
| C3 | 72 h lock mode: per deposit vs first deposit only | [S11, S10] vs [S9] | per-deposit rolling (conservative) | medium |
| C4 | Nobitex USDT/IRT taker: 0.25 / 0.20 / 0.35 % | [S29, S30] vs [S31] vs [S35] | 0.25 | medium |
| C5 | Wallex level-1 fee 0.35 vs 0.20 % | [S33] vs [S30] | 0.35 conservative (0.20 probably the USDT-base market) | low |
| C6 | Ramzinex maker/taker order | [S30] vs another summary | taker 0.25, maker 0.20 | low |
| C7 | AbanTether fee 0 / 0.2 / 0.3 % | [S30, S35, S38] | spread-based; modelled 0.20 + 0.25 spread | low |
| C8 | Is Aban Tether designated? 02's searches found no designation; file 05 says SDN since 2026-08-07 (verified/high there) | [S16, S17, S54] | adopt file 05; shows that 02's coverage can miss later actions | medium |
| C9 | Share of Iranian activity: 72 % of inflows vs 78 % of attributed volume | [S13] vs [S14] | different metrics (OFAC inflows vs TRM volume); both kept | medium |
| C10 | Hack size USD 81M vs about 90M vs 100M | [S57] vs [S88] vs [S55] | range 81-100M, most reported 90M | high |
| C11 | Price units: Nobitex Rial, Bitpin Toman although symbol says IRT, Wallex Toman | [S22, S47, S50] | normalise per venue | high |
| C12 | "Dey gateway closure": Dey 1403 vs Dey 1404 | [S60] vs [S65] | only Dey 1403 (2024-12-26) is evidenced | medium |
| C13 | Risk-register control "exchange balance at most 1 day of needs" vs 72 h lock | `data/risk_register.json` vs Section 10 | structural minimum is about L days; propose L + 1 | medium |
| C14 | Nobitex API host `apiv2.nobitex.ir` (docs) vs `api.nobitex.ir` (community SDKs) | [S20, S89] | use the docs host | high |

## Open questions

| # | Question | verify_how |
|---|---|---|
| Q1 | 72 h lock: per deposit or per account; exceptions by KYC level, legal entity or on-chain deposits? | Ask support of two non-SDN venues in writing; test with a small deposit and watch the withdrawal screen |
| Q2 | 25M cap: per payer account, national ID, exchange or global? | Deposit 26M IRT by ID transfer and read the credited amount; ask the bank |
| Q3 | Will the halt/cap be extended after 2026-10-04 21:00? | Exchange Telegram channels and banners daily; re-run this brief on 13 Mehr |
| Q4 | Live withdrawal fees and minimums per network per venue | Nobitex `GET /v2/options`; other venues' withdrawal screens |
| Q5 | Spreads and depth at 100/500/2,000 USDT | Sample order books every 10 s for 24 h |
| Q6 | Legal-entity/institutional accounts and caps at each non-SDN venue | Written inquiry; record answers with dates |
| Q7 | OTC desk terms (minimum size, spread, settlement, KYC) | Ask sales; compare three quotes in the same hour |
| Q8 | Which of Exir, OMPFinex, Tetherland, Excoino, Arzinja operate in 2026? | Open the sites/apps; check Telegram and ArzDigital listings |
| Q9 | Current gateway availability per venue | Open the Rial deposit page; record date |
| Q10 | Provider deposit minimums, supported networks, confirmations, deposit fees | File 01 (`data/providers.json`) lists mpay networks TRC20/BEP20 (low) and minimum deposit/network fee as UNVERIFIED for all providers [S90]; ask each provider in writing |
| Q11 | TRON energy price and sweeping cost for customer USDT | `GET https://api.trongrid.io/wallet/getenergyprices` and a test sweep |
| Q12 | Do providers screen deposits from SDN-linked venues? | Ask providers in writing; sanctions specialist (05) |
| Q13 | Later OFAC actions after 2026-09-17 and wind-down licences | OFAC Recent Actions; file 05 coverage gaps |
| Q14 | Bank fees for ID deposits and Rial withdrawals | Bank tariff sheet; payments specialist (03) |

## Cross-specialist needs

- **01 card-providers:** deposit networks, minimum deposit, confirmations, deposit fee, screening of SDN-linked sources (all still UNVERIFIED in `data/providers.json`; only mpay's TRC20/BEP20 is reported, at low confidence).
- **03 payments:** bank-side ID-deposit mechanics, tariff, business-account caps, Paya/Satna timing for exchange deposits and withdrawals.
- **04 legal/tax:** legality of using exchange accounts for business USDT purchases, legal-entity accounts, tax on FX gains, where partner-owned accounts stop being lawful pooling.
- **05 sanctions:** adjudicate use of SDN venues' public prices; address screening policy; confirm designations after 2026-09-17.
- **08 macro-fx:** USDT/IRT history, sigma_d, jump risk, night-gap premium and venue dispersion for calibration.
- **09 platform-tech:** API-key custody (Nobitex Ed25519 keys, IP whitelist), whitelist-based sweep automation, address-poisoning controls, unit-normalisation tests.
- **12 pricing-treasury:** adopt the float, allowance and lock formulas; resolve the 1-day vs L-day exposure control.

## Sources

Notes: 'per search summary' = the page itself was not seen; 'read directly' = fetched or downloaded and read; 'internal' = another specialist's file in this repository, cited for cross-checking and not re-verified.

- [S1] https://www.zoomit.ir/iran-news/468234-tether-night-trading-halted/ - Zoomit: night USDT trading halted; purchase limited to 2,000 USDT - per search summary
- [S2] https://iranwire.com/fa/news-1/158313-%D9%85%D8%A8%D8%A7%D8%AF%D9%84%D9%87-%D8%AA%D8%AA%D8%B1-%D8%A7%D8%B2-%D8%B3%D8%A7%D8%B9%D8%AA-%DB%B2%DB%B1-%D9%87%D8%B1-%D8%B4%D8%A8-%D8%AA%D8%A7-%DB%B9-%D8%B5%D8%A8%D8%AD-%D8%B1%D9%88%D8%B2-%D8%A8%D8%B9%D8%AF-%D9%85%D9%85%D9%86%D9%88%D8%B9-%D8%B4%D8%AF/ - IranWire: USDT exchange banned 21:00-09:00 - per search summary
- [S3] https://arzdigital.com/breaking/4418619/ - ArzDigital: AbanTether USDT trading limits, daily buy limited to 2,000 USDT (until 21:00 Sun 12 Mehr) - per search summary
- [S4] https://www.hamshahrionline.ir/news/1073206/%D9%85%D8%B9%D8%A7%D9%85%D9%84%D8%A7%D8%AA-%D8%B4%D8%A8%D8%A7%D9%86%D9%87-%D8%AA%D8%AA%D8%B1-%D9%85%D8%AA%D9%88%D9%82%D9%81-%D8%B4%D8%AF-%D8%B3%D9%82%D9%81-%D8%AE%D8%B1%DB%8C%D8%AF-%D8%A8%D8%B1%D8%A7%DB%8C-%D9%87%D8%B1%DA%A9%D8%A7%D8%B1%D8%A8%D8%B1-%D8%B3%D9%87%D9%85%DB%8C%D9%87-%D8%A7%DB%8C-%D8%B4%D8%AF - Hamshahri: night USDT trading halted, per-user quota-style purchase cap - per search summary
- [S5] https://www.zarinpal.com/blog/%D8%AF%D8%B3%D8%AA%D9%88%D8%B1-%D8%AC%D8%AF%DB%8C%D8%AF-%D8%A8%D8%A7%D9%86%DA%A9-%D9%85%D8%B1%DA%A9%D8%B2%DB%8C%D8%9B-%DA%A9%D8%A7%D9%87%D8%B4-%D8%B3%D9%82%D9%81-%D9%88%D8%A7%D8%B1%DB%8C%D8%B2-%D8%B4/ - Zarinpal blog: new CBI order - ID-based deposit cap to crypto exchanges reduced - per search summary
- [S6] https://www.irasin.ir/news/60520/%D9%85%D8%AD%D8%AF%D9%88%D8%AF%DB%8C%D8%AA-%D8%AC%D8%AF%DB%8C%D8%AF-%D8%A8%D8%B1%D8%A7%DB%8C-%DA%A9%D8%B3%D8%A8-%D9%88%DA%A9%D8%A7%D8%B1%D9%87%D8%A7%DB%8C-%D8%B1%D9%85%D8%B2%D8%A7%D8%B1%D8%B2%DB%8C-%D8%A8%D8%A7%D9%86%DA%A9-%D9%85%D8%B1%DA%A9%D8%B2%DB%8C-%D8%B3%D9%82%D9%81-%D9%88%D8%A7%D8%B1%DB%8C%D8%B2-%D8%B4%D9%86%D8%A7%D8%B3%D9%87-%D8%AF%D8%A7%D8%B1 - Irasin: new restriction for crypto businesses - CBI cuts ID-based deposit cap - per search summary
- [S7] https://digiato.com/iran-technology-news/new-restriction-cryptocurrency-businesses - Digiato: new restriction for crypto businesses - CBI cuts ID-based deposit cap - per search summary
- [S8] https://mihanblockchain.com/deposit-limit-per-id-reduced-to-25m-toman/ - Mihan Blockchain: CBI notice - 25M Toman daily deposit limit per national ID - per search summary
- [S9] https://peivast.com/p/173791 - Peivast: 72-hour settlement limit became a challenge for exchanges - per search summary
- [S10] https://iranbroker.net/interview-with-senior-managers-of-tetherland-exchange/ - IranBroker: FATA - every transaction must settle after 72h; Tetherland managers react - per search summary
- [S11] https://pingi.co/help/deposit-and-withdraw/72h-limit - Pingi help: why is there a 72-hour crypto withdrawal limit - per search summary
- [S12] https://nipoto.com/helpcenter/1402/06/21/fata-limitation-withdraw/ - Nipoto help (21 Shahrivar 1402): FATA withdrawal limits notice - per search summary
- [S13] https://www.scorechain.com/blog/ofac-iran-crypto-sanctions-june-2026 - Scorechain: OFAC sanctions Iran's four largest crypto exchanges - per search summary
- [S14] https://www.trmlabs.com/resources/blog/three-enforcement-layers-in-five-months-ofac-designates-irans-domestic-crypto-exchanges - TRM Labs: three enforcement layers in five months - OFAC designates Iran's domestic exchanges - per search summary
- [S15] https://complianceconcourse.willkie.com/articles/ofac-designates-irans-largest-digital-asset-exchanges/ - Willkie Compliance Concourse: OFAC designates Iran's largest digital asset exchanges - per search summary
- [S16] data/sanctions_timeline.json - 05-sanctions-counterparty-risk specialist file (internal cross-reference; its own sources are per search summary) - internal cross-reference, not re-verified by 02
- [S17] https://www.coindesk.com/policy/2026/08/07/u-s-widens-iran-crypto-crackdown-with-sanctions-on-two-exchanges - CoinDesk 2026-08-07: US widens Iran crypto crackdown with sanctions on two exchanges (Shelbit, Aban Tether) - as cited in file 05 - cited by file 05; page not seen by 02
- [S18] https://en.cryptonomist.ch/2026/09/28/tether-usdt-freezing-iran/ - Cryptonomist: Tether USDT freezing Iran hits $550M in 2026 - per search summary
- [S19] https://www.securities.io/tether-says-2026-iran-linked-usdt-freezes-total-about-550-million/ - Securities.io: Tether says 2026 Iran-linked USDT freezes total about $550M - per search summary
- [S20] https://raw.githubusercontent.com/nobitex/docs-api/master/source/includes/_market_data.md - Nobitex API docs: public market data (orderbook v3, depth v2, trades, stats, UDF) - read directly
- [S21] https://raw.githubusercontent.com/nobitex/docs-api/master/source/includes/_general_notes.md - Nobitex API docs: general notes, rate limits - read directly
- [S22] https://raw.githubusercontent.com/nobitex/docs-api/master/source/includes/_market_trade.md - Nobitex API docs: spot orders, units (Rial), min order - read directly
- [S23] https://raw.githubusercontent.com/nobitex/docs-api/master/source/includes/_withdraw_coin.md - Nobitex API docs: crypto withdrawals - read directly
- [S24] https://github.com/nobitex/docs-api - Nobitex official API docs (Slate source, files source/includes/_*.md on branch master) - read directly
- [S25] https://github.com/exirio/apidocs - Exir REST API docs (Slate, last push 2022-10; v0 paths) - read directly
- [S26] https://itresan.com/495987/usdt-night-trading-restriction-iran/ - ITResan: night USDT trading halted, daily buy cap 2,000 USDT - per search summary
- [S27] https://snn.ir/fa/news/1463342/%D9%85%D8%B9%D8%A7%D9%85%D9%84%D8%A7%D8%AA-%D8%B4%D8%A8%D8%A7%D9%86%D9%87-%D8%AA%D8%AA%D8%B1-%D9%85%D8%AA%D9%88%D9%82%D9%81-%D8%B4%D8%AF-%D8%B3%D9%82%D9%81-%D8%AE%D8%B1%DB%8C%D8%AF-%D8%B1%D9%88%D8%B2%D8%A7%D9%86%D9%87-2-%D9%87%D8%B2%D8%A7%D8%B1-%D8%AA%D8%AA%D8%B1-%D8%AA%D8%B9%DB%8C%DB%8C%D9%86-%D8%B4%D8%AF - SNN: night trading halted, daily buy cap 2,000 USDT - per search summary
- [S28] https://tabdeal.org/commissions - Tabdeal: commissions - per search summary
- [S29] https://nobitex.ir/pricing/ - Nobitex: fees and service costs - per search summary
- [S30] https://www.zoomit.ir/cryptocurrency/443544-crypto-tether-fee-iran-exchanges/ - Zoomit: where to buy USDT - fee comparison across Iranian exchanges - per search summary
- [S31] https://zoomarz.com/tether-to-toman-conversion-fee-in-nobitex/ - ZoomArz: USDT to Toman conversion fee at Nobitex (0.2 %) - per search summary
- [S32] https://sanjeshbroker.com/nobitex-exchange-fees/ - Sanjesh Broker: Nobitex fees - per search summary
- [S33] https://tradingfinder.net/exchanges/wallex/commission/ - TradingFinder: Wallex commission 1405 - per search summary
- [S34] https://wallex.ir/help/docs/help-center/commission/trade/ - Wallex help: trade commission - per search summary
- [S35] https://novintether.com/blog/cryptocurrency-exchange-fees/ - NovinTether blog: exchange fee list (14 exchanges, 1405) - operator-published, treat as marketing - per search summary
- [S36] https://www.zoomit.ir/pr/457044-ramzinex-sell-and-buy/ - Zoomit (sponsored): Ramzinex buy/sell fees - per search summary
- [S37] https://tabdeal.org/buy-usdt - Tabdeal: buy USDT - per search summary
- [S38] https://pishkhanak.com/blog/abantether-crypto-exchange-review-guide - Pishkhanak: AbanTether review - per search summary
- [S39] docs/business-plan-full-context.md - First-pass research doc in this repo (secondary: itself compiled from search summaries) - internal, secondary
- [S40] https://ramzinex.com/blog/how-to-buy-tether-with-low-fee/ - Ramzinex blog: buying USDT with low fee - per search summary
- [S41] https://raw.githubusercontent.com/nobitex/docs-api/master/source/includes/_other.md - Nobitex API docs: /v2/options (system settings) - read directly
- [S42] https://raw.githubusercontent.com/nobitex/docs-api/master/source/includes/_withdraw_rial.md - Nobitex API docs: Rial withdrawals - read directly
- [S43] https://raw.githubusercontent.com/nobitex/docs-api/master/source/includes/_websocket.md - Nobitex API docs: WebSocket (Centrifugo) - read directly
- [S44] https://raw.githubusercontent.com/nobitex/docs-api/master/source/includes/_intro.md - Nobitex API docs: intro, auth, API keys, new-device withdrawal restriction - read directly
- [S45] https://raw.githubusercontent.com/nobitex/docs-api/master/source/includes/_address_book.md - Nobitex API docs: address book and safe-withdrawal mode - read directly
- [S46] https://raw.githubusercontent.com/nobitex/docs-api/master/source/includes/_security.md - Nobitex API docs: security (emergency cancel -> 72 h withdrawal block) - read directly
- [S47] https://github.com/amirSamanQ/python-bitpin - python-bitpin README (unofficial, Aug 2026): REST /api/v1, orderbook, units, Centrifugo WS - read directly
- [S48] https://pypi.org/project/python-bitpin/ - python-bitpin 0.0.11 / bitpin 0.4.3 (unofficial SDKs) source - read directly
- [S49] https://pypi.org/project/wallex/ - wallex 0.5.2 (unofficial SDK): https://api.wallex.ir/v1/{markets,depth,trades,udf/history,account/...} - read directly
- [S50] https://github.com/darhelm/go-wallex - go-wallex README (unofficial): X-API-Key auth, docs at api-docs.wallex.ir - read directly
- [S51] https://pypi.org/project/tabdeal-python/ - tabdeal-python 0.4.7 (official SDK by Tabdeal-Exchange org): client.py/spot.py - read directly
- [S52] https://nabzgheymat.ir/%D9%82%DB%8C%D9%85%D8%AA-%D8%AA%D8%AA%D8%B1-%D8%A7%D9%85%D8%B1%D9%88%D8%B2-%D8%AC%D9%85%D8%B9%D9%87-%DB%B1%DB%B0-%D9%85%D9%87%D8%B1-%DB%B1%DB%B4%DB%B0%DB%B5-%E2%94%82-%D9%81%D8%A7%D8%B5%D9%84%D9%87/ - NabzGheymat: USDT price Friday 10 Mehr 1405 - per search summary
- [S53] https://www.elliptic.co/blog/ofac-sanctions-nobitex-and-three-other-iranian-cryptoasset-exchanges - Elliptic: OFAC sanctions Nobitex and three other Iranian exchanges - per search summary
- [S54] https://ofac.treasury.gov/faqs/1257 - OFAC FAQ 1257: E.O. 13902 digital-asset exchanges / non-US person exposure - as cited in file 05 - cited by file 05; page not seen by 02
- [S55] https://www.crowdfundinsider.com/2025/06/242814-nearly-100m-burned-irans-largest-crypto-exchange-nobitex-suffers-major-hack/ - Crowdfund Insider: nearly $100M burned - Nobitex hack - per search summary
- [S56] https://www.scorechain.com/blog/nobitex-hack - Scorechain: Nobitex hack analysis - per search summary
- [S57] https://www.intellinews.com/iran-cryptocurrency-exchange-loses-81mn-in-hacker-attack-386665/ - bne IntelliNews: Iran crypto exchange loses $81mn in hacker attack - per search summary
- [S58] https://dc.fortune.com/crypto/2025/06/18/nobitex-gonjeshke-darande-predatory-sparrow-iran-israel-hack/ - Fortune: Nobitex / Predatory Sparrow hack - per search summary
- [S59] https://cryptorank.io/news/feed/c0781-tether-helped-freeze-550m-in-iran-linked-usdt-reveals-4-9b-total-freeze - CryptoRank: Tether helped freeze $550M Iran-linked USDT - per search summary
- [S60] https://mihanblockchain.com/iranian-exchanges-direct-rial-payment-halt/ - Mihan Blockchain: direct Rial deposit at exchanges halted - per search summary
- [S61] https://www.zoomit.ir/tech-iran/434377-payment-gateway-of-small-and-medium-cryptocurrency-exchanges-was-reopened/ - Zoomit: only gateways of a few small/medium exchanges reopened (Fintech association head) - per search summary
- [S62] https://fararu.com/fa/news/831729/%D9%86%D8%A8%D8%B1%D8%AF-%D8%B4%D8%A7%D9%BE%D8%B1%DA%A9-%D8%B5%D8%B1%D8%A7%D9%81%DB%8C-%D9%87%D8%A7%DB%8C-%D8%A7%DB%8C%D8%B1%D8%A7%D9%86%DB%8C-%D8%A7%D8%B1%D8%B2-%D8%AF%DB%8C%D8%AC%DB%8C%D8%AA%D8%A7%D9%84-%D8%A7%D8%AC%D8%B1%D8%A7%DB%8C-%D8%B4%D8%B1%D8%B7-%D8%B4%D8%B1%D9%88%D8%B7-%DA%AF%D8%A7%D9%86%D9%87-%DB%8C%D8%A7-%D9%BE%D8%A7%DB%8C%D8%A7%D9%86-%DA%A9%D8%A7%D8%B1 - Fararu: Shaparak vs Iranian exchanges - ten conditions or end of business? - per search summary
- [S63] https://www.nobsbitcoin.com/iran-central-bank-blocks-payment-gateways-to-cryptocurrency-exchanges-amid-currency-crisis/ - NoBS Bitcoin: Iran central bank blocks payment gateways to crypto exchanges - per search summary
- [S64] https://raw.githubusercontent.com/nobitex/docs-api/master/source/includes/_user_data.md - Nobitex API docs: user data, limitations (levels) - read directly
- [S65] data/gateways.json - 03-ir-payments-collection specialist file (internal cross-reference): Paya cycles, gateway closures pattern - internal cross-reference, not re-verified by 02
- [S66] https://cointelegraph.com/news/the-nobitex-dilemma-how-irans-biggest-crypto-exchange-stays-off-the-ofac-blacklist - Cointelegraph: The Nobitex dilemma - per search summary
- [S67] https://crypto.jobs/news/iran-s-internet-shutdown-highlights-compliance-challenges-for-crypto-exchanges - Crypto.jobs: Iran internet shutdown highlights compliance challenges for exchanges - per search summary
- [S68] https://mihanblockchain.com/iran-central-bank-crypto-platforms-funds-rule/ - Mihan Blockchain: CBI - investing users' Rial balances at exchanges is banned - per search summary
- [S69] https://ramzarz.news/news/iranian-crypto-exchanges-news-709 - Ramzarz News: Iranian exchanges news (9 Mehr 1405) - per search summary
- [S70] https://github.com/Tabdeal-Exchange/tabdeal-api-postman - Tabdeal API Postman collection repo (docs at docs.tabdeal.org) - read directly
- [S71] https://arzdigital.com/exchange/bit24/ - ArzDigital: Bit24 review (updated Shahrivar 1405) - per search summary
- [S72] https://github.com/amiwrpremium/python-bit24 - python-bit24 (unofficial SDK for docs.bit24.cash): rest.bit24.cash pro/capi/v1/... - read directly
- [S73] https://iranbroker.net/news/new-restrictions-on-deposits-with-cryptocurrency-exchanges/ - IranBroker: new restrictions on ID-based deposits at crypto exchanges - per search summary
- [S74] https://kifpool.me/terms_fa - Kifpool terms of service - per search summary
- [S75] https://nobitex.ir/price/usdt/ - Nobitex: live USDT price page - per search summary
- [S76] https://peivast.com/p/218262 - Peivast: exchanges' payment gateway blocked again - per search summary
- [S77] https://wallex.ir/blog/%D9%BE%D8%A7%D8%B3%D8%AE-%D8%A8%D9%87-%D8%AF%D8%BA%D8%AF%D8%BA%D9%87-%DA%A9%D8%A7%D8%B1%D8%A8%D8%B1%D8%A7%D9%86/ - Wallex blog: answer to users about closed exchange payment gateways - per search summary
- [S78] https://raw.githubusercontent.com/nobitex/docs-api/master/source/includes/_symbols.md - Nobitex API docs: symbols and network codes - read directly
- [S79] https://mihanblockchain.com/iranian-crypto-exchanges-issue-user-notice-according-to-new-cbi-guidelines/ - Mihan Blockchain: deposit/withdraw at Iranian exchanges limited to 100M Toman/day - per search summary
- [S80] https://crystalintelligence.com/?p=29594 - Crystal Intelligence: investigations (Mar 2025) - Iran Shaparak/CBI crypto restrictions timeline - per search summary
- [S81] https://www.specialeurasia.com/2025/02/05/crypto-iran-geopolitics/ - Special Eurasia: Crypto under control - geopolitical drivers of Iran's new regulation - per search summary
- [S82] https://mihanblockchain.com/iran-central-bank-conditions-crypto-exchanges/ - Mihan Blockchain: CBI states conditions for reopening exchange gateways - per search summary
- [S83] https://github.com/Abantether-com/abantether-python-sdk - abantether-python-sdk 0.1.4 (org-published): api.abantether.com OTC endpoints - read directly
- [S84] https://packagist.org/packages/ramzinex/php - ramzinex/php SDK page (Postman docs link; public API host per search summary) - read directly
- [S85] docs/05-architecture/sim-spec.md - Lead's simulator spec (assumption: Paya/Satna do not settle Thu-afternoon/Fri/holidays) - internal
- [S86] https://tejaratnews.com/%D9%85%D8%B9%D8%A7%D9%85%D9%84%D8%A7%D8%AA-%D8%B4%D8%A8%D8%A7%D9%86%D9%87-%D8%AA%D8%AA%D8%B1-%D9%85%D8%AA%D9%88%D9%82%D9%81-%D8%B4%D8%AF-%D8%A7%D8%AB%D8%B1%DB%8C-%D8%A8%D8%B1-%D9%82%DB%8C%D9%85%D8%AA - TejaratNews: night USDT trading halted - effect on dollar price? - per search summary
- [S87] docs/03-research/07-ir-competitors.md - 07-ir-competitors specialist doc (internal cross-reference): hypothesis that competitors net two-sided FX flows - internal cross-reference, hypothesis only
- [S88] https://bitdefender.in/pro-israel-hacker-group-destroys-90-million-in-cryptocurrency-in-irans-largest-crypto-exchange - Bitdefender: pro-Israel hacker group destroys $90M at Nobitex - per search summary
- [S89] https://pkg.go.dev/github.com/darhelm/go-nobitex - go-nobitex SDK (unofficial) - endpoint list - read directly
- [S90] data/providers.json - 01-card-providers specialist file (internal cross-reference): provider networks, minimum deposits, network fees (UNVERIFIED for all providers except mpay networks) - internal cross-reference, not re-verified by 02
