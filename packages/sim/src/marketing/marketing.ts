/**
 * Marketing: per-channel spend → visits with
 *   • first-order adstock lag      E ← E + (s_eff − E)(1 − e^(−dt/τ))      (SEO compounds slowly, ads respond in days)
 *   • Hill saturation               visits/day = Vmax · (1 − fatigue) · E^h / (K^h + E^h)
 *   • audience fatigue              rises when E ≫ K, recovers with a half-life
 *   • inflation indexing            s_eff = spend / costIndex (Toman inflation makes the same budget buy fewer visits)
 * CAC dynamics are measured: exponentially-windowed spend / acquired customers (fed back by the runner via recordAcquisition).
 * Pure state machine: no clock, no RNG. The runner turns `sources()` into arrivals via demand.ArrivalProcess.
 */
import { MS } from '@hiclaude/contracts'
import type { SourceVisits } from '../demand/arrival'
import { safeDiv } from '../demand/common'
import type { ChannelConfig, MarketingConfig } from './config'

const DAYS_PER_MONTH = 30

export interface MarketingStepInputs {
  /** inflation / cost index (1 at start). Default 1. */
  costIndex?: number
  /** extra multiplier on all visits (e.g. scenario `demand.marketMultiplier`, internet shutdown) */
  visitsMultiplier?: number
}

export interface ChannelStepResult {
  channel: string
  spendIrt: number
  visitsPerDay: number
  expectedVisits: number
  expectedSignups: number
  fatigue: number
  effectiveSpendIrtPerMonth: number
}

export interface MarketingStepOutput {
  spendIrt: number
  channels: ChannelStepResult[]
  /** rates for the arrival process */
  sources: SourceVisits[]
}

interface ChannelState {
  adstock: number
  fatigue: number
  cumSpend: number
  cumAcquired: number
  lifetimeSpend: number
  lifetimeAcquired: number
  lifetimeVisits: number
}

export interface MarketingSnapshot {
  budgetMonthlyIrt: number
  mix: Record<string, number>
  channels: Record<string, ChannelState>
  referralPaidThisMonthIrt: number
  referralMonthKey: number
}

/** Hill saturation: s^h / (K^h + s^h). */
export const hill = (s: number, k: number, h: number): number => {
  if (s <= 0) return 0
  const sh = Math.pow(s, h)
  return sh / (Math.pow(k, h) + sh)
}

/** Steady-state visits/day of a channel for a constant (already deflated) monthly spend, ignoring fatigue. */
export function steadyVisitsPerDay(c: ChannelConfig, monthlySpendIrt: number): number {
  return c.maxVisitsPerDay * hill(monthlySpendIrt, c.halfSaturationIrtPerMonth, c.hill)
}

/** Average cost per visit at steady state (IRT). */
export function averageCpvIrt(c: ChannelConfig, monthlySpendIrt: number): number {
  const v = steadyVisitsPerDay(c, monthlySpendIrt) * DAYS_PER_MONTH
  return v > 0 ? monthlySpendIrt / v : Infinity
}

/** Marginal cost of one more visit at spend s (numeric derivative, IRT per visit). */
export function marginalCpvIrt(c: ChannelConfig, monthlySpendIrt: number): number {
  const h = Math.max(1, monthlySpendIrt * 1e-4)
  const dv = (steadyVisitsPerDay(c, monthlySpendIrt + h) - steadyVisitsPerDay(c, Math.max(0, monthlySpendIrt - h))) * DAYS_PER_MONTH
  const ds = monthlySpendIrt + h - Math.max(0, monthlySpendIrt - h)
  return dv > 0 ? ds / dv : Infinity
}

export class Marketing {
  private budget: number
  private mix: Record<string, number>
  private readonly state = new Map<string, ChannelState>()
  private referralPaid = 0
  private referralMonthKey = -1

  constructor(readonly cfg: MarketingConfig, opts: { monthlyBudgetIrt?: number; mix?: Record<string, number> } = {}) {
    this.budget = opts.monthlyBudgetIrt ?? cfg.initialMonthlyBudgetIrt
    this.mix = normaliseMix(cfg, opts.mix ?? cfg.defaultMix)
    for (const c of cfg.channels) this.state.set(c.id, { adstock: 0, fatigue: 0, cumSpend: 0, cumAcquired: 0, lifetimeSpend: 0, lifetimeAcquired: 0, lifetimeVisits: 0 })
  }

  get monthlyBudgetIrt(): number {
    return this.budget
  }
  get currentMix(): Record<string, number> {
    return { ...this.mix }
  }

  /** Owner decision `set_marketing_budget`. Mix is renormalised; unknown channels are rejected. */
  setBudget(monthlyIrt: number, mix?: Record<string, number>): void {
    if (!(monthlyIrt >= 0) || !Number.isFinite(monthlyIrt)) throw new RangeError('monthlyIrt must be ≥ 0')
    this.budget = monthlyIrt
    if (mix) this.mix = normaliseMix(this.cfg, mix)
  }

  channel(id: string): ChannelConfig {
    const c = this.cfg.channels.find((x) => x.id === id)
    if (!c) throw new Error(`unknown marketing channel ${id}`)
    return c
  }

  /** Advance dt: accrue spend, update adstock/fatigue, compute current visit rates. */
  step(dtMs: number, inputs: MarketingStepInputs = {}): MarketingStepOutput {
    const costIndex = Math.max(0.01, inputs.costIndex ?? 1)
    const vm = inputs.visitsMultiplier ?? 1
    const dtDays = dtMs / MS.day
    const out: ChannelStepResult[] = []
    const sources: SourceVisits[] = []
    let totalSpend = 0
    for (const c of this.cfg.channels) {
      const st = this.state.get(c.id) as ChannelState
      const rate = this.budget * (this.mix[c.id] ?? 0) // nominal IRT/month
      const spend = (rate * dtDays) / DAYS_PER_MONTH
      const sEff = rate / costIndex
      const a = 1 - Math.exp(-dtDays / c.lagDays)
      st.adstock += (sEff - st.adstock) * a
      const pressure = st.adstock / c.halfSaturationIrtPerMonth
      const fTarget = c.fatigueMax * (1 - Math.exp(-Math.max(0, pressure - 0.5)))
      const tau = fTarget >= st.fatigue ? 30 : c.fatigueRecoveryHalfLifeDays / Math.LN2
      st.fatigue = fTarget + (st.fatigue - fTarget) * Math.exp(-dtDays / tau)
      const visitsPerDay = c.maxVisitsPerDay * (1 - st.fatigue) * hill(st.adstock, c.halfSaturationIrtPerMonth, c.hill) * vm
      const expected = visitsPerDay * dtDays
      st.cumSpend = st.cumSpend * Math.exp(-dtDays / this.cfg.cacWindowDays) + spend
      st.cumAcquired *= Math.exp(-dtDays / this.cfg.cacWindowDays)
      st.lifetimeSpend += spend
      st.lifetimeVisits += expected
      totalSpend += spend
      out.push({ channel: c.id, spendIrt: spend, visitsPerDay, expectedVisits: expected, expectedSignups: expected * c.visitToSignupRate, fatigue: st.fatigue, effectiveSpendIrtPerMonth: st.adstock })
      if (visitsPerDay > 1e-9) sources.push({ source: c.id, visitsPerDay, segmentMix: c.segmentMix, channelTilt: c.customerChannelTilt })
    }
    return { spendIrt: totalSpend, channels: out, sources }
  }

  /** Current visit rates without advancing time. */
  sources(): SourceVisits[] {
    const out: SourceVisits[] = []
    for (const c of this.cfg.channels) {
      const st = this.state.get(c.id) as ChannelState
      const v = c.maxVisitsPerDay * (1 - st.fatigue) * hill(st.adstock, c.halfSaturationIrtPerMonth, c.hill)
      if (v > 1e-9) out.push({ source: c.id, visitsPerDay: v, segmentMix: c.segmentMix, channelTilt: c.customerChannelTilt })
    }
    return out
  }

  /** The runner reports newly acquired customers (first orders) by their source channel. */
  recordAcquisition(channelId: string, newCustomers: number): void {
    const st = this.state.get(channelId)
    if (!st) return // organic / referral / repeat are not paid channels
    st.cumAcquired += newCustomers
    st.lifetimeAcquired += newCustomers
  }

  /** Windowed CAC per channel (IRT per acquired customer); undefined until the first acquisition. */
  cac(channelId: string): number | undefined {
    const st = this.state.get(channelId)
    if (!st || st.cumAcquired <= 0) return undefined
    return st.cumSpend / st.cumAcquired
  }

  /** Blended windowed CAC across paid channels; `undefined` before any acquisition. */
  blendedCac(): number | undefined {
    let s = 0
    let a = 0
    for (const st of this.state.values()) {
      s += st.cumSpend
      a += st.cumAcquired
    }
    return a > 0 ? s / a : undefined
  }

  cacByChannel(): Record<string, number> {
    const o: Record<string, number> = {}
    for (const c of this.cfg.channels) {
      const v = this.cac(c.id)
      if (v !== undefined) o[c.id] = v
    }
    return o
  }

  lifetime(channelId: string): { spendIrt: number; visits: number; acquired: number } {
    const st = this.state.get(channelId) as ChannelState
    return { spendIrt: st.lifetimeSpend, visits: st.lifetimeVisits, acquired: st.lifetimeAcquired }
  }

  /**
   * Referral rewards for `firstOrders` referred first orders; returns the IRT actually paid (monthly cap).
   * Only real, distinct customers earn rewards (no self-referral farming: guardrail CLAUDE.md section 3).
   */
  payReferralRewards(firstOrders: number, monthKey: number): number {
    if (monthKey !== this.referralMonthKey) {
      this.referralMonthKey = monthKey
      this.referralPaid = 0
    }
    const want = Math.max(0, Math.floor(firstOrders)) * this.cfg.referral.rewardIrtPerFirstOrder
    const room = Math.max(0, this.cfg.referral.rewardCapPerMonthIrt - this.referralPaid)
    const pay = Math.min(want, room)
    this.referralPaid += pay
    return pay
  }

  snapshot(): MarketingSnapshot {
    const channels: Record<string, ChannelState> = {}
    for (const [k, v] of this.state) channels[k] = { ...v }
    return { budgetMonthlyIrt: this.budget, mix: { ...this.mix }, channels, referralPaidThisMonthIrt: this.referralPaid, referralMonthKey: this.referralMonthKey }
  }

  restore(s: MarketingSnapshot): void {
    this.budget = s.budgetMonthlyIrt
    this.mix = { ...s.mix }
    for (const [k, v] of Object.entries(s.channels)) this.state.set(k, { ...v })
    this.referralPaid = s.referralPaidThisMonthIrt
    this.referralMonthKey = s.referralMonthKey
  }
}

/** Normalise a mix over the configured channels (unknown channel ids throw; all-zero throws). */
export function normaliseMix(cfg: MarketingConfig, mix: Record<string, number>): Record<string, number> {
  const ids = new Set(cfg.channels.map((c) => c.id))
  let tot = 0
  for (const [k, v] of Object.entries(mix)) {
    if (!ids.has(k)) throw new Error(`unknown marketing channel in mix: ${k}`)
    if (v < 0 || !Number.isFinite(v)) throw new RangeError(`negative mix weight for ${k}`)
    tot += v
  }
  if (tot <= 0) throw new RangeError('marketing mix sums to zero')
  const out: Record<string, number> = {}
  for (const c of cfg.channels) if (mix[c.id]) out[c.id] = (mix[c.id] as number) / tot
  return out
}

/** LTV/CAC style helper for the owner policy. */
export const ltvToCac = (ltvIrt: number, cacIrt: number | undefined): number | undefined => (cacIrt && cacIrt > 0 ? safeDiv(ltvIrt, cacIrt) : undefined)
