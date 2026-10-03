#!/usr/bin/env python3
"""Brief 05 -- builds data/sanctions_timeline.json and data/risk_register.json.

Why a generator: every probability, scale bucket and residual score in the register is derived here from stated
inputs (see 05_base_rates.py for the hazard maths), so the files are reproducible and auditable.
Run:  python3 scripts/research/05_build_data.py && node scripts/validate-data.mjs data/risk_register.json data/sanctions_timeline.json
All sources are "per search summary" unless marked SEEN DIRECTLY (CLAUDE.md s4). Probabilities are modelling priors.
"""
from __future__ import annotations

import json
from collections import Counter, OrderedDict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
AS_OF = "2026-10-02"
SUMMARY = "per search summary (page not retrievable: egress blocked or not fetched)"

# ----------------------------------------------------------------------------------------------
# Sources  (ids match the Sources section of docs/03-research/05-sanctions-counterparty-risk.md)
# ----------------------------------------------------------------------------------------------
S: dict[str, dict] = {
    "S1": ("https://www.trmlabs.com/resources/blog/three-enforcement-layers-in-five-months-ofac-designates-irans-domestic-crypto-exchanges",
           "TRM Labs - Three Enforcement Layers in Five Months: OFAC Designates Iran's Domestic Crypto Exchanges"),
    "S2": ("https://crystalintelligence.com/sanctions/crypto-sanctions-screening-ofac-targets-iran-exchanges/",
           "Crystal Intelligence - Crypto sanctions screening: OFAC targets Iran exchanges"),
    "S3": ("https://www.scorechain.com/blog/ofac-iran-crypto-sanctions-june-2026",
           "Scorechain - OFAC Sanctions Iran's Four Largest Crypto Exchanges"),
    "S4": ("https://www.chainalysis.com/blog/ofac-sanctions-iranian-crypto-exchanges-june-2026/",
           "Chainalysis - OFAC Sanctions Nobitex and Iranian Cryptocurrency Exchanges"),
    "S5": ("https://www.elliptic.co/blog/ofac-sanctions-nobitex-and-three-other-iranian-cryptoasset-exchanges",
           "Elliptic - OFAC sanctions Nobitex and three other Iranian cryptoasset exchanges"),
    "S6": ("https://home.treasury.gov/news/press-releases/sb0519",
           "U.S. Treasury press release sb0519 - Economic Fury Targets Iran's Largest Digital Asset Exchange for Terror Finance and Sanctions Evasion"),
    "S7": ("https://x.com/USTreasury/status/2061898713916948560", "@USTreasury post announcing the 2026-06-02 designations"),
    "S8": ("https://ofac.treasury.gov/faqs/1257", "OFAC FAQ 1257 - E.O. 13902 digital asset exchanges / non-U.S. person exposure"),
    "S9": ("https://www.theblock.co/post/403436/us-sanctions-nobitex-iranian-crypto-exchanges-economic-fury-campaign",
           "The Block - US sanctions Nobitex and other Iranian crypto exchanges under 'Economic Fury' campaign"),
    "S10": ("https://cointelegraph.com/news/us-treasury-sanctions-iran-linked-crypto-exchanges-first-time",
            "Cointelegraph - US Treasury Sanctions Iran-Linked Crypto Exchanges for First Time"),
    "S11": ("https://www.coindesk.com/policy/2026/01/31/u-s-imposes-sanctions-on-crypto-exchanges-tied-to-iran-for-first-time",
            "CoinDesk - U.S. sanctions crypto exchanges tied to Iran for first time (2026-01-31)"),
    "S12": ("https://www.elliptic.co/insights/ofac-sanctions-exchanges-zedcex-and-zedxion-for-assisting-in-iranian-sanctions-evasion-and-irgc-operations/",
            "Elliptic - OFAC sanctions exchanges Zedcex and Zedxion"),
    "S13": ("https://www.trmlabs.com/resources/blog/ofac-sanctions-zedcex-and-zedxion-in-first-ever-designation-of-an-irgc-linked-digital-asset-exchange",
            "TRM Labs - OFAC Sanctions Zedcex and Zedxion in First-ever Designation of an IRGC-linked Digital Asset Exchange"),
    "S14": ("https://www.chainalysis.com/blog/ofac-designates-iranian-crypto-exchanges-january-2026/",
            "Chainalysis - OFAC Designates Iranian-Linked Crypto Exchanges (January 2026)"),
    "S15": ("https://www.zoomit.ir/iran-news/456187-nobitex-denied-banning-by-usa/",
            "Zoomit - Nobitex notice: the US sanctions news concerns two exchanges, Zedcex and Zedxion (fa)"),
    "S16": ("https://www.ompfinex.com/blog/truth-about-iran-crypto-exchange-sanctions",
            "OMPFinex - rumour of sanctions on Iranian crypto exchanges: what is the truth (fa)"),
    "S17": ("https://way2pay.ir/497871/", "Way2Pay - Nobitex denied sanctions on crypto exchanges (fa)"),
    "S18": ("https://nobitex.ir/mag/nobitex-sanction/", "Nobitex Mag - sanction clarification on user-asset security (fa)"),
    "S19": ("https://www.zoomit.ir/iran-news/460670-crypto%20platform-statement-on-new-sanctions/",
            "Zoomit - statement of the sanctioned crypto platforms: user assets safe (fa); also Digiato / Iranbroker copies"),
    "S20": ("https://www.iranintl.com/202606022403", "Iran International - US sanctions Nobitex and three other Iranian exchanges (fa/en); also Radio Farda, Euronews Persian, TGJU, IranWire, The National"),
    "S21": ("https://www.trmlabs.com/resources/blog/ofac-sanctions-crypto-addresses-associated-with-the-central-bank-of-iran-freezes-usd-344-million",
            "TRM Labs - OFAC Sanctions Crypto Addresses Associated with the Central Bank of Iran, Freezes USD 344 Million"),
    "S22": ("https://www.chainalysis.com/blog/central-bank-of-iran-designation-ofac-update-april-2026/",
            "Chainalysis - OFAC Updates Central Bank of Iran Designation Following Tether Seizure (April 2026)"),
    "S23": ("https://www.coindesk.com/business/2026/07/16/u-s-adds-four-iran-central-bank-crypto-wallets-to-sanctions-tether-freezes-usd131-million-of-contents",
            "CoinDesk - U.S. adds four Iran central bank crypto wallets to sanctions, Tether freezes $131M (2026-07-16)"),
    "S24": ("https://thedefiant.io/news/regulation/tether-says-it-helped-freeze-nearly-550-million-in-iran-linked-usdt",
            "The Defiant - Tether says it helped freeze nearly $550M in Iran-linked USDT (also CryptoTicker, Coinpedia, Cryptonomist, KuCoin News)"),
    "S25": ("https://cryptoslate.com/tether-claims-550-million-in-iran-freezes-but-35-million-slipped-past-senate/",
            "CryptoSlate - Tether claims $550M in Iran freezes, but $35M slipped past (Senate PSI minority report); also crypto.news, Zyphe"),
    "S26": ("https://www.coindesk.com/policy/2026/08/07/u-s-widens-iran-crypto-crackdown-with-sanctions-on-two-exchanges",
            "CoinDesk - U.S. widens Iran crypto crackdown with sanctions on two exchanges (Shelbit, Aban Tether) 2026-08-07; also Mishcon, TFTC, CoinPaprika, VeriHound"),
    "S27": ("https://www.paulhastings.com/insights/client-alerts/treasury-issues-additional-iran-related-sanctions-suspends-general-licenses-and-pledges-additional-action-under-operation-economic-outcast",
            "Paul Hastings - Treasury Issues Additional Iran-Related Sanctions, Suspends General Licenses ... Operation Economic Outcast; also Orrick, Baker McKenzie, Davis Polk, Paul Weiss, Cassidy Levy Kent, Regtechtimes"),
    "S28": ("https://hoodline.com/2026/09/treasury-sanctions-iran-s-bitbank-crypto-exchange-tied-to-zanjani-irgc-cash/",
            "Hoodline - Treasury sanctions Iranian exchange BitBank (2026-09-17); also Crowdfund Insider, TFTC, TRM Labs, Startup Fortune, VOA"),
    "S29": ("https://blocksec.com/blog/1-26-billion-frozen-usdt-blacklisting-on-ethereum-and-tron-in-2025",
            "BlockSec - USDT Blacklisting in 2025: $1.26B Frozen on Ethereum & Tron; also usdt-blacklist-explained-2026, Cointelegraph, crypto.news"),
    "S30": ("https://cointelegraph.com/news/tether-blacklist-delay-allowed-78-million-usdt-move",
            "Cointelegraph - Tether blacklist delay allowed $78M in illicit USDT transfers (AMLBot); also Decrypt"),
    "S31": ("https://forklog.com/en/tether-to-block-payments-evading-sanctions/amp",
            "ForkLog - Tether to block USDT on sanctioned wallets (policy since Dec-2023); also AMLCrypto"),
    "S32": ("https://www.emmlegal.com/news/recover-frozen-usdt-a-guide-to-tether-wallet-freezes/",
            "EMM Legal - Can frozen USDT be challenged?; also BlockSec how-to-unfreeze, Decrypt/Defiant $42.4M lawsuit"),
    "S33": ("https://fortune.com/crypto/2025/06/18/nobitex-gonjeshke-darande-predatory-sparrow-iran-israel-hack",
            "Fortune - Nobitex / Predatory Sparrow hack (2025-06-18); also PBS, Crowdfund Insider, Scorechain, Bitdefender"),
    "S34": ("https://platform.claude.com/docs/en/api/supported-regions",
            "Anthropic - Supported regions (SEEN DIRECTLY 2026-10-02; Iran not listed)"),
    "S35": ("https://the-decoder.com/anthropic-bans-companies-majority-controlled-by-china-russia-iran-and-north-korea-from-claude/",
            "The Decoder - Anthropic bans companies majority-controlled by China, Russia, Iran, North Korea (2025-09-05); also RTE, Medianama, Malay Mail"),
    "S36": ("https://community.openai.com/t/access-to-chatgpt-from-iran-without-vpn-may-2025-is-access-restored/1250817",
            "OpenAI community thread - access to ChatGPT from Iran (May 2025); weak/secondary sources only"),
    "S37": ("https://www.zoomit.ir/tech-iran/444862-tether-stablecoin-freeze-risk-iran/",
            "Zoomit / Arzdigital / Tabdeal Academy / Iranbroker - Tether freeze risk explainers for Iranian users (fa)"),
    "S38": ("https://crypto.news/iran-crypto-giant-nobitex-hit-by-sanctions-questions-reuters/",
            "crypto.news relaying Reuters - Nobitex kept processing during internet shutdown; also Yahoo Finance '700% crypto outflows'"),
    "S39": ("https://blog.amlbot.com/binance-processed-7-8-billion-worth-transactions-for-iranian-crypto-exchange-nobitex-despite-us-sanctions/",
            "AMLBot (relaying Reuters 2022) - Binance processed $7.8bn of Iran/Nobitex flows"),
    "S40": ("https://coinedition.com/tether-freezes-usdt-wallets-iran-sanctions-fear/",
            "CoinEdition - Tether freezes 112 Iran-linked wallets (single analyst, low confidence); Reuters via TradingView: Israel NBCTF 187 wallets"),
    "S41": ("https://cryptotimes.io/2026/10/02/us-treasury-blocks-russia-linked-a7-network-iran-used-to-move-money",
            "Crypto Times - US Treasury blocks Russia-linked A7 network Iran used to move money (2026-10-02); Treasury sb0644 (title only)"),
    "S42": ("docs/business-plan-full-context.md", "Internal first-pass research by the lead (2026-10-02) - unverified secondary claims on mpay and exchange limits"),
    "S43": ("https://blog.globalledger.io/research-investigations/ofac-nobitex-iranian-crypto-exchanges",
            "Global Ledger compliance brief; also transnetinc.com compliance guide, sanctionslawyers.net, Crystal 'Crypto use in Iran'"),
    "S44": ("docs/03-research/02-ir-exchanges-usdt-rails.md", "Specialist 02 research doc: policy timeline 2022-2026, Mehr-1405 halt (2026-09-30 to 10-04), 72h lock, gateway closure Dey 1403 (2024-12-26), 18-venue landscape, late-Feb-2026 shutdown - internal, not re-verified here"),
    "S45": ("https://raw.githubusercontent.com/0xB10C/ofac-sanctioned-digital-currency-addresses/lists/sanctioned_addresses_USDT.txt",
            "Public GitHub mirror of OFAC SDN digital-currency addresses (regenerated nightly from sdn_advanced.xml per its README); read directly 2026-10-02: USDT file 167 addresses (114 Tron-format), ETH file 150. Counts come from the fetch tool's summary; freshness not verifiable (GitHub API denied)"),
    "S46": ("docs/03-research/03-ir-payments-collection.md", "Specialist 03 research doc: Shaparak stance on crypto/VPN/betting merchants, card-to-card caps, tax-visibility rule, TRC20 contract corroboration - internal, not re-verified here"),
    "S47": ("docs/03-research/04-legal-tax-ir.md", "Specialist 04 research doc: CBI sole regulator, currency-smuggling fine 2x value, AML record retention >= 5 years, CBI wallet freeze dated 2026-04-24 (F13), usdtPaymentForResidents=false rule - internal, not re-verified here"),
    "S48": ("docs/03-research/06-service-catalog.md", "Specialist 06 research doc: Anthropic supported-countries page read first-hand; OpenAI supported-countries page + Caixin 2024-06-26 (API block of unsupported countries from 2024-07-09) per search summaries - internal, not re-verified here"),
}


def src(*ids: str, note: str | None = None) -> list[dict]:
    out = []
    for i in ids:
        url, title = S[i]
        item = {"url": url, "title": f"[{i}] {title}"}
        if i == "S34":
            item["note"] = "seen directly"
        elif i == "S45":
            item["note"] = "seen directly via raw.githubusercontent.com; counts from the fetch tool's summary"
        elif i in ("S42", "S44", "S46", "S47", "S48"):
            item["note"] = "internal repo file, not independently verified"
        else:
            item["note"] = note or SUMMARY
        out.append(item)
    return out


def rec(value, unit=None, conf="low", ids=(), verify=None, status=None, note=None, **extra) -> dict:
    r: dict = {"value": value}
    if unit:
        r["unit"] = unit
    r["as_of"] = AS_OF
    r["confidence"] = conf
    if ids:
        r["sources"] = src(*ids)
    if verify:
        r["verify_how"] = verify
    if status:
        r["status"] = status
    if note:
        r["note"] = note
    r.update(extra)
    return r


# ----------------------------------------------------------------------------------------------
# Hazard helpers (same maths as 05_base_rates.py)
# ----------------------------------------------------------------------------------------------
def p_year(pm: float) -> float:
    return 1.0 - (1.0 - pm) ** 12.0


def l_bucket(pm: float) -> int:
    py = p_year(pm)
    return 1 if py < 0.01 else 2 if py < 0.05 else 3 if py < 0.20 else 4 if py < 0.50 else 5


def rating(score: int) -> str:
    return "low" if score <= 4 else "medium" if score <= 9 else "high" if score <= 15 else "critical"


# ==============================================================================================
# 1. SANCTIONS TIMELINE
# ==============================================================================================
def T(name, name_fa=None, typ="exchange", designation="SDN", **kw):
    d = {"name": name, "type": typ, "designation": designation}
    if name_fa:
        d["name_fa"] = name_fa
    d.update(kw)
    return d


EVENTS = [
    dict(id="SE-2023-12-TETHER-SDN-POLICY", date="2023-12-01", date_jalali="1402-09", date_precision="month", kind="policy",
         actor="Tether", status="reported", confidence="medium",
         title="Tether adopts policy to freeze any address on the OFAC SDN list without a law-enforcement request",
         authority=[], targets=[T("Tether USDT (issuer policy)", typ="stablecoin_issuer", designation="n/a")],
         summary="Per two search summaries (ForkLog, AMLCrypto), since December 2023 Tether proactively freezes any address appearing on the OFAC SDN digital-currency list.",
         adjudication="Two independent outlets summarised; exact announcement date not seen. Treated as: every OFAC-listed USDT address will be frozen, typically within hours (multisig delay example: 44 minutes on Tron).",
         impact_on_reseller="Any USDT address that OFAC lists is effectively dead for USDT within hours. Funds that touch it afterwards risk contagion screening at providers.",
         sim_hook="tether_auto_freeze_on_sdn_listing", ids=["S31", "S30"],
         facts={"freeze_latency_example_minutes": rec(44, "minutes", "medium", ["S30"], note="single Tron example from AMLBot study; real latency varies")}),
    dict(id="SE-2025-06-18-NOBITEX-HACK", date="2025-06-18", date_jalali="1404-03-28", date_precision="day", kind="incident",
         actor="Predatory Sparrow (Gonjeshke Darande) - self-claimed", status="verified", confidence="high",
         title="Nobitex hacked; ~$90M (up to $100M) moved to vanity burn addresses; app and website taken down",
         authority=[], targets=[T("Nobitex", "نوبیتکس", designation="victim")],
         summary="Politically motivated attack during the June-2025 Iran-Israel conflict; funds were sent to unspendable 'burn' addresses rather than kept, so they are destroyed, not recoverable. Service was offline while the exchange assessed 'unauthorized access'.",
         adjudication="Reported consistently by Fortune, PBS, Crowdfund Insider, Scorechain, Bitdefender (per summaries). Restoration timeline NOT found in any summary -> UNVERIFIED.",
         impact_on_reseller="Demonstrates (a) state-level cyber risk to Iranian exchanges, (b) that balances on an exchange can vanish in hours, (c) exchange downtime of at least days. Cap exchange balances.",
         sim_hook="exchange_hack", ids=["S33"],
         facts={"loss_usd": rec(90_000_000, "USD", "high", ["S33"], note="up to ~100M per some outlets"),
                "restoration_time_days": rec(None, "days", status="UNVERIFIED", verify="Nobitex status posts / Persian news 28 Khordad - Tir 1404; ask the exchange")}),
    dict(id="SE-2025-NBCTF-187", date="2025-01-01", date_jalali="1404", date_precision="year", kind="freeze",
         actor="Israel National Bureau for Counter Terror Financing (NBCTF)", status="reported", confidence="low",
         title="Israel orders seizure of 187 crypto wallets it links to the IRGC; Tether blacklists 39 of them (~$1.5M)",
         authority=[], targets=[T("187 IRGC-linked wallets", typ="wallets", designation="seizure_order")],
         summary="Elliptic reported the wallets had received about $1.5bn of Tether historically; when Tether blacklisted 39 following the Israeli designation it froze only ~$1.5M.",
         adjudication="Single Reuters relay via TradingView per search summary; exact date unknown (2025). Shows that non-US listings produce far smaller freezes than OFAC listings.",
         impact_on_reseller="Freeze coverage depends on the listing authority: OFAC listings are acted on by Tether; others partially.",
         sim_hook=None, ids=["S40"], facts={}),
    dict(id="SE-2025-TETHER-112", date="2025-06-01", date_jalali="1404-03", date_precision="month", kind="freeze",
         actor="Tether", status="conflicting", confidence="low",
         title="Reported: Tether froze 112 Iran-linked wallets (~$700M) after the June-2025 conflict",
         authority=[], targets=[T("112 Iran-linked wallets (Tron/Ethereum)", typ="wallets", designation="tether_blacklist")],
         summary="CoinEdition (relaying one analyst) says 112 wallets holding ~700M USDT were frozen; the figure is large relative to BlockSec's total of $1.26bn frozen in all of 2025.",
         adjudication="CONFLICT: single-analyst source; not corroborated by BlockSec's annual total or by Tether's 2026 Iran statement. Use as 'possible', do not feed the simulator. Confidence low.",
         impact_on_reseller="None directly; illustrates opacity of freeze volumes.", sim_hook=None, ids=["S40", "S29"], facts={}),
    dict(id="SE-2026-01-30-ZEDCEX-ZEDXION", date="2026-01-30", date_jalali="1404-11-10", date_precision="day", kind="designation",
         actor="OFAC (U.S. Treasury)", status="verified", confidence="high",
         title="OFAC designates UK-registered exchanges Zedcex Exchange Ltd and Zedxion Exchange Ltd, financier Babak Zanjani and 7 Iranian individuals",
         authority=["E.O. 13902 (Iran financial sector)"],
         targets=[T("Zedcex Exchange Ltd", typ="exchange", country="UK (registered 2022-08)"), T("Zedxion Exchange Ltd", typ="exchange", country="UK"),
                  T("Babak Morteza Zanjani", typ="person"), T("7 Iranian individuals (6 IRGC-linked)", typ="person")],
         summary="First-ever OFAC designation of digital-asset exchanges for operating in Iran's financial sector. TRM linked the platforms to ~US$1bn of IRGC-associated stablecoin flows.",
         adjudication="Date: one summary says '2025-01-30' (typo); CoinDesk URL date 2026-01-31 and all other sources fix it at 2026-01-30. Volume claim conflicts: '$94 billion' (English summary) vs '$94 million' (Zoomit, fa) -> unresolved, immaterial for pricing. NOT the same event as 2026-06-02.",
         impact_on_reseller="Set the precedent that exchanges (not only individuals) are designable under E.O. 13902; triggered the Persian 'rumour' cycle (see next event).",
         sim_hook="ofac_exchange_designation", ids=["S10", "S11", "S12", "S13", "S14", "S15"],
         facts={"zedcex_processed_volume": rec(None, "USD", status="conflicting", conf="low", ids=["S12", "S15"],
                                              note="$94 billion (English summary) vs $94 million (Zoomit); TRM: ~$1bn IRGC-linked", verify="Read Treasury press release of 2026-01-30 (Recent Actions) and the Elliptic/TRM posts"),
                "irgc_linked_stablecoin_flows_usd": rec(1_000_000_000, "USD", "medium", ["S13"], note="TRM estimate, approximate")}),
    dict(id="SE-2026-02-RUMOUR-DENIALS", date="2026-02-01", date_jalali="1404-11-12", date_precision="approx", kind="statement",
         actor="Nobitex, OMPFinex, Zoomit, Way2Pay (Iranian media/exchanges)", status="verified", confidence="high",
         title="Iranian exchanges and outlets deny that Iranian exchanges were sanctioned: the news concerned only Zedcex and Zedxion",
         authority=[], targets=[T("Nobitex statement", "اطلاعیه نوبیتکس", typ="statement", designation="n/a")],
         summary="Nobitex said claims of sanctions on Iranian exchanges had no basis and stemmed from the OFAC listing of two UK-registered firms; Zoomit's fact-check agreed that no domestically operating exchange was on the list at that time.",
         adjudication="CORRECT AT THE TIME (January). This is the 'rumour about two foreign firms' the brief refers to. It does not contradict the 2026-06-02 designation, which is a different, later action. Exact post dates inferred from article ordering (Zoomit ids 456181/456187 precede 460670) -> approximate.",
         impact_on_reseller="Lesson: Persian-language denials are time-stamped claims; re-check the OFAC list rather than trusting a prior denial.",
         sim_hook=None, ids=["S15", "S16", "S17", "S18"], facts={}),
    dict(id="SE-2026-04-24-CBI-344M", date="2026-04-24", date_jalali="1405-02-04", date_precision="day (per specialist 04 F13)", kind="freeze",
         actor="Tether + OFAC", status="verified", confidence="high",
         title="Tether helps freeze >$344M USDT in two wallets; OFAC lists the same wallets as Central Bank of Iran digital-currency addresses the next day",
         authority=["E.O. 13902 / CBI SDN identifiers"],
         targets=[T("Central Bank of Iran (2 USDT wallets)", "بانک مرکزی ایران", typ="wallets", designation="SDN identifiers")],
         summary="Sequence matters: the freeze happened first and OFAC's listing followed the next day (TRM, Chainalysis).",
         adjudication="My own summaries gave only 'April 2026'; specialist 04's file dates it 2026-04-24 and gives $344.2M (citing the same TRM/Chainalysis coverage) - adopted, medium-high confidence. Amount >$344M consistent across TRM, Chainalysis, 04 and the later Tether statement.",
         impact_on_reseller="Shows OFAC/Tether can freeze nine-figure USDT sums on Tron within a day; the central bank itself held USDT to support the rial (Elliptic: >= $507M accumulated).",
         sim_hook="tether_mass_freeze", ids=["S21", "S22", "S24", "S47"],
         facts={"usd_frozen": rec(344_000_000, "USD", "high", ["S21", "S22", "S24", "S47"], note="'more than'; 04 gives 344.2M")}),
    dict(id="SE-2026-06-02-FOUR-EXCHANGES", date="2026-06-02", date_jalali="1405-03-12", date_precision="day", kind="designation",
         actor="OFAC (U.S. Treasury) - 'Economic Fury'", status="verified", confidence="high",
         title="OFAC designates Nobitex, Wallex, Bitpin and Ramzinex plus four Nobitex leaders",
         authority=["E.O. 13902 (Iran financial sector)", "E.O. 13224 (counter-terrorism)"],
         targets=[T("Nobitex", "نوبیتکس"), T("Wallex", "والکس"), T("Bitpin", "بیت‌پین"), T("Ramzinex", "رمزینکس"),
                  T("Amir Hossein Rad (chairman, co-founder, former CEO)", typ="person"), T("Seyed Ali Khoee (current CEO)", typ="person"),
                  T("Ali Kharrazi (also rendered Aghamir) - co-founder", typ="person"), T("Mohammad Kharrazi (also rendered Aghamir) - co-founder", typ="person")],
         summary="Treasury press release sb0519 ('Economic Fury Targets Iran's Largest Digital Asset Exchange for Terror Finance and Sanctions Evasion'). Nobitex >50% of Iranian digital-asset inflows in 2025; Wallex 12%; Bitpin ~10%; Ramzinex >$2.45bn processed since 2018. The four = ~$7.7bn = 78% of attributed Iranian crypto volume in 2025 (TRM). Elliptic: >= $40bn sent/received.",
         adjudication="REAL - confidence high (~97%). Evidence ladder: (1) Treasury press-release title/URL sb0519 and @USTreasury post surfaced by search; (2) OFAC FAQ 1257 names Nobitex, Wallex, Bitpin, Ramzinex (and Aban Tether) as designated under E.O. 13902; (3) six independent analytics/compliance firms (TRM, Chainalysis, Elliptic, Scorechain, Crystal, Global Ledger) and law-firm alerts; (4) wire/news: The Block, Cointelegraph, The National, IranWire, Iran International, Radio Farda, Euronews Persian, TGJU; (5) the four exchanges' own statements acknowledging the listing while saying services continue. The January 'rumour' denials concern a different event. Not directly seen: full press-release text, SDN entries, any published wallet addresses.",
         impact_on_reseller="The four largest domestic exchanges are SDNs: USDT withdrawn from them to any provider with screening is direct SDN exposure. Non-US persons dealing with them face designation risk per FAQ 1257; stablecoin issuers have a legal basis for bulk freezes.",
         sim_hook="ofac_exchange_designation", ids=["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8", "S9", "S20", "S43"],
         facts={"share_of_iran_attributed_volume_2025_pct": rec(78, "pct", "medium", ["S1"], note="~USD 7.7bn; one cluster of summaries"),
                "nobitex_share_of_inflows_2025_pct": rec(50, "pct", "high", ["S1", "S3", "S4", "S5", "S9"], note="'more than 50%' per Treasury as relayed"),
                "wallex_share_pct": rec(12, "pct", "high", ["S5", "S9"]), "bitpin_share_pct": rec(10, "pct", "medium", ["S9", "S20"], note="approximately"),
                "ramzinex_processed_usd": rec(2_450_000_000, "USD", "medium", ["S9"], note="'more than $2.45bn since 2018'"),
                "elliptic_exchange_flows_usd": rec(40_000_000_000, "USD", "medium", ["S5"], note="'at least $40bn' sent or received"),
                "published_wallet_addresses": rec(None, "count", status="UNVERIFIED", verify="Search OFAC SDN list (sanctionslist.ofac.treas.gov) for 'Digital Currency Address' entries under each entity/individual")}),
    dict(id="SE-2026-06-03-EXCHANGE-STATEMENTS", date="2026-06-03", date_jalali="1405-03-13", date_precision="approx", kind="statement",
         actor="Nobitex, Bitpin, Wallex, Ramzinex", status="verified", confidence="high",
         title="The four exchanges state that user assets are safe and services continue",
         authority=[], targets=[T("Exchange statements", typ="statement", designation="n/a")],
         summary="Nobitex: sanctions scenarios were foreseen for years; assets kept per its security procedures. Bitpin: deposits, withdrawals and markets operate as usual; the listing concerns the companies' legal structure. Wallex: private independent company. A joint 'guarantee of asset security and service continuity' was reported by Bankavl.",
         adjudication="Statements are self-interested; they confirm the designation (no denial this time) but are not evidence about solvency or about third-party treatment of withdrawals. Persian community posts report account/wallet restrictions after moving funds to other wallets and foreign exchanges (low confidence).",
         impact_on_reseller="Do not rely on exchange assurances; counterparties abroad apply their own screening.", sim_hook=None,
         ids=["S19", "S38"], facts={}),
    dict(id="SE-2026-07-16-CBI-131M", date="2026-07-16", date_jalali="1405-04-25", date_precision="day", kind="freeze",
         actor="OFAC + Tether", status="verified", confidence="high",
         title="OFAC adds four more Central Bank of Iran wallets; Tether freezes $131M (Tron addresses that previously held >$165M)",
         authority=["E.O. 13902 / CBI SDN identifiers"], targets=[T("Central Bank of Iran (4 USDT wallets)", "بانک مرکزی ایران", typ="wallets", designation="SDN identifiers")],
         summary="Came after a ceasefire between the US and Iran broke down and strikes resumed. Total CBI USDT blocked ~ $475M (344 + 131); Elliptic estimates the CBI had accumulated >= $507M of USDT.",
         adjudication="Consistent across CoinDesk, Bitcoin Foundation and Tether's later statement.",
         impact_on_reseller="Second CBI wave in three months -> 'address listing wave' events recur (~0.2/month); expect Iranian USDT/IRT spread spikes on such news.",
         sim_hook="tether_mass_freeze", ids=["S23", "S24"],
         facts={"usd_frozen": rec(131_000_000, "USD", "high", ["S23", "S24"]), "cbi_total_blocked_usd": rec(475_000_000, "USD", "medium", ["S23"]),
                "cbi_estimated_usdt_holdings_usd": rec(507_000_000, "USD", "medium", ["S23"], note="Elliptic, 'at least'")}),
    dict(id="SE-2026-08-07-ABAN-SHELBIT", date="2026-08-07", date_jalali="1405-05-16", date_precision="day", kind="designation",
         actor="OFAC (U.S. Treasury)", status="verified", confidence="high",
         title="OFAC designates Aban Tether and Shelbit Exchange with operator Siavash Kayvanpour and four front companies (Georgia, Poland, UAE)",
         authority=["E.O. 13902"],
         targets=[T("Aban Tether", "آبان تتر"), T("Shelbit Exchange", typ="exchange"), T("Siavash Kayvanpour", typ="person"), T("4 affiliated front companies (Georgia, Poland, UAE)", typ="company")],
         summary="IRGC-linked wallets sent >$1M to Shelbit and Shelbit returned >$2M; Kayvanpour allegedly sent >$2M to Nobitex. FAQ 1257 later lists Aban Tether next to the four June exchanges.",
         adjudication="Confirmed by CoinDesk, Mishcon, TFTC, CoinPaprika, FinCrime Agent, VeriHound, Crypto Times and FAQ 1257 (per summaries). Magnitude headlines differ ('$5M money-laundering case' vs 'Iran's $4B IRGC crypto scheme'): use the OFAC-attributed direct flows (> $1M/ > $2M); the $4B figure is unexplained -> low confidence. Aban Tether is a major retail USDT exchange: the owner's earlier fee research cited it.",
         impact_on_reseller="Five of the best-known domestic USDT venues (Nobitex, Wallex, Bitpin, Ramzinex, Aban Tether) are now SDNs. Remove them from any allowed-USDT-source list.",
         sim_hook="ofac_exchange_designation", ids=["S26", "S8"],
         facts={"direct_irgc_flows_to_shelbit_usd": rec(1_000_000, "USD", "medium", ["S26"], note="'over $1 million'"),
                "headline_magnitude_usd": rec(None, "USD", status="conflicting", conf="low", ids=["S26"], note="$5M vs $4B in different headlines", verify="Read Treasury press release 'Treasury Sanctions Crypto Exchanges Funding Iran's IRGC and Enabling Illicit Finance' (2026-08-07)")}),
    dict(id="SE-2026-08-24-OPERATION-ECONOMIC-OUTCAST", date="2026-08-24", date_jalali="1405-06-02", date_precision="day", kind="policy",
         actor="U.S. Treasury / OFAC", status="verified", confidence="high",
         title="Treasury launches 'Operation Economic Outcast': secondary-sanctions risk extended to foreign entities across five Iranian sectors (digital assets, aviation, gold, shipping, technology)",
         authority=["E.O. 13902 sector determinations"],
         targets=[T("Foreign entities dealing in five Iranian sectors", typ="policy", designation="secondary_sanctions_risk")],
         summary="Five general licences (education, personal remittances, conferences, sports, academic exchanges) were suspended effective 2026-09-08; GL BB allowed wind-down of previously authorised transactions only until that date, with payments into blocked interest-bearing US accounts.",
         adjudication="Seven law-firm alerts (Paul Hastings, Orrick, Baker McKenzie, Davis Polk, Paul Weiss, Cassidy Levy Kent, Regtechtimes) agree on date and structure (per summaries). The suspended GLs are NOT about crypto exchanges: no wind-down general licence for Nobitex/Wallex/Bitpin/Ramzinex/Aban Tether was seen in any summary (UNVERIFIED).",
         impact_on_reseller="Raises the cost for non-US providers of dealing with Iran-linked flows (de-risking). Personal-remittance GL gone -> do not assume any GL covers the business.",
         sim_hook="sanctions_wave", ids=["S27"], facts={"gl_suspension_effective": rec("2026-09-08", "date", "high", ["S27"])}),
    dict(id="SE-2026-09-17-BITBANK", date="2026-09-17", date_jalali="1405-06-26", date_precision="day", kind="designation",
         actor="OFAC (U.S. Treasury) - Operation Economic Outcast", status="verified", confidence="high",
         title="OFAC designates BitBank, a Babak Zanjani-controlled exchange, for alleged Bitcoin transfers of hundreds of millions of dollars to the IRGC (Jun-Jul 2026)",
         authority=["E.O. 13902"], targets=[T("BitBank", typ="exchange"), T("Hormuz Safe Marine Services Authority (customer cited)", typ="entity", designation="cited")],
         summary="Treasury press release titled 'Operation Economic Outcast Disrupts Digital Asset Exchange Enabling the Iranian Regime'.",
         adjudication="Consistent across Hoodline, Crowdfund Insider, TFTC, Startup Fortune, TRM, VOA and a copy of the Treasury release (per summaries).",
         impact_on_reseller="Third exchange-designation action in 3.5 months; hazard prior for the next one is derived in 05_base_rates.py.",
         sim_hook="ofac_exchange_designation", ids=["S28"], facts={}),
    dict(id="SE-2026-09-28-TETHER-550M-SENATE", date="2026-09-28", date_jalali="1405-07-06", date_precision="approx", kind="statement",
         actor="Tether; Senate Permanent Subcommittee on Investigations (minority staff)", status="reported", confidence="medium",
         title="Tether says it helped freeze ~$550M of Iran-linked USDT in 2026; Senate PSI minority report: 846 sanctioned Iran-linked wallets, 84% almost exclusively USDT, ~$35M slipped past",
         authority=[], targets=[T("Tether USDT", typ="stablecoin_issuer", designation="scrutiny")],
         summary="Tether: April $344M (2 wallets) + July >$130M (4 wallets) within >$4.9bn frozen globally. Sen. Blumenthal referred the findings to Treasury and DOJ citing possible sanctions/BSA violations.",
         adjudication="Totals are Tether's own and the Senate report is a minority (Democratic) staff product. Cumulative global freezes: Tether >$4.9bn vs BlockSec $5.69bn/9,597 addresses (2026-07-26): different definitions/dates.",
         impact_on_reseller="Political pressure on Tether to freeze more broadly (proactively) -> raises treasury-wallet freeze hazard (SAN-08/TKN-01).",
         sim_hook="tether_policy_tightening", ids=["S24", "S25", "S29"],
         facts={"iran_linked_frozen_2026_usd": rec(550_000_000, "USD", "medium", ["S24", "S25"], note="one Tether statement echoed by many outlets; components independently sourced"),
                "senate_wallets_count": rec(846, "count", "medium", ["S25"]), "senate_usdt_only_share_pct": rec(84, "pct", "medium", ["S25"]),
                "slipped_past_usd": rec(35_000_000, "USD", "medium", ["S25"])}),
    dict(id="SE-2026-10-02-A7-NETWORK", date="2026-10-02", date_jalali="1405-07-10", date_precision="day", kind="designation",
         actor="OFAC (U.S. Treasury) - Operation Economic Outcast", status="reported", confidence="low",
         title="Reported: Treasury action against a Russia-linked A7 network Iran used to move money (press release sb0644 title surfaced in the same search)",
         authority=[], targets=[T("A7 network", typ="network", designation="reported")],
         summary="Only one trade-press headline (Crypto Times, dated 2026-10-02) and the title of Treasury release sb0644 ('Operation Economic Outcast Takes Unprecedented Action Against Sanctions Evasion Network Used by Iran') were seen.",
         adjudication="Detail not available. That sb0644 is the same action as the 2026-10-02 article is probable but NOT verified (release date not seen). Included only to show the cadence of actions; verify on OFAC Recent Actions.",
         impact_on_reseller="Cadence evidence only.", sim_hook=None, ids=["S41"], facts={}),
    dict(id="SE-2026-CONTEXT-WAR", date=None, date_jalali=None, date_precision="unknown (before 2026-06-02; start date not established)", kind="context",
         actor="US/Israel/Iran", status="reported", confidence="low",
         title="2026 US-Israeli strikes on Iran, a ceasefire that later broke down, and internet blackouts (context for correlated risks)",
         authority=[], targets=[T("Iran (macro/security context)", typ="context", designation="n/a")],
         summary="Treasury/The Block text refers to 'internet blackouts that followed U.S. combat operations in Iran'; CoinDesk (2026-07-16) says the CBI listing followed the ceasefire breakdown; Reuters (via crypto.news) says Nobitex kept processing during a government-imposed shutdown. Specialist 02's timeline places a near-total internet shutdown in late February 2026 with Nobitex still operating (citing Cointelegraph and Crypto.jobs summaries).",
         adjudication="Start date of the 2026 conflict was not established from the summaries; the Treasury text relayed on 2026-06-02 already refers to blackouts that followed US combat operations, so it began before then. No date is asserted here. The macro specialist (08) owns this scenario; this record only links INF/EXC/SAN risks.",
         impact_on_reseller="Correlated shocks: internet shutdown + exchange attacks + sanctions waves + FX spikes.", sim_hook="war_escalation",
         ids=["S9", "S23", "S38", "S44"], facts={}),
]


def build_timeline() -> dict:
    events = []
    for e in EVENTS:
        ev = OrderedDict()
        for k in ("id", "date", "date_jalali", "date_precision", "title", "kind", "actor", "status", "confidence", "authority", "targets",
                  "summary", "adjudication", "impact_on_reseller", "sim_hook"):
            ev[k] = e[k]
        ev["facts"] = e["facts"]
        ev["sources"] = src(*e["ids"])
        events.append(ev)
    events.sort(key=lambda x: (x["date"] is None, x["date"] or ""))

    ent = lambda id_, name, fa, status, date, ev_id, role, allow, **kw: dict(id=id_, name=name, name_fa=fa, sdn_status=status, designation_date=date, event_id=ev_id, role=role, usdt_source_allowed=allow, **kw)
    unverified = lambda: rec(None, "sdn_status", status="UNVERIFIED", verify="Search the OFAC SDN list (Sanctions List Search) for the exact name and Persian/Latin variants; check Treasury Recent Actions since 2026-09-17")
    entities = [
        ent("nobitex", "Nobitex", "نوبیتکس", "sdn", "2026-06-02", "SE-2026-06-02-FOUR-EXCHANGES", "largest IR exchange (>50% inflows 2025)", False),
        ent("wallex", "Wallex", "والکس", "sdn", "2026-06-02", "SE-2026-06-02-FOUR-EXCHANGES", "2nd largest (12% inflows 2025)", False),
        ent("bitpin", "Bitpin", "بیت‌پین", "sdn", "2026-06-02", "SE-2026-06-02-FOUR-EXCHANGES", "~10% inflows 2025", False),
        ent("ramzinex", "Ramzinex", "رمزینکس", "sdn", "2026-06-02", "SE-2026-06-02-FOUR-EXCHANGES", ">$2.45bn processed since 2018", False),
        ent("abantether", "Aban Tether", "آبان تتر", "sdn", "2026-08-07", "SE-2026-08-07-ABAN-SHELBIT", "retail USDT exchange", False),
        ent("shelbit", "Shelbit Exchange", None, "sdn", "2026-08-07", "SE-2026-08-07-ABAN-SHELBIT", "IRGC-linked flows via front companies", False),
        ent("bitbank", "BitBank", None, "sdn", "2026-09-17", "SE-2026-09-17-BITBANK", "Zanjani-controlled", False),
        ent("zedcex", "Zedcex Exchange Ltd", None, "sdn", "2026-01-30", "SE-2026-01-30-ZEDCEX-ZEDXION", "UK-registered", False),
        ent("zedxion", "Zedxion Exchange Ltd", None, "sdn", "2026-01-30", "SE-2026-01-30-ZEDCEX-ZEDXION", "UK-registered", False),
        ent("cbi_wallets", "Central Bank of Iran (USDT wallets)", "بانک مرکزی ایران", "sdn_identifiers", "2026-04-24", "SE-2026-04-24-CBI-344M", "6 wallets listed 2026-04-24 (2) and 2026-07-16 (4)", False),
    ]
    watch = []
    for nm, fa in (("Tabdeal", "تبدیل"), ("Exir", "اکسیر"), ("OMPFinex", "او ام پی فینکس"), ("Tetherland", "تترلند"), ("Novin Tether", "نوین تتر"),
                   ("Excoino", "اکسکوینو"), ("Bit24", "بیت۲۴"), ("Arzinja", "ارزینجا")):
        watch.append(dict(id=nm.lower().replace(" ", ""), name=nm, name_fa=fa, sdn_status=unverified(), usdt_source_allowed="conditional",
                          note="Not named in any retrieved designation summary; absence is not proof. FAQ 1257: any digital-asset exchange operating in Iran's financial sector is designable."))

    n_designated = rec(7, "exchanges", "medium", ["S8", "S26", "S28", "S5"], note="Nobitex, Wallex, Bitpin, Ramzinex, Aban Tether, Shelbit, BitBank (domestic-market) + 2 UK-registered (Zedcex, Zedxion) not counted")
    current = OrderedDict(
        domestic_market_exchanges_designated=n_designated,
        designation_actions_since_2026_06_02=rec(3, "actions", "high", ["S1", "S26", "S28"], note="2026-06-02, 2026-08-07, 2026-09-17"),
        events_per_month_since_2026_01_30=rec(0.497, "events/month", "medium", ["S5", "S12", "S26", "S28"], note="4 events / 8.05 months; formula in scripts/research/05_base_rates.py"),
        events_per_month_since_2026_06_02=rec(0.748, "events/month", "medium", ["S1", "S26", "S28"], note="3 events / 4.01 months"),
        all_actions_per_month_since_2026_01_30=rec(0.745, "events/month", "medium", ["S5", "S12", "S21", "S23", "S26", "S28"], note="6 actions (4 exchange designations + 2 CBI address-listing waves) / 8.05 months; since 2026-06-02: 4 / 4.01 = 0.998/month; mean gap 46.0 days (specialist 04's 4-action subset: 48.7)"),
        p_at_least_one_new_action_next_3_months=rec(0.893, "probability", "low", [], low=0.775, high=0.95,
                                                    note="exchange designations only: 1-exp(-0.497*3)=77.5% (0.748/month: 89.4%); ALL actions incl. CBI waves: 89.3% (0.745/month) to 95.0% (0.998/month). Model, not forecast."),
        cbi_address_waves_per_month=rec(0.248, "events/month", "medium", ["S21", "S22", "S23"], note="2 waves (2026-04-24, 2026-07-16) / 8.05 months -> P(>=1 in a month) 22%"),
        p_next_designation_of_an_undesignated_domestic_exchange_per_month=rec(0.06, "probability/month", "low", ["S8", "S26", "S28"], low=0.02, high=0.15,
                                                                           note="h = min(1, r/N_rem)*s with r=1.75 exchanges/month; pool 20 (specialist 02's 18 venues + Shelbit + BitBank), N_rem 13, s 0.45 -> 6.0% (pool 15, s 0.3 -> 6.5%); grid 2.0%-17.5%"),
        wind_down_general_license_for_designated_exchanges=rec(None, "bool", status="UNVERIFIED",
                                                               verify="OFAC Recent Actions 2026-06-02 / 2026-08-07 / 2026-09-17: look for any General License naming the exchanges; none seen in any summary"),
        tether_policy_freeze_ofac_listed_addresses=rec(True, "bool", "medium", ["S31", "S30"]),
    )
    return OrderedDict(
        meta=OrderedDict(
            title="Sanctions & enforcement timeline - Iran-linked digital assets (2023-12 to 2026-10-02)",
            owner_agent="05-sanctions-counterparty-risk", as_of=AS_OF,
            status_semantics={"verified": ">=3 independent sources incl. a primary cue (Treasury/OFAC title, FAQ) or the affected parties' own statements",
                              "reported": "1-2 sources or only secondary summaries; date/amount imprecise",
                              "conflicting": "sources disagree on a material fact; see adjudication"},
            how_to_use="Simulator: events with sim_hook map to scenario event types (ofac_exchange_designation, tether_mass_freeze, sanctions_wave, tether_policy_tightening, exchange_hack, war_escalation). Ops: 'entities' is the allow/deny source for USDT-source selection; refresh monthly from OFAC Recent Actions.",
            evidence_limits="29 web searches (summaries only). WebFetch blocked for treasury.gov, ofac.treasury.gov, trmlabs, elliptic, chainalysis, scorechain, coindesk, theblock, blocksec, zoomit, law-firm sites; the session-wide WebSearch budget was exhausted. Only S34 was read directly. No page was archived.",
            coverage_gaps=["2024 and most of 2025 OFAC Iran-crypto actions were not retrievable in this run", "Exact April-2026 CBI action day", "Whether OFAC published exchange wallet addresses on the SDN list",
                           "Any wind-down general licence for the designated exchanges", "Treasury press-release full texts (sb0519, sb0644, 2026-08-07, 2026-09-17)"],
            not_legal_advice="Compliance analysis only; confirm with a licensed sanctions/Iranian-law professional (CLAUDE.md s3.4)."),
        events=events, entities=entities, watchlist_exchanges=watch, current_state=current)


# ==============================================================================================
# 2. RISK REGISTER
# ==============================================================================================
CONTROLS = [
    ("CTL-01", "USDT source allow-list", "preventive", "Buy USDT only from venues NOT on the OFAC SDN list (daily re-check against data/sanctions_timeline.json 'entities' and the live SDN file); log provenance per lot. Never route funds to hide their origin."),
    ("CTL-02", "SDN address screening", "preventive+detective", "Download the OFAC SDN list daily (public data); screen every inbound sender, outbound destination, provider deposit address and held balance; block exact matches; re-screen holdings after each list update. Use commercial analytics only if the vendor lawfully contracts with an Iran-based business (US/EU vendors often cannot) - never via someone else's identity."),
    ("CTL-03", "Tether blacklist pre-check", "preventive", "Before every outbound transfer and on every inbound, call isBlackListed(address) on the USDT contract (Tron and Ethereum) and refuse flagged counterparties; poll watched addresses hourly."),
    ("CTL-04", "Float caps per counterparty", "preventive", "Provider float <= eps x equity (eps 3-5%); exchange balance <= (lock days + 1) days of conversion needs, i.e. about 4 days under the 72h withdrawal lock (specialist 02 C13: USDT bought with Toman cannot leave the exchange for 3 days, so a 1-day cap is structurally impossible); treasury wallet <= 2 days of outflow; hot wallet <= 1 day; review weekly (see 05_base_rates.py section 3)."),
    ("CTL-05", "Just-in-time top-ups and sweep cadence", "preventive", "Fund providers per order batch (<= 4h) not in bulk; sweep idle balances back at least weekly where the provider allows; batch transfers to cut fees; pre-fund a 3-day USDT buffer only in a segregated, screened wallet."),
    ("CTL-06", "Counterparty diversification", "preventive", "At least 2 active providers per product line and 2 conversion rails; no single provider > 60% of float; no single rail > 50% of collection."),
    ("CTL-07", "Proof-of-liquidity tests", "detective", "Monthly test withdrawal/refund of a small balance from each provider and exchange; record latency; red if > 72h or refused."),
    ("CTL-08", "Kill switches", "corrective", "Automatic pause of a provider/product/rail when a red KRI fires (latency, reconciliation mismatch, new designation naming the counterparty, freeze event); owner-only manual override with audit log."),
    ("CTL-09", "Multi-signature treasury and cold reserve", "preventive", "2-of-3 multisig (Tron account permissions / Safe on EVM) across independent devices and people; reserves in cold storage; hot wallet holds only the JIT amount."),
    ("CTL-10", "Address allow-list with cool-down and dual approval", "preventive", "New destination addresses are inactive for 24-72h; allow-list labelled; dual approval above threshold; per-day outflow limits; micro test transfer for new provider addresses."),
    ("CTL-11", "Address-poisoning hygiene", "preventive", "Never copy addresses from transaction history; compare full string; use labelled allow-list/QR from the provider dashboard; dedicated signing UI shows full address."),
    ("CTL-12", "Strong authentication", "preventive", "Hardware keys/passkeys or TOTP for every privileged account; no SMS-only recovery; Telegram two-step verification + periodic active-session review; separate admin identities from personal ones."),
    ("CTL-13", "Segregation of duties and maker-checker", "preventive", "Refunds, card reveals, price overrides and withdrawals need two people above thresholds; append-only audit log (the ledger); rotation and leave policy."),
    ("CTL-14", "Card-detail handling", "preventive", "Reveal-on-demand with logging, auto-expiry/redaction after delivery, encrypted storage, minimal retention; no card data in chat transcripts."),
    ("CTL-15", "Incident-response playbooks and drills", "corrective", "Runbooks: provider freeze, exchange halt, key compromise, designation event, internet blackout, wrong-address transfer; quarterly tabletop; pre-drafted customer notices."),
    ("CTL-16", "Record-keeping and provenance", "detective", "Retain KYC, orders, fund provenance tags, screening logs, decision records. Iranian AML law minimum >= 5 years (specialist 04 F34, low confidence); recommended 10 years for sanctions-related records (US IEEPA limitation period was extended to 10 years in 2024 - analyst recollection, verify); tamper-evident storage."),
    ("CTL-17", "Customer risk disclosure and refund policy", "preventive", "Per-product risk_label and restriction_note shown before payment; explicit third-party-suspension and refund wording; acceptance logged. Never ask or help customers misstate residency."),
    ("CTL-18", "Legal counsel retainer", "preventive", "Iranian-law and sanctions counsel: pre-launch opinion, quarterly review of new designations, review of customer terms; documented advice."),
    ("CTL-19", "Multi-feed price oracle and circuit breaker", "preventive", "Median of >= 3 independent USDT/IRT feeds, staleness checks, deviation cap, automatic quote suspension; short price-lock TTL."),
    ("CTL-20", "Multi-rail Toman collection", "preventive", "Gateway + card-to-card + wallet with per-rail caps and fallback ordering."),
    ("CTL-21", "Business continuity for connectivity loss", "corrective", "Offline order queue, status page, SMS/Bale fallbacks, hosting in more than one lawful location, documented degraded mode."),
    ("CTL-22", "Counterparty due-diligence file", "preventive", "Per provider/exchange: entity, jurisdiction, licences, ToS snapshot (hash + date), support-response test, review sentiment, written answer on Iran-resident eligibility."),
    ("CTL-23", "Customer USDT inbound disabled by default", "preventive", "Do not accept customer-paid USDT until counsel approves a screening policy; Toman rails only. Rationale: most Iranian USDT originates at SDN exchanges; specialist 04 independently recommends usdtPaymentForResidents=false on legal-classification grounds."),
    ("CTL-24", "Counterparty-loss reserve", "corrective", "Fund a reserve from margin at the modelled expected-loss rate (05_base_rates.py section 4) and top it up after any event."),
    ("CTL-25", "Monitoring and watchlists", "detective", "OFAC Recent Actions and Treasury press feed, Persian-language news, on-chain alerts on provider/exchange deposit wallets, Tether freeze feed; daily digest to the compliance owner."),
    ("CTL-26", "Backup, DR and succession", "corrective", "Encrypted off-site backups with restore tests; sealed key-recovery and succession instructions held with counsel; no single person holds all signing authority."),
    ("CTL-27", "Vendor-policy watch", "detective", "Monthly snapshot of each vendor's supported-countries/ToS page (hash + date); alert on change; product label updated accordingly."),
    ("CTL-28", "Card-to-card receipt verification", "preventive", "Confirm credit through bank notification/API, not screenshots; fulfil only after settlement; flag duplicate references."),
    ("CTL-29", "Application security hygiene", "preventive", "Dependency pinning and review, SAST, WAF/rate limits, secrets in a vault, least-privilege API keys, pen-test before go-live."),
    ("CTL-30", "Data minimisation and encryption", "preventive", "Collect only what is needed; encrypt PII at rest; retention schedule; breach-notification runbook."),
]

KRI_PROVIDER = ["Test withdrawal/refund latency > 24h (amber) / > 72h or refused (red)", "Support first-response > 48h (amber) / > 7 days (red)",
                "Public rating down >= 0.5 points in 30 days or new 'funds blocked' complaints cluster", "Unannounced change of fees/limits/ToS/domain/WHOIS/hosting",
                "Provider deposit-wallet sweeps to a single unknown address (on-chain)", "Reconciliation difference between provider balance and our ledger > 0.5%"]
KRI_EXCHANGE = ["USDT withdrawal failure rate > 2% (amber) / > 10% (red)", "Exchange named in OFAC/Treasury text or Persian sanctions news (red)", "Withdrawal queue > 24h",
                "Status-page incidents / unexplained maintenance", "Hot-wallet outflow anomaly (on-chain)"]
KRI_SAN = ["Days since last OFAC Iran-crypto action < 30 (amber: expect another)", "Count of designated Iranian exchanges (now 7) increases (red)", "Any screened counterparty address matches SDN or Tether blacklist (red)"]


def R(id_, cat, title, desc, pm, lo, hi, imp, itype, params, *, secondary=(), triggers, kri, ctrls, dL=0, dI=0, conf="low", psrc=(), pnote="",
      applies=("always",), scope="platform", groups=(), pverify=None):
    return dict(id=id_, cat=cat, title=title, desc=desc, pm=pm, lo=lo, hi=hi, imp=imp, itype=itype, params=params, secondary=list(secondary),
                triggers=triggers, kri=kri, ctrls=ctrls, dL=dL, dI=dI, conf=conf, psrc=list(psrc), pnote=pnote, applies=list(applies), scope=scope,
                groups=list(groups), pverify=pverify)


F = "float_freeze_pct"
D = "downtime_hours"
N = "fine_irt"
M = "demand_multiplier"
C = "fee_change"

RISKS = [
    # ---------------------------------------------------------------- SANCTIONS
    R("SAN-01", "sanctions", "Next OFAC designation hits the exchange used for Toman-to-USDT",
      "OFAC designates the (so far undesignated) Iranian exchange the business uses, or its operator. Basis: three domestic-market designation actions in 4.0 months (2026-06-02, 08-07, 09-17; 7 exchanges) and FAQ 1257 stating that any digital-asset exchange operating in Iran's financial sector is designable. Its USDT hot wallets would be frozen by Tether, breaking USDT withdrawals.",
      0.06, 0.02, 0.15, 4, F, {"scope": "exchange_balance", "pct": 0.6, "duration_days": 30, "recovery_prob": 0.8},
      secondary=[{"type": C, "params": {"target": "usdt_irt_spread_pct", "delta_pp": 1.0, "duration_days": 60}}, {"type": D, "params": {"scope": "toman_to_usdt_rail", "hours_median": 120, "hours_p90": 360}}],
      triggers=["OFAC Recent Actions entry naming the exchange or its owners", "Tether freezes the exchange's hot wallets", "Exchange statement that 'only the legal structure was listed'", "Counterparties start rejecting deposits from its addresses"],
      kri=KRI_SAN + KRI_EXCHANGE, ctrls=["CTL-01", "CTL-04", "CTL-06", "CTL-08", "CTL-18", "CTL-22", "CTL-25"], dL=0, dI=1, conf="medium",
      psrc=["S1", "S8", "S26", "S28", "S44"], pnote="h = min(1, r/N_rem) x s; r = 1.75 exchanges/month; pool 20 (specialist 02's 18-venue landscape + Shelbit + BitBank), N_rem 13, size-bias s 0.45 for mid-size (Tier B) venues -> 6.0%; pool 15 / s 0.3 -> 6.5%; grid 2.0%-17.5% (05_base_rates.py).",
      scope="exchange", groups=["SANCTIONS_WAVE", "WAR_ESCALATION"]),
    R("SAN-02", "sanctions", "Retroactive taint of funds bought from an exchange later designated",
      "USDT acquired before a venue was designated is re-scored by a provider's analytics (or asked about in a source-of-funds review) and treated as sanctioned-entity exposure.",
      0.02, 0.005, 0.06, 4, F, {"scope": "provider_float", "pct": 1.0, "duration_days": 60, "recovery_prob": 0.4},
      secondary=[{"type": D, "params": {"scope": "fulfilment_pipeline", "hours_median": 72, "hours_p90": 240}}],
      triggers=["Source exchange designated after the purchase", "Provider asks for source-of-funds evidence", "Analytics vendor re-labels historical clusters"],
      kri=["% of treasury USDT with provenance tag = venue later designated", "Provider source-of-funds / KYC requests received", *KRI_SAN], ctrls=["CTL-01", "CTL-04", "CTL-05", "CTL-16", "CTL-18"], dL=1, dI=1,
      psrc=["S2", "S3"], pnote="Prior; compliance firms advise re-screening of holdings after each list update (S2, S3).", scope="provider", groups=["SANCTIONS_WAVE"]),
    R("SAN-03", "sanctions", "Business, owner or associates designated or listed",
      "Under E.O. 13902/13224 'material assistance' theories a facilitator of designated exchanges or IRGC-linked flows could itself be designated; all USDT would be frozen and all foreign providers would terminate.",
      0.001, 0.0002, 0.004, 5, F, {"scope": "all_usdt", "pct": 1.0, "duration_days": None, "recovery_prob": 0.0},
      secondary=[{"type": M, "params": {"segment": "all", "multiplier": 0.0, "duration_days": None}}],
      triggers=["Large flows with SDN-listed counterparties", "Identification as a facilitator in a Treasury narrative", "Customers or partners later designated"],
      kri=["Any direct exposure of our addresses to SDN entities", "Counsel flags new theory of exposure"], ctrls=["CTL-01", "CTL-02", "CTL-16", "CTL-18", "CTL-23"], dL=1, dI=0,
      psrc=["S8"], pnote="Tail-risk prior; FAQ 1257 describes designation for material support (S8). No observed case of small resellers being designated.", scope="owner", groups=["SANCTIONS_WAVE"]),
    R("SAN-04", "sanctions", "Non-US counterparties de-risk Iran-linked flows after Operation Economic Outcast",
      "Fear of secondary sanctions (five sectors incl. digital assets) makes foreign providers, OTC desks and vendors raise fees, add friction or exit Iran-linked flows.",
      0.04, 0.015, 0.10, 4, C, {"target": "provider_topup_pct", "delta_pp": 1.5, "duration_days": 90},
      secondary=[{"type": M, "params": {"segment": "all", "multiplier": 0.85, "duration_days": 60}}],
      triggers=["New Treasury/State advisories", "Sector determinations", "Providers publish stricter restricted-jurisdiction lists"],
      kri=["Provider ToS/restricted-jurisdiction changes", "Provider fee/limit changes", "Peers report account closures"], ctrls=["CTL-06", "CTL-18", "CTL-22", "CTL-25", "CTL-27"], dL=0, dI=1,
      psrc=["S27"], pnote="Law-firm alerts describe extended secondary-sanctions exposure from 2026-08-24 (S27); probability is a prior.", scope="provider", groups=["SANCTIONS_WAVE"]),
    R("SAN-05", "sanctions", "OFAC address-listing / Tether freeze wave on Iran-linked USDT shocks liquidity and spreads",
      "CBI-style listings (April, July 2026) and mass freezes spook the Iranian USDT market: wider USDT/IRT spread and temporary liquidity gaps while the quote lock is open.",
      0.22, 0.10, 0.35, 2, C, {"target": "usdt_irt_spread_pct", "delta_pp": 1.0, "duration_days": 7},
      triggers=["OFAC lists new Iranian USDT addresses", "Tether announces Iran-linked freezes", "Senate/Treasury statements on stablecoins"],
      kri=["USDT/IRT premium vs 7-day median > 2% (amber) / > 4% (red)", "Spread between feeds > 1%"], ctrls=["CTL-04", "CTL-05", "CTL-19"], dL=0, dI=1, conf="medium",
      psrc=["S21", "S22", "S23", "S24", "S47"], pnote="Two CBI waves (2026-04-24, 2026-07-16) in 8.05 months = 0.248/month -> 22%/month; spread effect is an assumption (macro specialist to calibrate).", scope="market", groups=["SANCTIONS_WAVE", "WAR_ESCALATION"]),
    R("SAN-06", "sanctions", "Screening false positive or name collision at a provider or exchange",
      "A provider or exchange flags a customer, address or beneficiary as sanctions-related (similar name, shared cluster) and holds the account or payment pending review.",
      0.01, 0.003, 0.03, 2, D, {"scope": "fulfilment_pipeline", "hours_median": 72, "hours_p90": 240},
      triggers=["Name similarity to SDN entries", "Address clustering with listed entities"], kri=["Provider review requests", "Held payments > 24h"], ctrls=["CTL-02", "CTL-16", "CTL-22"], dL=0, dI=1,
      pnote="Prior; compliance-operations experience.", scope="provider"),
    R("SAN-07", "sanctions", "OTC desk or exchange house for the fiat-to-USDT leg frozen or de-risked",
      "If the owner converts via a foreign OTC desk / exchange house, that intermediary can freeze or exit after designations or bank pressure.",
      0.02, 0.005, 0.06, 3, F, {"scope": "otc_balance", "pct": 1.0, "duration_days": 30, "recovery_prob": 0.5},
      triggers=["Banking-partner pressure", "Designation of peers", "Desk asks for new KYC"], kri=["Desk settlement delays > 24h", "New questions on counterparties"], ctrls=["CTL-04", "CTL-05", "CTL-06", "CTL-22"], dL=0, dI=1,
      applies=["uses_otc_desk"], scope="otc", groups=["SANCTIONS_WAVE"]),
    R("SAN-08", "sanctions", "Tether tightens policy under Senate/Treasury pressure (proactive freezes beyond the SDN list)",
      "After the Senate PSI minority report and referral to Treasury/DOJ (Sep 2026), Tether may freeze Iran-exposed clusters proactively, catching wallets that are not on any list.",
      0.04, 0.015, 0.12, 4, F, {"scope": "treasury_wallet", "pct": 0.3, "duration_days": None, "recovery_prob": 0.05},
      triggers=["Congressional hearings/letters", "Treasury guidance on stablecoin issuers", "Tether public statements"], kri=["Count of Tether freeze events per week (BlockSec/Tronscan)", "Freezes of addresses adjacent to ours"],
      ctrls=["CTL-01", "CTL-02", "CTL-03", "CTL-04", "CTL-05"], dL=0, dI=1, psrc=["S24", "S25"], pnote="Prior; political-pressure signal documented in S25.", scope="chain", groups=["SANCTIONS_WAVE"]),
    R("SAN-09", "sanctions", "Customer or beneficiary is an SDN-listed person (IRGC-linked)",
      "A customer or payee later turns out to be a listed person or acting for one, and a provider closes the account when it sees the flow.",
      0.01, 0.003, 0.03, 3, F, {"scope": "provider_float", "pct": 1.0, "duration_days": 45, "recovery_prob": 0.5},
      triggers=["Customer name matches the SDN list", "Provider flags beneficiary"], kri=["Name-screening hit count", "Provider compliance queries"], ctrls=["CTL-02", "CTL-16", "CTL-17"], dL=1, dI=0,
      pnote="Prior.", scope="provider"),
    # ---------------------------------------------------------------- STABLECOIN / CHAIN
    R("TKN-01", "stablecoin_chain", "Tether freezes the business treasury or hot wallet",
      "Owner's USDT wallet is blacklisted (direct SDN exposure, law-enforcement request, analytics cluster). Frozen funds can later be burned via destroyBlackFunds. 2025 base: 4,163 addresses and $1.26bn frozen; only 3.6% were ever removed from the blacklist.",
      0.015, 0.004, 0.05, 5, F, {"scope": "treasury_wallet", "pct": 1.0, "duration_days": None, "recovery_prob": 0.036},
      secondary=[{"type": D, "params": {"scope": "toman_to_usdt_rail", "hours_median": 168, "hours_p90": 720}}],
      triggers=["Wallet receives funds from an SDN-listed hot wallet", "Law-enforcement request", "Analytics cluster re-labelling", "Counterparty address listed by OFAC"],
      kri=["isBlackListed() hit on any counterparty", "Inbound transfers from labelled SDN entities (any)", "Tether freeze events on our providers' wallets"], ctrls=["CTL-01", "CTL-02", "CTL-03", "CTL-04", "CTL-05", "CTL-09"], dL=1, dI=1,
      psrc=["S29", "S31"], pnote="Anchor: BlockSec 2025 (4,163 addr/yr, 3.6% removed). Iranian-origin uplift is an assumption; x6 hazard if funded from SDN-listed exchanges (modifier).",
      scope="chain", groups=["SANCTIONS_WAVE"], pverify="BlockSec/Tronscan blacklist feed; Tether transparency page; check own wallets with isBlackListed() daily"),
    R("TKN-02", "stablecoin_chain", "Customer-paid USDT carries direct SDN-exchange exposure",
      "If customers may pay in USDT, most inbound transfers originate at SDN-listed exchanges (four of them handled ~78% of attributed Iranian volume in 2025, plus Aban Tether). Receiving, then forwarding, that USDT is direct sanctioned-entity exposure; returning it to origin is also fraught.",
      0.8, 0.5, 0.95, 3, F, {"scope": "inbound_usdt_quarantine", "pct": 0.8, "duration_days": 7, "recovery_prob": 0.5},
      triggers=["Sender address clusters to Nobitex/Wallex/Bitpin/Ramzinex/Aban Tether", "Tether freezes the sender"], kri=["Share of inbound USDT with exposure to SDN entities (target 0%)"], ctrls=["CTL-02", "CTL-03", "CTL-17", "CTL-23"], dL=4, dI=0,
      psrc=["S1", "S26", "S47"], pnote="Conditional on customer-USDT acceptance; share inferred from S1 volume shares - low confidence. Specialist 04 independently recommends the flag usdtPaymentForResidents=false on classification grounds.", applies=["accepts_usdt_inbound"], scope="chain"),
    R("TKN-03", "stablecoin_chain", "Contagion: provider deposit address or omnibus wallet frozen after receiving SDN-exposed funds from us",
      "The provider's wallet is blacklisted because of our deposit; the provider closes our account and keeps or loses the float.",
      0.01, 0.003, 0.04, 4, F, {"scope": "provider_float", "pct": 1.0, "duration_days": None, "recovery_prob": 0.1},
      triggers=["Deposits from tainted sources", "Provider analytics alert"], kri=["Provider rejects or holds a deposit", "Tether freeze of provider wallets"], ctrls=["CTL-01", "CTL-02", "CTL-03", "CTL-05", "CTL-22"], dL=1, dI=1,
      psrc=["S30", "S31"], pnote="Prior; freeze windows and auto-freeze policy documented in S30/S31.", scope="provider", groups=["SANCTIONS_WAVE"]),
    R("TKN-04", "stablecoin_chain", "USDT depeg of 2% or more for 24h or longer",
      "Peg break marks down treasury inventory and provider float held in USDT.", 0.004, 0.001, 0.01, 3, C, {"target": "usdt_usd_peg_deviation_pct", "delta_pct": -3.0, "duration_days": 3},
      triggers=["Reserve scare", "Regulatory action against the issuer", "Large redemption wave"], kri=["USDT price on 3 venues < 0.995 for > 1h"], ctrls=["CTL-04", "CTL-05", "CTL-19"], dL=0, dI=1,
      pnote="Prior (historical wobbles were brief); macro specialist may refine.", scope="chain"),
    R("TKN-05", "stablecoin_chain", "Tron congestion or energy-price spike delays or reprices transfers",
      "Network fee multiples or delays on TRC-20 withdrawals and deposits.", 0.05, 0.02, 0.12, 1, C, {"target": "network_fee_usdt", "multiplier": 3.0, "duration_days": 3},
      triggers=["Network demand spikes", "Energy price changes"], kri=["TRC-20 fee > 3 USDT", "Confirmation time > 10 min"], ctrls=["CTL-05"], dL=0, dI=0, pnote="Prior; network economics are owned by specialist 02.", scope="chain"),
    R("TKN-06", "stablecoin_chain", "Wrong-network, below-minimum or missing-memo deposit to a provider",
      "Funds sent on an unsupported network or under the minimum deposit are stuck or lost.", 0.01, 0.003, 0.03, 2, N, {"kind": "stuck_or_lost_transfer", "amount_usd": 1500},
      triggers=["Operator error", "Provider changes supported networks"], kri=["Deposits not credited after 1h"], ctrls=["CTL-10", "CTL-11", "CTL-22"], dL=1, dI=0, pnote="Prior.", scope="provider"),
    # ---------------------------------------------------------------- EXCHANGE COUNTERPARTY
    R("EXC-01", "exchange", "Hack or theft at the exchange holding our balance",
      "State-level or criminal compromise. Reference: Nobitex 2025-06-18, ~$90M moved to burn addresses and the service taken offline. Assumes the exchange survives but freezes withdrawals for days.",
      0.008, 0.003, 0.02, 4, F, {"scope": "exchange_balance", "pct": 1.0, "duration_days": 7, "recovery_prob": 0.7},
      secondary=[{"type": D, "params": {"scope": "toman_to_usdt_rail", "hours_median": 96, "hours_p90": 336}}],
      triggers=["Active cyber conflict", "Leaked source code or credentials", "Insider"], kri=KRI_EXCHANGE, ctrls=["CTL-04", "CTL-05", "CTL-06", "CTL-22", "CTL-25"], dL=0, dI=2,
      psrc=["S33", "S44"], pnote="Reference class: several large exchange hacks per year worldwide; war-time uplift x3 (assumption). Nobitex 2025: source code was leaked a day after the hack (specialist 02); amount range $81-100M by outlet.", scope="exchange", groups=["WAR_ESCALATION"]),
    R("EXC-02", "exchange", "Exchange insolvency or prolonged withdrawal halt",
      "Run on the exchange or regulatory seizure leads to months-long freezes. Reference class: FTX, Celsius, WazirX (analyst recollection, not verified in-session).",
      0.002, 0.0005, 0.006, 5, F, {"scope": "exchange_balance", "pct": 1.0, "duration_days": 540, "recovery_prob": 0.5},
      triggers=["Large hack with socialised losses", "Regulatory action", "Capital-flight run"], kri=KRI_EXCHANGE + ["Proof-of-reserves unavailable"], ctrls=["CTL-04", "CTL-05", "CTL-06", "CTL-22", "CTL-25"], dL=0, dI=2,
      pnote="Prior; durations from analyst recollection (FTX ~27 months, Celsius ~19 months to first distributions) - UNVERIFIED here.", scope="exchange", groups=["WAR_ESCALATION"]),
    R("EXC-03", "exchange", "Rule changes restrict conversion (72h lock, night halts, daily caps)",
      "Regulators and exchanges change limits often: post-deposit withdrawal lock, 21:00-09:00 USDT trading halt with a 2,000 USDT/day cap (Mehr 1405), ID-based 25M-Toman deposit cap.",
      0.15, 0.08, 0.30, 3, D, {"scope": "toman_to_usdt_rail", "hours_per_day_unavailable": 12, "duration_days": 7, "duration_days_p90": 30},
      secondary=[{"type": C, "params": {"target": "usdt_irt_spread_pct", "delta_pp": 0.5, "duration_days": 30}}],
      triggers=["CBI/FATA directives", "Exchange risk policy", "Market volatility"], kri=["New cap/lock/halt announced", "Daily conversion capacity < 1.5x demand"], ctrls=["CTL-04", "CTL-05", "CTL-06", "CTL-25"], dL=0, dI=1,
      psrc=["S44", "S42"], pnote="Specialist 02's timeline lists ~9 conversion-restricting rule changes in ~46 months (Dec-2022 to Oct-2026; many low confidence) = ~0.2/month -> 18%/month; prior 15% (8-30%). Latest episode: halt 21:00-09:00 + 2,000 USDT/day cap from 2026-09-30 21:00 to 2026-10-04 21:00 (4 days, extension unknown); the 72h lock and 25M IRT ID cap are standing constraints handled by the treasury planner, not by this risk.", scope="exchange", groups=["REGULATORY_TIGHTENING_IR", "FIN_STRESS"]),
    R("EXC-04", "exchange", "Exchange suspends or restricts the owner's account",
      "KYC re-verification, business-like activity flags or sanctions-related risk rules freeze the account for a period.", 0.01, 0.003, 0.03, 3, F,
      {"scope": "exchange_balance", "pct": 1.0, "duration_days": 14, "recovery_prob": 0.9}, triggers=["Volume spikes", "Complaints", "Rule changes"], kri=["Account-level warnings", "Support tickets unanswered"], ctrls=["CTL-04", "CTL-06", "CTL-16", "CTL-22"], dL=0, dI=1,
      pnote="Prior.", scope="exchange"),
    R("EXC-05", "exchange", "Payment-gateway closure on the exchange's Toman rails",
      "Fiat deposit rails go dark. Evidence (specialist 02): CBI/Shaparak blocked exchange payment gateways on 2024-12-26 (Dey 1403), partially reversed in Jan 2025 on conditions (ten data items); only a few small/medium exchanges reopened at first. No closure inside the last 90 days. The brief's 'Dey 1404' closure is NOT evidenced.", 0.06, 0.02, 0.15, 3, D,
      {"scope": "toman_to_usdt_rail", "hours_median": 240, "hours_p90": 720}, triggers=["Shaparak directives", "Bank problems", "Internet shutdown"], kri=["Deposit success rate < 90%"], ctrls=["CTL-05", "CTL-06"], dL=0, dI=1,
      psrc=["S44"], pnote="One clustered episode (Oct-Dec 2024 restrictions, 2024-12-26 closure, partial reopening Jan 2025) in ~24 months -> ~4%/month; prior 6% (2-15%). Duration lengthened to median 10 days / p90 30 days to match the observed weeks-long episode.", scope="exchange", groups=["REGULATORY_TIGHTENING_IR"]),
    R("EXC-06", "exchange", "USDT withdrawals from a designated exchange fail or are delayed",
      "A designated exchange's own USDT wallets can be blacklisted, so withdrawals stall until it rotates addresses; Persian community posts report account/wallet restrictions after moving funds out of Nobitex.",
      0.10, 0.03, 0.30, 3, D, {"scope": "toman_to_usdt_rail", "hours_median": 96, "hours_p90": 480}, triggers=["Exchange designated", "Tether blacklists its hot wallets"], kri=["Withdrawal success rate", "Tether freeze of exchange wallets"], ctrls=["CTL-01"], dL=4, dI=0,
      psrc=["S19", "S38", "S31"], pnote="Conditional on using a designated exchange (not recommended); low confidence.", applies=["uses_designated_exchange"], scope="exchange"),
    R("EXC-07", "exchange", "Price-feed outage, manipulation or stale quote",
      "Exchange API or order book misprices USDT/IRT, leading to mispriced quotes.", 0.05, 0.02, 0.12, 2, C, {"target": "quote_slippage_pct", "delta_pp": 0.8, "duration_days": 1},
      secondary=[{"type": D, "params": {"scope": "quoting", "hours_median": 2, "hours_p90": 8}}], triggers=["API failure", "Thin order book", "Attack"], kri=["Feed deviation > 1%", "Stale feed > 60s"], ctrls=["CTL-19"], dL=1, dI=1,
      pnote="Prior; pricing specialist (12) owns the feed design.", scope="market"),
    R("EXC-08", "exchange", "Emergency trading halts or capital-flight controls during a crisis",
      "War or currency shocks lead to discretionary halts and tighter caps on USDT purchases.", 0.04, 0.01, 0.10, 3, D, {"scope": "toman_to_usdt_rail", "hours_median": 48, "hours_p90": 168},
      triggers=["Currency spike", "Military escalation"], kri=["Premium > 5%", "Announcements by CBI"], ctrls=["CTL-05", "CTL-06", "CTL-08"], dL=0, dI=1, pnote="Prior; macro specialist (08).", scope="exchange", groups=["WAR_ESCALATION", "FIN_STRESS"]),
    # ---------------------------------------------------------------- PROVIDERS (cards / vouchers)
    R("PRV-01", "provider", "Custodial card provider exits or vanishes (exit scam)",
      "Abrupt shutdown of a young, lightly regulated provider with the float inside. The lead's first-pass research notes ~3/5 Trustpilot with 'funds blocked/scam' reviews for mpay-like providers.",
      0.005, 0.002, 0.015, 4, F, {"scope": "provider_float", "pct": 1.0, "duration_days": None, "recovery_prob": 0.05},
      triggers=["Team silence", "Domain/hosting changes", "Withdrawal delays"], kri=KRI_PROVIDER, ctrls=["CTL-04", "CTL-05", "CTL-06", "CTL-07", "CTL-08", "CTL-22", "CTL-24"], dL=0, dI=2,
      psrc=["S42"], pnote="Prior ~6%/year; no empirical base rate retrievable in-session (search budget). Calibrate with specialist 01 and live tracking.", scope="provider", groups=["PROVIDER_STRESS"]),
    R("PRV-02", "provider", "Provider freezes the reseller's account",
      "Compliance, chargeback or Iran-origin detection leads to a freeze pending KYC or permanent closure.", 0.018, 0.008, 0.05, 4, F, {"scope": "provider_float", "pct": 1.0, "duration_days": 60, "recovery_prob": 0.5},
      triggers=["Unusual volume", "Residency/IP mismatch detected", "SDN exposure", "Chargebacks"], kri=KRI_PROVIDER, ctrls=["CTL-04", "CTL-05", "CTL-06", "CTL-07", "CTL-08", "CTL-22"], dL=0, dI=2,
      psrc=["S42"], pnote="Prior ~20%/year for gray providers; evidence is anecdotal (reviews).", scope="provider", groups=["PROVIDER_STRESS", "SANCTIONS_WAVE"]),
    R("PRV-03", "provider", "Issuer, BIN sponsor or program manager insolvency or regulatory action",
      "Upstream failure freezes card programs (analyst recollection: Synapse 2024, Wirecard 2020 - not verified in-session).", 0.002, 0.0007, 0.007, 4, F, {"scope": "provider_float", "pct": 1.0, "duration_days": 270, "recovery_prob": 0.6},
      triggers=["Sponsor-bank enforcement", "Program-manager insolvency"], kri=["Regulator warnings on issuer/sponsor", "Program changes"], ctrls=["CTL-04", "CTL-05", "CTL-06", "CTL-22"], dL=0, dI=2,
      pnote="Prior ~2.4%/year.", scope="provider", groups=["PROVIDER_STRESS"]),
    R("PRV-04", "provider", "Unilateral change of fees, limits or terms",
      "Top-up percentage, minimum load or KYC rules change without notice.", 0.06, 0.03, 0.12, 2, C, {"target": "provider_topup_pct", "delta_pp": 1.0, "duration_days": None},
      triggers=["Provider economics", "Compliance tightening"], kri=["ToS/fee page hash change"], ctrls=["CTL-06", "CTL-19", "CTL-22", "CTL-27"], dL=0, dI=1, pnote="Prior.", scope="provider"),
    R("PRV-05", "provider", "Provider geo-blocks or terminates Iran-resident customers",
      "After Operation Economic Outcast a provider adds Iran to restricted jurisdictions or closes accounts it identifies as Iran-linked.", 0.02, 0.008, 0.06, 4, F, {"scope": "provider_float", "pct": 1.0, "duration_days": 45, "recovery_prob": 0.5},
      secondary=[{"type": M, "params": {"segment": "card_products", "multiplier": 0.7, "duration_days": 45}}],
      triggers=["Restricted-jurisdiction update", "New sanctions advisories"], kri=KRI_PROVIDER + ["Written confirmation of Iran-resident eligibility missing or withdrawn"], ctrls=["CTL-04", "CTL-05", "CTL-06", "CTL-17", "CTL-22", "CTL-27"], dL=0, dI=2,
      psrc=["S27"], pnote="Prior ~21%/year.", scope="provider", groups=["SANCTIONS_WAVE", "PROVIDER_STRESS"]),
    R("PRV-06", "provider", "Card declines and merchant-category blocks cause failed fulfilment",
      "Target vendors decline prepaid/virtual BINs or region mismatches; orders fail and are refunded or retried.", 0.25, 0.15, 0.40, 2, C, {"target": "order_failure_rate_pp", "delta_pp": 4.0, "duration_days": 14},
      triggers=["Vendor risk rules", "Billing-address mismatch"], kri=["Decline rate per vendor > 10%"], ctrls=["CTL-06", "CTL-17", "CTL-22"], dL=0, dI=1, pnote="Prior; frequent friction reported anecdotally.", scope="provider"),
    R("PRV-07", "provider", "Card-data compromise (PAN/CVV leak) and card drained",
      "Card details leak via provider, chat transcripts or staff; balance spent by a third party.", 0.01, 0.003, 0.03, 3, N, {"kind": "fraud_loss", "amount_usd": 450},
      triggers=["Phishing", "Insecure delivery of card data"], kri=["Unexpected card transactions", "Card data in logs"], ctrls=["CTL-13", "CTL-14", "CTL-29", "CTL-30"], dL=1, dI=0, pnote="Prior.", scope="ops"),
    R("PRV-08", "provider", "Deposit not credited or reconciliation drift at the provider",
      "Delays, wrong network/memo, minimum-deposit traps or provider bugs leave part of the float uncredited.", 0.08, 0.03, 0.15, 2, F, {"scope": "provider_float", "pct": 0.1, "duration_days": 7, "recovery_prob": 0.9},
      triggers=["Wrong memo/network", "Provider bug", "Slow support"], kri=["Reconciliation difference > 0.5%"], ctrls=["CTL-05", "CTL-07", "CTL-10", "CTL-22"], dL=1, dI=0, pnote="Prior.", scope="provider"),
    R("PRV-09", "provider", "Provider support unresponsive; disputes drag on",
      "Slow or absent support delays fulfilment and dispute resolution.", 0.20, 0.10, 0.35, 2, D, {"scope": "fulfilment_pipeline", "hours_median": 24, "hours_p90": 120},
      triggers=["Provider understaffing", "Time zones"], kri=["Support first-response > 48h"], ctrls=["CTL-06", "CTL-22"], dL=0, dI=1, pnote="Prior; recurring theme in reviews.", scope="provider", groups=["PROVIDER_STRESS"]),
    R("PRV-10", "provider", "Voucher/gift-card aggregator blocks Iran, revokes codes or fails to deliver",
      "Code revocation or non-delivery on voucher inventory; aggregator region lock.", 0.03, 0.01, 0.08, 3, F, {"scope": "voucher_inventory", "pct": 0.3, "duration_days": None, "recovery_prob": 0.3},
      triggers=["Aggregator ToS update", "Fraud flags on codes"], kri=["Redemption failure rate > 3%"], ctrls=["CTL-04", "CTL-06", "CTL-22", "CTL-27"], dL=0, dI=1, applies=["voucher_line"], pnote="Prior.", scope="provider"),
    R("PRV-11", "provider", "Unused card balance is non-refundable or non-withdrawable",
      "When a card or account is closed or the customer cancels, remaining balance may be trapped (to be confirmed per provider's ToS).", 0.15, 0.05, 0.30, 2, N, {"kind": "sunk_balance", "amount_usd": 60},
      triggers=["Card closure", "Order cancellation"], kri=["Idle balance share of float"], ctrls=["CTL-04", "CTL-05", "CTL-22"], dL=1, dI=0,
      pnote="UNVERIFIED: refund/withdraw clause not read for any provider; specialist 01 to confirm.", scope="provider", pverify="Read each provider's refund / unused-balance clause and test with a small balance"),
    # ---------------------------------------------------------------- VENDORS
    R("VND-01", "vendor", "AI vendor ban wave on Iran-linked accounts",
      "OpenAI/Anthropic and similar vendors enforce geography (Anthropic's supported-regions list excludes Iran; its 2025 ToS update bars majority-owned entities from unsupported regions); delivered subscriptions are cancelled and customers demand refunds.",
      0.05, 0.02, 0.15, 4, M, {"segment": "ai_subscriptions", "multiplier": 0.6, "duration_days": 45},
      secondary=[{"type": N, "params": {"kind": "refunds", "pct_of_monthly_revenue_ai_line": 0.15}}],
      triggers=["Vendor enforcement campaigns", "New sanctions guidance"], kri=["Customer reports of suspended accounts > 2% of active", "Vendor policy page change"], ctrls=["CTL-17", "CTL-22", "CTL-24", "CTL-27"], dL=0, dI=1,
      psrc=["S34", "S35", "S36", "S48"], pnote="Prior; policy facts S34 (seen directly; specialist 06 also read Anthropic's supported-countries page first-hand), S35; OpenAI: Iran excluded from its supported-countries list and API traffic from unsupported countries blocked since 2024-07-09 (S48 per summaries); ban-wave frequency is an assumption.", applies=["ai_subscription_line"], scope="vendor", groups=["SANCTIONS_WAVE"]),
    R("VND-02", "vendor", "Vendor risk rules block prepaid/virtual BIN ranges",
      "A vendor adds BIN denylists or stricter fraud rules; all orders with that BIN fail for weeks.", 0.08, 0.03, 0.15, 3, C, {"target": "order_failure_rate_pp", "delta_pp": 8.0, "duration_days": 21},
      triggers=["Vendor fraud tuning"], kri=["Decline rate per vendor and BIN"], ctrls=["CTL-06", "CTL-22"], dL=0, dI=1, pnote="Prior.", scope="vendor"),
    R("VND-03", "vendor", "Vendor dispute or chargeback closes the card with balance forfeited",
      "A disputed charge or fraud flag at the merchant closes the card and the balance is lost.", 0.03, 0.01, 0.08, 2, N, {"kind": "forfeited_balance", "amount_usd": 100},
      triggers=["Dispute", "Fraud flag"], kri=["Disputes per 1,000 orders"], ctrls=["CTL-05", "CTL-17"], dL=0, dI=1, pnote="Prior.", scope="vendor"),
    R("VND-04", "vendor", "Vendor trademark or reseller-policy enforcement (takedown notice)",
      "Brand owners object to the use of marks or the resale model; listing or domain taken down.", 0.005, 0.001, 0.02, 2, D, {"scope": "catalog_listing", "hours_median": 24, "hours_p90": 72},
      triggers=["Complaint to host/registrar"], kri=["Legal notices"], ctrls=["CTL-18", "CTL-22"], dL=0, dI=1, pnote="Prior.", scope="vendor"),
    R("VND-05", "vendor", "Vendor adds identity or phone verification Iranian customers cannot lawfully satisfy",
      "New verification steps (phone, ID, payment-country match) block activation; the lawful answer is to stop selling that product, not to bypass.", 0.05, 0.02, 0.12, 3, M, {"segment": "ai_subscriptions", "multiplier": 0.8, "duration_days": 60},
      triggers=["Vendor fraud/abuse policy"], kri=["Activation failure rate"], ctrls=["CTL-17", "CTL-27"], dL=0, dI=1, applies=["ai_subscription_line"], pnote="Prior.", scope="vendor"),
    # ---------------------------------------------------------------- PAYMENTS (collection)
    R("PAY-01", "payments", "Payment gateway terminates the merchant for crypto/forex association",
      "Shaparak-connected gateways prohibit currency/crypto trading; if the business is classified as such, the gateway is cut.", 0.03, 0.01, 0.08, 4, D, {"scope": "checkout_gateway", "hours_median": 168, "hours_p90": 720},
      triggers=["Shaparak review", "Complaint", "Merchant category change"], kri=["Gateway warnings", "Settlement delays"], ctrls=["CTL-17", "CTL-20"], dL=0, dI=1,
      psrc=["S42", "S46"], pnote="Prior. Specialist 03: Shaparak told payment-yars to cut merchants selling crypto, VPN, betting; classification of gift-card / virtual-card / USDT-backed top-ups is not named anywhere seen -> UNVERIFIED, treated high.", scope="payments", groups=["REGULATORY_TIGHTENING_IR"]),
    R("PAY-02", "payments", "Bank freezes the receiving account",
      "Suspected crypto-linked turnover or a complaint ('triangular fraud') leads to a block on the business or personal account.", 0.02, 0.008, 0.05, 4, F, {"scope": "bank_balance", "pct": 1.0, "duration_days": 45, "recovery_prob": 0.8},
      triggers=["Complaint", "Pattern flags"], kri=["Account warnings", "Failed settlements"], ctrls=["CTL-04", "CTL-16", "CTL-18", "CTL-20"], dL=0, dI=1, pnote="Prior.", scope="payments", groups=["REGULATORY_TIGHTENING_IR"]),
    R("PAY-03", "payments", "Card-to-card caps tightened or receiving cards flagged",
      "Per-card daily caps and business-like activity thresholds restrict collection capacity.", 0.05, 0.02, 0.12, 2, M, {"segment": "checkout_card_to_card", "multiplier": 0.6, "duration_days": 30},
      triggers=["Rule change", "Account flagged"], kri=["Per-card daily volume vs cap"], ctrls=["CTL-20", "CTL-28"], dL=0, dI=1, applies=["uses_card_to_card"], pnote="Prior.", scope="payments", groups=["REGULATORY_TIGHTENING_IR"]),
    R("PAY-04", "payments", "Refund abuse and disputes after delivery",
      "Customers claim non-delivery or ask for refunds after services were delivered.", 0.30, 0.15, 0.50, 1, N, {"kind": "disputes", "pct_of_monthly_revenue": 0.002},
      triggers=["Vendor bans", "Customer remorse"], kri=["Dispute rate"], ctrls=["CTL-13", "CTL-17"], dL=0, dI=0, pnote="Prior.", scope="payments"),
    R("PAY-05", "payments", "Messenger payment-policy change",
      "Telegram (Stars-only for digital goods) or Bale policy changes remove or limit in-app payment flows.", 0.03, 0.01, 0.08, 3, M, {"segment": "messenger_channel", "multiplier": 0.7, "duration_days": 60},
      triggers=["Platform policy update"], kri=["Platform policy page change"], ctrls=["CTL-20", "CTL-27"], dL=0, dI=1, applies=["messenger_channels"], psrc=["S42"], pnote="Prior; lead's research notes the Stars rule (specialist 03 to verify).", scope="payments"),
    R("PAY-06", "payments", "Fake or unverified card-to-card receipts",
      "Edited screenshots or unsettled transfers lead to fulfilment before funds arrive.", 0.20, 0.10, 0.35, 2, N, {"kind": "receipt_fraud", "pct_of_monthly_revenue": 0.003},
      triggers=["Screenshot-only verification"], kri=["Orders fulfilled before settlement"], ctrls=["CTL-13", "CTL-28"], dL=2, dI=0, applies=["uses_card_to_card"], pnote="Prior.", scope="payments"),
    # ---------------------------------------------------------------- OPSEC
    R("OPS-01", "opsec", "Hot-wallet private-key compromise",
      "Malware, phishing or insider access drains the hot wallet; stolen USDT can also be frozen by Tether if reported quickly.", 0.002, 0.0005, 0.006, 5, F, {"scope": "hot_wallet", "pct": 1.0, "duration_days": None, "recovery_prob": 0.0},
      triggers=["Malware", "Phishing", "Key backup exposure"], kri=["Unexpected signing requests", "New device enrolment"], ctrls=["CTL-09", "CTL-10", "CTL-12", "CTL-15"], dL=1, dI=2, pnote="Prior ~2.4%/year before controls.", scope="ops"),
    R("OPS-02", "opsec", "Address poisoning or wrong-address transfer",
      "Look-alike addresses in transaction history trick staff into sending funds to the attacker.", 0.006, 0.002, 0.02, 3, N, {"kind": "misdirected_transfer", "amount_usd": 5000},
      triggers=["Copying addresses from history", "Dust transfers from look-alikes"], kri=["Look-alike dust received"], ctrls=["CTL-10", "CTL-11"], dL=1, dI=1, pnote="Prior; incidence statistics were not researched in-session.", scope="ops"),
    R("OPS-03", "opsec", "SIM-swap or Telegram session takeover of owner, operator or admin",
      "SMS-code interception or session theft hands attackers the admin bot or exchange accounts.", 0.005, 0.002, 0.015, 4, D, {"scope": "platform_admin", "hours_median": 24, "hours_p90": 96},
      secondary=[{"type": N, "params": {"kind": "fraud_loss", "amount_usd": 2000}}], triggers=["SIM swap", "Phishing links", "Shared devices"], kri=["New session alerts", "Unexpected logins"], ctrls=["CTL-12", "CTL-13", "CTL-26"], dL=1, dI=1, pnote="Prior.", scope="ops"),
    R("OPS-04", "opsec", "Insider fraud or collusion (operators, developers, support)",
      "Operators reassign delivered cards, abuse refunds or leak data.", 0.015, 0.005, 0.04, 3, N, {"kind": "insider_fraud", "pct_of_monthly_gmv": 0.005},
      triggers=["Single-person approvals", "Poor monitoring"], kri=["Refunds per operator", "Card reveals per operator"], ctrls=["CTL-13", "CTL-14", "CTL-30"], dL=1, dI=1, applies=["has_operators"], pnote="Prior.", scope="ops"),
    R("OPS-05", "opsec", "Admin panel or API compromise",
      "Credential stuffing, supply-chain or application bugs allow price manipulation or order fraud.", 0.008, 0.003, 0.02, 4, D, {"scope": "platform_all", "hours_median": 48, "hours_p90": 168},
      secondary=[{"type": N, "params": {"kind": "fraud_loss", "pct_of_monthly_gmv": 0.01}}], triggers=["Weak credentials", "Vulnerable dependency"], kri=["WAF alerts", "Unexpected price overrides"], ctrls=["CTL-12", "CTL-13", "CTL-29"], dL=1, dI=1, pnote="Prior.", scope="ops"),
    R("OPS-06", "opsec", "Phishing or social engineering of staff (fake provider support)",
      "Fake support chats or emails extract credentials or approvals.", 0.01, 0.003, 0.03, 3, N, {"kind": "fraud_loss", "amount_usd": 3000},
      triggers=["Impersonation", "Urgent requests"], kri=["Reported phishing attempts"], ctrls=["CTL-12", "CTL-13", "CTL-15"], dL=1, dI=1, pnote="Prior.", scope="ops"),
    R("OPS-07", "opsec", "Key-person risk: owner incapacitated, detained or key backup lost",
      "No one else can sign; funds and accounts are stranded.", 0.001, 0.0003, 0.004, 5, F, {"scope": "all_usdt", "pct": 1.0, "duration_days": None, "recovery_prob": 0.3},
      triggers=["Illness", "Detention", "Lost seed"], kri=["Succession test not done in 12 months"], ctrls=["CTL-09", "CTL-18", "CTL-26"], dL=1, dI=2, pnote="Prior.", scope="owner"),
    R("OPS-08", "opsec", "Backup, DR or ledger corruption",
      "Hosting loss or data corruption breaks reconciliation and halts operations.", 0.01, 0.003, 0.03, 3, D, {"scope": "platform_all", "hours_median": 24, "hours_p90": 96},
      triggers=["Hosting failure", "Bug"], kri=["Backup restore test failed"], ctrls=["CTL-21", "CTL-26", "CTL-29"], dL=1, dI=1, pnote="Prior.", scope="ops"),
    # ---------------------------------------------------------------- LEGAL / REGULATORY (IR) - owned by specialist 04; parameters for completeness
    R("LEG-01", "legal", "Iranian enforcement action or classification as unlicensed FX/crypto dealing",
      "FATA/police/CBI measures lead to account blocks, seizures or summons; if the product is classed as unlicensed FX dealing the law treats it as 'currency smuggling' (fine 2x the rial value + confiscation, per specialist 04 F08; classification risk R01 there).", 0.004, 0.001, 0.015, 5, F, {"scope": "bank_balance", "pct": 1.0, "duration_days": 180, "recovery_prob": 0.5},
      secondary=[{"type": N, "params": {"kind": "fx_dealing_fine", "multiple_of_rial_value": 2.0, "scope": "transactions deemed unlicensed FX dealing"}}],
      triggers=["Directives", "Complaints", "Media attention"], kri=["New directives", "Peers sanctioned"], ctrls=["CTL-16", "CTL-17", "CTL-18", "CTL-20"], dL=0, dI=1, psrc=["S47"], pnote="Prior; specialist 04 owns the analysis (its R01 classification risk residual 10; R03 sanctioned-venue risk residual 12).", scope="legal", groups=["REGULATORY_TIGHTENING_IR"]),
    R("LEG-02", "legal", "Tax assessment or back-tax claim",
      "Tax authority reassesses turnover visible in bank accounts.", 0.01, 0.003, 0.03, 3, N, {"kind": "tax_assessment", "pct_of_trailing_12m_revenue": 0.10},
      triggers=["Account turnover visibility"], kri=["Notices"], ctrls=["CTL-16", "CTL-18"], dL=1, dI=1, pnote="Prior; specialist 04.", scope="legal", groups=["REGULATORY_TIGHTENING_IR"]),
    R("LEG-03", "legal", "E-commerce licence or consumer-complaint problems; domain takedown",
      "Complaints or missing e-commerce trust marks lead to site restrictions.", 0.01, 0.003, 0.03, 2, D, {"scope": "platform_all", "hours_median": 72, "hours_p90": 240},
      triggers=["Complaints", "Licensing checks"], kri=["Complaint volume"], ctrls=["CTL-17", "CTL-18"], dL=0, dI=1, pnote="Prior; specialist 04.", scope="legal"),
    R("LEG-04", "legal", "Customer terms inadequate: refund claims when a third party suspends service",
      "Disputes arise because the third-party suspension risk and refund policy were not disclosed.", 0.05, 0.02, 0.12, 2, N, {"kind": "refunds", "pct_of_monthly_revenue": 0.01},
      triggers=["Vendor ban waves", "Provider freezes"], kri=["Refund requests citing suspension"], ctrls=["CTL-17", "CTL-18"], dL=1, dI=1, pnote="CLAUDE.md s3.2 requires this disclosure.", scope="legal"),
    # ---------------------------------------------------------------- INFRASTRUCTURE
    R("INF-01", "infrastructure", "National internet shutdown or heavy throttling",
      "Blackouts followed the 2026 military operations; Nobitex kept processing during a government-imposed shutdown (Reuters). Earlier shutdowns exist (2019, 2025). Durations in days to weeks.",
      0.12, 0.06, 0.25, 3, D, {"scope": "platform_all", "hours_median": 120, "hours_p90": 480},
      secondary=[{"type": M, "params": {"segment": "all", "multiplier": 0.5, "duration_days": 7}}], triggers=["Military escalation", "Protests", "Security directives"], kri=["Cloudflare Radar/IODA anomalies", "Provider reachability"],
      ctrls=["CTL-21"], dL=0, dI=1, psrc=["S38", "S9", "S44"], pnote="Rate inferred from >= 2 major episodes in ~16 months (June-2025 war period; late-Feb-2026 near-total shutdown per specialist 02; a Jan-2026 episode is unconfirmed) = ~0.125/month -> 12%; dates/durations not verified; calibrate with NetBlocks/IODA.", scope="infra", groups=["WAR_ESCALATION"],
      pverify="NetBlocks / IODA / Cloudflare Radar timeline for Iran 2025-2026; Persian media for durations"),
    R("INF-02", "infrastructure", "Messenger platform filtering or outage",
      "Telegram filtering/instability or Bale outage makes the Mini App unreachable.", 0.03, 0.01, 0.08, 2, M, {"segment": "messenger_channel", "multiplier": 0.7, "duration_days": 14},
      triggers=["Filtering", "Platform outage"], kri=["Mini-App availability"], ctrls=["CTL-21"], dL=0, dI=1, applies=["messenger_channels"], pnote="Prior.", scope="infra"),
    R("INF-03", "infrastructure", "Hosting, CDN, domain or SMS vendor terminates an Iran-linked customer",
      "US-nexus infrastructure vendors cut service on sanctions grounds.", 0.02, 0.005, 0.05, 3, D, {"scope": "platform_all", "hours_median": 48, "hours_p90": 168},
      triggers=["Vendor compliance review"], kri=["Vendor notices"], ctrls=["CTL-21", "CTL-26"], dL=0, dI=1, pnote="Prior.", scope="infra", groups=["SANCTIONS_WAVE"]),
    R("INF-04", "infrastructure", "DDoS or cyberattack on the platform",
      "War-time attacks or criminals disrupt the platform.", 0.03, 0.01, 0.08, 3, D, {"scope": "platform_all", "hours_median": 12, "hours_p90": 72},
      triggers=["Conflict escalation", "Extortion"], kri=["Traffic anomalies"], ctrls=["CTL-21", "CTL-29"], dL=0, dI=1, pnote="Prior.", scope="infra", groups=["WAR_ESCALATION"]),
    # ---------------------------------------------------------------- TREASURY / REPUTATION
    R("FIN-01", "treasury", "USDT float stock-out (72h lock, caps, demand surge)",
      "Conversion constraints leave too little USDT to fund provider top-ups; orders queue and some are lost.", 0.10, 0.05, 0.20, 2, D, {"scope": "fulfilment_pipeline", "hours_median": 24, "hours_p90": 72},
      secondary=[{"type": M, "params": {"segment": "all", "multiplier": 0.9, "duration_days": 7}}], triggers=["Demand spike", "New caps/locks"], kri=["USDT days-of-cover < 2"], ctrls=["CTL-04", "CTL-05", "CTL-06"], dL=0, dI=1,
      pnote="Prior; treasury specialist (12) owns the float planner.", scope="treasury", groups=["FIN_STRESS", "REGULATORY_TIGHTENING_IR"]),
    R("REP-01", "reputation", "Trust crisis after a visible failure",
      "A provider freeze or ban wave leads to refunds and public 'scam' accusations.", 0.02, 0.008, 0.06, 3, M, {"segment": "all", "multiplier": 0.8, "duration_days": 90},
      triggers=["Provider freeze", "Vendor bans", "Slow refunds"], kri=["Complaint volume", "Public rating"], ctrls=["CTL-15", "CTL-17", "CTL-24"], dL=0, dI=1, pnote="Prior.", scope="brand", groups=["PROVIDER_STRESS"]),
    R("REP-02", "reputation", "Customer PII or card-detail leak",
      "Data breach or insider leak exposes identities or card data.", 0.004, 0.001, 0.012, 4, M, {"segment": "all", "multiplier": 0.7, "duration_days": 90},
      secondary=[{"type": N, "params": {"kind": "fraud_loss", "pct_of_monthly_revenue": 0.02}}], triggers=["Breach", "Insider"], kri=["Unusual data exports"], ctrls=["CTL-14", "CTL-29", "CTL-30"], dL=1, dI=1, pnote="Prior.", scope="brand"),
]

CORRELATION_GROUPS = OrderedDict(
    WAR_ESCALATION=dict(description="Military escalation: shutdowns, cyber-attacks, crisis halts, sanctions and spread shocks cluster together.",
                        multipliers={"INF-01": 3, "INF-04": 4, "EXC-01": 2, "EXC-02": 2, "EXC-08": 5, "SAN-05": 1.5, "SAN-01": 1.5, "FIN-01": 2}),
    SANCTIONS_WAVE=dict(description="New OFAC action cycle (designations, address listings, sector determinations).",
                        multipliers={"SAN-01": 2, "SAN-02": 2, "SAN-04": 3, "SAN-05": 2, "SAN-08": 2, "TKN-01": 2, "TKN-03": 2, "PRV-02": 2, "PRV-05": 3, "VND-01": 2, "INF-03": 2}),
    PROVIDER_STRESS=dict(description="Counterparty-quality deterioration at card/voucher providers.",
                         multipliers={"PRV-01": 3, "PRV-02": 3, "PRV-09": 2, "REP-01": 2}),
    REGULATORY_TIGHTENING_IR=dict(description="Domestic rule tightening (CBI/FATA/Shaparak).",
                                  multipliers={"EXC-03": 2, "EXC-05": 2, "PAY-01": 3, "PAY-02": 2, "PAY-03": 3, "LEG-01": 3, "LEG-02": 2, "FIN-01": 2}),
    FIN_STRESS=dict(description="Currency shock coupling to the macro scenarios of specialist 08.",
                    multipliers={"EXC-03": 2, "EXC-08": 3, "FIN-01": 3}),
)

SCENARIO_LINKS = OrderedDict([
    ("sanctions event", ["SANCTIONS_WAVE"]), ("provider freeze", ["PROVIDER_STRESS"]), ("internet shutdown", ["WAR_ESCALATION"]),
    ("gateway blackout", ["REGULATORY_TIGHTENING_IR"]), ("CBI cap cut", ["REGULATORY_TIGHTENING_IR", "FIN_STRESS"]), ("devaluation shock", ["FIN_STRESS"]),
    ("worst case", ["WAR_ESCALATION", "SANCTIONS_WAVE", "PROVIDER_STRESS", "REGULATORY_TIGHTENING_IR"]), ("best case", []),
])

LABEL_GUIDANCE = [
    dict(product_family="AI subscriptions (OpenAI, Anthropic, ...) via virtual card", risk_label=rec("high", "label", "medium", ["S34", "S35", "S48"], note="Anthropic supported-regions list (seen directly) excludes Iran; OpenAI's list excludes Iran and API traffic from unsupported countries is blocked since 2024-07-09 (per summaries via specialist 06)"),
         restriction_note=rec("Vendor does not support Iran; the account may be suspended without notice and the vendor may not refund. Provider card programs may also restrict Iran-linked use.", "text", "medium", ["S34", "S35"]), main_risks=["VND-01", "VND-05", "PRV-02", "PRV-05", "LEG-04"]),
    dict(product_family="Virtual card top-up (custodial USDT card provider)", risk_label=rec("high", "label", "medium", ["S42"], note="no public API or partner programme found; fund-loss complaints in reviews (lead's research)"),
         restriction_note=rec("Third-party custodial provider; funds can be frozen or closed without notice; keep balances small.", "text", "medium", ["S42"]), main_risks=["PRV-01", "PRV-02", "PRV-05", "TKN-03", "SAN-02"]),
    dict(product_family="Voucher / gift-card via aggregator", risk_label=rec("medium", "label", "low", note="aggregator Iran policy not verified"),
         restriction_note=rec("Region and code-revocation risk; delivery depends on the aggregator.", "text", "low"), main_risks=["PRV-10", "VND-03"]),
    dict(product_family="Domestic (Toman-only) digital services", risk_label=rec("low", "label", "low", note="no cross-border USDT leg"),
         restriction_note=rec("Standard domestic payment and consumer-law risks only.", "text", "low"), main_risks=["PAY-01", "PAY-02", "LEG-03"]),
    dict(product_family="Customer pays in USDT", risk_label=rec("high", "label", "medium", ["S1", "S26", "S8"], note="inferred from exchange market shares"),
         restriction_note=rec("Disabled by default: most Iranian USDT originates at SDN-listed exchanges; counsel must approve a screening policy first.", "text", "medium", ["S1", "S8"]), main_risks=["TKN-02", "TKN-01", "SAN-02"]),
    dict(product_family="Toman to USDT conversion (internal treasury leg)", risk_label=rec("high", "label", "medium", ["S8", "S26", "S28"], note="designation hazard"),
         restriction_note=rec("Use only non-designated venues; exchange rules and designations change often.", "text", "medium", ["S8"]), main_risks=["SAN-01", "EXC-01", "EXC-03", "TKN-01"]),
]


PROVIDER_LABELS = [
    dict(provider_class="Exchange: OFAC-designated (Nobitex, Wallex, Bitpin, Ramzinex, Aban Tether, Shelbit, BitBank)", risk_label=rec("high", "label", "high", ["S8", "S26", "S28", "S5"]),
         restriction_note=rec("Specially Designated National; USDT from it is direct sanctioned-entity exposure. Do not use as a USDT source or counterparty.", "text", "high", ["S8"])),
    dict(provider_class="Exchange: Iranian, not designated as of 2026-10-02 (verify daily)", risk_label=rec("medium", "label", "low", ["S8"], note="hazard prior ~6%/month; absence from retrieved summaries is not proof"),
         restriction_note=rec("Operates in Iran's financial sector and is therefore designable (FAQ 1257); rules and limits change often. Keep balances minimal.", "text", "medium", ["S8"])),
    dict(provider_class="Custodial USDT card provider (mpay-like)", risk_label=rec("high", "label", "medium", ["S42"]),
         restriction_note=rec("Provider terms on Iran-resident customers must be confirmed in writing; accounts can be frozen or closed; balances may be non-refundable.", "text", "medium", ["S42"])),
    dict(provider_class="Voucher / gift-card aggregator", risk_label=rec("medium", "label", "low"), restriction_note=rec("Iran policy unverified; region locks and code revocation possible.", "text", "low")),
    dict(provider_class="AI vendor (OpenAI, Anthropic, ...)", risk_label=rec("high", "label", "medium", ["S34", "S35", "S48"]),
         restriction_note=rec("Iran is not a supported region (Anthropic list seen directly; OpenAI's list excludes Iran per summaries); accounts can be suspended without notice.", "text", "medium", ["S34", "S35", "S48"])),
]


def meta_modifiers_ids():
    return ["TKN-01", "TKN-03", "SAN-02", "PRV-01", "PRV-02", "PRV-05"]


def build_register() -> dict:
    risks = []
    cat_count = Counter()
    for r in RISKS:
        pm = r["pm"]
        py = p_year(pm)
        L = l_bucket(pm)
        inherent = L * r["imp"]
        res_L = max(1, L - r["dL"])
        res_I = max(1, r["imp"] - r["dI"])
        res = res_L * res_I
        cat_count[r["cat"]] += 1
        sim_p = rec(pm, "probability/month", r["conf"], r["psrc"] if r["conf"] in ("medium", "high") else r["psrc"], low=r["lo"], high=r["hi"],
                    note=r["pnote"] or "modelling prior", annual_equivalent=round(py, 4), formula="annual = 1-(1-pm)^12",
                    verify_how=r["pverify"] or "Calibrate against observed incident logs (ops) and the sources in 'sources'; replace prior when a base rate is verified")
        if r["conf"] in ("medium", "high") and not r["psrc"]:
            sim_p["confidence"] = "low"
        risk = OrderedDict()
        risk["id"] = r["id"]
        risk["title"] = r["title"]
        risk["description"] = r["desc"]
        risk["category"] = r["cat"]
        risk["scope"] = r["scope"]
        risk["likelihood"] = rec(L, "scale_1_5", "low", note=f"bucket of annual probability {py:.1%} (<1%, 1-5%, 5-20%, 20-50%, >50%)", annual_probability=round(py, 4))
        risk["impact"] = rec(r["imp"], "scale_1_5", "low", note="expert judgement on the meta.scales.impact definitions; relative to owner equity and monthly gross margin")
        risk["triggers"] = r["triggers"]
        risk["kri"] = r["kri"]
        risk["controls"] = r["ctrls"]
        risk["inherent"] = rec(inherent, "score_1_25", "low", note="likelihood x impact", rating=rating(inherent))
        risk["residual"] = rec(res, "score_1_25", "low", note="after controls: likelihood reduced by dL, impact by dI (expert judgement, not tested)",
                               residual_likelihood=res_L, residual_impact=res_I, control_effect={"dL": r["dL"], "dI": r["dI"]}, rating=rating(res))
        sim = OrderedDict()
        sim["probability_per_month"] = sim_p
        sim["applies_when"] = r["applies"]
        sim["impact"] = {"type": r["itype"], "params": r["params"]}
        if r["secondary"]:
            sim["secondary_impacts"] = r["secondary"]
        if r["groups"]:
            sim["correlation_groups"] = r["groups"]
        risk["sim"] = sim
        risks.append(risk)

    controls = [OrderedDict(id=c[0], title=c[1], type=c[2], description=c[3]) for c in CONTROLS]
    ids = {r["id"] for r in RISKS}
    cids = {c[0] for c in CONTROLS}
    for r in RISKS:
        for c in r["ctrls"]:
            assert c in cids, (r["id"], c)
    for g in CORRELATION_GROUPS.values():
        for k in g["multipliers"]:
            assert k in ids, k
    for em in meta_modifiers_ids():
        assert em in ids, em
    for lg in LABEL_GUIDANCE:
        for k in lg["main_risks"]:
            assert k in ids, k

    rate_counts = Counter(rk["residual"]["rating"] for rk in risks)
    inh_counts = Counter(rk["inherent"]["rating"] for rk in risks)
    always = [r for r in RISKS if r["applies"] == ["always"]]
    portfolio = OrderedDict(
        risk_count=len(risks), by_category=dict(cat_count), residual_rating_counts=dict(rate_counts), inherent_rating_counts=dict(inh_counts),
        expected_events_per_year_always_applicable=round(sum(r["pm"] for r in always) * 12, 2),
        note="Sum of monthly probabilities x 12 over always-applicable risks; a rough event-count intensity, not a forecast. Conditional risks (applies_when) excluded.")
    meta = OrderedDict(
        title="Risk register - sanctions, counterparty, operational (HiClaude reseller)", owner_agent="05-sanctions-counterparty-risk", as_of=AS_OF,
        purpose="Consumed by the simulator (sim.*), the pricing engine (risk premium via data in docs), ops (controls/KRIs) and the catalog (label_guidance).",
        scales=OrderedDict(
            likelihood={"1": "rare: <1% per year", "2": "unlikely: 1-5%/yr", "3": "possible: 5-20%/yr", "4": "likely: 20-50%/yr", "5": "almost certain: >50%/yr"},
            impact={"1": "minor: <0.5% of equity, no customer impact", "2": "moderate: 0.5-3% of equity or <1 day degraded service", "3": "significant: 3-10% of equity or 1-3 days outage",
                    "4": "major: 10-30% of equity or >3 days outage / product line closed", "5": "severe: >30% of equity or business-ending"},
            rating={"low": "score 1-4", "medium": "5-9", "high": "10-15", "critical": "16-25"}),
        sim_semantics=OrderedDict(
            probability_per_month="Chance that at least one such event STARTS in a simulated month, before correlation multipliers; draw with the seeded Rng. 'low'/'high' are for tornado sensitivity.",
            float_freeze_pct="params {scope, pct (share of the scope's balance frozen), duration_days (null = indefinite), recovery_prob (chance the frozen share is eventually recovered)}; unrecovered share is written off to a counterparty-loss account; frozen share is unavailable meanwhile.",
            downtime_hours="params {scope, hours_median, hours_p90} (lognormal fit) or {hours_per_day_unavailable, duration_days}; scope = the capability that is unavailable.",
            fine_irt="one-off cash loss/cost: params {kind, amount_usd | pct_of_monthly_revenue | pct_of_monthly_gmv | pct_of_trailing_12m_revenue}; convert USD at the simulated rate.",
            demand_multiplier="params {segment, multiplier, duration_days (null = permanent)}; multiplies the arrival rate of that segment.",
            fee_change="params {target, delta_pp | delta_pct | multiplier, duration_days (null = persistent)}; target names a price/fee/rate parameter of the pricing engine or world.",
            applies_when="Flags the simulator/business config must satisfy for the risk to be active; unknown flags default to inactive.",
            correlation_groups="Scenario engines may activate a group: multiply each member's monthly probability by the listed multiplier while the group is active (cap at 1)."),
        condition_flags=OrderedDict([
            ("always", "active in every run"), ("uses_designated_exchange", "USDT is sourced from an OFAC-designated exchange (not recommended)"),
            ("accepts_usdt_inbound", "customers may pay in USDT"), ("uses_otc_desk", "fiat-to-USDT leg runs through a foreign OTC desk / exchange house"),
            ("voucher_line", "voucher / gift-card products are sold"), ("ai_subscription_line", "AI subscriptions are sold"),
            ("uses_card_to_card", "card-to-card collection is enabled"), ("messenger_channels", "Telegram/Bale Mini App channels are enabled"),
            ("has_operators", "human operators handle fulfilment")]),
        exposure_modifiers=OrderedDict([
            ("uses_designated_exchange", OrderedDict(multipliers={"TKN-01": 6, "TKN-03": 3, "SAN-02": 3}, confidence="low",
                                                     note="assumption: direct SDN exposure raises freeze/contagion hazards several-fold; calibrate when provider/Tether data exist")),
            ("accepts_usdt_inbound", OrderedDict(multipliers={"TKN-01": 3, "TKN-03": 2}, confidence="low",
                                                 note="assumption: unscreened customer USDT contaminates the treasury wallet; most Iranian USDT originates at SDN exchanges (S1)")),
            ("provider_share_over_60pct", OrderedDict(multipliers={"PRV-01": 1.5, "PRV-02": 1.5, "PRV-05": 1.5}, confidence="low",
                                                      note="assumption: concentration amplifies provider-specific hazards (provider attention, shared fate)")),
        ]),
        scenario_links=SCENARIO_LINKS,
        cross_specialist_reconciliation=[
            "02 C13: exchange balance cap changed from 1 day to lock days + 1 (about 4 days) because of the 72h withdrawal lock (CTL-04; expected-loss baseline recomputed).",
            "02: gateway closure evidenced for Dey 1403 (2024-12-26), not Dey 1404 (EXC-05 corrected; duration lengthened to median 10 days).",
            "02: pool of 18 venues used for the designation hazard (pool 20 with Shelbit and BitBank); halt/cap episode 2026-09-30 to 2026-10-04 recorded in EXC-03.",
            "04: April CBI action dated 2026-04-24 (timeline event dated); AML retention >= 5 years vs 10 years recommended (CTL-16); currency-smuggling fine 2x value added to LEG-01; usdtPaymentForResidents=false aligns with CTL-23.",
            "04: its action-cadence statistic uses 4 actions (gaps 39/44/63, mean 48.7 days) and omits the 2026-08-07 Aban Tether/Shelbit designation; including all six actions the mean gap is 46.0 days.",
            "06: OpenAI exclusion of Iran and the 2024-07-09 API block (per summaries) strengthen VND-01 and the AI-subscription label.",
            "03: Shaparak instructions on crypto/VPN/betting merchants support PAY-01; TRC20 contract address TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t corroborated by exchange-API samples."],
        evidence_limits="Likelihood parameters are modelling priors. Anchors with data: Tether freeze rates (BlockSec 2025), OFAC designation cadence (2026), CBI freeze waves. Provider/exchange failure base rates could NOT be sourced in-session (search budget exhausted) and are flagged low confidence with verify_how.",
        not_legal_advice="Analysis only; confirm with licensed professionals (CLAUDE.md s3.4)."
    )
    return OrderedDict(meta=meta, portfolio=portfolio, controls=controls, correlation_groups=CORRELATION_GROUPS, label_guidance=LABEL_GUIDANCE,
                       provider_labels=PROVIDER_LABELS, risks=risks)


def main() -> None:
    tl = build_timeline()
    reg = build_register()
    (ROOT / "data" / "sanctions_timeline.json").write_text(json.dumps(tl, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (ROOT / "data" / "risk_register.json").write_text(json.dumps(reg, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"risks: {len(reg['risks'])}  controls: {len(reg['controls'])}  events: {len(tl['events'])}")
    print("by category:", dict(Counter(r['category'] for r in reg['risks'])))
    print("portfolio:", json.dumps(reg["portfolio"], ensure_ascii=False))
    print("\nTop risks by residual (then inherent):")
    rows = sorted(reg["risks"], key=lambda r: (-r["residual"]["value"], -r["inherent"]["value"], r["id"]))
    for r in rows[:22]:
        pm = r["sim"]["probability_per_month"]
        print(f"| {r['id']} | {r['title'][:70]} | {pm['value']:.3f} | {r['impact']['value']} | {r['inherent']['value']} | {r['residual']['value']} ({r['residual']['rating']}) |")


if __name__ == "__main__":
    main()
