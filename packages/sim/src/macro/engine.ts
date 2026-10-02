/**
 * MacroEngine: USDT/IRT price process (regime-switching jump diffusion) + inflation + demand + cash-dollar premium.
 *
 * Determinism / query-order independence
 *  - Daily records are generated sequentially (day d depends on day d-1) from per-day RNG forks `rng.fork('d<d>')`, so day d is a pure function of
 *    (seed, calibration, overlays that influence generation). Records are cached; the cache is truncated when such an overlay is added/removed.
 *  - The intraday path is a Brownian bridge built by Levy midpoint construction whose Gaussian nodes are hash-derived from (seed, day, level, index):
 *    midAt(t) is a pure function of t, so any query order yields identical values.
 *  - Deterministic additive overlays (shock/trend/recovery) are evaluated at query time and never invalidate the cache.
 * Overlays that act on the stochastic generation (forced regimes, volatility multiplier) apply from the day AFTER "now" at the moment they are added
 * (today's record has already been observed); overlays registered before the first query (scenario overlays) apply from their own start.
 */
import { MS, irstParts, type Clock, type EpochMs, type Rng } from '@hiclaude/contracts'
import { hashNormal, hashString32 } from '../core/hash'
import { newHandleId, pNum, type EventHandle, type Params, type SimComponent } from '../core/types'
import { clamp } from '../core/util'
import { defaultMacroCalibration } from './defaults'
import { normaliseCalibration } from './calibration'
import { REGIMES, REGIME_SEVERITY, type MacroCalibration, type MacroOverlay, type MacroScenarioState, type Regime, type ResolvedOverlay } from './types'

const DAY = MS.day
const BRIDGE_DEPTH = 10
const SHOCK_RETRACE_DAYS = 14
const SHOCK_RECOVERY_REGIME_DAYS = 10

export interface DayRecord {
  day: number
  regime: Regime
  /** log price (base process, overlays excluded) at the start / end of the day */
  L0: number
  L1: number
  mu: number
  sigma: number
  z: number
  volMult: number
  jumps: { u: number; size: number }[]
  premium0: number
  premium1: number
  inflLog0: number
  inflLog1: number
  fxEma: number
  demandBase0: number
  demandBase1: number
}

export interface MacroEngineOptions {
  rng: Rng
  clock: Clock
  /** IRST midnight of day 0. */
  startMs: EpochMs
  calibration?: MacroCalibration
  overlays?: MacroOverlay[]
}

export class MacroEngine implements SimComponent {
  readonly name = 'macro'
  readonly calibration: MacroCalibration
  readonly startMs: EpochMs
  private readonly rng: Rng
  private readonly clock: Clock
  private readonly seedInt: number
  private readonly days: DayRecord[] = []
  private overlays: ResolvedOverlay[] = []
  private readonly cumVar: number[] // 25 entries: cumulative variance fraction at hour boundaries
  private overlaySeq = 0

  constructor(opts: MacroEngineOptions) {
    this.rng = opts.rng
    this.clock = opts.clock
    this.startMs = opts.startMs
    this.calibration = normaliseCalibration(opts.calibration ?? defaultMacroCalibration())
    this.seedInt = hashString32(`${opts.rng.path}/bridge`)
    this.cumVar = [0]
    for (let h = 0; h < 24; h++) this.cumVar.push((this.cumVar[h] as number) + (this.calibration.intradayVarianceWeights[h] as number))
    for (const o of opts.overlays ?? []) this.overlays.push(this.resolve(o))
  }

  // ───────────────────────────── public API ─────────────────────────────
  /** USDT/IRT mid price (Toman per USDT) at `t` (default now). Always > 0. */
  midAt(t: EpochMs = this.clock.now()): number {
    return Math.exp(this.logMidAt(t))
  }
  mid(): number {
    return this.midAt(this.clock.now())
  }
  /** 1 / mid: Toman -> USDT strength (higher = stronger rial). */
  rialStrength(t: EpochMs = this.clock.now()): number {
    return 1 / this.midAt(t)
  }

  /** Index of the IRST day (0-based) containing t. Times before the start map to day 0. */
  dayIndex(t: EpochMs): number {
    return Math.max(0, Math.floor((t - this.startMs) / DAY))
  }

  regimeAt(t: EpochMs = this.clock.now()): Regime {
    return this.ensureDay(this.dayIndex(t)).regime
  }

  /** Effective daily diffusion vol (percent) at t: regime vol x weekday x overlay multiplier. */
  dailyVolPct(t: EpochMs = this.clock.now()): number {
    return this.ensureDay(this.dayIndex(t)).sigma * 100
  }

  /** Toman CPI level (1.0 at start). Exponential interpolation within the day. */
  inflationIndex(t: EpochMs = this.clock.now()): number {
    const { rec, u } = this.locate(t)
    return Math.exp(rec.inflLog0 + (rec.inflLog1 - rec.inflLog0) * u)
  }

  /** Cash-dollar premium over USDT (fraction). */
  cashDollarPremium(t: EpochMs = this.clock.now()): number {
    const { rec, u } = this.locate(t)
    return rec.premium0 + (rec.premium1 - rec.premium0) * u
  }
  cashDollarMid(t: EpochMs = this.clock.now()): number {
    return this.midAt(t) * (1 + this.cashDollarPremium(t))
  }

  /** Multiplier applied to base customer arrival intensity (FX stress, weekday, real-price effect, demand shocks). */
  demandMultiplier(t: EpochMs = this.clock.now()): number {
    const d = this.calibration.demand
    const { rec, u } = this.locate(t)
    const base = rec.demandBase0 + (rec.demandBase1 - rec.demandBase0) * u
    const weekday = d.weekday[irstParts(t).weekday] as number
    const realDep = this.logMidAt(t) - Math.log(this.calibration.spot) - (rec.inflLog0 + (rec.inflLog1 - rec.inflLog0) * u)
    const real = Math.exp(-d.realPriceElasticity * clamp(realDep, -1.5, 1.5))
    let shock = 1
    for (const o of this.overlays) {
      if (o.spec.type !== 'demand_shock') continue
      if (t >= o.fromMs && t < o.toMs) shock *= o.spec.multiplier
    }
    return clamp(base * weekday * real * shock, 0.02, 6)
  }

  /** Quote an exchange around mid: bid/ask with premium and half-spread (bps). Pure. */
  tickerFor(spec: { premiumBps: number; halfSpreadBps: number }, t: EpochMs = this.clock.now()): { mid: number; bid: number; ask: number } {
    const mid = this.midAt(t)
    const centre = mid * (1 + spec.premiumBps / 10_000)
    return { mid, bid: centre * (1 - spec.halfSpreadBps / 10_000), ask: centre * (1 + spec.halfSpreadBps / 10_000) }
  }

  scenarioState(t: EpochMs = this.clock.now()): MacroScenarioState {
    return {
      t,
      mid: this.midAt(t),
      regime: this.regimeAt(t),
      dailyVolPct: this.dailyVolPct(t),
      inflationIndex: this.inflationIndex(t),
      demandMultiplier: this.demandMultiplier(t),
      cashDollarPremium: this.cashDollarPremium(t),
      activeOverlays: this.overlays.filter((o) => t >= o.fromMs && t < Math.max(o.toMs, o.fromMs + 1)).map((o) => ({ id: o.id, type: o.spec.type })),
    }
  }

  overlayList(): ResolvedOverlay[] {
    return [...this.overlays]
  }

  /** Read-only copy of a generated day record (generates it if needed). */
  dayRecord(d: number): DayRecord {
    return structuredClone(this.ensureDay(d))
  }
  get generatedDays(): number {
    return this.days.length
  }

  /** Realised log-return std-dev (per day) over `windowDays` ending at t, from daily closes. */
  realisedDailyVol(windowDays: number, t: EpochMs = this.clock.now()): number {
    const end = this.dayIndex(t)
    const rets: number[] = []
    for (let d = Math.max(0, end - windowDays); d < end; d++) {
      const r = this.ensureDay(d)
      rets.push(r.L1 - r.L0)
    }
    if (rets.length < 2) return 0
    const m = rets.reduce((a, b) => a + b, 0) / rets.length
    return Math.sqrt(rets.reduce((a, b) => a + (b - m) ** 2, 0) / (rets.length - 1))
  }

  // ───────────────────────────── overlays / events ─────────────────────────────
  addOverlay(spec: MacroOverlay): EventHandle {
    const o = this.resolve(spec)
    this.overlays.push(o)
    this.invalidateAfterNow(o)
    return {
      id: o.id,
      revert: () => {
        const i = this.overlays.indexOf(o)
        if (i < 0) return
        this.overlays.splice(i, 1)
        this.invalidateAfterNow(o)
      },
    }
  }

  /** Scenario/runtime events: devaluation_shock, rial_recovery, volatility_spike, demand_shock, macro_trend. `atDay` omitted => starts now. */
  applyEvent(type: string, params: Params): EventHandle | null {
    const now = this.clock.now()
    const base = { atMs: typeof params.atMs === 'number' ? params.atMs : now }
    switch (type) {
      case 'devaluation_shock':
        return this.addOverlay({ type: 'shock', ...base, pct: pNum(params, 'pct', 0.2), durationDays: pNum(params, 'durationDays', 3), retracePct: pNum(params, 'retracePct', 0.15) })
      case 'rial_recovery':
        return this.addOverlay({ type: 'recovery', ...base, pct: pNum(params, 'pct', 0.15), days: pNum(params, 'days', 60) })
      case 'volatility_spike':
        return this.addOverlay({ type: 'volatility_spike', ...base, multiplier: pNum(params, 'multiplier', 3), durationDays: pNum(params, 'durationDays', 30) })
      case 'demand_shock':
        return this.addOverlay({ type: 'demand_shock', ...base, multiplier: pNum(params, 'multiplier', 0.5), durationDays: pNum(params, 'durationDays', 14) })
      case 'internet_shutdown':
        // traffic collapse; params.trafficMultiplier is the share of traffic that remains (0.4 = -60 %)
        return this.addOverlay({ type: 'demand_shock', ...base, multiplier: pNum(params, 'trafficMultiplier', 0.4), durationDays: pNum(params, 'durationDays', 40) })
      case 'macro_trend':
        return this.addOverlay({ type: 'trend', ...base, pctPerYear: pNum(params, 'pctPerYear', 0.3) })
      case 'macro_overlay': {
        const spec = params.overlay as MacroOverlay | undefined
        if (spec && typeof spec === 'object' && typeof spec.type === 'string') return this.addOverlay({ ...spec, ...(spec.atDay === undefined && spec.atMs === undefined ? base : {}) } as MacroOverlay)
        return null
      }
      default:
        return null
    }
  }

  // ───────────────────────────── internals ─────────────────────────────
  private resolve(spec: MacroOverlay): ResolvedOverlay {
    const fromMs = spec.atMs ?? this.startMs + (spec.atDay ?? 0) * DAY
    let toMs = fromMs
    let forcedRegime: Regime | undefined
    let volMultiplier = 1
    switch (spec.type) {
      case 'shock':
        toMs = fromMs + Math.max(spec.durationDays, 0.04) * DAY
        forcedRegime = 'crisis'
        break
      case 'recovery':
        toMs = fromMs + Math.max(spec.days, 0.04) * DAY
        break
      case 'volatility_spike':
        toMs = fromMs + spec.durationDays * DAY
        forcedRegime = 'stress'
        volMultiplier = spec.multiplier ?? 3
        break
      case 'demand_shock':
        toMs = fromMs + spec.durationDays * DAY
        break
      case 'trend':
        toMs = spec.untilMs ?? (spec.untilDay !== undefined ? this.startMs + spec.untilDay * DAY : Number.POSITIVE_INFINITY)
        break
    }
    return { id: newHandleId(`macro.${spec.type}.${++this.overlaySeq}`), spec, fromMs, toMs, forcedRegime, volMultiplier }
  }

  private invalidateAfterNow(o: ResolvedOverlay): void {
    if (o.forcedRegime === undefined && o.volMultiplier === 1) return // purely deterministic additive/demand overlay
    const keep = Math.max(this.dayIndex(this.clock.now()) + 1, 0)
    if (this.days.length > keep) this.days.length = keep
  }

  /** Forced regime and volatility multiplier for day d (overlay windows intersecting the day). */
  private forcing(d: number): { regime?: Regime; volMult: number } {
    const dayStart = this.startMs + d * DAY
    const dayEnd = dayStart + DAY
    let regime: Regime | undefined
    let volMult = 1
    for (const o of this.overlays) {
      let from = o.fromMs
      let to = o.toMs
      if (o.spec.type === 'shock') {
        // crisis during the shock, then a recovery regime afterwards
        if (from < dayEnd && to > dayStart) regime = pickMoreSevere(regime, 'crisis')
        const rEnd = to + SHOCK_RECOVERY_REGIME_DAYS * DAY
        if (to < dayEnd && rEnd > dayStart) regime = pickMoreSevere(regime, 'recovery')
        continue
      }
      if (o.forcedRegime === undefined) continue
      to = Math.max(to, from + 1)
      from = Math.min(from, to)
      if (from < dayEnd && to > dayStart) {
        regime = pickMoreSevere(regime, o.forcedRegime)
        if (o.volMultiplier !== 1) volMult *= o.volMultiplier
      }
    }
    return { regime, volMult }
  }

  private ensureDay(d: number): DayRecord {
    while (this.days.length <= d) this.days.push(this.generateDay(this.days.length))
    return this.days[d] as DayRecord
  }

  private generateDay(d: number): DayRecord {
    const cal = this.calibration
    const prev = d > 0 ? (this.days[d - 1] as DayRecord) : undefined
    const r = this.rng.fork(`d${d}`)
    const u0 = r.next()
    const forcing = this.forcing(d)
    let regime: Regime
    if (forcing.regime) regime = forcing.regime
    else if (!prev) regime = cal.initialRegime
    else {
      const row = cal.transition[prev.regime]
      let acc = 0
      regime = REGIMES[REGIMES.length - 1] as Regime
      for (const to of REGIMES) {
        acc += row[to]
        if (u0 < acc) {
          regime = to
          break
        }
      }
    }
    const rp = cal.regimes[regime]
    const weekday = irstParts(this.startMs + d * DAY + 12 * MS.hour).weekday
    const sigma = rp.dailyVol * (cal.weekdayVol[weekday] as number) * forcing.volMult
    const lambdaDay = rp.jumpRatePerYear / 365
    const mu = rp.driftPerDay - lambdaDay * rp.jumpMean
    const z = r.normal()
    const nJumps = r.poisson(lambdaDay * Math.max(1, Math.sqrt(forcing.volMult)))
    const jumps: { u: number; size: number }[] = []
    for (let i = 0; i < nJumps; i++) jumps.push({ u: r.next(), size: r.normal(rp.jumpMean, rp.jumpSd) })
    jumps.sort((a, b) => a.u - b.u)
    const L0 = prev ? prev.L1 : Math.log(cal.spot)
    const L1 = L0 + mu + sigma * z + jumps.reduce((s, j) => s + j.size, 0)

    // cash-dollar premium AR(1)
    const pc = cal.premium
    const premium0 = prev ? prev.premium1 : pc.cashDollarMean + pc.regimeAddon[regime]
    const target = pc.cashDollarMean + pc.regimeAddon[regime]
    const premium1 = clamp(premium0 + pc.meanReversionPerDay * (target - premium0) + pc.cashDollarDailySd * r.normal(), pc.min, pc.max)

    // inflation: base + pass-through of EMA(excess FX depreciation)
    const ic = cal.inflation
    const lambdaEma = Math.log(2) / ic.fxEmaHalfLifeDays
    const alpha = 1 - Math.exp(-lambdaEma)
    const fxRet = L1 - L0
    const fxEma = prev ? prev.fxEma + alpha * (fxRet - prev.fxEma) : ic.fxReferenceDriftPerDay
    const baseDaily = Math.log1p(ic.annualRate) / 365
    const incr = Math.max(0, baseDaily + ic.fxPassThrough * (fxEma - ic.fxReferenceDriftPerDay) + ic.dailyNoiseSd * r.normal())
    const inflLog0 = prev ? prev.inflLog1 : 0
    const inflLog1 = inflLog0 + incr

    // demand base: EMA of regime multiplier
    const dc = cal.demand
    const dAlpha = 1 - Math.exp(-1 / dc.smoothingDays)
    const demandBase0 = prev ? prev.demandBase1 : dc.regimeMultiplier[regime]
    const demandBase1 = demandBase0 + dAlpha * (dc.regimeMultiplier[regime] - demandBase0)

    return { day: d, regime, L0, L1, mu, sigma, z, volMult: forcing.volMult, jumps, premium0, premium1, inflLog0, inflLog1, fxEma, demandBase0, demandBase1 }
  }

  private locate(t: EpochMs): { rec: DayRecord; d: number; u: number } {
    const rel = Math.max(0, t - this.startMs)
    const d = Math.floor(rel / DAY)
    const u = (rel - d * DAY) / DAY
    return { rec: this.ensureDay(d), d, u }
  }

  /** Fraction of the day's variance realised by intraday position u (piecewise linear within hours). */
  private varianceClock(u: number): number {
    const x = clamp(u, 0, 1) * 24
    const h = Math.min(23, Math.floor(x))
    const a = this.cumVar[h] as number
    const b = this.cumVar[h + 1] as number
    return a + (b - a) * (x - h)
  }

  /** Brownian bridge value (unit day variance, endpoints 0) at variance-time s, by Levy midpoint construction with hashed nodes. */
  private bridge(d: number, s: number): number {
    let a = 0
    let b = 1
    let va = 0
    let vb = 0
    let idx = 0
    for (let level = 0; level < BRIDGE_DEPTH; level++) {
      const m = (a + b) / 2
      const vm = (va + vb) / 2 + Math.sqrt((b - a) / 4) * hashNormal(this.seedInt, d, level, idx)
      if (s < m) {
        b = m
        vb = vm
        idx = idx * 2
      } else {
        a = m
        va = vm
        idx = idx * 2 + 1
      }
    }
    return b > a ? va + ((vb - va) * (s - a)) / (b - a) : va
  }

  private overlayLog(t: EpochMs): number {
    let sum = 0
    for (const o of this.overlays) {
      const sp = o.spec
      if (t <= o.fromMs) continue
      switch (sp.type) {
        case 'shock': {
          const move = Math.log1p(sp.pct)
          const ramp = clamp((t - o.fromMs) / (o.toMs - o.fromMs), 0, 1)
          sum += move * ramp
          const retrace = sp.retracePct ?? 0
          if (retrace > 0 && t > o.toMs) sum -= retrace * move * clamp((t - o.toMs) / (SHOCK_RETRACE_DAYS * DAY), 0, 1)
          break
        }
        case 'recovery': {
          const move = Math.log(1 - clamp(sp.pct, 0, 0.95))
          sum += move * clamp((t - o.fromMs) / (o.toMs - o.fromMs), 0, 1)
          break
        }
        case 'trend': {
          const end = Math.min(t, o.toMs)
          sum += (Math.log1p(sp.pctPerYear) * (end - o.fromMs)) / (365 * DAY)
          break
        }
        default:
          break
      }
    }
    return sum
  }

  private logMidAt(t: EpochMs): number {
    const { rec, d, u } = this.locate(t)
    const s = this.varianceClock(u)
    const br = this.bridge(d, s)
    let jumpSum = 0
    for (const j of rec.jumps) if (u >= j.u) jumpSum += j.size
    return rec.L0 + rec.mu * u + rec.sigma * (rec.z * s + br) + jumpSum + this.overlayLog(t)
  }
}

function pickMoreSevere(a: Regime | undefined, b: Regime): Regime {
  if (!a) return b
  return REGIME_SEVERITY[b] > REGIME_SEVERITY[a] ? b : a
}
