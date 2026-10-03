import { describe, expect, it } from 'vitest'
import { MS, defaultPlatformParams, fromIrst, startOfIrstDay, usdtToMicro, type ExchangeParams, type PlatformParams } from '@hiclaude/contracts'
import { makeEnv } from '../core/testkit'
import { MacroEngine } from '../macro/engine'
import { BankSim, defaultBankConfig } from '../bank/bank'
import { ChainSim } from '../chain/chain'
import { ExchangeSim } from './exchange'
import { Regulation } from './regulation'

interface Opts {
  start?: number
  params?: (p: PlatformParams) => void
  ex?: (e: ExchangeParams) => void
  bankIrt?: number
  seed?: number
}

function setup(o: Opts = {}) {
  const start = o.start ?? fromIrst(2026, 10, 3, 10) // Saturday 10:00 IRST
  const env = makeEnv({ start, seed: o.seed ?? 1 })
  const params = defaultPlatformParams()
  o.params?.(params)
  const origin = startOfIrstDay(start)
  const macro = new MacroEngine({ rng: env.rng.fork('macro'), clock: env.clock, startMs: origin })
  const bcfg = defaultBankConfig(params)
  bcfg.openingBalanceIrt = o.bankIrt ?? 5_000_000_000
  const bank = new BankSim(env, env.rng.fork('bank'), bcfg)
  const chain = new ChainSim(env, env.rng.fork('chain'))
  const regulation = new Regulation(env, params.regulatory)
  const exParams = structuredClone(params.exchanges.find((e) => e.id === 'nobitex') as ExchangeParams)
  exParams.outageProbPerMonth = 0
  o.ex?.(exParams)
  const ex = new ExchangeSim(exParams, { env, rng: env.rng.fork('exchange:nobitex'), macro, bank, chain, regulation, originMs: origin })
  return { env, macro, bank, chain, regulation, ex, params }
}

const mustOk = <T>(r: { ok: true; value: T } | { ok: false; error: { code: string; message: string } }): T => {
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`)
  return r.value
}

describe('ExchangeSim ticker and limits', () => {
  it('quotes a spread around mid with the configured premium', async () => {
    const { ex, macro, env } = setup({ ex: (e) => ((e.premiumBps = 50), (e.halfSpreadBps = 20)) })
    const t = mustOk(await ex.ticker())
    expect(t.ask).toBeGreaterThan(t.bid)
    const mid = macro.midAt(env.clock.now())
    expect((t.ask + t.bid) / 2 / mid).toBeGreaterThan(1.003)
    expect((t.ask + t.bid) / 2 / mid).toBeLessThan(1.007)
    expect(t.ask / t.bid - 1).toBeGreaterThan(0.0035)
    expect(t.ask / t.bid - 1).toBeLessThan(0.0045)
    expect(t.volume24hUsdt).toBeGreaterThan(0)
  })
  it('quotes are idempotent within an instant and vary over time', async () => {
    const { ex, env } = setup()
    const a = mustOk(await ex.ticker())
    const b = mustOk(await ex.ticker())
    expect(a).toEqual(b)
    env.sim.runUntil(env.clock.now() + 3 * MS.hour)
    expect(mustOk(await ex.ticker()).ask).not.toBe(a.ask)
  })
  it('limits expose regulatory state', async () => {
    const { ex } = setup()
    const l = mustOk(await ex.limits())
    expect(l.tradingOpen).toBe(true)
    expect(l.withdrawalLockHours).toBe(72)
    expect(l.buyCapRemainingMicroUsdt).toBeNull()
    expect(l.depositCapRemainingIrt).toBe(25_000_000)
    expect(l.takerFeeBps).toBe(35)
    expect(l.withdrawFeeMicroUsdt.TRC20).toBe(1_000_000)
    expect(l.minOrderIrt).toBeGreaterThan(0)
  })
})

describe('ExchangeSim deposits and the ID cap', () => {
  it('gateway deposit credits instantly and debits the bank', async () => {
    const { ex, bank } = setup()
    const before = bank.balanceNow()
    const d = mustOk(await ex.depositIrt({ amountIrt: 10_000_000, method: 'gateway' }))
    expect(d.status).toBe('credited')
    expect(mustOk(await ex.balances()).irt).toBe(10_000_000)
    expect(bank.balanceNow()).toBe(before - 10_000_000)
  })
  it('paya deposit stays pending until the bank cycle and then credits', async () => {
    const { ex, env, bank } = setup()
    const d = mustOk(await ex.depositIrt({ amountIrt: 20_000_000, method: 'paya' }))
    expect(d.status).toBe('pending')
    expect(d.availableAt).toBeGreaterThan(env.clock.now())
    expect(mustOk(await ex.balances()).irt).toBe(0)
    expect(bank.balanceNow()).toBeLessThan(5_000_000_000 - 20_000_000 + 1)
    env.sim.runUntil((d.availableAt as number) - 1)
    expect(mustOk(await ex.balances()).irt).toBe(0)
    env.sim.runUntil(d.availableAt as number)
    expect(mustOk(await ex.balances()).irt).toBe(20_000_000)
    expect(ex.depositStatus(d.depositId)?.status).toBe('credited')
  })
  it('paya deposit on Friday waits for Saturday', async () => {
    const { ex, env } = setup({ start: fromIrst(2026, 10, 2, 11) })
    const d = mustOk(await ex.depositIrt({ amountIrt: 5_000_000, method: 'paya' }))
    expect(d.availableAt).toBeGreaterThanOrEqual(fromIrst(2026, 10, 3, 10))
    expect(env.clock.now()).toBeLessThan(fromIrst(2026, 10, 3))
  })
  it('rejects deposits above the bank balance', async () => {
    const { ex } = setup({ bankIrt: 1_000_000 })
    const r = await ex.depositIrt({ amountIrt: 5_000_000, method: 'gateway' })
    expect(!r.ok && r.error.code).toBe('INSUFFICIENT_FUNDS')
  })
  it('rolling 24h per-ID cap: rejects over cap, reports remaining, releases after 24h', async () => {
    const { ex, env } = setup({ params: (p) => (p.regulatory.idDepositCapIrtPer24h = 25_000_000) })
    mustOk(await ex.depositIrt({ amountIrt: 15_000_000, method: 'gateway' }))
    mustOk(await ex.depositIrt({ amountIrt: 10_000_000, method: 'gateway' }))
    const over = await ex.depositIrt({ amountIrt: 1_000_000, method: 'gateway' })
    expect(!over.ok && over.error.code).toBe('CAP_EXCEEDED')
    expect(!over.ok && over.error.details?.remainingIrt).toBe(0)
    expect(mustOk(await ex.limits()).depositCapRemainingIrt).toBe(0)
    env.sim.runUntil(env.clock.now() + 23 * MS.hour)
    expect((await ex.depositIrt({ amountIrt: 1_000_000, method: 'gateway' })).ok).toBe(false)
    env.sim.runUntil(env.clock.now() + 1 * MS.hour + MS.minute)
    expect(mustOk(await ex.limits()).depositCapRemainingIrt).toBe(25_000_000)
    expect((await ex.depositIrt({ amountIrt: 10_000_000, method: 'gateway' })).ok).toBe(true)
  })
  it('cap is a rolling window (partial release as old deposits age out)', async () => {
    const { ex, env } = setup()
    mustOk(await ex.depositIrt({ amountIrt: 10_000_000, method: 'gateway' }))
    env.sim.runUntil(env.clock.now() + 12 * MS.hour)
    mustOk(await ex.depositIrt({ amountIrt: 10_000_000, method: 'gateway' }))
    env.sim.runUntil(env.clock.now() + 12 * MS.hour + MS.minute)
    expect(mustOk(await ex.limits()).depositCapRemainingIrt).toBe(15_000_000)
  })
  it('multiple legally-owned identities each have their own cap, but a deposit is never split across them', async () => {
    const { ex } = setup({ params: (p) => (p.regulatory.depositIdentitiesAvailable = 2) })
    mustOk(await ex.depositIrt({ amountIrt: 20_000_000, method: 'gateway', fromAccountId: 'identity-1' }))
    const big = await ex.depositIrt({ amountIrt: 30_000_000, method: 'paya' })
    expect(!big.ok && big.error.code).toBe('CAP_EXCEEDED')
    expect(!big.ok && big.error.details?.maxSingleDepositIrt).toBe(25_000_000)
    const second = mustOk(await ex.depositIrt({ amountIrt: 25_000_000, method: 'paya' })) // auto picks identity-2
    expect(second.amountIrt).toBe(25_000_000)
    const l = mustOk(await ex.limits())
    expect(l.depositCapRemainingIrt).toBe(5_000_000)
    const bad = await ex.depositIrt({ amountIrt: 1_000_000, method: 'gateway', fromAccountId: 'identity-9' })
    expect(!bad.ok && bad.error.code).toBe('VALIDATION')
  })
  it('regulatory cap event lowers and restores the cap', async () => {
    const { ex, regulation } = setup()
    const h = regulation.applyEvent('cbi_deposit_cap', { valueIrt: 10_000_000 })
    expect(mustOk(await ex.limits()).depositCapRemainingIrt).toBe(10_000_000)
    expect((await ex.depositIrt({ amountIrt: 12_000_000, method: 'gateway' })).ok).toBe(false)
    h?.revert()
    expect(mustOk(await ex.limits()).depositCapRemainingIrt).toBe(25_000_000)
  })
  it('null cap means unlimited; exchange override wins', async () => {
    const a = setup({ params: (p) => (p.regulatory.idDepositCapIrtPer24h = null) })
    expect(mustOk(await a.ex.limits()).depositCapRemainingIrt).toBeNull()
    const b = setup({ ex: (e) => (e.depositCapIrtPer24hOverride = 5_000_000) })
    expect(mustOk(await b.ex.limits()).depositCapRemainingIrt).toBe(5_000_000)
  })
  it('method maxima: gateway and card-to-card', async () => {
    const { ex } = setup({ params: (p) => (p.regulatory.idDepositCapIrtPer24h = null) })
    const g = await ex.depositIrt({ amountIrt: 60_000_000, method: 'gateway' })
    expect(!g.ok && g.error.code).toBe('CAP_EXCEEDED')
    const c = await ex.depositIrt({ amountIrt: 20_000_000, method: 'card_to_card' })
    expect(!c.ok && c.error.code).toBe('CAP_EXCEEDED')
    expect((await ex.depositIrt({ amountIrt: 15_000_000, method: 'card_to_card' })).ok).toBe(true)
  })
  it('validates deposit amount', async () => {
    const { ex } = setup()
    expect((await ex.depositIrt({ amountIrt: 0, method: 'gateway' })).ok).toBe(false)
    expect((await ex.depositIrt({ amountIrt: 100, method: 'gateway' })).ok).toBe(false)
  })
})

describe('ExchangeSim buying', () => {
  async function funded(opts: Opts = {}, irt = 20_000_000) {
    const s = setup({ ...opts, params: (p) => { p.regulatory.idDepositCapIrtPer24h = null; opts.params?.(p) } })
    mustOk(await s.ex.depositIrt({ amountIrt: Math.min(irt, 50_000_000), method: 'gateway' }))
    return s
  }
  it('buys USDT at the ask incl. fee, never overspends, and locks the lot for 72h', async () => {
    const { ex, env } = await funded()
    const t0 = env.clock.now()
    const tick = mustOk(await ex.ticker())
    const r = mustOk(await ex.buyUsdt({ irtBudget: 10_000_000 }))
    expect(r.irt).toBeLessThanOrEqual(10_000_000)
    expect(r.irt).toBeGreaterThan(9_990_000)
    expect(r.price).toBeGreaterThanOrEqual(tick.ask)
    expect(r.price).toBeLessThan(tick.ask * 1.01)
    expect(r.feeIrt).toBeGreaterThan(0)
    expect(Math.abs(r.feeIrt / r.irt - 0.0035)).toBeLessThan(0.0005)
    expect(r.withdrawableAt).toBe(t0 + 72 * MS.hour)
    const b = mustOk(await ex.balances())
    expect(b.irt).toBe(20_000_000 - r.irt)
    expect(b.usdt).toBe(r.usdt)
    expect(b.usdtWithdrawable).toBe(0)
    expect(ex.audit().ok).toBe(true)
  })
  it('respects min order, balance, and maxPrice', async () => {
    const { ex } = await funded()
    expect((await ex.buyUsdt({ irtBudget: 10 })).ok).toBe(false)
    const big = await ex.buyUsdt({ irtBudget: 30_000_000 })
    expect(!big.ok && big.error.code).toBe('INSUFFICIENT_FUNDS')
    const lim = await ex.buyUsdt({ irtBudget: 1_000_000, maxPrice: 1000 })
    expect(!lim.ok && lim.error.code).toBe('REJECTED')
  })
  it('large orders suffer price impact', async () => {
    const small = await funded({ bankIrt: 50_000_000_000 })
    const rs = mustOk(await small.ex.buyUsdt({ irtBudget: 1_000_000 }))
    const big = await funded({ bankIrt: 50_000_000_000, ex: (e) => (e.halfSpreadBps = 8) })
    big.ex.cfg.depthUsdtPer10Bps = 300
    // deposit more for a large order (cap disabled by funded())
    mustOk(await big.ex.depositIrt({ amountIrt: 50_000_000, method: 'gateway' }))
    mustOk(await big.ex.depositIrt({ amountIrt: 50_000_000, method: 'gateway' }))
    mustOk(await big.ex.depositIrt({ amountIrt: 50_000_000, method: 'gateway' }))
    mustOk(await big.ex.depositIrt({ amountIrt: 50_000_000, method: 'gateway' }))
    const rb = mustOk(await big.ex.buyUsdt({ irtBudget: 200_000_000 }))
    expect(rb.price / rs.price).toBeGreaterThan(1.0003)
  })
  it('daily buy cap (night-halt measure) rejects an order above the remaining cap and resets at midnight', async () => {
    const { ex, regulation, env } = await funded({ bankIrt: 5_000_000_000 })
    mustOk(await ex.depositIrt({ amountIrt: 50_000_000, method: 'gateway' }))
    mustOk(await ex.depositIrt({ amountIrt: 50_000_000, method: 'gateway' }))
    regulation.applyEvent('daily_buy_cap', { dailyBuyCapUsdt: 300 })
    const l = mustOk(await ex.limits())
    expect(l.buyCapRemainingMicroUsdt).toBe(usdtToMicro(300))
    const r1 = mustOk(await ex.buyUsdt({ irtBudget: 40_000_000 })) // ~150 USDT
    expect(r1.usdt).toBeLessThan(usdtToMicro(300))
    const r2 = await ex.buyUsdt({ irtBudget: 60_000_000 }) // ~230 USDT -> over
    expect(!r2.ok && r2.error.code).toBe('CAP_EXCEEDED')
    expect(!r2.ok && typeof r2.error.details?.remainingMicroUsdt).toBe('number')
    env.sim.runUntil(startOfIrstDay(env.clock.now()) + MS.day + 10 * MS.hour)
    expect(mustOk(await ex.limits()).buyCapRemainingMicroUsdt).toBe(usdtToMicro(300))
    expect((await ex.buyUsdt({ irtBudget: 30_000_000 })).ok).toBe(true)
  })
  it('fee change event applies and reverts', async () => {
    const { ex } = await funded()
    const h = ex.applyEvent('exchange_fee_change', { takerFeeBps: 100 })
    const r = mustOk(await ex.buyUsdt({ irtBudget: 5_000_000 }))
    expect(r.feeIrt / r.irt).toBeGreaterThan(0.0095)
    h?.revert()
    expect(mustOk(await ex.limits()).takerFeeBps).toBe(35)
  })
})

describe('ExchangeSim night halt', () => {
  const haltParams = (p: PlatformParams) => {
    p.regulatory.nightHalt = { enabled: true, fromHour: 21, toHour: 9 }
    p.regulatory.idDepositCapIrtPer24h = null
  }
  it('closes trading inside the window with nextTradingOpenAt, and reopens', async () => {
    const { ex, env } = setup({ start: fromIrst(2026, 10, 3, 22), params: haltParams })
    mustOk(await ex.depositIrt({ amountIrt: 10_000_000, method: 'gateway' }))
    const r = await ex.buyUsdt({ irtBudget: 1_000_000 })
    expect(!r.ok && r.error.code).toBe('MARKET_CLOSED')
    expect(!r.ok && r.error.details?.nextTradingOpenAt).toBe(fromIrst(2026, 10, 4, 9))
    const l = mustOk(await ex.limits())
    expect(l.tradingOpen).toBe(false)
    expect(l.nextTradingOpenAt).toBe(fromIrst(2026, 10, 4, 9))
    env.sim.runUntil(fromIrst(2026, 10, 4, 9, 1))
    expect((await ex.buyUsdt({ irtBudget: 1_000_000 })).ok).toBe(true)
  })
  it('after midnight the next open is the same morning', async () => {
    const { ex } = setup({ start: fromIrst(2026, 10, 4, 3), params: haltParams })
    expect(mustOk(await ex.limits()).nextTradingOpenAt).toBe(fromIrst(2026, 10, 4, 9))
  })
  it('sells are closed too and the quote is stale (frozen at the close)', async () => {
    const { ex, env } = setup({ start: fromIrst(2026, 10, 3, 20, 59), params: haltParams })
    const open = mustOk(await ex.ticker())
    env.sim.runUntil(fromIrst(2026, 10, 3, 23))
    const closed = mustOk(await ex.ticker())
    expect(closed.asOf).toBe(fromIrst(2026, 10, 3, 21))
    expect(closed.asOf).toBeGreaterThan(open.asOf)
    env.sim.runUntil(fromIrst(2026, 10, 4, 5))
    const closed2 = mustOk(await ex.ticker())
    expect(closed2.asOf).toBe(closed.asOf)
    expect(closed2.ask).toBe(closed.ask)
    const s = await ex.sellUsdt({ amountMicroUsdt: 1_000_000 })
    expect(!s.ok && s.error.code).toBe('MARKET_CLOSED')
    env.sim.runUntil(fromIrst(2026, 10, 4, 9, 5))
    const reopened = mustOk(await ex.ticker())
    expect(reopened.asOf).toBe(env.clock.now())
  })
  it('gap at the open can be large relative to a normal tick (mid drifts all night)', async () => {
    const { ex, env } = setup({ start: fromIrst(2026, 10, 3, 20, 59), params: haltParams })
    const c = mustOk(await ex.ticker())
    env.sim.runUntil(fromIrst(2026, 10, 4, 9, 1))
    const o = mustOk(await ex.ticker())
    expect(o.ask).not.toBe(c.ask)
  })
  it('deposits and withdrawals still work during the halt by default', async () => {
    const { ex } = setup({ start: fromIrst(2026, 10, 3, 22), params: haltParams })
    expect((await ex.depositIrt({ amountIrt: 1_000_000, method: 'gateway' })).ok).toBe(true)
  })
  it('night_halt event with a daily cap installs and removes the halt', async () => {
    const { ex, regulation, env } = setup({ start: fromIrst(2026, 10, 3, 22) })
    expect(mustOk(await ex.limits()).tradingOpen).toBe(true)
    const h = regulation.applyEvent('night_halt', { from: '21:00', to: '09:00', dailyBuyCapUsdt: 2000 })
    const l = mustOk(await ex.limits())
    expect(l.tradingOpen).toBe(false)
    expect(l.buyCapRemainingMicroUsdt).toBe(usdtToMicro(2000))
    h?.revert()
    expect(mustOk(await ex.limits()).tradingOpen).toBe(true)
    expect(mustOk(await ex.limits()).buyCapRemainingMicroUsdt).toBeNull()
    void env
  })
})

describe('ExchangeSim selling', () => {
  it('sells at the bid minus fee and shrinks the withdrawable pool first (oldest lots)', async () => {
    const { ex } = setup({ params: (p) => (p.regulatory.idDepositCapIrtPer24h = null) })
    ex.seed({ usdt: usdtToMicro(100) })
    mustOk(await ex.depositIrt({ amountIrt: 20_000_000, method: 'gateway' }))
    const buy = mustOk(await ex.buyUsdt({ irtBudget: 10_000_000 }))
    const before = mustOk(await ex.balances())
    expect(before.usdtWithdrawable).toBe(usdtToMicro(100))
    const sell = mustOk(await ex.sellUsdt({ amountMicroUsdt: usdtToMicro(40) }))
    expect(sell.side).toBe('sell')
    expect(sell.irt).toBeGreaterThan(0)
    const after = mustOk(await ex.balances())
    expect(after.usdt).toBe(usdtToMicro(100) + buy.usdt - usdtToMicro(40))
    expect(after.usdtWithdrawable).toBe(usdtToMicro(60))
    expect(ex.audit().ok).toBe(true)
  })
  it('bid < ask and respects minPrice and balance', async () => {
    const { ex } = setup()
    ex.seed({ usdt: usdtToMicro(50) })
    const lim = await ex.sellUsdt({ amountMicroUsdt: usdtToMicro(10), minPrice: 10_000_000 })
    expect(!lim.ok && lim.error.code).toBe('REJECTED')
    const over = await ex.sellUsdt({ amountMicroUsdt: usdtToMicro(51) })
    expect(!over.ok && over.error.code).toBe('INSUFFICIENT_FUNDS')
    const t = mustOk(await ex.ticker())
    const s = mustOk(await ex.sellUsdt({ amountMicroUsdt: usdtToMicro(10) }))
    expect(s.price).toBeLessThan(t.bid * 1.001)
  })
  it('round trip loses roughly spread + 2 fees', async () => {
    const { ex } = setup({ params: (p) => (p.regulatory.idDepositCapIrtPer24h = null) })
    mustOk(await ex.depositIrt({ amountIrt: 20_000_000, method: 'gateway' }))
    const buy = mustOk(await ex.buyUsdt({ irtBudget: 20_000_000 }))
    const sell = mustOk(await ex.sellUsdt({ amountMicroUsdt: buy.usdt }))
    const loss = 1 - sell.irt / buy.irt
    expect(loss).toBeGreaterThan(0.0085) // 2 x 8 bps spread + 2 x 35 bps fee
    expect(loss).toBeLessThan(0.015)
  })
})

describe('ExchangeSim USDT withdrawals and the 72h lock', () => {
  const noCap = (p: PlatformParams) => (p.regulatory.idDepositCapIrtPer24h = null)
  async function withLot() {
    const s = setup({ params: noCap })
    mustOk(await s.ex.depositIrt({ amountIrt: 50_000_000, method: 'gateway' }))
    const buy = mustOk(await s.ex.buyUsdt({ irtBudget: 50_000_000 }))
    return { ...s, buy, boughtAt: s.env.clock.now() }
  }
  it('LOCKED before 72h with the unlock time, allowed exactly at unlock', async () => {
    const { ex, env, chain, buy, boughtAt } = await withLot()
    const addr = chain.walletAddress('TRC20')
    env.sim.runUntil(boughtAt + 72 * MS.hour - 1)
    const r = await ex.withdrawUsdt({ amountMicroUsdt: buy.usdt, network: 'TRC20', address: addr })
    expect(!r.ok && r.error.code).toBe('LOCKED')
    expect(!r.ok && r.error.details?.withdrawableAt).toBe(boughtAt + 72 * MS.hour)
    expect(!r.ok && r.error.retryable).toBe(true)
    env.sim.runUntil(boughtAt + 72 * MS.hour)
    const ok2 = await ex.withdrawUsdt({ amountMicroUsdt: buy.usdt, network: 'TRC20', address: addr })
    expect(ok2.ok).toBe(true)
  })
  it('withdrawable accounting follows lots as they unlock', async () => {
    const { ex, env, boughtAt } = await withLot()
    mustOk(await ex.depositIrt({ amountIrt: 10_000_000, method: 'gateway' }))
    env.sim.runUntil(boughtAt + 36 * MS.hour)
    const second = mustOk(await ex.buyUsdt({ irtBudget: 10_000_000 }))
    const b = mustOk(await ex.balances())
    expect(b.usdtWithdrawable).toBe(0)
    env.sim.runUntil(boughtAt + 72 * MS.hour)
    const b2 = mustOk(await ex.balances())
    expect(b2.usdt - b2.usdtWithdrawable).toBe(second.usdt)
    env.sim.runUntil(boughtAt + 108 * MS.hour)
    const b3 = mustOk(await ex.balances())
    expect(b3.usdtWithdrawable).toBe(b3.usdt)
  })
  it('a partial amount larger than the unlocked part is LOCKED with the right unlock time', async () => {
    const { ex, env, boughtAt, chain } = await withLot()
    ex.seed({ usdt: usdtToMicro(20) })
    const addr = chain.walletAddress('TRC20')
    const r = await ex.withdrawUsdt({ amountMicroUsdt: usdtToMicro(25), network: 'TRC20', address: addr })
    expect(!r.ok && r.error.code).toBe('LOCKED')
    expect(!r.ok && r.error.details?.usdtWithdrawable).toBe(usdtToMicro(20))
    expect(!r.ok && r.error.details?.withdrawableAt).toBe(boughtAt + 72 * MS.hour)
    const small = await ex.withdrawUsdt({ amountMicroUsdt: usdtToMicro(15), network: 'TRC20', address: addr })
    expect(small.ok).toBe(true)
    void env
  })
  it('broadcasts through the chain, delivers amount minus fee, and completes after confirmation', async () => {
    const { ex, env, chain } = await withLot()
    ex.seed({ usdt: usdtToMicro(100) })
    const addr = chain.walletAddress('TRC20')
    const w = mustOk(await ex.withdrawUsdt({ amountMicroUsdt: usdtToMicro(100), network: 'TRC20', address: addr }))
    expect(w.status).toBe('pending')
    expect(w.feeMicroUsdt).toBe(1_000_000)
    expect(chain.balanceOurs('TRC20')).toBe(0)
    env.sim.runUntil(env.clock.now() + 6 * MS.hour)
    const t = mustOk(await ex.withdrawal(w.withdrawalId))
    expect(['completed', 'failed']).toContain(t.status)
    if (t.status === 'completed') {
      expect(t.txHash).toBeDefined()
      expect(chain.balanceOurs('TRC20')).toBe(usdtToMicro(99))
    }
  })
  it('validation: network support, address, minimum, fee coverage, funds', async () => {
    const { ex, chain } = await withLot()
    ex.seed({ usdt: usdtToMicro(100) })
    const addr = chain.walletAddress('TRC20')
    const sol = await ex.withdrawUsdt({ amountMicroUsdt: usdtToMicro(20), network: 'SOLANA', address: chain.walletAddress('SOLANA') })
    expect(!sol.ok && sol.error.code).toBe('VALIDATION')
    const badAddr = await ex.withdrawUsdt({ amountMicroUsdt: usdtToMicro(20), network: 'TRC20', address: '0xabc' })
    expect(!badAddr.ok && badAddr.error.code).toBe('VALIDATION')
    const tiny = await ex.withdrawUsdt({ amountMicroUsdt: usdtToMicro(5), network: 'TRC20', address: addr })
    expect(!tiny.ok && tiny.error.code).toBe('VALIDATION')
    const too = await ex.withdrawUsdt({ amountMicroUsdt: usdtToMicro(10_000), network: 'TRC20', address: addr })
    expect(!too.ok && too.error.code).toBe('INSUFFICIENT_FUNDS')
  })
  it('feeMode "added" debits amount + fee and delivers the full amount', async () => {
    const s = setup({ params: noCap })
    ;(s.ex.cfg.withdraw as { feeMode: string }).feeMode = 'added'
    s.ex.seed({ usdt: usdtToMicro(100) })
    const w = mustOk(await s.ex.withdrawUsdt({ amountMicroUsdt: usdtToMicro(50), network: 'BEP20', address: s.chain.walletAddress('BEP20') }))
    expect(mustOk(await s.ex.balances()).usdt).toBe(usdtToMicro(100) - usdtToMicro(50) - 800_000)
    s.env.sim.runUntil(s.env.clock.now() + 8 * MS.hour)
    const t = mustOk(await s.ex.withdrawal(w.withdrawalId))
    if (t.status === 'completed') expect(s.chain.balanceOurs('BEP20')).toBe(usdtToMicro(50))
  })
  it('daily withdrawal cap', async () => {
    const s = setup({ params: noCap })
    s.ex.cfg.withdraw.dailyCapMicro = usdtToMicro(100)
    s.ex.seed({ usdt: usdtToMicro(500) })
    const addr = s.chain.walletAddress('TRC20')
    expect((await s.ex.withdrawUsdt({ amountMicroUsdt: usdtToMicro(80), network: 'TRC20', address: addr })).ok).toBe(true)
    const r = await s.ex.withdrawUsdt({ amountMicroUsdt: usdtToMicro(30), network: 'TRC20', address: addr })
    expect(!r.ok && r.error.code).toBe('CAP_EXCEEDED')
    expect(mustOk(await s.ex.limits()).withdrawCapRemainingMicroUsdt).toBe(usdtToMicro(20))
  })
  it('large withdrawals wait for manual review (hours)', async () => {
    const s = setup({ params: noCap })
    s.ex.seed({ usdt: usdtToMicro(8000) })
    const w = mustOk(await s.ex.withdrawUsdt({ amountMicroUsdt: usdtToMicro(6000), network: 'TRC20', address: s.chain.walletAddress('TRC20') }))
    s.env.sim.runUntil(s.env.clock.now() + MS.hour)
    expect(mustOk(await s.ex.withdrawal(w.withdrawalId)).status).toBe('pending')
    s.env.sim.runUntil(s.env.clock.now() + 12 * MS.hour)
    expect(['broadcast', 'completed']).toContain(mustOk(await s.ex.withdrawal(w.withdrawalId)).status)
  })
  it('lock hours change event applies to new lots', async () => {
    const s = setup({ params: noCap })
    s.regulation.applyEvent('withdrawal_lock_change', { hours: 24 })
    mustOk(await s.ex.depositIrt({ amountIrt: 10_000_000, method: 'gateway' }))
    const b = mustOk(await s.ex.buyUsdt({ irtBudget: 10_000_000 }))
    expect(b.withdrawableAt).toBe(s.env.clock.now() + 24 * MS.hour)
  })
  it('unknown withdrawal id', async () => {
    const { ex } = setup()
    const r = await ex.withdrawal('nope')
    expect(!r.ok && r.error.code).toBe('NOT_FOUND')
  })
})

describe('ExchangeSim IRT withdrawal', () => {
  it('credits our bank at the Paya cycle', async () => {
    const { ex, env, bank } = setup({ params: (p) => (p.regulatory.idDepositCapIrtPer24h = null) })
    mustOk(await ex.depositIrt({ amountIrt: 10_000_000, method: 'gateway' }))
    const bal0 = bank.balanceNow()
    const w = mustOk(await ex.withdrawIrt({ amountIrt: 5_000_000, toIban: bank.iban }))
    expect(w.feeIrt).toBe(3_000)
    expect(mustOk(await ex.balances()).irt).toBe(5_000_000 - 3_000)
    env.sim.runUntil(w.settleAt)
    expect(bank.balanceNow()).toBe(bal0 + 5_000_000)
    expect(ex.audit().ok).toBe(true)
  })
  it('validates and checks funds', async () => {
    const { ex, bank } = setup()
    expect((await ex.withdrawIrt({ amountIrt: 10, toIban: bank.iban })).ok).toBe(false)
    const r = await ex.withdrawIrt({ amountIrt: 5_000_000, toIban: bank.iban })
    expect(!r.ok && r.error.code).toBe('INSUFFICIENT_FUNDS')
  })
})

describe('ExchangeSim outages, freezes, hacks, panel', () => {
  it('random monthly outage when probability is 1 (deterministic, window in the month)', async () => {
    const { ex, env } = setup({ ex: (e) => (e.outageProbPerMonth = 1) })
    let down = 0
    for (let h = 0; h < 24 * 30; h++) {
      env.sim.runUntil(env.clock.now() + MS.hour)
      if (ex.isDown()) down++
    }
    expect(down).toBeGreaterThan(0)
    expect(down).toBeLessThan(24 * 4)
  })
  it('injected outage returns UNAVAILABLE and ends/reverts', async () => {
    const { ex, env } = setup()
    const h = ex.applyEvent('exchange_outage', { hours: 2 })
    const r = await ex.ticker()
    expect(!r.ok && r.error.code).toBe('UNAVAILABLE')
    expect((await ex.balances()).ok).toBe(false)
    env.sim.runUntil(env.clock.now() + 2 * MS.hour + 1)
    expect((await ex.ticker()).ok).toBe(true)
    const h2 = ex.applyEvent('exchange_outage', { hours: 5 })
    expect((await ex.ticker()).ok).toBe(false)
    h2?.revert()
    expect((await ex.ticker()).ok).toBe(true)
    void h
  })
  it('event with another exchange id is ignored', () => {
    const { ex } = setup()
    expect(ex.applyEvent('exchange_outage', { exchange: 'wallex', hours: 2 })).toBeNull()
    expect(ex.applyEvent('exchange_outage', { exchange: 'nobitex', hours: 2 })).not.toBeNull()
  })
  it('freeze blocks withdrawals (FROZEN) but not reading; withdrawals queued before wait', async () => {
    const { ex, env, chain } = setup({ params: (p) => (p.regulatory.idDepositCapIrtPer24h = null) })
    ex.seed({ usdt: usdtToMicro(100) })
    const addr = chain.walletAddress('TRC20')
    const w = mustOk(await ex.withdrawUsdt({ amountMicroUsdt: usdtToMicro(50), network: 'TRC20', address: addr }))
    const h = ex.applyEvent('exchange_freeze', { scope: 'withdrawals', durationDays: 3 })
    const r = await ex.withdrawUsdt({ amountMicroUsdt: usdtToMicro(20), network: 'TRC20', address: addr })
    expect(!r.ok && r.error.code).toBe('FROZEN')
    expect((await ex.balances()).ok).toBe(true)
    env.sim.runUntil(env.clock.now() + 2 * MS.day)
    expect(mustOk(await ex.withdrawal(w.withdrawalId)).status).toBe('pending')
    env.sim.runUntil(env.clock.now() + 2 * MS.day)
    expect(['broadcast', 'completed', 'failed']).toContain(mustOk(await ex.withdrawal(w.withdrawalId)).status)
    h?.revert()
  })
  it('sanctions freeze must name the exchange and can be permanent', async () => {
    const { ex } = setup()
    expect(ex.applyEvent('sanctions_freeze', {})).toBeNull()
    const h = ex.applyEvent('sanctions_freeze', { exchange: 'nobitex', durationDays: null })
    expect(h).not.toBeNull()
    const r = await ex.depositIrt({ amountIrt: 1_000_000, method: 'gateway' })
    expect(!r.ok && r.error.code).toBe('FROZEN')
    const t = await ex.buyUsdt({ irtBudget: 1_000_000 })
    expect(!t.ok && t.error.code).toBe('FROZEN')
  })
  it('hack removes a fraction of balances, halts the exchange, and returns the recovered share later; audit stays balanced', async () => {
    const { ex, env } = setup({ params: (p) => (p.regulatory.idDepositCapIrtPer24h = null) })
    mustOk(await ex.depositIrt({ amountIrt: 20_000_000, method: 'gateway' }))
    ex.seed({ usdt: usdtToMicro(1000) })
    ex.applyEvent('exchange_hack', { exchange: 'nobitex', lossFraction: 0.4, recoveredFraction: 0.5, haltDays: 5 })
    const trade = await ex.buyUsdt({ irtBudget: 1_000_000 })
    expect(!trade.ok && trade.error.code).toBe('FROZEN')
    expect((await ex.balances()).ok).toBe(true) // reads stay available
    expect(ex.balancesNow().irt).toBe(12_000_000)
    expect(ex.balancesNow().usdt).toBe(usdtToMicro(600))
    env.sim.runUntil(env.clock.now() + 6 * MS.day)
    expect(ex.balancesNow().usdt).toBe(usdtToMicro(800))
    expect(ex.balancesNow().irt).toBe(16_000_000)
    expect(ex.audit().ok).toBe(true)
  })
  it('exchanges without API reject port calls but accept the operator panel', async () => {
    const { ex } = setup({ ex: (e) => (e.apiAvailable = false), params: (p) => (p.regulatory.idDepositCapIrtPer24h = null) })
    const r = await ex.depositIrt({ amountIrt: 1_000_000, method: 'gateway' })
    expect(!r.ok && r.error.code).toBe('REJECTED')
    expect((await ex.ticker()).ok).toBe(true)
    const p = ex.panel()
    expect((await p.depositIrt({ amountIrt: 1_000_000, method: 'gateway' })).ok).toBe(true)
    expect((await p.balances()).ok).toBe(true)
  })
  it('disabled exchange is unavailable', async () => {
    const { ex } = setup({ ex: (e) => (e.enabled = false) })
    expect((await ex.ticker()).ok).toBe(false)
  })
  it('spread change event', async () => {
    const { ex } = setup()
    const t0 = mustOk(await ex.ticker())
    const h = ex.applyEvent('exchange_spread_change', { halfSpreadBps: 200 })
    const t1 = mustOk(await ex.ticker())
    expect(t1.ask / t1.bid).toBeGreaterThan((t0.ask / t0.bid) * 1.02)
    h?.revert()
    expect(mustOk(await ex.ticker())).toEqual(t0)
  })
})

describe('ExchangeSim properties', () => {
  it('conservation of IRT and USDT under random operations, and lot sum equals USDT balance', async () => {
    for (const seed of [1, 2, 3]) {
      const s = setup({ seed, bankIrt: 100_000_000_000, params: (p) => (p.regulatory.idDepositCapIrtPer24h = 60_000_000) })
      const { ex, env, chain } = s
      const rng = env.rng.fork('ops')
      for (let i = 0; i < 400; i++) {
        const k = rng.int(0, 5)
        if (k === 0) await ex.depositIrt({ amountIrt: rng.int(1, 20) * 1_000_000, method: rng.pick(['gateway', 'paya', 'satna', 'card_to_card', 'id_deposit'] as const) })
        else if (k === 1) await ex.buyUsdt({ irtBudget: rng.int(1, 30) * 1_000_000 })
        else if (k === 2) await ex.sellUsdt({ amountMicroUsdt: usdtToMicro(rng.int(1, 80)) })
        else if (k === 3) await ex.withdrawUsdt({ amountMicroUsdt: usdtToMicro(rng.int(5, 120)), network: rng.pick(['TRC20', 'BEP20', 'TON'] as const), address: '' }).catch(() => undefined)
        else if (k === 4) {
          const net = rng.pick(['TRC20', 'BEP20'] as const)
          await ex.withdrawUsdt({ amountMicroUsdt: usdtToMicro(rng.int(20, 120)), network: net, address: chain.walletAddress(net) })
        } else await ex.withdrawIrt({ amountIrt: rng.int(1, 10) * 1_000_000, toIban: s.bank.iban })
        env.sim.runUntil(env.clock.now() + rng.int(5, 600) * MS.minute)
        const a = ex.audit()
        expect(a.irtActual).toBe(a.irtExpected)
        expect(a.usdtActual).toBe(a.usdtExpected)
        expect(a.ok).toBe(true)
        expect(chain.audit().ok).toBe(true)
        expect(s.bank.audit().ok).toBe(true)
      }
    }
  })
  it('lock expiry is monotone: withdrawable never exceeds total and only grows without trades', async () => {
    const s = setup({ params: (p) => (p.regulatory.idDepositCapIrtPer24h = null) })
    for (let i = 0; i < 5; i++) {
      mustOk(await s.ex.depositIrt({ amountIrt: 5_000_000, method: 'gateway' }))
      mustOk(await s.ex.buyUsdt({ irtBudget: 5_000_000 }))
      s.env.sim.runUntil(s.env.clock.now() + 14 * MS.hour)
    }
    let prev = -1
    for (let h = 0; h < 120; h++) {
      const b = mustOk(await s.ex.balances())
      expect(b.usdtWithdrawable).toBeLessThanOrEqual(b.usdt)
      expect(b.usdtWithdrawable).toBeGreaterThanOrEqual(prev)
      prev = b.usdtWithdrawable
      s.env.sim.runUntil(s.env.clock.now() + MS.hour)
    }
    const fin = mustOk(await s.ex.balances())
    expect(fin.usdtWithdrawable).toBe(fin.usdt)
  })
  it('same seed gives identical behaviour; different seed differs', async () => {
    const run = async (seed: number) => {
      const s = setup({ seed, params: (p) => (p.regulatory.idDepositCapIrtPer24h = null) })
      mustOk(await s.ex.depositIrt({ amountIrt: 10_000_000, method: 'paya' }))
      s.env.sim.runUntil(s.env.clock.now() + 2 * MS.day)
      const b = mustOk(await s.ex.buyUsdt({ irtBudget: 5_000_000 }))
      return JSON.stringify([b, s.env.log.hash()])
    }
    expect(await run(3)).toBe(await run(3))
    expect(await run(3)).not.toBe(await run(4))
  })
})
