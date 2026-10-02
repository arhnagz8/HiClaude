/**
 * HTTP DTOs and request schemas shared by apps/api and apps/web. [CONTRACT]
 * Additive changes only (never rename/remove). Internal fields (cost, margin, risk scores) never appear in customer DTOs.
 */
import { z } from 'zod'
import type { AmountSpec, DeliverySummary, FulfilmentMode, OrderStatus, PaymentMethod, ProductInput, ProductKind, RateStatus, RiskLabel, RushTierId, TaskKind, TaskStatus } from './domain'
import type { BrandParams } from './params'
import type { EpochMs, Irt, MicroUsdt, Network, UsdCents } from './units'
import type { KpiRow, Statements } from './reports'

// ───────────────────────────── request schemas ─────────────────────────────
export const OtpRequestSchema = z.object({ phone: z.string().min(10).max(16) })
export const OtpVerifySchema = z.object({ phone: z.string().min(10).max(16), code: z.string().min(4).max(8), referralCode: z.string().optional() })
export const MessengerAuthSchema = z.object({ platform: z.enum(['telegram', 'bale']), initData: z.string().min(1), referralCode: z.string().optional() })
export const KycSchema = z.object({ nationalId: z.string().length(10), fullName: z.string().min(3).max(80) })

export const QuoteRequestSchema = z.object({
  productId: z.string(),
  amountUsdCents: z.number().int().positive().optional(),
  rushTier: z.string().default('normal'),
  inputs: z.record(z.string(), z.string()).default({}),
})
export const OrderCreateSchema = z.object({
  quoteId: z.string(),
  method: z.enum(['gateway', 'card_to_card', 'bank_transfer', 'usdt', 'wallet']),
  network: z.enum(['TRC20', 'BEP20', 'TON', 'ERC20', 'POLYGON', 'SOLANA', 'ARBITRUM']).optional(),
  inputs: z.record(z.string(), z.string()).default({}),
  referralCode: z.string().optional(),
})
export const ReceiptSchema = z.object({
  trackingNo: z.string().max(40).optional(),
  payerCardLast4: z.string().regex(/^\d{4}$/).optional(),
  paidAt: z.number().int().optional(),
  imageDataUrl: z.string().max(2_000_000).optional(),
})
export const DisputeSchema = z.object({ reasonFa: z.string().min(5).max(500) })
export const TicketCreateSchema = z.object({ subject: z.string().min(3).max(120), message: z.string().min(3).max(2000), orderId: z.string().optional() })
export const TicketMessageSchema = z.object({ message: z.string().min(1).max(2000) })
export const WalletTopupSchema = z.object({ amountIrt: z.number().int().positive(), method: z.enum(['gateway', 'card_to_card']) })

export const KillSwitchSchema = z.object({ on: z.boolean(), reason: z.string().min(3), scope: z.enum(['all', 'rates', 'provider', 'product']).default('all'), scopeId: z.string().optional() })
export const TaskCompleteSchema = z.object({
  /** card: pan/exp/cvv; voucher: code; service: receipt reference */
  kind: z.enum(['card', 'voucher', 'receipt', 'note']),
  card: z.object({ cardRef: z.string(), pan: z.string(), expMonth: z.number().int(), expYear: z.number().int(), cvv: z.string(), holderName: z.string().optional(), brand: z.enum(['visa', 'mastercard']).optional() }).optional(),
  voucherCode: z.string().optional(),
  receiptRef: z.string().optional(),
  noteFa: z.string().optional(),
  /** actual provider fee/face consumed, USD cents (for cost reconciliation) */
  actualFundingUsdCents: z.number().int().nonnegative().optional(),
})
export const TaskFailSchema = z.object({ reason: z.string().min(3), retryable: z.boolean().default(true) })
export const TreasuryActionSchema = z.object({
  type: z.enum(['buy', 'withdraw', 'sweep']),
  exchangeId: z.string().optional(),
  providerId: z.string().optional(),
  amountIrt: z.number().int().positive().optional(),
  amountMicroUsdt: z.number().int().positive().optional(),
  network: z.enum(['TRC20', 'BEP20', 'TON', 'ERC20', 'POLYGON', 'SOLANA', 'ARBITRUM']).optional(),
})
export const SimAdvanceSchema = z.object({ minutes: z.number().positive().max(60 * 24 * 31) })
export const SimEventSchema = z.object({ type: z.string(), params: z.record(z.string(), z.unknown()).default({}) })
export const SimScenarioSchema = z.object({ id: z.string(), seed: z.number().int().default(1) })

export type QuoteRequest = z.infer<typeof QuoteRequestSchema>
export type OrderCreate = z.infer<typeof OrderCreateSchema>
export type ReceiptInput = z.infer<typeof ReceiptSchema>
export type TaskComplete = z.infer<typeof TaskCompleteSchema>

// ───────────────────────────── public / customer DTOs ─────────────────────────────
export interface RushTierDto {
  id: RushTierId
  labelFa: string
  slaMinutes: number
  available: boolean
  etaMinutes?: number
}

export interface PaymentMethodDto {
  method: PaymentMethod
  enabled: boolean
  labelFa: string
  noteFa?: string
  minIrt?: Irt
  maxIrt?: Irt
}

export interface RateBoardDto {
  /** Indicative Toman price of 1 USD of service on a typical top-up (our sell rate). */
  usdSellIrt: number
  usdtBuyIrt: number
  usdtSellIrt: number
  asOf: EpochMs
  status: RateStatus
  change24hPct?: number
  sparkline: number[]
}

export interface PublicConfigDto {
  brand: BrandParams
  now: EpochMs
  rateBoard: RateBoardDto
  paymentMethods: PaymentMethodDto[]
  rushTiers: RushTierDto[]
  banner?: { severity: 'info' | 'warning' | 'critical'; textFa: string }
  killSwitch: boolean
  legal: { termsUrl: string; privacyUrl: string; refundUrl: string; riskUrl: string }
  demo?: boolean
}

export interface ProductDto {
  id: string
  slug: string
  kind: ProductKind
  category: string
  family: string
  titleFa: string
  descriptionFa: string
  amount: AmountSpec
  inputs: ProductInput[]
  fulfilmentMode: FulfilmentMode
  slaMinutes: Record<RushTierId, number>
  riskLabel: RiskLabel
  restrictionNoteFa?: string
  /** Cheapest total payable right now (Toman), computed live. */
  fromPriceIrt?: Irt
  tags: string[]
  active: boolean
}

export interface QuoteLineDto {
  code: string
  labelFa: string
  amountIrt: Irt
}

export interface QuoteMethodDto {
  method: PaymentMethod
  currency: 'IRT' | 'USDT'
  totalIrt?: Irt
  totalMicroUsdt?: MicroUsdt
  feeIrt: Irt
  lines: QuoteLineDto[]
  effectiveRateIrtPerUsd: number
  available: boolean
  unavailableReasonFa?: string
}

export interface QuoteDto {
  id: string
  productId: string
  amountUsdCents: UsdCents
  rushTier: RushTierId
  createdAt: EpochMs
  lockedUntil: EpochMs
  rateAsOf: EpochMs
  perMethod: QuoteMethodDto[]
  warnings: string[]
  /** Optional truthful comparison vs the market (shown only when we are cheaper than the reference). */
  savingsVsMarketPct?: number
}

export interface PaymentInstructionsDto {
  method: PaymentMethod
  currency: 'IRT' | 'USDT'
  amount: number
  expiresAt: EpochMs
  gateway?: { payUrl: string }
  cardToCard?: { cardNumber: string; holderFa: string; bankFa: string; exactAmountIrt: Irt; receiptRequired: boolean }
  bankTransfer?: { ibanFa: string; holderFa: string; exactAmountIrt: Irt; referenceCode: string }
  usdt?: { network: Network; address: string; memo?: string; amountMicroUsdt: MicroUsdt; confirmationsRequired: number }
  wallet?: { balanceIrt: Irt }
}

export interface OrderEventDto {
  at: EpochMs
  type: string
  labelFa: string
  to?: OrderStatus
}

export interface OrderDto {
  id: string
  code: string
  status: OrderStatus
  statusLabelFa: string
  productId: string
  productTitleFa: string
  amountUsdCents: UsdCents
  rushTier: RushTierId
  method: PaymentMethod
  currency: 'IRT' | 'USDT'
  payAmount: number
  createdAt: EpochMs
  payExpiresAt: EpochMs
  paidAt?: EpochMs
  deliveredAt?: EpochMs
  slaDueAt?: EpochMs
  payment?: PaymentInstructionsDto
  delivery?: DeliverySummary
  timeline: OrderEventDto[]
  canCancel: boolean
  canReveal: boolean
  canConfirm: boolean
  canDispute: boolean
  etaFa?: string
}

export interface RevealDto {
  kind: 'card' | 'voucher' | 'receipt' | 'note'
  card?: { pan: string; expMonth: number; expYear: number; cvv: string; holderName?: string; billingAddress?: Record<string, string> }
  voucherCode?: string
  noteFa?: string
  /** After this time the reveal token is void. */
  expiresAt: EpochMs
  remainingReveals: number
}

export interface MeDto {
  id: string
  phone: string
  name?: string
  tier: 'new' | 'verified' | 'trusted'
  kycStatus: 'none' | 'pending' | 'verified'
  limits: { maxOrderUsdCents: UsdCents; maxDailyUsdCents: UsdCents; usedTodayUsdCents: UsdCents }
  walletIrt: Irt
  referralCode: string
}

export interface TicketDto {
  id: string
  subject: string
  status: 'open' | 'pending' | 'closed'
  orderId?: string
  createdAt: EpochMs
  updatedAt: EpochMs
  messages: { at: EpochMs; from: 'customer' | 'staff'; text: string }[]
}

// ───────────────────────────── admin DTOs ─────────────────────────────
export interface DashboardDto {
  now: EpochMs
  rate: { mid: number; executableAsk: number; executableBid: number; status: RateStatus; asOf: EpochMs }
  killSwitch: { on: boolean; reason?: string }
  today: { orders: number; gmvIrt: Irt; revenueIrt: Irt; profitIrt: Irt; newCustomers: number }
  queue: { awaitingPayment: number; paymentReview: number; queued: number; fulfilling: number; riskHold: number; overdueSla: number }
  treasury: { floatUsdt: MicroUsdt; coverageDays: number; cashIrt: Irt; nextActionFa?: string }
  alerts: { severity: 'info' | 'warning' | 'critical'; code: string; messageFa: string; at: EpochMs }[]
  kpis: KpiRow[]
}

export interface TaskDto {
  id: string
  orderId: string
  orderCode: string
  kind: TaskKind
  status: TaskStatus
  priority: number
  rushTier: RushTierId
  createdAt: EpochMs
  dueAt: EpochMs
  overdue: boolean
  claimedBy?: string
  providerId: string
  instructions: { titleFa: string; steps: string[]; params: Record<string, unknown> }
  amountUsdCents: UsdCents
  fundingMicroUsdt: MicroUsdt
}

export interface TreasuryDto {
  balances: {
    bankIrt: Irt
    gatewayReceivableIrt: Irt
    exchanges: { exchangeId: string; irt: Irt; usdt: MicroUsdt; usdtWithdrawable: MicroUsdt }[]
    walletUsdt: MicroUsdt
    inTransitUsdt: MicroUsdt
    providers: { providerId: string; usdt: MicroUsdt; maxFloatUsdt: MicroUsdt }[]
  }
  lots: { id: string; exchangeId: string; remainingMicro: MicroUsdt; costIrt: Irt; withdrawableAt: EpochMs; status: string }[]
  coverage: { dailyConsumptionUsdt: number; targetFloatUsdt: number; effectiveFloatUsdt: number; coverageDays: number; shortfallUsdt: number }
  plan: { id: string; type: string; descriptionFa: string; amountMicroUsdt?: MicroUsdt; amountIrt?: Irt; exchangeId?: string; providerId?: string; blockedReasonFa?: string }[]
  recentActions: { id: string; type: string; at: EpochMs; status: string; note?: string }[]
}

export interface RateDto {
  snapshotId: string
  ts: EpochMs
  status: RateStatus
  mid: number
  executableAsk: number
  executableBid: number
  tickers: { exchangeId: string; bid: number; ask: number; asOf: EpochMs; excludedReason?: string }[]
  volatility: { dailyPct: number; driftPctPerDay: number }
}

export interface StatementsDto {
  basis: 'nominal' | 'real' | 'usd'
  statements: Statements[]
}

export interface SimStateDto {
  now: EpochMs
  speed: number
  scenarioId: string
  macro: { mid: number; regime: string; inflationIndex: number; usdtDailyVolPct: number }
  activeEvents: { id: string; type: string; untilDay?: number; descriptionFa: string }[]
  competitors: { id: string; name: string; priceIndex: number }[]
  staff: { id: string; name: string; role: string; onShift: boolean; busy: boolean }[]
}

export interface ApiErrorDto {
  error: { code: string; messageFa: string; details?: Record<string, unknown> }
}
