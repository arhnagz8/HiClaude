/**
 * CompetitorSim: K competitors with price policies. Implements CompetitorPricePort (quotes for the app) and exposes richer agent-facing APIs
 * (offers / priceIndex) for the demand engine's seller-choice model.
 *
 * price(c, family, amount, t) = amountUsd x fxRef x (1 + markup) + fixedFee, rounded to a step, where
 *   fxRef  = mid(lastRepricing(c, t) - lagHours) x (1 + costPremium)       (rate lag + stale repricing: cadence offsets are per competitor)
 *   markup = strategy(base markup, peers) - priceWar(t) with promo windows (random + seasonal) applied as a multiplicative discount
 * Strategies: follow (pulls towards the peer median), undercut (-3pp), premium (+6pp), erratic (random walk per repricing).
 * Everything is a pure function of (seed, config, time) except lifecycle (entry/exit), which changes state via daily timers.
 */
import { MS, ok, jalaliOf, type CompetitorPricePort, type CompetitorPriceQuote, type EpochMs, type Irt, type Result, type Rng, type UsdCents } from '@hiclaude/contracts'
import { hashNormal, hashString32, hashUniform } from '../core/hash'
import { newHandleId, pNum, pStr, type EventHandle, type Params, type SimComponent, type SimEnv } from '../core/types'
import { clamp, median } from '../core/util'
import { MacroEngine } from '../macro/engine'
import { defaultCompetitionConfig, type CompetitionConfig, type CompetitorConfig } from './config'

export interface CompetitorOffer {
  competitorId: string
  name: string
  strategy: string
  family: string
  priceIrt: Irt
  slaMinutes: number
  trust: number
  promo: boolean
  asOf: EpochMs
}

interface PriceWar {
  fromMs: EpochMs
  toMs: EpochMs
  discount: number
}

interface Member {
  cfg: CompetitorConfig
  active: boolean
  seed: number
  offset: number
  joinedAt: EpochMs
  exitedAt?: EpochMs
}

export interface CompetitorSimDeps {
  env: SimEnv
  rng: Rng
  macro: MacroEngine
  originMs: EpochMs
  config?: CompetitionConfig
}

export class CompetitorSim implements CompetitorPricePort, SimComponent {
  readonly name = 'competitors'
  readonly cfg: CompetitionConfig
  private readonly d: CompetitorSimDeps
  private readonly rng: Rng
  private members: Member[] = []
  private wars: PriceWar[] = []
  private promoCache = new Map<string, { from: EpochMs; to: EpochMs; discount: number } | null>()
  private entrySeq = 0
  private poolUsed = new Set<string>()
  private lastLifecycleDay = -1
  private entryHazardMult = 1

  constructor(deps: CompetitorSimDeps) {
    this.d = deps
    this.rng = deps.rng
    this.cfg = structuredClone(deps.config ?? defaultCompetitionConfig())
    for (const c of this.cfg.competitors) this.members.push(this.makeMember(c, deps.originMs))
  }

  private makeMember(c: CompetitorConfig, joinedAt: EpochMs): Member {
    const seed = hashString32(`${this.rng.path}/${c.id}`)
    return { cfg: c, active: true, seed, offset: Math.floor(hashUniform(seed, 1) * c.repriceEveryHours * MS.hour), joinedAt }
  }

  /** Start the daily lifecycle (entry/exit) timer. Called by the World. */
  start(): void {
    this.d.env.sim.every(MS.day, (t) => this.lifecycle(t), { startAt: this.d.originMs + MS.day, label: 'competitors.daily', priority: 40 })
  }

  // ───────────────────────────── pricing ─────────────────────────────
  private periodMs(c: CompetitorConfig): number {
    return Math.max(MS.hour, c.repriceEveryHours * MS.hour)
  }
  private repriceIndex(m: Member, t: EpochMs): number {
    return Math.floor((t - m.offset) / this.periodMs(m.cfg))
  }
  private lastReprice(m: Member, t: EpochMs): EpochMs {
    return m.offset + this.repriceIndex(m, t) * this.periodMs(m.cfg)
  }

  private peerMedianMarkup(family: string, exclude: Member): number {
    const xs = this.members.filter((x) => x.active && x !== exclude && x.cfg.markup[family] !== undefined).map((x) => x.cfg.markup[family] as number)
    return xs.length ? median(xs) : (exclude.cfg.markup[family] ?? 0.08)
  }

  private warDiscount(t: EpochMs): number {
    let d = 0
    for (const w of this.wars) {
      if (t < w.fromMs || t >= w.toMs) continue
      const ramp = clamp((t - w.fromMs) / (3 * MS.day), 0, 1) // war escalates over 3 days
      d = Math.max(d, w.discount * ramp)
    }
    return d
  }

  /** Markup applied at time t for a member/family (before promos). */
  markupAt(m: Member, family: string, t: EpochMs): number {
    const base = m.cfg.markup[family]
    if (base === undefined) return NaN
    let mk = base
    const idx = this.repriceIndex(m, t)
    switch (m.cfg.strategy) {
      case 'follow':
        mk = base + this.cfg.followPull * (this.peerMedianMarkup(family, m) - base)
        break
      case 'undercut':
        mk = base - this.cfg.undercutDelta
        break
      case 'premium':
        mk = base + this.cfg.premiumDelta
        break
      case 'erratic':
        mk = base + this.cfg.erraticSd * hashNormal(m.seed, 7, idx)
        break
    }
    mk += m.cfg.noiseSd * hashNormal(m.seed, 11, idx, hashString32(family))
    const war = this.warDiscount(t)
    if (war > 0 && m.cfg.strategy !== 'premium') mk -= war
    else if (war > 0) mk -= war * 0.3
    return Math.max(this.cfg.minMarkup, mk)
  }

  private promoFor(m: Member, t: EpochMs): { discount: number } | null {
    const k = Math.floor((t - this.d.originMs) / (30 * MS.day))
    for (const kk of m.cfg.promosPerMonth > 0 ? [k - 1, k] : []) {
      if (kk < 0) continue
      const key = `${m.cfg.id}:${kk}`
      let w = this.promoCache.get(key)
      if (w === undefined) {
        const r = this.rng.fork(`promo:${m.cfg.id}:${kk}`)
        w = null
        if (r.bool(Math.min(0.95, m.cfg.promosPerMonth))) {
          const from = this.d.originMs + kk * 30 * MS.day + Math.floor(r.next() * 28 * MS.day)
          w = { from, to: from + Math.round((1 + r.next() * 4) * MS.day), discount: 0.03 + r.next() * 0.09 }
        }
        this.promoCache.set(key, w)
      }
      if (w && t >= w.from && t < w.to) return { discount: w.discount }
    }
    // seasonal sales: Yalda (30 Azar) and Nowruz run-up (20 Esfand - 5 Farvardin)
    if (m.cfg.joinsSeasonalSales) {
      const j = jalaliOf(t)
      if ((j.jm === 9 && j.jd >= 29) || (j.jm === 10 && j.jd === 1) || (j.jm === 12 && j.jd >= 20) || (j.jm === 1 && j.jd <= 5)) return { discount: 0.05 }
    }
    return null
  }

  priceFor(competitorId: string, family: string, amountUsdCents: UsdCents, t: EpochMs = this.d.env.clock.now()): { priceIrt: Irt; promo: boolean } | null {
    const m = this.members.find((x) => x.cfg.id === competitorId)
    if (!m || !m.active) return null
    return this.priceOfMember(m, family, amountUsdCents, t)
  }

  private priceOfMember(m: Member, family: string, amountUsdCents: UsdCents, t: EpochMs): { priceIrt: Irt; promo: boolean } | null {
    const mk = this.markupAt(m, family, t)
    if (!Number.isFinite(mk)) return null
    const fx = this.d.macro.midAt(Math.max(this.d.originMs, this.lastReprice(m, t) - m.cfg.lagHours * MS.hour)) * (1 + m.cfg.costPremium)
    let price = (amountUsdCents / 100) * fx * (1 + mk) + m.cfg.fixedFeeIrt
    const promo = this.promoFor(m, t)
    if (promo) price *= 1 - promo.discount
    const step = this.cfg.roundingStepIrt
    return { priceIrt: Math.max(step, Math.round(price / step) * step), promo: !!promo }
  }

  // ───────────────────────────── ports / agent API ─────────────────────────────
  async quotes(req: { family: string; productId?: string; amountUsdCents: UsdCents }): Promise<Result<CompetitorPriceQuote[]>> {
    const now = this.d.env.clock.now()
    const out: CompetitorPriceQuote[] = []
    for (const m of this.members) {
      if (!m.active) continue
      const p = this.priceOfMember(m, req.family, req.amountUsdCents, now)
      if (!p) continue
      out.push({ competitorId: m.cfg.id, family: req.family, productId: req.productId, amountUsdCents: req.amountUsdCents, priceIrt: p.priceIrt, asOf: this.lastReprice(m, now) })
    }
    return ok(out)
  }

  offers(family: string, amountUsdCents: UsdCents, t: EpochMs = this.d.env.clock.now()): CompetitorOffer[] {
    const out: CompetitorOffer[] = []
    for (const m of this.members) {
      if (!m.active) continue
      const p = this.priceOfMember(m, family, amountUsdCents, t)
      if (!p) continue
      out.push({ competitorId: m.cfg.id, name: m.cfg.name, strategy: m.cfg.strategy, family, priceIrt: p.priceIrt, slaMinutes: m.cfg.slaMinutes[family] ?? 240, trust: m.cfg.trust, promo: p.promo, asOf: this.lastReprice(m, t) })
    }
    return out
  }

  /** Median competitor price per 1 USD of face value (Toman) for the family at t; 0 when nobody sells it. */
  priceIndex(family: string, t: EpochMs = this.d.env.clock.now()): number {
    const xs = this.offers(family, 10_000, t).map((o) => o.priceIrt / 100)
    return xs.length ? median(xs) : 0
  }

  /** priceIndex / mid - 1: market-wide markup over the USDT rate. */
  markupIndex(family: string, t: EpochMs = this.d.env.clock.now()): number {
    const p = this.priceIndex(family, t)
    return p > 0 ? p / this.d.macro.midAt(t) - 1 : NaN
  }

  list(): { id: string; name: string; strategy: string; active: boolean; trust: number; joinedAt: EpochMs; exitedAt?: EpochMs }[] {
    return this.members.map((m) => ({ id: m.cfg.id, name: m.cfg.name, strategy: m.cfg.strategy, active: m.active, trust: m.cfg.trust, joinedAt: m.joinedAt, exitedAt: m.exitedAt }))
  }
  activeCount(): number {
    return this.members.filter((m) => m.active).length
  }

  /** For SimStateDto.competitors: priceIndex relative to the mid (1 = at cost). */
  snapshot(family = 'virtual_card'): { id: string; name: string; priceIndex: number }[] {
    const now = this.d.env.clock.now()
    const mid = this.d.macro.midAt(now)
    return this.members
      .filter((m) => m.active)
      .map((m) => {
        const p = this.priceOfMember(m, family, 10_000, now)
        return { id: m.cfg.id, name: m.cfg.name, priceIndex: p ? p.priceIrt / 100 / mid : 0 }
      })
  }

  // ───────────────────────────── lifecycle & events ─────────────────────────────
  private lifecycle(t: EpochMs): void {
    const day = Math.floor((t - this.d.originMs) / MS.day)
    if (day <= this.lastLifecycleDay) return
    this.lastLifecycleDay = day
    const r = this.rng.fork(`life:${day}`)
    // exits: lower trust and price wars raise the hazard
    const war = this.warDiscount(t) > 0 ? 3 : 1
    for (const m of this.members) {
      if (!m.active) continue
      const h = (this.cfg.exitHazardPerYear * war * (1.5 - m.cfg.trust)) / 365
      if (r.bool(h) && this.activeCount() > 1) this.deactivate(m, t)
    }
    if (r.bool((this.cfg.entryHazardPerYear * this.entryHazardMult) / 365)) this.enter(t, r)
  }

  private deactivate(m: Member, t: EpochMs): void {
    m.active = false
    m.exitedAt = t
    this.d.env.stats.inc('competitors.exits')
    this.d.env.log.emit('competitor.exit', this.name, { id: m.cfg.id })
  }

  private enter(t: EpochMs, r: Rng): Member | null {
    const free = this.cfg.entryPool.filter((c) => !this.poolUsed.has(c.id))
    let cfg: CompetitorConfig
    if (free.length) cfg = r.pick(free)
    else {
      this.entrySeq += 1
      const tmpl = r.pick(this.cfg.competitors)
      cfg = { ...structuredClone(tmpl), id: `entrant-x${this.entrySeq}`, name: `ورودی جدید ${this.entrySeq}`, trust: 0.25 + r.next() * 0.2, strategy: r.pick(['undercut', 'follow', 'erratic'] as const) }
    }
    this.poolUsed.add(cfg.id)
    const m = this.makeMember(structuredClone(cfg), t)
    this.members.push(m)
    this.d.env.stats.inc('competitors.entries')
    this.d.env.log.emit('competitor.entry', this.name, { id: m.cfg.id, strategy: m.cfg.strategy })
    return m
  }

  applyEvent(type: string, params: Params): EventHandle | null {
    const now = this.d.env.clock.now()
    switch (type) {
      case 'price_war': {
        const w: PriceWar = { fromMs: now, toMs: now + pNum(params, 'durationDays', 45) * MS.day, discount: pNum(params, 'discountPct', 0.08) }
        this.wars.push(w)
        this.d.env.log.emit('competitor.price_war', this.name, { discount: w.discount, until: w.toMs })
        return {
          id: newHandleId('price_war'),
          revert: () => {
            const i = this.wars.indexOf(w)
            if (i >= 0) this.wars.splice(i, 1)
          },
        }
      }
      case 'competitor_entry': {
        const n = Math.max(1, Math.floor(pNum(params, 'count', 1)))
        const created: Member[] = []
        for (let i = 0; i < n; i++) {
          const m = this.enter(now, this.rng.fork(`manual-entry:${this.entrySeq}:${i}:${now}`))
          if (m) created.push(m)
        }
        return {
          id: newHandleId('competitor_entry'),
          revert: () => {
            for (const m of created) if (m.active) this.deactivate(m, this.d.env.clock.now())
          },
        }
      }
      case 'competitor_exit': {
        const id = pStr(params, 'competitor')
        const targets = this.members.filter((m) => m.active && (id === undefined || m.cfg.id === id))
        const victims = id === undefined ? targets.slice(0, Math.max(1, Math.floor(pNum(params, 'count', 1)))) : targets
        for (const m of victims) if (this.activeCount() > 1) this.deactivate(m, now)
        return { id: newHandleId('competitor_exit'), revert: () => undefined }
      }
      case 'competitor_entry_rate': {
        const prev = this.entryHazardMult
        this.entryHazardMult = pNum(params, 'multiplier', 3)
        return { id: newHandleId('entry_rate'), revert: () => void (this.entryHazardMult = prev) }
      }
      default:
        return null
    }
  }
}
