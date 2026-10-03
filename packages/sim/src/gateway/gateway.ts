/**
 * GatewaySim implements PaymentGatewayPort (Shaparak-style PSP such as Zarinpal).
 *  - create() issues an authority and a pay page; the CUSTOMER AGENT drives the page with simulateCustomerPayment(authority, outcome)
 *  - verify() is idempotent for paid payments; it errors on amount mismatch (VALIDATION), times out randomly (TIMEOUT), and a paid payment that
 *    is never verified within `unverifiedReversalHours` is reversed to the payer (verify then reports failed)
 *  - fee = min(feeCapIrt, ceil(amount x feePct)) + feeFixedIrt, deducted from the settlement
 *  - settlements: verified payments are batched and credited to BankSim at the first business-day `settlementHour` (IRST) at least `settlementDelayHours`
 *    after verification (T+n business days); blackouts postpone settlements until the blackout ends
 *  - downtime windows (random per month + injected blackout) make create/verify return UNAVAILABLE
 */
import {
  MS,
  err,
  ok,
  portError,
  startOfIrstDay,
  type EpochMs,
  type GatewayCreateRequest,
  type GatewayVerifyResult,
  type Irt,
  type PaymentGatewayPort,
  type PlatformParams,
  type Result,
  type Rng,
} from '@hiclaude/contracts'
import { BankSim } from '../bank/bank'
import { OutageCalendar } from '../core/outages'
import { newHandleId, pNum, pStr, type EventHandle, type Params, type SimComponent, type SimEnv } from '../core/types'
import { randomString } from '../core/util'

export interface GatewaySimConfig {
  id: string
  feePct: number
  feeCapIrt: Irt
  feeFixedIrt: Irt
  settlementDelayHours: number
  /** IRST hour on a business day at which settlement batches are paid out. */
  settlementHour: number
  minIrt: Irt
  maxIrt: Irt
  payWindowMinutes: number
  verifyTimeoutProb: number
  createFailProb: number
  unverifiedReversalHours: number
  outageProbPerMonth: number
}

export function gatewayConfigFromParams(p: PlatformParams): GatewaySimConfig {
  const g = p.paymentMethods.gateway
  return {
    id: g.gatewayId,
    feePct: g.feePct,
    feeCapIrt: g.feeCapIrt,
    feeFixedIrt: g.feeFixedIrt,
    settlementDelayHours: g.settlementDelayHours,
    settlementHour: 9,
    minIrt: g.minIrt,
    maxIrt: g.maxIrt,
    payWindowMinutes: g.payWindowMinutes,
    verifyTimeoutProb: 0.01,
    createFailProb: 0.003,
    unverifiedReversalHours: 1,
    outageProbPerMonth: 0.15,
  }
}

export type PayPageState = 'created' | 'paid' | 'failed' | 'abandoned' | 'expired' | 'reversed'
export type CustomerOutcome = 'success' | 'fail' | 'abandon'

export interface PayPage {
  authority: string
  orderId: string
  amountIrt: Irt
  description: string
  callbackUrl: string
  createdAt: EpochMs
  expiresAt: EpochMs
  state: PayPageState
  paidAt?: EpochMs
  payerCardMasked?: string
  refId?: string
  verifiedAt?: EpochMs
  feeIrt: Irt
}

export class GatewaySim implements PaymentGatewayPort, SimComponent {
  readonly name: string
  readonly id: string
  readonly cfg: GatewaySimConfig
  private readonly env: SimEnv
  private readonly rng: Rng
  private readonly bank: BankSim
  private readonly outages: OutageCalendar
  private pages = new Map<string, PayPage>()
  private order: PayPage[] = []
  private seq = 0
  private batches = new Map<number, { amount: Irt; count: number; timer: { cancel(): void } }>()
  private blackoutUntil = 0
  private f = { collected: 0, fees: 0, settled: 0, reversed: 0 }

  constructor(env: SimEnv, rng: Rng, bank: BankSim, originMs: EpochMs, cfg: GatewaySimConfig) {
    this.env = env
    this.rng = rng
    this.bank = bank
    this.cfg = { ...cfg }
    this.id = cfg.id
    this.name = `gateway:${cfg.id}`
    this.outages = new OutageCalendar(originMs, rng.fork('outages'), { probPerMonth: cfg.outageProbPerMonth, medianMs: 20 * MS.minute, sigma: 0.7, minMs: 3 * MS.minute, maxMs: 6 * MS.hour })
  }

  // ───────────────────────────── helpers ─────────────────────────────
  feeFor(amount: Irt): Irt {
    return Math.min(this.cfg.feeCapIrt, Math.ceil(amount * this.cfg.feePct)) + this.cfg.feeFixedIrt
  }
  isDown(t: EpochMs = this.env.clock.now()): boolean {
    return this.outages.isDown(t) || t < this.blackoutUntil
  }

  private refresh(p: PayPage, now: EpochMs): void {
    if (p.state === 'created' && now >= p.expiresAt) p.state = 'expired'
    if (p.state === 'paid' && !p.verifiedAt && p.paidAt !== undefined && now >= p.paidAt + this.cfg.unverifiedReversalHours * MS.hour) {
      p.state = 'reversed'
      this.f.reversed += p.amountIrt
      this.env.stats.inc(`gateway.${this.id}.reversed_unverified`)
      this.env.log.emit('gateway.reversed', this.name, { authority: p.authority, amount: p.amountIrt })
    }
  }

  // ───────────────────────────── port ─────────────────────────────
  async create(req: GatewayCreateRequest): Promise<Result<{ authority: string; payUrl: string }>> {
    const now = this.env.clock.now()
    if (this.isDown(now)) return err(portError('UNAVAILABLE', `${this.id} gateway down`, { retryAfterMs: 5 * MS.minute }))
    if (!Number.isSafeInteger(req.amountIrt) || req.amountIrt < this.cfg.minIrt || req.amountIrt > this.cfg.maxIrt)
      return err(portError('VALIDATION', `amount must be between ${this.cfg.minIrt} and ${this.cfg.maxIrt} Toman`, { retryable: false }))
    if (this.rng.bool(this.cfg.createFailProb)) return err(portError('UNAVAILABLE', 'gateway temporary error', { retryAfterMs: 30_000 }))
    this.seq += 1
    const authority = `A${String(this.seq).padStart(8, '0')}${randomString(this.rng, '0123456789', 27)}`
    const page: PayPage = {
      authority,
      orderId: req.orderId,
      amountIrt: req.amountIrt,
      description: req.description,
      callbackUrl: req.callbackUrl,
      createdAt: now,
      expiresAt: now + this.cfg.payWindowMinutes * MS.minute,
      state: 'created',
      feeIrt: this.feeFor(req.amountIrt),
    }
    this.pages.set(authority, page)
    this.order.push(page)
    this.env.stats.inc(`gateway.${this.id}.created`)
    return ok({ authority, payUrl: `https://pay.sim/${this.id}/${authority}` })
  }

  async verify(req: { authority: string; amountIrt: Irt }): Promise<Result<GatewayVerifyResult>> {
    const now = this.env.clock.now()
    if (this.isDown(now)) return err(portError('UNAVAILABLE', `${this.id} gateway down`, { retryAfterMs: 5 * MS.minute }))
    const p = this.pages.get(req.authority)
    if (!p) return err(portError('NOT_FOUND', 'unknown authority', { retryable: false }))
    if (req.amountIrt !== p.amountIrt) return err(portError('VALIDATION', `amount mismatch: session ${p.amountIrt}, verify ${req.amountIrt}`, { retryable: false }))
    if (this.rng.bool(this.cfg.verifyTimeoutProb)) {
      this.env.stats.inc(`gateway.${this.id}.verify_timeout`)
      return err(portError('TIMEOUT', 'verify timed out', { retryAfterMs: 10_000 }))
    }
    this.refresh(p, now)
    switch (p.state) {
      case 'created':
        return ok({ status: 'pending' })
      case 'paid': {
        if (!p.verifiedAt) {
          p.verifiedAt = now
          this.onVerified(p, now)
        }
        return ok({ status: 'paid', amountIrt: p.amountIrt, refId: p.refId, cardPanMasked: p.payerCardMasked, feeIrt: p.feeIrt, paidAt: p.paidAt })
      }
      default:
        return ok({ status: 'failed' })
    }
  }

  private onVerified(p: PayPage, now: EpochMs): void {
    this.f.collected += p.amountIrt
    this.f.fees += p.feeIrt
    // T+n: the first business-day settlement hour on or after the start of the day following (now + delay - 1 day)
    const dayAfter = startOfIrstDay(now + this.cfg.settlementDelayHours * MS.hour - MS.day) + MS.day
    const settleAt = this.bank.calendar.nextBusinessMoment(Math.max(dayAfter, this.blackoutUntil), this.cfg.settlementHour)
    const net = p.amountIrt - p.feeIrt
    let b = this.batches.get(settleAt)
    if (!b) {
      const timer = this.env.sim.at(settleAt, () => this.settleBatch(settleAt), { label: `gateway.${this.id}.settle`, priority: 25 })
      b = { amount: 0, count: 0, timer }
      this.batches.set(settleAt, b)
    }
    b.amount += net
    b.count += 1
    this.env.log.emit('gateway.verified', this.name, { authority: p.authority, amount: p.amountIrt, fee: p.feeIrt, settleAt })
  }

  private settleBatch(settleAt: number): void {
    const b = this.batches.get(settleAt)
    if (!b) return
    const now = this.env.clock.now()
    if (now < this.blackoutUntil) {
      // blackout: postpone to the next business moment after it ends
      this.batches.delete(settleAt)
      const next = this.bank.calendar.nextBusinessMoment(this.blackoutUntil, this.cfg.settlementHour)
      const existing = this.batches.get(next)
      if (existing) {
        existing.amount += b.amount
        existing.count += b.count
      } else {
        const timer = this.env.sim.at(next, () => this.settleBatch(next), { label: `gateway.${this.id}.settle`, priority: 25 })
        this.batches.set(next, { amount: b.amount, count: b.count, timer })
      }
      return
    }
    this.batches.delete(settleAt)
    this.bank.creditGatewaySettlement({ amountIrt: b.amount, at: now, gatewayId: this.id, batchRef: `${settleAt}` })
    this.f.settled += b.amount
    this.env.stats.inc(`gateway.${this.id}.settlements`)
    this.env.log.emit('gateway.settled', this.name, { amount: b.amount, count: b.count })
  }

  // ───────────────────────────── agent API ─────────────────────────────
  getPayPage(authority: string): PayPage | undefined {
    const p = this.pages.get(authority)
    if (!p) return undefined
    this.refresh(p, this.env.clock.now())
    return { ...p }
  }

  /**
   * The customer's action on the bank page. success: card charged (state paid, refId assigned); fail: bank declined/cancelled; abandon: nothing happens
   * (the page expires). A success after the pay window has closed is rejected ("page expired"). Returns the page state after the action.
   */
  simulateCustomerPayment(authority: string, outcome: CustomerOutcome, opts: { cardMasked?: string; delayMs?: number } = {}): Result<{ state: PayPageState; refId?: string }> {
    const p = this.pages.get(authority)
    if (!p) return err(portError('NOT_FOUND', 'unknown authority', { retryable: false }))
    const apply = (): Result<{ state: PayPageState; refId?: string }> => {
      const now = this.env.clock.now()
      this.refresh(p, now)
      if (p.state !== 'created') return err(portError('REJECTED', `pay page is ${p.state}`, { retryable: false }))
      if (this.isDown(now)) return err(portError('UNAVAILABLE', 'gateway down'))
      if (outcome === 'success') {
        p.state = 'paid'
        p.paidAt = now
        p.refId = String(100_000_000 + this.rng.int(0, 899_999_999))
        p.payerCardMasked = opts.cardMasked ?? `6037****${String(this.rng.int(0, 9999)).padStart(4, '0')}`
        this.env.stats.inc(`gateway.${this.id}.paid`)
      } else if (outcome === 'fail') {
        p.state = 'failed'
        this.env.stats.inc(`gateway.${this.id}.failed`)
      } else {
        p.state = 'abandoned'
      }
      this.env.log.emit('gateway.customer', this.name, { authority, outcome, amount: p.amountIrt })
      return ok({ state: p.state, refId: p.refId })
    }
    if (opts.delayMs && opts.delayMs > 0) {
      this.env.sim.after(opts.delayMs, () => void apply(), { label: `gateway.${this.id}.customer` })
      return ok({ state: p.state })
    }
    return apply()
  }

  /** Total gateway money flow figures for audits. */
  audit(): { collected: Irt; fees: Irt; settled: Irt; pendingSettlement: Irt; reversed: Irt; ok: boolean } {
    let pending = 0
    for (const b of this.batches.values()) pending += b.amount
    return { collected: this.f.collected, fees: this.f.fees, settled: this.f.settled, pendingSettlement: pending, reversed: this.f.reversed, ok: this.f.collected - this.f.fees === this.f.settled + pending }
  }

  pages_(): PayPage[] {
    return this.order.map((p) => ({ ...p }))
  }

  // ───────────────────────────── events ─────────────────────────────
  /** Gateway down for `days` (create/verify unavailable; settlements postponed until after it ends). */
  blackout(days: number): EventHandle {
    const now = this.env.clock.now()
    const until = now + days * MS.day
    const prev = this.blackoutUntil
    this.blackoutUntil = Math.max(this.blackoutUntil, until)
    this.env.log.emit('gateway.blackout', this.name, { until })
    return {
      id: newHandleId('gateway_blackout'),
      revert: () => {
        this.blackoutUntil = prev
      },
    }
  }

  applyEvent(type: string, params: Params): EventHandle | null {
    const target = pStr(params, 'gateway')
    if (target !== undefined && target !== this.id && target !== '*') return null
    switch (type) {
      case 'gateway_blackout':
        return this.blackout(pNum(params, 'days', pNum(params, 'durationDays', 7)))
      case 'gateway_outage': {
        const now = this.env.clock.now()
        const off = this.outages.inject(now, now + pNum(params, 'hours', 2) * MS.hour)
        return { id: newHandleId('gateway_outage'), revert: off }
      }
      case 'gateway_fee_change': {
        const prev = { pct: this.cfg.feePct, cap: this.cfg.feeCapIrt, fixed: this.cfg.feeFixedIrt }
        this.cfg.feePct = pNum(params, 'feePct', prev.pct)
        this.cfg.feeCapIrt = pNum(params, 'feeCapIrt', prev.cap)
        this.cfg.feeFixedIrt = pNum(params, 'feeFixedIrt', prev.fixed)
        return {
          id: newHandleId('gateway_fee'),
          revert: () => {
            this.cfg.feePct = prev.pct
            this.cfg.feeCapIrt = prev.cap
            this.cfg.feeFixedIrt = prev.fixed
          },
        }
      }
      case 'gateway_failure_rate': {
        const prev = { c: this.cfg.createFailProb, v: this.cfg.verifyTimeoutProb }
        this.cfg.createFailProb = pNum(params, 'createFailProb', prev.c)
        this.cfg.verifyTimeoutProb = pNum(params, 'verifyTimeoutProb', prev.v)
        return {
          id: newHandleId('gateway_fail'),
          revert: () => {
            this.cfg.createFailProb = prev.c
            this.cfg.verifyTimeoutProb = prev.v
          },
        }
      }
      default:
        return null
    }
  }
}
