#!/usr/bin/env python3
"""Illustrative customer-facing price breakdown for the UX spec (NOT a pricing recommendation).
Implements architecture.md section 7 steps 1-9 with packages/contracts/src/defaults.ts placeholders.
Inputs that are ASSUMPTIONS (not research facts): sigma_d (daily vol) = 1.2 %.
Reference rate: data/competitors.json reference_rates.usdt_irt = 256,900 IRT/USDT (2026-10-02, medium).
Run: python3 scripts/research/11_price_example.py"""
from decimal import Decimal as D, ROUND_CEILING, getcontext
import math, json
getcontext().prec = 28

mid = D('256900')                      # IRT per USDT (competitors.json reference, medium)
half_spread = D('0.0008'); taker = D('0.0025')   # tabdeal placeholders (defaults.ts)
ask = mid * (1 + half_spread)
unit = ask * (1 + taker)               # step 2: replacement cost per USDT incl. taker fee

def price(amount_usd, new_card, rush, method='gateway', sigma=D('0.012')):
    A = D(amount_usd)
    # step 1 funding (mpay placeholders): issue 4.99, topup 3 %, decline buffer 0.25, network alloc 0.3 USDT
    funding_usd = A + (D('4.99') if new_card else 0) + A * D('0.03') + D('0.25')
    funding_usdt = funding_usd + D('0.3')
    C = funding_usdt * unit
    # step 3 volatility buffer: z*sigma*sqrt(tau_lock) + z*sigma*sqrt(tau_lag), drift ignored (floored at 0)
    z = D('1.64'); tau_lock = D(30) / 1440; tau_lag = D(3)
    buf_pct = z * sigma * (tau_lock.sqrt() + tau_lag.sqrt())
    buf_pct = min(max(buf_pct, D('0.004')), D('0.08'))
    buf = C * buf_pct
    risk = C * D('0.01')
    margin = max(D(150000), C * D('0.10'))
    rush_tiers = {'normal': (D(0), D(0)), 'fast': (D('0.04'), D(100000)), 'express': (D('0.10'), D(300000))}
    pct, minp = rush_tiers[rush]
    rush_irt = max(minp, pct * (C + buf + risk + margin)) if pct else D(0)
    target_net = C + buf + risk + margin + rush_irt
    if method == 'gateway':
        pct_f, fixed, cap = D('0.005'), D(500), D(16000)
        P = (target_net + fixed) / (1 - pct_f)
        if pct_f * P + fixed > cap: P = target_net + cap
        fee = min(cap, pct_f * P + fixed)
    else:
        P = target_net; fee = D(0)
    P_round = (P / 1000).to_integral_value(rounding=ROUND_CEILING) * 1000
    rounding = P_round - P
    # customer-facing grouping (truthful: lines sum to the total, no hidden remainder)
    service_value = A * D('1') * unit / 1  # face value at replacement unit rate (USD par=USDT)
    provider_fees = (funding_usd - A) * unit
    our_fee = buf + risk + margin + rounding + (funding_usdt - funding_usd) * unit  # network alloc + buffers + margin + rounding
    return dict(amount_usd=int(A), new_card=new_card, rush=rush, method=method,
                total=int(P_round), service_value=int(service_value), provider_fees=int(provider_fees),
                service_fee=int(our_fee), payment_fee=int(fee), rush_fee=int(rush_irt),
                check=int(service_value + provider_fees + our_fee + fee + rush_irt) - int(P_round),
                effective_rate=float((P_round - rush_irt - fee) / A),
                buf_pct=float(buf_pct), cost=int(C), margin=int(margin))

rows = []
for rush in ('normal', 'fast', 'express'):
    rows.append(price(100, True, rush))
rows.append(price(100, True, 'normal', method='card_to_card'))
rows.append(price(50, False, 'normal'))
for r in rows:
    print(json.dumps(r, ensure_ascii=False))
print('\nNote: check = components - total (rounding of int() casts only; must be within +-3 IRT).')
print('Quote-lock drift example: if USDT moves +1.0 % during a 30-min lock the replacement cost of a $100 card rises by',
      int(price(100, True, 'normal')['cost'] * 0.01), 'IRT (already inside the volatility buffer).')
