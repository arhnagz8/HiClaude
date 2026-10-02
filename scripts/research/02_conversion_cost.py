#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Brief 02 - all-in cost of turning Toman into "USDT credited at the provider", plus treasury/float formulas.

Reads parameters from data/exchanges.json (conversion_model per exchange + assumptions block) so the JSON stays the
single source of truth. All spreads are MODELLING ASSUMPTIONS (no live depth data was reachable); taker fees and
withdrawal fees are the documented/secondary figures with their conflicts recorded in the JSON.

Usage:
  python3 scripts/research/02_conversion_cost.py                # print markdown tables
  python3 scripts/research/02_conversion_cost.py --write        # also embed conversion_cost_table + treasury_worked_table in data/exchanges.json
  python3 scripts/research/02_conversion_cost.py --rate 300000  # re-run at another reference rate

Formulas (Q = USDT that must arrive at the provider, w = flat exchange withdrawal fee in USDT, s = ask premium over mid,
f = taker fee, R = reference mid IRT per USDT):
  qty_bought   = Q + w                              (the fee is taken out of what we bought)
  notional_irt = qty_bought * R * (1 + s)
  total_irt    = ceil(notional_irt * (1 + f))       (customer-side rounding does not apply: this is OUR cost, round up)
  premium_pct  = (total_irt / (Q * R) - 1) * 100
  decomposition (at mid): withdrawal = w*R ; spread = qty*R*s ; fee = qty*R*(1+s)*f ; sum + Q*R = total (before ceil)
Treasury (D = USDT outflow/day to providers, u = share of D funded by customer USDT inflows, L = lock days, g = safety days):
  D_c = D*(1-u);  B_day = D_c*R*(1+pi);  N_id = ceil(B_day / cap);  float_usdt = D_c*(L+g);  float_irt = float_usdt*R
  D_max(k) = k*cap / (R*(1+pi))   (USDT/day sustainable with k legitimately separate ID-deposit allowances)
"""
import argparse
import json
import math
import pathlib
from decimal import Decimal as D, getcontext, ROUND_CEILING

getcontext().prec = 40
ROOT = pathlib.Path(__file__).resolve().parents[2]
JSON_PATH = ROOT / "data" / "exchanges.json"

Q_GRID = [25, 100, 500, 2000]


def ceil_irt(x: D) -> int:
    return int(x.to_integral_value(rounding=ROUND_CEILING))


def all_in(Q, rate, spread_pct, taker_pct, wd_fee):
    Q, rate, wd_fee = D(str(Q)), D(str(rate)), D(str(wd_fee))
    s, f = D(str(spread_pct)) / 100, D(str(taker_pct)) / 100
    qty = Q + wd_fee
    notional = qty * rate * (1 + s)
    total_exact = notional * (1 + f)
    total = ceil_irt(total_exact)
    mid_cost = Q * rate
    comp_wd = wd_fee * rate
    comp_spread = qty * rate * s
    comp_fee = qty * rate * (1 + s) * f
    assert abs((mid_cost + comp_wd + comp_spread + comp_fee) - total_exact) < D("0.000001")
    return {
        "usdt_credited": float(Q),
        "usdt_bought": float(qty),
        "total_irt": total,
        "effective_irt_per_usdt": float(D(total) / Q),
        "premium_pct": float((D(total) / mid_cost - 1) * 100),
        "withdrawal_pct": float(comp_wd / mid_cost * 100),
        "spread_pct": float(comp_spread / mid_cost * 100),
        "fee_pct": float(comp_fee / mid_cost * 100),
    }


def load():
    return json.loads(JSON_PATH.read_text(encoding="utf-8"))


def val(rec):
    return None if rec is None else rec.get("value")


def build_rows(data, rate, cap):
    bench = val(data["assumptions"]["benchmark_trc20_withdraw_fee_usdt"])
    rows = []
    for ex in data["exchanges"]:
        cm = ex.get("conversion_model")
        if not cm:
            continue
        m = cm["value"]
        sdn = bool(val(ex.get("ofac_designated")))
        known = {k: v for k, v in (m.get("withdraw_fee_usdt") or {}).items() if v is not None}
        nets = []
        if "TRC20" in known:
            nets.append(("TRC20", known["TRC20"], "documented/secondary"))
        else:
            nets.append(("TRC20", bench["base"], "BENCHMARK (fee unknown; base of %s-%s)" % (bench["low"], bench["high"])))
        for n, w in known.items():
            if n != "TRC20":
                nets.append((n, w, "documented/secondary"))
        for net, w, basis in nets:
            for Q in Q_GRID:
                r = all_in(Q, rate, m["spread_pct"]["base"], m["taker_pct"]["base"], w)
                r.update({
                    "exchange": ex["id"], "ofac_designated": sdn, "network": net, "withdraw_fee_usdt": w, "withdraw_fee_basis": basis,
                    "taker_pct": m["taker_pct"]["base"], "spread_assumed_pct": m["spread_pct"]["base"],
                    "id_deposit_days_at_cap": math.ceil(r["total_irt"] / cap),
                })
                rows.append(r)
    return rows


def sensitivity_rows(data, rate, Qs=(100, 500)):
    bench = val(data["assumptions"]["benchmark_trc20_withdraw_fee_usdt"])
    out = []
    for ex in data["exchanges"]:
        cm = ex.get("conversion_model")
        if not cm:
            continue
        m = cm["value"]
        known = (m.get("withdraw_fee_usdt") or {}).get("TRC20")
        wd = {"low": known if known is not None else bench["low"], "base": known if known is not None else bench["base"], "high": known if known is not None else bench["high"]}
        for Q in Qs:
            row = {"exchange": ex["id"], "usdt_credited": Q, "wd_is_benchmark": known is None}
            for case in ("low", "base", "high"):
                r = all_in(Q, rate, m["spread_pct"][case], m["taker_pct"][case], wd[case])
                row[case + "_premium_pct"] = round(r["premium_pct"], 3)
            out.append(row)
    return out


def benchmark_grid(rate):
    rows = []
    for w in (0.8, 1.0, 2.0, 3.5):
        row = {"withdraw_fee_usdt": w}
        for Q in Q_GRID:
            r = all_in(Q, rate, 0.10, 0.25, w)
            row[f"Q{Q}_premium_pct"] = round(r["premium_pct"], 2)
        rows.append(row)
    return rows


def batch_rows(rate):
    rows = []
    for w in (0.8, 1.0, 2.0, 3.5):
        for Q in (25, 100):
            row = {"withdraw_fee_usdt": w, "order_usdt": Q}
            for k in (1, 5, 10, 20):
                r = all_in(Q * k, rate, 0.10, 0.25, w)
                row[f"orders_per_withdrawal_{k}_premium_pct"] = round(r["premium_pct"], 2)
            rows.append(row)
    return rows


def lock_buffer_rows(z=1.64, tau_days=3):
    rows = []
    for name, sig in (("calm", 0.5), ("base", 1.0), ("stress", 2.0)):
        rows.append({"regime": name, "daily_sigma_pct": sig, "tau_days": tau_days, "buffer_pct": round(z * sig * math.sqrt(tau_days), 2)})
    return rows


def cap_erosion_rows(cap):
    return [{"rate_irt_per_usdt": r, "cap_in_usdt": round(cap / r, 1)} for r in (150000, 200000, 257000, 350000, 500000)]


def treasury_rows(rate, cap, pi_pct, lock_days=3, safety_days=2):
    rows = []
    for Dd in (100, 250, 500, 1000, 3000, 10000):
        for u in (0.0, 0.3):
            Dc = Dd * (1 - u)
            B = D(str(Dc)) * D(str(rate)) * (1 + D(str(pi_pct)) / 100)
            N = math.ceil(B / D(str(cap)))
            F_usdt = Dc * (lock_days + safety_days)
            F_irt = D(str(F_usdt)) * D(str(rate))
            rows.append({
                "demand_usdt_per_day": Dd, "usdt_paid_share": u, "conversion_demand_usdt_per_day": Dc,
                "toman_to_deposit_per_day": ceil_irt(B), "id_deposit_allowances_needed_per_day": N,
                "float_usdt": F_usdt, "float_irt": ceil_irt(F_irt),
                "days_to_seed_float_with_1_allowance": math.ceil(F_irt / D(str(cap))),
                "days_to_seed_float_with_5_allowances": math.ceil(F_irt / (5 * D(str(cap)))),
                "days_to_seed_float_with_20_allowances": math.ceil(F_irt / (20 * D(str(cap)))),
            })
    return rows


def dmax_rows(rate, cap, pi_pct):
    per = D(str(cap)) / (D(str(rate)) * (1 + D(str(pi_pct)) / 100))
    return [{"allowances_k": k, "sustainable_usdt_per_day": round(float(per * k), 1), "approx_100usdt_orders_per_day": round(float(per * k) / 100, 2)} for k in (1, 2, 3, 5, 10, 20, 50)]


def fmt_int(n):
    return f"{int(n):,}"


def md_sections(rows, sens, bench, batch, lock, erosion, treas, dmax, rate, cap, pi_pct):
    """Return named markdown blocks (used by --section and by 02_render_doc.py)."""
    S = {}
    out = []
    out.append(f"**Reference mid R = {fmt_int(rate)} IRT/USDT; spreads are assumptions; \\* = withdrawal fee is the BENCHMARK (unknown for that venue); SDN = OFAC-designated venue.**\n")
    out.append("| Exchange | SDN | Net | w (USDT) | taker % | spread % (assumed) | $25 | $100 | $500 | $2000 |")
    out.append("|---|---|---|--:|--:|--:|--:|--:|--:|--:|")
    seen = []
    for r in rows:
        key = (r["exchange"], r["network"])
        if key in seen:
            continue
        seen.append(key)
        cells = []
        for Q in Q_GRID:
            rr = next(x for x in rows if x["exchange"] == r["exchange"] and x["network"] == r["network"] and x["usdt_credited"] == Q)
            cells.append(f"{rr['premium_pct']:.2f}% ({fmt_int(round(rr['effective_irt_per_usdt']))})")
        star = "\\*" if r["withdraw_fee_basis"].startswith("BENCHMARK") else ""
        out.append(f"| {r['exchange']} | {'SDN' if r['ofac_designated'] else '-'} | {r['network']} | {r['withdraw_fee_usdt']}{star} | {r['taker_pct']} | {r['spread_assumed_pct']} | " + " | ".join(cells) + " |")
    out.append("\nCell format: all-in premium over mid % (effective IRT paid per USDT credited).")
    S["cost_main"] = "\n".join(out)

    o = ["| Exchange | withdrawal fee % | spread % | trading fee % | total premium % | Toman for 100 USDT | ID-deposit days at 25M cap |", "|---|--:|--:|--:|--:|--:|--:|"]
    for r in rows:
        if r["usdt_credited"] == 100 and r["network"] == "TRC20":
            o.append(f"| {r['exchange']} | {r['withdrawal_pct']:.2f} | {r['spread_pct']:.2f} | {r['fee_pct']:.2f} | {r['premium_pct']:.2f} | {fmt_int(r['total_irt'])} | {r['id_deposit_days_at_cap']} |")
    S["decomp"] = "\n".join(o)

    o = ["| Q (USDT credited) | Toman needed (Nobitex-style costs, TRC20, w=1.0) | cap-days (one allowance) |", "|--:|--:|--:|"]
    for r in rows:
        if r["exchange"] == "nobitex" and r["network"] == "TRC20":
            o.append(f"| {r['usdt_credited']:.0f} | {fmt_int(r['total_irt'])} | {r['id_deposit_days_at_cap']} |")
    S["idays"] = "\n".join(o)

    o = ["| Exchange | Q | low | base | high | wd fee is benchmark? |", "|---|--:|--:|--:|--:|---|"]
    for x in sens:
        o.append(f"| {x['exchange']} | {x['usdt_credited']} | {x['low_premium_pct']} | {x['base_premium_pct']} | {x['high_premium_pct']} | {'yes' if x['wd_is_benchmark'] else 'no'} |")
    S["sens"] = "\n".join(o)

    o = ["| w (USDT) | $25 | $100 | $500 | $2000 |", "|--:|--:|--:|--:|--:|"]
    for b in bench:
        o.append(f"| {b['withdraw_fee_usdt']} | {b['Q25_premium_pct']} | {b['Q100_premium_pct']} | {b['Q500_premium_pct']} | {b['Q2000_premium_pct']} |")
    S["bench"] = "\n".join(o)

    o = ["| w (USDT) | order $ | k=1 | k=5 | k=10 | k=20 |", "|--:|--:|--:|--:|--:|--:|"]
    for b in batch:
        o.append(f"| {b['withdraw_fee_usdt']} | {b['order_usdt']} | {b['orders_per_withdrawal_1_premium_pct']} | {b['orders_per_withdrawal_5_premium_pct']} | {b['orders_per_withdrawal_10_premium_pct']} | {b['orders_per_withdrawal_20_premium_pct']} |")
    S["batch"] = "\n".join(o)

    o = ["| regime | sigma_d % (placeholder) | buffer % = 1.64 x sigma x sqrt(3) |", "|---|--:|--:|"]
    for l in lock:
        o.append(f"| {l['regime']} | {l['daily_sigma_pct']} | {l['buffer_pct']} |")
    S["lock"] = "\n".join(o)

    o = ["| R (IRT/USDT) | 25M IRT cap in USDT |", "|--:|--:|"]
    for e in erosion:
        o.append(f"| {fmt_int(e['rate_irt_per_usdt'])} | {e['cap_in_usdt']} |")
    S["erosion"] = "\n".join(o)

    o = [f"R={fmt_int(rate)}, bulk premium pi={pi_pct:.2f} %, lock L=3 d, safety g=2 d, cap={fmt_int(cap)} IRT per allowance per 24 h\n",
         "| D (USDT/day) | u (USDT-paid) | D_c | Toman/day to deposit | allowances/day | float USDT | float IRT | days to seed float: 1 / 5 / 20 allowances |",
         "|--:|--:|--:|--:|--:|--:|--:|---|"]
    for t in treas:
        o.append(f"| {t['demand_usdt_per_day']:,} | {int(t['usdt_paid_share']*100)}% | {t['conversion_demand_usdt_per_day']:,.0f} | {fmt_int(t['toman_to_deposit_per_day'])} | {t['id_deposit_allowances_needed_per_day']} | {t['float_usdt']:,.0f} | {fmt_int(t['float_irt'])} | {t['days_to_seed_float_with_1_allowance']} / {t['days_to_seed_float_with_5_allowances']} / {t['days_to_seed_float_with_20_allowances']} |")
    S["treasury"] = "\n".join(o)

    o = ["| k allowances | sustainable USDT/day | ~$100 orders/day |", "|--:|--:|--:|"]
    for d in dmax:
        o.append(f"| {d['allowances_k']} | {d['sustainable_usdt_per_day']} | {d['approx_100usdt_orders_per_day']} |")
    S["dmax"] = "\n".join(o)
    return S


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--rate", type=int, default=None)
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--quiet", action="store_true")
    ap.add_argument("--section", default=None, help="print only one named block: cost_main|decomp|idays|sens|bench|batch|lock|erosion|treasury|dmax")
    a = ap.parse_args()

    data = load()
    rate = a.rate or val(data["assumptions"]["reference_rate_irt_per_usdt"])
    cap = val(data["assumptions"]["id_deposit_cap_irt_per_24h"])

    rows = build_rows(data, rate, cap)
    sens = sensitivity_rows(data, rate)
    bench = benchmark_grid(rate)
    batch = batch_rows(rate)
    lock = lock_buffer_rows()
    erosion = cap_erosion_rows(cap)
    # bulk premium pi: tier-A taker 0.25 + spread 0.10 + withdrawal 1.0 USDT amortised over a 1,000 USDT sweep
    pi = all_in(1000, rate, 0.10, 0.25, 1.0)["premium_pct"]
    treas = treasury_rows(rate, cap, pi)
    dmax = dmax_rows(rate, cap, pi)

    secs = md_sections(rows, sens, bench, batch, lock, erosion, treas, dmax, rate, cap, pi)
    if a.section:
        print(secs[a.section])
    elif not a.quiet:
        for k, v in secs.items():
            print(f"\n<!-- {k} -->\n{v}")

    if a.write:
        data["conversion_cost_table"] = {
            "as_of": "2026-10-02",
            "generated_by": "scripts/research/02_conversion_cost.py",
            "confidence": "low",
            "derived": True,
            "note": "DERIVED from assumption records (conversion_model per exchange + assumptions). Spreads are assumptions; unknown withdrawal fees use the benchmark (rows flagged withdraw_fee_basis=BENCHMARK). Re-run after replacing assumptions with measured values.",
            "formula": "qty=Q+w; total_irt=ceil(qty*R*(1+s)*(1+f)); premium=(total/(Q*R)-1)*100",
            "reference_rate_irt_per_usdt": rate,
            "id_deposit_cap_irt_per_24h": cap,
            "rows": rows,
            "sensitivity_rows": sens,
            "benchmark_grid_rows": bench,
            "batching_rows": batch,
            "lock_buffer_rows": lock,
            "cap_erosion_rows": erosion,
        }
        data["treasury_worked_table"] = {
            "as_of": "2026-10-02",
            "generated_by": "scripts/research/02_conversion_cost.py",
            "confidence": "low",
            "derived": True,
            "note": "Formulas: D_c=D*(1-u); B_day=D_c*R*(1+pi); N=ceil(B_day/cap); float=D_c*(L+g); D_max(k)=k*cap/(R*(1+pi)). pi is the bulk premium (taker 0.25 %, spread 0.10 %, 1 USDT withdrawal fee amortised over a 1,000 USDT sweep). L=3 days (72 h lock, conservative per-deposit rolling), g=2 days safety.",
            "bulk_premium_pct": round(pi, 4),
            "lock_days": 3,
            "safety_days": 2,
            "rows": treas,
            "dmax_rows": dmax,
        }
        JSON_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        print(f"\n[wrote conversion_cost_table + treasury_worked_table into {JSON_PATH}]")


if __name__ == "__main__":
    main()
