import { describe, expect, it } from 'vitest'
import { createRng } from '@hiclaude/contracts'
import { QuoteCache, amountBucket, bucketRepresentative, pickPaymentMethod, quoteCacheKey, sampleBasket, samplePaymentMistake, snapAmount } from './basket'
import { loadSegmentsConfig } from './segments'
import { percentile } from './common'

const cfg = loadSegmentsConfig({ useResearch: false })
const seg = (id: string) => cfg.segments.find((s) => s.id === id)!

describe('BasketSampler', () => {
  it('family frequencies follow basket weights', () => {
    const s = seg('gamer')
    const rng = createRng(1)
    const n = 20000
    const c: Record<string, number> = {}
    for (let i = 0; i < n; i++) {
      const b = sampleBasket(rng, s)!
      c[b.family] = (c[b.family] ?? 0) + 1
    }
    const tot = s.basket.reduce((a, b) => a + b.weight, 0)
    for (const b of s.basket) expect(Math.abs((c[b.family] ?? 0) / n - b.weight / tot)).toBeLessThan(0.012)
  })
  it('amounts are lognormal around the family median and clamped to [min,max]', () => {
    const s = seg('ads_manager')
    const rng = createRng(2)
    const xs: number[] = []
    for (let i = 0; i < 20000; i++) {
      const b = sampleBasket(rng, s)!
      if (b.family === 'virtual_card') xs.push(b.amountUsdCents / 100)
    }
    const spec = s.basket.find((b) => b.family === 'virtual_card')!
    expect(percentile(xs, 50)).toBeGreaterThan(spec.medianUsd * 0.93)
    expect(percentile(xs, 50)).toBeLessThan(spec.medianUsd * 1.07)
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(spec.minUsd)
    expect(Math.max(...xs)).toBeLessThanOrEqual(spec.maxUsd)
  })
  it('respects catalog availability and returns null when nothing is sellable', () => {
    const s = seg('importer_trader')
    const rng = createRng(3)
    for (let i = 0; i < 200; i++) expect(sampleBasket(rng, s, { familyAvailable: (f) => f !== 'fx_payment' })!.family).not.toBe('fx_payment')
    expect(sampleBasket(rng, s, { familyAvailable: () => false })).toBeNull()
  })
  it('family weight multiplier (promotion) shifts the mix', () => {
    const s = seg('student')
    const rng = createRng(4)
    let n = 0
    for (let i = 0; i < 4000; i++) if (sampleBasket(rng, s, { familyWeightMultiplier: (f) => (f === 'streaming' ? 10 : 1) })!.family === 'streaming') n++
    expect(n / 4000).toBeGreaterThan(0.4)
  })
  it('rush shares track segment rush probabilities and scale with urgency', () => {
    const s = seg('gamer')
    const share = (u: number) => {
      const rng = createRng(6)
      let r = 0
      for (let i = 0; i < 10000; i++) if (sampleBasket(rng, s, { urgency: u })!.rushTier !== 'normal') r++
      return r / 10000
    }
    expect(share(1)).toBeGreaterThan(0.22)
    expect(share(1)).toBeLessThan(0.3)
    expect(share(2)).toBeGreaterThan(share(1) * 1.6)
  })
})

describe('amount snapping & quote cache', () => {
  it('snaps to options on a log scale', () => {
    const spec = { kind: 'options' as const, optionsUsdCents: [500, 1000, 2000, 5000] }
    expect(snapAmount(spec, 1100)).toBe(1000)
    expect(snapAmount(spec, 4000)).toBe(5000)
    expect(snapAmount(spec, 1)).toBe(500)
  })
  it('snaps ranges to step and clamps', () => {
    const spec = { kind: 'range' as const, minUsdCents: 1000, maxUsdCents: 100000, stepUsdCents: 500 }
    expect(snapAmount(spec, 1234)).toBe(1000)
    expect(snapAmount(spec, 1300)).toBe(1500)
    expect(snapAmount(spec, 999999)).toBe(100000)
    expect(snapAmount(spec, 10)).toBe(1000)
  })
  it('fixed amounts return the fixed value', () => {
    expect(snapAmount({ kind: 'fixed', fixedUsdCents: 2500 }, 100)).toBe(2500)
  })
  it('amount buckets group nearby carts and are stable', () => {
    expect(amountBucket(2000)).toBe(amountBucket(2010))
    expect(amountBucket(2000)).not.toBe(amountBucket(20000))
    const b = amountBucket(5000)
    expect(amountBucket(bucketRepresentative(b))).toBe(b)
  })
  it('QuoteCache computes once per (family,bucket,rush,rate)', () => {
    const c = new QuoteCache<number>()
    let calls = 0
    const f = (usd: number) => {
      calls++
      return usd * 2
    }
    const k = { family: 'gift_card', amountUsdCents: 2000, rushTier: 'normal', rateToken: 's1' }
    c.getOrCompute(k, f)
    c.getOrCompute({ ...k, amountUsdCents: 2010 }, f)
    c.getOrCompute({ ...k, rateToken: 's2' }, f)
    c.getOrCompute({ ...k, rushTier: 'fast' }, f)
    expect(calls).toBe(3)
    expect(c.hits).toBe(1)
    expect(c.misses).toBe(3)
    expect(quoteCacheKey(k)).toContain('gift_card')
  })
})

describe('payment method & mistakes', () => {
  it('never picks an unavailable method', () => {
    const s = seg('student')
    const rng = createRng(1)
    for (let i = 0; i < 500; i++) expect(pickPaymentMethod(rng, s, { isReturning: false, available: (m) => m !== 'gateway' })).not.toBe('gateway')
  })
  it('gateway blackout shifts the mix to card_to_card', () => {
    const s = seg('student')
    const share = (blackout: boolean) => {
      const rng = createRng(2)
      let c = 0
      for (let i = 0; i < 5000; i++) if (pickPaymentMethod(rng, s, { isReturning: false, available: (m) => !(blackout && m === 'gateway') }) === 'card_to_card') c++
      return c / 5000
    }
    expect(share(true)).toBeGreaterThan(share(false) * 1.8)
  })
  it('wallet only for returning customers who can cover the order', () => {
    const s = seg('student')
    const rng = createRng(3)
    let w = 0
    for (let i = 0; i < 2000; i++) {
      expect(pickPaymentMethod(rng, s, { isReturning: false, walletCoversOrder: true })).not.toBe('wallet')
      if (pickPaymentMethod(rng, s, { isReturning: true, walletCoversOrder: true }) === 'wallet') w++
    }
    expect(w).toBeGreaterThan(50)
  })
  it('per-method caps exclude large orders', () => {
    const rng = createRng(4)
    for (let i = 0; i < 300; i++) expect(pickPaymentMethod(rng, seg('importer_trader'), { isReturning: false, amountIrt: 90_000_000, maxIrt: { card_to_card: 50_000_000 } })).not.toBe('card_to_card')
  })
  it('returns null when no method is possible', () => {
    expect(pickPaymentMethod(createRng(1), seg('student'), { isReturning: false, available: () => false })).toBeNull()
  })
  it('c2c mistake rate matches table × segment carelessness × newcomer multiplier', () => {
    const s = seg('student')
    const rng = createRng(7)
    const n = 40000
    let wrong = 0
    let any = 0
    for (let i = 0; i < n; i++) {
      const m = samplePaymentMistake(rng, s, cfg, 'card_to_card', false)
      if (m === 'wrong_amount') wrong++
      if (m !== 'none') any++
    }
    const mult = s.carelessness * cfg.behaviour.newCustomerMistakeMultiplier
    expect(wrong / n).toBeCloseTo((cfg.mistakes.card_to_card.wrong_amount as number) * mult, 2)
    const tot = Object.values(cfg.mistakes.card_to_card).reduce((a, b) => a + (b as number), 0) * mult
    expect(any / n).toBeCloseTo(tot, 2)
  })
  it('returning customers err less than newcomers; usdt has network mistakes', () => {
    const s = seg('freelance_dev')
    const rate = (ret: boolean, kind: string) => {
      const rng = createRng(8)
      let c = 0
      for (let i = 0; i < 40000; i++) if (samplePaymentMistake(rng, s, cfg, 'usdt', ret) === kind) c++
      return c / 40000
    }
    expect(rate(true, 'wrong_network')).toBeLessThan(rate(false, 'wrong_network'))
    expect(rate(false, 'wrong_network')).toBeGreaterThan(0.003)
  })
  it('wallet payments only ever abandon', () => {
    const rng = createRng(9)
    for (let i = 0; i < 3000; i++) expect(['none', 'abandon']).toContain(samplePaymentMistake(rng, seg('student'), cfg, 'wallet', true))
  })
})
