#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
06_build_catalog.py  -  generates data/catalog.json (service catalogue) from the compact tables below.

Owner agent : 06-service-catalog-demand        As of: 2026-10-02 (10 Mehr 1405)

Why a generator?  data/catalog.json holds ~130 SKUs x ~20 Records. Keeping the facts in one compact,
reviewable table (this file) and generating the verbose Record structure avoids copy/paste drift and
makes the brief re-runnable: change a price or a source here, re-run, re-validate.

    python3 scripts/research/06_build_catalog.py            # writes data/catalog.json
    python3 scripts/research/06_build_catalog.py --md       # also prints Markdown tables for the research doc
    node scripts/validate-data.mjs data/catalog.json        # must print OK

PROVENANCE CLASSES (every Record says which one applies via `kind` + `status` + `confidence`)
  kind=fact        value seen in a source this run.  status "verified" = fetched directly from the official page;
                   "reported" = read in a search summary (page not fetched).  confidence high only with a direct
                   fetch or >=3 independent domains; medium = 2 independent / 1 reputable news item; low = single weak source.
  kind=prior       value from the analyst's prior knowledge, NOT checked in this run -> status UNVERIFIED, confidence low.
  kind=assumption  modelling parameter (typical order, repeat cadence, floors ...) -> status UNVERIFIED, confidence low.
  kind=judgement   analyst ranking (demand tier, risk label where vendor policy not read) -> UNVERIFIED, low.
  kind=policy      catalogue default (margin bands ...) the owner / pricing specialist may override.
  kind=definition  denomination / identifier, not a market fact.

LIMITATION (read this): the session-wide WebSearch budget (200) was exhausted after 48 searches by this specialist, and
WebFetch was blocked for almost every vendor host. Categories not searched at all are listed in meta.search_gaps.
"""
from __future__ import annotations

import argparse
import importlib
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
mt = importlib.import_module("06_margin_table")   # cost model + margin policy (single source of truth)

ROOT = HERE.parents[1]
OUT = ROOT / "data" / "catalog.json"
TODAY = "2026-10-02"

# ======================================================================================
# 1. Source registry
# ======================================================================================
_FETCHED = "fetched directly with WebFetch on 2026-10-02"
_SUMMARY = "per search summary (2026-10-02); page not fetched (fetch blocked or not attempted)"


def _s(id_, url, title, note=_SUMMARY):
    return {"id": id_, "url": url, "title": title, "note": note}


SOURCES = [
    _s("S01", "https://claude.com/pricing", "Claude pricing - individual plans (Anthropic)", _FETCHED),
    _s("S02", "https://github.com/features/copilot/plans", "GitHub Copilot plans and pricing", _FETCHED),
    _s("S03", "https://www.anthropic.com/supported-countries", "Anthropic - supported countries and regions (Iran not listed)", _FETCHED),
    _s("S04", "https://help.openai.com/en/articles/7947663-chatgpt-supported-countries-and-territories", "OpenAI Help Center - ChatGPT supported countries and territories"),
    _s("S05", "https://www.caixinglobal.com/2024-06-26/openai-enforces-harsher-api-restrictions-on-unsupported-countries-102209858.html", "Caixin 2024-06-26 - OpenAI enforces harsher API restrictions on unsupported countries"),
    _s("S06", "https://www.cometapi.com/chatgpt-pricing-2026-free-vs-go-vs-plus-vs-pro/", "CometAPI - ChatGPT Pricing 2026 (same query also returned geotoolbox.ai, gurusup.com, pricepertoken.com)"),
    _s("S07", "https://9to5mac.com/2026/04/09/openai-introduces-100-month-pro-plan-aimed-at-codex-users-heres-what-it-includes/", "9to5Mac 2026-04-09 - OpenAI introduces $100/month Pro plan (also thurrott.com, gigazine.net)"),
    _s("S08", "https://ai.zenken.co.jp/en/post/claude-pro-vs-max-comparison/", "Zenken - Claude Pro vs Max 2026 (also eesel.ai, ai-toolbox.co, noqta.tn)"),
    _s("S09", "https://www.engadget.com/2176060/", "Engadget - The Google AI Ultra plan now starts at $100 a month (also framia.converge.ai, razomua.media, ai-toolbox.co)"),
    _s("S10", "https://www.finout.io/blog/perplexity-pricing-in-2026", "Finout - Perplexity pricing in 2026 (also cloudzero.com, pricepertoken.com)"),
    _s("S11", "https://eesel.ai/blog/midjourney-pricing", "eesel.ai - Midjourney pricing in 2026 (also vendr.com, thepricer.org, costbench.com)"),
    _s("S12", "https://www.jetadmin.io/blog/cursor-pricing-explained-plans-credit-system-and-real-costs-in-2026/", "JetAdmin 2026-07-27 - Cursor pricing explained (also aicodereview.cc, zilliz.com)"),
    _s("S13", "https://costbench.com/software/ai-coding-assistants/github-copilot/", "CostBench - GitHub Copilot plans (also benchlm.ai)"),
    _s("S14", "https://ai-toolbox.co/grok-models/grok-pricing-plans-api-2026", "ai-toolbox.co - Grok pricing 2026 (also pricepertoken.com, finder.techleap.nl)"),
    _s("S15", "https://superblocks.com/blog/replit-ai-pricing", "Superblocks - Replit pricing 2026 (also costbench.com Lovable vs Replit)"),
    _s("S16", "https://costbench.com/compare/heygen-vs-runway/", "CostBench - Runway vs HeyGen pricing 2026 (ElevenLabs: smallest.ai, magichour.ai)"),
    _s("S17", "https://gptprompts.ai/suno-pricing", "gptprompts.ai - Suno pricing in 2026 (also costbench.com)"),
    _s("S18", "https://help.openai.com/en/articles/8264778-what-is-prepaid-billing", "OpenAI Help Center - prepaid billing"),
    _s("S19", "https://apicalculators.com/cloud-vps-comparison", "apicalculators.com - cloud VPS pricing comparison, June 2026 (also bitdoze.com)"),
    _s("S20", "https://aws.amazon.com/free/registration-faqs/", "AWS registration FAQs and repost.aws 'aws-authorization-charges' (prepaid cards, $1 authorization)"),
    _s("S21", "https://docs.cloud.google.com/free/docs/free-cloud-features", "Google Cloud free trial features ($300 / 90 days, payment method required)"),
    _s("S22", "https://petapixel.com/how-much-is-photoshop/", "PetaPixel - How much is Photoshop in 2026 (also costbench.com, redresscompliance.com)"),
    _s("S23", "https://designrr.io/canva-pricing/", "Designrr - Canva pricing (also aiproductivity.ai, tech-insider.org Figma vs Canva 2026)"),
    _s("S24", "https://office-watch.com/2026/microsoft-365-plans-overview/", "Office Watch - Microsoft 365 plans in 2026 (also recurdash.com, techbloat.com)"),
    _s("S25", "https://www.gend.co/sp/blog/notion-pricing", "gend.co - Notion pricing (Slack/Grammarly: getpricepulse.com, dupple.com, androidauthority.com)"),
    _s("S26", "https://www.fox13news.com/news/netflix-raising-prices-again-all-plans-how-much-more-youll-be-paying", "Fox TV stations (syndicated) - Netflix raising prices again on all plans"),
    _s("S27", "https://macdailynews.com/2026/07/17/apple-raises-apple-music-and-apple-one-subscription-prices/", "MacDailyNews 2026-07-17 - Apple raises Apple Music and Apple One prices (also mjtsai.com, bgr.com, iclarified.com)"),
    _s("S28", "https://subscriptionland.com/news/subscription-price-increase-2026-watchlist", "Subscriptionland - 2026 price-increase watchlist (Spotify US $13 / Duo $19; summary did not attribute to a single page)"),
    _s("S29", "https://9to5google.com/2026/04/10/youtube-premium-us-price-hike/", "9to5Google 2026-04-10 - YouTube Premium US price hike (also engadget.com, hongkiat.com)"),
    _s("S30", "https://www.gadgetreview.com/?p=414004", "Gadget Review - Disney+ Premium rises to $21.49/month (also cleveland19.com 2026-09-23)"),
    _s("S31", "https://www.purexbox.com/news/2026/04/heres-a-breakdown-of-the-new-prices-for-xbox-game-pass-as-of-april-2026", "Pure Xbox - Game Pass prices as of April 2026 (PS Plus: analyticsinsight.net, tech-insider.org)"),
    _s("S32", "https://www.thepricer.org/how-much-does-nintendo-online-cost/", "ThePricer - Nintendo Switch Online cost (also recurdash.com)"),
    _s("S33", "https://steamcommunity.com/discussions/forum/0/3811782223879459150", "Steam community thread on Iranian accounts / sanctions (USER CLAIMS, not Valve policy)"),
    _s("S34", "https://emalls.ir/مشخصات_گیفت-کارت-استیم-آمریکا~id~17659383", "emalls.ir - Steam US gift card listing (price aggregator; undated cache)"),
    _s("S35", "https://emalls.ir/مشخصات_گیفت-کارت-استیم-100-دلاری~id~2667269", "emalls.ir - Steam 100 USD gift card listing (price aggregator; undated cache)"),
    _s("S36", "https://fortune.com/2017/08/25/apple-iranian-apps-sanctions", "Fortune 2017-08-25 - Apple removes Iranian apps citing sanctions (also businesstech.co.za, pplware.sapo.pt)"),
    _s("S37", "https://dundle.com/support/help-with-my-code/google-play-gift-card-help/", "Dundle - Google Play gift cards are region-locked (country and currency)"),
    _s("S38", "https://support.google.com/google-ads/answer/6163740", "Google Ads help - Understanding Google Ads country restrictions (Iran listed as unavailable)"),
    _s("S39", "https://nobitex.ir/mag/news-tether-price-2026-09-30/", "Nobitex Mag 2026-09-30 - Tether price Wed 8 Mehr 1405 (also taadolnewspaper.ir, rokna.net, eghtesadonline.com, nabzgheymat.ir)"),
    _s("S40", "https://tabdeal.org/academy/news/dollar-tether-price-9-shahrivar-1405/", "Tabdeal Academy - dollar and Tether price 9 Shahrivar 1405"),
    _s("S41", "https://tabdeal.org/academy/news/usdt-price-today-11th-dollar/", "Tabdeal Academy - Tether price 11 Tir (1405)"),
    _s("S42", "https://emalls.ir/%D9%84%DB%8C%D8%B3%D8%AA-%D9%82%DB%8C%D9%85%D8%AA_%DA%AF%DB%8C%D9%81%D8%AA-%DA%A9%D8%A7%D8%B1%D8%AA~Category~961~Search~plus", "emalls.ir - price list of gift cards and 'legal' Plus accounts (14 Mordad / 11 Mordad snapshots; year not shown)"),
    _s("S43", "https://emalls.ir/مشخصات_اکانت-Github-Copilot-Pro-گیتهاب-کوپایلت-پرو-اختصاصی~id~27223274", "emalls.ir - GitHub Copilot Pro dedicated account listing"),
    _s("S44", "https://emalls.ir/%d9%85%d8%b4%d8%ae%d8%b5%d8%a7%d8%aa_%d8%a7%d8%b4%d8%aa%d8%b1%d8%a7%da%a9-%d8%a7%d8%b3%d9%be%d8%a7%d8%aa%db%8c%d9%81%d8%a7%db%8c-%d9%be%d8%b1%d9%85%db%8c%d9%88%d9%85~id~9945800", "emalls.ir - Spotify Premium subscription listing"),
    _s("S45", "https://emalls.ir/%d9%85%d8%b4%d8%ae%d8%b5%d8%a7%d8%aa_%d8%a7%da%a9%d8%a7%d9%86%d8%aa-%d9%be%d8%b1%db%8c%d9%85%db%8c%d9%88%d9%85-%d9%86%d8%aa%d9%81%d9%84%db%8c%da%a9%d8%b3-Netflix-Premium~id~4010355", "emalls.ir - Netflix Premium account listing (sellers akcell and naghdfarsi named in the search summary)"),
    _s("S46", "https://www.zoomit.ir/pr/447519-diamond-land-chatgpt/", "Zoomit promoted article (Diamond Land, ChatGPT) - plus blog.faradars.org and maktabkhooneh.org 'What is ChatGPT Plus / how to buy in Iran'"),
    _s("S47", "https://digiato.com/promoted/guide-to-buy-claude-account-in-iran", "Digiato promoted article - guide to buying a Claude account in Iran"),
    _s("S48", "https://www.zoomit.ir/pr/438974-premify", "Zoomit promoted article (Premify, Spotify) - plus zoomit.ir/pr/428425-spotify-acc and digiato.com/promoted/best-way-to-buy-spotify-premium-in-iran"),
    _s("S49", "https://voidly.ai/ai-blocked/is-claude-blocked-in-iran", "voidly.ai - Is Claude blocked in Iran?"),
    _s("S50", "docs/business-plan-full-context.md", "Internal first-pass business plan (2026-10-02): mpay profile, Plus price band 1.3-6.4M IRT, Singapore-region cards, 7-USDT-rail facts", "internal repository document (secondary research of an earlier session)"),
    _s("S51", "scripts/pricing_model.py", "Internal first-pass cost model (constants and scenarios)", "internal repository script"),
    _s("S52", "docs/03-research/_briefs/07-competitor-benchmark-ir.md", "Internal brief 07 - roster of >=15 Iranian competitors (virtual cards / FX payments / licences)", "internal repository document"),
    _s("S53", "https://moveo.ai/blog/countries-where-chatgpt-is-banned", "Moveo.ai - countries where ChatGPT is banned in 2026 (also bankinfosecurity.com 'OpenAI drops ChatGPT access for users in China, Russia, Iran')"),
]
SRC = {s["id"]: s for s in SOURCES}

# ======================================================================================
# 2. Record builder
# ======================================================================================
VALID_KIND = {"fact", "prior", "assumption", "judgement", "policy", "definition", "derived"}


def R(value, unit=None, conf="low", kind="assumption", src=(), note=None, verify=None, status=None, as_of=TODAY, **extra):
    """Build a data/*.json Record. Enforces the validator rules at build time."""
    assert kind in VALID_KIND, kind
    rec = {"value": value}
    if unit:
        rec["unit"] = unit
    rec["as_of"] = as_of
    rec["confidence"] = conf
    srcs = [SRC[k] for k in src]
    if srcs:
        rec["sources"] = srcs
    if status is None:
        if value is None or kind in ("prior", "assumption", "judgement"):
            status = "UNVERIFIED"
        elif kind == "fact":
            status = "reported"
        else:
            status = "reported" if srcs else "UNVERIFIED"
    rec["status"] = status
    rec["kind"] = kind
    if note:
        rec["note"] = note
    if verify:
        rec["verify_how"] = verify
    rec.update(extra)
    if value is None:
        assert verify, "null value needs verify_how"
    if conf in ("high", "medium") and status != "UNVERIFIED":
        assert srcs, f"{conf}/{status} record needs sources: {value}"
    return rec


def fact(value, unit, conf, src, note=None, status=None, verify=None, **extra):
    return R(value, unit, conf, "fact", src, note, verify, status, **extra)


# ======================================================================================
# 3. Taxonomy, FX anchors, cost-model defaults
# ======================================================================================
TAXONOMY = {
    "fulfilment_modes": {
        "A": "Top-up of the customer's OWN payment instrument (virtual card / wallet issued to the customer) for the customer's OWN purchase. Lowest platform liability; vendor-side risk sits on the customer's account. Default for subscriptions, SaaS, AI, cloud.",
        "B": "Gift card / voucher / wallet code bought from a licensed aggregator and delivered to the customer. Instant, low support; code is usually country/currency-locked - never sell a code for a region the customer cannot lawfully hold.",
        "C": "Direct payment on the customer's behalf (agent model: we pay the vendor/exam body/airline at checkout for the customer's own account/booking). Only where the vendor accepts third-party payers or an agent channel exists; never with misstated customer identity or location. Legal review required by default.",
        "D": "Account/seat provisioned and owned by us and handed over (shared accounts, family/team invite slots, resold seats). ONLY where the vendor's terms or a reseller programme allow it. Otherwise NOT offered (ToS breach, suspension risk, refund disputes). No SKU in this catalogue is approved for D.",
    },
    "risk_labels": {
        "low": "Vendor not US-bound or product globally redeemable; no Iran exclusion found; provider custody risk only.",
        "medium": "Vendor Iran policy unverified/ambiguous, or the main risk is counterparty/payment-instrument decline, or domestic-law ambiguity.",
        "high": "Vendor documents or is known to exclude Iran / sanctions-bound; account suspension, balance loss or refund dispute is plausible; disclosure and refund policy mandatory.",
    },
    "offer_recommendation": {
        "offer": "Offer normally.",
        "offer_with_disclosure": "Offer only with the mandatory third-party suspension-risk disclosure and the refund policy shown and accepted at checkout. The platform never instructs customers to mask location, identity or billing address. PROVISIONAL: the whole class still needs written sign-off from the legal/sanctions specialists (04/05) and counsel - this label is a catalogue recommendation, not clearance.",
        "legal_review_required": "Do not list until the legal/sanctions specialists (04/05) clear it in writing.",
        "do_not_offer": "No lawful reseller path found (vendor/regulator prohibits or domestic-law exposure). A lawful alternative is given in restriction_note where one exists.",
    },
    "demand_tiers": {
        "S": "Top-of-market demand; evidence of many competing sellers and paid media placements.",
        "A": "Strong, steady demand.", "B": "Niche but recurring.", "C": "Rare / long tail.",
    },
    "demand_evidence_classes": {
        "E1": "Persian 'how to buy X in Iran' guides or paid (promoted) placements on large Iranian media/education sites - seen in this run.",
        "E2": "Multi-seller listings on an Iranian price aggregator (emalls.ir) - seen in this run.",
        "E3": "Competitor prominence (brief 07 roster of >=15 Iranian virtual-card / FX-payment / licence sellers) - internal.",
        "E4": "Analyst prior knowledge, no evidence gathered this run (lowest confidence).",
    },
    "categories": ["ai", "cloud", "productivity", "messaging", "ads", "media", "gaming", "appstore", "education", "freelance", "vpn_security", "telecom", "shopping", "travel", "cards"],
}

FX_ANCHORS = [
    fact(176679, "IRT per USDT", "low", ["S41"], "Tabdeal Academy: USDT in reputable domestic exchanges on 11 Tir 1405 (2026-07-02), +0.73 % d/d (single source).", id="usdt_irt_2026-07-02", label="11 Tir 1405", as_of="2026-07-02"),
    fact(207597, "IRT per USDT", "medium", ["S40", "S39"], "9 Shahrivar 1405 (2026-08-31): Tabdeal 207,597 (another Tabdeal summary line says 207,415; cash USD 208,820). Cross-check: Nobitex Mag gives 208,975 for '30 days before 8 Mehr' - two independent sources agree within 0.7 %.", id="usdt_irt_2026-08-31", label="9 Shahrivar 1405", as_of="2026-08-31"),
    fact(231121, "IRT per USDT", "low", ["S39"], "Nobitex Mag: price 7 days before 8 Mehr (about 2026-09-23).", id="usdt_irt_2026-09-23", label="about 1 Mehr 1405", as_of="2026-09-23"),
    fact(258190, "IRT per USDT", "medium", ["S39"], "8 Mehr 1405 (2026-09-30): average 258,190 (+0.97 % d/d; +11.71 % in 7 d; +23.55 % in 30 d); Nobitex quote 258,901; Taadol/Rokna headlines ~259k; nabzgheymat 'toward 260k' (summaries of 5 domestic outlets).", id="usdt_irt_2026-09-30", label="8 Mehr 1405", as_of="2026-09-30"),
    fact(256900, "IRT per USDT", "low", ["S50"], "Internal first-pass doc: ~256,900 on 10 Mehr 1405 (2026-10-02). The brief uses ~257k as 'current'.", id="usdt_irt_2026-10-02", label="10 Mehr 1405", as_of="2026-10-02"),
]

COST_MODEL = {
    "fx_base_irt_per_usdt": R(257000, "IRT per USDT", "medium", "fact", ["S39", "S50"], "Base FX of the margin table (brief: ~257k)."),
    "exchange_trade_fee_pct": R(0.35, "pct", "low", "assumption", [], "from scripts/pricing_model.py (S51)", "Specialist 02 (data/fees.json): exchange fee schedule."),
    "exchange_spread_pct": R(0.4, "pct", "low", "assumption", [], "from scripts/pricing_model.py (S51)", "Specialist 02: observe buy/sell spread on the chosen exchange."),
    "network_fee_usdt": R(1.0, "USDT per withdrawal", "low", "assumption", [], "TRC-20; per scripts/pricing_model.py (S51); batching N orders per withdrawal divides it.", "Specialist 02: exchange withdrawal-fee page."),
    "provider_topup_fee_pct": R(3.0, "pct", "low", "assumption", [], "mpay top-up % is UNPUBLISHED; peers charge 2.5-4 % (S50). Placeholder.", "Specialist 01 (data/providers.json): read the fee table inside a funded account."),
    "voucher_fee_pct": R(0.0, "pct", "low", "assumption", [], "mode B placeholder: face value, no fee/discount.", "Specialist 01: aggregator catalogue pricing and reseller discount."),
    "card_issue_fee_usd": R(4.99, "USD", "low", "assumption", [], "mpay issue fee per secondary sources (S50).", "Specialist 01: issue a test card."),
    "rial_collection_fee_pct": R(0.5, "pct", "low", "assumption", [], "blended; scripts/pricing_model.py (S51).", "Specialist 03 (data/fees.json): gateway / card-to-card costs."),
    "risk_buffer_pct": R(2.0, "pct", "low", "assumption", [], "scripts/pricing_model.py (S51).", "Specialist 12: calibrate from simulated slippage and refunds."),
    "operator_cost_irt_per_order": R(40000, "IRT", "low", "assumption", [], "scripts/pricing_model.py (S51); real labour cost is an ops-growth (10) input.", "Specialist 10: time-and-motion of one operator-assisted order."),
    "rush_premium_pct": R(12, "pct", "low", "assumption", [], "scripts/pricing_model.py (S51): rush premium 12-15 % on top of margin.", "Specialist 12 / competitor 07: observed express premiums."),
    "customer_price_rounding_irt": R(1000, "IRT", "low", "policy", [], "CLAUDE.md: customer prices round UP; 1,000 IRT here, psychological rounding is a pricing-engine policy."),
    "margin_bands_pct_by_list_usd": R([{"lt_usd": 15, "margin_pct": 18}, {"lt_usd": 30, "margin_pct": 15}, {"lt_usd": 75, "margin_pct": 12}, {"lt_usd": 150, "margin_pct": 10}, {"lt_usd": None, "margin_pct": 8}], "pct", "low", "policy", [],
                                      "Derived from pricing_model.py scenarios ($20->15, $25 bundle->20, $50->12, $100->10) and extended at both ends. No VAT included (VAT: specialist 04).", "Specialist 12 replaces with the elasticity-based policy."),
    "support_floor_irt_by_burden": R(mt.SUPPORT_FLOOR_IRT, "IRT", "low", "assumption", [], "absolute margin floor component: support minutes (assumption).", "Specialist 10: support minutes per order by category."),
    "refund_floor_irt_by_risk": R(mt.REFUND_FLOOR_IRT, "IRT", "low", "assumption", [], "absolute margin floor component: refund reserve (assumption).", "Specialist 12 / sim: refund incidence by risk label."),
    "vendor_tax_uplift_pct": R(None, "pct", note="Some vendors add VAT/GST/sales tax by billing country (Anthropic's price page: 'Prices shown don't include applicable tax', S01). Unknown for the card region the provider uses.",
                               verify="Buy one low-value item per vendor class with the actual funding card and compare receipt vs list price."),
    "iran_vat_pct_on_resale": R(None, "pct", note="Domestic VAT treatment of the resale margin / full price belongs to specialist 04.", verify="Specialist 04 (legal-tax) + licensed accountant."),
}

# ======================================================================================
# 4. Official pages (used only inside verify_how texts - they are NOT asserted as sources unless in SRC)
# ======================================================================================
OFFICIAL = {
    "chatgpt": "https://openai.com/chatgpt/pricing", "openai-api": "https://platform.openai.com/docs/pricing", "claude": "https://claude.com/pricing",
    "claude-api": "https://claude.com/pricing#api", "gemini": "https://one.google.com/about/google-ai-plans/", "perplexity": "https://www.perplexity.ai/pro",
    "midjourney": "https://docs.midjourney.com/hc/en-us/articles/27870484040333-Comparing-Midjourney-Plans", "cursor": "https://cursor.com/pricing",
    "copilot": "https://github.com/features/copilot/plans", "replit": "https://replit.com/pricing", "lovable": "https://lovable.dev/pricing",
    "suno": "https://suno.com/pricing", "elevenlabs": "https://elevenlabs.io/pricing", "runway": "https://runwayml.com/pricing", "heygen": "https://www.heygen.com/pricing",
    "grok": "https://x.ai/grok", "aws": "https://aws.amazon.com/free/", "gcp": "https://cloud.google.com/free", "azure": "https://azure.microsoft.com/free/",
    "do": "https://www.digitalocean.com/pricing/droplets", "hetzner": "https://www.hetzner.com/cloud/", "vultr": "https://www.vultr.com/pricing/",
    "linode": "https://www.linode.com/pricing/", "cloudflare": "https://www.cloudflare.com/plans/", "vercel": "https://vercel.com/pricing",
    "domain": "https://www.namecheap.com/domains/", "workspace": "https://workspace.google.com/pricing", "adobe": "https://www.adobe.com/creativecloud/plans.html",
    "canva": "https://www.canva.com/pricing/", "figma": "https://www.figma.com/pricing/", "notion": "https://www.notion.com/pricing", "slack": "https://slack.com/pricing",
    "zoom": "https://zoom.us/pricing", "m365": "https://www.microsoft.com/microsoft-365/buy/compare-all-microsoft-365-products", "dropbox": "https://www.dropbox.com/plans",
    "grammarly": "https://www.grammarly.com/plans", "telegram": "https://telegram.org/faq_premium", "netflix": "https://help.netflix.com/en/node/24926",
    "spotify": "https://www.spotify.com/us/premium/", "youtube": "https://www.youtube.com/premium", "disney": "https://www.disneyplus.com/",
    "apple-one": "https://www.apple.com/apple-one/", "apple-music": "https://www.apple.com/apple-music/", "steam": "https://store.steampowered.com/steamaccount/addfunds",
    "playstation": "https://www.playstation.com/ps-plus/", "xbox": "https://www.xbox.com/xbox-game-pass", "nintendo": "https://www.nintendo.com/us/switch/online/",
    "riot": "https://support-valorant.riotgames.com/", "roblox": "https://www.roblox.com/giftcards", "pubg": "https://www.midasbuy.com/", "freefire": "https://shop.garena.com/",
    "codm": "https://www.callofduty.com/mobile", "fortnite": "https://www.fortnite.com/vbucks", "blizzard": "https://us.shop.battle.net/", "apple-gift": "https://www.apple.com/shop/gift-cards",
    "google-play": "https://play.google.com/store/giftcards", "apple-dev": "https://developer.apple.com/programs/", "google-dev": "https://play.google.com/console/signup",
    "coursera": "https://www.coursera.org/courseraplus", "udemy": "https://www.udemy.com/", "duolingo": "https://www.duolingo.com/super", "ielts": "https://ielts.org/",
    "toefl": "https://www.ets.org/toefl/test-takers/ibt/register/fees.html", "gre": "https://www.ets.org/gre/test-takers/general-test/register/fees.html",
    "pte": "https://www.pearsonpte.com/", "det": "https://englishtest.duolingo.com/", "visa": "the destination's official visa portal (e.g. travel.state.gov, VFS/TLScontact)",
    "upwork": "https://www.upwork.com/legal", "fiverr": "https://www.fiverr.com/terms_of_service", "paypal": "https://www.paypal.com/en/webapps/mpp/country-worldwide",
    "wise": "https://wise.com/help/articles/2932695/supported-countries", "payoneer": "https://www.payoneer.com/legal/", "nordvpn": "https://nordvpn.com/pricing/",
    "bitwarden": "https://bitwarden.com/pricing/", "reloadly": "https://www.reloadly.com/", "esim": "https://www.airalo.com/", "amazon": "https://www.amazon.com/gift-cards",
    "aliexpress": "https://www.aliexpress.com/", "temu": "https://www.temu.com/", "booking": "https://www.booking.com/", "airbnb": "https://www.airbnb.com/help",
    "flight": "the airline's own booking page", "insurance": "the insurer's own quote page", "google-ads": "https://support.google.com/google-ads/answer/6163740",
    "meta-ads": "https://www.facebook.com/business/help", "tiktok-ads": "https://ads.tiktok.com/", "x-ads": "https://business.x.com/en/help", "telegram-ads": "https://ads.telegram.org/",
    "mpay": "https://mpay.cards (fetch blocked; read the in-app fee table after funding a test account - specialist 01)",
}


def vh(key, extra=""):
    return f"Read the official page {OFFICIAL[key]} (read-only; do not create accounts or buy). Record plan, USD price, billing cadence, tax note and date." + (" " + extra if extra else "")


# ======================================================================================
# 5. Restriction-note templates (provenance spelled out)
# ======================================================================================
N_OPENAI = ("OpenAI's supported-countries list does not include Iran; OpenAI states that accessing the service outside supported countries may lead to blocking or suspension (S04, per search summary - page not fetchable). "
            "API traffic from unsupported countries (incl. Iran) has been blocked since 2024-07-09 (S05). The customer's account carries the ban risk; disclose it, never advise masking location/billing address.")
N_ANTHROPIC = ("Iran is NOT in Anthropic's Supported Regions list (S03, fetched directly); Anthropic reserves the right to refuse service outside supported regions. voidly.ai (per summary) reports Claude is effectively unavailable in Iran "
               "(vendor geo-restriction plus network filtering, S49). The customer's account carries the ban risk; disclose it.")
N_US = ("US-based vendor: US sanctions compliance normally excludes Iran-based customers. The vendor-specific wording was NOT verified in this run (prior knowledge) - read its terms / supported-countries page before listing. "
        "Risks: suspension, loss of paid balance, refund disputes; disclose to the customer.")
N_NONUS = ("Vendor is not US-based and its Iran policy was NOT verified in this run; EU/UK sanctions law, the vendor's own ToS and its payment processor may still exclude Iran-based customers. Verify before listing.")
N_GAME_CODE = ("Wallet/gift codes are country- and currency-locked; Valve/Sony/Microsoft/Nintendo run no Iranian storefront and act under US sanctions law (community reports only, S33; vendor stance UNVERIFIED). "
               "Never sell a code for a region the customer cannot lawfully hold; account locks and frozen wallets are plausible.")
N_STREAM = ("Not offered in Iran (no Iranian storefront; US sanctions). A lawful purchase path for an Iran-resident customer is not documented by the vendor (prior knowledge, UNVERIFIED). "
            "Cheap Iranian offers in this segment are usually shared / invite-slot / regional-price products that breach vendor ToS (see price-evidence section) - this platform does NOT replicate them.")
N_DNO_ADS = ("Do not offer. Google Ads is not available to advertisers in Iran and accounts in embargoed countries are suspended with no grace period (S38, per summary of the Google Ads help page). "
             "Using a foreign entity or third-party identity to buy ads would be origin-hiding / evasion and is excluded by the project guardrails. Lawful alternative: domestic Iranian ad networks (e.g. Yektanet, Tapsell - UNVERIFIED names, ask specialist 10).")
N_DNO_PAY = ("Do not offer. Payment/wallet providers of this type exclude Iran-based users under US sanctions (prior knowledge, UNVERIFIED - read the provider's supported-countries page). Funding or receiving through borrowed or third-party accounts is excluded by the guardrails (identity borrowing). "
             "Lawful alternative: none inside this product's scope; domestic freelance marketplaces for local work; refer cross-border receipts to the legal specialist (04).")

# ======================================================================================
# 6. SKU builder
# ======================================================================================
REPEAT = {"monthly": 6.0, "annual": 1.0, "usage": 4.0, "wallet": 4.0, "game_topup": 8.0, "exam": 0.5, "giftcard": 3.0, "travel": 1.5, "onetime": 1.0, "quarterly": 3.0}
REPEAT_NOTE = {"monthly": "monthly cadence (max 12/yr) x assumed 50 % of months active", "annual": "annual cadence (1/yr)", "usage": "credit/wallet top-ups, assumed 4/yr",
               "wallet": "game wallet top-ups, assumed 4/yr", "game_topup": "in-game currency top-ups, assumed 8/yr", "exam": "exam/visa fees: ~1 test per 2 years", "giftcard": "gift-card shopping, assumed 3/yr",
               "travel": "assumed 1.5 trips/yr", "onetime": "one-off purchase", "quarterly": "assumed 3/yr"}
PAY_OPENAI = ("billing_address_sensitive", "low", ("S50",), "Internal doc (S50): billing-address mismatch declines reported for Singapore-region cards at sensitive gateways such as OpenAI (secondary research, not first-hand).")
PAY_AWS = ("prepaid_rejected", "medium", ("S20",), "AWS: prepaid cards not supported; $1 authorization attempted at signup; cards that cannot take refunds fail verification (per summary of AWS FAQ / repost.aws).")
PAY_GCP = ("prepaid_may_decline", "low", ("S21",), "Free trial needs a valid payment method for identity verification; summaries suggest prepaid virtual cards may be refused (not explicit).")
SKUS = []


def sku(id_, en, fa, vendor, cat, *, usd=None, usd_conf="low", usd_src=(), usd_kind="fact", usd_note=None, usd_status=None, official=None,
        billing, modes=("A",), default=None, new_card=False,
        risk="high", risk_note="", risk_src=(), risk_conf="low", risk_kind="judgement", factors=(),
        demand="B", demand_ev="", demand_src=(),
        order=None, order_note=None, rep="monthly", flagship=False, offer="offer_with_disclosure", offer_note=None,
        support="medium", refund="medium", supplier="card", automation="operator_assisted", rush=True,
        options=None, quotes=None, notes=None, legal_review_modes=(), mode_d_note=None, tier_name=None, pay=None):
    default = default or modes[0]
    ref_usd = order if order is not None else usd
    if usd is None:
        usd_rec = R(None, "USD", note=usd_note or "Usage-based or not published in a verifiable way.", verify=vh(official) if official else "Read the vendor's official pricing page (read-only).")
    else:
        auto = "verified" if (usd_kind == "fact" and usd_src and all(SRC[k]["note"] == _FETCHED for k in usd_src)) else None
        usd_rec = R(usd, "USD", usd_conf, usd_kind, usd_src, usd_note, vh(official) if official else None, status=usd_status or auto)
    risk_status = "verified" if (risk_kind == "fact" and risk_src and all(SRC[k]["note"] == _FETCHED for k in risk_src)) else None
    risk_rec = R(risk, None, risk_conf, risk_kind, risk_src, "Judgement under the rubric in taxonomy.risk_labels; see restriction_note for evidence.",
                 "Read the vendor's terms / supported-countries page and the payment-method policy; log date + URL." if risk_conf == "low" else None, status=risk_status)
    note_rec = R(risk_note, None, risk_conf, "fact" if risk_src else "judgement", risk_src, None,
                 "Read the vendor's terms / supported-countries page; re-check monthly (policies change)." if (not risk_src or risk_conf == "low") else None,
                 status=risk_status)
    dem_rec = R(demand, "tier", "low", "judgement", demand_src, demand_ev or "analyst judgement (E4)",
                "Measure: Google Trends geo=IR for the Persian + English query set; Keyword Planner; aggregator seller counts; Telegram seller-channel sizes.")
    order_rec = R(ref_usd, "USD", "low", "assumption", [], order_note or ("one billing period at list price" if usd is not None else "assumed typical top-up"),
                  "Calibrate from competitor order-size evidence (specialist 07) and first live orders.") if ref_usd is not None else R(None, "USD", note="no list price", verify="Set after first orders.")
    rep_rec = R(REPEAT[rep], "orders per active customer per year", "low", "assumption", [], REPEAT_NOTE[rep], "Calibrate from cohort retention in the first live months (sim: retention curves).")
    offerable = offer not in ("do_not_offer",)
    if offerable and ref_usd is not None:
        margin_pct = float(mt.band_margin(ref_usd) * 100)
        margin_rec = R(margin_pct, "pct", "low", "policy", [], "Catalog default by ticket-size band (see cost_model_defaults.margin_bands_pct_by_list_usd); the pricing engine may override.")
        floor_rec = R(mt.min_margin_irt(support, refund), "IRT", "low", "assumption", [], f"absolute floor per order = support[{support}] + refund reserve[{refund}] (assumptions), at FX ~257k; index to inflation.",
                      "Calibrate with ops (10) and the simulator refund/support rates.")
    else:
        why = "not offered (do_not_offer)" if not offerable else "no list price yet"
        margin_rec = R(None, "pct", note=f"Margin undefined: {why}.", verify="Revisit only if legal review (04/05) clears the SKU and a list price is verified.")
        floor_rec = R(None, "IRT", note=f"Floor undefined: {why}.", verify="As above.")
    if pay is None:
        pay_rec = R("unknown", None, "low", "judgement", [], "Acceptance of virtual / prepaid cards was not verified for this merchant class.",
                    "Test with a $5 charge on the actual funding card (specialist 01 + ops); log decline code and date.")
    else:
        pv, pconf, psrc, pnote = pay
        pay_rec = R(pv, None, pconf, "fact", psrc, pnote, "Re-test with the actual funding card; log decline code and date." if pconf == "low" else None)
    out = {
        "id": id_, "name_en": en, "name_fa": fa, "vendor": vendor, "category": cat, "flagship": flagship,
        "fulfilment_modes": list(modes), "default_mode": default, "modes_requiring_legal_review": list(legal_review_modes), "mode_d_allowed": False,
        "usd_price": usd_rec, "billing": billing, "payment_instruments": pay_rec,
        "risk_label": risk_rec, "restriction_note": note_rec, "risk_factors": list(factors),
        "offer_recommendation": offer, "demand_tier": dem_rec, "typical_order_usd": order_rec, "repeat_per_year": rep_rec,
        "competitor_toman_prices": quotes or [], "recommended_margin_pct": margin_rec, "min_margin_irt": floor_rec,
        "support_burden": support, "fraud_refund_risk": refund, "supplier_fit": supplier, "automation": automation, "rush_eligible": bool(rush and offerable),
        "official_url": OFFICIAL.get(official) if official else None,
    }
    if new_card:
        out["new_card"] = True
    if options:
        out["price_options"] = options
    if offer_note:
        out["offer_note"] = offer_note
    if notes:
        out["notes"] = notes
    if mode_d_note:
        out["mode_d_note"] = mode_d_note
    SKUS.append(out)
    return out


def quote(seller, price, *, denom=None, comparable="no", tier="", note="", src="", listing="undated listing seen through a search summary (listing date not visible)", period=None):
    q = {"seller": seller, "price_irt": price, "as_of": TODAY, "fx_at_quote": None, "fx_at_quote_status": "UNKNOWN - listing undated; see fx_anchors for bracketing values",
         "comparable": comparable, "tier_hint": tier, "listing_date_hint": listing, "confidence": "low", "source_id": src}
    if denom:
        q["denomination_usd"] = denom
    if period:
        q["period"] = period
    if note:
        q["note"] = note
    return q


def opt(label, usd_total, conf, src, per_month=None, note=None):
    o = {"label": label, "usd_total": fact(usd_total, "USD", conf, src, note)}
    if per_month is not None:
        o["usd_per_month_equiv"] = fact(per_month, "USD/month", conf, src)
    return o


# ======================================================================================
# 7. SKU definitions
# ======================================================================================
# ---------------------------------- AI ----------------------------------------------
E_CHATGPT = "E1: Faradars + Maktabkhooneh guides and a Zoomit paid placement (Diamond Land) on buying ChatGPT Plus in Iran; E2: multi-seller emalls listings."
sku("chatgpt-go", "ChatGPT Go", "چت‌جی‌پی‌تی گو", "OpenAI", "ai", usd=8, usd_conf="low", usd_src=("S06",), official="chatgpt",
    usd_note="~$8/month in the US per aggregator summaries (single query). Go is regionally priced - exploiting regional price differences is geo-ToS evasion and is not a sourcing lever here.",
    billing="monthly", risk_note=N_OPENAI, risk_src=("S04", "S05", "S53"), risk_conf="medium", factors=("vendor_geo_exclusion", "region_mismatch", "refund_hard"),
    demand="B", demand_ev="E4 + E1 (same Persian guides cover all ChatGPT tiers); low ticket.", support="high", refund="high", pay=PAY_OPENAI)
sku("chatgpt-plus", "ChatGPT Plus", "چت‌جی‌پی‌تی پلاس", "OpenAI", "ai", usd=20, usd_conf="high", usd_src=("S06", "S07"), official="chatgpt", flagship=True,
    usd_note="$20/month. Consistent in 5 independent search results (aggregators; 9to5Mac 2026-04-09 'between the $20 Plus and the $200 Pro'; two Persian-language result summaries also say $20). Official page not fetchable (openai.com blocked).",
    billing="monthly", risk_note=N_OPENAI, risk_src=("S04", "S05", "S53"), risk_conf="medium", factors=("vendor_geo_exclusion", "region_mismatch", "refund_hard", "prepaid_card_decline"),
    demand="S", demand_ev=E_CHATGPT, demand_src=("S46",), support="high", refund="high",
    notes="Iranian retail structure: shared/invite-slot offers at ~10-25 % of official USD-equivalent coexist with private-account offers near official + markup (S50 band 1.3-6.4M IRT). Compete on the private/official tier only.",
    quotes=[quote("emalls.ir listing - 'shared' (اشتراکی) Plus account", 450000, denom=20, comparable="no", tier="shared access (ToS-breaching structure; not replicated)", src="S42", listing="Mordad snapshot (11/14 Mordad; year not shown)"),
            quote("emalls.ir listing - 'personal' (شخصی) Plus subscription", 890000, denom=20, comparable="no", tier="unclear structure (17 % of official @258k)", src="S42", listing="Mordad snapshot (year not shown)"),
            quote("Fara License (فرا لایسنس), via emalls search summary", 599000, denom=20, comparable="no", tier="unclear structure", src="S42", listing="Mordad snapshot (year not shown)"),
            quote("emalls.ir listing (product type not stated)", 158000, denom=20, comparable="no", tier="unclear - possibly partial period", src="S42", listing="Mordad snapshot (year not shown)"),
            quote("emalls.ir listing - upper end of returned range", 1390000, denom=20, comparable="no", tier="unclear structure", src="S42", listing="Mordad snapshot (year not shown)")], pay=PAY_OPENAI)
sku("chatgpt-pro-100", "ChatGPT Pro ($100 tier)", "چت‌جی‌پی‌تی پرو ۱۰۰ دلاری", "OpenAI", "ai", usd=100, usd_conf="high", usd_src=("S07", "S06"), official="chatgpt",
    usd_note="Launched 2026-04-09: $100/month, 5x Codex usage of Plus; the $200 Pro tier stays (9to5Mac, Thurrott, Gigazine, plus 2 more in the same search).",
    billing="monthly", risk_note=N_OPENAI, risk_src=("S04", "S05", "S53"), risk_conf="medium", factors=("vendor_geo_exclusion", "region_mismatch", "refund_hard", "prepaid_card_decline", "high_ticket"),
    demand="B", demand_ev="E4: developers/power users; new tier (Apr 2026).", support="high", refund="high", pay=PAY_OPENAI)
sku("chatgpt-pro-200", "ChatGPT Pro ($200 tier)", "چت‌جی‌پی‌تی پرو ۲۰۰ دلاری", "OpenAI", "ai", usd=200, usd_conf="high", usd_src=("S06", "S07"), official="chatgpt", flagship=True,
    usd_note="$200/month (20x Plus limits); retained next to the $100 tier (S07).", billing="monthly", risk_note=N_OPENAI, risk_src=("S04", "S05", "S53"), risk_conf="medium",
    factors=("vendor_geo_exclusion", "region_mismatch", "refund_hard", "prepaid_card_decline", "high_ticket"), demand="B", demand_ev="E4: niche high-ticket.", support="high", refund="high", pay=PAY_OPENAI)
sku("openai-api-credit", "OpenAI API prepaid credits", "اعتبار API اوپن‌ای‌آی", "OpenAI", "ai", usd=None, official="openai-api", usd_note="Usage-based prepaid credits; minimum purchase $5, default $10 (S18, per search summary). typical_order is an assumption.",
    billing="usage (prepaid credits, one-time purchases)", order=20, order_note="assumed typical top-up", rep="usage", risk_note=N_OPENAI, risk_src=("S04", "S05", "S53"), risk_conf="medium",
    factors=("vendor_geo_exclusion", "api_block_2024", "prepaid_card_decline"), demand="A", demand_ev="E4: Iranian developers; API blocked for unsupported countries since 2024-07-09 (S05) lowers feasibility.", support="high", refund="high",
    notes="Minimum purchase $5 / default $10 from the OpenAI prepaid-billing help page (per summary).", pay=PAY_OPENAI)
sku("claude-pro", "Claude Pro", "کلود پرو", "Anthropic", "ai", usd=20, usd_conf="high", usd_src=("S01",), official="claude", flagship=True,
    usd_note="$20/month, or $17/month billed $200 upfront (annual); prices exclude tax (S01, fetched directly).", billing="monthly or annual",
    options=[opt("annual (billed upfront)", 200, "high", ["S01"], per_month=17, note="'$17 per month with annual subscription discount ($200 billed up front)'")],
    risk_note=N_ANTHROPIC, risk_src=("S03", "S49"), risk_conf="high", risk_kind="fact", factors=("vendor_geo_exclusion", "region_mismatch", "refund_hard", "prepaid_card_decline", "tax_uplift"),
    demand="A", demand_ev="E1: Digiato paid placement 'guide to buy a Claude account in Iran' (S47).", demand_src=("S47",), support="high", refund="high")
sku("claude-max-5x", "Claude Max 5x", "کلود مکس ۵ برابر", "Anthropic", "ai", usd=100, usd_conf="high", usd_src=("S01",), official="claude", flagship=True,
    usd_note="'Starting from $100/month', 5x or 20x Pro usage, monthly billing only (S01, fetched directly).", billing="monthly",
    risk_note=N_ANTHROPIC, risk_src=("S03", "S49"), risk_conf="high", risk_kind="fact", factors=("vendor_geo_exclusion", "refund_hard", "prepaid_card_decline", "high_ticket", "tax_uplift"),
    demand="B", demand_ev="E4: power users / developers.", support="high", refund="high")
sku("claude-max-20x", "Claude Max 20x", "کلود مکس ۲۰ برابر", "Anthropic", "ai", usd=200, usd_conf="medium", usd_src=("S08", "S01"), official="claude",
    usd_note="$200/month for the 20x tier per 3 independent search results (Zenken, eesel, ai-toolbox); the fetched official page confirms the 5x/20x structure and the $100 start but does not print the 20x price.",
    billing="monthly", risk_note=N_ANTHROPIC, risk_src=("S03", "S49"), risk_conf="high", risk_kind="fact", factors=("vendor_geo_exclusion", "refund_hard", "prepaid_card_decline", "high_ticket", "tax_uplift"),
    demand="C", demand_ev="E4: niche.", support="high", refund="high")
sku("claude-api-credit", "Claude API prepaid credits", "اعتبار API کلود", "Anthropic", "ai", usd=None, official="claude-api",
    usd_note="Usage-based prepaid credits; minimum purchase NOT verified in this run.", billing="usage (prepaid credits)", order=20, order_note="assumed typical top-up", rep="usage",
    risk_note=N_ANTHROPIC + " Iran is excluded for the API as well as claude.ai (S03).", risk_src=("S03", "S49"), risk_conf="high", risk_kind="fact", factors=("vendor_geo_exclusion", "prepaid_card_decline"),
    demand="B", demand_ev="E4: developers.", support="high", refund="high")
sku("google-ai-plus", "Google AI Plus", "گوگل ای‌آی پلاس", "Google", "ai", usd=4.99, usd_conf="medium", usd_src=("S09",), official="gemini",
    usd_note="$4.99/month (US) per Engadget/ai-toolbox search results; regionally priced (e.g. 34.99 PLN in Poland).", billing="monthly",
    risk_note=N_US + " Google's Gemini consumer plans are sold only in supported countries (Iran not expected to be one).", factors=("vendor_geo_exclusion", "region_mismatch"),
    demand="B", demand_ev="E4.", support="medium", refund="medium")
sku("google-ai-pro", "Google AI Pro (Gemini)", "گوگل ای‌آی پرو (جمینای)", "Google", "ai", usd=19.99, usd_conf="medium", usd_src=("S09",), official="gemini", flagship=True,
    usd_note="$19.99/month (US); includes a YouTube Premium Lite subscription per Engadget (S09). Two independent summaries (Engadget; ai-toolbox).", billing="monthly",
    risk_note=N_US + " Google's Gemini consumer plans are sold only in supported countries (Iran not expected to be one).", factors=("vendor_geo_exclusion", "region_mismatch", "prepaid_card_decline"),
    demand="A", demand_ev="E4: Persian-language search for Gemini subscriptions in this run returned no Iranian seller pages (evidence gap).", support="high", refund="high")
sku("google-ai-ultra-100", "Google AI Ultra (5x tier)", "گوگل ای‌آی اولترا (۵ برابر)", "Google", "ai", usd=99.99, usd_conf="medium", usd_src=("S09",), official="gemini",
    usd_note="$99.99/month from May 2026 (Google I/O); previously $249.99 (-60 %).", billing="monthly", risk_note=N_US, factors=("vendor_geo_exclusion", "high_ticket"), demand="C", demand_ev="E4.", support="high", refund="high")
sku("google-ai-ultra-200", "Google AI Ultra (20x tier)", "گوگل ای‌آی اولترا (۲۰ برابر)", "Google", "ai", usd=199.99, usd_conf="medium", usd_src=("S09",), official="gemini",
    usd_note="$199.99/month (20x usage).", billing="monthly", risk_note=N_US, factors=("vendor_geo_exclusion", "high_ticket"), demand="C", demand_ev="E4.", support="high", refund="high")
sku("perplexity-pro", "Perplexity Pro", "پرپلکسیتی پرو", "Perplexity", "ai", usd=20, usd_conf="medium", usd_src=("S10",), official="perplexity", flagship=True,
    usd_note="$20/month or $200/year (~$16.67/month) - two separate searches (Finout, CloudZero/pricepertoken).", billing="monthly or annual",
    options=[opt("annual", 200, "medium", ["S10"], per_month=16.67)], risk_note=N_US, factors=("vendor_geo_exclusion", "region_mismatch"),
    demand="B", demand_ev="E4.", support="medium", refund="medium")
sku("perplexity-max", "Perplexity Max", "پرپلکسیتی مکس", "Perplexity", "ai", usd=200, usd_conf="medium", usd_src=("S10",), official="perplexity",
    usd_note="$200/month or $2,000/year.", billing="monthly or annual", options=[opt("annual", 2000, "medium", ["S10"], per_month=166.67)],
    risk_note=N_US, factors=("vendor_geo_exclusion", "high_ticket"), demand="C", demand_ev="E4.", support="medium", refund="high")
sku("midjourney-basic", "Midjourney Basic", "میدجرنی بیسیک", "Midjourney", "ai", usd=10, usd_conf="medium", usd_src=("S11",), official="midjourney",
    usd_note="$10/month; annual billing -20 % ($8/month) - eesel.ai plus a second search (thepricer/vendr).", billing="monthly or annual",
    options=[opt("annual", 96, "medium", ["S11"], per_month=8)], risk_note=N_US, factors=("vendor_geo_exclusion", "region_mismatch"), demand="B", demand_ev="E4.", support="medium", refund="medium")
sku("midjourney-standard", "Midjourney Standard", "میدجرنی استاندارد", "Midjourney", "ai", usd=30, usd_conf="medium", usd_src=("S11",), official="midjourney", flagship=True,
    usd_note="$30/month; annual $288 ($24/month); 15 fast hours + unlimited relax.", billing="monthly or annual", options=[opt("annual", 288, "medium", ["S11"], per_month=24)],
    risk_note=N_US, factors=("vendor_geo_exclusion", "region_mismatch"), demand="A", demand_ev="E4: designers; no Iranian seller page surfaced in this run (evidence gap).", support="medium", refund="medium")
sku("midjourney-pro", "Midjourney Pro", "میدجرنی پرو", "Midjourney", "ai", usd=60, usd_conf="medium", usd_src=("S11",), official="midjourney",
    usd_note="$60/month (annual $48/month); Mega tier $120/month (annual $96).", billing="monthly or annual", options=[opt("annual", 576, "medium", ["S11"], per_month=48)],
    risk_note=N_US, factors=("vendor_geo_exclusion",), demand="B", demand_ev="E4.", support="medium", refund="medium")
sku("cursor-pro", "Cursor Pro", "کرسر پرو", "Anysphere (Cursor)", "ai", usd=20, usd_conf="medium", usd_src=("S12",), official="cursor", flagship=True,
    usd_note="$20/month incl. a $20 credit pool; annual $192 ($16/month) - JetAdmin (2026-07-27) + a second search (zilliz).", billing="monthly or annual", options=[opt("annual", 192, "medium", ["S12"], per_month=16)],
    risk_note=N_US, factors=("vendor_geo_exclusion", "region_mismatch"), demand="A", demand_ev="E4: Iranian developers (strong prior).", support="medium", refund="medium")
sku("cursor-pro-plus", "Cursor Pro+", "کرسر پرو پلاس", "Anysphere (Cursor)", "ai", usd=60, usd_conf="medium", usd_src=("S12",), official="cursor", usd_note="$60/month, 3x credits.", billing="monthly",
    risk_note=N_US, factors=("vendor_geo_exclusion",), demand="B", demand_ev="E4.", support="medium", refund="medium")
sku("cursor-ultra", "Cursor Ultra", "کرسر اولترا", "Anysphere (Cursor)", "ai", usd=200, usd_conf="medium", usd_src=("S12",), official="cursor", usd_note="$200/month, 20x credits.", billing="monthly",
    risk_note=N_US, factors=("vendor_geo_exclusion", "high_ticket"), demand="C", demand_ev="E4.", support="medium", refund="high")
sku("copilot-pro", "GitHub Copilot Pro", "گیت‌هاب کوپایلت پرو", "GitHub (Microsoft)", "ai", usd=10, usd_conf="high", usd_src=("S02", "S13"), usd_status="verified", official="copilot", flagship=True,
    usd_note="$10/month or $100/year; unlimited completions + $15/month GitHub AI Credits; usage-based credits since 2026-06-01 (S02 fetched directly; S13 agrees on $10). Verified students/OSS maintainers may get it free (S02).",
    billing="monthly or annual", options=[opt("annual", 100, "high", ["S02"], per_month=8.33)], risk_note=N_US + " GitHub restricts services under trade controls; Copilot is a paid service.",
    factors=("vendor_geo_exclusion", "region_mismatch", "free_for_students"), demand="B", demand_ev="E2: emalls 'Github Copilot Pro dedicated account' listing (S43).", demand_src=("S43",), support="medium", refund="medium",
    quotes=[quote("emalls.ir listing - Copilot Pro 'dedicated' (اختصاصی) - low end of range", 2300000, denom=10, comparable="probable", tier="dedicated account", src="S43"),
            quote("emalls.ir listing - Copilot Pro 'dedicated' - high end of range", 3900000, denom=10, comparable="no", tier="upper bound of range (spread 70 %)", src="S43")])
sku("copilot-pro-plus", "GitHub Copilot Pro+", "گیت‌هاب کوپایلت پرو پلاس", "GitHub (Microsoft)", "ai", usd=39, usd_conf="high", usd_src=("S02", "S13"), usd_status="verified", official="copilot",
    usd_note="$39/month or $390/year; $70/month AI credits (S02 fetched directly).", billing="monthly or annual", options=[opt("annual", 390, "high", ["S02"], per_month=32.5)],
    risk_note=N_US, factors=("vendor_geo_exclusion",), demand="C", demand_ev="E4.", support="medium", refund="medium")
sku("copilot-max", "GitHub Copilot Max", "گیت‌هاب کوپایلت مکس", "GitHub (Microsoft)", "ai", usd=100, usd_conf="medium", usd_src=("S02",), usd_status="verified", official="copilot",
    usd_note="$100/month with $200/month AI credits - appears only on the fetched plans page (single source, new tier).", billing="monthly", risk_note=N_US, factors=("vendor_geo_exclusion", "high_ticket"),
    demand="C", demand_ev="E4.", support="medium", refund="high")
sku("replit-core", "Replit Core", "ریپلیت کور", "Replit", "ai", usd=25, usd_conf="medium", usd_src=("S15",), official="replit", usd_note="$25/month ($20/month annual); Pro $100/month.", billing="monthly or annual",
    options=[opt("annual", 240, "medium", ["S15"], per_month=20)], risk_note=N_US, factors=("vendor_geo_exclusion",), demand="B", demand_ev="E4.", support="medium", refund="medium")
sku("lovable-pro", "Lovable Pro", "لاوبل پرو", "Lovable", "ai", usd=21, usd_conf="low", usd_src=("S15",), official="lovable",
    usd_note="Entry Pro plan $21/month per one summary (single source; odd figure - verify).", billing="monthly", risk_note=N_NONUS, factors=("vendor_geo_unknown",), risk="medium",
    demand="B", demand_ev="E4.", support="medium", refund="medium")
sku("suno-pro", "Suno Pro", "سونو پرو", "Suno", "ai", usd=10, usd_conf="medium", usd_src=("S17",), official="suno", usd_note="$10/month ($8 annual), 2,500 credits (gptprompts.ai + costbench in the same search).",
    billing="monthly or annual", options=[opt("annual", 96, "medium", ["S17"], per_month=8)], risk_note=N_US, factors=("vendor_geo_exclusion",), demand="B", demand_ev="E4.", support="medium", refund="medium")
sku("suno-premier", "Suno Premier", "سونو پریمیر", "Suno", "ai", usd=30, usd_conf="medium", usd_src=("S17",), official="suno", usd_note="$30/month ($24 annual), 10,000 credits.", billing="monthly or annual",
    options=[opt("annual", 288, "medium", ["S17"], per_month=24)], risk_note=N_US, factors=("vendor_geo_exclusion",), demand="C", demand_ev="E4.", support="medium", refund="medium")
sku("elevenlabs-pro", "ElevenLabs Pro", "الون‌لبز پرو", "ElevenLabs", "ai", usd=99, usd_conf="low", usd_src=("S16",), official="elevenlabs", usd_note="$99/month, 600k credits (single search; cheaper Starter/Creator tiers not captured).",
    billing="monthly", risk_note=N_US, factors=("vendor_geo_exclusion", "high_ticket"), demand="C", demand_ev="E4.", support="medium", refund="medium")
sku("runway-pro", "Runway Pro", "رانوی پرو", "Runway", "ai", usd=28, usd_conf="low", usd_src=("S16",), official="runway", usd_note="$28 per user per month per one summary (probably annual-billed price; month-to-month likely higher - verify).",
    billing="monthly (annual-billed price?)", risk_note=N_US, factors=("vendor_geo_exclusion",), demand="C", demand_ev="E4.", support="medium", refund="medium")
sku("heygen-pro", "HeyGen Pro", "هی‌جن پرو", "HeyGen", "ai", usd=99, usd_conf="low", usd_src=("S16",), official="heygen", usd_note="$99/month per one summary (single source; lower plans not captured).",
    billing="monthly", risk_note=N_US, factors=("vendor_geo_exclusion", "high_ticket"), demand="C", demand_ev="E4.", support="medium", refund="medium")
sku("supergrok-lite", "SuperGrok Lite", "سوپرگراک لایت", "xAI", "ai", usd=10, usd_conf="medium", usd_src=("S14",), official="grok", usd_note="$10/month (xAI launch coverage, techleap; ai-toolbox).", billing="monthly",
    risk_note=N_US, factors=("vendor_geo_exclusion",), demand="C", demand_ev="E4.", support="medium", refund="medium")
sku("supergrok", "SuperGrok", "سوپرگراک", "xAI", "ai", usd=30, usd_conf="medium", usd_src=("S14",), official="grok", usd_note="$30/month.", billing="monthly",
    risk_note=N_US, factors=("vendor_geo_exclusion",), demand="B", demand_ev="E4.", support="medium", refund="medium")
sku("supergrok-heavy", "SuperGrok Heavy", "سوپرگراک هیوی", "xAI", "ai", usd=300, usd_conf="medium", usd_src=("S14",), official="grok", usd_note="$300/month.", billing="monthly",
    risk_note=N_US, factors=("vendor_geo_exclusion", "high_ticket"), demand="C", demand_ev="E4.", support="medium", refund="high")

# ---------------------------------- Cloud / dev --------------------------------------
N_CLOUD = " Cloud providers also verify the card at signup; prepaid/virtual cards are often refused (see card_acceptance_reports)."
sku("aws-credit-topup", "AWS account balance / card load", "شارژ حساب AWS", "Amazon Web Services", "cloud", usd=None, official="aws", billing="usage (pay-as-you-go)", order=25, rep="usage",
    usd_note="Pay-as-you-go. AWS charges a $1 authorization to verify a new card; prepaid cards are not supported and cards that cannot take refunds fail verification (S20, per summary).",
    risk_note="US-based vendor; Iran-based customers are normally outside AWS's customer terms (UNVERIFIED, prior knowledge). Prepaid cards are rejected at signup and a $1 authorization is attempted (S20)." + N_CLOUD,
    risk_src=("S20",), factors=("vendor_geo_exclusion", "prepaid_card_decline", "kyc_billing_match"), demand="B", demand_ev="E4: developers/startups.", support="high", refund="medium", pay=PAY_AWS)
sku("gcp-credit-topup", "Google Cloud billing balance / card load", "شارژ حساب Google Cloud", "Google", "cloud", usd=None, official="gcp", billing="usage (pay-as-you-go)", order=25, rep="usage",
    usd_note="Pay-as-you-go. Free trial = $300 for 90 days and needs a valid payment method for identity verification (S21, per summary); prepaid virtual cards may be refused.",
    risk_note="US-based vendor; Iran-based customers are normally outside Google Cloud's terms (UNVERIFIED). The free-trial payment-method check may refuse prepaid/virtual cards (S21)." + N_CLOUD, risk_src=("S21",),
    factors=("vendor_geo_exclusion", "prepaid_card_decline"), demand="B", demand_ev="E4.", support="high", refund="medium", pay=PAY_GCP)
sku("azure-credit-topup", "Microsoft Azure billing balance / card load", "شارژ حساب Azure", "Microsoft", "cloud", usd=None, official="azure", billing="usage (pay-as-you-go)", order=25, rep="usage",
    usd_note="Pay-as-you-go; not researched.", risk_note=N_US + N_CLOUD, factors=("vendor_geo_exclusion", "prepaid_card_decline"), demand="C", demand_ev="E4.", support="high", refund="medium")
sku("digitalocean-droplet-6", "DigitalOcean Droplet (entry, $6/month)", "سرور دیجیتال‌اوشن", "DigitalOcean", "cloud", usd=6, usd_conf="medium", usd_src=("S19",), official="do", flagship=True,
    usd_note="$6/month entry Droplet per the June-2026 VPS comparison; egress $0.01/GB above 1 TB. Single comparison page (bitdoze agrees on ordering, not on the figure).",
    billing="monthly (hourly metered, monthly cap)", order=25, order_note="assumed typical balance top-up (not one Droplet-month)", rep="usage",
    risk_note=N_US + N_CLOUD, factors=("vendor_geo_exclusion", "prepaid_card_decline"), demand="A", demand_ev="E4: Iranian devs/admins buy foreign VPS widely (prior).", support="medium", refund="medium")
sku("hetzner-cloud-entry", "Hetzner Cloud (entry plan)", "سرور هتزنر", "Hetzner", "cloud", usd=4.7, usd_conf="low", usd_src=("S19",), official="hetzner",
    usd_note="~EUR 4.35/month (~$4.70) typical entry plan; EUR 3.29 for 1 vCPU/1 GB; EU VAT may apply; 20 TB egress included (S19). Priced in EUR - USD figure is the source's conversion.",
    billing="monthly (EUR)", order=20, order_note="assumed typical balance top-up", rep="usage", risk="medium", risk_note=N_NONUS + N_CLOUD, factors=("vendor_geo_unknown", "prepaid_card_decline", "eu_vat"),
    demand="A", demand_ev="E4.", support="medium", refund="medium")
sku("vultr-cloud-6", "Vultr Cloud Compute (entry)", "سرور ولتر", "Vultr", "cloud", usd=6, usd_conf="low", usd_src=("S19",), official="vultr", usd_note="~$6/month entry plan ($3.50 IPv6-only tier).",
    billing="monthly", order=25, rep="usage", risk_note=N_US + N_CLOUD, factors=("vendor_geo_exclusion", "prepaid_card_decline"), demand="B", demand_ev="E4.", support="medium", refund="medium")
sku("linode-nanode-5", "Linode / Akamai (entry)", "سرور لینود", "Akamai (Linode)", "cloud", usd=5, usd_conf="low", usd_src=("S19",), official="linode", usd_note="$5/month entry plan.",
    billing="monthly", order=25, rep="usage", risk_note=N_US + N_CLOUD, factors=("vendor_geo_exclusion", "prepaid_card_decline"), demand="B", demand_ev="E4.", support="medium", refund="medium")
sku("cloudflare-pro", "Cloudflare Pro plan", "کلودفلر پرو", "Cloudflare", "cloud", usd=25, usd_conf="low", usd_kind="prior", official="cloudflare",
    usd_note="PRIOR KNOWLEDGE, not verified in this run: Pro ~$25/month monthly, ~$20/month annual.", billing="monthly or annual", risk_note=N_US, factors=("vendor_geo_exclusion",), demand="B", demand_ev="E4.", support="medium", refund="medium")
sku("vercel-pro", "Vercel Pro", "ورسل پرو", "Vercel", "cloud", usd=20, usd_conf="low", usd_kind="prior", official="vercel", usd_note="PRIOR KNOWLEDGE, not verified: ~$20 per seat per month plus usage.", billing="monthly per seat",
    risk_note=N_US, factors=("vendor_geo_exclusion",), demand="C", demand_ev="E4.", support="medium", refund="medium")
sku("domain-com", "Domain registration (.com, 1 year)", "ثبت دامنه .com", "Registrars (Namecheap etc.)", "cloud", usd=None, official="domain", billing="annual",
    usd_note="Registrar prices vary by TLD/registrar and renew higher than year-1 promos; not captured.", order=15, order_note="assumed typical yearly cost incl. ICANN fee", rep="annual",
    risk_note="Major registrars are US-based and apply sanctions screening; registration for Iran-based registrants may be refused or later cancelled (prior knowledge, UNVERIFIED). Never register through an unrelated third party's identity (guardrail).",
    factors=("vendor_geo_exclusion", "identity_match"), demand="A", demand_ev="E4: every Iranian web business needs foreign/.com domains (prior).", support="medium", refund="medium")
sku("google-workspace-starter", "Google Workspace Business Starter", "گوگل ورک‌اسپیس", "Google", "cloud", usd=None, official="workspace", billing="monthly per user (annual commitment option)",
    usd_note="Per-user list price not verified in this run.", order=84, order_note="assumed: 1 user x 12 months", rep="annual", risk_note=N_US + " Workspace is not sold into Iran.",
    factors=("vendor_geo_exclusion",), demand="B", demand_ev="E4.", support="medium", refund="medium")

# ---------------------------------- Productivity / design ----------------------------
sku("adobe-cc-all-apps", "Adobe Creative Cloud All Apps", "ادوبی کریتیو کلود (همه اپ‌ها)", "Adobe", "productivity", usd=59.99, usd_conf="medium", usd_src=("S22",), official="adobe", flagship=True,
    usd_note="$59.99/month (US) per PetaPixel/CostBench search; figure is probably the annual-commitment-billed-monthly price - month-to-month is higher (verify).", billing="monthly (annual commitment likely)",
    risk_note=N_US + " Adobe states it complies with US sanctions and does not sell to Iran (prior knowledge, UNVERIFIED).", factors=("vendor_geo_exclusion", "account_closure", "high_ticket"),
    demand="A", demand_ev="E4: designers/video editors; licence-key resale is a known Iranian market (prior).", support="medium", refund="high")
sku("adobe-photoshop-single", "Adobe Photoshop (single app)", "ادوبی فتوشاپ", "Adobe", "productivity", usd=22.99, usd_conf="medium", usd_src=("S22",), official="adobe", usd_note="$22.99/month (single app).",
    billing="monthly", risk_note=N_US, factors=("vendor_geo_exclusion", "account_closure"), demand="B", demand_ev="E4.", support="medium", refund="medium")
sku("adobe-photography", "Adobe Photography plan", "ادوبی فتوگرافی", "Adobe", "productivity", usd=9.99, usd_conf="medium", usd_src=("S22",), official="adobe", usd_note="$9.99/month (Photoshop + Lightroom).",
    billing="monthly", risk_note=N_US, factors=("vendor_geo_exclusion", "account_closure"), demand="B", demand_ev="E4.", support="medium", refund="medium")
sku("canva-pro", "Canva Pro", "کانوا پرو", "Canva", "productivity", usd=18, usd_conf="medium", usd_src=("S23",), official="canva", flagship=True,
    usd_note="$18/month or $180/year (~$15/month); Business $25/person/month (Designrr, aiproductivity, piktochart).", billing="monthly or annual", options=[opt("annual", 180, "medium", ["S23"], per_month=15)],
    risk_note=N_US + " Canva's availability in Iran was not verified.", factors=("vendor_geo_unknown", "region_mismatch"), risk="high", demand="A", demand_ev="E4: Iranian designers/social-media managers (prior).", support="medium", refund="medium")
sku("figma-professional", "Figma Professional (full seat)", "فیگما پروفشنال", "Figma", "productivity", usd=16, usd_conf="medium", usd_src=("S23",), official="figma",
    usd_note="$16/seat/month on annual billing (monthly billing is higher - not captured).", billing="per seat, annual", risk_note=N_US, factors=("vendor_geo_exclusion",), demand="B", demand_ev="E4.", support="medium", refund="medium")
sku("notion-plus", "Notion Plus", "نوشن پلاس", "Notion", "productivity", usd=10, usd_conf="low", usd_src=("S25",), official="notion", usd_note="$10/seat/month (as of Mar 2026, per summary); Business $18.",
    billing="monthly per seat", risk_note=N_US, factors=("vendor_geo_exclusion",), demand="B", demand_ev="E4.", support="medium", refund="medium")
sku("slack-pro", "Slack Pro", "اسلک پرو", "Slack (Salesforce)", "productivity", usd=10, usd_conf="low", usd_src=("S25",), official="slack", usd_note="$10/seat per summary (Jan 2026); Business+ $17.50.",
    billing="monthly per seat", risk_note=N_US, factors=("vendor_geo_exclusion",), demand="C", demand_ev="E4.", support="medium", refund="medium")
sku("zoom-workplace-pro", "Zoom Workplace Pro", "زوم پرو", "Zoom", "productivity", usd=None, official="zoom", usd_note="Not verified in this run.", billing="monthly or annual per licence",
    order=160, order_note="assumed ~1 licence-year", rep="annual", risk_note=N_US, factors=("vendor_geo_exclusion",), demand="B", demand_ev="E4.", support="medium", refund="medium")
sku("m365-personal", "Microsoft 365 Personal", "مایکروسافت ۳۶۵ شخصی", "Microsoft", "productivity", usd=99.99, usd_conf="high", usd_src=("S24",), official="m365", flagship=True,
    usd_note="$99.99/year (US) - Office Watch, recurdash, techbloat summaries agree.", billing="annual", rep="annual", risk_note=N_US + " Microsoft consumer subscriptions are not sold into Iran (prior knowledge, UNVERIFIED).",
    factors=("vendor_geo_exclusion", "account_closure"), demand="B", demand_ev="E4: licence-key resale is a known Iranian market (prior).", support="medium", refund="medium")
sku("m365-family", "Microsoft 365 Family", "مایکروسافت ۳۶۵ خانواده", "Microsoft", "productivity", usd=129.99, usd_conf="high", usd_src=("S24",), official="m365", usd_note="$129.99/year, up to 6 people.",
    billing="annual", rep="annual", risk_note=N_US, factors=("vendor_geo_exclusion", "shared_seat_temptation"), demand="B", demand_ev="E4.", support="medium", refund="medium",
    notes="Family plans invite 'slot resale' - a mode-D structure that is NOT offered.")
sku("m365-premium", "Microsoft 365 Premium", "مایکروسافت ۳۶۵ پریمیوم", "Microsoft", "productivity", usd=199.99, usd_conf="high", usd_src=("S24",), official="m365", usd_note="$199.99/year; added Oct 2025 replacing Copilot Pro.",
    billing="annual", rep="annual", risk_note=N_US, factors=("vendor_geo_exclusion", "high_ticket"), demand="C", demand_ev="E4.", support="medium", refund="medium")
sku("dropbox-plus", "Dropbox Plus", "دراپ‌باکس پلاس", "Dropbox", "productivity", usd=None, official="dropbox", usd_note="Not verified in this run.", billing="monthly or annual", order=120, order_note="assumed ~1 year",
    rep="annual", risk_note=N_US, factors=("vendor_geo_exclusion",), demand="C", demand_ev="E4.", support="medium", refund="medium")
sku("grammarly-premium", "Grammarly Premium", "گرامرلی پریمیوم", "Grammarly", "productivity", usd=12, usd_conf="low", usd_src=("S25",), official="grammarly",
    usd_note="$12/month per summary (probably annual-billed; monthly billing is higher - verify).", billing="monthly or annual", risk_note=N_US, factors=("vendor_geo_exclusion",), demand="B", demand_ev="E4: students/academics.", support="medium", refund="medium")

# ---------------------------------- Messaging -----------------------------------------
sku("telegram-premium", "Telegram Premium", "تلگرام پریمیوم", "Telegram", "messaging", usd=None, official="telegram", usd_note="Price varies by store/region and by purchase channel (app stores, @PremiumBot, Fragment/TON); not verified.",
    billing="monthly / 3-12 month gift", order=30, order_note="assumed 6-month purchase", rep="quarterly", modes=("A", "B"), default="B", supplier="voucher",
    risk="medium", risk_note="Telegram is not US-based; its Premium/Stars purchase channels (app stores, Fragment/TON) and any Iran restriction were NOT verified this run. Domestic-law exposure: crypto-denominated purchase channels (TON) - ask specialist 04.",
    factors=("channel_policy_unknown", "domestic_legal", "crypto_channel"), demand="A", demand_ev="E4 (no evidence gathered; prior: very large Iranian Telegram user base).", support="medium", refund="medium", automation="api_possible",
    offer="legal_review_required", legal_review_modes=("A", "B"), offer_note="Native to the Telegram Mini-App channel; confirm legality of the TON/Fragment route first.")
sku("telegram-stars", "Telegram Stars", "استارز تلگرام", "Telegram", "messaging", usd=None, official="telegram", usd_note="Per-star price varies by channel; not verified.", billing="per star pack",
    order=25, rep="usage", modes=("A", "B"), default="B", supplier="voucher", risk="medium", risk_note="As for Telegram Premium; also note Telegram's rule that digital goods inside bots are paid with Stars (S50, secondary).", risk_src=("S50",),
    factors=("channel_policy_unknown", "domestic_legal", "crypto_channel"), demand="B", demand_ev="E4.", support="medium", refund="medium", automation="api_possible", offer="legal_review_required", legal_review_modes=("A", "B"))

# ---------------------------------- Ads (do not offer) --------------------------------
sku("google-ads-credit", "Google Ads credit", "اعتبار گوگل ادز", "Google", "ads", usd=None, official="google-ads", usd_note="Ad spend top-up (usage); minimum varies.", billing="usage (prepaid/postpay)", order=100, rep="usage",
    risk_note=N_DNO_ADS, risk_src=("S38",), risk_conf="medium", factors=("vendor_geo_exclusion", "origin_hiding_trap"), demand="B", demand_ev="E4: marketing agencies (prior).", support="high", refund="high",
    offer="do_not_offer", rush=False)
sku("meta-ads-credit", "Meta (Facebook/Instagram) Ads credit", "اعتبار تبلیغات متا", "Meta", "ads", usd=None, official="meta-ads", usd_note="Ad spend top-up (usage).", billing="usage", order=100, rep="usage",
    risk_note="Do not offer: Meta's advertising/sanctions terms exclude Iran-based advertisers (prior knowledge, UNVERIFIED - read Meta's terms). Foreign-entity or third-party-identity workarounds are origin-hiding and excluded by the guardrails. " + "Lawful alternative: domestic ad networks (ask 10-ops-growth).",
    factors=("vendor_geo_exclusion", "origin_hiding_trap"), demand="B", demand_ev="E4.", support="high", refund="high", offer="do_not_offer", rush=False)
sku("tiktok-ads-credit", "TikTok Ads credit", "اعتبار تبلیغات تیک‌تاک", "TikTok", "ads", usd=None, official="tiktok-ads", usd_note="Ad spend top-up (usage).", billing="usage", order=100, rep="usage",
    risk_note="Do not offer: TikTok is not available in Iran and its ad platform excludes Iran-based advertisers (prior knowledge, UNVERIFIED).", factors=("vendor_geo_exclusion", "origin_hiding_trap"),
    demand="C", demand_ev="E4.", support="high", refund="high", offer="do_not_offer", rush=False)
sku("x-ads-credit", "X (Twitter) Ads credit", "اعتبار تبلیغات ایکس", "X Corp", "ads", usd=None, official="x-ads", usd_note="Ad spend top-up (usage).", billing="usage", order=100, rep="usage",
    risk_note="Do not offer: X Ads is a US-company service subject to sanctions screening (prior knowledge, UNVERIFIED).", factors=("vendor_geo_exclusion", "origin_hiding_trap"),
    demand="C", demand_ev="E4.", support="high", refund="high", offer="do_not_offer", rush=False)
sku("telegram-ads-credit", "Telegram Ads balance", "اعتبار تبلیغات تلگرام", "Telegram", "ads", usd=None, official="telegram-ads", usd_note="Prepaid advertiser balance (TON-based); minimum top-up not verified.",
    billing="usage (prepaid)", order=100, rep="usage", risk="medium", risk_note="Telegram Ads is operated by Telegram (not US-based) and is funded in TON; Iran-based-advertiser eligibility and the crypto channel were NOT verified. Telegram is filtered in Iran, so the audience is mostly outside the country. Domestic crypto-channel exposure: specialist 04.",
    factors=("channel_policy_unknown", "domestic_legal", "crypto_channel"), demand="C", demand_ev="E4.", support="high", refund="high", offer="legal_review_required", legal_review_modes=("A", "C"))

# ---------------------------------- Media ---------------------------------------------
N_STREAM_FULL = N_STREAM
sku("netflix-ads", "Netflix Standard with ads", "نتفلیکس استاندارد با تبلیغات", "Netflix", "media", usd=8.99, usd_conf="medium", usd_src=("S26",), official="netflix", usd_note="$8.99/month (US) after the 2026 increase (one syndicated news article).", billing="monthly",
    risk_note=N_STREAM_FULL, factors=("vendor_geo_exclusion", "region_mismatch", "shared_seat_temptation"), demand="C", demand_ev="E4.", support="medium", refund="medium", offer="legal_review_required", legal_review_modes=("A",))
sku("netflix-standard", "Netflix Standard", "نتفلیکس استاندارد", "Netflix", "media", usd=19.99, usd_conf="medium", usd_src=("S26",), official="netflix", flagship=True,
    usd_note="$19.99/month (US); extra member $7.99 with ads / $9.99 ad-free (Fox TV stations syndicated article; single news source).", billing="monthly",
    risk_note=N_STREAM_FULL, factors=("vendor_geo_exclusion", "region_mismatch", "shared_seat_temptation"), demand="A", demand_ev="E2: emalls Netflix Premium listing; E1: Persian virgool seller posts (S45).", demand_src=("S45",),
    support="medium", refund="medium", offer="legal_review_required", legal_review_modes=("A",))
sku("netflix-premium", "Netflix Premium", "نتفلیکس پریمیوم", "Netflix", "media", usd=26.99, usd_conf="medium", usd_src=("S26",), official="netflix", usd_note="$26.99/month (US).", billing="monthly",
    risk_note=N_STREAM_FULL, factors=("vendor_geo_exclusion", "region_mismatch", "shared_seat_temptation"), demand="B", demand_ev="E2: emalls listing (S45).", demand_src=("S45",), support="medium", refund="medium",
    offer="legal_review_required", legal_review_modes=("A",),
    quotes=[quote("akcell (اک سل), via search summary", 130000, denom=26.99, comparable="no", tier="1-month account, plan unspecified; far below official", src="S45", period="1 month"),
            quote("naghdfarsi (نقد فارسی) - 1 month", 95000, denom=26.99, comparable="no", tier="1-month account, plan unspecified", src="S45", period="1 month"),
            quote("naghdfarsi (نقد فارسی) - 3 months", 200000, denom=80.97, comparable="no", tier="3-month account (denomination = 3 x 26.99)", src="S45", period="3 months"),
            quote("emalls.ir - low end of returned range", 499000, denom=26.99, comparable="no", tier="unclear", src="S45"),
            quote("emalls.ir - high end of returned range", 770935, denom=26.99, comparable="no", tier="unclear", src="S45")])
sku("spotify-individual", "Spotify Premium Individual", "اسپاتیفای پریمیوم تک‌نفره", "Spotify", "media", usd=13, usd_conf="low", usd_src=("S28",), official="spotify", flagship=True,
    usd_note="~$13/month (US) after the early-2026 increase; the summary rounds to $13 (exact cents not captured); older Persian pages still cite $10.99 - stale. Single source.", billing="monthly",
    risk_note=N_STREAM_FULL, factors=("vendor_geo_exclusion", "region_mismatch", "shared_seat_temptation"), demand="A", demand_ev="E1: three paid Zoomit/Digiato placements by Spotify resellers (S48); E2: emalls listing (S44).", demand_src=("S48", "S44"),
    support="medium", refund="medium", offer="legal_review_required", legal_review_modes=("A",),
    quotes=[quote("emalls.ir - Spotify Premium Individual 1 month (low end)", 360000, denom=13, comparable="no", tier="structure unknown (~$1.4-1.6 equivalent); likely shared / regional / invite-slot", src="S44", period="1 month"),
            quote("emalls.ir - Spotify Premium Individual 1 month (high end)", 418000, denom=13, comparable="no", tier="same", src="S44", period="1 month")])
sku("spotify-duo", "Spotify Premium Duo", "اسپاتیفای دو نفره", "Spotify", "media", usd=19, usd_conf="low", usd_src=("S28",), official="spotify", usd_note="~$19/month (US), rounded in the source.", billing="monthly",
    risk_note=N_STREAM_FULL, factors=("vendor_geo_exclusion", "shared_seat_temptation"), demand="B", demand_ev="E4.", support="medium", refund="medium", offer="legal_review_required", legal_review_modes=("A",))
sku("youtube-premium", "YouTube Premium Individual", "یوتیوب پریمیوم", "Google", "media", usd=15.99, usd_conf="high", usd_src=("S29",), official="youtube", flagship=True,
    usd_note="$15.99/month (US) after the 2026-04 hike (was $13.99, +14.3 %) - 9to5Google, Engadget, Hongkiat, heise, Olhar Digital in one search.", billing="monthly",
    risk_note=N_STREAM_FULL, factors=("vendor_geo_exclusion", "region_mismatch", "shared_seat_temptation"), demand="A", demand_ev="E4 (no evidence gathered; prior: very high Iranian demand).", support="medium", refund="medium",
    offer="legal_review_required", legal_review_modes=("A",))
sku("youtube-premium-lite", "YouTube Premium Lite", "یوتیوب پریمیوم لایت", "Google", "media", usd=8.99, usd_conf="medium", usd_src=("S29",), official="youtube",
    usd_note="$8.99/month after the 2026 hike (was $7.99); one source says $9.99 - conflicting; $8.99 is the latest mid-2026 report.", billing="monthly", risk_note=N_STREAM_FULL,
    factors=("vendor_geo_exclusion", "region_mismatch"), demand="B", demand_ev="E4.", support="medium", refund="medium", offer="legal_review_required", legal_review_modes=("A",))
sku("youtube-premium-family", "YouTube Premium Family", "یوتیوب پریمیوم خانوادگی", "Google", "media", usd=26.99, usd_conf="high", usd_src=("S29",), official="youtube", usd_note="$26.99/month (was $22.99).", billing="monthly",
    risk_note=N_STREAM_FULL, factors=("vendor_geo_exclusion", "shared_seat_temptation"), demand="B", demand_ev="E4.", support="medium", refund="medium", offer="legal_review_required", legal_review_modes=("A",),
    notes="Family plans invite slot resale (mode D) - NOT offered.")
sku("disney-plus-premium", "Disney+ Premium", "دیزنی پلاس پریمیوم", "Disney", "media", usd=21.49, usd_conf="high", usd_src=("S30",), official="disney", usd_note="$21.49/month from 2026-09-23 (was $18.99, +13.2 %).",
    billing="monthly", risk_note=N_STREAM_FULL, factors=("vendor_geo_exclusion", "region_mismatch"), demand="C", demand_ev="E4.", support="medium", refund="medium", offer="legal_review_required", legal_review_modes=("A",))
sku("apple-one-individual", "Apple One Individual", "اپل وان تک‌نفره", "Apple", "media", usd=19.95, usd_conf="high", usd_src=("S27",), official="apple-one", usd_note="$19.95/month (unchanged in the July-2026 hike).", billing="monthly",
    risk_note=N_STREAM_FULL + " Apple runs no Iran storefront and removes Iranian apps citing sanctions (S36).", risk_src=("S36",), factors=("vendor_geo_exclusion", "region_mismatch", "apple_id_region"),
    demand="B", demand_ev="E4.", support="medium", refund="medium", offer="legal_review_required", legal_review_modes=("A",))
sku("apple-one-family", "Apple One Family", "اپل وان خانوادگی", "Apple", "media", usd=27.95, usd_conf="high", usd_src=("S27",), official="apple-one", usd_note="$27.95/month (was $25.95); Premier $39.95 (was $37.95).",
    billing="monthly", risk_note=N_STREAM_FULL, risk_src=("S36",), factors=("vendor_geo_exclusion", "apple_id_region", "shared_seat_temptation"), demand="C", demand_ev="E4.", support="medium", refund="medium",
    offer="legal_review_required", legal_review_modes=("A",))
sku("apple-music-individual", "Apple Music Individual", "اپل موزیک", "Apple", "media", usd=11.99, usd_conf="high", usd_src=("S27",), official="apple-music", usd_note="$11.99/month (was $10.99); Family $19.99; Student $6.99.",
    billing="monthly", risk_note=N_STREAM_FULL, risk_src=("S36",), factors=("vendor_geo_exclusion", "apple_id_region"), demand="C", demand_ev="E4.", support="medium", refund="medium", offer="legal_review_required", legal_review_modes=("A",))

# ---------------------------------- Gaming --------------------------------------------
G = dict(modes=("B",), default="B", supplier="voucher", automation="api_possible", support="low", refund="low", rep="wallet")
sku("steam-wallet-20", "Steam Wallet code $20", "گیفت کارت استیم ۲۰ دلاری", "Valve", "gaming", usd=20, usd_conf="medium", usd_src=("S34",), usd_kind="definition", official="steam", flagship=True,
    usd_note="Face value $20 (denomination, not a market price).", billing="one-time code", risk_note=N_GAME_CODE, risk_src=("S33",), risk_conf="low", factors=("vendor_geo_unknown", "region_lock", "wallet_freeze", "thin_margin"),
    demand="S", demand_ev="E2: emalls Steam gift-card pages for several denominations (S34, S35); long-standing Iranian gaming market (E4).", demand_src=("S34", "S35"),
    quotes=[quote("emalls.ir - Steam $20 (listing 1)", 4301000, denom=20, comparable="yes", tier="gift-card retailer", src="S34", note="Quote-implied 215,050 IRT/USD: matches USDT of 9 Shahrivar (207.6k) + 3.6 %, NOT today's ~258k - stale vs the Mehr jump."),
            quote("emalls.ir - Steam $20 (listing 2)", 4305000, denom=20, comparable="yes", tier="gift-card retailer", src="S34"),
            quote("emalls.ir - Steam $20 (listing 3)", 4370000, denom=20, comparable="yes", tier="gift-card retailer", src="S34"),
            quote("emalls.ir - 'cheapest Steam gift card' (denomination unclear; summary said 10 USD)", 4179000, denom=20, comparable="uncertain", tier="lowest listing", src="S34", note="At 10 USD this would be 418k/USD (impossible); treated as the $20 lowest listing = 208,950/USD.")], **G)
sku("steam-wallet-50", "Steam Wallet code $50", "گیفت کارت استیم ۵۰ دلاری", "Valve", "gaming", usd=50, usd_conf="medium", usd_src=("S34",), usd_kind="definition", official="steam", usd_note="Face value $50.", billing="one-time code",
    risk_note=N_GAME_CODE, risk_src=("S33",), factors=("vendor_geo_unknown", "region_lock", "wallet_freeze", "thin_margin"), demand="A", demand_ev="E2 (S34).", demand_src=("S34",), **G)
sku("steam-wallet-100", "Steam Wallet code $100", "گیفت کارت استیم ۱۰۰ دلاری", "Valve", "gaming", usd=100, usd_conf="medium", usd_src=("S35",), usd_kind="definition", official="steam", flagship=True, usd_note="Face value $100.",
    billing="one-time code", risk_note=N_GAME_CODE, risk_src=("S33",), factors=("vendor_geo_unknown", "region_lock", "wallet_freeze", "thin_margin", "high_ticket"), demand="A", demand_ev="E2: emalls 'Steam 100 dollar' page (S35).", demand_src=("S35",),
    quotes=[quote("emalls.ir - Steam $100 (listing 1)", 21033000, denom=100, comparable="yes", tier="gift-card retailer", src="S35", note="Quote-implied 210,330 IRT/USD (USDT 9 Shahrivar + 1.3 %); stale vs ~258k."),
            quote("emalls.ir - Steam $100 (listing 2)", 21505000, denom=100, comparable="yes", tier="gift-card retailer", src="S35")], **G)
sku("ps-plus-essential-12m", "PlayStation Plus Essential 12 months", "پلی‌استیشن پلاس اسنشیال ۱۲ ماهه", "Sony", "gaming", usd=79.99, usd_conf="medium", usd_src=("S31",), official="playstation", flagship=True,
    usd_note="$79.99/year (existing 12-month plans untouched by the 2026-05-20 hike; monthly Essential rose $9.99 -> $10.99).", billing="annual",
    modes=("B",), default="B", supplier="voucher", automation="api_possible", support="medium", refund="medium", rep="annual",
    risk_note=N_GAME_CODE.replace("Valve/", "") + " PSN is not offered in Iran (prior knowledge, UNVERIFIED); regional PSN accounts mismatch the customer's real region.", factors=("vendor_geo_exclusion", "region_lock", "apple_id_region"),
    demand="A", demand_ev="E4 (no evidence gathered; prior: very large Iranian console community).", offer="legal_review_required", legal_review_modes=("B",))
sku("ps-plus-essential-1m", "PlayStation Plus Essential 1 month", "پلی‌استیشن پلاس اسنشیال ۱ ماهه", "Sony", "gaming", usd=10.99, usd_conf="medium", usd_src=("S31",), official="playstation", usd_note="$10.99/month (was $9.99).",
    billing="monthly", modes=("B",), default="B", supplier="voucher", automation="api_possible", support="medium", refund="medium", rep="monthly", risk_note=N_GAME_CODE, factors=("vendor_geo_exclusion", "region_lock"),
    demand="B", demand_ev="E4.", offer="legal_review_required", legal_review_modes=("B",))
sku("ps-plus-extra-12m", "PlayStation Plus Extra 12 months", "پلی‌استیشن پلاس اکسترا ۱۲ ماهه", "Sony", "gaming", usd=134.99, usd_conf="medium", usd_src=("S31",), official="playstation", usd_note="$134.99/year; monthly Extra $16.99.",
    billing="annual", modes=("B",), default="B", supplier="voucher", automation="api_possible", support="medium", refund="medium", rep="annual", risk_note=N_GAME_CODE, factors=("vendor_geo_exclusion", "region_lock", "high_ticket"),
    demand="B", demand_ev="E4.", offer="legal_review_required", legal_review_modes=("B",))
sku("psn-wallet-50", "PSN wallet card $50", "گیفت کارت پلی‌استیشن ۵۰ دلاری", "Sony", "gaming", usd=50, usd_conf="low", usd_kind="definition", official="playstation", usd_note="Face value $50 (denomination).", billing="one-time code",
    risk_note=N_GAME_CODE, factors=("vendor_geo_exclusion", "region_lock", "apple_id_region"), demand="A", demand_ev="E4.", offer="legal_review_required", legal_review_modes=("B",), **{**G, "support": "low"})
sku("xbox-game-pass-ultimate", "Xbox Game Pass Ultimate", "ایکس‌باکس گیم پس اولتیمیت", "Microsoft", "gaming", usd=22.99, usd_conf="low", usd_src=("S31",), official="xbox",
    usd_note="$22.99/month per two search summaries (analyticsinsight; tech-insider June 2026 headline) and Pure Xbox 'new prices as of April 2026'. CONFLICT: the analyst's prior is $29.99 since Oct 2025 - a cut in Apr 2026 is plausible but unverified; verify.",
    billing="monthly", modes=("B",), default="B", supplier="voucher", automation="api_possible", support="medium", refund="medium", rep="monthly", risk_note=N_US + " Xbox services are not offered in Iran (prior knowledge).",
    factors=("vendor_geo_exclusion", "region_lock"), demand="B", demand_ev="E4.", offer="legal_review_required", legal_review_modes=("B",))
sku("nintendo-switch-online-12m", "Nintendo Switch Online 12 months (Individual)", "نینتندو سوییچ آنلاین", "Nintendo", "gaming", usd=19.99, usd_conf="medium", usd_src=("S32",), official="nintendo",
    usd_note="$19.99/year Individual (Family $34.99; Expansion Pack $49.99 / $79.99).", billing="annual", modes=("B",), default="B", supplier="voucher", automation="api_possible", support="low", refund="low", rep="annual",
    risk_note=N_US + " Nintendo runs no Iran eShop (prior knowledge).", factors=("vendor_geo_exclusion", "region_lock"), demand="C", demand_ev="E4.", offer="legal_review_required", legal_review_modes=("B",))
sku("riot-valorant-points", "Riot gift card (Valorant Points / RP)", "گیفت کارت ریوت (والورانت)", "Riot Games", "gaming", usd=None, official="riot", usd_note="Gift-card denominations not verified.", billing="one-time code",
    order=25, risk="medium", risk_note=N_US + " Riot's Iran availability not verified.", factors=("vendor_geo_unknown", "region_lock"), demand="B", demand_ev="E4.", **{**G, "rep": "wallet"})
sku("roblox-robux-card", "Roblox gift card / Robux", "گیفت کارت روبلاکس", "Roblox", "gaming", usd=None, official="roblox", usd_note="Gift-card denominations not verified.", billing="one-time code", order=25, risk="medium",
    risk_note=N_US + " Roblox's Iran availability not verified.", factors=("vendor_geo_unknown", "region_lock", "minors"), demand="B", demand_ev="E4.", **{**G, "rep": "wallet"})
sku("pubg-mobile-uc", "PUBG Mobile UC top-up", "شارژ یوسی پابجی موبایل", "Tencent / Krafton", "gaming", usd=None, official="pubg", usd_note="UC pack prices not verified.", billing="per top-up (player ID)", order=15,
    modes=("C",), default="C", supplier="publisher", automation="api_possible", support="medium", refund="medium", rep="game_topup", legal_review_modes=("C",), risk="medium",
    risk_note="Publisher-direct top-ups (player ID) are agent-style payments (mode C); the publisher's Iran policy and third-party-payer rules were NOT verified. Wrong player ID = lost funds.",
    factors=("vendor_geo_unknown", "third_party_payer", "wrong_id_loss", "minors"), demand="A", demand_ev="E4 (no evidence gathered; prior: very high among Iranian youth).", offer="legal_review_required")
sku("free-fire-diamonds", "Free Fire diamonds top-up", "شارژ الماس فری‌فایر", "Garena", "gaming", usd=None, official="freefire", usd_note="Not verified.", billing="per top-up (player ID)", order=10, modes=("C",), default="C",
    supplier="publisher", automation="api_possible", support="medium", refund="medium", rep="game_topup", legal_review_modes=("C",), risk="medium", risk_note="As for PUBG Mobile UC (mode C, publisher policy unverified).",
    factors=("vendor_geo_unknown", "third_party_payer", "wrong_id_loss", "minors"), demand="B", demand_ev="E4.", offer="legal_review_required")
sku("codm-cp", "Call of Duty Mobile CP top-up", "شارژ سی‌پی کالاف دیوتی موبایل", "Activision", "gaming", usd=None, official="codm", usd_note="Not verified.", billing="per top-up (player ID)", order=10, modes=("C",), default="C",
    supplier="publisher", automation="api_possible", support="medium", refund="medium", rep="game_topup", legal_review_modes=("C",), risk="medium", risk_note="As for PUBG Mobile UC; Activision is US-based (sanctions screening likely).",
    factors=("vendor_geo_unknown", "third_party_payer", "wrong_id_loss"), demand="B", demand_ev="E4.", offer="legal_review_required")
sku("fortnite-vbucks", "Fortnite V-Bucks card", "گیفت کارت وی‌باکس فورتنایت", "Epic Games", "gaming", usd=None, official="fortnite", usd_note="Card prices not verified.", billing="one-time code", order=20, risk="medium",
    risk_note=N_US + " Epic's Iran availability not verified.", factors=("vendor_geo_unknown", "region_lock"), demand="B", demand_ev="E4.", **{**G, "rep": "wallet"})
sku("blizzard-balance", "Battle.net balance card", "گیفت کارت بلیزارد", "Blizzard (Microsoft)", "gaming", usd=None, official="blizzard", usd_note="Card prices not verified.", billing="one-time code", order=20, risk="high",
    risk_note=N_US, factors=("vendor_geo_exclusion", "region_lock"), demand="C", demand_ev="E4.", **{**G, "rep": "wallet"})

# ---------------------------------- App stores ----------------------------------------
N_APPSTORE = ("Apple and Google run no Iran storefront and act under US sanctions law (S36); gift cards are region-locked (country AND currency) and redeemable only on an account of the same country (S37). "
              "An Iran-resident customer therefore has no vendor-sanctioned way to redeem a US card; the common 'foreign Apple ID / foreign card' practice relies on misstating residence and is excluded by the project guardrails. ")
sku("apple-gift-card-us-25", "Apple gift card (US) $25", "گیفت کارت اپل ۲۵ دلاری", "Apple", "appstore", usd=25, usd_conf="low", usd_kind="definition", official="apple-gift", usd_note="Face value $25.", billing="one-time code",
    risk_note=N_APPSTORE, risk_src=("S36", "S37"), risk_conf="medium", factors=("vendor_geo_exclusion", "region_lock", "apple_id_region", "origin_hiding_trap"), demand="A", demand_ev="E4 (prior: strong demand for iCloud/apps).",
    offer="legal_review_required", legal_review_modes=("B",), **{**G, "support": "medium", "refund": "medium"})
sku("google-play-gift-card-us-25", "Google Play gift card (US) $25", "گیفت کارت گوگل پلی ۲۵ دلاری", "Google", "appstore", usd=25, usd_conf="low", usd_kind="definition", official="google-play", usd_note="Face value $25.", billing="one-time code",
    risk_note=N_APPSTORE, risk_src=("S37",), risk_conf="medium", factors=("vendor_geo_exclusion", "region_lock", "origin_hiding_trap"), demand="B", demand_ev="E4.", offer="legal_review_required", legal_review_modes=("B",), **{**G, "support": "medium", "refund": "medium"})
sku("apple-developer-program", "Apple Developer Program (1 year)", "حساب توسعه‌دهنده اپل", "Apple", "appstore", usd=99, usd_conf="low", usd_kind="prior", official="apple-dev", usd_note="PRIOR KNOWLEDGE: $99/year - not verified this run.", billing="annual", rep="annual",
    risk_note="Enrolment requires a real legal identity in a supported country; Apple applies sanctions screening. Paying for an account opened with someone else's identity or entity is identity borrowing and is excluded by the guardrails. Lawful alternative: publish on domestic stores (Cafe Bazaar, Myket - UNVERIFIED names) or via a genuine foreign legal entity set up with counsel.",
    factors=("vendor_geo_exclusion", "identity_match", "origin_hiding_trap"), demand="B", demand_ev="E4.", offer="do_not_offer", rush=False, support="high", refund="high")
sku("google-play-developer", "Google Play developer registration", "ثبت‌نام توسعه‌دهنده گوگل پلی", "Google", "appstore", usd=25, usd_conf="low", usd_kind="prior", official="google-dev", usd_note="PRIOR KNOWLEDGE: $25 one-time - not verified.", billing="one-time", rep="onetime",
    risk_note="Same identity/sanctions constraints as the Apple Developer Program: do not facilitate registration under a borrowed identity. Lawful alternative: domestic stores or a genuine foreign legal entity set up with counsel.",
    factors=("vendor_geo_exclusion", "identity_match", "origin_hiding_trap"), demand="B", demand_ev="E4.", offer="do_not_offer", rush=False, support="high", refund="high")

# ---------------------------------- Education / exams / visas -------------------------
N_EXAM = ("Test/visa fees are paid to the exam body or consulate/visa-centre, often only in hard currency by card or at a test centre abroad; whether a third-party payer (mode C) is accepted, the name-match rules, and refund/rescheduling policy were NOT verified. "
          "Fees are usually non-refundable - the refund-risk of a failed payment attempt sits with the customer unless our SLA says otherwise.")
sku("coursera-plus", "Coursera Plus", "کورسرا پلاس", "Coursera", "education", usd=None, official="coursera", usd_note="Not verified in this run.", billing="monthly or annual", order=60, rep="annual",
    risk_note=N_US + " Coursera's Iran policy (it has previously restricted/licensed Iranian access) was not verified.", factors=("vendor_geo_unknown",), demand="C", demand_ev="E4.", support="medium", refund="medium")
sku("udemy-course", "Udemy course purchase", "خرید دوره یودمی", "Udemy", "education", usd=None, official="udemy", usd_note="Per-course price (promotional); not verified.", billing="one-time", order=15, rep="giftcard",
    risk_note=N_US + " Udemy's Iran policy was not verified.", factors=("vendor_geo_unknown",), demand="B", demand_ev="E4.", support="medium", refund="medium", modes=("A", "C"), legal_review_modes=("C",))
sku("duolingo-super", "Duolingo Super", "دولینگو سوپر", "Duolingo", "education", usd=None, official="duolingo", usd_note="Not verified.", billing="monthly or annual", order=84, order_note="assumed ~annual", rep="annual",
    risk="medium", risk_note=N_US + " Duolingo is widely used in Iran; subscription sales channel (app stores/web card) not verified.", factors=("vendor_geo_unknown", "apple_id_region"), demand="B", demand_ev="E4.", support="medium", refund="medium")
sku("ielts-exam-fee", "IELTS exam fee", "هزینه آزمون آیلتس", "IELTS (British Council / IDP / Cambridge)", "education", usd=None, official="ielts", usd_note="Fee depends on country/centre and is set locally; not verified.", billing="per exam",
    order=250, order_note="assumed ~$250 per sitting (centre-dependent)", rep="exam", modes=("A", "C"), default="A", legal_review_modes=("C",), supplier="agent", automation="manual", support="high", refund="high", risk="medium",
    risk_note=N_EXAM, factors=("third_party_payer", "nonrefundable_fee", "deadline_pressure"), demand="A", demand_ev="E3 (many Iranian FX-payment sellers list exam fees - brief 07) + E4.", offer="offer_with_disclosure")
sku("toefl-ibt-fee", "TOEFL iBT fee", "هزینه آزمون تافل", "ETS", "education", usd=None, official="toefl", usd_note="Fee depends on country; not verified.", billing="per exam", order=250, order_note="assumed ~$250 per sitting",
    rep="exam", modes=("A", "C"), default="A", legal_review_modes=("C",), supplier="agent", automation="manual", support="high", refund="high", risk="medium", risk_note=N_EXAM + " ETS is US-based (sanctions screening).",
    factors=("third_party_payer", "nonrefundable_fee", "deadline_pressure", "vendor_geo_unknown"), demand="A", demand_ev="E3 + E4.", offer="offer_with_disclosure")
sku("gre-general-fee", "GRE General Test fee", "هزینه آزمون GRE", "ETS", "education", usd=None, official="gre", usd_note="Fee not verified (prior ~$220-230).", billing="per exam", order=230, order_note="assumed ~$230",
    rep="exam", modes=("A", "C"), default="A", legal_review_modes=("C",), supplier="agent", automation="manual", support="high", refund="high", risk="medium", risk_note=N_EXAM, factors=("third_party_payer", "nonrefundable_fee", "deadline_pressure"),
    demand="B", demand_ev="E3 + E4.", offer="offer_with_disclosure")
sku("pte-academic-fee", "PTE Academic fee", "هزینه آزمون PTE", "Pearson", "education", usd=None, official="pte", usd_note="Fee not verified.", billing="per exam", order=250, order_note="assumed ~$250",
    rep="exam", modes=("A", "C"), default="A", legal_review_modes=("C",), supplier="agent", automation="manual", support="high", refund="high", risk="medium", risk_note=N_EXAM, factors=("third_party_payer", "nonrefundable_fee", "deadline_pressure"),
    demand="B", demand_ev="E3 + E4.", offer="offer_with_disclosure")
sku("duolingo-english-test", "Duolingo English Test", "آزمون دولینگو", "Duolingo", "education", usd=None, official="det", usd_note="Fee not verified (prior ~$65-70).", billing="per exam", order=70, order_note="assumed ~$70",
    rep="exam", modes=("A",), default="A", supplier="card", support="medium", refund="high", risk="medium", risk_note=N_EXAM + " Online test; the vendor is US-based.", factors=("nonrefundable_fee", "vendor_geo_unknown"),
    demand="B", demand_ev="E4.", offer="offer_with_disclosure")
sku("university-application-fee", "University application fee", "هزینه اپلای دانشگاه", "Universities / Common App / UCAS", "education", usd=None, official="visa", usd_note="Fee per application varies ($50-150 typical, prior) - not verified.", billing="per application",
    order=90, order_note="assumed ~$90", rep="exam", modes=("A", "C"), default="A", legal_review_modes=("C",), supplier="agent", automation="manual", support="high", refund="high", risk="medium", risk_note=N_EXAM,
    factors=("third_party_payer", "nonrefundable_fee", "deadline_pressure"), demand="B", demand_ev="E3 + E4.", offer="offer_with_disclosure")
sku("embassy-visa-fee", "Embassy / visa-centre fee payment", "پرداخت هزینه ویزا و سفارت", "Consulates / VFS / TLScontact", "education", usd=None, official="visa", usd_note="Fees are set per destination and change; not verified.", billing="per application",
    order=150, order_note="assumed ~$150", rep="exam", modes=("A", "C"), default="A", legal_review_modes=("C",), supplier="agent", automation="manual", support="high", refund="high", risk="medium",
    risk_note=N_EXAM + " Never offer fake or 'dummy' bookings/documents for visa files - fraud.", factors=("third_party_payer", "nonrefundable_fee", "deadline_pressure", "fraud_trap"),
    demand="A", demand_ev="E3 + E4.", offer="offer_with_disclosure")

# ---------------------------------- Freelance / payments (do not offer) ----------------
for sid, en, fa, vend, key in [("upwork-connects", "Upwork Connects / balance", "کانکت آپورک", "Upwork", "upwork"), ("fiverr-balance", "Fiverr balance / orders", "اعتبار فایور", "Fiverr", "fiverr")]:
    sku(sid, en, fa, vend, "freelance", usd=None, official=key, usd_note="Marketplace credits; not verified.", billing="usage", order=30, rep="usage", risk_note=N_DNO_PAY.replace("Payment/wallet providers", "Marketplace platforms"),
        factors=("vendor_geo_exclusion", "identity_match", "origin_hiding_trap"), demand="B", demand_ev="E4.", offer="do_not_offer", rush=False, support="high", refund="high")
for sid, en, fa, vend, key in [("paypal-balance", "PayPal balance / payment", "پی‌پال", "PayPal", "paypal"), ("wise-balance", "Wise balance / transfer", "وایز", "Wise", "wise"), ("payoneer-balance", "Payoneer balance", "پیونیر", "Payoneer", "payoneer")]:
    sku(sid, en, fa, vend, "freelance", usd=None, official=key, usd_note="Balance/payment service; not priced as a SKU.", billing="per transaction", order=100, rep="usage", risk_note=N_DNO_PAY,
        factors=("vendor_geo_exclusion", "identity_match", "origin_hiding_trap"), demand="A" if sid == "paypal-balance" else "B", demand_ev="E4 (prior: PayPal is among the most-requested services).", offer="do_not_offer", rush=False, support="high", refund="high")

# ---------------------------------- VPN / security ------------------------------------
sku("nordvpn-subscription", "VPN subscription (NordVPN etc.)", "اشتراک وی‌پی‌ان", "NordVPN et al.", "vpn_security", usd=None, official="nordvpn", usd_note="Not verified.", billing="monthly / multi-year", order=60, rep="annual",
    risk_note="Domestic legal exposure: selling circumvention tools is restricted in Iran (UNVERIFIED - specialist 04), and a platform whose value proposition is bypassing provider geo-blocks conflicts with the project guardrails. Do not list pending written legal advice.",
    factors=("domestic_legal", "geo_evasion_adjacent"), demand="A", demand_ev="E4 (prior: very high demand).", offer="legal_review_required", legal_review_modes=("A",), support="medium", refund="medium")
sku("bitwarden-premium", "Bitwarden Premium", "بیت‌واردن پریمیوم", "Bitwarden", "vpn_security", usd=10, usd_conf="low", usd_kind="prior", official="bitwarden", usd_note="PRIOR KNOWLEDGE: ~$10/year - not verified.", billing="annual", rep="annual",
    risk_note=N_US, factors=("vendor_geo_unknown",), risk="medium", demand="C", demand_ev="E4.", support="low", refund="low")

# ---------------------------------- Telecom -------------------------------------------
sku("intl-mobile-topup", "International mobile top-up", "شارژ سیم‌کارت خارجی", "Aggregators (Reloadly-type)", "telecom", usd=None, official="reloadly", usd_note="Face value chosen by customer; aggregator Iran-eligibility not verified.", billing="per top-up",
    order=10, rep="usage", modes=("B",), default="B", supplier="voucher", automation="api_possible", risk="medium", risk_note="Aggregator Iran-eligibility not verified (specialist 01). Numbers must be the customer's own or a relative's with consent.",
    factors=("vendor_geo_unknown",), demand="C", demand_ev="E4.", support="low", refund="medium")
sku("esim-travel", "Travel eSIM data pack", "ای‌سیم سفر", "eSIM resellers (Airalo-type)", "telecom", usd=None, official="esim", usd_note="Pack prices not verified.", billing="per pack", order=10, rep="travel",
    modes=("A",), default="A", supplier="card", risk="medium", risk_note="Resellers apply sanctions screening; Iran-resident buyers may be refused, but travellers abroad are a different case (prior knowledge, UNVERIFIED).", factors=("vendor_geo_unknown",),
    demand="B", demand_ev="E4.", support="medium", refund="medium")

# ---------------------------------- Shopping ------------------------------------------
sku("amazon-gift-card-us-50", "Amazon gift card (US) $50", "گیفت کارت آمازون ۵۰ دلاری", "Amazon", "shopping", usd=50, usd_conf="low", usd_kind="definition", official="amazon", usd_note="Face value $50.", billing="one-time code",
    risk_note="Amazon gift cards are redeemable only on the matching marketplace account; Amazon does not serve Iran and applies sanctions screening (prior knowledge, UNVERIFIED). A card for a region the customer does not lawfully hold is not sold.",
    factors=("vendor_geo_exclusion", "region_lock", "origin_hiding_trap"), demand="A", demand_ev="E4.", offer="legal_review_required", legal_review_modes=("B",), **{**G, "support": "medium", "refund": "medium"})
sku("aliexpress-order", "AliExpress order payment", "پرداخت سفارش علی‌اکسپرس", "AliExpress", "shopping", usd=None, official="aliexpress", usd_note="Per-order amount.", billing="per order", order=40, rep="giftcard",
    modes=("A", "C"), default="A", legal_review_modes=("C",), supplier="card", risk="high", risk_note="AliExpress's Iran shipping/payment availability was not verified; delivery to Iran normally needs a forwarder, adding customs and loss risk. Third-party payment must not conceal the delivery country.",
    factors=("vendor_geo_unknown", "delivery_risk", "customs"), demand="A", demand_ev="E4.", support="high", refund="high", offer="legal_review_required")
sku("temu-order", "Temu order payment", "پرداخت سفارش تمو", "Temu", "shopping", usd=None, official="temu", usd_note="Per-order amount.", billing="per order", order=40, rep="giftcard", modes=("A",), default="A",
    risk_note="Temu does not operate in Iran (prior knowledge, UNVERIFIED); no lawful delivery path.", factors=("vendor_geo_exclusion", "delivery_risk"), demand="B", demand_ev="E4.", support="high", refund="high", offer="do_not_offer", rush=False)

# ---------------------------------- Travel --------------------------------------------
sku("booking-com-hotel", "Hotel booking (Booking.com-type)", "رزرو هتل", "Booking.com et al.", "travel", usd=None, official="booking", usd_note="Per-booking amount.", billing="per booking", order=200, rep="travel",
    modes=("A", "C"), default="A", legal_review_modes=("C",), supplier="agent", automation="manual", risk="medium", risk_note="Platform policy toward Iranian travellers booking abroad was not verified; use refundable rates; never create 'dummy' reservations for visa files (fraud).",
    factors=("vendor_geo_unknown", "third_party_payer", "fraud_trap"), demand="B", demand_ev="E4.", support="high", refund="high", offer="offer_with_disclosure")
sku("airbnb-stay", "Airbnb stay", "اقامت ایربی‌ان‌بی", "Airbnb", "travel", usd=None, official="airbnb", usd_note="Per-stay amount.", billing="per booking", order=300, rep="travel",
    risk_note="Airbnb restricts users/listings tied to sanctioned countries (prior knowledge, UNVERIFIED) and has closed accounts; no lawful reseller path found.", factors=("vendor_geo_exclusion", "account_closure"),
    demand="C", demand_ev="E4.", support="high", refund="high", offer="do_not_offer", rush=False)
sku("intl-flight-ticket", "International flight ticket (agent payment)", "بلیت هواپیمای خارجی", "Airlines / OTAs", "travel", usd=None, official="flight", usd_note="Per-ticket amount.", billing="per ticket", order=400, rep="travel",
    modes=("C",), default="C", legal_review_modes=("C",), supplier="agent", automation="manual", risk="medium", risk_note="Agent-style payment (mode C): airline/OTA terms on third-party payers and name-match rules not verified; airlines serving Iran sell through local agencies in Rial - check overlap with licensed travel-agency rules.",
    factors=("third_party_payer", "nonrefundable_fee", "licensed_agent_rules"), demand="A", demand_ev="E4.", support="high", refund="high", offer="legal_review_required")
sku("travel-insurance", "Schengen / travel insurance", "بیمه مسافرتی", "Insurers", "travel", usd=None, official="insurance", usd_note="Per-policy amount.", billing="per policy", order=40, rep="travel",
    modes=("A", "C"), default="A", legal_review_modes=("C",), supplier="agent", automation="manual", risk="medium", risk_note="Insurer eligibility for Iran residents not verified; policy must match the visa requirements (consulate check).",
    factors=("vendor_geo_unknown", "third_party_payer"), demand="B", demand_ev="E4.", support="medium", refund="medium", offer="offer_with_disclosure")

# ---------------------------------- Cards (platform core) -----------------------------
CARD_NOTE = ("Core product. Risk sits with the card provider (custody, unpublished top-up %, undocumented reseller/ToS position), the merchant's acceptance of the card's BIN/region (billing-address mismatch declines reported for Singapore-region cards, S50) and "
             "prepaid-card rejection by some merchants (AWS, S20). Provider ToS must permit issuing to third parties (specialist 01); if cards are issued under the owner's account and handed to customers that is mode D - not allowed unless the provider's terms say so.")
sku("vcard-new-card-load-25", "New virtual card + $25 minimum load (entry bundle)", "کارت مجازی جدید + شارژ ۲۵ دلار", "Provider (mpay-type)", "cards", usd=25, usd_conf="low", usd_src=("S51",), usd_kind="definition", official="mpay", new_card=True,
    usd_note="Min load $25 and issue fee $4.99 per secondary sources (S50, S51) - provider fees NOT verified (mpay fetch blocked); bundle price adds the issue fee.", billing="one-time per card",
    modes=("A",), default="A", legal_review_modes=("D",), mode_d_note="Mode D applies if the provider issues the card under the owner's account and customers receive details - allowed only if the provider's terms permit; verify (01).",
    risk="medium", risk_note=CARD_NOTE, risk_src=("S50", "S20"), risk_conf="low", factors=("counterparty_custody", "prepaid_card_decline", "region_mismatch", "unpublished_fees"),
    demand="S", demand_ev="E3: >=15 Iranian virtual-card / FX-payment competitors listed in brief 07 (S52).", demand_src=("S52",), support="medium", refund="medium", rep="onetime", offer="offer_with_disclosure")
for amt, tier, rep_ in ((50, "S", "usage"), (100, "S", "usage"), (250, "A", "usage"), (500, "B", "usage")):
    sku(f"vcard-topup-{amt}", f"Virtual card top-up ${amt}", f"شارژ کارت مجازی {amt} دلار", "Provider (mpay-type)", "cards", usd=amt, usd_conf="medium", usd_src=("S51",), usd_kind="definition", official="mpay",
        flagship=(amt == 100), usd_note=f"Denomination used in the lead's cost model (S51); the provider fee is NOT verified.", billing="per top-up", modes=("A",), default="A", risk="medium", risk_note=CARD_NOTE,
        risk_src=("S50", "S20"), risk_conf="low", factors=("counterparty_custody", "prepaid_card_decline", "region_mismatch", "unpublished_fees"), demand=tier, demand_ev="E3 (S52).", demand_src=("S52",), support="medium", refund="medium",
        rep=rep_, offer="offer_with_disclosure", order=amt, order_note="denomination")

# ======================================================================================
# 8. Price-change log (vendor re-pricing process) - observed in this run
# ======================================================================================
def chg(vendor, plan, old, new, eff, conf, sid, note=None, exclude=False):
    e = {"vendor": vendor, "plan": plan, "old_usd": old, "new_usd": new, "effective": eff, "confidence": conf, "source_id": sid}
    if note:
        e["note"] = note
    if exclude:
        e["exclude_from_stats"] = True
    return e


PRICE_CHANGES = [
    chg("YouTube (Google)", "Premium Individual", 13.99, 15.99, "2026-04 (article 2026-04-10)", "high", "S29"),
    chg("YouTube (Google)", "Premium Family", 22.99, 26.99, "2026-04", "high", "S29"),
    chg("YouTube (Google)", "Premium Lite", 7.99, 8.99, "2026-04", "medium", "S29", "one source says $9.99"),
    chg("YouTube (Google)", "Music Premium", 10.99, 11.99, "2026-04", "high", "S29"),
    chg("Apple", "Apple Music Individual", 10.99, 11.99, "2026-07-17", "high", "S27"),
    chg("Apple", "Apple Music Family", 16.99, 19.99, "2026-07-17", "high", "S27"),
    chg("Apple", "Apple Music Student", 5.99, 6.99, "2026-07-17", "high", "S27"),
    chg("Apple", "Apple One Family", 25.95, 27.95, "2026-07-17", "high", "S27"),
    chg("Apple", "Apple One Premier", 37.95, 39.95, "2026-07-17", "high", "S27"),
    chg("Disney", "Disney+ Premium", 18.99, 21.49, "2026-09-23", "high", "S30"),
    chg("Sony", "PS Plus Essential (monthly)", 9.99, 10.99, "2026-05-20", "medium", "S31"),
    chg("Sony", "PS Plus Extra (monthly)", 14.99, 16.99, "2026-05-20", "medium", "S31", "monthly Premium reported as 17.99 in one line and 19.99 in another - conflicting, excluded"),
    chg("Google", "Google AI Ultra (entry tier)", 249.99, 99.99, "2026-05 (Google I/O)", "medium", "S09", "price CUT; a 20x tier stays at $199.99", exclude=True),
    chg("OpenAI", "ChatGPT Pro - new $100 tier added next to $200", None, 100, "2026-04-09", "high", "S07", "new tier, not a change of an existing price", exclude=True),
    chg("GitHub", "Copilot - usage-based AI Credits billing", None, None, "2026-06-01", "high", "S02", "pricing-model change: each paid plan includes credits roughly equal to its price", exclude=True),
    chg("Netflix", "all US plans (second increase since start of 2025)", None, None, "2026 (date not in summary)", "medium", "S26", "old prices not captured; new: ads 8.99 / Standard 19.99 / Premium 26.99", exclude=True),
    chg("Spotify", "Premium Individual / Duo", None, None, "early 2026", "low", "S28", "old prices not captured; new ~13 / ~19", exclude=True),
]

# ======================================================================================
# 9. Other top-level blocks
# ======================================================================================
MPAY_BLOCK = {
    "supported_merchants": R(None, "list", note="Merchants mpay explicitly lists as supported could NOT be captured (WebSearch budget exhausted before this query; mpay.cards fetch blocked). Internal first-pass doc (S50) says only 'wherever Visa is accepted (Amazon, Netflix, AI tools)'.",
                             verify="Open mpay.cards supported-services / FAQ and the support channel; capture per-merchant 'works / declines' with date; cross-check with specialist 01 output (data/providers.json)."),
    "card_acceptance_reports": [
        {"merchant_class": "AWS", "report": R("fails_prepaid", None, "medium", "fact", ["S20"], "Prepaid cards are not supported at signup; a $1 authorization is attempted and refund-incapable cards fail verification (per search summary of AWS FAQ / repost.aws).", verify="Open a test signup with the actual card; note decline code.")},
        {"merchant_class": "Google Cloud free trial", "report": R("may_fail_prepaid", None, "low", "fact", ["S21"], "A valid payment method is required for the $300/90-day trial; summaries suggest prepaid virtual cards may be refused (not explicit).", verify="Test with the actual card.")},
        {"merchant_class": "OpenAI / ChatGPT", "report": R("billing_address_mismatch_reported", None, "low", "fact", ["S50"], "Internal doc: cards often report Singapore region -> billing-address mismatch at sensitive gateways such as OpenAI (secondary research, not first-hand).", verify="Test with the actual card against a low-value charge; note decline code.")},
        {"merchant_class": "all other classes", "report": R(None, None, note="No first-hand or sourced report gathered in this run.", verify="Specialist 01 + ops forum review (Persian forums/Telegram); then a $5 test per merchant class.")},
    ],
}
TIER_WEIGHTS = {k: R(v, "relative sampling weight", "low", "assumption", [], "Modelling convention for sampling SKUs by demand tier in the simulator (S:8, A:4, B:2, C:1); calibrate against competitor market-size evidence (specialist 07).", "Fit to observed order mix after launch / competitor data.") for k, v in (("S", 8), ("A", 4), ("B", 2), ("C", 1))}

SEARCH_GAPS = [
    {"area": "competitor Toman quotes (>=3 dated per flagship SKU)", "status": "NOT MET - 3 of 20 flagship SKUs have partial, undated quotes (Steam $20, Steam $100, Copilot Pro); ChatGPT Plus / Spotify / Netflix quotes are non-comparable shared-access offers.",
     "next_queries": ["قیمت اکانت کلود پرو امروز (seller names)", "قیمت اشتراک جمینای پرو امروز تومان", "قیمت اکانت میدجرنی تومان امروز", "قیمت اشتراک یوتیوب پریمیوم تومان امروز", "قیمت گیفت کارت پلی استیشن امروز", "قیمت اشتراک ادوبی کریتیو کلود تومان", "قیمت کانوا پرو تومان", "قیمت لایسنس آفیس ۳۶۵ تومان", "قیمت شارژ ارزی کارت مجازی ۱۰۰ دلار تومان امروز"]},
    {"area": "official USD prices not captured", "status": "AWS/GCP/Azure (usage-based), domains, Google Workspace, Zoom, Dropbox, Coursera, Udemy, Duolingo, exam fees (IELTS/TOEFL/GRE/PTE/DET), visa fees, VPN, Telegram Premium/Stars, game top-ups (UC/Free Fire/CP/V-Bucks/Valorant/Roblox), eSIM, flights - value null or prior-knowledge flagged UNVERIFIED.",
     "next_queries": ["TOEFL iBT test fee 2026 Iran test centers", "IELTS fee 2026 Armenia Turkey UAE", "GRE general test fee 2026", "Telegram Premium price 2026 USD Fragment TON", "PUBG Mobile UC price table 2026", "Namecheap .com price 2026", "Google Workspace Business Starter price 2026", "Coursera Plus price 2026"]},
    {"area": "vendor Iran policy wording (ToS / supported countries)", "status": "Quoted only for Anthropic (fetched), OpenAI (summary), Google Ads (summary). All other restriction notes are prior-knowledge judgements flagged UNVERIFIED.",
     "next_queries": ["Gemini Apps supported countries Iran", "Midjourney terms of service sanctioned countries", "Perplexity supported countries", "GitHub trade controls Iran Copilot paid", "Spotify available markets list", "YouTube Premium available countries list", "Netflix countries not available Iran", "Steam Valve Iran sanctions policy official", "Adobe sanctions Iran terms", "Microsoft 365 consumer availability Iran", "Hetzner terms sanctioned countries", "DigitalOcean restricted countries", "PayPal restricted countries Iran", "Upwork restricted countries Iran"]},
    {"area": "mpay supported merchants and cards reported working/failing", "status": "NOT researched (budget).", "next_queries": ["mpay.cards supported merchants list", "mpay virtual card OpenAI declined", "virtual card Iran ChatGPT payment declined billing address", "کارت مجازی ریجکت چت جی پی تی", "کارت مجازی کدام پرداخت‌ها را قبول می‌کند"]},
    {"area": "demand evidence (search interest)", "status": "No Google Trends / Keyword Planner access; demand tiers rest on E1-E4 evidence classes (low confidence).", "next_queries": ["(manual) Google Trends geo=IR: خرید اکانت چت جی پی تی / ChatGPT Plus / گیفت کارت استیم / اسپاتیفای پریمیوم / تلگرام پریمیوم / آزمون آیلتس"]},
    {"area": "categories never searched", "status": "ads other than Google (Meta/TikTok/X/Telegram), education, freelancing/payments, VPN, telecom, shopping, travel, Telegram Premium/Stars.", "next_queries": ["see per-category lines above"]},
]
BLOCKED_HOSTS = ["emalls.ir", "cometapi.com", "digiato.com", "openai.com", "cursor.com", "www.digitalocean.com", "www.hetzner.com", "www.canva.com", "www.notion.com", "www.perplexity.ai", "gemini.google",
                 "docs.midjourney.com", "aws.amazon.com", "www.vultr.com", "www.cloudflare.com", "vercel.com", "workspace.google.com", "www.adobe.com", "www.figma.com", "pricepertoken.com", "costbench.com",
                 "recurdash.com", "subger.com", "apicalculators.com", "help.openai.com", "support.google.com", "docs.cloud.google.com", "en.wikipedia.org", "ofac.treasury.gov", "techcrunch.com", "www.engadget.com", "9to5mac.com", "macdailynews.com"]


# ======================================================================================
# 10. Assemble + write
# ======================================================================================
def assemble():
    ids = [s["id"] for s in SKUS]
    assert len(ids) == len(set(ids)), "duplicate SKU ids"
    meta = {
        "title": "Service catalogue and demand map - what Iranians buy with foreign-currency cards",
        "owner_agent": "06-service-catalog-demand", "schema_version": 1, "as_of": TODAY, "generated_by": "scripts/research/06_build_catalog.py",
        "kinds": {"fact": "seen in a source (status verified = fetched directly, reported = search summary)", "prior": "analyst prior knowledge, unchecked", "assumption": "modelling parameter", "judgement": "analyst ranking",
                  "policy": "catalogue default, overridable", "definition": "denomination/identifier"},
        "fx_anchors": FX_ANCHORS,
        "fx_levels_for_margin_table": {"base_irt_per_usdt": 257000, "up_pct": 20, "down_pct": 10},
        "sku_count": len(SKUS), "flagship_count": sum(1 for s in SKUS if s["flagship"]),
        "gating_note": "Every offer_recommendation is provisional until the legal-tax (04) and sanctions-counterparty (05) specialists and a licensed professional sign off; this is analysis, not legal or tax advice.",
        "rerun": ["Raise CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION and run the next_queries in search_gaps (Persian + English).",
                  "Edit the SKU table in scripts/research/06_build_catalog.py (prices, sources, notes), run it, then node scripts/validate-data.mjs data/catalog.json.",
                  "python3 scripts/research/06_margin_table.py regenerates the margin / headroom / evidence tables; --selftest checks the cost model against scripts/pricing_model.py.",
                  "Re-run monthly: vendor list prices moved ~+5-18 % in single events in 2026 (price_change_log_2026) and USDT/IRT moved +46 % in 90 days."],
        "limitations": [
            "WebSearch: the session-wide budget (200) was exhausted; this specialist executed 48 searches (>=40 required) before the cap. Categories and fields not covered are listed in search_gaps.",
            "WebFetch: blocked for almost every vendor and Iranian price host (see blocked_hosts); only claude.com/pricing, github.com/features/copilot/plans and anthropic.com/supported-countries were read directly.",
            "Competitor Toman quotes are undated listings seen through search summaries (emalls.ir aggregator cache); several are non-comparable shared-access offers. fx_at_quote is therefore null.",
            "Demand tiers are judgements (E1-E4 evidence classes), not measured search volumes.",
            "Records with kind prior/assumption/judgement are tunable parameters, not facts; admin overrides win.",
        ],
        "search_gaps": SEARCH_GAPS, "blocked_hosts": BLOCKED_HOSTS,
        "sources": SOURCES,
    }
    return {
        "meta": meta, "taxonomy": TAXONOMY, "cost_model_defaults": COST_MODEL, "demand_tier_weights_prior": TIER_WEIGHTS,
        "skus": SKUS, "price_change_log_2026": PRICE_CHANGES, "mpay_and_card_acceptance": MPAY_BLOCK,
    }


def md_tables():
    out = []
    cats = TAXONOMY["categories"]
    names = {"ai": "AI", "cloud": "Dev / cloud", "productivity": "Design / productivity", "messaging": "Messaging", "ads": "Ads", "media": "Media", "gaming": "Gaming", "appstore": "App stores",
             "education": "Education / exams / visas", "freelance": "Freelancing / payments", "vpn_security": "VPN / security", "telecom": "Telecom", "shopping": "Shopping", "travel": "Travel", "cards": "Cards (platform core)"}
    for c in cats:
        rows = [s for s in SKUS if s["category"] == c]
        if not rows:
            continue
        out.append(f"#### {names[c]} ({len(rows)} SKUs)\n")
        out.append("| SKU id | official USD (cadence) | conf | modes | risk | offer | demand | order USD | quotes |")
        out.append("|---|---|---|---|---|---|---|--:|--:|")
        for s in rows:
            u = s["usd_price"]
            usd = "null (UNVERIFIED)" if u["value"] is None else f"{u['value']:g}"
            if u["value"] is not None and u.get("kind") == "prior":
                usd += " (prior)"
            order = s["typical_order_usd"]["value"]
            out.append(f"| `{s['id']}`{' *' if s['flagship'] else ''} | {usd} ({s['billing']}) | {u['confidence'] if u['value'] is not None else '-'} | {''.join(s['fulfilment_modes'])}→{s['default_mode']} | {s['risk_label']['value']} | {s['offer_recommendation']} | {s['demand_tier']['value']} | {order if order is not None else '-'} | {len(s['competitor_toman_prices'])} |")
        out.append("")
    return "\n".join(out)


def coverage_md():
    from collections import Counter, defaultdict
    names = {"ai": "AI", "cloud": "Dev / cloud", "productivity": "Design / productivity", "messaging": "Messaging", "ads": "Ads", "media": "Media", "gaming": "Gaming", "appstore": "App stores",
             "education": "Education / exams / visas", "freelance": "Freelancing / payments", "vpn_security": "VPN / security", "telecom": "Telecom", "shopping": "Shopping", "travel": "Travel", "cards": "Cards (platform core)"}
    out = ["| category | SKUs | with official USD | USD conf H / M / L | restriction note sourced | with competitor quotes | risk H / M | offer / disclose / legal-review / do-not-offer |", "|---|--:|--:|--:|--:|--:|--:|--:|"]
    tot = defaultdict(int)
    for c in TAXONOMY["categories"]:
        rows = [x for x in SKUS if x["category"] == c]
        if not rows:
            continue
        pr = [x for x in rows if x["usd_price"]["value"] is not None]
        cf = Counter(x["usd_price"]["confidence"] for x in pr)
        rn = sum(1 for x in rows if x["restriction_note"].get("sources"))
        qq = sum(1 for x in rows if x["competitor_toman_prices"])
        rk = Counter(x["risk_label"]["value"] for x in rows)
        of = Counter(x["offer_recommendation"] for x in rows)
        out.append(f"| {names[c]} | {len(rows)} | {len(pr)} | {cf['high']} / {cf['medium']} / {cf['low']} | {rn} | {qq} | {rk['high']} / {rk['medium']} | {of['offer']} / {of['offer_with_disclosure']} / {of['legal_review_required']} / {of['do_not_offer']} |")
        for k, v in (("n", len(rows)), ("priced", len(pr)), ("h", cf["high"]), ("m", cf["medium"]), ("l", cf["low"]), ("rn", rn), ("q", qq), ("rh", rk["high"]), ("rm", rk["medium"]),
                     ("o", of["offer"]), ("d", of["offer_with_disclosure"]), ("lr", of["legal_review_required"]), ("dn", of["do_not_offer"])):
            tot[k] += v
    out.append(f"| **total** | **{tot['n']}** | **{tot['priced']}** | **{tot['h']} / {tot['m']} / {tot['l']}** | **{tot['rn']}** | **{tot['q']}** | **{tot['rh']} / {tot['rm']}** | **{tot['o']} / {tot['d']} / {tot['lr']} / {tot['dn']}** |")
    out += ["", "**do_not_offer:** " + ", ".join(f"`{x['id']}`" for x in SKUS if x["offer_recommendation"] == "do_not_offer"), "",
            "**legal_review_required:** " + ", ".join(f"`{x['id']}`" for x in SKUS if x["offer_recommendation"] == "legal_review_required"), "",
            "**demand tier S:** " + ", ".join(f"`{x['id']}`" for x in SKUS if x["demand_tier"]["value"] == "S"), "",
            "**demand tier A:** " + ", ".join(f"`{x['id']}`" for x in SKUS if x["demand_tier"]["value"] == "A"), ""]
    return "\n".join(out)


def stats():
    from collections import Counter
    c = Counter(s["risk_label"]["value"] for s in SKUS)
    d = Counter(s["demand_tier"]["value"] for s in SKUS)
    o = Counter(s["offer_recommendation"] for s in SKUS)
    k = Counter(s["category"] for s in SKUS)
    priced = sum(1 for s in SKUS if s["usd_price"]["value"] is not None)
    conf = Counter(s["usd_price"]["confidence"] for s in SKUS if s["usd_price"]["value"] is not None)
    return {"skus": len(SKUS), "priced": priced, "usd_conf": dict(conf), "risk": dict(c), "demand": dict(d), "offer": dict(o), "by_category": dict(k)}


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--md", action="store_true", help="print Markdown tables of the catalogue")
    ap.add_argument("--stats", action="store_true", help="print summary statistics")
    ap.add_argument("--coverage", action="store_true", help="print the coverage table and SKU lists")
    args = ap.parse_args(argv)
    data = assemble()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)}  ({len(SKUS)} SKUs, {OUT.stat().st_size/1024:.0f} KiB)")
    if args.stats or args.md:
        print(json.dumps(stats(), indent=1, ensure_ascii=False))
    if args.coverage:
        print(coverage_md())
    if args.md:
        print(md_tables())
    return 0


if __name__ == "__main__":
    sys.exit(main())
