#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
03_build_data.py - generates data/gateways.json, data/collection_methods.json, data/identity_vendors.json
for research brief 03-ir-payments-collection.

Why a generator: every leaf is a Record (CLAUDE.md section 5) and must carry as_of + confidence + sources (or
status UNVERIFIED + verify_how). Building them from helpers keeps the three files consistent and re-runnable
when facts are refreshed (edit values here, re-run, then `node scripts/validate-data.mjs data/<file>.json`).

Evidence classes used in `sources[].note`
  "per search summary"        - a WebSearch result summary was read, the page itself was NOT opened (WebFetch is blocked).
  "package source read directly" - the SDK/package tarball was downloaded from npm/PyPI and its source/README read.
                                  Good evidence of API *shape* (paths, params, enums); may lag the live API.
  "local file"                - another file of this repository.

Run:  python3 scripts/research/03_build_data.py
"""
from __future__ import annotations

import json
import os

AS_OF = "2026-10-02"
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))

SS = "per search summary (page not opened; WebFetch blocked)"
PK = "package source read directly from registry tarball; SDK evidence of API shape, may lag live API"

# --------------------------------------------------------------------------------------------------------------
# Source registry
# --------------------------------------------------------------------------------------------------------------
def _s(url, title, note):
    return {"url": url, "title": title, "note": note}

SRC = {
    # ---- search-summary sources (S) ----
    "S1": _s("https://www.zarinpal.com/blog/?p=4071", "Zarinpal blog: cheapest internet payment gateway (fee 0.5%, cap 16,000 Toman, +500 fixed)", SS),
    "S2": _s("https://www.zarinpal.com/pricing", "Zarinpal pricing page (listed in results; content not seen)", SS),
    "S3": _s("https://www.zarinpal.com/terms.html", "Zarinpal executive terms (last updated 8 Tir 1404)", SS),
    "S4": _s("https://www.zoomit.ir/tech-iran/432535-regulatory-directive-cryptocurrency-market-by-central-bank/", "Zoomit: CBI crypto-market directive; exchanges must use PSPs instead of payment-yars", SS),
    "S5": _s("https://mihanblockchain.com/online-payment-of-iranian-cryptocurrency-exchanges-should-be-banned/", "Mihan Blockchain: Shaparak notice - cut e-payment for crypto sales", SS),
    "S6": _s("https://arzdigital.com/blog/report-cbi-new-instructions-crypto/", "ArzDigital: CBI - exchanges must take gateways from PSPs not payment-yars", SS),
    "S7": _s("https://mihanblockchain.com/iranian-exchanges-direct-rial-payment-halt/", "Mihan Blockchain: direct rial payment to exchanges halted", SS),
    "S8": _s("https://mihanblockchain.com/iran-central-bank-conditions-crypto-exchanges/", "Mihan Blockchain: CBI conditions for re-opening exchange gateways", SS),
    "S9": _s("https://fararu.com/fa/news/831729/%D9%86%D8%A8%D8%B1%D8%AF-%D8%B4%D8%A7%D9%BE%D8%B1%DA%A9-%D8%B5%D8%B1%D8%A7%D9%81%DB%8C-%D9%87%D8%A7%DB%8C-%D8%A7%DB%8C%D8%B1%D8%A7%D9%86%DB%8C-%D8%A7%D8%B1%D8%B2-%D8%AF%DB%8C%D8%AC%DB%8C%D8%AA%D8%A7%D9%84-%D8%A7%D8%AC%D8%B1%D8%A7%DB%8C-%D8%B4%D8%B1%D8%B7-%D8%B4%D8%B1%D9%88%D8%B7-%DA%AF%D8%A7%D9%86%D9%87-%DB%8C%D8%A7-%D9%BE%D8%A7%DB%8C%D8%A7%D9%86-%DA%A9%D8%A7%D8%B1", "Fararu: Shaparak vs Iranian crypto exchanges - the 10 conditions", SS),
    "S10": _s("https://www.zoomit.ir/tech-iran/368633-central-bank-to-ban-payment-gateways-crypto-trading/", "Zoomit: CBI moves to close bank gateways of crypto exchanges", SS),
    "S11": _s("https://www.zoomit.ir/tech-iran/388644-payment-gateways-crypto-trading/", "Zoomit: Shaparak bans fund transfer between payment-yars; wallets outside e-money rules banned", SS),
    "S12": _s("https://www.zarinpal.com/blog/%D8%B3%D9%82%D9%81-%D8%AA%D8%B1%D8%A7%DA%A9%D9%86%D8%B4-%D8%AF%D8%B1%DA%AF%D8%A7%D9%87-%D9%BE%D8%B1%D8%AF%D8%A7%D8%AE%D8%AA-%D8%A7%DB%8C%D9%86%D8%AA%D8%B1%D9%86%D8%AA%DB%8C/", "Zarinpal blog: internet payment cap 1405 (400M Toman/day/person, 200M/card)", SS),
    "S13": _s("https://www.zoomit.ir/howto/463880-iran-bank-cards-money-transfer-limit/", "Zoomit: card-to-card and bank transaction caps 1405", SS),
    "S14": _s("https://fararu.com/fa/news/978296/%D8%B3%D9%82%D9%81-%D8%AA%D8%B1%D8%A7%DA%A9%D9%86%D8%B4-%D8%A8%D8%A7%D9%86%DA%A9%DB%8C-1405", "Fararu: bank transaction caps 1405 (c2c, Satna, Paya, Pol)", SS),
    "S15": _s("https://www.jamaran.news/%D8%A8%D8%AE%D8%B4-%D8%A7%D9%82%D8%AA%D8%B5%D8%A7%D8%AF-13/1720067-%D8%B3%D9%82%D9%81-%DA%A9%D8%A7%D8%B1%D8%AA-%D8%A8%D9%87-%DA%A9%D8%A7%D8%B1%D8%AA-%DA%A9%D8%A7%D8%B1%D8%AA%D8%AE%D9%88%D8%A7%D9%86-%D8%AF%D8%B1-%D8%B3%D8%A7%D9%84-%DA%86%D9%82%D8%AF%D8%B1-%D8%A7%D8%B3%D8%AA", "Jamaran: card-to-card and POS caps 1405", SS),
    "S16": _s("https://nabzgheymat.ir/%D8%B3%D9%82%D9%81-%D8%AA%D8%B1%D8%A7%DA%A9%D9%86%D8%B4%D9%87%D8%A7%DB%8C-%D8%A8%D8%A7%D9%86%DA%A9%DB%8C-%D8%AF%D8%B1-%DB%B1%DB%B4%DB%B0%DB%B5-%DA%86%D9%82%D8%AF%D8%B1-%D8%A7%D8%B3%D8%AA/", "Nabzgheymat: bank transaction caps 1405 - c2c 15M Toman to 400M purchase", SS),
    "S17": _s("https://www.eghtesadnews.com/%D8%A8%D8%AE%D8%B4-%D8%A7%D8%AE%D8%A8%D8%A7%D8%B1-%D8%A7%D9%82%D8%AA%D8%B5%D8%A7%D8%AF%DB%8C-67/790333-%D8%B3%D9%82%D9%81-%D8%A7%D9%86%D9%88%D8%A7%D8%B9-%D8%AA%D8%B1%D8%A7%DA%A9%D9%86%D8%B4-%D8%A8%D8%A7%D9%86%DA%A9%DB%8C-%D8%AF%D8%B1-%D8%B3%D8%A7%D9%84-%D8%AC%D8%AF%D9%88%D9%84", "Eghtesadnews: table of bank transaction caps 1405", SS),
    "S18": _s("https://www.zarinpal.com/blog/?p=5947", "Zarinpal blog: fee-system reform circular effective 4 Tir 1402", SS),
    "S19": _s("https://www.zoomit.ir/tech-iran/406506-receiving-fees-from-purchase-transactions/", "Zoomit: fee on purchase transactions starts tomorrow", SS),
    "S20": _s("https://ecoiran.com/fa/tiny/news-38727", "Ecoiran: fee reform for POS and internet gateways", SS),
    "S21": _s("https://www.eghtesadnews.com/%D8%A8%D8%AE%D8%B4-%D8%A7%D8%AE%D8%A8%D8%A7%D8%B1-%D8%A7%D9%82%D8%AA%D8%B5%D8%A7%D8%AF%DB%8C-67/583952-%D8%A7%D8%AE%D8%B0-%DA%A9%D8%A7%D8%B1%D9%85%D8%B2%D8%AF-%D8%A7%D8%B2-%D8%AA%D8%B1%D8%A7%DA%A9%D9%86%D8%B4-%D9%87%D8%A7%DB%8C-%D8%A7%DB%8C%D9%86-%D8%A7%D8%B5%D9%86%D8%A7%D9%81-%D8%AD%D8%B0%D9%81-%D8%B4%D8%AF", "Eghtesadnews: fee removed for some guilds", SS),
    "S22": _s("https://iranbroker.net/?p=200635", "Iranbroker: Paya settlement hours change from Thursday 19 Tir", SS),
    "S23": _s("https://bankavl.com/%D8%A8%D8%AE%D8%B4-%D8%A7%D8%AE%D8%A8%D8%A7%D8%B1-2/50674-%D8%B3%D8%A7%D8%B9%D8%AA-%D8%AA%D8%B3%D9%88%DB%8C%D9%87-%D8%B3%D8%A7%D9%85%D8%A7%D9%86%D9%87-%D9%BE%D8%A7%DB%8C%D8%A7-%D8%AA%D8%BA%DB%8C%DB%8C%D8%B1-%DA%A9%D8%B1%D8%AF", "Bankavl: Paya settlement hours changed", SS),
    "S24": _s("https://www.etemadonline.com/%D8%A8%D8%AE%D8%B4-%D8%A7%D9%82%D8%AA%D8%B5%D8%A7%D8%AF%DB%8C-22/552925-%D8%B3%D8%A7%D8%B9%D8%AA-%DA%A9%D8%A7%D8%B1%DB%8C-%D8%B3%D8%A7%D8%AA%D9%86%D8%A7-%D8%A7%D9%81%D8%B2%D8%A7%DB%8C%D8%B4-%DB%8C%D8%A7%D9%81%D8%AA", "Etemad: Satna working hours", SS),
    "S25": _s("https://digiato.com/promoted/a-complete-look-at-payment-gateways-in-iran-why-to-choose-zibal", "Digiato (sponsored): Zibal gateway - settlement, fee modes, documents", SS),
    "S26": _s("https://www.rade.ir/ipg/703615-%D9%88%D9%86%D8%AF%D8%A7%D8%B1/", "Rade.ir listing: Vandar payment-yar (settlement up to 39x/day)", SS),
    "S27": _s("https://docs.nextpay.world/guide/nextpay/getting-started/requirements", "NextPay docs: requirements / business types", SS),
    "S28": _s("https://www.zarinpal.com/landing/asanpardakht/", "Zarinpal landing: Asan Pardakht (AP) gateway + 5 other IPGs via one integration", SS),
    "S29": _s("https://www.mahaksoft.com/89985/bank-transaction-tax/", "Mahaksoft and other tax-advice pages: bank-transaction tax criteria (100 deposits/month, 35M Toman)", SS),
    "S30": _s("https://arzdigital.com/blog/report-iran-crypto-exchanges-blocked/", "ArzDigital: CBI orders account blocking of crypto platforms and payment-yars", SS),
    "S31": _s("https://ka.wordpress.org/plugins/?p=285839", "WebDide Card-to-Card Payment Verification for Shetab (unique tail 1-999 Toman, SMS-reading app)", SS),
    "S32": _s("https://python-bale-bot.readthedocs.io/en/latest/examples.invoice.html", "python-bale-bot docs: invoice example", SS),
    "S33": _s("https://vec.wordpress.org/plugins/?p=356754", "Melalweb Pay with Bale for WooCommerce (sendInvoice -> pre_checkout_query -> successful_payment)", SS),
    "S34": _s("https://docs.bale.ai/miniapp", "Bale docs: mini apps (window.Bale.WebApp, initData) - title/summary only", SS),
    "S35": _s("https://www.zarinpal.com/docs/sdk/python/method/verify", "Zarinpal docs: verify (v4 verify.json, codes 100/101)", SS),
    "S36": _s("https://bankavl.com/%D8%A8%D8%AE%D8%B4-%D8%A7%D8%AE%D8%A8%D8%A7%D8%B1-2/62096-%D9%87%D8%B4%D8%AF%D8%A7%D8%B1-%D9%BE%D9%84%DB%8C%D8%B3-%D8%AD%D8%B3%D8%A7%D8%A8-%D8%AA%D8%A7%D9%86-%D9%85%D9%85%DA%A9%D9%86-%D8%A7%D8%B3%D8%AA-%DB%8C%DA%A9-%D8%B4%D8%A8%D9%87-%D9%85%D8%B3%D8%AF%D9%88%D8%AF-%D8%B4%D9%88%D8%AF", "Bankavl: police warning - account may be blocked overnight", SS),
    "BP": _s("docs/business-plan-full-context.md", "Round-0 business plan section 5 (collection) and 4.1 (USDT rate 2026-10-02)", "local file"),
    # ---- package sources (P) ----
    "P1": _s("https://www.npmjs.com/package/zarinpal-node-sdk/v/2.2.0", "zarinpal-node-sdk 2.2.0 (2025-07-01), README says official", PK),
    "P2": _s("https://www.npmjs.com/package/zarinpal-checkout/v/1.1.1", "zarinpal-checkout 1.1.1 (2026-07-11)", PK),
    "P3": _s("https://www.npmjs.com/package/irpayments/v/1.97.0", "irpayments 1.97.0 (2026-07-08): Zarinpal/Zibal/IDPay drivers + Persian error maps", PK),
    "P4": _s("https://www.npmjs.com/package/zibal/v/2.0.0", "zibal 2.0.0 (2026-08-22)", PK),
    "P5": _s("https://www.npmjs.com/package/ipg-node/v/1.2.2", "ipg-node 1.2.2 (2022-06-01): Mellat / Melli(Sadad) / Saderat(Sepehr) / NextPay", PK),
    "P6": _s("https://www.npmjs.com/package/pec-payment-sdk/v/1.1.2", "pec-payment-sdk 1.1.2 (2026-06-01): Parsian PEC SOAP services", PK),
    "P7": _s("https://www.npmjs.com/package/payir-v2/v/1.2.1", "payir-v2 1.2.1 (2021-07-18): Pay.ir REST", PK),
    "P8": _s("https://pypi.org/project/nextpay/1.0.0/", "nextpay 1.0.0 (2022-08-26)", PK),
    "P9": _s("https://www.npmjs.com/package/idpay-node/v/1.0.81", "idpay-node 1.0.81 (2021-08-29)", PK),
    "P10": _s("https://www.npmjs.com/package/node-jibit/v/1.0.8", "node-jibit 1.0.8 (2023-02-28)", PK),
    "P11": _s("https://pypi.org/project/jibit/1.2.4/", "jibit 1.2.4 (2025-10-14)", PK),
    "P12": _s("https://www.npmjs.com/package/finnotech-client-sdk/v/1.1.2", "finnotech-client-sdk 1.1.2 (2023-06-07)", PK),
    "P13": _s("https://www.npmjs.com/package/finnotech-js/v/1.0.0", "finnotech-js 1.0.0 (2024-01-31)", PK),
    "P14": _s("https://www.npmjs.com/package/@alikhangholi/iran-sms/v/1.0.2", "@alikhangholi/iran-sms 1.0.2 (2026-06-06): Kavenegar / SMS.ir / FarazSMS / Ghasedak", PK),
    "P15": _s("https://www.npmjs.com/package/kavenegar/v/1.1.4", "kavenegar 1.1.4 (2018-10-06)", PK),
    "P16": _s("https://pypi.org/project/melipayamak/1.0.1/", "melipayamak 1.0.1 (2024-11-16) + npm melipayamak-api-ts 2.0.3", PK),
    "P17": _s("https://pypi.org/project/python-bale-bot/2.5.0/", "python-bale-bot 2.5.0 (2024-01-22)", PK),
    "P18": _s("https://pypi.org/project/baleio/0.1.0/", "baleio 0.1.0 (2026-07-06)", PK),
    "P19": _s("https://pypi.org/project/pyrobale/0.7.0/", "pyrobale 0.7.0 (2026-06-24)", PK),
    "P20": _s("https://www.npmjs.com/package/balebaazoo/v/1.4.1", "balebaazoo 1.4.1 (2026-06-29)", PK),
    "P21": _s("https://pypi.org/project/rubika-bot-api/1.2.0/", "rubika-bot-api 1.2.0 (2025-11-11)", PK),
    "P22": _s("https://pypi.org/project/eitaapy/1.2.0/", "eitaapy 1.2.0 (2025-02-11)", PK),
    "P23": _s("https://www.npmjs.com/package/trongrid/v/1.2.6", "trongrid 1.2.6 (2020-03-17)", PK),
    "P24": _s("https://pypi.org/project/tronpy/0.6.2/", "tronpy 0.6.2 (2026-01-08)", PK),
    "P25": _s("https://www.npmjs.com/package/trongrid-cli/v/0.1.2", "trongrid-cli 0.1.2 (2026-04-20)", PK),
    "P26": _s("https://pypi.org/project/pytonapi/2.3.0/", "pytonapi 2.3.0 (2026-09-20)", PK),
    "P27": _s("https://www.npmjs.com/package/moadian/v/1.0.5", "moadian 1.0.5 (2025-07-19)", PK),
    "P28": _s("https://www.npmjs.com/package/taxapi/v/1.1.0", "taxapi 1.1.0 (2024-06-02)", PK),
    "P29": _s("https://www.npmjs.com/package/@gitmyabi/chainalysis-sanctions-oracle/v/1.0.0", "@gitmyabi/chainalysis-sanctions-oracle 1.0.0 (build id contains 40c57923)", PK),
    "P30": _s("https://pypi.org/project/ccxt/", "ccxt (gate.py / coinex.py / weex.py sample responses list USDT contract addresses)", PK),
    "P31": _s("https://www.npmjs.com/package/tronzap-sdk/v/1.0.4", "tronzap-sdk 1.0.4 (2025-06-28): TRON energy rental API", PK),
    "P32": _s("https://pypi.org/project/aioetherscan/0.9.4/", "aioetherscan 0.9.4 (2024-06-20): Etherscan V1-style URL builder (bscscan.com)", PK),
    "P33": _s("https://www.npmjs.com/package/etherscan-api/v/12.2.0", "etherscan-api 12.2.0 (2026-09-27): README says Etherscan V1 deprecated 2025-08-15; V2 single base URL + chainid; bsc = 56; one key for all chains", PK),
    "P35": _s("https://www.npmjs.com/package/easypay.js/v/1.0.15", "easypay.js 1.0.15 (2025-08-21): Zarinpal/IDPay/Zibal/PayStar drivers; callback reads Status and Authority query params", PK),
    "P36": _s("https://www.npmjs.com/package/bale-otp/v/1.0.0", "bale-otp 1.0.0 (2025-06-27, unofficial): Bale Safir OTP API (safir.bale.ai/api/v2/auth/token and /send_otp)", PK),
    "P34": _s("https://www.npmjs.com/package/@n4mchun/etherscan-sdk/v/0.1.0", "@n4mchun/etherscan-sdk 0.1.0 (2026-02-03): V2 base https://api.etherscan.io/v2/api, ChainId.BNB = 56, default client rate limit 5 req/s", PK),
}


def S(k):
    return dict(SRC[k])


def R(value, unit=None, conf="medium", src=(), verify=None, status=None, note=None, as_of=AS_OF):
    d = {"value": value}
    if unit:
        d["unit"] = unit
    d["as_of"] = as_of
    d["confidence"] = conf
    if src:
        d["sources"] = [S(k) for k in src]
    if verify:
        d["verify_how"] = verify
    if status:
        d["status"] = status
    if note:
        d["note"] = note
    return d


def U(verify, unit=None, note=None, value=None):
    """Unknown / not verified in this run."""
    return R(value, unit, "low", (), verify, "UNVERIFIED", note)


# --------------------------------------------------------------------------------------------------------------
# data/gateways.json
# --------------------------------------------------------------------------------------------------------------
ZP_ERRORS = {
    "-9": "validation error", "-10": "IP or merchant code invalid", "-11": "merchant code inactive",
    "-12": "too many attempts in a short window", "-13": "transaction-limit error (complete documents with support)",
    "-14": "callback URL domain differs from the registered gateway domain", "-15": "gateway suspended",
    "-16": "merchant level below Silver", "-17": "merchant restricted at Blue level", "-18": "dedicated gateway code cannot be used on this site",
    "-19": "cannot create transaction for this terminal", "-21": "no financial operation found for this transaction",
    "-22": "transaction unsuccessful", "-30": "merchant not allowed floating shared settlement", "-31": "add a settlement bank account / wrong split values",
    "-32": "split amount larger than total", "-33": "split percentages wrong", "-34": "split amount larger than total",
    "-35": "too many split receivers", "-36": "minimum split amount 10,000 Rial", "-37": "one or more split IBANs inactive at bank",
    "-38": "IBAN not defined correctly, retry", "-39": "unknown error - contact support", "-40": "invalid extra params (expire_in)",
    "-41": "maximum payment is 100 million Toman", "-42": "payment-id lifetime must be between 30 minutes and 45 days",
    "-50": "paid amount differs from the amount sent to verify", "-51": "payment failed", "-52": "unexpected error",
    "-53": "payment does not belong to this merchant code", "-54": "invalid authority", "-55": "transaction not found",
    "-60": "reversal with the bank not possible", "-61": "transaction not successful or already reversed",
    "-62": "gateway IP not set", "-63": "30-minute reversal window expired", "100": "success", "101": "already verified",
}
ZIBAL_RESULTS = {
    "100": "success", "102": "merchant not found", "103": "merchant inactive / contract not signed", "104": "merchant invalid",
    "105": "amount must be above the minimum (> 1,000 Rial)", "106": "callbackUrl invalid (must start with http/https)",
    "107": "percentMode invalid (0 or 1)", "108": "one or more beneficiaries in multiplexingInfos invalid", "109": "one or more beneficiaries inactive",
    "110": "id=self missing in multiplexingInfos", "111": "amount differs from the sum of shares", "112": "fee wallet balance insufficient",
    "113": "amount above the maximum transaction ceiling", "114": "national code invalid", "115": "requester IP not registered in the panel",
    "116": "feeMode invalid", "140": "callbackUrl missing", "201": "already verified", "202": "order unpaid or failed", "203": "trackId invalid",
}
ZIBAL_STATUS = {
    "-1": "awaiting payment", "-2": "internal error", "1": "paid and verified", "2": "paid, not verified", "3": "cancelled by user",
    "4": "invalid card number", "5": "insufficient balance", "6": "wrong PIN", "7": "too many requests", "8": "daily internet-payment count exceeded",
    "9": "daily internet-payment amount exceeded", "10": "invalid card issuer", "11": "switch error", "12": "card unavailable",
    "15": "refunded", "16": "refunding", "18": "reversed", "21": "invalid merchant",
}
IDPAY_ERRORS = {
    "11": "user blocked", "12": "API key not found", "13": "request IP does not match registered IPs", "14": "web service under review / not approved",
    "21": "bank account of the web service not verified", "22": "web service not found", "23": "web-service authentication failed",
    "24": "bank account of the web service disabled", "31": "id must not be empty", "32": "order_id must not be empty", "33": "amount must not be empty",
    "34": "amount below minimum", "35": "amount above maximum", "36": "amount above allowed limit", "37": "callback must not be empty",
    "38": "callback domain differs from the registered domain", "51": "transaction not created", "52": "inquiry returned nothing",
    "53": "payment verification impossible", "54": "payment verification window elapsed",
}
IDPAY_STATUS = {
    "1": "payment not made (created)", "2": "payment failed", "3": "error", "4": "blocked", "5": "returned to payer", "6": "reversed by system",
    "7": "cancelled by user", "8": "moved to payment gateway", "10": "awaiting payment verification", "100": "payment verified",
    "101": "payment verified earlier", "200": "settled to the receiver",
}
MELLAT_CODES = {
    "0": "success", "11": "invalid card number", "12": "insufficient funds", "13": "wrong PIN", "14": "PIN attempts exceeded", "15": "invalid card",
    "16": "withdrawal count exceeded", "17": "user cancelled", "18": "card expired", "19": "withdrawal amount exceeded", "21": "invalid merchant",
    "23": "security error", "24": "invalid merchant credentials", "25": "invalid amount", "31": "invalid response", "32": "invalid data format",
    "33": "invalid account", "34": "system error", "35": "invalid date", "41": "duplicate request (order id)", "42": "sale transaction not found",
    "43": "verify already requested", "44": "verify request not found", "45": "transaction already settled", "46": "transaction not settled",
    "47": "settle transaction not found", "48": "transaction already reversed", "51": "duplicate transaction", "54": "reference transaction missing",
    "55": "invalid transaction", "61": "deposit error", "62": "return path outside the merchant's registered domain",
    "111": "invalid card issuer", "112": "issuer switch error", "113": "no response from issuer", "114": "cardholder not allowed this transaction", "421": "invalid IP",
}

gateways = {
    "_meta": {
        "file": "gateways.json",
        "owner_agent": "03-ir-payments-collection",
        "as_of": AS_OF,
        "purpose": "Iranian internet payment gateways (IPG): eligibility, prohibited categories, fees, limits, settlement, API contracts, risks. Source of truth for packages/live gateway adapters, the pricing engine fee model and the simulator.",
        "amount_units_legend": {
            "IRR": "Rial. 1 Toman = 10 Rial. Most Shaparak-era APIs (Zibal, IDPay, Pay.ir, Mellat, Parsian, Bale) want Rial.",
            "IRT": "Toman (the unit shown to Iranian customers). Zarinpal v4 accepts a `currency` field = IRT|IRR.",
        },
        "evidence_note": "WebSearch budget (200/session, shared across agents) ran out after 29 searches of this agent; API shapes below come mostly from SDK packages read directly. Perishable numbers (fees, caps) are secondary-source and must be re-checked.",
        "do_not_do": [
            "Do not misdescribe the merchant category to a PSP/payment-yar to get approved.",
            "Do not use borrowed/rented merchant codes, third-party terminals or someone else's Enamad.",
            "Do not split an order across several payments to dodge per-transaction or per-card caps.",
        ],
    },
    "landscape": {
        "licensing_model": R(
            "Three layers: (1) Shaparak (CBI network operator) + bank-owned PSPs (Sep/Saman Kish, Behpardakht Mellat, Parsian PEC, Sadad Melli, Sepehr Saderat, Asan Pardakht, Pasargad, Iran Kish) that issue direct gateways; (2) payment-yars (Zarinpal, IDPay, Zibal, NextPay, Vandar, Pay.ir, Shepa, Paystar, ParsPal, RayanPay, SizPay ...) that resell PSP gateways to small merchants through a single API; (3) merchants (us).",
            None, "medium", ("S4", "S28", "S36"), status="reported",
            verify="Shaparak registry (shaparak.ir) lists licensed PSPs and payment-yars; rade.ir/ipg lists payment-yars. Confirm the exact licence status of the chosen gateway before signing."),
        "cbi_directive_exchanges_use_psp": R(
            "CBI crypto-market directive ('ساماندهی و نظارت بر بازار رمزارزها'): crypto exchanges/platforms must take payment gateways directly from banks or PSPs, not from payment-yars. Re-opening of gateways for exchanges was made conditional on 10 conditions.",
            None, "low", ("S4", "S6", "S8", "S9"), status="reported",
            note="Year/month not visible in the search summaries (probably 2024-2025). Applies to crypto exchanges; our product must not look like an exchange.",
            verify="Open the Zoomit/ArzDigital articles, note the circular number and date; ask the legal specialist (04) whether a USDT-funded reseller falls under 'platform providing digital-currency services'."),
        "shaparak_cut_notice": R(
            "Shaparak letter to payment-yars/PSPs: immediately cut e-payment services to merchants selling goods/services contrary to Iranian law and CBI requirements - examples named: crypto sales, VPN sales, betting/gambling sites.",
            None, "medium", ("S5",), status="reported",
            verify="Ask the payment-yar support for the written prohibited-activity list (لیست اصناف ممنوعه) before onboarding; keep the reply."),
        "inter_payment_yar_transfer_ban": R(
            "CBI ordered Shaparak to ban fund transfers inside/between payment-yars and wallet services outside the e-money-wallet issuing rules.",
            None, "low", ("S11",), status="reported",
            note="Implication: do not build a customer stored-value wallet on top of a payment-yar; stored balances can be seen as unlicensed e-money. Escalate to 04-legal.",
            verify="Open Zoomit 388644; confirm date and exact scope with the legal specialist."),
        "closures_dey_1404_1405": U(
            "Search for 'Dey 1404 / Dey 1405 gateway closure crypto' with a quota that allows extended mode; check Zarinpal/IDPay/Zibal status pages and Telegram channels.",
            note="Searches in this run returned a pattern of recurring Shaparak/CBI cuts against exchange gateways (S4-S11, dates not visible), but NO confirmation of a specific Dey 1404 or 1405 event. Not claimed."),
    },
    "common": {
        "shaparak_fee_floor_1402": R(
            {"purchase_below_6m_rial_fixed_rial": 1200, "purchase_from_6m_rial_pct": 0.02, "cap_rial": 40000, "effective": "2023-06-25 (4 Tir 1402)", "applies_to": "POS and internet gateways; some guilds exempt"},
            "IRR", "medium", ("S18", "S19", "S20", "S21"), status="reported",
            note="Equivalent in Toman: 120 fixed below 600,000; 0.02% above, capped at 4,000. Treated as the regulated floor a direct bank gateway pays. Payment-yars add their own margin on top (see gateways.*.fees).",
            verify="Open Zarinpal blog p=5947 and the CBI circular (Ordibehesht 1402); ask the PSP for the fee schedule in the contract."),
        "paya_cycles": R(
            {"cycles_hhmm": ["03:45", "09:45", "12:45", "18:45"], "holiday_single_cycle_hhmm": "03:45", "changed_from": "Thursday 19 Tir (year not visible; likely 1404 = 2025-07-10)"},
            None, "low", ("S22", "S23", "S24"), status="reported",
            note="Cycle hours changed more than once; the year of 'Thursday 19 Tir' is not visible in the summary (1404 = 2025-07-10 is the most recent year in which 19 Tir fell on a Thursday; 1399 also did). Satna customer-to-customer orders accepted until 14:30 (13:30 on Thursdays, interbank settlement 14:00 on Thursdays).",
            verify="Check CBI/Shetab announcements (bankavl.com, iranbroker.net) for the current Paya/Satna table; re-read before promising settlement times to customers or the treasury module."),
        "iran_weekend_note": R("Friday is weekend; Thursday is a short banking day for Satna; official holidays have a single Paya cycle. Card payments and card-to-card are 24/7.",
                               None, "medium", ("S22", "S24"), status="reported"),
        "caps_1405": {
            "card_to_card_per_card_per_day": R(15000000, "IRT", "high", ("S13", "S14", "S15", "S16", "S17"), status="reported",
                                               note="Raised from 10M to 15M Toman in 1405 per press; secondary sources only (no CBI circular text seen).",
                                               verify="Open the CBI/Shaparak circular on 1405 limits or the sender bank's app limits screen."),
            "internet_purchase_per_person_per_day": R(400000000, "IRT", "medium", ("S12", "S16"), status="reported",
                                                      note="Sum over all cards of one natural person."),
            "internet_purchase_per_card_per_day": R(200000000, "IRT", "low", ("S12",), status="reported", note="Single source."),
        },
    },
    "gateways": {},
}

G = gateways["gateways"]

G["zarinpal"] = {
    "name_fa": "زرین‌پال", "name_en": "Zarinpal", "kind": "payment_yar (single API over 6 bank/PSP gateways)", "website": "https://www.zarinpal.com",
    "risk_label": "high",
    "restriction_note": "Terms (updated 8 Tir 1404) follow CBI/Shaparak rules; currency/crypto trading is not allowed. A USDT-funded virtual-card/top-up reseller can be classified as currency-related -> gateway cut or funds held. Medium risk only if the merchant is accepted as a pure digital-subscription seller.",
    "eligibility": {
        "enamad": U("Read zarinpal.com/blog/?p=5744 (Enamad guide for Zarinpal merchants) and ask support if a gateway is possible without Enamad.",
                    note="Zarinpal publishes both an Enamad guide for its merchants and an article 'gateway without Enamad - possible?'; answers not seen."),
        "merchant_levels": R("levels named in error texts: 'Silver' (minimum for some operations, -4/-16) and 'Blue' (restricted, -17)", None, "low", ("P3",), status="reported",
                             note="Only names seen; the ladder, per-level limits and upgrade documents are not verified.",
                             verify="Zarinpal panel -> terminal -> level; ask support for per-level limits."),
        "documents": U("Zarinpal panel onboarding checklist (identity, bank account/IBAN in the owner's name, business licence if any, Enamad)."),
    },
    "prohibited_categories": R(
        ["buying/selling currency or crypto-currency (per round-0 research of the terms)", "VPN sales", "betting/gambling", "anything contrary to Iranian law and CBI/Shaparak rules"],
        None, "low", ("S3", "S5", "BP"), status="reported",
        note="Gift cards / virtual cards / USDT-backed top-ups are NOT named in what we saw -> UNVERIFIED classification risk.",
        verify="Read https://www.zarinpal.com/terms in a browser (updated 8 Tir 1404) and describe the product accurately and ask support in writing whether 'prepaid virtual cards, top-ups and digital subscriptions for online services, priced in Toman, with foreign suppliers' is allowed; keep the answer."),
    "fees": {
        "percent": R(0.5, "pct", "low", ("S1", "BP"), status="reported", note="0.5% per transaction; an older page shows a different scheme (0.05% cap 12,000) that is outdated. Single secondary source.",
                     verify="POST /pg/v4/payment/feeCalculation.json {merchant_id, amount, currency} returns the exact fee and fee_type (Merchant|Payer) - use it at runtime; or read zarinpal.com/pricing."),
        "cap_toman": R(16000, "IRT", "low", ("S1", "BP"), status="reported", verify="feeCalculation.json for a 100,000,000 Toman amount."),
        "fixed_toman": R(500, "IRT", "low", ("S1", "BP"), status="reported", verify="feeCalculation.json for a 10,000 Toman amount."),
        "formula": R("fee = min(0.5% x amount, 16,000 Toman) + 500 Toman", "IRT", "low", ("S1", "BP"), status="reported"),
        "fee_payer_modes": R(["Merchant", "Payer"], None, "medium", ("P1",), status="reported", note="feeCalculation response carries fee_type; payer-pays mode implies a fee line shown to the customer."),
        "promotions": R("first-month zero commission; 'golden Tuesday' zero commission for Zarin-card holders", None, "low", ("S1",), status="reported", note="Promos - never model them."),
        "vat_on_fee": U("Check the PSP invoice / 04-legal for VAT on service fees (rate for 1405).", note="Not verified; fee-stack script shows VAT 9/10/12% as sensitivity only."),
        "instant_settlement_fee": U("Zarinpal panel -> settlement -> instant (تسویه آنی) tariff.", unit="pct"),
    },
    "limits": {
        "min_amount": R(1000, "as passed in `amount` (IRR by default; IRT if currency=IRT)", "medium", ("P1", "P3"), status="reported", note="SDK validator: amount >= 1000. Unit ambiguity -> always send currency explicitly."),
        "max_single_payment": R(100000000, "IRT", "medium", ("P3",), status="reported", note="Error -41 text: maximum payment is 100 million Toman."),
        "authority_lifetime": R({"min": "30 minutes", "max": "45 days"}, None, "medium", ("P3", "P2"), status="reported", note="-42 text; refresh.json extends an authority (expire param)."),
        "reversal_window": R("30 minutes", None, "medium", ("P3", "P1"), status="reported", note="-63: reversal window expired after 30 minutes; reverse.json{authority}."),
    },
    "settlement": {
        "standard_cycle": U("Zarinpal panel -> settlement policy; ask support: T+? business days, Paya cycle times, Friday/holiday handling, daily cap.", note="Not seen in this run."),
        "refund_methods": R(["PAYA", "CARD"], None, "medium", ("P1",), status="reported", note="GraphQL AddRefund method enum; reasons CUSTOMER_REQUEST|DUPLICATE_TRANSACTION|SUSPICIOUS_TRANSACTION|OTHER."),
    },
    "api": {
        "base_url_production": R("https://payment.zarinpal.com", None, "high", ("P1", "P2", "P3", "S35"), status="reported"),
        "base_url_sandbox": R("https://sandbox.zarinpal.com", None, "high", ("P1", "P2", "P3"), status="reported"),
        "graphql_url": R("https://next.zarinpal.com/api/v4/graphql/ (Bearer accessToken) - refunds, transaction lists", None, "medium", ("P1",), status="reported"),
        "endpoints": R({
            "request": "POST /pg/v4/payment/request.json {merchant_id, amount, currency?, callback_url, description, mobile?, email?, cardPan?[16-digit, string|array], referrer_id?} -> data.authority",
            "redirect": "GET /pg/StartPay/{authority}",
            "verify": "POST /pg/v4/payment/verify.json {merchant_id, amount, authority} -> code 100 ok / 101 already verified; amount must equal the amount from YOUR database",
            "inquiry": "POST /pg/v4/payment/inquiry.json {merchant_id, authority}",
            "reverse": "POST /pg/v4/payment/reverse.json {merchant_id, authority} (30-minute window)",
            "unverified": "POST /pg/v4/payment/unVerified.json {merchant_id}",
            "fee_calculation": "POST /pg/v4/payment/feeCalculation.json {merchant_id, amount, currency?} -> {fee, fee_type}",
            "refresh_authority": "POST /pg/v4/payment/refresh.json {merchant_id, authority, expire}",
            "refund": "GraphQL mutation AddRefund(session_id, amount, description?, method: PAYA|CARD, reason?)",
        }, None, "high", ("P1", "P2", "P3"), status="reported",
            note="SDK sends mobile/email top-level; the public docs may expect them inside a metadata object - test in the sandbox."),
        "callback": R("GET callback_url?Authority=A...&Status=OK|NOK ; never trust the query: call verify.json with the stored amount", None, "medium", ("P35", "S35"), status="reported",
                      note="Authority regex ^[AS][0-9a-zA-Z]{35}$ (SDK validator); merchant_id is a UUID."),
        "response_shape": R({"data": {"code": "int", "message": "str", "authority": "str", "fee_type": "Merchant|Payer", "fee": "int"}, "errors": "array"}, None, "medium", ("P1",), status="reported"),
        "amount_unit": R("currency param IRT|IRR (SDK default IRR for feeCalculation; zarinpal-checkout wrapper defaults to IRT)", None, "medium", ("P1", "P2"), status="reported", note="Always send currency explicitly; reconcile in integer Rial internally."),
        "error_codes": R(ZP_ERRORS, None, "medium", ("P3",), status="reported", note="English paraphrase of the Persian map in irpayments 1.97.0."),
        "card_binding": R("`cardPan` restricts the payment to given card number(s) - lawful payer-ownership control against third-party-victim (triangular) fraud", None, "medium", ("P1",), status="reported"),
        "ip_whitelist": R("IP-based check exists (-10 'IP or merchant code invalid'); how to configure is not verified", None, "low", ("P3",), status="reported", verify="Zarinpal panel -> terminal settings."),
        "rate_limits": U("Ask support / read docs; error -12 means too many attempts in a short window."),
    },
    "disputes": R("Reverse within 30 minutes via reverse.json; later refunds via GraphQL AddRefund (PAYA or CARD). Customer complaints go through the bank's/Shaparak complaint channels; dispute SLA not verified.", None, "low", ("P1", "P3"), status="reported",
                  verify="Zarinpal support -> 'refund / dispute' policy page; ask for typical refund time and fees."),
}

G["idpay"] = {
    "name_fa": "آیدی‌پی", "name_en": "IDPay", "kind": "payment_yar", "website": "https://idpay.ir",
    "risk_label": "high",
    "restriction_note": "Same Shaparak/CBI regime as other payment-yars; prohibited-activity list not seen; classification risk for currency-related merchants.",
    "eligibility": {"documents": U("idpay.ir onboarding checklist; ask whether Enamad is mandatory.")},
    "prohibited_categories": U("Ask IDPay support for the written prohibited-activity list.", note="No content seen in this run."),
    "fees": {"schedule": U("idpay.ir pricing page (percent, cap, fixed, settlement fee).", unit="pct")},
    "limits": {
        "min_max_amount": R("returned in error texts 34/35 as {min-amount}/{max-amount} Rial (account dependent)", "IRR", "low", ("P3",), status="reported"),
        "verify_window": R("Verify must happen soon after payment: error 54 = verification window elapsed", None, "medium", ("P3",), status="reported"),
    },
    "settlement": {"cycle": U("IDPay panel -> settlement; ask support.")},
    "api": {
        "base_url": R("https://api.idpay.ir/v1.1", None, "high", ("P3", "P9"), status="reported"),
        "headers": R({"X-API-KEY": "<key>", "X-SANDBOX": "1 for sandbox, 0 for production"}, None, "high", ("P3",), status="reported"),
        "endpoints": R({
            "create": "POST /payment {order_id, amount (Rial), name?, phone?, mail?, desc?, callback} -> {id, link}",
            "verify": "POST /payment/verify {id, order_id}",
            "inquiry": "POST /payment/inquiry {id, order_id}",
            "list": "POST /payment/transactions",
        }, None, "medium", ("P3", "P9"), status="reported"),
        "amount_unit": R("Rial", "IRR", "medium", ("P3",), status="reported", note="SDK passes amount unchanged; error texts speak of Rial."),
        "statuses": R(IDPAY_STATUS, None, "medium", ("P3",), status="reported", note="Meanings per irpayments mapping (100/101/200 success, 10 awaiting verify)."),
        "error_codes": R(IDPAY_ERRORS, None, "medium", ("P3",), status="reported", note="HTTP 4xx with error_code; English paraphrase."),
        "ip_whitelist": R("Request IP must match the IPs registered for the web service (error 13); callback domain must match the registered domain (38)", None, "medium", ("P3",), status="reported"),
        "callback": R("Redirect with status, track_id, id, order_id (POST/GET) - always call verify; do not trust callback fields", None, "low", ("P3",), status="reported", verify="IDPay docs 'callback' section."),
    },
}

G["zibal"] = {
    "name_fa": "زیبال", "name_en": "Zibal", "kind": "payment_yar (official CBI payment-yar per vendor copy)", "website": "https://zibal.ir",
    "risk_label": "high",
    "restriction_note": "Vendor copy says it is an official CBI payment-yar; prohibited-activity list not seen. Docs require Enamad and tax-file information, so the owner must be a documented business.",
    "eligibility": {
        "documents": R(["new national card", "birth certificate", "mobile number in the applicant's name", "valid Enamad", "tax file (stage 4 wording unclear)"], None, "low", ("S25",), status="reported",
                       note="Sponsored article; verify on zibal.ir.", verify="Zibal panel onboarding checklist."),
    },
    "prohibited_categories": U("Ask Zibal support for the written list."),
    "fees": {
        "modes": R(["payer pays on top of the amount", "deducted from the transaction"], None, "low", ("S25",), status="reported", note="API param feeMode exists (error 116 = invalid feeMode)."),
        "schedule": U("help.zibal.ir pricing or panel (percent, cap, fixed).", unit="pct"),
    },
    "limits": {
        "min_amount": R(1000, "IRR", "medium", ("P3", "P4"), status="reported", note="Result 105: amount must be greater than 1,000 Rial."),
        "max_amount": R("per-account ceiling; result 113", "IRR", "low", ("P3",), status="reported"),
        "min_settlement": R({"manual_toman": 1000, "automatic_toman": 10000}, "IRT", "low", ("S25",), status="reported"),
    },
    "settlement": {
        "cycle": R("Automatic daily: transactions up to 21:00 each night are settled on the next business morning", None, "low", ("S25",), status="reported", verify="Zibal panel -> settlement."),
    },
    "api": {
        "base_url": R("https://gateway.zibal.ir", None, "high", ("P3", "P4"), status="reported"),
        "endpoints": R({
            "request": "POST /v1/request {merchant, amount (Rial), callbackUrl, orderId?, mobile?, description?, allowedCards?[], checkMobileWithCard?, feeMode?, percentMode?, multiplexingInfos?[]} -> {result:100, trackId}",
            "redirect": "GET https://gateway.zibal.ir/start/{trackId}  (valid Referer header required by the gateway since SDK v2)",
            "verify": "POST /v1/verify {merchant, trackId} -> result 100 ok / 201 already verified; check returned amount and orderId against your DB",
            "inquiry": "POST /v1/inquiry {merchant, trackId}",
        }, None, "high", ("P3", "P4"), status="reported"),
        "sandbox": R("merchant = \"zibal\"", None, "high", ("P4",), status="reported"),
        "amount_unit": R("Rial", "IRR", "high", ("P3", "P4"), status="reported"),
        "result_codes": R(ZIBAL_RESULTS, None, "high", ("P3", "P4"), status="reported"),
        "status_codes": R(ZIBAL_STATUS, None, "medium", ("P4",), status="reported"),
        "card_binding": R("allowedCards[] and checkMobileWithCard restrict payment to the customer's own card/mobile (lawful payer-ownership control)", None, "medium", ("P3",), status="reported"),
        "ip_whitelist": R("Requester IP must be registered in the panel (result 115)", None, "medium", ("P3", "P4"), status="reported"),
        "rate_limits": U("help.zibal.ir."),
    },
}

G["nextpay"] = {
    "name_fa": "نکست‌پی", "name_en": "NextPay", "kind": "payment_yar", "website": "https://nextpay.org",
    "risk_label": "high", "restriction_note": "Same regime as other payment-yars; docs site publishes requirements/business-types pages (content not seen).",
    "eligibility": {"documents": R(["owner national card", "company registration number (companies)", "active bank account", "IBAN", "contact info"], None, "low", ("S27",), status="reported")},
    "fees": {
        "legacy_figure": R("1%, min 1 Toman, max 800 Toman", "IRT", "low", ("S27",), status="conflicting",
                           note="LEGACY. A cap of 800 Toman is incompatible with the 2023 Shaparak floor of up to 4,000 Toman per transaction -> treat as outdated; do not use in pricing.",
                           verify="NextPay panel/pricing page."),
    },
    "api": {
        "endpoints": R({"token": "POST https://nextpay.org/nx/gateway/token {api_key, order_id, amount, callback_uri}", "pay": "GET https://nextpay.org/nx/gateway/payment/{trans_id}",
                        "verify": "POST https://nextpay.org/nx/gateway/verify {api_key, trans_id, amount} -> code 0 = success"}, None, "medium", ("P5", "P8"), status="reported"),
        "amount_unit": U("NextPay docs: default currency and the currency param.", note="Python wrapper example passes '10000' as 'price of your product' (unit not stated)."),
        "error_codes": R("1000-series gateway errors (1011 duplicate order id, 1017 amount above merchant limit, 1029/1030 IP/domain not registered, 1031 timeout, 1032 card not allowed for this merchant, 1101 invalid amount, 1103 invalid token, 1104 invalid split info)", None, "low", ("P5",), status="reported"),
    },
}

G["vandar"] = {
    "name_fa": "وندار", "name_en": "Vandar", "kind": "payment_yar", "website": "https://vandar.io",
    "risk_label": "high", "restriction_note": "Same regime as other payment-yars.",
    "settlement": {"cycle": R("Up to 39 settlements per day at set hours, via Paya cycle or instant settlement", None, "low", ("S26",), status="reported", verify="Vandar panel -> settlement.")},
    "fees": {"modes": R("Merchant can choose who pays the fee; web-service gateway", None, "low", ("S26",), status="reported"), "schedule": U("vandar.io pricing.", unit="pct")},
    "api": {"endpoints": U("docs.vandar.io (IPG v3: send / verify / redirect).", note="No SDK for Vandar was found on npm/PyPI in this run; endpoints intentionally left null.")},
}

G["payir"] = {
    "name_fa": "پی‌دات‌آی‌آر", "name_en": "Pay.ir", "kind": "payment_yar (status unknown)", "website": "https://pay.ir",
    "risk_label": "high", "restriction_note": "SDKs on npm/PyPI are stale (2017-2021); the service's current status/ownership could not be verified in this run.",
    "api": {
        "endpoints": R({"send": "POST https://pay.ir/pg/send {api, amount (Rial, must be > 10,000), redirect, mobile?, factorNumber?, description?, validCardNumber?}",
                        "redirect": "GET https://pay.ir/pg/{token}", "verify": "POST https://pay.ir/pg/verify {api, token}"}, None, "low", ("P7",), status="reported",
                       note="README: package tested on 1400/04/24 (2021-07-14)."),
        "callback_rule": R("Callback has status & token; if status=1 you MUST verify, otherwise the amount returns to the customer after 30 minutes", None, "medium", ("P7",), status="reported"),
        "sandbox": R("api key \"test\"", None, "low", ("P7",), status="reported", verify="docs.pay.ir/gateway"),
    },
}

G["sep_saman"] = {
    "name_fa": "سپ (بانک سامان)", "name_en": "SEP / Saman Kish", "kind": "psp_direct", "website": "https://www.sep.ir",
    "risk_label": "high", "restriction_note": "Bank-grade onboarding; no SDK evidence found in this run; also reachable through Zarinpal (S28).",
    "api": {"endpoints": U("Request the technical document from SEP (token-based 'online PG' REST + verify/reverse).", note="Not found in registries; left null.")},
}

G["behpardakht_mellat"] = {
    "name_fa": "به‌پرداخت ملت", "name_en": "Behpardakht Mellat (BPM)", "kind": "psp_direct", "website": "https://www.behpardakht.com",
    "risk_label": "high", "restriction_note": "Direct bank gateway; contract + Enamad needed; classification review by the bank.",
    "api": {
        "protocol": R("SOAP: https://bpm.shaparak.ir/pgwchannel/services/pgw?wsdl", None, "medium", ("P5",), status="reported"),
        "flow": R("bpPayRequest(terminalId,userName,userPassword,orderId,amount[Rial],localDate,localTime,additionalData,callBackUrl,payerId=0) -> 'ResCode,RefId'; POST RefId to https://bpm.shaparak.ir/pgwchannel/startpay.mellat; callback carries ResCode, SaleOrderId, SaleReferenceId; then bpVerifyRequest -> bpInquiryRequest -> bpSettleRequest; bpReversalRequest on any failure", None, "medium", ("P5",), status="reported",
                  note="Unverified payments are reversed by the bank after a timeout; verify+settle immediately."),
        "amount_unit": R("Rial (wrapper multiplies Toman x 10)", "IRR", "medium", ("P5",), status="reported"),
        "result_codes": R(MELLAT_CODES, None, "medium", ("P5",), status="reported"),
    },
}

G["parsian_pec"] = {
    "name_fa": "تجارت الکترونیک پارسیان (پک)", "name_en": "Parsian Electronic Commerce (PEC)", "kind": "psp_direct", "website": "https://pec.ir",
    "risk_label": "high", "restriction_note": "Direct PSP; contract + Enamad needed.",
    "api": {
        "protocol": R({
            "sale": "https://pec.shaparak.ir/NewIPGServices/Sale/SaleService.asmx?WSDL",
            "confirm": "https://pec.shaparak.ir/NewIPGServices/Confirm/ConfirmService.asmx?WSDL",
            "reverse": "https://pec.shaparak.ir/NewIPGServices/Reverse/ReversalService.asmx?WSDL",
            "multiplexed_sale": "https://pec.shaparak.ir/NewIPGServices/MultiplexedSale/OnlineMultiplexedSalePaymentService.asmx?WSDL",
            "redirect": "https://pec.shaparak.ir/NewIPG/?Token=<token>",
            "sale_report_rest": "https://pgwservices.pec.ir/api/PGWReport/GetSaleReport",
        }, None, "medium", ("P6",), status="reported"),
        "amount_unit": R("Rial (SDK converts Toman x 10)", "IRR", "medium", ("P6",), status="reported"),
    },
}

G["melli_sadad"] = {
    "name_fa": "سداد (بانک ملی)", "name_en": "Sadad (Bank Melli)", "kind": "psp_direct", "website": "https://sadadpsp.ir",
    "risk_label": "high", "restriction_note": "Direct bank gateway.",
    "api": {"endpoints": R({"payment_request": "POST https://sadad.shaparak.ir/api/v0/Request/PaymentRequest", "verify": "POST https://sadad.shaparak.ir/api/v0/Advice/Verify",
                            "refund": "POST https://refund.sadadpsp.ir/api/v1/refund/Register | Confirm | Cancel"}, None, "medium", ("P5",), status="reported")},
}

G["saderat_sepehr"] = {
    "name_fa": "سپهر (بانک صادرات)", "name_en": "Sepehr Electronic Payment (Bank Saderat)", "kind": "psp_direct", "website": "https://www.sepehrpay.com",
    "risk_label": "high", "restriction_note": "Direct bank gateway.",
    "api": {"endpoints": R({"get_token": "GET https://sepehr.shaparak.ir:8081/V1/PeymentApi/GetToken?Amount&CallbackUrl&InvoiceId&Payload&TerminalId", "advice": "GET https://sepehr.shaparak.ir:8081/V1/PeymentApi/Advice?digitalreceipt&Tid"}, None, "low", ("P5",), status="reported")},
}

G["asanpardakht_digipay"] = {
    "name_fa": "آسان‌پرداخت (آپ) / دیجی‌پی", "name_en": "Asan Pardakht (AP) / Digipay", "kind": "psp / fintech", "website": "https://asanpardakht.ir",
    "risk_label": "high", "restriction_note": "AP gateway is reachable through Zarinpal (S28). Direct API details were not retrievable in this run.",
    "api": {"endpoints": U("Request AP technical document (REST token/verify/settle/reverse) and Digipay merchant API docs.", note="No SDK found; left null.")},
}

# --------------------------------------------------------------------------------------------------------------
# data/collection_methods.json
# --------------------------------------------------------------------------------------------------------------
def fraud(score, why):
    return {"score_1_to_5": R(score, "score", "low", status="reported", note="Analyst judgement (5 = worst), not sourced: " + why)}


methods = {
    "_meta": {
        "file": "collection_methods.json", "owner_agent": "03-ir-payments-collection", "as_of": AS_OF,
        "purpose": "Per-method cost/cap/verification/fraud/latency facts for collecting customer money. Loaded by the pricing engine (collection fee line) and the simulator (method mix, failure modes).",
        "scoring_note": "fraud_risk.score_1_to_5 is an analyst judgement to rank methods; it is NOT a measured rate.",
        "reference_usdt_irt": R(257000, "IRT per USDT", "low", ("BP",), status="reported", note="Reference only for min-viable-order maths (business plan, ~10 Mehr 1405). The live rate comes from the exchanges adapter."),
    },
    "methods": {},
}
M = methods["methods"]

M["gateway_psp"] = {
    "name_fa": "درگاه پرداخت (پرداخت‌یار)", "name_en": "Payment-yar / PSP gateway", "launch_role": "primary for retail-size orders IF the merchant category is accepted; keep a second gateway account as fallback",
    "risk_label": "high",
    "restriction_note": "Gateway can be terminated or settlement held if the activity is judged currency/crypto-related; classification and Enamad are gating.",
    "merchant_fee": {
        "model": "min(pct x amount, cap) + fixed",
        "pct": R(0.5, "pct", "low", ("S1", "BP"), status="reported", verify="Zarinpal feeCalculation.json at runtime"),
        "cap_toman": R(16000, "IRT", "low", ("S1", "BP"), status="reported"),
        "fixed_toman": R(500, "IRT", "low", ("S1", "BP"), status="reported"),
        "regulated_floor": R("1,200 Rial if purchase < 6,000,000 Rial else 0.02% capped at 40,000 Rial", "IRR", "medium", ("S18", "S19", "S20"), status="reported"),
        "vat": U("04-legal: VAT on PSP service fees, rate for 1405."),
    },
    "caps": {
        "single_payment_max": R(100000000, "IRT", "medium", ("P3",), status="reported", note="Zarinpal -41; other gateways have their own ceilings (Zibal 113, IDPay 35/36)."),
        "per_person_per_day": R(400000000, "IRT", "medium", ("S12", "S16"), status="reported"),
        "per_card_per_day": R(200000000, "IRT", "low", ("S12",), status="reported"),
    },
    "settlement": R("Paya cycles on business days; Zibal: cut-off 21:00 -> next business morning; Vandar: up to 39x/day; others unverified", None, "low", ("S22", "S25", "S26"), status="reported"),
    "verification": "Server-side verify with the amount from our DB (never from the callback); idempotent on authority/trackId; reconcile with unVerified/inquiry; pay-link TTL = quote TTL; payer-card binding via cardPan/allowedCards.",
    "fraud_risk": fraud(1, "card present at issuer, push payment through Shaparak; residual risk is third-party-card (triangular) fraud and account-takeover"),
    "fraud_patterns": ["victim-funded orders (triangular fraud) - mitigate with card binding + name match", "customer disputes with the bank after delivery of a digital good", "double verify / replay of callback"],
    "confirmation_time": R("seconds (synchronous callback + verify)", None, "medium", ("P1", "P4"), status="reported"),
    "availability": "24/7 (issuer/Shaparak maintenance windows apply); gateway outages are a simulator scenario",
    "min_viable_order_toman": R(1000, "IRT", "low", ("P1",), status="reported", note="Gateway minimum; commercial minimum is a product decision."),
    "unverified_payment_rule": R("Pay.ir: if status=1 and the merchant does not verify, the amount returns to the customer after 30 minutes. Zarinpal: reversal only within 30 minutes (-63). IDPay: a verification window exists (error 54). Mellat: verify -> inquiry -> settle, reversal on failure. => verify immediately and retry within the first minutes; never rely on a late callback.", None, "medium", ("P7", "P3", "P5"), status="reported"),
}

M["gateway_direct_bank"] = {
    "name_fa": "درگاه مستقیم بانکی/PSP", "name_en": "Direct bank / PSP gateway", "launch_role": "secondary/fallback once the business is registered (needs contract, Enamad, tax file)",
    "risk_label": "high", "restriction_note": "Bank-grade KYC; the CBI pushes crypto platforms toward direct PSPs, so a USDT-funded reseller will be scrutinised on category.",
    "merchant_fee": {
        "regulated_floor": R("1,200 Rial if purchase < 6,000,000 Rial else 0.02% capped at 40,000 Rial", "IRR", "medium", ("S18", "S19", "S20"), status="reported"),
        "marketing_claim": R("'direct gateways have no fee'", None, "low", ("S28",), status="conflicting", note="Contradicted by the regulated floor above and by bank fee statements; treat as 'no PSP margin' only."),
        "bank_specific_schedule": U("Contract schedule from the PSP (Sep/Mellat/Parsian/Sadad/Sepehr).", unit="pct"),
    },
    "caps": {"per_person_per_day": R(400000000, "IRT", "medium", ("S12", "S16"), status="reported")},
    "settlement": U("PSP contract: settlement lag and cycle."),
    "verification": "Protocol-specific: Mellat bpVerifyRequest -> bpInquiryRequest -> bpSettleRequest else bpReversalRequest; Parsian Sale -> Confirm -> Reverse; Sadad Advice/Verify; Sepehr Advice(digitalreceipt).",
    "fraud_risk": fraud(1, "same as gateway_psp"),
    "confirmation_time": R("seconds", None, "medium", ("P5", "P6"), status="reported"),
    "availability": "24/7 with bank maintenance windows",
}

M["card_to_card_manual"] = {
    "name_fa": "کارت‌به‌کارت (تأیید دستی/نیمه‌خودکار)", "name_en": "Card-to-card to a business card/account", "launch_role": "secondary for small/medium orders (<= 15M Toman); primary only if gateways refuse the category",
    "risk_label": "medium",
    "restriction_note": "Receiving many third-party transfers on a personal card triggers bank AML blocks and tax visibility; use a registered-business account and keep invoices. Cap 15M Toman/day per sending card.",
    "merchant_fee": {"bank_fee_receiver": R(0, "IRT", "low", ("BP",), status="reported", note="Receiver pays no per-transfer fee per round-0 research (not independently re-verified); sender-side fee not verified."),
                     "sender_fee": U("Sender bank tariff table 1405 (c2c fee per transfer).", unit="IRT"),
                     "operator_cost_per_receipt": U("From 10-ops-growth: minutes per receipt x operator wage.", unit="IRT")},
    "caps": {"per_sending_card_per_day": R(15000000, "IRT", "high", ("S13", "S14", "S15", "S16", "S17"), status="reported"),
             "policy": "Orders above the cap are routed to gateway, Paya/Satna transfer or USDT. The product must NOT instruct customers to split a payment across cards or days to get around the cap."},
    "verification": "Unique-amount tail (+1..999 Toman, collision-free among open orders, TTL = quote TTL) -> match to bank notification; confirm via bank statement/open-banking where available; check payer card ownership by name match before releasing the order; never accept screenshots as proof.",
    "unique_amount": R({"tail_range_toman": [1, 999], "mean_toman": 500, "uniqueness_scope": "per destination card and open order set", "ttl": "= price-lock TTL"}, None, "medium", ("S31",), status="reported",
                       note="Pattern seen in a WooCommerce card-to-card verification plugin; tail revenue stays with the merchant, so the pricing engine should fold it into the price, not show it as a fee."),
    "fraud_risk": fraud(4, "fake screenshots, forged bank SMS, victim-funded (triangular) transfers, reversals after bank complaints; account freezes"),
    "fraud_patterns": ["fake receipt screenshot", "forged SMS in the bank's SMS thread", "triangular fraud: a third party's money is routed to our card for a fraudster's order", "bank/police block of the receiving account after a victim's complaint"],
    "confirmation_time": R("transfer instant (Shetab); verification delay = operator/automation latency", None, "medium", ("S31",), status="reported"),
    "availability": "24/7 transfers; verification depends on operator hours (Iran weekend Friday)",
    "tax_triggers": R({"monthly_deposit_count": 100, "monthly_deposit_total_toman": 35000000, "logic": "both conditions", "caveat": "tax applies only if the deposits are shown to be income (circular 200/5549 per summary)"}, None, "medium", ("S29",), status="reported",
                      verify="04-legal: confirm the criteria, thresholds and the current circular with a licensed accountant."),
    "freeze_risk": R("High for personal cards that receive many unrelated transfers; CBI/police can block accounts (CBI invoked its AML powers against crypto platforms and payment-yars)", None, "medium", ("S30", "S36"), status="reported",
                     note="Lawful structure: registered business + business account, PSP/gateway as primary, invoices (Moadian), KYC of payers, prompt answers to bank/police requests. Never use third-party or rented accounts."),
}

M["bank_transfer_paya_satna"] = {
    "name_fa": "پایا/ساتنا (انتقال بانکی)", "name_en": "Paya / Satna bank transfer", "launch_role": "lawful channel for orders above the card-to-card cap",
    "risk_label": "medium", "restriction_note": "Operator reconciliation needed; Paya/Satna hours and holiday rules apply.",
    "caps": {"per_transfer_and_daily": U("Sender bank limits table 1405 (Paya/Satna/Pol): fararu 978296, zoomit 463880 - read the table.", unit="IRT")},
    "settlement": R("Paya cycles 03:45/09:45/12:45/18:45 (changed 2025-07-10); Satna working-hours rule above", None, "low", ("S22", "S23", "S24"), status="reported"),
    "verification": "Match reference/tracking number + amount + sender name to the bank statement before releasing the order.",
    "fraud_risk": fraud(2, "bank-side name/IBAN checks make forged proofs harder than screenshots"),
}

M["bale_wallet"] = {
    "name_fa": "کیف پول بله (فاکتور در ربات)", "name_en": "Bale in-bot invoice (wallet/card/port payout)", "launch_role": "optional convenience rail inside the Bale mini app/bot",
    "risk_label": "medium", "restriction_note": "Bale wallet rules, limits and fees were not verified; messenger payment rails may change; settlement type depends on provider_token.",
    "merchant_fee": {"payer_fee": R("Docstring: 'When paying the amount, a fee will be charged from the sender'", None, "low", ("P17",), status="reported", verify="docs.bale.ai payments section; test with a small live invoice."),
                     "merchant_fee": U("Bale merchant agreement / wallet fee table.", unit="pct")},
    "api": {
        "base_url": R("https://tapi.bale.ai/bot{token}/{method}", None, "high", ("P17", "P18", "P19"), status="reported"),
        "methods": R(["sendInvoice", "createInvoiceLink", "answerPreCheckoutQuery", "inquireTransaction"], None, "high", ("P18", "P19", "P20"), status="reported"),
        "amount_unit": R("Rial (IRR) in LabeledPrice.amount", "IRR", "medium", ("P18", "S33"), status="reported", verify="Send a 10,000 Rial invoice and compare with the wallet UI."),
        "provider_token": R("one of: (1) card number, (2) port (gateway) number + acceptor number, (3) Bale wallet number", None, "medium", ("P17", "S32"), status="reported", verify="docs.bale.ai -> payments; how the token is issued/approved is not verified."),
        "invoice_limits": R({"title_chars": "1-32", "description_chars": "1-255"}, None, "medium", ("P17",), status="reported"),
        "flow": "sendInvoice -> user taps pay -> pre_checkout_query (answer ok within ~10 s) -> poll/confirm with inquireTransaction(transaction_id = pre_checkout_query.id) until status in {paid, failed, rejected} -> successful_payment message; store provider_payment_charge_id uniquely (idempotency).",
        "transaction_statuses": R(["pending", "paid", "failed", "rejected"], None, "medium", ("P19",), status="reported"),
        "webhook_security": R("setWebhook takes only `url` (no secret_token in the typings) -> protect the endpoint with an unguessable path and always re-confirm via inquireTransaction", None, "low", ("P20",), status="reported", verify="docs.bale.ai setWebhook; test whether a secret header is sent."),
        "miniapp": R("window.Bale.WebApp; initData is a raw string for server-side validation", None, "low", ("S34",), status="reported", verify="Create a test mini app and capture initData; validate with the Telegram-style HMAC (secret = HMAC_SHA256('WebAppData', bot_token)) and confirm it matches Bale."),
    },
    "caps": {"wallet_levels_and_limits": U("Bale wallet help center: KYC levels, per-transaction and daily limits.", unit="IRT")},
    "settlement": U("Bale payment settlement: to card / to PSP terminal / to Bale wallet; timing and fees."),
    "verification": "Never trust the chat message; confirm with inquireTransaction; match payload (our order id) and amount in Rial.",
    "fraud_risk": fraud(2, "wallet funded by the user; payer identity tied to the messenger account"),
    "confirmation_time": R("seconds (poll every ~2 s)", None, "low", ("P19",), status="reported"),
}

M["rubika_payment_button"] = {
    "name_fa": "دکمه پرداخت روبیکا", "name_en": "Rubika bot inline payment button", "launch_role": "watch-list only",
    "risk_label": "medium", "restriction_note": "Only SDK-level evidence; fees/settlement unknown.",
    "api": {"base_url": R("https://botapi.rubika.ir/v3/{token}/{method}", None, "medium", ("P21",), status="reported"),
            "payment": R("Inline keyboard button type 'Payment' {id, title, amount, description}; update 'UpdatedPayment' with payment_id and status Paid|NotPaid", None, "medium", ("P21",), status="reported", verify="Rubika bot docs (rubika.ir/botapi).")},
    "eitaa_note": R("Eitaa bots are reachable via the Eitaayar API https://eitaayar.ir/api/{token} (getMe, sendMessage, sendFile in the wrapper seen); no payment/mini-app payment evidence", None, "low", ("P22",), status="reported", verify="Eitaa/Eitaayar docs."),
    "soroush_plus_note": U("Search Soroush Plus bot/payment status (no evidence in this run)."),
}


def usdt_chain(name, chain, token_contract, contract_src, decimals, confirm_note, monitor, cost_verify, cost_note, risk_why, score, recalled_contract_note=None):
    if token_contract and contract_src:
        contract_rec = R(token_contract, None, "medium", contract_src, status="reported",
                         verify="Tether supported-protocols page + the chain explorer (symbol USDT, decimals, holders) before hard-coding.")
    elif token_contract:
        contract_rec = R(token_contract, None, "low", (), status="UNVERIFIED", note=recalled_contract_note,
                         verify="Tether supported-protocols page + the chain explorer before hard-coding.")
    else:
        contract_rec = U("Tether supported-protocols page + the chain explorer.")
    return {
        "name_en": name, "chain": chain, "launch_role": "optional rail for larger orders; needs AML screening and quote-lock",
        "risk_label": "high",
        "restriction_note": "On-chain USDT is traceable and freezable by the issuer; sender addresses may belong to sanctioned or designated entities (see 05-sanctions specialist). Screening is mandatory before crediting.",
        "token_contract": contract_rec,
        "decimals": R(decimals, "digits", "low", (), status="UNVERIFIED", note="Recalled, not sourced in this run. Money rule: read decimals() at startup and assert before any amount maths.",
                      verify="Call decimals() on the contract / explorer token page.") if decimals is not None else U("Call decimals() on the contract."),
        "customer_pays": "network fee of the incoming transfer (customer side); exchanges charge withdrawal fees (~1 USDT TRC20 / ~0.8 USDT BEP20 per round-0 research, BP)",
        "merchant_cost": {"sweep_and_aml_per_payment": U(cost_verify, unit="USDT", note=cost_note)},
        "monitor": monitor,
        "confirmations": U("Chain docs; choose a policy and make it configurable (confirmations_required).", unit="blocks or finality flag", note=confirm_note),
        "fraud_risk": fraud(score, risk_why),
        "payment_policy": {
            "underpay": "if received >= (1 - tolerance) x quote: owner policy decides accept-with-note; below tolerance: hold order, offer top-up to the same address within TTL or refund minus network fee",
            "overpay": "credit the excess as a non-withdrawable credit note or refund minus network fee (owner decision)",
            "late_payment": "after quote TTL: re-quote at the current rate with customer consent, else refund minus fee",
            "wrong_token": "do not auto-credit; manual recovery SOP with fee; keep per-order keys so funds are recoverable",
            "wrong_network": "EVM addresses are identical across EVM chains, so cross-EVM mistakes are recoverable if keys are controlled; TRON/TON mistakes need a recovery SOP",
            "tolerance": U("Owner decision parameter - choose with the owner and sweep it in the sensitivity run.", unit="pct", note="Not a market fact."),
        },
    }


M["usdt_trc20"] = usdt_chain(
    "USDT on TRON (TRC20)", "tron", "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t", ("P30", "P25"), 6,
    "Wait for a solidified (irreversible) block; TronGrid exposes a confirmed/irreversible view (trongrid-cli: block latest --confirmed)",
    {"api": "TronGrid: GET /v1/accounts/{address}/transactions/trc20 and /v1/contracts/{contract}/events; header Tron-Pro-Api-Key",
     "evidence": R("TronGrid v1 paths seen in trongrid 1.2.6; Tron-Pro-Api-Key header and a 403 'Exceed the user daily usage' quota error seen in tronpy 0.6.2; unauthenticated free tier 3 QPS per trongrid-cli docs", None, "medium", ("P23", "P24", "P25"), status="reported",
                   verify="TronGrid dashboard: free-plan QPS/daily quota; paid plan prices."),
     "free_tier_qps": R(3, "requests/second", "low", ("P25",), status="reported", note="Third-party CLI docs, unauthenticated tier; the keyed free tier may differ.", verify="trongrid.io pricing"),
     "energy_rental_example": R("Third-party energy-rental APIs exist (e.g. TronZap: estimateEnergy/calculate endpoints at https://api.tronzap.com)", None, "low", ("P31",), status="reported", note="Example only, not an endorsement; check provider risk.")},
    "Measure on mainnet: energy consumed by a USDT transfer to (a) an address that already holds USDT and (b) a fresh address; current energy price (chain parameters); compare with a rental quote.",
    "Commonly cited ~65k energy for a USDT transfer to an existing holder and about double to a new holder - recalled, NOT verified in this run. New addresses may also need activation.",
    "irreversible-after-solidification but issuer can freeze; fast chain popular with Iranian exchanges", 3)

M["usdt_bep20"] = usdt_chain(
    "USDT on BNB Smart Chain (BEP20)", "bsc", "0x55d398326f99059fF775485246999027B3197955", ("P30",), 18,
    "Use N block confirmations or the chain's fast-finality signal; configurable",
    {"api": "Etherscan API V2: GET https://api.etherscan.io/v2/api?chainid=56&module=account&action=tokentx&contractaddress=<USDT>&address=<deposit>&apikey=<key> (one key for all chains), or BSC JSON-RPC eth_getLogs on the USDT Transfer event (topic0 = keccak256('Transfer(address,address,uint256)')) filtered by `to`",
     "evidence": R("Etherscan V1 (and the bscscan.com API) was deprecated on 2025-08-15 per the etherscan-api 12.2.0 README; V2 uses one base URL https://api.etherscan.io/v2/api with chainid (bsc = 56) and a single key; client libraries default to 5 requests/second. The module/action names for token transfers are recalled from V1 and carried into V2 (verify).", None, "medium", ("P33", "P34"), status="reported",
                   verify="docs.etherscan.io: V2 chain list, free-plan coverage of BNB Smart Chain, calls/second and daily caps; if the free plan excludes BSC use an RPC provider with eth_getLogs."),
     "free_tier_coverage_of_bsc": U("Etherscan pricing page / API dashboard: is chainid 56 available on the free plan? calls/second? daily cap?", note="Not verified; the 5 req/s figure is only a client-library default.")},
    "Measure on mainnet: gas used by a USDT transfer and the BNB price needed per sweep; decide gas-drip vs spend-from-derived-keys.",
    "Gas in BNB is needed to sweep each derived address (gas-drip) - or do not sweep and spend directly from derived keys.",
    "same-address-on-all-EVM-chains mistakes; reorg risk minimal after confirmations", 3)

M["usdt_ton"] = usdt_chain(
    "USDT jetton on TON", "ton", "EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs", (), 6,
    "Use a masterchain-finalised transaction (seconds)",
    {"api": "TONAPI REST (key optional for REST, required for streaming/webhooks) e.g. /v2/accounts/{id}/jettons/history, /v2/events/{event_id}; or TonCenter v3",
     "evidence": R("pytonapi 2.3.0: REST paths /v2/accounts/{account_id}/jettons/history and /v2/accounts/{account_id}/jettons/{jetton_id}/history; streaming (SSE/WebSocket) and webhooks need a tonconsole.com key", None, "medium", ("P26",), status="reported")},
    "Measure on mainnet: TON consumed by a jetton transfer (fees + forward amount) and the TON price per sweep.",
    "Jetton transfers need TON for fees/forward amount; use a memo/comment per order on one address.",
    "memo-based matching is error-prone (customers omit the comment)", 4,
    recalled_contract_note="Recalled USDT jetton master address; NOT corroborated by anything read in this run.")

methods["simulation_priors_ASSUMPTIONS"] = {
    "_note": "MODELLING ASSUMPTIONS for the simulator, not facts. Every value is low confidence/UNVERIFIED and must be calibrated or swept in the sensitivity analysis.",
    "c2c_operator_minutes_per_receipt": R(2, "minutes", "low", (), status="UNVERIFIED", note="ASSUMPTION; sweep 1-5", verify="Measure in persona E2E runs / ops specialist."),
    "c2c_fake_receipt_attempt_share": R(0.005, "fraction of c2c orders", "low", (), status="UNVERIFIED", note="ASSUMPTION; sweep 0.001-0.02", verify="Industry interviews / own logs after launch."),
    "c2c_third_party_funded_share": R(0.001, "fraction of c2c orders", "low", (), status="UNVERIFIED", note="ASSUMPTION; sweep 0.0002-0.005", verify="Own logs; police/bank complaint counts."),
    "gateway_payment_completion_rate": R(0.9, "fraction of started payments", "low", (), status="UNVERIFIED", note="ASSUMPTION; sweep 0.8-0.95", verify="Own funnel analytics after launch."),
    "usdt_underpay_share": R(0.015, "fraction of usdt orders", "low", (), status="UNVERIFIED", note="ASSUMPTION; sweep 0.005-0.04", verify="Own logs."),
    "usdt_wrong_network_or_token_share": R(0.003, "fraction of usdt orders", "low", (), status="UNVERIFIED", note="ASSUMPTION; sweep 0.001-0.01", verify="Own logs."),
}

# --------------------------------------------------------------------------------------------------------------
# data/identity_vendors.json (identity + SMS + e-invoice)
# --------------------------------------------------------------------------------------------------------------
def cap(method_path, params, note=None, price_verify="Vendor price list / contract (per-call price in Toman)"):
    return {
        "endpoint": method_path, "params": params,
        "price_per_call": U(price_verify, unit="IRT", note="Price not published in anything read in this run."),
        "note": note,
    }


ident = {
    "_meta": {
        "file": "identity_vendors.json", "owner_agent": "03-ir-payments-collection", "as_of": AS_OF,
        "purpose": "Identity/inquiry vendors (Shahkar-style mobile-national-ID match, card-owner, IBAN, civil registry), SMS providers (OTP) and Moadian e-invoice, with endpoint capabilities and unverified prices.",
        "legal_note": "Each inquiry processes personal data. Obtain explicit, purpose-limited consent, minimise retention (store the boolean result + vendor trace id, not the raw registry answer), and confirm the legal basis with the licensed Iranian counsel (04-legal-tax-compliance-ir). Not legal advice.",
        "evidence_note": "Endpoint shapes come from SDK source (npm/PyPI) read directly. Prices, SLAs, contracts and legal terms are NOT verified (search budget exhausted).",
    },
    "identity_vendors": {
        "jibit": {
            "name_fa": "جیبیت", "website": "https://jibit.ir", "risk_label": "medium",
            "restriction_note": "Commercial contract + business KYC; inquiry results depend on bank/registry availability.",
            "base_url": R("https://napi.jibit.ir/ide", None, "high", ("P10", "P11"), status="reported"),
            "auth": R("POST /v1/tokens/generate {apiKey, secretKey} -> {accessToken, refreshToken}; POST /v1/tokens/refresh {accessToken, refreshToken}; Bearer header. node-jibit defaults assume ~30 min access-token validity and 24 h refresh-token validity", None, "medium", ("P10", "P11"), status="reported", verify="Jibit docs: token lifetimes."),
            "capabilities": {
                "mobile_national_id_match_shahkar_style": cap("GET /v1/services/matching?nationalCode=&mobileNumber=", ["nationalCode", "mobileNumber"], "returns {matched:boolean}; whether it is backed by Shahkar is not verified"),
                "card_owner_name_match": cap("GET /v1/services/matching?cardNumber=&name=", ["cardNumber", "name"], "returns {matched:boolean}"),
                "card_national_code_match": cap("GET /v1/services/matching?cardNumber=&nationalCode=&birthDate=", ["cardNumber", "nationalCode", "birthDate"], "birthDate format conflict: node-jibit strips '/' (Jalali yyyyMMdd) while the Python wrapper says yyyy-MM-dd -> test both"),
                "iban_national_code_match": cap("GET /v1/services/matching?iban=&nationalCode=&birthDate=", ["iban", "nationalCode", "birthDate"]),
                "iban_name_match": cap("GET /v1/services/matching?iban=&name=", ["iban", "name"]),
                "deposit_match": cap("GET /v1/services/matching?bank=&depositNumber=&nationalCode=&birthDate= | &name=", ["bank", "depositNumber"]),
                "card_info": cap("GET /v1/cards?number=", ["number"], "owner name, bank, type"),
                "card_to_iban": cap("GET /v1/cards?number=&iban=true", ["number"], "also deposit=true for card-to-account"),
                "iban_inquiry": cap("GET /v1/ibans?value=", ["value"]),
                "deposit_to_iban": cap("GET /v1/deposits?bank=&number=&iban=true", ["bank", "number"]),
                "availability": cap("GET /v1/services/availability?cardToIBAN=true", ["cardToIBAN"], "per-bank availability report"),
                "civil_registry_similarity": cap("GET /v1/services/identity/similarity?nationalCode=&birthDate=&firstName=&lastName=&fullName=&fatherName=", ["nationalCode", "birthDate", "names"], "returns similarity percentages (not raw data)"),
                "postal_code": cap("GET /v1/services/postal?code=", ["code"]),
                "foreigner_identity": cap("GET /v1/services/foreigners/identity?fida=", ["fida"]),
                "corporation_identity": cap("GET /v1/services/corporation/identity?code=", ["code"]),
                "sana": cap("GET /v1/services/social/sana?nationalCode=&mobileNumber=", ["nationalCode", "mobileNumber"], "meaning of 'sana' not verified"),
                "balances_and_reports": cap("GET /v1/balances ; GET /v1/reports/daily?yearMonthDay=", [], "account credit and daily billing report"),
            },
            "rate_limits": U("Jibit docs / contract."),
        },
        "finnotech": {
            "name_fa": "فینوتک", "website": "https://finnotech.ir", "risk_label": "medium",
            "restriction_note": "OAuth2 scopes are granted per contract; some services need end-user consent (authorization-code flow).",
            "base_urls": R({"production": "https://api.finnotech.ir", "beta": "https://apibeta.finnotech.ir", "sandbox": "https://sandboxapi.finnotech.ir"}, None, "medium", ("P12", "P13"), status="reported"),
            "auth": R("POST /dev/v2/oauth2/token with Basic clientId:secret, body {grant_type: client_credentials, nid, scopes}; then Bearer; the SDK covers only client-credential services", None, "medium", ("P12", "P13"), status="reported"),
            "capabilities": {
                "card_to_iban": cap("GET /facility/v2/clients/{clientId}/cardToIban?trackId=&card=&version=", ["card"], "scope facility:card-to-iban:get"),
                "iban_inquiry": cap("GET /oak/v2/clients/{clientId}/ibanInquiry?trackId=&iban=", ["iban"], "scope oak:iban-inquiry:get"),
                "deposit_to_iban": cap("GET /oak/v2/clients/{clientId}/iban?trackId=&bank=&deposit=", ["bank", "deposit"], "scope oak:deposit-to-iban:get"),
                "mobile_card_verification": cap("POST /kyc/v2/clients/{clientId}/mobileCardVerification?trackId=  body {mobile, card}", ["mobile", "card"], "scope kyc:mobile-card-verification:post; checks that the card belongs to the mobile owner"),
                "card_information": cap("GET /mpg/v2/clients/{clientId}/cards/{card}?trackId=", ["card"], "scope card:information:get"),
                "card_balance_and_statement": cap("POST /oak/v2/clients/{clientId}/card/balance | /card/statement {card, fromDate, toDate}", ["card"], "scopes oak:card-balance:get / oak:card-statement:get; practicality for verifying inbound card-to-card deposits is UNVERIFIED (consent, price, contract)"),
                "video_kyc": cap("POST /kyc/v2/clients/{clientId}/compareLiveVideoWithNationalCard?trackId= (multipart)", ["video", "nationalCard"], "seen in finnotech-js"),
                "blacklist_inquiry": cap("GET /oak/v2/clients/{clientId}/blacklistInquiry?trackId=&nid=", ["nid"], "scope oak:blacklist-inquiry:get; meaning to be verified"),
                "shahkar": cap("(not present in the SDK read)", ["mobile", "nationalCode"], "UNVERIFIED; ask Finnotech for the Shahkar scope"),
            },
        },
        "zibal": {"name_fa": "زیبال", "website": "https://zibal.ir", "risk_label": "medium", "restriction_note": "Inquiry (استعلام) services exist per vendor marketing, but no endpoint was verified in this run.",
                  "capabilities": {"all": U("help.zibal.ir inquiry section: card info, IBAN, Shahkar, national identity; prices.")}},
        "vandar": {"name_fa": "وندار", "website": "https://vandar.io", "risk_label": "medium", "restriction_note": "Not verified in this run.",
                   "capabilities": {"all": U("docs.vandar.io: IBAN/card inquiry and Shahkar products, prices.")}},
        "shahkar_direct": {"name_fa": "شاهکار (سازمان تنظیم مقررات و ارتباطات رادیویی)", "risk_label": "medium",
                           "restriction_note": "Direct access is for licensed operators/banks; a startup uses a vendor. Not verified in this run.",
                           "capabilities": {"mobile_national_id_match": U("CRA/ITO Shahkar service description and who may call it; vendor resale terms.")}},
    },
    "sms_providers": {
        "kavenegar": {
            "name_fa": "کاوه‌نگار", "risk_label": "low", "restriction_note": "Pre-approved templates required for pattern/OTP; sender lines are leased.",
            "base_url": R("https://api.kavenegar.com/v1/{apikey}/", None, "high", ("P14", "P15"), status="reported"),
            "endpoints": R({"send": "POST sms/send.json {sender, receptor (no leading 0), message, date?}", "send_array": "POST sms/sendarray.json", "otp_template": "POST verify/lookup.json {receptor, token, token2?, token3?, template}",
                            "status": "POST sms/status.json {messageid}", "credit": "POST account/info.json -> entries.remaincredit"}, None, "high", ("P14", "P15"), status="reported"),
            "response_shape": R({"return": {"status": 200, "message": "str"}, "entries": [{"messageid": "int", "status": "int", "statustext": "str", "sender": "str", "receptor": "str", "date": "epoch", "cost": "int"}]}, None, "medium", ("P15",), status="reported"),
            "price_per_sms": U("kavenegar.com price list (service line vs promo line).", unit="IRT"),
            "otp_rules": U("Kavenegar docs: template approval, line types, rate limits."),
        },
        "smsir": {
            "name_fa": "اس‌ام‌اس‌دات‌آی‌آر", "risk_label": "low", "restriction_note": "API key header; template id numeric.",
            "base_url": R("https://api.sms.ir/v1/", None, "medium", ("P14",), status="reported"),
            "endpoints": R({"send_bulk": "POST send/bulk {lineNumber, messageText, mobiles[], sendDateTime?}", "otp_template": "POST send/verify {mobile, templateId, parameters:[{name,value}]}", "status": "GET send/{messageId}", "credit": "GET credit"}, None, "medium", ("P14",), status="reported", note="Header X-API-KEY"),
            "price_per_sms": U("sms.ir price list.", unit="IRT"),
        },
        "ghasedak": {
            "name_fa": "قاصدک", "risk_label": "low", "restriction_note": "ApiKey header.",
            "base_url": R("https://gateway.ghasedak.me/rest/api/v1/WebService/", None, "medium", ("P14",), status="reported"),
            "endpoints": R({"send_single": "POST SendSingleSMS {lineNumber, receptor, message, sendDate?}", "send_bulk": "POST SendBulkSMS {lineNumber, receptors[], message}", "otp_template": "POST SendOTPSMS {receptor, type:1, template, param1..param3}",
                            "status": "POST GetDeliveries2 {Id:[..]}", "credit": "GET GetCredit (unit: SMS count)"}, None, "medium", ("P14",), status="reported"),
            "price_per_sms": U("ghasedak.me price list.", unit="IRT"),
        },
        "bale_safir_otp": {
            "name_fa": "سفیر بله (ارسال OTP از طریق پیام‌رسان بله)", "risk_label": "low",
            "restriction_note": "Evidence is an unofficial SDK; needs a Safir account/credit; works only for users who have Bale (use as a secondary OTP channel, not the only one).",
            "base_url": R("https://safir.bale.ai/api/v2", None, "medium", ("P36",), status="reported"),
            "endpoints": R({"token": "POST /auth/token (form-urlencoded) {grant_type: client_credentials, client_id, client_secret, scope: read} -> access_token",
                            "send_otp": "POST /send_otp {phone, otp} with Authorization: Bearer <access_token> -> response carries the remaining balance"}, None, "medium", ("P36",), status="reported",
                           note="Token lifetime, rate limits, phone format, price per OTP and template rules are not shown by the SDK.", verify="Bale Safir panel/docs; test with a small balance."),
            "price_per_otp": U("Safir price list.", unit="IRT"),
        },
        "farazsms_ippanel": {
            "name_fa": "فرازاس‌ام‌اس / آی‌پی‌پنل", "risk_label": "low", "restriction_note": "Username + password method API (+98 phone format).",
            "base_url": R("https://ippanel.com/api/select", None, "medium", ("P14",), status="reported"),
            "price_per_sms": U("farazsms.com price list.", unit="IRT"),
        },
        "melipayamak": {
            "name_fa": "ملی‌پیامک", "risk_label": "low", "restriction_note": "Username + password; REST and SOAP.",
            "endpoints": R({"rest": "https://rest.payamak-panel.com/api/SendSMS/", "soap_wsdl_base": "http://api.payamak-panel.com/post/ (Actions/Tickets/contacts/users .asmx?wsdl)"}, None, "medium", ("P16",), status="reported"),
            "price_per_sms": U("melipayamak.com price list.", unit="IRT"),
        },
        "otp_design_defaults": {
            "_note": "Design defaults for the owner to change, not market facts.",
            "code_digits": R(6, "digits", "low", (), status="UNVERIFIED", note="design default"),
            "ttl": R(120, "seconds", "low", (), status="UNVERIFIED", note="design default"),
            "max_attempts": R(5, "attempts", "low", (), status="UNVERIFIED", note="design default"),
            "resend_cooldown": R(60, "seconds", "low", (), status="UNVERIFIED", note="design default"),
            "provider_failover": "keep two SMS providers behind one SmsProvider interface (send, sendPattern, getStatus, getCredit); optional third channel: Bale Safir OTP for users who have Bale",
        },
    },
    "einvoice_moadian": {
        "name_fa": "سامانه مودیان", "risk_label": "medium",
        "restriction_note": "Legal obligation, thresholds and penalties are NOT verified in this run (see open questions). Technical contract below is from third-party SDKs.",
        "who_must_use_and_thresholds": U("intamedia.ir (organisation portal), tax.gov.ir, the 'Law on Store Terminals and Moadian System' and the phase announcements; ask the accountant (04-legal).", note="Not retrieved."),
        "penalties": U("Same sources as above (Direct Taxes Act provisions on e-invoice non-issuance)."),
        "vat_rate": U("04-legal-tax-compliance-ir owns the VAT rate for 1405."),
        "api": {
            "base_urls": R({"production": "https://tp.tax.gov.ir/req/api/{self-tsp|tsp}/sync/{PURPOSE} and .../async/normal-enqueue", "sandbox": "https://sandboxrc.tax.gov.ir/req/api/{type}/sync/{PURPOSE}", "requests_manager": "https://tp.tax.gov.ir/requestsmanager/api/v2"}, None, "medium", ("P27", "P28"), status="reported"),
            "iranian_ip_required": R("taxapi README: make sure you reach the tax API from an Iranian IP address", None, "medium", ("P28",), status="reported", note="Architecture implication: the e-invoice adapter likely has to run on Iranian infrastructure."),
            "credentials": R(["fiscal ID (tax memory ID)", "private key (+ certificate)", "economic code"], None, "medium", ("P27", "P28"), status="reported"),
            "flow": R("GET_TOKEN (signed) -> GET_SERVER_INFORMATION (public keys) -> invoice packet signed (JWS) and encrypted (JWE) -> async normal-enqueue -> INQUIRY_BY_UID until SUCCESS|FAILED|PENDING|IN_PROGRESS", None, "medium", ("P27", "P28"), status="reported"),
            "invoice_fields_seen": R({"header": ["taxid", "inno", "indatim", "inty (1|2|3)", "ins", "inp", "tins", "tob", "bid", "tinb", "tprdis", "tdis", "tadis", "tvam", "tbill", "setm"],
                                      "body": ["sstid", "sstt", "mu", "am", "fee", "prdis", "dis", "adis", "vra", "vam", "tsstam"]}, None, "medium", ("P27",), status="reported"),
            "fiscal_info": R("GET_FISCAL_INFORMATION returns economicCode, fiscalStatus, nameTrade, saleThreshold", None, "medium", ("P28",), status="reported"),
        },
        "third_party_providers": U("Moadian-capable accounting/TSP vendors; confirm per vendor.", note="Names of accounting vendors appeared in tax-advice search results but their Moadian support was not checked."),
    },
}


def write(name, obj):
    path = os.path.join(ROOT, "data", name)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print("wrote", os.path.relpath(path, ROOT), os.path.getsize(path), "bytes")


if __name__ == "__main__":
    write("gateways.json", gateways)
    write("collection_methods.json", methods)
    write("identity_vendors.json", ident)
