/**
 * Property tests for the pricing engine (seeded `createRng` loops). Each invariant runs ≥ 500 random cases.
 */
import { describe, expect, it } from 'vitest'
import { createRng, type CustomerTier, type PaymentMethod, type PricingPolicy, type Rng } from '@hiclaude/contracts'
import { priceQuote } from './engine'
import type { PricingInput, QuoteComputation } from './types'
import { params, pricingInput, product, snapshot } from '../test-utils'

const P = params()
const CASES = 600
const ALL: PaymentMethod[] = ['gateway', 'card_to_card', 'bank_transfer', 'usdt', 'wallet']

function randomPolicy(rng: Rng): PricingPolicy {
  const marginPct = 0.03 + rng.next() * 0.17
  const floor = Math.min(marginPct, 0.005 + rng.next() * 0.04)
  const pol: PricingPolicy = structuredClone(P.pricing)
  pol.marginPct = marginPct
  pol.floorMarginPct = floor
  pol.maxMarginPct = marginPct + rng.next() * 0.15
  pol.minMarginIrt = rng.int(1_000, 400_000)
  pol.riskBufferPct = rng.next() * 0.03
  pol.declineBufferUsdCents = rng.int(0, 50)
  pol.volatility.z = 1 + rng.next() * 1.5
  pol.volatility.minBufferPct = rng.next() * 0.01
  pol.volatility.maxBufferPct = pol.volatility.minBufferPct + 0.02 + rng.next() * 0.1
  pol.volatility.lockMinutes = rng.int(5, 240)
  pol.volatility.replenishmentLagDays = rng.next() * 5
  pol.volatility.haltPremiumPct = rng.next() * 0.03
  pol.volatility.driftFloorPctPerDay = rng.next() * 0.002
  pol.roundingStepIrt = rng.pick([1, 10, 100, 1000, 5000])
  pol.usdt.marginPct = Math.min(marginPct, rng.next() * 0.08)
  pol.usdt.minMarginMicroUsdt = rng.int(0, 600_000)
  pol.usdt.roundStepMicroUsdt = rng.pick([1, 1000, 10_000])
  pol.competitor = { enabled: rng.bool(0.7), tolerancePct: rng.next() * 0.08 }
  pol.tierDiscountPct = { new: 0, verified: rng.next() * 0.01, trusted: rng.next() * 0.03 }
  pol.networkFeeAllocMicroUsdt = rng.int(0, 2_000_000)
  pol.stablecoin.parHaircutBps = rng.int(0, 100)
  return pol
}

interface Case {
  input: PricingInput
}

function randomCase(rng: Rng, opts: { competitor?: boolean } = {}): Case {
  const pol = randomPolicy(rng)
  const ask = 150_000 + rng.next() * 450_000
  const bid = ask * (0.97 + rng.next() * 0.029)
  const sigma = 0.002 + rng.next() * 0.05
  const tier = rng.pick<CustomerTier>(['new', 'verified', 'trusted'])
  const prov = rng.pick(P.providers)
  const prod = product(rng.pick(['vcard-new', 'vcard-topup', 'gift-steam', 'cloud-credit', 'ai-service-payment']), rng.bool(0.15) ? { lossLeader: true } : {})
  const pm = structuredClone(P.paymentMethods)
  pm.gateway.feeCapIrt = rng.pick([0, 16_000, 50_000])
  pm.gateway.feePct = rng.next() * 0.02
  pm.gateway.feeFixedIrt = rng.pick([0, 500, 2000])
  const tax = { vatApplies: rng.bool(0.4), vatPct: rng.pick([0.09, 0.1]) }
  const A = rng.int(Math.max(500, prov.fees.minLoadUsdCents), 100_000)
  const input = pricingInput({
    product: prod,
    provider: prov,
    exchangeTakerBps: rng.int(0, 60),
    amountUsdCents: A,
    rushTierId: rng.pick(['normal', 'fast', 'express']),
    rate: snapshot({
      executableAsk: ask,
      executableBid: bid,
      mid: (ask + bid) / 2,
      status: rng.pick(['ok', 'ok', 'ok', 'halted', 'stale', 'anomaly']),
      volatility: { dailyPct: sigma, driftPctPerDay: (rng.next() - 0.4) * 0.01, windowHours: 100 },
    }),
    policy: pol,
    paymentMethods: pm,
    tax,
    customerTier: tier,
    methods: ALL,
    walletBalanceIrt: rng.bool() ? 10_000_000_000 : 0,
  })
  if (opts.competitor) input.competitorRefIrt = rng.int(1_000_000, 80_000_000)
  return { input }
}

const total = (c: QuoteComputation, m: PaymentMethod): number => {
  const q = c.perMethod.find((x) => x.method === m)!
  return q.currency === 'IRT' ? q.totalIrt! : q.totalMicroUsdt!
}
const irtMethods: PaymentMethod[] = ['gateway', 'card_to_card', 'bank_transfer', 'wallet']

describe('pricing properties', () => {
  it('lines sum exactly to the total for every method; all numbers are finite integers', () => {
    const rng = createRng('pp-sum')
    for (let i = 0; i < CASES; i++) {
      const { input } = randomCase(rng, { competitor: rng.bool() })
      const c = priceQuote(input)
      for (const m of c.perMethod) {
        const t = m.currency === 'IRT' ? m.totalIrt! : m.equivalentIrt!
        expect(m.lines.reduce((a, l) => a + l.amountIrt, 0)).toBe(t)
        expect(Number.isSafeInteger(t)).toBe(true)
        expect(Number.isSafeInteger(m.feeIrt)).toBe(true)
        expect(Number.isFinite(m.effectiveRateIrtPerUsd)).toBe(true)
        for (const l of m.lines) expect(Number.isSafeInteger(l.amountIrt)).toBe(true)
        if (m.currency === 'USDT') expect(Number.isSafeInteger(m.totalMicroUsdt!)).toBe(true)
      }
      for (const n of [c.costIrt, c.marginIrt, c.bufferIrt, c.fundingMicroUsdt]) expect(Number.isSafeInteger(n)).toBe(true)
      expect(Number.isNaN(c.unitEconomics.grossMarginPct)).toBe(false)
      // USDT-denominated lines also sum exactly
      expect(c.breakdown.usdt!.lines.reduce((a, l) => a + l.amountMicroUsdt, 0)).toBe(c.perMethod.find((m) => m.method === 'usdt')!.totalMicroUsdt)
    }
  })

  it('price ≥ cost + minMargin (net of VAT and fee) unless the product is a loss leader; rounding never negative', () => {
    const rng = createRng('pp-floor')
    for (let i = 0; i < CASES; i++) {
      const { input } = randomCase(rng, { competitor: rng.bool(0.7) })
      const c = priceQuote(input)
      const minM = input.product.minMarginOverrideIrt ?? input.policy.minMarginIrtByFamily[input.product.family] ?? input.policy.minMarginIrt
      for (const m of irtMethods) {
        const e = c.economics[m]!
        const q = c.perMethod.find((x) => x.method === m)!
        expect(q.lines.find((l) => l.code === 'rounding')?.amountIrt ?? 0).toBeGreaterThanOrEqual(0)
        if (input.product.lossLeader) {
          expect(e.netRevenueIrt).toBeGreaterThanOrEqual(c.costIrt) // never below replacement cost
        } else {
          expect(e.netRevenueIrt).toBeGreaterThanOrEqual(c.costIrt + minM)
          expect(e.netRevenueIrt - e.rushIrt).toBeGreaterThanOrEqual(c.costIrt + c.bufferIrt + minM)
        }
      }
    }
  })

  it('monotone non-decreasing in executableAsk (with and without competitor reference)', () => {
    const rng = createRng('pp-ask')
    for (let i = 0; i < CASES; i++) {
      const { input } = randomCase(rng, { competitor: rng.bool() })
      const k = 1 + rng.next() * 0.1
      const hi = structuredClone(input)
      hi.rate.executableAsk = input.rate.executableAsk * k
      const a = priceQuote(input)
      const b = priceQuote(hi)
      for (const m of irtMethods) expect(total(b, m)).toBeGreaterThanOrEqual(total(a, m))
    }
  })

  it('monotone non-decreasing in amount', () => {
    const rng = createRng('pp-amount')
    for (let i = 0; i < CASES; i++) {
      const { input } = randomCase(rng, { competitor: rng.bool() })
      const hi = { ...input, amountUsdCents: input.amountUsdCents + rng.int(1, 50_000) }
      const a = priceQuote(input)
      const b = priceQuote(hi)
      for (const m of irtMethods) expect(total(b, m)).toBeGreaterThanOrEqual(total(a, m))
      expect(b.fundingMicroUsdt).toBeGreaterThan(a.fundingMicroUsdt)
    }
  })

  it('monotone non-decreasing in volatility (σ and drift)', () => {
    const rng = createRng('pp-vol')
    for (let i = 0; i < CASES; i++) {
      const { input } = randomCase(rng, { competitor: rng.bool() })
      const hi = structuredClone(input)
      hi.rate.volatility = { ...input.rate.volatility, dailyPct: input.rate.volatility.dailyPct * (1 + rng.next()), driftPctPerDay: input.rate.volatility.driftPctPerDay + rng.next() * 0.005 }
      const a = priceQuote(input)
      const b = priceQuote(hi)
      for (const m of irtMethods) expect(total(b, m)).toBeGreaterThanOrEqual(total(a, m))
      expect(b.bufferIrt).toBeGreaterThanOrEqual(a.bufferIrt)
    }
  })

  it('a longer price lock never lowers the price', () => {
    const rng = createRng('pp-lock')
    for (let i = 0; i < CASES; i++) {
      const { input } = randomCase(rng, { competitor: rng.bool() })
      const short = { ...input, lockMinutes: rng.int(1, 60) }
      const long = { ...input, lockMinutes: short.lockMinutes + rng.int(1, 600) }
      const a = priceQuote(short)
      const b = priceQuote(long)
      for (const m of irtMethods) expect(total(b, m)).toBeGreaterThanOrEqual(total(a, m))
      expect(b.lockedUntil).toBeGreaterThan(a.lockedUntil)
    }
  })

  it('rush tiers never cost less than normal', () => {
    const rng = createRng('pp-rush')
    for (let i = 0; i < CASES; i++) {
      const { input } = randomCase(rng, { competitor: rng.bool() })
      const normal = priceQuote({ ...input, rushTierId: 'normal' })
      for (const id of ['fast', 'express']) {
        const rushed = priceQuote({ ...input, rushTierId: id })
        for (const m of irtMethods) expect(total(rushed, m)).toBeGreaterThanOrEqual(total(normal, m))
        expect(total(rushed, 'usdt')).toBeGreaterThanOrEqual(total(normal, 'usdt'))
      }
    }
  })

  it('USDT-pay Toman equivalent never exceeds any IRT price', () => {
    const rng = createRng('pp-usdt')
    for (let i = 0; i < CASES; i++) {
      const { input } = randomCase(rng, { competitor: rng.bool() })
      const c = priceQuote(input)
      const u = c.perMethod.find((m) => m.method === 'usdt')!
      for (const m of irtMethods) expect(u.equivalentIrt!).toBeLessThanOrEqual(total(c, m))
      expect(u.equivalentIrt).toBe(Math.floor((u.totalMicroUsdt! * input.rate.executableBid) / 1_000_000))
    }
  })

  it('idempotent and non-mutating', () => {
    const rng = createRng('pp-idem')
    for (let i = 0; i < CASES; i++) {
      const { input } = randomCase(rng, { competitor: rng.bool() })
      const copy = structuredClone(input)
      const a = priceQuote(input)
      const b = priceQuote(input)
      expect(b).toEqual(a)
      expect(input).toEqual(copy)
    }
  })

  it('raising the margin policy never lowers the price; lowering never raises it', () => {
    const rng = createRng('pp-margin')
    for (let i = 0; i < CASES; i++) {
      const { input } = randomCase(rng, { competitor: false })
      input.product = { ...input.product, lossLeader: false }
      const up = structuredClone(input)
      up.policy.marginPct = Math.min(input.policy.maxMarginPct, input.policy.marginPct + 0.02)
      up.policy.minMarginIrt = input.policy.minMarginIrt + 50_000
      const down = structuredClone(input)
      down.policy.marginPct = Math.max(input.policy.floorMarginPct, input.policy.marginPct - 0.02)
      down.policy.minMarginIrt = Math.max(0, input.policy.minMarginIrt - 50_000)
      const a = priceQuote(input)
      for (const m of irtMethods) {
        expect(total(priceQuote(up), m)).toBeGreaterThanOrEqual(total(a, m))
        expect(total(priceQuote(down), m)).toBeLessThanOrEqual(total(a, m))
      }
    }
  })

  it('tier discounts never raise the price and never push the margin below the floor', () => {
    const rng = createRng('pp-tier')
    for (let i = 0; i < CASES; i++) {
      const { input } = randomCase(rng, { competitor: false })
      input.product = { ...input.product, lossLeader: false }
      const asNew = priceQuote({ ...input, customerTier: 'new' })
      const asTrusted = priceQuote({ ...input, customerTier: 'trusted' })
      for (const m of irtMethods) expect(total(asTrusted, m)).toBeLessThanOrEqual(total(asNew, m))
      expect(asTrusted.breakdown.margin.finalIrt).toBeGreaterThanOrEqual(asTrusted.breakdown.margin.floorIrt)
    }
  })

  it('competitor guard: price ≤ ceiling unless flagged uncompetitive; never below floor margin', () => {
    const rng = createRng('pp-comp')
    for (let i = 0; i < CASES; i++) {
      const { input } = randomCase(rng, { competitor: true })
      input.product = { ...input.product, lossLeader: false }
      input.policy.competitor.enabled = true
      const c = priceQuote(input)
      const m = c.breakdown.margin
      expect(m.finalIrt).toBeGreaterThanOrEqual(m.floorIrt)
      if (!c.uncompetitive) {
        const ceiling = Math.floor(input.competitorRefIrt! * (1 + input.policy.competitor.tolerancePct))
        // price excluding rush & payment fee, before rounding (what the guard compares)
        const pc = c.breakdown.netBeforeRushIrt + Math.round((c.breakdown.vatPct) * c.breakdown.netBeforeRushIrt)
        expect(pc).toBeLessThanOrEqual(ceiling)
      } else {
        expect(c.warningCodes).toContain('uncompetitive')
      }
    }
  })

  it('gateway gross-up is exact and minimal: total − fee ≥ target, and one step lower falls short', () => {
    const rng = createRng('pp-gross')
    for (let i = 0; i < CASES; i++) {
      const { input } = randomCase(rng, { competitor: rng.bool() })
      const c = priceQuote(input)
      const g = c.perMethod.find((m) => m.method === 'gateway')!
      const target = c.breakdown.netIrt + c.breakdown.vatIrt
      expect(g.totalIrt! - g.feeIrt).toBeGreaterThanOrEqual(target)
      const gp = input.paymentMethods.gateway
      const fee = (a: number) => {
        const raw = Math.ceil(a * gp.feePct - 1e-9) + gp.feeFixedIrt
        return gp.feeCapIrt > 0 ? Math.min(gp.feeCapIrt, raw) : raw
      }
      const step = input.policy.roundingStepIrt
      const lower = g.totalIrt! - step
      // minimal among rounding-step multiples (float ceil tolerance → allow equality within 1 Toman)
      expect(lower - fee(lower)).toBeLessThanOrEqual(target + 1)
    }
  })
})

describe('pricing property generator coverage (sanity)', () => {
  it('exercises guard, uncompetitive, usdt cap, loss leader, vat, cap branch and unavailable methods', () => {
    const rng = createRng('pp-coverage')
    const seen = { guard: 0, unc: 0, cap: 0, ll: 0, vat: 0, capBranch: 0, unavailable: 0, halted: 0, promoLike: 0 }
    for (let i = 0; i < CASES; i++) {
      const { input } = randomCase(rng, { competitor: true })
      const c = priceQuote(input)
      if (c.breakdown.margin.competitorReductionIrt > 0) seen.guard++
      if (c.uncompetitive) seen.unc++
      if (c.breakdown.usdt!.cappedByIrtPrice) seen.cap++
      if (input.product.lossLeader) seen.ll++
      if (c.breakdown.vatIrt > 0) seen.vat++
      if (c.breakdown.byMethod.gateway!.grossUp === 'cap') seen.capBranch++
      if (c.perMethod.some((m) => !m.available)) seen.unavailable++
      if (c.rateStatus !== 'ok') seen.halted++
    }
    for (const [k, v] of Object.entries(seen)) {
      if (k === 'promoLike') continue
      expect(v, k).toBeGreaterThan(5)
    }
  })
})
