import { AppError, type EpochMs, type RateSnapshot, type TreasuryAction, type UsdtLot } from '@hiclaude/contracts'
import type { Database } from '../db'
import { compact, fromJson, fromJsonOpt, nn, toJson, toJsonOpt } from './json'
import { RateSnapshotSchema, UnknownRecordSchema } from './schemas'

// ───────────────────────── usdt lots ─────────────────────────
interface LotRow {
  id: string
  exchange_id: string
  qty_micro: number
  remaining_micro: number
  cost_irt: number
  acquired_at: number
  withdrawable_at: number
  status: UsdtLot['status']
}
const toLot = (r: LotRow): UsdtLot => ({
  id: r.id,
  exchangeId: r.exchange_id,
  qtyMicro: r.qty_micro,
  remainingMicro: r.remaining_micro,
  costIrt: r.cost_irt,
  acquiredAt: r.acquired_at,
  withdrawableAt: r.withdrawable_at,
  status: r.status,
})

export class LotsRepo {
  constructor(private readonly db: Database) {}
  insert(l: UsdtLot): UsdtLot {
    this.db.run('INSERT INTO usdt_lots (id, exchange_id, qty_micro, remaining_micro, cost_irt, acquired_at, withdrawable_at, status) VALUES (?,?,?,?,?,?,?,?)', [
      l.id, l.exchangeId, l.qtyMicro, l.remainingMicro, l.costIrt, l.acquiredAt, l.withdrawableAt, l.status,
    ])
    return l
  }
  get(id: string): UsdtLot | undefined {
    const r = this.db.get<LotRow>('SELECT * FROM usdt_lots WHERE id = ?', [id])
    return r && toLot(r)
  }
  update(id: string, patch: Partial<Pick<UsdtLot, 'remainingMicro' | 'costIrt' | 'withdrawableAt' | 'status'>>): UsdtLot {
    const map: Record<string, string> = { remainingMicro: 'remaining_micro', costIrt: 'cost_irt', withdrawableAt: 'withdrawable_at', status: 'status' }
    const sets: string[] = []
    const params: unknown[] = []
    for (const [k, v] of Object.entries(patch)) (sets.push(`${map[k]} = ?`), params.push(v))
    if (sets.length) this.db.run(`UPDATE usdt_lots SET ${sets.join(', ')} WHERE id = ?`, [...params, id])
    const l = this.get(id)
    if (!l) throw new AppError('NOT_FOUND', `lot ${id} not found`)
    return l
  }
  list(f: { exchangeId?: string; status?: UsdtLot['status']; includeEmpty?: boolean } = {}): UsdtLot[] {
    const w: string[] = []
    const params: unknown[] = []
    if (f.exchangeId) (w.push('exchange_id = ?'), params.push(f.exchangeId))
    if (f.status) (w.push('status = ?'), params.push(f.status))
    if (!f.includeEmpty) w.push('remaining_micro > 0')
    return this.db.all<LotRow>(`SELECT * FROM usdt_lots ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY acquired_at, id`, params).map(toLot)
  }
  /** Lots whose lock has expired by `now` and still hold USDT (FIFO by acquisition). Optionally per exchange. */
  listAvailable(now: EpochMs, exchangeId?: string): UsdtLot[] {
    return this.db
      .all<LotRow>(
        `SELECT * FROM usdt_lots WHERE remaining_micro > 0 AND status <> 'withdrawn' AND withdrawable_at <= ? ${exchangeId ? 'AND exchange_id = ?' : ''} ORDER BY acquired_at, id`,
        exchangeId ? [now, exchangeId] : [now],
      )
      .map(toLot)
  }
  /** Lots still under the withdrawal lock at `now`. */
  listLocked(now: EpochMs, exchangeId?: string): UsdtLot[] {
    return this.db
      .all<LotRow>(
        `SELECT * FROM usdt_lots WHERE remaining_micro > 0 AND status <> 'withdrawn' AND withdrawable_at > ? ${exchangeId ? 'AND exchange_id = ?' : ''} ORDER BY withdrawable_at, id`,
        exchangeId ? [now, exchangeId] : [now],
      )
      .map(toLot)
  }
  /** Promote locked lots whose lock expired to `available`; returns how many changed. */
  promoteUnlocked(now: EpochMs): number {
    return this.db.run(`UPDATE usdt_lots SET status = 'available' WHERE status = 'locked' AND withdrawable_at <= ?`, [now]).changes
  }
  sums(exchangeId?: string): { totalMicro: number; costIrt: number } {
    const r = this.db.get<{ q: number | null; c: number | null }>(
      `SELECT SUM(remaining_micro) AS q, SUM(CAST(ROUND(cost_irt * 1.0 * remaining_micro / NULLIF(qty_micro,0)) AS INTEGER)) AS c FROM usdt_lots WHERE status <> 'withdrawn' ${exchangeId ? 'AND exchange_id = ?' : ''}`,
      exchangeId ? [exchangeId] : [],
    )
    return { totalMicro: r?.q ?? 0, costIrt: r?.c ?? 0 }
  }
}

// ───────────────────────── treasury actions ─────────────────────────
interface ActionRow {
  id: string
  type: TreasuryAction['type']
  at: number
  status: TreasuryAction['status']
  exchange_id: string | null
  provider_id: string | null
  amount_irt: number | null
  amount_micro_usdt: number | null
  network: TreasuryAction['network'] | null
  rate: number | null
  fee_irt: number | null
  fee_micro_usdt: number | null
  note: string | null
  data_json: string | null
}
export type StoredTreasuryAction = TreasuryAction & { data?: Record<string, unknown> }
const toAction = (r: ActionRow): StoredTreasuryAction =>
  compact({
    id: r.id,
    type: r.type,
    at: r.at,
    status: r.status,
    exchangeId: nn(r.exchange_id),
    providerId: nn(r.provider_id),
    amountIrt: nn(r.amount_irt),
    amountMicroUsdt: nn(r.amount_micro_usdt),
    network: nn(r.network),
    rate: nn(r.rate),
    feeIrt: nn(r.fee_irt),
    feeMicroUsdt: nn(r.fee_micro_usdt),
    note: nn(r.note),
    data: fromJsonOpt(UnknownRecordSchema, r.data_json, 'treasury_actions.data_json'),
  }) as StoredTreasuryAction

export class TreasuryActionsRepo {
  constructor(private readonly db: Database) {}
  insert(a: StoredTreasuryAction): StoredTreasuryAction {
    this.db.run(
      `INSERT INTO treasury_actions (id, type, at, status, exchange_id, provider_id, amount_irt, amount_micro_usdt, network, rate, fee_irt, fee_micro_usdt, note, data_json)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [a.id, a.type, a.at, a.status, a.exchangeId, a.providerId, a.amountIrt, a.amountMicroUsdt, a.network, a.rate, a.feeIrt, a.feeMicroUsdt, a.note,
        toJsonOpt(UnknownRecordSchema, a.data, 'treasury action data')],
    )
    return this.get(a.id) as StoredTreasuryAction
  }
  get(id: string): StoredTreasuryAction | undefined {
    const r = this.db.get<ActionRow>('SELECT * FROM treasury_actions WHERE id = ?', [id])
    return r && toAction(r)
  }
  update(id: string, patch: Partial<Omit<StoredTreasuryAction, 'id' | 'type'>>): StoredTreasuryAction {
    const map: Record<string, string> = {
      at: 'at', status: 'status', exchangeId: 'exchange_id', providerId: 'provider_id', amountIrt: 'amount_irt', amountMicroUsdt: 'amount_micro_usdt',
      network: 'network', rate: 'rate', feeIrt: 'fee_irt', feeMicroUsdt: 'fee_micro_usdt', note: 'note',
    }
    const sets: string[] = []
    const params: unknown[] = []
    for (const [k, v] of Object.entries(patch)) {
      if (k === 'data') (sets.push('data_json = ?'), params.push(toJsonOpt(UnknownRecordSchema, v as Record<string, unknown> | undefined, 'treasury action data')))
      else {
        if (!map[k]) throw new Error(`TreasuryActionsRepo.update: unknown field ${k}`)
        sets.push(`${map[k]} = ?`)
        params.push(v)
      }
    }
    if (sets.length) this.db.run(`UPDATE treasury_actions SET ${sets.join(', ')} WHERE id = ?`, [...params, id])
    const a = this.get(id)
    if (!a) throw new AppError('NOT_FOUND', `treasury action ${id} not found`)
    return a
  }
  list(f: { type?: TreasuryAction['type']; status?: TreasuryAction['status'] | TreasuryAction['status'][]; since?: EpochMs; limit?: number } = {}): StoredTreasuryAction[] {
    const w: string[] = []
    const params: unknown[] = []
    if (f.type) (w.push('type = ?'), params.push(f.type))
    if (f.status) {
      const s = Array.isArray(f.status) ? f.status : [f.status]
      w.push(`status IN (${s.map(() => '?').join(',')})`)
      params.push(...s)
    }
    if (f.since !== undefined) (w.push('at >= ?'), params.push(f.since))
    return this.db
      .all<ActionRow>(`SELECT * FROM treasury_actions ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY at DESC, id DESC LIMIT ?`, [...params, f.limit ?? 100])
      .map(toAction)
  }
}

// ───────────────────────── rate snapshots ─────────────────────────
export class RatesRepo {
  constructor(private readonly db: Database) {}
  insert(s: RateSnapshot): RateSnapshot {
    this.db.run('INSERT INTO rate_snapshots (id, ts, status, mid, executable_ask, executable_bid, snapshot_json) VALUES (?,?,?,?,?,?,?)', [
      s.id, s.ts, s.status, s.mid, s.executableAsk, s.executableBid, toJson(RateSnapshotSchema, s, 'rate snapshot'),
    ])
    return s
  }
  get(id: string): RateSnapshot | undefined {
    const r = this.db.get<{ snapshot_json: string }>('SELECT snapshot_json FROM rate_snapshots WHERE id = ?', [id])
    return r && (fromJson(RateSnapshotSchema, r.snapshot_json, 'rate_snapshots.snapshot_json') as RateSnapshot)
  }
  latest(): RateSnapshot | undefined {
    const r = this.db.get<{ snapshot_json: string }>('SELECT snapshot_json FROM rate_snapshots ORDER BY ts DESC, rowid DESC LIMIT 1')
    return r && (fromJson(RateSnapshotSchema, r.snapshot_json, 'rate_snapshots.snapshot_json') as RateSnapshot)
  }
  /** Snapshots in [from, to] ascending; `limit` keeps the most recent N when the range is larger. */
  range(from: EpochMs, to: EpochMs, limit = 5000): RateSnapshot[] {
    const rows = this.db.all<{ snapshot_json: string }>(
      'SELECT snapshot_json FROM (SELECT snapshot_json, ts, rowid AS rid FROM rate_snapshots WHERE ts >= ? AND ts <= ? ORDER BY ts DESC, rid DESC LIMIT ?) ORDER BY ts, rid',
      [from, to, limit],
    )
    return rows.map((r) => fromJson(RateSnapshotSchema, r.snapshot_json, 'rate_snapshots.snapshot_json') as RateSnapshot)
  }
  /** Lightweight series for charts: [{ts, mid, ask, bid, status}]. */
  series(from: EpochMs, to: EpochMs, limit = 5000): { ts: number; mid: number; ask: number; bid: number; status: string }[] {
    return this.db.all<{ ts: number; mid: number; ask: number; bid: number; status: string }>(
      'SELECT ts, mid, executable_ask AS ask, executable_bid AS bid, status FROM (SELECT * FROM rate_snapshots WHERE ts >= ? AND ts <= ? ORDER BY ts DESC LIMIT ?) ORDER BY ts',
      [from, to, limit],
    )
  }
  count(): number {
    return this.db.scalar<number>('SELECT COUNT(*) FROM rate_snapshots') ?? 0
  }
  deleteBefore(ts: EpochMs): number {
    return this.db.run('DELETE FROM rate_snapshots WHERE ts < ?', [ts]).changes
  }
}
