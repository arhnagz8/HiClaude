#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
03_fee_stack.py - fee stack per Toman-collection method (research brief 03-ir-payments-collection).

What it computes
  For order sizes 100,000 / 1,000,000 / 10,000,000 / 30,000,000 Toman, the cost the MERCHANT (the owner)
  bears to collect the money with each method, expressed in Toman and as a percentage of the order.

Sources of the fee formulas (see docs/03-research/03-ir-payments-collection.md for source ids)
  F-ZP   Zarinpal-type payment-yar (PSP intermediary) fee: 0.5% capped at 16,000 Toman, plus 500 Toman fixed.
         Single secondary source (per search summary of a Zarinpal blog post) -> confidence LOW/MEDIUM.
         The exact fee for a given amount can be asked at runtime: POST /pg/v4/payment/feeCalculation.json
  F-SHP  Shaparak/CBI network fee reform effective 4 Tir 1402 (2023-06-25): merchants pay a fixed 1,200 Rial for
         purchases < 6,000,000 Rial, otherwise 0.02% of the amount capped at 40,000 Rial. Two secondary sources
         (per search summary). Treated as the regulated floor that a direct bank gateway (Sep/Mellat/Parsian/Sadad)
         pays; exemptions exist for some guilds. Confidence MEDIUM, may have changed since 2023.
  F-NP   NextPay legacy fee (1%, min 1 Toman, max 800 Toman) - appears in a search summary but is almost certainly
         legacy (a cap of 800 Toman is incompatible with the 2023 Shaparak floor of up to 4,000 Toman).
         Computed only to show why it must NOT be used. Confidence LOW.

Everything else is a SCENARIO GRID (sensitivity analysis, CLAUDE.md rule 5), not a market fact:
  - operator cost per verified card-to-card receipt,
  - USDT on-chain sweep / AML / gas cost per payment,
  - VAT on the PSP fee,
  - USDT/IRT rate (reference value 257,000 Toman from docs/business-plan-full-context.md, as of 2026-10-02).

Money rules (CLAUDE.md section 7): integers only; fees the merchant pays round UP; Decimal for intermediates.

Usage
  python3 scripts/research/03_fee_stack.py            # markdown tables
  python3 scripts/research/03_fee_stack.py --json     # machine-readable
"""
from __future__ import annotations

import json
import sys
from decimal import Decimal, ROUND_CEILING

ORDERS_TOMAN = [100_000, 1_000_000, 10_000_000, 30_000_000]
USDT_IRT_REFERENCE = 257_000          # Toman per USDT (reference only, from business plan 2026-10-02)
USDT_IRT_SENSITIVITY = [200_000, 257_000, 320_000]

# --- regulatory / provider limits that decide whether a method is feasible for an order size (Toman) ---
C2C_CAP_PER_CARD_PER_DAY = 15_000_000        # 1405 card-to-card cap per sending card per day (4 secondary sources)
INTERNET_PURCHASE_CAP_PER_PERSON_DAY = 400_000_000   # all cards, natural person (per search summary)
INTERNET_PURCHASE_CAP_PER_CARD_DAY = 200_000_000     # single card (per search summary)
ZARINPAL_MAX_SINGLE_PAYMENT = 100_000_000    # Zarinpal error -41 text: max payment 100M Toman (SDK error map)


def ceil_int(x: Decimal) -> int:
    return int(x.to_integral_value(rounding=ROUND_CEILING))


def fee_zarinpal_like(a: int, pct: str = "0.005", cap: int = 16_000, fixed: int = 500) -> int:
    """min(pct*A, cap) + fixed   (Toman)."""
    return min(ceil_int(Decimal(a) * Decimal(pct)), cap) + fixed


def fee_shaparak_floor(a: int) -> int:
    """CBI 1402 schedule, converted to Toman. Rial = 10 * Toman.
    A_rial < 6,000,000  -> 1,200 Rial ; else 0.02% of A_rial capped at 40,000 Rial. Returns Toman (rounded up)."""
    a_rial = a * 10
    fee_rial = 1_200 if a_rial < 6_000_000 else min(ceil_int(Decimal(a_rial) * Decimal("0.0002")), 40_000)
    return ceil_int(Decimal(fee_rial) / Decimal(10))


def fee_nextpay_legacy(a: int) -> int:
    """1% , min 1 Toman, max 800 Toman (legacy; DO NOT USE)."""
    return min(max(ceil_int(Decimal(a) * Decimal("0.01")), 1), 800)


def with_vat(fee: int, vat_pct: int) -> int:
    return ceil_int(Decimal(fee) * (Decimal(100 + vat_pct) / Decimal(100)))


def pct(fee: int, a: int) -> str:
    return f"{Decimal(fee) * 100 / Decimal(a):.3f}%"


def usdt_row(a: int, rate: int, sweep_usdt: Decimal, aml_usdt: Decimal) -> dict:
    """Merchant-side cost of receiving an order in USDT.
    The sender pays the chain fee of the incoming transfer. The merchant pays: sweeping (energy/gas), AML screening."""
    order_usdt = Decimal(a) / Decimal(rate)
    cost_usdt = sweep_usdt + aml_usdt
    cost_toman = ceil_int(cost_usdt * Decimal(rate))
    return {
        "order_usdt": f"{order_usdt:.3f}",
        "cost_usdt": f"{cost_usdt:.3f}",
        "cost_toman": cost_toman,
        "cost_pct": pct(cost_toman, a),
    }


def build() -> dict:
    out: dict = {"orders_toman": ORDERS_TOMAN, "usdt_irt_reference": USDT_IRT_REFERENCE, "methods": {}}

    # 1) PSP / payment-yar gateway (Zarinpal-like formula) + VAT sensitivity
    gw = []
    for a in ORDERS_TOMAN:
        base = fee_zarinpal_like(a)
        no_fixed = fee_zarinpal_like(a, fixed=0)
        gw.append({
            "order": a,
            "fee": base, "fee_pct": pct(base, a),
            "fee_without_fixed_500": no_fixed, "fee_without_fixed_pct": pct(no_fixed, a),
            "fee_with_vat_9": with_vat(base, 9), "fee_with_vat_10": with_vat(base, 10), "fee_with_vat_12": with_vat(base, 12),
            "fits_single_payment_cap": a <= ZARINPAL_MAX_SINGLE_PAYMENT,
        })
    out["methods"]["gateway_psp_zarinpal_like"] = gw

    # 2) direct bank gateway = regulated floor only
    sh = [{"order": a, "fee": fee_shaparak_floor(a), "fee_pct": pct(fee_shaparak_floor(a), a)} for a in ORDERS_TOMAN]
    out["methods"]["gateway_direct_bank_shaparak_floor"] = sh

    # 3) legacy NextPay figure (shown only as a warning)
    out["methods"]["gateway_nextpay_legacy_DO_NOT_USE"] = [
        {"order": a, "fee": fee_nextpay_legacy(a), "fee_pct": pct(fee_nextpay_legacy(a), a)} for a in ORDERS_TOMAN
    ]

    # 4) manual card-to-card: receiver pays no bank fee; real costs are operator time, fraud, tax exposure.
    c2c = []
    for a in ORDERS_TOMAN:
        row = {"order": a, "bank_fee_receiver": 0, "sender_cap_per_card_day": C2C_CAP_PER_CARD_PER_DAY,
               "fits_single_c2c": a <= C2C_CAP_PER_CARD_PER_DAY}
        for op in (1_000, 3_000, 10_000):                       # scenario: operator cost per verified receipt (Toman)
            row[f"operator_cost_{op}"] = {"fee": op, "fee_pct": pct(op, a)}
        row["unique_tail_mean_toman"] = 500                      # uniform 1..999 Toman tail (collected by merchant, not a cost)
        c2c.append(row)
    out["methods"]["card_to_card_manual"] = c2c

    # 5) USDT on-chain: scenario grid for sweep+AML cost per payment, at three FX levels
    usdt = {}
    for rate in USDT_IRT_SENSITIVITY:
        grid = []
        for a in ORDERS_TOMAN:
            row = {"order": a, "order_usdt": f"{Decimal(a)/Decimal(rate):.3f}"}
            for sweep in ("0.10", "0.50", "1.00", "3.00"):
                r = usdt_row(a, rate, Decimal(sweep), Decimal("0.00"))
                row[f"sweep_{sweep}_usdt"] = {"cost_toman": r["cost_toman"], "cost_pct": r["cost_pct"]}
            grid.append(row)
        usdt[str(rate)] = grid
    out["methods"]["usdt_onchain_scenarios"] = usdt

    # 6) Bale wallet: merchant fee unknown (payer is charged per python-bale-bot 2.5.0 docstring)
    out["methods"]["bale_wallet"] = [{"order": a, "merchant_fee": None, "note": "UNVERIFIED: payer-side fee per SDK docstring; settlement terms unknown"} for a in ORDERS_TOMAN]

    # 7) feasibility matrix
    feas = []
    for a in ORDERS_TOMAN:
        feas.append({
            "order": a,
            "c2c_single_card": a <= C2C_CAP_PER_CARD_PER_DAY,
            "gateway_zarinpal_single": a <= ZARINPAL_MAX_SINGLE_PAYMENT,
            "gateway_person_day_cap": a <= INTERNET_PURCHASE_CAP_PER_PERSON_DAY,
            "usdt_min_viable_if_chain_fee_1_usdt": (Decimal(a) / Decimal(USDT_IRT_REFERENCE)) >= Decimal(10),
        })
    out["feasibility"] = feas
    return out


def fmt(n: int) -> str:
    return f"{n:,}"


def markdown(res: dict) -> str:
    L: list[str] = []
    L.append("### Gateway - PSP / payment-yar (Zarinpal-like: min(0.5% x A, 16,000) + 500 Toman)")
    L.append("| Order (Toman) | Fee (Toman) | Fee % | Fee w/o fixed 500 | % | +VAT 9% | +VAT 10% | +VAT 12% | single payment cap OK |")
    L.append("|---:|---:|---:|---:|---:|---:|---:|---:|:--:|")
    for r in res["methods"]["gateway_psp_zarinpal_like"]:
        L.append(f"| {fmt(r['order'])} | {fmt(r['fee'])} | {r['fee_pct']} | {fmt(r['fee_without_fixed_500'])} | {r['fee_without_fixed_pct']} | "
                 f"{fmt(r['fee_with_vat_9'])} | {fmt(r['fee_with_vat_10'])} | {fmt(r['fee_with_vat_12'])} | {'yes' if r['fits_single_payment_cap'] else 'NO'} |")
    L.append("")
    L.append("### Gateway - direct bank IPG (regulated Shaparak floor: 1,200 Rial if < 6M Rial else 0.02% cap 40,000 Rial)")
    L.append("| Order (Toman) | Fee (Toman) | Fee % |")
    L.append("|---:|---:|---:|")
    for r in res["methods"]["gateway_direct_bank_shaparak_floor"]:
        L.append(f"| {fmt(r['order'])} | {fmt(r['fee'])} | {r['fee_pct']} |")
    L.append("")
    L.append("### Gateway - NextPay legacy figure (1%, min 1, max 800 Toman) - legacy, DO NOT USE")
    L.append("| Order (Toman) | Fee (Toman) | Fee % |")
    L.append("|---:|---:|---:|")
    for r in res["methods"]["gateway_nextpay_legacy_DO_NOT_USE"]:
        L.append(f"| {fmt(r['order'])} | {fmt(r['fee'])} | {r['fee_pct']} |")
    L.append("")
    L.append("### Card-to-card (manual) - receiver bank fee 0; cost = operator time (scenario) ; cap 15M Toman/day/card")
    L.append("| Order (Toman) | bank fee | single c2c possible | operator 1,000 | % | operator 3,000 | % | operator 10,000 | % |")
    L.append("|---:|---:|:--:|---:|---:|---:|---:|---:|---:|")
    for r in res["methods"]["card_to_card_manual"]:
        o1, o3, o10 = r["operator_cost_1000"], r["operator_cost_3000"], r["operator_cost_10000"]
        L.append(f"| {fmt(r['order'])} | 0 | {'yes' if r['fits_single_c2c'] else 'NO'} | {fmt(o1['fee'])} | {o1['fee_pct']} | {fmt(o3['fee'])} | {o3['fee_pct']} | {fmt(o10['fee'])} | {o10['fee_pct']} |")
    L.append("")
    L.append("### USDT on-chain - merchant cost per payment (scenario grid: sweep+AML cost in USDT; sender pays the incoming chain fee)")
    for rate, grid in res["methods"]["usdt_onchain_scenarios"].items():
        L.append(f"**USDT/IRT = {fmt(int(rate))} Toman**")
        L.append("| Order (Toman) | Order (USDT) | cost 0.10 USDT | % | cost 0.50 USDT | % | cost 1.00 USDT | % | cost 3.00 USDT | % |")
        L.append("|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|")
        for r in grid:
            c = [r[f"sweep_{s}_usdt"] for s in ("0.10", "0.50", "1.00", "3.00")]
            L.append(f"| {fmt(r['order'])} | {r['order_usdt']} | {fmt(c[0]['cost_toman'])} | {c[0]['cost_pct']} | {fmt(c[1]['cost_toman'])} | {c[1]['cost_pct']} | "
                     f"{fmt(c[2]['cost_toman'])} | {c[2]['cost_pct']} | {fmt(c[3]['cost_toman'])} | {c[3]['cost_pct']} |")
        L.append("")
    L.append("### Feasibility by order size")
    L.append("| Order (Toman) | single c2c <= 15M | gateway single <= 100M | gateway per-person/day <= 400M | USDT >= 10 USDT (chain fee 1 USDT = 10%) |")
    L.append("|---:|:--:|:--:|:--:|:--:|")
    for r in res["feasibility"]:
        yn = lambda b: "yes" if b else "NO"
        L.append(f"| {fmt(r['order'])} | {yn(r['c2c_single_card'])} | {yn(r['gateway_zarinpal_single'])} | {yn(r['gateway_person_day_cap'])} | {yn(r['usdt_min_viable_if_chain_fee_1_usdt'])} |")
    return "\n".join(L)


if __name__ == "__main__":
    result = build()
    if "--json" in sys.argv:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print(markdown(result))
