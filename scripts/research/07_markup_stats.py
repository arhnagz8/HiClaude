#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
07_markup_stats.py - calculations for research brief 07 (competitor benchmark, Iran).

Reads data/competitors.json (and, if present, data/raw/competitor_observations.csv) and computes

  1. effective markup of Toman price observations vs USD parity
        markup_pct = (price_irt / (usd_face * fx_rate_same_day) - 1) * 100
  2. explicit fee % curves of the fee structures at reference order sizes
        fee_pct(N) = 100 * fee_usd(N) / N
  3. our modelled cost floor (the lead's scripts/pricing_model.py at zero margin) vs the visible competitor levels
        headroom_pp = competitor_level_pct - our_break_even_pct
  4. positioning-claim frequencies in competitor page titles (regex counts)
  5. elasticity identities: Lerner inversion |e| = 1/m, logit share response to an undercut
        s' = s*x / (1 - s + s*x),   x = exp(|e| / (1 - s) * d)
  6. bottom-up market-size model: GMV = sum_s N_s * U_s * r_s (deterministic bounds, seeded Monte Carlo with correlated split-lognormal inputs, tornado)

Everything here is either computed from observations (families 1-3) or from clearly flagged ASSUMPTIONS (5-6).
Nothing is a forecast. Re-run after adding observations.

Usage:
    python3 scripts/research/07_markup_stats.py                 # print tables
    python3 scripts/research/07_markup_stats.py --write         # also refresh derived blocks in data/competitors.json
    python3 scripts/research/07_markup_stats.py --seed 7 --draws 20000

No numpy: pure standard library, deterministic (seeded random.Random; no wall-clock dependence).
"""
from __future__ import annotations

import argparse
import csv
import importlib.util
import json
import math
import random
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
JSON_PATH = ROOT / "data" / "competitors.json"
CSV_PATH = ROOT / "data" / "raw" / "competitor_observations.csv"
SCRIPT_REF = {"url": "scripts/research/07_markup_stats.py", "title": "derived from data/competitors.json observations and assumptions"}


# ----------------------------------------------------------------------------- generic helpers
def V(rec):
    """Value of a Record (or a plain number)."""
    return rec["value"] if isinstance(rec, dict) and "value" in rec else rec


def percentile(xs, q):
    """Linear-interpolation percentile (same convention as numpy default). q in [0, 100]."""
    s = sorted(xs)
    n = len(s)
    if n == 0:
        return None
    if n == 1:
        return s[0]
    k = (n - 1) * q / 100.0
    f, c = math.floor(k), math.ceil(k)
    if f == c:
        return s[int(k)]
    return s[f] + (s[c] - s[f]) * (k - f)


def summarise(xs):
    n = len(xs)
    if n == 0:
        return {"n": 0}
    return {
        "n": n,
        "min": min(xs),
        "p10": percentile(xs, 10),
        "p25": percentile(xs, 25),
        "median": percentile(xs, 50),
        "p75": percentile(xs, 75),
        "p90": percentile(xs, 90),
        "max": max(xs),
        "mean": sum(xs) / n,
        "iqr": percentile(xs, 75) - percentile(xs, 25),
    }


def r2(x, nd=2):
    return None if x is None else round(x, nd)


def fmt_pct(x):
    return "n/a" if x is None else f"{x:.2f}"


def fmt_int(x):
    return "n/a" if x is None else f"{x:,.0f}"


# ----------------------------------------------------------------------------- loading
def load_json(path=JSON_PATH):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def load_pricing_model():
    spec = importlib.util.spec_from_file_location("pricing_model", ROOT / "scripts" / "pricing_model.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def read_csv_observations(ref_fx, ref_usdt, ref_date):
    """Optional first-hand observations (mystery-shopper CSV). Returns (rows, warnings)."""
    rows, warns = [], []
    if not CSV_PATH.exists():
        return rows, warns
    with CSV_PATH.open(encoding="utf-8", newline="") as fh:
        for i, row in enumerate(csv.DictReader(fh), start=2):
            try:
                usd = float(row["usd_face"])
                price = float(row["price_irt"])
            except (KeyError, ValueError, TypeError):
                warns.append(f"csv line {i}: usd_face/price_irt not numeric, skipped")
                continue
            fx = None
            raw_fx = (row.get("fx_rate_irt_per_usd") or "").strip()
            if raw_fx:
                try:
                    fx = float(raw_fx)
                except ValueError:
                    fx = None
            if fx is None and (row.get("date") or "").strip() == ref_date:
                fx = ref_usdt if (row.get("fx_basis") or "").strip() == "usdt" else ref_fx
            if fx is None:
                warns.append(f"csv line {i}: no same-day fx rate, skipped")
                continue
            rows.append({"id": f"csv-{i}", "family": (row.get("family") or "").strip(), "usd_face": usd, "price_irt": price,
                         "fx": fx, "competitor_id": (row.get("competitor_id") or "").strip(), "include": True, "tier": "csv"})
    return rows, warns


# ----------------------------------------------------------------------------- 1. markups
def markup_pct(price_irt, usd_face, fx):
    return (price_irt / (usd_face * fx) - 1.0) * 100.0


def collect_observations(data, csv_rows):
    obs = []
    for o in data["price_observations"]:
        obs.append({"id": o["id"], "family": o["family"], "usd_face": o["usd_face"], "price_irt": V(o["price_irt"]),
                    "fx": o["fx_rate_same_day"], "include": bool(o["include_in_stats"]), "tier": o.get("tier", ""), "competitor_id": None})
    obs.extend(csv_rows)
    for o in obs:
        o["markup_pct"] = markup_pct(o["price_irt"], o["usd_face"], o["fx"])
        o["parity_irt"] = o["usd_face"] * o["fx"]
    return obs


# ----------------------------------------------------------------------------- 2. fee structures
def tier_of(tiers, n):
    for t in tiers:
        lo = t["min_usd"] if t.get("min_usd") is not None else 0
        hi = t["max_usd"] if t.get("max_usd") is not None else math.inf
        if lo <= n < hi:
            return t
    return None


def fee_pct(fs, n_usd, new_card=False, include_fx=False):
    """Explicit fee as % of the USD notional for one fee structure. None if not defined at that size."""
    sid = fs["id"]
    if sid == "fee-dollarisho-card":
        p = fs["params"]
        if n_usd < V(p["min_load_usd"]):
            return None
        fee = (V(p["issue_usd"]) if new_card else 0.0) + n_usd * V(p["payment_fee_pct"]) / 100.0
        if include_fx:
            fee += n_usd * V(p["fx_conversion_pct"]) / 100.0
        return 100.0 * fee / n_usd
    if sid == "fee-tehrancreditcard-fx":
        t = tier_of(fs["tiers"], n_usd)
        return None if t is None else V(t["own_fee_pct"]) + V(t["remittance_fee_pct"])
    if sid == "fee-almas-card":
        t = tier_of(fs["tiers"], n_usd)
        return None if t is None else 100.0 * V(t["fixed_fee_usd"]) / n_usd
    return None


REF_SIZES = [20, 50, 100, 250, 500, 1000, 3000]


def fee_curves(data):
    out = {}
    for fs in data["fee_structures"]:
        if fs["id"] in ("fee-dollarisho-card", "fee-tehrancreditcard-fx", "fee-almas-card"):
            out[fs["id"]] = {n: fee_pct(fs, n) for n in REF_SIZES}
    # variants
    dol = next(f for f in data["fee_structures"] if f["id"] == "fee-dollarisho-card")
    out["fee-dollarisho-card+fx"] = {n: fee_pct(dol, n, include_fx=True) for n in REF_SIZES}
    out["fee-dollarisho-card (new card)"] = {n: fee_pct(dol, n, new_card=True) for n in REF_SIZES}
    return out


def pm_spreads(data):
    fs = next(f for f in data["fee_structures"] if f["id"] == "fee-pm-spreads")
    rows = []
    for q in fs["quotes"]:
        buy, sell = V(q["user_buy_irt"]), V(q["user_sell_irt"])
        rows.append({"seller": q["seller"], "user_buy": buy, "user_sell": sell, "spread_pct": (buy / sell - 1.0) * 100.0})
    return rows


# ----------------------------------------------------------------------------- 3. our cost floor
def our_floor(pm, topup_usd, new_card, fx_usd):
    sc = pm.Scenario("floor", topup_usd, new_card, 0.0)  # zero margin => price == total cost
    r = pm.price_order(sc)
    cost = r["total_cost_toman"]
    return {"topup_usd": topup_usd, "new_card": new_card, "cost_irt": cost,
            "break_even_markup_pct": (cost / (topup_usd * fx_usd) - 1.0) * 100.0,
            "cost_per_usd": cost / topup_usd}


def our_priced(pm, topup_usd, new_card, margin, rush=False, rush_prem=0.0, fx_usd=1.0):
    sc = pm.Scenario("priced", topup_usd, new_card, margin, rush=rush, rush_premium=rush_prem)
    r = pm.price_order(sc)
    return {"price_irt": r["price_toman"], "markup_pct": (r["price_toman"] / (topup_usd * fx_usd) - 1.0) * 100.0}


def floor_with(pm, topup_usd, new_card, fx_usd, provider_fee=None, risk=None):
    """Break-even markup vs free USD with overridden provider top-up fee / risk buffer (restores the model's constants)."""
    old = (pm.MPAY_TOPUP_FEE, pm.RISK_BUFFER)
    try:
        if provider_fee is not None:
            pm.MPAY_TOPUP_FEE = provider_fee
        if risk is not None:
            pm.RISK_BUFFER = risk
        return our_floor(pm, topup_usd, new_card, fx_usd)["break_even_markup_pct"]
    finally:
        pm.MPAY_TOPUP_FEE, pm.RISK_BUFFER = old


def required_provider_fee(pm, topup_usd, new_card, fx_usd, target_pct, risk=None):
    """Provider top-up fee (as a fraction) at which our break-even markup equals target_pct (bisection)."""
    lo, hi = -0.10, 0.20
    for _ in range(80):
        mid = (lo + hi) / 2.0
        if floor_with(pm, topup_usd, new_card, fx_usd, provider_fee=mid, risk=risk) > target_pct:
            hi = mid
        else:
            lo = mid
    return (lo + hi) / 2.0


# ----------------------------------------------------------------------------- 4. title claims
def norm_fa(s):
    s = s.replace("‌", "").replace("​", "").replace("ي", "ی").replace("ك", "ک")
    return s.lower()


CLAIMS = [
    ("instant_or_fast", r"(آنی|فوری|سریع|instant)"),
    ("cheap_or_discount", r"(ارزان|کمترین|کم ترین|پایین ترین|تخفیف)"),
    ("fee_mentioned", r"(کارمزد)"),
    ("guarantee", r"(ضمانت)"),
    ("authentic_trusted", r"(اورجینال|معتبر|قانونی)"),
    ("reloadable", r"(قابل شارژ)"),
    ("dedicated_private", r"(اختصاصی)"),
    ("wallet_pay_support", r"(اپلپی|گوگلپی|اپل پی|گوگل پی)"),
]


def title_claims(data):
    seg_of = {c["id"]: c["segments"] for c in data["competitors"] + data.get("named_only", [])}
    groups = {"cards_fx": 0, "subscription": 0, "gift_card": 0, "other": 0}
    counts = {k: {"all": 0, "cards_fx": 0, "subscription": 0, "gift_card": 0, "other": 0} for k, _ in CLAIMS}
    titles = data["positioning_titles"]
    for t in titles:
        segs = set(seg_of.get(t["competitor_id"], []))
        if "subscription" in segs:
            g = "subscription"
        elif "gift_card" in segs and not (segs & {"virtual_card", "fx_payment"}):
            g = "gift_card"
        elif segs & {"virtual_card", "fx_payment", "freelancer_cashout", "exam_embassy", "pm_digital_dollar", "crypto_exchange", "physical_card"}:
            g = "cards_fx"
        else:
            g = "other"
        groups[g] += 1
        text = norm_fa(t["title"])
        for key, pat in CLAIMS:
            if re.search(pat, text):
                counts[key]["all"] += 1
                counts[key][g] += 1
    return len(titles), groups, counts


# ----------------------------------------------------------------------------- 5. elasticity grids
def share_after_undercut(s, eps_abs, d):
    x = math.exp(eps_abs / (1.0 - s) * d)
    return s * x / (1.0 - s + s * x)


def elasticity_grids(data):
    margins = [0.02, 0.03, 0.05, 0.08, 0.12]
    lerner = [{"margin_pct": m * 100, "implied_abs_elasticity": 1.0 / m} for m in margins]
    grid = []
    for s in (0.05, 0.10, 0.20):
        for eps in (2, 5, 10, 20, 33):
            row = {"baseline_share": s, "abs_elasticity": eps}
            for d in (0.02, 0.05, 0.08):
                row[f"x_share_after_{int(d * 100)}pct_undercut"] = share_after_undercut(s, eps, d) / s
            grid.append(row)
    segs = data["elasticity"]["segment_priors"]
    blend = []
    for s in (0.05, 0.10, 0.20):
        row = {"baseline_share": s}
        for d in (0.02, 0.05, 0.08):
            mult = 0.0
            for sg in segs:
                w = V(sg["share"])["base"]
                e = abs(V(sg["elasticity_firm"]))
                mult += w * share_after_undercut(s, e, d) / s
            row[f"blended_x_share_after_{int(d * 100)}pct_undercut"] = mult
        blend.append(row)
    return {"lerner_inversion": lerner, "logit_share_multiplier": grid, "blended_segment_response": blend}


# ----------------------------------------------------------------------------- 6. market size
def seg_gmv(seg, which):
    return V(seg["buyers"])[which] * V(seg["spend_usd"])[which] * V(seg["intermediary_share"])[which]


Z90 = 1.2815515655446004  # standard-normal 90th percentile


def split_lognormal(z, low, base, high):
    """Input with p10 = low, median = base, p90 = high (log-space split normal). z ~ N(0,1)."""
    if z < 0:
        return base * math.exp(math.log(base / low) / Z90 * z)
    return base * math.exp(math.log(high / base) / Z90 * z)


def market_model(data, seed, draws, rho=0.5):
    ms = data["market_size"]
    segs = ms["assumptions"]
    det = {w: sum(seg_gmv(s, w) for s in segs) for w in ("low", "base", "high")}
    seg_base = {s["id"]: seg_gmv(s, "base") for s in segs}
    orders_base = sum(seg_gmv(s, "base") / V(s["aov_usd"]) for s in segs) / 365.0

    rng = random.Random(seed)
    a, b = math.sqrt(rho), math.sqrt(1.0 - rho)
    take = V(ms["take_rate_pct"])
    share = V(ms["entrant_share_of_gmv"])
    gmv_draws, rev_draws, ord_draws, ent_draws = [], [], [], []
    for _ in range(draws):
        zc = {"buyers": rng.gauss(0, 1), "spend_usd": rng.gauss(0, 1), "intermediary_share": rng.gauss(0, 1)}  # common factors
        g, o = 0.0, 0.0
        for s in segs:
            vals = {}
            for param in ("buyers", "spend_usd", "intermediary_share"):
                t = V(s[param])
                z = a * zc[param] + b * rng.gauss(0, 1)
                x = split_lognormal(z, t["low"], t["base"], t["high"])
                vals[param] = min(x, 0.99) if param == "intermediary_share" else x
            gs = vals["buyers"] * vals["spend_usd"] * vals["intermediary_share"]
            g += gs
            o += gs / V(s["aov_usd"])
        tr = split_lognormal(rng.gauss(0, 1), take["low"], take["base"], take["high"]) / 100.0
        es = split_lognormal(rng.gauss(0, 1), share["low"], share["base"], share["high"])
        gmv_draws.append(g)
        rev_draws.append(g * tr)
        ord_draws.append(o / 365.0)
        ent_draws.append(g * es)
    q = lambda xs: {"p10": percentile(xs, 10), "p50": percentile(xs, 50), "p90": percentile(xs, 90)}

    # tornado: one segment at a time low->high, others at base
    base_total = det["base"]
    tornado = []
    for s in segs:
        lo = base_total - seg_gmv(s, "base") + seg_gmv(s, "low")
        hi = base_total - seg_gmv(s, "base") + seg_gmv(s, "high")
        tornado.append({"segment": s["id"], "gmv_if_segment_low": lo, "gmv_if_segment_high": hi, "swing": hi - lo})
    tornado.sort(key=lambda r: -r["swing"])

    def param_swing(param):
        lo = hi = 0.0
        for s in segs:
            vals = {"buyers": V(s["buyers"]), "spend_usd": V(s["spend_usd"]), "intermediary_share": V(s["intermediary_share"])}
            bb = {k: v["base"] for k, v in vals.items()}
            l, h = dict(bb), dict(bb)
            l[param], h[param] = vals[param]["low"], vals[param]["high"]
            lo += l["buyers"] * l["spend_usd"] * l["intermediary_share"]
            hi += h["buyers"] * h["spend_usd"] * h["intermediary_share"]
        return {"parameter": param, "gmv_all_segments_low": lo, "gmv_all_segments_high": hi, "swing": hi - lo}

    by_param = sorted([param_swing(p) for p in ("buyers", "spend_usd", "intermediary_share")], key=lambda r: -r["swing"])
    return {"deterministic": det, "segments_base": seg_base, "orders_per_day_base": orders_base,
            "mc": {"gmv": q(gmv_draws), "revenue_pool": q(rev_draws), "orders_per_day": q(ord_draws), "entrant_gmv": q(ent_draws)},
            "tornado_segments": tornado, "tornado_params": by_param, "seed": seed, "draws": draws, "rho": rho}


# ----------------------------------------------------------------------------- record builders for --write
def make_rec(as_of, value, unit, note=None, verify=None, status=None, conf="low"):
    d = {"value": value, "unit": unit, "as_of": as_of, "confidence": conf, "sources": [SCRIPT_REF]}
    if value is None:
        d["status"] = "UNVERIFIED"
        d["verify_how"] = verify or "Collect first-hand observations (mystery-shopper protocol in the research doc) and re-run the script."
    elif status:
        d["status"] = status
    if note:
        d["note"] = note
    return d


def family_stat_block(as_of, name, metric, xs, unit="pct", extra_note=None, min_n=3):
    s = summarise(xs)
    flag = "n<8: indicative only; do not treat quantiles as a distribution" if s["n"] < 8 else "n>=8"
    base_note = f"{metric}. {flag}." + (f" {extra_note}" if extra_note else "")
    if s["n"] < min_n:
        verify = "Collect >= 8 same-day competitor quotes for this family and re-run 07_markup_stats.py."
        blk = {"metric": metric, "n": s["n"], "sample_flag": flag,
               "median": make_rec(as_of, None, unit, base_note, verify), "p10": make_rec(as_of, None, unit, base_note, verify),
               "p90": make_rec(as_of, None, unit, base_note, verify), "iqr": make_rec(as_of, None, unit, base_note, verify)}
        if s["n"] > 0:
            blk["observed_values"] = [r2(x) for x in sorted(xs)]
        return blk
    blk = {"metric": metric, "n": s["n"], "sample_flag": flag,
           "median": make_rec(as_of, r2(s["median"]), unit, base_note, status="reported"),
           "p10": make_rec(as_of, r2(s["p10"]), unit, base_note, status="reported"),
           "p90": make_rec(as_of, r2(s["p90"]), unit, base_note, status="reported"),
           "iqr": make_rec(as_of, r2(s["iqr"]), unit, base_note, status="reported"),
           "min": r2(s["min"]), "max": r2(s["max"]), "observed_values": [r2(x) for x in sorted(xs)]}
    return blk


# ----------------------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", default=str(JSON_PATH))
    ap.add_argument("--write", action="store_true", help="refresh derived blocks in the JSON file")
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--draws", type=int, default=20000)
    ap.add_argument("--rho", type=float, default=0.5, help="correlation of inputs across segments (common factor)")
    args = ap.parse_args()

    data = load_json(args.json)
    rr = data["reference_rates"]
    fx_usd = V(rr["usd_free_market_irt"])
    fx_usdt = V(rr["usdt_irt"])
    as_of = rr["usd_free_market_irt"]["as_of"]
    pm = load_pricing_model()

    print(f"# 07 competitor benchmark - computed tables (reference date {as_of}; USD free {fx_usd:,.0f} T; USDT {fx_usdt:,.0f} T)\n")

    # ---------------------------------------------------------------- 1. markups
    csv_rows, warns = read_csv_observations(fx_usd, fx_usdt, as_of)
    for w in warns:
        print(f"WARNING: {w}", file=sys.stderr)
    obs = collect_observations(data, csv_rows)
    print("## 1. Price observations vs USD parity (price / (USD face x same-day free USD) - 1)\n")
    print("| id | family | tier | USD face | price (T) | parity (T) | markup % | in stats |")
    print("|---|---|---|---:|---:|---:|---:|---|")
    for o in obs:
        print(f"| {o['id']} | {o['family']} | {o['tier']} | {o['usd_face']:.0f} | {o['price_irt']:,.0f} | {o['parity_irt']:,.0f} | {o['markup_pct']:+.2f} | {'yes' if o['include'] else 'no'} |")
    families = {}
    for o in obs:
        if o["include"]:
            families.setdefault(o["family"], []).append(o["markup_pct"])
    print("\n### Family statistics (included observations only)\n")
    print("| family | n | min | p10 | p25 | median | p75 | p90 | max | IQR |")
    print("|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|")
    for fam, xs in sorted(families.items()):
        s = summarise(xs)
        print(f"| {fam} | {s['n']} | {fmt_pct(s['min'])} | {fmt_pct(s['p10'])} | {fmt_pct(s['p25'])} | {fmt_pct(s['median'])} | {fmt_pct(s['p75'])} | {fmt_pct(s['p90'])} | {fmt_pct(s['max'])} | {fmt_pct(s['iqr'])} |")
    excl = [o for o in obs if not o["include"] and o["family"] == "ai_subscription_plus"]
    if excl:
        print("\nExcluded Plus observations (different product class / stale): " + ", ".join(f"{o['id']} ({o['markup_pct']:+.1f}%)" for o in excl))

    # ---------------------------------------------------------------- 2. fee curves
    print("\n## 2. Explicit fee as % of USD notional by order size (existing card / load only)\n")
    curves = fee_curves(data)
    print("| structure | " + " | ".join(f"${n}" for n in REF_SIZES) + " |")
    print("|---|" + "---:|" * len(REF_SIZES))
    for sid, row in curves.items():
        print(f"| {sid} | " + " | ".join(fmt_pct(row[n]) for n in REF_SIZES) + " |")
    print("\nNotes: Dollarisho 4% is the payment fee; '+fx' adds the 2.99% conversion fee; '(new card)' adds the USD 10 issuance. Almas shows only the fixed fee ($18 below $1000, $50 from $1000; boundary assumed at >=1000) and excludes the unobserved house-rate markup and the 1% (max $5) usage fee. Tehran Credit Card is undefined below $1000 (not found).")
    spreads = pm_spreads(data)
    print("\n### Perfect Money round-trip spreads (undated quotes)\n")
    print("| seller | user buys at | user sells at | round-trip spread % |")
    print("|---|---:|---:|---:|")
    for r in spreads:
        print(f"| {r['seller']} | {r['user_buy']:,.0f} | {r['user_sell']:,.0f} | {r['spread_pct']:.2f} |")

    # ---------------------------------------------------------------- 3. our floor vs competitors
    print("\n## 3. Our modelled cost floor (lead's pricing model, zero margin) vs visible competitor levels\n")
    print(f"Model constants: mpay top-up fee {pm.MPAY_TOPUP_FEE*100:.1f}% (assumed), issue ${pm.CARD_ISSUE_USD}, exchange fee {pm.EXCHANGE_TRADE_FEE*100:.2f}% + spread {pm.EXCHANGE_SPREAD*100:.2f}%, network fee {pm.NETWORK_FEE_USDT} USDT, collection {pm.RIAL_COLLECTION_FEE*100:.1f}%, risk buffer {pm.RISK_BUFFER*100:.1f}%, operator {pm.OPERATOR_COST_TOMAN:,} T/order, USDT {pm.USDT_TOMAN:,} T.\n")
    floors = []
    print("| order | new card | cost (T) | cost per USD (T) | break-even markup vs free USD % |")
    print("|---|---|---:|---:|---:|")
    for usd, new in [(20, False), (20, True), (50, False), (100, False), (500, False), (1000, False)]:
        f = our_floor(pm, usd, new, fx_usd)
        floors.append(f)
        print(f"| ${usd} | {'yes' if new else 'no'} | {f['cost_irt']:,.0f} | {f['cost_per_usd']:,.0f} | {f['break_even_markup_pct']:+.2f} |")
    plus_floor = next(f for f in floors if f["topup_usd"] == 20 and not f["new_card"])
    plus_stats = summarise(families.get("ai_subscription_plus", []))
    plus_priced = our_priced(pm, 20, False, 0.15, fx_usd=fx_usd)
    print(f"\nChatGPT Plus (USD 20, existing card): break-even {plus_floor['cost_irt']:,.0f} T = {plus_floor['break_even_markup_pct']:+.2f}% vs parity; at the model's 15% margin the price is {plus_priced['price_irt']:,.0f} T = {plus_priced['markup_pct']:+.2f}% vs parity.")
    if plus_stats["n"]:
        print(f"Observed official-like Plus markups: min {plus_stats['min']:+.2f}%, median {plus_stats['median']:+.2f}%, max {plus_stats['max']:+.2f}% (n={plus_stats['n']}).")
    lowest_plus_price = min(o["price_irt"] for o in obs if o["include"] and o["family"] == "ai_subscription_plus")
    print(f"Lowest included Plus price {lowest_plus_price:,.0f} T vs our break-even {plus_floor['cost_irt']:,.0f} T: {100*(lowest_plus_price/plus_floor['cost_irt']-1):+.2f}% (negative = below our cost).")

    headroom = []
    def hr(name, comp_level, floor_pct, comp_basis):
        headroom.append({"family": name, "competitor_visible_level_pct": comp_level, "our_break_even_pct": floor_pct, "headroom_pp": comp_level - floor_pct, "basis": comp_basis})
    f100 = next(f for f in floors if f["topup_usd"] == 100)
    f1000 = next(f for f in floors if f["topup_usd"] == 1000)
    f500 = next(f for f in floors if f["topup_usd"] == 500)
    dol100 = curves["fee-dollarisho-card"][100]
    dol1000 = curves["fee-dollarisho-card"][1000]
    tcc1000 = curves["fee-tehrancreditcard-fx"][1000]
    almas1000 = curves["fee-almas-card"][1000]
    hr("card load USD 100 (Dollarisho 4%, rate=market)", dol100, f100["break_even_markup_pct"], "explicit fee only; competitor rate markup unobserved (assumed 0)")
    hr("card load USD 500 (Dollarisho 4%, rate=market)", curves["fee-dollarisho-card"][500], f500["break_even_markup_pct"], "explicit fee only")
    hr("card load USD 1000 (cheapest of the three)", min(dol1000, tcc1000, almas1000), f1000["break_even_markup_pct"], "min of Dollarisho 4.0 / Almas 5.0 / TCC 6.0")
    hr("card load USD 1000 (median of the three)", percentile([dol1000, tcc1000, almas1000], 50), f1000["break_even_markup_pct"], "median of 4.0 / 5.0 / 6.0")
    if plus_stats["n"]:
        hr("ChatGPT Plus (lowest official-like price)", plus_stats["min"], plus_floor["break_even_markup_pct"], "price vs parity")
        hr("ChatGPT Plus (median official-like price)", plus_stats["median"], plus_floor["break_even_markup_pct"], "price vs parity")
    print("\n| family / competitor reference | competitor visible level % | our break-even % | headroom pp (negative = we lose money if we match) |")
    print("|---|---:|---:|---:|")
    for h in headroom:
        print(f"| {h['family']} | {h['competitor_visible_level_pct']:+.2f} | {h['our_break_even_pct']:+.2f} | {h['headroom_pp']:+.2f} |")

    # ---------------------------------------------------------------- 3b. floor sensitivity
    print("\n### 3b. Sensitivity of our break-even markup (USD 100 load, existing card) to the provider top-up fee and risk buffer\n")
    print("| provider top-up fee | risk 0% | risk 1% | risk 2% (model) |")
    print("|---:|---:|---:|---:|")
    sens_rows = []
    for pf in (0.0, 0.01, 0.02, 0.03, 0.04):
        vals = [floor_with(pm, 100, False, fx_usd, provider_fee=pf, risk=rk) for rk in (0.0, 0.01, 0.02)]
        sens_rows.append({"provider_fee_pct": pf * 100, "break_even_risk0": r2(vals[0]), "break_even_risk1": r2(vals[1]), "break_even_risk2": r2(vals[2])})
        print(f"| {pf*100:.0f}% | {vals[0]:+.2f} | {vals[1]:+.2f} | {vals[2]:+.2f} |")
    print("\nProvider top-up fee at which our break-even equals a competitor's visible explicit fee (USD 100 load, existing card):\n")
    print("| target markup % | required provider fee, risk 2% (model) | required provider fee, risk 0% |")
    print("|---:|---:|---:|")
    req_rows = []
    for tgt in (4.0, 5.0, 6.0, 7.0):
        a1 = required_provider_fee(pm, 100, False, fx_usd, tgt)
        a2 = required_provider_fee(pm, 100, False, fx_usd, tgt, risk=0.0)
        req_rows.append({"target_markup_pct": tgt, "required_provider_fee_pct_risk2": r2(a1 * 100), "required_provider_fee_pct_risk0": r2(a2 * 100)})
        print(f"| {tgt:.0f} | {a1*100:.2f}% | {a2*100:.2f}% |")
    nc = [our_floor(pm, u, True, fx_usd) for u in (50, 100, 250, 500)]
    print("\nEntry basket (new card + load), our break-even vs free USD on the load amount:\n")
    print("| load | our break-even % (new card) | Dollarisho explicit fee % incl. USD 10 issuance |")
    print("|---:|---:|---:|")
    entry_rows = []
    for f in nc:
        dn = curves["fee-dollarisho-card (new card)"].get(f["topup_usd"])
        entry_rows.append({"load_usd": f["topup_usd"], "our_break_even_pct": r2(f["break_even_markup_pct"]), "dollarisho_new_card_fee_pct": r2(dn)})
        print(f"| ${f['topup_usd']} | {f['break_even_markup_pct']:+.2f} | {fmt_pct(dn)} |")

    # ---------------------------------------------------------------- 4. title claims
    print("\n## 4. Positioning claims in competitor page titles\n")
    n_titles, groups, counts = title_claims(data)
    print(f"Titles analysed: {n_titles} (cards/FX {groups['cards_fx']}, subscription {groups['subscription']}, gift card {groups['gift_card']}, other {groups['other']}). Titles are as listed by the search engine on the reference date.\n")
    print("| claim | all | cards/FX | subscription | gift card | share of all titles % |")
    print("|---|---:|---:|---:|---:|---:|")
    for key, _ in CLAIMS:
        c = counts[key]
        print(f"| {key} | {c['all']} | {c['cards_fx']} | {c['subscription']} | {c['gift_card']} | {100*c['all']/n_titles:.0f} |")

    # ---------------------------------------------------------------- 5. elasticity
    print("\n## 5. Elasticity identities (assumption-driven; not estimates)\n")
    grids = elasticity_grids(data)
    print("Lerner inversion |e| = 1/m for a profit-maximising seller with net margin m over marginal cost:\n")
    print("| m % | implied |e| |")
    print("|---:|---:|")
    for r in grids["lerner_inversion"]:
        print(f"| {r['margin_pct']:.0f} | {r['implied_abs_elasticity']:.1f} |")
    print("\nShare multiplier (s'/s) after an undercut, logit with outside option (baseline share 10%):\n")
    print("| |e| | 2% undercut | 5% undercut | 8% undercut |")
    print("|---:|---:|---:|---:|")
    for r in grids["logit_share_multiplier"]:
        if abs(r["baseline_share"] - 0.10) < 1e-9:
            print(f"| {r['abs_elasticity']} | {r['x_share_after_2pct_undercut']:.2f}x | {r['x_share_after_5pct_undercut']:.2f}x | {r['x_share_after_8pct_undercut']:.2f}x |")
    print("\nBlended response under the three segment priors (deal 30% x e=20, balanced 40% x e=8, trust-led 30% x e=2):\n")
    print("| baseline share | 2% undercut | 5% undercut | 8% undercut |")
    print("|---:|---:|---:|---:|")
    for r in grids["blended_segment_response"]:
        print(f"| {r['baseline_share']:.2f} | {r['blended_x_share_after_2pct_undercut']:.2f}x | {r['blended_x_share_after_5pct_undercut']:.2f}x | {r['blended_x_share_after_8pct_undercut']:.2f}x |")

    # ---------------------------------------------------------------- 6. market size
    print("\n## 6. Bottom-up market-size model (assumptions A1-A7; MODEL OUTPUT, not observation)\n")
    mm = market_model(data, args.seed, args.draws, args.rho)
    print("| segment | buyers (low/base/high) | USD per buyer-year | intermediary share | GMV base USD m |")
    print("|---|---|---|---|---:|")
    for s in data["market_size"]["assumptions"]:
        b, u, r = V(s["buyers"]), V(s["spend_usd"]), V(s["intermediary_share"])
        print(f"| {s['id']} | {b['low']:,}/{b['base']:,}/{b['high']:,} | {u['low']}/{u['base']}/{u['high']} | {r['low']:.2f}/{r['base']:.2f}/{r['high']:.2f} | {mm['segments_base'][s['id']]/1e6:,.1f} |")
    d = mm["deterministic"]
    print(f"\nDeterministic bounds (all inputs at low / base / high): USD {d['low']/1e6:,.0f}m / {d['base']/1e6:,.0f}m / {d['high']/1e6:,.0f}m per year.")
    mc = mm["mc"]
    print(f"Monte Carlo (seed {mm['seed']}, {mm['draws']} draws, split-lognormal inputs with low=p10, base=median, high=p90, cross-segment correlation rho={mm['rho']}) p10/p50/p90: GMV USD {mc['gmv']['p10']/1e6:,.0f}m / {mc['gmv']['p50']/1e6:,.0f}m / {mc['gmv']['p90']/1e6:,.0f}m.")
    print(f"Revenue pool (GMV x take rate) p10/p50/p90: USD {mc['revenue_pool']['p10']/1e6:,.1f}m / {mc['revenue_pool']['p50']/1e6:,.1f}m / {mc['revenue_pool']['p90']/1e6:,.1f}m = {mc['revenue_pool']['p50']*fx_usd/1e12:,.2f} trillion T at p50.")
    print(f"Industry orders per day p10/p50/p90: {mc['orders_per_day']['p10']:,.0f} / {mc['orders_per_day']['p50']:,.0f} / {mc['orders_per_day']['p90']:,.0f}; deterministic base {mm['orders_per_day_base']:,.0f}.")
    print(f"New-brand year-1 GMV (share x GMV) p10/p50/p90: USD {mc['entrant_gmv']['p10']/1e6:,.2f}m / {mc['entrant_gmv']['p50']/1e6:,.2f}m / {mc['entrant_gmv']['p90']/1e6:,.2f}m.")
    print("\nTornado by segment (GMV swing with all other inputs at base):\n")
    print("| segment | GMV if segment low (USD m) | GMV if segment high (USD m) | swing (USD m) |")
    print("|---|---:|---:|---:|")
    for t in mm["tornado_segments"]:
        print(f"| {t['segment']} | {t['gmv_if_segment_low']/1e6:,.0f} | {t['gmv_if_segment_high']/1e6:,.0f} | {t['swing']/1e6:,.0f} |")
    print("\nTornado by parameter (varied across all segments together):\n")
    print("| parameter | GMV low (USD m) | GMV high (USD m) | swing (USD m) |")
    print("|---|---:|---:|---:|")
    for t in mm["tornado_params"]:
        print(f"| {t['parameter']} | {t['gmv_all_segments_low']/1e6:,.0f} | {t['gmv_all_segments_high']/1e6:,.0f} | {t['swing']/1e6:,.0f} |")

    # ---------------------------------------------------------------- write back
    if args.write:
        ms_stats = {}
        ms_stats["ai_subscription_plus"] = family_stat_block(as_of, "ai_subscription_plus", "ChatGPT Plus 1 month: price over USD x same-day free-market rate, official-like tier", families.get("ai_subscription_plus", []),
                                                           extra_note="Seller unattributed; sources: store listings in search summaries plus the lead's independent range.")
        ms_stats["gift_card"] = family_stat_block(as_of, "gift_card", "gift-card price over USD x same-day free-market rate", families.get("gift_card", []), extra_note="Only stale aggregator data was found (excluded).")
        ms_stats["exam_embassy_payment"] = family_stat_block(as_of, "exam_embassy_payment", "exam/embassy payment fee over USD x rate", families.get("exam_embassy_payment", []), extra_note="No price found.")
        for n in (100, 500, 1000):
            xs = [v for v in (curves["fee-dollarisho-card"][n], curves["fee-tehrancreditcard-fx"][n], curves["fee-almas-card"][n]) if v is not None]
            ms_stats[f"card_load_explicit_fee_pct_usd{n}"] = family_stat_block(as_of, f"card_load_explicit_fee_pct_usd{n}", f"explicit fee % of a USD {n} load, existing card (Dollarisho, Tehran Credit Card, Almas where defined); excludes house-rate markup and card-spend fees", xs,
                                                                           extra_note="Competitor rate markup unobserved.")
        ms_stats["digital_dollar_round_trip_spread_pct"] = family_stat_block(as_of, "digital_dollar_round_trip_spread_pct", "Perfect Money USD round-trip spread at three sellers (undated quotes)", [r["spread_pct"] for r in spreads],
                                                                             extra_note="Quote dates unknown; levels stale, spreads informative.")
        ms_stats["fx_gateway_commission_band_pct"] = {"metric": "generic FX-gateway commission band (PayStar guide titled 2024)", "n": 1,
                                                       "low": make_rec(as_of, 2.0, "pct", "stale (2024) generic band", status="reported"), "high": make_rec(as_of, 5.0, "pct", "stale (2024) generic band", status="reported")}
        data["markup_stats"] = ms_stats

        data["elasticity"]["derived_grid"] = make_rec(as_of, {"lerner_inversion": grids["lerner_inversion"], "blended_segment_response": grids["blended_segment_response"]},
                                                      "tables", "Identities, not estimates; see method.", status="reported")
        for k, w in (("low", "p10"), ("base", "p50"), ("high", "p90")):
            rec = data["market_size"][k]
            rec["value"] = round(mc["gmv"][w], -5)
            rec["status"] = "UNVERIFIED"
            rec["confidence"] = "low"
            rec["note"] = f"Model output: Monte Carlo {w} of reseller-served GMV (seed {mm['seed']}, {mm['draws']} draws; inputs are split-lognormal with cross-segment correlation rho={mm['rho']}). Driven by assumptions A1-A7, not observations."
            rec["sources"] = [SCRIPT_REF]
        data["market_size"]["derived"] = {
            "deterministic_gmv_usd": make_rec(as_of, {k: round(v, -5) for k, v in d.items()}, "USD per year (all inputs low / base / high)", "Scenario bounds; joint extremes are unlikely.", status="UNVERIFIED"),
            "revenue_pool_usd": make_rec(as_of, {k: round(mc["revenue_pool"][w], -4) for k, w in (("low", "p10"), ("base", "p50"), ("high", "p90"))}, "USD per year", "GMV x take rate; assumptions.", status="UNVERIFIED"),
            "industry_orders_per_day": make_rec(as_of, {k: round(mc["orders_per_day"][w]) for k, w in (("low", "p10"), ("base", "p50"), ("high", "p90"))}, "orders/day (all resellers)", "GMV / AOV / 365; assumptions.", status="UNVERIFIED"),
            "new_brand_year1_gmv_usd": make_rec(as_of, {k: round(mc["entrant_gmv"][w], -4) for k, w in (("low", "p10"), ("base", "p50"), ("high", "p90"))}, "USD per year", "share x GMV; assumptions.", status="UNVERIFIED"),
            "tornado_segments": mm["tornado_segments"],
            "tornado_params": mm["tornado_params"],
        }
        data["price_war"]["undercut_headroom"] = make_rec(as_of, [{k: (r2(v) if isinstance(v, float) else v) for k, v in h.items()} for h in headroom], "pp",
                                                          "competitor visible level minus our modelled break-even (lead's cost model, zero margin); negative = matching loses money. Competitor rate markup unobserved.", status="reported")
        data["price_war"]["floor_sensitivity"] = make_rec(as_of, {"break_even_by_provider_fee_and_risk_usd100": sens_rows, "required_provider_fee_for_target_markup_usd100": req_rows, "entry_basket_new_card": entry_rows},
                                                         "pp / pct", "Our modelled break-even (lead's cost model) under alternative provider fee and risk-buffer assumptions; competitor rate markup unobserved.", status="reported")
        data["_meta"]["derived_by"] = "scripts/research/07_markup_stats.py --write"
        data["_meta"]["derived_seed"] = args.seed
        Path(args.json).write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        print(f"\n[write] refreshed derived blocks in {args.json}")


if __name__ == "__main__":
    main()
