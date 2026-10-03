import { describe, expect, it } from 'vitest'
import { createRng, type JournalEntry, type JournalEntryInput, type Period } from '@hiclaude/contracts'
import { CHART_OF_ACCOUNTS, accountMeta, acct, chartAsLedgerAccounts, isCashAccount, isUsdtAccount, salesAccountForKind, splitAccount } from './accounts'
import { LedgerBook, revaluationEntry, validateEntry } from './book'
import * as T from './templates'
import { applyMovements, balancesFromEntries, buildBalanceSheet, buildCashFlow, buildIncomeStatement, buildStatements, movementsFromEntries, realTerms, usdTerms } from './statements'

const TS = Date.UTC(2026, 9, 2, 8, 0, 0)
const sumIrt = (e: JournalEntryInput): number => e.lines.reduce((a, l) => a + l.irt, 0)

// ───────────────────────────────── chart of accounts ─────────────────────────────────
describe('chart of accounts', () => {
  it('contains exactly the architecture §5.2 codes', () => {
    const codes = CHART_OF_ACCOUNTS.map((a) => a.code)
    const expected = [
      '1010', '1020', '1100', '1110', '1120', '1130', '1200', '1300', '1400',
      '2010', '2020', '2030', '2100', '2110', '2200',
      '3010', '3020', '3900',
      '4010', '4020', '4030', '4040', '4050', '4060', '4900',
      '5010', '5020', '5030', '5040', '5050', '5060',
      '6010', '6020', '6030', '6040', '6050', '6060', '6070', '6080', '6090', '6100',
      '7010', '7020', '8010',
    ]
    expect(codes).toEqual(expected)
    expect(new Set(codes).size).toBe(codes.length)
  })

  it('acct() builds qualified codes and rejects misuse', () => {
    expect(acct('1110', 'nobitex')).toBe('1110:nobitex')
    expect(acct('1200', 'mpay')).toBe('1200:mpay')
    expect(acct('1010')).toBe('1010')
    expect(() => acct('1110')).toThrow(RangeError)
    expect(() => acct('1010', 'x')).toThrow(RangeError)
    expect(() => acct('9999')).toThrow(RangeError)
    expect(() => acct('1100', 'a:b')).toThrow(RangeError)
  })

  it('accountMeta gives type/currency/normal balance', () => {
    expect(accountMeta('1110:tabdeal')).toMatchObject({ base: '1110', qualifier: 'tabdeal', type: 'asset', currency: 'USDT', normal: 'debit' })
    expect(accountMeta('2010')).toMatchObject({ type: 'liability', currency: 'IRT', normal: 'credit' })
    expect(accountMeta('4900')).toMatchObject({ type: 'revenue', contra: true, normal: 'debit' })
    expect(accountMeta('3020')).toMatchObject({ type: 'equity', contra: true, normal: 'debit' })
    expect(accountMeta('7010').type).toBe('other')
    expect(() => accountMeta('1110')).toThrow(RangeError)
    expect(() => accountMeta('1010:x')).toThrow(RangeError)
    expect(() => accountMeta('nope')).toThrow(RangeError)
  })

  it('USDT accounts: 1110, 1120, 1130, 1200 only', () => {
    const usdt = CHART_OF_ACCOUNTS.filter((a) => a.currency === 'USDT').map((a) => a.code)
    expect(usdt).toEqual(['1110', '1120', '1130', '1200'])
    expect(isUsdtAccount('1120')).toBe(true)
    expect(isUsdtAccount('1100:nobitex')).toBe(false)
  })

  it('cash accounts and helpers', () => {
    expect(isCashAccount('1010')).toBe(true)
    expect(isCashAccount('1020')).toBe(true)
    expect(isCashAccount('1100:nobitex')).toBe(true)
    expect(isCashAccount('1110:nobitex')).toBe(false)
    expect(splitAccount('1110:x')).toEqual({ base: '1110', qualifier: 'x' })
    expect(chartAsLedgerAccounts().length).toBe(CHART_OF_ACCOUNTS.length)
    expect(salesAccountForKind('voucher')).toBe('4030')
    expect(salesAccountForKind('weird')).toBe('4060')
  })
})

// ───────────────────────────────── LedgerBook ─────────────────────────────────
describe('LedgerBook', () => {
  it('rejects unbalanced, empty, non-integer and unknown-account entries without changing state', () => {
    const b = new LedgerBook()
    const bad: JournalEntryInput[] = [
      { ts: TS, kind: 'X', memo: '', lines: [{ account: '1010', qty: 100, irt: 100 }] },
      { ts: TS, kind: 'X', memo: '', lines: [] },
      { ts: TS, kind: 'X', memo: '', lines: [{ account: '1010', qty: 1.5, irt: 1.5 }, { account: '3010', qty: -1.5, irt: -1.5 }] },
      { ts: TS, kind: 'X', memo: '', lines: [{ account: '9999', qty: 1, irt: 1 }, { account: '3010', qty: -1, irt: -1 }] },
      { ts: TS, kind: 'X', memo: '', lines: [{ account: '1010', qty: 100, irt: 90 }, { account: '3010', qty: -90, irt: -90 }] }, // IRT qty ≠ irt
      { ts: TS, kind: 'X', memo: '', lines: [{ account: '1120', qty: 5, irt: -5 }, { account: '3010', qty: 5, irt: 5 }] }, // USDT debit w/ negative book
    ]
    for (const e of bad) expect(() => b.post(e)).toThrow(RangeError)
    expect(b.balances()).toEqual([])
    expect(b.entries().length).toBe(0)
  })

  it('posts valid entries, assigns seq/id and keeps balances', () => {
    const b = new LedgerBook()
    const e = b.post(T.ownerCapital({ ts: TS, amountIrt: 1_000_000 }))
    expect(e.seq).toBe(1)
    expect(e.id).toBe('je_1')
    expect(b.balance('1010')).toEqual({ qty: 1_000_000, irt: 1_000_000 })
    expect(b.balance('3010')).toEqual({ qty: -1_000_000, irt: -1_000_000 })
    expect(b.post({ ...T.ownerDrawings({ ts: TS, amountIrt: 1 }), id: 'custom' }).id).toBe('custom')
    expect(b.entries().length).toBe(2)
  })

  it('USDT accounts cannot go negative or keep residual book value at zero quantity', () => {
    const b = new LedgerBook()
    b.post(T.ownerCapital({ ts: TS, amountIrt: 1_000_000_000 }))
    b.post(T.exchangeDeposit({ ts: TS, exchangeId: 'x', amountIrt: 500_000_000 }))
    b.post(T.exchangeBuy({ ts: TS, exchangeId: 'x', spentIrt: 100_000_000, feeIrt: 300_000, qtyMicro: 387_000_000, midRate: 256_000 }))
    const book = b.balance('1110:x').irt
    // over-withdrawal
    expect(() => b.post(T.exchangeWithdrawalEntry({ ts: TS, exchangeId: 'x', qtyMicro: 400_000_000, feeMicro: 0, bookOutIrt: 1, bookFeeIrt: 0 }))).toThrow(/negative USDT/)
    // taking the whole quantity but not the whole book
    expect(() => b.post(T.exchangeWithdrawalEntry({ ts: TS, exchangeId: 'x', qtyMicro: 387_000_000, feeMicro: 0, bookOutIrt: book - 1, bookFeeIrt: 0 }))).toThrow(/residual book/)
    // with disposeCost it works
    b.post(T.buildExchangeWithdrawal(b, { ts: TS, exchangeId: 'x', qtyMicro: 386_000_000, feeMicro: 1_000_000 }))
    expect(b.balance('1110:x')).toEqual({ qty: 0, irt: 0 })
  })

  it('weighted-average cost: disposals consume proportional book, rounding never leaks value', () => {
    const b = new LedgerBook()
    b.post(T.ownerCapital({ ts: TS, amountIrt: 1_000_000_000 }))
    b.post(T.usdtPaymentConfirmed({ ts: TS, qtyMicro: 100_000_000, midRate: 250_000 })) // book 25,000,000
    b.post(T.usdtPaymentConfirmed({ ts: TS, qtyMicro: 50_000_000, midRate: 262_000 })) // book 13,100,000
    const w = b.balance('1120')
    expect(w).toEqual({ qty: 150_000_000, irt: 38_100_000 })
    // avg 254,000 / USDT
    expect(b.disposeCost('1120', 30_000_000)).toBe(7_620_000)
    expect(b.disposeCost('1120', 0)).toBe(0)
    expect(b.disposeCost('1120', 150_000_000)).toBe(38_100_000)
    expect(() => b.disposeCost('1120', 150_000_001)).toThrow(RangeError)
    expect(() => b.disposeCost('1010', 1)).toThrow(RangeError)
    // dispose in 7 odd chunks: Σ cost == total book exactly (last chunk takes the remainder by construction)
    const rng = createRng('wavg')
    let remaining = w.qty
    let totalCost = 0
    while (remaining > 0) {
      const q = Math.min(remaining, rng.int(1, 40_000_000))
      const cost = b.disposeCost('1120', q)
      b.post(T.providerSweepEntry({ ts: TS, providerId: 'p', qtyMicro: q, from: '1120', bookIrt: cost }))
      totalCost += cost
      remaining -= q
    }
    expect(totalCost).toBe(38_100_000)
    expect(b.balance('1120')).toEqual({ qty: 0, irt: 0 })
    expect(b.balance('1200:p')).toEqual({ qty: 150_000_000, irt: 38_100_000 })
  })

  it('trial balance always balances and lists debit/credit columns', () => {
    const b = new LedgerBook()
    b.post(T.ownerCapital({ ts: TS, amountIrt: 5_000 }))
    b.post(T.opexEntry({ ts: TS, expenseAccount: '6030', amountIrt: 1_200 }))
    const tb = b.trialBalance()
    expect(tb.difference).toBe(0)
    expect(tb.totalDebitIrt).toBe(tb.totalCreditIrt)
    expect(tb.rows.find((r) => r.account === '1010')).toMatchObject({ debitIrt: 3_800, creditIrt: 0 })
    expect(tb.rows.find((r) => r.account === '3010')).toMatchObject({ debitIrt: 0, creditIrt: 5_000 })
  })

  it('revalue (E11): gain → Dr account (qty 0), Cr 7010; loss mirrors; no change → empty entry', () => {
    const b = new LedgerBook()
    b.post(T.usdtPaymentConfirmed({ ts: TS, qtyMicro: 100_000_000, midRate: 250_000 })) // book 25,000,000
    const gain = b.revalue(undefined, 260_000, TS + 1)
    expect(gain.kind).toBe('E11')
    expect(gain.lines).toEqual([
      { account: '1120', qty: 0, irt: 1_000_000 },
      { account: '7010', qty: -1_000_000, irt: -1_000_000 },
    ])
    b.post(gain)
    expect(b.balance('1120')).toEqual({ qty: 100_000_000, irt: 26_000_000 })
    expect(b.balance('7010').irt).toBe(-1_000_000) // credit = gain
    // no-op
    expect(b.revalue(undefined, 260_000, TS + 2).lines).toEqual([])
    expect(() => b.post(b.revalue(undefined, 260_000, TS + 2))).toThrow(/no lines/)
    // loss
    const loss = b.revalue(['1120'], 255_000, TS + 3)
    expect(loss.lines).toEqual([
      { account: '1120', qty: 0, irt: -500_000 },
      { account: '7010', qty: 500_000, irt: 500_000 },
    ])
    b.post(loss)
    expect(b.balance('7010').irt).toBe(-500_000)
    expect(b.equation().check).toBe(0)
    // half-up: qty·mid/1e6 = 0.5 → 1
    const tiny = new LedgerBook()
    tiny.post(T.usdtPaymentConfirmed({ ts: TS, qtyMicro: 1, midRate: 500_000 })) // 0.5 → 1 book
    expect(tiny.balance('1120').irt).toBe(1)
  })

  it('revalue rejects non-USDT accounts and bad rates; skips empty accounts', () => {
    const b = new LedgerBook()
    expect(() => b.revalue(['1010'], 1, TS)).toThrow(RangeError)
    expect(() => b.revalue(undefined, 0, TS)).toThrow(RangeError)
    expect(b.revalue(['1120'], 250_000, TS).lines).toEqual([])
  })

  it('revalue handles several accounts with mixed gain/loss in one balanced entry', () => {
    const b = new LedgerBook()
    b.post(T.usdtPaymentConfirmed({ ts: TS, qtyMicro: 100_000_000, midRate: 250_000 }))
    b.post(T.providerSweepEntry({ ts: TS, providerId: 'p', qtyMicro: 40_000_000, from: '1120', bookIrt: b.disposeCost('1120', 40_000_000) }))
    // 1120: 60M micro book 15M ; 1200:p: 40M micro book 10M
    const e = revaluationEntry(b.balances(), undefined, 240_000, TS + 1)
    expect(sumIrt(e)).toBe(0)
    expect(e.lines.find((l) => l.account === '1120')!.irt).toBe(14_400_000 - 15_000_000)
    expect(e.lines.find((l) => l.account === '1200:p')!.irt).toBe(9_600_000 - 10_000_000)
    b.post(e)
    expect(b.balance('7010').irt).toBe(1_000_000) // loss, debit
  })

  it('snapshot / restore round-trips', () => {
    const b = new LedgerBook()
    b.post(T.ownerCapital({ ts: TS, amountIrt: 1_000 }))
    b.post(T.usdtPaymentConfirmed({ ts: TS, qtyMicro: 5_000_000, midRate: 100_000 }))
    const snap = JSON.parse(JSON.stringify(b.snapshot()))
    const c = new LedgerBook()
    c.restore(snap)
    expect(c.balances()).toEqual(b.balances())
    expect(c.entries().length).toBe(2)
    c.post(T.opexEntry({ ts: TS, expenseAccount: '6010', amountIrt: 10 }))
    expect(c.entries()[2]!.seq).toBe(3)
    expect(b.entries().length).toBe(2) // original untouched
  })

  it('validateEntry is usable standalone', () => {
    expect(() => validateEntry(T.walletTopUp({ ts: TS, amountIrt: 5 }))).not.toThrow()
    expect(() => validateEntry({ ts: TS, kind: 'X', memo: '', lines: [{ account: '1010', qty: 1, irt: 1 }] })).toThrow(/unbalanced/)
  })
})

// ───────────────────────────────── templates ─────────────────────────────────
describe('posting templates', () => {
  it('E1 gateway verified / E1b settlement', () => {
    const e1 = T.gatewayPaymentVerified({ ts: TS, grossIrt: 30_615_000, feeIrt: 16_000 })
    expect(e1.kind).toBe('E1')
    expect(e1.lines).toEqual([
      { account: '1020', qty: 30_599_000, irt: 30_599_000 },
      { account: '5040', qty: 16_000, irt: 16_000 },
      { account: '2010', qty: -30_615_000, irt: -30_615_000 },
    ])
    const e1b = T.gatewaySettlement({ ts: TS, netIrt: 30_599_000 })
    expect(e1b.lines[0]).toEqual({ account: '1010', qty: 30_599_000, irt: 30_599_000 })
    expect(() => T.gatewayPaymentVerified({ ts: TS, grossIrt: 10, feeIrt: 11 })).toThrow(RangeError)
  })

  it('E2/E4/E17/E14/E15 simple IRT templates', () => {
    expect(T.cardToCardConfirmed({ ts: TS, amountIrt: 5 }).lines.map((l) => l.account)).toEqual(['1010', '2010'])
    expect(T.walletSpend({ ts: TS, amountIrt: 5 }).lines.map((l) => l.account)).toEqual(['2020', '2010'])
    expect(T.walletTopUp({ ts: TS, amountIrt: 5, source: '1020' }).lines.map((l) => l.account)).toEqual(['1020', '2020'])
    expect(T.ownerDrawings({ ts: TS, amountIrt: 5 }).lines.map((l) => l.account)).toEqual(['3020', '1010'])
    expect(T.taxAccrual({ ts: TS, amountIrt: 5 }).lines.map((l) => l.account)).toEqual(['8010', '2110'])
    expect(T.taxPayment({ ts: TS, amountIrt: 5, liability: '2100' }).lines.map((l) => l.account)).toEqual(['2100', '1010'])
    expect(T.opexEntry({ ts: TS, expenseAccount: '6010', amountIrt: 5, accrued: true }).lines.map((l) => l.account)).toEqual(['6010', '2200'])
    expect(T.accruedExpensePayment({ ts: TS, amountIrt: 5 }).lines.map((l) => l.account)).toEqual(['2200', '1010'])
    expect(() => T.opexEntry({ ts: TS, expenseAccount: '1010', amountIrt: 5 })).toThrow(RangeError)
  })

  it('E3 USDT payment: value at mid rounds half-up', () => {
    const e = T.usdtPaymentConfirmed({ ts: TS, qtyMicro: 100_000_001, midRate: 256_500.5 })
    expect(e.lines[0]).toEqual({ account: '1120', qty: 100_000_001, irt: 25_650_050 }) // 25,650,050.25… → half-up
    expect(e.lines[1]!.irt).toBe(-25_650_050)
  })

  it('E5 delivery: revenue split (sales / rush / VAT), discount contra, COGS split face vs fees at book', () => {
    const e = T.deliveryEntry({ ts: TS, priceIrt: 31_100_000, vatIrt: 1_000_000, rushIrt: 500_000, discountIrt: 100_000, revenueAccount: '4020', providerId: 'mpay', faceMicro: 100_000_000, feesMicro: 3_550_000, bookIrt: 26_000_000 })
    const get = (a: string) => e.lines.find((l) => l.account === a)?.irt
    expect(get('2010')).toBe(31_100_000)
    expect(get('4900')).toBe(100_000)
    expect(get('4020')).toBe(-(31_100_000 - 1_000_000 - 500_000 + 100_000))
    expect(get('4050')).toBe(-500_000)
    expect(get('2100')).toBe(-1_000_000)
    expect(get('5010')! + get('5020')!).toBe(26_000_000)
    expect(get('5010')).toBe(Math.round((26_000_000 * 100_000_000) / 103_550_000))
    expect(e.lines.find((l) => l.account === '1200:mpay')).toEqual({ account: '1200:mpay', qty: -103_550_000, irt: -26_000_000 })
    expect(sumIrt(e)).toBe(0)
  })

  it('E5 rejects non-sales revenue accounts, negative gross and orphan book value', () => {
    const base = { ts: TS, priceIrt: 100, providerId: 'p', faceMicro: 0, feesMicro: 0, bookIrt: 0, revenueAccount: '4020' }
    expect(T.deliveryEntry(base).lines.length).toBe(2) // service with no USDT cost
    expect(() => T.deliveryEntry({ ...base, revenueAccount: '4900' })).toThrow(RangeError)
    expect(() => T.deliveryEntry({ ...base, revenueAccount: '5010' })).toThrow(RangeError)
    expect(() => T.deliveryEntry({ ...base, vatIrt: 200 })).toThrow(RangeError)
    expect(() => T.deliveryEntry({ ...base, bookIrt: 5 })).toThrow(RangeError)
  })

  it('E6 sweep with network fee: from 1120 splits the combined book exactly; from 1130 uses separate accounts', () => {
    const b = new LedgerBook()
    b.post(T.usdtPaymentConfirmed({ ts: TS, qtyMicro: 300_000_000, midRate: 255_333 }))
    const e = T.buildProviderSweep(b, { ts: TS, providerId: 'mpay', qtyMicro: 200_000_000, from: '1120', networkFeeMicro: 1_000_000 })
    const total = b.disposeCost('1120', 201_000_000)
    expect(-e.lines.filter((l) => l.account === '1120').reduce((a, l) => a + l.irt, 0)).toBe(total)
    expect(e.lines.find((l) => l.account === '5030')!.irt).toBeGreaterThan(0)
    b.post(e)
    expect(b.balance('1120').qty).toBe(99_000_000)
    expect(b.balance('1200:mpay').qty).toBe(200_000_000)
    expect(b.equation().check).toBe(0)
    // from in-transit: fee is still paid from the hot wallet
    const b2 = new LedgerBook()
    b2.post(T.usdtPaymentConfirmed({ ts: TS, qtyMicro: 10_000_000, midRate: 250_000 }))
    b2.post(T.providerSweepEntry({ ts: TS, providerId: 'x', qtyMicro: 4_000_000, from: '1120', bookIrt: 1_000_000 }))
    const t1130 = new LedgerBook()
    t1130.post(T.exchangeDeposit({ ts: TS, exchangeId: 'e', amountIrt: 1 }))
    expect(b2.balance('1120').qty).toBe(6_000_000)
  })

  it('E7/E7b deposit and IRT withdrawal with fees', () => {
    const e = T.exchangeDeposit({ ts: TS, exchangeId: 'nobitex', amountIrt: 10_000_000, feeIrt: 5_000 })
    expect(e.lines).toEqual([
      { account: '1100:nobitex', qty: 10_000_000, irt: 10_000_000 },
      { account: '6090', qty: 5_000, irt: 5_000 },
      { account: '1010', qty: -10_005_000, irt: -10_005_000 },
    ])
    const w = T.exchangeIrtWithdrawal({ ts: TS, exchangeId: 'nobitex', amountIrt: 1_000_000, feeIrt: 100 })
    expect(sumIrt(w)).toBe(0)
  })

  it('E8 exchange buy: fee up, qty down, spread = notional − qty·mid', () => {
    const c = T.computeExchangeBuy({ spentIrt: 100_000_000, takerBps: 35, askRate: 257_000 })
    expect(c.feeIrt).toBe(Math.ceil((100_000_000 * 0.0035) / 1.0035))
    expect(c.notionalIrt).toBe(100_000_000 - c.feeIrt)
    expect(c.qtyMicro).toBe(Math.floor((c.notionalIrt / 257_000) * 1e6))
    const e = T.exchangeBuy({ ts: TS, exchangeId: 'nobitex', spentIrt: 100_000_000, feeIrt: c.feeIrt, qtyMicro: c.qtyMicro, midRate: 256_500 })
    const book = Math.round((c.qtyMicro * 256_500) / 1e6)
    expect(e.lines.find((l) => l.account === '1110:nobitex')).toEqual({ account: '1110:nobitex', qty: c.qtyMicro, irt: book })
    expect(e.lines.find((l) => l.account === '5060')!.irt).toBe(100_000_000 - c.feeIrt - book)
    expect(e.lines.find((l) => l.account === '5050')!.irt).toBe(c.feeIrt)
    expect(sumIrt(e)).toBe(0)
    // buying below mid yields a negative (credit) spread line, still balanced
    const cheap = T.exchangeBuy({ ts: TS, exchangeId: 'x', spentIrt: 1_000_000, feeIrt: 0, qtyMicro: 4_000_000, midRate: 250_000 }) // book 1,000,000? exactly
    expect(sumIrt(cheap)).toBe(0)
    const below = T.exchangeBuy({ ts: TS, exchangeId: 'x', spentIrt: 1_000_000, feeIrt: 0, qtyMicro: 4_100_000, midRate: 250_000 })
    expect(below.lines.find((l) => l.account === '5060')!.irt).toBeLessThan(0)
    expect(sumIrt(below)).toBe(0)
  })

  it('E9/E10 withdrawal and arrival keep qty and book', () => {
    const b = new LedgerBook()
    b.post(T.ownerCapital({ ts: TS, amountIrt: 500_000_000 }))
    b.post(T.exchangeDeposit({ ts: TS, exchangeId: 'x', amountIrt: 100_000_000 }))
    b.post(T.exchangeBuy({ ts: TS, exchangeId: 'x', spentIrt: 100_000_000, feeIrt: 350_000, qtyMicro: 387_000_000, midRate: 256_000 }))
    const before = b.balance('1110:x')
    b.post(T.buildExchangeWithdrawal(b, { ts: TS, exchangeId: 'x', qtyMicro: 300_000_000, feeMicro: 1_000_000 }))
    const transit = b.balance('1130')
    expect(transit.qty).toBe(300_000_000)
    expect(b.balance('1110:x').qty).toBe(before.qty - 301_000_000)
    // fee book expensed to 5030, nothing lost
    expect(transit.irt + b.balance('5030').irt + b.balance('1110:x').irt).toBe(before.irt)
    b.post(T.buildWithdrawalArrival(b, { ts: TS, qtyMicro: 300_000_000 }))
    expect(b.balance('1130')).toEqual({ qty: 0, irt: 0 })
    expect(b.balance('1120').qty).toBe(300_000_000)
    expect(b.equation().check).toBe(0)
  })

  it('E12 refunds: recognition, payout (bank/wallet, with withheld fee and bank fee), USDT payout, after delivery', () => {
    const rec = T.refundBeforeDelivery({ ts: TS, amountIrt: 1_000_000 })
    expect(rec.lines.map((l) => l.account)).toEqual(['2010', '2030'])
    const pay = T.refundPayout({ ts: TS, amountIrt: 1_000_000, to: 'bank', withheldIrt: 20_000, bankFeeIrt: 3_000 })
    expect(pay.lines).toEqual([
      { account: '2030', qty: 1_000_000, irt: 1_000_000 },
      { account: '1010', qty: -980_000, irt: -980_000 },
      { account: '4060', qty: -20_000, irt: -20_000 },
      { account: '6080', qty: 3_000, irt: 3_000 },
      { account: '1010', qty: -3_000, irt: -3_000 },
    ])
    expect(T.refundPayout({ ts: TS, amountIrt: 5, to: 'wallet' }).lines[1]!.account).toBe('2020')
    expect(() => T.refundPayout({ ts: TS, amountIrt: 5, to: 'bank', withheldIrt: 6 })).toThrow(RangeError)
    const after = T.refundAfterDelivery({ ts: TS, amountIrt: 1_100_000, vatIrt: 100_000 })
    expect(after.lines).toEqual([
      { account: '6080', qty: 1_000_000, irt: 1_000_000 },
      { account: '2100', qty: 100_000, irt: 100_000 },
      { account: '2030', qty: -1_100_000, irt: -1_100_000 },
    ])
    const b = new LedgerBook()
    b.post(T.usdtPaymentConfirmed({ ts: TS, qtyMicro: 10_000_000, midRate: 250_000 })) // liability 2.5M in 2010, book 2.5M
    b.post(T.refundBeforeDelivery({ ts: TS, amountIrt: 2_500_000 }))
    // market moved: book revalued to 2.6M, refund paid in USDT 10 → loss of 100k vs the 2.5M liability
    b.post(b.revalue(undefined, 260_000, TS + 1))
    const e = T.buildRefundPayoutUsdt(b, { ts: TS + 2, qtyMicro: 10_000_000, liabilityIrt: 2_500_000 })
    expect(e.lines.find((l) => l.account === '7010')!.irt).toBe(100_000)
    b.post(e)
    expect(b.balance('1120')).toEqual({ qty: 0, irt: 0 })
    expect(b.balance('2030').irt).toBe(0)
    expect(b.equation().check).toBe(0)
  })

  it('E16 loss event on IRT and USDT assets; E18 provider write-off; E5b provider fee', () => {
    const b = new LedgerBook()
    b.post(T.ownerCapital({ ts: TS, amountIrt: 10_000_000 }))
    b.post(T.lossEventEntry({ ts: TS, debit: '6070', assetAccount: '1010', irt: 1_000_000 }))
    expect(b.balance('6070').irt).toBe(1_000_000)
    b.post(T.usdtPaymentConfirmed({ ts: TS, qtyMicro: 100_000_000, midRate: 250_000 }))
    b.post(T.providerSweepEntry({ ts: TS, providerId: 'p', qtyMicro: 100_000_000, from: '1120', bookIrt: 25_000_000 }))
    b.post(T.buildProviderFeeCharge(b, { ts: TS, providerId: 'p', qtyMicro: 10_000_000 }))
    expect(b.balance('5020').irt).toBe(2_500_000)
    b.post(T.buildProviderWriteOff(b, { ts: TS, providerId: 'p', qtyMicro: 90_000_000, debit: '7020' }))
    expect(b.balance('7020').irt).toBe(22_500_000)
    expect(b.balance('1200:p')).toEqual({ qty: 0, irt: 0 })
    expect(b.equation().check).toBe(0)
    expect(() => T.lossEventEntry({ ts: TS, debit: '6070', assetAccount: '3010', irt: 1 })).toThrow(RangeError)
  })

  it('E17b/E17c wallet payout and overpayment', () => {
    expect(T.walletPayout({ ts: TS, amountIrt: 3 }).lines.map((l) => l.account)).toEqual(['2020', '1010'])
    expect(T.overpaymentToWallet({ ts: TS, amountIrt: 3 }).lines.map((l) => l.account)).toEqual(['2010', '2020'])
  })

  it('rejects negative / fractional amounts in every template', () => {
    expect(() => T.cardToCardConfirmed({ ts: TS, amountIrt: -1 })).toThrow(RangeError)
    expect(() => T.cardToCardConfirmed({ ts: TS, amountIrt: 1.5 })).toThrow(RangeError)
    expect(() => T.exchangeDeposit({ ts: TS, exchangeId: 'x', amountIrt: 1, feeIrt: -1 })).toThrow(RangeError)
  })

  it('PROPERTY: every template returns a balanced entry (Σirt = 0) for random inputs (≥ 500 cases) and posts cleanly', () => {
    const rng = createRng('tpl-balance')
    let n = 0
    for (let i = 0; i < 600; i++) {
      const b = new LedgerBook()
      const amt = rng.int(1_000, 900_000_000)
      const fee = rng.int(0, Math.floor(amt / 50))
      const qty = rng.int(1_000_000, 9_000_000_000)
      const mid = 150_000 + rng.next() * 400_000
      const ts = TS + i
      const post = (e: JournalEntryInput): void => {
        expect(sumIrt(e)).toBe(0)
        for (const l of e.lines) {
          expect(Number.isSafeInteger(l.irt)).toBe(true)
          expect(Number.isSafeInteger(l.qty)).toBe(true)
        }
        b.post(e)
        expect(b.equation().check).toBe(0)
        n++
      }
      post(T.ownerCapital({ ts, amountIrt: 2_000_000_000_000 }))
      post(T.gatewayPaymentVerified({ ts, grossIrt: amt, feeIrt: fee }))
      post(T.gatewaySettlement({ ts, netIrt: amt - fee }))
      post(T.cardToCardConfirmed({ ts, amountIrt: amt }))
      post(T.walletTopUp({ ts, amountIrt: amt }))
      post(T.walletSpend({ ts, amountIrt: Math.min(amt, amt) }))
      post(T.exchangeDeposit({ ts, exchangeId: 'nobitex', amountIrt: amt * 100, feeIrt: fee }))
      const buy = T.computeExchangeBuy({ spentIrt: amt * 50, takerBps: rng.int(0, 60), askRate: mid * 1.003 })
      post(T.exchangeBuy({ ts, exchangeId: 'nobitex', spentIrt: amt * 50, feeIrt: buy.feeIrt, qtyMicro: buy.qtyMicro, midRate: mid }))
      const have = b.balance('1110:nobitex').qty
      const wq = Math.max(1, Math.floor(have / 3))
      const wf = Math.min(1_000_000, Math.floor(wq / 10))
      post(T.buildExchangeWithdrawal(b, { ts, exchangeId: 'nobitex', qtyMicro: wq, feeMicro: wf }))
      post(T.buildWithdrawalArrival(b, { ts, qtyMicro: wq }))
      const sq = Math.max(1, Math.floor(wq / 2))
      post(T.buildProviderSweep(b, { ts, providerId: 'mpay', qtyMicro: sq, from: '1120', networkFeeMicro: Math.min(500_000, Math.floor((wq - sq) / 2)) }))
      const dq = Math.max(1, Math.floor(sq / 3))
      const face = Math.floor(dq * 0.9)
      const pay = amt + 5_000
      post(T.deliveryEntry({ ts, priceIrt: Math.max(pay, 1), vatIrt: Math.floor(amt / 20), rushIrt: Math.floor(amt / 30), discountIrt: Math.floor(amt / 100), revenueAccount: rng.pick(['4010', '4020', '4030', '4040', '4060']), providerId: 'mpay', faceMicro: face, feesMicro: dq - face, bookIrt: b.disposeCost('1200:mpay', dq) }))
      post(b.revalue(undefined, mid * (0.9 + rng.next() * 0.2), ts + 1).lines.length ? b.revalue(undefined, mid * (0.9 + rng.next() * 0.2), ts + 1) : T.ownerCapital({ ts, amountIrt: 1 }))
      post(T.refundBeforeDelivery({ ts, amountIrt: fee }))
      post(T.refundPayout({ ts, amountIrt: fee, to: rng.pick(['bank', 'wallet'] as const), withheldIrt: Math.floor(fee / 2), bankFeeIrt: 100 }))
      post(T.opexEntry({ ts, expenseAccount: rng.pick(['6010', '6020', '6030']), amountIrt: fee, accrued: rng.bool() }))
      post(T.taxAccrual({ ts, amountIrt: fee }))
      post(T.ownerDrawings({ ts, amountIrt: 1 }))
    }
    expect(n).toBeGreaterThan(10_000)
  })
})

// ───────────────────────────────── lifecycle ─────────────────────────────────
function lifecycle() {
  const b = new LedgerBook()
  const steps: string[] = []
  const post = (label: string, e: JournalEntryInput): JournalEntry => {
    const stored = b.post(e)
    steps.push(label)
    const eq = b.equation()
    expect(eq.check, `A = L + E after ${label}`).toBe(0)
    expect(b.trialBalance().difference, `TB after ${label}`).toBe(0)
    return stored
  }
  const t = (n: number): number => TS + n * 3_600_000
  post('capital', T.ownerCapital({ ts: t(0), amountIrt: 500_000_000 }))
  post('deposit', T.exchangeDeposit({ ts: t(1), exchangeId: 'nobitex', amountIrt: 200_000_000, feeIrt: 0 }))
  const buy = T.computeExchangeBuy({ spentIrt: 200_000_000, takerBps: 35, askRate: 257_000 })
  post('buy', T.exchangeBuy({ ts: t(2), exchangeId: 'nobitex', spentIrt: 200_000_000, feeIrt: buy.feeIrt, qtyMicro: buy.qtyMicro, midRate: 256_500 }))
  post('withdraw', T.buildExchangeWithdrawal(b, { ts: t(75), exchangeId: 'nobitex', qtyMicro: 700_000_000, feeMicro: 1_000_000 }))
  post('arrival', T.buildWithdrawalArrival(b, { ts: t(76), qtyMicro: 700_000_000 }))
  post('sweep', T.buildProviderSweep(b, { ts: t(77), providerId: 'mpay', qtyMicro: 500_000_000, from: '1120', networkFeeMicro: 1_000_000 }))
  post('order1 paid', T.gatewayPaymentVerified({ ts: t(80), grossIrt: 30_615_000, feeIrt: 16_000 }))
  post('order1 settled', T.gatewaySettlement({ ts: t(104), netIrt: 30_599_000 }))
  post('order1 delivered', T.buildDelivery(b, { ts: t(81), priceIrt: 30_615_000, revenueAccount: '4020', providerId: 'mpay', faceMicro: 100_000_000, feesMicro: 3_550_000 }))
  post('revalue', b.revalue(undefined, 258_000, t(96)))
  post('order2 paid', T.cardToCardConfirmed({ ts: t(97), amountIrt: 5_000_000 }))
  post('order2 refund', T.refundBeforeDelivery({ ts: t(98), amountIrt: 5_000_000 }))
  post('order2 payout', T.refundPayout({ ts: t(99), amountIrt: 5_000_000, to: 'bank', withheldIrt: 20_000, bankFeeIrt: 2_000 }))
  post('salary', T.opexEntry({ ts: t(100), expenseAccount: '6010', amountIrt: 3_000_000 }))
  post('tax accrual', T.taxAccrual({ ts: t(101), amountIrt: 400_000 }))
  post('revalue 2', b.revalue(undefined, 255_000, t(120)))
  return { b, t }
}

describe('ledger lifecycle', () => {
  it('deposit → buy → withdraw → sweep → order paid → delivered → revalue → refund keeps A = L + E at every step', () => {
    const { b } = lifecycle()
    expect(b.entries().length).toBe(16)
    // USDT conservation: purchased − withdrawal fee − network fee − delivered
    const bought = T.computeExchangeBuy({ spentIrt: 200_000_000, takerBps: 35, askRate: 257_000 }).qtyMicro
    const usdtLeft = b.balances().filter((x) => isUsdtAccount(x.account)).reduce((a, x) => a + x.qty, 0)
    expect(usdtLeft).toBe(bought - 1_000_000 - 1_000_000 - 103_550_000)
    // revenue and customer prepayments
    expect(b.balance('4020').irt).toBe(-30_615_000)
    expect(b.balance('2010').irt).toBe(-5_000_000 + 5_000_000) // order1 recognised, order2 refunded
    expect(b.balance('2030').irt).toBe(0)
    // after the last revaluation every USDT account is at market
    for (const x of b.balances().filter((y) => isUsdtAccount(y.account))) expect(Math.abs(x.irt - Math.round((x.qty * 255_000) / 1e6))).toBeLessThanOrEqual(1)
    // FX: first reval gains, second loses → net credit/debit sign consistent with equation
    expect(b.balance('7010').irt).not.toBe(0)
  })

  it('weighted-average delivery cost equals book of the provider account at that time', () => {
    const b = new LedgerBook()
    b.post(T.usdtPaymentConfirmed({ ts: TS, qtyMicro: 200_000_000, midRate: 250_000 }))
    b.post(T.buildProviderSweep(b, { ts: TS, providerId: 'p', qtyMicro: 200_000_000, from: '1120' }))
    b.post(T.usdtPaymentConfirmed({ ts: TS, qtyMicro: 100_000_000, midRate: 280_000 }))
    b.post(T.buildProviderSweep(b, { ts: TS, providerId: 'p', qtyMicro: 100_000_000, from: '1120' }))
    // avg = (50M + 28M)/300 = 260,000
    expect(b.disposeCost('1200:p', 100_000_000)).toBe(26_000_000)
    b.post(T.cardToCardConfirmed({ ts: TS, amountIrt: 30_000_000 }))
    const e = T.buildDelivery(b, { ts: TS, priceIrt: 30_000_000, revenueAccount: '4010', providerId: 'p', faceMicro: 96_000_000, feesMicro: 4_000_000 })
    b.post(e)
    expect(b.balance('5010').irt + b.balance('5020').irt).toBe(26_000_000)
    expect(b.balance('1200:p')).toEqual({ qty: 200_000_000, irt: 52_000_000 })
  })
})

// ───────────────────────────────── statements ─────────────────────────────────
const period = (from: number, to: number): Period => ({ from, to, labelFa: 'دوره', key: 'test' })

describe('statements', () => {
  it('hand-checkable mini ledger: income statement, balance sheet and cash flow reconcile', () => {
    const b = new LedgerBook()
    const p = period(TS, TS + 1_000_000)
    b.post(T.ownerCapital({ ts: TS, amountIrt: 100_000_000 }))
    b.post(T.exchangeDeposit({ ts: TS + 1, exchangeId: 'x', amountIrt: 50_000_000 }))
    // buy 200 USDT at 250k: spend 50M, fee 100k, mid 250k → book 49.9M? choose numbers: qty 199.6 USDT
    b.post(T.exchangeBuy({ ts: TS + 2, exchangeId: 'x', spentIrt: 50_000_000, feeIrt: 100_000, qtyMicro: 199_000_000, midRate: 250_000 }))
    // book = 49,750,000; spread = 50,000,000 − 100,000 − 49,750,000 = 150,000
    b.post(T.cardToCardConfirmed({ ts: TS + 3, amountIrt: 10_000_000 }))
    b.post(T.usdtPaymentConfirmed({ ts: TS + 3, qtyMicro: 20_000_000, midRate: 250_000 })) // another 5M customer prepayment in USDT
    b.post(T.providerSweepEntry({ ts: TS + 4, providerId: 'p', qtyMicro: 20_000_000, from: '1120', bookIrt: 5_000_000 }))
    b.post(T.deliveryEntry({ ts: TS + 5, priceIrt: 10_000_000, revenueAccount: '4020', providerId: 'p', faceMicro: 19_000_000, feesMicro: 1_000_000, bookIrt: 5_000_000 }))
    b.post(b.revalue(undefined, 260_000, TS + 6)) // 1110:x 199M micro: 51,740,000 − 49,750,000 = +1,990,000
    b.post(T.opexEntry({ ts: TS + 7, expenseAccount: '6010', amountIrt: 1_000_000 }))
    b.post(T.taxAccrual({ ts: TS + 8, amountIrt: 500_000 }))
    const st = buildStatements({ entries: b.entries(), period: p, usdtMarket: 260_000 })
    const i = st.income
    expect(i.totalRevenue).toBe(10_000_000)
    expect(i.totalCogs).toBe(5_000_000 + 100_000 + 150_000)
    expect(i.grossProfit).toBe(10_000_000 - 5_250_000)
    expect(i.totalOpex).toBe(1_000_000)
    expect(i.operatingProfit).toBe(3_750_000)
    expect(i.fxRevaluationIrt).toBe(1_990_000)
    expect(i.totalOther).toBe(1_990_000)
    expect(i.profitBeforeTax).toBe(5_740_000)
    expect(i.incomeTax).toBe(500_000)
    expect(i.netProfit).toBe(5_240_000)
    expect(i.operatingProfitExFx).toBe(3_750_000)
    expect(i.grossMarginPct).toBeCloseTo(0.475, 10)
    expect(st.balance.check).toBe(0)
    expect(st.cashflow.check).toBe(0)
    // retained earnings = net profit
    expect(st.balance.equity.find((l) => l.code === '3900')!.amountIrt).toBe(5_240_000)
    // cash: 100M − 50M (deposit→1100 still cash) + 10M, − 1M opex ; exchange IRT balance 0 after buy
    expect(st.cashflow.openingCashIrt).toBe(0)
    expect(st.cashflow.closingCashIrt).toBe(100_000_000 + 10_000_000 - 1_000_000 - 50_000_000)
    expect(st.balance.usdtHoldings.qtyMicro).toBe(199_000_000)
    expect(st.balance.usdtHoldings.marketIrt).toBe(Math.round((199_000_000 * 260_000) / 1e6))
    // FX non-cash adjustment line and inventory line exist
    expect(st.cashflow.operating.find((l) => l.code === 'CF_FX_NONCASH')!.amountIrt).toBe(-1_990_000)
    // assets grouped with children
    const grp = st.balance.assets.find((l) => l.code === '1110')!
    expect(grp.children!.length).toBe(1)
    expect(grp.amountIrt).toBe(51_740_000)
  })

  it('two consecutive periods: opening of period 2 equals closing of period 1; statements check = 0 in both', () => {
    const { b, t } = lifecycle()
    const mid = t(60)
    const p1 = period(TS, mid)
    const p2 = period(mid + 1, t(200))
    const s1 = buildStatements({ entries: b.entries(), period: p1, usdtMarket: 257_000 })
    const s2 = buildStatements({ entries: b.entries(), period: p2, usdtMarket: 255_000 })
    expect(s1.balance.check).toBe(0)
    expect(s2.balance.check).toBe(0)
    expect(s1.cashflow.check).toBe(0)
    expect(s2.cashflow.check).toBe(0)
    expect(s2.cashflow.openingCashIrt).toBe(s1.cashflow.closingCashIrt)
    // whole-ledger vs sum of the two periods
    const whole = buildStatements({ entries: b.entries(), period: period(TS, t(200)), usdtMarket: 255_000 })
    expect(whole.income.netProfit).toBe(s1.income.netProfit + s2.income.netProfit)
    expect(whole.income.totalRevenue).toBe(s1.income.totalRevenue + s2.income.totalRevenue)
    expect(whole.cashflow.netChangeIrt).toBe(s1.cashflow.netChangeIrt + s2.cashflow.netChangeIrt)
    expect(whole.balance.totalAssets).toBe(s2.balance.totalAssets)
    expect(whole.balance.equity.find((l) => l.code === '3900')!.amountIrt).toBe(whole.income.netProfit)
  })

  it('revaluation sign conventions: gain raises assets and profit; loss lowers both; cash flow adds it back', () => {
    const b = new LedgerBook()
    b.post(T.ownerCapital({ ts: TS, amountIrt: 100_000_000 }))
    b.post(T.exchangeDeposit({ ts: TS, exchangeId: 'x', amountIrt: 100_000_000 }))
    b.post(T.exchangeBuy({ ts: TS, exchangeId: 'x', spentIrt: 100_000_000, feeIrt: 0, qtyMicro: 400_000_000, midRate: 250_000 }))
    for (const mid of [275_000, 225_000]) {
      b.post(b.revalue(undefined, mid, TS + (mid > 250_000 ? 10 : 20)))
    }
    const gainOnly = buildStatements({ entries: b.entries().slice(0, 4), period: period(TS, TS + 15), usdtMarket: 275_000 })
    expect(gainOnly.income.fxRevaluationIrt).toBe(10_000_000)
    expect(gainOnly.income.netProfit).toBe(10_000_000)
    expect(gainOnly.balance.totalAssets).toBe(110_000_000 - 0) // cash 0 at exchange + USDT 110M
    expect(gainOnly.cashflow.operating.find((l) => l.code === 'CF_FX_NONCASH')!.amountIrt).toBe(-10_000_000)
    expect(gainOnly.cashflow.netChangeIrt).toBe(100_000_000 - 100_000_000 + 0) // capital in, deposit stays cash, buy converts cash → USDT
    const all = buildStatements({ entries: b.entries(), period: period(TS, TS + 30), usdtMarket: 225_000 })
    expect(all.income.fxRevaluationIrt).toBe(-10_000_000) // +10M then −20M
    expect(all.income.netProfit).toBe(-10_000_000)
    expect(all.balance.totalAssets).toBe(90_000_000)
    expect(all.balance.check).toBe(0)
    expect(all.cashflow.check).toBe(0)
  })

  it('USDT purchase is a working-capital outflow; USDT delivery is not a cash movement', () => {
    const { b, t } = lifecycle()
    const s = buildStatements({ entries: b.entries(), period: period(TS, t(200)), usdtMarket: 255_000 })
    const inv = s.cashflow.operating.find((l) => l.code === 'CF_USDT_INVENTORY')!
    expect(inv.amountIrt).toBeLessThan(0)
    expect(s.cashflow.operating.some((l) => l.code === 'CF_FX_NONCASH')).toBe(true)
    expect(s.cashflow.financing.find((l) => l.code === 'CF_CAPITAL')!.amountIrt).toBe(500_000_000)
    expect(s.cashflow.totalOperating + s.cashflow.totalFinancing).toBe(s.cashflow.netChangeIrt)
  })

  it('movementsFromEntries / balancesFromEntries / applyMovements agree with the book', () => {
    const { b } = lifecycle()
    const mv = movementsFromEntries(b.entries())
    for (const m of mv) expect(m.debitIrt - m.creditIrt).toBe(b.balance(m.account).irt)
    expect(balancesFromEntries(b.entries())).toEqual(b.balances())
    expect(applyMovements([], mv)).toEqual(b.balances())
    const early = movementsFromEntries(b.entries(), { to: TS })
    expect(early.every((m) => m.account === '1010' || m.account === '3010')).toBe(true)
    expect(movementsFromEntries(b.entries(), { from: TS + 1e12 })).toEqual([])
  })

  it('period boundaries are closed: [from, to]', () => {
    const b = new LedgerBook()
    b.post(T.ownerCapital({ ts: 100, amountIrt: 10 }))
    b.post(T.ownerCapital({ ts: 200, amountIrt: 20 }))
    expect(movementsFromEntries(b.entries(), { from: 100, to: 200 }).find((m) => m.account === '1010')!.debitIrt).toBe(30)
    expect(movementsFromEntries(b.entries(), { from: 101, to: 199 })).toEqual([])
    expect(balancesFromEntries(b.entries(), 100).find((x) => x.account === '1010')!.irt).toBe(10)
  })

  it('English labels on request; direct builders work on raw movements', () => {
    const { b, t } = lifecycle()
    const p = period(TS, t(200))
    const mv = movementsFromEntries(b.entries())
    const inc = buildIncomeStatement(mv, p, { lang: 'en' })
    expect(inc.revenue[0]!.name).toBe('SALES_TOPUP')
    const bs = buildBalanceSheet(b.balances(), t(200), 255_000, { lang: 'en' })
    expect(bs.check).toBe(0)
    const cf = buildCashFlow([], mv, p, { lang: 'en' })
    expect(cf.check).toBe(0)
    expect(cf.operating[0]!.name).toBe('Net profit')
  })

  it('realTerms and usdTerms rescale money (not percentages), keep checks at exactly 0', () => {
    const { b, t } = lifecycle()
    const s = buildStatements({ entries: b.entries(), period: period(TS, t(200)), usdtMarket: 255_000 })
    const real = realTerms(s.income, 2)
    expect(real.netProfit).toBeCloseTo(s.income.netProfit / 2, 6)
    expect(real.grossMarginPct).toBe(s.income.grossMarginPct)
    expect(real.revenue[0]!.amountIrt).toBeCloseTo(s.income.revenue[0]!.amountIrt / 2, 6)
    expect(real.period).toEqual(s.income.period)
    const realBs = realTerms(s.balance, 1.5)
    expect(realBs.check).toBe(0)
    expect(realBs.asOf).toBe(s.balance.asOf)
    expect(realBs.usdtHoldings.qtyMicro).toBe(s.balance.usdtHoldings.qtyMicro)
    expect(realBs.totalAssets).toBeCloseTo(s.balance.totalAssets / 1.5, 4)
    const usd = usdTerms(s.cashflow, 255_000)
    expect(usd.check).toBe(0)
    expect(usd.closingCashIrt).toBeCloseTo(s.cashflow.closingCashIrt / 255_000, 9)
    expect(() => realTerms(s.income, 0)).toThrow(RangeError)
    expect(() => usdTerms(s.income, NaN)).toThrow(RangeError)
  })

  it('PROPERTY: random ledgers always produce statements with check = 0 and RE = net profit', () => {
    const rng = createRng('stmt-prop')
    for (let i = 0; i < 100; i++) {
      const b = new LedgerBook()
      let ts = TS
      b.post(T.ownerCapital({ ts, amountIrt: 5_000_000_000 }))
      b.post(T.exchangeDeposit({ ts: ++ts, exchangeId: 'x', amountIrt: 2_000_000_000 }))
      for (let k = 0; k < 8; k++) {
        const spend = rng.int(10_000_000, 200_000_000)
        const mid = 200_000 + rng.next() * 100_000
        const buy = T.computeExchangeBuy({ spentIrt: spend, takerBps: 30, askRate: mid * 1.002 })
        b.post(T.exchangeBuy({ ts: ++ts, exchangeId: 'x', spentIrt: spend, feeIrt: buy.feeIrt, qtyMicro: buy.qtyMicro, midRate: mid }))
        b.post(T.buildExchangeWithdrawal(b, { ts: ++ts, exchangeId: 'x', qtyMicro: Math.floor(buy.qtyMicro / 2), feeMicro: 1_000_000 }))
        b.post(T.buildWithdrawalArrival(b, { ts: ++ts, qtyMicro: Math.floor(buy.qtyMicro / 2) }))
        b.post(T.buildProviderSweep(b, { ts: ++ts, providerId: 'p', qtyMicro: Math.floor(buy.qtyMicro / 4), from: '1120' }))
        const price = rng.int(5_000_000, 40_000_000)
        b.post(T.gatewayPaymentVerified({ ts: ++ts, grossIrt: price, feeIrt: Math.floor(price * 0.005) }))
        const d = Math.floor(buy.qtyMicro / 20)
        b.post(T.buildDelivery(b, { ts: ++ts, priceIrt: price, revenueAccount: '4020', providerId: 'p', faceMicro: d, feesMicro: Math.floor(d / 30) }))
        const rv = b.revalue(undefined, mid * (0.95 + rng.next() * 0.1), ++ts)
        if (rv.lines.length) b.post(rv)
        if (rng.bool(0.3)) b.post(T.opexEntry({ ts: ++ts, expenseAccount: '6010', amountIrt: rng.int(1_000, 1_000_000), accrued: rng.bool() }))
      }
      const cut = TS + rng.int(5, ts - TS)
      const p1 = period(TS, cut)
      const s = buildStatements({ entries: b.entries(), period: p1, usdtMarket: 250_000 })
      expect(s.balance.check).toBe(0)
      expect(s.cashflow.check).toBe(0)
      expect(s.balance.equity.find((l) => l.code === '3900')?.amountIrt ?? 0).toBe(s.income.netProfit)
      const s2 = buildStatements({ entries: b.entries(), period: period(cut + 1, ts + 5), usdtMarket: 250_000 })
      expect(s2.cashflow.openingCashIrt).toBe(s.cashflow.closingCashIrt)
      expect(s2.cashflow.check).toBe(0)
    }
  })
})
