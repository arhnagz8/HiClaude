/** Headline metrics derived from a RunResultLike (pure). Used by report.html, summary.md and the comparison/sensitivity tooling. */
import { irstIsoDate, type KpiRow, type Statements } from '@hiclaude/contracts'
import { safeDiv, sum } from '../demand/common'
import { breakEvenMonth, cumulativeBreakEvenMonth, maxDrawdown, roiOnCapital, runwayDays, type MonthlyPoint } from '../kpi/finance'
import type { MacroPoint, RunResultLike } from './types'

const PCT_FIELDS = ['takeRatePct', 'refundRatePct', 'slaAttainmentPct'] as const

/** Some producers emit 0-100 percentages; project convention is fractions. Auto-detect per field and rescale. */
export function normaliseKpis(rows: readonly KpiRow[]): KpiRow[] {
  const scale: Record<string, number> = {}
  for (const f of PCT_FIELDS) {
    let mx = 0
    for (const r of rows) mx = Math.max(mx, Math.abs(r[f]))
    scale[f] = mx > 1.5 ? 0.01 : 1
  }
  if (PCT_FIELDS.every((f) => scale[f] === 1)) return rows as KpiRow[]
  return rows.map((r) => ({ ...r, takeRatePct: r.takeRatePct * (scale.takeRatePct as number), refundRatePct: r.refundRatePct * (scale.refundRatePct as number), slaAttainmentPct: r.slaAttainmentPct * (scale.slaAttainmentPct as number) }))
}

export const periodIso = (s: Statements): string => irstIsoDate(s.period.to)

export function monthlyPoints(run: RunResultLike): MonthlyPoint[] {
  return run.statements.map((s) => ({ key: s.period.key, to: s.period.to, netProfitIrt: s.income.netProfit, operatingProfitIrt: s.income.operatingProfit, equityIrt: s.balance.totalEquity }))
}

/** Index value at (or just before) a date from a macro series (sorted by date). */
export function macroAt(macro: readonly MacroPoint[] | undefined, iso: string): MacroPoint | undefined {
  if (!macro || macro.length === 0) return undefined
  let lo = 0
  let hi = macro.length - 1
  if (iso <= (macro[0] as MacroPoint).date) return macro[0]
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if ((macro[mid] as MacroPoint).date <= iso) lo = mid
    else hi = mid - 1
  }
  return macro[lo]
}

export interface ViewTotals {
  revenueIrt: number
  grossProfitIrt: number
  netProfitIrt: number
}

export interface Headline {
  months: number
  revenueIrt: number
  cogsIrt: number
  grossProfitIrt: number
  opexIrt: number
  netProfitIrt: number
  grossMarginPct: number
  netMarginPct: number
  gmvIrt: number
  orders: number
  deliveredOrders: number
  aovIrt: number
  takeRatePct: number
  cashIrt: number
  /** null = not burning cash */
  runwayDays: number | null
  breakEven: { key: string; index: number } | null
  cumulativeBreakEven: { key: string; index: number } | null
  capitalContributedIrt: number
  drawsIrt: number
  endingEquityIrt: number
  roi: number
  maxDrawdownFraction: number
  maxDrawdownIrt: number
  slaPct: number
  refundRatePct: number
  fraudLossRatePct: number
  fxRevaluationIrt: number
  views: { nominal: ViewTotals; real: ViewTotals | null; usd: ViewTotals | null }
  capitalDerived: boolean
}

export function computeHeadline(run: RunResultLike): Headline {
  const st = run.statements
  const kp = normaliseKpis(run.kpis)
  const revenue = sum(st.map((s) => s.income.totalRevenue))
  const cogs = sum(st.map((s) => s.income.totalCogs))
  const gross = sum(st.map((s) => s.income.grossProfit))
  const opex = sum(st.map((s) => s.income.totalOpex))
  const net = sum(st.map((s) => s.income.netProfit))
  const gmv = sum(kp.map((r) => r.gmvIrt))
  const delivered = sum(kp.map((r) => r.deliveredOrders))
  const last = kp[kp.length - 1]
  const lastSt = st[st.length - 1]
  const cash = last?.cashIrt ?? lastSt?.cashflow.closingCashIrt ?? 0
  const recent = st.slice(-3)
  const days = sum(recent.map((s) => Math.max(1, (s.period.to - s.period.from) / 86_400_000)))
  const opFlow = sum(recent.map((s) => s.cashflow.totalOperating))
  const rw = runwayDays(cash, days > 0 ? opFlow / days : 0)
  const pts = monthlyPoints(run)
  const be = breakEvenMonth(pts)
  const cbe = cumulativeBreakEvenMonth(pts)
  let injections = run.capital?.injectionsIrt
  let draws = run.capital?.drawsIrt
  const initial = run.capital?.initialIrt ?? run.manifest.capitalInitialIrt
  let derived = false
  if (injections === undefined || draws === undefined) {
    derived = true
    injections = sum(st.map((s) => Math.max(0, s.cashflow.totalFinancing)))
    draws = sum(st.map((s) => Math.max(0, -s.cashflow.totalFinancing)))
    // the initial capital shows up as financing in month 1 – do not double count it
    injections = Math.max(0, injections - initial)
  }
  const contributed = initial + injections
  const equity = lastSt?.balance.totalEquity ?? 0
  const dd = maxDrawdown([contributed > 0 ? initial : 0, ...st.map((s) => s.balance.totalEquity)])
  const nominal: ViewTotals = { revenueIrt: revenue, grossProfitIrt: gross, netProfitIrt: net }
  let real: ViewTotals | null = null
  if (run.macro && run.macro.length > 0) {
    const rr = { revenueIrt: 0, grossProfitIrt: 0, netProfitIrt: 0 }
    for (const s of st) {
      const idx = macroAt(run.macro, periodIso(s))?.inflationIndex ?? 1
      rr.revenueIrt += s.income.totalRevenue / idx
      rr.grossProfitIrt += s.income.grossProfit / idx
      rr.netProfitIrt += s.income.netProfit / idx
    }
    real = rr
  }
  let usd: ViewTotals | null = null
  {
    const uu = { revenueIrt: 0, grossProfitIrt: 0, netProfitIrt: 0 }
    let ok = false
    for (const s of st) {
      const mid = macroAt(run.macro, periodIso(s))?.usdtMid ?? kp.find((r) => r.date === periodIso(s))?.usdtMid
      if (!mid) continue
      ok = true
      uu.revenueIrt += s.income.totalRevenue / mid
      uu.grossProfitIrt += s.income.grossProfit / mid
      uu.netProfitIrt += s.income.netProfit / mid
    }
    usd = ok ? uu : null
  }
  const paid = sum(kp.map((r) => r.deliveredOrders))
  return {
    months: st.length,
    revenueIrt: revenue,
    cogsIrt: cogs,
    grossProfitIrt: gross,
    opexIrt: opex,
    netProfitIrt: net,
    grossMarginPct: safeDiv(gross, revenue),
    netMarginPct: safeDiv(net, revenue),
    gmvIrt: gmv,
    orders: sum(kp.map((r) => r.orders)),
    deliveredOrders: delivered,
    aovIrt: safeDiv(gmv, delivered),
    takeRatePct: safeDiv(sum(kp.map((r) => r.grossProfitIrt)), gmv),
    cashIrt: cash,
    runwayDays: Number.isFinite(rw) ? rw : null,
    breakEven: be ? { key: be.key, index: pts.findIndex((p) => p.key === be.key) } : null,
    cumulativeBreakEven: cbe ? { key: cbe.key, index: pts.findIndex((p) => p.key === cbe.key) } : null,
    capitalContributedIrt: contributed,
    drawsIrt: draws,
    endingEquityIrt: equity,
    roi: roiOnCapital(equity, draws, contributed),
    maxDrawdownFraction: dd.fraction,
    maxDrawdownIrt: dd.absolute,
    slaPct: safeDiv(sum(kp.map((r) => r.slaAttainmentPct * r.deliveredOrders)), paid, 1),
    refundRatePct: safeDiv(sum(kp.map((r) => r.refundRatePct * r.deliveredOrders)), paid),
    fraudLossRatePct: safeDiv(sum(kp.map((r) => r.fraudLossIrt)), gmv),
    fxRevaluationIrt: sum(st.map((s) => s.income.fxRevaluationIrt)),
    views: { nominal, real, usd },
    capitalDerived: derived,
  }
}
