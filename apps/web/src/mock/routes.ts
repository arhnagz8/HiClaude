/** Customer routes of the mock backend (api-spec.md §Customer endpoints). Request bodies are validated with the contracts' zod schemas. */
import {
  KycSchema,
  MessengerAuthSchema,
  OrderCreateSchema,
  OtpRequestSchema,
  OtpVerifySchema,
  QuoteRequestSchema,
  ReceiptSchema,
  DisputeSchema,
  TicketCreateSchema,
  TicketMessageSchema,
  WalletTopupSchema,
  isValidNationalId,
  normalizeIranMobile,
  type ProductDto,
} from '@hiclaude/contracts'
import { fail, noContent, ok, route, failThrow, type MockCtx, type MockResult } from './registry'
import { toProductDto } from './catalog'
import { fromPriceFor } from './pricing'
import { DEMO_OTP, type StoredOrder } from './server'
import type { AuthResult, OtpRequestResult, ReferralDto, WalletDto, WalletTopupResult } from '../api/extra-types'

function parse<T>(schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false; error: { issues: { path: (string | number)[]; message: string }[] } } }, body: unknown): T {
  const r = schema.safeParse(body)
  if (!r.success) {
    const first = r.error.issues[0]
    return failThrow('VALIDATION', undefined, { field: first?.path.join('.'), issue: first?.message })
  }
  return r.data
}

const needAuth = (c: MockCtx) => {
  const me = c.srv.db.customer
  if (!me) return failThrow('UNAUTHENTICATED')
  return me
}
const ownOrder = (c: MockCtx): StoredOrder => {
  needAuth(c)
  const o = c.srv.db.orders[c.params.id as string]
  if (!o) return failThrow('NOT_FOUND')
  return o
}

// ───────────── public ─────────────
route('GET', '/public/config', (c) => ok(c.srv.publicConfig()))

route('GET', '/catalog', (c) => {
  const env = c.srv.pricingEnv()
  const list: ProductDto[] = c.srv.products.filter((p) => p.active).map((p) => toProductDto(p, fromPriceFor(p, defaultAmount(p), env)))
  return ok(list)
})
route('GET', '/catalog/:id', (c) => {
  const p = c.srv.products.find((x) => x.id === c.params.id || x.slug === c.params.id)
  if (!p) return fail('NOT_FOUND')
  return ok(toProductDto(p, fromPriceFor(p, defaultAmount(p), c.srv.pricingEnv())))
})
function defaultAmount(p: { amount: { kind: string; fixedUsdCents?: number; optionsUsdCents?: number[]; minUsdCents?: number } }): number {
  return p.amount.kind === 'fixed' ? (p.amount.fixedUsdCents as number) : p.amount.kind === 'options' ? (p.amount.optionsUsdCents as number[])[0]! : (p.amount.minUsdCents as number)
}

route('POST', '/quotes', (c) => {
  const req = parse(QuoteRequestSchema, c.body)
  const p = c.srv.products.find((x) => x.id === req.productId)
  if (!p || !p.active) return fail('PRODUCT_UNAVAILABLE')
  const f = c.srv.db.flags
  if (f.killSwitch || f.rateStatus === 'killed') return fail('KILL_SWITCH')
  const cents = req.amountUsdCents ?? (p.amount.kind === 'fixed' ? p.amount.fixedUsdCents : undefined)
  if (!cents) return fail('VALIDATION', 'مبلغ را مشخص کنید.')
  const a = p.amount
  const valid = a.kind === 'fixed' ? cents === a.fixedUsdCents : a.kind === 'options' ? (a.optionsUsdCents ?? []).includes(cents) : cents >= (a.minUsdCents ?? 0) && cents <= (a.maxUsdCents ?? Infinity) && (cents - (a.minUsdCents ?? 0)) % (a.stepUsdCents ?? 1) === 0
  if (!valid) return fail('VALIDATION', 'مبلغ انتخاب‌شده برای این محصول مجاز نیست.')
  const tier = c.srv.rushTiers().find((t) => t.id === req.rushTier)
  if (!tier) return fail('VALIDATION', 'گزینه‌ی سرعت نامعتبر است.')
  if (!tier.available) return fail('RUSH_UNAVAILABLE')
  return ok(c.srv.quote(p, cents, req.rushTier, req.inputs))
})

// ───────────── auth ─────────────
route('POST', '/auth/otp/request', (c) => {
  const { phone } = parse(OtpRequestSchema, c.body)
  const n = normalizeIranMobile(phone)
  if (!n) return fail('VALIDATION', 'شماره‌ی موبایل معتبر نیست.')
  const now = c.srv.now()
  const list = (c.srv.db.otpRequests[n] ?? []).filter((t) => now - t < 10 * 60_000)
  if (list.length >= 3) return { status: 429, body: { error: { code: 'RATE_LIMITED', messageFa: 'تعداد درخواست کد برای این شماره زیاد است؛ ۱۰ دقیقه بعد دوباره تلاش کنید.', details: { retryAfterSeconds: 600 } } } }
  list.push(now)
  c.srv.db.otpRequests[n] = list
  const body: OtpRequestResult = { ok: true, ttlSeconds: 120, resendAfterSeconds: 60 }
  return ok(body)
})

route('POST', '/auth/otp/verify', (c) => {
  const v = parse(OtpVerifySchema, c.body)
  const n = normalizeIranMobile(v.phone)
  if (!n) return fail('VALIDATION', 'شماره‌ی موبایل معتبر نیست.')
  if (v.code !== DEMO_OTP) return fail('VALIDATION', 'کد واردشده درست نیست.', { field: 'code' })
  const created = !c.srv.db.customer || c.srv.db.customer.phone !== n
  const cust = created ? c.srv.createCustomer(n) : c.srv.db.customer!
  c.srv.db.token = c.srv.db.token ?? 'mock-token'
  const body: AuthResult = { me: c.srv.meDto()!, token: c.srv.db.token, created }
  void cust
  return ok(body)
})

route('POST', '/auth/messenger', (c) => {
  const v = parse(MessengerAuthSchema, c.body)
  if (!/^sim:(telegram|bale):\d+$/.test(v.initData)) return fail('UNAUTHENTICATED', 'اعتبار داده‌های مینی‌اپ تأیید نشد.')
  if (!c.srv.db.customer) c.srv.createCustomer('09120000000', v.platform === 'telegram' ? 'کاربر تلگرام' : 'کاربر بله')
  const body: AuthResult = { me: c.srv.meDto()!, token: c.srv.db.token }
  return ok(body)
})
route('POST', '/auth/logout', (c) => {
  c.srv.db.customer = undefined
  c.srv.db.token = undefined
  c.srv.save()
  return noContent()
})

route('GET', '/me', (c) => {
  needAuth(c)
  return ok(c.srv.meDto())
})
route('PATCH', '/me', (c) => {
  const me = needAuth(c)
  const name = typeof c.body?.name === 'string' ? c.body.name.trim() : ''
  if (name.length < 2) return fail('VALIDATION', 'نام وارد‌شده کوتاه است.')
  me.name = name
  c.srv.save()
  return ok(c.srv.meDto())
})
route('POST', '/me/kyc', (c) => {
  const me = needAuth(c)
  const v = parse(KycSchema, c.body)
  if (!isValidNationalId(v.nationalId)) return fail('VALIDATION', 'کد ملی معتبر نیست.', { field: 'nationalId' })
  me.nationalId = v.nationalId
  me.name = v.fullName
  me.kycStatus = 'pending'
  c.srv.schedulePublic({ at: c.srv.delayPublic(6000), do: 'kyc_ok' })
  c.srv.save()
  return ok(c.srv.meDto())
})

// ───────────── orders ─────────────
route('POST', '/orders', (c) => {
  const me = needAuth(c)
  const v = parse(OrderCreateSchema, c.body)
  const idem = c.headers.get('idempotency-key') ?? undefined
  if (idem) {
    const prev = Object.values(c.srv.db.orders).find((o) => o.idemKey === idem)
    if (prev) return ok(c.srv.orderDto(prev), 200)
  }
  const q = c.srv.db.quotes[v.quoteId]
  if (!q) return fail('NOT_FOUND', 'قیمت یافت نشد؛ قیمت جدید دریافت کنید.')
  const now = c.srv.now()
  if (now >= q.lockedUntil) return fail('QUOTE_EXPIRED')
  const f = c.srv.db.flags
  if (f.killSwitch) return fail('KILL_SWITCH')
  const m = q.perMethod.find((x) => x.method === v.method)
  if (!m || !m.available) return fail('PAYMENT_METHOD_UNAVAILABLE', m?.unavailableReasonFa)
  const limits = c.srv.limitsFor(me.tier)
  if (q.amountUsdCents > limits.maxOrderUsdCents) return fail('LIMIT_EXCEEDED', 'مبلغ این سفارش از سقف حساب شما بیشتر است. برای افزایش سقف، احراز هویت را کامل کنید.', { maxOrderUsdCents: limits.maxOrderUsdCents })
  if (limits.usedTodayUsdCents + q.amountUsdCents > limits.maxDailyUsdCents) return fail('LIMIT_EXCEEDED', 'سقف خرید روزانه‌ی شما پر شده است.', { maxDailyUsdCents: limits.maxDailyUsdCents })
  if (v.method === 'wallet' && me.walletIrt < (m.totalIrt ?? 0)) return fail('INSUFFICIENT_FUNDS', 'موجودی کیف پول کافی نیست؛ ابتدا کیف پول را شارژ کنید.')
  const o = c.srv.createOrder(q, v.method, v.network, v.inputs, idem)
  return ok(c.srv.orderDto(o), 201)
})

route('GET', '/orders', (c) => {
  needAuth(c)
  const list = Object.values(c.srv.db.orders).sort((a, b) => b.createdAt - a.createdAt)
  return ok(list.map((o) => c.srv.orderDto(o)))
})
route('GET', '/orders/:id', (c) => ok(c.srv.orderDto(ownOrder(c))))

route('GET', '/orders/:id/stream', (c) => {
  const o = ownOrder(c)
  return {
    status: 200,
    stream: (push) => {
      const send = () => push('order.updated', c.srv.orderDto(o), String(c.srv.now()))
      send()
      const unsub = c.srv.subscribe(o.id, send)
      const hb = setInterval(() => push('heartbeat', {}), 15_000)
      return () => {
        unsub()
        clearInterval(hb)
      }
    },
  }
})

route('POST', '/orders/:id/receipt', (c) => {
  const o = ownOrder(c)
  const r = parse(ReceiptSchema, c.body)
  if (o.method !== 'card_to_card') return fail('PAYMENT_METHOD_UNAVAILABLE')
  if (o.status !== 'awaiting_payment') return fail('ORDER_INVALID_TRANSITION')
  if (!r.trackingNo && !r.payerCardLast4 && !r.imageDataUrl) return fail('VALIDATION', 'حداقل یکی از موارد شماره‌ی پیگیری، چهار رقم آخر کارت یا تصویر رسید را وارد کنید.')
  o.status = 'payment_review'
  c.srv.addEvent(o, 'payment.receipt_submitted', 'رسید پرداخت ثبت شد؛ در حال بررسی', 'payment_review')
  // «0000» as last-4 simulates a rejected receipt (QA of the rejection path)
  c.srv.schedulePublic({ at: c.srv.delayPublic(6000), do: r.payerCardLast4 === '0000' ? 'review_reject' : 'review_ok', ref: o.id })
  c.srv.emitOrder(o.id)
  c.srv.save()
  return ok(c.srv.orderDto(o))
})

route('POST', '/orders/:id/cancel', (c) => {
  const o = ownOrder(c)
  if (!['awaiting_payment', 'payment_review'].includes(o.status)) return fail('ORDER_INVALID_TRANSITION')
  o.status = 'cancelled'
  c.srv.addEvent(o, 'customer.cancel', 'سفارش توسط شما لغو شد', 'cancelled')
  c.srv.emitOrder(o.id)
  c.srv.save()
  return ok(c.srv.orderDto(o))
})
route('POST', '/orders/:id/confirm', (c) => {
  const o = ownOrder(c)
  if (o.status !== 'delivered') return fail('ORDER_INVALID_TRANSITION')
  o.status = 'completed'
  o.completedAt = c.srv.now()
  c.srv.addEvent(o, 'customer.confirmed', 'دریافت سفارش را تأیید کردید', 'completed')
  c.srv.emitOrder(o.id)
  c.srv.save()
  return ok(c.srv.orderDto(o))
})
route('POST', '/orders/:id/dispute', (c) => {
  const o = ownOrder(c)
  const v = parse(DisputeSchema, c.body)
  if (!['delivered', 'completed'].includes(o.status)) return fail('ORDER_INVALID_TRANSITION')
  o.status = 'disputed'
  o.disputeReason = v.reasonFa
  c.srv.addEvent(o, 'customer.dispute', 'اعتراض شما ثبت شد', 'disputed')
  c.srv.emitOrder(o.id)
  c.srv.save()
  return ok(c.srv.orderDto(o))
})

route('POST', '/orders/:id/reveal', (c) => {
  const o = ownOrder(c)
  if (!o.secret || !['delivered', 'completed'].includes(o.status)) return fail('ORDER_INVALID_TRANSITION')
  if (typeof c.body?.code !== 'string' || c.body.code !== DEMO_OTP) return fail('VALIDATION', 'کد تأیید درست نیست یا منقضی شده است.', { field: 'code' })
  if (o.revealsLeft <= 0) return fail('RATE_LIMITED', 'سقف دفعات نمایش برای این سفارش تمام شده است. با پشتیبانی تماس بگیرید.')
  o.revealsLeft -= 1
  if (o.delivery) o.delivery.revealed = true
  c.srv.addEvent(o, 'delivery.revealed', 'اطلاعات تحویل نمایش داده شد')
  c.srv.save()
  c.srv.emitOrder(o.id)
  const s = o.secret
  return ok({
    kind: s.kind,
    card: s.kind === 'card' ? { pan: s.pan, expMonth: s.expMonth, expYear: s.expYear, cvv: s.cvv, holderName: s.holderName } : undefined,
    voucherCode: s.voucherCode,
    noteFa: s.noteFa,
    expiresAt: c.srv.now() + 30 * 60_000,
    remainingReveals: o.revealsLeft,
  })
})

route('GET', '/gateway/callback/:gatewayId', (c) => {
  const orderId = c.query.get('order') ?? ''
  const status = c.query.get('status') ?? 'OK'
  if (orderId.startsWith('topup:')) {
    if (status === 'OK') c.srv.schedulePublic({ at: c.srv.now(), do: 'topup_ok', ref: orderId })
    c.srv.tick()
    return ok({ orderId: null, redirect: '/wallet' })
  }
  const o = c.srv.db.orders[orderId]
  if (!o) return fail('NOT_FOUND')
  if (status === 'OK') c.srv.markPaid(o)
  else {
    c.srv.addEvent(o, 'payment.rejected', 'پرداخت در درگاه ناموفق بود')
    c.srv.emitOrder(o.id)
  }
  return ok({ orderId: o.id, redirect: `/orders/${o.id}` })
})

// ───────────── wallet / referral / tickets ─────────────
route('GET', '/wallet', (c) => {
  const me = needAuth(c)
  const body: WalletDto = { balanceIrt: me.walletIrt, transactions: c.srv.db.walletTx }
  return ok(body)
})
route('POST', '/wallet/topup', (c) => {
  needAuth(c)
  const v = parse(WalletTopupSchema, c.body)
  const pm = c.srv.params.paymentMethods
  if (v.amountIrt < 100_000) return fail('VALIDATION', 'حداقل مبلغ شارژ ۱۰۰٬۰۰۰ تومان است.')
  const id = c.srv.nextId('top')
  const expiresAt = c.srv.now() + 30 * 60_000
  const body: WalletTopupResult =
    v.method === 'gateway'
      ? { topupId: id, payment: { method: 'gateway', currency: 'IRT', amount: v.amountIrt, expiresAt, gateway: { payUrl: `/mock-gateway/topup:${v.amountIrt}` } } }
      : (() => {
          const card = pm.card_to_card.cards[0]!
          c.srv.schedulePublic({ at: c.srv.delayPublic(10_000), do: 'topup_ok', ref: `${id}:${v.amountIrt}` })
          return { topupId: id, payment: { method: 'card_to_card' as const, currency: 'IRT' as const, amount: v.amountIrt, expiresAt, cardToCard: { cardNumber: card.cardNumber, holderFa: card.holderFa, bankFa: card.bankFa, exactAmountIrt: v.amountIrt, receiptRequired: false } } }
        })()
  return ok(body, 201)
})

route('GET', '/referral', (c) => {
  const me = needAuth(c)
  const body: ReferralDto = {
    code: me.referralCode,
    link: `${typeof location !== 'undefined' ? location.origin : ''}/?ref=${me.referralCode}`,
    invited: 3,
    qualified: 1,
    rewardIrt: 50_000,
    rulesFa: 'هر دوست جدیدی که با کد شما ثبت‌نام و اولین خرید خود را کامل کند، برای هر دو نفر اعتبار کیف پول می‌آورد. هر نفر فقط یک‌بار و با هویت واقعی خودش شمرده می‌شود.',
  }
  return ok(body)
})

route('GET', '/tickets', (c) => {
  needAuth(c)
  return ok([...c.srv.db.tickets].sort((a, b) => b.updatedAt - a.updatedAt))
})
route('POST', '/tickets', (c) => {
  needAuth(c)
  const v = parse(TicketCreateSchema, c.body)
  const now = c.srv.now()
  const t = { id: c.srv.nextId('tkt'), subject: v.subject, status: 'open' as const, orderId: v.orderId, createdAt: now, updatedAt: now, messages: [{ at: now, from: 'customer' as const, text: v.message }] }
  c.srv.db.tickets.unshift(t)
  c.srv.schedulePublic({ at: c.srv.delayPublic(8000), do: 'ticket_reply', ref: t.id })
  c.srv.save()
  return ok(t, 201)
})
route('POST', '/tickets/:id/messages', (c) => {
  needAuth(c)
  const v = parse(TicketMessageSchema, c.body)
  const t = c.srv.db.tickets.find((x) => x.id === c.params.id)
  if (!t) return fail('NOT_FOUND')
  t.messages.push({ at: c.srv.now(), from: 'customer', text: v.message })
  t.status = 'open'
  t.updatedAt = c.srv.now()
  c.srv.save()
  return ok(t)
})

export type { MockResult }
