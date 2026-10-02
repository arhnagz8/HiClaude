/**
 * solvePriceForTargetMargin — inverse of the pricing engine for admin “what-if” and the simulator's owner agent.
 *
 * Given a TARGET margin it returns the price the engine would charge if the margin line were exactly that (no min/floor/max clamp,
 * no tier discount, no competitor guard, no promo — those are policy levers; this answers “what price gives me X %?”).
 *
 *  basis 'cost'    : margin = ceil(target · C)                       (same convention as `policy.marginPct`)
 *  basis 'revenue' : margin / (C + buffers + margin) = target  ⇒  margin = ceil( target/(1 − target) · (C + buffers) )   (net margin on price before rush, VAT and fee)
 */
import type { PaymentMethod } from '@hiclaude/contracts'
import { AppError } from '@hiclaude/contracts'
import { D, toInt } from '../money'
import { priceQuote } from './engine'
import type { PricingInput, QuoteComputation } from './types'

export interface SolveOptions {
  /** Target margin as a FRACTION (0.12 = 12 %). */
  targetMarginPct: number
  basis?: 'cost' | 'revenue'
  /** Payment method to price (default: first of `input.methods`, else `card_to_card`). */
  method?: PaymentMethod
}

export interface SolveResult {
  method: PaymentMethod
  /** Margin line (Toman) the target maps to. */
  marginIrt: number
  totalIrt?: number
  totalMicroUsdt?: number
  /** Margin (incl. rounding remainder) over replacement cost. */
  achievedMarginPctOfCost: number
  /** Margin (incl. rounding remainder) over net revenue (total − VAT − fee). */
  achievedMarginPctOfRevenue: number
  computation: QuoteComputation
}

/** Returns the price that yields `targetMarginPct`. Throws `AppError('VALIDATION')` for an impossible target. */
export function solvePriceForTargetMargin(input: PricingInput, opts: SolveOptions): SolveResult {
  const basis = opts.basis ?? 'cost'
  const t = opts.targetMarginPct
  if (!Number.isFinite(t) || t < 0 || (basis === 'revenue' && t >= 1)) {
    throw new AppError('VALIDATION', `invalid target margin ${t}`, { targetMarginPct: t, basis })
  }
  const method: PaymentMethod = opts.method ?? input.methods[0] ?? 'card_to_card'
  const base: PricingInput = { ...input, methods: [method], promoDiscountIrt: 0 }
  const probe = priceQuote({ ...base, overrideMarginIrt: 0 })
  const C = probe.costIrt
  const buffers = probe.bufferIrt
  const margin = basis === 'cost' ? toInt(D(C).mul(t), 'up', 'targetMargin') : toInt(D(C + buffers).mul(t).div(D(1).minus(t)), 'up', 'targetMargin')
  const comp = priceQuote({ ...base, overrideMarginIrt: margin })
  const m = comp.perMethod[0]!
  const econ = comp.economics[method]!
  return {
    method,
    marginIrt: margin,
    ...(m.totalIrt !== undefined ? { totalIrt: m.totalIrt } : {}),
    ...(m.totalMicroUsdt !== undefined ? { totalMicroUsdt: m.totalMicroUsdt } : {}),
    achievedMarginPctOfCost: econ.costIrt > 0 ? econ.marginIrt / econ.costIrt : 0,
    achievedMarginPctOfRevenue: econ.netRevenueIrt > 0 ? econ.marginIrt / econ.netRevenueIrt : 0,
    computation: comp,
  }
}
