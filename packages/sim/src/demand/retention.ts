/**
 * Satisfaction, repeat purchase, churn and referral maths.
 *  satisfaction s ∈ [0,1]  (EMA over orders)
 *  P(repeat | s, n) = clamp( base · f(s) · (1 + 0.05·min(n−1, 6)) , 0, 0.97 ),  f(s) = (0.35 + 1.3·s) / (0.35 + 1.3·0.75)
 *  delay ~ Weibull(shape, scale · g(s)),  g(s) = 1.5 − 0.667·s   (satisfied customers come back sooner)
 *  referral: with prob propensity·f(s)·[s ≥ 0.5] the customer brings 1 + Poisson(meanReferred − 1) visitors after Exp(delayMean) days.
 */
import { MS, type EpochMs, type Rng } from '@hiclaude/contracts'
import { clamp, weibull } from './common'
import type { Segment, SegmentsConfig } from './types'

export type OrderOutcomeStatus = 'delivered' | 'failed' | 'refunded' | 'expired' | 'cancelled'
export interface OrderOutcome {
  status: OrderOutcomeStatus
  /** actual fulfilment minutes / SLA minutes (1 = exactly on SLA); undefined when not delivered */
  delayRatio?: number
  /** price paid / reference price (< 1 = cheaper than market) */
  priceIndexPaid?: number
  /** a support interaction happened and was resolved */
  supportResolved?: boolean
  hadProblem?: boolean
}

export function satisfactionScore(o: OrderOutcome, cfg: SegmentsConfig): number {
  const c = cfg.satisfaction
  let s = c.base
  if (o.status === 'failed' || o.status === 'refunded' || o.status === 'expired' || o.status === 'cancelled') {
    s -= c.failurePenalty
    if (o.status === 'refunded') s -= c.refundedPenalty
  } else if (o.delayRatio !== undefined && o.delayRatio > 1) {
    s -= c.lateSlaPenaltyMax * clamp((o.delayRatio - 1) / 2, 0, 1)
  }
  if (o.priceIndexPaid !== undefined) s += c.priceBonusMax * clamp((1 - o.priceIndexPaid) / 0.1, -1, 1)
  if ((o.hadProblem || o.status !== 'delivered') && o.supportResolved) s += c.supportResolvedBonus
  return clamp(s, 0, 1)
}

export interface CustomerState {
  id: string
  segmentId: string
  joinedAt: EpochMs
  source: string
  orders: number
  satisfaction: number
  lastOrderAt?: EpochMs
  nextPurchaseAt?: EpochMs
  active: boolean
  referralsMade: number
  totalSpendIrt: number
}

export function newCustomerState(cfg: SegmentsConfig, id: string, segmentId: string, joinedAt: EpochMs, source = 'organic'): CustomerState {
  return { id, segmentId, joinedAt, source, orders: 0, satisfaction: cfg.satisfaction.initial, active: true, referralsMade: 0, totalSpendIrt: 0 }
}

export const satisfactionFactor = (s: number): number => (0.35 + 1.3 * s) / (0.35 + 1.3 * 0.75)
export const delayFactor = (s: number): number => 1.5 - 0.667 * s

export interface AfterOrderResult {
  /** next purchase time if the customer will come back */
  nextPurchaseAt?: EpochMs
  churned: boolean
  referredArrivals: Array<{ at: EpochMs }>
  /** word-of-mouth signal for Reputation: -1..+1 */
  womSignal: number
}

export class RetentionModel {
  constructor(readonly cfg: SegmentsConfig) {}

  /** EMA update of customer satisfaction. */
  updateSatisfaction(state: CustomerState, score: number): void {
    const a = this.cfg.satisfaction.emaAlpha
    state.satisfaction = state.orders <= 1 ? score : a * score + (1 - a) * state.satisfaction
  }

  repeatProbability(seg: Segment, s: number, orders: number): number {
    if (orders >= seg.repeat.maxOrders) return 0
    const loyalty = 1 + 0.05 * Math.min(Math.max(orders - 1, 0), 6)
    return clamp(seg.repeat.baseProbability * satisfactionFactor(s) * loyalty, 0, 0.97)
  }

  sampleDelayMs(rng: Rng, seg: Segment, s: number): number {
    const days = weibull(rng.next(), seg.repeat.weibullShape, seg.repeat.weibullScaleDays * delayFactor(s))
    return Math.max(MS.hour, Math.round(days * MS.day))
  }

  referralProbability(seg: Segment, s: number): number {
    if (s < 0.5) return 0
    return clamp(seg.referral.propensity * satisfactionFactor(s), 0, 0.9)
  }

  /**
   * Call once per completed order (after `state.orders` was incremented and satisfaction updated).
   * Draws repeat/churn and referrals; mutates `state.nextPurchaseAt/active/referralsMade`.
   */
  afterOrder(rng: Rng, seg: Segment, state: CustomerState, now: EpochMs, score: number): AfterOrderResult {
    state.lastOrderAt = now
    const result: AfterOrderResult = { churned: false, referredArrivals: [], womSignal: score >= 0.75 ? 0.3 : score <= 0.3 ? -1 : 0 }
    if (rng.bool(this.repeatProbability(seg, state.satisfaction, state.orders))) {
      state.nextPurchaseAt = now + this.sampleDelayMs(rng, seg, state.satisfaction)
      result.nextPurchaseAt = state.nextPurchaseAt
    } else {
      state.nextPurchaseAt = undefined
      state.active = false
      result.churned = true
    }
    if (state.referralsMade < 3 && rng.bool(this.referralProbability(seg, state.satisfaction))) {
      const n = 1 + rng.poisson(Math.max(0, seg.referral.meanReferred - 1))
      for (let i = 0; i < n; i++) result.referredArrivals.push({ at: now + Math.round(rng.exp(1 / seg.referral.delayMeanDays) * MS.day) })
      state.referralsMade++
    }
    return result
  }

  /** Analytic expected number of orders for a customer with constant satisfaction s (loyalty ignored: p constant). */
  expectedOrdersConstantP(seg: Segment, s: number): number {
    const p = clamp(seg.repeat.baseProbability * satisfactionFactor(s), 0, 0.97)
    return 1 / (1 - p)
  }

  /** Analytic probability that a customer is still "alive" (will place order n+1) after n orders, loyalty ignored. */
  survivalAfterOrders(seg: Segment, s: number, n: number): number {
    const p = clamp(seg.repeat.baseProbability * satisfactionFactor(s), 0, 0.97)
    return Math.pow(p, n)
  }

  /** Mean customer lifetime value in IRT given average gross profit per order. */
  expectedLtvIrt(seg: Segment, s: number, grossProfitPerOrderIrt: number): number {
    return this.expectedOrdersConstantP(seg, s) * grossProfitPerOrderIrt
  }
}
