import { describe, expect, it } from 'vitest'
import { createRng } from '@hiclaude/contracts'
import { CustomerPlanner } from './plan'
import { loadSegmentsConfig } from './segments'
import { T0, makeSignals } from './testing'
import { newCustomerState } from './retention'
import { FRAUD_KINDS } from './types'

const cfg = loadSegmentsConfig({ useResearch: false })
const arrival = (segmentId: string) => ({ at: T0, segmentId, source: 'organic', channel: 'web' as const })

describe('CustomerPlanner', () => {
  it('buy rate at parity ≈ segment baseConversion', () => {
    const planner = new CustomerPlanner(cfg, createRng(1))
    const sig = makeSignals()
    let buys = 0
    const N = 8000
    for (let i = 0; i < N; i++) if (planner.plan(arrival('student'), sig).decision.outcome === 'buy') buys++
    expect(buys / N).toBeGreaterThan(0.04)
    expect(buys / N).toBeLessThan(0.065)
  })
  it('a new buyer registers, quotes, orders and pays; steps start with a visit', () => {
    const planner = new CustomerPlanner(cfg, createRng(2))
    const sig = makeSignals()
    let found = 0
    for (let i = 0; i < 2000 && found < 20; i++) {
      const p = planner.plan(arrival('gamer'), sig)
      if (p.decision.outcome !== 'buy' || p.mistake === 'abandon') continue
      found++
      const types = p.steps.map((s) => s.type)
      expect(types[0]).toBe('visit')
      for (const t of ['register', 'quote', 'create_order', 'pay', 'wait_delivery']) expect(types).toContain(t)
      expect(types.indexOf('register')).toBeLessThan(types.indexOf('quote'))
      expect(types.indexOf('create_order')).toBeLessThan(types.indexOf('pay'))
      expect(p.method).not.toBeNull()
      expect(p.basket).not.toBeNull()
      if (p.method === 'card_to_card') expect(types).toContain('submit_receipt')
      expect(p.steps.every((s) => s.afterMs >= 0)).toBe(true)
    }
    expect(found).toBe(20)
  })
  it('abandoners stop after create_order', () => {
    const planner = new CustomerPlanner(cfg, createRng(3))
    const sig = makeSignals()
    let seen = 0
    for (let i = 0; i < 6000 && seen < 5; i++) {
      const p = planner.plan(arrival('student'), sig)
      if (p.decision.outcome === 'buy' && p.mistake === 'abandon') {
        seen++
        expect(p.steps[p.steps.length - 1]!.type).toBe('create_order')
      }
    }
    expect(seen).toBe(5)
  })
  it('payment mistakes carry the parameters the executor needs', () => {
    const planner = new CustomerPlanner(cfg, createRng(4))
    const sig = makeSignals()
    const seen = new Set<string>()
    for (let i = 0; i < 30000; i++) {
      const p = planner.plan(arrival('freelance_dev'), sig)
      if (p.decision.outcome !== 'buy' || p.mistake === 'none' || p.mistake === 'abandon') continue
      const pay = p.steps.find((s) => s.type === 'pay')!
      seen.add(p.mistake)
      if (p.mistake === 'late') expect(pay.params!.lateWindowMultiple).toBeGreaterThan(1)
      if (p.mistake === 'wrong_amount') expect(Math.abs(pay.params!.amountDeltaPct as number)).toBeGreaterThan(0)
      if (p.mistake === 'underpay') expect(pay.params!.underpayPct).toBeGreaterThan(0)
      if (p.mistake === 'wrong_network') expect(pay.params!.wrongNetwork).toBe(true)
    }
    expect(seen.size).toBeGreaterThanOrEqual(4)
  })
  it('killed quotes (halt/kill switch) mean nobody buys from us', () => {
    const planner = new CustomerPlanner(cfg, createRng(5))
    const sig = makeSignals({ killed: true })
    for (let i = 0; i < 1500; i++) expect(planner.plan(arrival('gamer'), sig).decision.outcome).not.toBe('buy')
  })
  it('gateway blackout: no buyer plans a gateway payment', () => {
    const planner = new CustomerPlanner(cfg, createRng(6))
    const sig = makeSignals({ gatewayDown: true })
    let buys = 0
    for (let i = 0; i < 5000; i++) {
      const p = planner.plan(arrival('student'), sig)
      if (p.decision.outcome === 'buy' && !p.fraud) {
        buys++
        expect(p.method).not.toBe('gateway')
      }
    }
    expect(buys).toBeGreaterThan(100)
  })
  it('returning customers log in instead of registering and may use the wallet', () => {
    const planner = new CustomerPlanner(cfg, createRng(7))
    const sig = makeSignals()
    const cust = newCustomerState(cfg, 'cust_1', 'student', 0)
    cust.orders = 3
    cust.satisfaction = 0.9
    let n = 0
    const methods = new Set<string>()
    for (let i = 0; i < 3000; i++) {
      const p = planner.planReturning(cust, T0, sig, 'web', { walletCoversOrder: true })
      expect(p.customer.kind).toBe('returning')
      expect(p.customer.customerKey).toBe('cust_1')
      if (p.decision.outcome === 'buy') {
        n++
        const t = p.steps.map((s) => s.type)
        expect(t).toContain('login')
        expect(t).not.toContain('register')
        methods.add(p.method!)
      }
    }
    expect(n).toBeGreaterThan(200)
    expect(methods.has('wallet')).toBe(true)
  })
  it('loyal customers convert better than strangers', () => {
    const planner = new CustomerPlanner(cfg, createRng(8))
    const sig = makeSignals()
    const cust = newCustomerState(cfg, 'c', 'gamer', 0)
    cust.orders = 4
    cust.satisfaction = 0.9
    let a = 0
    let b = 0
    for (let i = 0; i < 4000; i++) {
      if (planner.plan(arrival('gamer'), sig).decision.outcome === 'buy') a++
      if (planner.planReturning(cust, T0, sig, 'web').decision.outcome === 'buy') b++
    }
    expect(b).toBeGreaterThan(a * 1.5)
  })
  it('referred visitors convert better', () => {
    const planner = new CustomerPlanner(cfg, createRng(9))
    const sig = makeSignals()
    let a = 0
    let b = 0
    for (let i = 0; i < 4000; i++) {
      if (planner.plan(arrival('student'), sig).decision.outcome === 'buy') a++
      if (planner.plan({ ...arrival('student'), source: 'referral' }, sig, { referred: true }).decision.outcome === 'buy') b++
    }
    expect(b).toBeGreaterThan(a * 1.5)
  })
  it('non-buyers sometimes sign up as leads (funnel) but never create orders', () => {
    const planner = new CustomerPlanner(cfg, createRng(10))
    const sig = makeSignals({ ourIndex: 1.3 })
    let leads = 0
    for (let i = 0; i < 3000; i++) {
      const p = planner.plan(arrival('student'), sig)
      if (p.decision.outcome === 'buy') continue
      expect(p.steps.map((s) => s.type)).not.toContain('create_order')
      if (p.leadSignup) leads++
    }
    expect(leads / 3000).toBeGreaterThan(0.08)
    expect(leads / 3000).toBeLessThan(0.16)
  })
  it('fraud plans cover every kind, carry only pattern flags and burst sizes', () => {
    const planner = new CustomerPlanner(cfg, createRng(11))
    const sig = makeSignals()
    const kinds = new Set<string>()
    for (let i = 0; i < 4000; i++) {
      const p = planner.plan(arrival('fraudster'), sig)
      if (!p.fraud) continue
      kinds.add(p.fraud.kind)
      if (p.fraud.kind === 'fake_receipt') {
        expect(p.fraud.method).toBe('card_to_card')
        expect(p.steps.find((s) => s.type === 'submit_receipt')?.params?.fake).toBe(true)
      }
      if (p.fraud.kind === 'velocity_abuse') expect(p.fraud.burstCount).toBeGreaterThanOrEqual(3)
      if (p.fraud.kind === 'account_takeover') expect(p.steps.some((s) => s.type === 'login' && s.params?.existingCustomer)).toBe(true)
    }
    expect([...kinds].sort()).toEqual([...FRAUD_KINDS].sort())
  })
  it('stolen-card proxy plans dispute after delivery in most cases', () => {
    const planner = new CustomerPlanner(cfg, createRng(12))
    let n = 0
    let d = 0
    for (let i = 0; i < 4000; i++) {
      const p = planner.plan(arrival('fraudster'), makeSignals())
      if (p.fraud?.kind === 'stolen_card_dispute') {
        n++
        if (p.fraud.disputeAfterDelivery) d++
      }
    }
    expect(d / n).toBeGreaterThan(0.75)
  })
  it('plans are deterministic per seed and carry unique ids', () => {
    const run = (seed: number) => {
      const planner = new CustomerPlanner(cfg, createRng(seed))
      return Array.from({ length: 50 }, () => JSON.stringify(planner.plan(arrival('designer'), makeSignals())))
    }
    expect(run(1)).toEqual(run(1))
    expect(run(1)).not.toEqual(run(2))
    expect(new Set(run(1).map((s) => JSON.parse(s).planId)).size).toBe(50)
  })
  it('behaviour block is complete and bounded', () => {
    const planner = new CustomerPlanner(cfg, createRng(13))
    const p = planner.plan(arrival('student'), makeSignals())
    expect(p.behaviour.patienceFactor).toBeGreaterThan(0.5)
    expect(p.behaviour.priceTolerancePct).toBeGreaterThanOrEqual(0.03)
    for (const v of Object.values(p.behaviour.draws)) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
  it('unknown segment throws', () => {
    expect(() => new CustomerPlanner(cfg, createRng(1)).plan(arrival('nope'), makeSignals())).toThrow()
  })
  it('families missing from the catalog are never planned', () => {
    const planner = new CustomerPlanner(cfg, createRng(14))
    const sig = { ...makeSignals(), familyAvailable: (f: string) => f !== 'fx_payment' }
    for (let i = 0; i < 1500; i++) {
      const p = planner.plan(arrival('importer_trader'), sig)
      if (p.basket) expect(p.basket.family).not.toBe('fx_payment')
    }
  })
})
