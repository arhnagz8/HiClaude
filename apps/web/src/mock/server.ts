/**
 * In-browser mock backend (VITE_MOCK=1): implements api-spec.md customer routes with fixtures, a simulated rate walk and a scripted order lifecycle.
 * `MockServer` is a plain class (no globals) so tests can create isolated instances with a controllable clock.
 */
import {
  createRng,
  defaultPlatformParams,
  formatDurationFa,
  type DeliverySummary,
  type MeDto,
  type Network,
  type OrderDto,
  type OrderEventDto,
  type OrderStatus,
  type PaymentInstructionsDto,
  type PaymentMethod,
  type PlatformParams,
  type Product,
  type QuoteDto,
  type RateBoardDto,
  type RateStatus,
  type Rng,
  type RushTierDto,
  type TicketDto,
  type PublicConfigDto,
} from '@hiclaude/contracts'
import { fa } from '../copy/fa'
import { allProducts } from './catalog'
import { makeQuote, type PricingEnv } from './pricing'
import type { WalletTxDto } from '../api/extra-types'

export interface MockOptions {
  now?: () => number
  /** artificial network latency per request (ms) */
  latencyMs?: number
  persist?: boolean
  seed?: number
  /** multiplies scripted order progression speed (2 = twice as fast) */
  speed?: number
  /** price-lock window (ms) */
  lockMs?: number
  storageKey?: string
}

export interface RevealSecret {
  kind: 'card' | 'voucher' | 'receipt' | 'note'
  pan?: string
  expMonth?: number
  expYear?: number
  cvv?: string
  holderName?: string
  voucherCode?: string
  noteFa?: string
}

export type ScriptAction = 'queue' | 'fulfil' | 'deliver' | 'review_ok' | 'review_reject' | 'usdt_detect' | 'usdt_conf' | 'bank_ok' | 'expire' | 'topup_ok' | 'kyc_ok' | 'ticket_reply'
export interface ScriptItem {
  at: number
  do: ScriptAction
  ref?: string
}

export interface StoredOrder {
  id: string
  code: string
  customerId: string
  productId: string
  productTitleFa: string
  quoteId: string
  method: PaymentMethod
  status: OrderStatus
  amountUsdCents: number
  rushTier: string
  currency: 'IRT' | 'USDT'
  payAmount: number
  createdAt: number
  payExpiresAt: number
  paidAt?: number
  deliveredAt?: number
  completedAt?: number
  slaDueAt?: number
  payment: PaymentInstructionsDto
  events: OrderEventDto[]
  delivery?: DeliverySummary
  secret?: RevealSecret
  revealsLeft: number
  usdtConfirmations: number
  txHash?: string
  inputs: Record<string, string>
  idemKey?: string
  disputeReason?: string
}

export interface StoredCustomer {
  id: string
  phone: string
  name?: string
  tier: MeDto['tier']
  kycStatus: MeDto['kycStatus']
  nationalId?: string
  walletIrt: number
  referralCode: string
  createdAt: number
}

export interface MockDb {
  customer?: StoredCustomer
  token?: string
  quotes: Record<string, QuoteDto & { inputs: Record<string, string> }>
  orders: Record<string, StoredOrder>
  tickets: TicketDto[]
  walletTx: WalletTxDto[]
  script: ScriptItem[]
  otpRequests: Record<string, number[]>
  revealCounts: Record<string, number>
  seq: number
  flags: { expressFull: boolean; killSwitch: boolean; rateStatus: RateStatus; banner?: { severity: 'info' | 'warning' | 'critical'; textFa: string }; demo: boolean }
}

const emptyDb = (): MockDb => ({ quotes: {}, orders: {}, tickets: [], walletTx: [], script: [], otpRequests: {}, revealCounts: {}, seq: 0, flags: { expressFull: false, killSwitch: false, rateStatus: 'ok', demo: true } })

export const DEMO_OTP = '12345'
const RATE_BASE = 257_800

export class MockServer {
  readonly params: PlatformParams = defaultPlatformParams()
  readonly products: Product[] = allProducts()
  db: MockDb = emptyDb()
  rng: Rng
  readonly opts: Required<Omit<MockOptions, 'now'>> & { now: () => number }
  /** Toman per USDT we sell at / buy at, plus history for the sparkline */
  rate = { ask: RATE_BASE, bid: RATE_BASE * 0.992, history: [] as number[], asOf: 0 }
  private lastRateTick = 0
  private listeners = new Map<string, Set<() => void>>()
  private globalListeners = new Set<() => void>()
  private storageKey: string

  constructor(options: MockOptions = {}) {
    this.opts = {
      now: options.now ?? (() => Date.now()),
      latencyMs: options.latencyMs ?? 120,
      persist: options.persist ?? false,
      seed: options.seed ?? 1405,
      speed: options.speed ?? 1,
      lockMs: options.lockMs ?? 5 * 60_000,
      storageKey: options.storageKey ?? 'hc.mock.db.v1',
    }
    this.storageKey = this.opts.storageKey
    this.rng = createRng(this.opts.seed)
    this.load()
    this.seedRateHistory()
    this.lastRateTick = this.now()
    this.rate.asOf = this.now()
  }

  now(): number {
    return this.opts.now()
  }

  // ───────────── persistence ─────────────
  private load(): void {
    if (!this.opts.persist) return
    try {
      const raw = window.localStorage.getItem(this.storageKey)
      if (raw) this.db = { ...emptyDb(), ...(JSON.parse(raw) as MockDb) }
    } catch {
      /* ignore */
    }
  }
  save(): void {
    if (!this.opts.persist) return
    try {
      window.localStorage.setItem(this.storageKey, JSON.stringify(this.db))
    } catch {
      /* ignore quota */
    }
  }
  reset(): void {
    this.db = emptyDb()
    this.save()
    this.notifyAll()
  }
  nextId(prefix: string): string {
    this.db.seq += 1
    return `${prefix}_${this.db.seq.toString(36).padStart(5, '0')}${this.rng.int(100, 999)}`
  }

  // ───────────── rate world ─────────────
  private seedRateHistory(): void {
    if (this.rate.history.length) return
    const r = this.rng.fork('rate-seed')
    let v = RATE_BASE * 0.985
    for (let i = 0; i < 48; i++) {
      v *= Math.exp(r.normal(0.0003, 0.0017))
      this.rate.history.push(Math.round(v))
    }
    this.rate.ask = Math.round(v)
    this.rate.bid = Math.round(v * 0.992)
  }

  /** Advance the simulated FX walk: one step per 4 real seconds so the board visibly moves in demos. */
  stepRate(): void {
    const t = this.now()
    const dt = t - this.lastRateTick
    if (dt < 4000) return
    this.lastRateTick = t
    const steps = Math.min(6, Math.floor(dt / 4000))
    const r = this.rng.fork('rate')
    for (let i = 0; i < steps; i++) {
      const next = this.rate.ask * Math.exp(r.normal(0.00005, 0.0017))
      this.rate.ask = Math.round(Math.min(RATE_BASE * 1.15, Math.max(RATE_BASE * 0.85, next)))
      this.rate.bid = Math.round(this.rate.ask * 0.992)
      this.rate.history.push(this.rate.ask)
      if (this.rate.history.length > 48) this.rate.history.shift()
    }
    this.rate.asOf = t
  }
  jumpRate(pct: number): void {
    this.rate.ask = Math.round(this.rate.ask * (1 + pct / 100))
    this.rate.bid = Math.round(this.rate.ask * 0.992)
    this.rate.history.push(this.rate.ask)
    if (this.rate.history.length > 48) this.rate.history.shift()
    this.rate.asOf = this.now()
    this.notifyAll()
  }

  rateBoard(): RateBoardDto {
    const h = this.rate.history
    const first = h[0] ?? this.rate.ask
    const status = this.db.flags.killSwitch ? 'killed' : this.db.flags.rateStatus
    return {
      usdSellIrt: Math.round(this.rate.ask * 1.012),
      usdtBuyIrt: this.rate.bid,
      usdtSellIrt: this.rate.ask,
      asOf: status === 'stale' ? this.now() - 25 * 60_000 : this.rate.asOf,
      status,
      change24hPct: ((this.rate.ask - first) / first) * 100,
      sparkline: [...h],
    }
  }

  // ───────────── config ─────────────
  rushTiers(): RushTierDto[] {
    return this.params.pricing.rushTiers.map((t) => ({
      id: t.id,
      labelFa: t.labelFa,
      slaMinutes: t.slaMinutes,
      available: t.enabled && !(t.id === 'express' && this.db.flags.expressFull),
      etaMinutes: t.slaMinutes,
    }))
  }

  paymentMethodsDto(): PublicConfigDto['paymentMethods'] {
    const pm = this.params.paymentMethods
    return [
      { method: 'gateway', enabled: pm.gateway.enabled, labelFa: 'درگاه پرداخت بانکی', noteFa: 'پرداخت آنلاین با کارت شتاب؛ تأیید آنی', minIrt: pm.gateway.minIrt, maxIrt: pm.gateway.maxIrt },
      { method: 'card_to_card', enabled: pm.card_to_card.enabled, labelFa: 'کارت به کارت', noteFa: 'واریز به کارت مقصد و ثبت رسید؛ تأیید پس از بررسی', minIrt: pm.card_to_card.minIrt, maxIrt: pm.card_to_card.maxOrderIrt },
      { method: 'bank_transfer', enabled: pm.bank_transfer.enabled, labelFa: 'انتقال بانکی (پایا/ساتنا)', noteFa: 'مناسب مبلغ‌های بالا؛ تأیید در ساعت کاری بانک', minIrt: pm.bank_transfer.minIrt, maxIrt: pm.bank_transfer.maxIrt },
      { method: 'usdt', enabled: pm.usdt.enabled, labelFa: 'پرداخت با تتر (USDT)', noteFa: 'قیمت کمتر؛ بدون نیاز به تبدیل به تومان' },
      { method: 'wallet', enabled: pm.wallet.enabled, labelFa: 'کیف پول', noteFa: 'برداشت از موجودی تومانی حساب شما' },
    ]
  }

  publicConfig(): PublicConfigDto {
    this.stepRate()
    const f = this.db.flags
    return {
      brand: this.params.brand,
      now: this.now(),
      rateBoard: this.rateBoard(),
      paymentMethods: this.paymentMethodsDto(),
      rushTiers: this.rushTiers(),
      banner: f.banner,
      killSwitch: f.killSwitch,
      legal: { termsUrl: '/legal/terms', privacyUrl: '/legal/privacy', refundUrl: '/legal/refund', riskUrl: '/legal/risk' },
      demo: f.demo,
    }
  }

  pricingEnv(): PricingEnv {
    const f = this.db.flags
    return {
      ask: this.rate.ask,
      bid: this.rate.bid,
      now: this.now(),
      lockMs: this.opts.lockMs,
      rushTiers: this.rushTiers(),
      methods: this.paymentMethodsDto().map((m) => ({ method: m.method, enabled: m.enabled, minIrt: m.minIrt, maxIrt: m.maxIrt })),
      killed: f.killSwitch || f.rateStatus === 'killed',
      stale: f.rateStatus === 'stale',
    }
  }

  quote(product: Product, amountUsdCents: number, rushTier: string, inputs: Record<string, string>): QuoteDto {
    const id = this.nextId('quo')
    const q = makeQuote(id, product, amountUsdCents, rushTier, this.pricingEnv())
    this.db.quotes[id] = { ...q, inputs }
    this.save()
    return q
  }

  // ───────────── customer / limits ─────────────
  limitsFor(tier: MeDto['tier']): MeDto['limits'] {
    const l = this.params.risk.tiers[tier]
    const dayStart = this.now() - 24 * 3_600_000
    const used = Object.values(this.db.orders)
      .filter((o) => o.createdAt >= dayStart && !['expired', 'cancelled', 'refunded'].includes(o.status))
      .reduce((s, o) => s + o.amountUsdCents, 0)
    return { maxOrderUsdCents: l.maxOrderUsdCents, maxDailyUsdCents: l.maxDailyUsdCents, usedTodayUsdCents: used }
  }

  meDto(): MeDto | undefined {
    const c = this.db.customer
    if (!c) return undefined
    return { id: c.id, phone: c.phone, name: c.name, tier: c.tier, kycStatus: c.kycStatus, limits: this.limitsFor(c.tier), walletIrt: c.walletIrt, referralCode: c.referralCode }
  }

  createCustomer(phone: string, name?: string): StoredCustomer {
    const code = 'KT' + this.rng.int(10000, 99999).toString(36).toUpperCase()
    const c: StoredCustomer = { id: this.nextId('cus'), phone, name, tier: 'new', kycStatus: 'none', walletIrt: 0, referralCode: code, createdAt: this.now() }
    this.db.customer = c
    this.db.token = 'mock-token-' + this.rng.int(1e6, 9e6)
    this.save()
    return c
  }

  // ───────────── events (SSE bus) ─────────────
  subscribe(orderId: string, cb: () => void): () => void {
    if (!this.listeners.has(orderId)) this.listeners.set(orderId, new Set())
    this.listeners.get(orderId)!.add(cb)
    return () => void this.listeners.get(orderId)?.delete(cb)
  }
  subscribeAll(cb: () => void): () => void {
    this.globalListeners.add(cb)
    return () => void this.globalListeners.delete(cb)
  }
  private emit(orderId: string): void {
    this.listeners.get(orderId)?.forEach((cb) => cb())
    this.globalListeners.forEach((cb) => cb())
  }
  notifyAll(): void {
    this.listeners.forEach((s) => s.forEach((cb) => cb()))
    this.globalListeners.forEach((cb) => cb())
  }

  // ───────────── order engine ─────────────
  private ev(o: StoredOrder, type: string, labelFa: string, to?: OrderStatus): void {
    o.events.push({ at: this.now(), type, labelFa, to })
  }
  private schedule(item: ScriptItem): void {
    this.db.script.push(item)
  }
  private delay(ms: number): number {
    return this.now() + Math.round(ms / this.opts.speed)
  }

  private newCardPan(): string {
    const r = this.rng
    let s = '4' + String(r.int(10, 99))
    while (s.length < 16) s += String(r.int(0, 9))
    return s
  }

  private paymentFor(o: Omit<StoredOrder, 'payment'>, network?: string): PaymentInstructionsDto {
    const pm = this.params.paymentMethods
    switch (o.method) {
      case 'gateway':
        return { method: 'gateway', currency: 'IRT', amount: o.payAmount, expiresAt: o.payExpiresAt, gateway: { payUrl: `/mock-gateway/${o.id}` } }
      case 'card_to_card': {
        const card = pm.card_to_card.cards[this.rng.int(0, pm.card_to_card.cards.length - 1)]!
        const exact = o.payAmount + this.rng.int(1, pm.card_to_card.uniqueOffsetMaxIrt)
        return { method: 'card_to_card', currency: 'IRT', amount: exact, expiresAt: o.payExpiresAt, cardToCard: { cardNumber: card.cardNumber, holderFa: card.holderFa, bankFa: card.bankFa, exactAmountIrt: exact, receiptRequired: pm.card_to_card.receiptRequired } }
      }
      case 'bank_transfer':
        return { method: 'bank_transfer', currency: 'IRT', amount: o.payAmount, expiresAt: o.payExpiresAt, bankTransfer: { ibanFa: pm.bank_transfer.ibanFa, holderFa: pm.bank_transfer.holderFa, exactAmountIrt: o.payAmount, referenceCode: 'KT' + o.code.slice(-6) } }
      case 'usdt': {
        const net = (network ?? 'TRC20') as Network
        const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
        const rnd = (n: number, set: string): string => Array.from({ length: n }, () => set[this.rng.int(0, set.length - 1)]).join('')
        const address = net === 'TRC20' ? 'T' + rnd(33, alphabet) : net === 'TON' ? 'UQ' + rnd(46, alphabet + '_-') : '0x' + rnd(40, '0123456789abcdef')
        return {
          method: 'usdt',
          currency: 'USDT',
          amount: o.payAmount,
          expiresAt: o.payExpiresAt,
          usdt: { network: net, address, memo: net === 'TON' ? String(this.rng.int(100000, 999999)) : undefined, amountMicroUsdt: o.payAmount, confirmationsRequired: pm.usdt.confirmations[net] ?? 20 },
        }
      }
      case 'wallet':
        return { method: 'wallet', currency: 'IRT', amount: o.payAmount, expiresAt: o.payExpiresAt, wallet: { balanceIrt: this.db.customer?.walletIrt ?? 0 } }
    }
  }

  createOrder(q: QuoteDto & { inputs: Record<string, string> }, method: PaymentMethod, network: string | undefined, inputs: Record<string, string>, idemKey?: string): StoredOrder {
    const p = this.products.find((x) => x.id === q.productId)!
    const m = q.perMethod.find((x) => x.method === method)!
    const now = this.now()
    const windows = { gateway: 20, card_to_card: 45, bank_transfer: 240, usdt: 60, wallet: 5 } as const
    const id = this.nextId('ord')
    const code = 'KT-' + Array.from({ length: 6 }, () => '23456789ABCDEFGHJKMNPQRSTUVWXYZ'[this.rng.int(0, 30)]).join('')
    const base = {
      id,
      code,
      customerId: this.db.customer!.id,
      productId: p.id,
      productTitleFa: p.titleFa,
      quoteId: q.id,
      method,
      status: 'awaiting_payment' as OrderStatus,
      amountUsdCents: q.amountUsdCents,
      rushTier: q.rushTier,
      currency: m.currency,
      payAmount: (m.currency === 'USDT' ? m.totalMicroUsdt : m.totalIrt) as number,
      createdAt: now,
      payExpiresAt: now + windows[method] * 60_000,
      events: [] as OrderEventDto[],
      revealsLeft: 3,
      usdtConfirmations: 0,
      inputs: { ...q.inputs, ...inputs },
      idemKey,
    }
    const o: StoredOrder = { ...base, payment: this.paymentFor(base, network) }
    if (method === 'card_to_card' || method === 'usdt') o.payAmount = o.payment.amount
    this.ev(o, 'order.created', 'سفارش ثبت شد', 'awaiting_payment')
    this.db.orders[id] = o
    if (method === 'wallet') this.markPaid(o)
    else {
      this.schedule({ at: o.payExpiresAt, do: 'expire', ref: id })
      if (method === 'bank_transfer') this.schedule({ at: this.delay(25_000), do: 'bank_ok', ref: id })
      if (method === 'usdt') this.schedule({ at: this.delay(12_000), do: 'usdt_detect', ref: id })
    }
    this.save()
    return o
  }

  markPaid(o: StoredOrder): void {
    if (!['awaiting_payment', 'payment_review'].includes(o.status)) return
    const now = this.now()
    o.status = 'paid'
    o.paidAt = now
    if (o.method === 'wallet' && this.db.customer) {
      this.db.customer.walletIrt -= o.payAmount
      this.db.walletTx.unshift({ id: this.nextId('wtx'), at: now, kind: 'spend', amountIrt: -o.payAmount, balanceAfterIrt: this.db.customer.walletIrt, labelFa: `خرید: ${o.productTitleFa}`, orderId: o.id })
    }
    const p = this.products.find((x) => x.id === o.productId)!
    o.slaDueAt = now + (p.slaMinutes[o.rushTier] ?? 120) * 60_000
    this.ev(o, 'payment.confirmed', 'پرداخت تأیید شد', 'paid')
    this.schedule({ at: this.delay(1500), do: 'queue', ref: o.id })
    this.emit(o.id)
    this.save()
  }

  private deliver(o: StoredOrder): void {
    const p = this.products.find((x) => x.id === o.productId)!
    const now = this.now()
    o.status = 'delivered'
    o.deliveredAt = now
    if (p.kind === 'virtual_card_issue' || p.kind === 'card_topup') {
      const pan = this.newCardPan()
      o.secret = { kind: 'card', pan, expMonth: this.rng.int(1, 12), expYear: 2029, cvv: String(this.rng.int(100, 999)), holderName: 'KARTINO DEMO' }
      o.delivery = { kind: 'card', last4: pan.slice(-4), brand: 'visa', balanceUsdCents: o.amountUsdCents, vendorRef: 'V-' + o.code.slice(-4), revealed: false }
    } else if (p.kind === 'voucher') {
      const code = Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[this.rng.int(0, 31)]).join('')).join('-')
      o.secret = { kind: 'voucher', voucherCode: code }
      o.delivery = { kind: 'voucher', balanceUsdCents: o.amountUsdCents, vendorRef: 'G-' + o.code.slice(-4), revealed: false }
    } else {
      o.secret = { kind: 'receipt', noteFa: 'پرداخت از طرف شما انجام شد. شناسه‌ی پیگیری: RCPT-' + o.code.slice(-6) }
      o.delivery = { kind: 'receipt', noteFa: 'پرداخت انجام شد؛ رسید در دسترس است.', vendorRef: 'RCPT-' + o.code.slice(-6), revealed: false }
    }
    this.ev(o, 'fulfilment.completed', 'سفارش تحویل داده شد', 'delivered')
  }

  /** Runs due scripted steps; call every ~1 s (installMock does) or from tests after advancing the clock. */
  tick(): void {
    this.stepRate()
    const now = this.now()
    const due = this.db.script.filter((s) => s.at <= now).sort((a, b) => a.at - b.at)
    if (!due.length) return
    this.db.script = this.db.script.filter((s) => s.at > now)
    for (const s of due) this.run(s)
    this.save()
  }

  private run(s: ScriptItem): void {
    const o = s.ref ? this.db.orders[s.ref] : undefined
    switch (s.do) {
      case 'queue':
        if (o?.status === 'paid') {
          o.status = 'queued'
          this.ev(o, 'fulfilment.queued', 'سفارش در صف انجام قرار گرفت', 'queued')
          this.schedule({ at: this.delay(3500), do: 'fulfil', ref: o.id })
          this.emit(o.id)
        }
        break
      case 'fulfil':
        if (o?.status === 'queued') {
          o.status = 'fulfilling'
          this.ev(o, 'fulfilment.started', 'انجام سفارش شروع شد', 'fulfilling')
          this.schedule({ at: this.delay(7000), do: 'deliver', ref: o.id })
          this.emit(o.id)
        }
        break
      case 'deliver':
        if (o?.status === 'fulfilling') {
          this.deliver(o)
          this.emit(o.id)
        }
        break
      case 'review_ok':
        if (o?.status === 'payment_review') this.markPaid(o)
        break
      case 'review_reject':
        if (o?.status === 'payment_review') {
          o.status = 'awaiting_payment'
          this.ev(o, 'payment.rejected', 'رسید پرداخت تأیید نشد؛ لطفاً رسید صحیح را دوباره ثبت کنید', 'awaiting_payment')
          this.emit(o.id)
        }
        break
      case 'usdt_detect':
        if (o && o.status === 'awaiting_payment') {
          o.status = 'payment_review'
          o.txHash = Array.from({ length: 64 }, () => '0123456789abcdef'[this.rng.int(0, 15)]).join('')
          o.usdtConfirmations = 1
          this.ev(o, 'payment.detected', 'تراکنش در شبکه دیده شد؛ منتظر تأییدهای بلاک', 'payment_review')
          this.schedule({ at: this.delay(2000), do: 'usdt_conf', ref: o.id })
          this.emit(o.id)
        }
        break
      case 'usdt_conf':
        if (o?.status === 'payment_review') {
          const need = o.payment.usdt?.confirmationsRequired ?? 20
          o.usdtConfirmations = Math.min(need, o.usdtConfirmations + Math.max(2, Math.ceil(need / 6)))
          if (o.usdtConfirmations >= need) this.markPaid(o)
          else {
            this.schedule({ at: this.delay(1800), do: 'usdt_conf', ref: o.id })
            this.emit(o.id)
          }
        }
        break
      case 'bank_ok':
        if (o?.status === 'awaiting_payment' && o.method === 'bank_transfer') this.markPaid(o)
        break
      case 'expire':
        if (o && o.status === 'awaiting_payment') {
          o.status = 'expired'
          this.ev(o, 'timer.pay_window', 'مهلت پرداخت تمام شد', 'expired')
          this.emit(o.id)
        }
        break
      case 'topup_ok': {
        const amount = Number(s.ref?.split(':')[1] ?? 0)
        if (this.db.customer && amount > 0) {
          this.db.customer.walletIrt += amount
          this.db.walletTx.unshift({ id: this.nextId('wtx'), at: this.now(), kind: 'topup', amountIrt: amount, balanceAfterIrt: this.db.customer.walletIrt, labelFa: 'شارژ کیف پول' })
          this.notifyAll()
        }
        break
      }
      case 'kyc_ok':
        if (this.db.customer && this.db.customer.kycStatus === 'pending') {
          this.db.customer.kycStatus = 'verified'
          this.db.customer.tier = 'verified'
          this.notifyAll()
        }
        break
      case 'ticket_reply': {
        const t = this.db.tickets.find((x) => x.id === s.ref)
        if (t && t.status !== 'closed') {
          t.messages.push({ at: this.now(), from: 'staff', text: 'سلام؛ پیام شما دریافت شد و در حال بررسی است. نتیجه را همین‌جا اطلاع می‌دهیم.' })
          t.status = 'pending'
          t.updatedAt = this.now()
        }
        break
      }
    }
  }

  schedulePublic(item: ScriptItem): void {
    this.schedule(item)
  }
  delayPublic(ms: number): number {
    return this.delay(ms)
  }
  emitOrder(id: string): void {
    this.emit(id)
  }
  addEvent(o: StoredOrder, type: string, labelFa: string, to?: OrderStatus): void {
    this.ev(o, type, labelFa, to)
  }

  // ───────────── DTO mapping ─────────────
  orderDto(o: StoredOrder): OrderDto {
    const now = this.now()
    const status = o.status
    const delivered = status === 'delivered' || status === 'completed'
    const canReveal = !!o.secret && delivered && o.revealsLeft > 0
    const wait = o.slaDueAt && ['paid', 'queued', 'fulfilling'].includes(status) ? Math.max(0, o.slaDueAt - now) : undefined
    const usdtExt = o.payment.usdt ? { ...o.payment.usdt, confirmations: o.usdtConfirmations, txHash: o.txHash } : undefined
    return {
      id: o.id,
      code: o.code,
      status,
      statusLabelFa: (fa.status.order as Record<string, string>)[status] ?? status,
      productId: o.productId,
      productTitleFa: o.productTitleFa,
      amountUsdCents: o.amountUsdCents,
      rushTier: o.rushTier,
      method: o.method,
      currency: o.currency,
      payAmount: o.payAmount,
      createdAt: o.createdAt,
      payExpiresAt: o.payExpiresAt,
      paidAt: o.paidAt,
      deliveredAt: o.deliveredAt,
      slaDueAt: o.slaDueAt,
      payment: status === 'awaiting_payment' || status === 'payment_review' ? { ...o.payment, ...(usdtExt ? { usdt: usdtExt } : {}) } : undefined,
      delivery: o.delivery ? { ...o.delivery } : undefined,
      timeline: o.events.map((e) => ({ ...e })),
      canCancel: status === 'awaiting_payment' || status === 'payment_review',
      canReveal,
      canConfirm: status === 'delivered',
      canDispute: (status === 'delivered' || status === 'completed') && !o.disputeReason,
      etaFa: wait !== undefined ? `تحویل حداکثر تا ${formatDurationFa(wait)} دیگر` : undefined,
    }
  }
}
