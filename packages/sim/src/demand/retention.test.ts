import { describe, expect, it } from 'vitest'
import { createRng } from '@hiclaude/contracts'
import { MS } from '@hiclaude/contracts'
import { RetentionModel, delayFactor, newCustomerState, satisfactionFactor, satisfactionScore } from './retention'
import { gamma, loadSegmentsConfig } from './segments'
import { mean } from './common'

const cfg = loadSegmentsConfig({ useResearch: false })
const seg = (id: string) => cfg.segments.find((s) => s.id === id)!
const model = new RetentionModel(cfg)

describe('satisfaction', () => {
  it('on-time delivery > late > failed; refunded is worst', () => {
    const ok = satisfactionScore({ status: 'delivered', delayRatio: 0.8 }, cfg)
    const late = satisfactionScore({ status: 'delivered', delayRatio: 2.5 }, cfg)
    const failed = satisfactionScore({ status: 'failed' }, cfg)
    const refunded = satisfactionScore({ status: 'refunded' }, cfg)
    expect(ok).toBeGreaterThan(late)
    expect(late).toBeGreaterThan(failed)
    expect(failed).toBeGreaterThan(refunded)
  })
  it('stays in [0,1]', () => {
    for (const o of [{ status: 'refunded' as const, priceIndexPaid: 2 }, { status: 'delivered' as const, delayRatio: 100 }, { status: 'delivered' as const, priceIndexPaid: 0.5, supportResolved: true, hadProblem: true }]) {
      const s = satisfactionScore(o, cfg)
      expect(s).toBeGreaterThanOrEqual(0)
      expect(s).toBeLessThanOrEqual(1)
    }
  })
  it('cheaper-than-market and a resolved issue raise satisfaction', () => {
    const base = satisfactionScore({ status: 'delivered', delayRatio: 3 }, cfg)
    expect(satisfactionScore({ status: 'delivered', delayRatio: 3, priceIndexPaid: 0.9 }, cfg)).toBeGreaterThan(base)
    expect(satisfactionScore({ status: 'delivered', delayRatio: 3, hadProblem: true, supportResolved: true }, cfg)).toBeGreaterThan(base)
  })
  it('EMA update: first order sets, later orders blend', () => {
    const st = newCustomerState(cfg, 'c1', 'student', 0)
    st.orders = 1
    model.updateSatisfaction(st, 0.9)
    expect(st.satisfaction).toBe(0.9)
    st.orders = 2
    model.updateSatisfaction(st, 0.1)
    expect(st.satisfaction).toBeCloseTo(0.5, 9)
  })
})

describe('repeat purchase', () => {
  it('probability rises with satisfaction and loyalty, is capped, and is zero beyond maxOrders', () => {
    const s = seg('freelance_dev')
    expect(model.repeatProbability(s, 0.9, 1)).toBeGreaterThan(model.repeatProbability(s, 0.4, 1))
    expect(model.repeatProbability(s, 0.7, 5)).toBeGreaterThan(model.repeatProbability(s, 0.7, 1))
    expect(model.repeatProbability(s, 1, 8)).toBeLessThanOrEqual(0.97)
    expect(model.repeatProbability(s, 0.9, s.repeat.maxOrders)).toBe(0)
  })
  it('satisfaction factor is 1 at the reference 0.75 and monotone', () => {
    expect(satisfactionFactor(0.75)).toBeCloseTo(1, 9)
    expect(satisfactionFactor(0.9)).toBeGreaterThan(satisfactionFactor(0.5))
    expect(delayFactor(0.75)).toBeCloseTo(1, 2)
    expect(delayFactor(0.9)).toBeLessThan(delayFactor(0.3))
  })
  it('inter-purchase delay has the Weibull mean scale·g(s)·Γ(1+1/k)', () => {
    const s = seg('gamer')
    const rng = createRng(1)
    const xs: number[] = []
    for (let i = 0; i < 30000; i++) xs.push(model.sampleDelayMs(rng, s, 0.75) / MS.day)
    const expected = s.repeat.weibullScaleDays * delayFactor(0.75) * gamma(1 + 1 / s.repeat.weibullShape)
    expect(mean(xs) / expected).toBeGreaterThan(0.96)
    expect(mean(xs) / expected).toBeLessThan(1.04)
  })
  it('satisfied customers come back sooner', () => {
    const s = seg('student')
    const m = (sat: number) => {
      const rng = createRng(2)
      const xs: number[] = []
      for (let i = 0; i < 5000; i++) xs.push(model.sampleDelayMs(rng, s, sat))
      return mean(xs)
    }
    expect(m(0.95)).toBeLessThan(m(0.4))
  })
  it('simulated cohort lifetime orders match the exact recursion Σ_k Π p_i (retention curve)', () => {
    const s = seg('ads_manager')
    const sat = 0.8
    // exact expectation with the loyalty term
    let e = 0
    let surv = 1
    for (let n = 1; n <= s.repeat.maxOrders; n++) {
      e += surv
      surv *= model.repeatProbability(s, sat, n)
    }
    const rng = createRng(3)
    const N = 20000
    let total = 0
    for (let i = 0; i < N; i++) {
      const st = newCustomerState(cfg, `c${i}`, s.id, 0)
      for (;;) {
        st.orders++
        st.satisfaction = sat
        total++
        const r = model.afterOrder(rng, s, st, 0, sat)
        if (!st.active) {
          expect(r.churned).toBe(true)
          break
        }
      }
    }
    expect(total / N / e).toBeGreaterThan(0.97)
    expect(total / N / e).toBeLessThan(1.03)
  })
  it('analytic constant-p expectations are consistent', () => {
    const s = seg('student')
    const p = Math.min(0.97, s.repeat.baseProbability * satisfactionFactor(0.75))
    expect(model.expectedOrdersConstantP(s, 0.75)).toBeCloseTo(1 / (1 - p), 9)
    expect(model.survivalAfterOrders(s, 0.75, 3)).toBeCloseTo(p ** 3, 9)
    expect(model.expectedLtvIrt(s, 0.75, 100_000)).toBeCloseTo(100_000 / (1 - p), 4)
  })
  it('churned customers are marked inactive without a next purchase', () => {
    const s = seg('exam_applicant')
    const rng = createRng(5)
    let churned = 0
    for (let i = 0; i < 400; i++) {
      const st = newCustomerState(cfg, `c${i}`, s.id, 0)
      st.orders = 1
      const r = model.afterOrder(rng, s, st, 1000, 0.4)
      if (r.churned) {
        churned++
        expect(st.active).toBe(false)
        expect(st.nextPurchaseAt).toBeUndefined()
      } else expect(st.nextPurchaseAt).toBeGreaterThan(1000)
    }
    expect(churned).toBeGreaterThan(100)
  })
})

describe('referral', () => {
  it('unsatisfied customers do not refer; satisfied ones do at ≈ propensity·f(s)', () => {
    const s = seg('student')
    expect(model.referralProbability(s, 0.4)).toBe(0)
    const rng = createRng(6)
    let refs = 0
    let kids = 0
    const N = 20000
    for (let i = 0; i < N; i++) {
      const st = newCustomerState(cfg, `c${i}`, s.id, 0)
      st.orders = 1
      st.satisfaction = 0.9
      const r = model.afterOrder(rng, s, st, 0, 0.9)
      if (r.referredArrivals.length > 0) {
        refs++
        kids += r.referredArrivals.length
        for (const a of r.referredArrivals) expect(a.at).toBeGreaterThanOrEqual(0)
      }
    }
    expect(refs / N).toBeCloseTo(model.referralProbability(s, 0.9), 1)
    expect(kids / refs).toBeCloseTo(s.referral.meanReferred, 1)
  })
  it('referrals per customer are capped (no farming loops)', () => {
    const s = seg('student')
    const rng = createRng(7)
    const st = newCustomerState(cfg, 'c', s.id, 0)
    st.orders = 1
    st.satisfaction = 1
    let times = 0
    for (let i = 0; i < 200; i++) if (model.afterOrder(rng, s, st, 0, 1).referredArrivals.length > 0) times++
    expect(times).toBeLessThanOrEqual(3)
  })
  it('word-of-mouth signal is positive for delighted and negative for angry customers', () => {
    const s = seg('student')
    const rng = createRng(8)
    const st = newCustomerState(cfg, 'c', s.id, 0)
    st.orders = 1
    expect(model.afterOrder(rng, s, st, 0, 0.9).womSignal).toBeGreaterThan(0)
    expect(model.afterOrder(rng, s, st, 0, 0.1).womSignal).toBeLessThan(0)
  })
})
