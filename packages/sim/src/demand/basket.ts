/** BasketSampler: family / amount / rush tier / payment method / payment mistake for one purchase. Pure given an Rng. */
import type { AmountSpec, PaymentMethod, Rng } from '@hiclaude/contracts'
import { clamp } from './common'
import type { PaymentMistake, Segment, SegmentsConfig } from './types'

export interface BasketItem {
  family: string
  amountUsdCents: number
  rushTier: 'normal' | 'fast' | 'express'
}

export interface BasketContext {
  /** only families existing in the active catalog; undefined = all */
  familyAvailable?: (family: string) => boolean
  /** extra per-family weight multiplier (promotions, seasonality of a family) */
  familyWeightMultiplier?: (family: string) => number
  /** > 1 raises rush probabilities (FX stress urgency); default 1 */
  urgency?: number
}

/** Family choice then lognormal amount (USD) clamped to [min,max], rounded to whole dollars (≥ 1). */
export function sampleBasket(rng: Rng, seg: Segment, ctx: BasketContext = {}): BasketItem | null {
  const items = seg.basket.filter((b) => (ctx.familyAvailable ? ctx.familyAvailable(b.family) : true))
  if (items.length === 0) return null
  const weights = items.map((b) => b.weight * (ctx.familyWeightMultiplier?.(b.family) ?? 1))
  if (!weights.some((w) => w > 0)) return null
  const b = rng.weighted(items, weights)
  const usd = clamp(Math.round(rng.logNormal(Math.log(b.medianUsd), b.sigma)), b.minUsd, b.maxUsd)
  const u = ctx.urgency ?? 1
  const pf = clamp(seg.rushProbability.fast * u, 0, 0.9)
  const pe = clamp(seg.rushProbability.express * u, 0, 0.9)
  const r = rng.next()
  const rushTier = r < pe ? 'express' : r < pe + pf ? 'fast' : 'normal'
  return { family: b.family, amountUsdCents: Math.round(usd * 100), rushTier }
}

/** Snap a raw amount to the nearest valid amount of a product's AmountSpec (options / fixed / stepped range). */
export function snapAmount(spec: AmountSpec, rawUsdCents: number): number {
  if (spec.kind === 'fixed') return spec.fixedUsdCents ?? rawUsdCents
  if (spec.kind === 'options') {
    const opts = spec.optionsUsdCents ?? []
    if (opts.length === 0) return rawUsdCents
    let best = opts[0] as number
    let bd = Infinity
    for (const o of opts) {
      // distance on log scale so $5 vs $10 is treated like $50 vs $100
      const d = Math.abs(Math.log(Math.max(1, o) / Math.max(1, rawUsdCents)))
      if (d < bd) {
        bd = d
        best = o
      }
    }
    return best
  }
  const lo = spec.minUsdCents ?? 0
  const hi = spec.maxUsdCents ?? Number.MAX_SAFE_INTEGER
  const step = spec.stepUsdCents && spec.stepUsdCents > 0 ? spec.stepUsdCents : 1
  const clamped = clamp(rawUsdCents, lo, hi)
  const snapped = lo + Math.round((clamped - lo) / step) * step
  return clamp(snapped, lo, hi)
}

/** Log-spaced amount bucket (ratio 1.25) for quote caching: nearby carts share one quote. */
export function amountBucket(amountUsdCents: number, ratio = 1.25): number {
  return Math.round(Math.log(Math.max(1, amountUsdCents)) / Math.log(ratio))
}
export const bucketRepresentative = (bucket: number, ratio = 1.25): number => Math.round(Math.pow(ratio, bucket))

export interface QuoteCacheKeyParts {
  family: string
  amountUsdCents: number
  rushTier: string
  /** rate snapshot id (or any token that changes when prices change) */
  rateToken: string
}
export const quoteCacheKey = (k: QuoteCacheKeyParts): string => `${k.family}|${amountBucket(k.amountUsdCents)}|${k.rushTier}|${k.rateToken}`

/** Tiny cache of representative quotes keyed by (family, amount bucket, rush, rate token). */
export class QuoteCache<V> {
  private readonly map = new Map<string, V>()
  hits = 0
  misses = 0
  constructor(private readonly maxEntries = 5000) {}
  getOrCompute(k: QuoteCacheKeyParts, compute: (representativeUsdCents: number) => V): V {
    const key = quoteCacheKey(k)
    if (this.map.has(key)) {
      this.hits++
      return this.map.get(key) as V
    }
    this.misses++
    const v = compute(bucketRepresentative(amountBucket(k.amountUsdCents)))
    if (this.map.size >= this.maxEntries) this.map.clear()
    this.map.set(key, v)
    return v
  }
  clear(): void {
    this.map.clear()
  }
  get size(): number {
    return this.map.size
  }
}

export interface MethodContext {
  /** payment methods currently usable */
  available?: (m: PaymentMethod) => boolean
  /** per-method hard cap in IRT (c2c per-order max, gateway max) */
  maxIrt?: Partial<Record<PaymentMethod, number>>
  amountIrt?: number
  isReturning: boolean
  /** wallet balance covers it */
  walletCoversOrder?: boolean
}

/** Preferred payment method, restricted to usable ones (wallet only for returning customers who can afford it). */
export function pickPaymentMethod(rng: Rng, seg: Segment, ctx: MethodContext): PaymentMethod | null {
  const methods: PaymentMethod[] = ['gateway', 'card_to_card', 'bank_transfer', 'usdt', 'wallet']
  const w = methods.map((m) => {
    let x = seg.paymentPreference[m] ?? 0
    if (ctx.available && !ctx.available(m)) x = 0
    if (m === 'wallet' && !(ctx.isReturning && ctx.walletCoversOrder)) x = 0
    const cap = ctx.maxIrt?.[m]
    if (cap !== undefined && ctx.amountIrt !== undefined && ctx.amountIrt > cap) x = 0
    return x
  })
  if (!w.some((x) => x > 0)) return null
  return rng.weighted(methods, w)
}

/** Sample a payment mistake given method, segment carelessness and customer experience. */
export function samplePaymentMistake(rng: Rng, seg: Segment, cfg: SegmentsConfig, method: PaymentMethod, isReturning: boolean): PaymentMistake {
  const table = cfg.mistakes[method] ?? {}
  const mult = seg.carelessness * (isReturning ? cfg.behaviour.returningMistakeMultiplier : cfg.behaviour.newCustomerMistakeMultiplier)
  let r = rng.next()
  for (const k of Object.keys(table).sort()) {
    const p = clamp((table[k as PaymentMistake] ?? 0) * mult, 0, 0.9)
    if (r < p) return k as PaymentMistake
    r -= p
  }
  return 'none'
}
