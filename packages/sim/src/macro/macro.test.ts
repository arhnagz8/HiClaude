import { describe, expect, it } from 'vitest'
import { MS, createRng, fromIrst, irstParts } from '@hiclaude/contracts'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { SimClock } from '../core/clock'
import { MacroEngine } from './engine'
import { defaultMacroCalibration } from './defaults'
import { loadMacroCalibration, overrideCalibration, stationaryDistribution } from './calibration'
import { REGIMES, type MacroOverlay } from './types'

const START = fromIrst(2026, 10, 2)
const DAY = MS.day

function make(seed: number, overlays: MacroOverlay[] = [], cal = defaultMacroCalibration()) {
  const clock = new SimClock(START)
  const macro = new MacroEngine({ rng: createRng(seed).fork('macro'), clock, startMs: START, calibration: cal, overlays })
  return { macro, clock }
}

describe('MacroEngine basics', () => {
  it('starts at the calibrated spot', () => {
    const { macro } = make(1)
    expect(macro.midAt(START)).toBeCloseTo(257_000, 0)
  })
  it('is deterministic for equal seeds and differs across seeds', () => {
    const a = make(7).macro
    const b = make(7).macro
    const c = make(8).macro
    const t = START + 123 * DAY + 5 * MS.hour
    expect(a.midAt(t)).toBe(b.midAt(t))
    expect(a.midAt(t)).not.toBe(c.midAt(t))
  })
  it('is always positive and finite over 10 simulated years', () => {
    const { macro } = make(3)
    for (let d = 0; d < 3650; d += 7) {
      const p = macro.midAt(START + d * DAY + 13 * MS.hour)
      expect(p).toBeGreaterThan(0)
      expect(Number.isFinite(p)).toBe(true)
    }
  })
  it('query order does not matter (random order == sequential)', () => {
    const times: number[] = []
    for (let i = 0; i < 400; i++) times.push(START + Math.floor(i * 2.7 * MS.hour) + (i % 7) * 13 * MS.minute)
    const seq = make(11).macro
    const expected = times.map((t) => seq.midAt(t))
    const shuffled = [...times.keys()].sort((a, b) => ((a * 7919) % 401) - ((b * 7919) % 401))
    const rnd = make(11).macro
    const got = new Array<number>(times.length)
    for (const i of shuffled) got[i] = rnd.midAt(times[i] as number)
    expect(got).toEqual(expected)
    // reversed order from far future first
    const rev = make(11).macro
    const gotRev = [...times.keys()].reverse().map((i) => [i, rev.midAt(times[i] as number)] as const)
    for (const [i, v] of gotRev) expect(v).toBe(expected[i])
  })
  it('is continuous across day boundaries and within the day', () => {
    const { macro } = make(5)
    for (let d = 1; d < 60; d++) {
      const before = macro.midAt(START + d * DAY - 1)
      const after = macro.midAt(START + d * DAY + 1)
      // jumps occur strictly inside days; day boundary has no discontinuity
      expect(Math.abs(Math.log(after / before))).toBeLessThan(1e-3)
    }
  })
  it('minute resolution queries vary smoothly', () => {
    const { macro } = make(5)
    let maxStep = 0
    for (let m = 0; m < 1440; m++) {
      const a = macro.midAt(START + 20 * DAY + m * MS.minute)
      const b = macro.midAt(START + 20 * DAY + (m + 1) * MS.minute)
      maxStep = Math.max(maxStep, Math.abs(Math.log(b / a)))
    }
    expect(maxStep).toBeLessThan(0.03) // only an in-day jump can exceed bridge noise
  })
  it('times before start clamp to day 0 start', () => {
    const { macro } = make(2)
    expect(macro.midAt(START - 5 * DAY)).toBeCloseTo(macro.midAt(START), 6)
  })
})

describe('MacroEngine calibrated moments', () => {
  const { macro } = make(42)
  const N = 20000
  const byRegime: Record<string, { rets: number[] }> = {}
  for (const r of REGIMES) byRegime[r] = { rets: [] }
  const zs: number[] = []
  for (let d = 0; d < N; d++) {
    const rec = macro.dayRecord(d)
    byRegime[rec.regime]?.rets.push(rec.L1 - rec.L0)
    if (rec.regime === 'calm') zs.push(rec.z)
  }
  const cal = defaultMacroCalibration()

  it('regime shares match the stationary distribution of the transition matrix', () => {
    const st = stationaryDistribution(cal)
    for (const r of REGIMES) {
      const share = (byRegime[r]?.rets.length ?? 0) / N
      expect(Math.abs(share - st[r])).toBeLessThan(0.04)
    }
    expect(st.calm).toBeGreaterThan(0.5)
  })
  it('calm-regime log return mean and sd match the calibration (jumps included)', () => {
    const rets = byRegime.calm?.rets as number[]
    const p = cal.regimes.calm
    const lam = p.jumpRatePerYear / 365
    const sdTotal = Math.sqrt(p.dailyVol ** 2 + lam * (p.jumpSd ** 2 + p.jumpMean ** 2))
    const mean = rets.reduce((a, b) => a + b, 0) / rets.length
    const sd = Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1))
    expect(Math.abs(mean - p.driftPerDay)).toBeLessThan((4 * sdTotal) / Math.sqrt(rets.length))
    expect(sd / sdTotal).toBeGreaterThan(0.93)
    expect(sd / sdTotal).toBeLessThan(1.07)
  })
  it('stress and crisis are more volatile than calm', () => {
    const sd = (xs: number[]) => {
      const m = xs.reduce((a, b) => a + b, 0) / xs.length
      return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1))
    }
    const calm = sd(byRegime.calm?.rets as number[])
    const stress = sd(byRegime.stress?.rets as number[])
    const crisis = sd(byRegime.crisis?.rets as number[])
    expect(stress).toBeGreaterThan(calm * 1.5)
    expect(crisis).toBeGreaterThan(stress * 1.4)
  })
  it('diffusion shocks are standard normal', () => {
    const m = zs.reduce((a, b) => a + b, 0) / zs.length
    const v = zs.reduce((a, b) => a + (b - m) ** 2, 0) / zs.length
    expect(Math.abs(m)).toBeLessThan(0.05)
    expect(Math.abs(v - 1)).toBeLessThan(0.07)
  })
  it('calm annual drift is about +45% (log drift per year)', () => {
    expect(Math.exp(cal.regimes.calm.driftPerDay * 365)).toBeCloseTo(1.45, 2)
  })
  it('weekday volatility multipliers are normalised to mean 1 and Friday is thinnest', () => {
    const { macro: m2 } = make(1)
    const w = m2.calibration.weekdayVol
    expect(w.reduce((a, b) => a + b, 0) / 7).toBeCloseTo(1, 10)
    expect(Math.min(...w)).toBe(w[5])
  })
  it('night hours carry a small share of the daily variance', () => {
    const w = defaultMacroCalibration().intradayVarianceWeights
    const night = [21, 22, 23, 0, 1, 2, 3, 4, 5, 6, 7, 8].reduce((a, h) => a + (w[h] as number), 0)
    expect(night).toBeLessThan(0.3)
  })
})

describe('MacroEngine overlays', () => {
  it('shock moves the price by about +20% within a few days and keeps most of it', () => {
    const base = make(9).macro
    const shocked = make(9, [{ type: 'shock', atDay: 100, pct: 0.2, durationDays: 3, retracePct: 0.15 }]).macro
    const t0 = START + 99 * DAY
    const t1 = START + 104 * DAY
    const ratioBefore = shocked.midAt(t0) / base.midAt(t0)
    expect(ratioBefore).toBeCloseTo(1, 6)
    const ratioAfter = shocked.midAt(START + 103 * DAY) / base.midAt(START + 103 * DAY)
    expect(ratioAfter).toBeGreaterThan(1.1) // regime forcing adds its own noise, but the shock dominates
    const later = shocked.midAt(START + 140 * DAY) / base.midAt(START + 140 * DAY)
    expect(later).toBeGreaterThan(1.05)
    void t1
  })
  it('shock forces the crisis regime during the shock window', () => {
    const m = make(9, [{ type: 'shock', atDay: 50, pct: 0.2, durationDays: 3 }]).macro
    for (let d = 50; d < 53; d++) expect(m.regimeAt(START + d * DAY + MS.hour)).toBe('crisis')
  })
  it('recovery lowers the price', () => {
    const base = make(4).macro
    const rec = make(4, [{ type: 'recovery', atDay: 30, pct: 0.15, days: 40 }]).macro
    const t = START + 90 * DAY
    expect(rec.midAt(t) / base.midAt(t)).toBeCloseTo(0.85, 2)
  })
  it('trend overlay compounds extra annual depreciation', () => {
    const base = make(4).macro
    const tr = make(4, [{ type: 'trend', atDay: 0, pctPerYear: 0.5 }]).macro
    const t = START + 365 * DAY
    expect(tr.midAt(t) / base.midAt(t)).toBeCloseTo(1.5, 2)
  })
  it('volatility spike raises realised volatility inside the window', () => {
    const base = make(21).macro
    const sp = make(21, [{ type: 'volatility_spike', atDay: 100, multiplier: 4, durationDays: 60 }]).macro
    const volOf = (m: MacroEngine) => {
      const rs: number[] = []
      for (let d = 105; d < 155; d++) {
        const r = m.dayRecord(d)
        rs.push(r.L1 - r.L0)
      }
      const mean = rs.reduce((a, b) => a + b, 0) / rs.length
      return Math.sqrt(rs.reduce((a, b) => a + (b - mean) ** 2, 0) / rs.length)
    }
    expect(volOf(sp)).toBeGreaterThan(volOf(base) * 1.8)
  })
  it('demand shock multiplies demand inside the window only', () => {
    const base = make(2).macro
    const ds = make(2, [{ type: 'demand_shock', atDay: 10, multiplier: 0.4, durationDays: 20 }]).macro
    const inside = START + 15 * DAY
    const outside = START + 40 * DAY
    expect(ds.demandMultiplier(inside) / base.demandMultiplier(inside)).toBeCloseTo(0.4, 6)
    expect(ds.demandMultiplier(outside) / base.demandMultiplier(outside)).toBeCloseTo(1, 6)
  })
  it('runtime events (applyEvent) apply from now and can be reverted', () => {
    const { macro, clock } = make(6)
    clock.set(START + 10 * DAY)
    const before = macro.midAt(START + 30 * DAY)
    const h = macro.applyEvent('devaluation_shock', { pct: 0.3, durationDays: 2 })
    expect(h).not.toBeNull()
    expect(macro.midAt(START + 30 * DAY)).toBeGreaterThan(before * 1.1)
    h?.revert()
    expect(macro.midAt(START + 30 * DAY)).toBeCloseTo(before, 6)
    expect(macro.applyEvent('nonsense', {})).toBeNull()
  })
  it('does not retroactively change the past when an overlay is added at runtime', () => {
    const { macro, clock } = make(6)
    clock.set(START + 10 * DAY + 5 * MS.hour)
    const past = [0, 3, 9, 10].map((d) => macro.midAt(START + d * DAY + 2 * MS.hour))
    macro.applyEvent('volatility_spike', { multiplier: 5, durationDays: 30 })
    const after = [0, 3, 9, 10].map((d) => macro.midAt(START + d * DAY + 2 * MS.hour))
    expect(after).toEqual(past)
  })
})

describe('MacroEngine inflation, premium, demand', () => {
  it('inflation index is monotone and ~38%/yr in the reference environment', () => {
    const { macro } = make(12)
    let prev = 0
    for (let d = 0; d <= 730; d += 5) {
      const v = macro.inflationIndex(START + d * DAY)
      expect(v).toBeGreaterThanOrEqual(prev)
      prev = v
    }
    const y1 = macro.inflationIndex(START + 365 * DAY)
    expect(y1).toBeGreaterThan(1.2)
    expect(y1).toBeLessThan(1.9)
  })
  it('depreciation pass-through raises inflation', () => {
    const base = make(12).macro
    const hot = make(12, [{ type: 'trend', atDay: 0, pctPerYear: 1.0 }]).macro
    void hot
    const calHot = overrideCalibration(defaultMacroCalibration(), { regimes: { calm: { driftPerDay: Math.log(2) / 365 } } })
    const hotter = make(12, [], calHot).macro
    expect(hotter.inflationIndex(START + 365 * DAY)).toBeGreaterThan(base.inflationIndex(START + 365 * DAY))
  })
  it('cash-dollar premium stays within bounds and is higher in crisis on average', () => {
    const { macro } = make(30)
    const c = defaultMacroCalibration().premium
    let sumCalm = 0
    let nCalm = 0
    let sumCrisis = 0
    let nCrisis = 0
    for (let d = 0; d < 6000; d++) {
      const rec = macro.dayRecord(d)
      expect(rec.premium1).toBeGreaterThanOrEqual(c.min)
      expect(rec.premium1).toBeLessThanOrEqual(c.max)
      if (rec.regime === 'calm') {
        sumCalm += rec.premium1
        nCalm++
      }
      if (rec.regime === 'crisis') {
        sumCrisis += rec.premium1
        nCrisis++
      }
    }
    expect(nCrisis).toBeGreaterThan(5)
    expect(sumCrisis / nCrisis).toBeGreaterThan(sumCalm / nCalm)
  })
  it('demand multiplier is bounded, lower on Friday, higher in crisis', () => {
    const { macro } = make(1)
    // find a Friday and a Wednesday in calm regime
    let fri = NaN
    let wed = NaN
    for (let d = 0; d < 100 && (Number.isNaN(fri) || Number.isNaN(wed)); d++) {
      const t = START + d * DAY + 12 * MS.hour
      const wd = irstParts(t).weekday
      if (wd === 5 && Number.isNaN(fri)) fri = macro.demandMultiplier(t)
      if (wd === 3 && Number.isNaN(wed)) wed = macro.demandMultiplier(t)
    }
    expect(fri).toBeLessThan(wed)
    const shocked = make(1, [{ type: 'shock', atDay: 5, pct: 0.2, durationDays: 3 }]).macro
    const cDemand = shocked.dayRecord(9).demandBase1
    expect(cDemand).toBeGreaterThan(shocked.dayRecord(0).demandBase0)
    for (let d = 0; d < 200; d++) {
      const v = macro.demandMultiplier(START + d * DAY)
      expect(v).toBeGreaterThan(0.02)
      expect(v).toBeLessThan(6)
    }
  })
  it('scenarioState and tickerFor are coherent', () => {
    const { macro } = make(1)
    const s = macro.scenarioState(START + 3 * DAY)
    expect(s.mid).toBe(macro.midAt(START + 3 * DAY))
    expect(REGIMES).toContain(s.regime)
    const t = macro.tickerFor({ premiumBps: 10, halfSpreadBps: 20 }, START)
    expect(t.ask).toBeGreaterThan(t.bid)
    expect(t.ask / t.mid).toBeCloseTo(1.003, 5)
    expect(macro.rialStrength(START)).toBeCloseTo(1 / 257_000, 12)
    expect(macro.cashDollarMid(START)).toBeGreaterThan(macro.midAt(START) * 0.95)
  })
})

describe('macro calibration loader', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'macro-cal-'))
  it('returns built-in defaults when the file is missing', () => {
    const c = loadMacroCalibration(join(tmp, 'nope.json'))
    expect(c.meta.source).toBe('default')
    expect(c.spot).toBe(257_000)
  })
  it('unwraps research Record wrappers, percent units and Rial spot', () => {
    const rec = (value: unknown, unit?: string) => ({ value, unit, as_of: '2026-10-02', confidence: 'low', sources: [] })
    const file = join(tmp, 'research.json')
    writeFileSync(
      file,
      JSON.stringify({
        usdt_irt: {
          spot: rec(2_600_000, 'IRR per USDT'),
          regimes: [
            { name: 'calm', daily_vol: rec(1.2, '%'), drift_daily: rec(0.1, '%'), jump_rate_per_year: rec(5), jump_mean: rec(3, '%'), jump_sd: rec(2, '%') },
            { name: 'stress', daily_vol: rec(2.5, '%'), drift_daily: rec(0.15, '%'), jump_rate_per_year: rec(9), jump_mean: rec(4, '%'), jump_sd: rec(3, '%') },
            { name: 'crisis', daily_vol: rec(5, '%'), drift_daily: rec(1.0, '%'), jump_rate_per_year: rec(30), jump_mean: rec(5, '%'), jump_sd: rec(4, '%') },
            { name: 'recovery', daily_vol: rec(2, '%'), drift_daily: rec(-0.2, '%'), jump_rate_per_year: rec(2), jump_mean: rec(-2, '%'), jump_sd: rec(2, '%') },
          ],
          transition_matrix: [
            [0.98, 0.015, 0.001, 0.004],
            [0.05, 0.9, 0.04, 0.01],
            [0, 0.04, 0.86, 0.1],
            [0.1, 0.02, 0.01, 0.87],
          ],
          weekday_effect: { sat: rec(1.1), sun: rec(1.05), mon: rec(1.05), tue: rec(1.0), wed: rec(1.0), thu: rec(0.9), fri: rec(0.7) },
        },
        inflation: { annual_pct: rec(40, 'pct') },
      }),
    )
    const c = loadMacroCalibration(file)
    expect(c.meta.source).toBe(file)
    expect(c.spot).toBe(260_000)
    expect(c.regimes.calm.dailyVol).toBeCloseTo(0.012, 10)
    expect(c.regimes.calm.driftPerDay).toBeCloseTo(0.001, 10)
    expect(c.regimes.recovery.jumpMean).toBeCloseTo(-0.02, 10)
    expect(c.inflation.annualRate).toBeCloseTo(0.4, 10)
    expect(c.transition.calm.stress).toBeCloseTo(0.015, 10)
    expect(c.weekdayVol.reduce((a, b) => a + b, 0) / 7).toBeCloseTo(1, 10)
    expect(c.weekdayVol[5]).toBeLessThan(c.weekdayVol[0] as number)
  })
  it('accepts unitless magnitudes by heuristic and warns about odd matrices', () => {
    const file = join(tmp, 'odd.json')
    writeFileSync(
      file,
      JSON.stringify({ usdt_irt: { regimes: [{ name: 'calm', daily_vol: 1.4 }, { name: 'stress', daily_vol: 0.03 }], transition_matrix: [[1, 0], [0, 1]] } }),
    )
    const c = loadMacroCalibration(file)
    expect(c.regimes.calm.dailyVol).toBeCloseTo(0.014, 10)
    expect(c.regimes.stress.dailyVol).toBeCloseTo(0.03, 10)
    expect(c.meta.warnings.length).toBeGreaterThan(0)
    expect(c.transition.calm.calm).toBeCloseTo(0.985, 6) // default matrix kept
  })
  it('falls back to defaults on invalid content and on broken JSON', () => {
    const f1 = join(tmp, 'bad.json')
    writeFileSync(f1, '{not json')
    expect(loadMacroCalibration(f1).meta.warnings[0]).toMatch(/cannot parse/)
    const f2 = join(tmp, 'bad2.json')
    writeFileSync(f2, JSON.stringify({ spot: -5 }))
    const c = loadMacroCalibration(f2)
    expect(c.spot).toBe(257_000)
    expect(c.meta.warnings.join(' ')).toMatch(/invalid/)
  })
  it('native partial calibration (wrapped) is merged over defaults', () => {
    const f = join(tmp, 'native.json')
    writeFileSync(f, JSON.stringify({ spot: { value: 300000, unit: 'IRT', as_of: '2026-10-02', confidence: 'low' }, inflation: { annualRate: { value: 0.5, as_of: '2026-10-02', confidence: 'low' } } }))
    const c = loadMacroCalibration(f)
    expect(c.spot).toBe(300_000)
    expect(c.inflation.annualRate).toBe(0.5)
    expect(c.regimes.calm.dailyVol).toBe(0.01)
  })
  it('overrideCalibration validates and normalises', () => {
    const c = overrideCalibration(defaultMacroCalibration(), { regimes: { calm: { dailyVol: 0.02 } } })
    expect(c.regimes.calm.dailyVol).toBe(0.02)
    expect(() => overrideCalibration(defaultMacroCalibration(), { spot: -1 })).toThrow()
  })
})
