#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
End-to-end cost & pricing model for a USDT-funded virtual-card / subscription
reseller operating from Iran (Rial in, USDT out, service delivered to customer).

All figures are *assumptions* sourced from the research doc and are meant to be
tuned. Nothing here is a recommendation to evade sanctions or provider geo-rules;
it is a unit-economics calculator for a reseller margin.

Run:  python3 scripts/pricing_model.py
"""

from dataclasses import dataclass


# ---- Market / rail assumptions (edit these) --------------------------------
USDT_TOMAN = 257_000          # ~10 Mehr 1405 wholesale USDT buy price (Toman)
EXCHANGE_TRADE_FEE = 0.0035   # ~0.35% spot fee at a typical IR exchange
EXCHANGE_SPREAD = 0.004       # extra buy-side spread vs mid (~0.4%)
NETWORK_FEE_USDT = 1.0        # TRC20 withdrawal fee from exchange (USDT)

# ---- mpay (card provider) assumptions --------------------------------------
CARD_ISSUE_USD = 4.99         # one-time per virtual card
MIN_TOPUP_USD = 25.0          # minimum top-up
# mpay's own top-up % is NOT published; peers charge 2.5%-4%. Use a band.
MPAY_TOPUP_FEE = 0.03         # assume 3% until confirmed
CARD_FX_NONUSD = 0.0          # USD-priced merchants => 0; non-USD spend 3-5%

# ---- Your business assumptions ---------------------------------------------
# Collecting Rial. Card-to-card is "free" but has 15M Toman/day/card cap + tax
# exposure. Zarinpal-type gateway ~0.5% (and crypto-merchant eligibility risk).
RIAL_COLLECTION_FEE = 0.005   # blended collection cost
OPERATOR_COST_TOMAN = 40_000  # labor per manual order (operator approval)
RISK_BUFFER = 0.02            # chargeback/fraud/price-move buffer (2%)
WORKING_CAPITAL_DAYS = 3      # 72h withdrawal lock ties up float


def toman(usd: float) -> float:
    return usd * USDT_TOMAN


def usdt_buy_cost_toman(usd_amount: float) -> float:
    """What it costs YOU (in Toman) to end up with `usd_amount` USDT in hand,
    including trade fee, spread and the fixed network withdrawal fee."""
    gross = usd_amount + NETWORK_FEE_USDT  # must buy enough to cover withdrawal
    multiplier = 1 + EXCHANGE_TRADE_FEE + EXCHANGE_SPREAD
    return gross * USDT_TOMAN * multiplier


@dataclass
class Scenario:
    name: str
    topup_usd: float          # USD value the customer ultimately wants on card
    new_card: bool            # issue a new card this order?
    target_margin: float      # your net margin target on top of all costs
    rush: bool = False        # rush order => premium
    rush_premium: float = 0.0 # extra margin fraction if rush


def price_order(s: Scenario):
    # 1) USDT you must acquire: top-up value + mpay top-up fee + (issue if new)
    provider_usd = s.topup_usd * (1 + MPAY_TOPUP_FEE)
    if s.new_card:
        provider_usd += CARD_ISSUE_USD
    # 2) cost to acquire that USDT in Toman
    usdt_cost = usdt_buy_cost_toman(provider_usd)
    # 3) Rial collection cost + operator + risk buffer
    base = usdt_cost
    collection = base * RIAL_COLLECTION_FEE
    risk = base * RISK_BUFFER
    cost = base + collection + risk + OPERATOR_COST_TOMAN
    # 4) margin
    margin_frac = s.target_margin + (s.rush_premium if s.rush else 0.0)
    price = cost * (1 + margin_frac)
    profit = price - cost
    return {
        "provider_usd": provider_usd,
        "usdt_cost_toman": usdt_cost,
        "total_cost_toman": cost,
        "price_toman": price,
        "profit_toman": profit,
        "margin_pct": margin_frac * 100,
        "effective_rate": price / s.topup_usd,  # Toman the customer pays per $1 delivered
    }


def fmt(n: float) -> str:
    return f"{n:,.0f}"


SCENARIOS = [
    Scenario("ChatGPT Plus ($20), new card, normal", 20, True, 0.15),
    Scenario("ChatGPT Plus ($20), existing card, normal", 20, False, 0.15),
    Scenario("ChatGPT Plus ($20), existing card, RUSH", 20, False, 0.15, rush=True, rush_premium=0.15),
    Scenario("Top-up $50, existing card, normal", 50, False, 0.12),
    Scenario("Top-up $100, existing card, normal", 100, False, 0.10),
    Scenario("Top-up $100, existing card, RUSH", 100, False, 0.10, rush=True, rush_premium=0.12),
    Scenario("New card + $25 min top-up (entry bundle)", 25, True, 0.20),
]


def main():
    print("=" * 96)
    print(f"USDT buy price: {fmt(USDT_TOMAN)} Toman | mpay top-up fee (assumed): {MPAY_TOPUP_FEE*100:.1f}% "
          f"| issue: ${CARD_ISSUE_USD}")
    print("=" * 96)
    header = f"{'Scenario':<46}{'Cost(T)':>14}{'Price(T)':>14}{'Profit(T)':>13}{'T/$ eff':>9}"
    print(header)
    print("-" * 96)
    for s in SCENARIOS:
        r = price_order(s)
        print(f"{s.name:<46}{fmt(r['total_cost_toman']):>14}{fmt(r['price_toman']):>14}"
              f"{fmt(r['profit_toman']):>13}{fmt(r['effective_rate']):>9}")
    print("-" * 96)

    # Monthly P&L sketch at a few volumes (avg profit per order from the $100 normal case)
    avg_profit = price_order(SCENARIOS[4])["profit_toman"]
    print(f"\nAvg net profit per '$100 normal' order: {fmt(avg_profit)} Toman")
    for orders in (100, 300, 1000):
        monthly = avg_profit * orders
        print(f"  {orders:>4} orders/mo  ->  ~{fmt(monthly)} Toman/mo  (~${monthly/USDT_TOMAN:,.0f} equiv)")

    # Working-capital / float requirement
    print("\nWorking capital note:")
    daily_orders = 30
    avg_provider_usd = price_order(SCENARIOS[4])["provider_usd"]
    float_usd = daily_orders * avg_provider_usd * WORKING_CAPITAL_DAYS
    print(f"  At {daily_orders} orders/day of ~${avg_provider_usd:,.0f} USDT each and a {WORKING_CAPITAL_DAYS}-day")
    print(f"  (72h) settlement lock, you must pre-fund ~${float_usd:,.0f} USDT of float")
    print(f"  (~{fmt(float_usd*USDT_TOMAN)} Toman) to avoid stockouts.")


if __name__ == "__main__":
    main()
