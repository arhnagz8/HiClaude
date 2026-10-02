import {
  AppError,
  type Channel,
  type EpochMs,
  type Order,
  type OrderEvent,
  type OrderStatus,
  type PaymentMethod,
  type Quote,
} from '@hiclaude/contracts'
import type { Database } from '../db'
import { b2i, compact, fromJson, fromJsonOpt, nn, toJson, toJsonOpt } from './json'
import { QuotePerMethodArraySchema, StringArraySchema, StringRecordSchema, UnknownRecordSchema } from './schemas'

// ───────────────────────── quotes ─────────────────────────
interface QuoteRow {
  id: string
  customer_id: string | null
  product_id: string
  amount_usd_cents: number
  rush_tier: string
  inputs_json: string
  created_at: number
  locked_until: number
  rate_snapshot_id: string
  policy_version: number
  per_method_json: string
  funding_micro_usdt: number
  cost_irt: number
  margin_irt: number
  uncompetitive: number
  competitor_ref_irt: number | null
  warnings_json: string
}
const toQuote = (r: QuoteRow): Quote =>
  compact({
    id: r.id,
    customerId: nn(r.customer_id),
    productId: r.product_id,
    amountUsdCents: r.amount_usd_cents,
    rushTier: r.rush_tier,
    inputs: fromJson(StringRecordSchema, r.inputs_json, 'quotes.inputs_json'),
    createdAt: r.created_at,
    lockedUntil: r.locked_until,
    rateSnapshotId: r.rate_snapshot_id,
    policyVersion: r.policy_version,
    perMethod: fromJson(QuotePerMethodArraySchema, r.per_method_json, 'quotes.per_method_json'),
    fundingMicroUsdt: r.funding_micro_usdt,
    costIrt: r.cost_irt,
    marginIrt: r.margin_irt,
    uncompetitive: r.uncompetitive === 1,
    competitorRefIrt: nn(r.competitor_ref_irt),
    warnings: fromJson(StringArraySchema, r.warnings_json, 'quotes.warnings_json'),
  }) as Quote

export class QuotesRepo {
  constructor(private readonly db: Database) {}
  insert(q: Quote): Quote {
    this.db.run(
      `INSERT INTO quotes (id, customer_id, product_id, amount_usd_cents, rush_tier, inputs_json, created_at, locked_until, rate_snapshot_id, policy_version,
         per_method_json, funding_micro_usdt, cost_irt, margin_irt, uncompetitive, competitor_ref_irt, warnings_json)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [q.id, q.customerId, q.productId, q.amountUsdCents, q.rushTier, toJson(StringRecordSchema, q.inputs, 'quote.inputs'), q.createdAt, q.lockedUntil,
        q.rateSnapshotId, q.policyVersion, toJson(QuotePerMethodArraySchema, q.perMethod, 'quote.perMethod'), q.fundingMicroUsdt, q.costIrt, q.marginIrt,
        b2i(q.uncompetitive), q.competitorRefIrt, toJson(StringArraySchema, q.warnings, 'quote.warnings')],
    )
    return this.get(q.id) as Quote
  }
  get(id: string): Quote | undefined {
    const r = this.db.get<QuoteRow>('SELECT * FROM quotes WHERE id = ?', [id])
    return r && toQuote(r)
  }
  listByCustomer(customerId: string, limit = 50): Quote[] {
    return this.db.all<QuoteRow>('SELECT * FROM quotes WHERE customer_id = ? ORDER BY created_at DESC, id DESC LIMIT ?', [customerId, limit]).map(toQuote)
  }
  countByCustomerSince(customerId: string, since: EpochMs): number {
    return this.db.scalar<number>('SELECT COUNT(*) FROM quotes WHERE customer_id = ? AND created_at >= ?', [customerId, since]) ?? 0
  }
  /** Quotes older than `ts` that no order references (housekeeping). */
  deleteUnusedLockedBefore(ts: EpochMs): number {
    return this.db.run('DELETE FROM quotes WHERE locked_until < ? AND id NOT IN (SELECT quote_id FROM orders)', [ts]).changes
  }
}

// ───────────────────────── orders ─────────────────────────
interface OrderRow {
  id: string
  code: string
  idempotency_key: string | null
  customer_id: string
  product_id: string
  quote_id: string
  method: PaymentMethod
  status: OrderStatus
  version: number
  amount_usd_cents: number
  rush_tier: string
  inputs_json: string
  pay_currency: 'IRT' | 'USDT'
  pay_amount: number
  funding_micro_usdt: number
  cost_irt_at_quote: number
  margin_irt_at_quote: number
  vat_irt: number
  rush_irt: number
  discount_irt: number
  provider_id: string
  fulfilment_mode: 'api' | 'operator'
  channel: Channel
  referral_code: string | null
  waiting_funding: number
  attempts: number
  risk_score: number
  risk_flags_json: string
  created_at: number
  pay_expires_at: number
  paid_at: number | null
  delivered_at: number | null
  completed_at: number | null
  sla_due_at: number | null
}
const toOrder = (r: OrderRow): Order =>
  compact({
    id: r.id,
    code: r.code,
    customerId: r.customer_id,
    productId: r.product_id,
    quoteId: r.quote_id,
    method: r.method,
    status: r.status,
    version: r.version,
    amountUsdCents: r.amount_usd_cents,
    rushTier: r.rush_tier,
    inputs: fromJson(StringRecordSchema, r.inputs_json, 'orders.inputs_json'),
    payCurrency: r.pay_currency,
    payAmount: r.pay_amount,
    fundingMicroUsdt: r.funding_micro_usdt,
    costIrtAtQuote: r.cost_irt_at_quote,
    marginIrtAtQuote: r.margin_irt_at_quote,
    vatIrt: r.vat_irt,
    rushIrt: r.rush_irt,
    discountIrt: r.discount_irt,
    providerId: r.provider_id,
    fulfilmentMode: r.fulfilment_mode,
    channel: r.channel,
    referralCode: nn(r.referral_code),
    waitingFunding: r.waiting_funding === 1,
    attempts: r.attempts,
    riskScore: r.risk_score,
    riskFlags: fromJson(StringArraySchema, r.risk_flags_json, 'orders.risk_flags_json'),
    createdAt: r.created_at,
    payExpiresAt: r.pay_expires_at,
    paidAt: nn(r.paid_at),
    deliveredAt: nn(r.delivered_at),
    completedAt: nn(r.completed_at),
    slaDueAt: nn(r.sla_due_at),
  }) as Order

const ORDER_PATCH_COLUMNS: Record<string, string> = {
  method: 'method',
  status: 'status',
  amountUsdCents: 'amount_usd_cents',
  rushTier: 'rush_tier',
  payCurrency: 'pay_currency',
  payAmount: 'pay_amount',
  fundingMicroUsdt: 'funding_micro_usdt',
  costIrtAtQuote: 'cost_irt_at_quote',
  marginIrtAtQuote: 'margin_irt_at_quote',
  vatIrt: 'vat_irt',
  rushIrt: 'rush_irt',
  discountIrt: 'discount_irt',
  providerId: 'provider_id',
  fulfilmentMode: 'fulfilment_mode',
  referralCode: 'referral_code',
  attempts: 'attempts',
  riskScore: 'risk_score',
  payExpiresAt: 'pay_expires_at',
  paidAt: 'paid_at',
  deliveredAt: 'delivered_at',
  completedAt: 'completed_at',
  slaDueAt: 'sla_due_at',
}

export type OrderPatch = Partial<Omit<Order, 'id' | 'code' | 'customerId' | 'productId' | 'quoteId' | 'version' | 'createdAt' | 'inputs' | 'channel'>>

export interface OrderListFilter {
  status?: OrderStatus | OrderStatus[]
  customerId?: string
  productId?: string
  /** matches code / id / customer phone prefix */
  q?: string
  from?: EpochMs
  to?: EpochMs
  limit?: number
  offset?: number
}

const OPEN_STATUSES: OrderStatus[] = ['awaiting_payment', 'payment_review', 'paid', 'risk_hold', 'queued', 'fulfilling']

export class OrdersRepo {
  constructor(private readonly db: Database) {}

  insert(o: Order, idempotencyKey?: string): Order {
    this.db.run(
      `INSERT INTO orders (id, code, idempotency_key, customer_id, product_id, quote_id, method, status, version, amount_usd_cents, rush_tier, inputs_json,
         pay_currency, pay_amount, funding_micro_usdt, cost_irt_at_quote, margin_irt_at_quote, vat_irt, rush_irt, discount_irt, provider_id, fulfilment_mode,
         channel, referral_code, waiting_funding, attempts, risk_score, risk_flags_json, created_at, pay_expires_at, paid_at, delivered_at, completed_at, sla_due_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [o.id, o.code, idempotencyKey, o.customerId, o.productId, o.quoteId, o.method, o.status, o.version, o.amountUsdCents, o.rushTier,
        toJson(StringRecordSchema, o.inputs, 'order.inputs'), o.payCurrency, o.payAmount, o.fundingMicroUsdt, o.costIrtAtQuote, o.marginIrtAtQuote, o.vatIrt,
        o.rushIrt, o.discountIrt, o.providerId, o.fulfilmentMode, o.channel, o.referralCode, b2i(o.waitingFunding), o.attempts, o.riskScore,
        toJson(StringArraySchema, o.riskFlags, 'order.riskFlags'), o.createdAt, o.payExpiresAt, o.paidAt, o.deliveredAt, o.completedAt, o.slaDueAt],
    )
    return this.get(o.id) as Order
  }

  get(id: string): Order | undefined {
    const r = this.db.get<OrderRow>('SELECT * FROM orders WHERE id = ?', [id])
    return r && toOrder(r)
  }
  getByCode(code: string): Order | undefined {
    const r = this.db.get<OrderRow>('SELECT * FROM orders WHERE code = ?', [code])
    return r && toOrder(r)
  }
  getByIdempotencyKey(key: string): Order | undefined {
    const r = this.db.get<OrderRow>('SELECT * FROM orders WHERE idempotency_key = ?', [key])
    return r && toOrder(r)
  }

  /**
   * Optimistic update. With `expectedVersion` the write only applies if the stored version matches (else CONFLICT);
   * the version is always incremented. `waitingFunding` and `riskFlags` are patchable too.
   */
  update(id: string, patch: OrderPatch, expectedVersion?: number): Order {
    const sets: string[] = []
    const params: unknown[] = []
    for (const [k, v] of Object.entries(patch)) {
      if (k === 'waitingFunding') (sets.push('waiting_funding = ?'), params.push(b2i(v as boolean)))
      else if (k === 'riskFlags') (sets.push('risk_flags_json = ?'), params.push(toJson(StringArraySchema, v as string[], 'order.riskFlags')))
      else {
        const col = ORDER_PATCH_COLUMNS[k]
        if (!col) throw new Error(`OrdersRepo.update: unknown field ${k}`)
        sets.push(`${col} = ?`)
        params.push(v)
      }
    }
    sets.push('version = version + 1')
    const where = expectedVersion === undefined ? 'id = ?' : 'id = ? AND version = ?'
    const wparams = expectedVersion === undefined ? [id] : [id, expectedVersion]
    const r = this.db.run(`UPDATE orders SET ${sets.join(', ')} WHERE ${where}`, [...params, ...wparams])
    if (r.changes === 0) {
      const existing = this.get(id)
      if (!existing) throw new AppError('NOT_FOUND', `order ${id} not found`)
      throw new AppError('CONFLICT', `order ${id} was modified concurrently`, { expectedVersion, actualVersion: existing.version })
    }
    return this.get(id) as Order
  }

  listByCustomer(customerId: string, opts: { limit?: number; offset?: number } = {}): Order[] {
    return this.db
      .all<OrderRow>('SELECT * FROM orders WHERE customer_id = ? ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?', [customerId, opts.limit ?? 50, opts.offset ?? 0])
      .map(toOrder)
  }

  listByStatus(status: OrderStatus, limit = 100): Order[] {
    return this.db.all<OrderRow>('SELECT * FROM orders WHERE status = ? ORDER BY created_at, id LIMIT ?', [status, limit]).map(toOrder)
  }

  /** Oldest-first orders in any of `statuses` (job scans: expiry, dispatch). */
  listActiveByStatus(statuses: readonly OrderStatus[], limit = 500): Order[] {
    if (statuses.length === 0) return []
    const ph = statuses.map(() => '?').join(',')
    return this.db.all<OrderRow>(`SELECT * FROM orders WHERE status IN (${ph}) ORDER BY created_at, id LIMIT ?`, [...statuses, limit]).map(toOrder)
  }

  /** Awaiting-payment orders whose pay window ended at or before `now`. */
  listExpiredAwaitingPayment(now: EpochMs, limit = 500): Order[] {
    return this.db
      .all<OrderRow>(`SELECT * FROM orders WHERE status = 'awaiting_payment' AND pay_expires_at <= ? ORDER BY pay_expires_at, id LIMIT ?`, [now, limit])
      .map(toOrder)
  }

  list(f: OrderListFilter = {}): Order[] {
    const { where, params } = this.filter(f)
    return this.db
      .all<OrderRow>(`SELECT o.* FROM orders o ${where} ORDER BY o.created_at DESC, o.id DESC LIMIT ? OFFSET ?`, [...params, f.limit ?? 50, f.offset ?? 0])
      .map(toOrder)
  }
  count(f: OrderListFilter = {}): number {
    const { where, params } = this.filter(f)
    return this.db.scalar<number>(`SELECT COUNT(*) FROM orders o ${where}`, params) ?? 0
  }
  private filter(f: OrderListFilter): { where: string; params: unknown[] } {
    const w: string[] = []
    const params: unknown[] = []
    if (f.status) {
      const s = Array.isArray(f.status) ? f.status : [f.status]
      w.push(`o.status IN (${s.map(() => '?').join(',')})`)
      params.push(...s)
    }
    if (f.customerId) (w.push('o.customer_id = ?'), params.push(f.customerId))
    if (f.productId) (w.push('o.product_id = ?'), params.push(f.productId))
    if (f.from !== undefined) (w.push('o.created_at >= ?'), params.push(f.from))
    if (f.to !== undefined) (w.push('o.created_at < ?'), params.push(f.to))
    if (f.q) {
      w.push('(o.code LIKE ? OR o.id = ? OR o.customer_id IN (SELECT id FROM customers WHERE phone LIKE ?))')
      params.push(`%${f.q}%`, f.q, `${f.q}%`)
    }
    return { where: w.length ? `WHERE ${w.join(' AND ')}` : '', params }
  }

  countsByStatus(): Record<string, number> {
    const out: Record<string, number> = {}
    for (const r of this.db.all<{ status: string; n: number }>('SELECT status, COUNT(*) AS n FROM orders GROUP BY status')) out[r.status] = r.n
    return out
  }

  createdSince(since: EpochMs, limit = 10_000): Order[] {
    return this.db.all<OrderRow>('SELECT * FROM orders WHERE created_at >= ? ORDER BY created_at, id LIMIT ?', [since, limit]).map(toOrder)
  }
  countCreatedSince(since: EpochMs): number {
    return this.db.scalar<number>('SELECT COUNT(*) FROM orders WHERE created_at >= ?', [since]) ?? 0
  }

  /** Sum of face value (USD cents) of the customer's orders created since `since`, excluding orders that never got paid/were reversed. */
  usedUsdCentsSince(customerId: string, since: EpochMs): number {
    return (
      this.db.scalar<number>(
        `SELECT COALESCE(SUM(amount_usd_cents), 0) FROM orders WHERE customer_id = ? AND created_at >= ? AND status NOT IN ('expired','cancelled','refunded','refund_pending','failed')`,
        [customerId, since],
      ) ?? 0
    )
  }
  countOpenByCustomer(customerId: string): number {
    const ph = OPEN_STATUSES.map(() => '?').join(',')
    return this.db.scalar<number>(`SELECT COUNT(*) FROM orders WHERE customer_id = ? AND status IN (${ph})`, [customerId, ...OPEN_STATUSES]) ?? 0
  }
  countCompletedByCustomer(customerId: string): number {
    return this.db.scalar<number>(`SELECT COUNT(*) FROM orders WHERE customer_id = ? AND status IN ('delivered','completed')`, [customerId]) ?? 0
  }
  countCreatedByCustomerSince(customerId: string, since: EpochMs): number {
    return this.db.scalar<number>('SELECT COUNT(*) FROM orders WHERE customer_id = ? AND created_at >= ?', [customerId, since]) ?? 0
  }

  // ── events ──
  appendEvent(e: OrderEvent): OrderEvent {
    this.db.run('INSERT INTO order_events (id, order_id, at, type, from_status, to_status, actor_type, actor_id, data_json) VALUES (?,?,?,?,?,?,?,?,?)', [
      e.id, e.orderId, e.at, e.type, e.from, e.to, e.actor.type, e.actor.id, toJsonOpt(UnknownRecordSchema, e.data, 'order event data'),
    ])
    return e
  }
  listEvents(orderId: string): OrderEvent[] {
    return this.db
      .all<{ id: string; order_id: string; at: number; type: string; from_status: OrderStatus | null; to_status: OrderStatus | null; actor_type: OrderEvent['actor']['type']; actor_id: string | null; data_json: string | null }>(
        'SELECT * FROM order_events WHERE order_id = ? ORDER BY at, rowid',
        [orderId],
      )
      .map((r) =>
        compact({
          id: r.id,
          orderId: r.order_id,
          at: r.at,
          type: r.type,
          from: nn(r.from_status),
          to: nn(r.to_status),
          actor: compact({ type: r.actor_type, id: nn(r.actor_id) }),
          data: fromJsonOpt(UnknownRecordSchema, r.data_json, 'order_events.data_json'),
        }) as OrderEvent,
      )
  }
}
