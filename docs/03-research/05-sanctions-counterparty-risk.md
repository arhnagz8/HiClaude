---
title: Sanctions & Counterparty Risk - the USDT leg, providers, exchanges and custody
owner_agent: 05-sanctions-counterparty-risk
as_of: 2026-10-02
confidence: medium   # high for the 2026 sanctions timeline; low for failure base rates (priors, flagged)
status: draft        # evidence-limited: 29 searches, session search budget exhausted - see "Evidence limits"
---

# Sanctions & Counterparty Risk - the USDT leg, providers, exchanges and custody

Companion files: `data/sanctions_timeline.json` (dated events, entities, hazard priors), `data/risk_register.json` (64 risks, 30 controls, simulator parameters),
`scripts/research/05_base_rates.py`, `05_build_data.py`, `05_expected_loss.py` (all numbers below are reproducible from them).
This is compliance analysis, **not legal or tax advice**; confirm with licensed Iranian-law and sanctions counsel (CLAUDE.md s3.4).

## خلاصه برای مالک

- **تحریم ۱۲ خرداد ۱۴۰۵ (۲ ژوئن ۲۰۲۶) واقعی است، نه شایعه.** اوفک (OFAC) نوبیتکس، والکس، بیت‌پین و رمزینکس را به‌همراه چهار نفر از مدیران/بنیان‌گذاران نوبیتکس در فهرست SDN قرار داد (فرمان‌های اجرایی ۱۳۹۰۲ و ۱۳۲۲۴). شواهد: نام این صرافی‌ها در پرسش‌وپاسخ ۱۲۵۷ اوفک آمده، شش شرکت تحلیل بلاکچین و چند رسانه آن را گزارش کرده‌اند و خود صرافی‌ها هم در بیانیه‌هایشان آن را پذیرفته‌اند. اطمینان: بالا (حدود ۹۷٪).
- **«شایعه» مربوط به رویداد دیگری بود:** ۱۰ بهمن ۱۴۰۴ (۳۰ ژانویه ۲۰۲۶) فقط دو شرکت ثبت‌شده در بریتانیا (Zedcex و Zedxion) تحریم شدند و نوبیتکس، زومیت و امپی‌اف‌اینکس درست می‌گفتند که صرافی‌های ایرانی هدف نبودند. ماجرای خرداد یک اقدام جدا و بعدی است.
- **روند ادامه دارد:** ۱۶ مرداد (۷ اوت): آبان‌تتر و شلبیت؛ ۲ شهریور (۲۴ اوت): آغاز «عملیات Economic Outcast» (ریسک تحریم ثانویه برای خارجی‌ها در پنج بخش از جمله دارایی دیجیتال)؛ ۲۶ شهریور (۱۷ سپتامبر): بیت‌بانک. پنج صرافی پرکاربرد داخلی (نوبیتکس، والکس، بیت‌پین، رمزینکس، آبان‌تتر) همین حالا SDN هستند. طبق پرسش‌وپاسخ ۱۲۵۷ هر صرافی ارز دیجیتال که در بخش مالی ایران فعالیت کند قابل تحریم است؛ برآورد مدل برای تحریم بعدیِ هر صرافیِ هنوز تحریم‌نشده حدود ۶٪ در ماه است (بازه ۲ تا ۱۵٪).
- **اثر مستقیم روی ریل تتر:** تتر از آذر ۱۴۰۲ آدرس‌های فهرست SDN را بدون نیاز به درخواست نهادهای مجری قانون فریز می‌کند. تتری که از صرافی‌های تحریم‌شده به ارائه‌دهنده‌ی خارجی (مثل mpay) برود «ارتباط مستقیم با نهاد تحریمی» حساب می‌شود و می‌تواند به ردّ واریز، توقف یا بستن حساب برسد. پرداخت تتری مشتری هم احتمالاً از همین صرافی‌هاست؛ پیش‌فرض: دریافت تتر از مشتری غیرفعال.
- **فریز تتر عملاً برگشت‌ناپذیر است:** در ۲۰۲۵ حدود ۴٬۱۶۳ آدرس و ۱٫۲۶ میلیارد دلار فریز شد؛ فقط ۳٫۶٪ آدرس‌ها از فهرست سیاه خارج شدند و بیش از ۶۹۸ میلیون دلار سوزانده شد. در ۲۰۲۶ حدود ۵۵۰ میلیون دلار مرتبط با ایران فریز شد (۳۴۴ میلیون در ۴ اردیبهشت (۲۴ آوریل) و ۱۳۱ میلیون در ۲۵ تیر، هر دو کیف‌پول‌های بانک مرکزی). در شبیه‌ساز احتمال بازیابی ۳٫۶٪ است.
- **ونداری:** فهرست رسمی کشورهای پشتیبانی‌شده‌ی Anthropic را مستقیم دیدیم و ایران در آن نیست؛ برای OpenAI منابع ضعیف‌تری داریم اما نتیجه یکی است ⇒ برچسب ریسک «بالا» و افشای ریسک به مشتری برای اشتراک‌های هوش مصنوعی.
- **ارائه‌دهنده‌ی کارت (مثل mpay):** مدل، احتمال یک رویداد شدید (خروج، فریز، بستن به‌دلیل ایران، ورشکستگی بالادستی) را حدود ۴۲٪ در سال برای هر ارائه‌دهنده‌ی «خاکستری» می‌گیرد (فرض مدل‌سازی، نه آمار مستند). ⇒ سقف موجودی هر ارائه‌دهنده ≤ ۵٪ سرمایه، شارژ دقیقاً به‌اندازه‌ی نیاز (JIT)، حداقل دو ارائه‌دهنده و ذخیره‌ی زیان طرف‌حساب. زیان دائمیِ مورد انتظار در سناریوی پایه ≈ ۰٫۷۴٪ حجم فروش (با ضریب عدم‌قطعیت دو برابر ≈ ۱٫۴۸٪)؛ بدون سقف و با موجودی بی‌کاربرد حدود ۲٫۲٪.
- **صرافی و امنیت عملیاتی:** هک نوبیتکس (۲۸ خرداد ۱۴۰۴ / ۱۸ ژوئن ۲۰۲۵) حدود ۹۰ میلیون دلار را سوزاند؛ موجودی روی صرافی را حداقلی نگه دارید (به‌خاطر قفل ۷۲ ساعته حداقل ساختاری حدود ۴ روز خرید است، نه ۱ روز؛ یافته‌ی متخصص صرافی‌ها). کیف‌پول چندامضایی، فهرست آدرس مجاز با تأخیر ۲۴ تا ۷۲ ساعته، مراقبت در برابر آدرس‌پویزنینگ، احراز هویت سخت‌افزاری/TOTP (نه فقط پیامک) برای ادمین‌ها و تلگرام، و تفکیک وظایف اپراتورها.
- **کنترل‌های قانونی:** غربالگری روزانه‌ی فهرست SDN و فهرست سیاه تتر، سقف موجودی، کلید قطع اضطراری (kill switch)، نگهداری سوابق (پیشنهاد ۱۰ سال)، برنامه‌ی واکنش به حادثه، افشای ریسک به مشتری و مشاور حقوقی. **ما هیچ روشی برای دور زدن تحریم، غربالگری یا ژئوبلاک نمی‌نویسیم**؛ مثلاً «کیف‌پول واسط برای پنهان‌کردن مبدأ» کنترل نیست و پنهان‌سازی محسوب می‌شود. جایگزین قانونی و ریسک باقی‌مانده در بخش ۷٫۹ آمده است.
- **ثبت ریسک:** ۶۴ ریسک و ۳۰ کنترل با پارامتر شبیه‌ساز در `data/risk_register.json` و ۱۶ رویداد در `data/sanctions_timeline.json`. بزرگ‌ترین ریسک‌های باقی‌مانده: تحریم بعدیِ صرافیِ مورد استفاده، قطع درگاه (پذیرنده یا صرافی)، مسدودی حساب بانکی، عقب‌نشینی طرف‌حساب‌های غیرآمریکایی، سخت‌گیری تتر، موج بن اکانت‌های AI و قطع اینترنت.
- **محدودیت شواهد (صادقانه):** سهمیه‌ی جست‌وجوی نشست تمام شد؛ فقط ۲۹ جست‌وجو (هدف: ۴۰ به بالا) انجام شد و فقط دو منبع مستقیم خوانده شد (فهرست کشورهای پشتیبانی‌شده‌ی Anthropic و آینه‌ی عمومی فهرست آدرس‌های OFAC)؛ اعداد با فایل‌های متخصصان ۰۲، ۰۳، ۰۴ و ۰۶ هم‌خوانی‌سنجی شد. بخش تحریم‌ها قوی است؛ نرخ خرابی ارائه‌دهنده/صرافی «پیش‌فرض مدل‌سازی با اطمینان کم» است و باید با اجرای مجدد تحقیق تکمیل شود. این سند مشاوره‌ی حقوقی نیست.

## TL;DR

1. **2026-06-02 (12 Khordad 1405): OFAC designated Nobitex, Wallex, Bitpin and Ramzinex** (E.O. 13902 + E.O. 13224) plus four Nobitex leaders. Verdict: **verified, confidence high (subjective ~0.97)**. The "rumour about two foreign firms" is the earlier 2026-01-30 Zedcex/Zedxion action - a different event [S6-S9, S15-S20].
2. Sequence: 01-30 Zedcex/Zedxion; 04-24 CBI wallets ($344M frozen, listed next day); 06-02 four exchanges; 07-16 four more CBI wallets ($131M); **08-07 Aban Tether + Shelbit**; 08-24 Operation Economic Outcast; 09-17 BitBank. Seven domestic-market exchanges are SDNs; no wind-down general licence for them was seen [S1, S21-S28].
3. **OFAC FAQ 1257**: non-US persons dealing with these exchanges risk designation or correspondent-account restrictions; any digital-asset exchange operating in Iran's financial sector is designable. Cadence: 0.50 exchange-designation events/month since 01-30 (0.75 since 06-02); counting the two CBI address waves, 0.75 actions/month (1.0 since 06-02) => P(at least one new OFAC action on Iran-linked crypto within 3 months) 78-89% (designations only) or 89-95% (all actions); prior for the next designation of a still-undesignated Iranian exchange **6%/month (2-15%)** [S8; 05_base_rates.py].
4. **Tether**: auto-freezes OFAC-listed addresses (policy since Dec-2023); 2025: 4,163 addresses, $1.26bn, **only 3.6% ever unfrozen**, >$698M burned, 84% on Tron; 2026: ~$550M Iran-linked (CBI $344M + $131M); Senate PSI minority report: 846 wallets, 84% USDT-only, ~$35M slipped past the freezes [S24, S25, S29, S31].
5. **USDT from the SDN exchanges is direct sanctioned-entity exposure** at any provider that screens; customer-paid USDT is likely mostly SDN-originated (inference: the four June exchanges alone were ~78% of attributed 2025 volume). Default: customer USDT inbound disabled; model cost if enabled unscreened: +1.3% of GMV in expected loss [S1; 05_expected_loss.py].
6. **Vendors**: Anthropic's official supported-regions list (read directly) omits Iran; OpenAI likewise per weaker sources => product risk_label = high, mandatory disclosure [S34-S36].
7. **Custodial card providers (mpay-like)**: modelled hazards per month: exit 0.5%, freeze 1.8%, geo de-risk 2.0%, upstream insolvency 0.2% => ~42% chance per year of at least one severe event per gray provider (prior, not an empirical base rate). Float cap <= 5% of equity per provider, just-in-time funding, >= 2 providers.
8. **Expected permanent loss (model)**: 0.74% of GMV baseline (x2 uncertainty loading = 1.48%); 2.2% with idle balances and no caps (~3x worse); 0.42% ultra-lean - the exchange leg cannot go below the 72h-lock floor (below). Reserve ~ $13k-$27k per $150k monthly GMV.
9. **Exchange risk**: Nobitex hack 2025-06-18 (~$90M burned, service down); keep exchange balances at the structural minimum - lock days + 1, about 4 days under the 72h withdrawal lock (specialist 02, C13; my earlier '1 day' cap was wrong); hacks 0.8%/month, insolvency 0.2%/month, rule changes 15%/month (priors).
10. **Register**: 64 risks (10 high residual: SAN-01, PAY-01, PAY-02, SAN-04, SAN-08, VND-01, EXC-03, EXC-05, INF-01, VND-02), 30 controls, 5 correlation groups, scenario links to the MISSION scenarios.
11. **Evidence limits**: 29 searches (14 extended, 6 in Persian); 2 sources read directly (Anthropic supported regions; a public mirror of the OFAC address list); other hosts blocked; the session-wide search budget was exhausted. Figures were cross-checked against specialists 02, 03, 04 and 06. Sections 4-6 base rates are flagged priors with `verify_how`.
12. **Guardrail**: no evasion content. Intermediate wallets, chain-hopping, borrowed identities, geo-spoofing and payment splitting are not mitigations; lawful alternatives and residual risk are in section 7.9.

## Evidence limits and method

| Item | Detail |
|---|---|
| Searches | 29 successful WebSearch calls (14 `extended`, 15 `standard`; 6 Persian). Target was 40+. The session-wide cap of 200 WebSearch calls (shared with the lead and parallel specialists) was reached; the two further attempts returned "not performed". No workaround was attempted. |
| Direct reads | 2 sources: Anthropic supported regions [S34] (Iran absent) and a public GitHub mirror of OFAC's SDN digital-currency address lists [S45] via raw.githubusercontent.com (reachable; the GitHub API returned 403 and the repository-scoped GitHub MCP denied access - neither retried). Everything else is "per search summary". |
| Cross-reading | After they landed, the research docs of specialists 02 (exchanges), 03 (payments), 04 (legal/tax) and 06 (catalog) were read read-only; reconciliations are in Conflicts C10-C14 and `data/risk_register.json` `meta.cross_specialist_reconciliation`. Their facts are cited as internal files [S44, S46-S48], not re-verified. |
| Blocked hosts (WebFetch EGRESS_BLOCKED, tried once each) | home.treasury.gov, ofac.treasury.gov, chainalysis.com, scorechain.com, trmlabs.com, elliptic.co, coindesk.com, theblock.co, blocksec.com, globalsecurity.org, en.wikipedia.org, zoomit.ir (three URLs in one parallel batch), cryptoslate.com, mishcon.com, paulhastings.com, orrick.com, sanctionsnews.bakermckenzie.com, help.openai.com, fatf-gafi.org, fincen.gov, justice.gov, tether.io, hsgac.senate.gov. |
| Strong | 2026 sanctions timeline (many independent summaries), Tether freeze statistics, Anthropic policy. |
| Weak / priors | Provider and exchange failure base rates, OpenAI wording, mpay terms, address-poisoning and SIM-swap statistics, internet-shutdown dates, 2024-2025 OFAC actions. All flagged `confidence: low` or `UNVERIFIED` with `verify_how`. |
| Follow-up plan (needs raised search budget) | (1) OFAC SDN entries + any published addresses for the 10 designated entities; (2) full texts of Treasury releases sb0519, 2026-01-30, 2026-08-07, 2026-09-17, sb0644; (3) 2024-2025 OFAC Iran-crypto actions; (4) any wind-down GL; (5) crypto-card/exchange failure base rates (academic + incident lists); (6) mpay and other providers' ToS (restricted jurisdictions, forfeiture, refund); (7) OpenAI/Google/Microsoft/Netflix/Spotify supported-country pages; (8) Nobitex post-hack restoration timeline; (9) NetBlocks/IODA Iran 2025-2026; (10) address-poisoning and SIM-swap statistics; (11) OFAC recordkeeping period; (12) whether commercial analytics vendors contract with Iran-based businesses. |

## Facts table

| id | fact | value | unit | as_of | confidence | sources |
|---|---|---|---|---|---|---|
| F01 | OFAC designated Nobitex, Wallex, Bitpin, Ramzinex | 2026-06-02 (12 Khordad 1405) | date | 2026-06-02 | high | S1-S9, S20 |
| F02 | Authorities cited | E.O. 13902 (Iran financial sector) + E.O. 13224 (counter-terrorism) | text | 2026-06-02 | medium | S1, S3, S4, S5, S8 |
| F03 | Individuals designated with Nobitex (Rad, Khoee, A. Kharrazi, M. Kharrazi) | 4 | persons | 2026-06-02 | high | S2-S5, S9, S20 |
| F04 | Four exchanges' share of attributed Iranian crypto volume 2025 | 78 (about $7.7bn) | pct | 2026-06-02 | medium | S1 |
| F05 | Nobitex share of Iranian digital-asset inflows 2025 | >50 | pct | 2026-06-02 | high | S1, S3-S5, S9 |
| F06 | Wallex / Bitpin share of 2025 inflows | 12 / ~10 | pct | 2026-06-02 | medium | S5, S9, S20 |
| F07 | Elliptic: flows sent or received by the four exchanges | >= $40bn | USD | 2026-06-02 | medium | S5 |
| F08 | FAQ 1257: non-US persons dealing with these exchanges risk designation / FFI correspondent restrictions | text | - | 2026-10-02 | high | S8 (per summary), S3, S4 |
| F09 | Aban Tether + Shelbit designated | 2026-08-07 (16 Mordad 1405) | date | 2026-08-07 | high | S8, S26 |
| F10 | BitBank designated | 2026-09-17 (26 Shahrivar 1405) | date | 2026-09-17 | high | S28 |
| F11 | Zedcex + Zedxion (UK-registered) designated | 2026-01-30 (10 Bahman 1404) | date | 2026-01-30 | high | S10-S14 |
| F12 | Operation Economic Outcast launched; 5 GLs suspended effective | 2026-08-24; 2026-09-08 | date | 2026-09-08 | high | S27 |
| F13 | CBI wallets frozen (two wallets; OFAC listed them the next day) | >$344M (344.2M per 04) | USD | 2026-04-24 | high | S21, S22, S24, S47 |
| F14 | CBI wallets, four more listed 2026-07-16; Tether froze | $131M | USD | 2026-07-16 | high | S23, S24 |
| F15 | CBI USDT blocked in total / estimated CBI holdings (Elliptic) | ~$475M / >= $507M | USD | 2026-07-16 | medium | S23 |
| F16 | Tether-stated Iran-linked freezes in 2026 | ~$550M | USD | 2026-09-28 | medium | S24, S25 |
| F17 | Cumulative USDT frozen: Tether vs BlockSec (2026-07-26, 9,597 addresses) | >$4.9bn vs $5.69bn | USD | 2026-07-26 | medium (conflict) | S24, S29 |
| F18 | 2025 USDT blacklisting | 4,163 addresses; $1.26bn; $3.4M/day | - | 2025-12-31 | high | S29 |
| F19 | Share of 2025 blacklisted addresses on Tron | 84 | pct | 2025-12-31 | medium | S29 |
| F20 | Share of 2025 blacklisted addresses later removed | 3.6 | pct | 2025-12-31 | high | S29 |
| F21 | 2025 frozen value later destroyed (destroyBlackFunds) | >$698M (~55%) | USD | 2025-12-31 | medium | S29 |
| F22 | Median days to unfreeze (for the removed subset) | 18.2 | days | 2025-12-31 | low | S32 |
| F23 | Tether freezes any OFAC-SDN-listed address proactively | since Dec 2023 | policy | 2026-10-02 | medium | S30, S31 |
| F24 | Freeze-delay window example; value moved in such windows since 2017 | 44 minutes; $78.1M | - | 2025 | medium | S30 |
| F25 | Senate PSI minority report: Iran-linked sanctioned wallets / USDT-only share / slipped past | 846 / 84% / ~$35M | - | 2026-09 | medium | S25 |
| F26 | Nobitex hack | 2025-06-18; ~$90M (up to $100M) burned | USD | 2025-06-18 | high | S33 |
| F27 | Outflows from Nobitex surged within minutes of the first strikes and continued during the shutdown | text | - | 2026 | medium | S5, S38 |
| F28 | Binance processed ~$7.8bn of Iran-linked flows (2018-2022), almost all with Nobitex | $7.8bn | USD | 2022 | medium | S39 |
| F29 | Anthropic supported-regions list omits Iran | seen directly | - | 2026-10-02 | high | S34 |
| F30 | Anthropic 2025-09-05 policy bars entities >50% owned by companies headquartered in unsupported regions (China, Russia, Iran, North Korea) | text | - | 2025-09-05 | medium | S35 |
| F31 | OpenAI: Iran excluded from its supported-countries list; API traffic from unsupported countries blocked since 2024-07-09; Iranian IPs/payment methods rejected; VPN use risks suspension | text | - | 2026-10-02 | medium | S36, S48 |
| F32 | The four exchanges state services continue and user assets are safe | statements | - | 2026-06-03 | high (that they were made) | S19 |
| F33 | Persian-community reports of account/wallet restrictions after moving funds out of Nobitex | anecdotal | - | 2026-06 | low | S38 |
| F34 | Designation event rate since 01-30 / since 06-02 | 0.497 / 0.748 | events/month | 2026-10-02 | medium (derived) | S5, S12, S26, S28 |
| F35 | P(at least one new OFAC action on Iran-linked crypto within 3 months): designations only / all actions incl. CBI waves | 77.5-89.4 / 89.3-95.0 | pct | 2026-10-02 | low (model) | derived |
| F36 | Prior: designation hazard for a still-undesignated Iranian exchange | 6 (2-15) | pct/month | 2026-10-02 | low (model) | S8, S26, S28, S44 |
| F37 | Prior: provider severe-event hazards (exit / freeze / insolvency / geo de-risk) | 0.5 / 1.8 / 0.2 / 2.0 | pct/month | 2026-10-02 | low (model) | S42 |
| F38 | Model expected permanent loss (baseline JIT policy, lock-aware; x2 loading) | 0.741 (1.48) | pct of GMV | 2026-10-02 | low (model) | 05_expected_loss.py |
| F39 | USDT-labelled addresses in a public mirror of OFAC's SDN list (114 Tron-format); ETH-labelled | 167; 150 | count | 2026-10-02 | low (freshness unverifiable; tool-summarised counts) | S45 |
| F40 | CBI/Shaparak blocked exchange payment gateways (Dey 1403), partially reversed Jan 2025 | 2024-12-26 | date | 2024-12-26 | medium | S44 |
| F41 | CBI nightly USDT halt 21:00-09:00 plus 2,000 USDT/user/day buy cap | 2026-09-30 21:00 to 2026-10-04 21:00 | window | 2026-10-02 | medium | S44 |
| F42 | 72h withdrawal lock after Rial deposits (FATA-directed) => USDT bought sits on the exchange >= 3 days; exchange cap = lock days + 1 | 72 h; 4 days | hours; days | 2026-10-02 | medium | S44, S47 |

## Details

### 1. OFAC and Treasury actions touching Iran and crypto, 2023-2026

#### 1.1 Timeline (dates verified against several summaries unless stated; full machine-readable version: `data/sanctions_timeline.json`)

| Date (Jalali) | Event | Key facts | Status | Src |
|---|---|---|---|---|
| 2023-12 | Tether policy: freeze any OFAC-listed address without a law-enforcement request | exact announcement date not seen | reported | S30, S31 |
| 2025-06-18 (28 Khordad 1404) | Nobitex hacked by Predatory Sparrow | ~$90M sent to vanity burn addresses; app/web down | verified | S33 |
| 2025 (date n/a) | Israel NBCTF seizure order on 187 IRGC-linked wallets | received ~$1.5bn historically (Elliptic); Tether blacklisted 39 holding ~$1.5M | reported | S40 |
| 2025 (date n/a) | Reported Tether freeze of 112 Iran-linked wallets (~$700M) | single analyst; inconsistent with BlockSec's $1.26bn annual total | conflicting, low | S40, S29 |
| 2026-01-30 (10 Bahman 1404) | OFAC designates **Zedcex Exchange Ltd, Zedxion Exchange Ltd** (UK-registered), Babak Zanjani and 7 individuals (6 IRGC-linked) | first-ever designation of crypto exchanges for operating in Iran's financial sector (E.O. 13902); TRM: ~$1bn IRGC-linked stablecoin flows | verified | S10-S14 |
| ~2026-02-01 | Nobitex, OMPFinex, Way2Pay, Zoomit: "Iranian exchanges are not sanctioned; the news is about two UK firms" | correct at the time | verified (statements) | S15-S18 |
| 2026-04-24 (4 Ordibehesht 1405) | Tether helps freeze >$344M in two wallets; OFAC lists them as CBI digital-currency addresses next day | day per specialist 04 (F13); my summaries gave only "April" | verified | S21, S22, S24, S47 |
| **2026-06-02 (12 Khordad 1405)** | **OFAC designates Nobitex, Wallex, Bitpin, Ramzinex + 4 Nobitex leaders** ("Economic Fury"; Treasury release sb0519) | see 1.2-1.4 | **verified** | S1-S9, S20 |
| 2026-06-03 | The four exchanges publish statements: services continue, assets safe | Bitpin: "only the legal structure was listed" | verified (statements) | S19 |
| 2026-07-16 (25 Tir 1405) | OFAC lists four more CBI wallets; Tether freezes $131M | after the ceasefire broke down; CBI blocked total ~$475M | verified | S23, S24 |
| **2026-08-07 (16 Mordad 1405)** | **OFAC designates Aban Tether and Shelbit** + operator Siavash Kayvanpour + 4 front companies (Georgia, Poland, UAE) | IRGC wallets sent >$1M to Shelbit, which returned >$2M; operator sent >$2M to Nobitex | verified | S8, S26 |
| 2026-08-24 (2 Shahrivar 1405) | Treasury launches **Operation Economic Outcast** | secondary-sanctions risk for foreigners in 5 sectors (digital assets, aviation, gold, shipping, technology) | verified | S27 |
| 2026-09-08 (17 Shahrivar 1405) | Five general licences (education, personal remittances, conferences, sports, academic) suspended; GL BB wind-down ends | unrelated to the exchanges' status | verified | S27 |
| **2026-09-17 (26 Shahrivar 1405)** | **OFAC designates BitBank** (Zanjani-controlled) | alleged BTC transfers of hundreds of millions of dollars to the IRGC, Jun-Jul 2026 | verified | S28 |
| ~2026-09-28 | Tether: ~$550M Iran-linked freezes in 2026; Senate PSI minority report | 846 wallets, 84% USDT-only, ~$35M slipped | reported | S24, S25 |
| 2026-10-02 | Press reports a Treasury action on a Russia-linked A7 network used by Iran (release sb0644 title surfaced) | detail not seen | reported, low | S41 |

#### 1.2 Adjudication of the 2026-06-02 designation (the headline conflict)

Question: Elliptic, Chainalysis, Scorechain, Crystal and others report that OFAC designated Nobitex, Wallex, Bitpin and Ramzinex; some Iranian outlets labelled the news a rumour about two foreign firms. Which is right?

| Tier | Evidence (all via search summaries; no page retrievable except as stated) | What it shows |
|---|---|---|
| T1 primary cues | Treasury release **sb0519** "Economic Fury Targets Iran's Largest Digital Asset Exchange for Terror Finance and Sanctions Evasion" (home.treasury.gov URL surfaced by search) [S6]; **@USTreasury** post, whose text is shown in the search result title: "Today, Treasury's Office of Foreign Assets Control designated Nobitex, Iran's largest digital asset exchange, along with three other Iranian digital asset exchanges, as part of Economic Fury ..." (truncated) [S7]; **OFAC FAQ 1257**, relayed as: "OFAC's designation of Nobitex, Wallex, Bitpin, Ramzinex, Aban Tether, or any digital asset exchange pursuant to Executive Order 13902 for operating in the Iranian financial sector means that entities dealing with these exchanges face sanctions risk" [S8] | OFAC itself names the exchanges; the FAQ states the consequences. These are quotations as returned by the search tool, not pages read directly |
| T2 independent analytics firms | TRM [S1], Chainalysis [S4], Elliptic [S5], Scorechain [S3], Crystal [S2], Global Ledger [S43], each with screening guidance | corroboration of entities, volumes and legal bases |
| T3 law firms | Seven client alerts on Operation Economic Outcast [S27] treat the exchange designations as settled | later actions build on it |
| T4 news | The Block, Cointelegraph, The National, IranWire, Iran International, Radio Farda, Euronews Persian, TGJU [S9, S20] | broad coverage including Persian-language outlets |
| T5 affected parties | Nobitex, Bitpin, Wallex, Ramzinex statements the next day: services continue, assets safe, sanctions scenarios were foreseen (paraphrase) [S19] | the exchanges acknowledge the listing - no denial |
| Counter-evidence | Nobitex/OMPFinex/Way2Pay/Zoomit denials: "news concerns only Zedcex and Zedxion" [S15-S18] | accurate for **January**; they predate the June action (post dates are inferred: the denials discuss only Zedcex/Zedxion, and Zoomit article ids 456181/456187 precede 460670/460684) |

**Decision: verified; confidence high (subjective probability ~0.97).** The rumour label belongs to the 2026-01-30 episode; Persian Telegram channels then mis-reported a UK-only designation as an attack on domestic exchanges, and the correct denials remain indexed and can be mistaken for denials of June. Residual uncertainty: (i) full text of sb0519 and the SDN entries were not seen; (ii) per-entity legal basis (summaries say both E.O. 13902 and 13224 for "the four"; Treasury's Nobitex narrative cites terrorism-related payments, IRGC and sanctions evasion); (iii) whether wallet addresses were published (UNVERIFIED). **Falsifier:** a direct OFAC SDN search that fails to return the four names would overturn this; the owner's counsel should run it (open question Q1).

#### 1.3 What exactly is designated, and who is covered

| Party | Status (as of 2026-10-02) | Consequence |
|---|---|---|
| Nobitex, Wallex, Bitpin, Ramzinex (2026-06-02); Aban Tether, Shelbit (2026-08-07); BitBank (2026-09-17); Zedcex, Zedxion (2026-01-30) | SDN | property blocked in US jurisdiction; US persons prohibited from dealings; non-US persons exposed per FAQ 1257 |
| Individuals: Amir Hossein Rad (chairman, co-founder, ex-CEO), Seyed Ali Khoee (CEO), Ali and Mohammad Kharrazi (co-founders; also rendered "Aghamir"), Siavash Kayvanpour, Babak Zanjani and others | SDN | same |
| Central Bank of Iran USDT wallets (2 in April, 4 in July) | SDN digital-currency identifiers; Tether froze | USDT immobilised (~$475M) |
| Exchange customers (Iranian retail) | not designated | no automatic legal status; practical risk is counterparties de-risking and tainted USDT |
| This reseller (Iran-resident, non-US) | not designated | tail risk of "material assistance" designation (SAN-03); main exposure is counterparty action |
| US-person / US-nexus providers (cards, hosting, SMS, app stores) | bound by primary Iran sanctions | will refuse or close |
| Non-US providers | not bound by primary sanctions but exposed to secondary sanctions and correspondent banking | de-risk (SAN-04, PRV-05) |
| Tether | policy: freeze OFAC-listed addresses | freezes within minutes to hours of listing |

#### 1.4 Secondary-sanctions exposure

- **FAQ 1257 (paraphrase from two summaries [S8])**: non-US persons are exposed for dealing with the designated exchanges; OFAC may designate persons that have "materially assisted, sponsored, or provided financial, material, or technological support" for them, or restrict correspondent / payable-through accounts of foreign financial institutions that knowingly conducted significant transactions for them. Designation under E.O. 13902 for operating in the Iranian financial sector means any digital-asset service provider determined to operate in that sector can be designated.
- **Analytics-firm read-across [S2, S3, S43]** (commentary in a cluster of summaries): an explicit SDN designation triggers secondary-sanctions risk for global counterparties and gives stablecoin issuers a direct legal justification for bulk address freezes.
- **Operation Economic Outcast (2026-08-24)** [S27] extends this posture to foreign entities across five sectors including digital assets; effect on a reseller is indirect but large: providers outside the US de-risk Iran-linked flows (risks SAN-04, PRV-05).
- **"Causing a violation"** (analyst reasoning; confirm with counsel): if the owner forwards SDN-sourced USDT to a provider that is a US person or has a US nexus, that provider may itself breach sanctions by accepting it; they therefore screen and reject. This is the mechanism behind provider KYC triggers and deposit rejections, and the reason the USDT leg cannot be made "clean" by relabelling.

#### 1.5 Wind-down periods and general licences

- **No general licence for winding down dealings with Nobitex, Wallex, Bitpin, Ramzinex, Aban Tether, Shelbit or BitBank appears in any retrieved summary** (UNVERIFIED; check OFAC Recent Actions for 2026-06-02, 08-07, 09-17).
- The licences discussed in the Outcast alerts (**GL BB** and the five suspended GLs) concern educational activities, personal remittances, conferences, sports and academic exchanges; GL BB allowed wind-down until **2026-09-08**, with payments into a blocked interest-bearing US account [S27]. Lesson: do not assume any general licence protects the business; the personal-remittance licence is gone.

#### 1.6 Cadence and hazard model (`scripts/research/05_base_rates.py`)

| Quantity | Value | Formula / note |
|---|---|---|
| Exchange designations (Jan-30 to Oct-2) | 4 in 8.05 months = 0.497/month | Zedcex/Zedxion; 4 exchanges; Aban Tether + Shelbit; BitBank |
| Domestic-market designations since 06-02 | 3 in 4.01 months = 0.748/month; 7 exchanges = 1.75/month | |
| All OFAC actions incl. CBI address waves | 6 in 8.05 months = 0.745/month (4 since 06-02 = 0.998/month); mean gap 46.0 days | adds 2026-04-24 and 2026-07-16; specialist 04's 4-action subset (it omits 08-07) gives gaps 39/44/63 = 48.7 days |
| P(>=1 new action in 1 / 3 / 6 months) | designations only: 39% / 78% / 95% (0.50) and 53% / 89% / 99% (0.75); all actions: 53% / 89% / 99% (0.745) and 63% / 95% / 99.7% (0.998) | 1 - exp(-lambda t) |
| CBI address-listing waves | 2 in 8.05 months = 0.248/month -> 22%/month | register SAN-05 |
| Per-exchange monthly hazard, undesignated | h = min(1, r / N_rem) x s; r = 1.75; pool 20 (specialist 02's 18 venues + Shelbit + BitBank), N_rem 13, s = 0.45 for a mid-size Tier-B venue => **6.0%**; pool 15, s = 0.30 => 6.5%; grid 2.0% (pool 20, s 0.15) to 17.5% (pool 13, s 0.60) | register SAN-01: 6% (2-15%) |

The pool: specialist 02's landscape lists 18 venues - Tier A Nobitex, Wallex, Bitpin, Ramzinex; Tier B Tabdeal, Aban Tether, Bit24; Tier C Exir, OMPFinex, Tetherland, NovinTether, Excoino, Arzinja, Arzpaya, Eritron, Rabin Cash, Kifpool, Pingi - plus Shelbit and BitBank = 20; seven are designated. Many Tier-C names show no 2026 activity, so the effective pool may be smaller. Absence of the rest from retrieved summaries is not proof they are clean (`watchlist_exchanges` in the timeline file is UNVERIFIED).

### 2. Tether freezes

#### 2.1 Mechanics

- The USDT contract (one on Ethereum, one on Tron) keeps a blacklist; three owner-multisig functions act on it: `addBlackList(address)` (address cannot send or receive; balance stays visible), `removeBlackList(address)`, and `destroyBlackFunds(address)` (burns the balance; irreversible) [S29]. A status read `isBlackListed(address)` exists in the contract ABI (not seen in-session; verify on Tronscan/Etherscan before coding it).
- Because freezes need multisig approval there is a window: AMLBot measured a 44-minute delay on Tron and $78.1M moved in such windows since 2017 ($49.6M Tron, $28.5M Ethereum) [S30]. Assume a listed address is dead within hours.
- Tether's stated policy since December 2023: freeze any address on the OFAC SDN list without a law-enforcement request [S30, S31].

#### 2.2 Frequency and totals

| Measure | Value | Source |
|---|---|---|
| 2025 addresses blacklisted | 4,163 (347/month; 11.4/day); mean $302.7k each | S29 (derived) |
| 2025 value frozen | $1.26bn ($3.4M/day) | S29 |
| Tron share | 84% of addresses (Ethereum has larger individual balances) | S29 |
| Removed from the blacklist | 3.6% (~150 addresses); median 18.2 days for those removed | S29, S32 |
| Burned via destroyBlackFunds | >$698M (~55% of 2025 value) | S29 |
| Burst example | >$500M across ~370 addresses in 30 days | S29 |
| Cumulative to 2026-07-26 | 9,597 addresses, $5.69bn (BlockSec) vs ">$4.9bn" (Tether) | S24, S29 (conflict, 1.16x) |
| Iran-linked 2026 | ~$550M = CBI $344M (Apr) + $131M (Jul) + ~$75M other; ~10-11% of cumulative | S23, S24 |
| Senate PSI | 846 sanctioned Iran-linked wallets, 84% almost only USDT, ~$35M slipped past => ~94% freeze coverage by value | S25 |

#### 2.3 Triggers

1. **OFAC listing** (automatic; highest coverage). 2. **Law-enforcement requests** (US civil forfeiture; Israeli NBCTF listings produce far smaller freezes: 39 of 187 addresses, ~$1.5M [S40]). 3. **Theft/fraud reports** by victims (an AMLBot blog case is titled "$650,000 USDT stolen while the owner was traveling - Tether froze it all"; title only, details not seen). 4. **Analytics-driven or indirect association**: Persian explainers say Tether works with blockchain-analytics firms so that even addresses indirectly linked to a suspicious transaction can be blacklisted [S37] (low confidence; not corroborated by a primary source). 5. **Political pressure** (Senate PSI referral, Sep 2026) - the case for SAN-08.

#### 2.4 Impact on Iranian users

Iranian explainers (Zoomit, Arzdigital, Tabdeal Academy, Iranbroker [S37]) treat freezing as a live asset-security risk for users. Elliptic reports outflows from Nobitex surged within minutes of the first US-Israeli strikes (year not stated in the summaries; the June-2026 context suggests the 2026 conflict) and continued through blackouts; Reuters (2022) traced $7.8bn of Binance-Iran flows almost entirely to Nobitex [S38, S39], i.e. exchange wallets are well labelled. Persian-community posts describe account or wallet restrictions after moving funds from Nobitex to other wallets or foreign exchanges (anecdotal, low confidence). A widely repeated Persian tip - "do not transfer between exchanges directly; hop through a non-custodial wallet" - **is not a control**: exposure analysis follows the transaction graph, and relabelling hops to hide an origin is the type of obfuscation compliance teams treat as aggravating. We do not recommend it.

#### 2.5 Recovery paths

Three routes exist: (1) petition to Tether with KYC and transaction evidence; (2) legal challenge against Tether (e.g. a $42.4M-freeze lawsuit; outcome unknown); (3) in US civil forfeiture, an innocent-owner defence [S32]. For an Iran-resident business whose funds touch an SDN exchange, standing and licensing obstacles make routes 2-3 impractical. **Planning value: recovery probability 3.6%** (the 2025 removal rate), not the median 18.2 days, which describes the minority that did get out. More than half of frozen value was burned within the year.

#### 2.6 How exchange hot wallets become visible

Blockchain-analytics firms label exchange wallets by clustering deposit-sweep patterns, funding sources, withdrawal behaviour and known-owner transactions; Reuters/Elliptic/TRM publications on Nobitex show its wallets are labelled in public [S1, S5, S38, S39]. Consequence: USDT that leaves a labelled SDN exchange wallet is recognisable at the next hop and for several hops afterwards (vendor thresholds differ; not verified).

#### 2.7 Exposure classes for USDT moving from Iranian exchanges to a provider

| Source of the USDT | Exposure | Likely provider reaction | Policy in this project |
|---|---|---|---|
| Hot wallet of a designated exchange (Nobitex, Wallex, Bitpin, Ramzinex, Aban Tether, Shelbit, BitBank) | **direct** sanctioned-entity exposure | reject, hold, source-of-funds request, account closure, possible freeze | prohibited (CTL-01) |
| Non-designated Iranian exchange | indirect (and the venue is itself designable) | usually accepted unless analytics flags; retroactive flags possible if the venue is later designated | allowed with screening, caps, provenance log |
| Customer-paid USDT | most likely direct (SDN exchanges ~78%+ of 2025 volume, plus Aban Tether) | as above | disabled by default (CTL-23) |
| Foreign exchanges | Iranian residents are generally barred by their terms | n/a | out of scope; no workarounds |

### 3. Provider-side policy (risk facts for product labels)

| Provider / vendor | What is known | Evidence | Geo-IP / enforcement | Bans / forfeiture | risk_label | Verify |
|---|---|---|---|---|---|---|
| Anthropic (Claude) | Iran is **not** in the supported-regions list; 2025-09-05 ToS update bars entities >50% owned by firms headquartered in unsupported regions (China, Russia, Iran, North Korea) "due to legal, regulatory, and security risks" | page heading: "Here are the countries, regions, and territories we can currently support access from:" [S34, seen directly]; policy per summaries [S35] | lead's first-pass research says IP is checked in real time [S42] (unverified) | not retrieved | **high** | Anthropic usage terms and supported-regions page (screenshot with date) |
| OpenAI (ChatGPT/API) | Iran excluded from the supported-countries list; API traffic from unsupported countries blocked since 2024-07-09; Iranian IPs and payment methods rejected; VPN use may lead to suspension | OpenAI Help Center supported-countries page and Caixin 2024-06-26 (per specialist 06's search summaries) [S48]; community thread and SEO sites (weak) [S36] | IP + payment-country checks reported | reported | **high** | help.openai.com "supported countries" page (blocked for me) |
| mpay.cards (custodial USDT card) | marketed as "no KYC"; region "varies"; no public API/partner programme; ~3/5 Trustpilot with fund-loss complaints; domain young | lead's research only [S42]; **ToS not retrieved** | unknown | unknown | **high** | read ToS, ask support in writing about Iran-resident eligibility, test small |
| Other crypto-card providers (Pintopay, Wanttopay, VirtCardPay, AnyXPay ...) | not retrieved here | specialist 01 owns | unknown | unknown | high (default) | specialist 01 table |
| Voucher aggregators (Bitrefill-type) | not retrieved | - | unknown | unknown | medium (default) | read Iran policy |
| Foreign exchanges (e.g. Binance) | Binance says it follows sanctions rules and blocks access for anyone based in Iran | Reuters 2022 via AMLBot [S39] | geo-block | - | n/a | n/a |
| Telegram/Bale, US consumer vendors (Apple, Google, Microsoft, Netflix, Spotify, Steam) | not researched | - | - | - | UNVERIFIED | catalog specialist (06) |

**Clause checklist for every provider/vendor ToS** (store snapshot + hash + date; update monthly - CTL-22, CTL-27): (1) restricted-jurisdiction list and wording on residency vs nationality vs IP; (2) termination without notice; (3) **forfeiture / withholding of funds** on suspected sanctions or ToS breach; (4) refund / withdrawal of unused balance; (5) dormancy and inactivity fees; (6) dispute and chargeback process; (7) governing law and arbitration; (8) KYC triggers and retroactive checks; (9) prohibited merchants/MCCs; (10) liability cap. **Geo-IP, billing-address and residency checks are the vendors' enforcement tools; the lawful response is a risk label, disclosure and, where needed, dropping the product - never spoofing.**

### 4. Counterparty risk of custodial card providers (mpay-like)

#### 4.1 Failure modes

| Mode | Mechanism | Early signals | Loss shape | Register |
|---|---|---|---|---|
| Exit / exit scam | operators withdraw pooled USDT | withdrawal delays, support silence, WHOIS/hosting changes, marketing stops | total, permanent | PRV-01 |
| Account freeze | compliance/KYC trigger, residency mismatch, SDN exposure, chargebacks | KYC requests, "pending review" | temporary to permanent; ~50% recovered (assumption) | PRV-02 |
| Geo de-risk | Iran added to restricted jurisdictions after Outcast | ToS changes, peers' reports | float returned or forfeited | PRV-05 |
| Upstream insolvency | issuer / BIN sponsor / program manager fails or is sanctioned | regulator warnings, program changes | months-long freeze | PRV-03 |
| Terms drift | fees, limits, minimum loads change | page hash change | margin | PRV-04 |
| Declines and MCC blocks | vendors reject prepaid BINs | decline rate | fulfilment failures | PRV-06, VND-02 |
| Credit/reconciliation failure | deposits not credited (network, memo, minimum) | balance mismatch | partial, usually recovered | PRV-08 |
| Trapped balances | unused balance not refundable | ToS clause | sunk cost | PRV-11 |

#### 4.2 Base rates - what could and could not be sourced

No empirical failure frequency for crypto-card startups was retrievable (search budget). Reference classes from analyst recollection, **not verified in-session**: early Bitcoin exchanges closed at high rates within a few years and often without repaying customers (Moore & Christin, "Beware the Middleman", 2013 - confirm figures); BaaS/issuer failures (Synapse 2024; Wirecard 2020 stranded several crypto-card programmes); the lead's research notes ~3/5 Trustpilot with "funds blocked" complaints for mpay. The priors below are therefore **judgemental**, deliberately conservative for a young, lightly regulated, Iran-exposed provider, and wide-ranged for sensitivity.

#### 4.3 Simulator probabilities (monthly; `data/risk_register.json`)

| Risk | p/month (low-high) | Annual equiv. | Impact on float | Recovery | Duration |
|---|---|---|---|---|---|
| PRV-01 exit scam | 0.5% (0.2-1.5%) | 5.8% | 100% | 5% | indefinite |
| PRV-02 account freeze | 1.8% (0.8-5%) | 19.6% | 100% | 50% | 60 days |
| PRV-03 upstream insolvency | 0.2% (0.07-0.7%) | 2.4% | 100% | 60% | 270 days |
| PRV-05 geo de-risk | 2.0% (0.8-6%) | 21.5% | 100% | 50% | 45 days (+ demand x0.7) |
| **Any severe event, one provider** | **~4.4%/month** (1 - 0.995 x 0.982 x 0.998 x 0.98) | **~42%/year** | | | |

#### 4.4 Signals to monitor (KRIs) and thresholds

| KRI | Green | Amber | Red |
|---|---|---|---|
| Monthly test withdrawal/refund latency | <= 24h | 24-72h | > 72h or refused |
| Support first response | <= 24h | > 48h | > 7 days |
| Provider balance vs our ledger | <= 0.1% | 0.1-0.5% | > 0.5% |
| Public rating, 30-day change | stable | down >= 0.5 | cluster of "funds blocked" posts |
| Terms / fee / domain / WHOIS / hosting change | none | change announced | unannounced change |
| Provider deposit-wallet outflows (on-chain) | normal | unusual sweeps | sweep to a single unknown address |
| Written Iran-resident eligibility | on file | unclear | withdrawn or refused |

#### 4.5 Float limits, sweep cadence, diversification, reserves

- **Float cap:** `F_cap = min(F_demand, eps x Equity / LGF_tail)`, `LGF_tail = 1` (whole float lost), `F_demand = D x (cadence_days + buffer_days)`, D = average daily top-up demand. Table (max float per provider, USD): equity 20k -> 600 / 1,000 / 2,000 (eps 3% / 5% / 10%); 50k -> 1,500 / 2,500 / 5,000; 100k -> 3,000 / 5,000 / 10,000; 250k -> 7,500 / 12,500 / 25,000; 1M -> 30k / 50k / 100k. Example: demand $3,000/day with cadence 1 day and buffer 0.5 day needs $4,500; at equity $50k and eps 5% that is two providers; $10,000/day needs six - i.e. the business is capital-constrained by counterparty risk before it is by demand.
- **Sweep cadence:** fund per order batch (<= 4 hours) in business hours; sweep idle balances back at least weekly where the provider allows; batch transfers to cut network fees; confirm refund/withdrawal support first (PRV-11 is UNVERIFIED).
- **Diversification:** >= 2 active providers per product line, none > 60% of float (concentration multiplies PRV hazards by ~1.5, +0.06% of GMV), >= 2 conversion rails.
- **Reserves:** fund a counterparty-loss reserve from margin at the modelled expected-loss rate (below) until it equals 12 months of expected loss.
- **Provider scorecard (suggested weights, to be calibrated):** entity transparency 15, regulatory standing 15, operating history 10, test-withdrawal results 20, support SLA 10, review sentiment 10, written Iran-resident eligibility 10, proof of reserves / reconciliation 10. >= 70 green, 50-69 amber (halve the float cap), < 50 red (no float).

#### 4.6 Expected permanent counterparty loss (`05_expected_loss.py`; illustrative GMV $150k/month, take rate 10%)

EL per risk per month: `pm x pct_frozen x (1 - recovery_prob) x exposure_days / 30` for float freezes; `pm x loss share` for fines/frauds. Temporary freezes (carry cost) and downtime/demand shocks are excluded here. **Lock-aware exchange exposure** (specialist 02, C13): because Rial-bought USDT cannot leave the exchange for 72h, the structural exchange balance is >= 3 days of purchases and the cap is lock days + 1 = 4 days; my first draft used 0.5 days, which understated expected loss (0.585% -> 0.741%).

| Policy (days of GMV held: provider / exchange / treasury / hot / bank) | EL % of monthly GMV | x2 loading |
|---|---|---|
| Baseline JIT with caps (1.5 / 4.0 / 2.0 / 1.0 / 1.0) | **0.741%** | 1.481% |
| Idle-heavy, no caps (7 / 7 / 5 / 3 / 3) | 2.187% | 4.373% |
| Ultra-lean hourly JIT (0.5 / 3.25 / 1.0 / 0.5 / 0.5) | 0.423% | 0.845% |
| Baseline components | provider float 0.257%, treasury-wallet freeze 0.172%, exchange balance 0.155%, fines/frauds 0.082%, all-USDT tail 0.048%, bank 0.020%, hot wallet 0.007% | |
| Conditional add-ons | customer USDT inbound unscreened +1.30%; USDT sourced from a designated exchange +0.69%; provider share > 60% +0.06% | |

Top baseline contributors: TKN-01 0.096%, SAN-01 0.096%, SAN-08 0.076%, SAN-02 0.060%, PRV-05 0.050%, TKN-03 0.045%. Reserve sizing: 12 months of baseline EL at $150k GMV/month = $13.3k (x2 = $26.7k). Caps and JIT cut expected loss ~3.0x versus an idle policy (2.19% -> 0.74%): the cheapest control in the register; the exchange leg stays at its 72h-lock floor, which is why even the ultra-lean policy only reaches 0.42%.

### 5. Exchange counterparty risk

| Date | Exchange | Incident | Duration / outcome | Status |
|---|---|---|---|---|
| 2025-06-18 | Nobitex | Predatory Sparrow hack; ~$90M burned; app and website down | restoration time not found (UNVERIFIED) | verified [S33] |
| date not stated (2025 or 2026 strikes) | Iranian exchanges | outflow surge within minutes of the first US-Israeli strikes; Nobitex kept processing during a government-imposed shutdown (Reuters) | duration not stated | reported [S5, S38] |
| 2026-06-02 onward | Nobitex, Wallex, Bitpin, Ramzinex | designation; statements say services continue; anecdotal withdrawal restrictions on onward transfers | ongoing | verified / low [S19, S38] |
| 2026-08-07 onward | Aban Tether | designation | ongoing | verified [S26] |
| 2024-12-26 (Dey 1403) | Iranian exchanges' payment gateways | CBI/Shaparak blocked the gateways; partially reversed in Jan 2025 on conditions (ten data items); only a few small/medium exchanges reopened at first | weeks-long; no closure in the last 90 days | reported, medium [S44] (the brief's "Dey 1404" is NOT evidenced) |
| 2026-09-30 to 2026-10-04 | All Iranian USDT trading | CBI-ordered nightly halt 21:00-09:00 and 2,000 USDT/user/day buy cap; extension unknown | 4 days (so far) | reported, medium [S44] |

Global reference class (analyst recollection, **not verified in-session**; use only to shape the duration mixture): Mt. Gox 2014 (first repayments ~10 years later); FTX Nov 2022 (~27 months to first distributions); Celsius Jun 2022 (~19 months); WazirX hack Jul 2024 (~$235M; ~15 months to restructured relaunch); Bybit hack Feb 2025 (~$1.46B; solvent, withdrawals continued); Garantex takedown Mar 2025. Verify via major outlets before citing.

**Duration mixture for simulation** (priors): hack-but-solvent (EXC-01) median 7 days frozen, p90 ~14, recovery 70%; insolvency (EXC-02) 540 days, recovery 50%; fiat-rail/gateway closure (EXC-05) median 240h (10 days), p90 720h, matching the weeks-long Dey-1403 episode; designation of the venue (SAN-01) 30 days, 60% of balance stuck (USDT form), recovery 80%; policy changes (EXC-03) 12h/day unavailable for a median 7 days (p90 30; the latest episode is 4 days). **Exchange balance cap: lock days + 1 = about 4 days of conversion needs** (the 72h lock makes <= 1 day structurally impossible - specialist 02, C13); no idle balances beyond that.

### 6. Operational security (control design; no new incident statistics were researched)

| Topic | Controls | Register / CTL |
|---|---|---|
| Key management | cold multisig reserve (2-of-3 across independent devices and people; Tron account permissions with thresholds or an EVM Safe); hot wallet holds only the JIT amount (<= 2 days of outflow); seeds never in chat/email/cloud notes | OPS-01, OPS-07; CTL-09 |
| Hot/cold separation | separate wallets for reserve, hot, provider top-ups; no wallet reuse across roles; per-day outflow limits | CTL-04, CTL-10 |
| Address whitelisting | allow-list in the application (not only at the exchange); new addresses inactive 24-72h; labelled; two approvals to add; micro test transfer for new provider addresses | CTL-10 |
| Address poisoning | never copy addresses from history; compare the full string, not first/last characters; use QR/addresses from the provider's authenticated dashboard; signing UI shows the full address | OPS-02; CTL-11 |
| SIM-swap and Telegram takeover | no SMS-only 2FA on privileged accounts; hardware keys/passkeys or TOTP; Telegram cloud password and weekly active-session review; rotate bot tokens; admin actions confirmed out-of-band in the admin panel; separate admin identities | OPS-03; CTL-12 |
| Exchange/provider accounts | dedicated email per service, security keys, API keys IP-restricted and without withdrawal rights for pricing | CTL-12 |
| Insider risk | segregation of duties, maker-checker for refunds/price overrides/card reveals, immutable audit log, least privilege, rotation and leave policy, card details auto-redacted after delivery | OPS-04; CTL-13, CTL-14 |
| Phishing / fake support | callback verification, provider communications only via dashboard-listed channels | OPS-06 |
| Key-person risk | sealed recovery and succession instructions with counsel; no single holder of all signing authority; annual succession test | OPS-07; CTL-26 |
| Application security | dependency pinning, SAST, WAF, secrets vault, pen-test before go-live | OPS-05; CTL-29 |

### 7. Lawful mitigations

#### 7.1 SDN screening specification (implementable)

- **Data:** the OFAC SDN list is public. Fetch the consolidated list (XML/CSV; digital-currency addresses appear as identifiers of type "Digital Currency Address - <ticker>", e.g. USDT, ETH, XBT) from OFAC's sanctions-list service; poll at least twice daily, diff against the previous version, store version hash and fetch time. *(Format and endpoint from analyst knowledge - the OFAC host was blocked; verify.)* Add the project's own deny list from `data/sanctions_timeline.json` `entities` (designated exchanges) and the Tether blacklist.
- **Reality check on size and format [S45, read directly]:** a public GitHub mirror (0xB10C) that regenerates the lists nightly from OFAC's `sdn_advanced.xml` (per its README; files `sanctioned_addresses_<TICKER>.txt/.json` on the `lists` branch, 18 currencies) contained **167 USDT-labelled addresses (114 in Tron format, 53 EVM) and 150 ETH addresses** when read on 2026-10-02 (counts are the fetch tool's summary; its TRX and XBT counts of exactly 500 and 1,000 look like truncation and are not used; freshness cannot be verified because the API returned 403). The list has no entity labels, so I could not map the six CBI wallets or any exchange address to it (Q15). Takeaway: the sanctioned-address set is small (hundreds to low thousands) - embed it, diff it nightly, and screen by exact match.
- **Commercial analytics** (Chainalysis, TRM, Elliptic) are US/EU vendors that may refuse Iran-based customers; **never obtain access through another person's or entity's identity**. If unavailable, the free list-based controls plus caps and provenance logs are the compliant baseline.
- **Matching:** addresses by exact match (Tron base58 is case-sensitive; compare EVM addresses lowercased); names with transliteration variants (Persian to Latin) and manual review; keep reviewer notes.
- **Tether check:** call `isBlackListed(address)` on the USDT contracts - Tron `TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t`, Ethereum `0xdAC17F958D2ee523a2206206994597C13D831ec7` (well-known; verify on the explorers).
- **Screening points:** customer onboarding (name), every inbound transfer (sender), every outbound transfer (destination and provider deposit address), daily re-screen of held addresses, before each provider top-up, whenever a provider or exchange is added.
- **Decisions:** exact SDN or blacklisted -> block, quarantine, alert, no onward transfer, call counsel; labelled designated-exchange hot wallet -> block; unknown -> proceed within caps; after any new designation touching a source -> stop new purchases from it, re-screen provenance, notify counsel.

#### 7.2 Transaction-monitoring rules

| Rule | Trigger | Action |
|---|---|---|
| TM-1 | inbound USDT from SDN-listed, blacklisted or labelled designated-exchange address | block + quarantine + alert |
| TM-2 | top-up to an address not on the allow-list | block |
| TM-3 | provider balance vs ledger > 0.5% | pause provider |
| TM-4 | test withdrawal > 72h or refused | float cap 0, pause |
| TM-5 | >= 3 Tether freezes on counterparties in 7 days | raise alert level, reduce float caps by half |
| TM-6 | treasury balance > cap | sweep or alert |
| TM-7 | one customer above daily/cumulative order thresholds | manual review (fraud/AML) |
| TM-8 | refund requests > 3% of orders | ops review |
| TM-9 | OFAC/Treasury text names a used exchange or provider | kill switch + counsel |
| TM-10 | card reveals per operator per hour above threshold | alert |

#### 7.3 Kill switches (CTL-08) and states

States per provider / exchange / rail / product: **Normal -> Watch -> Restricted -> Halt**. Automatic transitions on red KRIs (sections 4.4, 7.2); owner-only manual override, logged; pre-approved customer notices; resume only after the incident review. Float caps and the owner's authority matrix are defined once (CTL-04).

#### 7.4 Incident response and record-keeping

- **Playbooks (CTL-15):** provider freeze; exchange hack/halt; key compromise; designation event; Tether freeze of an own wallet; internet blackout; data leak; wrong-address transfer. First-hour actions: contain (kill switch), preserve logs, notify counsel and owner, freeze new fulfilment on the affected rail, draft customer notice. Quarterly tabletop.
- **Records (CTL-16):** KYC, orders, provenance tags per USDT lot, screening logs, decisions, ToS snapshots; retention: Iranian AML law minimum >= 5 years (specialist 04 F34, low confidence) and **10 years recommended** for sanctions-related records (the US limitation period for sanctions violations was extended to 10 years in 2024 - analyst recollection, verify); tamper-evident storage.

#### 7.5 Customer-facing risk disclosure (draft for counsel; Persian)

> **افشای ریسک (پیش‌نویس برای بازبینی مشاور حقوقی)**
> ۱. این سرویس، خدمات دیجیتال شخص ثالث (کارت، شارژ، اشتراک) را تهیه و تحویل می‌دهد. ارائه‌دهندگان خارجی ممکن است بنا به سیاست‌ها، محدودیت‌های منطقه‌ای یا تحریم‌ها حساب، کارت یا اشتراک را بدون اطلاع قبلی محدود، مسدود یا لغو کنند.
> ۲. برخی سرویس‌ها (از جمله ابزارهای هوش مصنوعی) ایران را در فهرست کشورهای پشتیبانی‌شده‌ی خود ندارند؛ استفاده از آن‌ها ممکن است مغایر شرایط استفاده‌ی ارائه‌دهنده باشد و به بسته شدن حساب بینجامد.
> ۳. ما کنترلی بر تصمیم ارائه‌دهنده نداریم. سیاست بازگشت وجه در چنین حالتی: [الحاق متن سیاست بازپرداخت].
> ۴. شما مسئول درستی اطلاعات هویتی و محل سکونتی هستید که به ارائه‌دهندگان می‌دهید؛ ما از شما نمی‌خواهیم و به شما کمک نمی‌کنیم اطلاعات نادرست ارائه کنید.
> ۵. نرخ‌ها لحظه‌ای‌اند و فقط تا [N] دقیقه قفل می‌مانند؛ بخشی از مبلغ بابت ریسک طرف‌حساب در قیمت لحاظ شده است.
> ۶. موجودی کارت را به‌اندازه‌ی نیاز نگه دارید؛ بازگشت موجودی استفاده‌نشده بسته به ارائه‌دهنده ممکن نیست.

#### 7.6 Counsel - questions to put to a licensed professional

(1) Does selling USDT-funded services to Iran-resident customers expose the owner under E.O. 13902/13224 or "causing violations" theories? (2) Which USDT sources are acceptable now? (3) Is receiving customer USDT permissible under Iranian law and sanctions analysis? (4) What written confirmations should providers give? (5) Disclosure wording and refund policy. (6) Record-keeping periods. (7) Whether to keep a counsel opinion on file per product family. (8) What to do if a counterparty is designated while holding funds.

#### 7.7 Controls catalogue

30 controls (CTL-01 to CTL-30) with type and description are in `data/risk_register.json` `controls`; the ones with the largest modelled effect are **CTL-04/CTL-05 (caps + JIT)**, **CTL-01/CTL-23 (source allow-list; customer USDT off)**, **CTL-06 (diversification)**, **CTL-09/CTL-10 (multisig + allow-list)** and **CTL-17 (disclosure)**.

#### 7.8 Mitigation economics

Caps and JIT cost nothing but network fees and operator time; a screening service is free for list-based controls; counsel and a reserve are the real costs (reserve 0.7%-1.5% of GMV until funded). Compared with an idle policy, the modelled expected loss falls from 2.2% to 0.7% of GMV.

#### 7.9 Owner goals that seem to need evasion: lawful alternative and risk

| Owner goal | Not provided here (guardrail) | Lawful alternative | Remaining risk |
|---|---|---|---|
| Get Toman-bought USDT to a provider reliably | hiding origin via intermediate or fresh wallets, chain-hopping, mixers; borrowed identities for exchange or provider KYC | use non-designated venues; screen; keep provenance logs; get the provider's written acceptance of Iran-resident customers; small floats; disclose | provider may still refuse or close; the venue may be designated; recovery odds of a freeze 3.6% |
| Keep selling AI subscriptions | geo-spoofing/VPN advice, fake billing addresses, borrowed cards or identities, multi-account farming | label as high risk; disclose; cap the line's share of revenue; look for vendors that lawfully serve Iran or domestic alternatives | vendor bans continue; demand multiplier x0.6 in a ban wave |
| Scale beyond ID-based deposit caps | splitting deposits over rented/borrowed accounts to dodge caps | business or higher-tier accounts, OTC with KYC, accounts genuinely owned by the business or real partners with consent | slower scaling |
| Accept customer USDT | accept unscreened and forward | disabled by default; counsel-approved screening policy before enabling | +1.3% of GMV expected loss if unscreened; taint |
| Recover frozen funds | impersonation, pressure | formal petition with counsel | likely total loss |

#### 7.10 Using SDN venues' public price feeds (answer to specialist 02)

Question from 02: may the platform read the public USDT/IRT order books of Nobitex, Wallex, Bitpin or Ramzinex as price inputs? Analysis (not legal advice; counsel to confirm, Q16): reading a free, unauthenticated public endpoint is not a funds transfer and creates no account, fee or property dealing, so the incremental exposure for a non-US, Iran-based operator is low but not zero - the risk rises with anything that looks like a relationship (accounts, API keys, trading, paying fees, sending funds, US-person developers or US-hosted systems touching the endpoints). Recommended policy: (1) primary price inputs from non-designated venues and aggregators; (2) designated venues only as read-only cross-checks inside a >= 3-feed median, public endpoints only, no keys, no accounts, no trading; (3) a feature flag that removes them in one step; (4) log the decision and the counsel opinion; (5) drop them entirely if any US-person or US-hosted component touches the path. These venues carry most of Iran's liquidity (78% of attributed 2025 volume), so excluding them degrades price quality; that trade-off is the owner's, with counsel (D11).

### 8. Risk register (summary; full detail in `data/risk_register.json`)

- **Scales:** likelihood by annual probability (<1%, 1-5%, 5-20%, 20-50%, >50%); impact relative to equity and monthly margin (5 = >30% of equity or business-ending). Ratings: low 1-4, medium 5-9, high 10-15, critical 16-25. Likelihood is **derived from** the simulator's `probability_per_month` so the two never diverge.
- **Counts:** 64 risks - sanctions 9, stablecoin/chain 6, exchange 8, provider 11, vendor 5, payments 6, opsec 8, legal 4, infrastructure 4, treasury 1, reputation 2. Inherent: 8 critical, 34 high, 21 medium, 1 low. Residual after controls: 10 high, 32 medium, 22 low. Expected events/year across always-applicable risks: ~29.8 (intensity measure, not a forecast).

| ID | Risk | p/month | Impact | Inherent | Residual |
|---|---|---|---|---|---|
| SAN-01 | Next OFAC designation hits the exchange used for Toman-to-USDT | 6.0% | 4 | 20 | 15 (high) |
| PAY-01 | Gateway terminates the merchant for crypto/forex association | 3.0% | 4 | 16 | 12 (high) |
| PAY-02 | Bank freezes the receiving account | 2.0% | 4 | 16 | 12 (high) |
| SAN-04 | Non-US counterparties de-risk Iran-linked flows (Outcast) | 4.0% | 4 | 16 | 12 (high) |
| SAN-08 | Tether tightens policy under Senate/Treasury pressure | 4.0% | 4 | 16 | 12 (high) |
| VND-01 | AI vendor ban wave on Iran-linked accounts | 5.0% | 4 | 16 | 12 (high) |
| EXC-03 | Conversion rule changes (72h lock, night halts, caps) | 15.0% | 3 | 15 | 10 (high) |
| EXC-05 | Gateway closure on the exchange's Toman rails | 6.0% | 3 | 15 | 10 (high) |
| INF-01 | National internet shutdown or throttling | 12.0% | 3 | 15 | 10 (high) |
| VND-02 | Vendor blocks prepaid/virtual BIN ranges | 8.0% | 3 | 15 | 10 (high) |
| SAN-02 | Retroactive taint of funds from an exchange later designated | 2.0% | 4 | 16 | 9 (medium) |
| PRV-05 | Provider geo-blocks or terminates Iran-resident customers | 2.0% | 4 | 16 | 8 (medium) |
| TKN-01 | Tether freezes the business treasury or hot wallet | 1.5% | 5 | 15 | 8 (medium) |
| EXC-08 | Emergency halts or capital-flight controls | 4.0% | 3 | 12 | 8 (medium) |
| LEG-01 | Iranian enforcement action vs a crypto-linked business | 0.4% | 5 | 10 | 8 (medium) |

- **Correlation groups** (probability multipliers while active): `WAR_ESCALATION`, `SANCTIONS_WAVE`, `PROVIDER_STRESS`, `REGULATORY_TIGHTENING_IR`, `FIN_STRESS`; **scenario links**: "sanctions event" -> SANCTIONS_WAVE; "provider freeze" -> PROVIDER_STRESS; "internet shutdown" -> WAR_ESCALATION; "gateway blackout" -> REGULATORY_TIGHTENING_IR; "CBI cap cut" -> REGULATORY_TIGHTENING_IR + FIN_STRESS; "devaluation shock" -> FIN_STRESS; "worst case" -> union; "best case" -> all p x 0.5.
- **Exposure modifiers** (`meta.exposure_modifiers`): sourcing USDT from a designated exchange multiplies TKN-01 x6, TKN-03 x3, SAN-02 x3; unscreened customer USDT multiplies TKN-01 x3, TKN-03 x2; provider share > 60% multiplies PRV-01/02/05 x1.5 (assumptions).
- **Simulator mechanics:** each month draw Bernoulli(p x multipliers, capped at 1) per active risk with the seeded `Rng`; durations lognormal with `mu = ln(median)`, `sigma = ln(p90/median)/1.2816` (e.g. INF-01: median 120h, p90 480h -> sigma 1.08); five impact types (`float_freeze_pct`, `downtime_hours`, `fine_irt`, `demand_multiplier`, `fee_change`) are defined in `meta.sim_semantics`; unrecovered frozen share is written off to a counterparty-loss account.
- **Tornado inputs (low / base / high, p per month):** SAN-01 2 / 6 / 15%; PRV-02 0.8 / 1.8 / 5%; PRV-05 0.8 / 2 / 6%; PRV-01 0.2 / 0.5 / 1.5%; TKN-01 0.4 / 1.5 / 5% (recovery fixed 3.6%); EXC-03 8 / 15 / 30%; EXC-05 2 / 6 / 15%; INF-01 6 / 12 / 25%; SAN-05 10 / 22 / 35%; VND-01 2 / 5 / 15%; SAN-04 1.5 / 4 / 10%; SAN-08 1.5 / 4 / 12%; float days 0.5 / 1.5 / 7.

## Implications

**Product (catalog, UX, ops)**
- Attach `risk_label` and `restriction_note` per product family and per provider class (`label_guidance`, `provider_labels` in the register): AI subscriptions high, custodial card top-ups high, customer-paid USDT high (disabled), Toman-to-USDT leg high, voucher medium, domestic Toman-only services low. Show a "last verified" date next to each note.
- Customer USDT inbound **off by default** (CTL-23); Toman rails first (CTL-20).
- Build: SDN/Tether screening service, provider health dashboard (KRIs 4.4), kill-switch states, address allow-list admin, provenance tags per USDT lot, ToS snapshot store.

**Pricing engine**
- Add a **counterparty-loss premium** of 0.7% of GMV (baseline expected loss, lock-aware) up to 1.5% (x2 uncertainty) until the reserve covers 12 months; make it a data parameter, not a constant. Recompute when float days, provider share or the register change. Specialist 12 should adopt the lock-aware exchange cap (lock days + 1) rather than my earlier 1-day rule.
- Treat SAN-05 events (Tether/OFAC waves) as spread-widening triggers (+1pp for 7 days) and shorten price-lock TTL; pass through PRV-04 provider fee changes automatically.

**Simulator**
- Load `data/risk_register.json` and `data/sanctions_timeline.json`; implement the five impact types, correlation groups, exposure modifiers; report tornado on the inputs above. Historic events (`sim_hook` values) can be scripted as scenario shocks: `ofac_exchange_designation`, `tether_mass_freeze`, `sanctions_wave`, `tether_policy_tightening`, `exchange_hack`, `war_escalation`.

**Owner decisions (to be taken explicitly)**
1. USDT sources: only non-designated venues, re-checked daily (D1). 2. Customer USDT: keep disabled until counsel approves (D2). 3. Float caps per counterparty and who may change them (D3). 4. At least two providers per product line (D4). 5. Retain sanctions counsel and keep opinions on file (D5). 6. Approve risk labels and the Persian disclosure (D6). 7. Fund the reserve (D7). 8. Delegate kill-switch authority and on-call (D8). 9. Cap the share of revenue from AI subscriptions (D9). 10. Re-run this research monthly; designations move weekly (D10). 11. Decide, with counsel, whether SDN venues' public prices may be used as read-only cross-checks (D11, section 7.10).

## Conflicts & adjudication

| # | Conflict | Sources | Adjudication | Confidence |
|---|---|---|---|---|
| C1 | 2026-06-02 designation: "real" vs "rumour about two foreign firms" | S1-S9, S19, S20 vs S15-S18 | real; the rumour label belongs to the 2026-01-30 Zedcex/Zedxion action; June statements by the exchanges are acknowledgements, not denials | high |
| C2 | Zedcex date "2025-01-30" in one summary | vs S10-S14 | typo; 2026-01-30 | high |
| C3 | Zedcex volume: "$94 billion" vs "$94 million"; TRM ~$1bn IRGC-linked | S12/S13 vs S15 | unresolved; immaterial for pricing; not used in the simulator | low |
| C4 | Tether Iran-linked freezes: $550M vs CBI $475M vs "112 wallets / $700M" (June 2025) | S24, S23, S40 | $550M = CBI $475M + ~$75M other (2026); the $700M claim is a single analyst, inconsistent with 2025's $1.26bn total; excluded | medium / low |
| C5 | Cumulative frozen: >$4.9bn (Tether) vs $5.69bn (BlockSec, 2026-07-26) | S24, S29 | different definitions and dates; use $4.9-5.7bn | medium |
| C6 | Shelbit/Aban Tether magnitude: "$5M case" vs "$4B scheme" | S26 and relays | use OFAC-attributed direct flows (>$1M and >$2M); $4B unexplained | low |
| C7 | Four individuals: names rendered "Aghamir" and "Kharrazi" | S5, S20 | same two co-founders; names recorded as Kharrazi (also Aghamir) | medium |
| C8 | When the "digital asset sector" entered the E.O. 13902 framework (June vs Outcast 08-24) | S8, S27 | not established; both the FAQ and June designations use E.O. 13902 | low |
| C9 | OpenAI Iran policy: weak sources in my searches vs specialist 06's help-centre and Caixin summaries | S36 vs S48 | Iran excluded; API block from 2024-07-09; confidence medium; verify at help.openai.com | medium |
| C10 | Gateway closure year: brief says "Dey 1404"; specialist 02 evidences only Dey 1403 (2024-12-26) | brief 02 vs S44 | Dey 1403 adopted; EXC-05 corrected and lengthened | medium |
| C11 | Exchange balance cap: my draft "<= 1 day of needs" vs the 72h withdrawal lock (specialist 02, C13) | S44 | structural minimum is lock days (3) so the cap is lock days + 1 = 4 days; CTL-04 and the expected-loss baseline changed (0.585% -> 0.741%) | medium |
| C12 | Date of the CBI wallet freeze: "April 2026" (my summaries) vs 2026-04-24 (specialist 04 F13) | S21, S22 vs S47 | 2026-04-24 adopted; amount 344.2M | medium |
| C13 | Cadence statistic: specialist 04's four-action mean gap 48.7 days omits the 2026-08-07 designation | S47 vs S26 | six actions incl. 08-07 give a mean gap of 46.0 days (0.745 actions/month) | medium |
| C14 | Record retention: >= 5 years (Iranian AML law, specialist 04, low) vs 10 years (US limitation period, my recollection) | S47 | keep >= 5 as legal floor, retain sanctions-related records 10 years; confirm with counsel | low |

## Open questions

| # | Question | verify_how |
|---|---|---|
| Q1 | Are all designated names present in the OFAC SDN list, with which identifiers and any digital-currency addresses? | OFAC Sanctions List Search for each name (Latin and Persian variants); download SDN XML and grep "Digital Currency Address" |
| Q2 | Full texts of releases sb0519, 2026-01-30, 2026-08-07, 2026-09-17, sb0644; any wind-down GL for the exchanges? | OFAC Recent Actions pages for those dates |
| Q3 | 2024-2025 OFAC Iran-crypto actions | Treasury press archive + analytics blogs |
| Q4 | Are Tabdeal, Exir, OMPFinex, Tetherland, Novin Tether, Excoino, Bit24, Arzinja still undesignated? | SDN search on the first of each month; Treasury press feed |
| Q5 | mpay and other providers: ToS restricted jurisdictions, forfeiture, refund of unused balance, Iran-resident eligibility | read ToS, snapshot with hash; written support reply; small live test |
| Q6 | Empirical failure base rates for crypto-card and exchange operators | academic literature (Moore & Christin) + incident trackers; compare with priors |
| Q7 | OpenAI/Google/Microsoft/Netflix/Spotify/Steam supported-country pages and ban enforcement | official pages, dated screenshots; customer reports |
| Q8 | Nobitex post-hack restoration timeline and other Iranian exchange incidents | Nobitex status posts, Persian media for 28 Khordad - Tir 1404 |
| Q9 | Iran internet shutdown dates and durations 2025-2026 | NetBlocks, IODA, Cloudflare Radar |
| Q10 | Address-poisoning and SIM-swap incidence relevant to Iranian crypto users | security vendor reports; community incident logs |
| Q11 | Do commercial analytics vendors contract with Iran-based businesses? | vendor sanctions/eligibility statements; counsel |
| Q12 | OFAC recordkeeping period (10 years?) and Iranian retention rules | OFAC regulations text; specialist 04 |
| Q13 | Does the USDT contract expose `isBlackListed` as assumed (Tron and Ethereum)? | Tronscan/Etherscan contract read |
| Q14 | Does OFAC practice treat customers of designated exchanges as exposed? | counsel opinion; OFAC FAQ updates |
| Q15 | Which entries in the public OFAC-address mirror belong to the CBI wallets (Apr/Jul 2026) or to any designated exchange? | download SDN advanced XML and read the identifier remarks per entity; compare with the mirror files |
| Q16 | May SDN venues' public price feeds be used as read-only cross-checks (section 7.10)? | counsel opinion; OFAC FAQ on informational materials / services |
| Q17 | How fresh is the mirror (last regeneration date) and do its counts match OFAC's own file? | commit history of the mirror (needs GitHub access); diff against sdn_advanced.xml |

## Sources

All items are "per search summary" unless marked **seen directly**; blocked hosts could not be fetched.

- [S1] https://www.trmlabs.com/resources/blog/three-enforcement-layers-in-five-months-ofac-designates-irans-domestic-crypto-exchanges - TRM Labs, three enforcement layers; volumes; 78%/$7.7bn (F04).
- [S2] https://crystalintelligence.com/sanctions/crypto-sanctions-screening-ofac-targets-iran-exchanges/ - Crystal, screening guidance.
- [S3] https://www.scorechain.com/blog/ofac-iran-crypto-sanctions-june-2026 - Scorechain, four exchanges, compliance.
- [S4] https://www.chainalysis.com/blog/ofac-sanctions-iranian-crypto-exchanges-june-2026/ - Chainalysis, June designation.
- [S5] https://www.elliptic.co/blog/ofac-sanctions-nobitex-and-three-other-iranian-cryptoasset-exchanges - Elliptic, entities, $40bn flows, outflows after strikes.
- [S6] https://home.treasury.gov/news/press-releases/sb0519 - Treasury release title/URL (page blocked).
- [S7] https://x.com/USTreasury/status/2061898713916948560 - Treasury post (summary only).
- [S8] https://ofac.treasury.gov/faqs/1257 - OFAC FAQ 1257 (per summary; blocked).
- [S9] https://www.theblock.co/post/403436/us-sanctions-nobitex-iranian-crypto-exchanges-economic-fury-campaign - The Block.
- [S10] https://cointelegraph.com/news/us-treasury-sanctions-iran-linked-crypto-exchanges-first-time - Cointelegraph, January action.
- [S11] https://www.coindesk.com/policy/2026/01/31/u-s-imposes-sanctions-on-crypto-exchanges-tied-to-iran-for-first-time - CoinDesk, January action.
- [S12] https://www.elliptic.co/insights/ofac-sanctions-exchanges-zedcex-and-zedxion-for-assisting-in-iranian-sanctions-evasion-and-irgc-operations/ - Elliptic, Zedcex/Zedxion.
- [S13] https://www.trmlabs.com/resources/blog/ofac-sanctions-zedcex-and-zedxion-in-first-ever-designation-of-an-irgc-linked-digital-asset-exchange - TRM, Zedcex.
- [S14] https://www.chainalysis.com/blog/ofac-designates-iranian-crypto-exchanges-january-2026/ - Chainalysis, January.
- [S15] https://www.zoomit.ir/iran-news/456187-nobitex-denied-banning-by-usa/ (and 456181) - Zoomit, January denial (fa).
- [S16] https://www.ompfinex.com/blog/truth-about-iran-crypto-exchange-sanctions - OMPFinex (fa).
- [S17] https://way2pay.ir/497871/ - Way2Pay (fa).
- [S18] https://nobitex.ir/mag/nobitex-sanction/ - Nobitex Mag (fa).
- [S19] https://www.zoomit.ir/iran-news/460670-crypto%20platform-statement-on-new-sanctions/ - June statements; also Digiato, Iranbroker (Bitpin, Wallex, Nobitex), Bankavl (fa).
- [S20] https://www.iranintl.com/202606022403 - Iran International; also Radio Farda, Euronews Persian, TGJU, IranWire, The National.
- [S21] https://www.trmlabs.com/resources/blog/ofac-sanctions-crypto-addresses-associated-with-the-central-bank-of-iran-freezes-usd-344-million - TRM, CBI April.
- [S22] https://www.chainalysis.com/blog/central-bank-of-iran-designation-ofac-update-april-2026/ - Chainalysis, CBI April.
- [S23] https://www.coindesk.com/business/2026/07/16/u-s-adds-four-iran-central-bank-crypto-wallets-to-sanctions-tether-freezes-usd131-million-of-contents - CoinDesk, CBI July; also Bitcoin Foundation.
- [S24] https://thedefiant.io/news/regulation/tether-says-it-helped-freeze-nearly-550-million-in-iran-linked-usdt - Tether $550M; also CryptoTicker, Coinpedia, Cryptonomist, KuCoin News.
- [S25] https://cryptoslate.com/tether-claims-550-million-in-iran-freezes-but-35-million-slipped-past-senate/ - Senate PSI; also crypto.news, Zyphe.
- [S26] https://www.coindesk.com/policy/2026/08/07/u-s-widens-iran-crypto-crackdown-with-sanctions-on-two-exchanges - Shelbit/Aban Tether; also Mishcon, TFTC, CoinPaprika, FinCrime Agent, VeriHound, Crypto Times, Treasury release copy on globalsecurity.org.
- [S27] https://www.paulhastings.com/insights/client-alerts/treasury-issues-additional-iran-related-sanctions-suspends-general-licenses-and-pledges-additional-action-under-operation-economic-outcast - Outcast; also Orrick, Baker McKenzie, Davis Polk, Paul Weiss, Cassidy Levy Kent, Regtechtimes, ABA Banking Journal.
- [S28] https://hoodline.com/2026/09/treasury-sanctions-iran-s-bitbank-crypto-exchange-tied-to-zanjani-irgc-cash/ - BitBank; also Crowdfund Insider, TFTC, TRM, Startup Fortune, VOA, Treasury release copy.
- [S29] https://blocksec.com/blog/1-26-billion-frozen-usdt-blacklisting-on-ethereum-and-tron-in-2025 - BlockSec 2025 statistics; also usdt-blacklist-explained-2026 (9,597 addresses, $5.69bn), destroyblackfunds; Cointelegraph, crypto.news.
- [S30] https://cointelegraph.com/news/tether-blacklist-delay-allowed-78-million-usdt-move - AMLBot freeze-delay study; also Decrypt.
- [S31] https://forklog.com/en/tether-to-block-payments-evading-sanctions/amp - Tether SDN policy; also AMLCrypto.
- [S32] https://www.emmlegal.com/news/recover-frozen-usdt-a-guide-to-tether-wallet-freezes/ - recovery paths; also BlockSec how-to-unfreeze, Decrypt/Defiant lawsuit.
- [S33] https://fortune.com/crypto/2025/06/18/nobitex-gonjeshke-darande-predatory-sparrow-iran-israel-hack - Nobitex hack; also PBS, Crowdfund Insider, Scorechain, Bitdefender.
- [S34] https://platform.claude.com/docs/en/api/supported-regions - **seen directly 2026-10-02**; Iran not listed.
- [S35] https://the-decoder.com/anthropic-bans-companies-majority-controlled-by-china-russia-iran-and-north-korea-from-claude/ - Anthropic policy 2025-09-05; also RTE, Medianama, Malay Mail.
- [S36] https://community.openai.com/t/access-to-chatgpt-from-iran-without-vpn-may-2025-is-access-restored/1250817 - OpenAI community thread; SEO sites (weak).
- [S37] https://www.zoomit.ir/tech-iran/444862-tether-stablecoin-freeze-risk-iran/ - Persian Tether-freeze explainers; also Arzdigital, Tabdeal Academy, Iranbroker.
- [S38] https://crypto.news/iran-crypto-giant-nobitex-hit-by-sanctions-questions-reuters/ - Reuters relay; also Yahoo Finance "700% outflows", wublock substack.
- [S39] https://blog.amlbot.com/binance-processed-7-8-billion-worth-transactions-for-iranian-crypto-exchange-nobitex-despite-us-sanctions/ - Reuters 2022 relay.
- [S40] https://coinedition.com/tether-freezes-usdt-wallets-iran-sanctions-fear/ - 112 wallets (single analyst); Reuters via TradingView on Israel NBCTF 187 wallets.
- [S41] https://cryptotimes.io/2026/10/02/us-treasury-blocks-russia-linked-a7-network-iran-used-to-move-money - A7 network; Treasury sb0644 title.
- [S42] docs/business-plan-full-context.md - internal first-pass research (unverified secondary claims on mpay and exchange limits).
- [S43] https://blog.globalledger.io/research-investigations/ofac-nobitex-iranian-crypto-exchanges - Global Ledger; also transnetinc.com, sanctionslawyers.net, Crystal "Crypto use in Iran".
- [S44] docs/03-research/02-ir-exchanges-usdt-rails.md - specialist 02 research doc: policy timeline 2022-2026, Mehr-1405 halt (2026-09-30 to 10-04), 72h lock, gateway closure Dey 1403, 18-venue landscape, late-Feb-2026 shutdown (internal; not re-verified here).
- [S45] https://raw.githubusercontent.com/0xB10C/ofac-sanctioned-digital-currency-addresses/lists/sanctioned_addresses_USDT.txt (and README on `main`) - public mirror of OFAC SDN digital-currency addresses; **seen directly 2026-10-02**; counts per the fetch tool's summary (USDT 167, ETH 150); freshness unverifiable.
- [S46] docs/03-research/03-ir-payments-collection.md - specialist 03: Shaparak stance on crypto/VPN/betting merchants, card-to-card caps, TRC20 contract corroboration (internal).
- [S47] docs/03-research/04-legal-tax-ir.md - specialist 04: CBI as sole regulator, currency-smuggling fine, AML retention, CBI freeze dated 2026-04-24, usdtPaymentForResidents=false (internal).
- [S48] docs/03-research/06-service-catalog.md - specialist 06: Anthropic page first-hand; OpenAI help-centre page and Caixin 2024-06-26 per summaries (internal).
