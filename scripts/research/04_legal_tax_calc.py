#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Brief 04 (legal-tax-compliance-ir) calculations.

Run:  python3 scripts/research/04_legal_tax_calc.py

What it computes (all inputs are constants below; their provenance and confidence are
documented in docs/03-research/04-legal-tax-ir.md and data/tax.json):
  1. Jalali dates + weekdays for key regulatory events, and the cadence of OFAC Iran-crypto actions
     (a base rate for the simulator's `sanctions` scenario events).
  2. Individual progressive tax (ASSUMES the business-income table tracks the 1405 salary table;
     UNVERIFIED) versus a company at the flat 25% rate, with the crossover profit level.
  3. VAT effect on the unit economics of the round-0 pricing scenarios (scripts/pricing_model.py):
     VAT on top of the price, VAT carved out of a fixed market price, and VAT on the service fee only.
  4. Cash-flow effect of quarterly VAT remittance (float created / owed).
  5. Moadian e-invoice penalty arithmetic and the "commercial account" bank-turnover trigger.
  6. Historical-cost tax drag during a devaluation shock (inventory profit is taxed, replacement is not).

This is a model, not tax advice. Nothing here is a recommendation to evade tax.
"""
from __future__ import annotations

import datetime as dt
import statistics
import sys
from decimal import Decimal, ROUND_CEILING, ROUND_HALF_UP
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # scripts/
import pricing_model as pm  # round-0 unit-economics model (import is side-effect free)

# --------------------------------------------------------------------------------------
# Parameters (Toman unless stated; 1 Toman = 10 Rial). See data/tax.json for provenance.
# --------------------------------------------------------------------------------------
VAT_PCT = Decimal("10")            # 1405 (bill proposed 12; rejected) -- confidence medium
CORP_TAX_PCT = Decimal("25")       # Direct Taxes Act Art. 105 -- confidence high
EXEMPT_IRT = 480_000_000           # 4,800 million rial per year (1405 salary table)
# (upper bound in IRT, rate %) -- the first taxed slice (4,800-9,600 m rial) is ASSUMED 10%: UNVERIFIED
INDIVIDUAL_BRACKETS = [
    (480_000_000, Decimal("0")),
    (960_000_000, Decimal("10")),
    (1_200_000_000, Decimal("15")),
    (1_440_000_000, Decimal("20")),
    (1_680_000_000, Decimal("25")),
    (None, Decimal("30")),
]
MOADIAN_PENALTY_PCT = Decimal("10")       # of sales ...
MOADIAN_PENALTY_MIN_IRT = 2_000_000       # ... or 20,000,000 rial, whichever is higher (per one source)
COMMERCIAL_ACCT_TXNS = 100                # deposits/month
COMMERCIAL_ACCT_DEPOSIT_IRT = 35_000_000  # total monthly deposits
C2C_CARD_DAILY_CAP_IRT = 15_000_000       # round-0 plan figure (payments specialist owns verification)


def q(x: Decimal | float | int, step: int = 1) -> int:
    """round half up to integer multiple of `step`"""
    d = Decimal(str(x)) / Decimal(step)
    return int(d.quantize(Decimal(1), rounding=ROUND_HALF_UP)) * step


def ceil_step(x: float, step: int = 1000) -> int:
    d = Decimal(str(x)) / Decimal(step)
    return int(d.to_integral_value(rounding=ROUND_CEILING)) * step


def fmt(n: float | int) -> str:
    return f"{n:,.0f}"


# --------------------------------------------------------------------------------------
# 1. Jalali conversion (jdf algorithm) + weekdays
# --------------------------------------------------------------------------------------
def g2j(gy: int, gm: int, gd: int) -> tuple[int, int, int]:
    g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]
    gy2 = gy + 1 if gm > 2 else gy
    days = (355666 + 365 * gy + (gy2 + 3) // 4 - (gy2 + 99) // 100 + (gy2 + 399) // 400 + gd + g_d_m[gm - 1])
    jy = -1595 + 33 * (days // 12053)
    days %= 12053
    jy += 4 * (days // 1461)
    days %= 1461
    if days > 365:
        jy += (days - 1) // 365
        days = (days - 1) % 365
    if days < 186:
        jm, jd = 1 + days // 31, 1 + days % 31
    else:
        jm, jd = 7 + (days - 186) // 30, 1 + (days - 186) % 30
    return jy, jm, jd


def j2g(jy: int, jm: int, jd: int) -> tuple[int, int, int]:
    jy += 1595
    days = -355668 + 365 * jy + (jy // 33) * 8 + ((jy % 33 + 3) // 4) + jd + ((jm - 1) * 31 if jm < 7 else (jm - 7) * 30 + 186)
    gy = 400 * (days // 146097)
    days %= 146097
    if days > 36524:
        days -= 1
        gy += 100 * (days // 36524)
        days %= 36524
        if days >= 365:
            days += 1
    gy += 4 * (days // 1461)
    days %= 1461
    if days > 365:
        gy += (days - 1) // 365
        days = (days - 1) % 365
    gd = days + 1
    leap = (gy % 4 == 0 and gy % 100 != 0) or gy % 400 == 0
    sal_a = [0, 31, 29 if leap else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    gm = 0
    while gm < 13 and gd > sal_a[gm]:
        gd -= sal_a[gm]
        gm += 1
    return gy, gm, gd


JMONTHS = ["", "Farvardin", "Ordibehesht", "Khordad", "Tir", "Mordad", "Shahrivar", "Mehr", "Aban", "Azar", "Dey", "Bahman", "Esfand"]
# Python weekday(): Monday=0 ... Sunday=6 -> Iranian week starts Saturday
IR_WEEKDAY = {5: "Shanbe (Sat)", 6: "Yekshanbe (Sun)", 0: "Doshanbe (Mon)", 1: "Seshanbe (Tue)", 2: "Chaharshanbe (Wed)", 3: "Panjshanbe (Thu)", 4: "Jomeh (Fri)"}


def show_date(label: str, d: dt.date) -> None:
    jy, jm, jd = g2j(d.year, d.month, d.day)
    print(f"  {label:<62} {d.isoformat()}  = {jy}/{jm:02d}/{jd:02d} ({jd} {JMONTHS[jm]} {jy}), {IR_WEEKDAY[d.weekday()]}")


def section_dates() -> None:
    print("=" * 110)
    print("1. KEY DATES (Gregorian <-> Jalali) AND OFAC ACTION CADENCE")
    print("=" * 110)
    assert g2j(2026, 10, 2) == (1405, 7, 10), "calendar self-check failed (today must be 10 Mehr 1405)"
    assert j2g(1405, 7, 10) == (2026, 10, 2)
    events = [
        ("CBI Board approves crypto policy & regulatory framework (13 Azar 1403)", dt.date(2024, 12, 3)),
        ("President's letter: CBI is sole crypto licensing authority (approx.)", dt.date(2025, 2, 4)),
        ("OFAC: CBI-linked wallets; Tether freezes USD 344.2M", dt.date(2026, 4, 24)),
        ("OFAC: Nobitex, Wallex, Bitpin, Ramzinex designated", dt.date(2026, 6, 2)),
        ("OFAC: 4 Tron wallets tied to CBI; Tether freezes USD 131M", dt.date(2026, 7, 16)),
        ("FT: CBI eases FX controls for exporters (USDT/BTC)", dt.date(2026, 9, 9)),
        ("OFAC: BitBank (Zanjani-linked) designated", dt.date(2026, 9, 17)),
        ("Tether cumulative Iran-linked freezes ~USD 550M reported", dt.date(2026, 9, 29)),
        ("TODAY (project date)", dt.date(2026, 10, 2)),
    ]
    for label, d in events:
        show_date(label, d)
    # redenomination milestones are given in Jalali -> convert to Gregorian
    for label, (jy, jm, jd) in [
        ("Redenomination: transition period starts (16 Azar 1406)", (1406, 9, 16)),
        ("Redenomination: old rial fully retired (16 Azar 1409)", (1409, 9, 16)),
    ]:
        gy, gm, gd = j2g(jy, jm, jd)
        show_date(label, dt.date(gy, gm, gd))

    ofac = [dt.date(2026, 4, 24), dt.date(2026, 6, 2), dt.date(2026, 7, 16), dt.date(2026, 9, 17)]
    gaps = [(b - a).days for a, b in zip(ofac, ofac[1:])]
    span = (ofac[-1] - ofac[0]).days
    mean_gap = statistics.mean(gaps)
    print("\n  OFAC Iran-crypto actions (n=4):", [d.isoformat() for d in ofac])
    print(f"  gaps (days): {gaps}; mean={mean_gap:.1f}; median={statistics.median(gaps):.0f}; span={span} days")
    print(f"  naive Poisson rate = {len(gaps)}/{span} per day = {len(gaps) / span * 365:.1f} actions/year "
          f"(tiny sample: use only as a scenario knob, range 4-10/yr)")
    since_last = (dt.date(2026, 10, 2) - ofac[-1]).days
    print(f"  days since last action at project date: {since_last}")
    t1, t2, tmax = 344.2, 131.0, 550.0
    print(f"  Tether freezes: {t1} + {t2} = {t1 + t2:.1f} M USD by 2026-07-16 (matches the ~475M figure reported 2026-09-09);"
          f" ~{tmax:.0f}M by 2026-09-29 -> unexplained increment {tmax - (t1 + t2):.0f}M USD after 2026-07-16")
    four = 7.7
    print(f"  4 designated exchanges = USD {four}B = 78% of attributed 2025 volume -> implied total ~USD {four / 0.78:.1f}B "
          f"(FT cites ~USD 10B moved through Iran in 2025: consistent)")


# --------------------------------------------------------------------------------------
# 2. Individual vs company tax
# --------------------------------------------------------------------------------------
def individual_tax(profit_irt: int) -> int:
    tax = Decimal(0)
    lower = 0
    for upper, rate in INDIVIDUAL_BRACKETS:
        top = profit_irt if upper is None else min(profit_irt, upper)
        if top > lower:
            tax += Decimal(top - lower) * rate / 100
        lower = upper if upper is not None else lower
        if upper is not None and profit_irt <= upper:
            break
    return q(tax)


def company_tax(profit_irt: int) -> int:
    return q(Decimal(profit_irt) * CORP_TAX_PCT / 100)


def section_income_tax() -> None:
    print("\n" + "=" * 110)
    print("2. INCOME TAX: individual (progressive; table ASSUMED = 1405 salary table) vs company (flat 25%)")
    print("=" * 110)
    print(f"  {'annual taxable profit (IRT)':>30} {'individual tax':>16} {'eff %':>7} {'company tax':>16} {'eff %':>7} {'cheaper':>10}")
    for p in [300_000_000, 500_000_000, 1_000_000_000, 2_000_000_000, 3_000_000_000, 5_000_000_000, 6_240_000_000, 10_000_000_000, 25_000_000_000]:
        ti, tc = individual_tax(p), company_tax(p)
        print(f"  {fmt(p):>30} {fmt(ti):>16} {ti / p * 100:>6.1f}% {fmt(tc):>16} {tc / p * 100:>6.1f}% {'individual' if ti < tc else ('equal' if ti == tc else 'company'):>10}")
    # crossover: above 1,680m the tax is 192m + 0.30*(P-1,680m) ; equals 25% of P at:
    base_tax = individual_tax(1_680_000_000)
    p_cross = (base_tax - Decimal("0.30") * 1_680_000_000) / (Decimal("0.25") - Decimal("0.30"))
    print(f"\n  tax at 1,680m IRT = {fmt(base_tax)}; effective individual rate reaches 25% at P = {fmt(q(p_cross))} IRT per year")
    print("  (Caveat: dividends/profit distribution tax, owner salary alternative, and Art. 131 table are NOT modelled -> UNVERIFIED.)")


# --------------------------------------------------------------------------------------
# 3. VAT on unit economics
# --------------------------------------------------------------------------------------
def section_vat() -> None:
    print("\n" + "=" * 110)
    print(f"3. VAT {VAT_PCT}% ON ROUND-0 UNIT ECONOMICS (pricing_model scenarios; all IRT per order)")
    print("=" * 110)
    print("  A = VAT added on top of the model price (customer pays +10%; our profit unchanged; price rises)")
    print("  B = VAT carved out of a FIXED market price (competitive ceiling): net revenue = P/(1+v)")
    print("  C = VAT only on the service fee (agent-style): base = P - USDT acquisition cost (assumption: pass-through = USDT cost)")
    hdr = f"  {'scenario':<46}{'price P':>13}{'cost':>13}{'profit now':>12}{'A: cust pays':>14}{'B: profit':>12}{'B drop %':>9}{'C: VAT':>11}{'C: profit':>12}"
    print(hdr)
    v = VAT_PCT / 100
    rows = []
    for s in pm.SCENARIOS:
        r = pm.price_order(s)
        P = Decimal(str(r["price_toman"]))
        cost = Decimal(str(r["total_cost_toman"]))
        usdt_cost = Decimal(str(r["usdt_cost_toman"]))
        profit0 = P - cost
        a_pay = P * (1 + v)
        b_net = P / (1 + v)
        b_profit = b_net - cost
        c_vat = (P - usdt_cost) * v
        c_profit = P - c_vat - cost
        drop = (profit0 - b_profit) / profit0 * 100 if profit0 > 0 else Decimal(0)
        rows.append((s.name, P, cost, profit0, a_pay, b_profit, drop, c_vat, c_profit))
        print(f"  {s.name:<46}{fmt(P):>13}{fmt(cost):>13}{fmt(profit0):>12}{fmt(a_pay):>14}{fmt(b_profit):>12}{drop:>8.0f}%{fmt(c_vat):>11}{fmt(c_profit):>12}")
    avg_b_drop = statistics.mean(float(r[6]) for r in rows)
    print(f"\n  Mean profit erosion under B across the 7 scenarios = {avg_b_drop:.0f}% -> if VAT applies to the gross price and competitors do not charge it,"
          " most of the margin disappears.")
    print("  Break-even: VAT-in-price is absorbed without loss only if P/(1+v) >= cost, i.e. markup over cost >= v.")
    print("  Model markup (target margin) 10-20% over cost => B leaves ~0-10% of cost as profit; see rows above.")

    # monthly VAT cash effect, '$100 normal' order (index 4)
    r = pm.price_order(pm.SCENARIOS[4])
    P = Decimal(str(r["price_toman"]))
    print("\n  Quarterly VAT remittance float (mode A, '$100 normal' order, price excl. VAT = " + fmt(P) + "):")
    for orders in (100, 300, 1000):
        vat_month = P * v * orders
        vat_quarter = vat_month * 3
        print(f"    {orders:>5} orders/month: VAT collected/month = {fmt(vat_month)}  | owed at quarter end = {fmt(vat_quarter)} IRT"
              f" (= {fmt(vat_quarter / pm.USDT_TOMAN)} USDT-equivalent at {fmt(pm.USDT_TOMAN)})")
    print("  -> VAT collected is NOT revenue; it must stay in IRT (never swept into the USDT float); ledger account 2100 VAT_PAYABLE.")


# --------------------------------------------------------------------------------------
# 4. Moadian penalty + bank turnover trigger + c2c cap arithmetic
# --------------------------------------------------------------------------------------
def section_penalties_and_triggers() -> None:
    print("\n" + "=" * 110)
    print("4. MOADIAN PENALTY ARITHMETIC; BANK-ACCOUNT 'COMMERCIAL' TRIGGER; C2C CAP ARITHMETIC")
    print("=" * 110)
    print(f"  Penalty = max({MOADIAN_PENALTY_PCT}% x sales, {fmt(MOADIAN_PENALTY_MIN_IRT)} IRT)  [one source; ambiguity per-invoice vs period: UNVERIFIED]")
    for sales in (5_000_000, 20_000_000, 100_000_000, 1_000_000_000, 10_000_000_000):
        pen = max(q(Decimal(sales) * MOADIAN_PENALTY_PCT / 100), MOADIAN_PENALTY_MIN_IRT)
        print(f"    sales {fmt(sales):>16} -> penalty {fmt(pen):>16}  ({pen / sales * 100:.1f}% of sales)")
    print(f"\n  'Commercial account' trigger: > {COMMERCIAL_ACCT_TXNS} deposits/month AND > {fmt(COMMERCIAL_ACCT_DEPOSIT_IRT)} IRT deposited/month.")
    for aov in (3_000_000, 8_000_000, 30_000_000):
        need_by_amount = -(-COMMERCIAL_ACCT_DEPOSIT_IRT // aov)
        print(f"    AOV {fmt(aov):>12}: amount threshold hit after {need_by_amount} orders; count threshold (>{COMMERCIAL_ACCT_TXNS}) is the binding one"
              f" -> {COMMERCIAL_ACCT_TXNS + 1} orders = {fmt((COMMERCIAL_ACCT_TXNS + 1) * aov)} IRT/month through one personal account")
    print("  => any personal account receiving customer payments at >3 orders/day is, by this rule, a taxable 'commercial' account.")
    print(f"\n  c2c arithmetic: per-card cap {fmt(C2C_CARD_DAILY_CAP_IRT)} IRT/day (round-0 figure). A single AOV-30.4M order exceeds it;"
          f" 30 such orders/day = {fmt(30 * 30_405_800)} IRT/day = {-(-30 * 30_405_800 // C2C_CARD_DAILY_CAP_IRT)} card-days of cap.")
    print("  => c2c is a small-ticket rail only. Scaling by spraying one customer's payment over many cards/IDs is structuring and is NOT a lawful path;"
          " lawful path = business account + PSP gateway + bank transfers from the customer's OWN account.")


# --------------------------------------------------------------------------------------
# 5. Historical-cost tax drag in a devaluation shock
# --------------------------------------------------------------------------------------
def section_inventory_tax_drag() -> None:
    print("\n" + "=" * 110)
    print("5. HISTORICAL-COST TAX DRAG DURING A DEVALUATION (model; assumes tax is levied on historical-cost profit, no inflation adjustment: UNVERIFIED)")
    print("=" * 110)
    r0 = Decimal(257_000)
    print("  Float of 1 USDT bought at r0; Rial devalues by d% before the unit is sold at replacement cost x (1+m).")
    print(f"  {'devaluation d':>14}{'margin m':>10}{'hist.profit/r0':>16}{'repl.profit/r0':>16}{'tax@25% / r0':>14}{'tax as % of REAL profit':>26}")
    for d in (Decimal("0.05"), Decimal("0.10"), Decimal("0.20"), Decimal("0.40")):
        for m in (Decimal("0.10"), Decimal("0.15")):
            r1 = r0 * (1 + d)
            hist = r1 * (1 + m) - r0
            repl = r1 * (1 + m) - r1
            tax = hist * CORP_TAX_PCT / 100
            print(f"  {float(d) * 100:>13.0f}%{float(m) * 100:>9.0f}%{float(hist / r0):>16.3f}{float(repl / r0):>16.3f}{float(tax / r0):>14.3f}{float(tax / repl * 100):>25.0f}%")
    print("  Reading: with d=20% and m=10%, historical-cost profit = 32% of r0 but economic (replacement-cost) profit = 12% of r0;"
          " a 25% tax on the former = 8% of r0 = 67% of the economic profit.")
    print("  -> Simulator: accrue income tax on LEDGER profit (historical cost incl. realised FX), but report an inflation-adjusted view; expect cash squeeze after shocks.")


def main() -> None:
    section_dates()
    section_income_tax()
    section_vat()
    section_penalties_and_triggers()
    section_inventory_tax_drag()


if __name__ == "__main__":
    main()
