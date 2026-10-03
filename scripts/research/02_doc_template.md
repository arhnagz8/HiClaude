---
title: Iranian exchanges and the Toman to USDT rail (صرافی‌های ایرانی و ریل تبدیل تومان به تتر)
owner_agent: 02-ir-exchanges-usdt-rails
as_of: 2026-10-02
confidence: medium for the policy timeline and Nobitex API; low for fees, spreads, caps and status of most other venues
status: draft
---

# Iranian exchanges and the Toman to USDT rail

> Rendered by `scripts/research/02_render_doc.py` from `scripts/research/02_doc_template.md`; data in `data/exchanges.json` and `data/regulatory_limits.json`; numbers by `scripts/research/02_conversion_cost.py`. Analysis only, not legal or tax advice: confirm with a licensed Iranian lawyer/tax adviser.

<!--FA-->
## خلاصه (برای مالک)

- **امروز (۱۰ مهر ۱۴۰۵):** طبق ابلاغ بانک مرکزی، از ۸ مهر ساعت 21 تا ۱۲ مهر ساعت 21 معاملات تتر هر شب از 21 تا 9 صبح متوقف است و خرید هر کاربر حداکثر 2,000 تتر در روز است. این محدودیت «موقت» اعلام شده؛ احتمال تمدید هست ولی نرخ پایه‌ای برای آن پیدا نشد.
- **گلوگاه اصلی ظرفیت، سقف واریز شناسه‌دار است:** 25 میلیون تومان در 24 ساعت (با نرخ 257,000 حدود 97 تتر). رساندن 100 تتر به ارائه‌دهنده حدود 26.05 میلیون تومان خرج دارد، یعنی بیش از سقف یک روز. برای 30 سفارش 100 دلاری در روز حدود 31 «سهمیه‌ی واریز» لازم است. راه‌حل باید قانونی باشد (حساب حقوقی، OTC رسمی، سرمایه‌ی تتری خود مالک، …) و نه تقسیم واریز برای دور زدن سقف.
- **قفل 72 ساعته:** تتر خریداری‌شده با واریز ریالی تا 72 ساعت قابل برداشت نیست (فرض محافظه‌کارانه: برای هر واریز جداگانه). فلوت لازم حدود «مصرف روزانه × (3 + 2 روز ذخیره)» است. مثال: 1,000 تتر در روز یعنی 5,000 تتر، حدود 1.285 میلیارد تومان؛ ساختن این فلوت فقط با واریز شناسه‌دار و یک سهمیه 52 روز طول می‌کشد، پس فلوت اولیه باید از مسیر دیگری بیاید.
- **هزینه‌ی تبدیل** (کارمزد معامله 0.25٪، اسپرد فرضی 0.10٪، کارمزد برداشت 1 تتر روی TRC20): برای 25 دلار حدود 4.4٪، برای 100 دلار حدود 1.35٪، برای 500 دلار حدود 0.55٪ و برای 2,000 دلار حدود 0.40٪ بالاتر از نرخ میانی. کارمزد برداشت ثابت است؛ اگر 3.5 تتر باشد (رمزینکس، TRC20) سفارش 25 دلاری حدود 14.4٪ گران می‌شود. تجمیع برداشت‌ها و انتخاب شبکه‌ی ارزان (TON یا BEP20 با حدود 0.8 تتر) مهم‌ترین اهرم هزینه است.
- **ریسک تحریم (مهم‌ترین تغییر 4 ماه اخیر):** نوبیتکس، والکس، بیت‌پین و رمزینکس در 12 خرداد 1405 (2026-06-02) و آبان‌تتر در 16 مرداد 1405 (2026-08-07، طبق فایل بخش تحریم‌ها) در فهرست SDN آمریکا قرار گرفته‌اند. یعنی پرنقدینگی‌ترین صرافی‌ها «پرریسک»اند. صرافی‌های غیرتحریمی (تبدیل، بیت24، اکسیر، …) داده‌ی بسیار کمی دارند و باید پیش از استفاده راستی‌آزمایی شوند.
- **فریز تتر:** حدود 550 میلیون دلار تتر مرتبط با ایران در 2026 فریز شده (دو موج بانک مرکزی: حدود 344 میلیون در آوریل و 131 میلیون در ژوئیه). آدرس‌های مرتبط با صرافی می‌توانند فریز شوند؛ موجودی را نزد صرافی یا ارائه‌دهنده انبار نکنید.
- **API:** مستندات رسمی نوبیتکس مستقیم خوانده شد: orderbook نسخه 3 با 300 درخواست در دقیقه، WebSocket، **قیمت بازارهای ریالی به «ریال» است (نه تومان)**، حداکثر 10 برداشت رمزارزی و 3 برداشت ریالی در 24 ساعت، و «برداشت امن» (whitelist). بیت‌پین و والکس قیمت را به تومان می‌دهند. برای بقیه فقط اسناد یا SDK غیررسمی در دسترس بود (اطمینان کمتر).
- **داده‌های کم یا نامطمئن:** سقف جستجوی وب این جلسه (200) تمام شد و فقط حدود 30 جستجو از این بخش انجام شد (هدف حداقل 40). بیشتر اعداد کارمزد و سقف «به‌گزارش خلاصه‌ی جستجو» هستند، اسپرد و عمق بازار هیچ‌جا پیدا نشد (فرض مدل، علامت‌گذاری‌شده) و بسیاری از فیلدها null با روش راستی‌آزمایی‌اند.
- **P2P و OTC:** فقط مسیرهای رسمی (OTC خود صرافی‌ها یا کسب‌وکار ثبت‌شده). الگوهای کلاهبرداری: رسید جعلی، پرداخت‌کننده‌ی ثالث و مسدودی حساب، برگشت پایا، آدرس‌مسموم‌سازی. عددی برای کارمزد و سرعت OTC پیدا نشد.
- **شبکه‌ها:** هزینه‌ی واقعی همان کارمزد برداشت صرافی است (کارمزد زنجیره را صرافی می‌دهد). شبکه‌ی پیش‌فرض و جایگزین را از جدول زنده‌ی صرافی انتخاب کنید (نوبیتکس: `GET /v2/options`)، حداقل واریز ارائه‌دهنده را بپرسید و با آدرس‌مسموم‌سازی مقابله کنید.
- **توصیه‌ی عملیاتی:** حداقل مبلغ سفارش و تجمیع برداشت‌ها، فلوت پیش از توقف شبانه، سقف موجودی برای هر صرافی، پایش روزانه‌ی فهرست SDN و اطلاعیه‌ها، و تعریف «توقف شبانه/سقف خرید/سقف واریز/قفل 72 ساعته» به‌صورت پارامتر قابل تغییر در شبیه‌ساز و پنل ادمین.
- **تذکر:** این سند تحلیل است و مشاوره‌ی حقوقی یا مالیاتی نیست. پیش از اجرا با وکیل و مشاور مالیاتی دارای مجوز تأیید کنید.
<!--/FA-->

## TL;DR

- **Regime today (2026-10-02, 10 Mehr 1405):** CBI-ordered nightly USDT trading halt 21:00-09:00 IRST and a 2,000 USDT per user per day buy cap run from 2026-09-30 21:00 to 2026-10-04 21:00 (8-12 Mehr 1405); explicitly temporary, extension risk UNVERIFIED (no base rate: one observed episode) [@zoomit_halt,iranwire_halt,arzdigital_aban_halt,hamshahri_halt]. Confidence: high for the halt, medium for the cap's exact scope.
- **Binding capacity limit:** ID-based Rial deposit cap of 25,000,000 IRT per 24 h per payer Sheba/ID (about 97.3 USDT at 257,000 IRT/USDT), in force since 2024-09-07 per one summary (2022-12 per another; see C1) [@zarinpal_idcap,irasin_idcap,digiato_idcap,mihan_idcap]. Crediting 100 USDT at a provider costs about 26.05M IRT, more than one allowance-day. Confidence medium (scope and dating conflict, see Conflicts).
- **72 h lock** on crypto withdrawal after a Rial deposit (FATA-directed, implemented by every exchange; per-deposit rolling lock assumed) [@peivast_72h,iranbroker_tetherland,pingi_72h,nipoto_fata]. Float is about D x (3 + g) days of USDT: 1,000 USDT/day needs about 5,000 USDT (1.285B IRT) and about 52 allowance-days to seed from Rial deposits alone.
- **All-in conversion premium over mid** (taker 0.25 %, assumed spread 0.10 %, 1 USDT TRC20 withdrawal): 4.36 % for $25, 1.35 % for $100, 0.55 % for $500, 0.40 % for $2,000; with Ramzinex's reported 3.5 USDT TRC20 fee a $25 ticket costs 14.4 % more than mid. Batching withdrawals is the main cost lever. Spreads are assumptions (no depth data reachable).
- **Sanctions changed the venue map:** Nobitex, Wallex, Bitpin, Ramzinex (OFAC SDN 2026-06-02) [@scorechain_ofac,trm_ofac,willkie_ofac] and Aban Tether (2026-08-07, imported from the sanctions specialist's file because 02's own searches missed it) [@s05_sanctions,coindesk_aban] are SDNs (file 05 counts seven designated domestic-market exchanges including Shelbit and BitBank); files 05 and the risk register advise not to use them as USDT sources. Non-designated venues (Tabdeal, Bit24, Exir, OMPFinex, Tetherland, NovinTether, ...) have very thin data here.
- **Issuer freezes:** about USD 550M of Iran-linked USDT was frozen by Tether in 2026 (CBI wallets: >344M in April, >131M on 2026-07-16) [@cryptonomist_tether,securities_tether,s05_sanctions].
- **Nobitex API (official docs source read directly):** `GET https://apiv2.nobitex.ir/v3/orderbook/USDTIRT` 300 req/min; stats 20/min; trades 60/min; WebSocket `wss://ws.nobitex.ir/connection/websocket` (Centrifugo); **Rial-market prices are in Rial**; 10 crypto + 3 Rial withdrawals per 24 h; whitelist ("safe withdrawal") and `GET /v2/options` for live fees and limits [@nobitex_docs_market,nobitex_docs_general,nobitex_docs_trade,nobitex_docs_wd]. Bitpin and Wallex quote Toman (unofficial SDK evidence).
- **Policy timeline 2022-2026** (19 rows in Section 5; 17 rules and 8 events in `data/regulatory_limits.json`) with a current-state matrix is in Section 5; the brief's "Dey gateway closure" is evidenced for Dey 1403 (2024-12-26), not Dey 1404.
- **Coverage gap (read first):** the session-wide web-search budget ran out after about 30 searches (mandate: 40+). Fees for most venues are "per search summary"; spreads, depth, KYC levels, OTC terms, business accounts, proof-of-reserves and network fees for most venues are null/UNVERIFIED with `verify_how`.
- **Lawful scale only:** USDT-denominated checkout (blocked by the risk register until counsel approves a screening policy), legal-entity/institutional/OTC terms, higher KYC levels, genuine partner-owned accounts with consent. Never borrowed identities, rented cards or splitting deposits to dodge caps.

## Method and coverage (read first)

| Item | What happened |
|---|---|
| Searches | About 30 web searches in Persian and English (halt and cap, ID-deposit cap, 72 h lock, gateway closure, OFAC/hack/shutdown, fee pages for Nobitex, Wallex, Bitpin, Ramzinex, Tabdeal, AbanTether, price snapshot, API docs). The session-wide WebSearch budget (200, shared with all specialists) was then exhausted. Mandate: at least 40. |
| Fetching | About 40 distinct domains were tried once each: every Iranian exchange, Iranian news, aggregator, Wikipedia and crypto-media/compliance domain returned EGRESS_BLOCKED (not retried); live exchange API hosts returned 403 through the proxy. Reachable: `raw.githubusercontent.com`, `pypi.org`, `pkg.go.dev`, `packagist.org` (and the public GitHub repository-search API, used only to locate documentation/SDK repositories). |
| First-hand evidence | Official Nobitex API docs source (GitHub `nobitex/docs-api`, files `source/includes/_*.md` on branch master) [@nobitex_docs]; Exir Slate docs [@exir_docs]; SDK source from PyPI/pkg.go.dev for Tabdeal (official), Bitpin, Wallex, Bit24, AbanTether. |
| Search-summary evidence | Everything about fees, caps, policy and prices. Summaries are produced by a tool; the page itself was not seen. `confidence` fields already reflect that; conflicts are listed. |
| Cross-specialist evidence | Files `data/sanctions_timeline.json` (05) and `data/gateways.json` (03) were read to cross-check facts. They corrected one of my own findings (Aban Tether is designated) and supplied Paya cycle times. They are cited as "file 05/03" and were not re-verified by 02. |
| Known blind spots | P2P/OTC (no searches), spreads and depth, KYC levels, business accounts, network fees outside Nobitex/Ramzinex, proof-of-reserves, anything after the dates of the summaries (e.g. further OFAC actions after 2026-09-17), 2026 status of Exir/OMPFinex/Tetherland/Excoino/Arzinja. |
| Re-run plan | When the budget is raised: (1) one search per venue "NAME کارمزد برداشت تتر TRC20 BEP20 ۱۴۰۵" (one per venue); (2) "حساب حقوقی صرافی رمزارز سقف واریز"; (3) "OTC تتر صرافی حداقل مبلغ"; (4) "برداشت ریالی صرافی چرخه پایا ۱۴۰۵"; (5) "واریز شناسه‌دار سقف هر کد ملی همه صرافی‌ها"; (6) OFAC Recent Actions after 2026-09-17; (7) exchange Telegram channels for the halt extension. |

## Facts table

| id | fact | value | unit | as_of | confidence | source ids |
|---|---|---|---|---|---|---|
| F01 | CBI-ordered nightly USDT trading halt | 21:00-09:00 IRST; 2026-09-30 21:00 to 2026-10-04 21:00 | time window | 2026-10-02 | high | [@zoomit_halt,iranwire_halt,itresan_halt,arzdigital_aban_halt] |
| F02 | USDT buy cap during that regime | 2,000 per user per day (per exchange assumed) | USDT | 2026-10-02 | medium | [@hamshahri_halt,snn_halt,arzdigital_aban_halt] |
| F03 | ID-based Rial deposit cap | 25,000,000 | IRT per 24 h per Sheba/ID | 2026-10-02 | medium | [@zarinpal_idcap,irasin_idcap,digiato_idcap,mihan_idcap,tabdeal_commissions] |
| F04 | Crypto withdrawal lock after Rial deposit | 72 | hours | 2026-10-02 | medium | [@peivast_72h,iranbroker_tetherland,pingi_72h,nipoto_fata] |
| F05 | Nobitex taker fee, USDT/IRT, base tier | 0.25 (alt 0.20, 0.35) | pct | 2026-10-02 | medium | [@nobitex_pricing,zoomit_compare,zoomarz_nobitex] |
| F06 | Nobitex fees on USDT-quoted pairs, base tier | maker 0.10 / taker 0.13 (VIP4: 0.07 / 0.10) | pct | 2026-10-02 | medium | [@nobitex_pricing,sanjesh_nobitex] |
| F07 | Wallex Toman-market fee, level 1 | 0.35 (alt 0.20) | pct | 2026-10-02 | low | [@tradingfinder_wallex,wallex_fee_help,zoomit_compare] |
| F08 | Bitpin base fee | maker 0.20 / taker 0.25 (alt 0.32) | pct | 2026-10-02 | low | [@zoomit_compare,novintether_fees] |
| F09 | Ramzinex Toman-market fee, level 1 | maker 0.20 / taker 0.25 | pct | 2026-10-02 | low | [@zoomit_compare,zoomit_ramzinex] |
| F10 | Tabdeal fee, level 1 (30-day volume below 1,000 USDT) | maker 0.33 / taker 0.35 | pct | 2026-10-02 | low | [@tabdeal_commissions,tabdeal_buy_usdt] |
| F11 | AbanTether explicit fee on USDT buy | 0 to 0.3 (conflicting; spread-embedded) | pct | 2026-10-02 | low | [@zoomit_compare,novintether_fees,pishkhanak_aban] |
| F12 | USDT withdrawal fee, TRC20, Nobitex | about 1.0 (secondary) | USDT | 2026-10-02 | low | [@first_pass] |
| F13 | USDT withdrawal fee, Ramzinex | TRC20 about 3.5; TON about 0.8 | USDT | 2026-10-02 | low | [@ramzinex_blog,zoomit_ramzinex] |
| F14 | Nobitex minimum order | 3,000,000 Rial (300,000 IRT) in Rial markets; 11 USDT in USDT markets | Rial / USDT | 2026-10-02 | high | [@nobitex_docs_trade,nobitex_docs_other] |
| F15 | Nobitex withdrawal count cap | 3 Rial + 10 crypto per 24 h | count | 2026-10-02 | high | [@nobitex_docs_rial] |
| F16 | Nobitex per-Sheba Rial transfer cap | 2,000,000,000 Rial (200M IRT) | Rial | 2026-10-02 | high | [@nobitex_docs_rial] |
| F17 | Nobitex public order book | `GET https://apiv2.nobitex.ir/v3/orderbook/USDTIRT`, 300 req/min, prices in Rial | endpoint | 2026-10-02 | high | [@nobitex_docs_market,nobitex_docs_trade] |
| F18 | Nobitex WebSocket | `wss://ws.nobitex.ir/connection/websocket`, Centrifugo, max 100 conn/IP, 450 channels/conn | endpoint | 2026-10-02 | high | [@nobitex_docs_ws] |
| F19 | Nobitex other limits | stats 20/min, trades 60/min, orders 300 per 10 min (shared), withdraw 10 per 3 min, confirm 30/h | req | 2026-10-02 | high | [@nobitex_docs_general,nobitex_docs_wd,nobitex_docs_market] |
| F20 | Nobitex account-security locks | new-device login: 1 h withdrawal block; leaving safe-withdrawal mode: 24 h; emergency-cancel: 72 h | hours | 2026-10-02 | high | [@nobitex_docs_intro,nobitex_docs_addr,nobitex_docs_sec] |
| F21 | Bitpin price unit and order book | Toman (symbol USDT_IRT); `GET https://api.bitpin.ir/api/v1/mth/orderbook/USDT_IRT/` | endpoint | 2026-10-02 | medium | [@bitpin_sdk,bitpin_pypi] |
| F22 | Wallex order book | `GET https://api.wallex.ir/v1/depth?symbol=USDTTMN`, Toman | endpoint | 2026-10-02 | medium | [@wallex_pypi,go_wallex] |
| F23 | Tabdeal order book | `GET https://api1.tabdeal.org/r/api/v1/depth?symbol=USDT_IRT` (version segment assumed) | endpoint | 2026-10-02 | medium | [@tabdeal_sdk] |
| F24 | USDT/IRT quotes on 10 Mehr 1405 | Wallex 255,709; Nobitex 256,500; median of all venues 257,820; min 250,000; max 269,509 | IRT per USDT | 2026-10-02 | medium | [@nabzgheymat_0710] |
| F25 | OFAC designation of four exchanges | Nobitex, Wallex, Bitpin, Ramzinex on 2026-06-02; Nobitex >50 % of 2025 Iranian inflows; four = about USD 7.7bn | event | 2026-10-02 | high | [@scorechain_ofac,trm_ofac,willkie_ofac,elliptic_ofac] |
| F26 | OFAC designation of Aban Tether | 2026-08-07 (via file 05) | event | 2026-10-02 | medium | [@s05_sanctions,coindesk_aban,ofac_faq1257] |
| F27 | Nobitex hack | 2025-06-18; about USD 90M (81-100M) burned | USD | 2026-10-02 | high | [@crowdfund_hack,scorechain_hack,intellinews_hack,fortune_hack] |
| F28 | Tether freezes of Iran-linked USDT in 2026 | about 550 | USD million | 2026-10-02 | medium | [@cryptonomist_tether,securities_tether,cryptorank_tether] |
| F29 | Exchange payment gateways blocked by CBI | from 6 Dey 1403 (2024-12-26) | date | 2026-10-02 | medium | [@mihan_direct_rial_halt,zoomit_gw_reopen,fararu_shaparak,nobsbitcoin_gw] |
| F30 | Nobitex Level-2 crypto withdrawal limit | 200M IRT/day (docs sample 2,000,000,000 Rial; monthly total sample 3B IRT) | IRT | 2026-10-02 | low | [@nobitex_docs_user,first_pass] |
| F31 | Tabdeal deposit/withdraw minimums | deposit 150,000 IRT; Rial withdrawal 50,000 IRT; deposit max 25M IRT/day | IRT | 2026-10-02 | medium | [@tabdeal_commissions] |
| F32 | Paya settlement cycles (file 03) | 03:45, 09:45, 12:45, 18:45 IRST; one cycle on holidays | time | 2026-10-02 | low | [@s03_gateways] |
| F33 | Reference rate used in this document | 257,000 | IRT per USDT | 2026-10-02 | medium | [@nabzgheymat_0710,first_pass] |
| F34 | Nominal 25M IRT cap in USDT at 257,000 | 97.3 | USDT | 2026-10-02 | derived | `02_conversion_cost.py` |
| F35 | Cost to credit 100 USDT at a provider (Nobitex-style costs) | 26,047,915 | IRT | 2026-10-02 | derived (assumption-based) | `02_conversion_cost.py` |
| F36 | Near-total internet shutdown; Nobitex kept operating | late Feb 2026 | event | 2026-10-02 | medium | [@cointelegraph_nobitex,cryptojobs_shutdown] |
| F37 | CBI ban on exchanges using users' Rial balances | in force, date unknown | rule | 2026-10-02 | low | [@mihan_funds_rule] |

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

Tier A = deepest liquidity historically (all four SDN-designated in June 2026); B = mid-size with some documentation; C = thin or no evidence. "SDN" = OFAC-designated per the sources above and file 05. Absence from the designation lists is not proof of safety (OFAC FAQ 1257, via file 05: any digital-asset exchange operating in Iran's financial sector is designable) [@ofac_faq1257].

| Venue | Tier | 2026 evidence of operation | SDN | Fee evidence | Withdrawal-fee evidence | API evidence |
|---|---|---|---|---|---|---|
| Nobitex (نوبیتکس) | A | operated through the Feb-2026 shutdown; designated Jun 2026 [@cointelegraph_nobitex,scorechain_ofac] | yes (2026-06-02) | 0.25 % taker base (conflict) | about 1.0 TRC20 / 0.8 BEP20 (secondary) | official docs, read directly (high) |
| Wallex (والکس) | A | designated Jun 2026 [@scorechain_ofac] | yes | 0.35 % (alt 0.20) | none | SDK source (medium) |
| Bitpin (بیت‌پین) | A | applied the Mehr halt [@ramzarz_news709] | yes | 0.25 / 0.20 | none | SDK README Aug 2026 (medium) |
| Ramzinex (رمزینکس) | A | designated Jun 2026 | yes | 0.25 / 0.20 | TRC20 3.5, TON 0.8 | Postman docs unseen; host publicapi.ramzinex.com |
| Tabdeal (تبدیل) | B | official SDK/Postman pushed May 2026 [@tabdeal_sdk,tabdeal_postman] | not named (absence is not proof) | 0.35 / 0.33 | none | official SDK (medium) |
| AbanTether (آبان‌تتر) | B | halt notice 8-12 Mehr [@arzdigital_aban_halt]; review Shahrivar 1405 | yes (2026-08-07, via file 05) | explicit 0-0.3 (conflict) | none | org SDK: price lists + OTC orders |
| Bit24 (بیت۲۴) | B | review updated Shahrivar 1405 [@arzdigital_bit24]; SDK Sep 2026 [@bit24_sdk] | not named | page unseen | none | SDK paths; docs.bit24.cash |
| Exir (اکسیر) | C | none in 2026; named in a CBI ID-deposit-cap notice (undated summary) [@iranbroker_idcap] | not named | none | none | docs 2022, v0 [@exir_docs] |
| OMPFinex | C | indirect (community scanner Aug 2026) | not named | none | none | none |
| Tetherland (تترلند) | C | undated manager interview on the 72 h rule [@iranbroker_tetherland] | not named | none | none | none |
| NovinTether (نوین‌تتر) | C | own 1405 blog [@novintether_fees] | not named | 0 explicit (spread-embedded) | none | none |
| Excoino (اکسکوینو) | C | none found | not named | none | none | none |
| Arzinja (ارزینجا) | C | none found | not named | none | none | none |
| Arzpaya, Eritron, Rabin Cash | C | listed in a competitor's 1405 fee list [@novintether_fees] | not named | 0.2 / 0.2+ / 0.2-0.32 | none | none |
| Kifpool, Pingi | C | only as sources for the 72 h rule [@kifpool_terms,pingi_72h] | not named | none | none | none |

**Nobitex profile.** Largest Iranian venue (about 11 million users; more than 50 % of Iranian digital-asset inflows in 2025; Wallex about 12 %, Bitpin about 10 %) [@scorechain_ofac,cointelegraph_nobitex]. OFAC-designated 2026-06-02 together with three other exchanges and four executives; media describe a Reuters investigation (2026-05-01) of flows for CBI and IRGC [@cointelegraph_nobitex]. Hack on 2025-06-18: about USD 90M (range 81-100M by outlet) moved to burn addresses by Predatory Sparrow, source code leaked a day later [@crowdfund_hack,scorechain_hack,intellinews_hack]. No recovery details or proof-of-reserves page were found (file 05 also lists restoration time as UNVERIFIED). Account model: levels with limits (docs sample for Level 2: 900M Rial/day Rial withdrawal, 2,000M Rial/day crypto, 30,000M Rial/month total) [@nobitex_docs_user]; API keys with READ/TRADE/WITHDRAW permissions, IP whitelist and Ed25519 signatures (marked experimental in the docs) [@nobitex_docs_intro]; safe-withdrawal whitelist [@nobitex_docs_addr].

**Other venues.** Bitpin: base fee tier below 30M IRT monthly volume; high-volume tiers reported near zero [@zoomit_compare,novintether_fees]. Ramzinex: USDT-quoted markets from 0.10 % taker; high tiers reported down to 0.07 % [@zoomit_ramzinex]. Tabdeal: tiers by 30-day USDT volume (L1 below 1,000 USDT 0.35/0.33; L2 1,000-2,000 0.35/0.31; L3 2,000-4,000 0.33/0.28) and a minimum Rial deposit of 150,000 IRT [@tabdeal_commissions]. AbanTether: instant/OTC-style pricing with the cost sitting in the quote; daily Rial withdrawal up to 2B IRT in separate requests (per summary) [@arzdigital_aban_halt]. NovinTether publishes comparison lists in which it appears best; treat as marketing [@novintether_fees].

### 2. Fees and spreads

All fees are percent of notional on the USDT/IRT (Toman-quoted) market unless stated; tiers depend on 30-day volume. Maker fees are irrelevant for market buys.

| Venue | Taker (used) | Maker | Alternative readings | Adjudication |
|---|---|---|---|---|
| Nobitex | 0.25 | 0.25 (alt 0.13) | 0.20 [@zoomarz_nobitex]; 0.35 [@novintether_fees]; range 0.25 down to 0.06 over tiers [@nobitex_pricing] | 0.25 chosen: two of three independent summaries; the 0.10/0.13 tier table is for USDT-quoted pairs, not USDT/IRT |
| Wallex | 0.35 | 0.35 | 0.20 at level 1 volume 0-20,000 USD [@zoomit_compare] (probably the USDT-base market) | conservative 0.35; low 0.20 in sensitivity |
| Bitpin | 0.25 | 0.20 | 0.32 [@novintether_fees] | 0.25 |
| Ramzinex | 0.25 | 0.20 | one summary reverses maker/taker | 0.25 (taker >= maker is the normal structure) |
| Tabdeal | 0.35 | 0.33 | "USDT pairs fixed 0.2" (likely USDT-quoted markets) | 0.35 |
| AbanTether | 0.0 explicit | n/a | 0.2 [@novintether_fees]; about 0.3 [@pishkhanak_aban] | treated as spread-based; model 0.20 fee plus 0.25 spread |
| NovinTether | 0.0 explicit | n/a | spread-embedded | model spread 0.35 |
| Arzpaya / Eritron / Rabin Cash | 0.2 / 0.2+ / 0.2-0.32 | n/a | competitor list only | low confidence |

**Spread and depth: no evidence.** Only point observations exist: on 10 Mehr 1405 Nobitex showed sell 256,500 and buy 256,499 [@nabzgheymat_0710]; another snapshot of the Nobitex price page showed last 262,510 and best buy 263,004 [@nobitex_price_usdt] (different time). The model therefore uses assumed half-spreads of 0.03/0.10/0.30 % (low/base/high) for tier A, 0.15 % for Tabdeal and 0.25-0.35 % for OTC-style venues, all flagged `ASSUMPTION` in `data/exchanges.json`. `verify_how`: sample the order book of each venue every 10 s for 24 h and compute the cost of a 2,000 USDT market buy.

### 3. Rial deposit rails and caps (Toman to exchange)

- **ID-based deposit (واریز شناسه‌دار)**: a bank transfer carrying a per-user payment ID (general description, not taken from a fetched page). Nobitex lists the endpoint `users/payments/ids-list` under "واریز شتابی" [@nobitex_docs_intro]. Cap **25,000,000 IRT per 24 h** per payer Sheba (instruction text) or national ID (headlines); excess is returned to the payer, only 25M is credited [@irasin_idcap,iranbroker_idcap,mihan_idcap]. One search summary of the ID-cap articles dates the cut to Saturday 17 Shahrivar 1403 (2024-09-07) [@zarinpal_idcap,digiato_idcap,irasin_idcap]; the previous cap is UNVERIFIED (another summary says 50M but dates a 50M-to-25M cut to Azar 1401, see C1). A Tabdeal commissions page (undated in the summary) still quotes "max daily deposit 25M by CBI" [@tabdeal_commissions]. Whether the cap is per exchange or global is UNVERIFIED.
- **Gateways (درگاه شاپرکی)**: blocked for exchanges from 6 Dey 1403 (2024-12-26); partial conditional reopening in Jan 2025 (ten data items to Shaparak; a few small/medium exchanges); later "blocked again" headline (undated); Wallex said its Rial deposits are direct bank-network transfers [@mihan_direct_rial_halt,zoomit_gw_reopen,fararu_shaparak,peivast_gw_blocked,wallex_blog_gw]. File 03 found a pattern of recurring cuts but no confirmed Dey-1404/1405 event [@s03_gateways]. Current per-exchange status is UNVERIFIED.
- **Timing**: Paya cycles 03:45, 09:45, 12:45, 18:45 IRST (changed 2025-07-10 per file 03), single cycle on holidays; Satna cut-off about 14:30 (13:30 on Thursdays); Friday is the weekend [@s03_gateways]. Analysis (not sourced): combined with the 21:00 trading halt, a deposit that only credits at the 18:45 Paya cycle leaves little or no trading time before 21:00 and waits for 09:00.
- **Daily USDT buy cap (regime)**: 2,000 USDT is 514M IRT at 257,000, far above the 25M ID cap, so it binds only if Rial balance already sits at the exchange.
- **Business/legal-entity accounts and higher KYC levels**: UNVERIFIED for every venue (`business_accounts` is null with `verify_how`). This is the main lawful capacity question for the owner.

### 4. Withdrawals: Rial, crypto, networks, whitelisting, locks

- **Rial withdrawal (Nobitex, official docs)**: `POST /cobank/withdraw`; at most 3 Rial and 10 crypto withdrawals per 24 h; per-destination-Sheba cap 2,000,000,000 Rial (200M IRT); cancellable only while status is New and within 3 minutes; settlement records of type normal/Paya/Satna [@nobitex_docs_rial]. Docs samples show a flat fee of 4,000 IRT and a minimum of 15,000 IRT (may be stale; live values in `GET /v2/options`) [@nobitex_docs_other].
- **Crypto withdrawal**: `POST /users/wallets/withdraw` (10 per 3 min) then `.../withdraw-confirm` (30/h) unless the address is whitelisted; network code selects the chain; errors include `AmountTooLow`, `AmountTooHigh`, `WithdrawAmountLimitation`, `WithdrawLimitReached`, `NotWhitelistedTargetAddress` [@nobitex_docs_wd]. Network codes in the docs include ETH, BSC, TRX, TON, SOL, MATIC, ARB (which of them carry USDT is in `/v2/options`) [@nobitex_docs_symbols].
- **Fees per network**: Nobitex TRC20 about 1.0 and BEP20 about 0.8 USDT (secondary, first-pass doc); Ramzinex TRC20 about 3.5 and TON about 0.8 USDT (per summary). If both low-confidence figures hold, the same network costs 3.5x more at one venue than at another, which would make venue and network choice the largest controllable cost [@first_pass,ramzinex_blog,zoomit_ramzinex]; verify live.
- **Whitelisting**: Nobitex address book plus "safe withdrawal mode"; whitelisted destinations need no OTP, so API sweeps are automatable; switching the mode off blocks withdrawals for 24 h; new-device login blocks withdrawals for 1 h; the emergency-cancel link blocks new withdrawals for 72 h (unrelated to the FATA lock) [@nobitex_docs_addr,nobitex_docs_intro,nobitex_docs_sec].
- **Level caps**: Level 2 about 200M IRT/day crypto (about 778 USDT/day) and about 3B IRT/month total (about 11,673 USDT/month); Level 3 about 1B IRT/day (about 3,891 USDT/day): low confidence (docs sample plus first-pass) [@nobitex_docs_user,first_pass].
- **72 h lock**: after a Rial deposit the funded value cannot be withdrawn as crypto for 72 h. Sources disagree on mode: most say the equivalent of each deposit becomes withdrawable 72 h after that deposit; one says the lock follows the first Rial deposit only [@pingi_72h,iranbroker_tetherland,peivast_72h]. The rule existed by 21 Shahrivar 1402 (2023-09-12) [@nipoto_fata] and is cited by Bit24, Kifpool and Pingi pages. Exceptions (higher KYC, legal entities, on-chain-deposited crypto) are UNVERIFIED; plan with no exceptions.

### 5. Policy timeline 2022 to 2026 and current state

| Date | Issuer | Rule or event | Scope / enforcement | Durability | Conf. | Sources |
|---|---|---|---|---|---|---|
| 2022-12 (Azar 1401) | CBI | per-platform daily cap cut 50M to 25M IRT (single summary; conflicts with next rows) | per platform | unknown | low | [@mihan_100m] |
| undated | CBI | notices: deposit/withdraw limited to 100M IRT/day per user | exchanges' user notices | unknown | low | [@mihan_100m] |
| by 2023-09-12 | FATA (Police) | 72 h settlement lock | per user, exchange-implemented | high (still cited 2026) | medium | [@nipoto_fata,peivast_72h,iranbroker_tetherland] |
| 2024-09-07 | Shaparak/CBI | ID-deposit cap cut to 25M IRT per 24 h per Sheba/ID (previous cap UNVERIFIED) | bank returns excess | high | medium | [@zarinpal_idcap,irasin_idcap,digiato_idcap] |
| 2024-10 | CBI | Shaparak Rial-to-crypto restriction; broader deposit/withdraw ban late Oct | after missile attack on Israel | unknown | low | [@crystal_timeline] |
| 2024-11 | CBI | payment services suspended (USDT speculation) | PSPs | unknown | low | [@crystal_timeline] |
| 2024-12 | CBI, Finance Ministry, Cyberspace Council | crypto policy and regulatory framework; CBI sole authority (Feb 2025) | whole sector | medium | low | [@crystal_timeline,specialeurasia] |
| 2024-12-26 | CBI/Shaparak | exchange payment gateways blocked | Shaparak gateways | partially reversed Jan 2025 | medium | [@mihan_direct_rial_halt,zoomit_gw_reopen,nobsbitcoin_gw] |
| 2025-01 | CBI | reopening conditional on ten data items | large exchanges refused at first | unknown | low | [@mihan_gw_conditions,fararu_shaparak] |
| 2025-02 | Authorities | crypto advertising ban | marketing | unknown | low | [@crystal_timeline] |
| 2025-06-18 | event | Nobitex hack, about USD 90M burned | one venue | n/a | high | [@crowdfund_hack,scorechain_hack] |
| undated | CBI | exchanges may not invest users' Rial balances | exchanges | unknown | low | [@mihan_funds_rule] |
| 2026-01-30 | OFAC (file 05) | first designations of exchanges (Zedcex, Zedxion; UK-registered) | foreign entities | high | medium | [@s05_sanctions] |
| late Feb 2026 | event | near-total internet shutdown; Nobitex kept operating | national | n/a | medium | [@cointelegraph_nobitex,cryptojobs_shutdown] |
| 2026-04 and 2026-07-16 | Tether + OFAC (file 05) | CBI USDT wallets frozen: >344M (2 wallets), >131M (4 wallets) | issuer freeze | n/a | medium | [@s05_sanctions,cryptonomist_tether] |
| 2026-06-02 | OFAC | Nobitex, Wallex, Bitpin, Ramzinex designated | SDN, secondary exposure | high | high | [@scorechain_ofac,trm_ofac,willkie_ofac] |
| 2026-08-07 | OFAC (file 05) | Aban Tether and Shelbit Exchange designated | SDN | high | medium | [@s05_sanctions,coindesk_aban] |
| 2026-09-17 | OFAC (file 05) | BitBank designated | SDN | high | low | [@s05_sanctions] |
| 2026-09-30 21:00 | CBI via exchanges | nightly halt 21:00-09:00 + 2,000 USDT/user/day buy cap until 2026-10-04 21:00 | all USDT trading | low (temporary) | high / medium | [@zoomit_halt,iranwire_halt,arzdigital_aban_halt] |

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

- **Exchange-integrated OTC:** AbanTether exposes OTC market/limit order endpoints (`https://api.abantether.com/order_handler/orders/otc/market|limit`) in its organisation-published SDK [@aban_sdk]; it is now SDN-designated (above), so treat as high risk. Terms at other venues are unknown.
- **Telegram OTC desks (fraud patterns, analysis):** edited bank receipts; a third-party payer whose money is fraud proceeds, after which your account is blocked ("triangular fraud", also noted in the first-pass doc [@first_pass]); Paya/Satna reversals after USDT has been sent; impersonated admins and look-alike channels or bots; look-alike addresses and address poisoning; pay-first schemes.
- **Lawful safe practices:** use only exchange-integrated or registered OTC businesses with verifiable identity; pay only from your own named account to the counterparty's named account and never through third parties; release Toman only against on-chain-confirmed USDT in your whitelisted wallet and release USDT only after the money is visible in your own bank app; start with a small test; keep contracts and statements for the accountant; never use borrowed or rented accounts or cards and never split payments to evade caps.
- **Exchange P2P markets:** none found; `verify_how`: look for a P2P/escrow tab in each exchange app.
- **Sanctions angle:** OTC USDT of unknown origin may have passed through SDN venues; file 05 and the risk register require address screening and counsel-approved policies before any such flow.

### 7. Network economics for provider deposits

The owner never pays on-chain fees directly when withdrawing from an exchange: the exchange charges a flat USDT fee. On-chain mechanics matter for (a) sweeping customer USDT payments to the treasury, (b) understanding why reported withdrawal fees differ so much between venues (about 1.0 vs 3.5 USDT on TRC20, if both figures hold). Everything in the mechanism column below is **background knowledge, not verified this session**, except where a source is cited.

| Network | Mechanism and cost class | Typical credit time | Exchange fee evidence | Notes |
|---|---|---|---|---|
| TRC20 (TRON) | USDT transfer burns energy (about 65,000 units to an existing holder, about 130,000 to a new holder; both recalled, also flagged unverified in file 03) plus bandwidth; cost in TRX = energy x price(sun) / 1e6; current price must come from `GET /wallet/getenergyprices` | about 1 min | Nobitex about 1.0; Ramzinex about 3.5 | provider default if supported; fee varies 3.5x by venue |
| BEP20 (BNB Smart Chain) | gas in BNB, cents | seconds to a minute | Nobitex about 0.8 | provider-supported per first-pass doc (mpay: TRC20 + BEP20) |
| TON | jetton transfer, fractions of a TON | seconds | Ramzinex about 0.8 [@ramzinex_blog] | confirm provider support |
| Polygon, Arbitrum, Solana | cents or less; Solana needs rent for the recipient token account | seconds to minutes | unknown | check provider and exchange support |
| ERC20 | gas-price dependent, often dollars | minutes | unknown | avoid unless the provider demands it |

- **Default and fallback:** default = cheapest network that the provider accepts and the exchange supports, chosen from the live fee table; first-pass doc says mpay accepts TRC20 and BEP20 [@first_pass]. Fallback = a second network on the same provider so a TRON congestion or exchange-network suspension (`WithdrawCurrencyUnavailable`, `<Coin>WithdrawDisabled` errors in Nobitex docs) does not stop fulfilment [@nobitex_docs_wd].
- **Minimum-deposit traps:** provider minimum deposits and crediting thresholds are not known here (card-providers specialist); never send the first transfer without a small test; deposits below the minimum can be lost or need manual recovery.
- **Wrong-network traps:** BEP20, ERC20, Polygon and Arbitrum share the 0x address format; TRON uses `T...` addresses. Always select the network the provider shows next to the address.
- **Address poisoning:** look-alike dust transfers aim to make you copy a wrong address from history. Mitigation: address book/whitelist (Nobitex safe-withdrawal mode), full-address comparison, never copy from transaction history, two-person approval for new addresses (also in the risk register controls) [@nobitex_docs_addr].
- **Issuer risk:** Tether can freeze addresses; about USD 550M of Iran-linked USDT was frozen in 2026 [@cryptonomist_tether,securities_tether].

### 8. Quantified conversion cost (Python)

Script: `scripts/research/02_conversion_cost.py` reads `data/exchanges.json`. Formula (Q = USDT that must arrive at the provider, w = flat withdrawal fee in USDT, s = ask premium over mid, f = taker fee, R = reference mid):

```
qty_bought  = Q + w
total_irt   = ceil( qty_bought * R * (1 + s) * (1 + f) )      # our cost: round up
premium_pct = (total_irt / (Q * R) - 1) * 100
```

Inputs: R = 257,000 IRT/USDT; taker fees from Section 2; withdrawal fees only where sourced (Nobitex TRC20 1.0, BEP20 0.8; Ramzinex TRC20 3.5, TON 0.8), otherwise the benchmark base of 2.0 USDT (range 1.0-3.5), flagged `*`; spreads are assumptions. SDN = OFAC-designated per Section 5.

<!--TABLE:cost_main-->

Decomposition for a $100 credit on TRC20:

<!--TABLE:decomp-->

Sensitivity (low/base/high assumption sets):

<!--TABLE:sens-->

Benchmark grid (taker 0.25 %, spread 0.10 %), premium % by withdrawal fee and ticket size:

<!--TABLE:bench-->

Batching: premium % when k orders share one withdrawal:

<!--TABLE:batch-->

**Findings.**
1. Below about $100 the withdrawal fee dominates; at $25 and 1 USDT it is 4.0 % of the ticket versus 0.35 % for fees plus spread. Batch to at least `w / 0.005` USDT per sweep (200 USDT at w = 1, 700 USDT at w = 3.5) to keep the fee share at or below 0.5 %.
2. Choosing the cheaper network matters more than choosing the cheaper exchange: Ramzinex TON (0.8) beats Ramzinex TRC20 (3.5) by 10.8 points at $25.
3. Differences between tier-A venues in trading fee (0.25 vs 0.35 %) are smaller than the spread and withdrawal-fee uncertainties; measure before choosing.
4. At $2,000 the all-in premium is about 0.4-0.7 % at every venue, so large tickets are cheap per dollar but run into the deposit cap (below).
5. The 72 h lock adds price risk that is not in these rows; the buffer for it is below.

72 h lock price-risk buffer (z = 1.64; sigma values are placeholders until the macro specialist supplies realised volatility):

<!--TABLE:lock-->

How many ID-deposit allowance-days each ticket needs (Nobitex-style costs):

<!--TABLE:idays-->

### 9. Price-feed design inputs

| Venue | Public depth endpoint | Unit | Rate limit / stream | Evidence |
|---|---|---|---|---|
| Nobitex | `GET https://apiv2.nobitex.ir/v3/orderbook/USDTIRT` (also `/v3/orderbook/all`, `/v2/depth/USDTIRT`, `/v2/trades/USDTIRT`, `/market/stats?srcCurrency=usdt&dstCurrency=rls`, `/v2/options`) | Rial (divide by 10) | 300/min (orderbook, depth), 60/min trades, 20/min stats; WS `wss://ws.nobitex.ir/connection/websocket` channel `public:orderbook-USDTIRT` | official docs [@nobitex_docs_market,nobitex_docs_ws,nobitex_docs_trade] |
| Wallex | `GET https://api.wallex.ir/v1/depth?symbol=USDTTMN` | Toman | UNVERIFIED; socket.io `https://api.wallex.ir/socket.io`; header `x-api-key` | unofficial SDK [@wallex_pypi,go_wallex] |
| Bitpin | `GET https://api.bitpin.ir/api/v1/mth/orderbook/USDT_IRT/` (alt hosts api.bitpin.org, api.bitpin.market) | Toman (symbol says IRT) | 429 retry; WS `wss://centrifugo.bitpin.ir/connection/websocket` prefix `orderbook:` | unofficial SDK README Aug 2026 [@bitpin_sdk] |
| Tabdeal | `GET https://api1.tabdeal.org/r/api/v1/depth?symbol=USDT_IRT` | UNVERIFIED | UNVERIFIED; WS `wss://api1.tabdeal.org/stream/` | official SDK source [@tabdeal_sdk] |
| Exir | `GET https://api.exir.io/v0/orderbooks?symbol=usdt-irt` | UNVERIFIED | socket.io `https://api.exir.io/realtime` | docs of 2022, may be stale [@exir_docs] |
| Bit24 | `GET https://rest.bit24.cash/pro/capi/v1/markets/orderbooks` | UNVERIFIED | UNVERIFIED | unofficial SDK [@bit24_sdk] |
| AbanTether | `https://mono.abantether.com/coins/price` (price list, no depth) | UNVERIFIED | UNVERIFIED | org SDK [@aban_sdk] |
| Ramzinex | host `https://publicapi.ramzinex.com` (paths UNVERIFIED) | UNVERIFIED | UNVERIFIED | PHP SDK page [@ramzinex_php] |
| Aggregators (Bon-Bast, AlanChand, TGJU) | no documented API found | n/a | n/a | use only as secondary anomaly detector |

Design inputs (parameters are assumptions unless cited):
- **Cadence:** Nobitex caches under 1 s; docs say poll every 1-10 s and use WebSocket where possible; use a shared reader for all threads [@nobitex_docs_market]. Default 5 s REST, stale after 60 s, then the architecture's kill switch.
- **Unit normalisation is mandatory:** Nobitex Rial, Bitpin and Wallex Toman; a 10x error would be catastrophic. Add a startup check comparing each venue to the median and failing closed when the ratio is near 10.
- **Executable ask:** cheapest ask among venues that are open, reachable, not blocked by policy (SDN/disallowed per file 05) and have remaining buy cap; otherwise last known ask times (1 + haltPremium).
- **Dispersion:** snapshot of 10 Mehr 1405: Wallex 255,709; Nobitex 256,500; median 257,820; min 250,000; max 269,509 [@nabzgheymat_0710]. Relative to the median: -0.82 % and -0.51 % for the two tier-A venues; -3.04 % to +4.53 % across all venues. Suggested `anomalyPct`: 2 % within tier A, 5 % across all venues (assumptions).
- **Night gap:** the lead's simulator spec assumes that while exchanges are halted 21:00-09:00 the OTC price drifts and the exchange price jumps at the open [@sim_spec]; no source on the size was found (TejaratNews ran a piece asking whether the halt affects the dollar price [@tejarat_halt], content not seen). Use a `haltPremiumPct` placeholder of 1 % until the macro specialist calibrates it.
- **Market orders:** always send a limit `price` with market orders (Nobitex fills at the global price within a 1 % band when omitted) [@nobitex_docs_trade].
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

<!--TABLE:treasury-->

Sustainable conversion demand by number of allowances:

<!--TABLE:dmax-->

Nominal 25M IRT cap in USDT as the Rial weakens:

<!--TABLE:erosion-->

**What the table says.**
1. **One allowance sustains about one $100 order per day.** The first-pass target of 30 orders per day needs about 31 allowances and a 15,000 USDT float (3.86B IRT). The first-pass doc's USD 9,300 float is the 3-day lock component alone [@first_pass].
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
- Two-sided netting: file 07 hypothesises that competitors net customers who sell USDT/FX income against customers who need USDT, which would remove exchange spread, fees and the 72 h lock from part of the funding cost [@s07_competitors]. Hypothesis only; it can look like unlicensed currency exchange, so it needs the legal specialist (04) and the sanctions specialist (05) before any design work.
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
| C1 | When was the 25M cap introduced: Azar 1401 (Dec 2022, cut from 50M) vs 17 Shahrivar 1403 (2024-09-07) | [@mihan_100m] vs [@zarinpal_idcap,irasin_idcap,digiato_idcap] | 2024-09-07: the date carries its weekday (a Saturday, consistent) and four outlets report the ID-deposit cap cut; the 2022 item is probably a different measure or mis-dated. Both kept in `regulatory_limits.json` | medium |
| C2 | Scope: per payer Sheba vs per national ID; per exchange vs global | [@irasin_idcap,iranbroker_idcap] vs [@mihan_idcap] | model per payer ID per exchange (strictest practical reading); test with a 26M deposit | medium |
| C3 | 72 h lock mode: per deposit vs first deposit only | [@pingi_72h,iranbroker_tetherland] vs [@peivast_72h] | per-deposit rolling (conservative) | medium |
| C4 | Nobitex USDT/IRT taker: 0.25 / 0.20 / 0.35 % | [@nobitex_pricing,zoomit_compare] vs [@zoomarz_nobitex] vs [@novintether_fees] | 0.25 | medium |
| C5 | Wallex level-1 fee 0.35 vs 0.20 % | [@tradingfinder_wallex] vs [@zoomit_compare] | 0.35 conservative (0.20 probably the USDT-base market) | low |
| C6 | Ramzinex maker/taker order | [@zoomit_compare] vs another summary | taker 0.25, maker 0.20 | low |
| C7 | AbanTether fee 0 / 0.2 / 0.3 % | [@zoomit_compare,novintether_fees,pishkhanak_aban] | spread-based; modelled 0.20 + 0.25 spread | low |
| C8 | Is Aban Tether designated? 02's searches found no designation; file 05 says SDN since 2026-08-07 (verified/high there) | [@s05_sanctions,coindesk_aban,ofac_faq1257] | adopt file 05; shows that 02's coverage can miss later actions | medium |
| C9 | Share of Iranian activity: 72 % of inflows vs 78 % of attributed volume | [@scorechain_ofac] vs [@trm_ofac] | different metrics (OFAC inflows vs TRM volume); both kept | medium |
| C10 | Hack size USD 81M vs about 90M vs 100M | [@intellinews_hack] vs [@bitdefender_hack] vs [@crowdfund_hack] | range 81-100M, most reported 90M | high |
| C11 | Price units: Nobitex Rial, Bitpin Toman although symbol says IRT, Wallex Toman | [@nobitex_docs_trade,bitpin_sdk,go_wallex] | normalise per venue | high |
| C12 | "Dey gateway closure": Dey 1403 vs Dey 1404 | [@mihan_direct_rial_halt] vs [@s03_gateways] | only Dey 1403 (2024-12-26) is evidenced | medium |
| C13 | Risk-register control "exchange balance at most 1 day of needs" vs 72 h lock | `data/risk_register.json` vs Section 10 | structural minimum is about L days; propose L + 1 | medium |
| C14 | Nobitex API host `apiv2.nobitex.ir` (docs) vs `api.nobitex.ir` (community SDKs) | [@nobitex_docs_market,go_nobitex] | use the docs host | high |

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
| Q10 | Provider deposit minimums, supported networks, confirmations, deposit fees | File 01 (`data/providers.json`) lists mpay networks TRC20/BEP20 (low) and minimum deposit/network fee as UNVERIFIED for all providers [@s01_providers]; ask each provider in writing |
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

<!--SOURCES-->
