import { describe, expect, it } from 'vitest'
import { createRng } from '@hiclaude/contracts'
import { calibrateOutsideUtility, choiceParams, choiceProbabilities, competitorOffersFor, evaluateChoice, loyaltyAsc, ourOffer, ownPriceElasticity, sampleChoice, utility, type Offer } from './choice'
import { loadSegmentsConfig } from './segments'
import { makeSignals } from './testing'
import { sum } from './common'

const cfg = loadSegmentsConfig({ useResearch: false })
const seg = (id: string) => cfg.segments.find((s) => s.id === id)!
const ref = (id: string, priceIndex = 1, extra: Partial<Offer> = {}): Offer => ({ id, priceIndex, slaMinutes: cfg.referenceSlaMinutes, trust: cfg.referenceTrust, ...extra })

describe('SellerChoice logit', () => {
  it('probabilities (offers + outside) sum to 1', () => {
    const p = choiceParams(seg('student'), cfg)
    const { probs, outside } = choiceProbabilities([ref('us', 0.97), ref('c1', 1.03), ref('c2', 1.0)], p)
    expect(sum(probs) + outside).toBeCloseTo(1, 12)
  })
  it('at parity P(us) equals the segment base conversion for every non-fraud segment', () => {
    for (const s of cfg.segments.filter((x) => !x.fraud)) {
      const p = choiceParams(s, cfg)
      const offers = [ref('us'), ref('c1'), ref('c2'), ref('c3')]
      const { probs } = choiceProbabilities(offers, p)
      expect(probs[0]).toBeCloseTo(s.baseConversion, 9)
    }
  })
  it('calibration rejects infeasible conversion for the competitor count', () => {
    expect(() => calibrateOutsideUtility(0.3, 3)).toThrow(RangeError)
    expect(Number.isFinite(calibrateOutsideUtility(0.2, 3))).toBe(true)
  })
  it('fraudster calibration is capped to a feasible competitor count', () => {
    const f = seg('fraudster')
    expect(() => choiceParams(f, cfg)).not.toThrow()
  })
  it('empirical shares match analytic probabilities', () => {
    const s = seg('gamer')
    const p = choiceParams(s, cfg)
    const offers = [ref('us', 0.96), ref('c1', 1.02), ref('c2', 1.05, { trust: 0.8 }), ref('c3', 0.99, { slaMinutes: 60 })]
    const { probs, outside } = choiceProbabilities(offers, p)
    const rng = createRng(42)
    const n = 40000
    const counts: Record<string, number> = {}
    for (let i = 0; i < n; i++) {
      const r = sampleChoice(rng, offers, p)
      counts[r.outcome] = (counts[r.outcome] ?? 0) + 1
    }
    offers.forEach((o, i) => expect((counts[o.id] ?? 0) / n).toBeCloseTo(probs[i] as number, 1))
    expect(Math.abs((counts.outside ?? 0) / n - outside)).toBeLessThan(0.012)
    expect(Math.abs((counts.us ?? 0) / n - (probs[0] as number))).toBeLessThan(0.008)
  })
  it('P(us) falls monotonically as our price rises', () => {
    const p = choiceParams(seg('student'), cfg)
    let prev = 1
    for (const pi of [0.9, 0.95, 1, 1.05, 1.1, 1.2]) {
      const pu = choiceProbabilities([ref('us', pi), ref('c1'), ref('c2'), ref('c3')], p).probs[0] as number
      expect(pu).toBeLessThan(prev)
      prev = pu
    }
  })
  it('own-price elasticity matches the analytic −β(1−P)', () => {
    const s = seg('freelance_dev')
    const p = choiceParams(s, cfg)
    const f = (pi: number) => choiceProbabilities([ref('us', pi), ref('c1'), ref('c2'), ref('c3')], p).probs[0] as number
    const h = 1e-5
    const num = (Math.log(f(1 + h)) - Math.log(f(1 - h))) / (Math.log(1 + h) - Math.log(1 - h))
    expect(num).toBeCloseTo(ownPriceElasticity(s.beta.price, f(1)), 5)
  })
  it('price-driven segments are more price-elastic than trust-driven ones', () => {
    const e = (id: string) => {
      const s = seg(id)
      const p = choiceParams(s, cfg)
      return ownPriceElasticity(s.beta.price, choiceProbabilities([ref('us'), ref('c1'), ref('c2'), ref('c3')], p).probs[0] as number)
    }
    expect(Math.abs(e('gamer'))).toBeGreaterThan(Math.abs(e('parent_tuition')) * 3)
  })
  it('faster delivery and higher trust raise P(us)', () => {
    const p = choiceParams(seg('exam_applicant'), cfg)
    const base = choiceProbabilities([ref('us'), ref('c1'), ref('c2'), ref('c3')], p).probs[0] as number
    const fast = choiceProbabilities([ref('us', 1, { slaMinutes: 5 }), ref('c1'), ref('c2'), ref('c3')], p).probs[0] as number
    const trusted = choiceProbabilities([ref('us', 1, { trust: 0.9 }), ref('c1'), ref('c2'), ref('c3')], p).probs[0] as number
    expect(fast).toBeGreaterThan(base)
    expect(trusted).toBeGreaterThan(base)
  })
  it('utility clamps absurd price indices (no NaN/Infinity)', () => {
    const p = choiceParams(seg('student'), cfg)
    expect(Number.isFinite(utility(ref('x', 0), p))).toBe(true)
    expect(Number.isFinite(utility(ref('x', 1e9), p))).toBe(true)
  })
  it('outside shift moves share between buying and not buying', () => {
    const p = choiceParams(seg('student'), cfg)
    const o = [ref('us'), ref('c1'), ref('c2'), ref('c3')]
    expect(choiceProbabilities(o, p, -1).probs[0]).toBeGreaterThan(choiceProbabilities(o, p, 0).probs[0] as number)
  })
})

describe('MarketSignals integration', () => {
  it('ourOffer converts the real quote into a price index', () => {
    const o = ourOffer(makeSignals({ ourIndex: 1.07, ourSla: 20 }), { family: 'gift_card', amountUsdCents: 2000, rushTier: 'normal' })!
    expect(o.priceIndex).toBeCloseTo(1.07, 4)
    expect(o.slaMinutes).toBe(20)
  })
  it('ourOffer is null when we cannot sell or the reference rate is invalid', () => {
    expect(ourOffer(makeSignals({ killed: true }), { family: 'gift_card', amountUsdCents: 2000, rushTier: 'normal' })).toBeNull()
    expect(ourOffer(makeSignals({ refRate: 0 }), { family: 'gift_card', amountUsdCents: 2000, rushTier: 'normal' })).toBeNull()
  })
  it('aggregate competitor is replicated competitorsConsidered times', () => {
    const offers = competitorOffersFor(makeSignals({ competitorIndex: 1.05 }), 'gift_card', cfg)
    expect(offers).toHaveLength(cfg.competitorsConsidered)
    expect(offers.every((o) => o.priceIndex === 1.05)).toBe(true)
  })
  it('explicit competitor offers take precedence', () => {
    const s = { ...makeSignals(), competitorOffers: () => [{ id: 'z', priceIndex: 0.9, slaMinutes: 10, trust: 0.7 }] }
    expect(competitorOffersFor(s, 'gift_card', cfg)).toHaveLength(1)
  })
  it('a killed quote can never win; a price war reduces our win rate; devaluation-style repricing responds to the quote', () => {
    const s = seg('student')
    const win = (sig: ReturnType<typeof makeSignals>) => {
      const rng = createRng(5)
      let w = 0
      for (let i = 0; i < 6000; i++) if (evaluateChoice(rng, s, cfg, sig, { family: 'gift_card', amountUsdCents: 2000, rushTier: 'normal' }, { isReturning: false, orders: 0, satisfaction: 0.7, referred: false }).outcome === 'us') w++
      return w / 6000
    }
    expect(win(makeSignals({ killed: true }))).toBe(0)
    const parity = win(makeSignals())
    expect(parity).toBeGreaterThan(0.035)
    expect(parity).toBeLessThan(0.07)
    expect(win(makeSignals({ competitorIndex: 0.92 }))).toBeLessThan(parity)
    expect(win(makeSignals({ ourIndex: 1.1 }))).toBeLessThan(parity * 0.5)
  })
  it('loyalty and referral add utility', () => {
    const a = loyaltyAsc({ isReturning: false, orders: 0, satisfaction: 0.7, referred: false }, cfg)
    const b = loyaltyAsc({ isReturning: true, orders: 3, satisfaction: 0.9, referred: false }, cfg)
    const c = loyaltyAsc({ isReturning: false, orders: 0, satisfaction: 0.7, referred: true }, cfg)
    expect(a).toBe(0)
    expect(b).toBeGreaterThan(0)
    expect(b).toBeLessThanOrEqual(cfg.behaviour.returningLoyaltyAscCap * 1.4)
    expect(c).toBe(cfg.behaviour.referredConversionAsc)
  })
})
