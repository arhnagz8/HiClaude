/** zod schemas for JSON columns and for loading Product records. */
import { z } from 'zod'

export const StringArraySchema = z.array(z.string())
export const StringRecordSchema = z.record(z.string(), z.string())
export const UnknownRecordSchema = z.record(z.string(), z.unknown())

export const QuoteLineSchema = z.object({
  code: z.enum(['service_value', 'provider_fees', 'exchange_cost', 'volatility_buffer', 'risk_buffer', 'payment_fee', 'margin', 'rush', 'vat', 'rounding', 'discount']),
  labelFa: z.string(),
  amountIrt: z.number().int(),
  visibleToCustomer: z.boolean(),
})

export const QuotePerMethodSchema = z.object({
  method: z.enum(['gateway', 'card_to_card', 'bank_transfer', 'usdt', 'wallet']),
  totalIrt: z.number().int().optional(),
  totalMicroUsdt: z.number().int().optional(),
  currency: z.enum(['IRT', 'USDT']),
  feeIrt: z.number().int(),
  lines: z.array(QuoteLineSchema),
  effectiveRateIrtPerUsd: z.number(),
  available: z.boolean(),
  unavailableReasonFa: z.string().optional(),
})
export const QuotePerMethodArraySchema = z.array(QuotePerMethodSchema)

export const ExchangeTickerSchema = z.object({
  exchangeId: z.string(),
  asOf: z.number().int(),
  bid: z.number(),
  ask: z.number(),
  last: z.number().optional(),
  volume24hUsdt: z.number().optional(),
})

export const RateSnapshotSchema = z.object({
  id: z.string(),
  ts: z.number().int(),
  tickers: z.array(ExchangeTickerSchema),
  executableAsk: z.number(),
  executableAskExchangeId: z.string().optional(),
  executableBid: z.number(),
  executableBidExchangeId: z.string().optional(),
  mid: z.number(),
  status: z.enum(['ok', 'halted', 'stale', 'anomaly', 'killed']),
  volatility: z.object({ dailyPct: z.number(), driftPctPerDay: z.number(), windowHours: z.number() }),
  excluded: z.array(z.object({ exchangeId: z.string(), reason: z.string() })),
  notes: z.array(z.string()),
})

export const ReceiptSchema = z.object({
  trackingNo: z.string().optional(),
  payerCardLast4: z.string().optional(),
  paidAt: z.number().int().optional(),
  imageRef: z.string().optional(),
})

export const TaskInstructionsSchema = z.object({
  titleFa: z.string(),
  steps: z.array(z.string()),
  params: z.record(z.string(), z.unknown()),
})

export const LedgerRefsSchema = z
  .object({
    orderId: z.string().optional(),
    paymentId: z.string().optional(),
    productId: z.string().optional(),
    productFamily: z.string().optional(),
    providerId: z.string().optional(),
    exchangeId: z.string().optional(),
    customerId: z.string().optional(),
    channel: z.enum(['web', 'telegram', 'bale', 'api', 'admin', 'sim']).optional(),
    rushTier: z.string().optional(),
  })
  .passthrough()

export const DeliverySummarySchema = z.object({
  kind: z.enum(['card', 'voucher', 'receipt', 'note']),
  last4: z.string().optional(),
  brand: z.enum(['visa', 'mastercard']).optional(),
  balanceUsdCents: z.number().int().optional(),
  vendorRef: z.string().optional(),
  noteFa: z.string().optional(),
  revealed: z.boolean(),
})

export const LimitOverrideSchema = z.object({
  maxOrderUsdCents: z.number().int().nonnegative().optional(),
  maxDailyUsdCents: z.number().int().nonnegative().optional(),
  maxOpenOrders: z.number().int().nonnegative().optional(),
})
export type LimitOverride = z.infer<typeof LimitOverrideSchema>

// ───────── Product (catalog) ─────────
export const AmountSpecSchema = z.object({
  kind: z.enum(['fixed', 'options', 'range']),
  fixedUsdCents: z.number().int().positive().optional(),
  optionsUsdCents: z.array(z.number().int().positive()).optional(),
  minUsdCents: z.number().int().positive().optional(),
  maxUsdCents: z.number().int().positive().optional(),
  stepUsdCents: z.number().int().positive().optional(),
})

export const ProductInputSchema = z.object({
  key: z.string().min(1),
  labelFa: z.string(),
  type: z.enum(['text', 'email', 'number', 'select', 'card_ref']),
  required: z.boolean().default(true),
  options: z.array(z.object({ value: z.string(), labelFa: z.string() })).optional(),
  pattern: z.string().optional(),
  helpFa: z.string().optional(),
})

export const ProductSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  kind: z.enum(['virtual_card_issue', 'card_topup', 'voucher', 'service_payment', 'subscription']),
  category: z.string(),
  family: z.string(),
  titleFa: z.string(),
  titleEn: z.string(),
  descriptionFa: z.string().default(''),
  amount: AmountSpecSchema,
  inputs: z.array(ProductInputSchema).default([]),
  providerId: z.string(),
  altProviderIds: z.array(z.string()).default([]),
  fulfilmentMode: z.enum(['api', 'operator']),
  includesCardIssue: z.boolean().default(false),
  vendorFxBps: z.number().int().nonnegative().optional(),
  slaMinutes: z.record(z.string(), z.number().positive()),
  riskLabel: z.enum(['low', 'medium', 'high']),
  restrictionNoteFa: z.string().optional(),
  active: z.boolean().default(true),
  lossLeader: z.boolean().optional(),
  marginOverridePct: z.number().min(0).optional(),
  minMarginOverrideIrt: z.number().int().nonnegative().optional(),
  tags: z.array(z.string()).default([]),
})
