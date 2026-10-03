import { AppError, MS, portError } from '@hiclaude/contracts'
import { describe, expect, it } from 'vitest'
import { CUSTOMER_SESSION_TTL_MS, OTP_DEFAULTS, type WalletAdjustment } from '../src'
import { NID1, NID2, PHONE, PHONE2, makeTestApp, mkCustomer, mkOrder, mkQuote } from './helpers'

const reason = (fn: () => unknown): unknown => {
  try {
    fn()
  } catch (e) {
    return (e as AppError).details?.reason ?? (e as AppError).code
  }
}
const reasonAsync = async (fn: () => Promise<unknown>): Promise<unknown> => {
  try {
    await fn()
  } catch (e) {
    return (e as AppError).details?.reason ?? (e as AppError).code
  }
}

describe('OTP login', () => {
  it('happy path: demo code 12345 creates a customer and a session; the SMS is sent; DB never stores the code', async () => {
    const t = makeTestApp()
    const c = t.app.services.customers
    const r = await c.requestOtp('+98 912 123 4567')
    expect(r).toMatchObject({ phone: PHONE, delivered: true })
    expect(t.fakes.sms.lastOtp(PHONE)).toBe('12345')
    const stored = t.app.repos.notifications.listForCustomer('none')
    expect(stored).toEqual([])
    const rows = t.app.db.all<{ text: string }>("SELECT text FROM notifications WHERE event = 'otp'")
    expect(rows[0]?.text).not.toContain('12345')
    const s = c.verifyOtp('۰۹۱۲۱۲۳۴۵۶۷', '۱۲۳۴۵')
    expect(s.isNew).toBe(true)
    expect(s.customer.phone).toBe(PHONE)
    expect(s.expiresAt).toBe(t.clock.now() + CUSTOMER_SESSION_TTL_MS)
    expect(c.authenticate(s.token).customer.id).toBe(s.customer.id)
    expect(t.app.costs).toBeDefined()
  })

  it('second login reuses the customer', async () => {
    const t = makeTestApp()
    const c = t.app.services.customers
    await c.requestOtp(PHONE)
    const a = c.verifyOtp(PHONE, '12345')
    await c.requestOtp(PHONE)
    const b = c.verifyOtp(PHONE, '12345')
    expect(b.isNew).toBe(false)
    expect(b.customer.id).toBe(a.customer.id)
    expect(b.token).not.toBe(a.token)
  })

  it('wrong code decrements remaining attempts, then rate-limits after 5 failures/hour', async () => {
    const t = makeTestApp()
    const c = t.app.services.customers
    await c.requestOtp(PHONE)
    try {
      c.verifyOtp(PHONE, '00000')
    } catch (e) {
      expect((e as AppError).details).toMatchObject({ reason: 'otp_invalid', remainingAttempts: 4 })
    }
    for (let i = 0; i < 4; i++) expect(reason(() => c.verifyOtp(PHONE, '00000'))).toBe('otp_invalid')
    expect(reason(() => c.verifyOtp(PHONE, '12345'))).toBe('otp_verify_limit') // even the right code is refused
    t.advance(MS.hour + 1)
    await c.requestOtp(PHONE)
    expect(c.verifyOtp(PHONE, '12345').customer.phone).toBe(PHONE)
  })

  it('request rate limit: 3 per 10 minutes per phone, with retryAfter', async () => {
    const t = makeTestApp()
    const c = t.app.services.customers
    for (let i = 0; i < OTP_DEFAULTS.maxRequests; i++) await c.requestOtp(PHONE)
    let err: AppError | undefined
    try {
      await c.requestOtp(PHONE)
    } catch (e) {
      err = e as AppError
    }
    expect(err?.code).toBe('RATE_LIMITED')
    expect(err?.details?.retryAfterMs).toBe(10 * MS.minute)
    await c.requestOtp(PHONE2) // other phones unaffected
    t.advance(10 * MS.minute + 1)
    await c.requestOtp(PHONE)
  })

  it('codes expire after 5 minutes, are single use, and a new request supersedes the old one', async () => {
    const t = makeTestApp({ mode: 'sim' })
    const c = t.app.services.customers
    await c.requestOtp(PHONE)
    t.advance(5 * MS.minute + 1)
    expect(reason(() => c.verifyOtp(PHONE, '12345'))).toBe('otp_expired')
    await c.requestOtp(PHONE)
    c.verifyOtp(PHONE, '12345')
    expect(reason(() => c.verifyOtp(PHONE, '12345'))).toBe('otp_not_found')
    expect(reason(() => c.verifyOtp(PHONE2, '12345'))).toBe('otp_not_found')
  })

  it('rejects invalid phone numbers and survives SMS outage in non-live modes', async () => {
    const t = makeTestApp()
    const c = t.app.services.customers
    expect(await reasonAsync(() => c.requestOtp('12345'))).toBe('VALIDATION')
    t.fakes.sms.fail('send', portError('UNAVAILABLE', 'down'))
    const r = await c.requestOtp(PHONE)
    expect(r.delivered).toBe(false)
    expect(c.verifyOtp(PHONE, '12345').customer.phone).toBe(PHONE)
  })

  it('the demo code is configurable via settings (non-live modes only)', async () => {
    const t = makeTestApp()
    expect(t.app.mode).toBe('test')
    t.app.services.settings.set('otp.demoCode', '54321', 'u')
    await t.app.services.customers.requestOtp(PHONE)
    expect(t.fakes.sms.lastOtp(PHONE)).toBe('54321')
  })

  it('blocked customers cannot log in and their sessions die', async () => {
    const t = makeTestApp()
    const c = t.app.services.customers
    await c.requestOtp(PHONE)
    const s = c.verifyOtp(PHONE, '12345')
    c.block(s.customer.id, 'staff:u1', 'fraud')
    expect(reason(() => c.authenticate(s.token))).toBe('UNAUTHENTICATED')
    await c.requestOtp(PHONE)
    expect(reason(() => c.verifyOtp(PHONE, '12345'))).toBe('blocked')
    c.unblock(s.customer.id, 'staff:u1')
    await c.requestOtp(PHONE)
    expect(c.verifyOtp(PHONE, '12345').customer.id).toBe(s.customer.id)
  })
})

describe('customer sessions', () => {
  it('expire, can be revoked, and unknown tokens are rejected', async () => {
    const t = makeTestApp()
    const c = t.app.services.customers
    await c.requestOtp(PHONE)
    const s = c.verifyOtp(PHONE, '12345')
    t.advance(CUSTOMER_SESSION_TTL_MS - 1)
    expect(c.authenticate(s.token).customer.id).toBe(s.customer.id)
    t.advance(2)
    expect(reason(() => c.authenticate(s.token))).toBe('UNAUTHENTICATED')
    await c.requestOtp(PHONE)
    const s2 = c.verifyOtp(PHONE, '12345')
    expect(c.logout(s2.token)).toBe(true)
    expect(reason(() => c.authenticate(s2.token))).toBe('UNAUTHENTICATED')
    expect(reason(() => c.authenticate('x'))).toBe('UNAUTHENTICATED')
    expect(reason(() => c.authenticate(undefined))).toBe('UNAUTHENTICATED')
  })

  it('session tokens are deterministic with the same seed (sim reproducibility)', async () => {
    const run = async () => {
      const t = makeTestApp({ seed: 42 })
      await t.app.services.customers.requestOtp(PHONE)
      return t.app.services.customers.verifyOtp(PHONE, '12345').token
    }
    expect(await run()).toBe(await run())
  })
})

describe('messenger auth', () => {
  it('requires a verified phone for new users, then links and re-logs in by messenger id', () => {
    const t = makeTestApp()
    const c = t.app.services.customers
    const init = t.fakes.telegram.makeInitData('777', { firstName: 'Ali' })
    expect(reason(() => c.authMessenger('telegram', init))).toBe('phone_required')
    const s = c.authMessenger('telegram', init, { verifiedPhone: PHONE })
    expect(s.isNew).toBe(true)
    expect(s.customer.telegramId).toBe('777')
    const s2 = c.authMessenger('telegram', t.fakes.telegram.makeInitData('777'))
    expect(s2.customer.id).toBe(s.customer.id)
    expect(s2.isNew).toBe(false)
  })

  it('rejects bad / stale initData and linking an id owned by someone else', () => {
    const t = makeTestApp()
    const c = t.app.services.customers
    expect(reason(() => c.authMessenger('bale', 'garbage'))).toBe('initdata_invalid')
    const old = t.fakes.bale.makeInitData('5', { authDate: t.clock.now() - 2 * MS.day })
    expect(reason(() => c.authMessenger('bale', old, { verifiedPhone: PHONE }))).toBe('initdata_expired')
    const a = mkCustomer(t, PHONE)
    const b = mkCustomer(t, PHONE2)
    c.linkMessenger(a.id, 'bale', '5')
    expect(reason(() => c.linkMessenger(b.id, 'bale', '5'))).toBe('messenger_in_use')
    expect(c.linkMessenger(a.id, 'bale', '5').baleId).toBe('5') // idempotent
  })
})

describe('KYC, tiers and limits', () => {
  it('Shahkar match verifies, upgrades tier, records the inquiry cost and notifies', async () => {
    const t = makeTestApp()
    const costs: number[] = []
    t.app.costs.subscribe((e) => costs.push(e.costIrt))
    const c = mkCustomer(t)
    const r = await t.app.services.customers.submitKyc(c.id, { nationalId: NID1, fullName: ' علی  رضایی ' })
    expect(r.status).toBe('verified')
    expect(r.customer).toMatchObject({ tier: 'verified', name: 'علی رضایی', nationalId: NID1 })
    expect(costs).toEqual([2000])
    expect(t.app.services.customers.kycStatus(r.customer)).toBe('verified')
    expect(t.app.repos.notifications.listForCustomer(c.id).some((n) => n.event === 'kyc.verified')).toBe(true)
    expect(await reasonAsync(() => t.app.services.customers.submitKyc(c.id, { nationalId: NID1, fullName: 'x y z' }))).toBe('already_verified')
  })

  it('validates the national id checksum, name and uniqueness', async () => {
    const t = makeTestApp()
    const a = mkCustomer(t, PHONE)
    const b = mkCustomer(t, PHONE2)
    const k = t.app.services.customers
    expect(await reasonAsync(() => k.submitKyc(a.id, { nationalId: '1234567890', fullName: 'علی رضایی' }))).toBe('VALIDATION')
    expect(await reasonAsync(() => k.submitKyc(a.id, { nationalId: NID1, fullName: 'x' }))).toBe('VALIDATION')
    await k.submitKyc(a.id, { nationalId: NID1, fullName: 'علی رضایی' })
    expect(await reasonAsync(() => k.submitKyc(b.id, { nationalId: NID1, fullName: 'رضا علوی' }))).toBe('national_id_in_use')
  })

  it('Shahkar mismatch rejects and stores nothing; outage leaves it pending; admin can approve/reject', async () => {
    const t = makeTestApp()
    const c = mkCustomer(t)
    const k = t.app.services.customers
    t.fakes.identity.setShahkar(NID1, PHONE, false)
    expect(await reasonAsync(() => k.submitKyc(c.id, { nationalId: NID1, fullName: 'علی رضایی' }))).toBe('shahkar_mismatch')
    expect(t.app.repos.customers.get(c.id)?.nationalId).toBeUndefined()
    t.fakes.identity.fail('shahkar', portError('UNAVAILABLE', 'down'))
    const p = await k.submitKyc(c.id, { nationalId: NID2, fullName: 'علی رضایی' })
    expect(p.status).toBe('pending')
    expect(p.customer.tier).toBe('new')
    expect(k.adminVerifyKyc(c.id, true, 'staff:u1').tier).toBe('verified')
    const rej = k.adminVerifyKyc(c.id, false, 'staff:u1', 'blurry')
    expect(rej).toMatchObject({ tier: 'new' })
    expect(rej.nationalId).toBeUndefined()
  })

  it('tier computation: trusted needs orders, age and low risk; manual tier is sticky', () => {
    const t = makeTestApp()
    const k = t.app.services.customers
    const c = mkCustomer(t)
    t.app.repos.customers.update(c.id, { kycVerifiedAt: t.clock.now(), nationalId: NID1 })
    expect(k.recomputeTier(c.id).tier).toBe('verified')
    const q = mkQuote(t, c.id)
    for (let i = 0; i < 5; i++) mkOrder(t, c.id, q.id, { status: 'completed' })
    expect(k.recomputeTier(c.id).tier).toBe('verified') // too young
    t.advance(31 * MS.day)
    expect(k.recomputeTier(c.id).tier).toBe('trusted')
    k.setRiskScore(c.id, 90)
    expect(k.recomputeTier(c.id).tier).toBe('verified')
    k.setTier(c.id, 'trusted', 'staff:u1')
    expect(k.recomputeTier(c.id).tier).toBe('trusted') // manual
    expect(k.clearManualTier(c.id, 'staff:u1').tier).toBe('verified')
    t.app.repos.customers.update(c.id, { kycVerifiedAt: undefined })
    expect(k.computeTier(t.app.repos.customers.get(c.id)!)).toBe('new')
  })

  it('limitsFor uses params.risk.tiers, counts today usage and honours overrides', () => {
    const t = makeTestApp()
    const k = t.app.services.customers
    const c = mkCustomer(t)
    expect(k.limitsFor(c)).toMatchObject({ tier: 'new', maxOrderUsdCents: 10_000, maxDailyUsdCents: 20_000, usedTodayUsdCents: 0, remainingDailyUsdCents: 20_000, openOrders: 0 })
    const q = mkQuote(t, c.id)
    mkOrder(t, c.id, q.id, { amountUsdCents: 5000 })
    mkOrder(t, c.id, q.id, { amountUsdCents: 7000, status: 'cancelled' })
    const l = k.limitsFor(c)
    expect(l.usedTodayUsdCents).toBe(5000)
    expect(l.openOrders).toBe(1)
    k.setLimitOverride(c.id, { maxDailyUsdCents: 99_999 }, 'staff:u1')
    expect(k.limitsFor(c)).toMatchObject({ maxDailyUsdCents: 99_999, maxOrderUsdCents: 10_000 })
    k.setLimitOverride(c.id, undefined, 'staff:u1')
    expect(k.limitsFor(c).maxDailyUsdCents).toBe(20_000)
    // usage resets at IRST midnight: 12:00 + 13h
    t.advance(13 * MS.hour)
    expect(k.usedTodayUsdCents(c.id)).toBe(0)
  })

  it('checkOrderAllowed enforces method, per-order, daily, open-order caps and velocity', () => {
    const t = makeTestApp()
    const k = t.app.services.customers
    const c = mkCustomer(t)
    expect(() => k.checkOrderAllowed(c, 5000, 'gateway')).not.toThrow()
    expect(reason(() => k.checkOrderAllowed(c, 5000, 'bank_transfer'))).toBe('PAYMENT_METHOD_UNAVAILABLE')
    expect(reason(() => k.checkOrderAllowed(c, 10_001, 'gateway'))).toBe('LIMIT_EXCEEDED')
    const q = mkQuote(t, c.id)
    mkOrder(t, c.id, q.id, { amountUsdCents: 8000 })
    mkOrder(t, c.id, q.id, { amountUsdCents: 8000 })
    expect((() => { try { k.checkOrderAllowed(c, 5000, 'gateway') } catch (e) { return (e as AppError).details?.limit } })()).toBe('maxDaily')
    // open-order cap (new tier: 2)
    const c2 = mkCustomer(t, PHONE2)
    const q2 = mkQuote(t, c2.id)
    mkOrder(t, c2.id, q2.id, { amountUsdCents: 100 })
    mkOrder(t, c2.id, q2.id, { amountUsdCents: 100 })
    expect((() => { try { k.checkOrderAllowed(c2, 100, 'gateway') } catch (e) { return (e as AppError).details?.limit } })()).toBe('maxOpenOrders')
    // velocity
    const t3 = makeTestApp({ params: { risk: { velocity: { maxOrdersPerHourPerCustomer: 1 }, tiers: { new: { maxOpenOrders: 50 } } } } as never })
    const c3 = mkCustomer(t3)
    mkOrder(t3, c3.id, mkQuote(t3, c3.id).id, { amountUsdCents: 100 })
    expect(reason(() => t3.app.services.customers.checkOrderAllowed(c3, 100, 'gateway'))).toBe('order_velocity')
    t3.advance(MS.hour + 1)
    expect(() => t3.app.services.customers.checkOrderAllowed(c3, 100, 'gateway')).not.toThrow()
    // blocked
    expect(reason(() => k.checkOrderAllowed({ ...c, status: 'blocked' }, 1, 'gateway'))).toBe('blocked')
  })

  it('toMeDto summarises tier, kyc, limits and wallet', () => {
    const t = makeTestApp()
    const c = mkCustomer(t)
    const me = t.app.services.customers.toMeDto(c.id)
    expect(me).toMatchObject({ id: c.id, phone: PHONE, tier: 'new', kycStatus: 'none', walletIrt: 0, referralCode: c.referralCode })
    expect('name' in me).toBe(false)
  })
})

describe('referrals', () => {
  it('attributes at registration, ignoring self/unknown/duplicate codes', async () => {
    const t = makeTestApp()
    const k = t.app.services.customers
    const a = mkCustomer(t, PHONE)
    const { customer: b } = k.getOrCreateByPhone(PHONE2, { referralCode: a.referralCode.toLowerCase() })
    expect(t.app.repos.customers.get(b.id)?.referredBy).toBe(a.id)
    expect(t.app.repos.referrals.getByReferred(b.id)?.status).toBe('attributed')
    expect(k.attributeReferral(a.id, a.referralCode)).toBeUndefined() // self
    expect(k.attributeReferral(b.id, a.referralCode)).toBeUndefined() // already attributed
    const c = mkCustomer(t, '09101010101')
    expect(k.attributeReferral(c.id, 'RF-NOPE00')).toBeUndefined()
    expect(t.app.services.audit.list({ action: 'referral.rejected' }).map((x) => x.data?.reason)).toEqual(['unknown_code', 'already_attributed', 'self_referral'])
    expect(k.referralStats(a.id)).toMatchObject({ code: a.referralCode, referred: 1, qualified: 0 })
  })

  it('blocks late attribution and attribution after the customer has ordered', () => {
    const t = makeTestApp()
    const k = t.app.services.customers
    const a = mkCustomer(t, PHONE)
    const c = mkCustomer(t, '09101010101')
    t.advance(8 * MS.day)
    expect(k.attributeReferral(c.id, a.referralCode)).toBeUndefined()
    const d = mkCustomer(t, '09102020202')
    mkOrder(t, d.id, mkQuote(t, d.id).id)
    expect(k.attributeReferral(d.id, a.referralCode)).toBeUndefined()
    expect(t.app.services.audit.list({ action: 'referral.rejected' }).map((x) => x.data?.reason)).toEqual(['has_orders', 'window_closed'])
  })

  it('qualify then reward credits the referrer wallet through the posting hook, once', () => {
    const t = makeTestApp()
    const k = t.app.services.customers
    const a = mkCustomer(t, PHONE)
    const { customer: b } = k.getOrCreateByPhone(PHONE2, { referralCode: a.referralCode })
    expect(k.rewardReferral(b.id, 1000)).toBeUndefined() // not qualified yet
    expect(k.qualifyReferral(b.id, 'ord_1')?.status).toBe('qualified')
    expect(k.qualifyReferral(b.id, 'ord_2')).toBeUndefined()
    const seen: WalletAdjustment[] = []
    k.onWalletAdjust((x) => seen.push(x))
    expect(k.rewardReferral(b.id, 50_000)?.status).toBe('rewarded')
    expect(k.rewardReferral(b.id, 50_000)).toBeUndefined()
    expect(k.walletBalance(a.id)).toBe(50_000)
    expect(seen).toMatchObject([{ customerId: a.id, deltaIrt: 50_000, reason: 'referral_reward', before: 0, after: 50_000 }])
    expect(k.referralStats(a.id)).toMatchObject({ referred: 1, qualified: 1, rewarded: 1, rewardsIrt: 50_000 })
  })
})

describe('wallet adjust hook', () => {
  it('credits and debits, calls hooks inside the transaction and rolls back when a hook throws', () => {
    const t = makeTestApp()
    const k = t.app.services.customers
    const c = mkCustomer(t)
    const calls: string[] = []
    const off = k.onWalletAdjust((a) => calls.push(`${a.reason}:${a.deltaIrt}:${a.after}`))
    k.walletAdjust(c.id, 10_000, 'topup', { paymentId: 'p1' })
    k.walletAdjust(c.id, -4_000, 'spend', { orderId: 'o1' })
    expect(calls).toEqual(['topup:10000:10000', 'spend:-4000:6000'])
    expect(k.walletBalance(c.id)).toBe(6000)
    expect(reason(() => k.walletAdjust(c.id, -7000, 'spend'))).toBe('INSUFFICIENT_FUNDS')
    expect(reason(() => k.walletAdjust(c.id, 0, 'spend'))).toBe('VALIDATION')
    off()
    k.onWalletAdjust(() => {
      throw new Error('ledger down')
    })
    expect(() => k.walletAdjust(c.id, 500, 'topup')).toThrow('ledger down')
    expect(k.walletBalance(c.id)).toBe(6000) // balance change rolled back with the failed posting
  })

  it('nests inside an outer transaction (savepoints)', () => {
    const t = makeTestApp()
    const k = t.app.services.customers
    const c = mkCustomer(t)
    expect(() =>
      t.app.db.tx(() => {
        k.walletAdjust(c.id, 100, 'topup')
        throw new Error('outer fails')
      }),
    ).toThrow('outer fails')
    expect(k.walletBalance(c.id)).toBe(0)
  })
})

describe('customer admin', () => {
  it('flags, profile and welcome notification', () => {
    const t = makeTestApp()
    const k = t.app.services.customers
    const c = mkCustomer(t)
    expect(k.addFlag(c.id, 'watch', 'staff:u').flags).toEqual(['watch'])
    expect(k.addFlag(c.id, 'watch').flags).toEqual(['watch'])
    expect(k.removeFlag(c.id, 'watch').flags).toEqual([])
    expect(k.updateProfile(c.id, { name: 'سارا' }).name).toBe('سارا')
    expect(reason(() => k.updateProfile(c.id, { name: 'x' }))).toBe('VALIDATION')
    expect(t.app.repos.notifications.listForCustomer(c.id).some((n) => n.event === 'welcome')).toBe(true)
    expect(k.getByPhone('0912-123-4567')?.id).toBe(c.id)
    expect(k.list({ q: PHONE })).toHaveLength(1)
  })
})
