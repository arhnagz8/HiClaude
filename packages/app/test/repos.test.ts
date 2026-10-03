import { AppError, type RateSnapshot } from '@hiclaude/contracts'
import { describe, expect, it } from 'vitest'
import { PHONE, PHONE2, makeTestApp, mkCustomer, mkOrder, mkQuote, mkTask } from './helpers'

describe('customers repo', () => {
  it('round-trips and finds by phone / telegram / bale / referral code / national id', () => {
    const t = makeTestApp()
    const c = mkCustomer(t)
    const r = t.app.repos.customers
    r.update(c.id, { telegramId: '111', baleId: '222', nationalId: '0499370899', name: 'علی' })
    expect(r.getByPhone(PHONE)?.id).toBe(c.id)
    expect(r.getByTelegramId('111')?.name).toBe('علی')
    expect(r.getByBaleId('222')?.id).toBe(c.id)
    expect(r.getByReferralCode(c.referralCode.toLowerCase())?.id).toBe(c.id)
    expect(r.getByNationalId('0499370899')?.id).toBe(c.id)
    expect(r.get('nope')).toBeUndefined()
  })

  it('enforces uniqueness (phone, national id, telegram id) and the wallet CHECK', () => {
    const t = makeTestApp()
    const a = mkCustomer(t, PHONE)
    const b = mkCustomer(t, PHONE2)
    t.app.repos.customers.update(a.id, { nationalId: '0499370899', telegramId: '9' })
    expect(() => t.app.repos.customers.update(b.id, { nationalId: '0499370899' })).toThrow(/UNIQUE/)
    expect(() => t.app.repos.customers.update(b.id, { telegramId: '9' })).toThrow(/UNIQUE/)
    expect(() => t.app.repos.customers.insert({ ...a, id: 'dup' })).toThrow(/UNIQUE/)
  })

  it('adjusts the wallet atomically and refuses to go negative', () => {
    const t = makeTestApp()
    const c = mkCustomer(t)
    expect(t.app.repos.customers.adjustWallet(c.id, 500)).toEqual({ before: 0, after: 500 })
    expect(() => t.app.repos.customers.adjustWallet(c.id, -501)).toThrowError(AppError)
    expect(t.app.repos.customers.adjustWallet(c.id, -500).after).toBe(0)
    expect(() => t.app.repos.customers.adjustWallet('missing', 1)).toThrow(/not found/)
  })

  it('lists with filters and counts', () => {
    const t = makeTestApp()
    mkCustomer(t, PHONE)
    const b = mkCustomer(t, PHONE2)
    t.app.repos.customers.update(b.id, { tier: 'verified' })
    expect(t.app.repos.customers.list({ tier: 'verified' }).map((x) => x.id)).toEqual([b.id])
    expect(t.app.repos.customers.list({ q: '0935' })).toHaveLength(1)
    expect(t.app.repos.customers.count()).toBe(2)
  })
})

describe('orders & quotes repo', () => {
  it('round-trips a quote and an order with JSON columns', () => {
    const t = makeTestApp()
    const c = mkCustomer(t)
    const q = mkQuote(t, c.id)
    expect(t.app.repos.quotes.get(q.id)?.perMethod[0]?.lines[0]?.code).toBe('service_value')
    const o = mkOrder(t, c.id, q.id, { inputs: { cardRef: 'abc' }, riskFlags: ['velocity'] })
    const got = t.app.repos.orders.get(o.id)
    expect(got?.inputs).toEqual({ cardRef: 'abc' })
    expect(got?.riskFlags).toEqual(['velocity'])
    expect(t.app.repos.orders.getByCode(o.code)?.id).toBe(o.id)
  })

  it('idempotency key and public code are unique', () => {
    const t = makeTestApp()
    const c = mkCustomer(t)
    const q = mkQuote(t, c.id)
    const o = mkOrder(t, c.id, q.id, {}, 'idem-1')
    expect(t.app.repos.orders.getByIdempotencyKey('idem-1')?.id).toBe(o.id)
    expect(() => mkOrder(t, c.id, q.id, {}, 'idem-1')).toThrow(/UNIQUE/)
    expect(() => mkOrder(t, c.id, q.id, { code: o.code })).toThrow(/UNIQUE/)
    // many orders without a key are fine
    mkOrder(t, c.id, q.id)
    mkOrder(t, c.id, q.id)
  })

  it('optimistic versioning: stale writes get CONFLICT, version always increments', () => {
    const t = makeTestApp()
    const c = mkCustomer(t)
    const o = mkOrder(t, c.id, mkQuote(t, c.id).id)
    const u1 = t.app.repos.orders.update(o.id, { status: 'paid', paidAt: t.clock.now() }, 1)
    expect(u1.version).toBe(2)
    expect(() => t.app.repos.orders.update(o.id, { status: 'queued' }, 1)).toThrowError(/modified concurrently/)
    expect(t.app.repos.orders.update(o.id, { waitingFunding: true }).waitingFunding).toBe(true)
    expect(() => t.app.repos.orders.update('missing', { status: 'paid' })).toThrow(/not found/)
  })

  it('FK: an order needs an existing customer and quote', () => {
    const t = makeTestApp()
    const c = mkCustomer(t)
    expect(() => mkOrder(t, 'ghost', mkQuote(t, c.id).id)).toThrow(/FOREIGN KEY/)
    expect(() => mkOrder(t, c.id, 'ghost')).toThrow(/FOREIGN KEY/)
  })

  it('queries: by status, active by status, counts, created since, used today, open/completed counts', () => {
    const t = makeTestApp()
    const c = mkCustomer(t)
    const q = mkQuote(t, c.id)
    const o1 = mkOrder(t, c.id, q.id)
    const o2 = mkOrder(t, c.id, q.id, { status: 'queued', amountUsdCents: 2500 })
    mkOrder(t, c.id, q.id, { status: 'cancelled', amountUsdCents: 9999 })
    const o4 = mkOrder(t, c.id, q.id, { status: 'delivered', amountUsdCents: 500 })
    const r = t.app.repos.orders
    expect(r.listByStatus('queued').map((o) => o.id)).toEqual([o2.id])
    expect(r.listActiveByStatus(['awaiting_payment', 'queued'], 10).map((o) => o.id)).toEqual([o1.id, o2.id])
    expect(r.listActiveByStatus([], 10)).toEqual([])
    expect(r.countsByStatus()).toEqual({ awaiting_payment: 1, queued: 1, cancelled: 1, delivered: 1 })
    expect(r.createdSince(t.clock.now() - 1)).toHaveLength(4)
    expect(r.usedUsdCentsSince(c.id, t.clock.now() - 1)).toBe(1000 + 2500 + 500) // cancelled excluded
    expect(r.countOpenByCustomer(c.id)).toBe(2)
    expect(r.countCompletedByCustomer(c.id)).toBe(1)
    expect(r.listByCustomer(c.id, { limit: 2 })).toHaveLength(2)
    expect(r.list({ status: ['delivered'] })[0]?.id).toBe(o4.id)
    expect(r.count({ customerId: c.id })).toBe(4)
  })

  it('lists expired awaiting-payment orders and appends events', () => {
    const t = makeTestApp()
    const c = mkCustomer(t)
    const o = mkOrder(t, c.id, mkQuote(t, c.id).id)
    expect(t.app.repos.orders.listExpiredAwaitingPayment(t.clock.now())).toHaveLength(0)
    expect(t.app.repos.orders.listExpiredAwaitingPayment(o.payExpiresAt)).toHaveLength(1)
    t.app.repos.orders.appendEvent({ id: 'oe1', orderId: o.id, at: 5, type: 'x', from: 'awaiting_payment', to: 'paid', actor: { type: 'system' }, data: { a: 1 } })
    t.app.repos.orders.appendEvent({ id: 'oe2', orderId: o.id, at: 4, type: 'y', actor: { type: 'staff', id: 'u1' } })
    const ev = t.app.repos.orders.listEvents(o.id)
    expect(ev.map((e) => e.id)).toEqual(['oe2', 'oe1'])
    expect(ev[1]?.data).toEqual({ a: 1 })
    expect(ev[0]?.actor).toEqual({ type: 'staff', id: 'u1' })
  })
})

describe('payments / bank credits / chain transfers', () => {
  function setup() {
    const t = makeTestApp()
    const c = mkCustomer(t)
    const o = mkOrder(t, c.id, mkQuote(t, c.id).id)
    return { t, c, o }
  }

  it('payments: round trip, lookups by order/txHash/authority and uniqueness', () => {
    const { t, o } = setup()
    const base = { orderId: o.id, method: 'usdt' as const, status: 'pending' as const, currency: 'USDT' as const, expectedAmount: 10_000_000, receivedAmount: 0, feeIrt: 0, createdAt: t.clock.now() }
    const p = t.app.repos.payments.insert({ ...base, id: 'p1', network: 'TRC20', address: 'TADDR', txHash: '0xabc', receipt: { trackingNo: '1' } })
    expect(t.app.repos.payments.getByTxHash('0xabc')?.id).toBe(p.id)
    expect(t.app.repos.payments.getByAddress('TADDR')?.id).toBe('p1')
    expect(t.app.repos.payments.listByOrder(o.id)).toHaveLength(1)
    expect(() => t.app.repos.payments.insert({ ...base, id: 'p2', txHash: '0xabc' })).toThrow(/UNIQUE/)
    const g = t.app.repos.payments.insert({ ...base, id: 'p3', method: 'gateway', currency: 'IRT', gatewayId: 'zarinpal', authority: 'A1' })
    expect(t.app.repos.payments.getByAuthority('A1', 'zarinpal')?.id).toBe(g.id)
    expect(() => t.app.repos.payments.insert({ ...base, id: 'p4', method: 'gateway', currency: 'IRT', gatewayId: 'zarinpal', authority: 'A1' })).toThrow(/UNIQUE/)
    // a different gateway may reuse the authority string
    t.app.repos.payments.insert({ ...base, id: 'p5', method: 'gateway', currency: 'IRT', gatewayId: 'other', authority: 'A1' })
    const up = t.app.repos.payments.update('p1', { status: 'confirmed', receivedAmount: 10_000_000, confirmedAt: 9, receipt: { trackingNo: '2' } })
    expect(up.status).toBe('confirmed')
    expect(up.receipt?.trackingNo).toBe('2')
    expect(t.app.repos.payments.listByStatus(['pending'])).toHaveLength(2)
  })

  it('payments: unique-offset helpers', () => {
    const { t, o } = setup()
    const mk = (id: string, offset: number) =>
      t.app.repos.payments.insert({ id, orderId: o.id, method: 'card_to_card', status: 'pending', currency: 'IRT', expectedAmount: 3_000_000 + offset, receivedAmount: 0, uniqueOffsetIrt: offset, destinationCardId: 'card-1', feeIrt: 0, createdAt: 1 })
    mk('c1', 5)
    mk('c2', 9)
    expect(t.app.repos.payments.findOpenByExpectedAmount('card_to_card', 3_000_005).map((p) => p.id)).toEqual(['c1'])
    expect(t.app.repos.payments.openOffsets('card_to_card', 'card-1').sort()).toEqual([5, 9])
    expect(t.app.repos.payments.openOffsets('card_to_card', 'card-2')).toEqual([])
  })

  it('bank credits: idempotent by ref, unmatched queue, matching', () => {
    const { t } = setup()
    const r = t.app.repos.bankCredits
    const a = r.insertIfNew({ id: 'b1', ref: 'R1', amountIrt: 3_000_007, at: 100, channel: 'card_to_card', createdAt: 100 })
    expect(a.inserted).toBe(true)
    expect(r.insertIfNew({ id: 'b2', ref: 'R1', amountIrt: 1, at: 100, channel: 'card_to_card', createdAt: 100 }).inserted).toBe(false)
    r.insertIfNew({ id: 'b3', ref: 'R2', amountIrt: 500, at: 50, channel: 'paya', createdAt: 50 })
    expect(r.listUnmatched().map((c) => c.ref)).toEqual(['R2', 'R1'])
    expect(r.listUnmatched({ minAmountIrt: 1000 }).map((c) => c.ref)).toEqual(['R1'])
    expect(r.findUnmatchedByAmount(3_000_007, 0)).toHaveLength(1)
    expect(r.markMatched('R1', 'p1', 200)).toBe(true)
    expect(r.markMatched('R1', 'p2', 201)).toBe(false) // already matched
    expect(r.getByRef('R1')?.status).toBe('matched')
    expect(r.markIgnored('R2', 'noise')).toBe(true)
    expect(r.countByStatus()).toEqual({ matched: 1, ignored: 1 })
    expect(r.latestAt()).toBe(100)
  })

  it('chain transfers: upsert refreshes confirmations, lookups by address/txHash', () => {
    const { t } = setup()
    const r = t.app.repos.chainTransfers
    const base = { id: 'x1', txHash: '0x1', network: 'TRC20' as const, from: 'F', to: 'TO', amount: 5_000_000, at: 10, confirmations: 1, status: 'pending' as const, createdAt: 10 }
    expect(r.upsert(base).inserted).toBe(true)
    const again = r.upsert({ ...base, id: 'x2', confirmations: 20, status: 'confirmed' })
    expect(again.inserted).toBe(false)
    expect(again.transfer.confirmations).toBe(20)
    expect(r.getByTxHash('0x1', 'TRC20')?.status).toBe('confirmed')
    expect(r.listByAddress('TO')).toHaveLength(1)
    expect(r.listUnmatched()).toHaveLength(1)
    r.update('x1', { matchedPaymentId: 'p1', screenedRisk: 'clear' })
    expect(r.listUnmatched()).toHaveLength(0)
    // same hash on another network is a different transfer
    expect(r.upsert({ ...base, id: 'x3', network: 'BEP20' }).inserted).toBe(true)
  })
})

describe('fulfilment tasks & deliveries', () => {
  it('queue is ordered by (priority, dueAt) and filters by status', () => {
    const t = makeTestApp()
    const c = mkCustomer(t)
    const o = mkOrder(t, c.id, mkQuote(t, c.id).id)
    const a = mkTask(t, o.id, { priority: 5, dueAt: 300 })
    const b = mkTask(t, o.id, { priority: 1, dueAt: 900 })
    const d = mkTask(t, o.id, { priority: 5, dueAt: 100 })
    const x = mkTask(t, o.id, { status: 'claimed', claimedBy: 'u1', priority: 0 })
    expect(t.app.repos.tasks.queue().map((q) => q.id)).toEqual([b.id, d.id, a.id])
    expect(t.app.repos.tasks.queue({ statuses: ['claimed'] }).map((q) => q.id)).toEqual([x.id])
    expect(t.app.repos.tasks.listByClaimant('u1').map((q) => q.id)).toEqual([x.id])
    expect(t.app.repos.tasks.countsByStatus()).toEqual({ queued: 3, claimed: 1 })
  })

  it('optimistic update + overdue scan + JSON columns', () => {
    const t = makeTestApp()
    const c = mkCustomer(t)
    const o = mkOrder(t, c.id, mkQuote(t, c.id).id)
    const task = mkTask(t, o.id, { dueAt: 10 })
    expect(task.version).toBe(1)
    const u = t.app.repos.tasks.update(task.id, { status: 'done', completedAt: 5, result: { ref: 'r1' } }, 1)
    expect(u.result).toEqual({ ref: 'r1' })
    expect(() => t.app.repos.tasks.update(task.id, { status: 'failed' }, 1)).toThrow(/modified concurrently/)
    const t2 = mkTask(t, o.id, { dueAt: 10 })
    expect(t.app.repos.tasks.listOverdue(11).map((x) => x.id)).toEqual([t2.id])
    expect(t.app.repos.tasks.listOverdue(10)).toHaveLength(0)
  })

  it('deliveries store only the encrypted blob and track reveals', () => {
    const t = makeTestApp()
    const c = mkCustomer(t)
    const o = mkOrder(t, c.id, mkQuote(t, c.id).id)
    const d = t.app.repos.deliveries.insert({ id: 'd1', orderId: o.id, kind: 'card', summary: { kind: 'card', last4: '1234', revealed: false }, secretEnc: 'hc1.xxx', revealCount: 0, createdAt: 1 })
    expect(d.secretEnc).toBe('hc1.xxx')
    const u = t.app.repos.deliveries.update('d1', { revealCount: 1, lastRevealedAt: 5, summary: { kind: 'card', last4: '1234', revealed: true } })
    expect(u.summary.revealed).toBe(true)
    expect(t.app.repos.deliveries.listByOrder(o.id)).toHaveLength(1)
  })
})

describe('treasury & rates repos', () => {
  it('lots by availability and sums', () => {
    const t = makeTestApp()
    const r = t.app.repos.lots
    r.insert({ id: 'l1', exchangeId: 'nobitex', qtyMicro: 100, remainingMicro: 100, costIrt: 1000, acquiredAt: 0, withdrawableAt: 50, status: 'locked' })
    r.insert({ id: 'l2', exchangeId: 'nobitex', qtyMicro: 100, remainingMicro: 40, costIrt: 1000, acquiredAt: 1, withdrawableAt: 10, status: 'locked' })
    r.insert({ id: 'l3', exchangeId: 'tabdeal', qtyMicro: 100, remainingMicro: 0, costIrt: 1000, acquiredAt: 2, withdrawableAt: 0, status: 'withdrawn' })
    expect(r.listAvailable(20).map((l) => l.id)).toEqual(['l2'])
    expect(r.listLocked(20).map((l) => l.id)).toEqual(['l1'])
    expect(r.listAvailable(20, 'tabdeal')).toEqual([])
    expect(r.promoteUnlocked(20)).toBe(1)
    expect(r.get('l2')?.status).toBe('available')
    expect(r.sums('nobitex')).toEqual({ totalMicro: 140, costIrt: 1400 })
    expect(r.list({ includeEmpty: true })).toHaveLength(3)
    expect(r.update('l1', { remainingMicro: 0 }).remainingMicro).toBe(0)
    expect(() => r.insert({ id: 'bad', exchangeId: 'x', qtyMicro: 1, remainingMicro: -1, costIrt: 0, acquiredAt: 0, withdrawableAt: 0, status: 'locked' })).toThrow(/CHECK/)
  })

  it('treasury actions list/update', () => {
    const t = makeTestApp()
    const r = t.app.repos.treasuryActions
    r.insert({ id: 'a1', type: 'buy_usdt', at: 1, status: 'planned', exchangeId: 'nobitex', amountIrt: 100, data: { why: 'low' } })
    r.insert({ id: 'a2', type: 'withdraw_usdt', at: 2, status: 'done', network: 'TRC20', rate: 1000.5 })
    expect(r.update('a1', { status: 'done', feeIrt: 3 }).feeIrt).toBe(3)
    expect(r.list({ type: 'buy_usdt' })).toHaveLength(1)
    expect(r.list({ status: ['done'] }).map((a) => a.id)).toEqual(['a2', 'a1'])
    expect(r.get('a2')?.rate).toBe(1000.5)
    expect(r.get('a1')?.data).toEqual({ why: 'low' })
  })

  it('rate snapshots: latest / range / series', () => {
    const t = makeTestApp()
    const snap = (id: string, ts: number, mid: number): RateSnapshot => ({
      id, ts, tickers: [{ exchangeId: 'nobitex', asOf: ts, bid: mid - 1, ask: mid + 1 }], executableAsk: mid + 1, executableBid: mid - 1, mid, status: 'ok',
      volatility: { dailyPct: 0.01, driftPctPerDay: 0, windowHours: 24 }, excluded: [], notes: [],
    })
    for (let i = 1; i <= 5; i++) t.app.repos.rates.insert(snap(`s${i}`, i * 1000, 1_000_000 + i))
    expect(t.app.repos.rates.latest()?.id).toBe('s5')
    expect(t.app.repos.rates.range(2000, 4000).map((s) => s.id)).toEqual(['s2', 's3', 's4'])
    expect(t.app.repos.rates.range(0, 9999, 2).map((s) => s.id)).toEqual(['s4', 's5'])
    expect(t.app.repos.rates.series(0, 9999).map((s) => s.mid)).toEqual([1_000_001, 1_000_002, 1_000_003, 1_000_004, 1_000_005])
    expect(t.app.repos.rates.get('s3')?.mid).toBe(1_000_003)
    expect(() => t.app.repos.rates.insert(snap('s1', 1, 1))).toThrow(/UNIQUE/)
  })
})

describe('ledger repo', () => {
  const entry = (id: string, ts: number, lines: [string, number, number][], extra: object = {}) => ({
    id, ts, kind: 'E2', memo: id, lines: lines.map(([account, qty, irt]) => ({ account, qty, irt })), ...extra,
  })

  it('inserts balanced entries with ascending seq, hydrates lines and refs', () => {
    const t = makeTestApp()
    const r = t.app.repos.ledger
    const e1 = r.insertEntry(entry('je1', 10, [['1010', 100, 100], ['2010', -100, -100]], { refs: { orderId: 'o1', customerId: 'c1', channel: 'web', productFamily: 'gift_card' } }))
    const e2 = r.insertEntry(entry('je2', 20, [['1010', 50, 50], ['2010', -50, -50]]))
    expect(e2.seq).toBeGreaterThan(e1.seq)
    const got = r.getEntry('je1')
    expect(got?.lines).toHaveLength(2)
    expect(got?.refs?.orderId).toBe('o1')
    expect(r.listEntries({ orderId: 'o1' }).map((e) => e.id)).toEqual(['je1'])
    expect(r.listEntries({ productFamily: 'gift_card' })).toHaveLength(1)
    expect(r.listEntries({ account: '2010' })).toHaveLength(2)
    expect(r.listEntries({ from: 15 }).map((e) => e.id)).toEqual(['je2'])
    expect(r.listEntries({ order: 'desc', limit: 1 })[0]?.id).toBe('je2')
    expect(r.listEntries({ afterSeq: e1.seq }).map((e) => e.id)).toEqual(['je2'])
    expect(r.listEntries({ kind: ['E2'] })).toHaveLength(2)
  })

  it('rejects unbalanced / non-integer / empty entries and keeps the ledger balanced', () => {
    const t = makeTestApp()
    const r = t.app.repos.ledger
    expect(() => r.insertEntry(entry('bad1', 1, [['1010', 100, 100], ['2010', -99, -99]]))).toThrow(/unbalanced/)
    expect(() => r.insertEntry(entry('bad2', 1, [['1010', 1.5, 1.5], ['2010', -1.5, -1.5]]))).toThrow(/integers/)
    expect(() => r.insertEntry(entry('bad3', 1, []))).toThrow(/no lines/)
    expect(r.countEntries()).toBe(0)
    r.insertEntry(entry('ok', 1, [['1010', 5, 5], ['2010', -5, -5]]))
    expect(() => r.insertEntry(entry('ok', 2, [['1010', 5, 5], ['2010', -5, -5]]))).toThrow(/UNIQUE/)
    expect(r.totalImbalance()).toBe(0)
  })

  it('sums by account over a range, supports prefix match and USDT qty with revaluation lines', () => {
    const t = makeTestApp()
    const r = t.app.repos.ledger
    r.insertEntry(entry('a', 10, [['1110:nobitex', 1_000_000, 1000], ['1010', -1000, -1000]]))
    r.insertEntry(entry('b', 20, [['1110:nobitex', 0, 50], ['7010', 0, -50]], { kind: 'E11' }))
    r.insertEntry(entry('c', 30, [['1110:tabdeal', 2_000_000, 2000], ['1010', -2000, -2000]]))
    const all = Object.fromEntries(r.sumByAccount().map((s) => [s.account, s]))
    expect(all['1110:nobitex']).toMatchObject({ qty: 1_000_000, irt: 1050 })
    expect(all['1010']?.irt).toBe(-3000)
    expect(r.sumByAccount({ accountPrefix: '1110' }).map((s) => s.account)).toEqual(['1110:nobitex', '1110:tabdeal'])
    expect(r.sumByAccount({ from: 15, to: 25 }).map((s) => s.account).sort()).toEqual(['1110:nobitex', '7010'])
    expect(r.sumByAccount({ kind: 'E11' }).find((s) => s.account === '7010')?.creditIrt).toBe(50)
    expect(r.balance('1110:nobitex')).toEqual({ qty: 1_000_000, irt: 1050 })
    expect(r.balance('1110:nobitex', 15)).toEqual({ qty: 1_000_000, irt: 1000 })
    expect(r.listEntries({ accountPrefix: '1110', from: 25 }).map((e) => e.id)).toEqual(['c'])
  })

  it('stores the chart of accounts registry', () => {
    const t = makeTestApp()
    t.app.repos.ledger.upsertAccount({ code: '1010', name: 'BANK_IRT', type: 'asset', currency: 'IRT' })
    t.app.repos.ledger.upsertAccount({ code: '1010', name: 'BANK', type: 'asset', currency: 'IRT' })
    expect(t.app.repos.ledger.listAccounts()).toEqual([{ code: '1010', name: 'BANK', type: 'asset', currency: 'IRT' }])
    expect(() => t.app.repos.ledger.upsertAccount({ code: 'x', name: 'x', type: 'asset', currency: 'EUR' as never })).toThrow(/CHECK/)
  })
})

describe('platform repos', () => {
  it('settings: put bumps version, audits, supports expectedVersion and delete', () => {
    const t = makeTestApp()
    const r = t.app.repos.settings
    expect(r.put('flag.a', { x: 1 }, { now: 1, actor: 'u' }).version).toBe(1)
    expect(r.put('flag.a', { x: 2 }, { now: 2, actor: 'u', reason: 'why' }).version).toBe(2)
    expect(() => r.put('flag.a', 3, { now: 3, expectedVersion: 1 })).toThrow(/modified concurrently/)
    expect(r.put('flag.a', 3, { now: 3, expectedVersion: 2 }).value).toBe(3)
    expect(() => r.put('flag.b', 1, { now: 3, expectedVersion: 5 })).toThrow(/modified concurrently/)
    const audit = r.listAudit({ key: 'flag.a' })
    expect(audit.map((a) => a.version)).toEqual([3, 2, 1])
    expect(audit[1]).toMatchObject({ oldValue: { x: 1 }, newValue: { x: 2 }, reason: 'why', actor: 'u' })
    expect(r.list('flag')).toHaveLength(1)
    expect(r.delete('flag.a', { now: 9 })).toBe(true)
    expect(r.get('flag.a')).toBeUndefined()
    expect(r.delete('flag.a', { now: 9 })).toBe(false)
  })

  it('users and audit log', () => {
    const t = makeTestApp({ appOptions: { seedDemoStaff: false } })
    const u = t.app.repos.users.insert({ id: 'u1', username: 'bob', name: 'Bob', role: 'support', passwordHash: 'h', active: true, failedLogins: 0, createdAt: 1 })
    expect(u.active).toBe(true)
    expect(() => t.app.repos.users.insert({ ...u, id: 'u2' })).toThrow(/UNIQUE/)
    expect(() => t.app.repos.users.insert({ ...u, id: 'u3', username: 'x', role: 'god' as never })).toThrow(/CHECK/)
    expect(t.app.repos.users.update('u1', { active: false, failedLogins: 2 }).active).toBe(false)
    t.app.repos.audit.append({ at: 1, actorType: 'staff', actorId: 'u1', action: 'order.refund', target: 'o1', data: { amount: 5 } })
    t.app.repos.audit.append({ at: 2, actorType: 'system', action: 'job.run' })
    expect(t.app.repos.audit.list({ actorId: 'u1' })).toHaveLength(1)
    expect(t.app.repos.audit.list({ actionPrefix: 'order.' })[0]?.data).toEqual({ amount: 5 })
    expect(t.app.repos.audit.list()[0]?.action).toBe('job.run')
  })

  it('notifications queue: pending, retry due, dedupe uniqueness, read state', () => {
    const t = makeTestApp()
    const c = mkCustomer(t)
    const r = t.app.repos.notifications
    const base = { groupId: 'g', customerId: c.id, event: 'order.paid', critical: false, text: 't', attempts: 0, createdAt: 10 }
    r.insert({ ...base, id: 'n1', channel: 'telegram', target: '1', status: 'pending', dedupeKey: 'k' })
    r.insert({ ...base, id: 'n2', channel: 'sms', target: PHONE, status: 'retry', nextAttemptAt: 100 })
    r.insert({ ...base, id: 'n3', channel: 'in_app', status: 'delivered', dedupeKey: 'k' })
    expect(() => r.insert({ ...base, id: 'n4', channel: 'telegram', status: 'pending', dedupeKey: 'k' })).toThrow(/UNIQUE/)
    expect(r.listPending().map((n) => n.id)).toEqual(['n1'])
    expect(r.listRetryDue(99)).toHaveLength(0)
    expect(r.listRetryDue(100).map((n) => n.id)).toEqual(['n2'])
    expect(r.getByDedupe('k', 'in_app')?.id).toBe('n3')
    expect(r.listForCustomer(c.id, { unreadOnly: true }).map((n) => n.id)).toContain('n3')
    expect(r.markRead(c.id, 'all', 50)).toBeGreaterThanOrEqual(1)
    expect(r.listForCustomer(c.id, { unreadOnly: true })).toHaveLength(0)
    expect(r.countByStatus()).toMatchObject({ pending: 1, retry: 1 })
    expect(r.get('n3')?.status).toBe('read')
  })

  it('tickets, kpi_daily upsert/range, jobs_state, kill switches, alerts, referrals, sessions, otps, products', () => {
    const t = makeTestApp()
    const c = mkCustomer(t)
    // tickets
    t.app.repos.tickets.insert({ id: 't1', customerId: c.id, subject: 's', status: 'open', createdAt: 1, updatedAt: 1 })
    t.app.repos.tickets.addMessage({ id: 'm1', ticketId: 't1', at: 2, fromKind: 'customer', text: 'hi' })
    t.app.repos.tickets.addMessage({ id: 'm2', ticketId: 't1', at: 3, fromKind: 'staff', authorId: 'u', text: 'yo' })
    expect(t.app.repos.tickets.listMessages('t1').map((m) => m.id)).toEqual(['m1', 'm2'])
    expect(t.app.repos.tickets.update('t1', { status: 'closed', updatedAt: 9 }).status).toBe('closed')
    expect(t.app.repos.tickets.list({ status: 'closed' })).toHaveLength(1)
    // kpi
    const kpi = (date: string, orders: number) => ({ date, orders } as never)
    t.app.repos.kpi.upsert(kpi('2026-10-01', 3), 1)
    t.app.repos.kpi.upsert(kpi('2026-10-01', 4), 2)
    t.app.repos.kpi.upsert(kpi('2026-10-02', 5), 2)
    expect(t.app.repos.kpi.range('2026-10-01', '2026-10-02')).toHaveLength(2)
    expect((t.app.repos.kpi.get('2026-10-01') as unknown as { orders: number }).orders).toBe(4)
    // jobs_state
    t.app.repos.jobsState.upsert({ name: 'jobx', runs: 1, failures: 0, lastRunAt: 5 })
    expect(t.app.repos.jobsState.get('jobx')?.lastRunAt).toBe(5)
    // kill switches
    t.app.repos.killSwitches.set({ scope: 'provider', scopeId: 'mpay', active: true, reason: 'x', now: 1 })
    expect(t.app.repos.killSwitches.isActive('provider', 'mpay')).toBe(true)
    expect(t.app.repos.killSwitches.isActive('provider', 'other')).toBe(false)
    t.app.repos.killSwitches.set({ scope: 'provider', scopeId: 'mpay', active: false, now: 2 })
    expect(t.app.repos.killSwitches.list(true)).toHaveLength(0)
    // alerts
    const al = t.app.repos.alerts.insert({ id: 'a1', at: 1, lastAt: 1, count: 1, severity: 'warning', code: 'X', messageFa: 'm' })
    expect(t.app.repos.alerts.findOpenByCode('X', 0)?.id).toBe(al.id)
    expect(t.app.repos.alerts.bump('a1', 5).count).toBe(2)
    expect(t.app.repos.alerts.ack('a1', 'u', 6).ackedBy).toBe('u')
    expect(t.app.repos.alerts.resolve('a1', 7).resolvedAt).toBe(7)
    expect(t.app.repos.alerts.countOpen()).toBe(0)
    expect(() => t.app.repos.alerts.insert({ ...al, id: 'a2', severity: 'bad' as never })).toThrow(/CHECK/)
    // referrals constraint
    const c2 = mkCustomer(t, PHONE2)
    expect(() => t.app.repos.referrals.insert({ id: 'r0', referrerId: c.id, referredId: c.id, code: 'X', status: 'attributed', rewardIrt: 0, createdAt: 1 })).toThrow(/CHECK/)
    t.app.repos.referrals.insert({ id: 'r1', referrerId: c.id, referredId: c2.id, code: 'X', status: 'attributed', rewardIrt: 0, createdAt: 1 })
    expect(() => t.app.repos.referrals.insert({ id: 'r2', referrerId: c.id, referredId: c2.id, code: 'X', status: 'attributed', rewardIrt: 0, createdAt: 1 })).toThrow(/UNIQUE/)
    // sessions
    t.app.repos.sessions.insert({ tokenHash: 'h1', subjectKind: 'customer', subjectId: c.id, createdAt: 1, expiresAt: 10, lastSeenAt: 1, meta: {} })
    expect(t.app.repos.sessions.revoke('h1', 5)).toBe(true)
    expect(t.app.repos.sessions.revoke('h1', 6)).toBe(false)
    expect(t.app.repos.sessions.deleteExpired(100_000_000)).toBe(1)
    // otps
    t.app.repos.otps.insert({ id: 'o1', phone: PHONE, codeHash: 'x', purpose: 'login', createdAt: 5, expiresAt: 50, attempts: 0 })
    expect(t.app.repos.otps.incrementAttempts('o1')).toBe(1)
    expect(t.app.repos.otps.consume('o1', 6)).toBe(true)
    expect(t.app.repos.otps.consume('o1', 7)).toBe(false)
    // products + overrides
    const p = t.app.repos.products.get('gift-steam')
    expect(p?.titleFa).toContain('استیم')
    t.app.repos.products.putOverride({ productId: 'gift-steam', active: false, slaMinutes: { normal: 5 }, updatedAt: 1 })
    expect(t.app.repos.products.getOverride('gift-steam')).toMatchObject({ active: false, slaMinutes: { normal: 5 } })
  })

  it('JSON columns are validated at the boundary (corrupt rows throw)', () => {
    const t = makeTestApp()
    const c = mkCustomer(t)
    t.app.db.run("UPDATE customers SET flags_json = '{bad' WHERE id = ?", [c.id])
    expect(() => t.app.repos.customers.get(c.id)).toThrow(/corrupt JSON/)
    t.app.db.run("UPDATE customers SET flags_json = '{\"a\":1}' WHERE id = ?", [c.id])
    expect(() => t.app.repos.customers.get(c.id)).toThrow(/invalid customers.flags_json/)
    expect(() => t.app.repos.customers.update(c.id, { flags: [1] as never })).toThrow(/invalid customer.flags/)
  })
})
