import { describe, expect, it } from 'vitest'
import { AppError, createRng, type PaymentMethod, type PricingPolicy, type Rng } from '@hiclaude/contracts'
import { priceQuote, resolveTakerBps } from './engine'
import { explainQuote } from './explain'
import { solvePriceForTargetMargin } from './solve'
import type { PricingInput } from './types'
import { NOW, params, pricingInput, product, snapshot } from '../test-utils'

const P = params()
const sumLines = (lines: { amountIrt: number }[]): number => lines.reduce((a, l) => a + l.amountIrt, 0)
const gw = (c: ReturnType<typeof priceQuote>) => c.perMethod.find((m) => m.method === 'gateway')!
const c2c = (c: ReturnType<typeof priceQuote>) => c.perMethod.find((m) => m.method === 'card_to_card')!
const bank = (c: ReturnType<typeof priceQuote>) => c.perMethod.find((m) => m.method === 'bank_transfer')!
const usdt = (c: ReturnType<typeof priceQuote>) => c.perMethod.find((m) => m.method === 'usdt')!

describe('priceQuote — structure & arithmetic', () => {
  it('computes the funding need exactly ($100 top-up, mpay 3 % + 0.25 decline + 0.3 USDT network)', () => {
    const c = priceQuote(pricingInput())
    // 10000 + 300 (3 %) + 25 (decline buffer) = 10325 cents = 103.25 USDT + 0.3 network
    expect(c.breakdown.fundingUsdCents).toBe(10_325)
    expect(c.fundingMicroUsdt).toBe(103_550_000)
  })

  it('adds the issue fee only for a new card', () => {
    const topup = priceQuote(pricingInput({ newCard: false }))
    const issue = priceQuote(pricingInput({ newCard: true }))
    expect(issue.fundingMicroUsdt - topup.fundingMicroUsdt).toBe(4_990_000) // 4.99 USD
    const byProduct = priceQuote(pricingInput({ product: product('vcard-new') }))
    expect(byProduct.breakdown.newCard).toBe(true)
  })

  it('applies stablecoin par haircut to funding', () => {
    const base = priceQuote(pricingInput())
    const pol: PricingPolicy = { ...P.pricing, stablecoin: { parHaircutBps: 100 } }
    const hc = priceQuote(pricingInput({ policy: pol }))
    // (103.25 * 1.01) + 0.3 = 104.5825
    expect(hc.fundingMicroUsdt).toBe(104_582_500)
    expect(hc.costIrt).toBeGreaterThan(base.costIrt)
  })

  it('replacement cost = fundingMicro × ask × (1 + taker) rounded up', () => {
    const c = priceQuote(pricingInput())
    const exact = (103_550_000 * 257_000 * 1.0025) / 1_000_000
    expect(c.costIrt).toBe(Math.ceil(exact))
    expect(c.breakdown.costLines.serviceValue + c.breakdown.costLines.providerFees + c.breakdown.costLines.exchangeCost).toBe(c.costIrt)
    expect(c.breakdown.costLines.serviceValue).toBe(Math.ceil((100_000_000 * 257_000 * 1.0025) / 1_000_000))
  })

  it('lines of every method sum exactly to the total; everything is an integer', () => {
    const c = priceQuote(pricingInput())
    for (const m of c.perMethod) {
      const total = m.currency === 'IRT' ? m.totalIrt! : m.equivalentIrt!
      expect(sumLines(m.lines)).toBe(total)
      expect(Number.isInteger(total)).toBe(true)
      for (const l of m.lines) expect(Number.isInteger(l.amountIrt)).toBe(true)
    }
  })

  it('rounds the customer price UP to the rounding step and books the remainder in the rounding line', () => {
    const c = priceQuote(pricingInput())
    const b = bank(c)
    expect(b.totalIrt! % 1000).toBe(0)
    const rounding = b.lines.find((l) => l.code === 'rounding')?.amountIrt ?? 0
    expect(rounding).toBeGreaterThanOrEqual(0)
    expect(rounding).toBeLessThan(1000)
    expect(b.totalIrt! - rounding).toBe(c.breakdown.netIrt)
  })

  it('volatility buffer matches the closed form', () => {
    const c = priceQuote(pricingInput())
    const z = 1.64
    const sigma = 0.012
    const raw = z * sigma * Math.sqrt(30 / 1440) + 0 + z * sigma * Math.sqrt(3)
    expect(c.breakdown.volatility.rawPct).toBeCloseTo(raw, 12)
    expect(c.breakdown.volatility.finalPct).toBeCloseTo(raw, 12)
    expect(c.breakdown.volatility.bufferIrt).toBe(Math.ceil(c.costIrt * raw))
  })

  it('volatility buffer is clamped to [min, max]', () => {
    const low = priceQuote(pricingInput({ rate: snapshot({ volatility: { dailyPct: 0.00001, driftPctPerDay: 0, windowHours: 1 } }) }))
    expect(low.breakdown.volatility.finalPct).toBe(P.pricing.volatility.minBufferPct)
    const high = priceQuote(pricingInput({ rate: snapshot({ volatility: { dailyPct: 0.5, driftPctPerDay: 0, windowHours: 1 } }) }))
    expect(high.breakdown.volatility.finalPct).toBe(P.pricing.volatility.maxBufferPct)
  })

  it('drift is floored by policy and never negative', () => {
    const neg = priceQuote(pricingInput({ rate: snapshot({ volatility: { dailyPct: 0.012, driftPctPerDay: -0.02, windowHours: 100 } }) }))
    expect(neg.breakdown.volatility.driftUsedPerDay).toBe(0)
    const pol: PricingPolicy = { ...P.pricing, volatility: { ...P.pricing.volatility, driftFloorPctPerDay: 0.002 } }
    const fl = priceQuote(pricingInput({ policy: pol, rate: snapshot({ volatility: { dailyPct: 0.012, driftPctPerDay: 0, windowHours: 100 } }) }))
    expect(fl.breakdown.volatility.driftUsedPerDay).toBe(0.002)
    const pos = priceQuote(pricingInput({ rate: snapshot({ volatility: { dailyPct: 0.012, driftPctPerDay: 0.004, windowHours: 100 } }) }))
    expect(pos.breakdown.volatility.driftUsedPerDay).toBe(0.004)
    expect(pos.breakdown.volatility.rawPct).toBeGreaterThan(priceQuote(pricingInput()).breakdown.volatility.rawPct)
  })

  it('non-ok rate status adds the halt premium and a warning', () => {
    const ok = priceQuote(pricingInput())
    for (const status of ['halted', 'stale', 'anomaly'] as const) {
      const c = priceQuote(pricingInput({ rate: snapshot({ status }) }))
      expect(c.breakdown.volatility.haltPremiumPct).toBe(P.pricing.volatility.haltPremiumPct)
      expect(c.warningCodes).toContain(`rates_${status}`)
      expect(c.warnings.length).toBeGreaterThan(0)
      expect(bank(c).totalIrt!).toBeGreaterThan(bank(ok).totalIrt!)
    }
    expect(ok.warnings).toEqual([])
  })

  it('refuses killed / invalid snapshots and bad amounts', () => {
    expect(() => priceQuote(pricingInput({ rate: snapshot({ status: 'killed' }) }))).toThrowError(AppError)
    try {
      priceQuote(pricingInput({ rate: snapshot({ executableAsk: 0 }) }))
      expect.unreachable()
    } catch (e) {
      expect((e as AppError).code).toBe('RATES_UNAVAILABLE')
    }
    for (const a of [0, -5, 1.5, NaN]) {
      try {
        priceQuote(pricingInput({ amountUsdCents: a }))
        expect.unreachable()
      } catch (e) {
        expect((e as AppError).code).toBe('VALIDATION')
      }
    }
    expect(() => priceQuote(pricingInput({ rushTierId: 'nope' }))).toThrowError(AppError)
  })

  it('lockedUntil = now + lockMinutes and carries ids/versions', () => {
    const c = priceQuote(pricingInput())
    expect(c.lockedUntil).toBe(NOW + 30 * 60_000)
    expect(c.rateSnapshotId).toBe('rs_test')
    expect(c.policyVersion).toBe(P.pricing.version)
    expect(priceQuote(pricingInput({ lockMinutes: 90 })).lockedUntil).toBe(NOW + 90 * 60_000)
  })

  it('resolveTakerBps picks the executable exchange fee, else the highest enabled fee', () => {
    expect(resolveTakerBps(snapshot({ executableAskExchangeId: 'nobitex' }), P.exchanges)).toBe(35)
    expect(resolveTakerBps(snapshot({ executableAskExchangeId: undefined }), P.exchanges)).toBe(35)
    expect(resolveTakerBps(snapshot({ executableAskExchangeId: 'tabdeal' }), P.exchanges)).toBe(25)
  })
})

describe('priceQuote — margin, tiers, competitor, promo', () => {
  it('margin = max(minMargin, pct·C) and min margin wins on small orders', () => {
    const big = priceQuote(pricingInput())
    expect(big.breakdown.margin.finalIrt).toBe(Math.ceil(big.costIrt * 0.1))
  })

  it('min margin binds when pct·C is smaller', () => {
    const pol = { ...P.pricing, minMarginIrt: 5_000_000 }
    const c = priceQuote(pricingInput({ policy: pol }))
    expect(c.breakdown.margin.finalIrt).toBe(5_000_000)
  })

  it('family override and product override are honoured and clamped to [floor, max]', () => {
    const pol = { ...P.pricing, marginPctByFamily: { virtual_card: 0.2 }, minMarginIrtByFamily: { virtual_card: 1 } }
    expect(priceQuote(pricingInput({ policy: pol })).breakdown.margin.pctBase).toBe(0.2)
    const pol2 = { ...P.pricing, marginPctByFamily: { virtual_card: 0.9 } }
    expect(priceQuote(pricingInput({ policy: pol2 })).breakdown.margin.pctBase).toBe(P.pricing.maxMarginPct)
    const prod = product('vcard-topup', { marginOverridePct: 0.01, minMarginOverrideIrt: 1 })
    expect(priceQuote(pricingInput({ product: prod })).breakdown.margin.pctBase).toBe(P.pricing.floorMarginPct)
    const prod2 = product('vcard-topup', { marginOverridePct: 0.15 })
    expect(priceQuote(pricingInput({ product: prod2 })).breakdown.margin.pctBase).toBe(0.15)
  })

  it('tier discount lowers the margin (as a visible negative discount line) but never below the floor', () => {
    const none = priceQuote(pricingInput({ customerTier: 'new' }))
    const trusted = priceQuote(pricingInput({ customerTier: 'trusted' }))
    expect(trusted.breakdown.margin.tierDiscountIrt).toBeGreaterThan(0)
    const disc = bank(trusted).lines.find((l) => l.code === 'discount')!
    expect(disc.amountIrt).toBe(-trusted.breakdown.margin.tierDiscountIrt)
    expect(disc.visibleToCustomer).toBe(true)
    expect(bank(trusted).totalIrt!).toBeLessThan(bank(none).totalIrt!)
    // huge discount → floored at floorMarginPct
    const pol = { ...P.pricing, tierDiscountPct: { ...P.pricing.tierDiscountPct, trusted: 0.5 } }
    const floored = priceQuote(pricingInput({ policy: pol, customerTier: 'trusted' }))
    expect(floored.breakdown.margin.pctAfterTier).toBe(P.pricing.floorMarginPct)
    expect(floored.breakdown.margin.finalIrt).toBeGreaterThanOrEqual(Math.ceil(floored.costIrt * P.pricing.floorMarginPct))
  })

  it('competitor guard lowers margin toward the floor and flags uncompetitive when still above', () => {
    const base = priceQuote(pricingInput())
    const baseBank = bank(base).totalIrt!
    // reference slightly below our price: margin shrinks, still competitive
    const ref = Math.floor(baseBank / 1.03) // ceiling = ref*1.03 ≈ our price
    const mid = priceQuote(pricingInput({ competitorRefIrt: Math.floor(baseBank * 0.99 / 1.03) }))
    expect(mid.breakdown.margin.competitorReductionIrt).toBeGreaterThan(0)
    expect(mid.uncompetitive).toBe(false)
    expect(bank(mid).totalIrt!).toBeLessThan(baseBank)
    expect(bank(mid).totalIrt!).toBeLessThanOrEqual(Math.floor(Math.floor(baseBank * 0.99 / 1.03) * 1.03))
    void ref
    // reference far below cost: price pinned at floor margin and flagged
    const low = priceQuote(pricingInput({ competitorRefIrt: 10_000_000 }))
    expect(low.uncompetitive).toBe(true)
    expect(low.warningCodes).toContain('uncompetitive')
    expect(low.breakdown.margin.finalIrt).toBe(low.breakdown.margin.floorIrt)
    // reference above our price: no change
    const high = priceQuote(pricingInput({ competitorRefIrt: baseBank * 2 }))
    expect(bank(high).totalIrt).toBe(baseBank)
    expect(high.uncompetitive).toBe(false)
    // disabled in policy: ignored
    const off = priceQuote(pricingInput({ competitorRefIrt: 10_000_000, policy: { ...P.pricing, competitor: { enabled: false, tolerancePct: 0.03 } } }))
    expect(bank(off).totalIrt).toBe(baseBank)
    expect(off.uncompetitive).toBe(false)
  })

  it('loss-leader products may be priced down to cost (+ nothing) under the guard, normal products may not', () => {
    const ref = 10_000_000
    const normal = priceQuote(pricingInput({ competitorRefIrt: ref }))
    const ll = priceQuote(pricingInput({ competitorRefIrt: ref, product: product('vcard-topup', { lossLeader: true }) }))
    expect(bank(ll).totalIrt!).toBeLessThan(bank(normal).totalIrt!)
    expect(bank(ll).totalIrt!).toBeGreaterThanOrEqual(ll.costIrt) // never below replacement cost
    expect(ll.breakdown.margin.finalIrt).toBe(-ll.bufferIrt)
  })

  it('promo discount is capped at (margin − floor) and shown as a visible negative line', () => {
    const c = priceQuote(pricingInput({ promoDiscountIrt: 100_000 }))
    expect(c.breakdown.margin.promoDiscountIrt).toBe(100_000)
    expect(bank(c).lines.some((l) => l.code === 'discount' && l.amountIrt === -100_000)).toBe(true)
    const huge = priceQuote(pricingInput({ promoDiscountIrt: 999_999_999 }))
    expect(huge.breakdown.margin.finalIrt).toBe(huge.breakdown.margin.floorIrt)
    expect(huge.breakdown.margin.promoDiscountIrt).toBeLessThan(999_999_999)
  })
})

describe('priceQuote — rush, VAT, gateway fee, methods', () => {
  it('rush premium = max(min, pct × (C + buffers + margin)); tiers listed with availability', () => {
    const normal = priceQuote(pricingInput())
    const fast = priceQuote(pricingInput({ rushTierId: 'fast' }))
    const expectRush = Math.max(100_000, Math.ceil(fast.breakdown.netBeforeRushIrt * 0.04))
    expect(fast.breakdown.rushIrt).toBe(expectRush)
    expect(bank(fast).totalIrt!).toBeGreaterThan(bank(normal).totalIrt!)
    expect(bank(fast).lines.find((l) => l.code === 'rush')!.amountIrt).toBe(expectRush)
    expect(fast.rushTiers.map((t) => t.id)).toEqual(['normal', 'fast', 'express'])
    expect(fast.rushTiers.find((t) => t.id === 'express')!.premiumIrt).toBe(Math.max(300_000, Math.ceil(fast.breakdown.netBeforeRushIrt * 0.1)))
    expect(normal.breakdown.rushIrt).toBe(0)
  })

  it('exhausted rush capacity makes every method unavailable with a reason; next slot is exposed', () => {
    const c = priceQuote(pricingInput({ rushTierId: 'express', rushCapacity: { express: { available: false, nextSlotAt: NOW + 3_600_000 } } }))
    expect(c.perMethod.every((m) => !m.available)).toBe(true)
    expect(c.perMethod[0]!.unavailableReasonFa).toContain('ظرفیت')
    const opt = c.rushTiers.find((t) => t.id === 'express')!
    expect(opt.available).toBe(false)
    expect(opt.nextSlotAt).toBe(NOW + 3_600_000)
    expect(c.warningCodes).toContain('rush_unavailable')
    // other tiers unaffected
    const normal = priceQuote(pricingInput({ rushCapacity: { express: { available: false } } }))
    expect(bank(normal).available).toBe(true)
  })

  it('disabled rush tier is unavailable', () => {
    const pol = { ...P.pricing, rushTiers: P.pricing.rushTiers.map((t) => (t.id === 'express' ? { ...t, enabled: false } : t)) }
    const c = priceQuote(pricingInput({ policy: pol, rushTierId: 'express' }))
    expect(c.perMethod.every((m) => !m.available)).toBe(true)
    expect(c.rushTiers.find((t) => t.id === 'express')!.reasonFa).toContain('غیرفعال')
    expect(priceQuote(pricingInput({ policy: pol })).rushTiers.map((t) => t.id)).toEqual(['normal', 'fast'])
  })

  it('VAT is a separate line on the net and part of the total', () => {
    const noVat = priceQuote(pricingInput())
    const withVat = priceQuote(pricingInput({ tax: { vatApplies: true, vatPct: 0.1 } }))
    const vatLine = bank(withVat).lines.find((l) => l.code === 'vat')!
    expect(vatLine.amountIrt).toBe(Math.round(withVat.breakdown.netIrt * 0.1))
    expect(bank(noVat).lines.some((l) => l.code === 'vat')).toBe(false)
    expect(bank(withVat).totalIrt!).toBeGreaterThan(bank(noVat).totalIrt!)
    expect(withVat.economics.card_to_card!.vatIrt).toBe(vatLine.amountIrt)
    expect(withVat.economics.card_to_card!.netRevenueIrt).toBe(bank(withVat).totalIrt! - vatLine.amountIrt)
  })

  it('falls back to policy.vat when `tax` is omitted', () => {
    const pol = { ...P.pricing, vat: { applies: true, pct: 0.09 } }
    const c = priceQuote({ ...pricingInput({ policy: pol }), tax: undefined })
    expect(c.breakdown.vatPct).toBe(0.09)
    expect(c.breakdown.vatIrt).toBeGreaterThan(0)
  })

  it('gateway: fee cap branch on a large order, closed form on a small one', () => {
    const big = priceQuote(pricingInput())
    expect(gw(big).feeIrt).toBe(16_000)
    expect(big.breakdown.byMethod.gateway!.grossUp).toBe('cap')
    expect(gw(big).totalIrt! - gw(big).feeIrt).toBeGreaterThanOrEqual(big.breakdown.netIrt)
    const alt = P.providers.find((p) => p.id === 'altcard')!
    const highCap = { ...P.paymentMethods, gateway: { ...P.paymentMethods.gateway, feeCapIrt: 100_000 } }
    const small = priceQuote(pricingInput({ amountUsdCents: 1000, provider: alt, paymentMethods: highCap }))
    const g = gw(small)
    expect(small.breakdown.byMethod.gateway!.grossUp).toBe('closed_form')
    expect(g.feeIrt).toBe(Math.min(100_000, Math.ceil(g.totalIrt! * 0.005) + 500))
    // customer pays more by roughly pct + fixed
    expect(g.totalIrt!).toBeGreaterThan(bank(small).totalIrt!)
    expect(g.totalIrt! - g.feeIrt).toBeGreaterThanOrEqual(small.breakdown.netIrt)
    // minimal: one rounding step less would leave less than the target
    const gp = P.paymentMethods.gateway
    const lower = g.totalIrt! - 1000
    const feeLower = Math.min(100_000, Math.ceil(lower * gp.feePct) + gp.feeFixedIrt)
    expect(lower - feeLower).toBeLessThan(small.breakdown.netIrt)
  })

  it('USDT-pay variant: smaller buffer, no conversion cost, usdt margin, rounded up to 0.01 USDT, Toman equivalent at bid', () => {
    const c = priceQuote(pricingInput())
    const u = usdt(c)
    expect(u.currency).toBe('USDT')
    expect(u.totalMicroUsdt! % P.pricing.usdt.roundStepMicroUsdt).toBe(0)
    expect(u.totalIrt).toBeUndefined()
    const bd = c.breakdown.usdt!
    expect(bd.fundingMicroUsdt).toBe(103_550_000)
    expect(bd.marginMicroUsdt).toBe(Math.max(500_000, Math.ceil(103_550_000 * 0.04)))
    expect(bd.bufferMicroUsdt).toBeLessThan(Math.ceil(103_550_000 * c.breakdown.volatility.finalPct)) // lock-window-only buffer is smaller
    expect(u.equivalentIrt).toBe(Math.floor((u.totalMicroUsdt! * 255_500) / 1_000_000))
    expect(sumLines(u.lines)).toBe(u.equivalentIrt)
    expect(bd.lines.reduce((a, l) => a + l.amountMicroUsdt, 0)).toBe(u.totalMicroUsdt)
    expect(u.equivalentIrt!).toBeLessThanOrEqual(Math.min(gw(c).totalIrt!, bank(c).totalIrt!))
    expect(u.feeIrt).toBe(0)
  })

  it('USDT-pay price is capped by the Toman price when the usdt margin is set too high', () => {
    const pol = { ...P.pricing, usdt: { ...P.pricing.usdt, marginPct: 0.3 } }
    const c = priceQuote(pricingInput({ policy: pol }))
    expect(c.breakdown.usdt!.cappedByIrtPrice).toBe(true)
    expect(usdt(c).equivalentIrt!).toBeLessThanOrEqual(bank(c).totalIrt!)
    expect(sumLines(usdt(c).lines)).toBe(usdt(c).equivalentIrt)
  })

  it('USDT-pay with rush and VAT keeps lines exact', () => {
    const c = priceQuote(pricingInput({ rushTierId: 'express', tax: { vatApplies: true, vatPct: 0.1 } }))
    const u = usdt(c)
    expect(c.breakdown.usdt!.rushMicroUsdt).toBeGreaterThan(0)
    expect(c.breakdown.usdt!.vatMicroUsdt).toBeGreaterThan(0)
    expect(sumLines(u.lines)).toBe(u.equivalentIrt)
    expect(c.breakdown.usdt!.lines.reduce((a, l) => a + l.amountMicroUsdt, 0)).toBe(u.totalMicroUsdt)
  })

  it('method availability: limits, tiers, wallet, c2c caps, disabled', () => {
    // c2c above order cap
    expect(c2c(priceQuote(pricingInput())).available).toBe(false)
    expect(c2c(priceQuote(pricingInput())).unavailableReasonFa).toContain('سقف')
    // small order: c2c ok
    const small = priceQuote(pricingInput({ amountUsdCents: 2500 }))
    expect(c2c(small).available).toBe(true)
    // below c2c minimum
    const pm = { ...P.paymentMethods, card_to_card: { ...P.paymentMethods.card_to_card, minIrt: 50_000_000, maxOrderIrt: 90_000_000, perCardDailyCapIrt: 90_000_000 } }
    expect(c2c(priceQuote(pricingInput({ paymentMethods: pm }))).unavailableReasonFa).toContain('حداقل')
    // per-card daily cap below max order
    const pm2 = { ...P.paymentMethods, card_to_card: { ...P.paymentMethods.card_to_card, maxOrderIrt: 90_000_000, perCardDailyCapIrt: 20_000_000 } }
    expect(c2c(priceQuote(pricingInput({ paymentMethods: pm2 }))).unavailableReasonFa).toContain('هر کارت')
    // capacity remaining
    expect(c2c(priceQuote(pricingInput({ amountUsdCents: 2500, c2cCapacityRemainingIrt: 1_000_000 }))).available).toBe(false)
    // tier not allowed
    const t = priceQuote(pricingInput({ allowedMethods: ['wallet'] }))
    expect(gw(t).available).toBe(false)
    expect(gw(t).unavailableReasonFa).toContain('سطح حساب')
    // wallet
    expect(priceQuote(pricingInput({ walletBalanceIrt: 99_000_000 })).perMethod.find((m) => m.method === 'wallet')!.available).toBe(true)
    const noWallet = priceQuote({ ...pricingInput(), walletBalanceIrt: undefined })
    expect(noWallet.perMethod.find((m) => m.method === 'wallet')!.available).toBe(false)
    // disabled gateway
    const dis = { ...P.paymentMethods, gateway: { ...P.paymentMethods.gateway, enabled: false } }
    expect(gw(priceQuote(pricingInput({ paymentMethods: dis }))).available).toBe(false)
    // gateway above max
    const mx = { ...P.paymentMethods, gateway: { ...P.paymentMethods.gateway, maxIrt: 1_000_000 } }
    expect(gw(priceQuote(pricingInput({ paymentMethods: mx }))).unavailableReasonFa).toContain('سقف')
    // bank below min
    expect(bank(priceQuote(pricingInput({ amountUsdCents: 2500 }))).available).toBe(false)
    // usdt below min
    const um = { ...P.paymentMethods, usdt: { ...P.paymentMethods.usdt, minMicroUsdt: 1_000_000_000 } }
    expect(usdt(priceQuote(pricingInput({ paymentMethods: um }))).available).toBe(false)
  })

  it('product/provider problems make every method unavailable', () => {
    expect(priceQuote(pricingInput({ product: product('vcard-topup', { active: false }) })).perMethod.every((m) => !m.available)).toBe(true)
    const prov = { ...P.providers[0]!, enabled: false }
    expect(priceQuote(pricingInput({ provider: prov })).perMethod.every((m) => !m.available)).toBe(true)
    expect(priceQuote(pricingInput({ amountUsdCents: 1000 })).perMethod.every((m) => !m.available)).toBe(true) // < mpay min load $25
    expect(priceQuote(pricingInput({ amountUsdCents: 200_000 })).perMethod.every((m) => !m.available)).toBe(true) // > max top-up
  })

  it('unit economics: primary method, margin includes rounding, fee passes through', () => {
    const c = priceQuote(pricingInput())
    const e = c.economics.gateway!
    expect(e.costIrt).toBe(c.costIrt)
    expect(e.feeIrt).toBe(16_000)
    expect(e.marginIrt).toBe(c.marginIrt + (gw(c).lines.find((l) => l.code === 'rounding')?.amountIrt ?? 0))
    expect(e.netRevenueIrt).toBe(gw(c).totalIrt! - 16_000)
    expect(c.unitEconomics).toEqual(c.economics.gateway!.unit) // first available = gateway
    expect(c.unitEconomics.grossMarginPct).toBeGreaterThan(0)
    // total identity: total = cost + buffers + margin + rush + vat + fee
    expect(gw(c).totalIrt!).toBe(e.costIrt + e.bufferIrt + e.marginIrt + e.rushIrt + e.vatIrt + e.feeIrt - e.discountIrt + 0)
  })

  it('is pure: same input → deep-equal output, input not mutated', () => {
    const input = pricingInput({ competitorRefIrt: 30_000_000, rushTierId: 'fast', customerTier: 'verified' })
    const snap = structuredClone(input)
    const a = priceQuote(input)
    const b = priceQuote(input)
    expect(a).toEqual(b)
    expect(input).toEqual(snap)
  })

  it('explainQuote gives Persian and English bullets covering the main components', () => {
    const c = priceQuote(pricingInput({ rushTierId: 'fast', competitorRefIrt: 25_000_000, tax: { vatApplies: true, vatPct: 0.1 } }))
    const fa = explainQuote(c)
    expect(fa.length).toBeGreaterThanOrEqual(8)
    expect(fa.join('\n')).toContain('هزینه‌ی جایگزینی')
    expect(fa.join('\n')).toContain('حاشیه‌ی سود')
    const en = explainQuote(c, 'en')
    expect(en.join('\n')).toContain('Replacement cost')
    expect(en.join('\n')).toContain('Competitor ref')
  })
})

describe('solvePriceForTargetMargin', () => {
  it('basis=cost reproduces margin = ceil(target × C) and is monotone in the target', () => {
    const input = pricingInput({ methods: ['card_to_card'], amountUsdCents: 2500 })
    let prev = 0
    for (const t of [0, 0.02, 0.05, 0.1, 0.2, 0.4]) {
      const r = solvePriceForTargetMargin(input, { targetMarginPct: t })
      expect(r.marginIrt).toBe(Math.ceil(r.computation.costIrt * t))
      expect(r.totalIrt!).toBeGreaterThanOrEqual(prev)
      prev = r.totalIrt!
      expect(r.achievedMarginPctOfCost).toBeGreaterThanOrEqual(t)
    }
  })

  it('basis=revenue returns the requested net margin on price before rush (±rounding)', () => {
    const input = pricingInput({ methods: ['bank_transfer'] })
    const r = solvePriceForTargetMargin(input, { targetMarginPct: 0.1, basis: 'revenue' })
    expect(r.achievedMarginPctOfRevenue).toBeGreaterThanOrEqual(0.1 - 1e-9)
    expect(r.achievedMarginPctOfRevenue).toBeLessThan(0.1 + 0.001)
  })

  it('round trip: price from the solver equals the engine price when the policy margin equals the target', () => {
    const base = pricingInput({ methods: ['bank_transfer'] })
    const r = solvePriceForTargetMargin(base, { targetMarginPct: 0.1 })
    const direct = priceQuote(base)
    expect(r.totalIrt).toBe(bank(direct).totalIrt)
  })

  it('works for the usdt method and rejects invalid targets', () => {
    const r = solvePriceForTargetMargin(pricingInput(), { targetMarginPct: 0.05, method: 'usdt' })
    expect(r.totalMicroUsdt).toBeGreaterThan(0)
    expect(() => solvePriceForTargetMargin(pricingInput(), { targetMarginPct: -0.1 })).toThrowError(AppError)
    expect(() => solvePriceForTargetMargin(pricingInput(), { targetMarginPct: 1, basis: 'revenue' })).toThrowError(AppError)
  })
})

// ───────────────────────────────── worked example vs scripts/pricing_model.py ─────────────────────────────────
describe('worked example — $100 top-up at 257,000 Toman/USDT vs scripts/pricing_model.py', () => {
  /** Re-implementation of scripts/pricing_model.py `price_order` for “Top-up $100, existing card, normal”. */
  function pythonModel(): { cost: number; price: number } {
    const USDT = 257_000
    const providerUsd = 100 * (1 + 0.03)
    const gross = providerUsd + 1.0
    const usdtCost = gross * USDT * (1 + 0.0035 + 0.004)
    const cost = usdtCost + usdtCost * 0.005 + usdtCost * 0.02 + 40_000
    return { cost, price: cost * 1.1 }
  }

  it('python first-pass reference value', () => {
    const py = pythonModel()
    expect(Math.round(py.cost)).toBe(27_641_672)
    expect(Math.round(py.price)).toBe(30_405_839)
  })

  it('default policy lands within ~1 % of the first-pass model (documented policy deltas)', () => {
    const py = pythonModel()
    const c = priceQuote(pricingInput())
    const ours = gw(c).totalIrt!
    const delta = ours / py.price - 1
    // Deltas vs python (all intended):
    //  + vol buffer 3.69 % (python has none, only a 2 % blended risk buffer)         ≈ +984k
    //  + decline buffer $0.25 (python none)                                           ≈ +66k
    //  − risk buffer 1 % instead of 2 %                                               ≈ −267k
    //  − spread: python adds 0.4 % extra spread on top of fees, we use the executable ask + real taker fee (0.25 %)  ≈ −400k
    //  − network fee 0.3 USDT allocation instead of 1 USDT                            ≈ −180k
    //  − operator cost 40k (python) vs min-margin floor 150k (does not bind at $100) ≈ −40k
    //  − collection fee: capped gateway fee 16k vs 0.5 % of base ≈ 134k              ≈ −118k
    expect(Math.abs(delta)).toBeLessThan(0.012)
  })

  it('mimicking the python assumptions reproduces its price within 0.5 %', () => {
    const py = pythonModel()
    const pol: PricingPolicy = {
      ...P.pricing,
      riskBufferPct: 0.02,
      declineBufferUsdCents: 0,
      networkFeeAllocMicroUsdt: 1_000_000,
      minMarginIrt: 0,
      volatility: { ...P.pricing.volatility, minBufferPct: 0, maxBufferPct: 0, driftFloorPctPerDay: 0 },
    }
    const pm = { ...P.paymentMethods, gateway: { ...P.paymentMethods.gateway, feePct: 0.005, feeCapIrt: 0, feeFixedIrt: 0 } }
    const c = priceQuote(pricingInput({ policy: pol, paymentMethods: pm, exchangeTakerBps: 75 }))
    const ours = gw(c).totalIrt!
    // remaining structural difference: python applies the margin on (cost + collection + risk + operator), we apply it on the USDT cost only,
    // and we gross-up the gateway fee on the final price instead of charging 0.5 % of cost.
    expect(Math.abs(ours / py.price - 1)).toBeLessThan(0.005)
  })
})
