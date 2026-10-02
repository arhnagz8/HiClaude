#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Builds data/tax.json and data/legal_checklist.json for brief 04 (legal-tax-compliance-ir).

Run:  python3 scripts/research/04_build_legal_data.py
Then: node scripts/validate-data.mjs data/tax.json data/legal_checklist.json

Conventions (CLAUDE.md section 5):
  * every leaf fact is a Record {value, unit, as_of, confidence, sources[], verify_how, status, note}
  * unknown -> value null + status "UNVERIFIED" + verify_how (never invent numbers)
  * background-knowledge statements that were NOT re-verified in this session are confidence "low" + status "UNVERIFIED"
  * analyst-proposed policy parameters are confidence "low", labelled `note: "analyst-proposed policy ..."` (they are not legal facts)
All sources below were read as WEB SEARCH SUMMARIES (page bodies were not fetched: egress proxy blocked the hosts), hence note="per search summary".
"""
from __future__ import annotations

import json
from pathlib import Path

AS_OF = "2026-10-02"
ROOT = Path(__file__).resolve().parents[2]
PS = "per search summary (page not fetched directly)"

# ---------------------------------------------------------------------------------------------
# Source registry: id -> (url, title). Same ids are used in docs/03-research/04-legal-tax-ir.md
# ---------------------------------------------------------------------------------------------
SRC: dict[str, tuple[str, str]] = {
    "S1": ("https://www.lightspark.com/knowledge/is-crypto-legal-in-iran", "Lightspark - Is Crypto Legal in Iran? Regulations & Compliance in 2026"),
    "S2": ("https://ainfp.org/are-crypto-payments-allowed-in-iran-the-2026-reality-of-bans-mining-and-controls", "AINFP - Are Crypto Payments Allowed in Iran? The 2026 Reality of Bans, Mining, and Controls"),
    "S3": ("https://ainfp.org/mining-crypto-in-iran-legal-status-restrictions-risks", "AINFP - Mining Crypto in Iran: Legal Status, Restrictions & Risks (2026)"),
    "S4": ("https://bankavl.com/بخش-ارزهای-دیجیتال-35/45033-سند-سیاستگذاری-رمزپول-ها-تصویب-شد", "Bankavl - سند سیاستگذاری رمزپول‌ها تصویب شد (13 Azar 1403)"),
    "S5": ("https://iranbroker.net/?p=162092", "Iranbroker - چارچوب سیاست‌گذاری و تنظیم‌گری رمزارزها از سوی بانک مرکزی ایران تصویب شد"),
    "S6": ("https://www.taadolnewspaper.ir/fa/news/327453/بانک-مرکزی-متولی-و-سیاستگذار-حوزه-رمزپول-هاست", "Taadol - بانک مرکزی متولی و سیاستگذار حوزه رمزپول‌هاست"),
    "S7": ("https://www.taadolnewspaper.ir/fa/news/336741/بانک-مرکزی-متولی-رمزارز‌ها-است", "Taadol - شفاف‌سازی نظارت بر ارزهای دیجیتال (بانک مرکزی متولی رمزارزها است)"),
    "S8": ("https://www.zoomit.ir/tech-iran/449373-central-bank-crypto-rial-policy-2025/", "Zoomit - ابلاغ دستورالعمل کارگزاران رمزپول؛ گام بانک مرکزی در غیاب قانون رمزارزها"),
    "S9": ("https://iranbroker.net/?p=240663", "Iranbroker - هیات عالی بانک مرکزی چارچوب فعالیت کارگزاران رمزپول را تصویب کرد"),
    "S10": ("https://www.zoomit.ir/cryptocurrency/449802-central-bank-crypto-brokers-guideline-criticism/", "Zoomit - دستورالعمل کارگزاران رمزپول بانک مرکزی پرابهام و قانون‌زده است"),
    "S11": ("https://www.taadolnewspaper.ir/fa/news/341405/تعیین-تکلیف-سرنوشت-صرافی‌های-رمزارز-تا-۲۰-اردیبهشت", "Taadol - تعیین تکلیف سرنوشت صرافی‌های رمزارز تا ۲۰ اردیبهشت"),
    "S12": ("https://www.zarinpal.com/blog/?p=7345", "Zarinpal blog - دستور جدید بانک مرکزی؛ کاهش سقف واریز شناسه‌دار به صرافی‌های رمزارزی"),
    "S13": ("https://iranbroker.net/?p=86748", "Iranbroker - تاخیر زیاد برداشت ارزهای دیجیتال از صرافی‌های ایرانی؛ ماجرا چیست؟ (72h lock, FATA)"),
    "S14": ("https://www.scorechain.com/blog/ofac-iran-crypto-sanctions-june-2026", "Scorechain - OFAC Sanctions Iran's Four Largest Crypto Exchanges (June 2026)"),
    "S15": ("https://www.trmlabs.com/resources/blog/three-enforcement-layers-in-five-months-ofac-designates-irans-domestic-crypto-exchanges", "TRM Labs - Three Enforcement Layers in Five Months: OFAC Designates Iran's Domestic Crypto Exchanges"),
    "S16": ("https://crystalintelligence.com/sanctions/crypto-sanctions-screening-ofac-targets-iran-exchanges/", "Crystal Intelligence - Crypto sanctions screening: OFAC targets Iran exchanges"),
    "S17": ("https://cryptobriefing.com/us-sanctions-iran-crypto-exchanges-nobitex-ofac/", "Crypto Briefing - US sanctions Iranian crypto exchanges including Nobitex"),
    "S18": ("https://parsi.euronews.com/2026/06/03/us-sanctions-nobitex-iran-largest-crypto-exchange-kharazi-brothers-june-2026", "Euronews Persian (2026-06-03) - تحریم بزرگ‌ترین صرافی رمزارز ایران"),
    "S19": ("https://mihanblockchain.com/us-sanctions-nobitex-wallex-bitpin-ramzinex/", "Mihanblockchain - وزارت خزانه‌داری آمریکا نوبیتکس و سه صرافی ایرانی دیگر را تحریم کرد"),
    "S20": ("https://www.trtfarsi.com/article/f228af312dad", "TRT Farsi - آمریکا چهار صرافی بزرگ رمزارز در ایران را تحریم کرد"),
    "S21": ("https://www.trmlabs.com/resources/blog/ofac-sanctions-crypto-addresses-associated-with-the-central-bank-of-iran-freezes-usd-344-million", "TRM Labs - OFAC Sanctions Crypto Addresses Associated with the Central Bank of Iran, Freezes USD 344 Million"),
    "S22": ("https://www.crowdfundinsider.com/2026/04/275454-ofac-sanctions-cryptocurrency-addresses-linked-to-central-bank-of-iran-freezes-344m-analysis/", "Crowdfund Insider (2026-04) - OFAC sanctions crypto addresses linked to CBI, freezes $344M"),
    "S23": ("https://www.cryptopolitan.com/us-widens-iran-crypto-crackdown-as-senate-presses-treasury-doj-on-tether/", "Cryptopolitan - US widens Iran crypto crackdown as Senate presses Treasury, DOJ on Tether"),
    "S24": ("https://www.imna.ir/news/1005269", "IMNA - پلتفرم منتسب به بابک زنجانی تحریم شد (BitBank)"),
    "S25": ("https://cryptopotato.com/tether-freezes-nearly-550m-in-iran-linked-usdt-in-2026-as-us-crackdown-expands/", "CryptoPotato - Tether Freezes Nearly $550M in Iran-Linked USDT in 2026"),
    "S26": ("https://www.thecoinrepublic.com/2026/09/29/tether-has-frozen-nearly-550m-in-iran-linked-usdt-in-2026/", "The Coin Republic (2026-09-29) - Tether Has Frozen Nearly $550M in Iran-Linked USDT in 2026"),
    "S27": ("https://www.coindesk.com/business/2026/09/09/iran-eases-currency-controls-to-let-traders-bring-earnings-home-in-crypto-ft", "CoinDesk (2026-09-09, citing FT) - Iran eases currency controls to let traders bring earnings home in crypto"),
    "S28": ("https://www.cryptotimes.io/2026/09/09/iran-relaxes-crypto-rules-as-exporters-settle-trade-in-tether-ft-reports/", "Crypto Times (2026-09-09) - Iran relaxes crypto rules as exporters settle trade in Tether, FT reports"),
    "S29": ("https://www.ekhtebar.ir/قانون-اصلاح-قانون-مبارزه-با-قاچاق-کالا/", "Ekhtebar - قانون اصلاح قانون مبارزه با قاچاق کالا و ارز"),
    "S30": ("https://www.eghtesadnews.com/بخش-یادداشت-62/271200-مجازات-صرافی-های-بدون-مجوز", "Eghtesadnews - مجازات صرافی‌های بدون مجوز"),
    "S31": ("https://tejaratnews.com/کمیسیون-تلفیق-کلیات-لایحه-بودجه-۱۴۰۵", "Tejaratnews - کمیسیون تلفیق کلیات لایحه بودجه ۱۴۰۵ را تایید کرد / مجلس و دولت ... مالیات بر ارزش افزوده را اصلاح کردند (URL truncated in search result)"),
    "S32": ("https://www.didbaniran.ir/بخش-سیاسی-3/262990-مالیات-بر-ارزش-افزوده-در-سال-آینده-۱۰-درصد-خواهد-بود", "Didbaniran - مالیات بر ارزش افزوده در سال آینده ۱۰ درصد خواهد بود"),
    "S33": ("https://www.eghtesadonline.com/fa/news/2111310", "Eghtesadonline - مالیات بر ارزش افزوده نهایی شد / مالیات سال ۱۴۰۵ چقدر شد؟"),
    "S34": ("https://www.sepidarsystem.com/blog/vat-rate/", "Sepidar - درصد و نرخ مالیات بر ارزش افزوده 1405 چقدر است؟"),
    "S35": ("https://nabzgheymat.ir/مالیات-بر-ارزش-افزوده-در-۱۴۰۵-چند-درصد-است", "Nabzgheymat - مالیات بر ارزش افزوده در ۱۴۰۵ چند درصد است"),
    "S36": ("https://www.tasnimnews.com/fa/news/1404/10/02/3478556", "Tasnim (1404-10-02) - جزئیات بودجه 1405: افزایش نرخ مالیات ارزش افزوده به 12 درصد (government bill)"),
    "S37": ("https://www.entekhab.ir/fa/news/901582", "Entekhab - جزئیات بودجه ۱۴۰۵؛ نرخ مالیات برارزش افزوده به ۱۲ درصد رسید (government bill)"),
    "S38": ("https://wikihoghoogh.net/wiki/ماده_۱۰۵_قانون_مالیات_های_مستقیم", "Wikihoghoogh - ماده ۱۰۵ قانون مالیات‌های مستقیم (corporate rate 25%)"),
    "S39": ("https://www.zarinpal.com/blog/?p=8694", "Zarinpal blog - مالیات درگاه پرداخت و سقف گردش حساب 1405"),
    "S40": ("https://www.eghtesadnews.com/بخش-اخبار-اقتصادی-67/769938", "Eghtesadnews - جزئیات مصوبه مهم مجلس درباره حقوق کارمندان / چه میزان از حقوق در ۱۴۰۵ مشمول مالیات می‌شود؟"),
    "S41": ("https://bankavl.com/بخش-اخبار-2/56123-مالیات-بر-درآمد-۱۴۰۵", "Bankavl - نرخ مالیات بر درآمد ۱۴۰۵ (جدول)"),
    "S42": ("https://www.rade.ir/20008-مالیات-حقوق-و-دستمزد/", "Rade - جدول مالیات حقوق 1405 چگونه محاسبه می‌شود؟"),
    "S43": ("https://www.sepidarsystem.com/blog/tax-system-penalty/", "Sepidar - جرایم مالیاتی سامانه مودیان و پایانه‌های فروشگاهی"),
    "S44": ("https://mohaseban.org/bank-turnover-tax/", "Mohaseban - مالیات گردش حساب"),
    "S45": ("https://www.zarinpal.com/blog/?p=7186", "Zarinpal blog - مالیات حساب تجاری چیست؟ چه کسانی مشمول مالیات حساب تجاری 1405 می‌شوند؟"),
    "S46": ("https://www.zoomit.ir/tech-iran/414292-conditions-for-economic-code/", "Zoomit - کد اقتصادی چیست؛ شرایط، مراحل دریافت و نحوه استعلام آن"),
    "S47": ("https://www.sepidarsystem.com/blog/economic-code/", "Sepidar - کد اقتصادی چیست و چه کاربردی دارد؟ مراحل ثبت نام"),
    "S48": ("https://www.zarinpal.com/blog/?p=7913", "Zarinpal blog - اینماد چیست؟ نحوه دریافت نماد اعتماد الکترونیکی 1405"),
    "S49": ("https://www.zoomit.ir/report/464878-iran-online-business-union-annual-report-1404/", "Zoomit - گزارش سالانه اتحادیه کسب‌وکارهای مجازی ۱۴۰۴"),
    "S50": ("https://www.taadolnewspaper.ir/fa/news/341466/سود-معاملات-رمزارزي-مشمول-ماليات-بر-درآمد-است", "Taadol - سود معاملات رمزارزی مشمول مالیات بر درآمد است"),
    "S51": ("https://digiato.com/tech/should-snapp-pay-vat", "Digiato - آیا اسنپ باید مالیات بر ارزش افزوده بپردازد؟ (Administrative Court ruling Mehr 1403)"),
    "S52": ("https://donya-e-eqtesad.com/fa/tiny/news-4254722", "Donya-e-Eqtesad - حذف ۴ صفر از پول ملی وارد فاز اجرایی شد"),
    "S53": ("https://www.zoomit.ir/tech-iran/449333-iran-parliament-approves-currency-redenomination/", "Zoomit - مجلس حذف چهار صفر از پول ملی را تصویب کرد"),
    "S54": ("https://www.mehrnews.com/news/6534667/ثبت-شرکت-چقدر-هزینه-دارد", "Mehr News (1404-04-28) - ثبت شرکت چقدر هزینه دارد؟ (listed in results; body not summarised; no numbers used)"),
    "S55": ("repo:docs/business-plan-full-context.md", "Round-0 business plan (internal): card-to-card caps, Zarinpal ToS, exchange rails - not re-verified here"),
}


def src(*ids: str) -> list[dict]:
    out = []
    for i in ids:
        url, title = SRC[i]
        out.append({"url": url, "title": f"[{i}] {title}", "note": PS if not url.startswith("repo:") else "internal repo document"})
    return out


def rec(value, unit: str | None = None, conf: str = "medium", s: tuple = (), verify: str | None = None,
        status: str | None = None, note: str | None = None, **extra) -> dict:
    r: dict = {"value": value}
    if unit:
        r["unit"] = unit
    r["as_of"] = AS_OF
    r["confidence"] = conf
    if s:
        r["sources"] = src(*s)
    if verify:
        r["verify_how"] = verify
    if status:
        r["status"] = status
    if note:
        r["note"] = note
    r.update(extra)
    return r


def bg(value, unit: str | None, verify: str, note: str = "") -> dict:
    """Background-knowledge record: NOT re-verified this session (web search budget exhausted) -> low + UNVERIFIED."""
    n = "Background knowledge of the statute/practice; not re-verified in this session. " + note
    return rec(value, unit, "low", (), verify, "UNVERIFIED", n.strip())


def unk(unit: str | None, verify: str, note: str = "") -> dict:
    return rec(None, unit, "low", (), verify, "UNVERIFIED", note or "Not found in this session's sources.")


def policy(value, unit: str | None, note: str) -> dict:
    n = "analyst-proposed policy parameter (NOT a legal fact): " + note
    if value is None:
        return rec(None, unit, "low", (), "Owner decision: set after lawyer advice and the first 30 days of data (case-by-case until then).", "UNVERIFIED", n)
    return rec(value, unit, "low", (), None, None, n)


VERIFY_TAX = "Ask a licensed Iranian CPA (حسابدار رسمی / مشاور مالیاتی) for a written confirmation and cross-check the Tax Organization portal (tax.gov.ir / intamedia.ir) and the enacted 1405 Budget Law text."
VERIFY_LAW = "Read the statute text on a law database (rc.majlis.ir, dotic.ir, ekhtebar.ir) or ask the retained lawyer to confirm in the legal memo."

# ---------------------------------------------------------------------------------------------
# data/tax.json
# ---------------------------------------------------------------------------------------------
tax = {
    "_meta": {
        "owner_agent": "04-legal-tax-compliance-ir",
        "as_of": AS_OF,
        "jalali_as_of": "1405-07-10",
        "disclaimer": "Analysis for a software/simulation context - NOT legal or tax advice. Confirm every item with a licensed Iranian CPA/lawyer before relying on it.",
        "units": "Money values in IRT (Toman, integer) unless a unit says otherwise; 1 Toman = 10 Rial. Statutory texts quote Rial: 4,800 million rial = 480,000,000 IRT.",
        "redenomination_note": "A law removing four zeros (new rial = 10,000 old rials = 1,000 Toman) is enacted; transition period 16 Azar 1406 (2027-12-07) to 16 Azar 1409 (2030-12-07). Keep tax thresholds in integer Toman and convert at the boundary.",
        "research_limitation": "Web-search budget was exhausted after 26 successful searches; page bodies were not fetched (egress blocked). Values with confidence low are background knowledge or single-source and carry verify_how.",
        "how_to_use": "Pricing engine/simulator read leaves with `value`; null means unknown (do not guess: expose as a scenario input).",
    },
    "vat": {
        "rate_pct": rec(10, "pct", "medium", ("S31", "S32", "S33", "S34", "S35"),
                        VERIFY_TAX, "reported",
                        "1405 standard rate. Government bill proposed 12% (S36, S37); consolidation committee and floor vote kept 10%. Adjudicated: 10%. The enacted law text was not seen."),
        "budget_bill_proposed_pct": rec(12, "pct", "medium", ("S36", "S37"), VERIFY_TAX, "conflicting",
                                        "Proposal in the government's 1405 budget bill; rejected by Majlis per S31-S35. Keep only to explain the conflicting headlines."),
        "applies_to_resale_of_foreign_digital_services": bg(True, "bool", VERIFY_TAX,
                                                             "Modelling assumption: a sale of a service/digital product to an Iranian consumer is a taxable supply in Iran."),
        "base_mode_default": bg("gross_price", "enum", VERIFY_TAX,
                                "Options for the pricing engine: gross_price | fee_only_agent | exempt_if_confirmed. Default conservative = VAT on the full customer price."),
        "base_mode_options": policy(["gross_price", "fee_only_agent", "exempt_if_confirmed"], None,
                                    "fee_only_agent is defensible only if contracts make the platform the customer's agent and the face value is a pass-through; needs CPA/lawyer sign-off."),
        "input_vat_credit_on_usdt_and_foreign_provider_purchases": bg(False, "bool", VERIFY_TAX,
                                                                      "USDT purchases and foreign-provider charges carry no Iranian VAT invoice, so no input credit is assumed."),
        "return_period": bg("quarterly (per Jalali season)", None, VERIFY_TAX),
        "return_due_days_after_period_end": bg(30, "days", VERIFY_TAX, "Returns and payment due by the end of the month following the quarter."),
        "late_payment_penalty_pct_per_month": bg(2, "pct/month", VERIFY_TAX, "Direct Taxes Act Art. 190 style late-payment penalty; also applied to VAT."),
        "price_display_rule": bg("consumer-facing price should be the final price including VAT", None, VERIFY_LAW,
                                 "Consumer-protection practice; show VAT as a separate line item in the quote."),
        "platform_commission_vat_precedent": rec("Administrative Justice Court (Mehr 1403) held VAT applies to Snapp's commission revenue", None, "low", ("S51",), VERIFY_LAW,
                                                 "reported", "Single source; shows tax authority/courts treat platform commissions as taxable services."),
    },
    "income_tax": {
        "legal_entity_rate_pct": rec(25, "pct", "high", ("S38", "S39"), VERIFY_TAX, "reported",
                                     "Direct Taxes Act Art. 105: combined income of companies taxed at 25% unless a special rate applies. Flat, no brackets."),
        "individual": {
            "annual_exemption_irt": rec(480_000_000, "IRT/year", "medium", ("S40", "S41", "S42"), VERIFY_TAX, "reported",
                                        "4,800 million rial per year = 40,000,000 IRT per month (1405 salary table; Majlis-approved in the 1405 budget process)."),
            "salary_brackets_1405": rec([
                {"from_irt": 0, "to_irt": 480_000_000, "rate_pct": 0, "note": "exempt slice"},
                {"from_irt": 480_000_000, "to_irt": 960_000_000, "rate_pct": 10, "note": "rate for this first taxed slice is ASSUMED (UNVERIFIED); the next slices are reported"},
                {"from_irt": 960_000_000, "to_irt": 1_200_000_000, "rate_pct": 15},
                {"from_irt": 1_200_000_000, "to_irt": 1_440_000_000, "rate_pct": 20},
                {"from_irt": 1_440_000_000, "to_irt": 1_680_000_000, "rate_pct": 25},
                {"from_irt": 1_680_000_000, "to_irt": None, "rate_pct": 30},
            ], "IRT/year", "medium", ("S40", "S41", "S42"), VERIFY_TAX, "reported",
                "Slices >960m IRT quoted in rial by three outlets (9,600/12,000/14,400/16,800 million rial: 15/20/25/30%). First taxed slice (10%) inferred from the 2x/2.5x/3x/3.5x pattern."),
            "business_income_art131_brackets": unk("IRT/year", VERIFY_TAX + " Ask specifically for the Art. 131 table applicable to non-salary (مشاغل) income in 1405."),
            "business_income_modeling_assumption": policy("Art. 131 table assumed to follow the same multiples as the 1405 salary table (UNVERIFIED)", None,
                                                          "Used only by the optional individual_progressive regime in the simulator; default regime is company_flat_25."),
            "academic_judge_flat_rate_pct": rec(10, "pct", "low", ("S40",), VERIFY_TAX, "reported", "Irrelevant to this business; recorded because it appeared with the table."),
        },
        "dividend_distribution_tax": unk("pct", VERIFY_TAX + " Ask what tax applies when the owner withdraws profit from an LLC (dividend vs owner salary)."),
        "fx_gain_treatment": bg("realised FX/inventory gains are taxable business income; unrealised revaluation is not taxed until realised; realised losses deductible", None,
                                VERIFY_TAX, "Simulator default; the real treatment of USDT inventory and tasir (تسعیر) is unresolved."),
        "inventory_inflation_adjustment": bg(False, "bool", VERIFY_TAX,
                                             "Assumed: no inflation indexation of inventory cost -> historical-cost profit is taxed during devaluations (see scripts/research/04_legal_tax_calc.py section 5)."),
        "crypto_gain_tax_status": rec("unresolved: general principle - any income-producing trade is taxable (Art. 93 discussed for exchange operators); no dedicated crypto tax rule confirmed", None, "low", ("S50",), VERIFY_TAX, "reported"),
    },
    "moadian": {
        "penalty_failure_to_submit": rec({"pct_of_sales": 10, "minimum_irt": 2_000_000, "rule": "higher of the two"}, "pct / IRT", "low", ("S43",),
                                         VERIFY_TAX + " Check whether the penalty applies per invoice or per period.", "reported",
                                         "One outlet: fine of 10% of total sales or 20,000,000 rial, whichever is higher, for not submitting e-invoices."),
        "registration_threshold_individuals": unk("IRT/year", VERIFY_TAX + " Ask which Moadian phase (مرحله) and sales threshold apply to a new online seller in 1405; assume in scope from day 1."),
        "default_assumption": policy("treat every sale as requiring a Moadian e-invoice from day 1", None, "Cheaper than retrofitting; also needed for VAT."),
        "invoice_pattern_digital_sales": bg("Pattern 1 (sale of goods/services); a distinct pattern exists for FX sales (pattern 2) which signals a regulated activity", None, VERIFY_TAX),
        "unique_tax_id_format": bg("22-character شماره منحصربه‌فرد مالیاتی = 6-char tax-memory id + 5 hex day counter + 10 hex serial + 1 check char", None,
                                   "Read the current Moadian technical spec at tp.tax.gov.ir before implementing."),
    },
    "bank_account_monitoring": {
        "commercial_account_min_monthly_deposit_count": rec(100, "count/month", "medium", ("S44", "S45", "S55"), VERIFY_TAX, "reported",
                                                           "CBI notice effective from 1 Mehr 1401: accounts with more than 100 deposits per month AND more than 35,000,000 IRT total are treated as commercial accounts subject to tax."),
        "commercial_account_min_monthly_deposit_total_irt": rec(35_000_000, "IRT/month", "medium", ("S44", "S45", "S55"), VERIFY_TAX, "reported"),
        "annual_deposit_reporting_threshold_irt": rec(500_000_000, "IRT/year", "low", ("S39", "S44"), VERIFY_TAX, "reported",
                                                      "1405 Tax Organization instruction: banks introduce accounts whose yearly deposits exceed 5,000 million rial (=500,000,000 IRT) as monitored accounts."),
        "assessed_rate_band_pct": rec({"min": 15, "max": 25}, "pct", "low", ("S39",), VERIFY_TAX, "reported",
                                      "Reported band for tax assessed on bank-turnover income (individuals); a company is flat 25% (Art. 105)."),
        "card_to_card_daily_cap_irt_per_card": rec(15_000_000, "IRT/day/card", "low", ("S55",), "Owned by the payments specialist (03-ir-payments-collection): confirm the current CBI per-card cap.", "reported",
                                                   "Round-0 figure; not re-verified here."),
    },
    "deadlines": {
        "individual_business_return_due": bg("31 Ordibehesht of the following Jalali year", None, VERIFY_TAX),
        "legal_entity_return_due": bg("4 months after fiscal year-end (31 Tir for an Esfand year-end)", None, VERIFY_TAX),
        "vat_return_due": bg("within one month after each Jalali quarter", None, VERIFY_TAX),
        "extensions_are_common": bg(True, "bool", VERIFY_TAX, "The Tax Organization often extends deadlines by decree; check each year."),
    },
    "payroll_context": {
        "employer_social_insurance_pct": bg(23, "pct of insurable wage", VERIFY_TAX, "20% employer + 3% unemployment insurance; employee share 7%. Owned by ops-growth for staffing cost."),
        "employee_social_insurance_pct": bg(7, "pct of insurable wage", VERIFY_TAX),
    },
    "registration_fees": {
        "economic_code_fee_irt": rec(0, "IRT", "medium", ("S46", "S47"), "Re-check on the Tax Organization portal during registration.", "reported",
                                     "Tax Organization announcement relayed by several outlets: all stages of obtaining a tax/economic code are free."),
        "enamad_fee_irt": rec(175_000, "IRT per 2 years", "low", ("S48",), "Check the fee on the Enamad portal (enamad.ir) at application time.", "reported",
                              "Single source (Zarinpal 1405 guide): 2-year validity, 175,000 Toman."),
        "company_registration_total_irt": unk("IRT", "Get a written all-in quote (state fees + Official Gazette ad + agent) from a registered corporate-registration agent or lawyer; see S54 for one outlet's article (body not read)."),
    },
    "currency_unit": {
        "redenomination_ratio": rec("1 new rial = 10,000 old rials = 1,000 Toman", None, "medium", ("S52", "S53"), "Check the CBI notice on the transition timetable.", "reported"),
        "transition_start": rec("1406-09-16 (2027-12-07)", None, "medium", ("S52", "S53"), "Check the CBI notice.", "reported"),
        "old_rial_retired": rec("1409-09-16 (2030-12-07)", None, "medium", ("S52", "S53"), "Check the CBI notice.", "reported"),
    },
}

# ---------------------------------------------------------------------------------------------
# data/legal_checklist.json
# ---------------------------------------------------------------------------------------------
DUR_VERIFY = "Ask the registrar/agent/portal for the current service-level time; queue lengths vary by city and season."
COST_VERIFY = "Get a written quote; fees change yearly."


def step(i, order, title_en, title_fa, applies, prereq, action, cost, cost_band, dur, sources, gate, risk_if_skipped):
    return {
        "id": i, "order": order, "title_en": title_en, "title_fa": title_fa, "applies_to": applies, "prerequisites": prereq,
        "owner_action": action, "cost_irt": cost, "cost_band": cost_band, "duration_days": dur,
        "source_ids": sources, "gate": gate, "risk_if_skipped": risk_if_skipped,
    }


steps = [
    step("L00", 0, "Retain a licensed Iranian lawyer (fintech/e-commerce) and a CPA", "انتخاب وکیل پایه یک (فین‌تک/تجارت الکترونیک) و حسابدار رسمی",
         ["individual", "llc"], [], "Brief them with docs/03-research/04-legal-tax-ir.md; ask for a written memo on: product classification (card issue/top-up, wallet, USDT-pay, pay-on-behalf), VAT base, Moadian scope, ToS review.",
         unk("IRT", COST_VERIFY), "medium", unk("days", DUR_VERIFY), [], "pre_launch",
         "Everything below rests on unverified analysis; the classification risk (unlicensed exchange/PSP) is unmanaged."),
    step("L01", 1, "Decide the legal form (pilot as individual vs LLC)", "تصمیم درباره‌ی ساختار حقوقی (حقیقی در دوره‌ی آزمایشی یا شرکت با مسئولیت محدود)",
         ["individual", "llc"], ["L00"], "Use the memo + volume plan: >3 orders/day through any personal bank account already makes it a 'commercial account' (rule: >100 deposits/month and >35M IRT); plan the LLC before that.",
         rec(0, "IRT", "low", (), None, None, "Decision step: no external fee by definition (internal effort only)."), "free", rec(0, "days", "low", (), None, None, "Decision step: completed in the lawyer/CPA meeting; no external queue."), ["S44", "S45"], "pre_launch",
         "Personal accounts mix private and business money; liability is unlimited; tax assessment on bank turnover."),
    step("L02", 2, "Judicial e-notification and identity set-up of all partners/managers (national ID, mobile in own name, e-signature)", "ثبت‌نام در سامانه‌های ابلاغ و احراز هویت شرکا و مدیران (اطلاع ثنا و ...)",
         ["llc", "individual"], ["L01"], "Every partner/manager completes the government e-identity steps the registry portal asks for (UNVERIFIED which ones are mandatory in 1405; ask the agent).",
         unk("IRT", COST_VERIFY), "free", unk("days", DUR_VERIFY), [], "pre_launch", "Registration cannot start."),
    step("L03", 3, "Register the company (LLC) - name, articles, capital deposit, Official Gazette ad, registry certificate", "ثبت شرکت با مسئولیت محدود (نام، اساسنامه، سپرده‌ی سرمایه، آگهی روزنامه رسمی، گواهی ثبت)",
         ["llc"], ["L02"], "Choose a name; fix capital (statute sets no fixed minimum for an LLC per one summary; capital must be paid in cash at registration - UNVERIFIED); at least two partners (statute; single-member structures UNVERIFIED); registered address with postal code.",
         unk("IRT", "Get an all-in written quote: state fees depend on capital + newspaper ad + agent fee. One outlet (S54) publishes an article on costs; its body was not read."),
         "medium", unk("days", DUR_VERIFY), ["S54"], "pre_launch", "No legal entity: personal liability and personal-account tax exposure."),
    step("L04", 4, "Obtain the economic code (کد اقتصادی) and open the tax file", "دریافت کد اقتصادی و تشکیل پرونده‌ی مالیاتی",
         ["individual", "llc"], ["L01"], "Register on the Tax Organization portal; for companies this is normally linked to registration. Keep the unique tax-memory credentials.",
         rec(0, "IRT", "medium", ("S46", "S47"), "Re-check on the portal.", "reported", "Free per the Tax Organization announcement relayed by outlets."), "free",
         unk("days", DUR_VERIFY), ["S46", "S47"], "pre_launch", "Cannot issue valid invoices, cannot open business banking or PSP onboarding."),
    step("L05", 5, "Register on the Moadian system and set up e-invoicing", "ثبت‌نام در سامانه مودیان و راه‌اندازی صورتحساب الکترونیکی",
         ["individual", "llc"], ["L04"], "Obtain the tax-memory ID (شناسه یکتای حافظه مالیاتی) and a Moadian-compatible invoice export; issue an invoice per sale with VAT line.",
         unk("IRT", "Ask the Tax Organization/CPA; software vendors charge separately."), "low", unk("days", DUR_VERIFY), ["S43"], "pre_launch",
         "Penalty reported at 10% of sales or 20M rial (higher) for non-submission (one source)."),
    step("L06", 6, "Business bank account in the entity's own name", "افتتاح حساب بانکی تجاری به نام شخص حقوقی/حقیقی خود",
         ["individual", "llc"], ["L03", "L04"], "Open a current/business account; never receive customer money in third-party or rented accounts. Ask the bank for written confirmation of transfer limits and of the permitted activity description.",
         unk("IRT", COST_VERIFY), "low", unk("days", DUR_VERIFY), ["S44"], "pre_launch", "Triangular-fraud blocks, tax assessment on personal turnover, criminal exposure for account misuse."),
    step("L07", 7, "Trade licence from the Online Businesses Union (پروانه کسب)", "پروانه کسب از اتحادیه کسب‌وکارهای مجازی",
         ["individual", "llc"], ["L04"], "Apply on the union portal with the economic code; declare the real activity (digital services/subscriptions/gift cards/virtual cards). Do not declare an activity you do not perform.",
         unk("IRT", COST_VERIFY), "low", unk("days", DUR_VERIFY), ["S49"], "pre_scale", "Union fines; PSPs and Enamad may require it. (The union issued 2,445 licences in 1404 per one outlet.)"),
    step("L08", 8, "Domain (.ir recommended) and Iran-reachable hosting", "ثبت دامنه‌ی ir و میزبانی قابل‌دسترس در داخل کشور",
         ["individual", "llc"], ["L04"], "Register the domain in the owner's/entity's own name; host the customer-facing app/API where the national network stays reachable if international links drop; keep treasury secrets on a separate environment. A statutory hosting-in-Iran duty for private e-commerce sites was NOT verified.",
         unk("IRT", COST_VERIFY), "low", unk("days", DUR_VERIFY), [], "pre_launch", "Outage during international-link disruptions; PSP callbacks fail."),
    step("L09", 9, "Enamad (e-trust symbol) application", "درخواست نماد اعتماد الکترونیکی (اینماد)",
         ["individual", "llc"], ["L04", "L07", "L08"], "Declare the activity accurately. Display the symbol only after issuance. Do not claim 'licensed by the central bank'.",
         rec(175_000, "IRT per 2 years", "low", ("S48",), "Check on enamad.ir at application time.", "reported", "Single source."), "low",
         unk("days", DUR_VERIFY), ["S48"], "pre_scale", "Gateway providers often require it; false display is a consumer-law/fraud risk."),
    step("L10", 10, "Payment rail onboarding (PSP gateway and/or card-to-card on the business account)", "راه‌اندازی درگاه پرداخت و/یا کارت‌به‌کارت روی حساب تجاری",
         ["individual", "llc"], ["L06", "L09"], "Ask the PSP in writing whether the product categories are allowed; if refused, do not mis-declare - change the product or the rail. Enforce payer = customer identity matching.",
         unk("IRT", "Owned by 03-ir-payments-collection."), "low", unk("days", DUR_VERIFY), ["S55"], "pre_launch",
         "Mis-declared category = gateway termination and fund holds; unmatched third-party payers = fraud/AML exposure."),
    step("L11", 11, "Publish legal pages (ToS, privacy, refund, risk disclosure) after lawyer review", "انتشار صفحات حقوقی پس از بازبینی وکیل",
         ["individual", "llc"], ["L00"], "Start from docs/08-compliance-risk/templates/*.fa.md; fill the [placeholders]; record version and acceptance per customer/order.",
         unk("IRT", COST_VERIFY), "medium", unk("days", DUR_VERIFY), [], "pre_launch", "Unenforceable terms; disclosure duty (third-party suspension risk) unmet."),
    step("L12", 12, "KYC/AML programme live: tiers, identity vendor, address screening, logs, retention", "اجرای سیاست KYC/AML: سطوح، سرویس احراز هویت، پایش آدرس، لاگ و نگهداری سوابق",
         ["individual", "llc"], ["L00", "L11"], "Adopt docs/08-compliance-risk/templates/kyc-aml-policy.fa.md; appoint a compliance officer (the owner at first); screen USDT addresses against the public OFAC SDN list and Tether freeze data.",
         unk("IRT", "Identity-inquiry vendors charge per call; owned by 09-platform/12-pricing."), "medium", unk("days", DUR_VERIFY), ["S15", "S25"], "pre_launch",
         "Conduit risk (laundering/fraud) and sanctions-tainted funds."),
    step("L13", 13, "Accounting set-up: legal books, VAT/income-tax accrual, quarterly VAT return calendar", "راه‌اندازی حسابداری: دفاتر قانونی، ذخیره‌ی مالیات، تقویم اظهارنامه",
         ["llc", "individual"], ["L04", "L05"], "Engage the CPA; keep VAT collected in IRT (never swept into the USDT float); calendar the returns (individual 31 Ordibehesht; legal entity 31 Tir; VAT quarterly - UNVERIFIED).",
         unk("IRT", COST_VERIFY), "medium", unk("days", DUR_VERIFY), [], "pre_launch", "Penalties and cash shortfall at the first VAT payment."),
    step("L14", 14, "Compliance rehearsal (freeze / subpoena / provider-suspension drills) and soft launch with low caps", "تمرین سناریوهای مسدودی/استعلام قضایی/تعلیق ارائه‌دهنده و راه‌اندازی با سقف پایین",
         ["individual", "llc"], ["L10", "L11", "L12", "L13"], "Run the pause-trigger playbook once; start with KYC tier T0/T1 limits only; review after 30 days.",
         rec(0, "IRT", "low", (), None, None, "Internal effort only; no external fee by definition."), "free", rec(30, "days", "low", (), None, None, "Proposed soft-launch window (analyst-proposed)."), [], "pre_launch", "First real incident is handled ad hoc."),
]

go_no_go = {
    "gates_must_all_be_true_before_public_launch": [
        {"id": "G1", "requirement": "Written lawyer memo covering product classification, USDT-pay, wallet, pay-on-behalf and ToS", "evidence": "signed memo on file", "linked_steps": ["L00", "L11"]},
        {"id": "G2", "requirement": "Business identity: economic code + Moadian registration; bank account in the entity's own name; no third-party/rented accounts", "evidence": "tax file, bank letter", "linked_steps": ["L04", "L05", "L06"]},
        {"id": "G3", "requirement": "Payment rail legitimacy: PSP written category approval or documented decision to use only business-account transfers; payer-name matching on", "evidence": "PSP email/contract; test log", "linked_steps": ["L10"]},
        {"id": "G4", "requirement": "Every active SKU has risk_label + restriction_note; high-risk SKUs require explicit disclosure acceptance", "evidence": "catalog export", "linked_steps": ["L11"]},
        {"id": "G5", "requirement": "ToS, refund policy, risk disclosure and privacy policy published with version and per-order acceptance record", "evidence": "pages + DB fields", "linked_steps": ["L11"]},
        {"id": "G6", "requirement": "KYC/AML policy adopted; tiers enforced in code; logs and retention configured; compliance officer named", "evidence": "policy doc + config", "linked_steps": ["L12"]},
        {"id": "G7", "requirement": "Sanctions hygiene: address screening on every inbound/outbound USDT transfer; counterparties reviewed in the last 30 days; max float per venue set", "evidence": "screening log", "linked_steps": ["L12"]},
        {"id": "G8", "requirement": "Tax set-up: CPA engaged; VAT base decided; Moadian invoices emitted; VAT collected held in IRT", "evidence": "CPA letter; ledger account 2100", "linked_steps": ["L05", "L13"]},
        {"id": "G9", "requirement": "No marketing claim of being licensed/legal/CBI-approved unless true; Enamad shown only if issued; no 'dollar/USDT exchange' wording", "evidence": "copy review", "linked_steps": ["L09", "L11"]},
        {"id": "G10", "requirement": "Kill switches work per SKU, per payment rail and for USDT payment; staff roles and dual control on card-detail reveal", "evidence": "drill log", "linked_steps": ["L14"]},
        {"id": "G11", "requirement": "USDT payment from Iran-resident customers and customer wallet cash-out are OFF unless the lawyer memo explicitly clears them", "evidence": "feature flags", "linked_steps": ["L00"]},
    ],
    "pause_triggers_any_one": [
        {"id": "P1", "trigger": "Any notice, summons or information request from FATA, a prosecutor, the CBI or the Tax Organization", "action": "Pause affected flows, preserve logs (legal hold), involve counsel; cooperate lawfully"},
        {"id": "P2", "trigger": "PSP/gateway termination or bank-account freeze", "action": "Stop selling via that rail; do not reroute through third-party accounts; follow bank/PSP procedure"},
        {"id": "P3", "trigger": "OFAC/Tether action naming a counterparty, exchange or provider we use, or freezing an address we touched", "action": "Pause treasury flows and dependent SKUs; re-screen; consult counsel; follow customer refund tiers"},
        {"id": "P4", "trigger": "Card issuer or content provider suspends our balances or accounts", "action": "Pause that SKU, notify affected customers, apply risk-label refund tiers"},
        {"id": "P5", "trigger": "Third-party-payer / mismatched-payer rate above the proposed policy threshold", "action": "Pause new-customer card-to-card; tighten tiers; report if required"},
        {"id": "P6", "trigger": "New CBI directive, law or court ruling that classifies one of our SKUs as FX/crypto/payment service", "action": "Pause the SKU; get legal advice before resuming"},
        {"id": "P7", "trigger": "Refund/dispute rate above the proposed policy threshold over 30 days", "action": "Investigate; pause the worst SKU/provider"},
        {"id": "P8", "trigger": "Tax audit notice, missed Moadian submissions or unfiled return", "action": "Cure immediately with the CPA; do not trade into the problem"},
        {"id": "P9", "trigger": "Data breach or suspected leak of card/KYC data", "action": "Disable reveals, rotate keys, notify affected users, involve counsel"},
        {"id": "P10", "trigger": "Evidence that a customer or operator is using us to evade a provider's KYC, geo-rules or a sanctions rule", "action": "Block the account, refuse the order, document; do not assist"},
    ],
    "proposed_thresholds": {
        "third_party_payer_rate_pause_pct_7d": policy(3, "pct of paid orders in 7 days", "tune with data; mirrors P5"),
        "refund_dispute_rate_pause_pct_30d": policy(5, "pct of orders in 30 days", "tune with data; mirrors P7"),
        "max_float_share_on_a_single_exchange_pct": policy(40, "pct of USDT float", "concentration limit; owned by treasury specialist, shown here because sanctions/freeze risk is venue-specific"),
    },
}

# Ordinal risk register (likelihood, impact on 1-5 scales; NOT probabilities). Scores = L x I.
RISKS = [
    ("R01", "Legal", "Product classified as unlicensed FX/crypto brokerage or payment service (card top-up, wallet, USDT-pay, pay-on-behalf)", 3, 5, "Lawyer memo; closed-loop wallet, no cash-out; no USDT-in for residents; no exchange-style rate board or wording; caps and KYC", 2, 5),
    ("R02", "Payments", "Gateway/bank terminates or freezes because the category looks FX/crypto-related", 4, 4, "Declare accurately; multiple lawful rails; daily sweeps; minimal balances", 3, 3),
    ("R03", "Sanctions", "USDT sourced via SDN-designated exchanges or addresses later frozen by Tether", 4, 4, "Address screening; venue diversification; just-in-time float; float cap per venue; contingency fund", 3, 4),
    ("R04", "Counterparty", "Card issuer / AI vendor suspends accounts, customers lose value", 4, 3, "Risk labels; disclosure acceptance; tiered refunds; per-card balance caps; diversified catalog", 4, 2),
    ("R05", "Tax", "VAT/Moadian/bank-turnover non-compliance; margin wiped by VAT on gross", 3, 4, "Entity + CPA + e-invoicing; VAT mode decided; VAT held in IRT", 2, 3),
    ("R06", "Criminal", "Receiving funds from fraud victims (triangular fraud) or third parties; account blocked", 4, 4, "Payer-name match; verified instruments; no third-party payers; hold rules", 3, 3),
    ("R07", "AML", "Platform used as conduit for laundering or fraud proceeds", 3, 5, "KYC tiers; cumulative limits; anti-splitting rules; monitoring; records; cooperation", 2, 4),
    ("R08", "Regulatory", "New CBI directive or law makes SKUs illegal or requires a licence", 3, 4, "Per-SKU kill switches; legal watch; modular catalog", 3, 3),
    ("R09", "Consumer", "Disputes over deceptive claims, missing disclosures, refunds", 3, 3, "Templates; honest copy; Enamad only if issued; complaint SLA", 2, 2),
    ("R10", "Security", "Breach of card/KYC data", 2, 5, "Envelope encryption; reveal step-up; minimal data; incident plan", 2, 3),
    ("R11", "Operations", "Internet shutdown or hosting outage", 3, 3, "Iran-reachable hosting; offline operator procedures", 3, 2),
    ("R12", "Insider", "Operator or staff misuse of card details / customer data", 3, 3, "RBAC, dual control, audit logs, reveal limits", 2, 2),
    ("R13", "Owner", "Personal exposure of the owner's assets under unlimited liability (individual form)", 2, 5, "LLC; separate accounts; insurance if available", 2, 3),
    ("R14", "Advertising", "Misleading claims ('licensed', 'legal', fake Enamad) or exchange-style promotion", 2, 4, "Copy guard list; legal review of marketing", 1, 4),
    ("R15", "Currency unit", "Redenomination (4 zeros) causes unit errors in thresholds, invoices, limits", 2, 2, "Integer Toman internally; conversion at boundary; tests", 1, 2),
]
risk_register = [
    {"id": i, "category": c, "risk": d, "likelihood_1_5": l, "impact_1_5": im, "inherent_score": l * im, "mitigations": m,
     "residual_likelihood_1_5": rl, "residual_impact_1_5": ri, "residual_score": rl * ri}
    for (i, c, d, l, im, m, rl, ri) in RISKS
]
risk_register.sort(key=lambda r: (-r["inherent_score"], r["id"]))

policy_defaults = {
    "_note": "Analyst-proposed defaults for the app/simulator (NOT legal facts). Tune with data and lawyer advice. Anchors: 15M IRT/day/card card-to-card cap (S55) and 25M IRT/24h identified-deposit ceiling (S12).",
    "kyc_tiers": [
        {"tier": "T0", "name_fa": "تأیید موبایل", "requirements": ["phone OTP"], "allowed_risk_labels": ["low"],
         "max_per_order_irt": policy(5_000_000, "IRT", "about one third of the T1 per-order cap"),
         "max_rolling_24h_irt": policy(5_000_000, "IRT", "cumulative across orders, not per order"),
         "max_rolling_30d_irt": policy(20_000_000, "IRT", "cumulative")},
        {"tier": "T1", "name_fa": "هویت تأییدشده", "requirements": ["national ID + full name + date of birth", "mobile number matched to the national ID (Shahkar-type inquiry)"], "allowed_risk_labels": ["low", "medium"],
         "max_per_order_irt": policy(15_000_000, "IRT", "anchored to the per-card c2c cap"),
         "max_rolling_24h_irt": policy(25_000_000, "IRT", "anchored to the identified-deposit ceiling"),
         "max_rolling_30d_irt": policy(100_000_000, "IRT", "cumulative")},
        {"tier": "T2", "name_fa": "پرداخت‌کننده‌ی تأییدشده", "requirements": ["T1", "at least one bank card/Sheba verified as owned by the same national ID", "payments accepted only from verified instruments"], "allowed_risk_labels": ["low", "medium", "high"],
         "max_per_order_irt": policy(50_000_000, "IRT", "no external anchor"),
         "max_rolling_24h_irt": policy(100_000_000, "IRT", "no external anchor"),
         "max_rolling_30d_irt": policy(500_000_000, "IRT", "no external anchor")},
        {"tier": "T3", "name_fa": "احراز هویت تقویت‌شده", "requirements": ["T2", "liveness/video check or in-person", "occupation and source-of-funds statement", "mandatory operator + owner approval per order above T2 limits"], "allowed_risk_labels": ["low", "medium", "high"],
         "max_per_order_irt": policy(None, "IRT", "case-by-case; no automatic limit"),
         "max_rolling_24h_irt": policy(None, "IRT", "case-by-case"),
         "max_rolling_30d_irt": policy(None, "IRT", "case-by-case")},
    ],
    "anti_structuring_rule": policy("limits are cumulative per natural person over rolling windows; 3+ orders within 60 minutes whose sum exceeds the next tier's per-order limit are flagged for review; customers are never advised to split payments", None,
                                    "required by CLAUDE.md section 3 (no structuring around caps)"),
    "price_lock": {
        "quote_valid_minutes": policy(15, "minutes", "round-0 plan suggests 10-15 min; architecture engine has a lock parameter"),
        "late_payment": policy("accept at locked price only if the adverse rate move is below the engine threshold and inside the grace window; otherwise re-quote the shortfall or refund minus fee", None, "mirrors architecture 9.4"),
        "under_payment": policy("complete within the pay window or refund minus fee", None, "mirrors architecture 9.4"),
        "over_payment": policy("credit to the closed-loop wallet or refund to the verified payer instrument", None, "mirrors architecture 9.4"),
    },
    "rush_terms": {
        "rush_fee_refund_if_sla_missed_pct": policy(100, "pct of the rush premium", "customer-friendly default; reduces dispute risk"),
        "rush_fee_refund_after_work_started": policy(0, "pct of the rush premium", "non-refundable once an operator has started (unless SLA missed)"),
    },
    "refund_tiers": [
        {"stage": "before_payment_confirmed", "refund_pct_of_price": policy(100, "pct", "nothing was collected or the payment is returned in full"), "note": "applies to all fulfilment modes"},
        {"stage": "paid_not_started_(queued)", "refund_pct_of_price": policy(100, "pct", "minus the non-recoverable payment-method fee if the customer cancels; 100% if we cancel"), "note": "all modes"},
        {"stage": "in_progress_(fulfilling)", "refund_pct_of_price": policy(None, "pct", "100% if we fail; if the customer cancels, price minus irrecoverable provider/network costs already incurred (capped, disclosed)"), "note": "operator_assisted and api_auto"},
        {"stage": "delivered_unused_within_24h", "refund_pct_of_price": policy(100, "pct", "replacement or refund if defective; delivered digital services performed with consent are otherwise non-refundable for change of mind - lawyer to confirm vs the 7-day withdrawal rule"), "note": "voucher/gift-card/prefunded"},
        {"stage": "third_party_suspension_after_delivery", "refund_pct_of_price": policy(None, "pct", "low-risk SKU: unused balance refunded within 7 days; medium: within 72h; high: within 48h and only if not caused by the customer; later: goodwill only"), "note": "tie to the product risk_label (see refund-policy.fa.md)"},
    ],
}

legal_checklist = {
    "_meta": {
        "owner_agent": "04-legal-tax-compliance-ir",
        "as_of": AS_OF,
        "disclaimer": "Analysis, not legal advice. Confirm with a licensed Iranian lawyer and CPA.",
        "research_limitation": "Costs and durations are null where not found: web-search budget ran out after 26 successful searches and page fetches were blocked. Do NOT replace nulls with guesses in the simulator; expose them as scenario inputs `legal_setup_cost_irt` and `legal_setup_days`.",
        "cost_band_scale": "free | low | medium | high (qualitative, not a number)",
    },
    "steps": steps,
    "go_no_go": go_no_go,
    "risk_register": {"_note": "Ordinal scales (1-5); inherent = likelihood x impact; residual after mitigations; analyst judgement, not probabilities.", "items": risk_register},
    "policy_defaults": policy_defaults,
}


def dump(path: Path, obj: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("wrote", path.relative_to(ROOT), f"({path.stat().st_size:,} bytes)")


def sources_markdown() -> str:
    lines = []
    for sid, (url, title) in SRC.items():
        lines.append(f"- **[{sid}]** {url} — {title} — {PS if not url.startswith('repo:') else 'internal repo document'}")
    return "\n".join(lines) + "\n"


if __name__ == "__main__":
    dump(ROOT / "data" / "tax.json", tax)
    dump(ROOT / "data" / "legal_checklist.json", legal_checklist)
    out = Path("/tmp/claude-0/-home-user-HiClaude/e0406b7e-eb00-55e4-8e8b-4850c515b2e9/scratchpad/sources_block.md")
    out.write_text(sources_markdown(), encoding="utf-8")
    print("risk register top-5 inherent:", [(r["id"], r["inherent_score"]) for r in risk_register[:5]])
