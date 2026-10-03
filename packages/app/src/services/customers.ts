/**
 * CustomerService — OTP + messenger login, sessions, KYC, tiers & limits, referrals, wallet hook.
 *
 * OTP policy (flags in `settings`, defaults in OTP_DEFAULTS): 3 requests / 10 min / phone; 5 failed verifications / hour / phone;
 * code valid 5 min, single use; fixed demo code `12345` whenever mode !== 'live'.
 *
 * Wallet: this service only moves the number on the customer row, atomically, and then calls registered *posting hooks* inside the
 * same DB transaction. B3's LedgerService registers a hook (`customers.onWalletAdjust`) that posts E17 (top-up) / E4 (spend) etc.;
 * if a hook throws, the balance change is rolled back, so wallet and ledger can never diverge.
 *
 * Anti-abuse (CLAUDE.md §3): one national id ↔ one account; self-referral and same-identity referral are rejected; referral rewards need a
 * qualifying (delivered) order; none of this tries to evade a provider's or regulator's rules.
 */
import {
  AppError,
  isValidNationalId,
  normalizeIranMobile,
  publicCode,
  startOfIrstDay,
  toLatinDigits,
  MS,
  type Customer,
  type CustomerTier,
  type MeDto,
  type PaymentMethod,
} from '@hiclaude/contracts'
import type { AppContext } from '../context'
import { hmacSha256, randomDigits, randomToken, sha256Hex, timingSafeEqualStr } from '../crypto'
import type { LimitOverride, ReferralRecord, SessionRecord } from '../repos'
import type { ActorLike } from '../util'
import type { AuditService } from './audit'
import type { NotificationService } from './notifications'
import type { SettingsService } from './settings'

export const OTP_DEFAULTS = {
  digits: 5,
  demoCode: '12345',
  ttlMs: 5 * MS.minute,
  maxRequests: 3,
  requestWindowMs: 10 * MS.minute,
  maxFailedVerifications: 5,
  verifyWindowMs: MS.hour,
} as const

export const CUSTOMER_SESSION_TTL_MS = 30 * MS.day
const TOUCH_INTERVAL_MS = MS.minute
const REFERRAL_WINDOW_DAYS_DEFAULT = 7

export type CustomerChannel = 'web' | 'telegram' | 'bale' | 'api' | 'sim'
export type WalletReason = 'topup' | 'spend' | 'refund_credit' | 'overpayment_credit' | 'referral_reward' | 'admin_adjust'

export interface WalletAdjustment {
  customerId: string
  deltaIrt: number
  reason: WalletReason
  before: number
  after: number
  ref?: { orderId?: string; paymentId?: string; note?: string }
  at: number
}
export type WalletPostingHook = (adjustment: WalletAdjustment) => void

export interface CustomerLimits {
  tier: CustomerTier
  maxOrderUsdCents: number
  maxDailyUsdCents: number
  maxOpenOrders: number
  methods: PaymentMethod[]
  usedTodayUsdCents: number
  remainingDailyUsdCents: number
  openOrders: number
}

export interface CustomerSession {
  token: string
  customer: Customer
  isNew: boolean
  expiresAt: number
}

export type KycStatus = 'none' | 'pending' | 'verified'

type CustCtx = Pick<AppContext, 'clock' | 'rng' | 'ids' | 'repos' | 'db' | 'bus' | 'ports' | 'mode' | 'params' | 'logger' | 'masterKeyHex' | 'costs'>

export class CustomerService {
  private walletHooks: WalletPostingHook[] = []

  constructor(
    private readonly ctx: CustCtx,
    private readonly deps: { settings: SettingsService; notifications: NotificationService; audit: AuditService },
  ) {}

  private otpPolicy() {
    const s = this.deps.settings
    return {
      digits: s.get('otp.digits', OTP_DEFAULTS.digits),
      demoCode: s.get('otp.demoCode', OTP_DEFAULTS.demoCode),
      ttlMs: s.get('otp.ttlMs', OTP_DEFAULTS.ttlMs),
      maxRequests: s.get('otp.maxRequests', OTP_DEFAULTS.maxRequests),
      requestWindowMs: s.get('otp.requestWindowMs', OTP_DEFAULTS.requestWindowMs),
      maxFailed: s.get('otp.maxFailedVerifications', OTP_DEFAULTS.maxFailedVerifications),
      verifyWindowMs: s.get('otp.verifyWindowMs', OTP_DEFAULTS.verifyWindowMs),
    }
  }

  private codeHash(phone: string, code: string): string {
    return hmacSha256(this.ctx.masterKeyHex, `otp:${phone}:${code}`)
  }

  // ───────────────────────── OTP ─────────────────────────
  async requestOtp(phoneInput: string): Promise<{ phone: string; expiresAt: number; delivered: boolean }> {
    const phone = normalizeIranMobile(phoneInput)
    if (!phone) throw new AppError('VALIDATION', 'شمارهٔ موبایل معتبر نیست.', { field: 'phone' })
    const pol = this.otpPolicy()
    const now = this.ctx.clock.now()
    const since = now - pol.requestWindowMs
    if (this.ctx.repos.otps.countSince(phone, since) >= pol.maxRequests) {
      const oldest = this.ctx.repos.otps.oldestCreatedSince(phone, since) ?? now
      throw new AppError('RATE_LIMITED', 'too many OTP requests', { retryAfterMs: Math.max(0, oldest + pol.requestWindowMs - now), reason: 'otp_request_limit' })
    }
    const code = this.ctx.mode === 'live' ? randomDigits(this.ctx.rng, 'live', pol.digits) : pol.demoCode
    const expiresAt = now + pol.ttlMs
    this.ctx.db.tx(() => {
      this.ctx.repos.otps.consumeAllOpen(phone, now) // a new code supersedes older ones
      this.ctx.repos.otps.insert({ id: this.ctx.ids.next('otp'), phone, codeHash: this.codeHash(phone, code), purpose: 'login', createdAt: now, expiresAt, attempts: 0 })
    })
    const sent = await this.deps.notifications.sendOtp(phone, code)
    if (!sent.ok && this.ctx.mode === 'live') throw new AppError('PROVIDER_ERROR', 'could not deliver OTP', { reason: 'sms_failed' })
    return { phone, expiresAt, delivered: sent.ok }
  }

  verifyOtp(phoneInput: string, codeInput: string, opts: { referralCode?: string; channel?: CustomerChannel } = {}): CustomerSession {
    const phone = normalizeIranMobile(phoneInput)
    if (!phone) throw new AppError('VALIDATION', 'شمارهٔ موبایل معتبر نیست.', { field: 'phone' })
    const code = toLatinDigits(codeInput).trim()
    const pol = this.otpPolicy()
    const now = this.ctx.clock.now()
    if (this.ctx.repos.otps.attemptsSince(phone, now - pol.verifyWindowMs) >= pol.maxFailed) {
      throw new AppError('RATE_LIMITED', 'too many failed verifications', { reason: 'otp_verify_limit', retryAfterMs: pol.verifyWindowMs })
    }
    const otp = this.ctx.repos.otps.latestForPhone(phone)
    if (!otp || otp.consumedAt !== undefined) throw new AppError('UNAUTHENTICATED', 'no active code', { reason: 'otp_not_found' })
    if (otp.expiresAt <= now) throw new AppError('UNAUTHENTICATED', 'code expired', { reason: 'otp_expired' })
    if (!timingSafeEqualStr(this.codeHash(phone, code), otp.codeHash)) {
      const attempts = this.ctx.repos.otps.incrementAttempts(otp.id)
      if (attempts >= pol.maxFailed) this.ctx.repos.otps.consume(otp.id, now)
      throw new AppError('UNAUTHENTICATED', 'wrong code', { reason: 'otp_invalid', remainingAttempts: Math.max(0, pol.maxFailed - attempts) })
    }
    if (!this.ctx.repos.otps.consume(otp.id, now)) throw new AppError('UNAUTHENTICATED', 'code already used', { reason: 'otp_not_found' })
    const { customer, isNew } = this.getOrCreateByPhone(phone, { referralCode: opts.referralCode, channel: opts.channel })
    return this.openSession(customer, isNew, opts.channel ?? 'web')
  }

  // ───────────────────────── messenger auth ─────────────────────────
  /**
   * Mini App login via signed `initData`. Existing linked customers get a session. A new messenger user needs a phone, which must come from
   * a *verified* source (the bot's shared-contact message, handled by the API layer) — pass it as `verifiedPhone`; otherwise
   * UNAUTHENTICATED(phone_required) tells the client to run the OTP flow and then `linkMessenger`.
   */
  authMessenger(platform: 'telegram' | 'bale', initData: string, opts: { verifiedPhone?: string; referralCode?: string } = {}): CustomerSession {
    const port = this.ctx.ports.messengers[platform]
    if (!port) throw new AppError('VALIDATION', `${platform} is not configured`)
    const v = port.verifyInitData(initData)
    if (!v.ok) throw new AppError('UNAUTHENTICATED', 'invalid messenger data', { reason: 'initdata_invalid' })
    const now = this.ctx.clock.now()
    const maxAge = this.deps.settings.get('messenger.initDataMaxAgeMs', MS.day)
    if (now - v.value.authDate > maxAge) throw new AppError('UNAUTHENTICATED', 'messenger data too old', { reason: 'initdata_expired' })
    const found = platform === 'telegram' ? this.ctx.repos.customers.getByTelegramId(v.value.userId) : this.ctx.repos.customers.getByBaleId(v.value.userId)
    if (found) return this.openSession(found, false, platform)
    const phone = opts.verifiedPhone ? normalizeIranMobile(opts.verifiedPhone) : null
    if (!phone) throw new AppError('UNAUTHENTICATED', 'phone verification required', { reason: 'phone_required' })
    const { customer, isNew } = this.getOrCreateByPhone(phone, { referralCode: opts.referralCode, channel: platform })
    const linked = this.linkMessenger(customer.id, platform, v.value.userId)
    return this.openSession(linked, isNew, platform)
  }

  /** Attach a messenger identity to a customer (used after OTP login from inside a Mini App). */
  linkMessenger(customerId: string, platform: 'telegram' | 'bale', externalId: string): Customer {
    const c = this.mustGet(customerId)
    const existing = platform === 'telegram' ? this.ctx.repos.customers.getByTelegramId(externalId) : this.ctx.repos.customers.getByBaleId(externalId)
    if (existing && existing.id !== c.id) throw new AppError('CONFLICT', `${platform} account is already linked to another customer`, { reason: 'messenger_in_use' })
    const now = this.ctx.clock.now()
    return this.ctx.db.tx(() => {
      if (!this.ctx.repos.identities.getByExternal(platform, externalId)) {
        this.ctx.repos.identities.insert({ id: this.ctx.ids.next('idn'), customerId: c.id, kind: platform, externalId, verifiedAt: now, meta: {}, createdAt: now })
      }
      return this.ctx.repos.customers.update(c.id, platform === 'telegram' ? { telegramId: externalId } : { baleId: externalId })
    })
  }

  // ───────────────────────── customers ─────────────────────────
  getOrCreateByPhone(phoneInput: string, opts: { referralCode?: string; channel?: CustomerChannel } = {}): { customer: Customer; isNew: boolean } {
    const phone = normalizeIranMobile(phoneInput)
    if (!phone) throw new AppError('VALIDATION', 'شمارهٔ موبایل معتبر نیست.', { field: 'phone' })
    const existing = this.ctx.repos.customers.getByPhone(phone)
    if (existing) return { customer: existing, isNew: false }
    const now = this.ctx.clock.now()
    const customer = this.ctx.db.tx(() => {
      const c = this.ctx.repos.customers.insert({
        id: this.ctx.ids.next('cus'),
        phone,
        tier: 'new',
        status: 'active',
        referralCode: this.uniqueReferralCode(),
        walletIrt: 0,
        riskScore: 0,
        flags: [],
        createdAt: now,
        lastSeenAt: now,
      })
      this.ctx.repos.identities.insert({ id: this.ctx.ids.next('idn'), customerId: c.id, kind: 'phone', externalId: phone, verifiedAt: now, meta: {}, createdAt: now })
      return c
    })
    this.ctx.bus.publish({ type: 'customer.registered', at: now, customerId: customer.id, channel: opts.channel ?? 'web' })
    if (opts.referralCode) this.attributeReferral(customer.id, opts.referralCode)
    void this.deps.notifications.enqueue({ event: 'welcome', customerId: customer.id, dedupeKey: `welcome:${customer.id}` })
    return { customer: this.mustGet(customer.id), isNew: true }
  }

  private uniqueReferralCode(): string {
    for (let i = 0; i < 50; i++) {
      const code = publicCode(this.ctx.rng, 'RF')
      if (!this.ctx.repos.customers.getByReferralCode(code)) return code
    }
    throw new AppError('INTERNAL', 'could not allocate a referral code')
  }

  get(id: string): Customer | undefined {
    return this.ctx.repos.customers.get(id)
  }
  mustGet(id: string): Customer {
    const c = this.ctx.repos.customers.get(id)
    if (!c) throw new AppError('NOT_FOUND', `customer ${id} not found`)
    return c
  }
  getByPhone(phone: string): Customer | undefined {
    const p = normalizeIranMobile(phone)
    return p ? this.ctx.repos.customers.getByPhone(p) : undefined
  }
  list(filter: { q?: string; tier?: CustomerTier; status?: 'active' | 'blocked'; limit?: number; offset?: number } = {}): Customer[] {
    return this.ctx.repos.customers.list(filter)
  }

  // ───────────────────────── sessions ─────────────────────────
  private openSession(customer: Customer, isNew: boolean, channel: string): CustomerSession {
    if (customer.status === 'blocked') throw new AppError('FORBIDDEN', 'account blocked', { reason: 'blocked' })
    const now = this.ctx.clock.now()
    const token = randomToken(this.ctx.rng, this.ctx.mode, 32)
    const expiresAt = now + this.deps.settings.get('session.customerTtlMs', CUSTOMER_SESSION_TTL_MS)
    const rec: SessionRecord = { tokenHash: sha256Hex(token), subjectKind: 'customer', subjectId: customer.id, channel, createdAt: now, expiresAt, lastSeenAt: now, meta: {} }
    this.ctx.repos.sessions.insert(rec)
    this.ctx.repos.customers.update(customer.id, { lastSeenAt: now })
    return { token, customer: this.mustGet(customer.id), isNew, expiresAt }
  }

  /** Bearer token → customer. Throws UNAUTHENTICATED (unknown/expired/revoked) or FORBIDDEN (blocked). */
  authenticate(token: string | undefined): { customer: Customer; session: SessionRecord } {
    if (!token) throw new AppError('UNAUTHENTICATED', 'missing session')
    const now = this.ctx.clock.now()
    const s = this.ctx.repos.sessions.getByHash(sha256Hex(token))
    if (!s || s.subjectKind !== 'customer' || s.revokedAt !== undefined || s.expiresAt <= now) throw new AppError('UNAUTHENTICATED', 'session invalid or expired')
    const c = this.ctx.repos.customers.get(s.subjectId)
    if (!c) throw new AppError('UNAUTHENTICATED', 'session invalid')
    if (c.status === 'blocked') throw new AppError('FORBIDDEN', 'account blocked', { reason: 'blocked' })
    if (now - s.lastSeenAt >= TOUCH_INTERVAL_MS) {
      this.ctx.repos.sessions.touch(s.tokenHash, now)
      this.ctx.repos.customers.update(c.id, { lastSeenAt: now })
    }
    return { customer: c, session: s }
  }

  logout(token: string): boolean {
    return this.ctx.repos.sessions.revoke(sha256Hex(token), this.ctx.clock.now())
  }

  // ───────────────────────── KYC ─────────────────────────
  kycStatus(c: Pick<Customer, 'kycSubmittedAt' | 'kycVerifiedAt'>): KycStatus {
    return c.kycVerifiedAt !== undefined ? 'verified' : c.kycSubmittedAt !== undefined ? 'pending' : 'none'
  }

  /**
   * Submit identity data: national-id checksum → uniqueness → Shahkar (mobile ↔ national id) via IdentityPort.
   * match ⇒ verified (tier recomputed); mismatch ⇒ rejected (VALIDATION `shahkar_mismatch`, nothing stored);
   * provider outage ⇒ `pending` (admin can `adminVerifyKyc`).
   */
  async submitKyc(customerId: string, input: { nationalId: string; fullName: string }): Promise<{ status: KycStatus; customer: Customer }> {
    const c = this.mustGet(customerId)
    if (c.kycVerifiedAt !== undefined) throw new AppError('CONFLICT', 'already verified', { reason: 'already_verified' })
    const nationalId = toLatinDigits(input.nationalId).trim()
    const fullName = input.fullName.trim().replace(/\s+/g, ' ')
    if (!isValidNationalId(nationalId)) throw new AppError('VALIDATION', 'کد ملی معتبر نیست.', { field: 'nationalId' })
    if (fullName.length < 3 || fullName.length > 80) throw new AppError('VALIDATION', 'نام و نام خانوادگی معتبر نیست.', { field: 'fullName' })
    const owner = this.ctx.repos.customers.getByNationalId(nationalId)
    if (owner && owner.id !== c.id) throw new AppError('CONFLICT', 'این کد ملی قبلاً برای حساب دیگری ثبت شده است.', { reason: 'national_id_in_use' })
    const now = this.ctx.clock.now()
    const res = await this.ctx.ports.identity.shahkar({ nationalId, phone: c.phone })
    if (res.ok) this.ctx.costs.record({ kind: 'shahkar', costIrt: res.value.costIrt, at: now, customerId: c.id })
    if (res.ok && !res.value.match) {
      this.deps.audit.record({ type: 'customer', id: c.id }, 'kyc.mismatch', c.id)
      this.deps.notifications.enqueue({ event: 'kyc.rejected', customerId: c.id, vars: { reason: 'شمارهٔ موبایل با کد ملی هم‌خوانی ندارد' }, dedupeKey: `kyc.rejected:${c.id}:${now}` })
      throw new AppError('VALIDATION', 'شمارهٔ موبایل متعلق به این کد ملی نیست.', { reason: 'shahkar_mismatch' })
    }
    const verified = res.ok && res.value.match
    let updated = this.ctx.repos.customers.update(c.id, { name: fullName, nationalId, kycSubmittedAt: now, ...(verified ? { kycVerifiedAt: now } : {}) })
    if (verified) {
      updated = this.recomputeTier(updated.id)
      this.deps.audit.record({ type: 'customer', id: c.id }, 'kyc.verified', c.id, { via: 'shahkar' })
      this.deps.notifications.enqueue({ event: 'kyc.verified', customerId: c.id, dedupeKey: `kyc.verified:${c.id}` })
    } else {
      this.deps.audit.record({ type: 'customer', id: c.id }, 'kyc.pending', c.id, { reason: res.ok ? 'unknown' : res.error.code })
      this.deps.notifications.enqueue({ event: 'kyc.pending', customerId: c.id, dedupeKey: `kyc.pending:${c.id}` })
    }
    return { status: this.kycStatus(updated), customer: updated }
  }

  /** Manual KYC decision by staff (after reviewing a pending submission). */
  adminVerifyKyc(customerId: string, approve: boolean, actor: ActorLike, reason?: string): Customer {
    const c = this.mustGet(customerId)
    const now = this.ctx.clock.now()
    let out: Customer
    if (approve) {
      if (c.nationalId === undefined) throw new AppError('CONFLICT', 'no KYC submission to approve')
      out = this.recomputeTier(this.ctx.repos.customers.update(c.id, { kycVerifiedAt: now }).id)
      this.deps.notifications.enqueue({ event: 'kyc.verified', customerId: c.id, dedupeKey: `kyc.verified:${c.id}` })
    } else {
      out = this.ctx.repos.customers.update(c.id, { nationalId: undefined, kycSubmittedAt: undefined, kycVerifiedAt: undefined, tier: 'new' })
      this.deps.notifications.enqueue({ event: 'kyc.rejected', customerId: c.id, vars: { reason }, dedupeKey: `kyc.rejected:${c.id}:${now}` })
    }
    this.deps.audit.record(actor, approve ? 'kyc.approve' : 'kyc.reject', c.id, { reason })
    return out
  }

  // ───────────────────────── tiers & limits ─────────────────────────
  /**
   * Automatic tier: no verified KYC → `new`; verified → `verified`; verified + ≥ N completed orders + account age ≥ D days + low risk
   * score + no `fraud` flag → `trusted` (flags `tier.trustedMinOrders` default 5, `tier.trustedMinAgeDays` default 30). A manual
   * staff decision (flag `tier_manual`) is never overridden automatically.
   */
  computeTier(c: Customer): CustomerTier {
    if (c.flags.includes('tier_manual')) return c.tier
    if (c.kycVerifiedAt === undefined) return 'new'
    const s = this.deps.settings
    const minOrders = s.get('tier.trustedMinOrders', 5)
    const minAgeDays = s.get('tier.trustedMinAgeDays', 30)
    const ageDays = (this.ctx.clock.now() - c.createdAt) / MS.day
    const completed = this.ctx.repos.orders.countCompletedByCustomer(c.id)
    const lowRisk = c.riskScore < this.ctx.params().risk.highRiskScoreThreshold
    return completed >= minOrders && ageDays >= minAgeDays && lowRisk && !c.flags.includes('fraud') ? 'trusted' : 'verified'
  }

  recomputeTier(customerId: string): Customer {
    const c = this.mustGet(customerId)
    const tier = this.computeTier(c)
    return tier === c.tier ? c : this.ctx.repos.customers.update(c.id, { tier })
  }

  /** Staff override of the tier (sticky: sets `tier_manual`). */
  setTier(customerId: string, tier: CustomerTier, actor: ActorLike, reason?: string): Customer {
    const c = this.mustGet(customerId)
    const flags = c.flags.includes('tier_manual') ? c.flags : [...c.flags, 'tier_manual']
    const out = this.ctx.repos.customers.update(c.id, { tier, flags })
    this.deps.audit.record(actor, 'customer.tier', c.id, { from: c.tier, to: tier, reason })
    return out
  }

  /** Drop the manual lock so the tier is computed automatically again. */
  clearManualTier(customerId: string, actor: ActorLike): Customer {
    const c = this.mustGet(customerId)
    this.ctx.repos.customers.update(c.id, { flags: c.flags.filter((f) => f !== 'tier_manual') })
    this.deps.audit.record(actor, 'customer.tier.auto', c.id)
    return this.recomputeTier(c.id)
  }

  /** Face value (USD cents) the customer has committed since IRST midnight (excludes expired/cancelled/refunded/failed orders). */
  usedTodayUsdCents(customerId: string): number {
    return this.ctx.repos.orders.usedUsdCentsSince(customerId, startOfIrstDay(this.ctx.clock.now()))
  }

  limitsFor(customer: Customer): CustomerLimits {
    const tiers = this.ctx.params().risk.tiers
    const base = tiers[customer.tier] ?? tiers.new
    if (!base) throw new AppError('INTERNAL', 'risk.tiers has no entry for the customer tier')
    const o = this.ctx.repos.customers.getLimitOverride(customer.id)
    const maxOrder = o?.maxOrderUsdCents ?? base.maxOrderUsdCents
    const maxDaily = o?.maxDailyUsdCents ?? base.maxDailyUsdCents
    const used = this.usedTodayUsdCents(customer.id)
    return {
      tier: customer.tier,
      maxOrderUsdCents: maxOrder,
      maxDailyUsdCents: maxDaily,
      maxOpenOrders: o?.maxOpenOrders ?? base.maxOpenOrders,
      methods: [...base.methods],
      usedTodayUsdCents: used,
      remainingDailyUsdCents: Math.max(0, maxDaily - used),
      openOrders: this.ctx.repos.orders.countOpenByCustomer(customer.id),
    }
  }

  /**
   * Gatekeeper used before creating an order: blocked account, tier method list, per-order / daily / open-order caps and the order-velocity rule.
   * Throws FORBIDDEN | PAYMENT_METHOD_UNAVAILABLE | LIMIT_EXCEEDED | RATE_LIMITED. Returns the limits snapshot when allowed.
   */
  checkOrderAllowed(customer: Customer, amountUsdCents: number, method: PaymentMethod): CustomerLimits {
    if (customer.status === 'blocked') throw new AppError('FORBIDDEN', 'account blocked', { reason: 'blocked' })
    const l = this.limitsFor(customer)
    if (!l.methods.includes(method)) throw new AppError('PAYMENT_METHOD_UNAVAILABLE', 'method not allowed for this tier', { tier: customer.tier, method })
    if (amountUsdCents > l.maxOrderUsdCents) throw new AppError('LIMIT_EXCEEDED', 'per-order limit exceeded', { limit: 'maxOrder', maxUsdCents: l.maxOrderUsdCents, tier: customer.tier })
    if (l.usedTodayUsdCents + amountUsdCents > l.maxDailyUsdCents) throw new AppError('LIMIT_EXCEEDED', 'daily limit exceeded', { limit: 'maxDaily', remainingUsdCents: l.remainingDailyUsdCents, tier: customer.tier })
    if (l.openOrders >= l.maxOpenOrders) throw new AppError('LIMIT_EXCEEDED', 'too many open orders', { limit: 'maxOpenOrders', max: l.maxOpenOrders })
    const velocity = this.ctx.params().risk.velocity.maxOrdersPerHourPerCustomer
    if (velocity > 0 && this.ctx.repos.orders.countCreatedByCustomerSince(customer.id, this.ctx.clock.now() - MS.hour) >= velocity) {
      throw new AppError('RATE_LIMITED', 'order velocity limit', { reason: 'order_velocity' })
    }
    return l
  }

  setLimitOverride(customerId: string, o: LimitOverride | undefined, actor: ActorLike): void {
    this.mustGet(customerId)
    this.ctx.repos.customers.setLimitOverride(customerId, o)
    this.deps.audit.record(actor, 'customer.limit', customerId, { override: o ?? null })
  }

  // ───────────────────────── admin state ─────────────────────────
  block(customerId: string, actor: ActorLike, reason?: string): Customer {
    const c = this.ctx.repos.customers.update(customerId, { status: 'blocked' })
    this.ctx.repos.sessions.revokeAllForSubject('customer', customerId, this.ctx.clock.now())
    this.deps.audit.record(actor, 'customer.block', customerId, { reason })
    return c
  }
  unblock(customerId: string, actor: ActorLike): Customer {
    const c = this.ctx.repos.customers.update(customerId, { status: 'active' })
    this.deps.audit.record(actor, 'customer.unblock', customerId)
    return c
  }
  addFlag(customerId: string, flag: string, actor: ActorLike = 'system'): Customer {
    const c = this.mustGet(customerId)
    if (c.flags.includes(flag)) return c
    this.deps.audit.record(actor, 'customer.flag', customerId, { flag })
    return this.ctx.repos.customers.update(customerId, { flags: [...c.flags, flag] })
  }
  removeFlag(customerId: string, flag: string, actor: ActorLike = 'system'): Customer {
    const c = this.mustGet(customerId)
    if (!c.flags.includes(flag)) return c
    this.deps.audit.record(actor, 'customer.unflag', customerId, { flag })
    return this.ctx.repos.customers.update(customerId, { flags: c.flags.filter((f) => f !== flag) })
  }
  setRiskScore(customerId: string, score: number): Customer {
    return this.ctx.repos.customers.update(customerId, { riskScore: Math.max(0, Math.min(100, Math.round(score))) })
  }
  updateProfile(customerId: string, patch: { name?: string }): Customer {
    const name = patch.name?.trim()
    if (name !== undefined && (name.length < 2 || name.length > 80)) throw new AppError('VALIDATION', 'نام معتبر نیست.', { field: 'name' })
    return this.ctx.repos.customers.update(customerId, { ...(name !== undefined ? { name } : {}) })
  }

  // ───────────────────────── referrals ─────────────────────────
  /**
   * Attribute `customerId` to the owner of `code`. Silently ignored (returns undefined, audit row written) when the code is unknown,
   * is the customer's own, the customer is already attributed, the account is older than the referral window (default 7 days) or
   * the two accounts share an identity (same national id). One referral per referred customer; no multi-account farming.
   */
  attributeReferral(customerId: string, codeInput: string): ReferralRecord | undefined {
    const code = codeInput.trim().toUpperCase()
    const c = this.mustGet(customerId)
    const reject = (reason: string): undefined => {
      this.deps.audit.record({ type: 'system' }, 'referral.rejected', customerId, { code, reason })
      return undefined
    }
    if (this.ctx.repos.referrals.getByReferred(c.id)) return reject('already_attributed')
    const referrer = this.ctx.repos.customers.getByReferralCode(code)
    if (!referrer) return reject('unknown_code')
    if (referrer.id === c.id || referrer.phone === c.phone) return reject('self_referral')
    if (referrer.status === 'blocked') return reject('referrer_blocked')
    if (referrer.nationalId && referrer.nationalId === c.nationalId) return reject('same_identity')
    const windowDays = this.deps.settings.get('referral.windowDays', REFERRAL_WINDOW_DAYS_DEFAULT)
    if (this.ctx.clock.now() - c.createdAt > windowDays * MS.day) return reject('window_closed')
    if (this.ctx.repos.orders.countCreatedByCustomerSince(c.id, 0) > 0) return reject('has_orders')
    return this.ctx.db.tx(() => {
      const rec = this.ctx.repos.referrals.insert({
        id: this.ctx.ids.next('ref'), referrerId: referrer.id, referredId: c.id, code, status: 'attributed', rewardIrt: 0, createdAt: this.ctx.clock.now(),
      })
      this.ctx.repos.customers.update(c.id, { referredBy: referrer.id })
      return rec
    })
  }

  referralStats(customerId: string): { code: string; referred: number; qualified: number; rewarded: number; rewardsIrt: number } {
    const c = this.mustGet(customerId)
    return { code: c.referralCode, ...this.ctx.repos.referrals.stats(c.id) }
  }

  /** Mark the referral of `referredId` as qualified (first delivered order). Idempotent; returns the record when state changed. */
  qualifyReferral(referredId: string, orderId: string): ReferralRecord | undefined {
    const r = this.ctx.repos.referrals.getByReferred(referredId)
    if (!r || r.status !== 'attributed') return undefined
    return this.ctx.repos.referrals.update(r.id, { status: 'qualified', qualifiedOrderId: orderId, qualifiedAt: this.ctx.clock.now() })
  }

  /** Pay the referrer's reward into their wallet (posting hooks run). Only for `qualified` referrals; idempotent. */
  rewardReferral(referredId: string, rewardIrt: number): ReferralRecord | undefined {
    const r = this.ctx.repos.referrals.getByReferred(referredId)
    if (!r || r.status !== 'qualified') return undefined
    if (!Number.isSafeInteger(rewardIrt) || rewardIrt <= 0) throw new AppError('VALIDATION', 'reward must be a positive integer')
    return this.ctx.db.tx(() => {
      this.walletAdjust(r.referrerId, rewardIrt, 'referral_reward', { orderId: r.qualifiedOrderId, note: `referral:${r.id}` })
      const out = this.ctx.repos.referrals.update(r.id, { status: 'rewarded', rewardIrt, rewardedAt: this.ctx.clock.now() })
      this.deps.notifications.enqueue({ event: 'referral.rewarded', customerId: r.referrerId, vars: { amount: rewardIrt }, dedupeKey: `referral.rewarded:${r.id}` })
      return out
    })
  }

  // ───────────────────────── wallet ─────────────────────────
  walletBalance(customerId: string): number {
    return this.mustGet(customerId).walletIrt
  }

  /** Register a hook that posts the ledger entry for a wallet movement (called inside the same DB transaction). */
  onWalletAdjust(hook: WalletPostingHook): () => void {
    this.walletHooks.push(hook)
    return () => {
      this.walletHooks = this.walletHooks.filter((h) => h !== hook)
    }
  }

  /**
   * Atomically change a customer's wallet by `deltaIrt` (positive = credit, negative = debit; INSUFFICIENT_FUNDS if it would go below 0),
   * then run the posting hooks inside the same transaction. Nest freely inside other `db.tx` blocks (savepoints).
   * The service itself NEVER posts to the ledger — that is the hook's job (E17 for top-ups/credits, E4 for spend).
   */
  walletAdjust(customerId: string, deltaIrt: number, reason: WalletReason, ref?: WalletAdjustment['ref']): WalletAdjustment {
    if (!Number.isSafeInteger(deltaIrt) || deltaIrt === 0) throw new AppError('VALIDATION', 'wallet delta must be a non-zero integer')
    return this.ctx.db.tx(() => {
      const { before, after } = this.ctx.repos.customers.adjustWallet(customerId, deltaIrt)
      const adj: WalletAdjustment = { customerId, deltaIrt, reason, before, after, ref, at: this.ctx.clock.now() }
      for (const h of this.walletHooks) h(adj)
      return adj
    })
  }

  // ───────────────────────── DTO ─────────────────────────
  toMeDto(customerId: string): MeDto {
    const c = this.mustGet(customerId)
    const l = this.limitsFor(c)
    return compactMe({
      id: c.id,
      phone: c.phone,
      name: c.name,
      tier: c.tier,
      kycStatus: this.kycStatus(c),
      limits: { maxOrderUsdCents: l.maxOrderUsdCents, maxDailyUsdCents: l.maxDailyUsdCents, usedTodayUsdCents: l.usedTodayUsdCents },
      walletIrt: c.walletIrt,
      referralCode: c.referralCode,
    })
  }
}

function compactMe(m: MeDto): MeDto {
  if (m.name === undefined) delete (m as { name?: string }).name
  return m
}
