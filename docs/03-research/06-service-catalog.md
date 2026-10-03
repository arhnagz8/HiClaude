---
title: Service catalogue and demand map - what Iranians buy with foreign-currency cards
owner_agent: 06-service-catalog-demand
as_of: 2026-10-02
confidence: medium for list prices of flagship SKUs; low for competitor quotes, demand tiers and vendor-policy notes (see section 0)
status: draft
---

# Service catalogue and demand map (کاتالوگ خدمات و تقاضا)

Companion files: `data/catalog.json` (128 SKUs, machine-readable, validated), `scripts/research/06_margin_table.py` (cost model + tables below), `scripts/research/06_build_catalog.py` (generator of the JSON; re-runnable). Analysis only - not legal or tax advice; confirm with a licensed Iranian lawyer and tax adviser before launch.

## خلاصه (برای مالک)

- **محدودیت اصلی این گزارش:** سقف جست‌وجوی وب برای کل نشست (۲۰۰ بار) تمام شد. ۴۸ جست‌وجو را من اجرا کردم و فقط سه صفحه‌ی رسمی را مستقیم خواندم (قیمت Claude، پلن‌های GitHub Copilot، فهرست کشورهای پشتیبانی‌شده‌ی Anthropic)؛ بقیه‌ی سایت‌ها توسط پروکسی مسدود بود. هر عدد در فایل داده برچسب `verified / reported / UNVERIFIED` دارد و آنچه منبع ندارد صریحاً «تأییدنشده» است.
- **کاتالوگ:** ۱۲۸ محصول در ۱۵ دسته. برای ۸۱ محصول قیمت رسمی دلاری ثبت شد (۱۶ با اطمینان بالا، ۴۱ متوسط، ۲۴ پایین)؛ ۴۷ محصول مصرفی یا بدون قیمت قابل‌راستی‌آزمایی است.
- **ریسک:** ۹۸ محصول «ریسک بالا» و ۳۰ محصول «متوسط» است؛ هیچ محصولی «کم‌ریسک» نیست. Anthropic ایران را در فهرست کشورهای پشتیبانی‌شده ندارد (مستقیم دیده شد) و OpenAI هم نه (طبق خلاصه‌ی جست‌وجو). ریسک تعلیق حساب مشتری واقعی است و باید در شرایط خدمات و صفحه‌ی پرداخت افشا شود.
- **توصیه‌ی عملی (موقتی تا تأیید وکیل):** ۱۳ محصول «نفروش» (تبلیغات گوگل/متا/تیک‌تاک/ایکس، پی‌پال/وایز/پیونیر، آپ‌ورک/فایور، حساب توسعه‌دهنده‌ی اپل/گوگل، تمو، ایربی‌ان‌بی)؛ ۳۰ محصول فقط پس از تأیید حقوقی (استریم‌ها، گیفت‌کارت‌های منطقه‌ای، VPN، تلگرام و …)؛ ۸۵ محصول با افشای ریسک.
- **بازار دو لایه:** در نمونه‌ی ما، «اشتراک ChatGPT Plus» ۱۵۸ هزار تا ۱٫۳۹ میلیون تومان بود، یعنی حدود ۳٪ تا ۳۳٪ ارزش دلاریِ رسمی؛ برای Spotify حدود ۱۱ تا ۱۵٪ و برای Netflix حدود ۱ تا ۱۴٪. این‌ها محصول رسمی نیستند (حساب اشتراکی/منطقه‌ای/اسلات) و ما آن مدل را تکرار نمی‌کنیم؛ رقابت ما با لایه‌ی «حساب اختصاصی / شارژ کارت به نام خود مشتری» است.
- **نرخ ارز:** تتر از ۱۷۶٬۶۷۹ تومان (۱۱ تیر) به ۲۵۸٬۱۹۰ (۸ مهر) رسید: ۴۶٪ افزایش در ۹۰ روز و ۲۳٫۵۵٪ فقط در ۳۰ روز آخر. قیمت صرفاً دلاریِ ChatGPT Plus (۲۰ دلار) از ۳٫۵۳ به ۵٫۱۶ میلیون تومان رسید.
- **حاشیه‌ی سود:** سفارش‌های کوچک را هزینه‌های ثابت می‌خورد: هزینه‌ی نهایی برای ۲۰ دلار حدود ۱۲٪ و برای ۱۰ دلار حدود ۱۸٪ بالاتر از «دلار × نرخ» است؛ با برداشت دسته‌ای ۱۰ سفارش به حدود ۷٫۷٪ و ۹٪ می‌رسد. گیفت‌کارت‌ها کالایی‌اند: برای رسیدن به قیمت رقبای نمونه (استیم) فقط ۰٫۸ تا ۵٫۳٪ کاهش هزینه‌ی تأمین لازم است ولی حاشیه‌ی سود صفر می‌ماند.
- **قیمت‌های رقبا قدیمی‌اند:** قیمت‌های استیم نرخ ضمنی ~۲۰۹ تا ۲۱۹ هزار تومان به ازای هر دلار دارند (هم‌خوان با تتر شهریور، نه ~۲۵۸ هزار امروز)؛ بدون تاریخ‌اند و برای قیمت‌گذاری امروز مستقیم قابل‌استفاده نیستند.
- **تقاضا (قضاوت، نه سنجش):** سطح S: کارت مجازی/شارژ ارزی، ChatGPT Plus، گیفت‌کارت استیم. سطح A: Claude، Gemini، Cursor، میدجرنی، اسپاتیفای، یوتیوب پریمیوم، نتفلیکس، سرور/دامنه، پلی‌استیشن، آزمون‌ها و … شاخص فرضیِ سهم سود بالقوه: هوش مصنوعی حدود ۳۵٪، کارت حدود ۱۹٪، بازی حدود ۱۳٪.
- **تغییر قیمت فروشندگان:** در ۲۰۲۶ قیمت دلاری اشتراک‌ها ۵ تا ۱۸٪ بالا رفت (میانه‌ی ۱۲٫۸٪ در ۴ فروشنده). موتور قیمت باید تغییر قیمت دلاریِ فروشنده را مثل تغییر نرخ ارز دنبال کند.
- **کار باقی‌مانده:** فهرست جست‌وجوهای آماده (ضمیمه‌ی A) را پس از افزایش سقف جست‌وجو اجرا کنید تا قیمت رقبا (حداقل ۳ نقل‌قول تاریخ‌دار برای هر محصول شاخص)، فهرست کارت‌های پذیرفته/ردشده و هزینه‌ی آزمون‌ها تکمیل شود.

## TL;DR

- **Scope delivered:** 128 SKUs in 15 categories (target was >=80); 81 carry an official USD list price (16 high / 41 medium / 24 low confidence; 47 are usage-based or unpriced -> `null` + `UNVERIFIED`); 20 flagship SKUs have a full margin table at three FX levels.
- **Evidence limit (binding):** the session-wide WebSearch cap (200) ran out after 48 searches by this specialist (>=40 required); WebFetch reached only 3 official pages. Competitor quotes (>=3 dated per flagship SKU) are **not** met: 5 of 20 flagship SKUs have any quote, 3 have a comparable one, all undated.
- **Risk:** 98 SKUs `high`, 30 `medium`, 0 `low`. Anthropic's supported-regions page does not list Iran (read first-hand); OpenAI's list also excludes Iran and API traffic from unsupported countries has been blocked since 2024-07-09 (per summaries). 13 SKUs `do_not_offer`, 30 `legal_review_required`, 85 `offer_with_disclosure` (all provisional until counsel signs off).
- **Official 2026 USD prices (US list):** ChatGPT Plus $20, Pro $100 (new, 2026-04-09) / $200; Claude Pro $20 ($17/mo annual), Max from $100 (5x) / $200 (20x); Google AI Plus $4.99 / Pro $19.99 / Ultra $99.99 or $199.99 (cut from $249.99 in May 2026); Perplexity Pro $20; Midjourney $10/$30/$60/$120; Cursor Pro $20; Copilot Pro $10, Pro+ $39, Max $100; Netflix $8.99/$19.99/$26.99; YouTube Premium $15.99; Adobe CC All Apps $59.99; Microsoft 365 Personal $99.99/yr.
- **FX shock context:** USDT/IRT 176,679 (2026-07-02) -> 207,597 (2026-08-31) -> 258,190 (2026-09-30): +46.1 % in 90 days, +23.55 % in the last 30. The pure-USD Toman price of ChatGPT Plus went 3.53M -> 5.16M IRT.
- **Two-tier Iranian retail market:** shared / regional / invite-slot offers sit at ~3-33 % of the official USD-equivalent (ChatGPT Plus 158k-1.39M IRT; Spotify 360k-418k; Netflix 95k-771k) and are structurally non-comparable; official-price-tier offers sit near USDT + 2.5-22 % (Steam codes, Copilot Pro 'dedicated') depending on the unknown listing date.
- **Margin structure (A/C modes, 3 % provider fee placeholder, 1 USDT network fee per order):** landed cost is 18.3 % over USD x FX at $10, 12.3 % at $20, 7.6 % at $100; batching 10 orders per withdrawal cuts that to 9.0 % / 7.7 % / 6.6 %. FX -10 % / +20 % moves cost -9.9 % / +19.9 %.
- **Recommended price (catalog default margin) for ChatGPT Plus at 257k:** 6,639,000 IRT (eff. 331,950 IRT/USD) - 3.7 % above the top of the 1.3-6.4M IRT band in the internal doc; at +20 % FX: 7,958,000; at -10 %: 5,980,000.
- **Commodity vouchers are thin:** vs the Steam quotes (est. competitor markup +2.5-3.7 % if the listings date from 31 Aug; +20-22 % if from 2 Jul) our landed cost already exceeds the competitor-equivalent price in the main case (headroom -1.9 % to -5.1 %), so even a 0 % margin would not match; matching needs a 0.8-5.3 % lower supplier cost (batch 10 / batch 1). Under the 2 Jul anchor headroom is +11.6 % ($20) and +15.2 % ($100).
- **Vendor re-pricing process:** 12 plan-level USD hikes at 4 vendors in 2026, +5.3 % to +17.7 % (median +12.8 %); roughly one hike per vendor-year. Treat as ~4 independent events.
- **Demand ranking (judgement, E1-E4 evidence):** S = vcard-topup-50/100, vcard-new-card-load-25, chatgpt-plus, steam-wallet-20; 29 SKUs tier A. Index share (assumption-driven): AI 35 %, cards 19 %, gaming 13 %.
- **Do not offer (lawful alternatives in the JSON):** Google/Meta/TikTok/X ads, PayPal/Wise/Payoneer, Upwork/Fiverr, Apple/Google developer accounts, Temu, Airbnb; VPN, regional gift cards and streaming need legal clearance first.

## 0. Evidence quality - read before using any number

This brief ran under two hard limits. (1) **WebSearch budget:** the session-wide cap of 200 calls was exhausted; this specialist executed 48 searches (Persian + English; standard mode except one extended) before four further calls were refused. (2) **WebFetch egress policy:** 33 vendor/price hosts were blocked (Appendix B); only `claude.com/pricing`, `github.com/features/copilot/plans` and `anthropic.com/supported-countries` were read first-hand. The proxy README says not to route around a policy denial, so no workaround was attempted. Everything else is "per search summary" or analyst knowledge, labelled as such.

Provenance is stored on every Record in `data/catalog.json`:

| `kind` | meaning | status / confidence rule |
|---|---|---|
| `fact` | value seen in a source this run | `verified` = fetched from the official page; `reported` = read in a search summary. confidence `high` only with a direct fetch or >=3 independent domains; `medium` = 2 independent or 1 reputable news item; `low` = single weak source |
| `prior` | analyst prior knowledge, not checked | `UNVERIFIED`, `low` |
| `assumption` | modelling parameter (typical order, repeat cadence, floors) | `UNVERIFIED`, `low`; tunable, admin overrides win |
| `judgement` | analyst ranking (demand tier, risk label where the vendor page was not read) | `UNVERIFIED`, `low` |
| `policy` | catalogue default the pricing specialist may override (margin bands) | `UNVERIFIED`, `low` |
| `definition` | denomination / identifier (face value of a gift card) | n/a |

Coverage by category (generated from the JSON):

| category | SKUs | with official USD | USD conf H / M / L | restriction note sourced | with competitor quotes | risk H / M | offer / disclose / legal-review / do-not-offer |
|---|--:|--:|--:|--:|--:|--:|--:|
| AI | 34 | 32 | 7 / 20 / 5 | 9 | 2 | 33 / 1 | 0 / 34 / 0 / 0 |
| Dev / cloud | 11 | 6 | 0 / 1 / 5 | 2 | 0 | 10 / 1 | 0 / 11 / 0 / 0 |
| Design / productivity | 13 | 11 | 3 / 5 / 3 | 0 | 0 | 13 / 0 | 0 / 13 / 0 / 0 |
| Messaging | 2 | 0 | 0 / 0 / 0 | 1 | 0 | 0 / 2 | 0 / 0 / 2 / 0 |
| Ads | 5 | 0 | 0 / 0 / 0 | 1 | 0 | 4 / 1 | 0 / 0 / 1 / 4 |
| Media | 12 | 12 | 6 / 4 / 2 | 3 | 2 | 12 / 0 | 0 / 0 / 12 / 0 |
| Gaming | 16 | 9 | 0 / 7 / 2 | 3 | 2 | 10 / 6 | 0 / 7 / 9 / 0 |
| App stores | 4 | 4 | 0 / 0 / 4 | 2 | 0 | 4 / 0 | 0 / 0 / 2 / 2 |
| Education / exams / visas | 10 | 0 | 0 / 0 / 0 | 0 | 0 | 2 / 8 | 0 / 10 / 0 / 0 |
| Freelancing / payments | 5 | 0 | 0 / 0 / 0 | 0 | 0 | 5 / 0 | 0 / 0 / 0 / 5 |
| VPN / security | 2 | 1 | 0 / 0 / 1 | 0 | 0 | 1 / 1 | 0 / 1 / 1 / 0 |
| Telecom | 2 | 0 | 0 / 0 / 0 | 0 | 0 | 0 / 2 | 0 / 2 / 0 / 0 |
| Shopping | 3 | 1 | 0 / 0 / 1 | 0 | 0 | 3 / 0 | 0 / 0 / 2 / 1 |
| Travel | 4 | 0 | 0 / 0 / 0 | 0 | 0 | 1 / 3 | 0 / 2 / 1 / 1 |
| Cards (platform core) | 5 | 5 | 0 / 4 / 1 | 5 | 0 | 0 / 5 | 0 / 5 / 0 / 0 |
| **total** | **128** | **81** | **16 / 41 / 24** | **26** | **6** | **98 / 30** | **0 / 85 / 30 / 13** |

**do_not_offer:** `google-ads-credit`, `meta-ads-credit`, `tiktok-ads-credit`, `x-ads-credit`, `apple-developer-program`, `google-play-developer`, `upwork-connects`, `fiverr-balance`, `paypal-balance`, `wise-balance`, `payoneer-balance`, `temu-order`, `airbnb-stay`

**legal_review_required:** `telegram-premium`, `telegram-stars`, `telegram-ads-credit`, `netflix-ads`, `netflix-standard`, `netflix-premium`, `spotify-individual`, `spotify-duo`, `youtube-premium`, `youtube-premium-lite`, `youtube-premium-family`, `disney-plus-premium`, `apple-one-individual`, `apple-one-family`, `apple-music-individual`, `ps-plus-essential-12m`, `ps-plus-essential-1m`, `ps-plus-extra-12m`, `psn-wallet-50`, `xbox-game-pass-ultimate`, `nintendo-switch-online-12m`, `pubg-mobile-uc`, `free-fire-diamonds`, `codm-cp`, `apple-gift-card-us-25`, `google-play-gift-card-us-25`, `nordvpn-subscription`, `amazon-gift-card-us-50`, `aliexpress-order`, `intl-flight-ticket`

**demand tier S:** `chatgpt-plus`, `steam-wallet-20`, `vcard-new-card-load-25`, `vcard-topup-50`, `vcard-topup-100`

**demand tier A:** `openai-api-credit`, `claude-pro`, `google-ai-pro`, `midjourney-standard`, `cursor-pro`, `digitalocean-droplet-6`, `hetzner-cloud-entry`, `domain-com`, `adobe-cc-all-apps`, `canva-pro`, `telegram-premium`, `netflix-standard`, `spotify-individual`, `youtube-premium`, `steam-wallet-50`, `steam-wallet-100`, `ps-plus-essential-12m`, `psn-wallet-50`, `pubg-mobile-uc`, `apple-gift-card-us-25`, `ielts-exam-fee`, `toefl-ibt-fee`, `embassy-visa-fee`, `paypal-balance`, `nordvpn-subscription`, `amazon-gift-card-us-50`, `aliexpress-order`, `intl-flight-ticket`, `vcard-topup-250`

## Facts table

| id | fact | value | unit | as_of | confidence | sources |
|---|---|---|---|---|---|---|
| F01 | ChatGPT Plus US list price | 20 | USD/month | 2026-10-02 | high | S06, S07 |
| F02 | ChatGPT Pro tiers (new $100 tier launched 2026-04-09; $200 stays) | 100 and 200 | USD/month | 2026-04-09 | high | S07, S06 |
| F03 | ChatGPT Go US price (regionally priced) | ~8 | USD/month | 2026-10-02 | low | S06 |
| F04 | Claude Pro: monthly / annual (billed $200 upfront); prices exclude tax | 20 / 17 per month | USD | 2026-10-02 | high (direct) | S01 |
| F05 | Claude Max: from $100 (5x) / $200 (20x) | 100 / 200 | USD/month | 2026-10-02 | high / medium | S01, S08 |
| F06 | Google AI Plus / Pro / Ultra 5x / Ultra 20x (Ultra cut from $249.99, May 2026) | 4.99 / 19.99 / 99.99 / 199.99 | USD/month | 2026-10-02 | medium | S09 |
| F07 | Perplexity Pro / Max (Pro annual $200) | 20 / 200 | USD/month | 2026-10-02 | medium | S10 |
| F08 | Midjourney Basic / Standard / Pro / Mega (annual -20 %) | 10 / 30 / 60 / 120 | USD/month | 2026-10-02 | medium | S11 |
| F09 | Cursor Pro / Pro+ / Ultra (Pro annual $192) | 20 / 60 / 200 | USD/month | 2026-10-02 | medium | S12 |
| F10 | GitHub Copilot Pro / Pro+ / Max (usage-based AI Credits $15 / $70 / $200 included) | 10 / 39 / 100 | USD/month | 2026-10-02 | high (direct) | S02 |
| F11 | SuperGrok Lite / SuperGrok / Heavy | 10 / 30 / 300 | USD/month | 2026-10-02 | medium | S14 |
| F12 | Adobe CC All Apps / Photoshop / Photography | 59.99 / 22.99 / 9.99 | USD/month | 2026-10-02 | medium | S22 |
| F13 | Canva Pro (annual $180) | 18 | USD/month | 2026-10-02 | medium | S23 |
| F14 | Microsoft 365 Personal / Family / Premium | 99.99 / 129.99 / 199.99 | USD/year | 2026-10-02 | high | S24 |
| F15 | Netflix with ads / Standard / Premium (US) | 8.99 / 19.99 / 26.99 | USD/month | 2026-10-02 | medium | S26 |
| F16 | Spotify Premium Individual / Duo (rounded in source) | ~13 / ~19 | USD/month | 2026-10-02 | low | S28 |
| F17 | YouTube Premium Individual / Family / Lite after Apr-2026 hike | 15.99 / 26.99 / 8.99 | USD/month | 2026-04-10 | high | S29 |
| F18 | Disney+ Premium from 2026-09-23 (was 18.99) | 21.49 | USD/month | 2026-09-23 | high | S30 |
| F19 | Apple One Individual / Family / Premier; Apple Music Individual | 19.95 / 27.95 / 39.95; 11.99 | USD/month | 2026-07-17 | high | S27 |
| F20 | PlayStation Plus Essential 12 mo / 1 mo; Extra 12 mo | 79.99 / 10.99; 134.99 | USD | 2026-05-20 | medium | S31 |
| F21 | Xbox Game Pass Ultimate (conflicts with analyst prior $29.99) | 22.99 | USD/month | 2026-04 | low | S31 |
| F22 | Nintendo Switch Online Individual 12 mo | 19.99 | USD/year | 2026-10-02 | medium | S32 |
| F23 | OpenAI API prepaid credits: minimum purchase / default | 5 / 10 | USD | 2026-10-02 | medium | S18 |
| F24 | Entry VPS: DigitalOcean / Hetzner (EUR 4.35) / Vultr / Linode | 6 / ~4.7 / ~6 / 5 | USD/month | 2026-06-11 | medium / low | S19 |
| F25 | AWS signup: authorization charge; prepaid cards | 1; not supported | USD; bool | 2026-10-02 | medium | S20 |
| F26 | Google Cloud free trial credit / duration; payment method required | 300 / 90 | USD / days | 2026-10-02 | medium | S21 |
| F27 | Iran in Anthropic supported-regions list | false | bool | 2026-10-02 | high (direct) | S03 |
| F28 | Iran in OpenAI supported-countries list; API block of unsupported countries since | false; 2024-07-09 | bool; date | 2026-10-02 | medium | S04, S05, S53 |
| F29 | Google Ads available to advertisers in Iran | false | bool | 2026-10-02 | medium | S38 |
| F30 | Google Play gift cards usable outside purchase country/currency | false | bool | 2026-10-02 | medium | S37 |
| F31 | USDT/IRT, 11 Tir 1405 | 176,679 | IRT per USDT | 2026-07-02 | low | S41 |
| F32 | USDT/IRT, 9 Shahrivar 1405 (two sources within 0.7 %) | 207,597 | IRT per USDT | 2026-08-31 | medium | S40, S39 |
| F33 | USDT/IRT, 8 Mehr 1405 (Nobitex 258,901) | 258,190 | IRT per USDT | 2026-09-30 | medium | S39 |
| F34 | USDT/IRT change: last 7 d / last 30 d to 2026-09-30 | +11.71 / +23.55 | pct | 2026-09-30 | medium | S39 |
| F35 | USDT/IRT change 2026-07-02 -> 2026-09-30 (computed) | +46.1 | pct | 2026-09-30 | low | S41, S39 |
| F36 | Steam $20 gift card, Iranian listings (undated) | 4,301,000 - 4,370,000 | IRT | 2026-10-02 | low | S34 |
| F37 | Steam $100 gift card, Iranian listings (undated) | 21,033,000 - 21,505,000 | IRT | 2026-10-02 | low | S35 |
| F38 | "ChatGPT Plus" Iranian listings (shared / personal / licence), undated | 158,000 - 1,390,000 | IRT | 2026-10-02 | low | S42 |
| F39 | Spotify Premium Individual 1 month, Iranian listings | 360,000 - 418,000 | IRT | 2026-10-02 | low | S44 |
| F40 | Netflix account listings (1 month 95k-130k; ranges 499k-771k) | 95,000 - 770,935 | IRT | 2026-10-02 | low | S45 |
| F41 | GitHub Copilot Pro "dedicated" Iranian listings | 2,300,000 - 3,900,000 | IRT | 2026-10-02 | low | S43 |
| F42 | 2026 US list-price hikes observed: median / range (12 plan points, 4 vendors) | +12.8 / +5.3 to +17.7 | pct | 2026-09-23 | medium | S27, S29, S30, S31 |
| F43 | Internal band for "Plus" in the Iranian market | 1.3M - 6.4M | IRT | 2026-10-02 | low | S50 |
| F44 | Iranian virtual-card / FX-payment competitors named in brief 07 | >=15 | count | 2026-10-02 | low | S52 |

## Details

### 1. Taxonomy and rubrics

**Fulfilment modes** (`fulfilment_modes`, `default_mode`; mode D is `false` for every SKU):

| mode | definition | when allowed |
|---|---|---|
| A | top-up of the customer's OWN payment instrument for the customer's OWN purchase | default for subscriptions, SaaS, AI, cloud, cards |
| B | gift card / voucher / wallet code from a licensed aggregator | default for gaming wallets; codes are country/currency-locked - never sell a region the customer cannot lawfully hold |
| C | direct payment on the customer's behalf (agent model) | only where the payee accepts third-party payers or an agent channel exists; never with a misstated identity/location; legal review by default |
| D | account/seat provisioned and owned by us and handed over (shared accounts, family/team invite slots, resold seats) | only where vendor terms / a reseller programme allow it - no SKU qualifies today |

**Risk label** (`risk_label`, `restriction_note`, `risk_factors`): `low` = vendor not US-bound or globally redeemable product, no Iran exclusion found; `medium` = vendor Iran policy unverified/ambiguous, or the main risk is counterparty/instrument decline or domestic-law ambiguity; `high` = vendor documents or is known to exclude Iran / is sanctions-bound, with plausible suspension, balance loss or refund dispute. Result: 98 high, 30 medium, **0 low** - in this market no product is "low risk"; the lowest tier reached is `medium` (non-US vendors, exam/visa agent payments, card top-ups where the risk sits with the provider).

**Offer recommendation** (`offer_recommendation`): `do_not_offer` (no lawful reseller path), `legal_review_required` (hold until 04/05 clear it in writing), `offer_with_disclosure` (mandatory third-party suspension disclosure + refund policy accepted at checkout; the platform never tells customers to mask location, identity or billing address), `offer`. **All are provisional** until counsel signs off (`meta.gating_note`).

**Demand tiers** (`demand_tier`, judgement): S top-of-market, A strong/steady, B niche/recurring, C long tail. Evidence classes: **E1** Persian "how to buy X in Iran" guides or paid placements on large Iranian media/education sites (seen); **E2** multi-seller listings on an Iranian price aggregator (seen); **E3** competitor prominence (brief 07 roster); **E4** analyst prior knowledge, no evidence this run. No search-volume tool was available, so tiers are low confidence.

### 2. FX context

USDT/IRT anchors (each Record in `meta.fx_anchors`): 176,679 (2026-07-02), 207,597 (2026-08-31), 231,121 (~2026-09-23), 258,190 (2026-09-30), ~256,900 (2026-10-02, internal). The brief's "current ~257k" is therefore consistent with the market, and the +20 % scenario has a precedent (+23.55 % in the 30 days to 2026-09-30).

#### Table 6 - official USD list price x USDT/IRT anchors (price of the pure USD list price in Toman, no fees)

| SKU | USD | 2026-07-02 (11 Tir) | 2026-08-31 (9 Shahrivar) | 2026-09-30 (8 Mehr) | change first->last |
|---|--:|--:|--:|--:|--:|
| chatgpt-plus | 20 | 3,533,580 | 4,151,940 | 5,163,800 | 46.1% |
| claude-pro | 20 | 3,533,580 | 4,151,940 | 5,163,800 | 46.1% |
| google-ai-pro | 19.99 | 3,531,813 | 4,149,864 | 5,161,218 | 46.1% |
| netflix-standard | 19.99 | 3,531,813 | 4,149,864 | 5,161,218 | 46.1% |
| youtube-premium | 15.99 | 2,825,097 | 3,319,476 | 4,128,458 | 46.1% |
| adobe-cc-all-apps | 59.99 | 10,598,973 | 12,453,744 | 15,488,818 | 46.1% |
| ps-plus-essential-12m | 79.99 | 14,132,553 | 16,605,684 | 20,652,618 | 46.1% |
| chatgpt-pro-200 | 200 | 35,335,800 | 41,519,400 | 51,638,000 | 46.1% |

USDT/IRT moved 176,679 -> 258,190 (46.1%) in 90 days (2026-07-02 -> 2026-09-30): the Toman price of every USD-denominated SKU rose by the same factor.

### 3. The catalogue (128 SKUs; `*` = flagship for the margin table)

Columns: official USD | billing cadence | confidence of that price | modes (default) | risk | policy evidence (`sourced` = the restriction note cites a source seen in this run; `prior` = analyst knowledge, UNVERIFIED) | offer recommendation | demand tier | typical order USD (assumption) | number of competitor quotes held. `null` = no verifiable list price (usage-based or not read; status UNVERIFIED). `(prior)` = analyst prior, not verified. Full Records (sources, notes, verify_how, Persian names, price options, risk factors, payment-instrument notes) are in `data/catalog.json`.

#### AI (34 SKUs)

Largest and riskiest class. Official prices are well sourced for the flagship tiers; only Anthropic's Iran exclusion was read first-hand (S03), OpenAI's rests on a summary of its help page plus Caixin (S04, S05). 2026 changes: ChatGPT Pro $100 tier (Apr), Google AI Ultra cut to $99.99/$199.99 (May), Copilot usage-based AI Credits (1 Jun), Cursor credit pools - plan price no longer equals total spend. Go and AI Plus are regionally priced: never exploit that.

| SKU id | official USD | billing | price conf | modes (default) | risk | policy evidence | offer | demand | order USD | quotes |
|---|--:|---|---|---|---|---|---|---|--:|--:|
| `chatgpt-go` | 8 | monthly | low | A (A) | high | sourced | offer_with_disclosure | B | 8 | 0 |
| `chatgpt-plus` * | 20 | monthly | high | A (A) | high | sourced | offer_with_disclosure | S | 20 | 5 |
| `chatgpt-pro-100` | 100 | monthly | high | A (A) | high | sourced | offer_with_disclosure | B | 100 | 0 |
| `chatgpt-pro-200` * | 200 | monthly | high | A (A) | high | sourced | offer_with_disclosure | B | 200 | 0 |
| `openai-api-credit` | null | usage (prepaid credits, one-time purchases) | - | A (A) | high | sourced | offer_with_disclosure | A | 20 | 0 |
| `claude-pro` * | 20 | monthly or annual | high | A (A) | high | sourced | offer_with_disclosure | A | 20 | 0 |
| `claude-max-5x` * | 100 | monthly | high | A (A) | high | sourced | offer_with_disclosure | B | 100 | 0 |
| `claude-max-20x` | 200 | monthly | medium | A (A) | high | sourced | offer_with_disclosure | C | 200 | 0 |
| `claude-api-credit` | null | usage (prepaid credits) | - | A (A) | high | sourced | offer_with_disclosure | B | 20 | 0 |
| `google-ai-plus` | 4.99 | monthly | medium | A (A) | high | prior | offer_with_disclosure | B | 4.99 | 0 |
| `google-ai-pro` * | 19.99 | monthly | medium | A (A) | high | prior | offer_with_disclosure | A | 19.99 | 0 |
| `google-ai-ultra-100` | 99.99 | monthly | medium | A (A) | high | prior | offer_with_disclosure | C | 99.99 | 0 |
| `google-ai-ultra-200` | 199.99 | monthly | medium | A (A) | high | prior | offer_with_disclosure | C | 199.99 | 0 |
| `perplexity-pro` * | 20 | monthly or annual | medium | A (A) | high | prior | offer_with_disclosure | B | 20 | 0 |
| `perplexity-max` | 200 | monthly or annual | medium | A (A) | high | prior | offer_with_disclosure | C | 200 | 0 |
| `midjourney-basic` | 10 | monthly or annual | medium | A (A) | high | prior | offer_with_disclosure | B | 10 | 0 |
| `midjourney-standard` * | 30 | monthly or annual | medium | A (A) | high | prior | offer_with_disclosure | A | 30 | 0 |
| `midjourney-pro` | 60 | monthly or annual | medium | A (A) | high | prior | offer_with_disclosure | B | 60 | 0 |
| `cursor-pro` * | 20 | monthly or annual | medium | A (A) | high | prior | offer_with_disclosure | A | 20 | 0 |
| `cursor-pro-plus` | 60 | monthly | medium | A (A) | high | prior | offer_with_disclosure | B | 60 | 0 |
| `cursor-ultra` | 200 | monthly | medium | A (A) | high | prior | offer_with_disclosure | C | 200 | 0 |
| `copilot-pro` * | 10 | monthly or annual | high | A (A) | high | prior | offer_with_disclosure | B | 10 | 2 |
| `copilot-pro-plus` | 39 | monthly or annual | high | A (A) | high | prior | offer_with_disclosure | C | 39 | 0 |
| `copilot-max` | 100 | monthly | medium | A (A) | high | prior | offer_with_disclosure | C | 100 | 0 |
| `replit-core` | 25 | monthly or annual | medium | A (A) | high | prior | offer_with_disclosure | B | 25 | 0 |
| `lovable-pro` | 21 | monthly | low | A (A) | medium | prior | offer_with_disclosure | B | 21 | 0 |
| `suno-pro` | 10 | monthly or annual | medium | A (A) | high | prior | offer_with_disclosure | B | 10 | 0 |
| `suno-premier` | 30 | monthly or annual | medium | A (A) | high | prior | offer_with_disclosure | C | 30 | 0 |
| `elevenlabs-pro` | 99 | monthly | low | A (A) | high | prior | offer_with_disclosure | C | 99 | 0 |
| `runway-pro` | 28 | monthly (annual-billed price?) | low | A (A) | high | prior | offer_with_disclosure | C | 28 | 0 |
| `heygen-pro` | 99 | monthly | low | A (A) | high | prior | offer_with_disclosure | C | 99 | 0 |
| `supergrok-lite` | 10 | monthly | medium | A (A) | high | prior | offer_with_disclosure | C | 10 | 0 |
| `supergrok` | 30 | monthly | medium | A (A) | high | prior | offer_with_disclosure | B | 30 | 0 |
| `supergrok-heavy` | 300 | monthly | medium | A (A) | high | prior | offer_with_disclosure | C | 300 | 0 |

#### Dev / cloud (11 SKUs)

Card verification, not price, is the binding constraint: AWS rejects prepaid cards and takes a $1 authorization (S20); Google Cloud's trial needs a valid payment method and may refuse prepaid virtual cards (S21). Pay-as-you-go SKUs have no list price - the sale unit is a balance top-up (assumed $25). Hetzner is EUR-priced (EU VAT may apply).

| SKU id | official USD | billing | price conf | modes (default) | risk | policy evidence | offer | demand | order USD | quotes |
|---|--:|---|---|---|---|---|---|---|--:|--:|
| `aws-credit-topup` | null | usage (pay-as-you-go) | - | A (A) | high | sourced | offer_with_disclosure | B | 25 | 0 |
| `gcp-credit-topup` | null | usage (pay-as-you-go) | - | A (A) | high | sourced | offer_with_disclosure | B | 25 | 0 |
| `azure-credit-topup` | null | usage (pay-as-you-go) | - | A (A) | high | prior | offer_with_disclosure | C | 25 | 0 |
| `digitalocean-droplet-6` * | 6 | monthly (hourly metered, monthly cap) | medium | A (A) | high | prior | offer_with_disclosure | A | 25 | 0 |
| `hetzner-cloud-entry` | 4.7 | monthly (EUR) | low | A (A) | medium | prior | offer_with_disclosure | A | 20 | 0 |
| `vultr-cloud-6` | 6 | monthly | low | A (A) | high | prior | offer_with_disclosure | B | 25 | 0 |
| `linode-nanode-5` | 5 | monthly | low | A (A) | high | prior | offer_with_disclosure | B | 25 | 0 |
| `cloudflare-pro` | 25 (prior) | monthly or annual | low | A (A) | high | prior | offer_with_disclosure | B | 25 | 0 |
| `vercel-pro` | 20 (prior) | monthly per seat | low | A (A) | high | prior | offer_with_disclosure | C | 20 | 0 |
| `domain-com` | null | annual | - | A (A) | high | prior | offer_with_disclosure | A | 15 | 0 |
| `google-workspace-starter` | null | monthly per user (annual commitment option) | - | A (A) | high | prior | offer_with_disclosure | B | 84 | 0 |

#### Design / productivity (13 SKUs)

Several quoted monthly prices are probably annual-commitment-billed-monthly (Adobe, Figma, Grammarly, Runway-type) - verify before quoting. Microsoft 365 is annual-only (one large order per year). Family/Duo/Team plans invite slot resale (mode D) - not offered.

| SKU id | official USD | billing | price conf | modes (default) | risk | policy evidence | offer | demand | order USD | quotes |
|---|--:|---|---|---|---|---|---|---|--:|--:|
| `adobe-cc-all-apps` * | 59.99 | monthly (annual commitment likely) | medium | A (A) | high | prior | offer_with_disclosure | A | 59.99 | 0 |
| `adobe-photoshop-single` | 22.99 | monthly | medium | A (A) | high | prior | offer_with_disclosure | B | 22.99 | 0 |
| `adobe-photography` | 9.99 | monthly | medium | A (A) | high | prior | offer_with_disclosure | B | 9.99 | 0 |
| `canva-pro` * | 18 | monthly or annual | medium | A (A) | high | prior | offer_with_disclosure | A | 18 | 0 |
| `figma-professional` | 16 | per seat, annual | medium | A (A) | high | prior | offer_with_disclosure | B | 16 | 0 |
| `notion-plus` | 10 | monthly per seat | low | A (A) | high | prior | offer_with_disclosure | B | 10 | 0 |
| `slack-pro` | 10 | monthly per seat | low | A (A) | high | prior | offer_with_disclosure | C | 10 | 0 |
| `zoom-workplace-pro` | null | monthly or annual per licence | - | A (A) | high | prior | offer_with_disclosure | B | 160 | 0 |
| `m365-personal` * | 99.99 | annual | high | A (A) | high | prior | offer_with_disclosure | B | 99.99 | 0 |
| `m365-family` | 129.99 | annual | high | A (A) | high | prior | offer_with_disclosure | B | 129.99 | 0 |
| `m365-premium` | 199.99 | annual | high | A (A) | high | prior | offer_with_disclosure | C | 199.99 | 0 |
| `dropbox-plus` | null | monthly or annual | - | A (A) | high | prior | offer_with_disclosure | C | 120 | 0 |
| `grammarly-premium` | 12 | monthly or annual | low | A (A) | high | prior | offer_with_disclosure | B | 12 | 0 |

#### Messaging (2 SKUs)

Telegram Premium/Stars: high expected demand (prior, no evidence gathered) but a crypto-native channel (TON/Fragment) - a domestic-law question for specialist 04; both held as legal_review_required.

| SKU id | official USD | billing | price conf | modes (default) | risk | policy evidence | offer | demand | order USD | quotes |
|---|--:|---|---|---|---|---|---|---|--:|--:|
| `telegram-premium` | null | monthly / 3-12 month gift | - | A/B (B) | medium | prior | legal_review_required | A | 30 | 0 |
| `telegram-stars` | null | per star pack | - | A/B (B) | medium | sourced | legal_review_required | B | 25 | 0 |

#### Ads (5 SKUs)

Google Ads is unavailable to advertisers in Iran with no grace period (S38, per summary). Meta/TikTok/X rest on prior knowledge. Do not offer; buying ads through a foreign entity or third-party identity is origin-hiding and excluded by the guardrails.

| SKU id | official USD | billing | price conf | modes (default) | risk | policy evidence | offer | demand | order USD | quotes |
|---|--:|---|---|---|---|---|---|---|--:|--:|
| `google-ads-credit` | null | usage (prepaid/postpay) | - | A (A) | high | sourced | do_not_offer | B | 100 | 0 |
| `meta-ads-credit` | null | usage | - | A (A) | high | prior | do_not_offer | B | 100 | 0 |
| `tiktok-ads-credit` | null | usage | - | A (A) | high | prior | do_not_offer | C | 100 | 0 |
| `x-ads-credit` | null | usage | - | A (A) | high | prior | do_not_offer | C | 100 | 0 |
| `telegram-ads-credit` | null | usage (prepaid) | - | A (A) | medium | prior | legal_review_required | C | 100 | 0 |

#### Media (12 SKUs)

Netflix, Spotify, YouTube Premium, Disney+ and Apple services do not operate in Iran; no vendor-sanctioned purchase path was found, so all 12 are legal_review_required. 2026 hikes: YouTube +14.3 % (Apr), Apple Music +9-18 % (Jul), Disney+ +13.2 % (23 Sep). Cheap Iranian listings in this class are non-comparable (section 4).

| SKU id | official USD | billing | price conf | modes (default) | risk | policy evidence | offer | demand | order USD | quotes |
|---|--:|---|---|---|---|---|---|---|--:|--:|
| `netflix-ads` | 8.99 | monthly | medium | A (A) | high | prior | legal_review_required | C | 8.99 | 0 |
| `netflix-standard` * | 19.99 | monthly | medium | A (A) | high | prior | legal_review_required | A | 19.99 | 0 |
| `netflix-premium` | 26.99 | monthly | medium | A (A) | high | prior | legal_review_required | B | 26.99 | 5 |
| `spotify-individual` * | 13 | monthly | low | A (A) | high | prior | legal_review_required | A | 13 | 2 |
| `spotify-duo` | 19 | monthly | low | A (A) | high | prior | legal_review_required | B | 19 | 0 |
| `youtube-premium` * | 15.99 | monthly | high | A (A) | high | prior | legal_review_required | A | 15.99 | 0 |
| `youtube-premium-lite` | 8.99 | monthly | medium | A (A) | high | prior | legal_review_required | B | 8.99 | 0 |
| `youtube-premium-family` | 26.99 | monthly | high | A (A) | high | prior | legal_review_required | B | 26.99 | 0 |
| `disney-plus-premium` | 21.49 | monthly | high | A (A) | high | prior | legal_review_required | C | 21.49 | 0 |
| `apple-one-individual` | 19.95 | monthly | high | A (A) | high | sourced | legal_review_required | B | 19.95 | 0 |
| `apple-one-family` | 27.95 | monthly | high | A (A) | high | sourced | legal_review_required | C | 27.95 | 0 |
| `apple-music-individual` | 11.99 | monthly | high | A (A) | high | sourced | legal_review_required | C | 11.99 | 0 |

#### Gaming (16 SKUs)

Wallet codes (mode B) are the only instant, low-support SKUs, but margins are thin (section 6). Valve's stance is community-reported only (S33). Mobile-game top-ups (mode C) depend on publisher third-party-payer rules, wrong player ID means lost funds, and many buyers are minors (extra consumer-protection duty).

| SKU id | official USD | billing | price conf | modes (default) | risk | policy evidence | offer | demand | order USD | quotes |
|---|--:|---|---|---|---|---|---|---|--:|--:|
| `steam-wallet-20` * | 20 | one-time code | medium | B (B) | high | sourced | offer_with_disclosure | S | 20 | 4 |
| `steam-wallet-50` | 50 | one-time code | medium | B (B) | high | sourced | offer_with_disclosure | A | 50 | 0 |
| `steam-wallet-100` * | 100 | one-time code | medium | B (B) | high | sourced | offer_with_disclosure | A | 100 | 2 |
| `ps-plus-essential-12m` * | 79.99 | annual | medium | B (B) | high | prior | legal_review_required | A | 79.99 | 0 |
| `ps-plus-essential-1m` | 10.99 | monthly | medium | B (B) | high | prior | legal_review_required | B | 10.99 | 0 |
| `ps-plus-extra-12m` | 134.99 | annual | medium | B (B) | high | prior | legal_review_required | B | 134.99 | 0 |
| `psn-wallet-50` | 50 | one-time code | low | B (B) | high | prior | legal_review_required | A | 50 | 0 |
| `xbox-game-pass-ultimate` | 22.99 | monthly | low | B (B) | high | prior | legal_review_required | B | 22.99 | 0 |
| `nintendo-switch-online-12m` | 19.99 | annual | medium | B (B) | high | prior | legal_review_required | C | 19.99 | 0 |
| `riot-valorant-points` | null | one-time code | - | B (B) | medium | prior | offer_with_disclosure | B | 25 | 0 |
| `roblox-robux-card` | null | one-time code | - | B (B) | medium | prior | offer_with_disclosure | B | 25 | 0 |
| `pubg-mobile-uc` | null | per top-up (player ID) | - | C (C) | medium | prior | legal_review_required | A | 15 | 0 |
| `free-fire-diamonds` | null | per top-up (player ID) | - | C (C) | medium | prior | legal_review_required | B | 10 | 0 |
| `codm-cp` | null | per top-up (player ID) | - | C (C) | medium | prior | legal_review_required | B | 10 | 0 |
| `fortnite-vbucks` | null | one-time code | - | B (B) | medium | prior | offer_with_disclosure | B | 20 | 0 |
| `blizzard-balance` | null | one-time code | - | B (B) | high | prior | offer_with_disclosure | C | 20 | 0 |

#### App stores (4 SKUs)

No vendor-sanctioned way for an Iran-resident customer to redeem a US Apple/Google card (S36, S37); the common 'foreign Apple ID' practice relies on misstating residence and is excluded. Developer-account SKUs: do not offer (identity borrowing).

| SKU id | official USD | billing | price conf | modes (default) | risk | policy evidence | offer | demand | order USD | quotes |
|---|--:|---|---|---|---|---|---|---|--:|--:|
| `apple-gift-card-us-25` | 25 | one-time code | low | B (B) | high | sourced | legal_review_required | A | 25 | 0 |
| `google-play-gift-card-us-25` | 25 | one-time code | low | B (B) | high | sourced | legal_review_required | B | 25 | 0 |
| `apple-developer-program` | 99 (prior) | annual | low | A (A) | high | prior | do_not_offer | B | 99 | 0 |
| `google-play-developer` | 25 (prior) | one-time | low | A (A) | high | prior | do_not_offer | B | 25 | 0 |

#### Education / exams / visas (10 SKUs)

Agent-style payments (mode C) or card loads (mode A) with hard deadlines, non-refundable fees and name-match rules - the natural rush-tier SKUs. No official fee was verified; typical orders ($70-$250) are assumptions.

| SKU id | official USD | billing | price conf | modes (default) | risk | policy evidence | offer | demand | order USD | quotes |
|---|--:|---|---|---|---|---|---|---|--:|--:|
| `coursera-plus` | null | monthly or annual | - | A (A) | high | prior | offer_with_disclosure | C | 60 | 0 |
| `udemy-course` | null | one-time | - | A/C (A) | high | prior | offer_with_disclosure | B | 15 | 0 |
| `duolingo-super` | null | monthly or annual | - | A (A) | medium | prior | offer_with_disclosure | B | 84 | 0 |
| `ielts-exam-fee` | null | per exam | - | A/C (A) | medium | prior | offer_with_disclosure | A | 250 | 0 |
| `toefl-ibt-fee` | null | per exam | - | A/C (A) | medium | prior | offer_with_disclosure | A | 250 | 0 |
| `gre-general-fee` | null | per exam | - | A/C (A) | medium | prior | offer_with_disclosure | B | 230 | 0 |
| `pte-academic-fee` | null | per exam | - | A/C (A) | medium | prior | offer_with_disclosure | B | 250 | 0 |
| `duolingo-english-test` | null | per exam | - | A (A) | medium | prior | offer_with_disclosure | B | 70 | 0 |
| `university-application-fee` | null | per application | - | A/C (A) | medium | prior | offer_with_disclosure | B | 90 | 0 |
| `embassy-visa-fee` | null | per application | - | A/C (A) | medium | prior | offer_with_disclosure | A | 150 | 0 |

#### Freelancing / payments (5 SKUs)

All five: do not offer (sanctions-bound platforms; funding through borrowed accounts is excluded).

| SKU id | official USD | billing | price conf | modes (default) | risk | policy evidence | offer | demand | order USD | quotes |
|---|--:|---|---|---|---|---|---|---|--:|--:|
| `upwork-connects` | null | usage | - | A (A) | high | prior | do_not_offer | B | 30 | 0 |
| `fiverr-balance` | null | usage | - | A (A) | high | prior | do_not_offer | B | 30 | 0 |
| `paypal-balance` | null | per transaction | - | A (A) | high | prior | do_not_offer | A | 100 | 0 |
| `wise-balance` | null | per transaction | - | A (A) | high | prior | do_not_offer | B | 100 | 0 |
| `payoneer-balance` | null | per transaction | - | A (A) | high | prior | do_not_offer | B | 100 | 0 |

#### VPN / security (2 SKUs)

VPN: legal_review_required (domestic law on circumvention tools + conflict with the geo-evasion guardrail). Bitwarden: prior price only.

| SKU id | official USD | billing | price conf | modes (default) | risk | policy evidence | offer | demand | order USD | quotes |
|---|--:|---|---|---|---|---|---|---|--:|--:|
| `nordvpn-subscription` | null | monthly / multi-year | - | A (A) | high | prior | legal_review_required | A | 60 | 0 |
| `bitwarden-premium` | 10 (prior) | annual | low | A (A) | medium | prior | offer_with_disclosure | C | 10 | 0 |

#### Telecom (2 SKUs)

Aggregator Iran-eligibility unverified (specialist 01).

| SKU id | official USD | billing | price conf | modes (default) | risk | policy evidence | offer | demand | order USD | quotes |
|---|--:|---|---|---|---|---|---|---|--:|--:|
| `intl-mobile-topup` | null | per top-up | - | B (B) | medium | prior | offer_with_disclosure | C | 10 | 0 |
| `esim-travel` | null | per pack | - | A (A) | medium | prior | offer_with_disclosure | B | 10 | 0 |

#### Shopping (3 SKUs)

Amazon codes are region-locked; AliExpress needs a forwarder (customs/loss risk); Temu: do not offer.

| SKU id | official USD | billing | price conf | modes (default) | risk | policy evidence | offer | demand | order USD | quotes |
|---|--:|---|---|---|---|---|---|---|--:|--:|
| `amazon-gift-card-us-50` | 50 | one-time code | low | B (B) | high | prior | legal_review_required | A | 50 | 0 |
| `aliexpress-order` | null | per order | - | A/C (A) | high | prior | legal_review_required | A | 40 | 0 |
| `temu-order` | null | per order | - | A (A) | high | prior | do_not_offer | B | 40 | 0 |

#### Travel (4 SKUs)

Agent model; licensed-travel-agency rules may apply; never create dummy reservations for visa files.

| SKU id | official USD | billing | price conf | modes (default) | risk | policy evidence | offer | demand | order USD | quotes |
|---|--:|---|---|---|---|---|---|---|--:|--:|
| `booking-com-hotel` | null | per booking | - | A/C (A) | medium | prior | offer_with_disclosure | B | 200 | 0 |
| `airbnb-stay` | null | per booking | - | A (A) | high | prior | do_not_offer | C | 300 | 0 |
| `intl-flight-ticket` | null | per ticket | - | C (C) | medium | prior | legal_review_required | A | 400 | 0 |
| `travel-insurance` | null | per policy | - | A/C (A) | medium | prior | offer_with_disclosure | B | 40 | 0 |

#### Cards (platform core) (5 SKUs)

Core product. Risk sits with the provider (custody, unpublished top-up %, undocumented reseller/ToS position) and with merchant acceptance of the card's BIN/region. The 3 % provider fee is a placeholder until specialist 01 reports.

| SKU id | official USD | billing | price conf | modes (default) | risk | policy evidence | offer | demand | order USD | quotes |
|---|--:|---|---|---|---|---|---|---|--:|--:|
| `vcard-new-card-load-25` | 25 | one-time per card | low | A (A) | medium | sourced | offer_with_disclosure | S | 25 | 0 |
| `vcard-topup-50` | 50 | per top-up | medium | A (A) | medium | sourced | offer_with_disclosure | S | 50 | 0 |
| `vcard-topup-100` * | 100 | per top-up | medium | A (A) | medium | sourced | offer_with_disclosure | S | 100 | 0 |
| `vcard-topup-250` | 250 | per top-up | medium | A (A) | medium | sourced | offer_with_disclosure | A | 250 | 0 |
| `vcard-topup-500` | 500 | per top-up | medium | A (A) | medium | sourced | offer_with_disclosure | B | 500 | 0 |


### 4. Iranian retail price evidence - a two-tier market

#### Table 3 - Iranian retail quotes vs official USD list price (undated listings)

Implied USD-equivalent = price / FX. Two FX anchors bracket the unknown listing date: USDT 207,597 (2026-08-31) and 258,190 (2026-09-30). ratio = implied USD-equivalent / official list price.

| SKU | seller / source | quote IRT | official USD (quoted item) | USD-eq @08-31 | USD-eq @09-30 | ratio @08-31 | ratio @09-30 | comparable? |
|---|---|--:|--:|--:|--:|--:|--:|---|
| chatgpt-plus | emalls.ir listing - 'shared' (اشتراکی) Plus account | 450,000 | 20 | 2.17 | 1.74 | 0.11 | 0.09 | no |
| chatgpt-plus | emalls.ir listing - 'personal' (شخصی) Plus subscription | 890,000 | 20 | 4.29 | 3.45 | 0.21 | 0.17 | no |
| chatgpt-plus | Fara License (فرا لایسنس), via emalls search summary | 599,000 | 20 | 2.89 | 2.32 | 0.14 | 0.12 | no |
| chatgpt-plus | emalls.ir listing (product type not stated) | 158,000 | 20 | 0.76 | 0.61 | 0.04 | 0.03 | no |
| chatgpt-plus | emalls.ir listing - upper end of returned range | 1,390,000 | 20 | 6.70 | 5.38 | 0.33 | 0.27 | no |
| copilot-pro | emalls.ir listing - Copilot Pro 'dedicated' (اختصاصی) - low end of range | 2,300,000 | 10 | 11.08 | 8.91 | 1.11 | 0.89 | probable |
| copilot-pro | emalls.ir listing - Copilot Pro 'dedicated' - high end of range | 3,900,000 | 10 | 18.79 | 15.11 | 1.88 | 1.51 | no |
| netflix-premium | akcell (اک سل), via search summary | 130,000 | 26.99 | 0.63 | 0.50 | 0.02 | 0.02 | no |
| netflix-premium | naghdfarsi (نقد فارسی) - 1 month | 95,000 | 26.99 | 0.46 | 0.37 | 0.02 | 0.01 | no |
| netflix-premium | naghdfarsi (نقد فارسی) - 3 months | 200,000 | 80.97 | 0.96 | 0.77 | 0.01 | 0.01 | no |
| netflix-premium | emalls.ir - low end of returned range | 499,000 | 26.99 | 2.40 | 1.93 | 0.09 | 0.07 | no |
| netflix-premium | emalls.ir - high end of returned range | 770,935 | 26.99 | 3.71 | 2.99 | 0.14 | 0.11 | no |
| spotify-individual | emalls.ir - Spotify Premium Individual 1 month (low end) | 360,000 | 13 | 1.73 | 1.39 | 0.13 | 0.11 | no |
| spotify-individual | emalls.ir - Spotify Premium Individual 1 month (high end) | 418,000 | 13 | 2.01 | 1.62 | 0.15 | 0.12 | no |
| steam-wallet-20 | emalls.ir - Steam $20 (listing 1) | 4,301,000 | 20 | 20.72 | 16.66 | 1.04 | 0.83 | yes |
| steam-wallet-20 | emalls.ir - Steam $20 (listing 2) | 4,305,000 | 20 | 20.74 | 16.67 | 1.04 | 0.83 | yes |
| steam-wallet-20 | emalls.ir - Steam $20 (listing 3) | 4,370,000 | 20 | 21.05 | 16.93 | 1.05 | 0.85 | yes |
| steam-wallet-20 | emalls.ir - 'cheapest Steam gift card' (denomination unclear; summary said 10 USD) | 4,179,000 | 20 | 20.13 | 16.19 | 1.01 | 0.81 | uncertain |
| steam-wallet-100 | emalls.ir - Steam $100 (listing 1) | 21,033,000 | 100 | 101.32 | 81.46 | 1.01 | 0.81 | yes |
| steam-wallet-100 | emalls.ir - Steam $100 (listing 2) | 21,505,000 | 100 | 103.59 | 83.29 | 1.04 | 0.83 | yes |

Reading: ratios far below 1 (e.g. 0.1-0.3) mean the listing is NOT an official-price product (shared / invite-slot / regional-price / promo access). Such offers are structurally non-comparable to modes A/B/C and are not replicated by this platform.

What the sample shows (all listings undated, confidence low):

1. **Shared-access tier.** ChatGPT Plus 158k-1.39M IRT, Spotify 360k-418k, Netflix 95k-771k are 3-33 %, 11-15 % and 1-14 % of the official USD-equivalent at the two FX anchors. These cannot be official-price products; they are shared / regional-price / invite-slot / promotional structures that breach vendor terms (mode D, not offered). Our cost floor is above 100 % of USD x FX, so this tier is structurally non-comparable - it is a *competitor archetype* for the simulator, not a price to match.
2. **Official-price tier.** Steam codes ($20: 4.30-4.37M; $100: 21.03-21.51M IRT) imply 209-219k IRT per USD; Copilot Pro "dedicated" 2.3-3.9M (0.89-1.88x official). Estimated competitor markup over USDT is **+2.5-3.7 % if the listings date from 31 Aug and +20-22 % if from 2 Jul** (Table 2): the date uncertainty alone moves the answer by ~18 pp, so do not treat either figure as measured.
3. **Staleness.** The quote-implied Steam rates are 15-19 % below USDT of 30 Sep (258k). Either the listings predate the Mehr jump or the retailer had not re-priced. The search summary called them "current"; adjudicated as stale (Conflicts, C7).
4. **Internal band.** The first-pass doc (S50) says Plus sells at 1.3M-6.4M IRT by account type. Our recommended price at base FX is 6,639,000 IRT (Table 1) - 3.7 % above the top of that band, i.e. only the top of the ladder is reachable with the assumed cost structure (3 % provider fee placeholder, 1 USDT network fee per order, 40,000 IRT operator cost).
5. **Shortfall vs the mandate.** >=3 dated quotes for each flagship SKU: **not met** (5 of 20 flagship SKUs have any quote; 3 have a comparable one; none is dated). Appendix A holds the ready-to-run queries; specialist 07 owns the deep competitor price lists.

### 5. Demand ranking and margin potential

Tier S: `chatgpt-plus` (E1: Faradars and Maktabkhooneh guides, a Zoomit paid placement by Diamond Land, multi-seller emalls listings), `steam-wallet-20` (E2: emalls pages for several denominations), `vcard-new-card-load-25`, `vcard-topup-50`, `vcard-topup-100` (E3: >=15 Iranian virtual-card/FX-payment competitors in brief 07). Notable tier A with evidence: `claude-pro` (E1: Digiato paid placement "guide to buy a Claude account in Iran"), `spotify-individual` (E1: three Zoomit/Digiato paid placements by Spotify resellers + E2 listing), `netflix-standard` (E2/E1), `steam-wallet-100` (E2). Tier A without evidence this run (E4): Gemini, Cursor, Midjourney, YouTube Premium, PlayStation, domains/VPS, exams, Telegram Premium. Paid placements imply many sellers competing for the same customers, i.e. high CAC competition - a simulator input for the "competitor" agent.

#### Table 7 - demand-weighted gross-profit index (ASSUMPTION-DRIVEN prior for the simulator, not a forecast)

index = tier weight (S8/A4/B2/C1) x profit per order @base FX x repeat/yr. '*' = unit USD is an assumed typical order (no verified list price). Offer column shows legal gating: legal_review_required SKUs cannot launch until cleared.

| # | SKU | tier | unit USD | price @base | profit/order | repeat/yr | GP per active customer-year (IRT) | index (M IRT) | share of total | offer |
|--:|---|---|--:|--:|--:|--:|--:|--:|--:|---|
| 1 | vcard-topup-100 | S | 100 | 30,406,000 | 2,764,329 | 4 | 11,057,314 | 88.5 | 5.0% | offer_with_disclosure |
| 2 | vcard-topup-250 | A | 250 | 74,138,000 | 5,491,922 | 4 | 21,967,689 | 87.9 | 5.0% | offer_with_disclosure |
| 3 | vcard-topup-500 | B | 500 | 147,946,000 | 10,959,245 | 4 | 43,836,981 | 87.7 | 4.9% | offer_with_disclosure |
| 4 | vcard-topup-50 | S | 50 | 15,651,000 | 1,677,464 | 4 | 6,709,856 | 53.7 | 3.0% | offer_with_disclosure |
| 5 | chatgpt-pro-200 | B | 200 | 59,377,000 | 4,399,058 | 6 | 26,394,346 | 52.8 | 3.0% | offer_with_disclosure |
| 6 | intl-flight-ticket* | A | 400 | 118,423,000 | 8,772,516 | 1.5 | 13,158,774 | 52.6 | 3.0% | legal_review_required |
| 7 | adobe-cc-all-apps | A | 59.99 | 18,709,000 | 2,004,570 | 6 | 12,027,423 | 48.1 | 2.7% | offer_with_disclosure |
| 8 | steam-wallet-100 | A | 100 | 29,531,000 | 2,685,531 | 4 | 10,742,122 | 43.0 | 2.4% | offer_with_disclosure |
| 9 | chatgpt-plus | S | 20 | 6,639,000 | 866,345 | 6 | 5,198,071 | 41.6 | 2.3% | offer_with_disclosure |
| 10 | supergrok-heavy | C | 300 | 88,900,000 | 6,585,787 | 6 | 39,514,721 | 39.5 | 2.2% | offer_with_disclosure |
| 11 | chatgpt-pro-100 | B | 100 | 30,406,000 | 2,764,329 | 6 | 16,585,971 | 33.2 | 1.9% | offer_with_disclosure |
| 12 | claude-max-5x | B | 100 | 30,406,000 | 2,764,329 | 6 | 16,585,971 | 33.2 | 1.9% | offer_with_disclosure |
| 13 | steam-wallet-20 | S | 20 | 6,456,000 | 842,586 | 4 | 3,370,342 | 27.0 | 1.5% | offer_with_disclosure |
| 14 | claude-max-20x | C | 200 | 59,377,000 | 4,399,058 | 6 | 26,394,346 | 26.4 | 1.5% | offer_with_disclosure |
| 15 | perplexity-max | C | 200 | 59,377,000 | 4,399,058 | 6 | 26,394,346 | 26.4 | 1.5% | offer_with_disclosure |
| 16 | cursor-ultra | C | 200 | 59,377,000 | 4,399,058 | 6 | 26,394,346 | 26.4 | 1.5% | offer_with_disclosure |
| 17 | google-ai-ultra-200 | C | 199.99 | 59,374,000 | 4,398,791 | 6 | 26,392,748 | 26.4 | 1.5% | offer_with_disclosure |
| 18 | steam-wallet-50 | A | 50 | 15,205,000 | 1,629,565 | 4 | 6,518,260 | 26.1 | 1.5% | offer_with_disclosure |
| 19 | psn-wallet-50 | A | 50 | 15,205,000 | 1,629,565 | 4 | 6,518,260 | 26.1 | 1.5% | legal_review_required |
| 20 | amazon-gift-card-us-50 | A | 50 | 15,205,000 | 1,629,565 | 4 | 6,518,260 | 26.1 | 1.5% | legal_review_required |

Category share of the total index (all offerable SKUs, incl. legal-review ones):

| category | share |
|---|--:|
| ai | 35.3% |
| cards | 18.5% |
| gaming | 12.6% |
| productivity | 7.8% |
| media | 7.2% |
| cloud | 5.3% |
| travel | 3.9% |
| education | 3.1% |
| shopping | 2.4% |
| appstore | 1.4% |
| messaging | 1.1% |
| ads | 0.6% |
| vpn_security | 0.5% |
| telecom | 0.2% |

Share of the index that sits in legal_review_required SKUs: 21.8%; in offer_with_disclosure: 78.2%.

Reading: the index is a *prior for the simulator*, not a forecast. It multiplies a tier weight (S8/A4/B2/C1, `demand_tier_weights_prior`) by profit per order at base FX and the assumed repeat cadence. High-ticket subscriptions dominate profit per customer; card top-ups dominate once demand weights are applied. 21.8 % of the index sits in SKUs that cannot launch before legal clearance.

### 6. Margin table - 20 flagship SKUs at three FX levels

Formula and constants (re-used from `scripts/pricing_model.py`; `--selftest` reproduces its 7 scenarios to the Toman):

#### Cost-model assumptions used in this run

| parameter | value | provenance |
|---|---|---|
| FX base (IRT per USDT) | 257,000 | brief + Nobitex 258,901 on 2026-09-30 (S39); internal doc ~256,900 on 10 Mehr |
| FX scenarios | -10% / base / +20% | brief mandate; +23.55 % occurred in the 30 days to 2026-09-30 (S39) |
| Exchange trade fee | 0.35% | scripts/pricing_model.py (assumption) |
| Exchange buy spread | 0.40% | scripts/pricing_model.py (assumption) |
| Network fee (USDT per withdrawal) | 1.0 | scripts/pricing_model.py (TRC-20 ~1 USDT) |
| Orders per withdrawal batch | 1 | pricing_model.py charges it per order (=1); batching is a sensitivity |
| Provider top-up fee (A/C) | 3.00% | UNPUBLISHED by mpay; peers 2.5-4 % (S50) - placeholder until specialist 01 |
| Voucher fee (B) | 0.00% | placeholder: face value, no discount - verify with aggregator |
| Card issue fee (new card only) | $4.99 | S50 (secondary sources for mpay) - verify |
| Rial collection fee | 0.50% | scripts/pricing_model.py |
| Risk buffer | 2.00% | scripts/pricing_model.py |
| Operator cost / order | 40,000 IRT | scripts/pricing_model.py |
| Rounding | customer price CEIL to 1,000 IRT | CLAUDE.md: customer prices round up |
| Margin bands (list USD) | <15: 18 %; 15-30: 15 %; 30-75: 12 %; 75-150: 10 %; >=150: 8 % | derived from pricing_model.py scenarios, ends extended (assumption) |

#### Table 1 - landed cost, recommended price (at catalog margin) and effective Toman/USD

FX levels (IRT/USDT): -10% = 231,300, base = 257,000, +20% = 308,400.
Price = CEIL_1000(cost x (1+margin)), floored at cost + min_margin_irt. 'Rec. price' is what the engine would quote; it is NOT a market price.

| SKU | mode | list USD | unit USD | supplier USD | margin | cost @base | price -10% | **price @base** | price +20% | eff. IRT/USD @base | profit @base |
|---|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| chatgpt-plus | A | 20 | 20 | 20.60 | 15% | 5,772,655 | 5,980,000 | **6,639,000** | 7,958,000 | 331,950 | 866,345 |
| chatgpt-pro-200 | A | 200 | 200 | 206.00 | 8% | 54,977,942 | 53,443,000 | **59,377,000** | 71,243,000 | 296,885 | 4,399,058 |
| claude-pro | A | 20 | 20 | 20.60 | 15% | 5,772,655 | 5,980,000 | **6,639,000** | 7,958,000 | 331,950 | 866,345 |
| claude-max-5x | A | 100 | 100 | 103.00 | 10% | 27,641,672 | 27,370,000 | **30,406,000** | 36,479,000 | 304,060 | 2,764,329 |
| google-ai-pro | A | 19.99 | 19.99 | 20.59 | 15% | 5,769,921 | 5,977,000 | **6,636,000** | 7,954,000 | 331,966 | 866,079 |
| perplexity-pro | A | 20 | 20 | 20.60 | 15% | 5,772,655 | 5,980,000 | **6,639,000** | 7,958,000 | 331,950 | 866,345 |
| midjourney-standard | A | 30 | 30 | 30.90 | 12% | 8,506,282 | 8,579,000 | **9,528,000** | 11,424,000 | 317,600 | 1,021,718 |
| cursor-pro | A | 20 | 20 | 20.60 | 15% | 5,772,655 | 5,980,000 | **6,639,000** | 7,958,000 | 331,950 | 866,345 |
| copilot-pro | A | 10 | 10 | 10.30 | 18% | 3,039,028 | 3,233,000 | **3,587,000** | 4,294,000 | 358,700 | 547,972 |
| digitalocean-droplet-6 | A | 6 | 25 | 25.75 | 15% | 7,139,468 | 7,394,000 | **8,211,000** | 9,844,000 | 328,440 | 1,071,532 |
| adobe-cc-all-apps | A | 59.99 | 59.99 | 61.79 | 12% | 16,704,430 | 16,843,000 | **18,709,000** | 22,442,000 | 311,869 | 2,004,570 |
| canva-pro | A | 18 | 18 | 18.54 | 15% | 5,225,929 | 5,414,000 | **6,010,000** | 7,203,000 | 333,889 | 784,071 |
| m365-personal | A | 99.99 | 99.99 | 102.99 | 10% | 27,638,938 | 27,367,000 | **30,403,000** | 36,475,000 | 304,060 | 2,764,062 |
| netflix-standard | A | 19.99 | 19.99 | 20.59 | 15% | 5,769,921 | 5,977,000 | **6,636,000** | 7,954,000 | 331,966 | 866,079 |
| spotify-individual | A | 13 | 13 | 13.39 | 18% | 3,859,116 | 4,104,000 | **4,554,000** | 5,456,000 | 350,308 | 694,884 |
| youtube-premium | A | 15.99 | 15.99 | 16.47 | 15% | 4,676,470 | 4,845,000 | **5,378,000** | 6,445,000 | 336,335 | 701,530 |
| steam-wallet-20 | B | 20 | 20 | 20.00 | 15% | 5,613,414 | 5,815,000 | **6,456,000** | 7,738,000 | 322,800 | 842,586 |
| steam-wallet-100 | B | 100 | 100 | 100.00 | 10% | 26,845,469 | 26,582,000 | **29,531,000** | 35,428,000 | 295,310 | 2,685,531 |
| ps-plus-essential-12m | B | 79.99 | 79.99 | 79.99 | 10% | 21,534,802 | 21,324,000 | **23,689,000** | 28,418,000 | 296,150 | 2,154,198 |
| vcard-topup-100 | A | 100 | 100 | 103.00 | 10% | 27,641,672 | 27,370,000 | **30,406,000** | 36,479,000 | 304,060 | 2,764,329 |

#### Table 2 - competitor headroom (only SKUs with comparable quotes)

Competitor markup is ESTIMATED as (quote-implied IRT/USD) / (USDT on the assumed listing date) - 1 because the listings are undated. Main case: listing dated 2026-08-31 (USDT 207,597); alternative: listing dated 2026-07-02 (USDT 176,679) - the true date is unknown, so the main-case markup is a LOWER bound. The competitor is assumed to keep its markup when FX moves. headroom = competitor-equivalent price / our landed cost - 1.

| SKU | quotes used (IRT) | implied IRT/USD (median) | est. markup (08-31 anchor) | headroom -10% | headroom base | headroom +20% | gap to rec. margin @base (pp) | est. markup (07-02 anchor) | headroom @base (07-02 anchor) | supplier-cost cut to match @0 % margin: batch 1 / batch 10 |
|---|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| copilot-pro | 2,300,000 | 230,000 | 10.8% | -6.4% | -6.3% | -6.1% | -24.3 | 30.2% | 10.1% | 7.0% / -1.7% |
| steam-wallet-20 | 4,301,000, 4,305,000, 4,370,000 | 215,250 | 3.7% | -5.1% | -5.1% | -4.9% | -20.1 | 21.8% | 11.6% | 5.3% / 0.8% |
| steam-wallet-100 | 21,033,000, 21,505,000 | 212,690 | 2.5% | -1.9% | -1.9% | -1.9% | -11.9 | 20.4% | 15.2% | 1.9% / 1.0% |

Negative gap = our recommended price would sit ABOVE the competitor-equivalent price under these assumptions (commodity vouchers: thin margins; a competitor that buys USDT near mid and vouchers at a discount can undercut).

#### Table 8 - landed-cost uplift over the pure USD x FX price, by ticket size (@base FX)

uplift = cost / (list USD x FX) - 1. Mode A/C = card load with the provider fee; mode B = voucher (0 % fee placeholder). 'batch 10' = one 1-USDT withdrawal shared by 10 orders.

| ticket USD | A/C batch 1 | A/C batch 10 | B batch 1 | B batch 10 |
|--:|--:|--:|--:|--:|
| 5 | 30.1% | 11.5% | 27.0% | 8.4% |
| 10 | 18.3% | 9.0% | 15.2% | 5.9% |
| 20 | 12.3% | 7.7% | 9.2% | 4.6% |
| 30 | 10.3% | 7.2% | 7.2% | 4.1% |
| 50 | 8.7% | 6.9% | 5.6% | 3.8% |
| 100 | 7.6% | 6.6% | 4.5% | 3.5% |
| 200 | 7.0% | 6.5% | 3.9% | 3.4% |
| 500 | 6.6% | 6.4% | 3.5% | 3.3% |

Reading: below ~$30 the fixed items (1 USDT network fee, 40,000 IRT operator cost) dominate - batching withdrawals and automating mode-B delivery are the two levers; above ~$100 the variable items (provider fee, exchange fee/spread, collection, risk buffer, ~7 %) dominate.

#### Table 5 - one-at-a-time sensitivity of landed cost @base FX (tornado-style, % change vs base case)

| driver (low / high) | chatgpt-plus | chatgpt-pro-200 | steam-wallet-20 | vcard-topup-100 |
|---|--:|--:|--:|--:|
| provider top-up fee 2 % / 4 % | -0.92% / +0.92% | -0.97% / +0.97% | +0.00% / +0.00% | -0.96% / +0.96% |
| withdrawal batch 10 orders / (base) | -4.14% / +0.00% | -0.43% / +0.00% | -4.26% / +0.00% | -0.86% / +0.00% |
| operator cost 20k / 60k IRT | -0.35% / +0.35% | -0.04% / +0.04% | -0.36% / +0.36% | -0.07% / +0.07% |
| exchange spread 0.2 % / 0.8 % | -0.20% / +0.39% | -0.20% / +0.40% | -0.20% / +0.39% | -0.20% / +0.40% |
| risk buffer 1 % / 3 % | -0.97% / +0.97% | -0.97% / +0.97% | -0.97% / +0.97% | -0.97% / +0.97% |
| **FX -10% / +20%** | -9.9% / +19.9% | -10.0% / +20.0% | -9.9% / +19.9% | -10.0% / +20.0% |

Findings:

- **Ticket size drives structure.** Below ~$30 the fixed items (1 USDT network fee, 40,000 IRT operator) dominate; withdrawal batching and automated mode-B delivery are the two levers. Above ~$100 the variable items (~7 %) dominate and the provider fee matters most.
- **FX is the dominant driver** (-9.9 % / +19.9 % on cost for FX -10 % / +20 %); every other driver in Table 5 is <= ~4 %. Quotes must re-price on each FX tick; the price-lock TTL is the pricing specialist's call.
- **Commodity vouchers (mode B) are thin** against the Steam quotes: in the main case (listing dated 31 Aug) headroom is -5.1 % ($20) and -1.9 % ($100), i.e. below zero margin; in the alternative case (dated 2 Jul) it is +11.6 % / +15.2 %, which would cover the 10 % band margin at $100 but not the 15 % at $20. To compete the owner needs a wholesale voucher discount and batched withdrawals (supplier-cost cut needed to match at 0 % margin: 0.8-5.3 %, batch 10 / batch 1).
- **Subscriptions / AI (mode A)** have no comparable official-price quote in the sample; the recommended price is the cost-plus value, and only the top of the observed Plus ladder is reachable (finding 4 in section 4).
- **Floors.** `min_margin_irt` (support + refund reserve by burden/risk) lifts the price of very small tickets above cost + band margin; it is an assumption to calibrate with ops and the simulator.

### 7. Vendor re-pricing process (simulator input)

#### Table 4 - USD list-price changes observed in 2026 (vendor re-pricing process for the simulator)

| vendor | plan | old USD | new USD | change | effective | confidence | source |
|---|---|--:|--:|--:|---|---|---|
| YouTube (Google) | Premium Individual | 13.99 | 15.99 | +14.3% | 2026-04 (article 2026-04-10) | high | S29 |
| YouTube (Google) | Premium Family | 22.99 | 26.99 | +17.4% | 2026-04 | high | S29 |
| YouTube (Google) | Premium Lite | 7.99 | 8.99 | +12.5% | 2026-04 | medium | S29 |
| YouTube (Google) | Music Premium | 10.99 | 11.99 | +9.1% | 2026-04 | high | S29 |
| Apple | Apple Music Individual | 10.99 | 11.99 | +9.1% | 2026-07-17 | high | S27 |
| Apple | Apple Music Family | 16.99 | 19.99 | +17.7% | 2026-07-17 | high | S27 |
| Apple | Apple Music Student | 5.99 | 6.99 | +16.7% | 2026-07-17 | high | S27 |
| Apple | Apple One Family | 25.95 | 27.95 | +7.7% | 2026-07-17 | high | S27 |
| Apple | Apple One Premier | 37.95 | 39.95 | +5.3% | 2026-07-17 | high | S27 |
| Disney | Disney+ Premium | 18.99 | 21.49 | +13.2% | 2026-09-23 | high | S30 |
| Sony | PS Plus Essential (monthly) | 9.99 | 10.99 | +10.0% | 2026-05-20 | medium | S31 |
| Sony | PS Plus Extra (monthly) | 14.99 | 16.99 | +13.3% | 2026-05-20 | medium | S31 |
| Google | Google AI Ultra (entry tier) | 249.99 | 99.99 | -60.0% | 2026-05 (Google I/O) | medium | S09 |
| OpenAI | ChatGPT Pro - new $100 tier added next to $200 | - | 100 | n/a | 2026-04-09 | high | S07 |
| GitHub | Copilot - usage-based AI Credits billing | - | - | n/a | 2026-06-01 | high | S02 |
| Netflix | all US plans (second increase since start of 2025) | - | - | n/a | 2026 (date not in summary) | medium | S26 |
| Spotify | Premium Individual / Duo | - | - | n/a | early 2026 | low | S28 |

Observed increases (n=12 plan-level price points from 4 vendors): min 5.3%, Q1 9.1%, median 12.8%, Q3 16.1%, max 17.7%. Plan-level points within one vendor event are strongly correlated - treat as 4 independent vendor events, not 12.

Implications: vendors re-price in discrete jumps of roughly +5 % to +18 % about once a year (n = 4 vendors, 2026) and also change *structure* (Copilot's usage-based credits from 2026-06-01; Cursor credit pools; ChatGPT's new $100 tier). The engine needs a `vendor_price_change` event type that re-quotes all affected SKUs, and the catalogue should add "usage top-up" SKUs for credit-based plans because the plan price is no longer the total spend. Netflix and Spotify also rose in 2026 but old prices were not captured.

### 8. mpay supported merchants and which cards work or fail

Not researched in this run (budget exhausted before the query; `mpay.cards` blocked for fetch). Recorded in `mpay_and_card_acceptance`: `supported_merchants` = `null` (UNVERIFIED, `verify_how` given); known acceptance facts: **AWS rejects prepaid cards** and attempts a $1 authorization (S20, medium); **Google Cloud's trial may refuse prepaid virtual cards** (S21, low); **OpenAI declines have been reported on billing-address mismatch for Singapore-region cards** (S50, internal secondary research, low). Specialist 01 owns the mpay fee table, BIN/region behaviour and the working/failing lists; each SKU carries a `payment_instruments` Record (default `unknown`) to be filled by $5 tests per merchant class.

### 9. Engine rules that follow from the catalogue

1. **Unit of sale.** Subscriptions: one billing period at list price (+ optional annual option in `price_options`). Usage-based (API, cloud): a balance top-up (OpenAI minimum $5, default $10); no list price exists.
2. **Tax at the vendor.** Anthropic's page says prices exclude tax (S01). Keep a `vendor_tax_uplift_pct` parameter (null, UNVERIFIED) per card region and measure it with a $5 purchase receipt.
3. **Regional prices are not a lever.** Go, AI Plus and Spotify vary by country; sourcing by regional price difference is geo-ToS evasion and is excluded.
4. **Codes are locked.** Gift/wallet codes only for the region the customer can lawfully hold; never convert or re-region.
5. **No slot resale.** Family/Duo/Team plans invite mode D; not offered.
6. **Bundles.** Google AI Pro includes YouTube Premium Lite (S09): avoid double-selling; `vcard-new-card-load-25` bundles issue fee + minimum load.
7. **Agent payments (exams, visas, flights).** Mode C only after counsel confirms third-party-payer rules; fees are non-refundable; deadlines make these the natural rush-tier SKUs; never create dummy bookings or documents.
8. **Disclosure gating.** `risk_label = high` requires an explicit consent checkbox and the refund matrix before payment; `legal_review_required` SKUs are hidden until cleared.

### 10. Implementer notes (checklist for a weak AI or a new engineer)

1. Parse `data/catalog.json` as: `meta` (sources, FX anchors, limitations, rerun), `taxonomy` (enums), `cost_model_defaults` (Records; all assumptions), `demand_tier_weights_prior`, `skus[]`, `price_change_log_2026[]`, `mpay_and_card_acceptance`.
2. Every Record is `{value, unit, as_of, confidence, status, kind, sources[], note, verify_how}`. Treat `kind` in {`assumption`, `judgement`, `policy`, `prior`} as tunable parameters, never as facts; `status = UNVERIFIED` values must not be shown as "official" in the UI.
3. `usd_price.value = null` -> the SKU cannot be activated until an admin enters a verified price; for usage-based SKUs the sale unit is `typical_order_usd`.
4. A SKU is purchasable only if `offer_recommendation` in {`offer`, `offer_with_disclosure`} AND the legal gate (04/05) is open; `offer_with_disclosure` additionally requires the consent checkbox and refund matrix.
5. Price = `CEIL_1000( landed_cost(unit_usd, mode, FX) x (1 + margin) )`, floored at `landed_cost + min_margin_irt`; reproduce with `python3 scripts/research/06_margin_table.py` and check with `--selftest`.
6. Re-run `06_build_catalog.py` after editing prices/sources, then `node scripts/validate-data.mjs data/catalog.json` (must print OK).

Record example (abbreviated) from `data/catalog.json`:

```json
{ "id": "claude-pro", "flagship": true, "fulfilment_modes": ["A"], "default_mode": "A", "mode_d_allowed": false,
  "usd_price": { "value": 20, "unit": "USD", "as_of": "2026-10-02", "confidence": "high", "status": "verified", "kind": "fact",
                 "sources": [{ "id": "S01", "url": "https://claude.com/pricing", "note": "fetched directly with WebFetch on 2026-10-02" }] },
  "billing": "monthly or annual", "risk_label": { "value": "high", "confidence": "high" },
  "restriction_note": { "value": "Iran is NOT in Anthropic's Supported Regions list (S03, fetched directly) ...", "confidence": "high" },
  "offer_recommendation": "offer_with_disclosure", "demand_tier": { "value": "A", "kind": "judgement" },
  "typical_order_usd": { "value": 20, "kind": "assumption" }, "repeat_per_year": { "value": 6.0, "kind": "assumption" },
  "competitor_toman_prices": [], "recommended_margin_pct": { "value": 15.0, "kind": "policy" }, "min_margin_irt": { "value": 120000, "kind": "assumption" } }
```

## Implications

**Product (what the platform must model and show)**
- Load `data/catalog.json` as the SKU master: every SKU has `risk_label`, `restriction_note`, `offer_recommendation`, `fulfilment_modes`, `risk_factors`, `payment_instruments`, `price_options`; admin overrides win over the file.
- Launch assortment candidates (subject to counsel): card top-ups ($25-$500) as the core; gaming wallet codes (B) only with a wholesale discount; AI subscriptions via mode A with disclosure (largest profit pool, highest vendor-geo risk); exam/visa agent payments (C) after the third-party-payer check; cloud top-ups with a "prepaid cards are often rejected" warning.
- Hold back 30 `legal_review_required` SKUs and never list the 13 `do_not_offer` SKUs (lawful alternatives are in each `restriction_note`).
- Positioning: do not chase the shared-access tier; compete on private/own-name accounts, transparent breakdown, price-lock and rush options.

**Pricing engine**
- Inputs per SKU: `usd_price`, billing, mode, margin band, `min_margin_irt`, rush eligibility, `vendor_tax_uplift_pct`; globals: FX, provider fee, batch size, rounding (customer price rounds UP).
- Re-quote on FX tick, on `vendor_price_change` and on provider-fee change; keep the 2026 change log as the process definition.
- Add a small-order surcharge or minimum (Table 8: uplift 18 % at $10 vs 7.6 % at $100) or batch withdrawals.
- Competitor feeds need stale-quote detection: compare implied IRT/USD with same-day USDT; a 19 % gap (Steam quotes vs 30 Sep) means stale.

**Simulator parameters**
- SKU universe and weights from `demand_tier` x `demand_tier_weights_prior`; per-SKU `typical_order_usd`, `repeat_per_year` (assumptions, calibrate).
- Competitor archetypes: (a) shared-access tier at ~3-33 % of official USD-equivalent, zero compliance cost, steals price-sensitive demand; (b) official-price tier at USDT + (2.5 % ... 22 %) pending dated quotes. Re-pricing lag after FX moves is unknown (07).
- Vendor price-change events: ~1 hike per vendor-year, +5 to +18 %.
- Event types from `risk_factors` tags: `vendor_geo_exclusion` (account suspension), `prepaid_card_decline` (fulfilment retry/failure), `region_mismatch`, `nonrefundable_fee`, `wallet_freeze`, `account_closure`. Frequencies are not in this data; sim designers must set priors and run sensitivity.
- FX precedents for shock scenarios: +46 % in 90 days; +23.55 % in 30 days (08 owns the calibration).

**Owner decisions**
- Accept or refuse the AI-vendor geo risk as a class (disclosure + refund policy; counsel).
- Whether to invest in wholesale voucher sourcing and USDT withdrawal batching (they decide whether commodity SKUs are viable).
- Minimum order / small-order fee policy.
- Maintain a monthly vendor-policy watchlist (re-run this brief; prices and policies move fast).

## Conflicts & adjudication

| id | conflict | adjudication | confidence |
|---|---|---|---|
| C1 | ChatGPT Pro "$100" vs "$200" | Both exist: $100 tier added 2026-04-09, $200 retained (S07) | high |
| C2 | Google AI Ultra $249.99 (older) vs $99.99 / $199.99 | Newer prices from May 2026 (S09); old value kept only in the change log | medium |
| C3 | YouTube Premium Lite $9.99 vs $8.99 | Use $8.99 (latest mid-2026 report); other source noted | medium |
| C4 | Game Pass Ultimate $22.99 (two summaries, Apr 2026) vs analyst prior $29.99 (Oct 2025) | Use $22.99, status low; verify (a cut in Apr 2026 is plausible but unconfirmed) | low |
| C5 | PS Plus Premium monthly $17.99 vs $19.99 in the same summary | Excluded from stats; Essential/Extra only | low |
| C6 | Copilot Business/Enterprise $19 / $39 (search summary) vs "contact sales" (fetched plans page) | Individual plans from the fetched page (direct); organisation plans left out of the catalogue | high |
| C7 | Iranian Steam listings described as "current" vs quote-implied 209-219k IRT/USD while USDT = 258k on 2026-09-30 | Stale / predate the Mehr jump; undated; used only as a markup bound (Table 2) | medium |
| C8 | Spotify "$10.99" (older Persian page) vs ~$13 (2026) | Use ~$13 (low); old figure is stale | low |
| C9 | Steam forum claim "Steam cannot by law do business in Iran" vs the large Iranian Steam-code market | Risk `high`, Valve's stance UNVERIFIED (user claims only) | low |
| C10 | USDT 9 Shahrivar: 207,597 vs 207,415 (two Tabdeal lines) | Use 207,597; difference 0.09 % | medium |
| C11 | Iranian "ChatGPT Plus" 158k-1.39M IRT vs internal band 1.3M-6.4M | Different tiers (shared-access vs private); both kept, never mixed in one statistic | low |
| C12 | Runway Pro $28 vs analyst prior $35 monthly | $28 likely annual-billed; low confidence; verify | low |
| C13 | Lovable Pro $21 (summary) vs analyst prior $25 | Use $21 low; verify | low |

## Open questions

| # | question | verify_how |
|---|---|---|
| Q1 | >=3 dated competitor quotes per flagship SKU (private-account tier) | Raise `CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION`; run Appendix A queries; screenshot each listing with date and the same-day USDT; feed specialist 07 |
| Q2 | mpay fee table, supported merchants, region/BIN, third-party-issuance terms | Fund a $25 test account; read the in-app fee table; specialist 01 |
| Q3 | Exact vendor Iran wording for each `high` SKU (only Anthropic read first-hand) | Read each vendor's terms / supported-countries page; log URL + date; update `restriction_note` |
| Q4 | Do exam bodies, consulates, airlines accept third-party payers (mode C)? | Read the payee's payment terms; ask counsel; do a low-value test where lawful |
| Q5 | Wholesale discount / fee of Iran-eligible voucher aggregators for Steam/PSN/Amazon codes | Specialist 01 aggregator terms; quote request |
| Q6 | Legal status of Telegram Premium/Stars (TON/Fragment channel), VPN sales, regional gift cards | Specialist 04 + counsel |
| Q7 | Real demand: search interest per SKU | Google Trends geo=IR (Persian + English query sets), Keyword Planner, seller counts per aggregator, Telegram seller-channel sizes |
| Q8 | Vendor-side tax uplift on the funding card's billing country | $5 purchase per vendor class; compare receipt to list price |
| Q9 | Exact Spotify/Netflix/Game Pass/Lovable/Runway/HeyGen/ElevenLabs US prices | Official pricing pages (read-only) |
| Q10 | Official prices of exam fees (IELTS/TOEFL/GRE/PTE/DET), visa fees, Telegram Premium/Stars, mobile-game top-ups, domains, Workspace, Coursera/Udemy/Duolingo | Official fee pages per Appendix A |
| Q11 | Whether competitors re-price immediately after FX moves (repricing cadence) | Specialist 07: daily sampling of 5 sellers for 14 days |
| Q12 | Does the platform price differently for `legal_review_required` SKUs once cleared? | Specialist 12 + counsel decision |

## Appendix A - searches still to run (ready-made; Persian + English)

| area | status | next queries |
|---|---|---|
| competitor Toman quotes (>=3 dated per flagship SKU) | NOT MET - 5 of 20 flagship SKUs hold any quote and 3 hold a comparable one (Steam $20, Steam $100, Copilot Pro), all undated; ChatGPT Plus / Spotify / Netflix quotes are non-comparable shared-access offers. | قیمت اکانت کلود پرو امروز (seller names)<br>قیمت اشتراک جمینای پرو امروز تومان<br>قیمت اکانت میدجرنی تومان امروز<br>قیمت اشتراک یوتیوب پریمیوم تومان امروز<br>قیمت گیفت کارت پلی استیشن امروز<br>قیمت اشتراک ادوبی کریتیو کلود تومان<br>قیمت کانوا پرو تومان<br>قیمت لایسنس آفیس ۳۶۵ تومان<br>قیمت شارژ ارزی کارت مجازی ۱۰۰ دلار تومان امروز |
| official USD prices not captured | AWS/GCP/Azure (usage-based), domains, Google Workspace, Zoom, Dropbox, Coursera, Udemy, Duolingo, exam fees (IELTS/TOEFL/GRE/PTE/DET), visa fees, VPN, Telegram Premium/Stars, game top-ups (UC/Free Fire/CP/V-Bucks/Valorant/Roblox), eSIM, flights - value null or prior-knowledge flagged UNVERIFIED. | TOEFL iBT test fee 2026 Iran test centers<br>IELTS fee 2026 Armenia Turkey UAE<br>GRE general test fee 2026<br>Telegram Premium price 2026 USD Fragment TON<br>PUBG Mobile UC price table 2026<br>Namecheap .com price 2026<br>Google Workspace Business Starter price 2026<br>Coursera Plus price 2026 |
| vendor Iran policy wording (ToS / supported countries) | Quoted only for Anthropic (fetched), OpenAI (summary), Google Ads (summary). All other restriction notes are prior-knowledge judgements flagged UNVERIFIED. | Gemini Apps supported countries Iran<br>Midjourney terms of service sanctioned countries<br>Perplexity supported countries<br>GitHub trade controls Iran Copilot paid<br>Spotify available markets list<br>YouTube Premium available countries list<br>Netflix countries not available Iran<br>Steam Valve Iran sanctions policy official<br>Adobe sanctions Iran terms<br>Microsoft 365 consumer availability Iran<br>Hetzner terms sanctioned countries<br>DigitalOcean restricted countries<br>PayPal restricted countries Iran<br>Upwork restricted countries Iran |
| mpay supported merchants and cards reported working/failing | NOT researched (budget). | mpay.cards supported merchants list<br>mpay virtual card OpenAI declined<br>virtual card Iran ChatGPT payment declined billing address<br>کارت مجازی ریجکت چت جی پی تی<br>کارت مجازی کدام پرداخت‌ها را قبول می‌کند |
| demand evidence (search interest) | No Google Trends / Keyword Planner access; demand tiers rest on E1-E4 evidence classes (low confidence). | (manual) Google Trends geo=IR: خرید اکانت چت جی پی تی / ChatGPT Plus / گیفت کارت استیم / اسپاتیفای پریمیوم / تلگرام پریمیوم / آزمون آیلتس |
| categories never searched | ads other than Google (Meta/TikTok/X/Telegram), education, freelancing/payments, VPN, telecom, shopping, travel, Telegram Premium/Stars. | see per-category lines above |

## Appendix B - hosts blocked for WebFetch (do not retry; the proxy policy forbids routing around denials)

`emalls.ir`, `cometapi.com`, `digiato.com`, `openai.com`, `cursor.com`, `www.digitalocean.com`, `www.hetzner.com`, `www.canva.com`, `www.notion.com`, `www.perplexity.ai`, `gemini.google`, `docs.midjourney.com`, `aws.amazon.com`, `www.vultr.com`, `www.cloudflare.com`, `vercel.com`, `workspace.google.com`, `www.adobe.com`, `www.figma.com`, `pricepertoken.com`, `costbench.com`, `recurdash.com`, `subger.com`, `apicalculators.com`, `help.openai.com`, `support.google.com`, `docs.cloud.google.com`, `en.wikipedia.org`, `ofac.treasury.gov`, `techcrunch.com`, `www.engadget.com`, `9to5mac.com`, `macdailynews.com`.

## Sources

| id | url | title | supports | seen |
|---|---|---|---|---|
| [S01] | https://claude.com/pricing | Claude pricing - individual plans (Anthropic) | F04, F05, F10-adjacent; tax note; direct | directly (WebFetch 2026-10-02) |
| [S02] | https://github.com/features/copilot/plans | GitHub Copilot plans and pricing | F10 (Copilot plans, credits); direct | directly (WebFetch 2026-10-02) |
| [S03] | https://www.anthropic.com/supported-countries | Anthropic - supported countries and regions (Iran not listed) | F27 (Iran not in supported regions); direct | directly (WebFetch 2026-10-02) |
| [S04] | https://help.openai.com/en/articles/7947663-chatgpt-supported-countries-and-territories | OpenAI Help Center - ChatGPT supported countries and territories | F28 (OpenAI supported countries) | per search summary |
| [S05] | https://www.caixinglobal.com/2024-06-26/openai-enforces-harsher-api-restrictions-on-unsupported-countries-102209858.html | Caixin 2024-06-26 - OpenAI enforces harsher API restrictions on unsupported countries | F28 (API block 2024-07-09) | per search summary |
| [S06] | https://www.cometapi.com/chatgpt-pricing-2026-free-vs-go-vs-plus-vs-pro/ | CometAPI - ChatGPT Pricing 2026 (same query also returned geotoolbox.ai, gurusup.com, pricepertoken.com) | F01, F02, F03 (ChatGPT plan prices) | per search summary |
| [S07] | https://9to5mac.com/2026/04/09/openai-introduces-100-month-pro-plan-aimed-at-codex-users-heres-what-it-includes/ | 9to5Mac 2026-04-09 - OpenAI introduces $100/month Pro plan (also thurrott.com, gigazine.net) | F02 ($100 Pro launch 2026-04-09) | per search summary |
| [S08] | https://ai.zenken.co.jp/en/post/claude-pro-vs-max-comparison/ | Zenken - Claude Pro vs Max 2026 (also eesel.ai, ai-toolbox.co, noqta.tn) | F05 (Claude Max prices) | per search summary |
| [S09] | https://www.engadget.com/2176060/ | Engadget - The Google AI Ultra plan now starts at $100 a month (also framia.converge.ai, razomua.media, ai-toolbox.co) | F06 (Google AI plans; Ultra cut) | per search summary |
| [S10] | https://www.finout.io/blog/perplexity-pricing-in-2026 | Finout - Perplexity pricing in 2026 (also cloudzero.com, pricepertoken.com) | F07 (Perplexity) | per search summary |
| [S11] | https://eesel.ai/blog/midjourney-pricing | eesel.ai - Midjourney pricing in 2026 (also vendr.com, thepricer.org, costbench.com) | F08 (Midjourney) | per search summary |
| [S12] | https://www.jetadmin.io/blog/cursor-pricing-explained-plans-credit-system-and-real-costs-in-2026/ | JetAdmin 2026-07-27 - Cursor pricing explained (also aicodereview.cc, zilliz.com) | F09 (Cursor) | per search summary |
| [S13] | https://costbench.com/software/ai-coding-assistants/github-copilot/ | CostBench - GitHub Copilot plans (also benchlm.ai) | C6 (Copilot Business/Enterprise per summary) | per search summary |
| [S14] | https://ai-toolbox.co/grok-models/grok-pricing-plans-api-2026 | ai-toolbox.co - Grok pricing 2026 (also pricepertoken.com, finder.techleap.nl) | F11 (Grok) | per search summary |
| [S15] | https://superblocks.com/blog/replit-ai-pricing | Superblocks - Replit pricing 2026 (also costbench.com Lovable vs Replit) | Replit/Lovable prices | per search summary |
| [S16] | https://costbench.com/compare/heygen-vs-runway/ | CostBench - Runway vs HeyGen pricing 2026 (ElevenLabs: smallest.ai, magichour.ai) | ElevenLabs/Runway/HeyGen prices | per search summary |
| [S17] | https://gptprompts.ai/suno-pricing | gptprompts.ai - Suno pricing in 2026 (also costbench.com) | Suno prices | per search summary |
| [S18] | https://help.openai.com/en/articles/8264778-what-is-prepaid-billing | OpenAI Help Center - prepaid billing | F23 (OpenAI prepaid billing) | per search summary |
| [S19] | https://apicalculators.com/cloud-vps-comparison | apicalculators.com - cloud VPS pricing comparison, June 2026 (also bitdoze.com) | F24 (VPS prices) | per search summary |
| [S20] | https://aws.amazon.com/free/registration-faqs/ | AWS registration FAQs and repost.aws 'aws-authorization-charges' (prepaid cards, $1 authorization) | F25 (AWS card rules) | per search summary |
| [S21] | https://docs.cloud.google.com/free/docs/free-cloud-features | Google Cloud free trial features ($300 / 90 days, payment method required) | F26 (GCP trial) | per search summary |
| [S22] | https://petapixel.com/how-much-is-photoshop/ | PetaPixel - How much is Photoshop in 2026 (also costbench.com, redresscompliance.com) | F12 (Adobe) | per search summary |
| [S23] | https://designrr.io/canva-pricing/ | Designrr - Canva pricing (also aiproductivity.ai, tech-insider.org Figma vs Canva 2026) | F13 (Canva/Figma) | per search summary |
| [S24] | https://office-watch.com/2026/microsoft-365-plans-overview/ | Office Watch - Microsoft 365 plans in 2026 (also recurdash.com, techbloat.com) | F14 (Microsoft 365) | per search summary |
| [S25] | https://www.gend.co/sp/blog/notion-pricing | gend.co - Notion pricing (Slack/Grammarly: getpricepulse.com, dupple.com, androidauthority.com) | Notion/Slack/Grammarly prices | per search summary |
| [S26] | https://www.fox13news.com/news/netflix-raising-prices-again-all-plans-how-much-more-youll-be-paying | Fox TV stations (syndicated) - Netflix raising prices again on all plans | F15 (Netflix) | per search summary |
| [S27] | https://macdailynews.com/2026/07/17/apple-raises-apple-music-and-apple-one-subscription-prices/ | MacDailyNews 2026-07-17 - Apple raises Apple Music and Apple One prices (also mjtsai.com, bgr.com, iclarified.com) | F19 (Apple), price-change log | per search summary |
| [S28] | https://subscriptionland.com/news/subscription-price-increase-2026-watchlist | Subscriptionland - 2026 price-increase watchlist (Spotify US $13 / Duo $19; summary did not attribute to a single page) | F16 (Spotify) | per search summary |
| [S29] | https://9to5google.com/2026/04/10/youtube-premium-us-price-hike/ | 9to5Google 2026-04-10 - YouTube Premium US price hike (also engadget.com, hongkiat.com) | F17 (YouTube Premium), price-change log | per search summary |
| [S30] | https://www.gadgetreview.com/?p=414004 | Gadget Review - Disney+ Premium rises to $21.49/month (also cleveland19.com 2026-09-23) | F18 (Disney+), price-change log | per search summary |
| [S31] | https://www.purexbox.com/news/2026/04/heres-a-breakdown-of-the-new-prices-for-xbox-game-pass-as-of-april-2026 | Pure Xbox - Game Pass prices as of April 2026 (PS Plus: analyticsinsight.net, tech-insider.org) | F20, F21 (PS Plus / Game Pass), price-change log | per search summary |
| [S32] | https://www.thepricer.org/how-much-does-nintendo-online-cost/ | ThePricer - Nintendo Switch Online cost (also recurdash.com) | F22 (Nintendo) | per search summary |
| [S33] | https://steamcommunity.com/discussions/forum/0/3811782223879459150 | Steam community thread on Iranian accounts / sanctions (USER CLAIMS, not Valve policy) | C9 (Steam/Iran user claims only) | per search summary |
| [S34] | https://emalls.ir/مشخصات_گیفت-کارت-استیم-آمریکا~id~17659383 | emalls.ir - Steam US gift card listing (price aggregator; undated cache) | F36 (Steam $20 listings) | per search summary |
| [S35] | https://emalls.ir/مشخصات_گیفت-کارت-استیم-100-دلاری~id~2667269 | emalls.ir - Steam 100 USD gift card listing (price aggregator; undated cache) | F37 (Steam $100 listings) | per search summary |
| [S36] | https://fortune.com/2017/08/25/apple-iranian-apps-sanctions | Fortune 2017-08-25 - Apple removes Iranian apps citing sanctions (also businesstech.co.za, pplware.sapo.pt) | Apple/Iran sanctions context | per search summary |
| [S37] | https://dundle.com/support/help-with-my-code/google-play-gift-card-help/ | Dundle - Google Play gift cards are region-locked (country and currency) | F30 (Google Play region lock) | per search summary |
| [S38] | https://support.google.com/google-ads/answer/6163740 | Google Ads help - Understanding Google Ads country restrictions (Iran listed as unavailable) | F29 (Google Ads country restrictions) | per search summary |
| [S39] | https://nobitex.ir/mag/news-tether-price-2026-09-30/ | Nobitex Mag 2026-09-30 - Tether price Wed 8 Mehr 1405 (also taadolnewspaper.ir, rokna.net, eghtesadonline.com, nabzgheymat.ir) | F33, F34 (USDT 2026-09-30, 7d/30d change) | per search summary |
| [S40] | https://tabdeal.org/academy/news/dollar-tether-price-9-shahrivar-1405/ | Tabdeal Academy - dollar and Tether price 9 Shahrivar 1405 | F32 (USDT 2026-08-31) | per search summary |
| [S41] | https://tabdeal.org/academy/news/usdt-price-today-11th-dollar/ | Tabdeal Academy - Tether price 11 Tir (1405) | F31 (USDT 2026-07-02) | per search summary |
| [S42] | https://emalls.ir/%D9%84%DB%8C%D8%B3%D8%AA-%D9%82%DB%8C%D9%85%D8%AA_%DA%AF%DB%8C%D9%81%D8%AA-%DA%A9%D8%A7%D8%B1%D8%AA~Category~961~Search~plus | emalls.ir - price list of gift cards and 'legal' Plus accounts (14 Mordad / 11 Mordad snapshots; year not shown) | F38 (Plus listings) | per search summary |
| [S43] | https://emalls.ir/مشخصات_اکانت-Github-Copilot-Pro-گیتهاب-کوپایلت-پرو-اختصاصی~id~27223274 | emalls.ir - GitHub Copilot Pro dedicated account listing | F41 (Copilot Pro listing) | per search summary |
| [S44] | https://emalls.ir/%d9%85%d8%b4%d8%ae%d8%b5%d8%a7%d8%aa_%d8%a7%d8%b4%d8%aa%d8%b1%d8%a7%da%a9-%d8%a7%d8%b3%d9%be%d8%a7%d8%aa%db%8c%d9%81%d8%a7%db%8c-%d9%be%d8%b1%d9%85%db%8c%d9%88%d9%85~id~9945800 | emalls.ir - Spotify Premium subscription listing | F39 (Spotify listing) | per search summary |
| [S45] | https://emalls.ir/%d9%85%d8%b4%d8%ae%d8%b5%d8%a7%d8%aa_%d8%a7%da%a9%d8%a7%d9%86%d8%aa-%d9%be%d8%b1%db%8c%d9%85%db%8c%d9%88%d9%85-%d9%86%d8%aa%d9%81%d9%84%db%8c%da%a9%d8%b3-Netflix-Premium~id~4010355 | emalls.ir - Netflix Premium account listing (sellers akcell and naghdfarsi named in the search summary) | F40 (Netflix listings) | per search summary |
| [S46] | https://www.zoomit.ir/pr/447519-diamond-land-chatgpt/ | Zoomit promoted article (Diamond Land, ChatGPT) - plus blog.faradars.org and maktabkhooneh.org 'What is ChatGPT Plus / how to buy in Iran' | demand evidence: ChatGPT Plus guides/PR | per search summary |
| [S47] | https://digiato.com/promoted/guide-to-buy-claude-account-in-iran | Digiato promoted article - guide to buying a Claude account in Iran | demand evidence: Claude | per search summary |
| [S48] | https://www.zoomit.ir/pr/438974-premify | Zoomit promoted article (Premify, Spotify) - plus zoomit.ir/pr/428425-spotify-acc and digiato.com/promoted/best-way-to-buy-spotify-premium-in-iran | demand evidence: Spotify | per search summary |
| [S49] | https://voidly.ai/ai-blocked/is-claude-blocked-in-iran | voidly.ai - Is Claude blocked in Iran? | Claude unavailable in Iran (secondary) | per search summary |
| [S50] | docs/business-plan-full-context.md | Internal first-pass business plan (2026-10-02): mpay profile, Plus price band 1.3-6.4M IRT, Singapore-region cards, 7-USDT-rail facts | internal: Plus band, mpay facts, Singapore-region cards | internal file |
| [S51] | scripts/pricing_model.py | Internal first-pass cost model (constants and scenarios) | internal: cost-model constants, scenarios | internal file |
| [S52] | docs/03-research/_briefs/07-competitor-benchmark-ir.md | Internal brief 07 - roster of >=15 Iranian competitors (virtual cards / FX payments / licences) | internal: competitor roster | internal file |
| [S53] | https://moveo.ai/blog/countries-where-chatgpt-is-banned | Moveo.ai - countries where ChatGPT is banned in 2026 (also bankinfosecurity.com 'OpenAI drops ChatGPT access for users in China, Russia, Iran') | OpenAI/ChatGPT unavailable for Iran (secondary) | per search summary |
