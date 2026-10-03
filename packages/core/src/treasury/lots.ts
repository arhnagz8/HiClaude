/**
 * UsdtLotBook — FIFO book of USDT lots used for LOCK TIMING (post-deposit withdrawal lock) and cost basis analysis.
 * The ledger (weighted-average per account) remains the financial truth; lots answer "how much can I withdraw NOW and when does the rest unlock?".
 *
 * Lots live at an exchange until withdrawn; `withdrawFromExchange` moves them (cost preserved) to the pseudo-location `wallet`
 * where they are always unlocked. Consumption is FIFO by `acquiredAt` (ties: insertion order). Cost per lot is pro-rated with half-up
 * rounding; consuming the whole remainder takes the whole remaining cost, so no Toman is ever lost or created.
 */
import type { UsdtLot } from '@hiclaude/contracts'
import { D, assertSafeInt, toInt } from '../money'

export const WALLET_LOCATION = 'wallet'

export interface LotState extends UsdtLot {
  /** Cost (Toman) still attributable to `remainingMicro`. */
  remainingCostIrt: number
}

export interface Consumed {
  lotId: string
  exchangeId: string
  qtyMicro: number
  costIrt: number
}

export interface ConsumeResult {
  costIrt: number
  qtyMicro: number
  consumed: Consumed[]
}

export interface ConsumeOptions {
  /** Restrict to lots at this location (exchange id or `wallet`). */
  exchangeId?: string
  /** With `onlyUnlocked`, only lots with `withdrawableAt ≤ now` are eligible. */
  onlyUnlocked?: boolean
  now?: number
}

export class UsdtLotBook {
  private lots: LotState[] = []

  constructor(initial: readonly (UsdtLot & { remainingCostIrt?: number })[] = []) {
    for (const l of initial) {
      this.lots.push({ ...l, remainingCostIrt: l.remainingCostIrt ?? (l.qtyMicro === 0 ? 0 : toInt(D(l.costIrt).mul(l.remainingMicro).div(l.qtyMicro), 'half_up')) })
    }
  }

  /** Adds a lot (`remainingMicro = qtyMicro`). Returns the stored state. */
  addLot(i: { id: string; exchangeId: string; qtyMicro: number; costIrt: number; acquiredAt: number; withdrawableAt: number }): LotState {
    assertSafeInt(i.qtyMicro, 'qtyMicro')
    assertSafeInt(i.costIrt, 'costIrt')
    if (i.qtyMicro <= 0) throw new RangeError('lot quantity must be > 0')
    if (i.costIrt < 0) throw new RangeError('lot cost must be ≥ 0')
    if (this.lots.some((l) => l.id === i.id)) throw new RangeError(`duplicate lot id ${i.id}`)
    const lot: LotState = { ...i, remainingMicro: i.qtyMicro, remainingCostIrt: i.costIrt, status: 'locked' }
    this.lots.push(lot)
    return { ...lot }
  }

  private eligible(o: ConsumeOptions): LotState[] {
    return this.lots
      .map((l, idx) => ({ l, idx }))
      .filter(({ l }) => l.remainingMicro > 0 && (o.exchangeId === undefined || l.exchangeId === o.exchangeId) && (!o.onlyUnlocked || l.withdrawableAt <= (o.now ?? 0)))
      .sort((a, b) => a.l.acquiredAt - b.l.acquiredAt || a.idx - b.idx)
      .map((x) => x.l)
  }

  /** Consumes `qtyMicro` FIFO and returns the cost basis. Throws `RangeError` if not enough eligible quantity (nothing is consumed then). */
  consume(qtyMicro: number, o: ConsumeOptions = {}): ConsumeResult {
    assertSafeInt(qtyMicro, 'qtyMicro')
    if (qtyMicro < 0) throw new RangeError('consume(): negative qty')
    const el = this.eligible(o)
    const have = el.reduce((a, l) => a + l.remainingMicro, 0)
    if (qtyMicro > have) throw new RangeError(`consume(): only ${have} micro-USDT eligible, requested ${qtyMicro}`)
    let left = qtyMicro
    const consumed: Consumed[] = []
    let cost = 0
    for (const l of el) {
      if (left === 0) break
      const q = Math.min(left, l.remainingMicro)
      const c = q === l.remainingMicro ? l.remainingCostIrt : toInt(D(l.remainingCostIrt).mul(q).div(l.remainingMicro), 'half_up')
      l.remainingMicro -= q
      l.remainingCostIrt -= c
      left -= q
      cost += c
      consumed.push({ lotId: l.id, exchangeId: l.exchangeId, qtyMicro: q, costIrt: c })
    }
    return { costIrt: cost, qtyMicro, consumed }
  }

  /**
   * Withdraws `qtyMicro` from UNLOCKED lots at `exchangeId` (FIFO) into wallet lots (ids `<newIdPrefix>-<n>`), preserving cost and acquisition time.
   * Throws if the unlocked quantity is insufficient — a locked lot can never be withdrawn.
   */
  withdrawFromExchange(exchangeId: string, qtyMicro: number, now: number, newIdPrefix: string): ConsumeResult {
    const r = this.consume(qtyMicro, { exchangeId, onlyUnlocked: true, now })
    r.consumed.forEach((c, i) => {
      const src = this.lots.find((l) => l.id === c.lotId) as LotState
      this.lots.push({ id: `${newIdPrefix}-${i + 1}`, exchangeId: WALLET_LOCATION, qtyMicro: c.qtyMicro, remainingMicro: c.qtyMicro, costIrt: c.costIrt, remainingCostIrt: c.costIrt, acquiredAt: src.acquiredAt, withdrawableAt: now, status: 'available' })
    })
    return r
  }

  /** Remaining quantity that is withdrawable at `now` (optionally at one location). */
  available(now: number, exchangeId?: string): number {
    return this.lots.filter((l) => (exchangeId === undefined || l.exchangeId === exchangeId) && l.withdrawableAt <= now).reduce((a, l) => a + l.remainingMicro, 0)
  }

  /** Remaining quantity still under lock at `now`. */
  locked(now: number, exchangeId?: string): number {
    return this.lots.filter((l) => (exchangeId === undefined || l.exchangeId === exchangeId) && l.withdrawableAt > now).reduce((a, l) => a + l.remainingMicro, 0)
  }

  /** Total remaining quantity. */
  total(exchangeId?: string): number {
    return this.lots.filter((l) => exchangeId === undefined || l.exchangeId === exchangeId).reduce((a, l) => a + l.remainingMicro, 0)
  }

  /** Instant by which everything currently held (at the location) is withdrawable; `null` when nothing remains. */
  lockedUntil(exchangeId?: string): number | null {
    const ls = this.lots.filter((l) => l.remainingMicro > 0 && (exchangeId === undefined || l.exchangeId === exchangeId))
    return ls.length ? Math.max(...ls.map((l) => l.withdrawableAt)) : null
  }

  /** Future unlocks within `[now, now + horizonMs]`, grouped by instant and location, with cumulative quantity. */
  unlockSchedule(now: number, horizonMs: number, exchangeId?: string): { at: number; exchangeId: string; qtyMicro: number; cumulativeMicro: number }[] {
    const m = new Map<string, { at: number; exchangeId: string; qtyMicro: number }>()
    for (const l of this.lots) {
      if (l.remainingMicro <= 0 || l.withdrawableAt <= now || l.withdrawableAt > now + horizonMs) continue
      if (exchangeId !== undefined && l.exchangeId !== exchangeId) continue
      const k = `${l.withdrawableAt}|${l.exchangeId}`
      const cur = m.get(k) ?? { at: l.withdrawableAt, exchangeId: l.exchangeId, qtyMicro: 0 }
      cur.qtyMicro += l.remainingMicro
      m.set(k, cur)
    }
    let cum = 0
    return [...m.values()]
      .sort((a, b) => a.at - b.at || (a.exchangeId < b.exchangeId ? -1 : 1))
      .map((x) => {
        cum += x.qtyMicro
        return { ...x, cumulativeMicro: cum }
      })
  }

  /** Lots with up-to-date `status` (`locked` / `available` / `withdrawn` when fully consumed). */
  list(now: number): UsdtLot[] {
    return this.lots.map((l) => {
      const { remainingCostIrt: _c, ...rest } = l
      void _c
      return { ...rest, status: l.remainingMicro === 0 ? ('withdrawn' as const) : l.withdrawableAt <= now ? ('available' as const) : ('locked' as const) }
    })
  }

  /** Serialisable state. */
  toJSON(): LotState[] {
    return this.lots.map((l) => ({ ...l }))
  }

  static fromJSON(state: readonly LotState[]): UsdtLotBook {
    return new UsdtLotBook(state)
  }
}
