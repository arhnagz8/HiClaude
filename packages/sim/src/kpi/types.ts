/** Plain input records for KPI calculators (pure functions; the runner/accountant maps real orders & ledger rows into these). */
import type { PaymentMethod } from '@hiclaude/contracts'

export type OrderRecordStatus = 'delivered' | 'completed' | 'refunded' | 'failed' | 'expired' | 'cancelled' | 'open'

export interface OrderRecord {
  id: string
  customerId: string
  segmentId: string
  family: string
  productId: string
  providerId: string
  channel: 'web' | 'telegram' | 'bale' | string
  /** acquisition source of the customer: organic | marketing channel | referral | repeat */
  source: string
  method: PaymentMethod | string
  rushTier: string
  createdAt: number
  paidAt?: number
  deliveredAt?: number
  slaDueAt?: number
  status: OrderRecordStatus
  /** Toman the customer paid (incl. VAT & rush) */
  gmvIrt: number
  /** recognised revenue (ex-VAT) */
  revenueIrt: number
  cogsIrt: number
  /** variable payment/processing cost carried by us */
  feesIrt?: number
  refundedIrt?: number
  fraudLossIrt?: number
  firstOrder?: boolean
}

export interface CustomerRecord {
  id: string
  segmentId: string
  acquiredAt: number
  source: string
  channel?: string
}

export interface TicketRecord {
  createdAt: number
  orderId?: string
}

export interface GroupMargin {
  key: string
  orders: number
  gmvIrt: number
  revenueIrt: number
  cogsIrt: number
  grossProfitIrt: number
  /** fractions */
  grossMarginPct: number
  takeRatePct: number
}

export interface CohortMatrix {
  /** cohort keys e.g. "2026-10" (Gregorian year-month in IRST) */
  keys: string[]
  sizes: number[]
  /** retention[c][k] = fraction of cohort c active (≥1 order) k periods after acquisition; length = periods observable */
  retention: number[][]
  periodDays: number
}

export interface FunnelCounts {
  visits: number
  signups: number
  firstOrders: number
}

export interface DayInputs {
  date: string
  jalali: string
  ordersCreated: number
  /** orders delivered/completed this day */
  delivered: OrderRecord[]
  paidOrders: number
  refundedOrders: number
  fraudLossIrt: number
  newCustomers: number
  activeCustomers: number
  /** delivered orders' fulfilment minutes (paid → delivered) */
  fulfilmentMinutes: number[]
  slaMet: number
  slaTotal: number
  queueDepth: number
  usdtMid: number
  floatUsdt: number
  coverageDays: number
  cashIrt: number
  fxRevaluationIrt: number
}
