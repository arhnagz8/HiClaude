/**
 * Order state machine — architecture §6 (normative). Pure: `transition(order, event, ctx)` returns the target status and a list of
 * DECLARATIVE effects; the app's OrderService executes them (ledger postings, task creation, notifications, timers).
 *
 * Statuses: awaiting_payment, payment_review, paid, risk_hold, queued, fulfilling, delivered, completed, expired, cancelled, failed,
 * refund_pending, refunded, disputed.  Terminal: completed, expired, cancelled, refunded.
 *
 * Additions to the §6 table (needed to make it executable; all documented in README):
 *  - `failed` is a decision state: `fulfilment_retry` (operator re-routes to another provider) → queued; `operator_cancel` → refund_pending.
 *    When `ctx.autoRefundOnFailure` the machine emits a `follow_up` effect with `operator_cancel` right after `fulfilment_failed`.
 *  - `expired` + `payment_confirmed` → paid ONLY when `ctx.latePaymentAccepted` (late-payment policy §9.4 decided by `payments.evaluateLatePayment`).
 *  - `queued` + `fulfilment_started` with `ctx.fundingAvailable === false` stays `queued` and flags `waiting_funding`.
 * Invalid transitions throw `AppError('ORDER_INVALID_TRANSITION', …, { from, event })`.
 */
import { AppError, TERMINAL_ORDER_STATUSES, type EpochMs, type OrderStatus, type PaymentMethod } from '@hiclaude/contracts'

export type OrderEventInput =
  | { type: 'payment_receipt_submitted'; paymentId?: string }
  | { type: 'payment_detected'; paymentId?: string }
  | { type: 'payment_confirmed'; paymentId?: string }
  | { type: 'payment_rejected'; reason?: string }
  | { type: 'pay_window_elapsed' }
  | { type: 'risk_flagged'; flags?: string[] }
  | { type: 'risk_cleared' }
  | { type: 'risk_rejected'; reason?: string }
  | { type: 'auto_queue' }
  | { type: 'fulfilment_started'; taskId?: string }
  | { type: 'fulfilment_completed'; taskId?: string }
  | { type: 'fulfilment_retry'; reason?: string }
  | { type: 'fulfilment_failed'; reason?: string }
  | { type: 'customer_confirmed' }
  | { type: 'auto_complete_elapsed' }
  | { type: 'customer_dispute'; reason?: string }
  | { type: 'dispute_resolved'; outcome: 'refund' | 'reject' }
  | { type: 'refund_paid' }
  | { type: 'customer_cancel' }
  | { type: 'operator_cancel'; reason?: string }

export type OrderEventType = OrderEventInput['type']

export const ORDER_EVENT_TYPES: readonly OrderEventType[] = [
  'payment_receipt_submitted', 'payment_detected', 'payment_confirmed', 'payment_rejected', 'pay_window_elapsed',
  'risk_flagged', 'risk_cleared', 'risk_rejected', 'auto_queue',
  'fulfilment_started', 'fulfilment_completed', 'fulfilment_retry', 'fulfilment_failed',
  'customer_confirmed', 'auto_complete_elapsed', 'customer_dispute', 'dispute_resolved', 'refund_paid',
  'customer_cancel', 'operator_cancel',
]

export const ORDER_STATUSES: readonly OrderStatus[] = [
  'awaiting_payment', 'payment_review', 'paid', 'risk_hold', 'queued', 'fulfilling', 'delivered', 'completed',
  'expired', 'cancelled', 'failed', 'refund_pending', 'refunded', 'disputed',
]

/** Minimal order view the machine needs. */
export interface OrderLike {
  status: OrderStatus
  method: PaymentMethod
  rushTier: string
  /** Fulfilment attempts started so far. */
  attempts: number
  waitingFunding?: boolean
}

export interface TransitionContext {
  now: EpochMs
  /** Failed payment attempts so far (before this event). Default 0. */
  paymentAttempts?: number
  /** Max payment attempts before auto-cancel. Default 3. */
  maxPaymentAttempts?: number
  /** Max fulfilment attempts (params.fulfilment.maxAttempts). Default 3. */
  maxFulfilmentAttempts?: number
  /** Provider float available for this order (default true). */
  fundingAvailable?: boolean
  /** params.fulfilment.autoRefundOnFailure (default true). */
  autoRefundOnFailure?: boolean
  /** params.fulfilment.autoCompleteHours (default 24). */
  autoCompleteHours?: number
  /** Pay window in minutes to restart after a rejected payment (default 20). */
  payWindowMinutes?: number
  /** SLA minutes of the order's rush tier; when set a `sla_due` timer is scheduled on queueing. */
  slaMinutes?: number
  /** Late payment accepted by policy (only meaningful for `expired` + `payment_confirmed`). */
  latePaymentAccepted?: boolean
}

export type LedgerTemplateCode = 'E1' | 'E2' | 'E3' | 'E4' | 'E5' | 'E12' | 'E12b' | 'E12d'

export type OrderEffect =
  | { type: 'post_ledger'; template: LedgerTemplateCode }
  | { type: 'create_tasks'; rushTier: string }
  | { type: 'cancel_tasks' }
  | { type: 'notify'; template: string }
  | { type: 'schedule_timer'; timer: 'pay_window' | 'auto_complete' | 'sla_due'; at: EpochMs }
  | { type: 'cancel_timer'; timer: 'pay_window' | 'auto_complete' | 'sla_due' }
  | { type: 'start_refund'; reason: string }
  | { type: 'set_waiting_funding'; value: boolean }
  | { type: 'increment_attempts' }
  | { type: 'increment_payment_attempts' }
  | { type: 'reset_attempts' }
  | { type: 'stamp'; field: 'paidAt' | 'deliveredAt' | 'completedAt'; at: EpochMs }
  | { type: 'run_risk_check' }
  | { type: 'store_delivery' }
  | { type: 'release_payment_intent' }
  | { type: 'alert'; code: string; severity: 'info' | 'warning' | 'critical' }
  | { type: 'follow_up'; event: OrderEventInput }

export interface TransitionResult {
  from: OrderStatus
  to: OrderStatus
  event: OrderEventType
  /** True when the status changed (false for `queued` + waiting for funding). */
  changed: boolean
  effects: OrderEffect[]
}

interface Rule {
  targets: OrderStatus[]
  /** Documented guard text for the diagram. */
  guard?: string
  apply(order: OrderLike, event: OrderEventInput, ctx: TransitionContext): { to: OrderStatus; effects: OrderEffect[] }
}

const LEDGER_FOR_METHOD: Record<PaymentMethod, LedgerTemplateCode> = {
  gateway: 'E1',
  card_to_card: 'E2',
  bank_transfer: 'E2',
  usdt: 'E3',
  wallet: 'E4',
}

const go = (to: OrderStatus, ...effects: OrderEffect[]): { to: OrderStatus; effects: OrderEffect[] } => ({ to, effects })

const MIN = 60_000

const cancelRule = (): Rule => ({
  targets: ['cancelled'],
  apply: () => go('cancelled', { type: 'cancel_timer', timer: 'pay_window' }, { type: 'release_payment_intent' }, { type: 'notify', template: 'order_cancelled' }),
})

const toRefund = (reason: string, template: LedgerTemplateCode, ...extra: OrderEffect[]): { to: OrderStatus; effects: OrderEffect[] } =>
  go('refund_pending', { type: 'cancel_tasks' }, { type: 'post_ledger', template }, { type: 'start_refund', reason }, { type: 'notify', template: 'refund_started' }, ...extra)

const RULES: Record<OrderStatus, Partial<Record<OrderEventType, Rule>>> = {
  awaiting_payment: {
    payment_receipt_submitted: { targets: ['payment_review'], apply: () => go('payment_review', { type: 'notify', template: 'payment_under_review' }) },
    payment_detected: { targets: ['payment_review'], apply: () => go('payment_review', { type: 'notify', template: 'payment_detected' }) },
    payment_confirmed: {
      targets: ['paid'],
      apply: (o, _e, c) =>
        go('paid', { type: 'post_ledger', template: LEDGER_FOR_METHOD[o.method] }, { type: 'stamp', field: 'paidAt', at: c.now }, { type: 'cancel_timer', timer: 'pay_window' }, { type: 'notify', template: 'payment_confirmed' }, { type: 'run_risk_check' }),
    },
    pay_window_elapsed: { targets: ['expired'], apply: () => go('expired', { type: 'release_payment_intent' }, { type: 'notify', template: 'order_expired' }) },
    customer_cancel: cancelRule(),
    operator_cancel: cancelRule(),
  },
  payment_review: {
    payment_confirmed: {
      targets: ['paid'],
      apply: (o, _e, c) =>
        go('paid', { type: 'post_ledger', template: LEDGER_FOR_METHOD[o.method] }, { type: 'stamp', field: 'paidAt', at: c.now }, { type: 'cancel_timer', timer: 'pay_window' }, { type: 'notify', template: 'payment_confirmed' }, { type: 'run_risk_check' }),
    },
    payment_rejected: {
      targets: ['awaiting_payment', 'cancelled'],
      guard: 'attempts < max → awaiting_payment, else cancelled',
      apply: (_o, _e, c) => {
        const attempts = (c.paymentAttempts ?? 0) + 1
        const max = c.maxPaymentAttempts ?? 3
        if (attempts < max) {
          return go('awaiting_payment', { type: 'increment_payment_attempts' }, { type: 'schedule_timer', timer: 'pay_window', at: c.now + (c.payWindowMinutes ?? 20) * MIN }, { type: 'notify', template: 'payment_rejected' })
        }
        return go('cancelled', { type: 'increment_payment_attempts' }, { type: 'release_payment_intent' }, { type: 'notify', template: 'payment_rejected_final' })
      },
    },
    customer_cancel: cancelRule(),
    operator_cancel: cancelRule(),
  },
  paid: {
    risk_flagged: { targets: ['risk_hold'], apply: () => go('risk_hold', { type: 'alert', code: 'order_risk_hold', severity: 'warning' }, { type: 'notify', template: 'order_under_review' }) },
    auto_queue: {
      targets: ['queued'],
      apply: (o, _e, c) =>
        go('queued', { type: 'create_tasks', rushTier: o.rushTier }, ...(c.slaMinutes ? [{ type: 'schedule_timer', timer: 'sla_due', at: c.now + c.slaMinutes * MIN } as OrderEffect] : [])),
    },
  },
  risk_hold: {
    risk_cleared: {
      targets: ['queued'],
      apply: (o, _e, c) =>
        go('queued', { type: 'create_tasks', rushTier: o.rushTier }, ...(c.slaMinutes ? [{ type: 'schedule_timer', timer: 'sla_due', at: c.now + c.slaMinutes * MIN } as OrderEffect] : [])),
    },
    risk_rejected: { targets: ['refund_pending'], apply: () => toRefund('risk_rejected', 'E12') },
  },
  queued: {
    fulfilment_started: {
      targets: ['fulfilling', 'queued'],
      guard: 'provider funding available, else stays queued with waitingFunding',
      apply: (_o, _e, c) => {
        if (c.fundingAvailable === false) return { to: 'queued', effects: [{ type: 'set_waiting_funding', value: true }, { type: 'alert', code: 'waiting_funding', severity: 'warning' }] }
        return go('fulfilling', { type: 'set_waiting_funding', value: false }, { type: 'increment_attempts' })
      },
    },
  },
  fulfilling: {
    fulfilment_completed: {
      targets: ['delivered'],
      apply: (_o, _e, c) =>
        go('delivered', { type: 'store_delivery' }, { type: 'post_ledger', template: 'E5' }, { type: 'stamp', field: 'deliveredAt', at: c.now }, { type: 'cancel_timer', timer: 'sla_due' }, { type: 'schedule_timer', timer: 'auto_complete', at: c.now + (c.autoCompleteHours ?? 24) * 3_600_000 }, { type: 'notify', template: 'order_delivered' }),
    },
    fulfilment_retry: {
      targets: ['queued', 'failed'],
      guard: 'attempts < max → queued, else failed',
      apply: (o, _e, c) => {
        if (o.attempts < (c.maxFulfilmentAttempts ?? 3)) return go('queued', { type: 'create_tasks', rushTier: o.rushTier })
        return failedResult(c)
      },
    },
    fulfilment_failed: { targets: ['failed'], apply: (_o, _e, c) => failedResult(c) },
  },
  delivered: {
    customer_confirmed: { targets: ['completed'], apply: (_o, _e, c) => go('completed', { type: 'stamp', field: 'completedAt', at: c.now }, { type: 'cancel_timer', timer: 'auto_complete' }) },
    auto_complete_elapsed: { targets: ['completed'], apply: (_o, _e, c) => go('completed', { type: 'stamp', field: 'completedAt', at: c.now }) },
    customer_dispute: { targets: ['disputed'], apply: () => go('disputed', { type: 'cancel_timer', timer: 'auto_complete' }, { type: 'alert', code: 'order_disputed', severity: 'warning' }, { type: 'notify', template: 'dispute_opened' }) },
  },
  disputed: {
    dispute_resolved: {
      targets: ['refund_pending', 'completed'],
      guard: 'outcome refund → refund_pending, reject → completed',
      apply: (_o, e, c) => {
        if ((e as Extract<OrderEventInput, { type: 'dispute_resolved' }>).outcome === 'refund') return toRefund('dispute_refund', 'E12d')
        return go('completed', { type: 'stamp', field: 'completedAt', at: c.now }, { type: 'notify', template: 'dispute_rejected' })
      },
    },
  },
  failed: {
    fulfilment_retry: { targets: ['queued'], guard: 'operator re-routes to another provider', apply: (o) => go('queued', { type: 'reset_attempts' }, { type: 'create_tasks', rushTier: o.rushTier }) },
    operator_cancel: { targets: ['refund_pending'], apply: () => toRefund('fulfilment_failed', 'E12') },
  },
  refund_pending: {
    refund_paid: { targets: ['refunded'], apply: () => go('refunded', { type: 'post_ledger', template: 'E12b' }, { type: 'notify', template: 'refund_paid' }) },
  },
  expired: {
    payment_confirmed: {
      targets: ['paid'],
      guard: 'only when late payment accepted by policy (§9.4)',
      apply: (o, _e, c) => {
        if (!c.latePaymentAccepted) throw new Error('late payment not accepted')
        return go('paid', { type: 'post_ledger', template: LEDGER_FOR_METHOD[o.method] }, { type: 'stamp', field: 'paidAt', at: c.now }, { type: 'notify', template: 'late_payment_accepted' }, { type: 'run_risk_check' })
      },
    },
  },
  completed: {},
  cancelled: {},
  refunded: {},
}

function failedResult(c: TransitionContext): { to: OrderStatus; effects: OrderEffect[] } {
  const effects: OrderEffect[] = [{ type: 'cancel_timer', timer: 'sla_due' }, { type: 'alert', code: 'fulfilment_failed', severity: 'critical' }, { type: 'notify', template: 'fulfilment_failed_ops' }]
  if (c.autoRefundOnFailure ?? true) effects.push({ type: 'follow_up', event: { type: 'operator_cancel', reason: 'auto_refund_on_failure' } })
  return { to: 'failed', effects }
}

/** Events accepted in `status` (some are guarded, see `renderStateMachine`). */
export function allowedEvents(status: OrderStatus): OrderEventType[] {
  return ORDER_EVENT_TYPES.filter((e) => RULES[status][e] !== undefined)
}

/** Possible target statuses of (status, event); empty when the event is invalid. */
export function possibleTargets(status: OrderStatus, event: OrderEventType): OrderStatus[] {
  return RULES[status][event]?.targets ?? []
}

/** True for completed / expired / cancelled / refunded (`expired` only re-opens through an accepted late payment). */
export function isTerminalStatus(status: OrderStatus): boolean {
  return TERMINAL_ORDER_STATUSES.includes(status)
}

/**
 * Applies `event` to `order`. Never mutates; returns the target status + declarative effects.
 * Throws `AppError('ORDER_INVALID_TRANSITION', …, { from, event })` when the event is not allowed in the current status
 * (or its guard fails, e.g. a late payment that policy does not accept).
 */
export function transition(order: OrderLike, event: OrderEventInput, ctx: TransitionContext): TransitionResult {
  const rule = RULES[order.status]?.[event.type]
  if (!rule) throw new AppError('ORDER_INVALID_TRANSITION', `event ${event.type} not allowed in status ${order.status}`, { from: order.status, event: event.type })
  let out: { to: OrderStatus; effects: OrderEffect[] }
  try {
    out = rule.apply(order, event, ctx)
  } catch (e) {
    throw new AppError('ORDER_INVALID_TRANSITION', `event ${event.type} rejected in status ${order.status}: ${(e as Error).message}`, { from: order.status, event: event.type })
  }
  return { from: order.status, to: out.to, event: event.type, changed: out.to !== order.status, effects: out.effects }
}

/** Mermaid (`format: 'mermaid'`) or ASCII table (`'ascii'`) rendering of the machine, generated from the same rule table. */
export function renderStateMachine(format: 'mermaid' | 'ascii' = 'mermaid'): string {
  const edges: { from: OrderStatus; event: OrderEventType; to: OrderStatus; guard?: string }[] = []
  for (const s of ORDER_STATUSES) {
    for (const e of ORDER_EVENT_TYPES) {
      const r = RULES[s][e]
      if (!r) continue
      for (const t of r.targets) edges.push({ from: s, event: e, to: t, ...(r.guard ? { guard: r.guard } : {}) })
    }
  }
  if (format === 'mermaid') {
    const lines = ['stateDiagram-v2', '  [*] --> awaiting_payment : order created']
    for (const e of edges) lines.push(`  ${e.from} --> ${e.to} : ${e.event}${e.guard ? ` [${e.guard}]` : ''}`)
    for (const s of ORDER_STATUSES) if (isTerminalStatus(s)) lines.push(`  ${s} --> [*]`)
    return lines.join('\n')
  }
  const w = Math.max(...edges.map((e) => e.from.length)) + 2
  const w2 = Math.max(...edges.map((e) => e.event.length)) + 2
  const rows = edges.map((e) => `${e.from.padEnd(w)}${e.event.padEnd(w2)}-> ${e.to}${e.guard ? `   (${e.guard})` : ''}`)
  return [`${'FROM'.padEnd(w)}${'EVENT'.padEnd(w2)}-> TO`, ...rows].join('\n')
}
