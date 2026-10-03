#!/usr/bin/env python3
"""
Research 08 (macro-fx-scenarios): calibration of the simulator's macro layer.

Usage:  python3 scripts/research/macro_calibration.py            # print the calculations only
        python3 scripts/research/macro_calibration.py --write    # also (re)write data/fx_history.json,
                                                                  data/macro_calibration.json, data/calendar_ir.json,
                                                                  data/scenarios/*.json

Pure standard library (no numpy). Deterministic: every random draw uses random.Random(seed).

WHAT THIS SCRIPT DOES (and does not)
  * Takes the dated USDT/IRT (and free-market USD) ANCHOR points found in this run's search summaries and the
    repo's earlier research files (anchors list below, each with a source id), converts them to Toman,
    computes interval log returns, annualised drift, a residual-volatility estimate and episode statistics.
  * It has NO daily series (search budget exhausted, exchange hosts blocked), so daily volatility, skew, kurtosis,
    autocorrelation and weekday effects are NOT measured. They are model parameters tuned so that a Monte-Carlo of
    the regime model reproduces the measured multi-day moves (30d, 90d, 3-day crash, 25-day grind) - see mc_check().
    Every such parameter is exported with confidence=low and a verify_how that says how to replace it with data.
  * Provides the Jalali <-> Gregorian conversion and a tabular Islamic calendar used for the holiday projection
    (lunar holidays are projected +-1 day; they depend on moon sighting and must be re-verified yearly).
"""
from __future__ import annotations

import json
import math
import random
import sys
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
AS_OF = "2026-10-02"

# ----------------------------------------------------------------------------------------------------------------
# 1. ANCHORS  (toman per USD/USDT).  src ids -> SOURCES below.  kind: observed | derived | recollection
# ----------------------------------------------------------------------------------------------------------------
# series: "usd" = free-market cash dollar, "usdt" = USDT/IRT exchange quote.  value_toman = rial/10 where the source quotes rials.
A = []


def anchor(d, toman, series, src, conf, note="", kind="observed", rial=None):
    A.append(dict(date=d, toman=toman, series=series, src=src, confidence=conf, note=note, kind=kind, quoted_rial=rial))


anchor("2018-07-29", 11200, "usd", "S01", "medium", "record low at the time ('112,000 rial'); open market", rial=112000)
anchor("2018-12-31", 13500, "usd", "S02", "medium", "year-end open-market rate from the Wikipedia 'Iranian rial' table (per search summary)", rial=135000)
anchor("2020-12-31", 25394, "usd", "S02", "medium", "year-end open-market rate, Wikipedia table (per search summary)", rial=253940)
anchor("2022-12-31", 42700, "usd", "S02", "medium", "year-end open-market rate, Wikipedia table (per search summary)", rial=427000)
anchor("2025-01-01", 80000, "usd", "S15", "low", "DERIVED: Dec-2025 close 1.45M rial and 'lost almost 45 % against the dollar in 2025' => 1.45M x (1-0.45) ~ 0.80M rial; conflicts with the analyst recollection 70-72k (see unverified_recollections)", kind="derived")
anchor("2025-04-20", 83190, "usd", "S18", "low", "nabzebourse title 'dollar and euro today Sunday 31 Farvardin 1404'; 831,900 rial per search summary", rial=831900)
anchor("2025-06-19", 93800, "usd", "S16", "low", "938,000 rial, +3.65 % in one day (+33,000 rial) during the June-2025 war; low-quality aggregator in the search result", rial=938000)
anchor("2025-10-15", 95000, "usd", "S10", "low", "'about 95,000 tomans last October' (Intellinews text); day within October unknown, 15 Oct used as midpoint", rial=950000)
anchor("2025-12-01", 125000, "usd", "S15", "low", "'early December 2025 ... nearing 1,250,000 rial' (New Arab summary); exact day unknown", rial=1250000)
anchor("2025-12-31", 145000, "usd", "S15", "medium", "'record low 1.45 million per dollar' at end-2025 (The Corner; also consistent with S05 early-Jan 1.47M)", rial=1450000)
anchor("2026-01-06", 147000, "usd", "S05", "medium", "Iran International 2026-01-06: about 1.47 million rials", rial=1470000)
anchor("2026-01-27", 150000, "usd", "S05", "medium", "Al Jazeera 2026-01-27: record 1,500,000 rials", rial=1500000)
anchor("2026-02-20", 163640, "usd", "S06", "medium", "nabzebourse 'dollar and euro Friday 1 Esfand 1404': 1,636,400 rial", rial=1636400)
anchor("2026-02-28", 174950, "usd", "S03", "medium", "Intellinews: intraday record 1,749,500 rial on the day of the US-Israeli strikes; CONFLICT with S04 (end-of-Feb 1.66M) - see conflicts", rial=1749500)
anchor("2026-02-28", 166000, "usd", "S04", "medium", "Bloomberg/AP-type summary: 1.66 million at the end of February (close vs S03 intraday peak)", rial=1660000)
anchor("2026-03-31", 155000, "usd", "S04", "medium", "same source: 1.55 million at the end of March (after the early-war rally reversed)", rial=1550000)
anchor("2026-04-16", 152950, "usd", "S07", "low", "bankavl.com 'Thursday 27 Farvardin 1405': 152,950 toman (one summary)")
anchor("2026-04-26", 154699, "usdt", "S08", "low", "nabzebourse 'Tether today 6 Ordibehesht 1405' +1.28 %: 154,699 (one summary)")
anchor("2026-04-29", 180000, "usd", "S04", "medium", "record 1.8 million after the US naval blockade; 'down about 12 % this week', slide began two days earlier", rial=1800000)
anchor("2026-05-11", 181397, "usdt", "S08", "low", "nabzebourse 'Tether today Monday 21 Ordibehesht 1405' +2.54 % on the day: 181,397 (one summary)")
anchor("2026-07-02", 176679, "usdt", "S11", "low", "Tabdeal Academy 11 Tir 1405 (via file 06 F31; single source)")
anchor("2026-07-22", 183400, "usd", "S14", "low", "Intellinews/Al Jazeera July 2026: 'about IRR 1,834,000'; exact day uncertain (22 Jul used because the CPI datum quoted next to it is of that date)", rial=1834000)
anchor("2026-08-26", 200000, "usd", "S09", "medium", "Al Jazeera 2026-08-26: one dollar now costs 2 million rials", rial=2000000)
anchor("2026-08-31", 207597, "usdt", "S11", "medium", "Tabdeal 9 Shahrivar 1405; two sources within 0.7 % (file 06 F32)")
anchor("2026-09-02", 220000, "usd", "S09", "medium", "Al Arabiya 2026-09-02: new low of 2.2 million rials", rial=2200000)
anchor("2026-09-05", 225000, "usd", "S09", "medium", "Iran International 2026-09-05: record 2.25 million rials", rial=2250000)
anchor("2026-09-30", 258190, "usdt", "S11", "medium", "Nobitex Mag 8 Mehr 1405 (+ four media per file 06 F33); Nobitex 258,901")
anchor("2026-10-02", 258465, "usd", "S12", "medium", "free-market USD, latest registered, other quotes 258,500 / 258,520 / 259,900 (file 07 F01)")
anchor("2026-10-02", 256900, "usdt", "S12", "medium", "USDT price 10 Mehr 1405 (file 07 F02); venue median 257,820, Nobitex 256,500, Wallex 255,709, min 250,000, max 269,509 (file 02 F24)")

UNVERIFIED_RECOLLECTIONS = [
    # NOT used in any computation below except the sensitivity row 'cagr_with_recollections'.
    dict(date="2019-12-31", toman=13500, note="analyst recollection: 2019 was a flat year around 11-14k; plausible but not sourced in this run"),
    dict(date="2021-12-31", toman=27000, note="analyst recollection (270k rial); not sourced"),
    dict(date="2023-12-31", toman=51000, note="analyst recollection (about 500-530k rial); not sourced"),
    dict(date="2024-12-31", toman=71000, note="analyst recollection (about 700-720k rial); conflicts with the DERIVED 2025-01-01 anchor 80,000"),
]

SOURCES = {
    "S01": ("https://www.business-standard.com/amp/article/pti-stories/iran-s-currency-in-free-fall-as-american-sanctions-loom-118072900484_1.html", "Business Standard/PTI 2018-07-29: rial record low 112,000 to a dollar", "per search summary"),
    "S02": ("https://en.wikipedia.org/wiki/Iranian_rial", "Wikipedia - Iranian rial (historical open-market table: 2018 135,000; 2020 253,940; 2022 427,000)", "per search summary"),
    "S03": ("https://www.intellinews.com/iran-s-rial-hits-record-low-of-irr1-749-500-against-dollar-as-israeli-strikes-send-currency-into-freefall-428654/", "Intellinews: rial record low IRR 1,749,500 as strikes send currency into freefall (28 Feb 2026)", "per search summary"),
    "S04": ("https://www.bloomberg.com/news/articles/2026-04-29/us-naval-blockade-pushes-iran-s-currency-to-record-low", "Bloomberg 2026-04-29 US naval blockade pushes Iran's currency to record low (also AP via Dawn/Al Arabiya/BNN: 1.66M end-Feb, 1.55M end-Mar, 1.8M record, -12 % week)", "per search summary"),
    "S05": ("https://www.aljazeera.com/news/2026/1/27/irans-currency-drops-to-record-low-against-dollar-as-tensions", "Al Jazeera 2026-01-27 record low 1.5M; Iran International 2026-01-06 1.47M (https://www.iranintl.com/en/202601061682)", "per search summary"),
    "S06": ("https://nabzebourse.com/fa/news/126304/قیمت-دلار-و-قیمت-یورو-جمعه-1-اسفند-1404", "Nabzebourse: dollar and euro price Friday 1 Esfand 1404 (1,636,400 rial)", "per search summary"),
    "S07": ("https://bankavl.com/", "Bankavl: latest free-market dollar price Thursday 27 Farvardin 1405 = 152,950 toman", "per search summary"),
    "S08": ("https://nabzebourse.com/fa/news/129504/قیمت-تتر-امروز-دوشنبه-21-اردیبهشت-1405", "Nabzebourse: Tether price 21 Ordibehesht 1405 (181,397) and 6 Ordibehesht 1405 (154,699)", "per search summary"),
    "S09": ("https://www.aljazeera.com/economy/2026/8/26/one-us-dollar-now-costs-2-million-rials-in-iran-and-heres-what-it-can-buy", "Al Jazeera 2026-08-26 (2M); Al Arabiya 2026-09-02 (2.2M); Iran International 2026-09-05 (2.25M)", "per search summary"),
    "S10": ("https://intellinews.com/iran-s-rial-slides-past-2mn-per-dollar-on-open-market-463093", "Intellinews: rial slides past 2mn per dollar (203,100 toman; 'about 95,000 tomans last October')", "per search summary"),
    "S11": ("https://nobitex.ir/mag/news-tether-price-2026-09-30/", "Nobitex Mag 2026-09-30 (258,190); Tabdeal Academy 9 Shahrivar (207,597) and 11 Tir (176,679) - via docs/03-research/06-service-catalog.md F31-F33", "per search summary / repo file"),
    "S12": ("docs/03-research/07-ir-competitors.md", "Repo file 07 F01-F03 (USD 258,465; USDT 256,900; official 174,704) and file 02 F24 (venue quotes)", "repo file (itself per search summary)"),
    "S14": ("https://www.nst.com.my/amp/business/economy/2026/06/1474746/iran-stats-agency-says-year-year-inflation-hits-886-cent", "NST/Reuters: Iran stats agency says y/y inflation 88.6 % (June 2026); other summaries: 83.9 % at 22 July; 73.5 % (21 Mar-20 Apr)", "per search summary"),
    "S15": ("https://thecorner.eu/?p=123749", "The Corner: rial loses almost 45 % against the dollar in 2025, 1.45M record (also New Arab: early Dec 1.25M)", "per search summary"),
    "S16": ("https://scode.it.com/iranwars11/price-of-dollar-in-iran.html", "Aggregator summary: 19 Jun 2025 open-market 938,000 rial, +3.65 % in a day (LOW quality)", "per search summary"),
    "S18": ("https://nabzebourse.com/fa/news/98528/قیمت-دلار-و-یورو-امروز-یکشنبه-۳۱-فروردین-۱۴۰۴", "Nabzebourse: dollar and euro today Sunday 31 Farvardin 1404", "per search summary"),
}


def d(s):
    return date.fromisoformat(s)


# ----------------------------------------------------------------------------------------------------------------
# 2. Jalali + Islamic calendars
# ----------------------------------------------------------------------------------------------------------------
_BREAKS = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178]


def _jal_cal(jy):
    gy = jy + 621
    leap_j = -14
    jp = _BREAKS[0]
    jump = 0
    for i in range(1, len(_BREAKS)):
        jm = _BREAKS[i]
        jump = jm - jp
        if jy < jm:
            break
        leap_j += jump // 33 * 8 + (jump % 33) // 4
        jp = jm
    n = jy - jp
    leap_j += n // 33 * 8 + (n % 33 + 3) // 4
    if jump % 33 == 4 and jump - n == 4:
        leap_j += 1
    leap_g = gy // 4 - (gy // 100 + 1) * 3 // 4 - 150
    march = 20 + leap_j - leap_g
    if jump - n < 6:
        n = n - jump + (jump + 4) // 33 * 33
    leap = ((n + 1) % 33 - 1) % 4
    if leap == -1:
        leap = 4
    return leap, gy, march


def j2g(jy, jm, jd_):
    _, gy, march = _jal_cal(jy)
    return date(gy, 3, march) + timedelta(days=(jm - 1) * 31 - (jm // 7) * (jm - 7) + jd_ - 1)


def g2j(g: date):
    jy = g.year - 621
    if g < j2g(jy, 1, 1):
        jy -= 1
    off = (g - j2g(jy, 1, 1)).days
    if off < 186:
        return jy, off // 31 + 1, off % 31 + 1
    off -= 186
    return jy, off // 30 + 7, off % 30 + 1


def is_jalali_leap(jy):
    return _jal_cal(jy)[0] == 0


JAL_MONTHS = ["Farvardin", "Ordibehesht", "Khordad", "Tir", "Mordad", "Shahrivar", "Mehr", "Aban", "Azar", "Dey", "Bahman", "Esfand"]
JAL_MONTHS_FA = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"]


def islamic_to_g(hy, hm, hd, shift=0):
    """Tabular (civil) Islamic calendar; Iran's official dates follow moon sighting, so the result may be off by +-1 day."""
    jd = hd + math.ceil(29.5 * (hm - 1)) + (hy - 1) * 354 + (3 + 11 * hy) // 30 + 1948439.5 - 1
    jdn = math.floor(jd + 0.5)
    return date.fromordinal(jdn - 1721425) + timedelta(days=shift)


# ----------------------------------------------------------------------------------------------------------------
# 3. Anchor statistics
# ----------------------------------------------------------------------------------------------------------------
def series_for_stats():
    """One observation per date; when two quotes exist the USD-free/high one is replaced by the mean (S03/S04 pair)."""
    by = {}
    for a in A:
        by.setdefault(a["date"], []).append(a["toman"])
    pts = sorted((d(k), math.exp(sum(math.log(x) for x in v) / len(v))) for k, v in by.items())
    return pts


def interval_table(pts):
    rows = []
    for (d0, p0), (d1, p1) in zip(pts, pts[1:]):
        dt = (d1 - d0).days
        if dt <= 0:
            continue
        r = math.log(p1 / p0)
        rows.append(dict(d0=d0.isoformat(), d1=d1.isoformat(), days=dt, pct=100 * (p1 / p0 - 1), logret=r, ann_drift=r / dt * 365))
    return rows


def residual_vol(rows, lo="2025-04-01"):
    """Std of (r - mu*dt)/sqrt(dt) over intervals of 2..90 days starting at/after `lo` (pooled drift mu). Includes jump/regime variation."""
    sel = [r for r in rows if r["d0"] >= lo and 2 <= r["days"] <= 90]
    tot_r = sum(r["logret"] for r in sel)
    tot_t = sum(r["days"] for r in sel)
    mu = tot_r / tot_t
    z = [(r["logret"] - mu * r["days"]) / math.sqrt(r["days"]) for r in sel]
    m = sum(z) / len(z)
    sd = math.sqrt(sum((x - m) ** 2 for x in z) / (len(z) - 1))
    return mu, sd, len(sel)


# ----------------------------------------------------------------------------------------------------------------
# 4. Regime model (matches packages/sim/src/macro/types.ts) + Monte Carlo
# ----------------------------------------------------------------------------------------------------------------
REG = ["calm", "stress", "crisis", "recovery"]
# daily log-return parameters. drift_daily is the expected TOTAL log return (jump-compensated, as the simulator defines it).
PARAMS = {
    "calm":     dict(vol=0.0070, drift=0.00070, jump_rate=3.0,  jump_mean=0.030, jump_sd=0.020),
    "stress":   dict(vol=0.0160, drift=0.00200, jump_rate=8.0,  jump_mean=0.040, jump_sd=0.030),
    "crisis":   dict(vol=0.0350, drift=0.00900, jump_rate=25.0, jump_mean=0.050, jump_sd=0.040),
    "recovery": dict(vol=0.0150, drift=-0.00250, jump_rate=2.0, jump_mean=-0.025, jump_sd=0.020),
}
TRANS = {
    "calm":     {"calm": 0.9830, "stress": 0.0130, "crisis": 0.0010, "recovery": 0.0030},
    "stress":   {"calm": 0.0300, "stress": 0.9500, "crisis": 0.0150, "recovery": 0.0050},
    "crisis":   {"calm": 0.0000, "stress": 0.0800, "crisis": 0.8700, "recovery": 0.0500},
    "recovery": {"calm": 0.0500, "stress": 0.0150, "crisis": 0.0050, "recovery": 0.9300},
}


def stationary(trans):
    p = {r: (1.0 if r == "calm" else 0.0) for r in REG}
    for _ in range(20000):
        q = {r: 0.0 for r in REG}
        for a in REG:
            for b in REG:
                q[b] += p[a] * trans[a][b]
        p = q
    return p


def poisson(rng, lam):
    if lam <= 0:
        return 0
    L = math.exp(-lam)
    k, p = 0, 1.0
    while True:
        k += 1
        p *= rng.random()
        if p <= L:
            return k - 1


def simulate(n_days, seed, params=PARAMS, trans=TRANS, start="calm", weekday_vol=None, start_date=date(2026, 10, 2)):
    rng = random.Random(seed)
    reg = start
    x = 0.0
    out = [0.0]
    regs = [reg]
    for t in range(n_days):
        p = params[reg]
        lam = p["jump_rate"] / 365.0
        k = poisson(rng, lam)
        jump = sum(rng.gauss(p["jump_mean"], p["jump_sd"]) for _ in range(k))
        comp = lam * (math.exp(p["jump_mean"] + 0.5 * p["jump_sd"] ** 2) - 1)  # jump compensation (approx., small)
        vol = p["vol"]
        if weekday_vol is not None:
            vol *= weekday_vol[(start_date + timedelta(days=t)).weekday()]
        diff = (p["drift"] - lam * p["jump_mean"]) + vol * rng.gauss(0, 1)
        x += diff + jump
        out.append(x)
        regs.append(reg)
        u = rng.random()
        c = 0.0
        for b in REG:
            c += trans[reg][b]
            if u <= c:
                reg = b
                break
    return out, regs


def quantile(xs, q):
    s = sorted(xs)
    i = q * (len(s) - 1)
    lo, hi = int(math.floor(i)), int(math.ceil(i))
    return s[lo] + (s[hi] - s[lo]) * (i - lo)


def moments(xs):
    n = len(xs)
    m = sum(xs) / n
    v = sum((x - m) ** 2 for x in xs) / n
    sd = math.sqrt(v)
    sk = sum((x - m) ** 3 for x in xs) / n / sd ** 3
    ku = sum((x - m) ** 4 for x in xs) / n / sd ** 4 - 3
    return m, sd, sk, ku


def mc_check(n_paths=400, years=3, seed0=1000, **kw):
    n_days = int(365 * years)
    daily = []
    h30, h90, h3, h25, dd_list, final = [], [], [], [], [], []
    share = {r: 0 for r in REG}
    tot = 0
    for i in range(n_paths):
        path, regs = simulate(n_days, seed0 + i, **kw)
        r = [path[j + 1] - path[j] for j in range(n_days)]
        daily.extend(r)
        for j in range(0, n_days - 90, 7):
            h30.append(math.exp(path[j + 30] - path[j]) - 1)
            h90.append(math.exp(path[j + 90] - path[j]) - 1)
            h3.append(math.exp(path[j + 3] - path[j]) - 1)
            h25.append(math.exp(path[j + 25] - path[j]) - 1)
        peak = -1e9
        dd = 0.0
        for v in path:
            peak = max(peak, v)
            dd = min(dd, math.exp(v - peak) - 1)
        dd_list.append(dd)
        final.append(math.exp(path[-1]) - 1)
        for g in regs:
            share[g] += 1
            tot += 1
    # lag-1 autocorrelation of daily returns
    m = sum(daily) / len(daily)
    num = sum((daily[i] - m) * (daily[i + 1] - m) for i in range(len(daily) - 1))
    den = sum((x - m) ** 2 for x in daily)
    mm, sd, sk, ku = moments(daily)
    return dict(
        daily_mean=mm, daily_sd=sd, daily_skew=sk, daily_excess_kurtosis=ku, lag1_autocorr=num / den,
        p_30d_ge_23_55=sum(1 for x in h30 if x >= 0.2355) / len(h30),
        p_90d_ge_46_1=sum(1 for x in h90 if x >= 0.461) / len(h90),
        p_3d_ge_13_6=sum(1 for x in h3 if x >= 0.136) / len(h3),
        p_25d_ge_14_8=sum(1 for x in h25 if x >= 0.148) / len(h25),
        p_30d_le_minus_10=sum(1 for x in h30 if x <= -0.10) / len(h30),
        h30_q=[quantile(h30, q) for q in (0.05, 0.25, 0.5, 0.75, 0.95)],
        h90_q=[quantile(h90, q) for q in (0.05, 0.25, 0.5, 0.75, 0.95)],
        median_max_drawdown=quantile(dd_list, 0.5), p05_max_drawdown=quantile(dd_list, 0.05),
        median_3y_change=quantile(final, 0.5), p10_3y_change=quantile(final, 0.1), p90_3y_change=quantile(final, 0.9),
        regime_share={r: share[r] / tot for r in REG},
    )


# ----------------------------------------------------------------------------------------------------------------
# 5. Inflation inputs (all per search summary)
# ----------------------------------------------------------------------------------------------------------------
CPI_POINTS = [  # (as_of, y/y %, source, conf, note)
    ("2025-12-31", 52.6, "S14", "low", "'In December 2025 inflation had risen by 52.6 % y/y' (search summary)"),
    ("2026-02-28", 68.0, "S14", "low", "'year on year inflation stood at 68 % in February' (search summary)"),
    ("2026-04-20", 73.5, "S14", "low", "'consumer prices increased 73.5 % between 21 Mar and 20 Apr vs the same period a year earlier' (Caliber.az summary)"),
    ("2026-06-30", 88.6, "S14", "medium", "Statistical Centre of Iran 88.6 % y/y (Reuters via NST); Central Bank of Iran reported 83.1 % for the same period (conflict)"),
    ("2026-07-22", 83.9, "S14", "low", "'By July 22 the CPI was 83.9 % above its year-earlier level' (summary; probably a different measure/period than 88.6)"),
]


def cpi_hedge_table():
    """USD (free market) vs CPI over matched windows: how an USD-denominated asset behaved as an inflation hedge."""
    rows = []
    def p(ds):
        for a in A:
            if a["date"] == ds and a["series"] == "usd":
                return a["toman"]
        raise KeyError(ds)
    # window 1: 2025-10-15 -> 2026-09-30/10-02 (usd) ; CPI y/y June 88.6 / July 83.9 as proxy for the 12m price change
    usd_chg = p("2026-10-02") / p("2025-10-15") - 1
    rows.append(dict(window="2025-10-15 to 2026-10-02 (~11.5 months)", usd_pct=100 * usd_chg, cpi_proxy_pct=84.0, comment="CPI proxy = y/y 83.9-88.6 pct (June-July 2026); USD beat CPI by roughly +{:.0f} pp".format(100 * usd_chg - 84.0)))
    usd_chg2 = p("2026-10-02") / p("2025-04-20") - 1
    rows.append(dict(window="2025-04-20 to 2026-10-02 (~17.5 months)", usd_pct=100 * usd_chg2, cpi_proxy_pct=None, comment="no matching cumulative CPI figure found; Apr-2025 CPI y/y level also not found"))
    usd_ytd = p("2026-10-02") / p("2025-12-31") - 1
    rows.append(dict(window="2025-12-31 to 2026-10-02 (9 months)", usd_pct=100 * usd_ytd, cpi_proxy_pct=None, comment="CPI y/y rose 52.6 -> ~84-89 over the same months"))
    return rows


# ----------------------------------------------------------------------------------------------------------------
# 6. main
# ----------------------------------------------------------------------------------------------------------------

def interpolated_daily(lo="2025-04-20", hi="2026-10-02"):
    """Log-linear interpolation between sourced anchors (one value per date). THIS IS NOT DATA: it carries drift/episodes but
    understates day-to-day noise; used only to count how often 30d / 90d windows exceeded a threshold in the recent era."""
    pts = [(a, b) for a, b in series_for_stats() if lo <= a.isoformat() <= hi]
    out = {}
    for (d0, p0), (d1, p1) in zip(pts, pts[1:]):
        n = (d1 - d0).days
        for k in range(n):
            out[d0 + timedelta(days=k)] = p0 * (p1 / p0) ** (k / n)
    out[pts[-1][0]] = pts[-1][1]
    return out


def empirical_windows(lo="2025-04-20", hi="2026-10-02"):
    ser = interpolated_daily(lo, hi)
    days = sorted(ser)
    res = {}
    for w, thr in ((3, 0.136), (25, 0.148), (30, 0.2355), (90, 0.461)):
        n = 0
        hit = 0
        chg = []
        for i in range(len(days) - w):
            c = ser[days[i + w]] / ser[days[i]] - 1
            chg.append(c)
            n += 1
            hit += c >= thr
        res[w] = dict(n=n, p_ge=hit / n, median=quantile(chg, 0.5), p90=quantile(chg, 0.9), p10=quantile(chg, 0.1))
    return res


# alternative switching matrix for the recent (2025-04..2026-10) era: more time in stress/crisis, same regime physics
TRANS_RECENT = {
    "calm":     {"calm": 0.9700, "stress": 0.0250, "crisis": 0.0020, "recovery": 0.0030},
    "stress":   {"calm": 0.0150, "stress": 0.9650, "crisis": 0.0150, "recovery": 0.0050},
    "crisis":   {"calm": 0.0000, "stress": 0.0900, "crisis": 0.8900, "recovery": 0.0200},
    "recovery": {"calm": 0.0400, "stress": 0.0200, "crisis": 0.0100, "recovery": 0.9300},
}


def main(write=False):
    pts = series_for_stats()
    rows = interval_table(pts)
    print("== interval log-returns from anchors ==")
    for r in rows:
        print(f"{r['d0']} -> {r['d1']} {r['days']:5d}d {r['pct']:+7.2f}%  ann.log-drift {r['ann_drift']*100:+7.1f}%/yr")
    first = [a for a in A if a["date"] == "2018-12-31"][0]["toman"]
    last = 257500.0
    yrs = (d("2026-10-02") - d("2018-12-31")).days / 365
    cagr_log = math.log(last / first) / yrs
    print(f"CAGR 2018-12-31 -> 2026-10-02: log {cagr_log*100:.1f}%/yr  simple {100*(math.exp(cagr_log)-1):.1f}%/yr  (x{last/first:.1f})")
    # sourced-only sub-periods
    sub = [("2018-12-31", "2020-12-31"), ("2020-12-31", "2022-12-31"), ("2022-12-31", "2025-04-20"), ("2025-04-20", "2025-12-31"), ("2025-12-31", "2026-10-02")]
    sub_out = []
    def val(ds):
        v = [a["toman"] for a in A if a["date"] == ds and a["series"] == "usd"]
        return sum(v) / len(v)
    print("== sub-period annualised depreciation (simple, % per year) ==")
    for a, b in sub:
        y = (d(b) - d(a)).days / 365
        g = (val(b) / val(a)) ** (1 / y) - 1
        sub_out.append(dict(from_=a, to=b, years=round(y, 3), annual_pct=100 * g, total_pct=100 * (val(b) / val(a) - 1)))
        print(f"{a} -> {b}: {y:.2f}y total {100*(val(b)/val(a)-1):+.1f}% annualised {100*g:+.1f}%")
    mu, sd, n = residual_vol(rows)
    print(f"residual vol over {n} intervals since 2025-04: pooled drift {mu*100:.3f}%/day, sigma_hat {sd*100:.3f}%/day (jump+regime-contaminated upper bound)")
    # event-window stats
    ev = {
        "crash_3d_2026-04-26_to_04-29": (180000 / 154699 - 1),
        "war_rally_2026-01-27_to_02-28": (166000 / 150000 - 1),
        "post_war_retrace_2026-02-28_to_03-31": (155000 / 166000 - 1),
        "post_war_retrace_vs_intraday_peak": (155000 / 174950 - 1),
        "sep_grind_2026-08-26_to_09-05": (225000 / 200000 - 1),
        "last_30d_2026-08-31_to_09-30": (258190 / 207597 - 1),
        "last_90d_2026-07-02_to_09-30": (258190 / 176679 - 1),
        "usd_oct2025_to_oct2026": (258465 / 95000 - 1),
    }
    print("== event windows ==")
    for k, v in ev.items():
        print(f"{k}: {100*v:+.1f}%")
    # premium USDT vs cash dollar and official gap
    prem_usdt_vs_cash = 256900 / 258465 - 1
    off_gap = 258465 / 174704 - 1
    print(f"USDT vs cash USD (2026-10-02): {100*prem_usdt_vs_cash:+.2f}%   free USD vs official exchange-centre sell: {100*off_gap:+.2f}%")
    venue_disp = (269509 / 257820 - 1, 250000 / 257820 - 1)
    print(f"venue dispersion vs median: max {100*venue_disp[0]:+.2f}% min {100*venue_disp[1]:+.2f}%")
    # model
    st = stationary(TRANS)
    drift_ann = sum(st[r] * PARAMS[r]["drift"] for r in REG) * 365
    print("stationary regime shares:", {k: round(v, 3) for k, v in st.items()}, f"implied mean log drift {100*drift_ann:.1f}%/yr (simple {100*(math.exp(drift_ann)-1):.1f}%), observed sourced CAGR log {cagr_log*100:.1f}%")
    dur = {r: 1 / (1 - TRANS[r][r]) for r in REG}
    print("expected regime durations (days):", {k: round(v, 1) for k, v in dur.items()})
    mc = mc_check(weekday_vol=WEEKDAY_VOL)
    print("== Monte-Carlo check (400 paths x 3y, weekday vol on) ==")
    for k, v in mc.items():
        print(k, v if not isinstance(v, float) else round(v, 5))
    emp = empirical_windows()
    print("== empirical (interpolated anchors, 2025-04-20..2026-10-02) ==")
    for w, v in emp.items():
        print(w, {k: round(x, 4) for k, x in v.items()})
    st2 = stationary(TRANS_RECENT)
    d2 = sum(st2[r] * PARAMS[r]["drift"] for r in REG) * 365
    print("recent-era stationary", {k: round(v, 3) for k, v in st2.items()}, f"mean log drift {100*d2:.1f}%/yr")
    mc2 = mc_check(trans=TRANS_RECENT, weekday_vol=WEEKDAY_VOL, years=1.5)
    for k in ("p_30d_ge_23_55", "p_90d_ge_46_1", "p_3d_ge_13_6", "p_25d_ge_14_8", "median_3y_change", "median_max_drawdown"):
        print("recent-era MC", k, round(mc2[k], 4))
    hedge = cpi_hedge_table()
    for h in hedge:
        print(h)


WEEKDAY_VOL = None  # set below (python weekday(): Mon=0 ... Sun=6)
# Persian-week reading (Sat..Fri) -> python weekday index: Sat=5, Sun=6, Mon=0, Tue=1, Wed=2, Thu=3, Fri=4
# Defaults of packages/sim use JS index (Sun=0..Sat=6): [1.05,1.05,1.05,1.05,0.95,0.75,1.10]
_js = [1.05, 1.05, 1.05, 1.05, 0.95, 0.75, 1.10]
WEEKDAY_VOL = [_js[(wd + 1) % 7] for wd in range(7)]  # python Mon(0) -> JS Mon(1)

if __name__ == "__main__":
    # write step is implemented in scripts/research/macro_build.py to keep this file readable
    wr = "--write" in sys.argv
    if wr:
        sys.argv = [a for a in sys.argv if a != "--write"]
        main(write=False)
        sys.path.insert(0, str(Path(__file__).parent))
        import macro_build
        macro_build.run()
    else:
        main(write=False)
