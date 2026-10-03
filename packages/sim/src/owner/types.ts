/** OwnerObservation: everything the owner (policy, persona, digest) can see at a decision point. Plain JSON. Fractions for rates. */
import type { EpochMs } from '@hiclaude/contracts'

export type AlertSeverity = 'info' | 'warning' | 'critical'
export interface ObservedAlert {
  code: string
  severity: AlertSeverity
  message: string
}

export interface PeriodKpis {
  /** length of the observation window in days (e.g. 7) */
  windowDays: number
  orders: number
  quotes?: number
  deliveredOrders: number
  gmvIrt: number
  revenueIrt: number
  grossProfitIrt: number
  netProfitIrt?: number
  /** fractions */
  takeRate: number
  grossMarginPct: number
  slaAttainment: number
  refundRate: number
  fraudLossIrt: number
  fraudLossRate: number
  queueAgeP90Min: number
  queueDepth: number
  fulfilmentP90Min?: number
  operatorUtilisation: number
  cac?: number
  ltv?: number
  newCustomers?: number
  repeatRate?: number
}

export interface FamilyObservation {
  orders: number
  quotes: number
  /** orders / quotes in the window (win rate) */
  conversionRate: number
  /** margin currently configured for the family (fraction of cost) */
  marginPct: number
  grossMarginPct?: number
  uncompetitiveShare?: number
}

export interface ProviderObservation {
  id: string
  /** families it can serve */
  serves: string[]
  /** families currently routed to it */
  active: string[]
  failureRate: number
  feeBps: number
}

export interface RushObservation {
  utilisation: number
  queueAgeP90Min: number
  premiumPct: number
}

export interface OwnerObservation {
  now: EpochMs
  /** IRST ISO date */
  date: string
  dayIndex: number
  jalaliMonth: number
  jalaliDay: number
  kpi: PeriodKpis
  /** previous comparable window (for deltas in the digest) */
  prevKpi?: PeriodKpis
  families: Record<string, FamilyObservation>
  cash: {
    cashIrt: number
    /** positive = burning cash per day (average of the window) */
    burnPerDayIrt: number
    runwayDays: number
    opexPerMonthIrt: number
    equityIrt?: number
    vatPayableIrt?: number
    incomeTaxPayableIrt?: number
    /** how much more the owner can still inject (undefined = unlimited) */
    ownerCapitalAvailableIrt?: number
    netProfitLast30dIrt?: number
  }
  treasury: { floatUsdt: number; coverageDays: number; targetCoverageDays: number }
  fx: { usdtMid: number; dailyVolPct: number; driftPctPerDay: number; realisedFxResultIrt: number; unrealisedFxResultIrt: number; regime?: string; mid7dAgo?: number; mid30dAgo?: number }
  staff: { operators: number; byShift: Record<string, number> }
  marketing: { monthlyBudgetIrt: number; mix: Record<string, number>; cacByChannel: Record<string, number>; blendedCac?: number; ltvToCac?: number }
  risk: { newCustomerMaxOrderUsdCents: number; holdScoreThreshold: number }
  pricing: { volatilityMinBufferPct: number; riskBufferPct: number; floorMarginPct?: number; maxMarginPct?: number }
  providers: ProviderObservation[]
  rush?: Record<string, RushObservation>
  alerts: ObservedAlert[]
}
