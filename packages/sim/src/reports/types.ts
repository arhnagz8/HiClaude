/**
 * RunResultLike: the plain data a finished simulation hands to the report generator, comparison and sensitivity tooling.
 * Only `manifest`, `statements` and `kpis` are required; everything else is optional and degrades gracefully (a chart without data is omitted).
 * Percent-like `*Pct` fields are FRACTIONS (0.18 = 18 %), the project convention; the generator tolerates 0-100 series by auto-detecting them.
 */
import type { KpiRow, Statements } from '@hiclaude/contracts'
import type { CohortMatrix, GroupMargin } from '../kpi/types'
import type { DecisionLogEntry } from '../owner/schedule'

export interface RunManifest {
  scenarioId: string
  title?: string
  seed: number
  /** IRST ISO date */
  start: string
  end: string
  years: number
  paramsHash: string
  ledgerHash: string
  gitRev?: string
  codeVersion?: string
  runtimeMs?: number
  ownerPolicy?: string
  /** initial capital (Toman) */
  capitalInitialIrt: number
  notes?: string[]
}

export interface IdentityCheck {
  /** period key e.g. "1405-07" or "all" */
  period: string
  name: string
  ok: boolean
  /** absolute discrepancy in the unit of the check (0 when ok) */
  delta?: number
  detail?: string
}

export interface MacroPoint {
  date: string
  usdtMid: number
  /** Toman CPI, 1 at start */
  inflationIndex?: number
  regime?: string
}

export interface EventMarker {
  date: string
  label: string
  type: string
  severity?: 'info' | 'warning' | 'critical'
  endDate?: string
}

export interface MonthlyOps {
  month: string
  operatorUtilisation: number
  headcount: number
  queueAgeP90Min: number
  overtimeHours?: number
  supportTickets?: number
}

export interface MonthlyMarketing {
  month: string
  spendIrt: number
  newCustomers: number
  cac: number | null
  ltv: number | null
}

export interface CompetitorPoint {
  date: string
  /** our price / reference price */
  ours: number
  /** competitor price / reference price (market average) */
  market: number
  byCompetitor?: Record<string, number>
}

export interface TornadoRow {
  param: string
  label: string
  lowLabel: string
  highLabel: string
  /** metric under the low / high setting (mean over seeds) */
  lowValue: number
  highValue: number
  baseValue: number
  /** cross-seed standard deviation of the base metric (noise reference) */
  noise?: number
}
export interface TornadoData {
  metric: string
  metricLabel: string
  unit: 'IRT' | 'pct' | 'count' | 'days'
  base: number
  rows: TornadoRow[]
  seeds: number
}

export interface CapitalFlows {
  initialIrt: number
  injectionsIrt: number
  drawsIrt: number
}

export interface AssumptionRow {
  name: string
  value: string
  source: string
}

export interface RunResultLike {
  manifest: RunManifest
  /** monthly statements, chronological */
  statements: Statements[]
  /** daily KPI rows, chronological */
  kpis: KpiRow[]
  identityChecks?: IdentityCheck[]
  macro?: MacroPoint[]
  events?: EventMarker[]
  margins?: { byFamily?: GroupMargin[]; byProvider?: GroupMargin[]; byChannel?: GroupMargin[]; byMethod?: GroupMargin[]; bySegment?: GroupMargin[] }
  cohorts?: CohortMatrix
  marketing?: MonthlyMarketing[]
  operators?: MonthlyOps[]
  competitors?: CompetitorPoint[]
  capital?: CapitalFlows
  decisions?: readonly DecisionLogEntry[]
  assumptions?: AssumptionRow[]
  sensitivity?: TornadoData
  /** free-form extra files for the report folder (name → JSON-serialisable) e.g. treasury, orders_summary */
  extraFiles?: Record<string, unknown>
}

export type ReportLang = 'fa' | 'en'
