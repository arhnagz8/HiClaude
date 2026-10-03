/** Observation factory + fuzzer for owner-policy tests and report fixtures. */
import { MS, fromIrst, irstIsoDate, jalaliOf, type Rng } from '@hiclaude/contracts'
import type { OwnerObservation, PeriodKpis } from './types'

export const D0 = fromIrst(2026, 10, 3, 12)

export function baseKpi(o: Partial<PeriodKpis> = {}): PeriodKpis {
  return {
    windowDays: 7, orders: 100, quotes: 600, deliveredOrders: 95, gmvIrt: 400_000_000, revenueIrt: 380_000_000, grossProfitIrt: 40_000_000, netProfitIrt: 5_000_000, takeRate: 0.1, grossMarginPct: 0.105,
    slaAttainment: 0.95, refundRate: 0.01, fraudLossIrt: 0, fraudLossRate: 0, queueAgeP90Min: 20, queueDepth: 4, operatorUtilisation: 0.6, cac: 200_000, ltv: 800_000, ...o,
  }
}

export function makeObs(dayOffset = 0, o: Partial<Omit<OwnerObservation, 'kpi'>> & { kpi?: Partial<PeriodKpis> } = {}): OwnerObservation {
  const now = D0 + dayOffset * MS.day
  const j = jalaliOf(now)
  const { kpi, ...rest } = o
  return {
    now,
    date: irstIsoDate(now),
    dayIndex: dayOffset,
    jalaliMonth: j.jm,
    jalaliDay: j.jd,
    kpi: baseKpi(kpi),
    families: { gift_card: { orders: 50, quotes: 300, conversionRate: 0.2, marginPct: 0.1 }, virtual_card: { orders: 50, quotes: 300, conversionRate: 0.2, marginPct: 0.12 } },
    cash: { cashIrt: 500_000_000, burnPerDayIrt: 0, runwayDays: Infinity, opexPerMonthIrt: 120_000_000, netProfitLast30dIrt: 20_000_000, vatPayableIrt: 0, incomeTaxPayableIrt: 0 },
    treasury: { floatUsdt: 3000, coverageDays: 5, targetCoverageDays: 5 },
    fx: { usdtMid: 257_000, dailyVolPct: 1.8, driftPctPerDay: 0.12, realisedFxResultIrt: 0, unrealisedFxResultIrt: 0 },
    staff: { operators: 3, byShift: { morning: 1, evening: 1, night: 1 } },
    marketing: { monthlyBudgetIrt: 30_000_000, mix: { seo: 0.5, telegram_channels: 0.5 }, cacByChannel: {}, },
    risk: { newCustomerMaxOrderUsdCents: 50_000, holdScoreThreshold: 70 },
    pricing: { volatilityMinBufferPct: 0.01, riskBufferPct: 0.005 },
    providers: [],
    alerts: [],
    ...rest,
  }
}

/** Random but structurally valid observation (for property tests). */
export function fuzzObs(rng: Rng, day: number): OwnerObservation {
  const cash = Math.round(rng.logNormal(Math.log(300_000_000), 1.2))
  const burn = rng.bool(0.5) ? Math.round(rng.next() * 8_000_000) : -Math.round(rng.next() * 3_000_000)
  const fam = (m: number) => ({ orders: rng.int(0, 200), quotes: rng.int(0, 900), conversionRate: rng.next() * 0.6, marginPct: m })
  return makeObs(day, {
    kpi: {
      orders: rng.int(0, 400), grossProfitIrt: rng.int(0, 200_000_000), slaAttainment: 0.5 + rng.next() * 0.5, queueAgeP90Min: rng.next() * 600, operatorUtilisation: rng.next() * 1.3,
      fraudLossRate: rng.bool(0.15) ? rng.next() * 0.03 : rng.next() * 0.002, refundRate: rng.next() * 0.1, netProfitIrt: rng.int(-50_000_000, 80_000_000),
    },
    families: { gift_card: fam(0.05 + rng.next() * 0.15), virtual_card: fam(0.05 + rng.next() * 0.15), cloud: fam(0.05 + rng.next() * 0.15) },
    cash: { cashIrt: cash, burnPerDayIrt: burn, runwayDays: burn > 0 ? cash / burn : Infinity, opexPerMonthIrt: rng.int(40_000_000, 250_000_000), netProfitLast30dIrt: rng.int(-60_000_000, 100_000_000), vatPayableIrt: rng.int(0, 50_000_000), incomeTaxPayableIrt: rng.int(0, 60_000_000), ownerCapitalAvailableIrt: rng.bool(0.3) ? rng.int(0, 400_000_000) : undefined },
    treasury: { floatUsdt: rng.int(0, 20000), coverageDays: rng.next() * 12, targetCoverageDays: rng.int(2, 10) },
    fx: { usdtMid: 257_000, dailyVolPct: rng.next() * 5, driftPctPerDay: rng.next() * 0.5, realisedFxResultIrt: -rng.int(0, 90_000_000), unrealisedFxResultIrt: 0 },
    staff: { operators: rng.int(1, 12), byShift: { morning: rng.int(0, 4), evening: rng.int(0, 4), night: rng.int(0, 3) } },
    marketing: { monthlyBudgetIrt: rng.int(0, 400_000_000), mix: { seo: 0.4, telegram_channels: 0.3, instagram: 0.3 }, cacByChannel: rng.bool(0.5) ? { seo: 100_000 + rng.int(0, 400_000), telegram_channels: 100_000 + rng.int(0, 400_000), instagram: 100_000 + rng.int(0, 400_000) } : {}, ltvToCac: rng.bool(0.7) ? rng.next() * 6 : undefined },
    risk: { newCustomerMaxOrderUsdCents: rng.int(5000, 60000), holdScoreThreshold: rng.int(40, 90) },
    pricing: { volatilityMinBufferPct: 0.005 + rng.next() * 0.04, riskBufferPct: 0.005 },
    providers: [
      { id: 'mpay', serves: ['virtual_card', 'cloud'], active: ['virtual_card', 'cloud'], failureRate: rng.next() * 0.2, feeBps: rng.int(100, 400) },
      { id: 'altcard', serves: ['virtual_card'], active: [], failureRate: rng.next() * 0.2, feeBps: rng.int(100, 400) },
    ],
    rush: { fast: { utilisation: rng.next(), queueAgeP90Min: 10, premiumPct: 0.1 + rng.next() * 0.3 }, express: { utilisation: rng.next(), queueAgeP90Min: 5, premiumPct: 0.2 + rng.next() * 0.3 } },
    alerts: rng.bool(0.05) ? [{ code: 'ledger.imbalance', severity: 'critical', message: 'x' }] : [],
  })
}
