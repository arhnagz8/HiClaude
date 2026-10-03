#!/usr/bin/env python3
"""Specialist 01 (card-providers): normalised all-in provider cost model.

Formulas (all USD, Decimal; customer-facing rounding is done elsewhere -- here we keep 6 dp):

  topup_cost(A)            = A * pct/100 + fixed_per_load
  newcard_cost(A)          = issue + topup_cost(A)            (issue fee assumed ADDITIVE to the load;
                                                               if a provider deducts it from the load the
                                                               customer-facing face value drops instead)
  all_in(A, new)           = A + (issue if new) + topup_cost(A) + network_fee_per_sweep/batch
  overhead_usd(A, new)     = all_in - A                       (what we pay on top of the face value)
  overhead_pct(A, new)     = overhead_usd / A * 100
  counterparty_loss(A,d)   = A * L_month * d/30               (expected loss from holding float d days;
                                                               L_month = sum_i p_i*(1-recovery_i), priors from
                                                               data/risk_register.json / docs 05 -- ASSUMPTIONS)

Inputs are SECONDARY / UNVERIFIED (see docs/03-research/01-card-providers.md). mpay's top-up % is NOT published:
central 3.0 % is the lead's placeholder; the sensitivity band is 0..5 %.
Run:  python3 scripts/research/01_provider_costs.py          (prints tables)
      imported by scripts/research/01_build_data.py          (writes data/providers.json)
"""
from decimal import Decimal as D, ROUND_HALF_UP
import json

AMOUNTS = [25, 50, 100, 500]
IRT_PER_USDT = D(256900)  # ~10 Mehr 1405, per docs/business-plan-full-context.md (perishable, illustration only)
NETWORK_FEE_USDT = D(1)   # exchange TRC20 withdrawal fee ~1 USDT (first-pass; specialist 02 owns the live value)

# Providers with at least one reported fee input. pct_known=False -> placeholder assumption.
PROVIDERS = {
    "mpay":       dict(issue=D("4.99"), min_load=D(25), pct=D("3.0"), pct_band=(D(0), D(5)), pct_known=False, fixed=D(0),
                       note="issue 4.99 + min load 25 reported by secondary sources; top-up % unpublished -> 3.0 % placeholder, band 0-5 %"),
    "pintopay":   dict(issue=D(35),     min_load=None,  pct=D("2.5"), pct_band=(D("2.0"), D("3.5")), pct_known=True, fixed=D("0.25"),
                       note="~35 issue, ~2.5 % load, ~0.25 'transaction' fee (ambiguous: per spend or per load; conservatively charged once per load)"),
    "virtcardpay":{"issue": D(3),       "min_load": None, "pct": D("4.0"), "pct_band": (D("3.5"), D("4.5")), "pct_known": True, "fixed": D(0),
                   "note": "Basic plan: 3 issue + ~4 % load; 0 % on purchases"},
    "wanttopay":  dict(issue=D(0),      min_load=None,  pct=D("3.0"), pct_band=(D(0), D(5)), pct_known=False, fixed=D("0.30"),
                       note="prepaid: free issue, 0.30 per transaction (charged once per load, conservative); load % not reported -> 3.0 % placeholder"),
    "anyxpay":    dict(issue=D(50),     min_load=None,  pct=D("4.0"), pct_band=(D("3.0"), D("5.0")), pct_known=True, fixed=D(0),
                       note="50 issue + 4 % (secondary); variable fees ignored"),
}

# Counterparty-loss priors (monthly), from docs/03-research/05-sanctions-counterparty-risk.md section 4.3 (judgemental)
PRIORS = {  # name: (p_month, recovery)
    "exit_scam":          (D("0.005"), D("0.05")),
    "account_freeze":     (D("0.018"), D("0.50")),
    "upstream_insolvency":(D("0.002"), D("0.60")),
    "geo_derisk":         (D("0.020"), D("0.50")),
}


def q(x, places="0.000001"):
    return x.quantize(D(places), rounding=ROUND_HALF_UP)


def topup_cost(p, A):
    return D(A) * p["pct"] / 100 + p["fixed"]


def overhead(p, A, new_card, batch=0, pct=None):
    pp = dict(p)
    if pct is not None:
        pp["pct"] = D(pct)
    c = topup_cost(pp, A) + (pp["issue"] if new_card else 0)
    if batch:
        c += NETWORK_FEE_USDT / D(batch)
    return c


def monthly_loss_rate():
    return sum(pm * (1 - rec) for pm, rec in PRIORS.values())


def counterparty_loss(A, days_held):
    return D(A) * monthly_loss_rate() * D(days_held) / 30


def table():
    out = {}
    for k, p in PROVIDERS.items():
        row = {}
        for A in AMOUNTS:
            for new in (False, True):
                key = f"{'newcard' if new else 'topup'}_{A}"
                base = overhead(p, A, new)
                lo = overhead(p, A, new, pct=p["pct_band"][0])
                hi = overhead(p, A, new, pct=p["pct_band"][1])
                net1 = overhead(p, A, new, batch=1)
                net10 = overhead(p, A, new, batch=10)
                row[key] = dict(
                    amount=A, new_card=new,
                    overhead_usd=q(base), overhead_pct=q(base / A * 100, "0.0001"),
                    overhead_usd_low=q(lo), overhead_usd_high=q(hi),
                    overhead_usd_incl_net_batch1=q(net1), overhead_usd_incl_net_batch10=q(net10),
                    all_in_usd=q(D(A) + base), overhead_irt=int((base * IRT_PER_USDT).quantize(D(1), rounding=ROUND_HALF_UP)),
                )
        out[k] = row
    return out


def mpay_sensitivity():
    p = PROVIDERS["mpay"]
    res = {}
    for pct in ("0", "1", "2", "3", "4", "5"):
        res[pct] = {f"newcard_{A}": q(overhead(p, A, True, pct=pct) / A * 100, "0.01") for A in AMOUNTS}
    return res


def loss_table():
    res = {}
    for d in (1, 3, 7, 14, 30):
        res[d] = {f"A{A}": q(counterparty_loss(A, d), "0.0001") for A in AMOUNTS}
    return res


def breakeven_min_ticket(max_overhead_pct, k="mpay"):
    """Smallest top-up A (new card) with overhead% <= max_overhead_pct:  (issue + A*pct + fixed)/A <= m  ->  A >= (issue+fixed)/(m - pct)."""
    p = PROVIDERS[k]
    m = D(max_overhead_pct) / 100
    r = p["pct"] / 100
    if m <= r:
        return None
    return q((p["issue"] + p["fixed"]) / (m - r), "0.01")


if __name__ == "__main__":
    print(f"monthly counterparty loss rate L = {q(monthly_loss_rate()*100,'0.0001')} % of float per month (priors, ASSUMPTION)")
    t = table()
    for k, row in t.items():
        print(f"\n== {k}: {PROVIDERS[k]['note']}")
        print(f"{'case':14}{'overhead$':>11}{'overhead%':>11}{'low$':>9}{'high$':>9}{'+net1$':>9}{'+net10$':>9}{'IRT':>12}")
        for key, r in row.items():
            print(f"{key:14}{r['overhead_usd']:>11}{r['overhead_pct']:>11}{r['overhead_usd_low']:>9}{r['overhead_usd_high']:>9}"
                  f"{r['overhead_usd_incl_net_batch1']:>9}{r['overhead_usd_incl_net_batch10']:>9}{r['overhead_irt']:>12,}")
    print("\n== mpay sensitivity: overhead % of face for NEW card + load, by assumed top-up %")
    for pct, r in mpay_sensitivity().items():
        print(pct, {k: str(v) for k, v in r.items()})
    print("\n== expected counterparty loss (USD) by days float is held (rows) and top-up size (cols)")
    for d, r in loss_table().items():
        print(d, {k: str(v) for k, v in r.items()})
    print("\n== smallest new-card ticket for overhead <= m (mpay, 3 % central):")
    for m in (10, 8, 6, 5):
        print(f"  <= {m}% -> A >= {breakeven_min_ticket(m)} USD")
    print("\nJSON dump:", json.dumps({"rate": str(IRT_PER_USDT)}))
