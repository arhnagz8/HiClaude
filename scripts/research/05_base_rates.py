#!/usr/bin/env python3
"""Brief 05 (sanctions / counterparty risk) -- base rates, hazards and float-cap maths.

Every INPUT below is an observation quoted in docs/03-research/05-sanctions-counterparty-risk.md
(source ids [S#]); every OUTPUT is a *modelling prior*, not a forecast (CLAUDE.md s3.5).
Run:  python3 scripts/research/05_base_rates.py
Pure stdlib, deterministic, no network.
"""
from __future__ import annotations

from datetime import date
from math import exp

AS_OF = date(2026, 10, 2)
DAYS_PER_MONTH = 30.4375


def months_between(a: date, b: date) -> float:
    return (b - a).days / DAYS_PER_MONTH


def p_month_from_p_year(p_year: float) -> float:
    """Convert an annual probability of >=1 event into a monthly probability (constant hazard)."""
    return 1.0 - (1.0 - p_year) ** (1.0 / 12.0)


def p_year_from_p_month(p_month: float) -> float:
    return 1.0 - (1.0 - p_month) ** 12.0


def likelihood_bucket(p_month: float) -> int:
    """1-5 likelihood scale on ANNUAL probability: <1%, 1-5%, 5-20%, 20-50%, >50%."""
    py = p_year_from_p_month(p_month)
    if py < 0.01:
        return 1
    if py < 0.05:
        return 2
    if py < 0.20:
        return 3
    if py < 0.50:
        return 4
    return 5


# ---------------------------------------------------------------------------------------------
# 1. OFAC designation-event rate for Iran-linked digital-asset exchanges  ([S5],[S12],[S26],[S28])
# ---------------------------------------------------------------------------------------------
EVENTS = [
    # date, label, exchanges designated, domestic Iranian-market exchange?
    (date(2026, 1, 30), "Zedcex + Zedxion (UK-registered)", 2, False),
    (date(2026, 6, 2), "Nobitex, Wallex, Bitpin, Ramzinex (+4 Nobitex individuals)", 4, True),
    (date(2026, 8, 7), "Aban Tether + Shelbit (+ operator, 4 front companies)", 2, True),
    (date(2026, 9, 17), "BitBank (Zanjani-controlled)", 1, True),
]


def designation_hazard() -> None:
    print("=== 1. Designation events (OFAC, Iran-linked exchanges) ===")
    first = EVENTS[0][0]
    win_all = months_between(first, AS_OF)
    n_all = len(EVENTS)
    lam_all = n_all / win_all
    print(f"All events: {n_all} in {win_all:.2f} months (since {first}) -> {lam_all:.3f} events/month")
    dom = [e for e in EVENTS if e[3]]
    first_dom = dom[0][0]
    win_dom = months_between(first_dom, AS_OF)
    lam_dom = len(dom) / win_dom
    ex_dom = sum(e[2] for e in dom)
    print(f"Domestic-market events: {len(dom)} in {win_dom:.2f} months (since {first_dom}) -> {lam_dom:.3f} events/month,"
          f" {ex_dom} exchanges designated -> {ex_dom / win_dom:.2f} exchanges/month")
    for lam, tag in ((lam_all, "since Jan-30"), (lam_dom, "since Jun-2")):
        for t in (1, 3, 6):
            print(f"  P(>=1 new Iran-crypto designation action within {t} mo | lambda {lam:.2f} [{tag}]) = {1 - exp(-lam * t):.1%}")

    print("\nPer-exchange monthly hazard for a NOT-yet-designated Iranian exchange")
    print("  h = min(1, r / N_rem) * s    r = exchanges designated per month, N_rem = pool - already designated, s = size-bias factor")
    r = ex_dom / win_dom
    already = ex_dom  # 7 (Nobitex, Wallex, Bitpin, Ramzinex, Aban Tether, Shelbit, BitBank)
    print(f"  r = {r:.2f}/month; already designated (domestic-market) = {already}")
    print("  pool N_total | N_rem | uniform h | s=0.15 | s=0.30 | s=0.50")
    for n_total in (13, 15, 20):
        n_rem = max(1, n_total - already)
        uni = min(1.0, r / n_rem)
        print(f"  {n_total:>12} | {n_rem:>5} | {uni:>9.1%} | {uni * 0.15:>6.1%} | {uni * 0.30:>6.1%} | {uni * 0.50:>6.1%}")
    print("  -> prior used in register: base 6%/month, low 2%, high 15% (SAN-01)")


# ---------------------------------------------------------------------------------------------
# 2. Tether freeze statistics  ([S29] BlockSec, [S24] Tether/Iran, [S25] Senate PSI)
# ---------------------------------------------------------------------------------------------
def tether_rates() -> None:
    print("\n=== 2. Tether freeze base rates ===")
    n25, usd25 = 4163, 1.26e9
    print(f"2025: {n25} addresses, ${usd25 / 1e9:.2f}bn -> {n25 / 12:.0f} addr/month, {n25 / 365:.1f} addr/day, "
          f"mean ${usd25 / n25:,.0f}/addr, ${usd25 / 365 / 1e6:.2f}M/day, ${usd25 / 12 / 1e6:.0f}M/month")
    removed = round(0.036 * n25)
    print(f"  removed from blacklist: 3.6% -> ~{removed} addresses; recovery proxy P(unfreeze) = 3.6%; median 18.2 days for those removed")
    print(f"  destroyed via destroyBlackFunds: >$698M = {698e6 / usd25:.1%} of 2025 frozen value")
    print(f"  Tron share of blacklisted addresses: 84% -> ~{round(0.84 * n25)} addresses on Tron")
    cum_n, cum_usd_blocksec, cum_usd_tether = 9597, 5.69e9, 4.9e9
    print(f"Cumulative to 2026-07-26: {cum_n} addresses; ${cum_usd_blocksec / 1e9:.2f}bn (BlockSec) vs >${cum_usd_tether / 1e9:.1f}bn (Tether) "
          f"-> ratio {cum_usd_blocksec / cum_usd_tether:.2f} (definition/time gap; use $4.9-5.7bn)")
    cbi_apr, cbi_jul, iran_total = 344e6, 131e6, 550e6
    print(f"Iran-linked 2026: CBI {cbi_apr / 1e6:.0f}M (Apr) + {cbi_jul / 1e6:.0f}M (Jul) = {(cbi_apr + cbi_jul) / 1e6:.0f}M; "
          f"Tether total ~{iran_total / 1e6:.0f}M -> non-CBI remainder ~{(iran_total - cbi_apr - cbi_jul) / 1e6:.0f}M")
    print(f"  Iran share of cumulative frozen: {iran_total / cum_usd_blocksec:.1%} (BlockSec base) .. {iran_total / cum_usd_tether:.1%} (Tether base)")
    slipped = 35e6
    print(f"Senate PSI: 846 wallets, 84% USDT-only; ${slipped / 1e6:.0f}M slipped past -> freeze coverage by value ~{iran_total / (iran_total + slipped):.1%}")
    print("Freeze latency example (AMLBot via Cointelegraph): 44 min on Tron; $78.1M moved in such windows since 2017")
    print("  -> for a wallet listed on OFAC SDN: assume freeze within hours (Tether auto-freeze policy since Dec-2023)")
    print("  -> prior for P(freeze) of an Iranian-origin treasury wallet: 1.5%/month (0.4%-5%)  [TKN-01]; x6 if funded from SDN-listed exchanges")


# ---------------------------------------------------------------------------------------------
# 3. Float caps and expected counterparty loss
# ---------------------------------------------------------------------------------------------
def float_caps() -> None:
    print("\n=== 3. Provider float caps ===")
    print("Rule: F_cap = min( F_demand , eps * Equity / LGF_tail )   LGF_tail = 1 (worst case: whole float lost)")
    print("      F_demand = D * (cadence_days + buffer_days)  where D = average daily top-up demand (USD)")
    print("Equity |   eps 3% |   eps 5% |  eps 10%   (max USD float per single provider)")
    for eq in (20_000, 50_000, 100_000, 250_000, 1_000_000):
        print(f"{eq:>6,} | {eq * .03:>8,.0f} | {eq * .05:>8,.0f} | {eq * .10:>8,.0f}")
    print("\nDemand-side float (cadence 1 day, buffer 0.5 day -> 1.5 days of demand):")
    for d in (500, 1_000, 3_000, 10_000):
        print(f"  D=${d:>6,}/day -> F_demand = ${d * 1.5:>8,.0f}; providers needed at 5%-of-equity cap for Equity 50k: {max(1, -(-d * 1.5 // (50_000 * .05))):.0f}")


def expected_loss_premium() -> None:
    print("\n=== 4. Expected permanent counterparty loss, as % of GMV (model, not forecast) ===")
    # (id, p_month, recovery_prob)  loss given event = 1 - recovery for permanent write-off share
    prov = [("PRV-01 exit", 0.005, 0.05), ("PRV-02 freeze", 0.018, 0.50), ("PRV-03 insolvency", 0.002, 0.60), ("PRV-05 geo de-risk", 0.020, 0.50)]
    el_frac = sum(p * (1 - rec) for _, p, rec in prov)
    p_any_year = 1 - 1
    surv = 1.0
    for _, p, _ in prov:
        surv *= (1 - p)
    p_any_year = 1 - surv ** 12
    print(f"Per-provider: sum(p_i * (1-recovery_i)) = {el_frac:.4f} of float per month; P(>=1 severe event / year) = {p_any_year:.1%}")
    for float_days in (0.5, 1.0, 1.5, 3.0):
        el_gmv = el_frac * float_days / 30.0
        print(f"  float = {float_days:.1f} days of GMV -> EL = {el_gmv:.3%} of monthly GMV")
    print("Exchange balance (EXC-01/02/04) and treasury-wallet freeze (TKN-01) add on top; see risk_register.json 'portfolio'.")


def jalali_dates() -> None:
    """Gregorian -> Jalali for the key dates (simple arithmetic; verified against known anchors 2026-10-02 = 10 Mehr 1405)."""
    # Anchor: 1 Farvardin 1405 = 2026-03-21.  Month lengths 31x6, 30x5, 29 (non-leap) / 30.
    anchor = date(2026, 3, 21)
    months = [("Farvardin", 31), ("Ordibehesht", 31), ("Khordad", 31), ("Tir", 31), ("Mordad", 31), ("Shahrivar", 31),
              ("Mehr", 30), ("Aban", 30), ("Azar", 30), ("Dey", 30), ("Bahman", 30), ("Esfand", 29)]
    print("\n=== 5. Gregorian -> Jalali (1405) for dates used in the docs ===")
    for d in (date(2026, 6, 2), date(2026, 7, 16), date(2026, 8, 7), date(2026, 8, 24), date(2026, 9, 8), date(2026, 9, 17), date(2026, 10, 2)):
        off = (d - anchor).days
        for name, ln in months:
            if off < ln:
                print(f"  {d} = {off + 1} {name} 1405")
                break
            off -= ln
    # 2026-01-30 falls in 1404
    anchor_1404 = date(2025, 3, 21)
    months_1404 = months[:-1] + [("Esfand", 29)]
    off = (date(2026, 1, 30) - anchor_1404).days
    for name, ln in months_1404:
        if off < ln:
            print(f"  2026-01-30 = {off + 1} {name} 1404")
            break
        off -= ln


if __name__ == "__main__":
    designation_hazard()
    tether_rates()
    float_caps()
    expected_loss_premium()
    jalali_dates()
