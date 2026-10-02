#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Brief 02 (ir-exchanges-usdt-rails): builds data/exchanges.json and data/regulatory_limits.json.

This file is the single place where every sourced fact, every modelling assumption and every
`verify_how` for the two data files lives. Re-run the brief monthly: edit values here (or in the
JSON directly), then:

    python3 scripts/research/02_build_data.py          # writes both JSON files (no cost table)
    python3 scripts/research/02_conversion_cost.py --write   # computes + embeds conversion/treasury tables
    node scripts/validate-data.mjs data/exchanges.json data/regulatory_limits.json

Conventions (CLAUDE.md section 5):
  * every leaf fact is a Record {value, unit, as_of, confidence, sources[], status, verify_how, note}
  * `status` on a Record = evidence status (verified|reported|UNVERIFIED|conflicting)
  * regulatory rules are Records too; their lifecycle is in `rule_status` (active|temporary|expired|unknown),
    because the validator reserves `status` for evidence status.
  * percentages are plain percent numbers (0.25 means 0.25 %).
  * Toman = IRT. 1 Toman = 10 Rial. Nobitex IRT-market API prices are in RIAL, Bitpin/Wallex/Tabdeal in TOMAN.
"""
import json
import pathlib

AS_OF = "2026-10-02"
ROOT = pathlib.Path(__file__).resolve().parents[2]

# --------------------------------------------------------------------------------------------
# Source registry. note="per search summary" = the page itself was NOT seen (search tool summary only).
# note="read directly" = fetched/downloaded and read by the agent (GitHub raw docs, PyPI sdist/wheel, pkg.go.dev).
# --------------------------------------------------------------------------------------------
SS = "per search summary"
RD = "read directly"
_S = {}


def _add(key, url, title, note):
    _S[key] = {"url": url, "title": title, "note": note}


# --- halt / buy cap (Mehr 1405) ---
_add("zoomit_halt", "https://www.zoomit.ir/iran-news/468234-tether-night-trading-halted/", "Zoomit: night USDT trading halted; purchase limited to 2,000 USDT", SS)
_add("iranwire_halt", "https://iranwire.com/fa/news-1/158313-%D9%85%D8%A8%D8%A7%D8%AF%D9%84%D9%87-%D8%AA%D8%AA%D8%B1-%D8%A7%D8%B2-%D8%B3%D8%A7%D8%B9%D8%AA-%DB%B2%DB%B1-%D9%87%D8%B1-%D8%B4%D8%A8-%D8%AA%D8%A7-%DB%B9-%D8%B5%D8%A8%D8%AD-%D8%B1%D9%88%D8%B2-%D8%A8%D8%B9%D8%AF-%D9%85%D9%85%D9%86%D9%88%D8%B9-%D8%B4%D8%AF/", "IranWire: USDT exchange banned 21:00-09:00", SS)
_add("itresan_halt", "https://itresan.com/495987/usdt-night-trading-restriction-iran/", "ITResan: night USDT trading halted, daily buy cap 2,000 USDT", SS)
_add("fararu_halt", "https://fararu.com/fa/news/1006444/%D8%AA%D8%B9%D8%B7%DB%8C%D9%84%DB%8C-%D9%85%D8%B9%D8%A7%D9%85%D9%84%D8%A7%D8%AA-%D8%B4%D8%A8%D8%A7%D9%86%D9%87-%D8%AA%D8%AA%D8%B1-%D8%AF%D8%B1-%D8%B5%D8%B1%D8%A7%D9%81%DB%8C-%D9%87%D8%A7%DB%8C-%D8%AF%DB%8C%D8%AC%DB%8C%D8%AA%D8%A7%D9%84", "Fararu: closure of night USDT trading at exchanges", SS)
_add("tejarat_halt", "https://tejaratnews.com/%D9%85%D8%B9%D8%A7%D9%85%D9%84%D8%A7%D8%AA-%D8%B4%D8%A8%D8%A7%D9%86%D9%87-%D8%AA%D8%AA%D8%B1-%D9%85%D8%AA%D9%88%D9%82%D9%81-%D8%B4%D8%AF-%D8%A7%D8%AB%D8%B1%DB%8C-%D8%A8%D8%B1-%D9%82%DB%8C%D9%85%D8%AA", "TejaratNews: night USDT trading halted - effect on dollar price?", SS)
_add("snn_halt", "https://snn.ir/fa/news/1463342/%D9%85%D8%B9%D8%A7%D9%85%D9%84%D8%A7%D8%AA-%D8%B4%D8%A8%D8%A7%D9%86%D9%87-%D8%AA%D8%AA%D8%B1-%D9%85%D8%AA%D9%88%D9%82%D9%81-%D8%B4%D8%AF-%D8%B3%D9%82%D9%81-%D8%AE%D8%B1%DB%8C%D8%AF-%D8%B1%D9%88%D8%B2%D8%A7%D9%86%D9%87-2-%D9%87%D8%B2%D8%A7%D8%B1-%D8%AA%D8%AA%D8%B1-%D8%AA%D8%B9%DB%8C%DB%8C%D9%86-%D8%B4%D8%AF", "SNN: night trading halted, daily buy cap 2,000 USDT", SS)
_add("hamshahri_halt", "https://www.hamshahrionline.ir/news/1073206/%D9%85%D8%B9%D8%A7%D9%85%D9%84%D8%A7%D8%AA-%D8%B4%D8%A8%D8%A7%D9%86%D9%87-%D8%AA%D8%AA%D8%B1-%D9%85%D8%AA%D9%88%D9%82%D9%81-%D8%B4%D8%AF-%D8%B3%D9%82%D9%81-%D8%AE%D8%B1%DB%8C%D8%AF-%D8%A8%D8%B1%D8%A7%DB%8C-%D9%87%D8%B1%DA%A9%D8%A7%D8%B1%D8%A8%D8%B1-%D8%B3%D9%87%D9%85%DB%8C%D9%87-%D8%A7%DB%8C-%D8%B4%D8%AF", "Hamshahri: night USDT trading halted, per-user quota-style purchase cap", SS)
_add("mihan_halt", "https://mihanblockchain.com/tether-night-trading-halt-iran-exchanges/", "Mihan Blockchain: night USDT halt and unprecedented limits at Iranian exchanges by CBI order", SS)
_add("ramzarz_news709", "https://ramzarz.news/news/iranian-crypto-exchanges-news-709", "Ramzarz News: Iranian exchanges news (9 Mehr 1405)", SS)
_add("arzdigital_aban_halt", "https://arzdigital.com/breaking/4418619/", "ArzDigital: AbanTether USDT trading limits, daily buy limited to 2,000 USDT (until 21:00 Sun 12 Mehr)", SS)
_add("khabarfoori_halt", "https://www.khabarfoori.com/%D8%A8%D8%AE%D8%B4-%D8%A7%D9%82%D8%AA%D8%B5%D8%A7%D8%AF%DB%8C-145/3249118-%D9%85%D8%B9%D8%A7%D9%85%D9%84%D8%A7%D8%AA-%D8%B4%D8%A8%D8%A7%D9%86%D9%87-%D8%AA%D8%AA%D8%B1-%D8%AF%D8%B1-%D8%B5%D8%B1%D8%A7%D9%81%DB%8C-%D9%87%D8%A7%DB%8C-%D8%B1%D9%85%D8%B2%D8%A7%D8%B1%D8%B2-%D9%85%D8%AD%D8%AF%D9%88%D8%AF-%D8%B4%D8%AF", "KhabarFoori: night USDT trading restricted", SS)
# --- ID-based deposit cap / CBI limits ---
_add("zarinpal_idcap", "https://www.zarinpal.com/blog/%D8%AF%D8%B3%D8%AA%D9%88%D8%B1-%D8%AC%D8%AF%DB%8C%D8%AF-%D8%A8%D8%A7%D9%86%DA%A9-%D9%85%D8%B1%DA%A9%D8%B2%DB%8C%D8%9B-%DA%A9%D8%A7%D9%87%D8%B4-%D8%B3%D9%82%D9%81-%D9%88%D8%A7%D8%B1%DB%8C%D8%B2-%D8%B4/", "Zarinpal blog: new CBI order - ID-based deposit cap to crypto exchanges reduced", SS)
_add("irasin_idcap", "https://www.irasin.ir/news/60520/%D9%85%D8%AD%D8%AF%D9%88%D8%AF%DB%8C%D8%AA-%D8%AC%D8%AF%DB%8C%D8%AF-%D8%A8%D8%B1%D8%A7%DB%8C-%DA%A9%D8%B3%D8%A8-%D9%88%DA%A9%D8%A7%D8%B1%D9%87%D8%A7%DB%8C-%D8%B1%D9%85%D8%B2%D8%A7%D8%B1%D8%B2%DB%8C-%D8%A8%D8%A7%D9%86%DA%A9-%D9%85%D8%B1%DA%A9%D8%B2%DB%8C-%D8%B3%D9%82%D9%81-%D9%88%D8%A7%D8%B1%DB%8C%D8%B2-%D8%B4%D9%86%D8%A7%D8%B3%D9%87-%D8%AF%D8%A7%D8%B1", "Irasin: new restriction for crypto businesses - CBI cuts ID-based deposit cap", SS)
_add("digiato_idcap", "https://digiato.com/iran-technology-news/new-restriction-cryptocurrency-businesses", "Digiato: new restriction for crypto businesses - CBI cuts ID-based deposit cap", SS)
_add("mihan_idcap", "https://mihanblockchain.com/deposit-limit-per-id-reduced-to-25m-toman/", "Mihan Blockchain: CBI notice - 25M Toman daily deposit limit per national ID", SS)
_add("iranbroker_idcap", "https://iranbroker.net/news/new-restrictions-on-deposits-with-cryptocurrency-exchanges/", "IranBroker: new restrictions on ID-based deposits at crypto exchanges", SS)
_add("ramzarz_idcap", "https://ramzarz.news/news/110906/", "Ramzarz News: new CBI order - ID-based deposit cap reduced", SS)
_add("fararu_idcap", "https://fararu.com/fa/news/772763/%D9%85%D8%AD%D8%AF%D9%88%D8%AF%DB%8C%D8%AA-%D8%AC%D8%AF%DB%8C%D8%AF-%D8%A8%D8%B1%D8%A7%DB%8C-%DA%A9%D8%B3%D8%A8-%D9%88%DA%A9%D8%A7%D8%B1-%D9%87%D8%A7%DB%8C-%D8%B1%D9%85%D8%B2%D8%A7%D8%B1%D8%B2%DB%8C", "Fararu: new restriction for crypto businesses", SS)
_add("nobitex_help_rial", "https://help.nobitex.ir/faq/rial-deposit-withdraw/", "Nobitex help centre: Rial deposit and withdrawal FAQ", SS)
_add("mihan_100m", "https://mihanblockchain.com/iranian-crypto-exchanges-issue-user-notice-according-to-new-cbi-guidelines/", "Mihan Blockchain: deposit/withdraw at Iranian exchanges limited to 100M Toman/day", SS)
_add("mihan_funds_rule", "https://mihanblockchain.com/iran-central-bank-crypto-platforms-funds-rule/", "Mihan Blockchain: CBI - investing users' Rial balances at exchanges is banned", SS)
_add("iranbroker_wd_lifted", "https://iranbroker.net/news/rial-withdrawal-limits-lifted-iranian-exchanges/", "IranBroker: Rial withdrawal limits at Iranian exchanges lifted", SS)
# --- gateways / CBI timeline ---
_add("zoomit_gw_reopen", "https://www.zoomit.ir/tech-iran/434377-payment-gateway-of-small-and-medium-cryptocurrency-exchanges-was-reopened/", "Zoomit: only gateways of a few small/medium exchanges reopened (Fintech association head)", SS)
_add("peivast_gw_blocked", "https://peivast.com/p/218262", "Peivast: exchanges' payment gateway blocked again", SS)
_add("fararu_shaparak", "https://fararu.com/fa/news/831729/%D9%86%D8%A8%D8%B1%D8%AF-%D8%B4%D8%A7%D9%BE%D8%B1%DA%A9-%D8%B5%D8%B1%D8%A7%D9%81%DB%8C-%D9%87%D8%A7%DB%8C-%D8%A7%DB%8C%D8%B1%D8%A7%D9%86%DB%8C-%D8%A7%D8%B1%D8%B2-%D8%AF%DB%8C%D8%AC%DB%8C%D8%AA%D8%A7%D9%84-%D8%A7%D8%AC%D8%B1%D8%A7%DB%8C-%D8%B4%D8%B1%D8%B7-%D8%B4%D8%B1%D9%88%D8%B7-%DA%AF%D8%A7%D9%86%D9%87-%DB%8C%D8%A7-%D9%BE%D8%A7%DB%8C%D8%A7%D9%86-%DA%A9%D8%A7%D8%B1", "Fararu: Shaparak vs Iranian exchanges - ten conditions or end of business?", SS)
_add("mihan_direct_rial_halt", "https://mihanblockchain.com/iranian-exchanges-direct-rial-payment-halt/", "Mihan Blockchain: direct Rial deposit at exchanges halted", SS)
_add("mihan_gw_conditions", "https://mihanblockchain.com/iran-central-bank-conditions-crypto-exchanges/", "Mihan Blockchain: CBI states conditions for reopening exchange gateways", SS)
_add("wallex_blog_gw", "https://wallex.ir/blog/%D9%BE%D8%A7%D8%B3%D8%AE-%D8%A8%D9%87-%D8%AF%D8%BA%D8%AF%D8%BA%D9%87-%DA%A9%D8%A7%D8%B1%D8%A8%D8%B1%D8%A7%D9%86/", "Wallex blog: answer to users about closed exchange payment gateways", SS)
_add("entekhab_gw", "https://www.entekhab.ir/fa/news/841149/%D8%AF%D8%B1%DA%AF%D8%A7%D9%87-%D9%BE%D8%B1%D8%AF%D8%A7%D8%AE%D8%AA-%D8%B5%D8%B1%D8%A7%D9%81%DB%8C%E2%80%8C%D9%87%D8%A7%DB%8C-%D8%B1%D9%85%D8%B2-%D8%A7%D8%B1%D8%B2-%D9%85%D8%B3%D8%AF%D9%88%D8%AF-%D8%B4%D8%AF", "Entekhab: crypto exchanges' payment gateway blocked", SS)
_add("intellinews_block", "https://intellinews.com/iran-central-bank-blocks-crypto-payments-amid-industry-backlash-359655", "bne IntelliNews: Iran central bank blocks crypto payments amid industry backlash", SS)
_add("nobsbitcoin_gw", "https://www.nobsbitcoin.com/iran-central-bank-blocks-payment-gateways-to-cryptocurrency-exchanges-amid-currency-crisis/", "NoBS Bitcoin: Iran central bank blocks payment gateways to crypto exchanges", SS)
_add("specialeurasia", "https://www.specialeurasia.com/2025/02/05/crypto-iran-geopolitics/", "Special Eurasia: Crypto under control - geopolitical drivers of Iran's new regulation", SS)
_add("crystal_timeline", "https://crystalintelligence.com/?p=29594", "Crystal Intelligence: investigations (Mar 2025) - Iran Shaparak/CBI crypto restrictions timeline", SS)
# --- 72 h lock ---
_add("peivast_72h", "https://peivast.com/p/173791", "Peivast: 72-hour settlement limit became a challenge for exchanges", SS)
_add("bitpin_help", "https://help.bitpin.ir/fa/category/oariz-o-brdasht-4rhzeu/", "Bitpin help: deposits and withdrawals", SS)
_add("arzdigital_bit24", "https://arzdigital.com/exchange/bit24/", "ArzDigital: Bit24 review (updated Shahrivar 1405)", SS)
_add("iranbroker_tetherland", "https://iranbroker.net/interview-with-senior-managers-of-tetherland-exchange/", "IranBroker: FATA - every transaction must settle after 72h; Tetherland managers react", SS)
_add("iranbroker_delay", "https://iranbroker.net/news/the-cryptocurrency-withdrawal-process-from-iranian-exchanges/", "IranBroker: long crypto withdrawal delays at Iranian exchanges", SS)
_add("pingi_72h", "https://pingi.co/help/deposit-and-withdraw/72h-limit", "Pingi help: why is there a 72-hour crypto withdrawal limit", SS)
_add("kifpool_terms", "https://kifpool.me/terms_fa", "Kifpool terms of service", SS)
_add("sharghdaily_deposit", "https://www.sharghdaily.com/%D8%A8%D8%AE%D8%B4-%D9%81%D9%86%D8%A7%D9%88%D8%B1%DB%8C-298/946790-%D9%88%D8%A7%D8%B1%DB%8C%D8%B2-%D8%A8%D9%87-%D8%AD%D8%B3%D8%A7%D8%A8-%D8%A8%D8%A7%D9%86%DA%A9%DB%8C-%D8%B5%D8%B1%D8%A7%D9%81%DB%8C-%D9%87%D8%A7%DB%8C-%D8%B1%D9%85%D8%B2%D8%A7%D8%B1%D8%B2%DB%8C-%D9%85%D9%88%D9%82%D8%AA%D8%A7-%D9%85%D8%AD%D8%AF%D9%88%D8%AF-%D8%B4%D8%AF", "Shargh Daily: deposits to exchanges' bank accounts temporarily limited", SS)
_add("nipoto_fata", "https://nipoto.com/helpcenter/1402/06/21/fata-limitation-withdraw/", "Nipoto help (21 Shahrivar 1402): FATA withdrawal limits notice", SS)
# --- sanctions / hack / freezes / shutdown ---
_add("scorechain_ofac", "https://www.scorechain.com/blog/ofac-iran-crypto-sanctions-june-2026", "Scorechain: OFAC sanctions Iran's four largest crypto exchanges", SS)
_add("globalledger_ofac", "https://blog.globalledger.io/research-investigations/ofac-nobitex-iranian-crypto-exchanges", "Global Ledger: OFAC targets Nobitex and other Iranian exchanges", SS)
_add("crystal_ofac", "https://crystalintelligence.com/sanctions/crypto-sanctions-screening-ofac-targets-iran-exchanges/", "Crystal Intelligence: crypto sanctions screening - OFAC targets Iran exchanges", SS)
_add("trm_ofac", "https://www.trmlabs.com/resources/blog/three-enforcement-layers-in-five-months-ofac-designates-irans-domestic-crypto-exchanges", "TRM Labs: three enforcement layers in five months - OFAC designates Iran's domestic exchanges", SS)
_add("cryptobriefing_ofac", "https://cryptobriefing.com/us-sanctions-iran-crypto-exchanges-nobitex-ofac/", "Crypto Briefing: US sanctions Iranian crypto exchanges incl. Nobitex", SS)
_add("bitcoincom_ofac", "https://news.bitcoin.com/nobitex-sanctions-hit-irans-largest-crypto-exchange-as-compliance-risks-grow/", "Bitcoin.com News: Nobitex sanctions hit Iran's largest exchange", SS)
_add("willkie_ofac", "https://complianceconcourse.willkie.com/articles/ofac-designates-irans-largest-digital-asset-exchanges/", "Willkie Compliance Concourse: OFAC designates Iran's largest digital asset exchanges", SS)
_add("elliptic_ofac", "https://www.elliptic.co/blog/ofac-sanctions-nobitex-and-three-other-iranian-cryptoasset-exchanges", "Elliptic: OFAC sanctions Nobitex and three other Iranian exchanges", SS)
_add("unchained_ofac", "https://unchainedcrypto.com/us-treasury-sanctions-irans-largest-crypto-exchange-nobitex-along-with-three-other-iranian-platforms-under-economic-fury-campaign/", "Unchained: US Treasury sanctions Nobitex and three other Iranian platforms", SS)
_add("cointelegraph_nobitex", "https://cointelegraph.com/news/the-nobitex-dilemma-how-irans-biggest-crypto-exchange-stays-off-the-ofac-blacklist", "Cointelegraph: The Nobitex dilemma", SS)
_add("cryptojobs_shutdown", "https://crypto.jobs/news/iran-s-internet-shutdown-highlights-compliance-challenges-for-crypto-exchanges", "Crypto.jobs: Iran internet shutdown highlights compliance challenges for exchanges", SS)
_add("cryptonomist_tether", "https://en.cryptonomist.ch/2026/09/28/tether-usdt-freezing-iran/", "Cryptonomist: Tether USDT freezing Iran hits $550M in 2026", SS)
_add("securities_tether", "https://www.securities.io/tether-says-2026-iran-linked-usdt-freezes-total-about-550-million/", "Securities.io: Tether says 2026 Iran-linked USDT freezes total about $550M", SS)
_add("cryptorank_tether", "https://cryptorank.io/news/feed/c0781-tether-helped-freeze-550m-in-iran-linked-usdt-reveals-4-9b-total-freeze", "CryptoRank: Tether helped freeze $550M Iran-linked USDT", SS)
_add("coinrepublic_tether", "https://www.thecoinrepublic.com/2026/09/29/tether-has-frozen-nearly-550m-in-iran-linked-usdt-in-2026/", "The Coin Republic: Tether has frozen nearly $550M in Iran-linked USDT in 2026", SS)
_add("crowdfund_hack", "https://www.crowdfundinsider.com/2025/06/242814-nearly-100m-burned-irans-largest-crypto-exchange-nobitex-suffers-major-hack/", "Crowdfund Insider: nearly $100M burned - Nobitex hack", SS)
_add("scorechain_hack", "https://www.scorechain.com/blog/nobitex-hack", "Scorechain: Nobitex hack analysis", SS)
_add("intellinews_hack", "https://www.intellinews.com/iran-cryptocurrency-exchange-loses-81mn-in-hacker-attack-386665/", "bne IntelliNews: Iran crypto exchange loses $81mn in hacker attack", SS)
_add("fortune_hack", "https://dc.fortune.com/crypto/2025/06/18/nobitex-gonjeshke-darande-predatory-sparrow-iran-israel-hack/", "Fortune: Nobitex / Predatory Sparrow hack", SS)
_add("bitdefender_hack", "https://bitdefender.in/pro-israel-hacker-group-destroys-90-million-in-cryptocurrency-in-irans-largest-crypto-exchange", "Bitdefender: pro-Israel hacker group destroys $90M at Nobitex", SS)
# --- fees ---
_add("nobitex_pricing", "https://nobitex.ir/pricing/", "Nobitex: fees and service costs", SS)
_add("nobitex_fees_help", "https://help.nobitex.ir/knowledgebase/trading-fees/", "Nobitex help: trading fees", SS)
_add("sanjesh_nobitex", "https://sanjeshbroker.com/nobitex-exchange-fees/", "Sanjesh Broker: Nobitex fees", SS)
_add("zoomarz_nobitex", "https://zoomarz.com/tether-to-toman-conversion-fee-in-nobitex/", "ZoomArz: USDT to Toman conversion fee at Nobitex (0.2 %)", SS)
_add("wallex_fee_help", "https://wallex.ir/help/docs/help-center/commission/trade/", "Wallex help: trade commission", SS)
_add("tradingfinder_wallex", "https://tradingfinder.net/exchanges/wallex/commission/", "TradingFinder: Wallex commission 1405", SS)
_add("zoomit_compare", "https://www.zoomit.ir/cryptocurrency/443544-crypto-tether-fee-iran-exchanges/", "Zoomit: where to buy USDT - fee comparison across Iranian exchanges", SS)
_add("novintether_fees", "https://novintether.com/blog/cryptocurrency-exchange-fees/", "NovinTether blog: exchange fee list (14 exchanges, 1405) - operator-published, treat as marketing", SS)
_add("zoomit_ramzinex", "https://www.zoomit.ir/pr/457044-ramzinex-sell-and-buy/", "Zoomit (sponsored): Ramzinex buy/sell fees", SS)
_add("ramzinex_blog", "https://ramzinex.com/blog/how-to-buy-tether-with-low-fee/", "Ramzinex blog: buying USDT with low fee", SS)
_add("tabdeal_commissions", "https://tabdeal.org/commissions", "Tabdeal: commissions", SS)
_add("tabdeal_buy_usdt", "https://tabdeal.org/buy-usdt", "Tabdeal: buy USDT", SS)
_add("tokenbaz_bit24", "https://tokenbaz.com/blog/bit24-user-levels-deposit-withdrawal-limits/", "TokenBaz: Bit24 user levels and deposit/withdrawal limits", SS)
_add("pishkhanak_aban", "https://pishkhanak.com/blog/abantether-crypto-exchange-review-guide", "Pishkhanak: AbanTether review", SS)
_add("arzdigital_aban", "https://arzdigital.com/exchange/abantether/", "ArzDigital: AbanTether review (updated Shahrivar 1405)", SS)
_add("khanesarmaye_fees", "https://khanesarmaye.com/lowest-fees-iranian-exchanges/", "Khane Sarmaye: lowest-fee Iranian exchanges", SS)
# --- prices ---
_add("nabzgheymat_0710", "https://nabzgheymat.ir/%D9%82%DB%8C%D9%85%D8%AA-%D8%AA%D8%AA%D8%B1-%D8%A7%D9%85%D8%B1%D9%88%D8%B2-%D8%AC%D9%85%D8%B9%D9%87-%DB%B1%DB%B0-%D9%85%D9%87%D8%B1-%DB%B1%DB%B4%DB%B0%DB%B5-%E2%94%82-%D9%81%D8%A7%D8%B5%D9%84%D9%87/", "NabzGheymat: USDT price Friday 10 Mehr 1405", SS)
_add("nobitex_price_usdt", "https://nobitex.ir/price/usdt/", "Nobitex: live USDT price page", SS)
# --- API evidence (read directly) ---
_add("nobitex_docs", "https://github.com/nobitex/docs-api", "Nobitex official API docs (Slate source, files source/includes/_*.md on branch master)", RD)
_add("nobitex_docs_market", "https://raw.githubusercontent.com/nobitex/docs-api/master/source/includes/_market_data.md", "Nobitex API docs: public market data (orderbook v3, depth v2, trades, stats, UDF)", RD)
_add("nobitex_docs_general", "https://raw.githubusercontent.com/nobitex/docs-api/master/source/includes/_general_notes.md", "Nobitex API docs: general notes, rate limits", RD)
_add("nobitex_docs_wd", "https://raw.githubusercontent.com/nobitex/docs-api/master/source/includes/_withdraw_coin.md", "Nobitex API docs: crypto withdrawals", RD)
_add("nobitex_docs_rial", "https://raw.githubusercontent.com/nobitex/docs-api/master/source/includes/_withdraw_rial.md", "Nobitex API docs: Rial withdrawals", RD)
_add("nobitex_docs_other", "https://raw.githubusercontent.com/nobitex/docs-api/master/source/includes/_other.md", "Nobitex API docs: /v2/options (system settings)", RD)
_add("nobitex_docs_ws", "https://raw.githubusercontent.com/nobitex/docs-api/master/source/includes/_websocket.md", "Nobitex API docs: WebSocket (Centrifugo)", RD)
_add("nobitex_docs_intro", "https://raw.githubusercontent.com/nobitex/docs-api/master/source/includes/_intro.md", "Nobitex API docs: intro, auth, API keys, new-device withdrawal restriction", RD)
_add("nobitex_docs_trade", "https://raw.githubusercontent.com/nobitex/docs-api/master/source/includes/_market_trade.md", "Nobitex API docs: spot orders, units (Rial), min order", RD)
_add("nobitex_docs_addr", "https://raw.githubusercontent.com/nobitex/docs-api/master/source/includes/_address_book.md", "Nobitex API docs: address book and safe-withdrawal mode", RD)
_add("nobitex_docs_sec", "https://raw.githubusercontent.com/nobitex/docs-api/master/source/includes/_security.md", "Nobitex API docs: security (emergency cancel -> 72 h withdrawal block)", RD)
_add("nobitex_docs_user", "https://raw.githubusercontent.com/nobitex/docs-api/master/source/includes/_user_data.md", "Nobitex API docs: user data, limitations (levels)", RD)
_add("nobitex_docs_symbols", "https://raw.githubusercontent.com/nobitex/docs-api/master/source/includes/_symbols.md", "Nobitex API docs: symbols and network codes", RD)
_add("go_nobitex", "https://pkg.go.dev/github.com/darhelm/go-nobitex", "go-nobitex SDK (unofficial) - endpoint list", RD)
_add("exir_docs", "https://github.com/exirio/apidocs", "Exir REST API docs (Slate, last push 2022-10; v0 paths)", RD)
_add("tabdeal_sdk", "https://pypi.org/project/tabdeal-python/", "tabdeal-python 0.4.7 (official SDK by Tabdeal-Exchange org): client.py/spot.py", RD)
_add("tabdeal_postman", "https://github.com/Tabdeal-Exchange/tabdeal-api-postman", "Tabdeal API Postman collection repo (docs at docs.tabdeal.org)", RD)
_add("bitpin_sdk", "https://github.com/amirSamanQ/python-bitpin", "python-bitpin README (unofficial, Aug 2026): REST /api/v1, orderbook, units, Centrifugo WS", RD)
_add("bitpin_pypi", "https://pypi.org/project/python-bitpin/", "python-bitpin 0.0.11 / bitpin 0.4.3 (unofficial SDKs) source", RD)
_add("wallex_pypi", "https://pypi.org/project/wallex/", "wallex 0.5.2 (unofficial SDK): https://api.wallex.ir/v1/{markets,depth,trades,udf/history,account/...}", RD)
_add("go_wallex", "https://github.com/darhelm/go-wallex", "go-wallex README (unofficial): X-API-Key auth, docs at api-docs.wallex.ir", RD)
_add("bit24_sdk", "https://github.com/amiwrpremium/python-bit24", "python-bit24 (unofficial SDK for docs.bit24.cash): rest.bit24.cash pro/capi/v1/...", RD)
_add("aban_sdk", "https://github.com/Abantether-com/abantether-python-sdk", "abantether-python-sdk 0.1.4 (org-published): api.abantether.com OTC endpoints", RD)
_add("ramzinex_php", "https://packagist.org/packages/ramzinex/php", "ramzinex/php SDK page (Postman docs link; public API host per search summary)", RD)
_add("first_pass", "docs/business-plan-full-context.md", "First-pass research doc in this repo (secondary: itself compiled from search summaries)", "internal, secondary")
_add("sim_spec", "docs/05-architecture/sim-spec.md", "Lead's simulator spec (assumption: Paya/Satna do not settle Thu-afternoon/Fri/holidays)", "internal")
_add("s05_sanctions", "data/sanctions_timeline.json", "05-sanctions-counterparty-risk specialist file (internal cross-reference; its own sources are per search summary)", "internal cross-reference, not re-verified by 02")
_add("coindesk_aban", "https://www.coindesk.com/policy/2026/08/07/u-s-widens-iran-crypto-crackdown-with-sanctions-on-two-exchanges", "CoinDesk 2026-08-07: US widens Iran crypto crackdown with sanctions on two exchanges (Shelbit, Aban Tether) - as cited in file 05", "cited by file 05; page not seen by 02")
_add("ofac_faq1257", "https://ofac.treasury.gov/faqs/1257", "OFAC FAQ 1257: E.O. 13902 digital-asset exchanges / non-US person exposure - as cited in file 05", "cited by file 05; page not seen by 02")
_add("s03_gateways", "data/gateways.json", "03-ir-payments-collection specialist file (internal cross-reference): Paya cycles, gateway closures pattern", "internal cross-reference, not re-verified by 02")


def S(*keys):
    return [dict(_S[k]) for k in keys]


# --------------------------------------------------------------------------------------------
# Record helpers
# --------------------------------------------------------------------------------------------
def R(value, unit=None, conf="medium", srcs=(), status="reported", verify=None, note=None, as_of=AS_OF):
    d = {"value": value}
    if unit:
        d["unit"] = unit
    d["as_of"] = as_of
    d["confidence"] = conf
    if srcs:
        d["sources"] = S(*srcs)
    if status:
        d["status"] = status
    if verify:
        d["verify_how"] = verify
    if note:
        d["note"] = note
    return d


def U(verify, unit=None, note=None):
    """Unknown / not found: null + UNVERIFIED + verify_how (CLAUDE.md section 3.3)."""
    d = {"value": None}
    if unit:
        d["unit"] = unit
    d["as_of"] = AS_OF
    d["confidence"] = "low"
    d["status"] = "UNVERIFIED"
    d["verify_how"] = verify
    if note:
        d["note"] = note
    return d


def A(value, unit=None, note=None, verify=None):
    """Modelling assumption (NOT a sourced fact): low confidence, UNVERIFIED, flagged in note."""
    d = {"value": value}
    if unit:
        d["unit"] = unit
    d["as_of"] = AS_OF
    d["confidence"] = "low"
    d["status"] = "UNVERIFIED"
    d["note"] = "ASSUMPTION (model parameter, not a sourced fact). " + (note or "")
    d["verify_how"] = verify or "Sample live data for 24h (order book depth/spread) and replace with measured median."
    return d


V_FEE = ("Open the exchange's fee page / help centre and record the level-1 taker fee for the USDT/IRT (Toman-quoted) market; "
         "confirm with the fee line of a 25 USDT test trade statement.")
V_NETFEE = ("Nobitex: GET https://apiv2.nobitex.ir/v2/options -> coins[usdt].networkList[<NET>].withdrawFee/withdrawMin/withdrawMax/minConfirm. "
            "Other exchanges: the withdrawal screen for USDT on that network, the fee page, or support ticket.")
V_CAP = "Read the limits page for your KYC level, then ask support in writing; record daily/monthly caps in IRT."
V_API = "Open the official API docs of the exchange (link in api.docs_url) and test the public endpoint with curl from an Iranian IP; record the exact path, symbol format, unit (Toman vs Rial) and rate limit."
V_STATUS = "Open the exchange site/app, check it loads and quotes USDT/IRT, check Telegram/Instagram channel for notices in the last 30 days, and its listing on arzdigital/iranbroker."

# --------------------------------------------------------------------------------------------
# REGULATORY RULES + EVENTS + CURRENT STATE
# --------------------------------------------------------------------------------------------
HALT_SRC = ("zoomit_halt", "iranwire_halt", "itresan_halt", "fararu_halt", "snn_halt", "hamshahri_halt", "mihan_halt", "arzdigital_aban_halt")
IDCAP_SRC = ("zarinpal_idcap", "irasin_idcap", "digiato_idcap", "mihan_idcap", "iranbroker_idcap", "fararu_idcap")
LOCK_SRC = ("peivast_72h", "iranbroker_tetherland", "pingi_72h", "kifpool_terms", "nipoto_fata")
OFAC_SRC = ("scorechain_ofac", "globalledger_ofac", "crystal_ofac", "trm_ofac", "willkie_ofac", "elliptic_ofac")
OFAC_ABAN_SRC = ("s05_sanctions", "coindesk_aban", "ofac_faq1257")
GW_SRC = ("mihan_direct_rial_halt", "zoomit_gw_reopen", "fararu_shaparak", "intellinews_block", "nobsbitcoin_gw", "entekhab_gw")


def rule(id_, issuer, scope, eff_from, eff_to, rule_status, value, unit, conf, srcs, status, enforcement, durability, note, verify=None):
    d = {
        "id": id_,
        "issuer": issuer,
        "scope": scope,
        "effective_from": eff_from,
        "effective_to": eff_to,
        "rule_status": rule_status,
    }
    rec = R(value, unit, conf, srcs, status, verify, note) if value is not None else U(verify or "see note", unit, note)
    d.update(rec)
    d["enforcement"] = enforcement
    d["durability"] = durability
    return d


RULES = [
    rule("CBI-2022-12-CAP-50M-TO-25M", "Central Bank of Iran (CBI)", "per platform user / transaction cap at crypto exchanges (exact scope unclear)",
         "2022-12", None, "unknown",
         {"from_irt_per_day": 50000000, "to_irt_per_day": 25000000}, "IRT per day", "low", ("mihan_100m",), "conflicting",
         "Per ONE search summary: in Azar 1401 (Dec 2022) CBI cut the per-day cap of crypto platforms from 50M to 25M Toman. This conflicts with the ID-deposit-cap dating (17 Shahrivar 1403 = 2024-09-07) in rule SHAPARAK-2024-09-ID-DEPOSIT-CAP-25M; likely a different measure or a mis-dating by the summariser.",
         "unknown", "Do not use for modelling; kept so the conflict is visible. See 'Conflicts & adjudication' in the research doc.",
         "Find the original Azar-1401 CBI circular text (mihanblockchain/iranbroker archive for Azar 1401) and compare with the 1403 Shaparak instruction."),
    rule("CBI-DAILY-100M-DEPOSIT-WITHDRAW-CAP", "CBI (per exchange notices to users)", "per user per day, deposit and withdrawal at exchanges",
         None, None, "unknown",
         100000000, "IRT per day", "low", ("mihan_100m",), "reported",
         "Exchanges issued user notices citing 'new CBI guidelines' limiting daily deposit and withdrawal to 100M Toman (headline only; date and scope not in the summary).",
         "unknown", "Effective date unknown; may be superseded by the 25M ID-deposit cap for deposits.",
         "Open the article and read date + exact scope; check if it limits Rial withdrawal, crypto withdrawal, or both."),
    rule("FATA-72H-SETTLEMENT-LOCK", "Police Cyberspace (FATA, پلیس فتا) directive implemented by every exchange", "per user; Rial-funded balances at exchanges",
         None, None, "active",
         {"lock_hours": 72, "applies_to": "crypto (and per some sources Rial) withdrawal of value funded by a Rial deposit", "mode": "UNVERIFIED: per-deposit rolling lock vs first-deposit-only"}, "hours", "medium", LOCK_SRC, "reported",
         "Enforced by each exchange's own system (withdraw button disabled / request rejected). Several sources say users can withdraw the crypto equivalent of each deposit 72 h after that deposit; one summary says the lock follows the FIRST Rial deposit only.",
         "high - rule existed by 21 Shahrivar 1402 (2023-09-12, Nipoto help article) and is still cited in 1405 exchange pages",
         "Start date not found. Treat as per-deposit rolling lock in treasury planning (conservative). Exceptions (higher KYC, legal entities, crypto deposited from outside) UNVERIFIED.",
         "Ask each exchange support: (1) is the lock per deposit or per account, (2) does it apply to crypto deposited on-chain, (3) any shorter lock (24/48 h) for upgraded levels or legal entities."),
    rule("SHAPARAK-2024-09-ID-DEPOSIT-CAP-25M", "Shaparak / CBI instruction relayed to exchanges", "ID-based deposits (واریز شناسه‌دار) to crypto exchanges, per payer Sheba (IBAN) per 24 h (media also say per national ID)",
         "2024-09-07", None, "active",
         25000000, "IRT per 24h per Sheba/ID", "medium", IDCAP_SRC, "reported",
         "Amount above the cap is rejected: only 25M Toman is credited to the exchange account and the remainder is returned to the source account (per summaries). Reported as effective Saturday 17 Shahrivar 1403 (= 2024-09-07, a Saturday).",
         "high - still quoted as in force on exchange pages in 1405 (Tabdeal page: 'max daily deposit 25M Toman per CBI restriction'); nominal Toman cap erodes with depreciation",
         "Scope conflict: per Sheba (instruction text) vs per national ID (headline). Whether the cap is shared across exchanges is UNVERIFIED. Previous cap reported as 50M Toman.",
         "Ask two exchanges + your bank: is the 25M/24h counted per payer account, per national ID, per exchange, or globally? Test with a 26M ID deposit and read the returned amount."),
    rule("CBI-2024-10-SHAPARAK-FIAT-CRYPTO-RESTRICTION", "CBI", "fiat-to-crypto conversions through Shaparak", "2024-10", None, "unknown",
         "restricted", None, "low", ("crystal_timeline",), "reported",
         "Per one search summary (Crystal Intelligence): after Iran's early-Oct-2024 missile attack on Israel, CBI restricted Rial-to-crypto conversions on Shaparak; broader deposit/withdrawal ban late Oct 2024, reiterated late Dec 2024.",
         "unknown", "Single-source; dates approximate.", "Cross-check with Iranian press archive for Mehr-Aban 1403."),
    rule("CBI-2024-11-PAYMENT-SERVICES-SUSPENSION", "CBI", "payment-processing services for crypto exchanges", "2024-11", None, "unknown",
         "suspended", None, "low", ("crystal_timeline",), "reported",
         "Per one summary: CBI suspended payment-processing services in Nov 2024 citing USDT speculation and money-laundering risk.",
         "unknown", "Single-source.", "Cross-check with Iranian press archive for Aban-Azar 1403."),
    rule("CBI-2024-12-CRYPTO-FRAMEWORK", "CBI with Ministry of Economic Affairs and Finance; Cyberspace Council blessing", "policy and regulatory framework for crypto-assets (CBI = sole authority)", "2024-12", None, "active",
         "framework approved", None, "low", ("crystal_timeline", "specialeurasia"), "reported",
         "Framework approved Dec 2024 (per summaries); President's letter to CBI governor names CBI as the sole authority for crypto-asset rules (Feb 2025 per summary).",
         "medium", "Text of the framework not read.", "Obtain the framework text from CBI/Ministry or legal counsel (see legal-tax specialist)."),
    rule("CBI-2024-12-26-GATEWAY-BLOCK", "CBI via Shaparak", "Shaparak payment gateways (card/IPG) of crypto exchanges", "2024-12-26", None, "unknown",
         "blocked", None, "medium", GW_SRC, "reported",
         "Reported from 6 Dey 1403 (= 2024-12-26) CBI blocked exchanges' payment gateways; Rial deposits then possible mainly via ID-based deposit; Wallex said its Rial deposits are direct bank-network transfers unaffected by gateways.",
         "medium - partial reopening in Jan 2025 for exchanges meeting conditions; 'blocked again' headline later (undated)",
         "Current (Oct 2026) gateway status per exchange UNVERIFIED. The brief's 'Dey gateway closure' is read as this Dey-1403 event; a separate Dey-1404 closure was not found.",
         "Open each exchange's deposit page: is 'online payment (درگاه)' offered? Record date checked."),
    rule("CBI-2025-01-CONDITIONAL-REOPENING", "CBI / Shaparak", "gateway access conditional on data-sharing (ten data items) with Shaparak", "2025-01", None, "unknown",
         {"conditions": "exchanges must give Shaparak ten data items (user/trade data); some exchanges (incl. Nobitex statement) refused", "reopened": "only gateways of a few small/medium exchanges (Fintech association head, per Zoomit)"}, None, "low", ("mihan_gw_conditions", "zoomit_gw_reopen", "fararu_shaparak"), "reported",
         "Conditional reopening; large exchanges did not comply at the time of reports.", "unknown", "Later status unknown.", "Check current status per exchange."),
    rule("GOV-2025-02-CRYPTO-ADS-BAN", "Iranian authorities", "advertising of crypto businesses", "2025-02", None, "unknown",
         "ban", None, "low", ("crystal_timeline",), "reported",
         "Per one summary (Crystal Intelligence): ban on crypto advertising from Feb 2025.", "unknown", "Relevant to our marketing: no crypto promotion; sell digital services.", "Legal counsel to confirm scope."),
    rule("CBI-USER-FUNDS-NO-INVESTMENT", "CBI", "exchanges' use of users' Rial balances", None, None, "active",
         "prohibited", None, "low", ("mihan_funds_rule",), "reported",
         "Per headline summary: exchanges may not invest or operationally use users' deposited Rial balances.", "unknown", "Date unknown. Relevance: Rial balances parked at exchanges are customer-fund-like; do not park large Rial float there.", "Read the notice date and text."),
    rule("CBI-RIAL-WITHDRAW-LIMITS-LIFTED", "CBI", "Rial withdrawal limits at exchanges", None, None, "unknown",
         "lifted", None, "low", ("iranbroker_wd_lifted",), "reported",
         "Headline: Rial-withdrawal limits at domestic exchanges lifted (date unknown; implies an earlier limit existed, probably after Oct 2024).", "unknown", "Date unknown.", "Open article for date."),
    rule("CBI-2026-09-30-NIGHT-HALT", "CBI order relayed by exchanges' notices", "USDT trading at Iranian exchanges, all users", "2026-09-30T21:00+03:30", "2026-10-04T21:00+03:30", "temporary",
         {"halt_from": "21:00", "halt_to": "09:00", "tz": "Asia/Tehran", "first_halt_start": "Wed 8 Mehr 1405 21:00", "stated_end": "Sun 12 Mehr 1405 21:00", "purpose": "curb price manipulation / emotional waves; volatility management"}, "time window", "high", HALT_SRC, "reported",
         "Exchanges (Bitpin, AbanTether and others) announced no USDT buy/sell 21:00-09:00 nightly; AbanTether notice: restrictions last until 21:00 Sunday 12 Mehr.",
         "low - explicitly temporary; extension risk UNVERIFIED (no base rate: single observed episode)",
         "Whether Rial deposits/withdrawals or crypto withdrawals also pause at night is not stated; assume only trading halts. Exchanges that do not appear in the summaries may differ.",
         "Check each exchange's Telegram channel/site banner daily; re-run this brief on 13 Mehr to see if extended."),
    rule("CBI-2026-09-30-USDT-BUY-CAP-2000", "CBI order relayed by exchanges' notices", "USDT purchases, per user per day (during the halt regime)", "2026-09-30T21:00+03:30", "2026-10-04T21:00+03:30", "temporary",
         2000, "USDT per user per day (buy side)", "medium", HALT_SRC, "reported",
         "Headlines: 'purchase only up to 2,000 USDT'; Hamshahri calls it a quota (سهمیه‌ای) per user; AbanTether: daily buy limited to 2,000 USDT. Whether per exchange or across exchanges is UNVERIFIED (assumed per exchange).",
         "low - temporary", "At R=257,000 IRT/USDT the cap equals 514M IRT/day per user, far above the 25M IRT/24h ID-deposit cap, so it only binds if the user already holds Rial balance.",
         "Ask exchange support whether the cap counts USDT bought with pre-existing Rial balance and whether it is per exchange."),
    rule("US-2026-08-07-OFAC-SDN-ABANTETHER", "US Treasury OFAC", "Aban Tether + Shelbit Exchange + operator + four front companies (SDN, E.O. 13902)", "2026-08-07", None, "active",
         {"entities": ["Aban Tether", "Shelbit Exchange", "Siavash Kayvanpour (operator named by OFAC)", "4 affiliated front companies (Georgia, Poland, UAE)"], "owner_file": "data/sanctions_timeline.json event SE-2026-08-07-ABAN-SHELBIT"}, None, "medium", OFAC_ABAN_SRC, "reported",
         "Not found by 02's own searches; taken from the sanctions specialist's file (verified/high there; 8 outlets + OFAC FAQ 1257 per its summaries). 05 recommends removing all five designated venues (Nobitex, Wallex, Bitpin, Ramzinex, Aban Tether) from any allowed-USDT-source list.",
         "high - SDN listings are durable", "Cross-reference only; 05 owns adjudication. Not legal advice.",
         "Check the OFAC SDN list for 'Aban Tether'; read 05's event and its adjudication.")
    rule("US-2026-06-02-OFAC-SDN-IR-EXCHANGES", "US Treasury OFAC", "Nobitex, Wallex, Bitpin, Ramzinex + four executives (SDN, full blocking)", "2026-06-02", None, "active",
         {"entities": ["Nobitex", "Wallex", "Bitpin", "Ramzinex"], "share_of_iran_digital_asset_inflows_2025_pct": {"nobitex": ">50", "wallex": "~12", "bitpin": "~10", "four_total": ">=72"}, "attributed_volume_2025_usd_bn": 7.7}, None, "high", OFAC_SRC, "reported",
         "Secondary-sanctions exposure for non-US persons dealing with them; providers/chains may screen deposits originating from these exchanges. Some Iranian outlets reportedly denied/downplayed it (first-pass note) - the compliance specialist adjudicates.",
         "high - SDN listings are durable", "Not legal advice. Compliance specialist (05) owns the exposure analysis.",
         "Check OFAC SDN list (sanctionssearch.ofac.treas.gov) for the four names; ask the card provider whether it screens deposits from these exchanges."),
]

EVENTS = [
    {"id": "EVT-2025-06-18-NOBITEX-HACK", **R({"loss_usd_m_range": [81, 100], "loss_usd_m_most_reported": 90, "method": "funds sent to burn addresses (not stolen)", "actor": "Predatory Sparrow (Gonjeshke Darande)", "source_code_leak": "2025-06-19"}, "USD million", "high", ("crowdfund_hack", "scorechain_hack", "intellinews_hack", "fortune_hack", "bitdefender_hack"), "reported", None, "Exchange kept operating afterwards (still operating in Feb 2026 per Cointelegraph/Crypto.jobs summaries). Recovery/relaunch details and proof-of-reserves NOT found.")},
    {"id": "EVT-2026-02-NEAR-TOTAL-INTERNET-SHUTDOWN", **R({"period": "late Feb 2026 (~2026-02-28) after joint US-Israel strike", "nobitex": "kept operating"}, None, "medium", ("cointelegraph_nobitex", "cryptojobs_shutdown"), "reported", None, "Operational lesson: exchange/API reachability from Iranian IPs can vanish for days; whitelisted access paths exist.")},
    {"id": "EVT-2026-05-01-REUTERS-NOBITEX", **R("Reuters investigation (1 May 2026) described Nobitex as a central node of a parallel financial system moving hundreds of millions of USD for CBI and IRGC", None, "medium", ("cointelegraph_nobitex",), "reported", None, "Precursor of OFAC action.")},
    {"id": "EVT-2026-TETHER-FREEZES", **R({"total_2026_usd_m_approx": 550, "april_2026_usd_m": ">344 across two addresses", "july_2026_usd_m": ">130 across four wallets", "reported_by": "Tether (per crypto media, 28-29 Sep 2026)"}, "USD million", "medium", ("cryptonomist_tether", "securities_tether", "cryptorank_tether", "coinrepublic_tether"), "reported", None, "Direct operational risk: USDT on Tron held at Iran-linked addresses can be frozen by the issuer.")},
    {"id": "EVT-2026-06-02-OFAC", **R("OFAC designates Nobitex, Wallex, Bitpin, Ramzinex", None, "high", OFAC_SRC, "reported", None, "See rule US-2026-06-02-OFAC-SDN-IR-EXCHANGES.")},
    {"id": "EVT-2026-08-07-OFAC-ABANTETHER", **R("OFAC designates Aban Tether and Shelbit Exchange", None, "medium", OFAC_ABAN_SRC, "reported", None, "Cross-referenced from file 05 (02's own searches missed it). Five best-known domestic USDT venues are now SDNs per 05.")},
    {"id": "EVT-2026-04-07-CBI-USDT-FREEZES", **R({"april_2026": ">344 USD M, 2 CBI wallets (OFAC listing followed next day per 05)", "july_16_2026": ">130 USD M, 4 CBI wallets", "cbi_total_usd_m_approx": 475}, "USD million", "medium", ("s05_sanctions", "cryptonomist_tether", "securities_tether"), "reported", None, "Detail from file 05; consistent with the ~USD 550M Iran-linked total reported by Tether (Sep 2026).")},
]

CURRENT_STATE = {
    "as_of": AS_OF,
    "note": "Current-state matrix for 2026-10-02 (10 Mehr 1405, Friday). Re-verify every row before go-live; rows marked UNVERIFIED have no 2026 evidence.",
    "night_halt": R({"active_now": True, "window": "21:00-09:00 IRST", "until": "2026-10-04T21:00+03:30", "extension": "UNVERIFIED"}, None, "high", HALT_SRC, "reported", "Check exchange notices daily."),
    "usdt_buy_cap": R({"active_now": True, "usdt_per_user_per_day": 2000, "until": "2026-10-04T21:00+03:30"}, None, "medium", HALT_SRC, "reported", "Check whether per exchange."),
    "id_deposit_cap": R({"active": True, "irt_per_24h": 25000000, "scope": "per payer Sheba / national ID (conflict), per exchange or global UNVERIFIED"}, None, "medium", IDCAP_SRC, "reported", "See rule SHAPARAK-2024-09-ID-DEPOSIT-CAP-25M."),
    "withdraw_lock": R({"active": True, "hours": 72, "mode": "per-deposit rolling (conservative; UNVERIFIED)"}, None, "medium", LOCK_SRC, "reported", "See rule FATA-72H-SETTLEMENT-LOCK."),
    "rial_gateways": U("Open each exchange's deposit page and record whether card/IPG online payment is offered; compare with the Dey-1403 closure (2024-12-26).", None, "Last dated evidence: closed 2024-12-26, partial conditional reopening Jan 2025, 'blocked again' (undated). ID-based deposit is the dependable path."),
    "ofac_exposure": R({"designated_domestic_venues": ["Nobitex", "Wallex", "Bitpin", "Ramzinex (2026-06-02)", "Aban Tether (2026-08-07, per file 05)"], "not_designated_per_last_evidence_absence_is_not_proof": ["Tabdeal", "Bit24", "Exir", "OMPFinex", "Tetherland", "NovinTether", "Excoino", "Arzinja"], "rule_of_thumb": "OFAC FAQ 1257 (via file 05): any digital-asset exchange operating in Iran's financial sector is designable; 05 recommends excluding all SDN venues from allowed USDT sources"}, None, "high", OFAC_SRC + OFAC_ABAN_SRC, "reported", "Check the SDN list monthly; read data/sanctions_timeline.json watchlist_exchanges."),
    "tether_freeze_risk": R({"iran_linked_usdt_frozen_2026_usd_m": 550}, None, "medium", ("cryptonomist_tether", "securities_tether"), "reported", "Compliance specialist."),
    "internet_reachability": R({"risk": "high", "evidence": "near-total shutdown late Feb 2026; Nobitex kept operating"}, None, "medium", ("cryptojobs_shutdown", "cointelegraph_nobitex"), "reported", "Design for offline/whitelisted-path fallback and multi-venue price feeds."),
}

REG_META = {
    "file": "data/regulatory_limits.json",
    "owner_agent": "02-ir-exchanges-usdt-rails",
    "as_of": AS_OF,
    "schema_note": "Rules are Records. Lifecycle is in rule_status (active|temporary|expired|unknown) because the validator reserves `status` for evidence status (verified|reported|UNVERIFIED|conflicting). The brief's 'status: active|expired|temporary' maps to rule_status.",
    "units": "IRT = Toman (1 Toman = 10 Rial). Times are Asia/Tehran (UTC+03:30; no DST since 2022).",
    "disclaimer": "Analysis, not legal advice. Confirm with a licensed Iranian lawyer/tax adviser.",
    "search_coverage_note": "Built from ~30 web searches (Persian+English) before the session-wide search budget was exhausted; most facts are 'per search summary' (page not seen). See research doc section 'Method and coverage'.",
}


def build_regulatory():
    return {"_meta": REG_META, "rules": RULES, "events": EVENTS, "current_state": CURRENT_STATE}


# --------------------------------------------------------------------------------------------
# EXCHANGES
# --------------------------------------------------------------------------------------------
NETS = ["TRC20", "BEP20", "TON", "ERC20", "POLYGON", "SOLANA", "ARBITRUM"]


def blank_exchange(id_, name, name_fa, tier, risk, restriction):
    ex = {
        "id": id_, "name": name, "name_fa": name_fa, "tier": tier,
        "risk_label": risk, "restriction_note": restriction,
        "status": U(V_STATUS),
        "ofac_designated": U("Check the OFAC SDN list for the exchange name and its operating company.", note="Not among the five designated domestic venues (Nobitex, Wallex, Bitpin, Ramzinex 2026-06-02; Aban Tether 2026-08-07) per OFAC-action summaries and file 05; absence from the list is not proof of safety (OFAC FAQ 1257 via file 05)." if id_ not in ("nobitex", "wallex", "bitpin", "ramzinex", "abantether") else None),
        "ownership": U("Company registry (Rooznameh Rasmi / ilenc.ir), exchange 'About' page and its Enamad/CBI-recognised licence page if any."),
        "security_incidents": U("Search the exchange name + hack/breach on arzdigital/iranbroker and Telegram channel archives."),
        "proof_of_reserves": U("Check the exchange site/help centre for a proof-of-reserves page; none found in this research for any Iranian exchange."),
        "market_share": U("TRM/Chainalysis/Elliptic Iran reports; exchange-reported 24h volume on CoinMarketCap/CoinGecko."),
        "fees": {
            "usdt_irt_taker_pct": U(V_FEE, "pct"),
            "usdt_irt_maker_pct": U(V_FEE, "pct"),
            "fee_schedule": U("Copy the full tier table (30-day volume thresholds, maker/taker) from the exchange fee page.", None),
            "typical_spread_vs_mid_pct": U("Sample best bid/ask of USDT/IRT every 10 s for 24 h; compute (ask-bid)/2/mid and the cost of a 2,000 USDT market buy.", "pct"),
            "min_order": U("Exchange fee/limits page or API options endpoint.", None),
        },
        "levels": [],
        "deposit": {
            "methods": U("Exchange deposit page: list ID-based (Paya/Satna/bank transfer with payment ID), card-to-card, gateway, crypto."),
            "gateway_cap_irt_per_day": U(V_CAP, "IRT per day"),
            "id_based_cap_irt_per_24h": R(25000000, "IRT per 24h per Sheba/ID", "medium", IDCAP_SRC, "reported", "Test with a 26M IRT deposit; see rule SHAPARAK-2024-09-ID-DEPOSIT-CAP-25M.", "Regulatory cap quoted generically for 'exchanges'; exchange-specific confirmation missing."),
            "min_deposit_irt": U(V_CAP, "IRT"),
        },
        "withdraw": {
            "irt": {"daily_cap_irt": U(V_CAP, "IRT per day"), "fee_irt": U(V_CAP, "IRT"), "min_irt": U(V_CAP, "IRT"), "cycles": U("Exchange help centre: Paya/Satna settlement cycles and holiday behaviour.", None), "count_cap_per_24h": U(V_CAP, "count")},
            "crypto_lock_hours_after_irt_deposit": R(72, "hours", "medium", LOCK_SRC, "reported", "Ask support whether per deposit or first-deposit-only; exceptions.", "FATA-directed lock cited across Iranian exchanges; exchange-specific confirmation missing unless noted."),
            "lock_exceptions": U("Ask support: shorter lock for higher KYC level / legal entity / crypto deposited on-chain? Record answer with date."),
            "network_fees": {n: U(V_NETFEE, "USDT") for n in NETS},
            "min": {n: U(V_NETFEE, "USDT") for n in NETS},
            "daily_cap_crypto_irt": U(V_CAP, "IRT per day"),
            "address_whitelisting": U("Check security settings for address book / withdrawal whitelist and what happens when disabling it."),
        },
        "trading_hours": R("24/7 in normal conditions (assumed); halted 21:00-09:00 IRST 2026-09-30..2026-10-04 per CBI order", None, "low", HALT_SRC, "reported", "Exchange status page / Telegram.", "Normal-hours statement is an assumption; the halt is sourced."),
        "api": {
            "public_orderbook_url": U(V_API),
            "auth": U(V_API),
            "rate_limit": U(V_API),
            "websocket": U(V_API),
            "price_unit": U("Fetch the public order book for USDT/IRT and compare with the website price: if ~10x larger the API is in Rial.", None),
            "symbol": U(V_API),
            "docs_url": U(V_API),
        },
        "otc_desk": U("Ask sales/support for OTC/large-order terms: minimum size, spread, KYC, settlement time."),
        "business_accounts": U("Ask support whether legal-entity (شخص حقوقی) accounts exist and what caps/locks apply."),
    }
    return ex


def conv_model(taker, spread, wd, basis, benchmark_wd=True):
    return {
        "value": {
            "taker_pct": {"low": taker[0], "base": taker[1], "high": taker[2]},
            "spread_pct": {"low": spread[0], "base": spread[1], "high": spread[2]},
            "withdraw_fee_usdt": wd,
            "uses_benchmark_withdraw_fee_when_null": benchmark_wd,
            "basis": basis,
        },
        "unit": "pct / USDT",
        "as_of": AS_OF,
        "confidence": "low",
        "status": "UNVERIFIED",
        "note": "ASSUMPTION BUNDLE for 02_conversion_cost.py and the ExchangeSim defaults. taker low/base/high derive from the documented/conflicting fee values; spread low/base/high are modelling assumptions (no depth data was reachable).",
        "verify_how": "Replace spread with measured median half-spread and a 2,000 USDT depth-impact sample; replace withdraw fees with live exchange values.",
    }


def build_exchanges():
    E = {}

    # ---------------- Nobitex ----------------
    e = blank_exchange("nobitex", "Nobitex", "نوبیتکس", "A", "high",
                       "OFAC SDN-designated 2026-06-02; June-2025 hack; counterparties/providers may screen or refuse flows from this exchange; highest liquidity.")
    e["status"] = R("operating", None, "high", ("cointelegraph_nobitex", "cryptojobs_shutdown", "scorechain_ofac"), "reported", V_STATUS, "Kept operating through Feb-2026 shutdown; OFAC-designated 2026-06-02; official API docs repo active.")
    e["ofac_designated"] = R(True, None, "high", OFAC_SRC, "reported", "Check SDN list.", "Designated 2026-06-02 with 3 other Iranian exchanges and 4 executives.")
    e["ownership"] = R("Private Iranian company (Tehran). OFAC/Reuters allege links to CBI/IRGC transactions; shareholder structure UNVERIFIED.", None, "low", ("cointelegraph_nobitex", "scorechain_ofac"), "reported", "Company registry + legal counsel; do not rely on media allegations for decisions.")
    e["security_incidents"] = R("2025-06-18 hack: ~USD 81-100M (most outlets ~90M) sent to burn addresses by Predatory Sparrow; source code leaked 2025-06-19", None, "high", ("crowdfund_hack", "scorechain_hack", "intellinews_hack", "fortune_hack", "bitdefender_hack"), "reported", "Nobitex Telegram/blog incident post-mortem.")
    e["proof_of_reserves"] = U("Look for a proof-of-reserves/solvency page; none found.", None, "No PoR found in this research.")
    e["market_share"] = R({"share_of_iran_digital_asset_inflows_2025": ">50%", "users_million": 11, "volume_2025_usd_bn_observed_approx": 5}, None, "medium", ("scorechain_ofac", "cointelegraph_nobitex", "trm_ofac"), "reported", "TRM/Chainalysis reports.", "OFAC-reported share; the ~USD 5bn 2025-Mar-2026 volume is TRM per Cointelegraph summary.")
    e["fees"]["usdt_irt_taker_pct"] = R(0.25, "pct", "medium", ("nobitex_pricing", "zoomit_compare", "sanjesh_nobitex"), "conflicting", V_FEE, "Base tier (<100M IRT 30-day volume) Toman market. Conflicts: 0.20 % (ZoomArz), 0.35 % (NovinTether list, probably outdated). Adjudicated 0.25 %: 2 of 3 independent summaries.")
    e["fees"]["usdt_irt_maker_pct"] = R(0.25, "pct", "low", ("nobitex_pricing", "zoomit_compare"), "conflicting", V_FEE, "One summary: maker 0.25 % = taker; another: maker 0.13 % at base. Use taker for cost model (market buy).")
    e["fees"]["fee_schedule"] = R({
        "market": "USDT-quoted pairs (e.g. BTC/USDT), NOT USDT/IRT",
        "tiers": [
            {"tier": "base", "vol30d_irt": "<100M", "maker_pct": 0.10, "taker_pct": 0.13},
            {"tier": "VIP1", "vol30d_irt": "100-300M", "maker_pct": 0.095, "taker_pct": 0.12},
            {"tier": "VIP2", "vol30d_irt": "300M-1B", "maker_pct": 0.09, "taker_pct": 0.11},
            {"tier": "VIP3", "vol30d_irt": "1-5B", "maker_pct": 0.08, "taker_pct": 0.10},
            {"tier": "VIP4", "vol30d_irt": "5-20B", "maker_pct": 0.07, "taker_pct": 0.10},
        ],
        "toman_market_base": {"maker_pct": 0.25, "taker_pct": 0.25, "range_over_tiers_pct": "0.25 down to 0.06"},
    }, None, "medium", ("nobitex_pricing", "sanjesh_nobitex"), "reported", "Open https://nobitex.ir/pricing/ and copy the Toman-market table; also GET /v2/options (fee steps are in the response per official docs).", "The USDT-quoted tier table was returned for the 'tether market'; do not apply it to USDT/IRT.")
    e["fees"]["typical_spread_vs_mid_pct"] = A(0.10, "pct", "Snapshot 10 Mehr 1405: Nobitex sell 256,500 / buy 256,499 (per search summary) suggests near-zero top-of-book spread; 0.10 % base includes depth impact at 100-500 USDT.")
    e["fees"]["min_order"] = R({"rial_markets_rial": 3000000, "rial_markets_irt_equiv": 300000, "usdt_markets_usdt": 11}, "Rial / USDT", "high", ("nobitex_docs_trade", "nobitex_docs_other"), "verified", "GET /v2/options -> nobitex.minOrders", "Official docs: minimum order value 3 million Rial for Rial markets and 11 USDT for USDT markets.")
    e["levels"] = [
        {"id": "level2", "name": "Level 2", "kyc": U("https://nobitex.net/policies/user-levels (documents required per level)."),
         "daily_crypto_withdraw_irt": R(200000000, "IRT per day", "low", ("nobitex_docs_user", "first_pass"), "reported", "GET /users/limitations (authenticated) returns your level and used/limit amounts.", "Docs sample shows Level-2 limits of 2,000,000,000 Rial/day crypto and 900,000,000 Rial/day Rial withdrawal, 30,000,000,000 Rial monthly total; first-pass doc says Level 2 up to 200M IRT. Docs sample may be stale."),
         "daily_rial_withdraw_irt": R(90000000, "IRT per day", "low", ("nobitex_docs_user",), "reported", "GET /users/limitations", "Docs sample value (900,000,000 Rial)."),
         "monthly_total_withdraw_irt": R(3000000000, "IRT per month", "low", ("nobitex_docs_user",), "reported", "GET /users/limitations", "Docs sample value (30,000,000,000 Rial).")},
        {"id": "level3", "name": "Level 3", "kyc": U("https://nobitex.net/policies/user-levels"),
         "daily_crypto_withdraw_irt": R(1000000000, "IRT per day", "low", ("first_pass",), "reported", "GET /users/limitations", "Per first-pass doc only (secondary).")},
    ]
    e["deposit"]["methods"] = R(["ID-based deposit (واریز شناسه‌دار / 'shetabi' payment IDs: API users/payments/ids-list)", "bank deposit (users/wallets/deposit/bank)", "Shetab/online gateway (users/wallets/deposit/shetab) - blocked/limited since 2024-12-26, current status UNVERIFIED", "crypto deposit on-chain"], None, "medium", ("nobitex_docs_intro", "mihan_direct_rial_halt"), "reported", "Open the Rial deposit screen; list the methods offered today.", "Method names from the official API permission list; availability today UNVERIFIED.")
    e["deposit"]["min_deposit_irt"] = U(V_CAP, "IRT")
    e["withdraw"]["irt"] = {
        "daily_cap_irt": R(90000000, "IRT per day", "low", ("nobitex_docs_user",), "reported", "GET /users/limitations", "Level-2 docs sample; varies by level."),
        "fee_irt": R(4000, "IRT", "low", ("nobitex_docs_other",), "reported", "GET /v2/options -> coins[rls].networkList.FIAT_MONEY.withdrawFee", "Docs sample 'withdrawFee 40,000 Rial' = 4,000 IRT; sample may be stale."),
        "min_irt": R(15000, "IRT", "low", ("nobitex_docs_other",), "reported", "GET /v2/options", "Docs sample 'withdrawMin 150,000 Rial'."),
        "cycles": R("normal / Paya / Satna transfer types; large requests may be split into records; cancellable only while status New and within 3 minutes", None, "high", ("nobitex_docs_rial",), "verified", "Read /cobank/withdraw docs", "Settlement-day behaviour (Thu-afternoon/Fri/holidays) per lead's sim spec assumption, not Nobitex docs."),
        "count_cap_per_24h": R({"rial_withdrawals": 3, "crypto_withdrawals": 10}, "count", "high", ("nobitex_docs_rial",), "verified", "Error WithdrawLimitReached text in official docs", "'WithdrawLimitReached: only 3 Rial and 10 crypto withdrawals per 24 h'."),
        "per_sheba_cap_irt": R(200000000, "IRT per transfer to one Sheba", "high", ("nobitex_docs_rial",), "verified", "Error ShabaWithdrawCannotProceed", "'Cap per destination Sheba is 2,000,000,000 Rial'; the docs suggest splitting across Shebas - we do NOT recommend splitting to evade caps; use it only for legitimately separate beneficiaries."),
    }
    e["withdraw"]["network_fees"]["TRC20"] = R(1.0, "USDT", "low", ("first_pass",), "reported", V_NETFEE, "First-pass secondary figure (~1 USDT). Live value is in /v2/options.")
    e["withdraw"]["network_fees"]["BEP20"] = R(0.8, "USDT", "low", ("first_pass",), "reported", V_NETFEE, "First-pass secondary figure (~0.8 USDT).")
    e["withdraw"]["daily_cap_crypto_irt"] = R(200000000, "IRT per day", "low", ("nobitex_docs_user", "first_pass"), "reported", "GET /users/limitations", "Level 2; Level 3 ~1B IRT per first-pass.")
    e["withdraw"]["address_whitelisting"] = R("Address book + 'safe withdrawal mode' (whitelist): when on, crypto withdrawals only to saved addresses; whitelisted destinations need no OTP; deactivating safe mode blocks withdrawals for 24 h; new-device login blocks withdrawals for 1 h; emergency-cancel link disables new withdrawal requests for 72 h", None, "high", ("nobitex_docs_addr", "nobitex_docs_intro", "nobitex_docs_sec"), "verified", "Read address_book and security sections of the official docs.")
    e["withdraw"]["api_withdraw_flow"] = R("POST /users/wallets/withdraw (10 req/3 min) then POST /users/wallets/withdraw-confirm (30 req/h) unless address is whitelisted; API key needs WITHDRAW permission (+IP whitelist recommended); network param selects TRC20-style network codes (e.g. TRX, BSC, TON, ETH, SOL, MATIC, ARB per symbols list)", None, "high", ("nobitex_docs_wd", "nobitex_docs_intro", "nobitex_docs_symbols"), "verified", "Read withdraw_coin docs. Which networks carry USDT: GET /v2/options -> coins[usdt].networkList.")
    e["trading_hours"] = R("24/7 in normal conditions (assumed; no hours statement in API docs); halted 21:00-09:00 IRST 2026-09-30..2026-10-04 per CBI order", None, "low", HALT_SRC, "reported", "Exchange status page / Telegram.")
    e["api"] = {
        "public_orderbook_url": R("https://apiv2.nobitex.ir/v3/orderbook/USDTIRT  (also GET /v3/orderbook/all; GET /v2/depth/USDTIRT; GET /v2/trades/USDTIRT; GET /market/stats?srcCurrency=usdt&dstCurrency=rls; GET /market/udf/history). Host api.nobitex.ir also appears in community SDKs.", None, "high", ("nobitex_docs_market", "go_nobitex"), "verified", "curl the URL from an Iranian IP.", "Response asks/bids arrays of [price, qty] strings, lastTradePrice, lastUpdate (ms)."),
        "auth": R("Public market endpoints need no auth. Private: header 'Authorization: Token <hex>' (X-TOTP for some calls) OR API key (permissions READ/TRADE/WITHDRAW, IP whitelist, expiry) with headers Nobitex-Key, Nobitex-Timestamp (UTC s) and Nobitex-Signature = base64(Ed25519(timestamp+method+url+body)); recommended User-Agent 'TraderBot/<name>'", None, "high", ("nobitex_docs_intro", "nobitex_docs_general"), "verified", "Read intro section."),
        "rate_limit": R({"orderbook_v3_per_min": 300, "depth_v2_per_min": 300, "trades_per_min": 60, "market_stats_per_min": 20, "order_placement_shared_per_10min": 300, "withdraw_request_per_3min": 10, "withdraw_confirm_per_hour": 30, "ws_connections_per_ip": 100, "ws_channels_per_connection": 450, "cache_note": "calls <1 s apart return cached data; poll every 1-10 s", "penalties": "429 TooManyRequests with backOff; ignoring it blocks the token 2 min; >100 bad-token requests in 30 min blocks the IP"}, None, "high", ("nobitex_docs_market", "nobitex_docs_general", "nobitex_docs_wd", "nobitex_docs_ws"), "verified", "Re-read the 'rate limit' lines of each endpoint in the docs."),
        "websocket": R("wss://ws.nobitex.ir/connection/websocket (Centrifugo; channel e.g. public:orderbook-USDTIRT; ping/pong within 25 s)", None, "high", ("nobitex_docs_ws",), "verified", "Connect with centrifuge-js/python."),
        "price_unit": R("RIAL for Rial markets (docs: 'price unit in Rial markets is Rial, not Toman'); divide by 10 for Toman. USDT markets are priced in USDT.", None, "high", ("nobitex_docs_trade",), "verified", "Compare USDTIRT with website Toman price."),
        "symbol": R("USDTIRT (orderbook/trades); srcCurrency=usdt dstCurrency=rls (stats/orders)", None, "high", ("nobitex_docs_market", "nobitex_docs_trade"), "verified", "-"),
        "docs_url": R("https://apidocs.nobitex.ir/ (source: github.com/nobitex/docs-api; Postman: documenter.getpostman.com/view/5722122/Szmcayjw)", None, "high", ("nobitex_docs",), "verified", "-"),
        "options_endpoint": R("GET https://apiv2.nobitex.ir/v2/options (no token): live withdrawFee/withdrawMin/withdrawMax/minConfirm/deposit enable per coin per network, withdrawLimits per level, minOrders, fee steps", None, "high", ("nobitex_docs_other",), "verified", "curl it from an Iranian IP; use as the live source for network_fees and min."),
        "market_order_note": R("Always send `price` on market orders: without it the order fills at the global market price within a 1 % band", None, "high", ("nobitex_docs_trade",), "verified", "-"),
    }
    e["otc_desk"] = U("Ask Nobitex sales/support for institutional/OTC terms.")
    e["business_accounts"] = U("Ask Nobitex support whether legal-entity accounts exist and their Level-3+/institutional limits.")
    e["conversion_model"] = conv_model((0.20, 0.25, 0.35), (0.03, 0.10, 0.30), {"TRC20": 1.0, "BEP20": 0.8}, "taker 0.25 documented (alt 0.20/0.35); spread assumption; withdrawal fees from first-pass secondary figures")
    E["nobitex"] = e

    # ---------------- Wallex ----------------
    e = blank_exchange("wallex", "Wallex", "والکس", "A", "high", "OFAC SDN-designated 2026-06-02; second-largest by volume; Rial deposits said to be direct bank-network (not gateway-dependent).")
    e["status"] = R("operating", None, "high", OFAC_SRC, "reported", V_STATUS, "Designated 2026-06-02 (so operating then); site-level 2026 availability not directly checked.")
    e["ofac_designated"] = R(True, None, "high", OFAC_SRC, "reported", "Check SDN list.")
    e["market_share"] = R({"share_of_iran_digital_asset_inflows_2025": "~12%"}, None, "medium", ("scorechain_ofac", "trm_ofac"), "reported", "TRM/Chainalysis.")
    e["fees"]["usdt_irt_taker_pct"] = R(0.35, "pct", "low", ("tradingfinder_wallex", "wallex_fee_help", "zoomit_compare"), "conflicting", V_FEE, "Toman-base market level 1 = 0.35 % (8 levels down to 0.10 % maker). Zoomit summary: level 1 (0-20,000 USD volume) 0.20 % for taker and maker - probably the USDT-base market. Conservative 0.35 % used.")
    e["fees"]["usdt_irt_maker_pct"] = R(0.35, "pct", "low", ("tradingfinder_wallex", "wallex_fee_help"), "conflicting", V_FEE, "Level 1 reported without maker discount; down to 0.10 % at level 8.")
    e["fees"]["fee_schedule"] = R({"toman_base_market": "8 levels by 30-day Toman volume: 0.35 % (L1) ... 0.10 % maker (L8)", "usdt_base_market": "3 levels 0.13-0.20 %"}, None, "low", ("tradingfinder_wallex", "wallex_fee_help"), "reported", "Open wallex.ir/help/docs/help-center/commission/trade/ and copy the table.")
    e["fees"]["typical_spread_vs_mid_pct"] = A(0.10, "pct", "Snapshot 10 Mehr 1405: Wallex quote 255,709 vs median 257,820 (-0.8 %), i.e. Wallex tends to quote below the cross-exchange median at that moment.")
    e["deposit"]["methods"] = R(["ID-based deposit", "direct bank-network Rial deposit (per Wallex blog: not dependent on payment gateways)", "crypto deposit"], None, "low", ("wallex_blog_gw",), "reported", "Open the Rial deposit screen.")
    e["withdraw"]["irt"]["note_registered_accounts"] = R("Rial/crypto withdrawals use registered IBANs/cards (SDK endpoints account/ibans, account/card-numbers) and account/crypto-withdrawal", None, "low", ("wallex_pypi",), "reported", "Read Wallex API docs.")
    e["api"] = {
        "public_orderbook_url": R("https://api.wallex.ir/v1/depth?symbol=USDTTMN  (also GET /v1/markets, /v1/trades?symbol=, /v1/udf/history)", None, "medium", ("wallex_pypi", "go_wallex"), "reported", V_API, "Paths from the unofficial wallex 0.5.2 SDK source; official docs https://api-docs.wallex.ir/ not fetched."),
        "auth": R("Header 'x-api-key: <key>' (go-wallex README: X-API-Key); older SDK used 'Authorization: Bearer <token>'", None, "medium", ("go_wallex", "wallex_pypi"), "reported", V_API),
        "rate_limit": U(V_API),
        "websocket": R("socket.io at https://api.wallex.ir/socket.io", None, "low", ("wallex_pypi",), "reported", V_API),
        "price_unit": R("Toman (symbol suffix TMN)", None, "medium", ("go_wallex",), "reported", "Compare USDTTMN depth with website price."),
        "symbol": R("USDTTMN", None, "medium", ("wallex_pypi", "go_wallex"), "reported", V_API),
        "docs_url": R("https://api-docs.wallex.ir/", None, "medium", ("go_wallex",), "reported", "Open the URL."),
    }
    e["conversion_model"] = conv_model((0.20, 0.35, 0.35), (0.03, 0.10, 0.30), {}, "taker conflict 0.20 vs 0.35 (0.35 conservative); spread assumption; withdrawal fees unknown -> benchmark")
    E["wallex"] = e

    # ---------------- Bitpin ----------------
    e = blank_exchange("bitpin", "Bitpin", "بیت‌پین", "A", "high", "OFAC SDN-designated 2026-06-02; ~10 % of Iranian inflows; applied the Mehr-1405 night halt.")
    e["status"] = R("operating", None, "high", OFAC_SRC + ("ramzarz_news709",), "reported", V_STATUS, "Applied the 8-12 Mehr 1405 halt per summaries.")
    e["ofac_designated"] = R(True, None, "high", OFAC_SRC, "reported", "Check SDN list.")
    e["market_share"] = R({"share_of_iran_digital_asset_inflows_2025": "~10%"}, None, "medium", ("scorechain_ofac", "trm_ofac"), "reported", "TRM/Chainalysis.")
    e["fees"]["usdt_irt_taker_pct"] = R(0.25, "pct", "low", ("zoomit_compare", "novintether_fees"), "conflicting", V_FEE, "Base level (<30M IRT monthly volume) maker 0.20 / taker 0.25 per one summary; NovinTether list shows 0.32 %. 0.25 % used.")
    e["fees"]["usdt_irt_maker_pct"] = R(0.20, "pct", "low", ("zoomit_compare",), "reported", V_FEE)
    e["fees"]["typical_spread_vs_mid_pct"] = A(0.10, "pct", "No depth data.")
    e["api"] = {
        "public_orderbook_url": R("https://api.bitpin.ir/api/v1/mth/orderbook/USDT_IRT/  (also GET /api/v1/mkt/markets/ and /api/v1/mkt/currencies/; alternative hosts seen in SDKs: api.bitpin.org, api.bitpin.market)", None, "medium", ("bitpin_sdk", "bitpin_pypi"), "reported", V_API, "From a recent (Aug 2026) unofficial SDK README; older SDKs used v2 'mkt/orderbook/{market_id}'. Official docs https://docs.bitpin.ir/ not fetched."),
        "auth": R("POST /api/v1/usr/authenticate/ with api_key + secret_key -> access token (older: /v1/usr/api/login/ + refresh_token)", None, "medium", ("bitpin_sdk", "bitpin_pypi"), "reported", V_API),
        "rate_limit": R("HTTP 429 returned; SDKs implement 429-aware retries (exact limit not documented in sources seen)", None, "low", ("bitpin_sdk",), "reported", V_API),
        "websocket": R("wss://centrifugo.bitpin.ir/connection/websocket (Centrifugo; channel prefix 'orderbook:')", None, "medium", ("bitpin_sdk",), "reported", V_API),
        "price_unit": R("TOMAN despite the 'IRT' suffix (SDK warns: USDT_IRT quotes and balances are in Toman)", None, "medium", ("bitpin_sdk",), "reported", "Compare USDT_IRT depth with website price."),
        "symbol": R("USDT_IRT", None, "medium", ("bitpin_sdk",), "reported", V_API),
        "docs_url": R("https://docs.bitpin.ir/", None, "medium", ("bitpin_pypi", "bitpin_sdk"), "reported", "Open the URL."),
    }
    e["conversion_model"] = conv_model((0.20, 0.25, 0.32), (0.03, 0.10, 0.30), {}, "taker 0.25 (alt 0.32); spread assumption; withdrawal fees unknown -> benchmark")
    E["bitpin"] = e

    # ---------------- Ramzinex ----------------
    e = blank_exchange("ramzinex", "Ramzinex", "رمزینکس", "A", "high", "OFAC SDN-designated 2026-06-02.")
    e["status"] = R("operating", None, "high", OFAC_SRC, "reported", V_STATUS)
    e["ofac_designated"] = R(True, None, "high", OFAC_SRC, "reported", "Check SDN list.")
    e["fees"]["usdt_irt_taker_pct"] = R(0.25, "pct", "low", ("zoomit_compare", "zoomit_ramzinex", "ramzinex_blog"), "conflicting", V_FEE, "Level 1 (<100M IRT/month) Toman market: taker 0.25 / maker 0.20 per two summaries (a third lists them reversed); USDT-quoted markets start 0.10 taker / 0.095 maker; high-volume tiers reported down to 0.07 %.")
    e["fees"]["usdt_irt_maker_pct"] = R(0.20, "pct", "low", ("zoomit_compare", "zoomit_ramzinex"), "conflicting", V_FEE)
    e["fees"]["typical_spread_vs_mid_pct"] = A(0.10, "pct", "No depth data.")
    e["withdraw"]["network_fees"]["TRC20"] = R(3.5, "USDT", "low", ("ramzinex_blog", "zoomit_ramzinex"), "reported", V_NETFEE, "Per search summary ~3.5 USDT on TRC20; TON ~0.8 USDT. TRC20 fee is 3.5x Nobitex's reported ~1 USDT: network choice matters.")
    e["withdraw"]["network_fees"]["TON"] = R(0.8, "USDT", "low", ("ramzinex_blog", "zoomit_ramzinex"), "reported", V_NETFEE)
    e["api"] = {
        "public_orderbook_url": U("Open Postman docs https://documenter.getpostman.com/view/15475713/UyxnD4dH (blocked from this environment) and record the orderbook path for USDT/IRR pair id.", None, "Host https://publicapi.ramzinex.com (no auth) per search summary; exact orderbook/pairs paths not seen."),
        "auth": R("Authorization2: Bearer <token> and x-api-key headers (per PHP SDK summary)", None, "low", ("ramzinex_php",), "reported", V_API),
        "rate_limit": U(V_API),
        "websocket": U(V_API),
        "price_unit": U("Compare API price with website."),
        "symbol": U(V_API),
        "docs_url": R("https://documenter.getpostman.com/view/15475713/UyxnD4dH", None, "medium", ("ramzinex_php",), "reported", "Open the URL."),
    }
    e["conversion_model"] = conv_model((0.20, 0.25, 0.25), (0.03, 0.10, 0.30), {"TRC20": 3.5, "TON": 0.8}, "taker 0.25 / maker 0.20 reported; TRC20 3.5 and TON 0.8 USDT withdrawal per search summary")
    E["ramzinex"] = e

    # ---------------- Tabdeal ----------------
    e = blank_exchange("tabdeal", "Tabdeal", "تبدیل", "B", "medium", "Not among the five OFAC-designated domestic venues as of last evidence (June + Aug 2026) but designable under FAQ 1257; publishes Binance-style official API/SDK.")
    e["status"] = R("operating", None, "medium", ("tabdeal_sdk", "tabdeal_postman", "tabdeal_commissions"), "reported", V_STATUS, "Official SDK/Postman repos pushed 2026-05; fee page cites 1405 limits.")
    e["ofac_designated"] = R(False, None, "medium", OFAC_SRC, "reported", "Check SDN list.", "Not named in the 2026-06-02 or 2026-08-07 actions per summaries and file 05.")
    e["fees"]["usdt_irt_taker_pct"] = R(0.35, "pct", "low", ("tabdeal_commissions", "tabdeal_buy_usdt"), "reported", V_FEE, "Level 1 (<1,000 USDT 30-day volume) taker 0.35 / maker 0.33; L2 (1,000-2,000) 0.35/0.31; L3 (2,000-4,000) 0.33/0.28. Another line says 'USDT pairs fixed 0.2 %' (probably USDT-quoted markets).")
    e["fees"]["usdt_irt_maker_pct"] = R(0.33, "pct", "low", ("tabdeal_commissions",), "reported", V_FEE)
    e["fees"]["typical_spread_vs_mid_pct"] = A(0.15, "pct", "No depth data.")
    e["deposit"]["min_deposit_irt"] = R(150000, "IRT", "medium", ("tabdeal_commissions",), "reported", V_CAP)
    e["deposit"]["id_based_cap_irt_per_24h"] = R(25000000, "IRT per 24h", "medium", ("tabdeal_commissions",) + IDCAP_SRC[:2], "reported", "Confirm on the deposit page.", "Tabdeal page: 'max daily deposit 25M Toman per CBI restriction'.")
    e["withdraw"]["irt"]["min_irt"] = R(50000, "IRT", "medium", ("tabdeal_commissions",), "reported", V_CAP, "No maximum stated; daily Toman withdrawal limit depends on 30-day volume.")
    e["api"] = {
        "public_orderbook_url": R("https://api1.tabdeal.org/r/api/v1/depth?symbol=USDT_IRT  (also /ping, /time, /exchangeInfo, /trades)", None, "medium", ("tabdeal_sdk",), "reported", V_API, "Built from official SDK: base_read_url = {base}/r/api/{version}/ + 'depth'; base default https://api.tabdeal.org (alt api1.tabdeal.org). Version 'v1' assumed."),
        "auth": R("HMAC-signed Binance-style (api_key + api_secret); public market endpoints unsigned", None, "medium", ("tabdeal_sdk",), "reported", V_API),
        "rate_limit": U(V_API),
        "websocket": R("wss://api1.tabdeal.org/stream/", None, "medium", ("tabdeal_sdk",), "reported", V_API),
        "price_unit": U("Compare API price with website (likely Toman)."),
        "symbol": R("USDT_IRT (SDK example symbol 'BTC_IRT')", None, "medium", ("tabdeal_sdk",), "reported", V_API),
        "docs_url": R("https://docs.tabdeal.org/ (Postman: github.com/Tabdeal-Exchange/tabdeal-api-postman)", None, "high", ("tabdeal_sdk", "tabdeal_postman"), "reported", "Open the URL."),
    }
    e["conversion_model"] = conv_model((0.20, 0.35, 0.35), (0.05, 0.15, 0.40), {}, "taker 0.35 L1 reported; spread assumption (higher); withdrawal fees unknown -> benchmark")
    E["tabdeal"] = e

    # ---------------- AbanTether ----------------
    e = blank_exchange("abantether", "AbanTether", "آبان‌تتر", "B", "medium", "OTC-style instant buy/sell with spread-embedded price; applied the Mehr-1405 halt and 2,000 USDT daily buy cap; not an OFAC designee on 2026-06-02.")
    e["status"] = R("operating", None, "medium", ("arzdigital_aban", "arzdigital_aban_halt", "pishkhanak_aban"), "reported", V_STATUS, "Review page updated Shahrivar 1405; halt notice on 8-12 Mehr 1405.")
    e["ofac_designated"] = R(True, None, "medium", OFAC_ABAN_SRC, "reported", "Check the OFAC SDN list for 'Aban Tether'.", "Designated 2026-08-07 with Shelbit Exchange per file 05 (verified/high there). Our own searches did not surface it.")
    e["fees"]["usdt_irt_taker_pct"] = R(0.0, "pct", "low", ("zoomit_compare", "novintether_fees", "pishkhanak_aban"), "conflicting", V_FEE, "Zoomit summary: no explicit fee on USDT purchase (cost sits in the quoted price); NovinTether list: 0.2 %; first-pass/pishkhanak: ~0.3 %. Treat all-in cost as spread-based 0.2-0.3 % above best venue mid.")
    e["fees"]["usdt_irt_maker_pct"] = U(V_FEE, "pct")
    e["fees"]["typical_spread_vs_mid_pct"] = A(0.25, "pct", "OTC-style instant-buy venue: assume wider embedded spread than order-book venues.")
    e["withdraw"]["irt"]["daily_cap_irt"] = R(2000000000, "IRT per day", "low", ("arzdigital_aban_halt",), "reported", V_CAP, "Per search summary: daily Rial withdrawal up to 2 billion Toman, in separate requests.")
    e["api"] = {
        "public_orderbook_url": R("https://mono.abantether.com/coins/price  and  https://mono.abantether.com/api/v1/otc/coin-price/  (price lists, not order books)", None, "low", ("aban_sdk",), "reported", V_API, "From the org-published Python SDK source; instant/OTC pricing model, no depth."),
        "auth": R("API key / access token (SDK Client(api_key=ACCESS_TOKEN)); OTC orders POST https://api.abantether.com/order_handler/orders/otc/market|limit; cancel POST /otc/orders/cancel", None, "low", ("aban_sdk",), "reported", V_API),
        "rate_limit": U(V_API),
        "websocket": U(V_API),
        "price_unit": U("Compare price list with website."),
        "symbol": U(V_API),
        "docs_url": U("Ask AbanTether support for the API docs link (SDK README gives none)."),
    }
    e["otc_desk"] = R("AbanTether exposes OTC market/limit order endpoints (api.abantether.com/order_handler/orders/otc/...) via its official-org SDK; minimum sizes/terms not found", None, "low", ("aban_sdk",), "reported", "Ask sales for OTC terms.")
    e["conversion_model"] = conv_model((0.0, 0.20, 0.30), (0.10, 0.25, 0.60), {}, "explicit fee conflicting (0 / 0.2 / 0.3 %) + embedded spread assumption; withdrawal fees unknown -> benchmark")
    E["abantether"] = e

    # ---------------- Exir ----------------
    e = blank_exchange("exir", "Exir", "اکسیر", "C", "medium", "2026 operating status UNVERIFIED; official API docs on GitHub last updated 2022 (v0).")
    e["status"] = U(V_STATUS, None, "Named among exchanges notified of the ID-deposit cap (2024, per Iranbroker summary); launched Feb 2017 per CMC/GetDelta summary; no 2026 evidence found.")
    e["api"] = {
        "public_orderbook_url": R("https://api.exir.io/v0/orderbooks?symbol=usdt-irt  (also /v0/ticker?symbol=, /v0/trades?symbol=)", None, "low", ("exir_docs",), "reported", V_API, "Docs example uses btc-eur on v0; HollaEx-style symbols (usdt-irt) assumed; docs last pushed 2022-10 - may be stale."),
        "auth": R("Authorization: Bearer <ACCESS_TOKEN>", None, "medium", ("exir_docs",), "reported", V_API),
        "rate_limit": U(V_API),
        "websocket": R("socket.io https://api.exir.io/realtime (events orderbook, trades; optional symbol query)", None, "medium", ("exir_docs",), "reported", V_API),
        "price_unit": U("Compare API price with website."),
        "symbol": U(V_API),
        "docs_url": R("https://github.com/exirio/apidocs (Slate source) / exir.io developer portal", None, "medium", ("exir_docs",), "reported", "Open the URL."),
    }
    e["withdraw"]["fee_endpoint"] = R("GET /v0/user/withdraw/{currency}/fee (authenticated) returns the flat withdrawal fee", None, "medium", ("exir_docs",), "reported", "Call with a token.")
    E["exir"] = e

    # ---------------- OMPFinex ----------------
    e = blank_exchange("ompfinex", "OMPFinex", "او‌ام‌پی فینکس", "C", "medium", "2026 operating status UNVERIFIED (a community scanner repo updated 2026-08 still consumes its market data).")
    e["status"] = U(V_STATUS, None, "Only indirect 2026 evidence (GitHub scanner using OMPFinex market data, pushed 2026-08-17).")
    E["ompfinex"] = e

    # ---------------- Tetherland ----------------
    e = blank_exchange("tetherland", "Tetherland", "تترلند", "C", "medium", "2026 operating status UNVERIFIED; managers publicly discussed the FATA 72-hour rule (undated interview).")
    e["status"] = U(V_STATUS, None, "Iranbroker interview with Tetherland managers on the 72 h rule (undated); no 2026 evidence.")
    E["tetherland"] = e

    # ---------------- NovinTether ----------------
    e = blank_exchange("novintether", "NovinTether", "نوین‌تتر", "C", "medium", "Instant-buy venue whose fee is embedded in the price; its own comparison lists are marketing material.")
    e["status"] = R("operating", None, "low", ("novintether_fees",), "reported", V_STATUS, "Publishes 1405-dated blog content; availability not directly checked.")
    e["fees"]["usdt_irt_taker_pct"] = R(0.0, "pct", "low", ("novintether_fees",), "reported", V_FEE, "Own comparison: fee 'zero (included in buy/sell price)'. Real cost = embedded spread.")
    e["fees"]["typical_spread_vs_mid_pct"] = A(0.35, "pct", "Embedded fee assumed wider than order-book venues.")
    e["conversion_model"] = conv_model((0.0, 0.0, 0.0), (0.15, 0.35, 0.80), {}, "zero explicit fee; embedded spread assumption; withdrawal fees unknown -> benchmark")
    E["novintether"] = e

    # ---------------- Excoino ----------------
    e = blank_exchange("excoino", "Excoino", "اکسکوینو", "C", "medium", "No 2026 evidence found (only referral-link repos from 2024).")
    e["status"] = U(V_STATUS, None, "No 2026 evidence found.")
    E["excoino"] = e

    # ---------------- Bit24 ----------------
    e = blank_exchange("bit24", "Bit24", "بیت۲۴", "B", "medium", "Not among the five OFAC-designated domestic venues as of last evidence; fee/levels page exists but was not reachable; has a documented REST API (docs.bit24.cash).")
    e["status"] = R("operating", None, "medium", ("arzdigital_bit24", "bit24_sdk"), "reported", V_STATUS, "ArzDigital review updated Shahrivar 1405; unofficial SDK pushed 2026-09-28.")
    e["ofac_designated"] = R(False, None, "low", OFAC_SRC + ("s05_sanctions",), "reported", "Check SDN list.", "Absence from the designation summaries; not proof.")
    e["fees"]["fee_schedule"] = U("Open https://bit24.cash/fee/ (fees by user level) and copy it.", None, "Page exists ('commissions by user level') but was not reachable.")
    e["withdraw"]["crypto_lock_hours_after_irt_deposit"] = R(72, "hours", "medium", ("arzdigital_bit24",) + LOCK_SRC[:2], "reported", "Ask support.", "ArzDigital Bit24 page appeared in the 72 h lock search results.")
    e["api"] = {
        "public_orderbook_url": R("https://rest.bit24.cash/pro/capi/v1/markets/orderbooks  (also pro/capi/v1/markets; lite/capi/v1/deposit/networks and withdraw/networks)", None, "low", ("bit24_sdk",), "reported", V_API, "From unofficial SDK path strings; docs https://docs.bit24.cash."),
        "auth": R("api_key + api_secret (SDK)", None, "low", ("bit24_sdk",), "reported", V_API),
        "rate_limit": U(V_API),
        "websocket": U(V_API),
        "price_unit": U("Compare API price with website."),
        "symbol": U(V_API),
        "docs_url": R("https://docs.bit24.cash", None, "medium", ("bit24_sdk",), "reported", "Open the URL."),
    }
    e["levels"] = [{"id": "bit24-levels", "name": "User levels exist (limits article by TokenBaz)", "kyc": U("Open the TokenBaz article / Bit24 help for level documents and limits."),
                    "daily_deposit_withdraw_irt": U(V_CAP, "IRT per day")}]
    E["bit24"] = e

    # ---------------- Arzinja ----------------
    e = blank_exchange("arzinja", "Arzinja", "ارزینجا", "C", "medium", "No evidence found in this research that it operates in 2026.")
    e["status"] = U(V_STATUS, None, "Not found in any search result.")
    E["arzinja"] = e

    # ---------------- Small OTC-style venues named in the 1405 fee list ----------------
    for id_, nm, fa, fee_txt, taker in (
        ("arzpaya", "Arzpaya", "ارزپایا", "0.2 % (NovinTether list)", (0.2, 0.2, 0.2)),
        ("eritron", "Eritron", "اریترون", "from 0.2 % (NovinTether list)", (0.2, 0.2, 0.3)),
        ("rabincash", "Rabin Cash", "رابین کش", "0.2-0.32 % (NovinTether list)", (0.2, 0.26, 0.32)),
    ):
        e = blank_exchange(id_, nm, fa, "C", "medium", "Small instant-buy venue listed in a 1405 fee comparison published by a competitor (NovinTether); evidence thin.")
        e["status"] = R("operating", None, "low", ("novintether_fees",), "reported", V_STATUS, "Appears in a 1405-dated competitor list; not independently checked.")
        e["fees"]["usdt_irt_taker_pct"] = R(taker[1], "pct", "low", ("novintether_fees",), "reported", V_FEE, "List value: " + fee_txt)
        e["fees"]["typical_spread_vs_mid_pct"] = A(0.35, "pct", "OTC-style embedded spread assumption.")
        e["conversion_model"] = conv_model(taker, (0.15, 0.35, 0.80), {}, "fee from competitor list; spread assumption; withdrawal fees unknown -> benchmark")
        E[id_] = e

    # ---------------- Wallet-style apps named in 72h evidence ----------------
    for id_, nm, fa, src, note in (
        ("kifpool", "Kifpool (Kif-e Pool-e Man)", "کیف پول من", "kifpool_terms", "Terms of service mention the 72 h withdrawal rule."),
        ("pingi", "Pingi", "پینگی", "pingi_72h", "Help centre explains the 72 h crypto withdrawal limit."),
    ):
        e = blank_exchange(id_, nm, fa, "C", "medium", "Appears only as evidence for the 72 h rule; trading terms not researched.")
        e["status"] = R("operating", None, "low", (src,), "reported", V_STATUS, note)
        e["withdraw"]["crypto_lock_hours_after_irt_deposit"] = R(72, "hours", "medium", (src,) + LOCK_SRC[:2], "reported", "Ask support.", note)
        E[id_] = e

    order = ["nobitex", "wallex", "bitpin", "ramzinex", "tabdeal", "abantether", "exir", "ompfinex", "tetherland", "novintether",
             "excoino", "bit24", "arzinja", "arzpaya", "eritron", "rabincash", "kifpool", "pingi"]
    return [E[k] for k in order]


# --------------------------------------------------------------------------------------------
# PRICE FEED / NETWORKS / OTC / ASSUMPTIONS
# --------------------------------------------------------------------------------------------
def build_price_feed():
    return {
        "principles": R("Executable ask = cheapest ask among venues that are OPEN, reachable and have remaining buy cap; normalise units (Nobitex Rial /10); drop venues > anomalyPct from the median; mark status 'halted' during 21:00-09:00 regimes; kill-switch on stale (> 60 s) or dispersion anomalies.", None, "medium", ("nobitex_docs_market", "nobitex_docs_trade", "bitpin_sdk"), "reported", None, "Design inputs; parameter values are assumptions except where cited."),
        "snapshot_2026_10_02_10_mehr_1405": R({"wallex_sell_irt": 255709, "nobitex_sell_irt": 256500, "nobitex_buy_irt": 256499, "median_of_all_exchange_sell_quotes_irt": 257820, "mean_irt": 257732, "min_irt": 250000, "max_irt": 269509, "band_vs_median_pct": [-3.04, 4.53], "tier_a_band_vs_median_pct": [-0.82, -0.51], "note": "dispersion across ALL venues is wide; tier-A venues cluster within ~1 %"}, "IRT per USDT", "medium", ("nabzgheymat_0710",), "reported", "Sample all venues' public order books at the same second.", "Single-day search-summary snapshot; Nobitex's own price page showed 262,510 (best buy 263,004) at some other time."),
        "recommended_params": {
            "poll_seconds_rest": A(5, "seconds", "Nobitex caches <1 s; docs recommend 1-10 s between orderbook loops; prefer WebSocket where offered."),
            "stale_after_seconds": A(60, "seconds", "Fail-closed per architecture; tune to venue update cadence."),
            "anomaly_pct_vs_median_tier_a": A(2.0, "pct", "Tier-A venues clustered within ~1 % in the snapshot; 2 % leaves headroom."),
            "anomaly_pct_vs_median_all_venues": A(5.0, "pct", "All-venue band was -3.0 % / +4.5 % in the snapshot."),
            "halt_premium_pct": A(1.0, "pct", "Placeholder premium over last ask while exchanges are halted 21:00-09:00 (night gap: OTC drifts, exchange jumps at open); calibrate with macro specialist data."),
            "price_lock_ttl_minutes": A(15, "minutes", "First-pass suggestion 10-15 min; depends on buffer."),
        },
        "unit_conventions": R({"nobitex": "RIAL (divide by 10 for Toman)", "bitpin": "TOMAN (symbol says IRT)", "wallex": "TOMAN (TMN)", "tabdeal": "UNVERIFIED (likely Toman)", "exir": "UNVERIFIED", "ramzinex": "UNVERIFIED"}, None, "medium", ("nobitex_docs_trade", "bitpin_sdk", "go_wallex"), "reported", "Compare each API price with the website price: ~10x means Rial."),
        "aggregators": {
            "bonbast": U("Open bonbast.com and inspect network calls; no documented API found."),
            "alanchand": U("Open alanchand.com; check for a documented API; none found."),
            "tgju": U("Open tgju.org developer/API pages; none verified here. Use only as secondary anomaly detector, never as the executable price."),
        },
        "endpoints": [
            {"exchange": "nobitex", "method": "GET", "url": "https://apiv2.nobitex.ir/v3/orderbook/USDTIRT", "unit": "RIAL", "limit": "300 req/min", "evidence": "official docs (read directly)"},
            {"exchange": "nobitex", "method": "WS", "url": "wss://ws.nobitex.ir/connection/websocket (public:orderbook-USDTIRT)", "unit": "RIAL", "limit": "100 conn/IP, 450 channels/conn", "evidence": "official docs (read directly)"},
            {"exchange": "nobitex", "method": "GET", "url": "https://apiv2.nobitex.ir/v2/options", "unit": "n/a", "limit": "not stated", "evidence": "official docs (read directly): live fees/limits/networks"},
            {"exchange": "wallex", "method": "GET", "url": "https://api.wallex.ir/v1/depth?symbol=USDTTMN", "unit": "TOMAN", "limit": "UNVERIFIED", "evidence": "unofficial SDK source"},
            {"exchange": "bitpin", "method": "GET", "url": "https://api.bitpin.ir/api/v1/mth/orderbook/USDT_IRT/", "unit": "TOMAN", "limit": "429 retry", "evidence": "unofficial SDK README Aug 2026"},
            {"exchange": "tabdeal", "method": "GET", "url": "https://api1.tabdeal.org/r/api/v1/depth?symbol=USDT_IRT", "unit": "UNVERIFIED", "limit": "UNVERIFIED", "evidence": "official SDK source (version segment assumed)"},
            {"exchange": "exir", "method": "GET", "url": "https://api.exir.io/v0/orderbooks?symbol=usdt-irt", "unit": "UNVERIFIED", "limit": "UNVERIFIED", "evidence": "docs 2022 (stale?)"},
            {"exchange": "bit24", "method": "GET", "url": "https://rest.bit24.cash/pro/capi/v1/markets/orderbooks", "unit": "UNVERIFIED", "limit": "UNVERIFIED", "evidence": "unofficial SDK paths"},
            {"exchange": "abantether", "method": "GET", "url": "https://mono.abantether.com/coins/price", "unit": "UNVERIFIED", "limit": "UNVERIFIED", "evidence": "official-org SDK"},
            {"exchange": "ramzinex", "method": "GET", "url": "https://publicapi.ramzinex.com/ (path UNVERIFIED)", "unit": "UNVERIFIED", "limit": "UNVERIFIED", "evidence": "search summary of PHP SDK"},
        ],
    }


def build_networks():
    bk = "Background knowledge, NOT verified in this session."
    return {
        "note": "On-chain fees are paid by the exchange; what the owner pays is the exchange's flat withdrawal fee (exchanges.withdraw.network_fees). Provider-side supported networks come from the card-providers specialist (first-pass: mpay supports TRC20 + BEP20).",
        "provider_supported_default": R({"mpay": ["TRC20", "BEP20"]}, None, "low", ("first_pass",), "reported", "Provider deposit page.", "Secondary source (first-pass doc)."),
        "recommended_default_and_fallback": R({"default": "TRC20 if provider supports it and exchange fee <= ~1 USDT, else BEP20", "fallback": "BEP20 or TON (cheap) - choose per live exchange fee table"}, None, "low", ("first_pass", "ramzinex_blog"), "reported", "Compare live fees via Nobitex /v2/options and exchange pages.", "Design rule of thumb from observed fee spread 0.8-3.5 USDT."),
        "networks": {
            "TRC20": {
                "mechanism": R("TRON: transfer burns energy (TRX) + bandwidth; cost_TRX = energy_units x energy_price_sun / 1e6. Energy per USDT transfer ~65,000 (recipient already holds USDT) or ~130,000 (recipient has zero USDT)", "energy units", "low", (), "UNVERIFIED", "GET /wallet/getenergyprices and /wallet/getchainparameters on a TRON node; dry-run with triggerconstantcontract estimateenergy.", bk),
                "energy_price_sun_current": U("GET https://api.trongrid.io/wallet/getenergyprices", "sun per energy", "Changes by chain parameter votes; do not hard-code."),
                "confirmations_time": R("~19-20 blocks x 3 s ~ 1 minute for exchange credit (typical)", None, "low", (), "UNVERIFIED", "Provider deposit page states required confirmations.", bk),
            },
            "BEP20": {
                "mechanism": R("BNB Smart Chain: gas ~50-65k per BEP20 transfer, paid in BNB; usually cents", None, "low", (), "UNVERIFIED", "eth_gasPrice on a BSC RPC.", bk),
                "confirmations_time": R("seconds to ~1 minute (typical)", None, "low", (), "UNVERIFIED", "Provider deposit page.", bk),
            },
            "TON": {
                "mechanism": R("TON jetton transfer: fees are fractions of a TON; exchange charges flat fee (Ramzinex ~0.8 USDT)", None, "low", ("ramzinex_blog",), "reported", "Provider support for USDT-TON must be checked.", "Only the Ramzinex fee is sourced."),
                "confirmations_time": R("seconds (typical)", None, "low", (), "UNVERIFIED", "Provider deposit page.", bk),
            },
            "POLYGON": {"mechanism": R("Polygon PoS: very cheap gas; checkpoint finality slower than first confirmations", None, "low", (), "UNVERIFIED", "Provider/exchange support check.", bk)},
            "SOLANA": {"mechanism": R("Solana: tiny base fee; first transfer to a wallet without a USDT token account requires rent for the associated token account", None, "low", (), "UNVERIFIED", "Provider/exchange support check.", bk)},
            "ARBITRUM": {"mechanism": R("Arbitrum One: L2 gas + L1 data fee; cents; withdrawals to L1 slow (not relevant for deposits)", None, "low", (), "UNVERIFIED", "Provider/exchange support check.", bk)},
            "ERC20": {"mechanism": R("Ethereum L1: gas-price dependent, often dollars; avoid unless provider requires it", None, "low", (), "UNVERIFIED", "eth_gasPrice.", bk)},
        },
        "nobitex_network_codes_in_docs": R(["ETH", "BSC", "ADA", "ALGO", "APT", "ARB", "BCH", "BNB", "BTC", "BTCLN", "DOGE", "DOT", "EOS", "ETC", "LTC", "PMN", "TRX", "OMNI", "ZTRX", "XLM", "XMR", "XRP", "ATOM", "EGLD", "FIL", "FLR", "FLOW", "FTM", "MATIC", "AVAX", "HBAR", "NEAR", "TON", "SOL", "XTZ", "ONE"], None, "high", ("nobitex_docs_symbols",), "verified", "GET /v2/options -> coins[usdt].networkList shows which of these carry USDT.", "List of ALL network codes; it does not say which carry USDT."),
        "traps": {
            "minimum_deposit": R("Deposits below the provider's minimum may not be credited or may need manual recovery; confirm the minimum before the first transfer and send a small test first", None, "low", (), "UNVERIFIED", "Provider deposit page/support.", "Analysis; provider minimums come from card-providers specialist."),
            "wrong_network": R("Same 0x address format on BEP20/ERC20/Polygon/Arbitrum: sending on the wrong network can lose funds; TRON base58 'T...' addresses cannot receive on EVM chains", None, "medium", (), "UNVERIFIED", "Always select the network that the provider shows next to the address; test with a small amount.", "Analysis (general crypto-operations knowledge)."),
            "address_poisoning": R("Attackers send dust transfers from look-alike addresses (same first/last characters) hoping you copy from history; mitigations: address book/whitelist (Nobitex safe-withdrawal mode), verify full address, never copy from tx history, test transfer, 2-person approval for new addresses", None, "medium", ("nobitex_docs_addr",), "reported", "-", "Mitigation feature is documented for Nobitex; threat description is general knowledge."),
            "issuer_freeze": R("Tether can freeze USDT at flagged addresses; ~USD 550M of Iran-linked USDT was frozen in 2026", "USD million", "medium", ("cryptonomist_tether", "securities_tether"), "reported", "Compliance specialist.", "Do not park large USDT balances at exchange-linked or Iran-linked addresses."),
        },
    }


def build_otc():
    return {
        "note": "Qualitative analysis; no numeric facts were found for fees/speed of OTC or P2P channels - those are null with verify_how. Lawful practice only.",
        "exchange_integrated_otc": [
            {"venue": "abantether", "evidence": R("OTC market/limit order endpoints exist (official-org SDK)", None, "low", ("aban_sdk",), "reported", "Ask sales for terms."),
             "fee_pct": U("Ask sales."), "min_size_usdt": U("Ask sales."), "settlement_time": U("Ask sales.")},
        ],
        "telegram_otc_desks": {
            "fee_pct": U("Quote 3 desks for the same 2,000 USDT in the same hour and record spread vs the best exchange ask."),
            "speed": U("Time 3 small test trades end-to-end."),
            "fraud_patterns": R(["fake bank receipts / edited screenshots", "third-party payer whose funds are proceeds of fraud -> your account blocked ('triangular fraud')", "Paya/Satna reversal after USDT sent", "impersonated admins and look-alike channels/bots", "fake or look-alike tokens/addresses, address poisoning", "pay-first / 'deposit to unlock' schemes"], None, "low", ("first_pass",), "reported", "Compare with FATA/Police cyber-police advisories.", "Pattern list is analysis; first-pass doc mentions triangular fraud and account freezes."),
            "lawful_safe_practices": R(["use only exchange-integrated OTC or registered businesses with verifiable identity/registration", "pay only from your own named account to the counterparty's named account; never accept or send via third parties", "confirm funds in YOUR bank app before releasing USDT; for buying, release Toman only against on-chain confirmed USDT in your whitelisted wallet", "test with a small amount first; written trade confirmation; keep statements for the accountant", "never use borrowed/rented accounts or cards; never split payments to evade caps"], None, "low", (), "UNVERIFIED", "Legal counsel to confirm.", "Analysis, aligned with CLAUDE.md guardrails."),
        },
        "exchange_p2p_markets": U("Check each exchange's app for a P2P/escrow market and record fee/limits; none found in this research."),
    }


def build_assumptions():
    return {
        "reference_rate_irt_per_usdt": R(257000, "IRT per USDT", "medium", ("nabzgheymat_0710", "first_pass"), "reported", "Replace with live executable ask; macro specialist supplies history.", "10 Mehr 1405 snapshot: median of exchange sell quotes 257,820; Wallex 255,709; Nobitex 256,500; same 257,000 used in scripts/pricing_model.py."),
        "benchmark_trc20_withdraw_fee_usdt": A({"low": 1.0, "base": 2.0, "high": 3.5}, "USDT", "Low = Nobitex (first-pass), high = Ramzinex (summary); base is the midpoint used only to fill exchanges with unknown fees."),
        "id_deposit_cap_irt_per_24h": R(25000000, "IRT per 24h", "medium", IDCAP_SRC, "reported", "See rule SHAPARAK-2024-09-ID-DEPOSIT-CAP-25M."),
        "lock_hours": R(72, "hours", "medium", LOCK_SRC, "reported", "See rule FATA-72H-SETTLEMENT-LOCK."),
        "safety_stock_days": A(2, "days", "Replenishment lag + night/halt coverage beyond the 3-day lock."),
        "daily_vol_sigma_pct": A({"calm": 0.5, "base": 1.0, "stress": 2.0}, "pct per day", "Placeholder until macro specialist supplies USDT/IRT realised volatility; used only for the lock-risk buffer illustration."),
        "z_score": A(1.64, "z", "One-sided 95 % buffer, consistent with architecture.md volatility buffer default."),
        "batch_sizes_for_withdrawal_amortisation": A([1, 5, 10, 20], "orders per withdrawal", "Illustrates batching; Nobitex allows max 10 crypto withdrawals per 24 h."),
    }


def build_exchanges_file():
    return {
        "_meta": {
            "file": "data/exchanges.json",
            "owner_agent": "02-ir-exchanges-usdt-rails",
            "as_of": AS_OF,
            "schema_note": "Follows brief 02. Every leaf fact is a Record; unknown = null + status UNVERIFIED + verify_how. Percentages are plain percent numbers. `conversion_model` and `assumptions.*` are modelling assumptions, flagged as such. conversion_cost_table / treasury_worked_table are produced by scripts/research/02_conversion_cost.py --write.",
            "units": "IRT = Toman; Nobitex API prices are in RIAL; USDT amounts in USDT.",
            "coverage_note": "Exchanges with no 2026 evidence have status UNVERIFIED; fees for most exchanges are per search summary only. See research doc 'Method and coverage'.",
            "disclaimer": "Analysis, not legal/tax advice.",
        },
        "exchanges": build_exchanges(),
        "price_feed": build_price_feed(),
        "network_economics": build_networks(),
        "otc_p2p": build_otc(),
        "assumptions": build_assumptions(),
    }


def main():
    data = ROOT / "data"
    data.mkdir(exist_ok=True)
    ex = build_exchanges_file()
    # preserve previously computed tables if present
    p = data / "exchanges.json"
    if p.exists():
        try:
            old = json.loads(p.read_text(encoding="utf-8"))
            for k in ("conversion_cost_table", "treasury_worked_table"):
                if k in old:
                    ex[k] = old[k]
        except Exception:
            pass
    p.write_text(json.dumps(ex, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    (data / "regulatory_limits.json").write_text(json.dumps(build_regulatory(), ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print("wrote", p, "and", data / "regulatory_limits.json")


if __name__ == "__main__":
    main()
