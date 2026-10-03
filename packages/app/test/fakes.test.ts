import { describe, expect, it } from 'vitest'
import { FakeExchange, FakeProvider, TEST_START, makeTestApp } from './fakes'
import { ManualClock, irstParts } from '@hiclaude/contracts'

const unwrap = <T>(r: { ok: boolean; value?: T; error?: { code: string } }): T => {
  if (!r.ok) throw new Error(`port error ${r.error?.code}`)
  return r.value as T
}

describe('makeTestApp', () => {
  it('starts at 2026-10-02 12:00 IRST with every port wired and params for each exchange/provider', () => {
    const t = makeTestApp()
    expect(irstParts(t.clock.now())).toMatchObject({ year: 2026, month: 10, day: 2, hour: 12, weekday: 5 })
    expect(Object.keys(t.ports.exchanges).sort()).toEqual(t.params.exchanges.map((e) => e.id).sort())
    expect(Object.keys(t.ports.providers)).toEqual(['mpay', 'altcard', 'vouchers'])
    expect(t.ports.gateways.zarinpal).toBeDefined()
    expect(t.fakes.providers.vouchers?.capabilities.issue).toBe('api')
    expect(t.fakes.providers.mpay?.capabilities.issue).toBe('panel')
    expect(TEST_START).toBe(t.clock.now())
  })

  it('accepts param overrides, a custom start and seed; isolated DB per instance', () => {
    const a = makeTestApp({ params: { pricing: { marginPct: 0.5 } }, now: 1_000_000, seed: 'x' })
    const b = makeTestApp()
    expect(a.app.params().pricing.marginPct).toBe(0.5)
    expect(a.clock.now()).toBe(1_000_000)
    a.app.services.customers.getOrCreateByPhone('09121234567')
    expect(b.app.repos.customers.count()).toBe(0)
    a.advance(5)
    expect(a.clock.now()).toBe(1_000_005)
  })

  it('close() is idempotent', () => {
    const t = makeTestApp()
    t.app.close()
    t.app.close()
    expect(t.app.db.isOpen).toBe(false)
  })
})

describe('FakeExchange', () => {
  it('buys with the taker fee, locks the USDT, and refuses early withdrawals until the lock passes', async () => {
    const clock = new ManualClock(0)
    const ex = new FakeExchange('nobitex', clock, { ask: 1_000_000, takerFeeBps: 100, irt: 10_000_000, lockHours: 72 })
    const trade = unwrap(await ex.buyUsdt({ irtBudget: 1_010_000 }))
    expect(trade.feeIrt).toBe(10_000) // B·φ/(1+φ) = 1,010,000 × 0.01/1.01
    expect(trade.usdt).toBe(1_000_000) // 1,000,000 IRT / 1,000,000 per USDT
    expect(trade.withdrawableAt).toBe(72 * 3_600_000)
    const bal = unwrap(await ex.balances())
    expect(bal).toEqual({ irt: 10_000_000 - 1_010_000, usdt: 1_000_000, usdtWithdrawable: 0 })
    ex.setBalances(ex.irt, 1_000_000, false)
    const early = await ex.withdrawUsdt({ amountMicroUsdt: 10_000_000, network: 'TRC20', address: 'T' })
    expect(early.ok).toBe(false)
  })

  it('withdraws unlocked funds (amount + fee debited) and completes after the delay', async () => {
    const clock = new ManualClock(0)
    const ex = new FakeExchange('nobitex', clock, { usdt: 50_000_000 })
    const w = unwrap(await ex.withdrawUsdt({ amountMicroUsdt: 20_000_000, network: 'TRC20', address: 'T' }))
    expect(w).toMatchObject({ status: 'pending', feeMicroUsdt: 1_000_000 })
    expect(ex.usdt).toBe(29_000_000)
    expect(unwrap(await ex.withdrawal(w.withdrawalId)).status).toBe('pending')
    clock.advance(ex.withdrawalDelayMs)
    expect(unwrap(await ex.withdrawal(w.withdrawalId)).status).toBe('completed')
    expect((await ex.withdrawUsdt({ amountMicroUsdt: 1, network: 'TRC20', address: 'T' })).ok).toBe(false) // below minimum
    expect((await ex.withdrawUsdt({ amountMicroUsdt: 20_000_000, network: 'ERC20', address: 'T' })).ok).toBe(false) // unsupported network
  })

  it('caps, closed market, insufficient funds and scripted failures', async () => {
    const clock = new ManualClock(0)
    const ex = new FakeExchange('e', clock, { irt: 5_000_000 })
    ex.setLimits({ buyCapRemainingMicroUsdt: 1_000_000 })
    const capErr = await ex.buyUsdt({ irtBudget: 4_000_000 })
    expect(!capErr.ok && capErr.error.code).toBe('CAP_EXCEEDED')
    ex.setLimits({ tradingOpen: false })
    const closed = await ex.buyUsdt({ irtBudget: 200_000 })
    expect(!closed.ok && closed.error).toMatchObject({ code: 'MARKET_CLOSED', retryable: true })
    ex.setLimits({ tradingOpen: true, buyCapRemainingMicroUsdt: null })
    const poor = await ex.buyUsdt({ irtBudget: 9_000_000 })
    expect(!poor.ok && poor.error.code).toBe('INSUFFICIENT_FUNDS')
    ex.fail('ticker', 'TIMEOUT', 2)
    expect((await ex.ticker()).ok).toBe(false)
    expect((await ex.ticker()).ok).toBe(false)
    expect((await ex.ticker()).ok).toBe(true)
    expect(ex.calls.count('ticker')).toBe(3)
    ex.fail('*', 'UNAVAILABLE')
    expect((await ex.limits()).ok).toBe(false)
  })

  it('sells at the bid and deposits respect the deposit cap', async () => {
    const clock = new ManualClock(0)
    const ex = new FakeExchange('e', clock, { bid: 990_000, takerFeeBps: 0, usdt: 2_000_000 })
    const s = unwrap(await ex.sellUsdt({ amountMicroUsdt: 1_000_000 }))
    expect(s.irt).toBe(990_000)
    expect(ex.usdt).toBe(1_000_000)
    ex.setLimits({ depositCapRemainingIrt: 1000 })
    expect((await ex.depositIrt({ amountIrt: 2000, method: 'paya' })).ok).toBe(false)
    expect(unwrap(await ex.depositIrt({ amountIrt: 800, method: 'paya' })).status).toBe('credited')
    expect(ex.limitsState.depositCapRemainingIrt).toBe(200)
  })
})

describe('other fakes', () => {
  it('FakeBank: credits, balance, transferOut', async () => {
    const t = makeTestApp()
    const b = t.fakes.bank
    const c = b.addCredit({ amountIrt: 3_000_007, senderCardMasked: '6037****1234' })
    expect(c.ref).toBe('BANK-000001')
    t.advance(1000)
    b.addCredit({ amountIrt: 5, ref: 'MY' })
    expect(unwrap(await b.listCredits({ since: t.clock.now() })).map((x) => x.ref)).toEqual(['MY'])
    expect(unwrap(await b.balance())).toBe(3_000_012)
    expect(unwrap(await b.transferOut({ toIban: 'IR1', amountIrt: 12, reason: 'x' })).ref).toBe('OUT-000002')
    expect((await b.transferOut({ toIban: 'IR1', amountIrt: 1e9, reason: 'x' })).ok).toBe(false)
  })

  it('FakeGateway: create → pending → paid → verify, amount mismatch is visible', async () => {
    const t = makeTestApp()
    const g = t.fakes.gateways.zarinpal!
    const { authority, payUrl } = unwrap(await g.create({ orderId: 'o1', amountIrt: 100_000, description: 'd', callbackUrl: 'cb' }))
    expect(payUrl).toContain(authority)
    expect(unwrap(await g.verify({ authority, amountIrt: 100_000 })).status).toBe('pending')
    g.markPaid(authority, 90_000)
    expect(unwrap(await g.verify({ authority, amountIrt: 100_000 }))).toMatchObject({ status: 'paid', amountIrt: 90_000 })
    expect(g.sessionForOrder('o1')?.verified).toBe(true)
    const a2 = unwrap(await g.create({ orderId: 'o2', amountIrt: 1, description: 'd', callbackUrl: 'cb' }))
    g.markFailed(a2.authority)
    expect(unwrap(await g.verify({ authority: a2.authority, amountIrt: 1 })).status).toBe('failed')
    expect((await g.verify({ authority: 'nope', amountIrt: 1 })).ok).toBe(false)
  })

  it('FakeChain: deposit addresses, incoming transfers, confirmations, screening, sends', async () => {
    const t = makeTestApp()
    const ch = t.fakes.chain
    const a = unwrap(await ch.allocateDepositAddress({ network: 'TRC20', orderId: 'ord_1' }))
    expect(a.address).toHaveLength(34)
    const tx = ch.addIncoming({ network: 'TRC20', to: a.address, amount: 10_000_000 })
    expect(unwrap(await ch.listIncoming({ network: 'TRC20', address: a.address, since: 0 }))).toHaveLength(1)
    expect(unwrap(await ch.txStatus({ network: 'TRC20', txHash: tx.txHash }))).toEqual({ confirmations: 0, status: 'pending' })
    ch.confirm(tx.txHash, 20)
    expect(unwrap(await ch.txStatus({ network: 'TRC20', txHash: tx.txHash })).status).toBe('confirmed')
    expect(unwrap(await ch.screenAddress({ network: 'TRC20', address: 'bad' })).risk).toBe('clear')
    ch.setScreening('bad', 'blocked', ['sdn'])
    expect(unwrap(await ch.screenAddress({ network: 'TRC20', address: 'bad' }))).toEqual({ risk: 'blocked', reasons: ['sdn'] })
    expect((await ch.send({ network: 'TRC20', to: 'X', amount: 5_000_000 })).ok).toBe(false)
    ch.setWalletBalance('TRC20', 20_000_000)
    expect(unwrap(await ch.send({ network: 'TRC20', to: 'X', amount: 5_000_000 })).feeMicroUsdt).toBe(1_000_000)
    expect(unwrap(await ch.walletBalance('TRC20'))).toBe(14_000_000)
  })

  it('FakeProvider: issue/top-up/reveal/freeze debit the balance; failures when underfunded', async () => {
    const t = makeTestApp()
    const p = t.fakes.providers.mpay as FakeProvider
    expect((await p.issueCard({ initialLoadUsdCents: 2500, label: 'x' })).ok).toBe(false)
    p.credit('0xdep', 100_000_000)
    expect(unwrap(await p.creditStatus({ txHash: '0xdep' }))).toMatchObject({ credited: true, amountMicroUsdt: 100_000_000 })
    expect(unwrap(await p.creditStatus({ txHash: 'other' })).credited).toBe(false)
    const { card, feeMicroUsdt } = unwrap(await p.issueCard({ initialLoadUsdCents: 2500, label: 'x' }))
    expect(feeMicroUsdt).toBe(4_990_000)
    expect(p.balance).toBe(100_000_000 - 25_000_000 - 4_990_000)
    const topped = unwrap(await p.topUpCard({ cardRef: card.cardRef, amountUsdCents: 1000 }))
    expect(topped.card.balanceUsdCents).toBe(3500)
    const secrets = unwrap(await p.revealCard(card.cardRef))
    expect(secrets.pan).toHaveLength(16)
    expect(secrets.pan.endsWith(card.last4)).toBe(true)
    expect(unwrap(await p.freezeCard(card.cardRef)).status).toBe('frozen')
    expect((await p.topUpCard({ cardRef: card.cardRef, amountUsdCents: 100 })).ok).toBe(false)
    expect(unwrap(await p.payVendor({ vendor: 'v', amountUsdCents: 100, reference: 'r' })).receiptRef).toMatch(/rcpt/)
    expect(unwrap(await p.accountBalance())).toBe(p.balance)
  })

  it('FakeMessenger / FakeSms / FakeIdentity', async () => {
    const t = makeTestApp()
    const tg = t.fakes.telegram
    const id = tg.makeInitData('42', { firstName: 'Ali' })
    expect(tg.verifyInitData(id)).toEqual({ ok: true, value: { userId: '42', authDate: t.clock.now(), firstName: 'Ali' } })
    expect(tg.verifyInitData('tampered').ok).toBe(false)
    unwrap(await tg.sendMessage({ chatId: '42', textFa: 'سلام' }))
    expect(tg.messagesTo('42')).toHaveLength(1)
    await t.fakes.sms.send({ phone: '0912', textFa: 'کد ۱۲۳۴۵', template: 'otp' })
    expect(t.fakes.sms.lastOtp('0912')).toBe('12345')
    const idn = t.fakes.identity
    expect(unwrap(await idn.shahkar({ nationalId: '1', phone: '2' })).match).toBe(true)
    idn.setShahkar('1', '2', false)
    expect(unwrap(await idn.shahkar({ nationalId: '1', phone: '2' })).match).toBe(false)
    idn.defaultMatch = false
    expect(unwrap(await idn.cardOwner({ cardPan: 'p', nationalId: 'n' })).match).toBe(false)
  })
})
