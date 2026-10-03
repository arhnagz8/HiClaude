#!/usr/bin/env python3
"""Builds data/platform.json (brief 09). Run: python3 scripts/research/09_build_platform_json.py"""
import json
AS="2026-10-02"
TG="https://core.telegram.org/bots/webapps"
def R(value,unit=None,conf="low",status="UNVERIFIED",src=None,verify="",note=None):
    r={"value":value,"as_of":AS,"confidence":conf,"status":status}
    if unit:r["unit"]=unit
    r["sources"]=src or [{"url":"internal","title":"recalled from training knowledge, not re-fetched this session","note":"UNVERIFIED"}]
    r["verify_how"]=verify
    if note:r["note"]=note
    return r
S_SUM=lambda u,t:[{"url":u,"title":t,"note":"per search summary"}]
NPM=lambda p:[{"url":"https://www.npmjs.com/package/"+p,"title":"npm registry `npm view "+p+" version` run in sandbox 2026-10-02","note":"seen directly via npm CLI"}]
def npm(p,v,note=None):
    return R(v,"semver",conf="high",status="verified",src=NPM(p),verify="npm view %s version"%p,note=note)
d={"_meta":{"file":"platform.json","owner_agent":"09-platform-tech-security","as_of":AS,
"purpose":"Technical facts: Telegram/Bale endpoints, limits, library versions, hosting, security parameters, infra cost placeholders.",
"evidence_note":"Session WebSearch budget was exhausted; only 3 searches + npm registry + local node checks were possible. Most Telegram/Bale facts are from training knowledge and marked UNVERIFIED/low or medium (the Telegram initData scheme has 2 independent search summaries). Infra prices are null on purpose.",
"do_not_do":["No geo-restriction or filtering circumvention tooling; document lawful split-deployment only.","No fake identities/cards; card data is stored only for cards legitimately issued to the customer by the provider."]},
"telegram":{
 "bot_api_base":R("https://api.telegram.org/bot{token}/{method}",conf="high",status="reported",src=S_SUM("https://core.telegram.org/bots/api","Telegram Bot API"),verify="Open core.telegram.org/bots/api"),
 "initdata_hmac_secret":R("secret_key = HMAC_SHA256(key='WebAppData', msg=bot_token); hash = hex(HMAC_SHA256(key=secret_key, msg=data_check_string))",conf="medium",status="reported",src=S_SUM("https://docs.telegram-mini-apps.com/platform/init-data","Init data (Mini Apps docs)")+S_SUM("https://telega-webapp.hexdocs.pm/","telega webapp"),verify="Compare with " + TG + " and a unit test using a real captured initData"),
 "initdata_data_check_string":R("all fields except `hash` (and `signature` for the HMAC path per Telegram docs - verify), sorted alphabetically by key, joined as key=value with \\n",conf="medium",status="reported",src=S_SUM("https://docs.telegram-mini-apps.com/platform/init-data","Init data"),verify="Test with real initData; check whether `signature` must be excluded"),
 "initdata_ed25519":R("Third-party validation: verify base64url `signature` (Ed25519) over '<bot_id>:WebAppData\\n'+data_check_string(without hash, signature) with Telegram's public key; no bot token needed",conf="low",status="UNVERIFIED",src=S_SUM("https://docs.telegram-mini-apps.com/platform/init-data","Init data"),verify="Read the 'Validating data for Third-Party Use' section at "+TG+"; copy public keys (production and test) from there, never from a blog"),
 "initdata_auth_date_max_age":R(86400,"seconds",conf="low",src=S_SUM("https://adsgram.ai/blog/adsgram/telegram-mini-app-tma-development-mistakes-and-how-to-avoid-them","TMA mistakes"),verify="Policy choice; we recommend 3600 s for login, 300 s for sensitive actions",note="Telegram does not mandate a window; this is a project policy."),
 "rate_limit_global_msgs_per_sec":R(30,"msgs/s",conf="medium",status="reported",src=S_SUM("https://grammy.dev/advanced/flood","grammY flood limits"),verify="Telegram Bot FAQ; limits are undocumented and vary"),
 "rate_limit_per_chat_msgs_per_sec":R(1,"msgs/s",conf="medium",status="reported",src=S_SUM("https://grammy.dev/advanced/flood","grammY flood limits"),verify="Bot FAQ"),
 "rate_limit_group_msgs_per_min":R(20,"msgs/min",conf="medium",status="reported",src=S_SUM("https://grammy.dev/advanced/flood","grammY flood limits"),verify="Bot FAQ"),
 "paid_broadcast_max_per_sec":R(1000,"msgs/s",conf="low",status="reported",src=S_SUM("https://grammy.dev/advanced/flood","flood limits (allow_paid_broadcast)"),verify="Bot API changelog; costs Stars per message above 30/s",note="Irrelevant for us: Stars cannot be bought with Toman by us; use batching below 30/s."),
 "webhook_ports":R([443,80,88,8443],"ports",conf="medium",status="UNVERIFIED",verify="setWebhook docs"),
 "webhook_secret_header":R("X-Telegram-Bot-Api-Secret-Token (set via setWebhook secret_token, 1-256 chars A-Za-z0-9_-)",conf="medium",status="UNVERIFIED",verify="setWebhook docs"),
 "file_download_limit_mb":R(20,"MB",conf="medium",status="UNVERIFIED",verify="getFile docs; local Bot API server lifts it"),
 "file_upload_limit_mb":R(50,"MB",conf="medium",status="UNVERIFIED",verify="sendDocument docs"),
 "stars_digital_goods_rule":R("Digital goods/services sold inside Telegram bots/Mini Apps must use Telegram Stars (currency XTR); third-party payment providers only for physical goods. Effective 2024-06-12.",conf="medium",status="reported",src=S_SUM("https://telegram.org/blog/telegram-stars","Telegram Stars: Pay for Digital Goods and More"),verify="Read Telegram Bot Payments + Terms for Mini Apps/Stars"),
 "lawful_toman_pattern":R("Do not take Toman or card data through Telegram payment APIs. The Mini App is a storefront and status view; checkout opens our own web payment page (gateway/card-to-card/USDT) in the external browser; bot sends status. Legal-review flag: whether Telegram treats the service as 'digital goods inside Telegram' (counsel/Telegram support).",conf="low",status="UNVERIFIED",verify="Ask Telegram support / @BotSupport in writing; get counsel opinion"),
 "iran_accessibility":R("Telegram is filtered in Iran; customers rely on VPN. Treat Telegram as a non-critical secondary channel; web+PWA and Bale are primary.",conf="low",status="UNVERIFIED",verify="Field test from 3 Iranian ISPs (MCI, Irancell, TCI) and monitor monthly"),
},
"bale":{
 "bot_api_base":R("https://tapi.bale.ai/bot{token}/{method}",conf="high",status="reported",src=[{"url":"docs/03-research/03-ir-payments-collection.md","title":"specialist 03 F35"}],verify="docs.bale.ai"),
 "file_base":R("https://tapi.bale.ai/file/bot{token}/{path}",conf="medium",status="reported",src=[{"url":"docs/03-research/03-ir-payments-collection.md","title":"specialist 03 section 3.1"}],verify="docs.bale.ai"),
 "miniapp_object":R("window.Bale.WebApp; raw initData string",conf="low",status="reported",src=[{"url":"https://docs.bale.ai/miniapp","title":"Bale mini apps (title only)"}],verify="Capture initData from a real bot and try the Telegram HMAC scheme; if it fails read docs.bale.ai/miniapp"),
 "initdata_algorithm":R(None,conf="low",status="UNVERIFIED",verify="Implement validator behind an interface; test with real captured initData. Hypothesis: same as Telegram HMAC-SHA256 scheme with WebAppData key (UNVERIFIED)."),
 "amount_unit":R("IRR (Rial)",conf="medium",status="reported",src=[{"url":"docs/03-research/03-ir-payments-collection.md","title":"F37"}],verify="sendInvoice test"),
 "webhook_secret":R("setWebhook has only `url`: use a secret path + verify via inquireTransaction",conf="low",status="reported",src=[{"url":"docs/03-research/03-ir-payments-collection.md","title":"F42"}],verify="docs.bale.ai"),
 "rate_limits":R(None,conf="low",status="UNVERIFIED",verify="docs.bale.ai; load-test with backoff; start at 1 msg/s per chat, 20 msg/s global"),
 "other_messengers":R("Eitaa, Rubika, Soroush Plus: not researched; treat as phase 3 optional",conf="low",status="UNVERIFIED",verify="Check bot/payment APIs and domestic-hosting expectations"),
},
"hosting":{
 "providers_considered":R(["ArvanCloud (CDN, VPS, object storage, DDoS)","Hamravesh (PaaS)","ParsPack","Iranserver","Mizbanfa"],conf="low",status="UNVERIFIED",verify="Collect plan prices from each pricing page on the day of purchase"),
 "mvp_vps_price_irt_month":R(None,"IRT/month",verify="Arvan/Hamravesh pricing pages (2 vCPU, 4 GB, 60 GB NVMe)"),
 "foreign_vps_price_usd_month":R(None,"USD/month",verify="Provider pricing page; check provider acceptance of the owner's legitimate payment method and Iran-based customer terms (sanctions: counsel)"),
 "domain_ir_price_irt_year":R(None,"IRT/year",verify="nic.ir reseller price list"),
 "tls":R("Use ACME (Let's Encrypt) DNS-01 or HTTP-01; reachability of ACME endpoints from Iranian IPs is UNVERIFIED -> issue certificates on the foreign worker/edge or use the CDN's managed certificate",conf="low",status="UNVERIFIED",verify="Run certbot --dry-run from the Iranian server"),
 "architecture_pattern":R("Split deployment: (A) Iran edge = web/PWA, API read paths, payment-gateway callbacks, Bale webhook; (B) abroad worker = chain/exchange/provider API calls, queues; communicate via authenticated HTTPS (mTLS) pull queue. Egress relay is our own, for our own legitimate API traffic; do not use it to hide customer/operator origin from providers.",conf="medium",status="UNVERIFIED",verify="Prototype and measure latency/loss between the two sites"),
 "data_residency":R(None,conf="low",status="UNVERIFIED",verify="Counsel (see docs/03-research/04-legal-tax-ir.md R11 and open item 8)"),
},
"pwa":{
 "font":R("Vazirmatn, self-hosted woff2 (npm `vazirmatn` 33.0.3); no Google Fonts at runtime",conf="high",status="verified",src=NPM("vazirmatn"),verify="npm view vazirmatn"),
 "jalali_intl":R("Intl.DateTimeFormat('fa-IR-u-ca-persian-nu-arabext')",conf="medium",status="UNVERIFIED",verify="Test in Chrome, Safari iOS 16+, Android WebView, Telegram/Bale in-app webviews"),
 "jalali_libs":R(["jalaali-js 2.0.1","date-fns-jalali 4.4.0-0"],conf="high",status="verified",src=NPM("jalaali-js")+NPM("date-fns-jalali"),verify="npm view"),
 "perf_budget_initial_js_kb_gz":R(180,"KB gz",conf="low",status="UNVERIFIED",verify="Project policy; measure with vite build + bundlesize",note="Design target, not a fact."),
},
"security":{
 "card_data_encryption":R("Envelope encryption: per-record random 256-bit DEK (AES-256-GCM, 96-bit nonce, AAD=record id) wrapped by a KEK from env/KMS; key id stored with ciphertext; KEK rotation by re-wrapping DEKs",conf="medium",status="UNVERIFIED",verify="Security review; test vectors"),
 "reveal_policy":R({"reveal_once_ttl_seconds":120,"step_up":"OTP + Telegram/Bale re-auth or TOTP","max_reveals_per_card_per_day":3,"cvv_stored":"only if provider requires; prefer fetching live from provider each time"},conf="low",status="UNVERIFIED",verify="Project policy; tune after pilot"),
 "pci_dss_scope":R("Storing/displaying PAN+CVV issued by a third party likely brings the platform into PCI DSS scope (as a service provider/merchant handling account data). Minimise: show provider-hosted reveal where possible, store nothing when the provider API allows re-fetch, tokenise. Needs QSA/counsel opinion.",conf="low",status="UNVERIFIED",verify="Ask provider whether re-fetch is possible; consult a PCI QSA"),
 "admin_auth":R({"2fa":"TOTP (RFC 6238) mandatory for all staff","rbac_roles":["owner","operator","finance","support","readonly"],"audit_log":"append-only, hash-chained","session_ttl_minutes":30},conf="medium",status="UNVERIFIED",verify="Project policy"),
 "rate_limits_policy":R({"otp_send_per_phone_per_hour":5,"otp_verify_attempts":5,"login_per_ip_per_min":10,"receipt_upload_per_order":5},conf="low",status="UNVERIFIED",verify="Project policy; tune on pilot data"),
 "backup_policy":R({"sqlite_snapshot":"every 15 min via VACUUM INTO / .backup, encrypted, copied to 2 locations","retention_days":35,"restore_drill":"monthly","rpo_minutes":15,"rto_hours":4},conf="low",status="UNVERIFIED",verify="Project policy; test restore"),
 "log_retention_days":R(90,"days",conf="low",status="UNVERIFIED",verify="Policy; align with counsel on legal retention"),
},
"node_sqlite":{
 "available_locally":R(True,conf="high",status="verified",src=[{"url":"local","title":"node v22.22.0 DatabaseSync(':memory:') executed in sandbox","note":"seen directly"}],verify="node -e \"require('node:sqlite')\""),
 "stability":R("Works without flag on v22.22.0 but prints ExperimentalWarning ('SQLite is an experimental feature and might change at any time')",conf="high",status="verified",src=[{"url":"local","title":"sandbox run","note":"seen directly"}],verify="Run node -e on target"),
 "recommendation":R("Use behind a repository interface; keep better-sqlite3 as drop-in fallback; plan Postgres via the same repos",conf="medium",status="UNVERIFIED",verify="Re-check Node release notes at each upgrade"),
},
"versions_npm_latest_2026_10_02":{
 "fastify":npm("fastify","5.12.5"),"zod":npm("zod","4.6.5"),"react":npm("react","19.3.0"),"vite":npm("vite","8.3.2"),
 "tailwindcss":npm("tailwindcss","4.3.3"),"grammy":npm("grammy","1.46.0"),"@twa-dev/sdk":npm("@twa-dev/sdk","8.0.2"),
 "@telegram-apps/sdk":npm("@telegram-apps/sdk","3.11.8"),"@tanstack/react-query":npm("@tanstack/react-query","5.104.1"),
 "jalaali-js":npm("jalaali-js","2.0.1"),"date-fns-jalali":npm("date-fns-jalali","4.4.0-0"),"decimal.js":npm("decimal.js","10.6.0"),
 "vitest":npm("vitest","5.0.3"),"@playwright/test":npm("@playwright/test","1.63.0"),"better-sqlite3":npm("better-sqlite3","13.0.3"),"i18next":npm("i18next","26.4.2"),
},
"versions_pinned_in_repo":{
 "note":R("Repo currently uses zod ^3.25, vitest ^2.1.8, decimal.js ^10.4.3, Node >=22.13; installed react 18.3.1 and vite 5.4.21. Latest majors differ (zod 4, vitest 5, react 19, vite 8). 'Known-good' = what the test-suite passes with; upgrade majors one at a time behind green tests.",conf="high",status="verified",src=[{"url":"local","title":"package.json files and node_modules","note":"seen directly"}],verify="npm ls")
},
"infra_cost_monthly":{
 "mvp":R(None,"IRT/month",verify="Sum: 1 Iran VPS + 1 foreign VPS + domain + SMS OTP + CDN free tier + monitoring; see doc table"),
 "growth":R(None,"IRT/month",verify="As above plus managed DB/Postgres, WAF, second region"),
 "scale":R(None,"IRT/month",verify="As above plus HA, 24x7 on-call"),
}}
json.dump(d,open("data/platform.json","w"),ensure_ascii=False,indent=2)
