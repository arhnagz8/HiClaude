/**
 * Payment-method fee helpers.
 *
 * fee(P) = min(cap, ceil(pct·P) + fixed)            (cap = 0 means "no cap"; fees round UP)
 * gross-up: smallest integer P such that P − fee(P) ≥ T  (T = amount we must NET after the fee)
 *   closed form (uncapped):  P = (T + fixed) / (1 − pct)
 *   cap branch:               if fee(P) > cap  ⇒ P = T + cap
 * `grossUpForFee` finds the exact minimal integer solution for ANY monotone fee function by fixed-point iteration, so the closed
 * forms above are only used to describe which branch applied.
 */
import { assertSafeInt, bpsOf, pctOf } from '../money'

export interface GatewayFeeParams {
  /** Fraction (0.005 = 0.5 %). */
  feePct: number
  /** Toman cap per transaction; 0 = no cap. */
  feeCapIrt: number
  feeFixedIrt: number
}

/** Fee charged by the gateway for a transaction of `amount` Toman: `min(cap, ceil(pct·amount) + fixed)`. Integer, rounded UP. */
export function gatewayFee(amount: number, params: GatewayFeeParams): number {
  assertSafeInt(amount, 'amount')
  if (amount < 0) throw new RangeError('gatewayFee(): negative amount')
  const raw = pctOf(amount, params.feePct, 'up') + params.feeFixedIrt
  return params.feeCapIrt > 0 ? Math.min(params.feeCapIrt, raw) : raw
}

export interface GrossUpResult {
  /** Amount the customer pays (smallest integer with amount − fee(amount) ≥ target). */
  amount: number
  /** fee(amount). */
  fee: number
  iterations: number
}

/**
 * Smallest integer `P ≥ target` such that `P − feeFn(P) ≥ target`. `feeFn` must be monotone non-decreasing with slope < 1.
 * Throws `RangeError` if it does not converge within 500 iterations.
 */
export function grossUpForFee(target: number, feeFn: (amount: number) => number): GrossUpResult {
  assertSafeInt(target, 'target')
  if (target < 0) throw new RangeError('grossUpForFee(): negative target')
  let p = target
  for (let i = 1; i <= 500; i++) {
    const next = target + feeFn(p)
    assertSafeInt(next, 'grossUp iterate')
    if (next === p) return { amount: p, fee: feeFn(p), iterations: i }
    if (next < p) {
      // non-monotone fee function — settle on the larger value which is safe
      return { amount: p, fee: feeFn(p), iterations: i }
    }
    p = next
  }
  throw new RangeError('grossUpForFee(): did not converge (fee slope ≥ 1?)')
}

/** Gross-up for the gateway fee model, also reporting which formula branch applied. */
export function grossUpGateway(target: number, params: GatewayFeeParams): GrossUpResult & { branch: 'none' | 'closed_form' | 'cap' } {
  const r = grossUpForFee(target, (a) => gatewayFee(a, params))
  const capped = params.feeCapIrt > 0 && r.fee >= params.feeCapIrt
  const none = params.feePct === 0 && params.feeFixedIrt === 0
  return { ...r, branch: none ? 'none' : capped ? 'cap' : 'closed_form' }
}

/** Convenience: fee in bps of an amount (exchange taker fee etc.), rounded UP. */
export function feeBps(amount: number, bps: number): number {
  return bpsOf(amount, bps, 'up')
}
