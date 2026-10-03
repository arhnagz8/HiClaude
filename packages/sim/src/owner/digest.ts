/**
 * digest.json for owner checkpoints (LLM persona): last-period KPIs vs previous, statement headline, cash/runway, float/coverage,
 * rate path summary, alerts, SLA, top issues (ranked, rule-based) and last decisions. Persian + English headline.
 */
import { formatIrtCompact, formatPct, toPersianDigits } from '@hiclaude/contracts'
import type { DecisionLogEntry } from './schedule'
import type { OwnerObservation, PeriodKpis } from './types'

export interface DigestIssue {
  severity: 'info' | 'warning' | 'critical'
  code: string
  messageEn: string
  messageFa: string
  metric?: number
}

export interface Digest {
  schema: 'hiclaude.digest/1'
  asOf: string
  dayIndex: number
  windowDays: number
  headlineEn: string
  headlineFa: string
  kpis: { current: PeriodKpis; previous?: PeriodKpis; deltaPct: Record<string, number | null> }
  statementsHeadline: { revenueIrt: number; grossProfitIrt: number; netProfitIrt: number | null; cashIrt: number; equityIrt: number | null }
  cash: { cashIrt: number; burnPerDayIrt: number; runwayDays: number | null; opexPerMonthIrt: number }
  treasury: { floatUsdt: number; coverageDays: number; targetCoverageDays: number }
  rates: { usdtMid: number; change7dPct: number | null; change30dPct: number | null; dailyVolPct: number; driftPctPerDay: number; regime: string | null; realisedFxResultIrt: number; unrealisedFxResultIrt: number }
  sla: { attainment: number; queueAgeP90Min: number; queueDepth: number; operatorUtilisation: number }
  staff: { operators: number; byShift: Record<string, number> }
  marketing: { monthlyBudgetIrt: number; blendedCac: number | null; ltvToCac: number | null }
  families: Record<string, { conversionRate: number; marginPct: number; orders: number }>
  alerts: Array<{ code: string; severity: string; message: string }>
  topIssues: DigestIssue[]
  lastDecisions: Array<{ date: string; source: string; summary: string; rationale: string }>
}

const delta = (a: number, b: number | undefined): number | null => (b === undefined || b === 0 ? null : (a - b) / Math.abs(b))
const finiteOrNull = (x: number): number | null => (Number.isFinite(x) ? x : null)

export function rankIssues(o: OwnerObservation, targets: { slaMinutes?: number; slaAttainment?: number } = {}): DigestIssue[] {
  const out: DigestIssue[] = []
  const slaMin = targets.slaMinutes ?? 120
  const slaTarget = targets.slaAttainment ?? 0.9
  if (o.cash.runwayDays < 30 && o.cash.burnPerDayIrt > 0) out.push({ severity: 'critical', code: 'runway.short', metric: o.cash.runwayDays, messageEn: `Runway ${o.cash.runwayDays.toFixed(0)} days at current burn`, messageFa: `کفاف نقدی ${toPersianDigits(Math.round(o.cash.runwayDays))} روز با نرخ مصرف فعلی` })
  else if (o.cash.runwayDays < 90 && o.cash.burnPerDayIrt > 0) out.push({ severity: 'warning', code: 'runway.low', metric: o.cash.runwayDays, messageEn: `Runway ${o.cash.runwayDays.toFixed(0)} days`, messageFa: `کفاف نقدی ${toPersianDigits(Math.round(o.cash.runwayDays))} روز` })
  for (const a of o.alerts) if (a.severity !== 'info') out.push({ severity: a.severity, code: a.code, messageEn: a.message, messageFa: a.message })
  if (o.kpi.slaAttainment < slaTarget) out.push({ severity: o.kpi.slaAttainment < 0.75 ? 'critical' : 'warning', code: 'sla.low', metric: o.kpi.slaAttainment, messageEn: `SLA attainment ${(o.kpi.slaAttainment * 100).toFixed(0)}% < ${(slaTarget * 100).toFixed(0)}%`, messageFa: `رعایت SLA ${formatPct(o.kpi.slaAttainment, 0)} (هدف ${formatPct(slaTarget, 0)})` })
  if (o.kpi.queueAgeP90Min > slaMin) out.push({ severity: 'warning', code: 'queue.aged', metric: o.kpi.queueAgeP90Min, messageEn: `Queue age p90 ${o.kpi.queueAgeP90Min.toFixed(0)} min (> ${slaMin})`, messageFa: `سن صف (صدک ۹۰) ${toPersianDigits(Math.round(o.kpi.queueAgeP90Min))} دقیقه` })
  if (o.kpi.refundRate > 0.05) out.push({ severity: 'warning', code: 'refund.high', metric: o.kpi.refundRate, messageEn: `Refund rate ${(o.kpi.refundRate * 100).toFixed(1)}%`, messageFa: `نرخ بازپرداخت ${formatPct(o.kpi.refundRate)}` })
  if (o.kpi.fraudLossRate > 0.005) out.push({ severity: 'warning', code: 'fraud.high', metric: o.kpi.fraudLossRate, messageEn: `Fraud losses ${(o.kpi.fraudLossRate * 100).toFixed(2)}% of GMV`, messageFa: `زیان کلاهبرداری ${formatPct(o.kpi.fraudLossRate, 2)} از GMV` })
  if (o.treasury.coverageDays < Math.max(1, o.treasury.targetCoverageDays * 0.5)) out.push({ severity: 'warning', code: 'float.low', metric: o.treasury.coverageDays, messageEn: `Float covers ${o.treasury.coverageDays.toFixed(1)} days (target ${o.treasury.targetCoverageDays})`, messageFa: `پوشش ذخیره تتر ${toPersianDigits(o.treasury.coverageDays.toFixed(1))} روز (هدف ${toPersianDigits(o.treasury.targetCoverageDays)})` })
  const gp = Math.max(1, o.kpi.grossProfitIrt)
  if (o.fx.realisedFxResultIrt < 0 && -o.fx.realisedFxResultIrt / gp > 0.25) out.push({ severity: 'warning', code: 'fx.loss', metric: -o.fx.realisedFxResultIrt / gp, messageEn: `Realised FX loss is ${((-o.fx.realisedFxResultIrt / gp) * 100).toFixed(0)}% of gross profit`, messageFa: `زیان ارزی تحقق‌یافته ${formatPct(-o.fx.realisedFxResultIrt / gp, 0)} از سود ناخالص` })
  for (const [fam, f] of Object.entries(o.families)) if (f.quotes >= 40 && f.conversionRate < 0.05) out.push({ severity: 'info', code: `family.uncompetitive:${fam}`, metric: f.conversionRate, messageEn: `${fam}: win rate ${(f.conversionRate * 100).toFixed(1)}% — likely uncompetitive`, messageFa: `${fam}: نرخ تبدیل ${formatPct(f.conversionRate)} — احتمالاً غیررقابتی` })
  const rank = { critical: 0, warning: 1, info: 2 } as const
  return out.sort((a, b) => rank[a.severity] - rank[b.severity] || (a.code < b.code ? -1 : 1)).slice(0, 8)
}

export function buildDigest(obs: OwnerObservation, lastDecisions: readonly DecisionLogEntry[], opts: { lastN?: number; targets?: { slaMinutes?: number; slaAttainment?: number } } = {}): Digest {
  const k = obs.kpi
  const p = obs.prevKpi
  const issues = rankIssues(obs, opts.targets)
  const deltaPct: Record<string, number | null> = {
    orders: delta(k.orders, p?.orders),
    gmvIrt: delta(k.gmvIrt, p?.gmvIrt),
    revenueIrt: delta(k.revenueIrt, p?.revenueIrt),
    grossProfitIrt: delta(k.grossProfitIrt, p?.grossProfitIrt),
    takeRate: delta(k.takeRate, p?.takeRate),
    slaAttainment: delta(k.slaAttainment, p?.slaAttainment),
  }
  const runway = finiteOrNull(obs.cash.runwayDays)
  const mid = obs.fx.usdtMid
  const headlineEn = `Day ${obs.dayIndex} (${obs.date}): ${k.orders} orders, GMV ${Math.round(k.gmvIrt / 1e6).toLocaleString('en-US')}M IRT, gross profit ${Math.round(k.grossProfitIrt / 1e6).toLocaleString('en-US')}M, cash ${Math.round(obs.cash.cashIrt / 1e6).toLocaleString('en-US')}M, runway ${runway === null ? 'n/a (not burning)' : `${runway.toFixed(0)}d`}, SLA ${(k.slaAttainment * 100).toFixed(0)}%, USDT ${Math.round(mid).toLocaleString('en-US')}.`
  const headlineFa = `روز ${toPersianDigits(obs.dayIndex)} (${toPersianDigits(obs.date)}): ${toPersianDigits(k.orders)} سفارش، GMV ${formatIrtCompact(k.gmvIrt)}، سود ناخالص ${formatIrtCompact(k.grossProfitIrt)}، نقدینگی ${formatIrtCompact(obs.cash.cashIrt)}، کفاف ${runway === null ? 'نامحدود' : `${toPersianDigits(Math.round(runway))} روز`}، SLA ${formatPct(k.slaAttainment, 0)}، تتر ${toPersianDigits(Math.round(mid))} تومان.`
  const families: Digest['families'] = {}
  for (const f of Object.keys(obs.families).sort()) families[f] = { conversionRate: obs.families[f]!.conversionRate, marginPct: obs.families[f]!.marginPct, orders: obs.families[f]!.orders }
  return {
    schema: 'hiclaude.digest/1',
    asOf: obs.date,
    dayIndex: obs.dayIndex,
    windowDays: k.windowDays,
    headlineEn,
    headlineFa,
    kpis: { current: k, previous: p, deltaPct },
    statementsHeadline: { revenueIrt: k.revenueIrt, grossProfitIrt: k.grossProfitIrt, netProfitIrt: k.netProfitIrt ?? obs.cash.netProfitLast30dIrt ?? null, cashIrt: obs.cash.cashIrt, equityIrt: obs.cash.equityIrt ?? null },
    cash: { cashIrt: obs.cash.cashIrt, burnPerDayIrt: obs.cash.burnPerDayIrt, runwayDays: runway, opexPerMonthIrt: obs.cash.opexPerMonthIrt },
    treasury: obs.treasury,
    rates: {
      usdtMid: mid,
      change7dPct: obs.fx.mid7dAgo ? (mid - obs.fx.mid7dAgo) / obs.fx.mid7dAgo : null,
      change30dPct: obs.fx.mid30dAgo ? (mid - obs.fx.mid30dAgo) / obs.fx.mid30dAgo : null,
      dailyVolPct: obs.fx.dailyVolPct,
      driftPctPerDay: obs.fx.driftPctPerDay,
      regime: obs.fx.regime ?? null,
      realisedFxResultIrt: obs.fx.realisedFxResultIrt,
      unrealisedFxResultIrt: obs.fx.unrealisedFxResultIrt,
    },
    sla: { attainment: k.slaAttainment, queueAgeP90Min: k.queueAgeP90Min, queueDepth: k.queueDepth, operatorUtilisation: k.operatorUtilisation },
    staff: obs.staff,
    marketing: { monthlyBudgetIrt: obs.marketing.monthlyBudgetIrt, blendedCac: obs.marketing.blendedCac ?? null, ltvToCac: obs.marketing.ltvToCac ?? null },
    families,
    alerts: obs.alerts,
    topIssues: issues,
    lastDecisions: lastDecisions.slice(-(opts.lastN ?? 10)).map((e) => ({ date: e.date, source: e.source, summary: e.summary, rationale: e.rationale })),
  }
}
