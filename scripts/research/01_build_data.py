#!/usr/bin/env python3
"""Builds data/providers.json (specialist 01, card-providers). Re-runnable: python3 scripts/research/01_build_data.py

EVIDENCE NOTE (read before editing): in the run of 2026-10-02 the WebSearch budget of the session was exhausted (200/200) and every
provider/aggregator domain returned EGRESS_BLOCKED on WebFetch (mpay.cards, trustpilot, pintopay, bitrefill, reloadly, wanttopay,
virtcardpay, redotpay, docs.stripe.com). Therefore NO provider page or ToS was seen first-hand. Facts come from:
  [INT]  docs/business-plan-full-context.md (lead's first-pass; itself compiled from search summaries of mpay.cards, Persian guides, Trustpilot,
         scam-checkers) -> status "reported", confidence "low" (single compiled chain, not independently confirmed)
  [R05]  docs/03-research/05-sanctions-counterparty-risk.md (hazard priors; judgemental)
  [CAT]  data/catalog.json card-acceptance reports (specialist 06)
  [RECALL] analyst recollection (training knowledge) -> status "UNVERIFIED", confidence "low", never used for money numbers.
Everything unknown is null + UNVERIFIED + verify_how (CLAUDE.md section 3.3).
"""
import importlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
costs = importlib.import_module("01_provider_costs")

ROOT = Path(__file__).resolve().parents[2]
AS_OF = "2026-10-02"

INT = {"url": "docs/business-plan-full-context.md", "title": "Lead's first-pass business plan (internal; compiled from search summaries: mpay.cards, Persian guides linotool/maharatweb/webmastersalam, Trustpilot, gridinsoft, scamadviser)",
       "note": "internal repository document, secondary; original pages not seen by specialist 01 (fetch blocked)"}
R05 = {"url": "docs/03-research/05-sanctions-counterparty-risk.md", "title": "Specialist 05: counterparty-risk priors for custodial card providers (judgemental)", "note": "internal repository document"}
CAT = {"url": "data/catalog.json", "title": "Specialist 06 catalog: mpay_and_card_acceptance reports", "note": "internal repository document"}
PM = {"url": "scripts/pricing_model.py", "title": "Lead's first-pass cost model (constants)", "note": "internal repository script"}
BINANCE = {"url": "https://blog.amlbot.com/binance-processed-7-8-billion-worth-transactions-for-iranian-crypto-exchange-nobitex-despite-us-sanctions/",
           "title": "AMLBot relay of Reuters 2022 (cited in docs 05 as S39)", "note": "per specialist 05; not seen by specialist 01"}


def rec(value, unit=None, conf="low", status=None, sources=None, verify_how=None, note=None, **extra):
    r = {"value": value}
    if unit:
        r["unit"] = unit
    r["as_of"] = AS_OF
    r["confidence"] = conf
    if status is None:
        status = "UNVERIFIED" if value is None else "reported"
    r["status"] = status
    if sources:
        r["sources"] = sources
    if verify_how:
        r["verify_how"] = verify_how
    elif value is None or status in ("UNVERIFIED", "reported"):
        r["verify_how"] = "Read the provider's official pricing/terms page and its in-account fee table; screenshot with date; confirm with a small live test."
    if note:
        r["note"] = note
    r.update(extra)
    return r


def unk(vh=None, note=None, unit=None):
    return rec(None, unit=unit, verify_how=vh, note=note or "Not retrieved this run (fetch blocked, search budget exhausted).")


VH_TOS = "Open the provider's Terms of Service / Acceptable Use / Restricted Jurisdictions page, copy the exact clause on Iran (residency vs nationality vs IP), store a dated snapshot + hash; then ask support IN WRITING whether Iran-resident business customers are accepted and keep the reply."
VH_FEE = "Read the provider's public fee page and the in-account fee table; confirm with one small real top-up and compare to the statement."
VH_API = "Search the provider's developer docs / ask sales: is there a public API, B2B/partner or white-label programme? Record URL + auth model + rate limits."
INELIG = "ineligible_expected"          # expected NOT to serve Iran-resident customers/operators
UNKNOWN_ASSUME = "unknown_assume_ineligible_until_written_confirmation"


def iran(value, note, conf="low", sources=None, vh=None):
    return rec(value, conf=conf, status="UNVERIFIED", sources=sources, verify_how=vh or VH_TOS,
               note=note + " ToS wording NOT quoted: pages were not retrievable in this run.")


def caps(issue="panel", topUp="panel", reveal="panel", freeze="panel", balance="panel", webhooks=False, payVendor="panel", basis=None):
    return {"issue": issue, "topUp": topUp, "reveal": reveal, "freeze": freeze, "balance": balance, "webhooks": webhooks, "payVendor": payVendor,
            "basis": rec(basis or "Conservative default: no public API found/known -> operator works in the provider panel (ManualPanelProvider).",
                         conf="low", status="UNVERIFIED", verify_how=VH_API)}


def fees_unknown(overrides=None):
    f = {k: unk(VH_FEE, unit=u) for k, u in [("issue_usd", "USD"), ("min_load_usd", "USD"), ("topup_pct", "pct"), ("topup_fixed_usd", "USD"),
                                             ("network_fee_usdt", "USDT"), ("fx_pct_non_usd", "pct"), ("decline_fee_usd", "USD"),
                                             ("monthly_usd", "USD"), ("inactivity_usd", "USD"), ("refund_unused_balance", None)]}
    if overrides:
        f.update(overrides)
    return f


def limits_unknown():
    return {k: unk("Provider limits page / in-account limits screen.", unit="USD") for k in ("per_card_balance_usd", "daily_spend_usd", "monthly_spend_usd", "min_deposit_usdt")}


def reputation_unknown():
    return {"trustpilot": unk("Open the provider's Trustpilot page; record score, review count, newest 20 reviews with dates."),
            "incidents": rec([], conf="low", status="UNVERIFIED", note="No incident search was possible (search budget exhausted).",
                             verify_how="Search '<provider> scam / blocked funds / outage' in English and Persian, plus Reddit and Persian Telegram groups; list dated incidents.")}


def provider(pid, name, url, ptype, role, risk, restr, jurisdiction=None, fees=None, limits=None, networks=None, kyc=None, iran_el=None,
             api=None, reseller=None, reputation=None, capabilities=None, extra=None):
    p = {"id": pid, "name": name, "url": url, "type": ptype,
         "evidence_class": "none-first-hand",
         "role_in_strategy": role,
         "risk_label": risk, "restriction_note": restr,
         "jurisdiction": jurisdiction or unk("Whois + provider 'About'/'Terms' page: legal entity, registered office, licences.", note="Entity not retrieved this run."),
         "fees": fees or fees_unknown(), "limits": limits or limits_unknown(),
         "networks": networks or unk("Provider deposit page lists supported networks/tokens, min deposit, confirmations."),
         "kyc": kyc or unk("Provider KYC page; test sign-up up to the point of the first KYC prompt (do not submit false data)."),
         "iran_eligibility": iran_el or iran(UNKNOWN_ASSUME, "No evidence either way; treat as ineligible until the provider confirms in writing."),
         "api": api or unk(VH_API), "reseller_program": reseller or unk(VH_API),
         "reputation": reputation or reputation_unknown(),
         "capabilities": capabilities or caps()}
    if extra:
        p.update(extra)
    return p


def build():
    ct = costs.table()
    providers = []

    # ------------------------------------------------------------------ mpay
    mpay_fees = {
        "account_usd": rec(0, "USD", sources=[INT], note="account creation free (per Persian guides summarised in first-pass)"),
        "issue_usd": rec(4.99, "USD", sources=[INT], note="per virtual card, one-off; additive to load assumed"),
        "min_load_usd": rec(25, "USD", sources=[INT]),
        "topup_pct": rec(None, "pct", verify_how="Fund a test account, load a card, read the statement/fee line. Also read the in-app fee table.", note="NOT published anywhere the first-pass could see; peers charge 2.5-4 %."),
        "topup_pct_assumed": rec(3.0, "pct", conf="low", status="UNVERIFIED", sources=[INT, PM], note="lead's placeholder used by the pricing engine until verified; sensitivity band 0-5 %", verify_how="Replace after the first real top-up."),
        "topup_fixed_usd": unk(VH_FEE, unit="USD"),
        "network_fee_usdt": unk("Deposit page: any provider-side deposit fee? (our own exchange withdrawal fee is specialist 02's).", unit="USDT"),
        "fx_pct_non_usd": unk(VH_FEE, unit="pct"), "decline_fee_usd": unk(VH_FEE, unit="USD"),
        "monthly_usd": rec(0, "USD", sources=[INT]),
        "inactivity_usd": unk(VH_FEE, unit="USD"),
        "refund_unused_balance": unk("ToS clause on withdrawal/refund of unused balance; ask support; test.", note="Unknown: critical for trapped-balance risk (PRV-11)."),
    }
    mpay = provider(
        "mpay", "mpay.cards (app.mpay.cards)", "https://mpay.cards", "usdt_card",
        "Candidate primary (panel-only) - BLOCKED until written Iran-eligibility confirmation + small live test",
        "high", "Young custodial provider; Iran-resident eligibility unverified; Trustpilot ~3/5 with fund-blocked complaints (secondary); no public API; cards reported Singapore-region (billing-address mismatch at sensitive merchants). Account may be suspended or funds withheld if the provider treats Iran exposure as prohibited.",
        jurisdiction=rec(None, verify_how="Whois + Terms page: legal entity name, country, licence/registration.", note="UNVERIFIED. Card region reported as Singapore (not the same as entity jurisdiction).", sources=[INT]),
        fees=mpay_fees,
        limits={"per_card_balance_usd": rec("limited to loaded balance", conf="low", sources=[INT]),
                "daily_spend_usd": unk("In-account limits screen / support.", unit="USD"), "monthly_spend_usd": unk("In-account limits screen / support.", unit="USD"),
                "min_deposit_usdt": unk("Deposit page.", unit="USDT")},
        networks=rec(["TRC20", "BEP20"], sources=[INT, {"url": "data/exchanges.json", "title": "network_economics.provider_supported_default (specialist 02, itself from first-pass)", "note": "internal; not independent"}],
                     note="min deposit / credit time / confirmations unknown", verify_how="Deposit page; send a minimal test deposit and time the credit."),
        kyc=rec("marketed as 'no KYC'; triggers unknown", sources=[INT], verify_how="Read KYC/AML policy; ask support what triggers KYC (volume, region, merchant); note marketing != ToS permission.", note="'No-KYC' marketing does not mean Iran-resident customers are permitted by ToS; enforcement can be retroactive."),
        iran_el=iran(UNKNOWN_ASSUME, "Marketing says available 'in most regions' subject to regulation (first-pass); no Iran-specific wording seen.", sources=[INT]),
        api=rec("none_found", status="reported", sources=[INT], note="No public API documentation found by first-pass searches; absence is not proof.", verify_how=VH_API),
        reseller=rec("none_found", status="reported", sources=[INT], note="No documented partner/reseller/referral programme found. Do NOT build revenue on referral mechanics; multi-account referral farming is prohibited by our constitution.", verify_how=VH_API),
        reputation={"trustpilot": rec(3.0, "score_of_5", sources=[INT], note="approximate (~3/5); review count and dates not captured; first-pass dated 2026-10-02", verify_how="Open Trustpilot page; record score, count, latest 20 reviews with dates."),
                    "incidents": rec(["Trustpilot reviews alleging 'scam', refund not returned, support unresponsive (undated, per first-pass)",
                                      "Third-party scam-checkers (gridinsoft, scamadviser) list the domain with caution scores (per first-pass; scores not captured)",
                                      "Reports of 'funds blocked' (per first-pass); no confirmed outage log"], conf="low", status="reported", sources=[INT],
                                     verify_how="Search Persian Telegram groups/forums + Reddit for dated incident reports; read Trustpilot newest reviews.")},
        capabilities=caps(webhooks=False, basis="No public API found -> all operations via the web panel by an operator."),
        extra={
            "entity_facts": {
                "funding_round": rec("USD 3M round announced Dec 2025 (single secondary mention)", conf="low", status="reported", sources=[INT], verify_how="Find the press release / investor announcement; confirm amount, date, lead investors."),
                "domain_age": rec("registered 2025 (young)", conf="low", status="reported", sources=[INT], verify_how="Whois lookup of mpay.cards."),
                "product_line": rec(["virtual Visa (USDT-funded)", "physical card 'coming soon / selected countries'"], conf="low", status="reported", sources=[INT]),
                "card_region": rec("Singapore (reported)", conf="low", status="reported", sources=[INT, CAT], verify_how="Issue a test card and read BIN/region + billing address."),
                "support_channels": unk("Provider contact page: live chat/email/Telegram; measure first-response time with 3 test tickets."),
            },
            "decline_patterns": [
                rec("OpenAI/ChatGPT: billing-address mismatch declines reported for Singapore-region cards", conf="low", status="reported", sources=[INT, CAT], verify_how="Low-value test at each target merchant class."),
                rec("AWS signup: prepaid cards fail verification", conf="medium", status="reported", sources=[CAT], verify_how="Test signup with the actual card; note decline code.", note="applies to prepaid cards generally (per specialist 06 search summaries of AWS FAQ)"),
            ],
            "tos_highlights": unk("Read ToS: prohibited uses, restricted jurisdictions, termination, forfeiture of balance, liability cap, dispute process. Snapshot + hash monthly (CTL-22/CTL-27).", note="ToS not retrieved this run."),
        })
    providers.append(mpay)

    # ------------------------------------------------------------------ alternatives with first-pass fee data
    def alt(pid, name, url, issue, pct, other_note, role, **kw):
        f = fees_unknown({
            "issue_usd": rec(issue, "USD", sources=[INT], note=other_note) if issue is not None else unk(VH_FEE, unit="USD"),
            "topup_pct": rec(pct, "pct", sources=[INT], note=other_note) if pct is not None else unk(VH_FEE, unit="pct"),
        })
        f.update(kw.pop("fee_overrides", {}))
        return provider(pid, name, url, "usdt_card", role, "high",
                        "Foreign custodial/prepaid card provider; Iran-resident eligibility unverified - account may be suspended or funds withheld if ToS prohibit Iran exposure.", fees=f, **kw)

    pinto = alt("pintopay", "PintoPay", "https://www.pintopay.com", 35, 2.5, "first-pass: issue ~35 USD, load ~2.5 %, ~0.25 USD transaction fee, monthly 0", "Secondary candidate (panel/UNVERIFIED) - high issue fee punishes new-card flows",
                fee_overrides={"monthly_usd": rec(0, "USD", sources=[INT]), "topup_fixed_usd": rec(0.25, "USD", sources=[INT], note="labelled 'transaction' fee in first-pass; per-load vs per-spend ambiguous")})
    wtp = alt("wanttopay", "Wanttopay (Prepaid)", "https://wanttopay.com", 0, None, "first-pass: Prepaid card free issue, 0.30 USD per transaction, monthly 0; load % unknown", "Secondary/contingency candidate (UNVERIFIED)",
              fee_overrides={"monthly_usd": rec(0, "USD", sources=[INT]), "topup_fixed_usd": rec(0.30, "USD", sources=[INT], note="'per transaction' fee; per-load vs per-spend ambiguous")})
    vcp = alt("virtcardpay", "VirtCardPay", "https://virtcardpay.com", 3, 4.0, "first-pass: Basic plan 3 USD issue + ~4 % load; 0 % on purchases", "Secondary candidate (UNVERIFIED) - lowest reported issue fee among those with a known load %",
              fee_overrides={"decline_fee_usd": unk(VH_FEE, unit="USD")})
    axp = alt("anyxpay", "AnyXPay", "https://anyxpay.com", 50, 4.0, "first-pass: issue ~50 USD + 4 %; variable fees", "Contingency only (UNVERIFIED) - highest reported issue fee")
    providers += [pinto, wtp, vcp, axp]

    # ------------------------------------------------------------------ alternatives named in brief, nothing retrieved
    named = [("ucards", "uCards", "https://ucards.io"), ("kripicard", "Kripicard", "https://kripicard.com"), ("payx", "PayX", "https://payx.cards"),
             ("mpchat", "MPChat / MP Card", "https://mpchat.org"),
             ("redotpay", "RedotPay", "https://www.redotpay.com"), ("cryptomus", "Cryptomus (cards + processing)", "https://cryptomus.com")]
    for pid, name, url in named:
        p = provider(pid, name, url, "usdt_card", "Not evaluated (no facts retrieved) - research backlog", "high",
                     "No facts retrieved this run; assume ineligible/unknown and high counterparty risk until verified.")
        p["url_note"] = "URL taken from the brief's list; not verified (fetch blocked)."
        providers.append(p)
    # exchange-issued cards: ineligible by exchange KYC / geo policy
    for pid, name, url in [("binance_card", "Binance Card (exchange-issued)", "https://www.binance.com"), ("bybit_card", "Bybit Card (exchange-issued)", "https://www.bybit.com")]:
        p = provider(pid, name, url, "usdt_card", "Excluded - exchange-account KYC + geo policy; listed for completeness", "high",
                     "Requires a KYC'd exchange account; exchanges state they restrict Iran. Not an option for an Iran-resident operator.",
                     iran_el=iran(INELIG, "Binance's stated policy (per specialist 05, citing a Reuters 2022 relay) is to block users in Iran; the same relay reports enforcement gaps. Do not rely on gaps. Bybit: not retrieved (assume the same).", sources=[BINANCE]))
        providers.append(p)

    # ------------------------------------------------------------------ voucher / gift-card aggregators
    vouch = [("bitrefill", "Bitrefill", "https://www.bitrefill.com", "Largest crypto-payable gift-card/top-up shop; recollection (UNVERIFIED): offers a business/partner API and affiliate programme and restricts sanctioned jurisdictions."),
             ("reloadly", "Reloadly", "https://www.reloadly.com", "Gift-card + airtime API; recollection (UNVERIFIED): requires business KYB, restricts sanctioned jurisdictions."),
             ("cryptorefills", "CryptoRefills", "https://www.cryptorefills.com", "Crypto-payable gift cards/top-ups; recollection (UNVERIFIED): API/affiliate exist."),
             ("coinsbee", "Coinsbee", "https://www.coinsbee.com", "Crypto-payable gift cards; API/affiliate unknown."),
             ("piaxis", "Piaxis", "https://piaxis.com", "Brief lists it; nothing retrieved.")]
    for pid, name, url, note in vouch:
        p = provider(pid, name, url, "voucher_api", "Contingency / voucher-SKU supplier IF Iran-eligibility is confirmed in writing; otherwise not used", "high",
                     "Third-party voucher platforms typically list Iran as a restricted jurisdiction; brands behind vouchers are often region-locked; resale may breach brand terms.",
                     iran_el=iran(UNKNOWN_ASSUME, note))
        p["capabilities"] = caps(issue="api", topUp="none", reveal="api", freeze="none", balance="api", webhooks=True, payVendor="api",
                                 basis="UNVERIFIED recollection: voucher aggregators generally expose catalogue/order APIs for approved business accounts; 'issue' here means 'purchase voucher'. Verify per provider.")
        p["fees"] = fees_unknown({"voucher_discount_pct": unk("Business/reseller price sheet: discount vs face by brand.", unit="pct")})
        providers.append(p)

    # ------------------------------------------------------------------ card-issuing-as-a-service / BIN sponsors
    baas = [("stripe_issuing", "Stripe Issuing", "https://stripe.com/issuing", "US-based; OFAC jurisdiction. Recollection (UNVERIFIED): Stripe's supported/restricted-business lists exclude Iran."),
            ("marqeta", "Marqeta", "https://www.marqeta.com", "US-based programme manager; OFAC jurisdiction; enterprise KYB."),
            ("lithic", "Lithic", "https://www.lithic.com", "US-based; OFAC jurisdiction; KYB of the program owner."),
            ("rain", "Rain (crypto-card issuing infrastructure)", "https://www.rain.xyz", "Crypto-native issuing; sanctions policies exclude comprehensively sanctioned jurisdictions (UNVERIFIED)."),
            ("reap", "Reap", "https://reap.global", "Hong Kong-based business card issuing; exact eligibility UNVERIFIED."),
            ("wallester", "Wallester", "https://wallester.com", "Estonia-licensed issuer (recollection); EU/EEA business customers; sanctions screening standard.")]
    for pid, name, url, note in baas:
        p = provider(pid, name, url, "baas", "Not an operational option for an Iran-operated reseller; lawful path = legal counsel + a properly licensed foreign entity with real beneficial ownership disclosed (see doc)", "high",
                     "BIN sponsors/issuers screen against sanctions and require KYB of the programme owner; they are expected to refuse an Iran-nexus programme. Not a supplier for the first 12 months.",
                     iran_el=iran(INELIG, note + " Expected ineligible for an Iran-resident/Iran-controlled operator; confirm only through licensed counsel, never by obscuring ownership or location."))
        p["capabilities"] = caps(issue="api", topUp="api", reveal="api", freeze="api", balance="api", webhooks=True, payVendor="none",
                                 basis="UNVERIFIED recollection: issuing platforms are API-first with webhooks; irrelevant until eligibility exists.")
        providers.append(p)

    # ------------------------------------------------------------------ normalised cost table
    ncost = {}
    for k in costs.PROVIDERS:
        pr = costs.PROVIDERS[k]
        row = {}
        for case, r in ct[k].items():
            row[case] = rec(float(r["overhead_usd"]), "USD", conf="low", status="UNVERIFIED", sources=[INT, PM],
                            verify_how="Recompute with the verified fee table: overhead = amount*pct/100 + fixed (+ issue if new card). Script: scripts/research/01_provider_costs.py",
                            note=("overhead above face value; " + pr["note"]),
                            amount_usd=r["amount"], new_card=r["new_card"], overhead_pct=float(r["overhead_pct"]),
                            overhead_usd_low=float(r["overhead_usd_low"]), overhead_usd_high=float(r["overhead_usd_high"]),
                            overhead_usd_incl_net_batch1=float(r["overhead_usd_incl_net_batch1"]), overhead_usd_incl_net_batch10=float(r["overhead_usd_incl_net_batch10"]),
                            all_in_usd=float(r["all_in_usd"]), overhead_irt_at_256900=r["overhead_irt"])
        ncost[k] = row
    for pid in [p["id"] for p in providers if p["id"] not in ncost]:
        ncost[pid] = {"all": rec(None, "USD", verify_how="Needs verified fee table first.", note="No fee inputs retrieved -> not computable.")}

    L = costs.monthly_loss_rate()
    out = {
        "meta": {
            "as_of": AS_OF, "specialist": "01-card-providers",
            "evidence_warning": "No provider page or ToS was seen first-hand in this run (web-search budget exhausted at 200/200; all provider domains EGRESS_BLOCKED). Treat every fee as a hypothesis to verify with a small live test. Quantities marked reported come from the repo's first-pass (secondary). Nothing here is legal advice.",
            "docs": "docs/03-research/01-card-providers.md", "cost_script": "scripts/research/01_provider_costs.py",
            "capability_value_legend": "api = programmatic; panel = operator works in provider web panel (maps to ProviderCapabilities in packages/contracts/src/ports.ts; the brief's 'operator' == 'panel'); none = unsupported",
        },
        "providers": providers,
        "normalized_cost_table": ncost,
        "cost_model_assumptions": {
            "irt_per_usdt_illustration": rec(256900, "IRT_per_USDT", sources=[INT], note="perishable; illustration only; live rate = specialist 02 / macro"),
            "network_fee_usdt_per_sweep": rec(1, "USDT", sources=[INT], note="exchange TRC20 withdrawal fee, first-pass; specialist 02 owns the real value; batch1 = one sweep per order, batch10 = amortised over 10 orders"),
            "issue_fee_additive_to_load": rec(True, status="UNVERIFIED", verify_how="Issue a test card: is the issue fee charged on top of the load or deducted from it?"),
            "counterparty_monthly_loss_rate_pct_of_float": rec(float(costs.q(L * 100, "0.0001")), "pct_per_month", conf="low", status="UNVERIFIED", sources=[R05],
                                                                   note="sum p_i*(1-recovery_i) over exit 0.5%/5%, freeze 1.8%/50%, insolvency 0.2%/60%, geo de-risk 2.0%/50% (judgemental priors)", verify_how="Replace with observed incident data after 6+ months of operation."),
            "expected_counterparty_loss_usd_by_days_held": {str(d): {k: float(v) for k, v in r.items()} for d, r in costs.loss_table().items()},
            "mpay_topup_pct_sensitivity_newcard_overhead_pct": {pct: {k: float(v) for k, v in r.items()} for pct, r in costs.mpay_sensitivity().items()},
            "min_newcard_ticket_for_overhead_le_pct": {str(m): float(costs.breakeven_min_ticket(m)) for m in (10, 8, 6, 5)},
        },
        "supplier_strategy": {
            "principle": rec("No provider is 'primary' until (1) written confirmation that Iran-resident business customers are accepted, (2) one small live test (issue, load, reveal, spend, statement), (3) ToS snapshot reviewed by counsel. Until then the platform runs in manual/mock mode.",
                             status="UNVERIFIED", conf="medium", sources=[R05], verify_how="Checklist in docs/03-research/01-card-providers.md section 6."),
            "primary": rec("mpay (panel-only) IF verified", status="UNVERIFIED", verify_how="see principle"),
            "secondary": rec(["virtcardpay", "pintopay"], status="UNVERIFIED", verify_how="Same gate as primary; order by verified all-in cost at the typical ticket."),
            "contingency": rec(["wanttopay", "voucher aggregators if eligible", "pause card SKUs and sell only domestically-sourced/lawful products"], status="UNVERIFIED", verify_how="Same gate."),
            "float_cap_pct_equity_per_provider": rec(5, "pct", conf="low", status="UNVERIFIED", sources=[R05], note="policy proposal from specialist 05; tighten to an absolute USD cap in the first 90 days", verify_how="Owner decision; ADR."),
            "float_cap_abs_usd_first_90_days": rec(None, "USD", verify_how="Owner decision: pick an absolute cap you can lose entirely (suggest <= one week of average funded volume)."),
            "max_days_float_held": rec(3, "days", conf="low", status="UNVERIFIED", note="policy proposal: fund just-in-time; sweep unused balance out/spend down within 3 days where the provider allows", verify_how="Check provider withdrawal policy; owner decision."),
            "reconciliation": rec("daily: provider statement balance vs ledger PROVIDER_BALANCE:<id>; per-deposit credit check within 1 hour of 1 confirmation; weekly full card inventory", status="reported", conf="medium", sources=[R05], verify_how="Implement as jobs; see architecture.md"),
            "monitoring_signals": rec(["deposit credit delay > 2x normal", "support response > 48h", "ToS/fee page hash changed", "decline rate +10pp week-on-week", "KYC prompt appears", "withdrawal slower than before", "negative press / peer-group reports", "domain/hosting/WHOIS change"], status="reported", conf="medium", sources=[R05],
                                    verify_how="Wire into risk.scan job; each signal reduces float cap by 50% and pauses new funding."),
        },
        "adapter_capability_matrix_note": "Per-provider capabilities are in providers[].capabilities. Default for every card provider = panel for all operations (ManualPanelProvider). Rate limits: unknown for all (null).",
    }
    return out


if __name__ == "__main__":
    data = build()
    path = ROOT / "data" / "providers.json"
    path.write_text(json.dumps(data, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print("wrote", path, "providers:", len(data["providers"]))
