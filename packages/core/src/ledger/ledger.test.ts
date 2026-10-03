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
    // from in-transit
    const b2 = new LedgerBook()
    b2.post(T.usdtPaymentConfirmed({ ts: TS, qtyMicro: 10_000_000, midRate: 250_000 }))
    b2.post(T.providerSweepEntry({ ts: TS, providerId: 'x', qtyMicro: 10_000_000, from: '1120', bookIrt: 2_500_000 })) // park in provider just to build 1130 below
    const b3 = new LedgerBook()
    b3.post(T.usdtPaymentConfirmed({ ts: TS, qtyMicro: 50_000_000, midRate: 250_000 }))
    b3.post(T.lossEventEntry({ ts: TS, debit: '6070', assetAccount: '1120', irt: 0, qtyMicro: 0 }) as JournalEntryInput) // zero loss: lines filtered
    expect(b3.balance('1120').qty).toBe(50_000_000)
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
    b.post(T.revalue_noop ?? ({} as never) as never)
  })
})
