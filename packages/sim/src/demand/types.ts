/** Plain data seams of the demand model. Everything here is JSON-serialisable and unit-testable with synthetic inputs. */
import type { EpochMs, PaymentMethod } from '@hiclaude/contracts'

export type SegmentId = string
export type CustomerChannel = 'web' | 'telegram' | 'bale'
export const CUSTOMER_CHANNELS: readonly CustomerChannel[] = ['web', 'telegram', 'bale']
export type DiurnalShape = 'default' | 'office' | 'night'
export const PAYMENT_METHODS: readonly PaymentMethod[] = ['gateway', 'card_to_card', 'bank_transfer', 'usdt', 'wallet']

/** One competitor offer as seen by a customer of a given product family. */
export interface CompetitorOffer {
  id: string
  /** competitor price / reference price (1 = parity) */
  priceIndex: number
  slaMinutes: number
  trust: number
}

/**
 * Provided by the runner from the world each time demand is evaluated.
 * (Brief seam + three additive optional/derived fields documented in packages/sim/README.md "Models".)
 */
export interface MarketSignals {
  now: EpochMs
  macroDemandMultiplier: number
  /** competitor price / reference price (1 = parity) aggregated over the competitor set */
  competitorPriceIndex(family: string): number
  competitorTrust(family: string): number
  /** Our real quote for a representative cart (null = we cannot sell it now: killed, halted, inactive). */
  ourQuote(req: { family: string; amountUsdCents: number; rushTier: string }): { priceIrt: number; slaMinutes: number } | null
  ourTrust: number
  /** ADDITIVE. Reference (fair) market rate used to turn a quote into a price index: refPrice = USD * refRateIrtPerUsd. */
  refRateIrtPerUsd: number
  /** ADDITIVE, optional. Per-competitor offers; when absent a single aggregated competitor (competitorPriceIndex/Trust) is replicated `competitorsConsidered` times. */
  competitorOffers?(family: string): CompetitorOffer[]
  /** ADDITIVE, optional. Which payment methods are currently usable (gateway blackout => gateway:false). Missing = available. */
  methodAvailable?(method: PaymentMethod): boolean
  /** ADDITIVE, optional. Families that exist in the active catalog. Missing = all. */
  familyAvailable?(family: string): boolean
}

export interface BasketSpec {
  family: string
  weight: number
  medianUsd: number
  sigma: number
  minUsd: number
  maxUsd: number
}

export interface FraudSpec {
  propensity: number
  kinds: Record<FraudKind, number>
  velocityBurst: { min: number; max: number; spacingMinutes: number }
  disputeProbabilityAfterDelivery: number
  note?: string
}
export type FraudKind = 'fake_receipt' | 'stolen_card_dispute' | 'account_takeover' | 'velocity_abuse'
export const FRAUD_KINDS: readonly FraudKind[] = ['fake_receipt', 'stolen_card_dispute', 'account_takeover', 'velocity_abuse']

export interface Segment {
  id: SegmentId
  labelFa: string
  labelEn: string
  /** share of organic visits (all segments sum to 1) */
  share: number
  basket: BasketSpec[]
  rushProbability: { fast: number; express: number }
  beta: { price: number; speed: number; trust: number }
  /** P(visitor buys from us) when we are at parity with every competitor; calibrates the outside option. */
  baseConversion: number
  paymentPreference: Record<PaymentMethod, number>
  channelAffinity: Record<CustomerChannel, number>
  repeat: { baseProbability: number; weibullShape: number; weibullScaleDays: number; maxOrders: number }
  referral: { propensity: number; meanReferred: number; delayMeanDays: number }
  weekendFactor: number
  diurnal: DiurnalShape
  patienceFactor: number
  carelessness: number
  kycWillingness: number
  reviewProbability: number
  /** by Jalali month index 0..11 (Farvardin..Esfand) */
  monthSeasonality: number[]
  fraud?: FraudSpec
  source: string
}

export type PaymentMistake = 'none' | 'wrong_amount' | 'late' | 'duplicate' | 'abandon' | 'underpay' | 'overpay' | 'wrong_network'

export interface SegmentsConfig {
  organicVisitsPerDay: number
  referenceSlaMinutes: number
  referenceTrust: number
  competitorsConsidered: number
  weekday: number[]
  diurnalProfiles: Record<DiurnalShape, number[]>
  mistakes: Record<PaymentMethod, Partial<Record<PaymentMistake, number>>>
  behaviour: {
    ticketProbabilityWhenLate: number
    ticketProbabilityOnFailure: number
    disputeProbabilityOnFailure: number
    leadSignupRate: number
    newCustomerMistakeMultiplier: number
    returningMistakeMultiplier: number
    referredConversionAsc: number
    returningLoyaltyAscPerOrder: number
    returningLoyaltyAscCap: number
  }
  satisfaction: {
    base: number
    lateSlaPenaltyMax: number
    failurePenalty: number
    refundedPenalty: number
    priceBonusMax: number
    supportResolvedBonus: number
    initial: number
    emaAlpha: number
  }
  segments: Segment[]
}
