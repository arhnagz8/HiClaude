/**
 * Financial statement & KPI shapes derived from the ledger. [CONTRACT]
 * Produced by app/ReportService, consumed by admin UI and by the simulator's Accountant/report generator.
 */
import type { EpochMs, Irt, MicroUsdt } from './units'

export interface StatementLine {
  code: string
  name: string
  amountIrt: Irt
  children?: StatementLine[]
}

export interface Period {
  from: EpochMs
  to: EpochMs
  /** e.g. "مهر ۱۴۰۵" */
  labelFa: string
  /** e.g. "1405-07" */
  key: string
}

export interface IncomeStatement {
  period: Period
  revenue: StatementLine[]
  totalRevenue: Irt
  cogs: StatementLine[]
  totalCogs: Irt
  grossProfit: Irt
  grossMarginPct: number
  opex: StatementLine[]
  totalOpex: Irt
  operatingProfit: Irt
  /** FX revaluation, penalties, other. */
  other: StatementLine[]
  totalOther: Irt
  profitBeforeTax: Irt
  incomeTax: Irt
  netProfit: Irt
  netMarginPct: number
  /** FX effect separated from operating result (decision-useful). */
  fxRevaluationIrt: Irt
  operatingProfitExFx: Irt
}

export interface BalanceSheet {
  asOf: EpochMs
  assets: StatementLine[]
  totalAssets: Irt
  liabilities: StatementLine[]
  totalLiabilities: Irt
  equity: StatementLine[]
  totalEquity: Irt
  /** assets − liabilities − equity; MUST be 0. */
  check: Irt
  usdtHoldings: { qtyMicro: MicroUsdt; bookIrt: Irt; marketIrt: Irt }
}

export interface CashFlowStatement {
  period: Period
  openingCashIrt: Irt
  /** Net profit adjusted for non-cash items and working-capital changes (incl. USDT inventory build-up). */
  operating: StatementLine[]
  totalOperating: Irt
  financing: StatementLine[]
  totalFinancing: Irt
  netChangeIrt: Irt
  closingCashIrt: Irt
  /** closing − (opening + net change); MUST be 0. */
  check: Irt
}

export interface Statements {
  period: Period
  income: IncomeStatement
  balance: BalanceSheet
  cashflow: CashFlowStatement
}

export interface KpiRow {
  date: string // IRST ISO date
  jalali: string
  orders: number
  deliveredOrders: number
  gmvIrt: Irt
  revenueIrt: Irt
  cogsIrt: Irt
  grossProfitIrt: Irt
  takeRatePct: number
  aovIrt: Irt
  newCustomers: number
  activeCustomers: number
  refundRatePct: number
  fraudLossIrt: Irt
  slaAttainmentPct: number
  fulfilmentP50Min: number
  fulfilmentP90Min: number
  queueDepth: number
  usdtMid: number
  floatUsdt: number
  coverageDays: number
  cashIrt: Irt
  fxRevaluationIrt: Irt
}

export interface UnitEconomics {
  costIrt: Irt
  marginIrt: Irt
  feesIrt: Irt
  bufferIrt: Irt
  vatIrt: Irt
  rushIrt: Irt
  grossMarginPct: number
}
