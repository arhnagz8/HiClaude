/**
 * CustomerPlan: a PURE description of what one prospective customer intends to do — an ordered list of intents with
 * relative delays, mistake flags and pre-drawn uniforms for contingent behaviour. The executor (B5b) walks the plan
 * through the real application API; this module never touches the app.
 */
import { MS, type EpochMs, type PaymentMethod, type Rng } from '@hiclaude/contracts'
import type { ArrivalDraft } from './arrival'
import { sampleBasket, samplePaymentMistake, pickPaymentMethod, type BasketItem } from './basket'
import { evaluateChoice, type ChoiceResult } from './choice'
import { clamp } from './common'
import { planFraud, type FraudPlan } from './fraud'
import type { CustomerState } from './retention'
import type { CustomerChannel, MarketSignals, PaymentMistake, Segment, SegmentsConfig } from './types'

export type StepType = 'visit' | 'login' | 'register' | 'kyc' | 'quote' | 'create_order' | 'pay' | 'submit_receipt' | 'wait_delivery' | 'reveal' | 'confirm'

export interface PlannedStep {
  type: StepType
  /** delay after the previous step completed */
  afterMs: number
  params?: Record<string, string | number | boolean>
}

export interface PlanBehaviour {
  /** customer files a ticket when delivery takes longer than patienceFactor × SLA */
  patienceFactor: number
  /** fraction by which the real quote may exceed the planned price before the customer walks away */
  priceTolerancePct: number
  kycWilling: boolean
  /** uniform draws consumed by the executor for contingent outcomes (deterministic, plan-owned) */
  draws: { ticketIfLate: number; ticketOnFailure: number; disputeOnFailure: number; review: number; reviewRating: number }
  ticketIfLateProb: number
  ticketOnFailureProb: number
  disputeOnFailureProb: number
  reviewProb: number
}

export type PlanOutcome = 'buy' | 'competitor' | 'outside' | 'unavailable'

export interface CustomerPlan {
  planId: string
  at: EpochMs
  segmentId: string
  source: string
  channel: CustomerChannel
  customer: { kind: 'new' | 'returning'; customerKey?: string; referred: boolean }
  /** register as a lead even though they do not buy (funnel visit→signup) */
  leadSignup: boolean
  decision: { outcome: PlanOutcome; chosen: string; probs: Record<string, number> }
  basket: BasketItem | null
  method: PaymentMethod | null
  mistake: PaymentMistake
  steps: PlannedStep[]
  behaviour: PlanBehaviour
  fraud?: FraudPlan
}

export interface PlanContext {
  /** returning customer */
  customer?: CustomerState
  referred?: boolean
  /** pay-window minutes by method (for `late` mistakes) — optional */
  payWindowMinutes?: Partial<Record<PaymentMethod, number>>
  maxIrt?: Partial<Record<PaymentMethod, number>>
  walletCoversOrder?: boolean
  /** > 1 raises rush share during stress */
  urgency?: number
  /** shift of the outside option utility (negative = more eager to buy) */
  outsideShift?: number
  /** executor-side hint: expected IRT amount for method caps */
  amountIrtHint?: number
  /** scenario/promotion weight tweaks */
  familyWeightMultiplier?: (family: string) => number
}

const min = (m: number): number => Math.round(m * MS.minute)

export class CustomerPlanner {
  private counter = 0
  private readonly rngs = new Map<string, Rng>()
  constructor(readonly cfg: SegmentsConfig, private readonly root: Rng, private readonly idPrefix = 'plan') {}

  private segRng(id: string): Rng {
    let r = this.rngs.get(id)
    if (!r) {
      r = this.root.fork(`demand:${id}:plan`)
      this.rngs.set(id, r)
    }
    return r
  }

  segment(id: string): Segment {
    const s = this.cfg.segments.find((x) => x.id === id)
    if (!s) throw new Error(`unknown segment ${id}`)
    return s
  }

  /** Plan a visitor arrival (new customer, or a returning one when ctx.customer is given). */
  plan(arrival: Pick<ArrivalDraft, 'at' | 'segmentId' | 'source' | 'channel'>, signals: MarketSignals, ctx: PlanContext = {}): CustomerPlan {
    const seg = this.segment(arrival.segmentId)
    const r = this.segRng(seg.id)
    const isReturning = !!ctx.customer
    const b = this.cfg.behaviour
    const planId = `${this.idPrefix}_${(++this.counter).toString(36)}`

    const draws = { ticketIfLate: r.next(), ticketOnFailure: r.next(), disputeOnFailure: r.next(), review: r.next(), reviewRating: r.next() }
    const behaviour: PlanBehaviour = {
      patienceFactor: seg.patienceFactor * clamp(r.logNormal(0, 0.2), 0.6, 1.8),
      priceTolerancePct: r.next() * 0.12 + 0.03,
      kycWilling: r.bool(seg.kycWillingness),
      draws,
      ticketIfLateProb: b.ticketProbabilityWhenLate,
      ticketOnFailureProb: b.ticketProbabilityOnFailure,
      disputeOnFailureProb: b.disputeProbabilityOnFailure,
      reviewProb: seg.reviewProbability,
    }

    const familyAvail = signals.familyAvailable ? (f: string): boolean => signals.familyAvailable!(f) : undefined
    const basket = sampleBasket(r, seg, { familyAvailable: familyAvail, urgency: ctx.urgency, familyWeightMultiplier: ctx.familyWeightMultiplier })
    const base: Omit<CustomerPlan, 'decision' | 'steps' | 'method' | 'mistake' | 'basket'> = {
      planId,
      at: arrival.at,
      segmentId: seg.id,
      source: arrival.source,
      channel: arrival.channel,
      customer: { kind: isReturning ? 'returning' : 'new', customerKey: ctx.customer?.id, referred: !!ctx.referred },
      leadSignup: false,
      behaviour,
    }
    if (!basket) {
      return { ...base, decision: { outcome: 'unavailable', chosen: 'outside', probs: {} }, basket: null, method: null, mistake: 'none', steps: [{ type: 'visit', afterMs: 0 }] }
    }

    const choice: ChoiceResult = evaluateChoice(r, seg, this.cfg, signals, basket, {
      isReturning,
      orders: ctx.customer?.orders ?? 0,
      satisfaction: ctx.customer?.satisfaction ?? this.cfg.satisfaction.initial,
      referred: !!ctx.referred,
      outsideShift: ctx.outsideShift,
    })
    const outcome: PlanOutcome = choice.outcome === 'us' ? 'buy' : choice.outcome === 'outside' ? 'outside' : 'competitor'
    const decision = { outcome, chosen: choice.outcome, probs: choice.probs }

    if (outcome !== 'buy') {
      const lead = !isReturning && r.bool(b.leadSignupRate)
      return { ...base, leadSignup: lead, decision, basket, method: null, mistake: 'none', steps: lead ? [{ type: 'visit', afterMs: 0 }, { type: 'register', afterMs: min(r.next() * 8 + 0.5) }] : [{ type: 'visit', afterMs: 0 }] }
    }

    const fraud = planFraud(r, seg)
    const walletOk = ctx.walletCoversOrder ?? false
    let method = fraud
      ? fraud.method
      : pickPaymentMethod(r, seg, {
          available: signals.methodAvailable ? (m): boolean => signals.methodAvailable!(m) : undefined,
          maxIrt: ctx.maxIrt,
          amountIrt: ctx.amountIrtHint,
          isReturning,
          walletCoversOrder: walletOk,
        })
    if (fraud && signals.methodAvailable && !signals.methodAvailable(fraud.method)) method = fraud.method === 'gateway' ? 'card_to_card' : 'gateway'
    if (!method) return { ...base, decision: { outcome: 'unavailable', chosen: 'outside', probs: choice.probs }, basket, method: null, mistake: 'none', steps: [{ type: 'visit', afterMs: 0 }] }
    if (fraud) fraud.method = method

    const mistake: PaymentMistake = fraud ? 'none' : samplePaymentMistake(r, seg, this.cfg, method, isReturning)
    const steps = this.buildSteps(r, seg, { isReturning, method, mistake, behaviour, fraud, ctx })
    return { ...base, decision, basket, method, mistake, steps, ...(fraud ? { fraud } : {}) }
  }

  private buildSteps(
    r: Rng,
    seg: Segment,
    o: { isReturning: boolean; method: PaymentMethod; mistake: PaymentMistake; behaviour: PlanBehaviour; fraud?: FraudPlan; ctx: PlanContext },
  ): PlannedStep[] {
    const steps: PlannedStep[] = [{ type: 'visit', afterMs: 0 }]
    const fraud = o.fraud
    if (fraud?.targetsExistingCustomer) steps.push({ type: 'login', afterMs: min(0.5 + r.next() * 2), params: { existingCustomer: true, foreignDevice: true } })
    else if (o.isReturning) steps.push({ type: 'login', afterMs: min(0.2 + r.next() * 1.5) })
    else {
      steps.push({ type: 'register', afterMs: min(0.5 + r.next() * 4), params: { otpRetries: r.bool(0.08) ? 1 : 0 } })
      steps.push({ type: 'kyc', afterMs: min(2 + r.next() * 20), params: { willing: o.behaviour.kycWilling, conditional: true } })
    }
    steps.push({ type: 'quote', afterMs: min(0.5 + r.next() * 6) })
    steps.push({ type: 'create_order', afterMs: min(0.5 + r.next() * 5), params: { method: o.method } })
    if (o.mistake === 'abandon') return steps
    const med = o.method === 'gateway' ? 1.5 : o.method === 'usdt' ? 15 : o.method === 'wallet' ? 0.2 : 10
    const payDelay = min(clamp(r.logNormal(Math.log(med), 0.6), 0.1, 90))
    const params: Record<string, string | number | boolean> = { method: o.method, mistake: o.mistake }
    if (o.mistake === 'late') params.lateWindowMultiple = 1.15 + r.next() * 2
    if (o.mistake === 'wrong_amount') params.amountDeltaPct = (r.bool() ? 1 : -1) * (0.01 + r.next() * 0.14)
    if (o.mistake === 'underpay') params.underpayPct = 0.03 + r.next() * 0.27
    if (o.mistake === 'overpay') params.overpayPct = 0.02 + r.next() * 0.18
    if (o.mistake === 'wrong_network') params.wrongNetwork = true
    if (o.mistake === 'duplicate') params.duplicate = true
    if (fraud) {
      params.fraudKind = fraud.kind
      if (fraud.burstCount > 1) {
        params.burstCount = fraud.burstCount
        params.burstSpacingMs = fraud.burstSpacingMs
      }
    }
    steps.push({ type: 'pay', afterMs: payDelay, params })
    if (o.method === 'card_to_card') steps.push({ type: 'submit_receipt', afterMs: min(0.5 + r.next() * 8), params: fraud?.fakeReceipt ? { fake: true } : {} })
    steps.push({ type: 'wait_delivery', afterMs: 0, params: { patienceFactor: o.behaviour.patienceFactor } })
    steps.push({ type: 'reveal', afterMs: min(0.5 + r.next() * 30) })
    steps.push({ type: 'confirm', afterMs: min(1 + r.next() * 60) })
    return steps
  }

  /** Plan the next purchase of a returning customer at `at`. */
  planReturning(customer: CustomerState, at: EpochMs, signals: MarketSignals, channel: CustomerChannel, ctx: Omit<PlanContext, 'customer'> = {}): CustomerPlan {
    return this.plan({ at, segmentId: customer.segmentId, source: 'repeat', channel }, signals, { ...ctx, customer })
  }
}
