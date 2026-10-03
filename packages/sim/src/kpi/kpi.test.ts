import { describe, expect, it } from 'vitest'
import { MS, fromIrst } from '@hiclaude/contracts'
import {
  aov, blendedLtv, buildKpiRow, cac, cogs, cohortLtv, contributionMarginPct, coverageDays, floatUtilisation, fraudLossRate, fulfilmentMinutes, fulfilmentPercentiles, funnelRates, fxEffect, gmv,
  grossMarginPct, grossProfit, herfindahl, marginBy, netMarginPct, operatorUtilisation, paybackDays, queueAge, refundRate, repeatRate, retentionCohorts, revenue, slaAttainment, summariseKpiRows,
  takeRate, ticketsPer100Orders, type CustomerRecord, type OrderRecord,
} from './index'

const T = fromIrst(2026, 10, 3, 12)
let n = 0
const order = (o: Partial<OrderRecord> = {}): OrderRecord => ({
  id: `o${++n}`, customerId: 'c1', segmentId: 'student', family: 'gift_card', productId: 'p', providerId: 'mpay', channel: 'web', source: 'organic', method: 'gateway', rushTier: 'normal',
  createdAt: T, paidAt: T + MS.minute, deliveredAt: T + 11 * MS.minute, slaDueAt: T + 31 * MS.minute, status: 'delivered', gmvIrt: 1_100_000, revenueIrt: 1_000_000, cogsIrt: 900_000, ...o,
})

describe('volume & margin KPIs', () => {
  const orders = [order(), order({ gmvIrt: 2_200_000, revenueIrt: 2_000_000, cogsIrt: 1_700_000 }), order({ status: 'failed', gmvIrt: 500_000 })]
  it('only delivered orders count towards GMV/revenue', () => {
    expect(gmv(orders)).toBe(3_300_000)
    expect(revenue(orders)).toBe(3_000_000)
    expect(cogs(orders)).toBe(2_600_000)
    expect(grossProfit(orders)).toBe(400_000)
  })
  it('AOV, take-rate and gross margin', () => {
    expect(aov(orders)).toBe(1_650_000)
    expect(takeRate(orders)).toBeCloseTo(400_000 / 3_300_000, 12)
    expect(grossMarginPct(orders)).toBeCloseTo(400_000 / 3_000_000, 12)
  })
  it('zero-safe on empty input', () => {
    expect(aov([])).toBe(0)
    expect(takeRate([])).toBe(0)
    expect(grossMarginPct([])).toBe(0)
  })
  it('contribution margin deducts fees, refunds, fraud and extra variable cost', () => {
    const o = [order({ feesIrt: 20_000, refundedIrt: 0, fraudLossIrt: 30_000 })]
    expect(contributionMarginPct(o)).toBeCloseTo((1_000_000 - 900_000 - 20_000 - 30_000) / 1_000_000, 12)
    expect(contributionMarginPct(o, 10_000)).toBeCloseTo(0.04, 12)
  })
  it('net margin and CAC', () => {
    expect(netMarginPct(50, 1000)).toBe(0.05)
    expect(cac(1_000_000, 10)).toBe(100_000)
    expect(cac(1, 0)).toBe(0)
  })
  it('marginBy groups, sorts by gross profit and sums to the total', () => {
    const rows = marginBy([order({ family: 'a' }), order({ family: 'b', revenueIrt: 5_000_000, cogsIrt: 4_000_000 }), order({ family: 'a' })], (o) => o.family)
    expect(rows.map((r) => r.key)).toEqual(['b', 'a'])
    expect(rows.reduce((s, r) => s + r.grossProfitIrt, 0)).toBe(1_000_000 + 100_000 * 2)
    expect(rows[1]!.orders).toBe(2)
    expect(rows[0]!.grossMarginPct).toBeCloseTo(0.2, 12)
  })
})

describe('retention, LTV, funnel', () => {
  const cust = (id: string, at: number): CustomerRecord => ({ id, segmentId: 's', acquiredAt: at, source: 'organic' })
  const d0 = fromIrst(2026, 10, 5)
  const customers = [cust('a', d0), cust('b', d0), cust('c', d0 + 40 * MS.day)]
  const orders = [
    order({ customerId: 'a', createdAt: d0 }), order({ customerId: 'a', createdAt: d0 + 35 * MS.day }), order({ customerId: 'b', createdAt: d0 }),
    order({ customerId: 'c', createdAt: d0 + 41 * MS.day }),
  ]
  it('repeat rate', () => {
    expect(repeatRate(orders)).toBeCloseTo(1 / 3, 12)
    expect(repeatRate([])).toBe(0)
  })
  it('cohort matrix: month 0 = 100 %, month 1 reflects returners; unobservable periods are cut at asOf', () => {
    const m = retentionCohorts(customers, orders, d0 + 70 * MS.day)
    expect(m.keys.length).toBe(2)
    expect(m.sizes[0]).toBe(2)
    expect(m.retention[0]![0]).toBe(1)
    expect(m.retention[0]![1]).toBe(0.5)
    expect(m.retention[0]!.length).toBe(3)
    expect(m.retention[1]![0]).toBe(1)
  })
  it('cohort LTV counts gross profit within the horizon only', () => {
    const rows = cohortLtv(customers, orders, 30)
    expect(rows[0]!.ltvIrt).toBeCloseTo((100_000 * 2) / 2, 9)
    const wide = cohortLtv(customers, orders, 90)
    expect(wide[0]!.ltvIrt).toBeCloseTo((100_000 * 3) / 2, 9)
    expect(blendedLtv(customers, orders, 90)).toBeCloseTo((100_000 * 4) / 3, 9)
  })
  it('payback days: first day cumulative GP per customer ≥ CAC, null otherwise', () => {
    expect(paybackDays(customers, orders, 50_000)).toBe(0)
    expect(paybackDays(customers, orders, 120_000)).toBe(35)
    expect(paybackDays(customers, orders, 10_000_000)).toBeNull()
    expect(paybackDays([], orders, 1)).toBeNull()
  })
  it('funnel conversions', () => {
    const f = funnelRates({ visits: 1000, signups: 100, firstOrders: 50 })
    expect(f.visitToSignup).toBe(0.1)
    expect(f.signupToOrder).toBe(0.5)
    expect(f.visitToOrder).toBe(0.05)
  })
})

describe('service quality KPIs', () => {
  it('SLA attainment overall and by tier; open orders and no-SLA orders ignored', () => {
    const o = [
      order(), order({ deliveredAt: T + 40 * MS.minute }), order({ rushTier: 'fast', slaDueAt: T + 11 * MS.minute }), order({ status: 'failed', deliveredAt: undefined }),
      order({ status: 'open', deliveredAt: undefined }), order({ slaDueAt: undefined }),
    ]
    const r = slaAttainment(o, (x) => x.rushTier)
    expect(r.counted).toBe(4)
    expect(r.overall).toBeCloseTo(2 / 4, 12)
    expect(r.byKey.normal).toBeCloseTo(1 / 3, 12)
    expect(r.byKey.fast).toBe(1)
  })
  it('fulfilment time percentiles', () => {
    const o = [5, 10, 15, 20, 100].map((m) => order({ deliveredAt: T + MS.minute + m * MS.minute }))
    expect(fulfilmentMinutes(o)).toEqual([5, 10, 15, 20, 100])
    const p = fulfilmentPercentiles(o)
    expect(p.p50).toBe(15)
    expect(p.p90).toBeCloseTo(68, 6)
  })
  it('queue age percentiles from open task creation times', () => {
    const q = queueAge([T - 10 * MS.minute, T - 30 * MS.minute, T - 50 * MS.minute], T)
    expect(q.depth).toBe(3)
    expect(q.p50).toBe(30)
    expect(q.max).toBe(50)
    expect(queueAge([], T).p90).toBe(0)
  })
  it('refund rate over paid orders, fraud loss rate over paid GMV, tickets per 100', () => {
    const o = [order(), order(), order({ status: 'refunded' }), order({ paidAt: undefined, status: 'expired' })]
    expect(refundRate(o)).toBeCloseTo(1 / 3, 12)
    expect(fraudLossRate([order({ fraudLossIrt: 110_000 }), order()])).toBeCloseTo(110_000 / 2_200_000, 12)
    expect(ticketsPer100Orders([{ createdAt: 1 }, { createdAt: 2 }], 50)).toBe(4)
  })
})

describe('treasury, FX, concentration, utilisation', () => {
  it('float utilisation and coverage days', () => {
    expect(floatUtilisation(1000, 250)).toBe(0.25)
    expect(coverageDays(1000, 200)).toBe(5)
    expect(coverageDays(1000, 0)).toBe(Infinity)
  })
  it('fx effect share of operating profit', () => {
    const f = fxEffect(-100, -50, 300)
    expect(f.totalIrt).toBe(-150)
    expect(f.shareOfOperating).toBe(-0.5)
    expect(fxEffect(1, 1, 0).shareOfOperating).toBe(0)
  })
  it('HHI: monopoly = 1, equal split = 1/n', () => {
    expect(herfindahl({ a: 10 })).toBe(1)
    expect(herfindahl({ a: 5, b: 5, c: 5, d: 5 })).toBeCloseTo(0.25, 12)
    expect(herfindahl({})).toBe(0)
  })
  it('operator utilisation clamps at 1.5 (overtime)', () => {
    expect(operatorUtilisation(30, 60)).toBe(0.5)
    expect(operatorUtilisation(500, 60)).toBe(1.5)
  })
})

describe('daily KpiRow', () => {
  const delivered = [order(), order({ gmvIrt: 2_200_000, revenueIrt: 2_000_000, cogsIrt: 1_700_000 })]
  const row = buildKpiRow({
    date: '2026-10-03', jalali: '1405-07-11', ordersCreated: 5, delivered, paidOrders: 4, refundedOrders: 1, fraudLossIrt: 0, newCustomers: 2, activeCustomers: 9,
    fulfilmentMinutes: [10, 20], slaMet: 1, slaTotal: 2, queueDepth: 3, usdtMid: 257_000, floatUsdt: 1000, coverageDays: 4, cashIrt: 5_000_000, fxRevaluationIrt: -1,
  })
  it('maps inputs to the contract row', () => {
    expect(row.gmvIrt).toBe(3_300_000)
    expect(row.grossProfitIrt).toBe(400_000)
    expect(row.takeRatePct).toBeCloseTo(400_000 / 3_300_000, 12)
    expect(row.refundRatePct).toBe(0.25)
    expect(row.slaAttainmentPct).toBe(0.5)
    expect(row.fulfilmentP50Min).toBe(15)
    expect(row.aovIrt).toBe(1_650_000)
  })
  it('no-SLA day reports 100 % attainment rather than NaN', () => {
    const r = buildKpiRow({ date: 'd', jalali: 'j', ordersCreated: 0, delivered: [], paidOrders: 0, refundedOrders: 0, fraudLossIrt: 0, newCustomers: 0, activeCustomers: 0, fulfilmentMinutes: [], slaMet: 0, slaTotal: 0, queueDepth: 0, usdtMid: 1, floatUsdt: 0, coverageDays: 0, cashIrt: 0, fxRevaluationIrt: 0 })
    expect(r.slaAttainmentPct).toBe(1)
    expect(r.takeRatePct).toBe(0)
  })
  it('summarise: sums volumes and weights ratios', () => {
    const s = summariseKpiRows([row, { ...row, orders: 3, deliveredOrders: 1, gmvIrt: 1_000_000, grossProfitIrt: 100_000, revenueIrt: 900_000 }])
    expect(s.orders).toBe(8)
    expect(s.gmvIrt).toBe(4_300_000)
    expect(s.takeRatePct).toBeCloseTo(500_000 / 4_300_000, 12)
    expect(s.deliveredOrders).toBe(3)
  })
})
