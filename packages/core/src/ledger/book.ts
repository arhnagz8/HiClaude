/**
 * LedgerBook — in-memory double-entry engine (tests, the app's LedgerService for pre-validation, simulator assertions).
 *
 * Invariants enforced on every `post` (a violation throws and leaves the book UNCHANGED):
 *  1. at least one line; all `qty`/`irt` are safe integers; every account exists in the chart (qualified accounts carry a qualifier);
 *  2. Σ irt over the entry = 0   (debit +, credit −);
 *  3. IRT accounts: `qty === irt`;
 *  4. USDT accounts: `qty` is micro-USDT and `irt` its book value; a debit (`qty > 0`) needs `irt ≥ 0`, a credit needs `irt ≤ 0`;
 *     a revaluation line has `qty = 0` and only moves `irt`;
 *  5. after posting every USDT account has `qty ≥ 0`, book `irt ≥ 0`, and `qty = 0 ⇒ irt = 0` (the whole book value must leave with the last unit).
 *
 * USDT disposals use the account's WEIGHTED-AVERAGE book cost: `disposeCost(account, qty) = round_half_up(book · qty / balanceQty)`.
 */
import type { JournalEntry, JournalEntryInput, LedgerLine } from '@hiclaude/contracts'
import { D, assertSafeInt, toInt, microToIrt } from '../money'
import { accountMeta, acct, isUsdtAccount, splitAccount } from './accounts'

export interface AccountBalance {
  account: string
  /** Micro-USDT for USDT accounts; Toman for IRT accounts (== irt). Debit-positive. */
  qty: number
  /** Toman (book value for USDT accounts). Debit-positive: assets/expenses > 0, liabilities/revenue/equity < 0 in normal conditions. */
  irt: number
}

export interface TrialBalanceRow {
  account: string
  name: string
  qty: number
  debitIrt: number
  creditIrt: number
}

export interface TrialBalance {
  rows: TrialBalanceRow[]
  totalDebitIrt: number
  totalCreditIrt: number
  /** totalDebit − totalCredit; always 0 when every entry balanced. */
  difference: number
}

export interface LedgerSnapshot {
  seq: number
  balances: AccountBalance[]
  entries: JournalEntry[]
}

export interface AccountingEquation {
  assets: number
  liabilities: number
  /** Owner capital − drawings (3010 + 3020), excluding current/retained earnings. */
  contributedEquity: number
  /** Cumulative profit (revenue − cogs − expenses ± other) = retained earnings. */
  retainedEarnings: number
  /** assets − liabilities − contributedEquity − retainedEarnings; MUST be 0. */
  check: number
}

/** Static validation of an entry (no book needed). Throws `RangeError` with a precise message. */
export function validateEntry(entry: JournalEntryInput): void {
  if (!Number.isSafeInteger(entry.ts)) throw new RangeError('entry.ts must be a safe integer')
  if (!entry.lines || entry.lines.length === 0) throw new RangeError(`entry ${entry.kind}: no lines`)
  let sum = 0
  for (const l of entry.lines) {
    assertSafeInt(l.qty, `${entry.kind} line qty`)
    assertSafeInt(l.irt, `${entry.kind} line irt`)
    const meta = accountMeta(l.account)
    if (meta.currency === 'IRT') {
      if (l.qty !== l.irt) throw new RangeError(`entry ${entry.kind}: IRT account ${l.account} needs qty === irt (got qty ${l.qty}, irt ${l.irt})`)
    } else {
      if (l.qty > 0 && l.irt < 0) throw new RangeError(`entry ${entry.kind}: USDT debit to ${l.account} with negative book value`)
      if (l.qty < 0 && l.irt > 0) throw new RangeError(`entry ${entry.kind}: USDT credit to ${l.account} with positive book value`)
    }
    sum += l.irt
  }
  if (sum !== 0) throw new RangeError(`entry ${entry.kind}: unbalanced, Σirt = ${sum}`)
}

export class LedgerBook {
  private readonly bal = new Map<string, { qty: number; irt: number }>()
  private log: JournalEntry[] = []
  private seq = 0

  /** Posts an entry atomically; returns the stored entry (`id`, `seq` assigned). */
  post(entry: JournalEntryInput & { id?: string }): JournalEntry {
    validateEntry(entry)
    // apply tentatively
    const next = new Map<string, { qty: number; irt: number }>()
    for (const l of entry.lines) {
      const cur = next.get(l.account) ?? { ...(this.bal.get(l.account) ?? { qty: 0, irt: 0 }) }
      cur.qty += l.qty
      cur.irt += l.irt
      assertSafeInt(cur.qty, 'balance qty')
      assertSafeInt(cur.irt, 'balance irt')
      next.set(l.account, cur)
    }
    for (const [account, b] of next) {
      if (isUsdtAccount(account)) {
        if (b.qty < 0) throw new RangeError(`entry ${entry.kind}: ${account} would have negative USDT quantity (${b.qty})`)
        if (b.irt < 0) throw new RangeError(`entry ${entry.kind}: ${account} would have negative book value (${b.irt})`)
        if (b.qty === 0 && b.irt !== 0) throw new RangeError(`entry ${entry.kind}: ${account} has zero quantity but residual book value ${b.irt} (dispose with disposeCost)`)
      }
    }
    for (const [account, b] of next) this.bal.set(account, b)
    this.seq += 1
    const stored: JournalEntry = {
      id: entry.id ?? `je_${this.seq}`,
      seq: this.seq,
      ts: entry.ts,
      kind: entry.kind,
      memo: entry.memo,
      ...(entry.refs ? { refs: { ...entry.refs } } : {}),
      lines: entry.lines.map((l) => ({ account: l.account, qty: l.qty, irt: l.irt })),
    }
    this.log.push(stored)
    return stored
  }

  /** Current balance of an account (zeros for accounts never touched). Debit-positive. */
  balance(account: string): { qty: number; irt: number } {
    accountMeta(account)
    const b = this.bal.get(account)
    return b ? { qty: b.qty, irt: b.irt } : { qty: 0, irt: 0 }
  }

  /** All non-empty accounts, sorted by code. */
  balances(): AccountBalance[] {
    return [...this.bal.entries()]
      .filter(([, b]) => b.qty !== 0 || b.irt !== 0)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([account, b]) => ({ account, qty: b.qty, irt: b.irt }))
  }

  /** Entries in posting order. */
  entries(): readonly JournalEntry[] {
    return this.log
  }

  /** Trial balance: every account with its debit/credit column; totals must match. */
  trialBalance(): TrialBalance {
    const rows: TrialBalanceRow[] = this.balances().map((b) => ({
      account: b.account,
      name: accountMeta(b.account).name,
      qty: b.qty,
      debitIrt: b.irt > 0 ? b.irt : 0,
      creditIrt: b.irt < 0 ? -b.irt : 0,
    }))
    const totalDebitIrt = rows.reduce((a, r) => a + r.debitIrt, 0)
    const totalCreditIrt = rows.reduce((a, r) => a + r.creditIrt, 0)
    return { rows, totalDebitIrt, totalCreditIrt, difference: totalDebitIrt - totalCreditIrt }
  }

  /** Assets = Liabilities + Equity (+ cumulative profit). `check` must be 0. */
  equation(): AccountingEquation {
    let assets = 0
    let liabilities = 0
    let contributed = 0
    let pnl = 0
    for (const [account, b] of this.bal) {
      const m = accountMeta(account)
      switch (m.type) {
        case 'asset':
          assets += b.irt
          break
        case 'liability':
          liabilities -= b.irt
          break
        case 'equity':
          contributed -= b.irt
          break
        default:
          pnl -= b.irt // revenue, cogs, expense, other: profit = −Σ irt
      }
    }
    return { assets, liabilities, contributedEquity: contributed, retainedEarnings: pnl, check: assets - liabilities - contributed - pnl }
  }

  /**
   * Book cost (Toman, positive) of disposing `qty` micro-USDT from a USDT account at its weighted-average cost:
   * `round_half_up(book · qty / balanceQty)`; disposing the whole balance returns the whole book value exactly.
   */
  disposeCost(account: string, qty: number): number {
    if (!isUsdtAccount(account)) throw new RangeError(`${account} is not a USDT account`)
    assertSafeInt(qty, 'qty')
    if (qty < 0) throw new RangeError('disposeCost(): negative qty')
    const b = this.balance(account)
    if (qty > b.qty) throw new RangeError(`disposeCost(): ${account} has only ${b.qty} micro-USDT, cannot dispose ${qty}`)
    if (qty === 0) return 0
    if (qty === b.qty) return b.irt
    return toInt(D(b.irt).mul(qty).div(b.qty), 'half_up', 'disposeCost')
  }

  /**
   * E11 daily revaluation entry for the given USDT accounts at `mid` (Toman per USDT). For every account with `qty > 0`:
   * target = round_half_up(qty · mid / 1e6), Δ = target − book. Δ > 0 (gain): Dr account (qty 0, +Δ), Cr 7010 (−Δ); Δ < 0 mirrors.
   * `lines` is EMPTY when nothing changes — `post()` rejects empty entries, so check `lines.length` first.
   * `usdtAccounts` defaults to every USDT account that currently has a balance.
   */
  revalue(usdtAccounts: readonly string[] | undefined, mid: number, ts: number): JournalEntryInput {
    return revaluationEntry(this.balances(), usdtAccounts, mid, ts)
  }

  /** Serialisable copy of the whole book. */
  snapshot(): LedgerSnapshot {
    return { seq: this.seq, balances: this.balances(), entries: structuredClone(this.log) }
  }

  /** Replaces the book's state with a snapshot (validates balances against the entries it carries). */
  restore(s: LedgerSnapshot): void {
    this.bal.clear()
    for (const b of s.balances) this.bal.set(b.account, { qty: b.qty, irt: b.irt })
    this.log = structuredClone(s.entries)
    this.seq = s.seq
  }
}

/** Pure form of `LedgerBook.revalue` working from a balance list (used by the app's LedgerService). */
export function revaluationEntry(balances: readonly AccountBalance[], usdtAccounts: readonly string[] | undefined, mid: number, ts: number): JournalEntryInput {
  if (!Number.isFinite(mid) || mid <= 0) throw new RangeError('revaluation mid must be > 0')
  const byAcct = new Map(balances.map((b) => [b.account, b]))
  const accounts = (usdtAccounts ?? balances.filter((b) => isUsdtAccount(b.account)).map((b) => b.account)).slice().sort()
  const lines: LedgerLine[] = []
  let total = 0
  for (const a of accounts) {
    if (!isUsdtAccount(a)) throw new RangeError(`${a} is not a USDT account`)
    const b = byAcct.get(a)
    if (!b || b.qty <= 0) continue
    const target = microToIrt(b.qty, mid, 'half_up')
    const delta = target - b.irt
    if (delta === 0) continue
    lines.push({ account: a, qty: 0, irt: delta })
    total += delta
  }
  if (total !== 0) lines.push({ account: acct('7010'), qty: -total, irt: -total })
  return { ts, kind: 'E11', memo: `Daily revaluation at mid ${mid}`, lines }
}

export { splitAccount }
