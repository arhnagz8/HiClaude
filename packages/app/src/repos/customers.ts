import { AppError, type Customer, type CustomerTier, type EpochMs } from '@hiclaude/contracts'
import type { Database } from '../db'
import { compact, fromJson, fromJsonOpt, nn, toJson, toJsonOpt } from './json'
import { LimitOverrideSchema, StringArraySchema, type LimitOverride } from './schemas'

interface CustomerRow {
  id: string
  phone: string
  name: string | null
  national_id: string | null
  tier: CustomerTier
  status: 'active' | 'blocked'
  telegram_id: string | null
  bale_id: string | null
  referral_code: string
  referred_by: string | null
  wallet_irt: number
  risk_score: number
  flags_json: string
  limit_override_json: string | null
  created_at: number
  last_seen_at: number
  kyc_submitted_at: number | null
  kyc_verified_at: number | null
}

const toCustomer = (r: CustomerRow): Customer =>
  compact({
    id: r.id,
    phone: r.phone,
    name: nn(r.name),
    nationalId: nn(r.national_id),
    tier: r.tier,
    status: r.status,
    telegramId: nn(r.telegram_id),
    baleId: nn(r.bale_id),
    referralCode: r.referral_code,
    referredBy: nn(r.referred_by),
    walletIrt: r.wallet_irt,
    riskScore: r.risk_score,
    flags: fromJson(StringArraySchema, r.flags_json, 'customers.flags_json'),
    createdAt: r.created_at,
    lastSeenAt: r.last_seen_at,
    kycSubmittedAt: nn(r.kyc_submitted_at),
    kycVerifiedAt: nn(r.kyc_verified_at),
  }) as Customer

export type CustomerPatch = Partial<Omit<Customer, 'id' | 'createdAt' | 'walletIrt'>>

const PATCH_COLUMNS: Record<string, string> = {
  phone: 'phone',
  name: 'name',
  nationalId: 'national_id',
  tier: 'tier',
  status: 'status',
  telegramId: 'telegram_id',
  baleId: 'bale_id',
  referralCode: 'referral_code',
  referredBy: 'referred_by',
  riskScore: 'risk_score',
  lastSeenAt: 'last_seen_at',
  kycSubmittedAt: 'kyc_submitted_at',
  kycVerifiedAt: 'kyc_verified_at',
}

export interface CustomerListFilter {
  q?: string
  tier?: CustomerTier
  status?: 'active' | 'blocked'
  limit?: number
  offset?: number
}

export class CustomersRepo {
  constructor(private readonly db: Database) {}

  insert(c: Customer): Customer {
    this.db.run(
      `INSERT INTO customers (id, phone, name, national_id, tier, status, telegram_id, bale_id, referral_code, referred_by, wallet_irt, risk_score,
         flags_json, created_at, last_seen_at, kyc_submitted_at, kyc_verified_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [c.id, c.phone, c.name, c.nationalId, c.tier, c.status, c.telegramId, c.baleId, c.referralCode, c.referredBy, c.walletIrt, c.riskScore,
        toJson(StringArraySchema, c.flags, 'customer.flags'), c.createdAt, c.lastSeenAt, c.kycSubmittedAt, c.kycVerifiedAt],
    )
    return this.get(c.id) as Customer
  }

  get(id: string): Customer | undefined {
    const r = this.db.get<CustomerRow>('SELECT * FROM customers WHERE id = ?', [id])
    return r && toCustomer(r)
  }
  getByPhone(phone: string): Customer | undefined {
    const r = this.db.get<CustomerRow>('SELECT * FROM customers WHERE phone = ?', [phone])
    return r && toCustomer(r)
  }
  getByTelegramId(id: string): Customer | undefined {
    const r = this.db.get<CustomerRow>('SELECT * FROM customers WHERE telegram_id = ?', [id])
    return r && toCustomer(r)
  }
  getByBaleId(id: string): Customer | undefined {
    const r = this.db.get<CustomerRow>('SELECT * FROM customers WHERE bale_id = ?', [id])
    return r && toCustomer(r)
  }
  getByReferralCode(code: string): Customer | undefined {
    const r = this.db.get<CustomerRow>('SELECT * FROM customers WHERE referral_code = ?', [code.toUpperCase()])
    return r && toCustomer(r)
  }
  getByNationalId(nid: string): Customer | undefined {
    const r = this.db.get<CustomerRow>('SELECT * FROM customers WHERE national_id = ?', [nid])
    return r && toCustomer(r)
  }

  /** Patch non-wallet columns (use `adjustWallet` for money). `null`/`undefined` in the patch clears nullable columns when the key is present. */
  update(id: string, patch: CustomerPatch): Customer {
    const sets: string[] = []
    const params: unknown[] = []
    for (const [k, v] of Object.entries(patch)) {
      if (k === 'flags') {
        sets.push('flags_json = ?')
        params.push(toJson(StringArraySchema, v as string[], 'customer.flags'))
        continue
      }
      const col = PATCH_COLUMNS[k]
      if (!col) throw new Error(`CustomersRepo.update: unknown field ${k}`)
      sets.push(`${col} = ?`)
      params.push(v)
    }
    if (sets.length) {
      const r = this.db.run(`UPDATE customers SET ${sets.join(', ')} WHERE id = ?`, [...params, id])
      if (r.changes === 0) throw new AppError('NOT_FOUND', `customer ${id} not found`)
    }
    const c = this.get(id)
    if (!c) throw new AppError('NOT_FOUND', `customer ${id} not found`)
    return c
  }

  /** Atomically add `deltaIrt` to the wallet; throws INSUFFICIENT_FUNDS if the result would be negative. */
  adjustWallet(id: string, deltaIrt: number): { before: number; after: number } {
    if (!Number.isSafeInteger(deltaIrt)) throw new RangeError('wallet delta must be a safe integer')
    return this.db.tx(() => {
      const before = this.db.scalar<number>('SELECT wallet_irt FROM customers WHERE id = ?', [id])
      if (before === undefined) throw new AppError('NOT_FOUND', `customer ${id} not found`)
      if (before + deltaIrt < 0) throw new AppError('INSUFFICIENT_FUNDS', 'wallet balance is insufficient', { balanceIrt: before, requiredIrt: -deltaIrt })
      this.db.run('UPDATE customers SET wallet_irt = wallet_irt + ? WHERE id = ?', [deltaIrt, id])
      return { before, after: before + deltaIrt }
    })
  }

  list(f: CustomerListFilter = {}): Customer[] {
    const where: string[] = []
    const params: unknown[] = []
    if (f.tier) (where.push('tier = ?'), params.push(f.tier))
    if (f.status) (where.push('status = ?'), params.push(f.status))
    if (f.q) {
      where.push('(phone LIKE ? OR name LIKE ? OR referral_code LIKE ? OR id = ?)')
      const like = `%${f.q}%`
      params.push(like, like, like, f.q)
    }
    const sql = `SELECT * FROM customers ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`
    return this.db.all<CustomerRow>(sql, [...params, f.limit ?? 50, f.offset ?? 0]).map(toCustomer)
  }

  count(f: Pick<CustomerListFilter, 'tier' | 'status'> = {}): number {
    const where: string[] = []
    const params: unknown[] = []
    if (f.tier) (where.push('tier = ?'), params.push(f.tier))
    if (f.status) (where.push('status = ?'), params.push(f.status))
    return this.db.scalar<number>(`SELECT COUNT(*) FROM customers ${where.length ? 'WHERE ' + where.join(' AND ') : ''}`, params) ?? 0
  }

  countCreatedSince(since: EpochMs): number {
    return this.db.scalar<number>('SELECT COUNT(*) FROM customers WHERE created_at >= ?', [since]) ?? 0
  }

  getLimitOverride(id: string): LimitOverride | undefined {
    const r = this.db.get<{ limit_override_json: string | null }>('SELECT limit_override_json FROM customers WHERE id = ?', [id])
    return fromJsonOpt(LimitOverrideSchema, r?.limit_override_json, 'customers.limit_override_json')
  }
  setLimitOverride(id: string, o: LimitOverride | undefined): void {
    this.db.run('UPDATE customers SET limit_override_json = ? WHERE id = ?', [toJsonOpt(LimitOverrideSchema, o, 'limit override'), id])
  }
}

// ───────────────────────── identities ─────────────────────────
export interface IdentityRecord {
  id: string
  customerId: string
  kind: 'phone' | 'telegram' | 'bale'
  externalId: string
  verifiedAt?: EpochMs
  meta: Record<string, unknown>
  createdAt: EpochMs
}
interface IdentityRow {
  id: string
  customer_id: string
  kind: IdentityRecord['kind']
  external_id: string
  verified_at: number | null
  meta_json: string
  created_at: number
}
const toIdentity = (r: IdentityRow): IdentityRecord =>
  compact({
    id: r.id,
    customerId: r.customer_id,
    kind: r.kind,
    externalId: r.external_id,
    verifiedAt: nn(r.verified_at),
    meta: JSON.parse(r.meta_json) as Record<string, unknown>,
    createdAt: r.created_at,
  }) as IdentityRecord

export class IdentitiesRepo {
  constructor(private readonly db: Database) {}
  insert(i: IdentityRecord): IdentityRecord {
    this.db.run('INSERT INTO identities (id, customer_id, kind, external_id, verified_at, meta_json, created_at) VALUES (?,?,?,?,?,?,?)', [
      i.id, i.customerId, i.kind, i.externalId, i.verifiedAt, JSON.stringify(i.meta ?? {}), i.createdAt,
    ])
    return i
  }
  get(id: string): IdentityRecord | undefined {
    const r = this.db.get<IdentityRow>('SELECT * FROM identities WHERE id = ?', [id])
    return r && toIdentity(r)
  }
  getByExternal(kind: IdentityRecord['kind'], externalId: string): IdentityRecord | undefined {
    const r = this.db.get<IdentityRow>('SELECT * FROM identities WHERE kind = ? AND external_id = ?', [kind, externalId])
    return r && toIdentity(r)
  }
  listByCustomer(customerId: string): IdentityRecord[] {
    return this.db.all<IdentityRow>('SELECT * FROM identities WHERE customer_id = ? ORDER BY created_at, id', [customerId]).map(toIdentity)
  }
  update(id: string, patch: { verifiedAt?: EpochMs; meta?: Record<string, unknown> }): void {
    if (patch.verifiedAt !== undefined) this.db.run('UPDATE identities SET verified_at = ? WHERE id = ?', [patch.verifiedAt, id])
    if (patch.meta !== undefined) this.db.run('UPDATE identities SET meta_json = ? WHERE id = ?', [JSON.stringify(patch.meta), id])
  }
}

// ───────────────────────── referrals ─────────────────────────
export interface ReferralRecord {
  id: string
  referrerId: string
  referredId: string
  code: string
  status: 'attributed' | 'qualified' | 'rewarded' | 'rejected'
  rewardIrt: number
  qualifiedOrderId?: string
  createdAt: EpochMs
  qualifiedAt?: EpochMs
  rewardedAt?: EpochMs
}
interface ReferralRow {
  id: string
  referrer_id: string
  referred_id: string
  code: string
  status: ReferralRecord['status']
  reward_irt: number
  qualified_order_id: string | null
  created_at: number
  qualified_at: number | null
  rewarded_at: number | null
}
const toReferral = (r: ReferralRow): ReferralRecord =>
  compact({
    id: r.id,
    referrerId: r.referrer_id,
    referredId: r.referred_id,
    code: r.code,
    status: r.status,
    rewardIrt: r.reward_irt,
    qualifiedOrderId: nn(r.qualified_order_id),
    createdAt: r.created_at,
    qualifiedAt: nn(r.qualified_at),
    rewardedAt: nn(r.rewarded_at),
  }) as ReferralRecord

export class ReferralsRepo {
  constructor(private readonly db: Database) {}
  insert(r: ReferralRecord): ReferralRecord {
    this.db.run(
      'INSERT INTO referrals (id, referrer_id, referred_id, code, status, reward_irt, qualified_order_id, created_at, qualified_at, rewarded_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [r.id, r.referrerId, r.referredId, r.code, r.status, r.rewardIrt, r.qualifiedOrderId, r.createdAt, r.qualifiedAt, r.rewardedAt],
    )
    return this.get(r.id) as ReferralRecord
  }
  get(id: string): ReferralRecord | undefined {
    const r = this.db.get<ReferralRow>('SELECT * FROM referrals WHERE id = ?', [id])
    return r && toReferral(r)
  }
  getByReferred(referredId: string): ReferralRecord | undefined {
    const r = this.db.get<ReferralRow>('SELECT * FROM referrals WHERE referred_id = ?', [referredId])
    return r && toReferral(r)
  }
  listByReferrer(referrerId: string): ReferralRecord[] {
    return this.db.all<ReferralRow>('SELECT * FROM referrals WHERE referrer_id = ? ORDER BY created_at, id', [referrerId]).map(toReferral)
  }
  update(id: string, patch: Partial<Pick<ReferralRecord, 'status' | 'rewardIrt' | 'qualifiedOrderId' | 'qualifiedAt' | 'rewardedAt'>>): ReferralRecord {
    const map: Record<string, string> = { status: 'status', rewardIrt: 'reward_irt', qualifiedOrderId: 'qualified_order_id', qualifiedAt: 'qualified_at', rewardedAt: 'rewarded_at' }
    const sets: string[] = []
    const params: unknown[] = []
    for (const [k, v] of Object.entries(patch)) (sets.push(`${map[k]} = ?`), params.push(v))
    if (sets.length) this.db.run(`UPDATE referrals SET ${sets.join(', ')} WHERE id = ?`, [...params, id])
    const r = this.get(id)
    if (!r) throw new AppError('NOT_FOUND', `referral ${id} not found`)
    return r
  }
  stats(referrerId: string): { referred: number; qualified: number; rewarded: number; rewardsIrt: number } {
    const r = this.db.get<{ referred: number; qualified: number; rewarded: number; rewards: number | null }>(
      `SELECT COUNT(*) AS referred,
              SUM(CASE WHEN status IN ('qualified','rewarded') THEN 1 ELSE 0 END) AS qualified,
              SUM(CASE WHEN status = 'rewarded' THEN 1 ELSE 0 END) AS rewarded,
              SUM(CASE WHEN status = 'rewarded' THEN reward_irt ELSE 0 END) AS rewards
         FROM referrals WHERE referrer_id = ? AND status <> 'rejected'`,
      [referrerId],
    )
    return { referred: r?.referred ?? 0, qualified: r?.qualified ?? 0, rewarded: r?.rewarded ?? 0, rewardsIrt: r?.rewards ?? 0 }
  }
}
