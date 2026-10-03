/**
 * OwnerPolicy: deterministic baseline rule engine. observation → decisions (+ rationale + KPIs seen).
 * Daily call; each rule gates itself by cadence and keeps hysteresis state. All outputs validate against OwnerDecisionBodySchema.
 *
 * Rules (parameters in data/sim/owner_policies.json): kill-switch, staffing (hire/fire with hysteresis), pricing (win-rate band nudges,
 * bounded per decision and per 30 days), FX buffer widening/relaxing, treasury (coverage target, injections, draws), marketing budget & mix,
 * provider failover, risk limits tighten/relax, rush premium, statutory tax payments.
 */
import { MS } from '@hiclaude/contracts'
import { clamp, deepMerge } from '../demand/common'
import { loadPolicyConfig, type DeepPartialConfig, type PolicyConfig, type PolicyPreset } from './config'
import { conflictKey, parseDecisionBody, SHIFTS, type OwnerDecisionBody } from './decisions'
import type { OwnerObservation } from './types'

export interface PolicyDecision {
  decision: OwnerDecisionBody
  rule: string
  rationale: string
  /** the numbers the rule looked at */
  kpiSeen: Record<string, number | string>
}

interface State {
  firstSeen?: number
  lastRun: Record<string, number>
  queueBreachDays: number
  lowUtilWeeks: number
  lastHireAt?: number
  lastFireAt?: number
  marginMoves: Array<{ at: number; family: string; delta: number }>
  fxCalmWeeks: number
  baselineVolMinBuffer?: number
  lastCoverageChangeAt?: number
  injectedThisMonth: { key: string; irt: number }
  lastInjectionAt?: number
  killOn: boolean
  killClearDays: number
  providerWorse: Record<string, number>
  lastProviderSwitchAt: Record<string, number>
  fraudBaseline?: number
  riskLevel: number
  riskCalmWeeks: number
  baseRush: Record<string, number>
  lastVatQuarter?: string
  lastIncomeTaxYear?: number
  locks: Record<string, number>
}

const initialState = (): State => ({
  lastRun: {}, queueBreachDays: 0, lowUtilWeeks: 0, marginMoves: [], fxCalmWeeks: 0, injectedThisMonth: { key: '', irt: 0 }, killOn: false, killClearDays: 0, providerWorse: {}, lastProviderSwitchAt: {}, riskLevel: 0, riskCalmWeeks: 0, baseRush: {}, locks: {},
})

const MILLION = 1_000_000
const roundDown = (x: number, step = MILLION): number => Math.floor(x / step) * step
const r4 = (x: number): number => Math.round(x * 10_000) / 10_000
const pct = (x: number, d = 1): string => `${(x * 100).toFixed(d)}%`

export class OwnerPolicy {
  readonly cfg: PolicyConfig
  private s: State = initialState()

  constructor(opts: { preset?: PolicyPreset; overrides?: DeepPartialConfig<PolicyConfig>; config?: PolicyConfig } = {}) {
    this.cfg = opts.config ? (opts.overrides ? deepMerge(opts.config, opts.overrides) : opts.config) : loadPolicyConfig(opts.preset ?? 'baseline', opts.overrides)
  }

  /** The decision file / LLM persona acted on a lever: the policy stays away from it for `days` (no fighting). */
  observeExternal(d: OwnerDecisionBody, now: number, days = 30): void {
    this.s.locks[conflictKey(d)] = now + days * MS.day
    if (d.type === 'hire_operator') this.s.lastHireAt = now
    if (d.type === 'fire_operator') this.s.lastFireAt = now
    if (d.type === 'capital_injection') this.s.lastInjectionAt = now
  }

  private locked(key: string, now: number): boolean {
    return (this.s.locks[key] ?? 0) > now
  }
  private due(key: string, now: number, everyDays: number): boolean {
    const last = this.s.lastRun[key]
    if (last === undefined) {
      this.s.lastRun[key] = now // first observation starts the clock: no decision on day 0
      return false
    }
    if (now - last >= everyDays * MS.day - MS.hour) {
      this.s.lastRun[key] = now
      return true
    }
    return false
  }

  /** Evaluate all rules for one observation (call once per simulated day). */
  decide(obs: OwnerObservation): PolicyDecision[] {
    const now = obs.now
    if (this.s.firstSeen === undefined) this.s.firstSeen = now
    const out: PolicyDecision[] = []
    const push = (rule: string, decision: OwnerDecisionBody, rationale: string, kpiSeen: Record<string, number | string>): void => {
      if (this.locked(conflictKey(decision), now)) return
      const valid = parseDecisionBody({ ...decision, rationale })
      out.push({ decision: valid, rule, rationale, kpiSeen })
    }
    this.ruleKillSwitch(obs, push)
    this.ruleStaffing(obs, push)
    this.rulePricing(obs, push)
    this.ruleFxBuffers(obs, push)
    this.ruleTreasury(obs, push)
    this.ruleMarketing(obs, push)
    this.ruleProviders(obs, push)
    this.ruleRisk(obs, push)
    this.ruleRush(obs, push)
    this.ruleTax(obs, push)
    // never inject and draw in the same call; injection wins
    if (out.some((d) => d.decision.type === 'capital_injection')) return out.filter((d) => d.decision.type !== 'owner_draw')
    return out
  }

  // ───────────────────────── rules ─────────────────────────
  private ruleKillSwitch(obs: OwnerObservation, push: Push): void {
    const crit = obs.alerts.filter((a) => a.severity === 'critical' && this.cfg.killSwitch.onAlertCodes.includes(a.code))
    if (crit.length > 0) {
      this.s.killClearDays = 0
      if (!this.s.killOn) {
        this.s.killOn = true
        push('kill_switch', { type: 'kill_switch', on: true, reason: `critical alert ${crit[0]!.code}` }, `Critical integrity alert(s): ${crit.map((a) => a.code).join(', ')}. Stop selling until reconciled.`, { alerts: crit.length })
      }
    } else if (this.s.killOn) {
      this.s.killClearDays++
      if (this.s.killClearDays >= 2) {
        this.s.killOn = false
        push('kill_switch', { type: 'kill_switch', on: false, reason: 'integrity alerts cleared for 2 days' }, 'Alerts cleared for two consecutive days; resume selling.', { clearDays: this.s.killClearDays })
      }
    }
  }

  private ruleStaffing(obs: OwnerObservation, push: Push): void {
    const c = this.cfg.staffing
    const now = obs.now
    // daily: queue-age breach counter
    if (obs.kpi.queueAgeP90Min > c.slaMinutes) this.s.queueBreachDays++
    else this.s.queueBreachDays = 0
    const canAfford = !(obs.cash.runwayDays < this.cfg.treasury.minRunwayDays / 2 && obs.cash.burnPerDayIrt > 0)
    const cooled = this.s.lastHireAt === undefined || now - this.s.lastHireAt >= c.cooldownDaysAfterHire * MS.day
    if (this.s.queueBreachDays >= c.queueAgeBreachDaysToHire && obs.staff.operators < c.maxOperators && cooled && canAfford) {
      const count = Math.min(c.hireCountPerDecision, c.maxOperators - obs.staff.operators)
      const shift = leastStaffedShift(obs.staff.byShift)
      this.s.lastHireAt = now
      const days = this.s.queueBreachDays
      this.s.queueBreachDays = 0
      push('staffing.hire', { type: 'hire_operator', count, shift }, `Queue-age p90 ${obs.kpi.queueAgeP90Min.toFixed(0)} min exceeded the ${c.slaMinutes} min SLA for ${days} consecutive days; adding capacity on the thinnest shift.`, { queueAgeP90Min: obs.kpi.queueAgeP90Min, breachDays: days, operators: obs.staff.operators, utilisation: r4(obs.kpi.operatorUtilisation) })
    }
    if (this.due('weekly.util', now, 7)) {
      if (obs.kpi.operatorUtilisation < c.lowUtilisation && obs.kpi.queueAgeP90Min <= c.slaMinutes * 0.5) this.s.lowUtilWeeks++
      else this.s.lowUtilWeeks = 0
      const noFire = this.s.lastHireAt !== undefined && now - this.s.lastHireAt < c.noFireDaysAfterHire * MS.day
      if (this.s.lowUtilWeeks >= c.lowUtilisationWeeksToFire && obs.staff.operators > c.minOperators && !noFire) {
        const w = this.s.lowUtilWeeks
        this.s.lowUtilWeeks = 0
        this.s.lastFireAt = now
        push('staffing.fire', { type: 'fire_operator', count: 1 }, `Operator utilisation ${pct(obs.kpi.operatorUtilisation, 0)} < ${pct(c.lowUtilisation, 0)} for ${w} weeks with healthy queues; releasing one operator.`, { utilisation: r4(obs.kpi.operatorUtilisation), weeks: w, operators: obs.staff.operators })
      }
    }
  }

  private rulePricing(obs: OwnerObservation, push: Push): void {
    const c = this.cfg.pricing
    const now = obs.now
    if (!this.due('pricing', now, c.cadenceDays)) return
    this.s.marginMoves = this.s.marginMoves.filter((m) => now - m.at < 30 * MS.day)
    const capacityStress = this.s.queueBreachDays >= 2 || obs.kpi.slaAttainment < 0.85
    const floor = Math.max(c.floorMarginPct, obs.pricing.floorMarginPct ?? 0)
    const ceil = Math.min(c.maxMarginPct, obs.pricing.maxMarginPct ?? Infinity)
    for (const family of Object.keys(obs.families).sort()) {
      const f = obs.families[family]!
      if (f.quotes < c.minQuotesForDecision) continue
      let delta = 0
      let why = ''
      if (f.conversionRate > c.winRateHigh) {
        delta = c.marginStepPct
        why = `win rate ${pct(f.conversionRate)} above the ${pct(c.winRateHigh, 0)} band top: we leave money on the table`
      } else if (capacityStress && f.conversionRate >= c.winRateLow) {
        delta = c.marginStepPct
        why = `capacity stress (SLA ${pct(obs.kpi.slaAttainment, 0)}, queue breach ${this.s.queueBreachDays}d): ration demand with price`
      } else if (f.conversionRate < c.winRateLow) {
        delta = -c.marginStepPct
        why = `win rate ${pct(f.conversionRate)} below the ${pct(c.winRateLow, 0)} band floor: price too high vs market`
      }
      if (delta === 0) continue
      delta = clamp(delta, -c.maxMarginStepPerDecisionPct, c.maxMarginStepPerDecisionPct)
      const recent = this.s.marginMoves.filter((m) => m.family === family).reduce((a, m) => a + m.delta, 0)
      const allowed = clamp(recent + delta, -c.maxCumulative30dPct, c.maxCumulative30dPct) - recent
      let next = r4(clamp(f.marginPct + allowed, floor, ceil))
      const applied = r4(next - f.marginPct)
      if (Math.abs(applied) < 1e-9) continue
      this.s.marginMoves.push({ at: now, family, delta: applied })
      next = r4(f.marginPct + applied)
      push('pricing.margin', { type: 'set_margin', family, marginPct: next }, `${family}: ${why}; margin ${pct(f.marginPct)} → ${pct(next)}.`, { family, conversionRate: r4(f.conversionRate), quotes: f.quotes, marginPct: f.marginPct, move30d: r4(recent + applied) })
    }
  }

  private ruleFxBuffers(obs: OwnerObservation, push: Push): void {
    const c = this.cfg.pricing.fxLossBufferTrigger
    const now = obs.now
    if (this.s.baselineVolMinBuffer === undefined) this.s.baselineVolMinBuffer = obs.pricing.volatilityMinBufferPct
    if (!this.due('fx', now, 7)) return
    const loss = Math.max(0, -(obs.fx.realisedFxResultIrt))
    const gp = Math.max(1, obs.kpi.grossProfitIrt)
    const ratio = loss / gp
    const cur = obs.pricing.volatilityMinBufferPct
    if (ratio > c.fxLossToGrossProfitRatio && cur < c.maxVolMinBufferPct) {
      this.s.fxCalmWeeks = 0
      const next = r4(Math.min(c.maxVolMinBufferPct, cur + c.bufferStepPct))
      push('fx.buffers', { type: 'set_buffers', volatilityMinBufferPct: next }, `Realised FX loss ${Math.round(loss).toLocaleString('en-US')} IRT = ${pct(ratio, 0)} of gross profit (> ${pct(c.fxLossToGrossProfitRatio, 0)}); widening the minimum volatility buffer ${pct(cur, 2)} → ${pct(next, 2)}.`, { fxLossIrt: loss, fxLossToGrossProfit: r4(ratio), bufferPct: cur })
    } else if (ratio <= 0.05 && cur > (this.s.baselineVolMinBuffer ?? cur) + 1e-9) {
      this.s.fxCalmWeeks++
      if (this.s.fxCalmWeeks >= c.calmWeeksToRelax) {
        this.s.fxCalmWeeks = 0
        const next = r4(Math.max(this.s.baselineVolMinBuffer ?? cur, cur - c.bufferStepPct))
        push('fx.buffers', { type: 'set_buffers', volatilityMinBufferPct: next }, `FX calm for ${c.calmWeeksToRelax} weeks; relaxing the volatility buffer ${pct(cur, 2)} → ${pct(next, 2)}.`, { fxLossToGrossProfit: r4(ratio), bufferPct: cur })
      }
    } else if (ratio > 0.05) this.s.fxCalmWeeks = 0
  }

  private ruleTreasury(obs: OwnerObservation, push: Push): void {
    const c = this.cfg.treasury
    const now = obs.now
    // coverage target by volatility regime (hysteresis: ≥ 1 day change, ≥ 7 days since last change)
    const vol = obs.fx.dailyVolPct
    const want = vol >= c.highVolDailyPct ? c.highVolCoverageDays : vol <= c.lowVolDailyPct ? c.lowVolCoverageDays : c.baseCoverageDays
    const lastChange = this.s.lastCoverageChangeAt
    if (Math.abs(want - obs.treasury.targetCoverageDays) >= 1 && (lastChange === undefined || now - lastChange >= 7 * MS.day) && this.s.firstSeen !== now) {
      this.s.lastCoverageChangeAt = now
      push('treasury.coverage', { type: 'set_target_coverage', days: want }, `Daily USDT volatility ${vol.toFixed(2)}% → target float coverage ${obs.treasury.targetCoverageDays}d → ${want}d.`, { dailyVolPct: vol, targetCoverageDays: obs.treasury.targetCoverageDays })
    }
    // capital injection when runway is short
    const monthKey = obs.date.slice(0, 7)
    if (this.s.injectedThisMonth.key !== monthKey) this.s.injectedThisMonth = { key: monthKey, irt: 0 }
    const burning = obs.cash.burnPerDayIrt > 0
    const cooled = this.s.lastInjectionAt === undefined || now - this.s.lastInjectionAt >= 7 * MS.day
    if (burning && obs.cash.runwayDays < c.minRunwayDays && cooled) {
      const need = obs.cash.burnPerDayIrt * c.restoreRunwayDays - obs.cash.cashIrt
      const room = Math.max(0, c.maxInjectionPerMonthIrt - this.s.injectedThisMonth.irt)
      const avail = obs.cash.ownerCapitalAvailableIrt ?? Infinity
      const amt = roundDown(Math.min(need, room, avail))
      if (amt >= MILLION) {
        this.s.injectedThisMonth.irt += amt
        this.s.lastInjectionAt = now
        push('treasury.injection', { type: 'capital_injection', irt: amt }, `Runway ${obs.cash.runwayDays.toFixed(0)}d < ${c.minRunwayDays}d at burn ${Math.round(obs.cash.burnPerDayIrt).toLocaleString('en-US')} IRT/day; injecting capital toward ${c.restoreRunwayDays}d (monthly cap ${c.maxInjectionPerMonthIrt.toLocaleString('en-US')}).`, { runwayDays: r4(obs.cash.runwayDays), cashIrt: obs.cash.cashIrt, burnPerDayIrt: obs.cash.burnPerDayIrt })
      }
    }
    // monthly owner draw
    if (this.due('treasury.draw', now, c.cadenceDays)) {
      const opex = Math.max(1, obs.cash.opexPerMonthIrt)
      const threshold = c.drawCashMonthsOfOpexThreshold * opex
      const profitable = (obs.cash.netProfitLast30dIrt ?? obs.kpi.netProfitIrt ?? 0) > 0
      if (obs.cash.cashIrt > threshold && profitable && obs.cash.runwayDays >= c.minRunwayDaysForDraw && !this.s.killOn) {
        const amt = roundDown((obs.cash.cashIrt - threshold) * c.drawFractionOfExcess)
        if (amt >= MILLION) push('treasury.draw', { type: 'owner_draw', irt: amt }, `Cash covers ${(obs.cash.cashIrt / opex).toFixed(1)} months of opex (> ${c.drawCashMonthsOfOpexThreshold}) and the business is profitable; drawing ${pct(c.drawFractionOfExcess, 0)} of the excess.`, { cashIrt: obs.cash.cashIrt, monthsOfOpex: r4(obs.cash.cashIrt / opex), netProfit30d: obs.cash.netProfitLast30dIrt ?? 0 })
      }
    }
  }

  private ruleMarketing(obs: OwnerObservation, push: Push): void {
    const c = this.cfg.marketing
    if (!this.due('marketing', obs.now, c.cadenceDays)) return
    const cur = obs.marketing.monthlyBudgetIrt
    let target: number
    let why: string
    if (obs.cash.runwayDays < c.zeroBudgetRunwayDays && obs.cash.burnPerDayIrt > 0) {
      target = 0
      why = `runway ${obs.cash.runwayDays.toFixed(0)}d < ${c.zeroBudgetRunwayDays}d: pausing paid acquisition`
    } else {
      target = clamp(roundDown(Math.max(0, obs.cash.cashIrt) * c.budgetShareOfCash), c.minBudgetIrt, c.maxBudgetIrt)
      why = `base budget ${pct(c.budgetShareOfCash, 0)} of cash`
      const lc = obs.marketing.ltvToCac
      if (lc !== undefined) {
        if (lc >= c.ltvToCacIncrease) {
          target = Math.max(target, Math.min(c.maxBudgetIrt, cur * c.increaseFactor))
          why += `; LTV/CAC ${lc.toFixed(1)} ≥ ${c.ltvToCacIncrease} → scale up`
        } else if (lc <= c.ltvToCacDecrease) {
          target = Math.min(target, cur * c.decreaseFactor)
          why += `; LTV/CAC ${lc.toFixed(1)} ≤ ${c.ltvToCacDecrease} → cut`
        }
      }
      target = clamp(roundDown(target), 0, c.maxBudgetIrt)
      if (cur === 0 && target > 0) target = Math.max(target, c.minBudgetIrt)
    }
    const mix = this.nextMix(obs)
    const budgetChanged = Math.abs(target - cur) >= Math.max(MILLION, 0.05 * cur)
    if (!budgetChanged && !mix) return
    push('marketing', { type: 'set_marketing_budget', monthlyIrt: budgetChanged ? target : cur, ...(mix ? { mix } : {}) }, `${why}${mix ? '; mix shifted toward lower-CAC channels' : ''}.`, { cashIrt: obs.cash.cashIrt, currentBudget: cur, ltvToCac: obs.marketing.ltvToCac ?? 'n/a', blendedCac: obs.marketing.blendedCac ?? 'n/a' })
  }

  private nextMix(obs: OwnerObservation): Record<string, number> | undefined {
    const cur = obs.marketing.mix
    const cac = obs.marketing.cacByChannel
    const ids = Object.keys(cur).filter((k) => (cur[k] ?? 0) > 0)
    const known = ids.filter((k) => (cac[k] ?? 0) > 0)
    if (known.length < 2) return undefined
    const inv = known.map((k) => 1 / (cac[k] as number))
    const invSum = inv.reduce((a, b) => a + b, 0)
    const knownMass = known.reduce((a, k) => a + (cur[k] as number), 0)
    const maxShift = this.cfg.marketing.mixShiftMaxPct
    const next: Record<string, number> = { ...cur }
    known.forEach((k, i) => {
      const t = (inv[i] as number / invSum) * knownMass
      next[k] = clamp((cur[k] as number) + clamp(t - (cur[k] as number), -maxShift, maxShift), 0.01, 1)
    })
    const tot = Object.values(next).reduce((a, b) => a + b, 0)
    for (const k of Object.keys(next)) next[k] = r4((next[k] as number) / tot)
    const changed = Object.keys(next).some((k) => Math.abs((next[k] as number) - (cur[k] ?? 0)) > 0.005)
    return changed ? next : undefined
  }

  private ruleProviders(obs: OwnerObservation, push: Push): void {
    const c = this.cfg.providers
    const now = obs.now
    for (const p of [...obs.providers].sort((a, b) => (a.id < b.id ? -1 : 1))) {
      for (const family of [...p.active].sort()) {
        const alts = obs.providers.filter((q) => q.id !== p.id && q.serves.includes(family))
        if (alts.length === 0) continue
        const best = [...alts].sort((a, b) => a.failureRate - b.failureRate || a.feeBps - b.feeBps || (a.id < b.id ? -1 : 1))[0]!
        const worse = p.failureRate - best.failureRate > c.failureRateMargin || p.feeBps - best.feeBps > c.feeBpsMargin
        const key = `${family}|${p.id}`
        this.s.providerWorse[key] = worse ? (this.s.providerWorse[key] ?? 0) + 1 : 0
        const last = this.s.lastProviderSwitchAt[family]
        if ((this.s.providerWorse[key] ?? 0) >= c.observationsRequired && (last === undefined || now - last >= c.cooldownDays * MS.day)) {
          this.s.providerWorse[key] = 0
          this.s.lastProviderSwitchAt[family] = now
          push('providers.failover', { type: 'switch_provider', family, providerId: best.id }, `${family}: ${p.id} failure ${pct(p.failureRate)} / ${p.feeBps}bps vs ${best.id} ${pct(best.failureRate)} / ${best.feeBps}bps for ${c.observationsRequired} observations; switching.`, { family, from: p.id, to: best.id, failureRateFrom: r4(p.failureRate), failureRateTo: r4(best.failureRate) })
        }
      }
    }
  }

  private ruleRisk(obs: OwnerObservation, push: Push): void {
    const c = this.cfg.risk
    if (!this.due('risk', obs.now, 7)) return
    const rate = obs.kpi.fraudLossRate
    const trigger = c.fraudLossRateTriggerPct / 100
    const base = this.s.fraudBaseline
    const spike = rate > trigger || (base !== undefined && base > 0 && rate > c.fraudSpikeMultiple * base && rate > trigger / 4)
    this.s.fraudBaseline = base === undefined ? rate : 0.9 * base + 0.1 * rate
    const curMax = obs.risk.newCustomerMaxOrderUsdCents
    const curHold = obs.risk.holdScoreThreshold
    if (spike) {
      this.s.riskCalmWeeks = 0
      const nextMax = Math.max(c.minNewCustomerMaxOrderUsdCents, Math.round((curMax * c.tightenFactor) / 100) * 100)
      const nextHold = Math.max(c.minHoldScore, curHold - c.holdScoreStep)
      if (nextMax < curMax || nextHold < curHold) {
        this.s.riskLevel++
        push('risk.tighten', { type: 'set_risk_limits', newCustomerMaxOrderUsdCents: nextMax, holdScoreThreshold: nextHold }, `Fraud loss rate ${pct(rate, 2)} (trigger ${pct(trigger, 2)}); tightening new-customer cap $${(curMax / 100).toFixed(0)} → $${(nextMax / 100).toFixed(0)} and hold threshold ${curHold} → ${nextHold}.`, { fraudLossRate: r4(rate), baseline: r4(base ?? 0), level: this.s.riskLevel })
      }
    } else if (this.s.riskLevel > 0) {
      this.s.riskCalmWeeks++
      if (this.s.riskCalmWeeks >= c.calmWeeksToRelax) {
        this.s.riskCalmWeeks = 0
        this.s.riskLevel--
        const nextMax = Math.min(c.defaultNewCustomerMaxOrderUsdCents, Math.round(curMax / c.tightenFactor / 100) * 100)
        const nextHold = Math.min(c.maxHoldScore, curHold + c.holdScoreStep)
        push('risk.relax', { type: 'set_risk_limits', newCustomerMaxOrderUsdCents: nextMax, holdScoreThreshold: nextHold }, `Fraud calm for ${c.calmWeeksToRelax} weeks; relaxing limits one notch.`, { fraudLossRate: r4(rate), level: this.s.riskLevel })
      }
    }
  }

  private ruleRush(obs: OwnerObservation, push: Push): void {
    if (!obs.rush) return
    const c = this.cfg.rush
    if (!this.due('rush', obs.now, c.cadenceDays)) return
    for (const tier of Object.keys(obs.rush).sort()) {
      const r = obs.rush[tier]!
      if (this.s.baseRush[tier] === undefined) this.s.baseRush[tier] = r.premiumPct
      const base = this.s.baseRush[tier] as number
      if (r.utilisation >= c.saturationUtilisation && r.premiumPct < c.maxPremiumPct) {
        const next = r4(Math.min(c.maxPremiumPct, r.premiumPct * (1 + c.premiumStepRel)))
        push('rush.premium', { type: 'set_rush', tier, premiumPct: next }, `Rush tier ${tier} saturated (utilisation ${pct(r.utilisation, 0)}); premium ${pct(r.premiumPct)} → ${pct(next)}.`, { tier, utilisation: r4(r.utilisation), premiumPct: r.premiumPct })
      } else if (r.utilisation < 0.4 && r.premiumPct > base + 1e-9) {
        const next = r4(Math.max(base, r.premiumPct / (1 + c.premiumStepRel)))
        push('rush.premium', { type: 'set_rush', tier, premiumPct: next }, `Rush tier ${tier} underused (${pct(r.utilisation, 0)}); premium back toward base ${pct(base)}.`, { tier, utilisation: r4(r.utilisation), premiumPct: r.premiumPct })
      }
    }
  }

  private ruleTax(obs: OwnerObservation, push: Push): void {
    const c = this.cfg.tax
    const jm = obs.jalaliMonth
    const jd = obs.jalaliDay
    // VAT: paid in the month after each Jalali quarter (months 1,4,7,10) from the configured day
    if ([1, 4, 7, 10].includes(jm) && jd >= c.vatPayDayOfMonthAfterQuarter) {
      const qKey = `${obs.date.slice(0, 4)}-${jm}`
      const vat = obs.cash.vatPayableIrt ?? 0
      if (this.s.lastVatQuarter !== qKey && vat > 0) {
        this.s.lastVatQuarter = qKey
        const amt = Math.min(vat, Math.max(0, Math.floor(obs.cash.cashIrt * 0.9)))
        if (amt > 0) push('tax.vat', { type: 'pay_tax', kind: 'vat', irt: Math.floor(amt) }, `Quarterly VAT settlement (Jalali month ${jm}, day ${jd}): ${Math.floor(amt).toLocaleString('en-US')} IRT of ${Math.round(vat).toLocaleString('en-US')} payable. Calendar is an assumption — confirm with a licensed accountant.`, { vatPayableIrt: vat, cashIrt: obs.cash.cashIrt })
      }
    }
    if (jm === c.incomeTaxPayJalaliMonth && jd >= 1) {
      const tax = obs.cash.incomeTaxPayableIrt ?? 0
      const key = Number(obs.date.slice(0, 4))
      if (this.s.lastIncomeTaxYear !== key && tax > 0) {
        this.s.lastIncomeTaxYear = key
        const amt = Math.min(tax, Math.max(0, Math.floor(obs.cash.cashIrt * 0.9)))
        if (amt > 0) push('tax.income', { type: 'pay_tax', kind: 'income', irt: Math.floor(amt) }, `Annual income-tax settlement: ${Math.floor(amt).toLocaleString('en-US')} IRT of ${Math.round(tax).toLocaleString('en-US')} payable (assumed month ${c.incomeTaxPayJalaliMonth}; confirm with a licensed accountant).`, { incomeTaxPayableIrt: tax, cashIrt: obs.cash.cashIrt })
      }
    }
  }

  snapshot(): string {
    return JSON.stringify(this.s)
  }
  restore(snap: string): void {
    this.s = JSON.parse(snap) as State
  }
}

type Push = (rule: string, decision: OwnerDecisionBody, rationale: string, kpiSeen: Record<string, number | string>) => void

function leastStaffedShift(byShift: Record<string, number>): (typeof SHIFTS)[number] {
  const order = ['evening', 'morning', 'night'] as const // tie-break: busiest hours first
  let best: (typeof SHIFTS)[number] = 'evening'
  let bn = Infinity
  for (const s of order) {
    const n = byShift[s] ?? 0
    if (n < bn) {
      bn = n
      best = s
    }
  }
  return best
}
