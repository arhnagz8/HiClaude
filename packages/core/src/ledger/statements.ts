/**
 * Financial statements built purely from ledger MOVEMENTS and BALANCES (architecture §5.1, contracts/reports.ts).
 *
 * Sign conventions
 *  - Balances are debit-positive (`AccountBalance.irt`); statement lines are shown in their natural sign
 *    (assets +, liabilities +, equity +, revenue +, discounts −, COGS +, expenses +, “other” = profit effect: gain +, loss −).
 *  - Percentages (`grossMarginPct`, `netMarginPct`, …) are FRACTIONS (0.18 = 18 %).
 *
 * Periods are CLOSED intervals `[from, to]` in epoch ms; consecutive periods must not overlap (`next.from = prev.to + 1`).
 * “Opening balances” = everything with `ts < from`; “as of” balances include `ts ≤ asOf`.
 *
 * Statement identities (all must be exactly 0 in tests): balance `check`, cash-flow `check`, and Σ debits = Σ credits.
 */
import type { BalanceSheet, CashFlowStatement, IncomeStatement, JournalEntry, Period, StatementLine, Statements } from '@hiclaude/contracts'
import { D, microToIrt, toInt } from '../money'
import { accountMeta, isCashAccount, isUsdtAccount, splitAccount } from './accounts'
import type { AccountBalance } from './book'

export interface AccountMovement {
  account: string
  /** Σ of debit lines (positive) in the period. */
  debitIrt: number
  /** Σ of credit lines (positive magnitude) in the period. */
  creditIrt: number
  /** Net micro-USDT change (USDT accounts) — debit-positive. For IRT accounts it equals debit − credit. */
  qtyDelta: number
  /**
   * USDT accounts only: net `irt` of pure revaluation lines (qty = 0). Lets the cash-flow statement separate the non-cash FX effect.
   * When absent the 7010 movement is used instead.
   */
  revalIrt?: number
}

export type StatementLang = 'fa' | 'en'

/** Aggregates entries with `from ≤ ts ≤ to` (both optional) into per-account movements, sorted by account code. */
export function movementsFromEntries(entries: readonly JournalEntry[], range: { from?: number; to?: number } = {}): AccountMovement[] {
  const m = new Map<string, AccountMovement>()
  for (const e of entries) {
    if (range.from !== undefined && e.ts < range.from) continue
    if (range.to !== undefined && e.ts > range.to) continue
    for (const l of e.lines) {
      let a = m.get(l.account)
      if (!a) {
        a = { account: l.account, debitIrt: 0, creditIrt: 0, qtyDelta: 0 }
        m.set(l.account, a)
      }
      if (l.irt > 0) a.debitIrt += l.irt
      else if (l.irt < 0) a.creditIrt += -l.irt
      a.qtyDelta += l.qty
      if (l.qty === 0 && l.irt !== 0 && isUsdtAccount(l.account)) a.revalIrt = (a.revalIrt ?? 0) + l.irt
    }
  }
  return [...m.values()].sort((x, y) => (x.account < y.account ? -1 : x.account > y.account ? 1 : 0))
}

/** Cumulative balances (debit-positive) from entries with `ts ≤ asOf` (all when omitted). */
export function balancesFromEntries(entries: readonly JournalEntry[], asOf?: number): AccountBalance[] {
  const b = new Map<string, AccountBalance>()
  for (const e of entries) {
    if (asOf !== undefined && e.ts > asOf) continue
    for (const l of e.lines) {
      const cur = b.get(l.account) ?? { account: l.account, qty: 0, irt: 0 }
      cur.qty += l.qty
      cur.irt += l.irt
      b.set(l.account, cur)
    }
  }
  return [...b.values()].filter((x) => x.qty !== 0 || x.irt !== 0).sort((x, y) => (x.account < y.account ? -1 : x.account > y.account ? 1 : 0))
}

/** Opening balances + movements → closing balances (entries must be the same ledger). */
export function applyMovements(opening: readonly AccountBalance[], movements: readonly AccountMovement[]): AccountBalance[] {
  const b = new Map(opening.map((x) => [x.account, { ...x }]))
  for (const mv of movements) {
    const cur = b.get(mv.account) ?? { account: mv.account, qty: 0, irt: 0 }
    cur.irt += mv.debitIrt - mv.creditIrt
    cur.qty += mv.qtyDelta
    b.set(mv.account, cur)
  }
  return [...b.values()].filter((x) => x.qty !== 0 || x.irt !== 0).sort((x, y) => (x.account < y.account ? -1 : x.account > y.account ? 1 : 0))
}

const nameOf = (account: string, lang: StatementLang): string => {
  const m = accountMeta(account)
  return lang === 'fa' ? m.nameFa : m.name
}

const frac = (num: number, den: number): number => (den === 0 ? 0 : num / den)

// ───────────────────────────── income statement ─────────────────────────────

/** Income statement for `period` from movements within that period. */
export function buildIncomeStatement(movements: readonly AccountMovement[], period: Period, opts: { lang?: StatementLang } = {}): IncomeStatement {
  const lang = opts.lang ?? 'fa'
  const revenue: StatementLine[] = []
  const cogs: StatementLine[] = []
  const opex: StatementLine[] = []
  const other: StatementLine[] = []
  let incomeTax = 0
  let fx = 0
  for (const mv of movements) {
    const meta = accountMeta(mv.account)
    const net = mv.debitIrt - mv.creditIrt // debit-positive
    if (mv.debitIrt === 0 && mv.creditIrt === 0) continue
    switch (meta.type) {
      case 'revenue':
        revenue.push({ code: mv.account, name: nameOf(mv.account, lang), amountIrt: -net })
        break
      case 'cogs':
        cogs.push({ code: mv.account, name: nameOf(mv.account, lang), amountIrt: net })
        break
      case 'expense':
        opex.push({ code: mv.account, name: nameOf(mv.account, lang), amountIrt: net })
        break
      case 'other':
        if (meta.base === '8010') incomeTax += net
        else {
          other.push({ code: mv.account, name: nameOf(mv.account, lang), amountIrt: -net })
          if (meta.base === '7010') fx += -net
        }
        break
      default:
        break // balance-sheet accounts do not belong here
    }
  }
  const sum = (ls: StatementLine[]): number => ls.reduce((a, l) => a + l.amountIrt, 0)
  const totalRevenue = sum(revenue)
  const totalCogs = sum(cogs)
  const grossProfit = totalRevenue - totalCogs
  const totalOpex = sum(opex)
  const operatingProfit = grossProfit - totalOpex
  const totalOther = sum(other)
  const profitBeforeTax = operatingProfit + totalOther
  const netProfit = profitBeforeTax - incomeTax
  return {
    period,
    revenue,
    totalRevenue,
    cogs,
    totalCogs,
    grossProfit,
    grossMarginPct: frac(grossProfit, totalRevenue),
    opex,
    totalOpex,
    operatingProfit,
    other,
    totalOther,
    profitBeforeTax,
    incomeTax,
    netProfit,
    netMarginPct: frac(netProfit, totalRevenue),
    fxRevaluationIrt: fx,
    operatingProfitExFx: profitBeforeTax - fx,
  }
}

// ───────────────────────────── balance sheet ─────────────────────────────

/** Balance sheet as of `asOf` from cumulative balances. `usdtMarket` = mid (Toman per USDT) for the market value of holdings. */
export function buildBalanceSheet(balances: readonly AccountBalance[], asOf: number, usdtMarket: number, opts: { lang?: StatementLang } = {}): BalanceSheet {
  const lang = opts.lang ?? 'fa'
  const groupTitle: Record<string, { fa: string; en: string }> = {
    '1100': { fa: 'موجودی تومانی صرافی‌ها', en: 'IRT at exchanges' },
    '1110': { fa: 'تتر در صرافی‌ها', en: 'USDT at exchanges' },
    '1200': { fa: 'موجودی نزد ارائه‌دهندگان', en: 'Provider balances' },
  }
  const assets: StatementLine[] = []
  const liabilities: StatementLine[] = []
  const equity: StatementLine[] = []
  const groups = new Map<string, StatementLine>()
  let pnl = 0
  let qty = 0
  let book = 0
  let market = 0
  for (const b of balances) {
    if (b.qty === 0 && b.irt === 0) continue
    const meta = accountMeta(b.account)
    if (meta.currency === 'USDT') {
      qty += b.qty
      book += b.irt
      market += microToIrt(b.qty, usdtMarket, 'half_up')
    }
    switch (meta.type) {
      case 'asset': {
        const line: StatementLine = { code: b.account, name: nameOf(b.account, lang), amountIrt: b.irt }
        const { base, qualifier } = splitAccount(b.account)
        if (qualifier !== undefined) {
          let g = groups.get(base)
          if (!g) {
            g = { code: base, name: groupTitle[base]?.[lang] ?? nameOf(base + ':x', lang), amountIrt: 0, children: [] }
            groups.set(base, g)
            assets.push(g)
          }
          g.amountIrt += b.irt
          g.children!.push(line)
        } else assets.push(line)
        break
      }
      case 'liability':
        liabilities.push({ code: b.account, name: nameOf(b.account, lang), amountIrt: -b.irt })
        break
      case 'equity':
        equity.push({ code: b.account, name: nameOf(b.account, lang), amountIrt: -b.irt })
        break
      default:
        pnl -= b.irt // profit = −Σ irt of revenue/cogs/expense/other
    }
  }
  assets.sort((x, y) => (x.code < y.code ? -1 : 1))
  if (pnl !== 0) equity.push({ code: '3900', name: lang === 'fa' ? 'سود انباشته' : 'RETAINED_EARNINGS', amountIrt: pnl })
  equity.sort((x, y) => (x.code < y.code ? -1 : 1))
  const sum = (ls: StatementLine[]): number => ls.reduce((a, l) => a + l.amountIrt, 0)
  const totalAssets = sum(assets)
  const totalLiabilities = sum(liabilities)
  const totalEquity = sum(equity)
  return {
    asOf,
    assets,
    totalAssets,
    liabilities,
    totalLiabilities,
    equity,
    totalEquity,
    check: totalAssets - totalLiabilities - totalEquity,
    usdtHoldings: { qtyMicro: qty, bookIrt: book, marketIrt: market },
  }
}

// ───────────────────────────── cash flow (indirect) ─────────────────────────────

/**
 * Indirect cash-flow statement. Cash = 1010 + 1020 + 1100:* .
 *  operating = net profit
 *            − FX revaluation gain (non-cash; + loss)
 *            − Δ USDT inventory at book EXCLUDING revaluation (working capital: buying USDT consumes cash, delivering it does not)
 *            − Δ other non-cash assets (1300, 1400) + Δ liabilities (2010, 2020, 2030, 2100, 2110, 2200)
 *  financing = capital contributed (3010) − drawings (3020)
 * `check = closing − (opening + net change)` where closing comes from the DIRECT cash movements, so a zero check proves the indirect derivation.
 */
export function buildCashFlow(openingBalances: readonly AccountBalance[], movements: readonly AccountMovement[], period: Period, opts: { lang?: StatementLang } = {}): CashFlowStatement {
  const lang = opts.lang ?? 'fa'
  const L = (fa: string, en: string): string => (lang === 'fa' ? fa : en)
  const openingCash = openingBalances.filter((b) => isCashAccount(b.account)).reduce((a, b) => a + b.irt, 0)
  let cashDelta = 0
  let pnlDelta = 0 // debit-positive
  let usdtDelta = 0
  let revalDelta = 0
  let revalSeen = false
  let fx7010 = 0
  let otherAssets = 0
  const liab = new Map<string, number>()
  let capital = 0
  let drawings = 0
  for (const mv of movements) {
    const meta = accountMeta(mv.account)
    const d = mv.debitIrt - mv.creditIrt
    if (isCashAccount(mv.account)) {
      cashDelta += d
      continue
    }
    if (meta.currency === 'USDT') {
      usdtDelta += d
      if (mv.revalIrt !== undefined) {
        revalDelta += mv.revalIrt
        revalSeen = true
      }
      continue
    }
    switch (meta.type) {
      case 'asset':
        otherAssets += d
        break
      case 'liability':
        liab.set(meta.base, (liab.get(meta.base) ?? 0) - d)
        break
      case 'equity':
        if (meta.base === '3010') capital += -d
        else if (meta.base === '3020') drawings += -d
        else throw new RangeError('3900 retained earnings must never be posted directly')
        break
      default:
        pnlDelta += d
        if (meta.base === '7010') fx7010 += -d
    }
  }
  const netProfit = -pnlDelta
  const fxGain = revalSeen ? revalDelta : fx7010 // profit-effect of revaluation on USDT book value
  const operating: StatementLine[] = [
    { code: 'CF_NET_PROFIT', name: L('سود خالص', 'Net profit'), amountIrt: netProfit },
    { code: 'CF_FX_NONCASH', name: L('تعدیل تسعیر ارز (غیرنقدی)', 'FX revaluation (non-cash)'), amountIrt: -fxGain },
    { code: 'CF_USDT_INVENTORY', name: L('تغییر موجودی تتر (به بهای دفتری، بدون تسعیر)', 'Change in USDT inventory at book (excl. revaluation)'), amountIrt: -(usdtDelta - fxGain) },
  ]
  if (otherAssets !== 0) operating.push({ code: 'CF_OTHER_ASSETS', name: L('تغییر سایر دارایی‌ها', 'Change in other assets'), amountIrt: -otherAssets })
  for (const [base, v] of [...liab.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (v !== 0) operating.push({ code: `CF_${base}`, name: L(`تغییر ${accountMeta(base).nameFa}`, `Change in ${accountMeta(base).name}`), amountIrt: v })
  }
  const financing: StatementLine[] = []
  if (capital !== 0) financing.push({ code: 'CF_CAPITAL', name: L('آورده‌ی مالک', 'Owner capital'), amountIrt: capital })
  if (drawings !== 0) financing.push({ code: 'CF_DRAWINGS', name: L('برداشت مالک', 'Owner drawings'), amountIrt: drawings })
  const totalOperating = operating.reduce((a, l) => a + l.amountIrt, 0)
  const totalFinancing = financing.reduce((a, l) => a + l.amountIrt, 0)
  const netChange = totalOperating + totalFinancing
  const closingCash = openingCash + cashDelta
  return {
    period,
    openingCashIrt: openingCash,
    operating,
    totalOperating,
    financing,
    totalFinancing,
    netChangeIrt: netChange,
    closingCashIrt: closingCash,
    check: closingCash - (openingCash + netChange),
  }
}

// ───────────────────────────── all three from entries ─────────────────────────────

/** Convenience: income + balance sheet (at `period.to`) + cash flow from the full entry list. */
export function buildStatements(input: { entries: readonly JournalEntry[]; period: Period; usdtMarket: number; lang?: StatementLang }): Statements {
  const { entries, period } = input
  const opening = balancesFromEntries(entries, period.from - 1)
  const movements = movementsFromEntries(entries, { from: period.from, to: period.to })
  const closing = applyMovements(opening, movements)
  const opts = { lang: input.lang ?? 'fa' }
  return {
    period,
    income: buildIncomeStatement(movements, period, opts),
    balance: buildBalanceSheet(closing, period.to, input.usdtMarket, opts),
    cashflow: buildCashFlow(opening, movements, period, opts),
  }
}

// ───────────────────────────── converters ─────────────────────────────

const NON_MONEY_KEYS = new Set(['grossMarginPct', 'netMarginPct', 'asOf', 'from', 'to', 'qtyMicro'])

function scale<T>(v: T, factor: number): T {
  if (typeof v === 'number') return (v * factor) as unknown as T
  if (Array.isArray(v)) return v.map((x) => scale(x, factor)) as unknown as T
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      out[k] = NON_MONEY_KEYS.has(k) || typeof x === 'string' || typeof x === 'boolean' ? x : k === 'period' ? x : scale(x, factor)
    }
    return out as T
  }
  return v
}

/**
 * Real (inflation-adjusted) view: every money amount ÷ `inflationIndex` (price level relative to the base period, e.g. 1.45 after +45 %).
 * Amounts are NOT rounded (reporting view): identities such as `check = 0` stay exact zero, other sums hold up to float error.
 */
export function realTerms<T extends IncomeStatement | BalanceSheet | CashFlowStatement>(statement: T, inflationIndex: number): T {
  if (!(inflationIndex > 0) || !Number.isFinite(inflationIndex)) throw new RangeError('inflationIndex must be > 0')
  return scale(statement, 1 / inflationIndex)
}

/** USD(T) view: every money amount ÷ `mid` (Toman per USDT). Not rounded; see `realTerms`. */
export function usdTerms<T extends IncomeStatement | BalanceSheet | CashFlowStatement>(statement: T, mid: number): T {
  if (!(mid > 0) || !Number.isFinite(mid)) throw new RangeError('mid must be > 0')
  return scale(statement, 1 / mid)
}

/** Round-half-up Toman helper re-exported for report code that needs integer display values. */
export const roundIrt = (x: number): number => toInt(D(x), 'half_up', 'roundIrt')
