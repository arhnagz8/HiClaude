import { describe, expect, it } from 'vitest'
import { MS, defaultPlatformParams, fromIrst } from '@hiclaude/contracts'
import { makeEnv } from '../core/testkit'
import { BankSim, defaultBankConfig } from '../bank/bank'
import { GatewaySim, gatewayConfigFromParams } from './gateway'

function setup(patch: (c: ReturnType<typeof gatewayConfigFromParams>) => void = () => undefined, start = fromIrst(2026, 10, 3, 10)) {
  const env = makeEnv({ start, seed: 2 })
  const bank = new BankSim(env, env.rng.fork('bank'), defaultBankConfig())
  const cfg = gatewayConfigFromParams(defaultPlatformParams())
  cfg.outageProbPerMonth = 0
  cfg.verifyTimeoutProb = 0
  cfg.createFailProb = 0
  patch(cfg)
  const gw = new GatewaySim(env, env.rng.fork('gw'), bank, env.clock.now(), cfg)
  return { env, bank, gw }
}
const create = async (gw: GatewaySim, amount = 1_000_000, orderId = 'o1') => {
  const r = await gw.create({ orderId, amountIrt: amount, description: 'd', callbackUrl: 'https://x/cb' })
  if (!r.ok) throw new Error(r.error.message)
  return r.value
}

describe('GatewaySim pay flow', () => {
  it('create returns authority + pay url; verify is pending until the customer pays', async () => {
    const { gw } = setup()
    const c = await create(gw)
    expect(c.authority).toMatch(/^A\d{35}$/)
    expect(c.payUrl).toContain(c.authority)
    const v = await gw.verify({ authority: c.authority, amountIrt: 1_000_000 })
    expect(v.ok && v.value.status).toBe('pending')
  })
  it('successful payment verifies as paid with ref, masked card and fee; verify is idempotent', async () => {
    const { gw } = setup()
    const c = await create(gw, 2_000_000)
    expect(gw.simulateCustomerPayment(c.authority, 'success', { cardMasked: '6037****9999' }).ok).toBe(true)
    const v = await gw.verify({ authority: c.authority, amountIrt: 2_000_000 })
    expect(v.ok && v.value.status).toBe('paid')
    expect(v.ok && v.value.cardPanMasked).toBe('6037****9999')
    expect(v.ok && v.value.feeIrt).toBe(Math.min(16_000, Math.ceil(2_000_000 * 0.005)) + 500)
    const v2 = await gw.verify({ authority: c.authority, amountIrt: 2_000_000 })
    expect(v2).toEqual(v)
  })
  it('failed / abandoned / expired pages verify as failed', async () => {
    const { gw, env } = setup()
    const a = await create(gw, 1_000_000, 'a')
    const b = await create(gw, 1_000_000, 'b')
    const c = await create(gw, 1_000_000, 'c')
    gw.simulateCustomerPayment(a.authority, 'fail')
    gw.simulateCustomerPayment(b.authority, 'abandon')
    env.sim.runUntil(env.clock.now() + 25 * MS.minute)
    for (const x of [a, b, c]) {
      const v = await gw.verify({ authority: x.authority, amountIrt: 1_000_000 })
      expect(v.ok && v.value.status).toBe('failed')
    }
    expect(gw.getPayPage(c.authority)?.state).toBe('expired')
  })
  it('paying an expired page is rejected', async () => {
    const { gw, env } = setup()
    const c = await create(gw)
    env.sim.runUntil(env.clock.now() + 21 * MS.minute)
    const r = gw.simulateCustomerPayment(c.authority, 'success')
    expect(!r.ok && r.error.code).toBe('REJECTED')
  })
  it('amount mismatch and unknown authority', async () => {
    const { gw } = setup()
    const c = await create(gw)
    const m = await gw.verify({ authority: c.authority, amountIrt: 999_999 })
    expect(!m.ok && m.error.code).toBe('VALIDATION')
    const u = await gw.verify({ authority: 'nope', amountIrt: 1 })
    expect(!u.ok && u.error.code).toBe('NOT_FOUND')
    expect(gw.simulateCustomerPayment('nope', 'success').ok).toBe(false)
  })
  it('create validates amount limits', async () => {
    const { gw } = setup()
    expect((await gw.create({ orderId: 'x', amountIrt: 10, description: '', callbackUrl: '' })).ok).toBe(false)
    expect((await gw.create({ orderId: 'x', amountIrt: 999_999_999_999, description: '', callbackUrl: '' })).ok).toBe(false)
  })
  it('delayed customer payment applies later', async () => {
    const { gw, env } = setup()
    const c = await create(gw)
    gw.simulateCustomerPayment(c.authority, 'success', { delayMs: 5 * MS.minute })
    expect(gw.getPayPage(c.authority)?.state).toBe('created')
    env.sim.runUntil(env.clock.now() + 6 * MS.minute)
    expect(gw.getPayPage(c.authority)?.state).toBe('paid')
  })
  it('verify timeouts occur at the configured rate and are retryable', async () => {
    const { gw } = setup((c) => (c.verifyTimeoutProb = 0.5))
    const c = await create(gw)
    gw.simulateCustomerPayment(c.authority, 'success')
    let timeouts = 0
    for (let i = 0; i < 100; i++) {
      const v = await gw.verify({ authority: c.authority, amountIrt: 1_000_000 })
      if (!v.ok) {
        expect(v.error.code).toBe('TIMEOUT')
        expect(v.error.retryable).toBe(true)
        timeouts++
      }
    }
    expect(timeouts).toBeGreaterThan(25)
    expect(timeouts).toBeLessThan(75)
  })
  it('a paid payment that is never verified is reversed after the window', async () => {
    const { gw, env } = setup()
    const c = await create(gw)
    gw.simulateCustomerPayment(c.authority, 'success')
    env.sim.runUntil(env.clock.now() + 2 * MS.hour)
    const v = await gw.verify({ authority: c.authority, amountIrt: 1_000_000 })
    expect(v.ok && v.value.status).toBe('failed')
    expect(gw.getPayPage(c.authority)?.state).toBe('reversed')
  })
})

describe('GatewaySim settlement and downtime', () => {
  it('settles net of fees to the bank on the next business day at the settlement hour', async () => {
    const { gw, env, bank } = setup(undefined, fromIrst(2026, 10, 3, 10)) // Saturday
    const c = await create(gw, 10_000_000)
    gw.simulateCustomerPayment(c.authority, 'success')
    await gw.verify({ authority: c.authority, amountIrt: 10_000_000 })
    const before = bank.balanceNow()
    env.sim.runUntil(fromIrst(2026, 10, 4, 8))
    expect(bank.balanceNow()).toBe(before)
    env.sim.runUntil(fromIrst(2026, 10, 4, 9, 1))
    const fee = 16_000 > Math.ceil(10_000_000 * 0.005) ? Math.ceil(10_000_000 * 0.005) + 500 : 16_000 + 500
    expect(bank.balanceNow()).toBe(before + 10_000_000 - fee)
    const a = gw.audit()
    expect(a.ok).toBe(true)
    expect(a.pendingSettlement).toBe(0)
    const st = await bank.listCredits({ since: 0 })
    expect(st.ok && st.value[0]?.channel).toBe('gateway_settlement')
  })
  it('Thursday payments settle after the weekend (Saturday)', async () => {
    const { gw, env, bank } = setup(undefined, fromIrst(2026, 10, 1, 10))
    const c = await create(gw, 5_000_000)
    gw.simulateCustomerPayment(c.authority, 'success')
    await gw.verify({ authority: c.authority, amountIrt: 5_000_000 })
    env.sim.runUntil(fromIrst(2026, 10, 3, 8))
    expect(bank.balanceNow()).toBe(0)
    env.sim.runUntil(fromIrst(2026, 10, 3, 9, 1))
    expect(bank.balanceNow()).toBeGreaterThan(0)
  })
  it('multiple payments in a batch produce one bank credit', async () => {
    const { gw, env, bank } = setup(undefined, fromIrst(2026, 10, 3, 10))
    for (let i = 0; i < 4; i++) {
      const c = await create(gw, 1_000_000, `o${i}`)
      gw.simulateCustomerPayment(c.authority, 'success')
      await gw.verify({ authority: c.authority, amountIrt: 1_000_000 })
      env.sim.runUntil(env.clock.now() + 10 * MS.minute)
    }
    env.sim.runUntil(fromIrst(2026, 10, 5))
    expect(bank.statement().filter((c) => c.channel === 'gateway_settlement').length).toBe(1)
  })
  it('blackout makes create/verify unavailable and postpones settlements', async () => {
    const { gw, env, bank } = setup(undefined, fromIrst(2026, 10, 3, 10))
    const c = await create(gw, 5_000_000)
    gw.simulateCustomerPayment(c.authority, 'success')
    await gw.verify({ authority: c.authority, amountIrt: 5_000_000 })
    const h = gw.applyEvent('gateway_blackout', { days: 10 })
    const r = await gw.create({ orderId: 'z', amountIrt: 1_000_000, description: '', callbackUrl: '' })
    expect(!r.ok && r.error.code).toBe('UNAVAILABLE')
    const v = await gw.verify({ authority: c.authority, amountIrt: 5_000_000 })
    expect(!v.ok && v.error.code).toBe('UNAVAILABLE')
    env.sim.runUntil(fromIrst(2026, 10, 12))
    expect(bank.balanceNow()).toBe(0) // settlement postponed
    env.sim.runUntil(fromIrst(2026, 10, 15))
    expect(bank.balanceNow()).toBeGreaterThan(0)
    expect(gw.audit().ok).toBe(true)
    h?.revert()
  })
  it('blackout revert restores service', async () => {
    const { gw } = setup()
    const h = gw.blackout(3)
    expect(gw.isDown()).toBe(true)
    h.revert()
    expect(gw.isDown()).toBe(false)
  })
  it('random outages exist when probability is 1', async () => {
    const { gw, env } = setup((c) => (c.outageProbPerMonth = 1))
    let down = 0
    for (let h = 0; h < 12 * 24 * 30; h++) {
      env.sim.runUntil(env.clock.now() + 5 * MS.minute)
      if (gw.isDown()) down++
    }
    expect(down).toBeGreaterThan(0)
  })
  it('fee change event applies and reverts; other-gateway events ignored', async () => {
    const { gw } = setup()
    expect(gw.applyEvent('gateway_blackout', { gateway: 'other', days: 1 })).toBeNull()
    const h = gw.applyEvent('gateway_fee_change', { feePct: 0.02, feeCapIrt: 1_000_000 })
    expect(gw.feeFor(1_000_000)).toBe(20_000 + 500)
    h?.revert()
    expect(gw.feeFor(1_000_000)).toBe(5_000 + 500)
    expect(gw.applyEvent('nothing', {})).toBeNull()
  })
  it('create failure probability produces retryable UNAVAILABLE', async () => {
    const { gw } = setup((c) => (c.createFailProb = 1))
    const r = await gw.create({ orderId: 'x', amountIrt: 1_000_000, description: '', callbackUrl: '' })
    expect(!r.ok && r.error.retryable).toBe(true)
  })
})
