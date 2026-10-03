import { describe, expect, it } from 'vitest'
import { AppError, TERMINAL_ORDER_STATUSES, type OrderStatus, type PaymentMethod } from '@hiclaude/contracts'
import { ORDER_EVENT_TYPES, ORDER_STATUSES, allowedEvents, isTerminalStatus, possibleTargets, renderStateMachine, transition, type OrderEventInput, type OrderEventType, type OrderLike, type TransitionContext } from './machine'

const NOW = 1_800_000_000_000
const ctx = (p: Partial<TransitionContext> = {}): TransitionContext => ({ now: NOW, ...p })
const order = (status: OrderStatus, p: Partial<OrderLike> = {}): OrderLike => ({ status, method: 'gateway', rushTier: 'normal', attempts: 0, ...p })
const ev = (type: OrderEventType): OrderEventInput => (type === 'dispute_resolved' ? { type, outcome: 'refund' } : ({ type } as OrderEventInput))
const eff = (r: ReturnType<typeof transition>, type: string) => r.effects.filter((e) => e.type === type)

/** Expected table (status → event → possible targets) straight from architecture §6 (+ documented additions). */
const EXPECTED: Record<OrderStatus, Partial<Record<OrderEventType, OrderStatus[]>>> = {
  awaiting_payment: {
    payment_receipt_submitted: ['payment_review'], payment_detected: ['payment_review'], payment_confirmed: ['paid'],
    pay_window_elapsed: ['expired'], customer_cancel: ['cancelled'], operator_cancel: ['cancelled'],
  },
  payment_review: { payment_confirmed: ['paid'], payment_rejected: ['awaiting_payment', 'cancelled'], customer_cancel: ['cancelled'], operator_cancel: ['cancelled'] },
  paid: { risk_flagged: ['risk_hold'], auto_queue: ['queued'] },
  risk_hold: { risk_cleared: ['queued'], risk_rejected: ['refund_pending'] },
  queued: { fulfilment_started: ['fulfilling', 'queued'] },
  fulfilling: { fulfilment_completed: ['delivered'], fulfilment_retry: ['queued', 'failed'], fulfilment_failed: ['failed'] },
  delivered: { customer_confirmed: ['completed'], auto_complete_elapsed: ['completed'], customer_dispute: ['disputed'] },
  disputed: { dispute_resolved: ['refund_pending', 'completed'] },
  failed: { fulfilment_retry: ['queued'], operator_cancel: ['refund_pending'] },
  refund_pending: { refund_paid: ['refunded'] },
  expired: { payment_confirmed: ['paid'] },
  completed: {}, cancelled: {}, refunded: {},
}

describe('order state machine — exhaustive table', () => {
  it('covers 14 statuses × 20 events', () => {
    expect(ORDER_STATUSES.length).toBe(14)
    expect(ORDER_EVENT_TYPES.length).toBe(20)
  })

  for (const s of ORDER_STATUSES) {
    for (const e of ORDER_EVENT_TYPES) {
      const targets = EXPECTED[s][e]
      it(`${s} × ${e} → ${targets ? targets.join('|') : 'throws ORDER_INVALID_TRANSITION'}`, () => {
        const c = ctx({ latePaymentAccepted: true })
        if (!targets) {
          try {
            transition(order(s), ev(e), c)
            expect.unreachable()
          } catch (err) {
            expect(err).toBeInstanceOf(AppError)
            expect((err as AppError).code).toBe('ORDER_INVALID_TRANSITION')
            expect((err as AppError).details).toEqual({ from: s, event: e })
          }
          expect(possibleTargets(s, e)).toEqual([])
          expect(allowedEvents(s)).not.toContain(e)
        } else {
          const r = transition(order(s), ev(e), c)
          expect(targets).toContain(r.to)
          expect(r.from).toBe(s)
          expect(r.event).toBe(e)
          expect(possibleTargets(s, e)).toEqual(targets)
          expect(allowedEvents(s)).toContain(e)
        }
      })
    }
  }

  it('terminal statuses match the contract and accept nothing', () => {
    for (const s of ORDER_STATUSES) expect(isTerminalStatus(s)).toBe(TERMINAL_ORDER_STATUSES.includes(s))
    for (const s of TERMINAL_ORDER_STATUSES) expect(allowedEvents(s)).toEqual(s === 'expired' ? ['payment_confirmed'] : [])
  })
})

describe('order state machine — semantics & effects', () => {
  it('payment_confirmed posts the right ledger template per method and asks for a risk check', () => {
    const tpl: Record<PaymentMethod, string> = { gateway: 'E1', card_to_card: 'E2', bank_transfer: 'E2', usdt: 'E3', wallet: 'E4' }
    for (const [m, t] of Object.entries(tpl)) {
      for (const from of ['awaiting_payment', 'payment_review'] as const) {
        const r = transition(order(from, { method: m as PaymentMethod }), { type: 'payment_confirmed' }, ctx())
        expect(r.to).toBe('paid')
        expect(eff(r, 'post_ledger')).toEqual([{ type: 'post_ledger', template: t }])
        expect(eff(r, 'run_risk_check').length).toBe(1)
        expect(eff(r, 'stamp')).toEqual([{ type: 'stamp', field: 'paidAt', at: NOW }])
        expect(r.effects).toContainEqual({ type: 'notify', template: 'payment_confirmed' })
      }
    }
  })

  it('payment_rejected: back to awaiting_payment while attempts < max, else cancelled', () => {
    const a = transition(order('payment_review'), { type: 'payment_rejected' }, ctx({ paymentAttempts: 0, maxPaymentAttempts: 3 }))
    expect(a.to).toBe('awaiting_payment')
    expect(a.effects).toContainEqual({ type: 'schedule_timer', timer: 'pay_window', at: NOW + 20 * 60_000 })
    const b = transition(order('payment_review'), { type: 'payment_rejected' }, ctx({ paymentAttempts: 1, maxPaymentAttempts: 3 }))
    expect(b.to).toBe('awaiting_payment')
    const c = transition(order('payment_review'), { type: 'payment_rejected' }, ctx({ paymentAttempts: 2, maxPaymentAttempts: 3 }))
    expect(c.to).toBe('cancelled')
    expect(eff(c, 'release_payment_intent').length).toBe(1)
  })

  it('auto_queue / risk_cleared create tasks for the rush tier and schedule the SLA timer', () => {
    for (const [from, e] of [['paid', 'auto_queue'], ['risk_hold', 'risk_cleared']] as const) {
      const r = transition(order(from, { rushTier: 'express' }), { type: e }, ctx({ slaMinutes: 10 }))
      expect(r.to).toBe('queued')
      expect(r.effects).toContainEqual({ type: 'create_tasks', rushTier: 'express' })
      expect(r.effects).toContainEqual({ type: 'schedule_timer', timer: 'sla_due', at: NOW + 600_000 })
    }
    expect(eff(transition(order('paid'), { type: 'auto_queue' }, ctx()), 'schedule_timer').length).toBe(0)
  })

  it('risk_rejected → refund_pending with E12 and a refund start', () => {
    const r = transition(order('risk_hold'), { type: 'risk_rejected' }, ctx())
    expect(r.to).toBe('refund_pending')
    expect(r.effects).toContainEqual({ type: 'post_ledger', template: 'E12' })
    expect(r.effects).toContainEqual({ type: 'start_refund', reason: 'risk_rejected' })
  })

  it('fulfilment_started: requires funding, else stays queued with waiting_funding', () => {
    const ok = transition(order('queued'), { type: 'fulfilment_started' }, ctx({ fundingAvailable: true }))
    expect(ok.to).toBe('fulfilling')
    expect(ok.changed).toBe(true)
    expect(ok.effects).toContainEqual({ type: 'increment_attempts' })
    expect(ok.effects).toContainEqual({ type: 'set_waiting_funding', value: false })
    const wait = transition(order('queued'), { type: 'fulfilment_started' }, ctx({ fundingAvailable: false }))
    expect(wait.to).toBe('queued')
    expect(wait.changed).toBe(false)
    expect(wait.effects).toContainEqual({ type: 'set_waiting_funding', value: true })
    expect(eff(wait, 'increment_attempts').length).toBe(0)
  })

  it('fulfilment_completed: stores delivery, posts E5, stamps, schedules auto-complete', () => {
    const r = transition(order('fulfilling'), { type: 'fulfilment_completed' }, ctx({ autoCompleteHours: 12 }))
    expect(r.to).toBe('delivered')
    expect(r.effects).toContainEqual({ type: 'post_ledger', template: 'E5' })
    expect(r.effects).toContainEqual({ type: 'store_delivery' })
    expect(r.effects).toContainEqual({ type: 'schedule_timer', timer: 'auto_complete', at: NOW + 12 * 3_600_000 })
    expect(r.effects).toContainEqual({ type: 'stamp', field: 'deliveredAt', at: NOW })
  })

  it('fulfilment_retry: back to queued below max attempts, failed (with auto-refund follow-up) at max', () => {
    const q = transition(order('fulfilling', { attempts: 1 }), { type: 'fulfilment_retry' }, ctx({ maxFulfilmentAttempts: 3 }))
    expect(q.to).toBe('queued')
    const f = transition(order('fulfilling', { attempts: 3 }), { type: 'fulfilment_retry' }, ctx({ maxFulfilmentAttempts: 3 }))
    expect(f.to).toBe('failed')
    expect(f.effects).toContainEqual({ type: 'follow_up', event: { type: 'operator_cancel', reason: 'auto_refund_on_failure' } })
  })

  it('fulfilment_failed: failed; follow-up refund only when the auto-refund policy is on', () => {
    const on = transition(order('fulfilling'), { type: 'fulfilment_failed', reason: 'x' }, ctx({ autoRefundOnFailure: true }))
    expect(eff(on, 'follow_up').length).toBe(1)
    const off = transition(order('fulfilling'), { type: 'fulfilment_failed' }, ctx({ autoRefundOnFailure: false }))
    expect(off.to).toBe('failed')
    expect(eff(off, 'follow_up').length).toBe(0)
    expect(off.effects).toContainEqual({ type: 'alert', code: 'fulfilment_failed', severity: 'critical' })
  })

  it('failed → queued (operator re-route resets attempts) or → refund_pending (E12)', () => {
    const q = transition(order('failed', { attempts: 3 }), { type: 'fulfilment_retry' }, ctx())
    expect(q.to).toBe('queued')
    expect(q.effects).toContainEqual({ type: 'reset_attempts' })
    const r = transition(order('failed'), { type: 'operator_cancel', reason: 'auto_refund_on_failure' }, ctx())
    expect(r.to).toBe('refund_pending')
    expect(r.effects).toContainEqual({ type: 'post_ledger', template: 'E12' })
  })

  it('delivered → completed / disputed; disputed → refund_pending (E12d, post-delivery) or completed', () => {
    expect(transition(order('delivered'), { type: 'customer_confirmed' }, ctx()).to).toBe('completed')
    expect(transition(order('delivered'), { type: 'auto_complete_elapsed' }, ctx()).effects).toContainEqual({ type: 'stamp', field: 'completedAt', at: NOW })
    const d = transition(order('delivered'), { type: 'customer_dispute', reason: 'bad' }, ctx())
    expect(d.to).toBe('disputed')
    expect(d.effects).toContainEqual({ type: 'cancel_timer', timer: 'auto_complete' })
    const refund = transition(order('disputed'), { type: 'dispute_resolved', outcome: 'refund' }, ctx())
    expect(refund.to).toBe('refund_pending')
    expect(refund.effects).toContainEqual({ type: 'post_ledger', template: 'E12d' })
    const reject = transition(order('disputed'), { type: 'dispute_resolved', outcome: 'reject' }, ctx())
    expect(reject.to).toBe('completed')
  })

  it('refund_paid → refunded posts the payout template', () => {
    const r = transition(order('refund_pending'), { type: 'refund_paid' }, ctx())
    expect(r.to).toBe('refunded')
    expect(r.effects).toContainEqual({ type: 'post_ledger', template: 'E12b' })
  })

  it('expired + payment_confirmed only with accepted late payment', () => {
    expect(() => transition(order('expired'), { type: 'payment_confirmed' }, ctx())).toThrowError(AppError)
    expect(() => transition(order('expired'), { type: 'payment_confirmed' }, ctx({ latePaymentAccepted: false }))).toThrowError(/ORDER_INVALID_TRANSITION|not allowed|rejected/)
    const r = transition(order('expired', { method: 'card_to_card' }), { type: 'payment_confirmed' }, ctx({ latePaymentAccepted: true }))
    expect(r.to).toBe('paid')
    expect(r.effects).toContainEqual({ type: 'post_ledger', template: 'E2' })
  })

  it('cancel events release the payment intent and notify', () => {
    for (const e of ['customer_cancel', 'operator_cancel'] as const) {
      const r = transition(order('awaiting_payment'), { type: e }, ctx())
      expect(r.to).toBe('cancelled')
      expect(eff(r, 'release_payment_intent').length).toBe(1)
    }
  })

  it('is pure: does not mutate the order or ctx and is deterministic', () => {
    const o = order('fulfilling', { attempts: 2 })
    const c = ctx({ maxFulfilmentAttempts: 3 })
    const snapO = structuredClone(o)
    const snapC = structuredClone(c)
    const a = transition(o, { type: 'fulfilment_retry' }, c)
    const b = transition(o, { type: 'fulfilment_retry' }, c)
    expect(a).toEqual(b)
    expect(o).toEqual(snapO)
    expect(c).toEqual(snapC)
  })

  it('every reachable path from awaiting_payment ends in a terminal status (random walks)', () => {
    let seed = 7
    const rnd = (n: number): number => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      return seed % n
    }
    for (let walk = 0; walk < 500; walk++) {
      let o = order('awaiting_payment')
      let steps = 0
      while (!isTerminalStatus(o.status) && steps < 60) {
        const evs = allowedEvents(o.status)
        const type = evs[rnd(evs.length)] as OrderEventType
        const r = transition(o, ev(type), ctx({ latePaymentAccepted: true, maxFulfilmentAttempts: 3, paymentAttempts: 0 }))
        o = { ...o, status: r.to, attempts: r.effects.some((e) => e.type === 'increment_attempts') ? o.attempts + 1 : o.attempts }
        steps++
      }
      expect(steps).toBeLessThan(60)
    }
  })

  it('renders mermaid and ascii diagrams from the same table', () => {
    const m = renderStateMachine('mermaid')
    expect(m.startsWith('stateDiagram-v2')).toBe(true)
    expect(m).toContain('awaiting_payment --> payment_review : payment_receipt_submitted')
    expect(m).toContain('payment_review --> cancelled : payment_rejected')
    expect(m).toContain('refunded --> [*]')
    const a = renderStateMachine('ascii')
    expect(a).toContain('fulfilling')
    expect(a.split('\n').length).toBeGreaterThan(30)
  })
})
