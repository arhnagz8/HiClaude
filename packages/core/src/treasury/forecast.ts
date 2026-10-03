/**
 * forecastDemand — daily USDT consumption forecast: weekday seasonality + EMA level.
 *
 * history: `{ day: 'YYYY-MM-DD' (IRST), usdtConsumedMicro }` — gaps between the first and last day count as ZERO consumption.
 * 1. weekday factors (index = JS weekday, 0 = Sunday): mean(weekday)/mean(all), only with ≥ 14 days and ≥ 2 samples per weekday, clamped to
 *    [0.2, 3] and normalised to mean 1 (otherwise all 1);
 * 2. de-seasonalise, then EMA with α = 2/(N+1), N = `forecastEmaDays` (seeded with the mean of the first N values);
 * 3. `dailyMicro` = EMA level (average day). `demandOn(forecast, day)` = level × factor(weekday of `day`).
 */
import { irstParts, parseIrstDate, MS, type TreasuryParams } from '@hiclaude/contracts'

export interface DemandPoint {
  day: string
  usdtConsumedMicro: number
}

export interface DemandForecast {
  /** Average daily consumption (micro-USDT), integer. */
  dailyMicro: number
  /** 7 weekday multipliers (0 = Sunday … 6 = Saturday), mean 1. */
  weekdayFactors: number[]
  sampleDays: number
  backlogMicro: number
  /** Level + backlog: what must be covered right now. */
  requiredNowMicro: number
}

export function forecastDemand(input: { history: readonly DemandPoint[]; backlogMicro: number; params: Pick<TreasuryParams, 'forecastEmaDays'> }): DemandForecast {
  const { history, backlogMicro, params } = input
  const ones = [1, 1, 1, 1, 1, 1, 1]
  if (history.length === 0) return { dailyMicro: 0, weekdayFactors: ones, sampleDays: 0, backlogMicro, requiredNowMicro: backlogMicro }
  const byDay = new Map<string, number>()
  for (const h of history) byDay.set(h.day, (byDay.get(h.day) ?? 0) + h.usdtConsumedMicro)
  const days = [...byDay.keys()].sort()
  const start = parseIrstDate(days[0] as string)
  const end = parseIrstDate(days[days.length - 1] as string)
  const series: { weekday: number; v: number }[] = []
  for (let t = start; t <= end; t += MS.day) {
    const iso = isoOf(t)
    series.push({ weekday: irstParts(t).weekday, v: byDay.get(iso) ?? 0 })
  }
  const mean = series.reduce((a, x) => a + x.v, 0) / series.length
  let factors = ones
  if (series.length >= 14 && mean > 0) {
    const sums = [0, 0, 0, 0, 0, 0, 0]
    const cnt = [0, 0, 0, 0, 0, 0, 0]
    for (const x of series) {
      sums[x.weekday] = (sums[x.weekday] as number) + x.v
      cnt[x.weekday] = (cnt[x.weekday] as number) + 1
    }
    const raw = sums.map((s, w) => ((cnt[w] as number) >= 2 ? Math.min(3, Math.max(0.2, s / (cnt[w] as number) / mean)) : 1))
    const m = raw.reduce((a, b) => a + b, 0) / 7
    factors = raw.map((f) => f / m)
  }
  const N = Math.max(1, params.forecastEmaDays)
  const alpha = 2 / (N + 1)
  const des = series.map((x) => x.v / (factors[x.weekday] as number))
  const seedN = Math.min(des.length, Math.max(1, Math.round(N)))
  let ema = des.slice(0, seedN).reduce((a, b) => a + b, 0) / seedN
  for (let i = seedN; i < des.length; i++) ema = alpha * (des[i] as number) + (1 - alpha) * ema
  const dailyMicro = Math.max(0, Math.round(ema))
  return { dailyMicro, weekdayFactors: factors, sampleDays: series.length, backlogMicro, requiredNowMicro: dailyMicro + backlogMicro }
}

function isoOf(t: number): string {
  const p = irstParts(t)
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
}

/** Expected consumption (micro-USDT) on an IRST day: level × weekday factor. */
export function demandOn(f: DemandForecast, day: string): number {
  return Math.round(f.dailyMicro * (f.weekdayFactors[irstParts(parseIrstDate(day)).weekday] as number))
}
