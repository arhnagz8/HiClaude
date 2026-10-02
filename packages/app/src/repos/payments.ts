import { AppError, type BankCredit, type ChainTransfer, type EpochMs, type Irt, type MicroUsdt, type Network, type Payment, type PaymentMethod, type PaymentStatus } from '@hiclaude/contracts'
import type { Database } from '../db'
import { compact, fromJsonOpt, nn, toJsonOpt } from './json'
import { ReceiptSchema } from './schemas'

// ───────────────────────── payments ─────────────────────────
interface PaymentRow {
  id: string
  order_id: string
  method: PaymentMethod
  status: PaymentStatus
  currency: 'IRT' | 'USDT'
  expected_amount: number
  received_amount: number
  unique_offset_irt: number | null
  gateway_id: string | null
  authority: string | null
  pay_url: string | null
  destination_card_id: string | null
  network: Network | null
  address: string | null
  memo: string | null
  tx_hash: string | null
  confirmations: number | null
  receipt_json: string | null
  matched_ref: string | null
  fee_irt: number
  created_at: number
  confirmed_at: number | null
  note: string | null
}
const toPayment = (r: PaymentRow): Payment =>
  compact({
    id: r.id,
    orderId: r.order_id,
    method: r.method,
    status: r.status,
    currency: r.currency,
    expectedAmount: r.expected_amount,
    receivedAmount: r.received_amount,
    uniqueOffsetIrt: nn(r.unique_offset_irt),
    gatewayId: nn(r.gateway_id),
    authority: nn(r.authority),
    payUrl: nn(r.pay_url),
    destinationCardId: nn(r.destination_card_id),
    network: nn(r.network),
    address: nn(r.address),
    memo: nn(r.memo),
    txHash: nn(r.tx_hash),
    confirmations: nn(r.confirmations),
    receipt: fromJsonOpt(ReceiptSchema, r.receipt_json, 'payments.receipt_json'),
    matchedRef: nn(r.matched_ref),
    feeIrt: r.fee_irt,
    createdAt: r.created_at,
    confirmedAt: nn(r.confirmed_at),
    note: nn(r.note),
  }) as Payment

const PAYMENT_COLS: Record<string, string> = {
  status: 'status',
  expectedAmount: 'expected_amount',
  receivedAmount: 'received_amount',
  uniqueOffsetIrt: 'unique_offset_irt',
  gatewayId: 'gateway_id',
  authority: 'authority',
  payUrl: 'pay_url',
  destinationCardId: 'destination_card_id',
  network: 'network',
  address: 'address',
  memo: 'memo',
  txHash: 'tx_hash',
  confirmations: 'confirmations',
  matchedRef: 'matched_ref',
  feeIrt: 'fee_irt',
  confirmedAt: 'confirmed_at',
  note: 'note',
}

export type PaymentPatch = Partial<Omit<Payment, 'id' | 'orderId' | 'method' | 'currency' | 'createdAt'>>

export class PaymentsRepo {
  constructor(private readonly db: Database) {}

  insert(p: Payment): Payment {
    this.db.run(
      `INSERT INTO payments (id, order_id, method, status, currency, expected_amount, received_amount, unique_offset_irt, gateway_id, authority, pay_url,
         destination_card_id, network, address, memo, tx_hash, confirmations, receipt_json, matched_ref, fee_irt, created_at, confirmed_at, note)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [p.id, p.orderId, p.method, p.status, p.currency, p.expectedAmount, p.receivedAmount, p.uniqueOffsetIrt, p.gatewayId, p.authority, p.payUrl,
        p.destinationCardId, p.network, p.address, p.memo, p.txHash, p.confirmations, toJsonOpt(ReceiptSchema, p.receipt, 'payment.receipt'), p.matchedRef,
        p.feeIrt, p.createdAt, p.confirmedAt, p.note],
    )
    return this.get(p.id) as Payment
  }
  get(id: string): Payment | undefined {
    const r = this.db.get<PaymentRow>('SELECT * FROM payments WHERE id = ?', [id])
    return r && toPayment(r)
  }
  update(id: string, patch: PaymentPatch): Payment {
    const sets: string[] = []
    const params: unknown[] = []
    for (const [k, v] of Object.entries(patch)) {
      if (k === 'receipt') (sets.push('receipt_json = ?'), params.push(toJsonOpt(ReceiptSchema, v as Payment['receipt'], 'payment.receipt')))
      else {
        const col = PAYMENT_COLS[k]
        if (!col) throw new Error(`PaymentsRepo.update: unknown field ${k}`)
        sets.push(`${col} = ?`)
        params.push(v)
      }
    }
    if (sets.length) {
      const r = this.db.run(`UPDATE payments SET ${sets.join(', ')} WHERE id = ?`, [...params, id])
      if (r.changes === 0) throw new AppError('NOT_FOUND', `payment ${id} not found`)
    }
    const p = this.get(id)
    if (!p) throw new AppError('NOT_FOUND', `payment ${id} not found`)
    return p
  }
  listByOrder(orderId: string): Payment[] {
    return this.db.all<PaymentRow>('SELECT * FROM payments WHERE order_id = ? ORDER BY created_at, id', [orderId]).map(toPayment)
  }
  getByTxHash(txHash: string): Payment | undefined {
    const r = this.db.get<PaymentRow>('SELECT * FROM payments WHERE tx_hash = ?', [txHash])
    return r && toPayment(r)
  }
  getByAuthority(authority: string, gatewayId?: string): Payment | undefined {
    const r = gatewayId
      ? this.db.get<PaymentRow>('SELECT * FROM payments WHERE gateway_id = ? AND authority = ?', [gatewayId, authority])
      : this.db.get<PaymentRow>('SELECT * FROM payments WHERE authority = ?', [authority])
    return r && toPayment(r)
  }
  getByAddress(address: string, memo?: string): Payment | undefined {
    const r = memo
      ? this.db.get<PaymentRow>(`SELECT * FROM payments WHERE address = ? AND memo = ? ORDER BY created_at DESC LIMIT 1`, [address, memo])
      : this.db.get<PaymentRow>(`SELECT * FROM payments WHERE address = ? ORDER BY created_at DESC LIMIT 1`, [address])
    return r && toPayment(r)
  }
  listByStatus(statuses: readonly PaymentStatus[], opts: { method?: PaymentMethod; limit?: number } = {}): Payment[] {
    const ph = statuses.map(() => '?').join(',')
    const params: unknown[] = [...statuses]
    let sql = `SELECT * FROM payments WHERE status IN (${ph})`
    if (opts.method) (sql += ' AND method = ?', params.push(opts.method))
    sql += ' ORDER BY created_at, id LIMIT ?'
    params.push(opts.limit ?? 500)
    return this.db.all<PaymentRow>(sql, params).map(toPayment)
  }
  /** Open card-to-card/bank payments with exactly this expected amount (unique-offset matching). */
  findOpenByExpectedAmount(method: PaymentMethod, amount: number): Payment[] {
    return this.db
      .all<PaymentRow>(`SELECT * FROM payments WHERE method = ? AND expected_amount = ? AND status IN ('pending','review') ORDER BY created_at, id`, [method, amount])
      .map(toPayment)
  }
  /** Unique offsets currently in use for a given base amount range (to allocate a free one). */
  openOffsets(method: PaymentMethod, destinationCardId: string | undefined): number[] {
    const rows = destinationCardId
      ? this.db.all<{ o: number }>(`SELECT unique_offset_irt AS o FROM payments WHERE method = ? AND destination_card_id = ? AND status IN ('pending','review') AND unique_offset_irt IS NOT NULL`, [method, destinationCardId])
      : this.db.all<{ o: number }>(`SELECT unique_offset_irt AS o FROM payments WHERE method = ? AND status IN ('pending','review') AND unique_offset_irt IS NOT NULL`, [method])
    return rows.map((r) => r.o)
  }
}

// ───────────────────────── bank credits ─────────────────────────
export interface BankCreditRecord extends BankCredit {
  id: string
  status: 'unmatched' | 'matched' | 'ignored'
  matchedPaymentId?: string
  matchedAt?: EpochMs
  createdAt: EpochMs
}
interface BankCreditRow {
  id: string
  ref: string
  amount_irt: number
  at: number
  channel: BankCredit['channel']
  sender_card_masked: string | null
  sender_name: string | null
  destination_card_id: string | null
  note: string | null
  status: 'unmatched' | 'matched' | 'ignored'
  matched_payment_id: string | null
  matched_at: number | null
  created_at: number
}
const toCredit = (r: BankCreditRow): BankCreditRecord =>
  compact({
    id: r.id,
    ref: r.ref,
    amountIrt: r.amount_irt,
    at: r.at,
    channel: r.channel,
    senderCardMasked: nn(r.sender_card_masked),
    senderName: nn(r.sender_name),
    destinationCardId: nn(r.destination_card_id),
    note: nn(r.note),
    status: r.status,
    matchedPaymentId: nn(r.matched_payment_id),
    matchedAt: nn(r.matched_at),
    createdAt: r.created_at,
  }) as BankCreditRecord

export class BankCreditsRepo {
  constructor(private readonly db: Database) {}
  /** Idempotent by `ref` (bank statement polling re-reads the same rows). Returns `{inserted:false}` for a known ref. */
  insertIfNew(c: BankCredit & { id: string; createdAt: EpochMs }): { inserted: boolean; credit: BankCreditRecord } {
    const r = this.db.run(
      `INSERT OR IGNORE INTO bank_credits (id, ref, amount_irt, at, channel, sender_card_masked, sender_name, destination_card_id, note, status, created_at)
       VALUES (?,?,?,?,?,?,?,?,?, 'unmatched', ?)`,
      [c.id, c.ref, c.amountIrt, c.at, c.channel, c.senderCardMasked, c.senderName, c.destinationCardId, c.note, c.createdAt],
    )
    return { inserted: r.changes > 0, credit: this.getByRef(c.ref) as BankCreditRecord }
  }
  getByRef(ref: string): BankCreditRecord | undefined {
    const r = this.db.get<BankCreditRow>('SELECT * FROM bank_credits WHERE ref = ?', [ref])
    return r && toCredit(r)
  }
  get(id: string): BankCreditRecord | undefined {
    const r = this.db.get<BankCreditRow>('SELECT * FROM bank_credits WHERE id = ?', [id])
    return r && toCredit(r)
  }
  listUnmatched(opts: { limit?: number; minAmountIrt?: Irt; maxAmountIrt?: Irt } = {}): BankCreditRecord[] {
    return this.db
      .all<BankCreditRow>(
        `SELECT * FROM bank_credits WHERE status = 'unmatched' AND amount_irt >= ? AND amount_irt <= ? ORDER BY at, id LIMIT ?`,
        [opts.minAmountIrt ?? 0, opts.maxAmountIrt ?? Number.MAX_SAFE_INTEGER, opts.limit ?? 500],
      )
      .map(toCredit)
  }
  findUnmatchedByAmount(amountIrt: Irt, since: EpochMs): BankCreditRecord[] {
    return this.db.all<BankCreditRow>(`SELECT * FROM bank_credits WHERE status = 'unmatched' AND amount_irt = ? AND at >= ? ORDER BY at, id`, [amountIrt, since]).map(toCredit)
  }
  markMatched(ref: string, paymentId: string, now: EpochMs): boolean {
    return this.db.run(`UPDATE bank_credits SET status = 'matched', matched_payment_id = ?, matched_at = ? WHERE ref = ? AND status = 'unmatched'`, [paymentId, now, ref]).changes > 0
  }
  markIgnored(ref: string, note?: string): boolean {
    return this.db.run(`UPDATE bank_credits SET status = 'ignored', note = COALESCE(?, note) WHERE ref = ? AND status = 'unmatched'`, [note, ref]).changes > 0
  }
  latestAt(): EpochMs | undefined {
    return this.db.scalar<number>('SELECT MAX(at) FROM bank_credits') ?? undefined
  }
  countByStatus(): Record<string, number> {
    const out: Record<string, number> = {}
    for (const r of this.db.all<{ status: string; n: number }>('SELECT status, COUNT(*) AS n FROM bank_credits GROUP BY status')) out[r.status] = r.n
    return out
  }
}

// ───────────────────────── chain transfers ─────────────────────────
export interface ChainTransferRecord extends ChainTransfer {
  id: string
  matchedPaymentId?: string
  screenedRisk?: 'clear' | 'review' | 'blocked'
  createdAt: EpochMs
}
interface ChainRow {
  id: string
  network: Network
  tx_hash: string
  from_address: string
  to_address: string
  amount: number
  memo: string | null
  at: number
  confirmations: number
  status: 'pending' | 'confirmed' | 'failed'
  matched_payment_id: string | null
  screened_risk: 'clear' | 'review' | 'blocked' | null
  created_at: number
}
const toTransfer = (r: ChainRow): ChainTransferRecord =>
  compact({
    id: r.id,
    txHash: r.tx_hash,
    network: r.network,
    from: r.from_address,
    to: r.to_address,
    amount: r.amount,
    memo: nn(r.memo),
    at: r.at,
    confirmations: r.confirmations,
    status: r.status,
    matchedPaymentId: nn(r.matched_payment_id),
    screenedRisk: nn(r.screened_risk),
    createdAt: r.created_at,
  }) as ChainTransferRecord

export class ChainTransfersRepo {
  constructor(private readonly db: Database) {}
  /** Insert a newly seen transfer or refresh confirmations/status of a known (network, txHash). */
  upsert(t: ChainTransfer & { id: string; createdAt: EpochMs }): { inserted: boolean; transfer: ChainTransferRecord } {
    const existing = this.getByTxHash(t.txHash, t.network)
    if (existing) {
      this.db.run('UPDATE chain_transfers SET confirmations = ?, status = ? WHERE id = ?', [t.confirmations, t.status, existing.id])
      return { inserted: false, transfer: this.get(existing.id) as ChainTransferRecord }
    }
    this.db.run(
      'INSERT INTO chain_transfers (id, network, tx_hash, from_address, to_address, amount, memo, at, confirmations, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      [t.id, t.network, t.txHash, t.from, t.to, t.amount, t.memo, t.at, t.confirmations, t.status, t.createdAt],
    )
    return { inserted: true, transfer: this.get(t.id) as ChainTransferRecord }
  }
  get(id: string): ChainTransferRecord | undefined {
    const r = this.db.get<ChainRow>('SELECT * FROM chain_transfers WHERE id = ?', [id])
    return r && toTransfer(r)
  }
  getByTxHash(txHash: string, network?: Network): ChainTransferRecord | undefined {
    const r = network
      ? this.db.get<ChainRow>('SELECT * FROM chain_transfers WHERE network = ? AND tx_hash = ?', [network, txHash])
      : this.db.get<ChainRow>('SELECT * FROM chain_transfers WHERE tx_hash = ?', [txHash])
    return r && toTransfer(r)
  }
  listByAddress(address: string): ChainTransferRecord[] {
    return this.db.all<ChainRow>('SELECT * FROM chain_transfers WHERE to_address = ? ORDER BY at, id', [address]).map(toTransfer)
  }
  listUnmatched(limit = 500): ChainTransferRecord[] {
    return this.db.all<ChainRow>('SELECT * FROM chain_transfers WHERE matched_payment_id IS NULL ORDER BY at, id LIMIT ?', [limit]).map(toTransfer)
  }
  update(id: string, patch: { confirmations?: number; status?: ChainTransfer['status']; matchedPaymentId?: string; screenedRisk?: 'clear' | 'review' | 'blocked' }): ChainTransferRecord {
    const map: Record<string, string> = { confirmations: 'confirmations', status: 'status', matchedPaymentId: 'matched_payment_id', screenedRisk: 'screened_risk' }
    const sets: string[] = []
    const params: unknown[] = []
    for (const [k, v] of Object.entries(patch)) (sets.push(`${map[k]} = ?`), params.push(v))
    if (sets.length) this.db.run(`UPDATE chain_transfers SET ${sets.join(', ')} WHERE id = ?`, [...params, id])
    const t = this.get(id)
    if (!t) throw new AppError('NOT_FOUND', `chain transfer ${id} not found`)
    return t
  }
  latestAt(network?: Network): EpochMs | undefined {
    return (network ? this.db.scalar<number>('SELECT MAX(at) FROM chain_transfers WHERE network = ?', [network]) : this.db.scalar<number>('SELECT MAX(at) FROM chain_transfers')) ?? undefined
  }
  sumUnmatched(): MicroUsdt {
    return this.db.scalar<number>("SELECT COALESCE(SUM(amount),0) FROM chain_transfers WHERE matched_payment_id IS NULL AND status = 'confirmed'") ?? 0
  }
}
