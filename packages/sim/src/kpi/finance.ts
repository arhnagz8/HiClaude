/** Financial-performance metrics over monthly series (pure): break-even, runway, drawdown, ROI, payback, real/USD conversion. */
import { percentile, safeDiv, sum } from '../demand/common'

export interface MonthlyPoint {
  /** "1405-07" or ISO month key */
  key: string
  /** epoch ms of the period end */
  to: number
  netProfitIrt: number
  operatingProfitIrt?: number
  equityIrt?: number
  cashIrt?: number
}

/**
 * Break-even month: first month with a positive result that stays non-negative for the following `hold` months
 * (default 2; fewer if the series ends first). `null` when never.
 */
export function breakEvenMonth(points: readonly MonthlyPoint[], pick: 'net' | 'operating' = 'net', hold = 2): MonthlyPoint | null {
  const v = (p: MonthlyPoint): number => (pick === 'operating' ? p.operatingProfitIrt ?? p.netProfitIrt : p.netProfitIrt)
  for (let i = 0; i < points.length; i++) {
    if (v(points[i] as MonthlyPoint) <= 0) continue
    let ok = true
    for (let j = i + 1; j <= Math.min(points.length - 1, i + hold); j++) if (v(points[j] as MonthlyPoint) < 0) ok = false
    if (ok) return points[i] as MonthlyPoint
  }
  return null
}

/** First month where cumulative net profit turns positive and stays so (cumulative payback of operating losses). */
export function cumulativeBreakEvenMonth(points: readonly MonthlyPoint[]): MonthlyPoint | null {
  let cum = 0
  const c: number[] = []
  for (const p of points) {
    cum += p.netProfitIrt
    c.push(cum)
  }
  for (let i = 0; i < points.length; i++) if (c.slice(i).every((x) => x >= 0) && c[i]! > 0) return points[i] as MonthlyPoint
  return null
}

/** Runway in days: cash / average daily burn (burn = −mean net cash flow). Infinity when not burning. */
export function runwayDays(cashIrt: number, avgDailyNetCashFlowIrt: number): number {
  if (avgDailyNetCashFlowIrt >= 0) return Infinity
  return Math.max(0, cashIrt / -avgDailyNetCashFlowIrt)
}

/** Maximum peak-to-trough decline of a series (absolute and fraction of the peak; peak ≥ 0 reference). */
export function maxDrawdown(series: readonly number[]): { absolute: number; fraction: number; peakIndex: number; troughIndex: number } {
  let peak = -Infinity
  let peakIdx = 0
  let best = { absolute: 0, fraction: 0, peakIndex: 0, troughIndex: 0 }
  for (let i = 0; i < series.length; i++) {
    const x = series[i] as number
    if (x > peak) {
      peak = x
      peakIdx = i
    }
    const dd = peak - x
    if (dd > best.absolute) best = { absolute: dd, fraction: peak > 0 ? dd / peak : 0, peakIndex: peakIdx, troughIndex: i }
  }
  return best
}

/** ROI on contributed capital = (ending equity + cumulative draws − contributed capital) / contributed capital. */
export function roiOnCapital(endingEquityIrt: number, cumulativeDrawsIrt: number, contributedCapitalIrt: number): number {
  return safeDiv(endingEquityIrt + cumulativeDrawsIrt - contributedCapitalIrt, contributedCapitalIrt)
}

/** Months until cumulative net profit repays contributed capital (null if never). */
export function capitalPaybackMonths(points: readonly MonthlyPoint[], contributedCapitalIrt: number): number | null {
  let cum = 0
  for (let i = 0; i < points.length; i++) {
    cum += (points[i] as MonthlyPoint).netProfitIrt
    if (cum >= contributedCapitalIrt) return i + 1
  }
  return null
}

/** Real (inflation-adjusted) Toman at start-date prices: nominal / index(t) (index = 1 at start). */
export const toRealIrt = (nominalIrt: number, inflationIndex: number): number => safeDiv(nominalIrt, inflationIndex, nominalIrt)
/** USD view at a mid rate (Toman per USDT≈USD). */
export const toUsd = (irt: number, irtPerUsd: number): number => safeDiv(irt, irtPerUsd)

/** Compound annual growth rate from first to last value over `years`. */
export function cagr(first: number, last: number, years: number): number {
  if (first <= 0 || last <= 0 || years <= 0) return 0
  return Math.pow(last / first, 1 / years) - 1
}

/** Simple summary of a numeric series for tornado/sensitivity tables. */
export function describe(xs: readonly number[]): { n: number; mean: number; p10: number; p50: number; p90: number; min: number; max: number } {
  return { n: xs.length, mean: xs.length ? sum(xs) / xs.length : 0, p10: percentile(xs, 10), p50: percentile(xs, 50), p90: percentile(xs, 90), min: xs.length ? Math.min(...xs) : 0, max: xs.length ? Math.max(...xs) : 0 }
}
