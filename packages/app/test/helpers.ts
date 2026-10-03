import type { Customer, FulfilmentTask, Order, Quote } from '@hiclaude/contracts'
import { TEST_START, makeTestApp, type MakeTestAppOptions, type TestApp } from './fakes'

export { TEST_START, makeTestApp }
export type { TestApp, MakeTestAppOptions }

export const PHONE = '09121234567'
export const PHONE2 = '09351112233'
/** valid Iranian national ids (checksum-valid) */
export const NID1 = '0499370899'
export const NID2 = '0013542419'

export function mkCustomer(t: TestApp, phone = PHONE, extra: Partial<Customer> = {}): Customer {
  const { customer } = t.app.services.customers.getOrCreateByPhone(phone)
  return Object.keys(extra).length ? t.app.repos.customers.update(customer.id, extra) : customer
}

export function mkQuote(t: TestApp, customerId: string | undefined, over: Partial<Quote> = {}): Quote {
  const now = t.clock.now()
  const q: Quote = {
    id: t.app.ids.next('qte'),
    customerId,
    productId: 'gift-steam',
    amountUsdCents: 1000,
    rushTier: 'normal',
    inputs: {},
    createdAt: now,
    lockedUntil: now + 30 * 60_000,
    rateSnapshotId: 'rs_000001',
    policyVersion: 1,
    perMethod: [
      {
        method: 'gateway',
        currency: 'IRT',
        totalIrt: 3_000_000,
        feeIrt: 15_000,
        lines: [{ code: 'service_value', labelFa: 'ارزش سرویس', amountIrt: 3_000_000, visibleToCustomer: true }],
        effectiveRateIrtPerUsd: 300_000,
        available: true,
      },
    ],
    fundingMicroUsdt: 10_300_000,
    costIrt: 2_900_000,
    marginIrt: 100_000,
    uncompetitive: false,
    warnings: [],
    ...over,
  }
  return t.app.repos.quotes.insert(q)
}

export function mkOrder(t: TestApp, customerId: string, quoteId: string, over: Partial<Order> = {}, idemKey?: string): Order {
  const now = t.clock.now()
  const o: Order = {
    id: t.app.ids.next('ord'),
    code: `KT-${t.app.ids.next("c").slice(2).toUpperCase()}`,
    customerId,
    productId: 'gift-steam',
    quoteId,
    method: 'gateway',
    status: 'awaiting_payment',
    version: 1,
    amountUsdCents: 1000,
    rushTier: 'normal',
    inputs: {},
    payCurrency: 'IRT',
    payAmount: 3_000_000,
    fundingMicroUsdt: 10_300_000,
    costIrtAtQuote: 2_900_000,
    marginIrtAtQuote: 100_000,
    vatIrt: 0,
    rushIrt: 0,
    discountIrt: 0,
    providerId: 'vouchers',
    fulfilmentMode: 'api',
    channel: 'web',
    waitingFunding: false,
    attempts: 0,
    riskScore: 0,
    riskFlags: [],
    createdAt: now,
    payExpiresAt: now + 20 * 60_000,
    ...over,
  }
  return t.app.repos.orders.insert(o, idemKey)
}

export function mkTask(t: TestApp, orderId: string, over: Partial<FulfilmentTask> = {}) {
  const now = t.clock.now()
  return t.app.repos.tasks.insert({
    id: t.app.ids.next('tsk'),
    orderId,
    kind: 'deliver_voucher',
    mode: 'operator',
    status: 'queued',
    priority: 5,
    rushTier: 'normal',
    createdAt: now,
    dueAt: now + 120 * 60_000,
    attempts: 0,
    providerId: 'vouchers',
    instructions: { titleFa: 'تحویل گیفت‌کارت', steps: ['خرید', 'ارسال'], params: { usd: 10 } },
    ...over,
  })
}
