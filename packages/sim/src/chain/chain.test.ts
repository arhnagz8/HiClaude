import { describe, expect, it } from 'vitest'
import { MS, NETWORKS, usdtToMicro } from '@hiclaude/contracts'
import { makeEnv } from '../core/testkit'
import { ChainSim, ADDRESS_FAMILY } from './chain'

function setup(seed = 1) {
  const env = makeEnv({ seed })
  const chain = new ChainSim(env, env.rng.fork('chain'))
  return { env, chain }
}

describe('ChainSim addresses', () => {
  it('has a valid wallet address per network with the right format', () => {
    const { chain } = setup()
    for (const n of NETWORKS) {
      const a = chain.walletAddress(n)
      expect(chain.isValidAddress(n, a)).toBe(true)
    }
    expect(chain.walletAddress('TRC20')).toMatch(/^T[1-9A-HJ-NP-Za-km-z]{33}$/)
    expect(chain.walletAddress('BEP20')).toMatch(/^0x[0-9a-f]{40}$/)
  })
  it('rejects malformed addresses', () => {
    const { chain } = setup()
    expect(chain.isValidAddress('TRC20', '0x1234')).toBe(false)
    expect(chain.isValidAddress('BEP20', 'Tabc')).toBe(false)
  })
  it('allocates unique per-order addresses idempotently', async () => {
    const { chain } = setup()
    const a = await chain.allocateDepositAddress({ network: 'TRC20', orderId: 'o1' })
    const a2 = await chain.allocateDepositAddress({ network: 'TRC20', orderId: 'o1' })
    const b = await chain.allocateDepositAddress({ network: 'TRC20', orderId: 'o2' })
    expect(a.ok && a2.ok && b.ok).toBe(true)
    if (a.ok && a2.ok && b.ok) {
      expect(a.value.address).toBe(a2.value.address)
      expect(a.value.address).not.toBe(b.value.address)
      expect(chain.isOurAddress('TRC20', a.value.address)).toBe(true)
    }
  })
  it('TON uses a shared address with a unique memo per order', async () => {
    const { chain } = setup()
    const a = await chain.allocateDepositAddress({ network: 'TON', orderId: 'o1' })
    const b = await chain.allocateDepositAddress({ network: 'TON', orderId: 'o2' })
    if (a.ok && b.ok) {
      expect(a.value.address).toBe(b.value.address)
      expect(a.value.memo).toBeDefined()
      expect(a.value.memo).not.toBe(b.value.memo)
    } else throw new Error('alloc failed')
  })
  it('is deterministic per seed', async () => {
    const x = await setup(5).chain.allocateDepositAddress({ network: 'BEP20', orderId: 'o' })
    const y = await setup(5).chain.allocateDepositAddress({ network: 'BEP20', orderId: 'o' })
    const z = await setup(6).chain.allocateDepositAddress({ network: 'BEP20', orderId: 'o' })
    expect(x).toEqual(y)
    expect(x).not.toEqual(z)
  })
  it('address families map', () => {
    expect(ADDRESS_FAMILY.TRC20).toBe('tron')
    expect(ADDRESS_FAMILY.ERC20).toBe('evm')
  })
})

describe('ChainSim transfers and confirmations', () => {
  it('incoming transfer becomes confirmed after the required confirmations and credits the wallet', async () => {
    const { env, chain } = setup()
    const addr = await chain.allocateDepositAddress({ network: 'TRC20', orderId: 'o1' })
    if (!addr.ok) throw new Error('x')
    const inj = chain.injectIncoming({ network: 'TRC20', to: addr.value.address, amount: usdtToMicro(100) })
    expect(inj.ok).toBe(true)
    if (!inj.ok) return
    let st = await chain.txStatus({ network: 'TRC20', txHash: inj.value.txHash })
    expect(st.ok && st.value.status).toBe('pending')
    expect(chain.balanceOurs('TRC20')).toBe(0)
    env.sim.runUntil(inj.value.confirmAt - 1)
    st = await chain.txStatus({ network: 'TRC20', txHash: inj.value.txHash })
    expect(st.ok && st.value.status).toBe('pending')
    env.sim.runUntil(inj.value.confirmAt)
    st = await chain.txStatus({ network: 'TRC20', txHash: inj.value.txHash })
    expect(st.ok && st.value.status).toBe('confirmed')
    expect(st.ok && st.value.confirmations).toBeGreaterThanOrEqual(20)
    expect(chain.balanceOurs('TRC20')).toBe(usdtToMicro(100))
    expect(chain.audit().ok).toBe(true)
  })
  it('confirmations grow with block time', async () => {
    const { env, chain } = setup()
    const a = await chain.allocateDepositAddress({ network: 'ERC20', orderId: 'o' })
    if (!a.ok) throw new Error('x')
    const inj = chain.injectIncoming({ network: 'ERC20', to: a.value.address, amount: 1_000_000 })
    if (!inj.ok) throw new Error('x')
    env.sim.runUntil(env.clock.now() + 12 * 5 * 1000)
    const st = await chain.txStatus({ network: 'ERC20', txHash: inj.value.txHash })
    expect(st.ok && st.value.confirmations).toBeGreaterThanOrEqual(3)
    expect(st.ok && st.value.confirmations).toBeLessThan(12)
  })
  it('listIncoming filters by network, address and since; ignores wrong tokens', async () => {
    const { env, chain } = setup()
    const a = await chain.allocateDepositAddress({ network: 'TRC20', orderId: 'o1' })
    const b = await chain.allocateDepositAddress({ network: 'TRC20', orderId: 'o2' })
    if (!a.ok || !b.ok) throw new Error('x')
    chain.injectIncoming({ network: 'TRC20', to: a.value.address, amount: 5_000_000 })
    env.sim.runUntil(env.clock.now() + 10 * MS.minute)
    chain.injectIncoming({ network: 'TRC20', to: b.value.address, amount: 6_000_000 })
    chain.injectIncoming({ network: 'TRC20', to: b.value.address, amount: 7_000_000, token: 'USDC' })
    const all = await chain.listIncoming({ network: 'TRC20', since: 0 })
    expect(all.ok && all.value.map((t) => t.amount)).toEqual([5_000_000, 6_000_000])
    const onlyB = await chain.listIncoming({ network: 'TRC20', address: b.value.address, since: 0 })
    expect(onlyB.ok && onlyB.value.length).toBe(1)
    const late = await chain.listIncoming({ network: 'TRC20', since: env.clock.now() - 1000 })
    expect(late.ok && late.value.length).toBe(1)
    const bep = await chain.listIncoming({ network: 'BEP20', since: 0 })
    expect(bep.ok && bep.value.length).toBe(0)
    expect(chain.audit().wrongTokenMicro).toBe(7_000_000)
  })
  it('send debits amount + fee from the wallet pool and credits the destination after confirmation', async () => {
    const { env, chain } = setup()
    chain.fundWallet('TRC20', usdtToMicro(1000))
    const dest = chain.newExternalAddress('TRC20')
    const r = await chain.send({ network: 'TRC20', to: dest, amount: usdtToMicro(100) })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.feeMicroUsdt).toBeGreaterThan(0)
    expect(chain.balanceOurs('TRC20')).toBe(usdtToMicro(1000) - usdtToMicro(100) - r.value.feeMicroUsdt)
    env.sim.runUntil(env.clock.now() + 2 * MS.minute)
    expect(chain.balanceAt('TRC20', dest)).toBe(usdtToMicro(100))
    expect(chain.audit().ok).toBe(true)
  })
  it('send validates address, amount and funds', async () => {
    const { chain } = setup()
    chain.fundWallet('BEP20', usdtToMicro(10))
    expect((await chain.send({ network: 'BEP20', to: 'bogus', amount: 1 })).ok).toBe(false)
    const dest = chain.newExternalAddress('BEP20')
    const big = await chain.send({ network: 'BEP20', to: dest, amount: usdtToMicro(11) })
    expect(!big.ok && big.error.code).toBe('INSUFFICIENT_FUNDS')
    const bad = await chain.send({ network: 'BEP20', to: dest, amount: 0 })
    expect(!bad.ok && bad.error.code).toBe('VALIDATION')
  })
  it('failed outgoing tx refunds the amount but burns the fee, and conservation holds', async () => {
    const { env, chain } = setup(3)
    chain.fundWallet('TRC20', usdtToMicro(100_000))
    let failed = 0
    for (let i = 0; i < 3000 && failed < 2; i++) {
      const dest = chain.newExternalAddress('TRC20')
      const r = await chain.send({ network: 'TRC20', to: dest, amount: usdtToMicro(10) })
      if (!r.ok) throw new Error('send')
      env.sim.runUntil(env.clock.now() + MS.minute)
      const st = await chain.txStatus({ network: 'TRC20', txHash: r.value.txHash })
      if (st.ok && st.value.status === 'failed') failed++
    }
    env.sim.runUntil(env.clock.now() + MS.hour)
    expect(failed).toBeGreaterThan(0)
    expect(chain.audit().ok).toBe(true)
  })
  it('conservation holds under random traffic on all networks', async () => {
    const { env, chain } = setup(9)
    for (const n of NETWORKS) chain.fundWallet(n, usdtToMicro(5000))
    for (let i = 0; i < 300; i++) {
      const n = NETWORKS[i % NETWORKS.length] as (typeof NETWORKS)[number]
      if (i % 2) await chain.send({ network: n, to: chain.newExternalAddress(n), amount: usdtToMicro(1 + (i % 17)) })
      else {
        const a = await chain.allocateDepositAddress({ network: n, orderId: `o${i}` })
        if (a.ok) chain.injectIncoming({ network: n, to: a.value.address, amount: usdtToMicro(3 + (i % 5)) })
      }
      env.sim.runUntil(env.clock.now() + 3 * MS.minute)
      expect(chain.audit().ok).toBe(true)
    }
    env.sim.runUntil(env.clock.now() + MS.day)
    const a = chain.audit()
    expect(a.ok).toBe(true)
    expect(a.inflight).toBe(0)
  })
  it('incoming listeners fire at broadcast', async () => {
    const { chain } = setup()
    const a = await chain.allocateDepositAddress({ network: 'TRC20', orderId: 'o' })
    if (!a.ok) throw new Error('x')
    const seen: number[] = []
    chain.onIncoming(a.value.address, (t) => seen.push(t.amount))
    chain.injectIncoming({ network: 'TRC20', to: a.value.address, amount: 42 })
    expect(seen).toEqual([42])
  })
})

describe('ChainSim anomalies and screening', () => {
  it('underpay / overpay / duplicate / wrong_token / wrong_network', async () => {
    const { env, chain } = setup()
    const a = await chain.allocateDepositAddress({ network: 'BEP20', orderId: 'o' })
    if (!a.ok) throw new Error('x')
    const exp = usdtToMicro(100)
    const under = chain.injectAnomaly({ kind: 'underpay', network: 'BEP20', to: a.value.address, expectedAmount: exp, fraction: 0.1 })
    expect(under.ok && under.value[0]?.amount).toBe(usdtToMicro(90))
    const over = chain.injectAnomaly({ kind: 'overpay', network: 'BEP20', to: a.value.address, expectedAmount: exp, fraction: 0.1 })
    expect(over.ok && over.value[0]?.amount).toBe(usdtToMicro(110))
    const dup = chain.injectAnomaly({ kind: 'duplicate', network: 'BEP20', to: a.value.address, expectedAmount: exp })
    expect(dup.ok && dup.value.length).toBe(2)
    chain.injectAnomaly({ kind: 'wrong_token', network: 'BEP20', to: a.value.address, expectedAmount: exp })
    chain.injectAnomaly({ kind: 'wrong_network', network: 'BEP20', to: a.value.address, expectedAmount: exp })
    env.sim.runUntil(env.clock.now() + MS.hour)
    const bep = await chain.listIncoming({ network: 'BEP20', since: 0 })
    expect(bep.ok && bep.value.length).toBe(4) // under, over, 2 dup; token+network anomalies invisible here
    const erc = await chain.listIncoming({ network: 'ERC20', since: 0 })
    expect(erc.ok && erc.value.length).toBe(1) // EVM address is valid on the other EVM chain
    expect(chain.audit().ok).toBe(true)
  })
  it('wrong network across address families is not credited to us', async () => {
    const { chain } = setup()
    const a = await chain.allocateDepositAddress({ network: 'TRC20', orderId: 'o' })
    if (!a.ok) throw new Error('x')
    const r = chain.injectIncoming({ network: 'BEP20', to: a.value.address, amount: 1 })
    expect(r.ok).toBe(false) // a Tron address is not a valid BEP20 destination
  })
  it('screenAddress is deterministic per address and flaggable', async () => {
    const { chain } = setup()
    const addr = chain.newExternalAddress('TRC20')
    const r1 = await chain.screenAddress({ network: 'TRC20', address: addr })
    const r2 = await chain.screenAddress({ network: 'TRC20', address: addr })
    expect(r1).toEqual(r2)
    chain.flagAddress(addr, 'blocked')
    const r3 = await chain.screenAddress({ network: 'TRC20', address: addr })
    expect(r3.ok && r3.value.risk).toBe('blocked')
  })
  it('taint rate roughly matches configuration and the sanctions event multiplies it', async () => {
    const { chain } = setup(2)
    let flagged = 0
    const addrs = Array.from({ length: 4000 }, () => chain.newExternalAddress('TRC20'))
    for (const a of addrs) {
      const r = await chain.screenAddress({ network: 'TRC20', address: a })
      if (r.ok && r.value.risk !== 'clear') flagged++
    }
    expect(flagged / 4000).toBeGreaterThan(0.004)
    expect(flagged / 4000).toBeLessThan(0.03)
    const h = chain.applyEvent('sanctions_freeze', { taintMultiplier: 10 })
    let flagged2 = 0
    for (const a of addrs) {
      const r = await chain.screenAddress({ network: 'TRC20', address: a })
      if (r.ok && r.value.risk !== 'clear') flagged2++
    }
    expect(flagged2).toBeGreaterThan(flagged * 5)
    h?.revert()
    const r = await chain.screenAddress({ network: 'TRC20', address: addrs[0] as string })
    expect(r.ok).toBe(true)
  })
  it('congestion slows confirmations and raises fees; revert restores', async () => {
    const { env, chain } = setup()
    const base = chain.networkFeeMicro('ERC20')
    const h = chain.applyEvent('chain_congestion', { network: 'ERC20', delayMult: 5, feeMult: 4 })
    expect(chain.networkFeeMicro('ERC20')).toBe(base * 4)
    expect(chain.blockTimeMs('ERC20')).toBe(60_000)
    h?.revert()
    expect(chain.networkFeeMicro('ERC20')).toBe(base)
    void env
  })
  it('unknown events are ignored', () => {
    expect(setup().chain.applyEvent('whatever', {})).toBeNull()
  })
})
