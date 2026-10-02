/**
 * Domain entities shared by core, app, api, sim, web. [CONTRACT]
 * Additive changes only. Persistence shapes may add columns but must keep these fields.
 */
import type { Bps, EpochMs, Irt, MicroUsdt, Network, UsdCents } from './units'

// ───────────────────────────── enums ─────────────────────────────
export type Channel = 'web' | 'telegram' | 'bale' | 'api' | 'admin' | 'sim'
export type PaymentMethod = 'gateway' | 'card_to_card' | 'bank_transfer' | 'usdt' | 'wallet'
export type ProductKind = 'virtual_card_issue' | 'card_topup' | 'voucher' | 'service_payment' | 'subscription'
export type FulfilmentMode = 'api' | 'operator'
export type RiskLabel = 'low' | 'medium' | 'high'
/** Rush tier ids are data-driven; defaults are 'normal' | 'fast' | 'express'. */
export type RushTierId = string
export type CustomerTier = 'new' | 'verified' | 'trusted'
export type CustomerStatus = 'active' | 'blocked'
export type StaffRole = 'owner' | 'admin' | 'operator' | 'support' | 'accountant' | 'viewer'

export type OrderStatus =
  | 'awaiting_payment'
  | 'payment_review'
  | 'paid'
  | 'risk_hold'
  | 'queued'
  | 'fulfilling'
  | 'delivered'
  | 'completed'
  | 'expired'
  | 'cancelled'
  | 'failed'
  | 'refund_pending'
  | 'refunded'
  | 'disputed'

export const TERMINAL_ORDER_STATUSES: readonly OrderStatus[] = ['completed', 'expired', 'cancelled', 'refunded']

export type PaymentStatus = 'pending' | 'review' | 'confirmed' | 'rejected' | 'expired' | 'refunded'
export type TaskStatus = 'queued' | 'claimed' | 'in_progress' | 'done' | 'failed' | 'cancelled'
export type TaskKind = 'issue_card' | 'topup_card' | 'deliver_voucher' | 'pay_service' | 'custom'

// ───────────────────────────── customers ─────────────────────────────
export interface Customer {
  id: string
  phone: string // normalised 09xxxxxxxxx
  name?: string
  nationalId?: string
  tier: CustomerTier
  status: CustomerStatus
  telegramId?: string
  baleId?: string
  referralCode: string
  referredBy?: string
  walletIrt: Irt
  riskScore: number // 0..100
  flags: string[]
  createdAt: EpochMs
  lastSeenAt: EpochMs
  kycSubmittedAt?: EpochMs
  kycVerifiedAt?: EpochMs
}

// ───────────────────────────── catalog ─────────────────────────────
export interface AmountSpec {
  kind: 'fixed' | 'options' | 'range'
  fixedUsdCents?: UsdCents
  optionsUsdCents?: UsdCents[]
  minUsdCents?: UsdCents
  maxUsdCents?: UsdCents
  stepUsdCents?: UsdCents
}

export interface ProductInput {
  key: string
  labelFa: string
  type: 'text' | 'email' | 'number' | 'select' | 'card_ref'
  required: boolean
  options?: { value: string; labelFa: string }[]
  pattern?: string
  helpFa?: string
}

export interface Product {
  id: string
  slug: string
  kind: ProductKind
  category: string
  /** Margin/competitor group, e.g. 'virtual_card','ai_subscription','gift_card','gaming','cloud','education'. */
  family: string
  titleFa: string
  titleEn: string
  descriptionFa: string
  amount: AmountSpec
  inputs: ProductInput[]
  providerId: string
  altProviderIds: string[]
  fulfilmentMode: FulfilmentMode
  /** True when the order also issues a new virtual card (adds provider issue fee). */
  includesCardIssue: boolean
  /** Extra FX cost for non-USD vendors, in bps of face value. */
  vendorFxBps?: Bps
  /** SLA minutes per rush tier id. */
  slaMinutes: Record<RushTierId, number>
  /** Mandatory transparency: shown to the customer. See CLAUDE.md §3. */
  riskLabel: RiskLabel
  restrictionNoteFa?: string
  active: boolean
  lossLeader?: boolean
  marginOverridePct?: number
  minMarginOverrideIrt?: Irt
  tags: string[]
}

// ───────────────────────────── rates ─────────────────────────────
export interface ExchangeTicker {
  exchangeId: string
  asOf: EpochMs
  /** Toman per 1 USDT */
  bid: number
  ask: number
  last?: number
  volume24hUsdt?: number
}

export type RateStatus = 'ok' | 'halted' | 'stale' | 'anomaly' | 'killed'

export interface RateSnapshot {
  id: string
  ts: EpochMs
  tickers: ExchangeTicker[]
  /** Cheapest ask among exchanges we can actually buy at now (Toman per USDT). */
  executableAsk: number
  /** Exchange offering `executableAsk` (its taker fee applies to replacement cost). Undefined when halted/using last-known. */
  executableAskExchangeId?: string
  executableBid: number
  executableBidExchangeId?: string
  mid: number
  status: RateStatus
  volatility: { dailyPct: number; driftPctPerDay: number; windowHours: number }
  /** Exchanges excluded (closed, capped, outlier) with reasons. */
  excluded: { exchangeId: string; reason: string }[]
  notes: string[]
}

// ───────────────────────────── quotes & orders ─────────────────────────────
export type QuoteLineCode =
  | 'service_value'
  | 'provider_fees'
  | 'exchange_cost'
  | 'volatility_buffer'
  | 'risk_buffer'
  | 'payment_fee'
  | 'margin'
  | 'rush'
  | 'vat'
  | 'rounding'
  | 'discount'

export interface QuoteLine {
  code: QuoteLineCode
  labelFa: string
  amountIrt: Irt
  /** Internal lines (margin, buffers) can be hidden from customers; totals always add up. */
  visibleToCustomer: boolean
}

export interface QuotePerMethod {
  method: PaymentMethod
  /** Total payable when currency is IRT. */
  totalIrt?: Irt
  /** Total payable when currency is USDT. */
  totalMicroUsdt?: MicroUsdt
  currency: 'IRT' | 'USDT'
  feeIrt: Irt
  lines: QuoteLine[]
  effectiveRateIrtPerUsd: number
  available: boolean
  unavailableReasonFa?: string
}

export interface Quote {
  id: string
  customerId?: string
  productId: string
  amountUsdCents: UsdCents
  rushTier: RushTierId
  inputs: Record<string, string>
  createdAt: EpochMs
  lockedUntil: EpochMs
  rateSnapshotId: string
  policyVersion: number
  perMethod: QuotePerMethod[]
  fundingMicroUsdt: MicroUsdt
  /** INTERNAL — never exposed through public DTOs. */
  costIrt: Irt
  marginIrt: Irt
  uncompetitive: boolean
  competitorRefIrt?: Irt
  warnings: string[]
}

export interface Order {
  id: string
  code: string // public, e.g. KT-7F3A9B
  customerId: string
  productId: string
  quoteId: string
  method: PaymentMethod
  status: OrderStatus
  version: number
  amountUsdCents: UsdCents
  rushTier: RushTierId
  inputs: Record<string, string>
  payCurrency: 'IRT' | 'USDT'
  /** Total payable (Irt or MicroUsdt depending on payCurrency). */
  payAmount: number
  fundingMicroUsdt: MicroUsdt
  costIrtAtQuote: Irt
  marginIrtAtQuote: Irt
  vatIrt: Irt
  rushIrt: Irt
  discountIrt: Irt
  providerId: string
  fulfilmentMode: FulfilmentMode
  channel: Channel
  referralCode?: string
  waitingFunding: boolean
  attempts: number
  riskScore: number
  riskFlags: string[]
  createdAt: EpochMs
  payExpiresAt: EpochMs
  paidAt?: EpochMs
  deliveredAt?: EpochMs
  completedAt?: EpochMs
  slaDueAt?: EpochMs
}

export interface OrderEvent {
  id: string
  orderId: string
  at: EpochMs
  type: string
  from?: OrderStatus
  to?: OrderStatus
  actor: { type: 'system' | 'customer' | 'staff' | 'sim'; id?: string }
  data?: Record<string, unknown>
}

// ───────────────────────────── payments ─────────────────────────────
export interface Payment {
  id: string
  orderId: string
  method: PaymentMethod
  status: PaymentStatus
  currency: 'IRT' | 'USDT'
  expectedAmount: number
  receivedAmount: number
  uniqueOffsetIrt?: Irt
  gatewayId?: string
  authority?: string
  payUrl?: string
  destinationCardId?: string
  network?: Network
  address?: string
  memo?: string
  txHash?: string
  confirmations?: number
  receipt?: { trackingNo?: string; payerCardLast4?: string; paidAt?: EpochMs; imageRef?: string }
  matchedRef?: string
  feeIrt: Irt
  createdAt: EpochMs
  confirmedAt?: EpochMs
  note?: string
}

// ───────────────────────────── fulfilment ─────────────────────────────
export interface CardSecrets {
  pan: string
  expMonth: number
  expYear: number
  cvv: string
  holderName?: string
  billingAddress?: { line1: string; city: string; region?: string; postalCode?: string; country: string }
}

export interface DeliverySummary {
  kind: 'card' | 'voucher' | 'receipt' | 'note'
  last4?: string
  brand?: 'visa' | 'mastercard'
  balanceUsdCents?: UsdCents
  vendorRef?: string
  noteFa?: string
  revealed: boolean
}

export interface FulfilmentTask {
  id: string
  orderId: string
  kind: TaskKind
  mode: FulfilmentMode
  status: TaskStatus
  /** Lower = more urgent. Derived from rush tier + SLA. */
  priority: number
  rushTier: RushTierId
  createdAt: EpochMs
  dueAt: EpochMs
  claimedBy?: string
  claimedAt?: EpochMs
  completedAt?: EpochMs
  attempts: number
  providerId: string
  instructions: { titleFa: string; steps: string[]; params: Record<string, unknown> }
  result?: Record<string, unknown>
  failureReason?: string
}

// ───────────────────────────── treasury ─────────────────────────────
export interface UsdtLot {
  id: string
  exchangeId: string
  qtyMicro: MicroUsdt
  remainingMicro: MicroUsdt
  costIrt: Irt
  acquiredAt: EpochMs
  withdrawableAt: EpochMs
  status: 'locked' | 'available' | 'withdrawn'
}

export type TreasuryActionType = 'deposit_irt' | 'buy_usdt' | 'withdraw_usdt' | 'sweep_provider' | 'sell_usdt'

export interface TreasuryAction {
  id: string
  type: TreasuryActionType
  at: EpochMs
  status: 'planned' | 'executing' | 'done' | 'failed'
  exchangeId?: string
  providerId?: string
  amountIrt?: Irt
  amountMicroUsdt?: MicroUsdt
  network?: Network
  rate?: number
  feeIrt?: Irt
  feeMicroUsdt?: MicroUsdt
  note?: string
}

// ───────────────────────────── ledger ─────────────────────────────
export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'cogs' | 'expense' | 'other'

export interface LedgerAccount {
  code: string // e.g. "1110:nobitex"
  name: string
  type: AccountType
  currency: 'IRT' | 'USDT'
}

export interface LedgerLine {
  account: string
  /** IRT account: Toman; USDT account: MicroUsdt (0 for pure revaluation lines). */
  qty: number
  /** Value in Toman (functional currency). Σ irt over an entry must be 0. */
  irt: Irt
}

export interface JournalEntryInput {
  ts: EpochMs
  kind: string // e.g. 'E1','E5' or a descriptive code
  memo: string
  refs?: {
    orderId?: string
    paymentId?: string
    productId?: string
    productFamily?: string
    providerId?: string
    exchangeId?: string
    customerId?: string
    channel?: Channel
    rushTier?: RushTierId
  }
  lines: LedgerLine[]
}

export interface JournalEntry extends JournalEntryInput {
  id: string
  seq: number
}

// ───────────────────────────── staff ─────────────────────────────
export interface StaffUser {
  id: string
  name: string
  role: StaffRole
  active: boolean
  createdAt: EpochMs
}
