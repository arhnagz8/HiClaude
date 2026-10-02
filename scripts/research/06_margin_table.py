#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
06_margin_table.py  -  landed cost, recommended price and competitor headroom for the flagship
SKUs of data/catalog.json, at three FX levels (current ~257k IRT/USDT, +20 %, -10 %).

Owner agent : 06-service-catalog-demand        As of: 2026-10-02 (10 Mehr 1405)

What this script is (and is not)
  * It re-uses the first-pass cost model of scripts/pricing_model.py (same constants, same formula)
    but makes it FX-parametric and Decimal-based (CLAUDE.md sec. 7: integer money, explicit rounding:
    customer prices round UP, to the next 1,000 IRT).
  * Every constant below is an ASSUMPTION carried over from the lead's model (they are flagged
    UNVERIFIED in data/catalog.json -> cost_model_defaults). Real provider fees come from specialist 01
    (data/providers.json), real market markups from specialist 07 (data/competitors.json), the
    pricing policy from specialist 12. Replace the constants (or pass flags) when those land.
  * Competitor headroom is computed ONLY where the catalog holds a comparable competitor quote.
    The quotes in the catalog are undated listings seen through search summaries, so the competitor
    markup is *estimated* against a reference FX anchor (default: USDT on 9 Shahrivar 1405) and then
    re-priced to each scenario FX (assumption: competitors keep a constant markup over FX).

Formulae (per order)
  supplier_usd = list_usd * (1 + fee)  [+ card issue fee if a new card is needed]
                 fee = provider top-up fee (modes A/C) or voucher fee (mode B)
  usdt_cost    = (supplier_usd + NETWORK_FEE_USDT / batch) * FX * (1 + EXCHANGE_TRADE_FEE + EXCHANGE_SPREAD)
  cost         = usdt_cost * (1 + RIAL_COLLECTION_FEE + RISK_BUFFER) + OPERATOR_COST_IRT
  price        = CEIL_1000( cost * (1 + margin) )
  headroom     = competitor_equiv_price / cost - 1        (max markup over our landed cost that still
                                                          matches the competitor)

Usage
  python3 scripts/research/06_margin_table.py                 # all sections, Markdown
  python3 scripts/research/06_margin_table.py --section margin
  python3 scripts/research/06_margin_table.py --provider-fee 0.04 --batch 10
  python3 scripts/research/06_margin_table.py --selftest      # reproduces scripts/pricing_model.py figures
  python3 scripts/research/06_margin_table.py --json /tmp/margin.json
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import statistics
import sys
from decimal import ROUND_CEILING, ROUND_HALF_UP, Decimal as D
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CATALOG_PATH = ROOT / "data" / "catalog.json"

# --------------------------------------------------------------------------------------
# Cost-model constants (source: scripts/pricing_model.py, 2026-10-02; ALL are assumptions)
# --------------------------------------------------------------------------------------
FX_BASE = D(257000)               # brief: "current ~257k"; Nobitex 258,901 on 2026-09-30 (S39)
FX_UP = D("0.20")                 # +20 % scenario (a +23.55 % move happened in the 30 days to 2026-09-30)
FX_DOWN = D("0.10")               # -10 % scenario
EXCHANGE_TRADE_FEE = D("0.0035")  # ~0.35 % spot fee at an Iranian exchange
EXCHANGE_SPREAD = D("0.004")      # ~0.4 % buy-side spread vs mid
NETWORK_FEE_USDT = D("1.0")       # TRC-20 withdrawal fee, paid once per withdrawal
PROVIDER_TOPUP_FEE = D("0.03")    # card-load fee: NOT published by mpay; peers 2.5-4 % -> 3 % placeholder
VOUCHER_FEE = D("0.0")            # mode B (voucher aggregator): face value, 0 % fee/discount placeholder
CARD_ISSUE_USD = D("4.99")        # mpay virtual-card issue fee (secondary source; verify)
RIAL_COLLECTION_FEE = D("0.005")  # blended Rial collection cost
OPERATOR_COST_IRT = D(40000)      # operator labour per manual order
RISK_BUFFER = D("0.02")           # price-move / failure / refund buffer
BATCH_ORDERS_PER_WITHDRAWAL = 1   # pricing_model.py charges the 1-USDT network fee on every order
ROUND_TO_IRT = D(1000)            # customer prices round UP to the next 1,000 IRT
FX_REF_QUOTE_KEY = "usdt_irt_2026-08-31"   # anchor used to estimate competitor markup (9 Shahrivar 1405)

# Margin policy bands derived from pricing_model.py scenarios ($20->15 %, $25 bundle->20 %, $50->12 %, $100->10 %)
# and extended by assumption to the two ends. Upper bound is exclusive (USD of list price).
MARGIN_BANDS = [(D(15), D("0.18")), (D(30), D("0.15")), (D(75), D("0.12")), (D(150), D("0.10")), (D(10**9), D("0.08"))]
RUSH_PREMIUM_PCT = D(12)          # pricing_model.py: rush premium 12-15 % on top of the margin

# Absolute margin floor (IRT per order): support minutes + refund reserve, by burden / risk level (assumptions)
SUPPORT_FLOOR_IRT = {"low": 20000, "medium": 40000, "high": 80000}
REFUND_FLOOR_IRT = {"low": 0, "medium": 10000, "high": 40000}


# --------------------------------------------------------------------------------------
# Core functions
# --------------------------------------------------------------------------------------
def band_margin(list_usd) -> D:
    """Recommended margin (fraction) for a list price in USD, by ticket-size band."""
    usd = D(str(list_usd))
    for upper, m in MARGIN_BANDS:
        if usd < upper:
            return m
    return MARGIN_BANDS[-1][1]


def min_margin_irt(support: str, refund: str) -> int:
    """Absolute floor on profit per order (IRT), rounded up to 1,000."""
    raw = D(SUPPORT_FLOOR_IRT[support] + REFUND_FLOOR_IRT[refund])
    return int((raw / ROUND_TO_IRT).to_integral_value(rounding=ROUND_CEILING) * ROUND_TO_IRT)


def supplier_usd(list_usd, mode: str, new_card: bool = False, provider_fee=None, voucher_fee=None) -> D:
    provider_fee = PROVIDER_TOPUP_FEE if provider_fee is None else D(str(provider_fee))
    voucher_fee = VOUCHER_FEE if voucher_fee is None else D(str(voucher_fee))
    fee = voucher_fee if mode == "B" else provider_fee
    usd = D(str(list_usd)) * (1 + fee)
    if new_card:
        usd += CARD_ISSUE_USD
    return usd


def landed_cost(list_usd, mode: str, fx, *, new_card=False, provider_fee=None, voucher_fee=None, batch=None,
                operator_cost=None, spread=None, risk_buffer=None):
    """Returns (supplier_usd, usdt_cost_irt, cost_irt) as Decimals."""
    batch = BATCH_ORDERS_PER_WITHDRAWAL if batch is None else batch
    operator_cost = OPERATOR_COST_IRT if operator_cost is None else D(str(operator_cost))
    spread = EXCHANGE_SPREAD if spread is None else D(str(spread))
    risk_buffer = RISK_BUFFER if risk_buffer is None else D(str(risk_buffer))
    s = supplier_usd(list_usd, mode, new_card, provider_fee, voucher_fee)
    usdt_cost = (s + NETWORK_FEE_USDT / D(batch)) * D(str(fx)) * (1 + EXCHANGE_TRADE_FEE + spread)
    cost = usdt_cost * (1 + RIAL_COLLECTION_FEE + risk_buffer) + operator_cost
    return s, usdt_cost, cost


def ceil_irt(x: D) -> int:
    return int((x / ROUND_TO_IRT).to_integral_value(rounding=ROUND_CEILING) * ROUND_TO_IRT)


def price_from_cost(cost: D, margin: D) -> int:
    return ceil_irt(cost * (1 + margin))


def fx_levels(base=None, up=None, down=None):
    base = FX_BASE if base is None else D(str(base))
    up = FX_UP if up is None else D(str(up))
    down = FX_DOWN if down is None else D(str(down))
    return [("-%d%%" % int(down * 100), base * (1 - down)), ("base", base), ("+%d%%" % int(up * 100), base * (1 + up))]


def fmt(n) -> str:
    return f"{int(D(n).to_integral_value(rounding=ROUND_HALF_UP)):,}"


def pct(x, nd=1) -> str:
    return f"{float(x) * 100:.{nd}f}%"


def load_catalog():
    with open(CATALOG_PATH, encoding="utf-8") as fh:
        return json.load(fh)


def rec_value(rec):
    return None if rec is None else rec.get("value")


# --------------------------------------------------------------------------------------
# Sections
# --------------------------------------------------------------------------------------
def section_assumptions(args):
    out = ["### Cost-model assumptions used in this run", "",
           "| parameter | value | provenance |", "|---|---|---|"]
    rows = [
        ("FX base (IRT per USDT)", fmt(args.fx), "brief + Nobitex 258,901 on 2026-09-30 (S39); internal doc ~256,900 on 10 Mehr"),
        ("FX scenarios", f"-{int(args.down*100)}% / base / +{int(args.up*100)}%", "brief mandate; +23.55 % occurred in the 30 days to 2026-09-30 (S39)"),
        ("Exchange trade fee", pct(EXCHANGE_TRADE_FEE, 2), "scripts/pricing_model.py (assumption)"),
        ("Exchange buy spread", pct(EXCHANGE_SPREAD, 2), "scripts/pricing_model.py (assumption)"),
        ("Network fee (USDT per withdrawal)", str(NETWORK_FEE_USDT), "scripts/pricing_model.py (TRC-20 ~1 USDT)"),
        ("Orders per withdrawal batch", str(args.batch), "pricing_model.py charges it per order (=1); batching is a sensitivity"),
        ("Provider top-up fee (A/C)", pct(args.provider_fee, 2), "UNPUBLISHED by mpay; peers 2.5-4 % (S50) - placeholder until specialist 01"),
        ("Voucher fee (B)", pct(VOUCHER_FEE, 2), "placeholder: face value, no discount - verify with aggregator"),
        ("Card issue fee (new card only)", f"${CARD_ISSUE_USD}", "S50 (secondary sources for mpay) - verify"),
        ("Rial collection fee", pct(RIAL_COLLECTION_FEE, 2), "scripts/pricing_model.py"),
        ("Risk buffer", pct(RISK_BUFFER, 2), "scripts/pricing_model.py"),
        ("Operator cost / order", f"{fmt(OPERATOR_COST_IRT)} IRT", "scripts/pricing_model.py"),
        ("Rounding", f"customer price CEIL to {fmt(ROUND_TO_IRT)} IRT", "CLAUDE.md: customer prices round up"),
        ("Margin bands (list USD)", "<15: 18 %; 15-30: 15 %; 30-75: 12 %; 75-150: 10 %; >=150: 8 %", "derived from pricing_model.py scenarios, ends extended (assumption)"),
    ]
    out += [f"| {a} | {b} | {c} |" for a, b, c in rows]
    return "\n".join(out)


def compute_rows(cat, args):
    levels = fx_levels(args.fx, args.up, args.down)
    rows = []
    for s in cat["skus"]:
        if not s.get("flagship"):
            continue
        usd = rec_value(s.get("usd_price"))
        if usd is None:
            continue
        mode = s.get("default_mode", "A")
        new_card = bool(s.get("new_card"))
        margin = D(str(rec_value(s["recommended_margin_pct"]))) / 100 if rec_value(s.get("recommended_margin_pct")) is not None else band_margin(usd)
        floor = rec_value(s.get("min_margin_irt")) or 0
        per_level = {}
        for label, fx in levels:
            sup, usdt_cost, cost = landed_cost(usd, mode, fx, new_card=new_card, provider_fee=args.provider_fee,
                                               batch=args.batch)
            price = price_from_cost(cost, margin)
            # absolute floor: never quote less than cost + min_margin_irt
            price_floor = ceil_irt(cost + D(floor))
            price = max(price, price_floor)
            per_level[label] = {"fx": fx, "supplier_usd": sup, "cost": cost, "price": price,
                                "profit": D(price) - cost, "eff_rate": D(price) / D(str(usd))}
        rows.append({"id": s["id"], "name": s["name_en"], "mode": mode, "usd": D(str(usd)), "margin": margin,
                     "levels": per_level, "sku": s})
    return levels, rows


def section_margin(cat, args):
    levels, rows = compute_rows(cat, args)
    labels = [l for l, _ in levels]
    lo, base, hi = labels
    out = ["### Table 1 - landed cost, recommended price (at catalog margin) and effective Toman/USD", "",
           f"FX levels (IRT/USDT): {lo} = {fmt(levels[0][1])}, base = {fmt(levels[1][1])}, {hi} = {fmt(levels[2][1])}.",
           "Price = CEIL_1000(cost x (1+margin)), floored at cost + min_margin_irt. 'Rec. price' is what the engine would quote; it is NOT a market price.", "",
           f"| SKU | mode | list USD | supplier USD | margin | cost @base | price {lo} | **price @base** | price {hi} | eff. IRT/USD @base | profit @base |",
           "|---|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|"]
    for r in rows:
        b = r["levels"][base]
        out.append("| {id} | {mode} | {usd} | {sup} | {m} | {cost} | {p_lo} | **{p_b}** | {p_hi} | {eff} | {pr} |".format(
            id=r["id"], mode=r["mode"], usd=f"{float(r['usd']):g}", sup=f"{float(b['supplier_usd']):.2f}", m=pct(r["margin"], 0),
            cost=fmt(b["cost"]), p_lo=fmt(r["levels"][lo]["price"]), p_b=fmt(b["price"]), p_hi=fmt(r["levels"][hi]["price"]),
            eff=fmt(b["eff_rate"]), pr=fmt(b["profit"])))
    return "\n".join(out), rows, levels


def quotes_for(sku):
    return [q for q in sku.get("competitor_toman_prices", [])]


def anchor_value(cat, key):
    for a in cat["meta"]["fx_anchors"]:
        if a.get("id") == key:
            return D(str(a["value"]))
    raise KeyError(key)


def section_headroom(cat, args, levels):
    ref = anchor_value(cat, FX_REF_QUOTE_KEY)
    out = ["### Table 2 - competitor headroom (only SKUs with comparable quotes)", "",
           f"Competitor markup is ESTIMATED as (quote-implied IRT/USD) / (USDT {fmt(ref)} on 2026-08-31) - 1, because the listings are undated; "
           "the competitor is then assumed to keep that markup when FX moves. headroom = competitor-equivalent price / our landed cost - 1.", "",
           "| SKU | quotes used (IRT) | implied IRT/USD (median) | est. competitor markup | " +
           " | ".join(f"headroom {l}" for l, _ in levels) + " | gap to rec. margin @base (pp) |",
           "|---|---|--:|--:|" + "--:|" * len(levels) + "--:|"]
    n = 0
    for s in cat["skus"]:
        if not s.get("flagship"):
            continue
        usd = rec_value(s.get("usd_price"))
        qs = [q for q in quotes_for(s) if q.get("comparable") in ("yes", "probable") and q.get("denomination_usd")]
        if usd is None or not qs:
            continue
        rates = [D(str(q["price_irt"])) / D(str(q["denomination_usd"])) for q in qs]
        med = D(str(statistics.median([float(r) for r in rates])))
        m_c = med / ref - 1
        mode = s.get("default_mode", "A")
        margin = D(str(rec_value(s["recommended_margin_pct"]))) / 100
        cells = []
        base_head = None
        for label, fx in levels:
            _, _, cost = landed_cost(usd, mode, fx, new_card=bool(s.get("new_card")), provider_fee=args.provider_fee, batch=args.batch)
            comp = D(str(usd)) * fx * (1 + m_c)
            head = comp / cost - 1
            cells.append(pct(head))
            if label == "base":
                base_head = head
        gap = (base_head - margin) * 100
        out.append(f"| {s['id']} | {', '.join(fmt(q['price_irt']) for q in qs)} | {fmt(med)} | {pct(m_c)} | " + " | ".join(cells) + f" | {float(gap):+.1f} |")
        n += 1
    if n == 0:
        out.append("| (no comparable quotes in catalog) | | | | | | | |")
    out += ["", "Negative gap = our recommended price would sit ABOVE the competitor-equivalent price under these assumptions "
            "(commodity vouchers: thin margins; a competitor that buys USDT near mid and vouchers at a discount can undercut)."]
    return "\n".join(out)


def section_evidence(cat, args):
    a_old = anchor_value(cat, "usdt_irt_2026-08-31")
    a_new = anchor_value(cat, "usdt_irt_2026-09-30")
    out = ["### Table 3 - Iranian retail quotes vs official USD list price (undated listings)", "",
           f"Implied USD-equivalent = price / FX. Two FX anchors bracket the unknown listing date: USDT {fmt(a_old)} (2026-08-31) and {fmt(a_new)} (2026-09-30). "
           "ratio = implied USD-equivalent / official list price.", "",
           "| SKU | seller / source | quote IRT | official USD | USD-eq @08-31 | USD-eq @09-30 | ratio @08-31 | ratio @09-30 | comparable? |",
           "|---|---|--:|--:|--:|--:|--:|--:|---|"]
    for s in cat["skus"]:
        qs = quotes_for(s)
        if not qs:
            continue
        usd = rec_value(s.get("usd_price"))
        for q in qs:
            p = D(str(q["price_irt"]))
            eq_old, eq_new = p / a_old, p / a_new
            if usd:
                r_old, r_new = f"{float(eq_old / D(str(usd))):.2f}", f"{float(eq_new / D(str(usd))):.2f}"
                uu = f"{float(usd):g}"
            else:
                r_old = r_new = "n/a"
                uu = "n/a"
            out.append(f"| {s['id']} | {q['seller']} | {fmt(p)} | {uu} | {float(eq_old):.2f} | {float(eq_new):.2f} | {r_old} | {r_new} | {q.get('comparable')} |")
    out += ["", "Reading: ratios far below 1 (e.g. 0.1-0.3) mean the listing is NOT an official-price product (shared / invite-slot / regional-price / "
            "promo access). Such offers are structurally non-comparable to modes A/B/C and are not replicated by this platform."]
    return "\n".join(out)


def section_price_changes(cat, args):
    log = cat.get("price_change_log_2026", [])
    out = ["### Table 4 - USD list-price changes observed in 2026 (vendor re-pricing process for the simulator)", "",
           "| vendor | plan | old USD | new USD | change | effective | confidence | source |", "|---|---|--:|--:|--:|---|---|---|"]
    rises = []
    for e in log:
        old, new = e.get("old_usd"), e.get("new_usd")
        if old and new:
            ch = (D(str(new)) / D(str(old)) - 1) * 100
            if ch > 0 and not e.get("exclude_from_stats"):
                rises.append(float(ch))
            chs = f"{float(ch):+.1f}%"
        else:
            chs = "n/a"
        out.append(f"| {e['vendor']} | {e['plan']} | {old if old is not None else '-'} | {new if new is not None else '-'} | {chs} | {e.get('effective', '?')} | {e.get('confidence', '?')} | {e.get('source_id', '')} |")
    if rises:
        rs = sorted(rises)
        q = statistics.quantiles(rs, n=4) if len(rs) >= 4 else [rs[0], statistics.median(rs), rs[-1]]
        out += ["", f"Observed increases (n={len(rs)} plan-level price points from {len({e['vendor'] for e in log if e.get('old_usd') and e.get('new_usd') and (e['new_usd'] > e['old_usd']) and not e.get('exclude_from_stats')})} vendors): "
                f"min {rs[0]:.1f}%, Q1 {q[0]:.1f}%, median {statistics.median(rs):.1f}%, Q3 {q[2]:.1f}%, max {rs[-1]:.1f}%. "
                "Plan-level points within one vendor event are strongly correlated - treat as ~5 independent vendor events, not 12."]
    return "\n".join(out)


def section_sensitivity(cat, args):
    pick = [s for s in cat["skus"] if s["id"] in ("chatgpt-plus", "chatgpt-pro-200", "steam-wallet-20", "vcard-topup-100") and rec_value(s.get("usd_price"))]
    base_kw = dict(provider_fee=args.provider_fee, batch=args.batch)
    cases = [
        ("provider top-up fee 2 % / 4 %", {"provider_fee": 0.02}, {"provider_fee": 0.04}),
        ("withdrawal batch 10 orders / (base)", {"batch": 10}, {}),
        ("operator cost 20k / 60k IRT", {"operator_cost": 20000}, {"operator_cost": 60000}),
        ("exchange spread 0.2 % / 0.8 %", {"spread": "0.002"}, {"spread": "0.008"}),
        ("risk buffer 1 % / 3 %", {"risk_buffer": "0.01"}, {"risk_buffer": "0.03"}),
    ]
    out = ["### Table 5 - one-at-a-time sensitivity of landed cost @base FX (tornado-style, % change vs base case)", "",
           "| driver (low / high) | " + " | ".join(s["id"] for s in pick) + " |", "|---|" + "--:|" * len(pick)]
    for name, lo_kw, hi_kw in cases:
        cells = []
        for s in pick:
            usd, mode = rec_value(s["usd_price"]), s.get("default_mode", "A")
            nc = bool(s.get("new_card"))
            _, _, c0 = landed_cost(usd, mode, args.fx, new_card=nc, **base_kw)
            kw_lo = {**base_kw, **lo_kw}
            kw_hi = {**base_kw, **hi_kw}
            _, _, c_lo = landed_cost(usd, mode, args.fx, new_card=nc, **kw_lo)
            _, _, c_hi = landed_cost(usd, mode, args.fx, new_card=nc, **kw_hi)
            cells.append(f"{float((c_lo / c0 - 1) * 100):+.2f}% / {float((c_hi / c0 - 1) * 100):+.2f}%")
        out.append(f"| {name} | " + " | ".join(cells) + " |")
    # FX is the dominant driver: show it explicitly
    cells = []
    for s in pick:
        usd, mode = rec_value(s["usd_price"]), s.get("default_mode", "A")
        _, _, c0 = landed_cost(usd, mode, args.fx, provider_fee=args.provider_fee, batch=args.batch)
        _, _, c_lo = landed_cost(usd, mode, D(str(args.fx)) * (1 - args.down), provider_fee=args.provider_fee, batch=args.batch)
        _, _, c_hi = landed_cost(usd, mode, D(str(args.fx)) * (1 + args.up), provider_fee=args.provider_fee, batch=args.batch)
        cells.append(f"{float((c_lo / c0 - 1) * 100):+.1f}% / {float((c_hi / c0 - 1) * 100):+.1f}%")
    out.append(f"| **FX {-int(args.down*100)}% / +{int(args.up*100)}%** | " + " | ".join(cells) + " |")
    return "\n".join(out)


def section_affordability(cat, args):
    a = {x["id"]: D(str(x["value"])) for x in cat["meta"]["fx_anchors"]}
    keys = [("2026-07-02 (11 Tir)", "usdt_irt_2026-07-02"), ("2026-08-31 (9 Shahrivar)", "usdt_irt_2026-08-31"), ("2026-09-30 (8 Mehr)", "usdt_irt_2026-09-30")]
    ids = ["chatgpt-plus", "claude-pro", "google-ai-pro", "netflix-standard", "youtube-premium", "adobe-cc-all-apps", "ps-plus-essential-12m", "chatgpt-pro-200"]
    out = ["### Table 6 - official USD list price x USDT/IRT anchors (price of the pure USD list price in Toman, no fees)", "",
           "| SKU | USD | " + " | ".join(k[0] for k in keys) + " | change first->last |", "|---|--:|" + "--:|" * len(keys) + "--:|"]
    for sid in ids:
        s = next((x for x in cat["skus"] if x["id"] == sid), None)
        if not s or rec_value(s.get("usd_price")) is None:
            continue
        usd = D(str(rec_value(s["usd_price"])))
        vals = [usd * a[k[1]] for k in keys]
        out.append(f"| {sid} | {float(usd):g} | " + " | ".join(fmt(v) for v in vals) + f" | {pct(vals[-1] / vals[0] - 1)} |")
    first, last = a[keys[0][1]], a[keys[-1][1]]
    out += ["", f"USDT/IRT moved {fmt(first)} -> {fmt(last)} ({pct(last / first - 1)}) in 90 days (2026-07-02 -> 2026-09-30): the Toman price of every USD-denominated SKU rose by the same factor."]
    return "\n".join(out)


def selftest(args):
    """Reproduce the first-pass figures of scripts/pricing_model.py with this FX-parametric implementation."""
    spec = importlib.util.spec_from_file_location("pricing_model", ROOT / "scripts" / "pricing_model.py")
    pm = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(pm)
    ok = True
    print("selftest vs scripts/pricing_model.py (cost in IRT, tolerance 1 IRT):")
    for sc in pm.SCENARIOS:
        ref = pm.price_order(sc)
        mode = "A"
        s, usdt, cost = landed_cost(sc.topup_usd, mode, pm.USDT_TOMAN, new_card=sc.new_card, provider_fee=pm.MPAY_TOPUP_FEE, batch=1,
                                    operator_cost=pm.OPERATOR_COST_TOMAN, spread=pm.EXCHANGE_SPREAD, risk_buffer=pm.RISK_BUFFER)
        diff = float(cost) - ref["total_cost_toman"]
        flag = "OK " if abs(diff) < 1.0 else "BAD"
        ok &= abs(diff) < 1.0
        print(f"  [{flag}] {sc.name:<48} model={ref['total_cost_toman']:>14,.0f} ours={float(cost):>14,.0f} diff={diff:+.4f}")
    print("SELFTEST", "PASSED" if ok else "FAILED")
    return 0 if ok else 1


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--fx", type=float, default=float(FX_BASE), help="base USDT/IRT (default 257000)")
    ap.add_argument("--up", type=float, default=float(FX_UP), help="upward FX scenario (default 0.20)")
    ap.add_argument("--down", type=float, default=float(FX_DOWN), help="downward FX scenario (default 0.10)")
    ap.add_argument("--provider-fee", type=float, default=float(PROVIDER_TOPUP_FEE), help="provider top-up fee fraction (default 0.03)")
    ap.add_argument("--batch", type=int, default=BATCH_ORDERS_PER_WITHDRAWAL, help="orders per USDT withdrawal (default 1)")
    ap.add_argument("--section", choices=["all", "assumptions", "margin", "headroom", "evidence", "changes", "sensitivity", "afford"], default="all")
    ap.add_argument("--json", help="also write machine-readable margin rows to this path")
    ap.add_argument("--selftest", action="store_true")
    args = ap.parse_args(argv)
    if args.selftest:
        return selftest(args)
    cat = load_catalog()
    parts = []
    want = lambda k: args.section in ("all", k)  # noqa: E731
    if want("assumptions"):
        parts.append(section_assumptions(args))
    txt, rows, levels = section_margin(cat, args)
    if want("margin"):
        parts.append(txt)
    if want("headroom"):
        parts.append(section_headroom(cat, args, levels))
    if want("evidence"):
        parts.append(section_evidence(cat, args))
    if want("changes"):
        parts.append(section_price_changes(cat, args))
    if want("sensitivity"):
        parts.append(section_sensitivity(cat, args))
    if want("afford"):
        parts.append(section_affordability(cat, args))
    print("\n\n".join(parts))
    if args.json:
        payload = [{"id": r["id"], "mode": r["mode"], "usd": float(r["usd"]), "margin": float(r["margin"]),
                    "levels": {k: {"fx": float(v["fx"]), "cost": int(v["cost"]), "price": v["price"], "profit": int(v["profit"])}
                               for k, v in r["levels"].items()}} for r in rows]
        Path(args.json).write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
