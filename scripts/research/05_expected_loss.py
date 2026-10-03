#!/usr/bin/env python3
"""Brief 05 -- expected counterparty/operational loss as a share of GMV, computed FROM data/risk_register.json.

Model (per risk, per month), exposures expressed as days of monthly GMV held in each scope:
  float_freeze_pct : EL = pm * pct * (1 - recovery_prob) * exposure_days / 30        (permanent write-off share only)
  fine_irt         : EL = pm * (pct_of_monthly_gmv | pct_of_monthly_revenue * take_rate | amount_usd / GMV_usd)
  downtime/demand/fee shocks are NOT included here (they hit margin, not capital; the simulator prices them).
Temporary freezes cost carry (frozen capital x duration x cost of capital) -- excluded; macro specialist (08) owns the carry rate.
All inputs are modelling priors (see register); output is a pricing/reserve input, not a forecast.
Run: python3 scripts/research/05_expected_loss.py   (after 05_build_data.py)
"""
from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
reg = json.loads((ROOT / "data" / "risk_register.json").read_text(encoding="utf-8"))

GMV_USD = 150_000.0   # illustrative monthly GMV (~$5k/day); EL shares are scale-free except fixed-USD fines
TAKE = 0.10           # revenue / GMV (lead's pricing model: ~8-15% of price)

POLICIES = {
    # exposure in days of monthly GMV held in each scope.  exchange_balance is LOCK-AWARE (specialist 02, C13): with the 72h withdrawal lock
    # (L = 3 days) bought USDT sits on the exchange for >= 3 days, so the structural cap is L + 1 = 4 days, not 1 day.
    "baseline (JIT, caps applied)": dict(provider_float=1.5, exchange_balance=4.0, treasury_wallet=2.0, hot_wallet=1.0, bank_balance=1.0, voucher_inventory=0.0,
                                         otc_balance=0.0, inbound_usdt_quarantine=0.0),
    "idle-heavy (no caps)":          dict(provider_float=7.0, exchange_balance=7.0, treasury_wallet=5.0, hot_wallet=3.0, bank_balance=3.0, voucher_inventory=2.0,
                                         otc_balance=0.0, inbound_usdt_quarantine=0.0),
    "ultra-lean (JIT hourly)":       dict(provider_float=0.5, exchange_balance=3.25, treasury_wallet=1.0, hot_wallet=0.5, bank_balance=0.5, voucher_inventory=0.0,
                                         otc_balance=0.0, inbound_usdt_quarantine=0.0),
}


def el_for(risk: dict, exp: dict, active_flags: set[str]) -> tuple[float, str]:
    sim = risk["sim"]
    if not set(sim["applies_when"]).issubset({"always"} | active_flags):
        return 0.0, "inactive"
    pm = sim["probability_per_month"]["value"]
    imp = sim["impact"]
    t, p = imp["type"], imp["params"]
    if t == "float_freeze_pct":
        scope = p["scope"]
        if scope == "all_usdt":
            days = exp["provider_float"] + exp["exchange_balance"] + exp["treasury_wallet"] + exp["hot_wallet"]
        else:
            days = exp.get(scope, 0.0)
        return pm * p["pct"] * (1 - p["recovery_prob"]) * days / 30.0, scope
    if t == "fine_irt":
        if "pct_of_monthly_gmv" in p:
            return pm * p["pct_of_monthly_gmv"], "fine"
        if "pct_of_monthly_revenue" in p:
            return pm * p["pct_of_monthly_revenue"] * TAKE, "fine"
        if "pct_of_trailing_12m_revenue" in p:
            return pm * p["pct_of_trailing_12m_revenue"] * TAKE * 12 / 12.0, "fine"  # one-off, expressed against 12m revenue ~ 12 months of GMV*TAKE
        if "amount_usd" in p:
            return pm * p["amount_usd"] / GMV_USD, "fine"
    return 0.0, "non-capital"


def main() -> None:
    print(f"Illustrative monthly GMV ${GMV_USD:,.0f}; take rate {TAKE:.0%}. EL = permanent write-offs only, % of monthly GMV.\n")
    for name, exp in POLICIES.items():
        by_scope: dict[str, float] = defaultdict(float)
        by_risk: list[tuple[float, str]] = []
        total = 0.0
        for r in reg["risks"]:
            v, scope = el_for(r, exp, set())
            if v > 0:
                by_scope[scope] += v
                by_risk.append((v, r["id"]))
                total += v
        print(f"== {name}: total EL = {total:.3%} of monthly GMV  (x2 model-uncertainty loading = {2 * total:.3%})")
        for k, v in sorted(by_scope.items(), key=lambda kv: -kv[1]):
            print(f"   {k:<26} {v:.4%}")
        top = sorted(by_risk, reverse=True)[:6]
        print("   top contributors:", ", ".join(f"{i} {v:.4%}" for v, i in top))
        print()
    # Conditional line items, shown separately (flags + hazard modifiers from register meta.exposure_modifiers)
    print("Conditional items (increments over baseline):")
    mods = reg["meta"]["exposure_modifiers"]
    base_exp = POLICIES["baseline (JIT, caps applied)"]

    def total(exp, flags, mult):
        tot = 0.0
        for r in reg["risks"]:
            r2 = json.loads(json.dumps(r))
            pm = r2["sim"]["probability_per_month"]["value"] * mult.get(r["id"], 1.0)
            r2["sim"]["probability_per_month"]["value"] = min(1.0, pm)
            tot += el_for(r2, exp, flags)[0]
        return tot

    base = total(base_exp, set(), {})
    for flag, label in (("accepts_usdt_inbound", "customer USDT inbound enabled, unscreened"), ("uses_designated_exchange", "USDT sourced from a designated exchange")):
        exp = {**base_exp, "inbound_usdt_quarantine": 1.0} if flag == "accepts_usdt_inbound" else base_exp
        v = total(exp, {flag}, mods[flag]["multipliers"])
        print(f"   {label}: +{v - base:.4%} of GMV (hazard multipliers {mods[flag]['multipliers']}; TKN-02 exposure 1 day of GMV where applicable)")
    v = total(base_exp, set(), mods["provider_share_over_60pct"]["multipliers"])
    print(f"   provider concentration > 60% of float: +{v - base:.4%} of GMV (hazard multipliers {mods['provider_share_over_60pct']['multipliers']})")
    # reserve sizing
    base_total = sum(el_for(r, POLICIES["baseline (JIT, caps applied)"], set())[0] for r in reg["risks"])
    print(f"\nReserve sizing: 12 months of baseline EL at GMV ${GMV_USD:,.0f}/month = ${base_total * GMV_USD * 12:,.0f} (before x2 loading: ${2 * base_total * GMV_USD * 12:,.0f})")


if __name__ == "__main__":
    main()
