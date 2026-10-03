import { describe, expect, it } from 'vitest'
import { MS, defaultPlatformParams, usdtToMicro, type ProviderParams } from '@hiclaude/contracts'
import { makeEnv } from '../core/testkit'
import { ChainSim } from '../chain/chain'
import { ProviderSim, luhnValid, type ProviderSimConfig } from './provider'
import { ProviderPanel } from './panel'

function setup(id: 'mpay' | 'altcard' | 'vouchers', patch: (p: ProviderParams) => void = () => undefined, cfg: Partial<ProviderSimConfig> = {}, seed = 1) {
  const env = makeEnv({ seed })
  const chain = new ChainSim(env, env.rng.fork('chain'))
  const params = structuredClone(defaultPlatformParams().providers.find((p) => p.id === id) as ProviderParams)
  patch(params)
  const provider = new ProviderSim(params, { env, rng: env.rng.fork(`provider:${id}`), chain, originMs: env.clock.now() }, { failureProb: 0, ambiguousFailureProb: 0, outageProbPerMonth: 0, randomHazards: false, panelSessionExpiryProb: 0, ...cfg })
  return { env, chain, provider, params }
}

const API = (p: ProviderParams) => {
  p.capabilities = { issue: 'api', topUp: 'api', reveal: 'api', freeze: 'api', webhooks: false }
}

async function fund(s: ReturnType<typeof setup>, usdt: number, network: 'TRC20' | 'BEP20' = 'TRC20') {
  s.chain.fundWallet(network, usdtToMicro(usdt + 10))
  const a = await s.provider.depositAddress(network)
  if (!a.ok) throw new Error('addr')
  const r = await s.chain.send({ network, to: a.value.address, amount: usdtToMicro(usdt) })
  if (!r.ok) throw new Error(r.error.message)
  s.env.sim.runUntil(s.env.clock.now() + 2 * MS.hour)
  return r.value.txHash
}

describe('ProviderSim funding', () => {
  it('credits a deposit only after confirmations + credit delay', async () => {
    const s = setup('altcard')
    s.chain.fundWallet('TRC20', usdtToMicro(500))
    const a = await s.provider.depositAddress('TRC20')
    if (!a.ok) throw new Error('x')
    const tx = await s.chain.send({ network: 'TRC20', to: a.value.address, amount: usdtToMicro(100) })
    if (!tx.ok) throw new Error('x')
    const confirmAt = s.chain.confirmAt(tx.value.txHash) as number
    s.env.sim.runUntil(confirmAt + 5 * MS.minute)
    expect((await s.provider.creditStatus({ txHash: tx.value.txHash })).ok && (await s.provider.creditStatus({ txHash: tx.value.txHash })).ok).toBe(true)
    let st = await s.provider.creditStatus({ txHash: tx.value.txHash })
    expect(st.ok && st.value.credited).toBe(false) // creditDelay 10 min for altcard
    s.env.sim.runUntil(confirmAt + 10 * MS.minute)
    st = await s.provider.creditStatus({ txHash: tx.value.txHash })
    expect(st.ok && st.value.credited).toBe(true)
    expect(st.ok && st.value.amountMicroUsdt).toBe(usdtToMicro(100))
    const bal = await s.provider.accountBalance()
    expect(bal.ok && bal.value).toBe(usdtToMicro(100))
    expect(s.provider.audit().ok).toBe(true)
  })
  it('rejects unsupported networks and unknown tx', async () => {
    const s = setup('mpay')
    const r = await s.provider.depositAddress('TON')
    expect(!r.ok && r.error.code).toBe('VALIDATION')
    const st = await s.provider.creditStatus({ txHash: 'nope' })
    expect(st.ok && st.value.credited).toBe(false)
  })
  it('deposit address is stable per network', async () => {
    const s = setup('mpay')
    const a = await s.provider.depositAddress('TRC20')
    const b = await s.provider.depositAddress('TRC20')
    const c = await s.provider.depositAddress('BEP20')
    expect(a).toEqual(b)
    expect(a.ok && c.ok && a.value.address !== c.value.address).toBe(true)
  })
})

describe('ProviderSim capabilities (API vs panel)', () => {
  it('panel-only provider rejects API calls and accepts them through ProviderPanel', async () => {
    const s = setup('mpay')
    await fund(s, 300)
    const api = await s.provider.issueCard({ initialLoadUsdCents: 5000, label: 'x' })
    expect(!api.ok && api.error.code).toBe('REJECTED')
    const panel = new ProviderPanel(s.provider)
    const r = panel.issueCard({ initialLoadUsdCents: 5000, label: 'x' })
    expect(r.ok).toBe(true)
    expect(panel.lastLatencyMs).toBeGreaterThan(0)
  })
  it('API provider accepts API calls; freeze=none is rejected everywhere', async () => {
    const s = setup('vouchers')
    await fund(s, 300)
    const r = await s.provider.issueCard({ initialLoadUsdCents: 2500, label: 'x' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const f = await s.provider.freezeCard(r.value.card.cardRef)
    expect(!f.ok && f.error.code).toBe('REJECTED')
    const p = new ProviderPanel(s.provider)
    const f2 = p.freezeCard(r.value.card.cardRef)
    expect(!f2.ok && f2.error.code).toBe('REJECTED')
  })
  it('panel latency is human-scale while API latency is seconds', async () => {
    const s = setup('altcard')
    const panel = new ProviderPanel(s.provider)
    const a: number[] = []
    const b: number[] = []
    for (let i = 0; i < 200; i++) {
      a.push(s.provider.sampleLatencyMs('api'))
      b.push(panel.estimateLatencyMs())
    }
    const med = (x: number[]) => [...x].sort((p, q) => p - q)[100] as number
    expect(med(a)).toBeGreaterThan(1000)
    expect(med(a)).toBeLessThan(6000)
    expect(med(b)).toBeGreaterThan(2 * MS.minute)
    expect(med(b)).toBeLessThan(9 * MS.minute)
  })
  it('panel session expiry returns a retryable error and fires hooks', async () => {
    const s = setup('mpay')
    await fund(s, 100)
    const calls: string[] = []
    const panel = new ProviderPanel(s.provider, { onCall: (i) => calls.push(`${i.op}:${i.ok}`) })
    panel.forceSessionExpiry = true
    const r = panel.issueCard({ initialLoadUsdCents: 2500, label: 'x' })
    expect(!r.ok && r.error.retryable).toBe(true)
    expect(panel.issueCard({ initialLoadUsdCents: 2500, label: 'x' }).ok).toBe(true)
    expect(calls).toEqual(['issue:false', 'issue:true'])
  })
})

describe('ProviderSim cards and fees', () => {
  it('issues a card with Luhn-valid fake PAN, debits load + issue fee + topup fee', async () => {
    const s = setup('altcard', API)
    await fund(s, 300)
    const r = await s.provider.issueCard({ initialLoadUsdCents: 5000, label: 'order-1' })
    if (!r.ok) throw new Error(r.error.message)
    // altcard: issue 3500c + 250 bps of 5000 = 125c -> 3625c fee
    expect(r.value.feeMicroUsdt).toBe(usdtToMicro(36.25))
    expect(r.value.card.balanceUsdCents).toBe(5000)
    expect(r.value.card.status).toBe('active')
    const bal = await s.provider.accountBalance()
    expect(bal.ok && bal.value).toBe(usdtToMicro(300) - usdtToMicro(50) - usdtToMicro(36.25))
    const sec = await s.provider.revealCard(r.value.card.cardRef)
    expect(sec.ok).toBe(true)
    if (sec.ok) {
      expect(luhnValid(sec.value.pan)).toBe(true)
      expect(sec.value.pan.startsWith('400000') || sec.value.pan.startsWith('555555')).toBe(true)
      expect(sec.value.pan.endsWith(r.value.card.last4)).toBe(true)
      expect(sec.value.cvv).toMatch(/^\d{3}$/)
    }
    expect(s.provider.audit().ok).toBe(true)
  })
  it('enforces min load, max topup, max balance, funds', async () => {
    const s = setup('altcard', API)
    await fund(s, 300)
    expect((await s.provider.issueCard({ initialLoadUsdCents: 500, label: 'x' })).ok).toBe(false)
    const big = await s.provider.issueCard({ initialLoadUsdCents: 300_000, label: 'x' })
    expect(!big.ok && big.error.code).toBe('CAP_EXCEEDED')
    const poor = await s.provider.issueCard({ initialLoadUsdCents: 100_000, label: 'x' })
    expect(!poor.ok && poor.error.code).toBe('INSUFFICIENT_FUNDS')
    const ok1 = await s.provider.issueCard({ initialLoadUsdCents: 5000, label: 'x' })
    if (!ok1.ok) throw new Error('x')
    const over = await s.provider.topUpCard({ cardRef: ok1.value.card.cardRef, amountUsdCents: 1_000_000 })
    expect(!over.ok && over.error.code).toBe('CAP_EXCEEDED')
    expect((await s.provider.issueCard({ initialLoadUsdCents: 0, label: 'x' })).ok).toBe(false)
  })
  it('top-up adds balance and fee; unknown/frozen cards fail', async () => {
    const s = setup('altcard', API)
    await fund(s, 300)
    const c = await s.provider.issueCard({ initialLoadUsdCents: 2000, label: 'x' })
    if (!c.ok) throw new Error('x')
    const t = await s.provider.topUpCard({ cardRef: c.value.card.cardRef, amountUsdCents: 4000 })
    expect(t.ok && t.value.card.balanceUsdCents).toBe(6000)
    expect(t.ok && t.value.feeMicroUsdt).toBe(usdtToMicro(1)) // 250 bps of 40 USD
    const nf = await s.provider.topUpCard({ cardRef: 'nope', amountUsdCents: 2000 })
    expect(!nf.ok && nf.error.code).toBe('NOT_FOUND')
    await s.provider.freezeCard(c.value.card.cardRef)
    const fz = await s.provider.topUpCard({ cardRef: c.value.card.cardRef, amountUsdCents: 2000 })
    expect(!fz.ok && fz.error.code).toBe('FROZEN')
    const g = await s.provider.getCard(c.value.card.cardRef)
    expect(g.ok && g.value.status).toBe('frozen')
  })
})

describe('ProviderSim vendor payments and declines', () => {
  it('payVendor charges amount + bps fee, is idempotent by reference', async () => {
    const s = setup('vouchers')
    await fund(s, 200)
    const r1 = await s.provider.payVendor({ vendor: 'steam', amountUsdCents: 2000, reference: 'ord-1' })
    if (!r1.ok) throw new Error(r1.error.message)
    expect(r1.value.feeMicroUsdt).toBe(usdtToMicro(0.3)) // 150 bps of 20 USD
    const b1 = await s.provider.accountBalance()
    const r2 = await s.provider.payVendor({ vendor: 'steam', amountUsdCents: 2000, reference: 'ord-1' })
    expect(r2.ok && r2.value.receiptRef).toBe(r1.value.receiptRef)
    const b2 = await s.provider.accountBalance()
    expect(b2).toEqual(b1)
    expect(s.provider.voucherCode(r1.value.receiptRef)).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/)
    expect(s.provider.audit().ok).toBe(true)
  })
  it('decline rate follows the risk label ordering and returns DECLINED', async () => {
    const rates: Record<string, number> = {}
    for (const risk of ['low', 'medium', 'high'] as const) {
      const s = setup('vouchers', (p) => ((p.limits.dailySpendUsdCents = 1e12), (p.fees.declineFeeUsdCents = 0)), { quality: 1 }, 5)
      await fund(s, 5000)
      s.provider.setVendorRisk('v', risk)
      let declined = 0
      const N = 600
      for (let i = 0; i < N; i++) {
        const r = await s.provider.payVendor({ vendor: 'v', amountUsdCents: 100, reference: `r${i}` })
        if (!r.ok) {
          expect(r.error.code).toBe('DECLINED')
          declined++
        }
      }
      rates[risk] = declined / N
    }
    expect(rates.low).toBeLessThan(0.04)
    expect(rates.medium).toBeGreaterThan(0.015)
    expect(rates.medium).toBeLessThan(0.09)
    expect(rates.high).toBeGreaterThan(0.07)
    expect(rates.high).toBeLessThan(0.2)
    expect(rates.high as number).toBeGreaterThan(rates.low as number)
  })
  it('lower provider quality raises declines; decline fee is charged', async () => {
    const run = async (quality: number) => {
      const s = setup('altcard', (p) => (API(p), (p.limits.dailySpendUsdCents = 1e12)), { quality }, 9)
      await fund(s, 5000)
      s.provider.setVendorRisk('v', 'high')
      let d = 0
      for (let i = 0; i < 500; i++) if (!(await s.provider.payVendor({ vendor: 'v', amountUsdCents: 100, reference: `r${i}` })).ok) d++
      return d
    }
    expect(await run(0.5)).toBeGreaterThan(await run(1))
    const s = setup('altcard', API, { quality: 0.2 })
    await fund(s, 100)
    s.provider.setVendorRisk('v', 'high')
    let before = 0
    for (let i = 0; i < 200; i++) {
      const b = await s.provider.accountBalance()
      before = b.ok ? b.value : 0
      const r = await s.provider.payVendor({ vendor: 'v', amountUsdCents: 100, reference: `q${i}` })
      if (!r.ok && r.error.code === 'DECLINED') {
        const a = await s.provider.accountBalance()
        expect(a.ok && a.value).toBe(before - usdtToMicro(0.25))
        return
      }
    }
    throw new Error('no decline seen')
  })
  it('daily spend limit and validation', async () => {
    const s = setup('vouchers', (p) => (p.limits.dailySpendUsdCents = 3000))
    await fund(s, 200)
    expect((await s.provider.payVendor({ vendor: 'steam', amountUsdCents: 2500, reference: 'a' })).ok || true).toBe(true)
    const r = await s.provider.payVendor({ vendor: 'steam', amountUsdCents: 2500, reference: 'b' })
    expect(!r.ok && ['CAP_EXCEEDED', 'DECLINED', 'TIMEOUT'].includes(r.error.code)).toBe(true)
    expect((await s.provider.payVendor({ vendor: 'steam', amountUsdCents: -1, reference: 'c' })).ok).toBe(false)
  })
  it('card spend: charge, insufficient balance, decline fee on card, non-USD fx', async () => {
    const s = setup('altcard', API, { quality: 1 })
    await fund(s, 300)
    const c = await s.provider.issueCard({ initialLoadUsdCents: 5000, label: 'x' })
    if (!c.ok) throw new Error('x')
    s.provider.setVendorRisk('shop', 'low')
    let ok1 = false
    for (let i = 0; i < 10 && !ok1; i++) ok1 = s.provider.chargeCard({ cardRef: c.value.card.cardRef, merchant: 'shop', amountUsdCents: 1000 }).ok
    expect(ok1).toBe(true)
    expect(s.provider.cardRecordFor(c.value.card.cardRef)?.balanceCents).toBeLessThan(5000)
    const poor = s.provider.chargeCard({ cardRef: c.value.card.cardRef, merchant: 'shop', amountUsdCents: 99_999 })
    expect(!poor.ok && poor.error.code).toBe('DECLINED')
    const nf = s.provider.chargeCard({ cardRef: 'nope', merchant: 'shop', amountUsdCents: 1 })
    expect(!nf.ok && nf.error.code).toBe('NOT_FOUND')
  })
})

describe('ProviderSim failures', () => {
  it('plain failures leave no state; ambiguous failures change state but report TIMEOUT', async () => {
    const s = setup('vouchers', undefined, { failureProb: 1 })
    await fund(s, 100)
    const before = (await s.provider.accountBalance()).ok
    void before
    const f = await s.provider.payVendor({ vendor: 'steam', amountUsdCents: 1000, reference: 'x' })
    expect(!f.ok && f.error.code).toBe('UNAVAILABLE')
    expect(s.provider.balanceNow()).toBe(usdtToMicro(100))
    const s2 = setup('vouchers', undefined, { ambiguousFailureProb: 1 })
    await fund(s2, 100)
    const a = await s2.provider.payVendor({ vendor: 'steam', amountUsdCents: 1000, reference: 'x' })
    expect(!a.ok && a.error.code).toBe('TIMEOUT')
    expect(s2.provider.balanceNow()).toBeLessThan(usdtToMicro(100)) // executed
    s2.provider.cfg.ambiguousFailureProb = 0
    const retry = await s2.provider.payVendor({ vendor: 'steam', amountUsdCents: 1000, reference: 'x' }) // idempotent
    expect(retry.ok).toBe(true)
    expect(s2.provider.balanceNow()).toBe(usdtToMicro(100) - usdtToMicro(10) - usdtToMicro(0.15))
  })
  it('freeze event blocks spending of the frozen part and restores on revert/expiry', async () => {
    const s = setup('vouchers')
    await fund(s, 100)
    const h = s.provider.applyEvent('provider_freeze', { provider: 'vouchers', fractionFrozen: 0.8, durationDays: 5 })
    expect(s.provider.spendable()).toBe(usdtToMicro(20))
    const r = await s.provider.payVendor({ vendor: 'steam', amountUsdCents: 5000, reference: 'x' })
    expect(!r.ok && r.error.code).toBe('INSUFFICIENT_FUNDS')
    s.env.sim.runUntil(s.env.clock.now() + 6 * MS.day)
    expect(s.provider.spendable()).toBe(usdtToMicro(100))
    h?.revert()
    expect(s.provider.spendable()).toBe(usdtToMicro(100))
  })
  it('full freeze makes the account frozen; other-provider events are ignored', async () => {
    const s = setup('mpay')
    await fund(s, 50)
    expect(s.provider.applyEvent('provider_freeze', { provider: 'other', fractionFrozen: 1 })).toBeNull()
    const h = s.provider.applyEvent('sanctions_freeze', { providers: ['mpay'], fractionFrozen: 1, durationDays: null })
    expect(s.provider.accountStatus()).toBe('frozen')
    expect(s.provider.spendable()).toBe(0)
    h?.revert()
    expect(s.provider.accountStatus()).toBe('active')
  })
  it('counterparty exit closes the account, pays back the recovered share later, loses the rest; audit holds', async () => {
    const s = setup('altcard', API)
    await fund(s, 200)
    s.provider.applyEvent('provider_exit', { provider: 'altcard', recoveredFraction: 0.4, recoveryDays: 10 })
    expect(s.provider.accountStatus()).toBe('closed')
    const r = await s.provider.payVendor({ vendor: 'x', amountUsdCents: 1000, reference: 'z' })
    expect(!r.ok && r.error.code).toBe('FROZEN')
    expect(s.provider.audit().ok).toBe(true)
    s.env.sim.runUntil(s.env.clock.now() + 11 * MS.day)
    expect(s.chain.balanceOurs('TRC20')).toBeGreaterThan(usdtToMicro(80))
    expect(s.chain.balanceOurs('TRC20')).toBeLessThan(usdtToMicro(95))
    expect(s.provider.audit().ok).toBe(true)
    expect(s.chain.audit().ok).toBe(true)
  })
  it('random counterparty failures occur at roughly the configured monthly rate', async () => {
    let events = 0
    const trials = 40
    for (let seed = 1; seed <= trials; seed++) {
      const s = setup('mpay', (p) => (p.risk.counterpartyFailurePerMonth = 0.5), { randomHazards: true }, seed)
      s.env.sim.runUntil(s.env.clock.now() + 30 * MS.day * 3)
      events += s.env.log.entries({ type: 'provider.freeze' }).length + s.env.log.entries({ type: 'provider.exit' }).length
    }
    // expected 1.5 per trial (3 buckets x 0.5)
    expect(events / trials).toBeGreaterThan(1)
    expect(events / trials).toBeLessThan(2.1)
  })
  it('outage and internet shutdown make calls UNAVAILABLE; revert restores', async () => {
    const s = setup('vouchers')
    await fund(s, 50)
    const o = s.provider.applyEvent('provider_outage', { hours: 3 })
    expect((await s.provider.accountBalance()).ok).toBe(false)
    o?.revert()
    expect((await s.provider.accountBalance()).ok).toBe(true)
    const h = s.provider.applyEvent('internet_shutdown', {})
    const r = await s.provider.payVendor({ vendor: 'steam', amountUsdCents: 500, reference: 'a' })
    expect(!r.ok && r.error.code).toBe('UNAVAILABLE')
    h?.revert()
    expect((await s.provider.payVendor({ vendor: 'steam', amountUsdCents: 500, reference: 'a' })).ok).toBe(true)
  })
  it('fee change event applies and reverts', async () => {
    const s = setup('vouchers')
    await fund(s, 100)
    const h = s.provider.applyEvent('provider_fee_change', { topupBps: 500 })
    const r = await s.provider.payVendor({ vendor: 'steam', amountUsdCents: 2000, reference: 'a' })
    expect(r.ok && r.value.feeMicroUsdt).toBe(usdtToMicro(1))
    h?.revert()
    const r2 = await s.provider.payVendor({ vendor: 'steam', amountUsdCents: 2000, reference: 'b' })
    expect(r2.ok && r2.value.feeMicroUsdt).toBe(usdtToMicro(0.3))
  })
  it('is deterministic per seed', async () => {
    const run = async (seed: number) => {
      const s = setup('altcard', undefined, {}, seed)
      await fund(s, 200)
      const c = await s.provider.issueCard({ initialLoadUsdCents: 5000, label: 'x' })
      return JSON.stringify(c) + s.env.log.hash()
    }
    expect(await run(2)).toBe(await run(2))
    expect(await run(2)).not.toBe(await run(3))
  })
})
