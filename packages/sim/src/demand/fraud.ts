/**
 * Fraud actors exist to STRESS the risk controls (core/risk) and the loss-booking path, nothing more (CLAUDE.md section 3
 * applies to simulated actors too). A FraudPlan only describes the *attempted pattern*; it contains no evasion technique.
 */
import { MS, type PaymentMethod, type Rng } from '@hiclaude/contracts'
import type { FraudKind, Segment } from './types'
import { FRAUD_KINDS } from './types'

export interface FraudPlan {
  kind: FraudKind
  /** velocity_abuse: number of orders in the burst (1 for the other kinds) */
  burstCount: number
  burstSpacingMs: number
  method: PaymentMethod
  /** fake_receipt: a receipt is submitted without any bank transfer */
  fakeReceipt: boolean
  /** stolen_card_dispute: customer later disputes the (gateway) payment — chargeback proxy */
  disputeAfterDelivery: boolean
  /** account_takeover: the actor tries to order from an existing customer's account */
  targetsExistingCustomer: boolean
}

export function planFraud(rng: Rng, seg: Segment): FraudPlan | undefined {
  const f = seg.fraud
  if (!f) return undefined
  const kind = rng.weighted(FRAUD_KINDS, FRAUD_KINDS.map((k) => f.kinds[k]))
  let method: PaymentMethod = 'gateway'
  if (kind === 'fake_receipt') method = 'card_to_card'
  else if (kind === 'account_takeover') method = rng.bool(0.5) ? 'wallet' : 'gateway'
  else if (kind === 'velocity_abuse') method = rng.bool(0.5) ? 'gateway' : 'card_to_card'
  return {
    kind,
    burstCount: kind === 'velocity_abuse' ? rng.int(f.velocityBurst.min, f.velocityBurst.max) : 1,
    burstSpacingMs: Math.round(f.velocityBurst.spacingMinutes * MS.minute),
    method,
    fakeReceipt: kind === 'fake_receipt',
    disputeAfterDelivery: kind === 'stolen_card_dispute' && rng.bool(f.disputeProbabilityAfterDelivery),
    targetsExistingCustomer: kind === 'account_takeover',
  }
}

/**
 * Upper bound on expected fraud exposure per day for tests/sanity: arrivals × baseConversion × mean order value.
 * (Losses booked by the app are ≤ exposure × (1 − detection rate).)
 */
export function expectedFraudExposureIrtPerDay(fraudVisitsPerDay: number, seg: Segment, irtPerUsd: number): number {
  const wsum = seg.basket.reduce((a, b) => a + b.weight, 0)
  const meanUsd = seg.basket.reduce((a, b) => a + (b.weight / wsum) * b.medianUsd * Math.exp((b.sigma * b.sigma) / 2), 0)
  return fraudVisitsPerDay * seg.baseConversion * meanUsd * irtPerUsd
}
