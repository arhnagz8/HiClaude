/**
 * Loads macro calibration. Accepts (a) the research shape of data/macro_calibration.json
 *   { usdt_irt: { spot, regimes:[{name,daily_vol,drift_daily,jump_rate_per_year,jump_mean,jump_sd}], transition_matrix, weekday_effect, inter_exchange_premium_pct }, inflation:{annual_pct,...} }
 * with every leaf optionally wrapped as a Record {value, unit, ...}, and (b) a partial MacroCalibration in native shape.
 * Anything missing or malformed falls back to the built-in default, with a warning in `meta.warnings` (never throws on content).
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { deepAssign } from '../core/util'
import { readLeaf, unwrapRecords } from '../core/records'
import { defaultMacroCalibration } from './defaults'
import { REGIMES, type MacroCalibration, type MacroCalibrationMeta, type Regime } from './types'

const regimeParams = z.object({
  dailyVol: z.number().positive().max(0.5),
  driftPerDay: z.number().min(-0.2).max(0.2),
  jumpRatePerYear: z.number().min(0).max(1000),
  jumpMean: z.number().min(-1).max(1),
  jumpSd: z.number().min(0).max(1),
})
const regimeRecord = <T extends z.ZodTypeAny>(t: T) => z.object({ calm: t, stress: t, crisis: t, recovery: t })
const regimeEnum = z.enum(['calm', 'stress', 'crisis', 'recovery'])

export const MacroCalibrationSchema = z.object({
  spot: z.number().positive(),
  regimes: regimeRecord(regimeParams),
  transition: regimeRecord(regimeRecord(z.number().min(0).max(1))),
  initialRegime: regimeEnum,
  weekdayVol: z.array(z.number().positive()).length(7),
  intradayVarianceWeights: z.array(z.number().min(0)).length(24),
  premium: z.object({
    cashDollarMean: z.number(),
    cashDollarDailySd: z.number().min(0),
    meanReversionPerDay: z.number().min(0).max(1),
    regimeAddon: regimeRecord(z.number()),
    min: z.number(),
    max: z.number(),
  }),
  inflation: z.object({
    annualRate: z.number().min(-0.5).max(20),
    fxPassThrough: z.number().min(0).max(5),
    fxEmaHalfLifeDays: z.number().positive(),
    fxReferenceDriftPerDay: z.number(),
    dailyNoiseSd: z.number().min(0),
  }),
  demand: z.object({
    regimeMultiplier: regimeRecord(z.number().positive()),
    weekday: z.array(z.number().positive()).length(7),
    smoothingDays: z.number().positive(),
    realPriceElasticity: z.number().min(0),
  }),
})

export function defaultCalibrationFilePath(): string {
  // packages/sim/src/macro -> repo root
  const here = dirname(fileURLToPath(import.meta.url))
  return resolve(here, '../../../../data/macro_calibration.json')
}

const isPctUnit = (u?: string): boolean => !!u && /%|pct|percent/i.test(u)
const isFractionUnit = (u?: string): boolean => !!u && /fraction|ratio|frac/i.test(u)

/** Convert a leaf to a fraction: unit says percent -> /100; unit says fraction -> as is; otherwise guess by magnitude (> maxFraction means percent). */
function toFraction(raw: unknown, maxFraction: number): number | undefined {
  const { value, unit } = readLeaf(raw)
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  if (isPctUnit(unit)) return value / 100
  if (isFractionUnit(unit)) return value
  return Math.abs(value) > maxFraction ? value / 100 : value
}

function regimeFromName(name: string): Regime | undefined {
  const n = name.toLowerCase()
  return REGIMES.find((r) => n.includes(r))
}

const WEEKDAY_KEYS: Record<string, number> = { sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tuesday: 2, wed: 3, wednesday: 3, thu: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6 }

function convertResearchShape(raw: Record<string, unknown>, warnings: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  const fx = (raw.usdt_irt ?? {}) as Record<string, unknown>
  if (fx.spot !== undefined) {
    const { value, unit } = readLeaf(fx.spot)
    if (typeof value === 'number' && value > 0) {
      let v = value
      if (unit && /rial|irr/i.test(unit)) v = value / 10
      else if (value > 2_000_000) {
        warnings.push(`spot ${value} looks like Rial; converted to Toman (/10)`)
        v = value / 10
      }
      out.spot = v
    }
  }
  if (Array.isArray(fx.regimes)) {
    const regimes: Record<string, unknown> = {}
    const order: (Regime | undefined)[] = []
    for (const r of fx.regimes as Record<string, unknown>[]) {
      const name = String(unwrapRecords(r.name) ?? '')
      const reg = regimeFromName(name)
      order.push(reg)
      if (!reg) {
        warnings.push(`unknown regime name "${name}" ignored`)
        continue
      }
      const p: Record<string, number> = {}
      const vol = toFraction(r.daily_vol, 0.25)
      if (vol !== undefined) p.dailyVol = vol
      const dr = toFraction(r.drift_daily, 0.05)
      if (dr !== undefined) p.driftPerDay = dr
      const jr = readLeaf(r.jump_rate_per_year).value
      if (typeof jr === 'number') p.jumpRatePerYear = jr
      const jm = toFraction(r.jump_mean, 0.5)
      if (jm !== undefined) p.jumpMean = jm
      const js = toFraction(r.jump_sd, 0.5)
      if (js !== undefined) p.jumpSd = js
      regimes[reg] = p
    }
    out.regimes = regimes
    const tm = unwrapRecords(fx.transition_matrix)
    if (Array.isArray(tm) && tm.length === order.length && tm.every((row) => Array.isArray(row) && row.length === order.length)) {
      const transition: Record<string, Record<string, number>> = {}
      let ok = true
      for (let i = 0; i < order.length; i++) {
        const from = order[i]
        if (!from) continue
        const row: Record<string, number> = {}
        let sum = 0
        for (let j = 0; j < order.length; j++) {
          const to = order[j]
          if (!to) continue
          let v = Number((tm[i] as unknown[])[j])
          if (!Number.isFinite(v) || v < 0) ok = false
          if (v > 1) v = v / 100
          row[to] = v
          sum += v
        }
        if (!(sum > 0)) ok = false
        else for (const k of Object.keys(row)) row[k] = (row[k] as number) / sum
        transition[from] = row
      }
      if (ok && REGIMES.every((r) => transition[r] && REGIMES.every((q) => typeof transition[r]?.[q] === 'number'))) out.transition = transition
      else warnings.push('transition_matrix incomplete or invalid; using default matrix')
    } else if (tm !== undefined) warnings.push('transition_matrix shape does not match regimes; using default matrix')
  }
  if (fx.weekday_effect && typeof fx.weekday_effect === 'object') {
    const arr = new Array<number>(7).fill(NaN)
    for (const [k, v] of Object.entries(fx.weekday_effect as Record<string, unknown>)) {
      const idx = WEEKDAY_KEYS[k.toLowerCase()]
      const num = readLeaf(v).value
      if (idx !== undefined && typeof num === 'number' && num > 0.2 && num < 5) arr[idx] = num
    }
    if (arr.every((x) => Number.isFinite(x))) out.weekdayVol = arr
    else warnings.push('weekday_effect not a complete set of 7 volatility multipliers; using default')
  }
  const inf = raw.inflation as Record<string, unknown> | undefined
  if (inf) {
    const leaf = readLeaf(inf.annual_pct)
    const aVal = typeof leaf.value === 'number' ? (isFractionUnit(leaf.unit) ? leaf.value : leaf.value / 100) : undefined
    if (aVal !== undefined) out.inflation = { annualRate: aVal }
  }
  const prem = fx.inter_exchange_premium_pct
  if (prem !== undefined) warnings.push('inter_exchange_premium_pct is consumed per exchange (ExchangeParams.premiumBps), not by the macro engine')
  return out
}

/** Load macro calibration. `path` defaults to <repo>/data/macro_calibration.json; absent file => built-in defaults. */
export function loadMacroCalibration(path?: string): MacroCalibration & { meta: MacroCalibrationMeta } {
  const base = defaultMacroCalibration()
  const file = path ?? defaultCalibrationFilePath()
  const warnings: string[] = []
  if (!existsSync(file)) return Object.assign(base, { meta: { source: 'default', warnings } })
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'))
  } catch (e) {
    warnings.push(`cannot parse ${file}: ${(e as Error).message}; using defaults`)
    return Object.assign(base, { meta: { source: 'default', warnings } })
  }
  const root = (parsed && typeof parsed === 'object' ? parsed : {}) as Record<string, unknown>
  const infl = root.inflation as Record<string, unknown> | undefined
  const isResearch = 'usdt_irt' in root || (!!infl && typeof infl === 'object' && 'annual_pct' in infl)
  const patch = isResearch ? convertResearchShape(root, warnings) : (unwrapRecords(root) as Record<string, unknown>)
  const merged = deepAssign(base, patch)
  const res = MacroCalibrationSchema.safeParse(merged)
  if (!res.success) {
    warnings.push(`calibration invalid (${res.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}); using defaults`)
    return Object.assign(defaultMacroCalibration(), { meta: { source: 'default', warnings } })
  }
  const cal = normaliseCalibration(res.data as MacroCalibration)
  return Object.assign(cal, { meta: { source: file, warnings } })
}

/** Normalise rows/weights. Pure. */
export function normaliseCalibration(c: MacroCalibration): MacroCalibration {
  const out = structuredClone(c)
  for (const from of REGIMES) {
    const row = out.transition[from]
    const sum = REGIMES.reduce((s, to) => s + row[to], 0)
    if (!(sum > 0)) throw new RangeError(`transition row ${from} sums to 0`)
    for (const to of REGIMES) row[to] = row[to] / sum
  }
  const wMean = out.weekdayVol.reduce((a, b) => a + b, 0) / 7
  out.weekdayVol = out.weekdayVol.map((x) => x / wMean)
  const hs = out.intradayVarianceWeights.reduce((a, b) => a + b, 0)
  if (!(hs > 0)) throw new RangeError('intradayVarianceWeights sum to 0')
  out.intradayVarianceWeights = out.intradayVarianceWeights.map((x) => x / hs)
  return out
}

/** Apply a partial override (scenario.macro.overrides) on top of a calibration, validate and normalise. */
export function overrideCalibration(base: MacroCalibration, patch: unknown): MacroCalibration {
  const merged = deepAssign(base, unwrapRecords(patch))
  const res = MacroCalibrationSchema.parse(merged)
  return normaliseCalibration(res as MacroCalibration)
}

/** Stationary distribution of the daily regime chain (power iteration). */
export function stationaryDistribution(c: MacroCalibration): Record<Regime, number> {
  let p: Record<Regime, number> = { calm: 1, stress: 0, crisis: 0, recovery: 0 }
  for (let i = 0; i < 5000; i++) {
    const q: Record<Regime, number> = { calm: 0, stress: 0, crisis: 0, recovery: 0 }
    for (const from of REGIMES) for (const to of REGIMES) q[to] += p[from] * c.transition[from][to]
    p = q
  }
  return p
}
