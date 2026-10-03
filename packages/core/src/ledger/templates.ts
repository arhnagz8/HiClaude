/**
 * Posting templates E1…E18 (architecture §5.3) — the ONLY ways value moves in the ledger.
 *
 * Every template is a pure function returning a balanced `JournalEntryInput` (validated before it is returned: Σirt = 0, currency rules).
 * Debit = positive, credit = negative. Zero-amount IRT lines are omitted.
 *
 * USDT disposals need BOOK cost (weighted average of the account). Two ways to supply it — both are provided:
 *   (a) pure template taking `bookIrt` that the caller computed with `LedgerBook.disposeCost(account, qty)`        e.g. `deliveryEntry`
 *   (b) book-aware builder `build…(book, input)` that calls `disposeCost` for you and splits book value exactly     e.g. `buildDelivery`
 * Use (b) whenever you have a `LedgerBook`; the app's LedgerService (which reads balances from SQLite) uses (a) with its own weighted average.
 *
 * Rounding: USDT valuations at a rate round HALF-UP; the exchange fee rounds UP; USDT quantities bought round DOWN.
 */
import type { EpochMs, JournalEntryInput, LedgerLine } from '@hiclaude/contracts'
import { D, assertSafeInt, bpsOf, microToIrt, toInt } from '../money'
import { accountMeta, acct } from './accounts'
import { validateEntry, type LedgerBook } from './book'

type Refs = NonNullable<JournalEntryInput['refs']>
export interface TemplateMeta {
  ts: EpochMs
  refs?: Refs
  memo?: string
}

const irtLine = (account: string, amount: number): LedgerLine => ({ account, qty: amount, irt: amount })
const usdtLine = (account: string, qty: number, irt: number): LedgerLine => ({ account, qty, irt })

function nonNeg(n: number, label: string): number {
  assertSafeInt(n, label)
  if (n < 0) throw new RangeError(`${label} must be ≥ 0, got ${n}`)
  return n
}

function build(kind: string, meta: TemplateMeta, defaultMemo: string, lines: LedgerLine[]): JournalEntryInput {
  const kept = lines.filter((l) => !(l.qty === 0 && l.irt === 0)).map((l) => ({ account: l.account, qty: l.qty === 0 ? 0 : l.qty, irt: l.irt === 0 ? 0 : l.irt }))
  const entry: JournalEntryInput = { ts: meta.ts, kind, memo: meta.memo ?? defaultMemo, ...(meta.refs ? { refs: { ...meta.refs } } : {}), lines: kept }
  validateEntry(entry)
  return entry
}

// ───────────────────────────── E1 / E1b / E2 / E3 / E4 : receipts ─────────────────────────────

/** E1 — gateway payment verified: Dr 1020 (P−f); Dr 5040 f; Cr 2010 P. */
export function gatewayPaymentVerified(i: TemplateMeta & { grossIrt: number; feeIrt: number }): JournalEntryInput {
  nonNeg(i.grossIrt, 'grossIrt')
  nonNeg(i.feeIrt, 'feeIrt')
  if (i.feeIrt > i.grossIrt) throw new RangeError('gateway fee exceeds payment')
  return build('E1', i, 'Gateway payment verified', [irtLine(acct('1020'), i.grossIrt - i.feeIrt), irtLine(acct('5040'), i.feeIrt), irtLine(acct('2010'), -i.grossIrt)])
}

/** E1b — gateway settlement (T+n): Dr 1010 net; Cr 1020 net. */
export function gatewaySettlement(i: TemplateMeta & { netIrt: number }): JournalEntryInput {
  nonNeg(i.netIrt, 'netIrt')
  return build('E1b', i, 'Gateway settlement', [irtLine(acct('1010'), i.netIrt), irtLine(acct('1020'), -i.netIrt)])
}

/** E2 — card-to-card (or bank transfer) confirmed: Dr 1010 P; Cr 2010 P. */
export function cardToCardConfirmed(i: TemplateMeta & { amountIrt: number }): JournalEntryInput {
  nonNeg(i.amountIrt, 'amountIrt')
  return build('E2', i, 'Card-to-card payment confirmed', [irtLine(acct('1010'), i.amountIrt), irtLine(acct('2010'), -i.amountIrt)])
}

/** E3 — USDT payment confirmed: Dr 1120 (qty, qty·mid); Cr 2010 (qty·mid). `midRate` = Toman per USDT; value rounds half-up. */
export function usdtPaymentConfirmed(i: TemplateMeta & { qtyMicro: number; midRate: number }): JournalEntryInput {
  nonNeg(i.qtyMicro, 'qtyMicro')
  const v = microToIrt(i.qtyMicro, i.midRate, 'half_up')
  return build('E3', i, 'USDT payment confirmed', [usdtLine(acct('1120'), i.qtyMicro, v), irtLine(acct('2010'), -v)])
}

/** E4 — wallet spend: Dr 2020 P; Cr 2010 P. */
export function walletSpend(i: TemplateMeta & { amountIrt: number }): JournalEntryInput {
  nonNeg(i.amountIrt, 'amountIrt')
  return build('E4', i, 'Wallet spend', [irtLine(acct('2020'), i.amountIrt), irtLine(acct('2010'), -i.amountIrt)])
}

// ───────────────────────────── E5 : delivery = revenue + COGS ─────────────────────────────

export interface DeliveryInput extends TemplateMeta {
  /** Amount the customer paid (what sits in 2010 for this order). */
  priceIrt: number
  /** VAT included in the price (Cr 2100). */
  vatIrt?: number
  /** Rush premium included in the price (Cr 4050). */
  rushIrt?: number
  /** Customer-facing discount already netted out of `priceIrt` (Dr 4900; revenue is booked gross). */
  discountIrt?: number
  /** Revenue account, e.g. `salesAccountForKind(product.kind)`. */
  revenueAccount: string
  providerId: string
  /** Face value delivered (micro-USDT, par). */
  faceMicro: number
  /** Provider fees consumed (issue/top-up/fx/decline), micro-USDT. */
  feesMicro: number
}

/** E5 (pure form) — `bookIrt` = book cost of `faceMicro + feesMicro` at the provider account (from `disposeCost`). */
export function deliveryEntry(i: DeliveryInput & { bookIrt: number }): JournalEntryInput {
  const vat = nonNeg(i.vatIrt ?? 0, 'vatIrt')
  const rush = nonNeg(i.rushIrt ?? 0, 'rushIrt')
  const disc = nonNeg(i.discountIrt ?? 0, 'discountIrt')
  nonNeg(i.priceIrt, 'priceIrt')
  nonNeg(i.faceMicro, 'faceMicro')
  nonNeg(i.feesMicro, 'feesMicro')
  nonNeg(i.bookIrt, 'bookIrt')
  const meta = accountMeta(i.revenueAccount)
  if (meta.type !== 'revenue' || meta.contra) throw new RangeError(`revenueAccount must be a sales account, got ${i.revenueAccount}`)
  const gross = i.priceIrt - vat - rush + disc
  if (gross < 0) throw new RangeError('delivery: price smaller than VAT + rush')
  const totalQty = i.faceMicro + i.feesMicro
  const faceBook = totalQty === 0 ? 0 : toInt(D(i.bookIrt).mul(i.faceMicro).div(totalQty), 'half_up', 'faceBook')
  const feesBook = i.bookIrt - faceBook
  const lines: LedgerLine[] = [
    irtLine(acct('2010'), i.priceIrt),
    irtLine(acct('4900'), disc),
    irtLine(i.revenueAccount, -gross),
    irtLine(acct('4050'), -rush),
    irtLine(acct('2100'), -vat),
    irtLine(acct('5010'), faceBook),
    irtLine(acct('5020'), feesBook),
  ]
  if (totalQty > 0) lines.push(usdtLine(acct('1200', i.providerId), -totalQty, -i.bookIrt))
  else if (i.bookIrt !== 0) throw new RangeError('delivery: book cost without quantity')
  return build('E5', i, 'Delivery — revenue recognised', lines)
}

/** E5 (book-aware) — computes `bookIrt` with `book.disposeCost('1200:<provider>', face + fees)`. Does not post. */
export function buildDelivery(book: LedgerBook, i: DeliveryInput): JournalEntryInput {
  const total = i.faceMicro + i.feesMicro
  const bookIrt = total === 0 ? 0 : book.disposeCost(acct('1200', i.providerId), total)
  return deliveryEntry({ ...i, bookIrt })
}

// ───────────────────────────── E6 : provider top-up (sweep) ─────────────────────────────

export interface SweepInput extends TemplateMeta {
  providerId: string
  qtyMicro: number
  /** Where the USDT leaves from: our hot wallet (1120) or in-transit (1130). */
  from: '1120' | '1130'
  /** On-chain fee paid in USDT from the hot wallet (1120), expensed to 5030. */
  networkFeeMicro?: number
}

/** E6 (pure) — `bookIrt` = book cost of `qtyMicro` at `from`; `networkFeeBookIrt` = book cost of the fee quantity at 1120. */
export function providerSweepEntry(i: SweepInput & { bookIrt: number; networkFeeBookIrt?: number }): JournalEntryInput {
  nonNeg(i.qtyMicro, 'qtyMicro')
  nonNeg(i.bookIrt, 'bookIrt')
  const fee = nonNeg(i.networkFeeMicro ?? 0, 'networkFeeMicro')
  const feeBook = nonNeg(i.networkFeeBookIrt ?? 0, 'networkFeeBookIrt')
  const lines: LedgerLine[] = [usdtLine(acct('1200', i.providerId), i.qtyMicro, i.bookIrt), usdtLine(acct(i.from), -i.qtyMicro, -i.bookIrt)]
  if (fee > 0) {
    lines.push(irtLine(acct('5030'), feeBook))
    lines.push(usdtLine(acct('1120'), -fee, -feeBook))
  }
  return build('E6', i, 'Provider top-up (sweep)', lines)
}

/** E6 (book-aware). When both the sweep and the fee leave from 1120 the combined book cost is split exactly (no rounding leak). */
export function buildProviderSweep(book: LedgerBook, i: SweepInput): JournalEntryInput {
  const fee = i.networkFeeMicro ?? 0
  const src = acct(i.from)
  if (fee === 0) return providerSweepEntry({ ...i, bookIrt: book.disposeCost(src, i.qtyMicro) })
  if (i.from === '1120') {
    const total = book.disposeCost(src, i.qtyMicro + fee)
    const main = toInt(D(total).mul(i.qtyMicro).div(i.qtyMicro + fee), 'half_up', 'sweepBook')
    return providerSweepEntry({ ...i, bookIrt: main, networkFeeBookIrt: total - main })
  }
  return providerSweepEntry({ ...i, bookIrt: book.disposeCost(src, i.qtyMicro), networkFeeBookIrt: book.disposeCost(acct('1120'), fee) })
}

// ───────────────────────────── E7 / E8 / E9 / E10 : exchange legs ─────────────────────────────

/** E7 — IRT deposit to exchange: Dr 1100:ex B; Cr 1010 B; deposit fee Dr 6090 / Cr 1010. */
export function exchangeDeposit(i: TemplateMeta & { exchangeId: string; amountIrt: number; feeIrt?: number }): JournalEntryInput {
  nonNeg(i.amountIrt, 'amountIrt')
  const fee = nonNeg(i.feeIrt ?? 0, 'feeIrt')
  return build('E7', i, 'IRT deposit to exchange', [irtLine(acct('1100', i.exchangeId), i.amountIrt), irtLine(acct('6090'), fee), irtLine(acct('1010'), -(i.amountIrt + fee))])
}

/** E7b — IRT withdrawal from exchange back to the bank: Dr 1010 amount; Cr 1100:ex amount (+ fee Dr 6090 / Cr 1100:ex). */
export function exchangeIrtWithdrawal(i: TemplateMeta & { exchangeId: string; amountIrt: number; feeIrt?: number }): JournalEntryInput {
  nonNeg(i.amountIrt, 'amountIrt')
  const fee = nonNeg(i.feeIrt ?? 0, 'feeIrt')
  return build('E7b', i, 'IRT withdrawal from exchange', [irtLine(acct('1010'), i.amountIrt), irtLine(acct('6090'), fee), irtLine(acct('1100', i.exchangeId), -(i.amountIrt + fee))])
}

/**
 * Helper for E8: given the Toman budget `B` (fee included), taker fee and ask, returns what the exchange does:
 * `fee = ceil(B·φ/(1+φ))`, `notional = B − fee`, `qty = floor(notional / ask · 10⁶)`.
 */
export function computeExchangeBuy(i: { spentIrt: number; takerBps: number; askRate: number }): { feeIrt: number; notionalIrt: number; qtyMicro: number } {
  nonNeg(i.spentIrt, 'spentIrt')
  const phi = D(i.takerBps).div(10_000)
  const feeIrt = toInt(D(i.spentIrt).mul(phi).div(D(1).plus(phi)), 'up', 'exchangeFee')
  const notionalIrt = i.spentIrt - feeIrt
  const qtyMicro = toInt(D(notionalIrt).mul(1_000_000).div(D(i.askRate)), 'down', 'boughtQty')
  return { feeIrt, notionalIrt, qtyMicro }
}

/**
 * E8 — exchange buy using ACTUALS from the trade result: spent `B` (fee included), fee, USDT received, mid at execution.
 * Dr 1110:ex (qty, round(qty·mid)); Dr 5050 fee; Dr 5060 (B − fee − qty·mid) [negative if bought below mid]; Cr 1100:ex B.
 */
export function exchangeBuy(i: TemplateMeta & { exchangeId: string; spentIrt: number; feeIrt: number; qtyMicro: number; midRate: number }): JournalEntryInput {
  nonNeg(i.spentIrt, 'spentIrt')
  nonNeg(i.feeIrt, 'feeIrt')
  nonNeg(i.qtyMicro, 'qtyMicro')
  if (i.feeIrt > i.spentIrt) throw new RangeError('exchange fee exceeds spend')
  const book = microToIrt(i.qtyMicro, i.midRate, 'half_up')
  const spread = i.spentIrt - i.feeIrt - book
  return build('E8', i, 'Exchange buy USDT', [usdtLine(acct('1110', i.exchangeId), i.qtyMicro, book), irtLine(acct('5050'), i.feeIrt), irtLine(acct('5060'), spread), irtLine(acct('1100', i.exchangeId), -i.spentIrt)])
}

/** Taker-fee helper for planning: fee in Toman for a notional at `takerBps`, rounded up. */
export function exchangeFeeOn(notionalIrt: number, takerBps: number): number {
  return bpsOf(notionalIrt, takerBps, 'up')
}

/** E9 (pure) — withdrawal: `qtyMicro` arrives (Dr 1130), `feeMicro` is the withdrawal fee; both leave 1110:ex. Books come from `disposeCost`. */
export function exchangeWithdrawalEntry(i: TemplateMeta & { exchangeId: string; qtyMicro: number; feeMicro: number; bookOutIrt: number; bookFeeIrt: number }): JournalEntryInput {
  nonNeg(i.qtyMicro, 'qtyMicro')
  const fee = nonNeg(i.feeMicro, 'feeMicro')
  nonNeg(i.bookOutIrt, 'bookOutIrt')
  nonNeg(i.bookFeeIrt, 'bookFeeIrt')
  const lines: LedgerLine[] = [
    usdtLine(acct('1130'), i.qtyMicro, i.bookOutIrt),
    irtLine(acct('5030'), i.bookFeeIrt),
    usdtLine(acct('1110', i.exchangeId), -(i.qtyMicro + fee), -(i.bookOutIrt + i.bookFeeIrt)),
  ]
  return build('E9', i, 'Exchange withdrawal', lines)
}

/** E9 (book-aware): total book of `qty + fee` at 1110:ex split pro-rata with no rounding leak. */
export function buildExchangeWithdrawal(book: LedgerBook, i: TemplateMeta & { exchangeId: string; qtyMicro: number; feeMicro: number }): JournalEntryInput {
  const total = book.disposeCost(acct('1110', i.exchangeId), i.qtyMicro + i.feeMicro)
  const out = i.qtyMicro + i.feeMicro === 0 ? 0 : toInt(D(total).mul(i.qtyMicro).div(i.qtyMicro + i.feeMicro), 'half_up', 'withdrawBook')
  return exchangeWithdrawalEntry({ ...i, bookOutIrt: out, bookFeeIrt: total - out })
}

/** E10 (pure) — withdrawal arrival: Dr 1120 (qty, book); Cr 1130 (qty, book). */
export function withdrawalArrivalEntry(i: TemplateMeta & { qtyMicro: number; bookIrt: number }): JournalEntryInput {
  nonNeg(i.qtyMicro, 'qtyMicro')
  nonNeg(i.bookIrt, 'bookIrt')
  return build('E10', i, 'Withdrawal arrived', [usdtLine(acct('1120'), i.qtyMicro, i.bookIrt), usdtLine(acct('1130'), -i.qtyMicro, -i.bookIrt)])
}

/** E10 (book-aware). */
export function buildWithdrawalArrival(book: LedgerBook, i: TemplateMeta & { qtyMicro: number }): JournalEntryInput {
  return withdrawalArrivalEntry({ ...i, bookIrt: book.disposeCost(acct('1130'), i.qtyMicro) })
}

// ───────────────────────────── E12 : refunds ─────────────────────────────

/** E12 — refund before delivery recognised: Dr 2010 P; Cr 2030 P. */
export function refundBeforeDelivery(i: TemplateMeta & { amountIrt: number }): JournalEntryInput {
  nonNeg(i.amountIrt, 'amountIrt')
  return build('E12', i, 'Refund recognised (before delivery)', [irtLine(acct('2010'), i.amountIrt), irtLine(acct('2030'), -i.amountIrt)])
}

/**
 * E12b — refund payout: Dr 2030 `amountIrt`; Cr 1010 (or 2020 wallet) `amountIrt − withheldIrt`; Cr 4060 `withheldIrt` (refund fee kept per terms);
 * bank transfer cost: Dr 6080 / Cr 1010 `bankFeeIrt`.
 */
export function refundPayout(i: TemplateMeta & { amountIrt: number; to: 'bank' | 'wallet'; withheldIrt?: number; bankFeeIrt?: number }): JournalEntryInput {
  nonNeg(i.amountIrt, 'amountIrt')
  const withheld = nonNeg(i.withheldIrt ?? 0, 'withheldIrt')
  const bankFee = nonNeg(i.bankFeeIrt ?? 0, 'bankFeeIrt')
  if (withheld > i.amountIrt) throw new RangeError('withheld fee exceeds refund')
  const dest = i.to === 'bank' ? acct('1010') : acct('2020')
  const lines = [irtLine(acct('2030'), i.amountIrt), irtLine(dest, -(i.amountIrt - withheld)), irtLine(acct('4060'), -withheld)]
  if (bankFee > 0) {
    lines.push(irtLine(acct('6080'), bankFee))
    lines.push(irtLine(acct('1010'), -bankFee))
  }
  return build('E12b', i, 'Refund payout', lines)
}

/** E12c (pure) — refund paid in USDT: Dr 2030 `liabilityIrt`; Cr 1120 (qty, book); FX difference to 7010 (book − liability; positive = loss). */
export function refundPayoutUsdtEntry(i: TemplateMeta & { qtyMicro: number; bookIrt: number; liabilityIrt: number }): JournalEntryInput {
  nonNeg(i.qtyMicro, 'qtyMicro')
  nonNeg(i.bookIrt, 'bookIrt')
  nonNeg(i.liabilityIrt, 'liabilityIrt')
  return build('E12c', i, 'Refund payout in USDT', [irtLine(acct('2030'), i.liabilityIrt), usdtLine(acct('1120'), -i.qtyMicro, -i.bookIrt), irtLine(acct('7010'), i.bookIrt - i.liabilityIrt)])
}

/** E12c (book-aware). */
export function buildRefundPayoutUsdt(book: LedgerBook, i: TemplateMeta & { qtyMicro: number; liabilityIrt: number }): JournalEntryInput {
  return refundPayoutUsdtEntry({ ...i, bookIrt: book.disposeCost(acct('1120'), i.qtyMicro) })
}

/**
 * E12d — refund AFTER delivery (dispute resolved for the customer): revenue stays recognised, the refund is a cost:
 * Dr 6080 (P − VAT); Dr 2100 VAT; Cr 2030 P.
 */
export function refundAfterDelivery(i: TemplateMeta & { amountIrt: number; vatIrt?: number }): JournalEntryInput {
  nonNeg(i.amountIrt, 'amountIrt')
  const vat = nonNeg(i.vatIrt ?? 0, 'vatIrt')
  if (vat > i.amountIrt) throw new RangeError('vat exceeds refund')
  return build('E12d', i, 'Refund after delivery', [irtLine(acct('6080'), i.amountIrt - vat), irtLine(acct('2100'), vat), irtLine(acct('2030'), -i.amountIrt)])
}

// ───────────────────────────── E13 … E18 ─────────────────────────────

/** E13 — operating expense: Dr 6xxx (or 5xxx); Cr 1010 (or 2200 when `accrued`). */
export function opexEntry(i: TemplateMeta & { expenseAccount: string; amountIrt: number; accrued?: boolean }): JournalEntryInput {
  nonNeg(i.amountIrt, 'amountIrt')
  const t = accountMeta(i.expenseAccount).type
  if (t !== 'expense' && t !== 'cogs') throw new RangeError(`${i.expenseAccount} is not an expense account`)
  return build('E13', i, 'Operating expense', [irtLine(i.expenseAccount, i.amountIrt), irtLine(i.accrued ? acct('2200') : acct('1010'), -i.amountIrt)])
}

/** E13b — payment of an accrued expense: Dr 2200; Cr 1010. */
export function accruedExpensePayment(i: TemplateMeta & { amountIrt: number }): JournalEntryInput {
  nonNeg(i.amountIrt, 'amountIrt')
  return build('E13b', i, 'Accrued expense paid', [irtLine(acct('2200'), i.amountIrt), irtLine(acct('1010'), -i.amountIrt)])
}

/** E14 — owner capital: Dr 1010; Cr 3010. */
export function ownerCapital(i: TemplateMeta & { amountIrt: number }): JournalEntryInput {
  nonNeg(i.amountIrt, 'amountIrt')
  return build('E14', i, 'Owner capital contribution', [irtLine(acct('1010'), i.amountIrt), irtLine(acct('3010'), -i.amountIrt)])
}

/** E14 — owner drawings: Dr 3020; Cr 1010. */
export function ownerDrawings(i: TemplateMeta & { amountIrt: number }): JournalEntryInput {
  nonNeg(i.amountIrt, 'amountIrt')
  return build('E14', i, 'Owner drawings', [irtLine(acct('3020'), i.amountIrt), irtLine(acct('1010'), -i.amountIrt)])
}

/** E15 — income-tax accrual: Dr 8010; Cr 2110. */
export function taxAccrual(i: TemplateMeta & { amountIrt: number }): JournalEntryInput {
  nonNeg(i.amountIrt, 'amountIrt')
  return build('E15', i, 'Income tax accrued', [irtLine(acct('8010'), i.amountIrt), irtLine(acct('2110'), -i.amountIrt)])
}

/** E15 — tax payment: Dr 2110 (income tax) or 2100 (VAT); Cr 1010. */
export function taxPayment(i: TemplateMeta & { amountIrt: number; liability: '2110' | '2100' }): JournalEntryInput {
  nonNeg(i.amountIrt, 'amountIrt')
  return build('E15', i, i.liability === '2100' ? 'VAT paid' : 'Income tax paid', [irtLine(acct(i.liability), i.amountIrt), irtLine(acct('1010'), -i.amountIrt)])
}

/**
 * E16 — loss event: Dr 6070 (our loss) or 2010 (customer funds we must make good… booked against prepayments); Cr the lost asset.
 * IRT asset: `irt` only. USDT asset: pass `qtyMicro` and `bookIrt` (from `disposeCost`).
 */
export function lossEventEntry(i: TemplateMeta & { debit: '6070' | '2010'; assetAccount: string; irt: number; qtyMicro?: number }): JournalEntryInput {
  nonNeg(i.irt, 'irt')
  const m = accountMeta(i.assetAccount)
  if (m.type !== 'asset') throw new RangeError(`${i.assetAccount} is not an asset`)
  const credit = m.currency === 'USDT' ? usdtLine(i.assetAccount, -nonNeg(i.qtyMicro ?? 0, 'qtyMicro'), -i.irt) : irtLine(i.assetAccount, -i.irt)
  return build('E16', i, 'Loss event', [irtLine(acct(i.debit), i.irt), credit])
}

/** E17 — wallet top-up: Dr 1010 (or 1020); Cr 2020. */
export function walletTopUp(i: TemplateMeta & { amountIrt: number; source?: '1010' | '1020' }): JournalEntryInput {
  nonNeg(i.amountIrt, 'amountIrt')
  return build('E17', i, 'Wallet top-up', [irtLine(acct(i.source ?? '1010'), i.amountIrt), irtLine(acct('2020'), -i.amountIrt)])
}

/** E17b — wallet cash-out to the customer's bank: Dr 2020; Cr 1010. */
export function walletPayout(i: TemplateMeta & { amountIrt: number }): JournalEntryInput {
  nonNeg(i.amountIrt, 'amountIrt')
  return build('E17b', i, 'Wallet payout', [irtLine(acct('2020'), i.amountIrt), irtLine(acct('1010'), -i.amountIrt)])
}

/** E17c — overpayment credited to the customer's wallet: Dr 2010; Cr 2020. */
export function overpaymentToWallet(i: TemplateMeta & { amountIrt: number }): JournalEntryInput {
  nonNeg(i.amountIrt, 'amountIrt')
  return build('E17c', i, 'Overpayment credited to wallet', [irtLine(acct('2010'), i.amountIrt), irtLine(acct('2020'), -i.amountIrt)])
}

/** E18 (pure) — provider freeze / write-off: Dr 7020 (or 6070) book; Cr 1200:prov (qty, book). */
export function providerWriteOffEntry(i: TemplateMeta & { providerId: string; qtyMicro: number; bookIrt: number; debit?: '7020' | '6070' }): JournalEntryInput {
  nonNeg(i.qtyMicro, 'qtyMicro')
  nonNeg(i.bookIrt, 'bookIrt')
  return build('E18', i, 'Provider write-off', [irtLine(acct(i.debit ?? '7020'), i.bookIrt), usdtLine(acct('1200', i.providerId), -i.qtyMicro, -i.bookIrt)])
}

/** E18 (book-aware). */
export function buildProviderWriteOff(book: LedgerBook, i: TemplateMeta & { providerId: string; qtyMicro: number; debit?: '7020' | '6070' }): JournalEntryInput {
  return providerWriteOffEntry({ ...i, bookIrt: book.disposeCost(acct('1200', i.providerId), i.qtyMicro) })
}

/** E5b — provider recurring/monthly fee consumed from the provider balance: Dr 5020 book; Cr 1200:prov (qty, book). */
export function providerFeeChargeEntry(i: TemplateMeta & { providerId: string; qtyMicro: number; bookIrt: number }): JournalEntryInput {
  nonNeg(i.qtyMicro, 'qtyMicro')
  nonNeg(i.bookIrt, 'bookIrt')
  return build('E5b', i, 'Provider fee charged', [irtLine(acct('5020'), i.bookIrt), usdtLine(acct('1200', i.providerId), -i.qtyMicro, -i.bookIrt)])
}

/** E5b (book-aware). */
export function buildProviderFeeCharge(book: LedgerBook, i: TemplateMeta & { providerId: string; qtyMicro: number }): JournalEntryInput {
  return providerFeeChargeEntry({ ...i, bookIrt: book.disposeCost(acct('1200', i.providerId), i.qtyMicro) })
}

/** Template catalogue (kind → function name) for docs and tests. */
export const TEMPLATE_KINDS = ['E1', 'E1b', 'E2', 'E3', 'E4', 'E5', 'E5b', 'E6', 'E7', 'E7b', 'E8', 'E9', 'E10', 'E11', 'E12', 'E12b', 'E12c', 'E12d', 'E13', 'E13b', 'E14', 'E15', 'E16', 'E17', 'E17b', 'E17c', 'E18'] as const
