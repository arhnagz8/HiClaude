/**
 * Low-level ledger persistence. Append-only (enforced by triggers in 001_init.sql). No posting templates and no business rules
 * live here — those belong to B3's LedgerService (+ core/ledger templates). The only invariant enforced at this layer is the
 * accounting identity Σ irt == 0 per entry, because an unbalanced entry can never be valid.
 */
import { AppError, type EpochMs, type JournalEntry, type JournalEntryInput, type LedgerAccount, type LedgerLine } from '@hiclaude/contracts'
import type { Database } from '../db'
import { compact, fromJson, toJson } from './json'
import { LedgerRefsSchema } from './schemas'

interface EntryRow {
  seq: number
  id: string
  ts: number
  kind: string
  memo: string
  refs_json: string
  order_id: string | null
  product_family: string | null
  provider_id: string | null
  exchange_id: string | null
  customer_id: string | null
  channel: string | null
}
interface LineRow {
  entry_id: string
  line_no: number
  account: string
  qty: number
  irt: number
}

export interface LedgerEntryFilter {
  account?: string
  /** account code prefix, e.g. '1110' matches '1110:nobitex' */
  accountPrefix?: string
  from?: EpochMs
  /** exclusive upper bound */
  to?: EpochMs
  kind?: string | string[]
  orderId?: string
  customerId?: string
  providerId?: string
  exchangeId?: string
  productFamily?: string
  afterSeq?: number
  limit?: number
  offset?: number
  order?: 'asc' | 'desc'
}

export interface AccountSum {
  account: string
  qty: number
  irt: number
  debitIrt: number
  creditIrt: number
}

export class LedgerRepo {
  constructor(private readonly db: Database) {}

  // ── accounts (registry/metadata) ──
  upsertAccount(a: LedgerAccount): void {
    this.db.run(
      'INSERT INTO ledger_accounts (code, name, type, currency) VALUES (?,?,?,?) ON CONFLICT(code) DO UPDATE SET name = excluded.name, type = excluded.type, currency = excluded.currency',
      [a.code, a.name, a.type, a.currency],
    )
  }
  getAccount(code: string): LedgerAccount | undefined {
    return this.db.get<LedgerAccount>('SELECT code, name, type, currency FROM ledger_accounts WHERE code = ?', [code])
  }
  listAccounts(): LedgerAccount[] {
    return this.db.all<LedgerAccount>('SELECT code, name, type, currency FROM ledger_accounts ORDER BY code')
  }

  // ── entries ──
  /** Appends a balanced entry (entry + lines atomically) and returns it with its sequence number. */
  insertEntry(entry: JournalEntryInput & { id: string }): JournalEntry {
    if (entry.lines.length === 0) throw new AppError('INTERNAL', 'ledger entry has no lines', { id: entry.id })
    let sum = 0
    for (const l of entry.lines) {
      if (!Number.isSafeInteger(l.qty) || !Number.isSafeInteger(l.irt)) throw new AppError('INTERNAL', 'ledger line amounts must be safe integers', { id: entry.id, line: l })
      sum += l.irt
    }
    if (sum !== 0) throw new AppError('INTERNAL', `unbalanced ledger entry (Σirt=${sum})`, { id: entry.id, kind: entry.kind })
    const refs = entry.refs ?? {}
    return this.db.tx(() => {
      const r = this.db.run(
        `INSERT INTO ledger_entries (id, ts, kind, memo, refs_json, order_id, product_family, provider_id, exchange_id, customer_id, channel) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [entry.id, entry.ts, entry.kind, entry.memo, toJson(LedgerRefsSchema, refs, 'ledger refs'), refs.orderId, refs.productFamily, refs.providerId, refs.exchangeId,
          refs.customerId, refs.channel],
      )
      entry.lines.forEach((l, i) => this.db.run('INSERT INTO ledger_lines (entry_id, line_no, account, qty, irt, ts) VALUES (?,?,?,?,?,?)', [entry.id, i, l.account, l.qty, l.irt, entry.ts]))
      return { id: entry.id, seq: r.lastInsertRowid, ts: entry.ts, kind: entry.kind, memo: entry.memo, refs: entry.refs, lines: entry.lines.map((l) => ({ ...l })) }
    })
  }

  getEntry(id: string): JournalEntry | undefined {
    const r = this.db.get<EntryRow>('SELECT * FROM ledger_entries WHERE id = ?', [id])
    return r && this.hydrate([r])[0]
  }

  listEntries(f: LedgerEntryFilter = {}): JournalEntry[] {
    const w: string[] = []
    const params: unknown[] = []
    if (f.account || f.accountPrefix) {
      const cond = f.account ? 'l.account = ?' : "(l.account = ? OR l.account LIKE ? || ':%')"
      w.push(`e.id IN (SELECT l.entry_id FROM ledger_lines l WHERE ${cond}${f.from !== undefined ? ' AND l.ts >= ?' : ''}${f.to !== undefined ? ' AND l.ts < ?' : ''})`)
      if (f.account) params.push(f.account)
      else params.push(f.accountPrefix, f.accountPrefix)
      if (f.from !== undefined) params.push(f.from)
      if (f.to !== undefined) params.push(f.to)
    } else {
      if (f.from !== undefined) (w.push('e.ts >= ?'), params.push(f.from))
      if (f.to !== undefined) (w.push('e.ts < ?'), params.push(f.to))
    }
    if (f.kind) {
      const k = Array.isArray(f.kind) ? f.kind : [f.kind]
      w.push(`e.kind IN (${k.map(() => '?').join(',')})`)
      params.push(...k)
    }
    if (f.orderId) (w.push('e.order_id = ?'), params.push(f.orderId))
    if (f.customerId) (w.push('e.customer_id = ?'), params.push(f.customerId))
    if (f.providerId) (w.push('e.provider_id = ?'), params.push(f.providerId))
    if (f.exchangeId) (w.push('e.exchange_id = ?'), params.push(f.exchangeId))
    if (f.productFamily) (w.push('e.product_family = ?'), params.push(f.productFamily))
    if (f.afterSeq !== undefined) (w.push('e.seq > ?'), params.push(f.afterSeq))
    const dir = f.order === 'desc' ? 'DESC' : 'ASC'
    const rows = this.db.all<EntryRow>(
      `SELECT e.* FROM ledger_entries e ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY e.seq ${dir} LIMIT ? OFFSET ?`,
      [...params, f.limit ?? 1000, f.offset ?? 0],
    )
    return this.hydrate(rows)
  }

  countEntries(): number {
    return this.db.scalar<number>('SELECT COUNT(*) FROM ledger_entries') ?? 0
  }
  lastSeq(): number {
    return this.db.scalar<number>('SELECT COALESCE(MAX(seq), 0) FROM ledger_entries') ?? 0
  }

  private hydrate(rows: EntryRow[]): JournalEntry[] {
    if (rows.length === 0) return []
    const byId = new Map<string, LedgerLine[]>()
    // chunk to stay below SQLite's variable limit
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500)
      const lines = this.db.all<LineRow>(
        `SELECT entry_id, line_no, account, qty, irt FROM ledger_lines WHERE entry_id IN (${chunk.map(() => '?').join(',')}) ORDER BY entry_id, line_no`,
        chunk.map((r) => r.id),
      )
      for (const l of lines) {
        const arr = byId.get(l.entry_id) ?? []
        arr.push({ account: l.account, qty: l.qty, irt: l.irt })
        byId.set(l.entry_id, arr)
      }
    }
    return rows.map(
      (r) =>
        compact({
          id: r.id,
          seq: r.seq,
          ts: r.ts,
          kind: r.kind,
          memo: r.memo,
          refs: fromJson(LedgerRefsSchema, r.refs_json, 'ledger_entries.refs_json'),
          lines: byId.get(r.id) ?? [],
        }) as unknown as JournalEntry,
    )
  }

  /**
   * Per-account sums over a time range: from (inclusive) … to (exclusive). Omit both for all-time balances.
   * `irt` and `qty` are signed net (debit-positive); debitIrt/creditIrt are the gross positive/negative irt sums.
   */
  sumByAccount(range: { from?: EpochMs; to?: EpochMs; account?: string; accountPrefix?: string; kind?: string; orderId?: string } = {}): AccountSum[] {
    const w: string[] = []
    const params: unknown[] = []
    if (range.from !== undefined) (w.push('l.ts >= ?'), params.push(range.from))
    if (range.to !== undefined) (w.push('l.ts < ?'), params.push(range.to))
    if (range.account) (w.push('l.account = ?'), params.push(range.account))
    if (range.accountPrefix) (w.push("(l.account = ? OR l.account LIKE ? || ':%')"), params.push(range.accountPrefix, range.accountPrefix))
    const join = range.kind || range.orderId ? 'JOIN ledger_entries e ON e.id = l.entry_id' : ''
    if (range.kind) (w.push('e.kind = ?'), params.push(range.kind))
    if (range.orderId) (w.push('e.order_id = ?'), params.push(range.orderId))
    return this.db
      .all<{ account: string; qty: number; irt: number; d: number; c: number }>(
        `SELECT l.account AS account, SUM(l.qty) AS qty, SUM(l.irt) AS irt,
                SUM(CASE WHEN l.irt > 0 THEN l.irt ELSE 0 END) AS d, SUM(CASE WHEN l.irt < 0 THEN -l.irt ELSE 0 END) AS c
           FROM ledger_lines l ${join} ${w.length ? 'WHERE ' + w.join(' AND ') : ''} GROUP BY l.account ORDER BY l.account`,
        params,
      )
      .map((r) => ({ account: r.account, qty: r.qty, irt: r.irt, debitIrt: r.d, creditIrt: r.c }))
  }

  /** Net (qty, irt) of one account as of `asOf` (exclusive; omit for now). */
  balance(account: string, asOf?: EpochMs): { qty: number; irt: number } {
    const r = this.db.get<{ q: number | null; i: number | null }>(
      `SELECT SUM(qty) AS q, SUM(irt) AS i FROM ledger_lines WHERE account = ?${asOf !== undefined ? ' AND ts < ?' : ''}`,
      asOf !== undefined ? [account, asOf] : [account],
    )
    return { qty: r?.q ?? 0, irt: r?.i ?? 0 }
  }

  /** Σirt over the whole ledger (must always be 0). */
  totalImbalance(): number {
    return this.db.scalar<number>('SELECT COALESCE(SUM(irt), 0) FROM ledger_lines') ?? 0
  }
}
