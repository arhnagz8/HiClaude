/**
 * KPI definitions (sim-spec section 5). All functions are pure over plain records. Percent-like outputs are FRACTIONS
 * (0.18 = 18 %), matching core/ledger/statements and the `*Pct` fields of contracts (convention: "Pct" = fraction).
 */
import { irstIsoDate, jalaliMonthKey, MS, type KpiRow } from '@hiclaude/contracts'
import { percentile, safeDiv, sum } from '../demand/common'
import type { CohortMatrix, CustomerRecord, DayInputs, FunnelCounts, GroupMargin, OrderRecord, TicketRecord } from './types'

const isDelivered = (o: OrderRecord): boolean => o.status === 'delivered' || o.status === 'completed'
const isPaid = (o: OrderRecord): boolean => o.paidAt !== undefined

// ───────────────────────── volume & margin ─────────────────────────
export const gmv = (orders: readonly OrderRecord[]): number => sum(orders.filter(isDelivered).map((o) => o.gmvIrt))
export const revenue = (orders: readonly OrderRecord[]): number => sum(orders.filter(isDelivered).map((o) => o.revenueIrt))
export const cogs = (orders: readonly OrderRecord[]): number => sum(orders.filter(isDelivered).map((o) => o.cogsIrt))
export const grossProfit = (orders: readonly OrderRecord[]): number => revenue(orders) - cogs(orders)
/** Average order value of delivered orders (IRT). */
export const aov = (orders: readonly OrderRecord[]): number => {
  const d = orders.filter(isDelivered)
  return d.length === 0 ? 0 : sum(d.map((o) => o.gmvIrt)) / d.length
}
/** take-rate = (revenue − COGS) / GMV */
export const takeRate = (orders: readonly OrderRecord[]): number => safeDiv(grossProfit(orders), gmv(orders))
/** gross margin % = (revenue − COGS) / revenue */
export const grossMarginPct = (orders: readonly OrderRecord[]): number => safeDiv(grossProfit(orders), revenue(orders))
/** contribution = revenue − COGS − payment fees − refunds − fraud losses − per-order marketing (referral rewards); fraction of revenue */
export function contributionMarginPct(orders: readonly OrderRecord[], variableCostsIrt = 0): number {
  const d = orders.filter(isDelivered)
  const rev = sum(d.map((o) => o.revenueIrt))
  const c = rev - sum(d.map((o) => o.cogsIrt)) - sum(orders.map((o) => o.feesIrt ?? 0)) - sum(orders.map((o) => o.refundedIrt ?? 0)) - sum(orders.map((o) => o.fraudLossIrt ?? 0)) - variableCostsIrt
  return safeDiv(c, rev)
}
export const netMarginPct = (netProfitIrt: number, revenueIrt: number): number => safeDiv(netProfitIrt, revenueIrt)

/** Margin tables by any dimension, sorted by gross profit descending then key. */
export function marginBy(orders: readonly OrderRecord[], key: (o: OrderRecord) => string): GroupMargin[] {
  const m = new Map<string, GroupMargin>()
  for (const o of orders) {
    if (!isDelivered(o)) continue
    const k = key(o)
    let g = m.get(k)
    if (!g) {
      g = { key: k, orders: 0, gmvIrt: 0, revenueIrt: 0, cogsIrt: 0, grossProfitIrt: 0, grossMarginPct: 0, takeRatePct: 0 }
      m.set(k, g)
    }
    g.orders++
    g.gmvIrt += o.gmvIrt
    g.revenueIrt += o.revenueIrt
    g.cogsIrt += o.cogsIrt
  }
  const out = [...m.values()]
  for (const g of out) {
    g.grossProfitIrt = g.revenueIrt - g.cogsIrt
    g.grossMarginPct = safeDiv(g.grossProfitIrt, g.revenueIrt)
    g.takeRatePct = safeDiv(g.grossProfitIrt, g.gmvIrt)
  }
  return out.sort((a, b) => b.grossProfitIrt - a.grossProfitIrt || (a.key < b.key ? -1 : 1))
}

// ───────────────────────── acquisition, LTV, retention ─────────────────────────
export const cac = (marketingSpendIrt: number, newCustomers: number): number => safeDiv(marketingSpendIrt, newCustomers)

/** Funnel conversions as fractions. */
export function funnelRates(f: FunnelCounts): { visitToSignup: number; signupToOrder: number; visitToOrder: number } {
  return { visitToSignup: safeDiv(f.signups, f.visits), signupToOrder: safeDiv(f.firstOrders, f.signups), visitToOrder: safeDiv(f.firstOrders, f.visits) }
}

/** Share of customers with ≥ 2 delivered orders. */
export function repeatRate(orders: readonly OrderRecord[]): number {
  const per = new Map<string, number>()
  for (const o of orders) if (isDelivered(o)) per.set(o.customerId, (per.get(o.customerId) ?? 0) + 1)
  if (per.size === 0) return 0
  let rep = 0
  for (const n of per.values()) if (n >= 2) rep++
  return rep / per.size
}

const ymKey = (ms: number): string => irstIsoDate(ms).slice(0, 7)

/**
 * Monthly acquisition cohorts: retention[c][k] = share of the cohort ordering in month (cohort+k).
 * `asOf` truncates unobservable future periods. Period = calendar month of IRST.
 */
export function retentionCohorts(customers: readonly CustomerRecord[], orders: readonly OrderRecord[], asOf: number): CohortMatrix {
  const keys = [...new Set(customers.map((c) => ymKey(c.acquiredAt)))].sort()
  const monthIndex = (k: string): number => Number(k.slice(0, 4)) * 12 + Number(k.slice(5, 7)) - 1
  const cohortOf = new Map<string, string>()
  const sizes = new Map<string, number>()
  for (const c of customers) {
    const k = ymKey(c.acquiredAt)
    cohortOf.set(c.id, k)
    sizes.set(k, (sizes.get(k) ?? 0) + 1)
  }
  const active = new Map<string, Set<string>>() // `${cohort}|${k}` -> customers
  for (const o of orders) {
    if (!isDelivered(o)) continue
    const ck = cohortOf.get(o.customerId)
    if (!ck) continue
    const k = monthIndex(ymKey(o.createdAt)) - monthIndex(ck)
    if (k < 0) continue
    const key = `${ck}|${k}`
    let s = active.get(key)
    if (!s) {
      s = new Set()
      active.set(key, s)
    }
    s.add(o.customerId)
  }
  const last = monthIndex(ymKey(asOf))
  const retention = keys.map((ck) => {
    const n = last - monthIndex(ck) + 1
    const row: number[] = []
    for (let k = 0; k < n; k++) row.push(safeDiv(active.get(`${ck}|${k}`)?.size ?? 0, sizes.get(ck) ?? 1))
    return row
  })
  return { keys, sizes: keys.map((k) => sizes.get(k) ?? 0), retention, periodDays: 30 }
}

/** Average cumulative gross profit per acquired customer within `horizonDays` of acquisition, per cohort month. */
export function cohortLtv(customers: readonly CustomerRecord[], orders: readonly OrderRecord[], horizonDays: number): Array<{ key: string; customers: number; ltvIrt: number }> {
  const acq = new Map<string, CustomerRecord>()
  for (const c of customers) acq.set(c.id, c)
  const gp = new Map<string, number>()
  for (const o of orders) {
    if (!isDelivered(o)) continue
    const c = acq.get(o.customerId)
    if (!c || o.createdAt - c.acquiredAt > horizonDays * MS.day) continue
    const k = ymKey(c.acquiredAt)
    gp.set(k, (gp.get(k) ?? 0) + (o.revenueIrt - o.cogsIrt))
  }
  const sizes = new Map<string, number>()
  for (const c of customers) sizes.set(ymKey(c.acquiredAt), (sizes.get(ymKey(c.acquiredAt)) ?? 0) + 1)
  return [...sizes.keys()].sort().map((key) => ({ key, customers: sizes.get(key) as number, ltvIrt: safeDiv(gp.get(key) ?? 0, sizes.get(key) as number) }))
}

/** Blended LTV over all cohorts (customer-weighted). */
export function blendedLtv(customers: readonly CustomerRecord[], orders: readonly OrderRecord[], horizonDays: number): number {
  const rows = cohortLtv(customers, orders, horizonDays)
  return safeDiv(sum(rows.map((r) => r.ltvIrt * r.customers)), sum(rows.map((r) => r.customers)))
}

/** Days until cumulative gross profit per customer (avg over customers) first covers CAC; `null` if never within `maxDays`. */
export function paybackDays(customers: readonly CustomerRecord[], orders: readonly OrderRecord[], cacIrt: number, maxDays = 720): number | null {
  if (customers.length === 0) return null
  const acq = new Map<string, number>()
  for (const c of customers) acq.set(c.id, c.acquiredAt)
  const events: Array<[number, number]> = []
  for (const o of orders) {
    const a = acq.get(o.customerId)
    if (a === undefined || !isDelivered(o)) continue
    events.push([(o.createdAt - a) / MS.day, o.revenueIrt - o.cogsIrt])
  }
  events.sort((x, y) => x[0] - y[0])
  let cum = 0
  for (const [d, g] of events) {
    if (d > maxDays) break
    cum += g / customers.length
    if (cum >= cacIrt) return Math.max(0, Math.ceil(d))
  }
  return null
}

// ───────────────────────── service quality ─────────────────────────
/** SLA attainment over orders that had an SLA and reached a decision (delivered on/before due, or failed/refunded/late). */
export function slaAttainment(orders: readonly OrderRecord[], by?: (o: OrderRecord) => string): { overall: number; byKey: Record<string, number>; counted: number } {
  const tot = new Map<string, number>()
  const met = new Map<string, number>()
  let t = 0
  let m = 0
  for (const o of orders) {
    if (o.slaDueAt === undefined) continue
    const decided = isDelivered(o) || o.status === 'failed' || o.status === 'refunded'
    if (!decided) continue
    const ok = isDelivered(o) && o.deliveredAt !== undefined && o.deliveredAt <= o.slaDueAt
    t++
    if (ok) m++
    if (by) {
      const k = by(o)
      tot.set(k, (tot.get(k) ?? 0) + 1)
      if (ok) met.set(k, (met.get(k) ?? 0) + 1)
    }
  }
  const byKey: Record<string, number> = {}
  for (const k of [...tot.keys()].sort()) byKey[k] = safeDiv(met.get(k) ?? 0, tot.get(k) ?? 0)
  return { overall: safeDiv(m, t), byKey, counted: t }
}

/** Fulfilment minutes (paid → delivered) of delivered orders. */
export function fulfilmentMinutes(orders: readonly OrderRecord[]): number[] {
  const out: number[] = []
  for (const o of orders) if (isDelivered(o) && o.paidAt !== undefined && o.deliveredAt !== undefined) out.push((o.deliveredAt - o.paidAt) / MS.minute)
  return out
}
export const fulfilmentPercentiles = (orders: readonly OrderRecord[]): { p50: number; p90: number } => {
  const m = fulfilmentMinutes(orders)
  return { p50: percentile(m, 50), p90: percentile(m, 90) }
}

/** Queue age percentiles (minutes) of open tasks given their creation times. */
export function queueAge(openTaskCreatedAt: readonly number[], now: number): { p50: number; p90: number; max: number; depth: number } {
  const ages = openTaskCreatedAt.map((t) => Math.max(0, (now - t) / MS.minute))
  return { p50: percentile(ages, 50), p90: percentile(ages, 90), max: ages.length ? Math.max(...ages) : 0, depth: ages.length }
}

/** refunded / paid orders */
export function refundRate(orders: readonly OrderRecord[]): number {
  const paid = orders.filter(isPaid)
  return safeDiv(paid.filter((o) => o.status === 'refunded').length, paid.length)
}
/** fraud losses / GMV */
export const fraudLossRate = (orders: readonly OrderRecord[]): number => safeDiv(sum(orders.map((o) => o.fraudLossIrt ?? 0)), sum(orders.filter(isPaid).map((o) => o.gmvIrt)))
export function ticketsPer100Orders(tickets: readonly TicketRecord[], orderCount: number): number {
  return safeDiv(tickets.length * 100, orderCount)
}

// ───────────────────────── treasury / FX / concentration ─────────────────────────
/** committed / total float */
export const floatUtilisation = (floatUsdt: number, committedUsdt: number): number => safeDiv(committedUsdt, floatUsdt)
/** days of average outflow the float covers */
export const coverageDays = (floatUsdt: number, avgDailyUsdtOutflow: number): number => safeDiv(floatUsdt, avgDailyUsdtOutflow, Infinity)

export interface FxEffect {
  realisedIrt: number
  unrealisedIrt: number
  totalIrt: number
  /** FX result as a share of |operating profit ex-FX| (0 when operating profit is 0) */
  shareOfOperating: number
}
export function fxEffect(realisedIrt: number, unrealisedIrt: number, operatingProfitExFxIrt: number): FxEffect {
  const total = realisedIrt + unrealisedIrt
  return { realisedIrt, unrealisedIrt, totalIrt: total, shareOfOperating: safeDiv(total, Math.abs(operatingProfitExFxIrt)) }
}

/** Herfindahl–Hirschman index (0..1) of volume shares by key (provider/exchange concentration). */
export function herfindahl(volumeByKey: Readonly<Record<string, number>>): number {
  const tot = sum(Object.values(volumeByKey))
  if (tot <= 0) return 0
  return sum(Object.values(volumeByKey).map((v) => (v / tot) ** 2))
}

/** busy / available minutes (clamped 0..1.5 — overtime can exceed 1). */
export const operatorUtilisation = (busyMinutes: number, availableMinutes: number): number => Math.min(1.5, safeDiv(busyMinutes, availableMinutes))

// ───────────────────────── daily row ─────────────────────────
/** Build a contracts `KpiRow` (percent-like fields as fractions). */
export function buildKpiRow(d: DayInputs): KpiRow {
  const delivered = d.delivered
  const g = sum(delivered.map((o) => o.gmvIrt))
  const rev = sum(delivered.map((o) => o.revenueIrt))
  const c = sum(delivered.map((o) => o.cogsIrt))
  return {
    date: d.date,
    jalali: d.jalali,
    orders: d.ordersCreated,
    deliveredOrders: delivered.length,
    gmvIrt: g,
    revenueIrt: rev,
    cogsIrt: c,
    grossProfitIrt: rev - c,
    takeRatePct: safeDiv(rev - c, g),
    aovIrt: delivered.length ? g / delivered.length : 0,
    newCustomers: d.newCustomers,
    activeCustomers: d.activeCustomers,
    refundRatePct: safeDiv(d.refundedOrders, d.paidOrders),
    fraudLossIrt: d.fraudLossIrt,
    slaAttainmentPct: d.slaTotal > 0 ? d.slaMet / d.slaTotal : 1,
    fulfilmentP50Min: percentile(d.fulfilmentMinutes, 50),
    fulfilmentP90Min: percentile(d.fulfilmentMinutes, 90),
    queueDepth: d.queueDepth,
    usdtMid: d.usdtMid,
    floatUsdt: d.floatUsdt,
    coverageDays: d.coverageDays,
    cashIrt: d.cashIrt,
    fxRevaluationIrt: d.fxRevaluationIrt,
  }
}

/** Aggregate daily rows into a period summary (volume sums, weighted ratios). */
export function summariseKpiRows(rows: readonly KpiRow[]): {
  orders: number
  deliveredOrders: number
  gmvIrt: number
  revenueIrt: number
  grossProfitIrt: number
  takeRatePct: number
  aovIrt: number
  newCustomers: number
  refundRatePct: number
  fraudLossIrt: number
  fraudLossRatePct: number
  slaAttainmentPct: number
  fulfilmentP90Min: number
  fxRevaluationIrt: number
} {
  const orders = sum(rows.map((r) => r.orders))
  const delivered = sum(rows.map((r) => r.deliveredOrders))
  const g = sum(rows.map((r) => r.gmvIrt))
  const gp = sum(rows.map((r) => r.grossProfitIrt))
  return {
    orders,
    deliveredOrders: delivered,
    gmvIrt: g,
    revenueIrt: sum(rows.map((r) => r.revenueIrt)),
    grossProfitIrt: gp,
    takeRatePct: safeDiv(gp, g),
    aovIrt: safeDiv(g, delivered),
    newCustomers: sum(rows.map((r) => r.newCustomers)),
    refundRatePct: safeDiv(sum(rows.map((r) => r.refundRatePct * r.deliveredOrders)), delivered),
    fraudLossIrt: sum(rows.map((r) => r.fraudLossIrt)),
    fraudLossRatePct: safeDiv(sum(rows.map((r) => r.fraudLossIrt)), g),
    slaAttainmentPct: safeDiv(sum(rows.map((r) => r.slaAttainmentPct * r.deliveredOrders)), delivered, 1),
    fulfilmentP90Min: percentile(rows.map((r) => r.fulfilmentP90Min).filter((x) => x > 0), 50),
    fxRevaluationIrt: sum(rows.map((r) => r.fxRevaluationIrt)),
  }
}

/** Jalali month key helper re-export for grouping daily rows. */
export const monthKeyOfDate = (isoDate: string, parse: (iso: string) => number): string => jalaliMonthKey(parse(isoDate))
