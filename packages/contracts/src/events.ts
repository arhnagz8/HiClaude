/** Domain events and event bus. [CONTRACT] */
import type { EpochMs, Irt, MicroUsdt } from './units'
import type { OrderStatus, PaymentMethod } from './domain'

export type DomainEvent =
  | { type: 'customer.registered'; at: EpochMs; customerId: string; channel: string }
  | { type: 'quote.created'; at: EpochMs; quoteId: string; productId: string; customerId?: string }
  | { type: 'order.created'; at: EpochMs; orderId: string; customerId: string; method: PaymentMethod }
  | { type: 'order.status_changed'; at: EpochMs; orderId: string; from: OrderStatus; to: OrderStatus }
  | { type: 'payment.detected'; at: EpochMs; orderId: string; paymentId: string }
  | { type: 'payment.confirmed'; at: EpochMs; orderId: string; paymentId: string; amount: number; currency: 'IRT' | 'USDT' }
  | { type: 'payment.rejected'; at: EpochMs; orderId: string; paymentId: string; reason: string }
  | { type: 'fulfilment.task_created'; at: EpochMs; orderId: string; taskId: string }
  | { type: 'fulfilment.completed'; at: EpochMs; orderId: string; taskId: string }
  | { type: 'fulfilment.failed'; at: EpochMs; orderId: string; taskId: string; reason: string }
  | { type: 'rates.updated'; at: EpochMs; snapshotId: string; status: string; mid: number }
  | { type: 'killswitch.changed'; at: EpochMs; on: boolean; reason: string; scope: string }
  | { type: 'treasury.action'; at: EpochMs; actionId: string; actionType: string; status: string }
  | { type: 'ledger.posted'; at: EpochMs; entryId: string; kind: string }
  | { type: 'revenue.recognised'; at: EpochMs; orderId: string; revenueIrt: Irt; costIrt: Irt; fundingMicroUsdt: MicroUsdt }
  | { type: 'ticket.created'; at: EpochMs; ticketId: string; customerId: string }
  | { type: 'alert.raised'; at: EpochMs; severity: 'info' | 'warning' | 'critical'; code: string; messageFa: string; data?: Record<string, unknown> }

export type DomainEventType = DomainEvent['type']

export type EventHandler<E extends DomainEvent = DomainEvent> = (event: E) => void

export interface EventBus {
  publish(event: DomainEvent): void
  subscribe<T extends DomainEventType>(type: T, handler: EventHandler<Extract<DomainEvent, { type: T }>>): () => void
  subscribeAll(handler: EventHandler): () => void
}

/** Synchronous in-process event bus (handlers run in publish order; errors in handlers are swallowed and reported via onError). */
export function createEventBus(onError?: (e: unknown, event: DomainEvent) => void): EventBus {
  const typed = new Map<string, Set<EventHandler<never>>>()
  const all = new Set<EventHandler>()
  return {
    publish(event) {
      const handlers = typed.get(event.type)
      if (handlers) {
        for (const h of [...handlers]) {
          try {
            ;(h as EventHandler)(event)
          } catch (e) {
            onError?.(e, event)
          }
        }
      }
      for (const h of [...all]) {
        try {
          h(event)
        } catch (e) {
          onError?.(e, event)
        }
      }
    },
    subscribe(type, handler) {
      let set = typed.get(type)
      if (!set) {
        set = new Set()
        typed.set(type, set)
      }
      set.add(handler as EventHandler<never>)
      return () => set?.delete(handler as EventHandler<never>)
    },
    subscribeAll(handler) {
      all.add(handler)
      return () => all.delete(handler)
    },
  }
}
