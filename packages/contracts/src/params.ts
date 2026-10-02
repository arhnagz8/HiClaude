/**
 * Platform parameters (everything dynamic/tunable). [CONTRACT]
 * Layering: defaults.ts  ←  data/config/*.json  ←  DB settings (admin edits).  See architecture.md §17.
 * Values here are PLACEHOLDERS until calibrated from research (docs/03-research) — every default carries a `// src:` hint.
 */
import { z } from 'zod'

const NetworkSchema = z.enum(['TRC20', 'BEP20', 'TON', 'ERC20', 'POLYGON', 'SOLANA', 'ARBITRUM'])
const int = z.number().int()
const nonNegInt = z.number().int().nonnegative()
const frac = z.number().min(0)
const NetworkRecordInt = z.record(NetworkSchema, nonNegInt)

// ───────────────────────────── brand ─────────────────────────────
export const BrandParamsSchema = z.object({
  nameFa: z.string(),
  nameEn: z.string(),
  domain: z.string(),
  taglineFa: z.string(),
  supportTelegram: z.string().optional(),
  supportBale: z.string().optional(),
  supportPhone: z.string().optional(),
  supportHoursFa: z.string(),
  enamadNote: z.string().optional(),
})

// ───────────────────────────── pricing ─────────────────────────────
export const RushTierSchema = z.object({
  id: z.string(),
  labelFa: z.string(),
  premiumPct: frac,
  minPremiumIrt: nonNegInt,
  slaMinutes: z.number().int().positive(),
  /** Orders per hour the operations team can absorb in this tier (null = unlimited). */
  capacityPerHour: z.number().int().positive().nullable(),
  enabled: z.boolean(),
})

export const PricingPolicySchema = z.object({
  version: z.number().int().positive(),
  /** Default margin as a fraction of cost (0.10 = 10 %). */
  marginPct: frac,
  floorMarginPct: frac,
  maxMarginPct: frac,
  minMarginIrt: nonNegInt,
  marginPctByFamily: z.record(z.string(), frac),
  minMarginIrtByFamily: z.record(z.string(), nonNegInt),
  riskBufferPct: frac,
  declineBufferUsdCents: nonNegInt,
  volatility: z.object({
    /** one-sided confidence multiplier (1.64 ≈ 95 %). */
    z: z.number().positive(),
    minBufferPct: frac,
    maxBufferPct: frac,
    /** price-lock duration for a quote. */
    lockMinutes: z.number().positive(),
    /** days between consuming USDT and being able to re-buy it (≥ withdrawal lock). */
    replenishmentLagDays: z.number().min(0),
    /** extra premium when exchanges are halted / rates stale. */
    haltPremiumPct: frac,
    /** drift used in pricing is max(estimated, this). */
    driftFloorPctPerDay: z.number(),
  }),
  roundingStepIrt: z.number().int().positive(),
  usdt: z.object({
    marginPct: frac,
    minMarginMicroUsdt: nonNegInt,
    roundStepMicroUsdt: z.number().int().positive(),
  }),
  competitor: z.object({ enabled: z.boolean(), tolerancePct: frac }),
  tierDiscountPct: z.record(z.string(), frac),
  vat: z.object({ applies: z.boolean(), pct: frac }),
  /** USDT of network/withdrawal fees allocated to each order. */
  networkFeeAllocMicroUsdt: nonNegInt,
  stablecoin: z.object({ parHaircutBps: nonNegInt }),
  rushTiers: z.array(RushTierSchema).min(1),
})

// ───────────────────────────── payment methods ─────────────────────────────
export const DestinationCardSchema = z.object({
  id: z.string(),
  bankFa: z.string(),
  holderFa: z.string(),
  cardNumber: z.string(),
  ibanHint: z.string().optional(),
})

export const PaymentMethodsParamsSchema = z.object({
  gateway: z.object({
    enabled: z.boolean(),
    gatewayId: z.string(),
    feePct: frac,
    feeCapIrt: nonNegInt,
    feeFixedIrt: nonNegInt,
    settlementDelayHours: z.number().min(0),
    minIrt: nonNegInt,
    maxIrt: nonNegInt,
    payWindowMinutes: z.number().positive(),
  }),
  card_to_card: z.object({
    enabled: z.boolean(),
    perCardDailyCapIrt: nonNegInt,
    maxOrderIrt: nonNegInt,
    minIrt: nonNegInt,
    payWindowMinutes: z.number().positive(),
    uniqueOffsetMaxIrt: nonNegInt,
    receiptRequired: z.boolean(),
    cards: z.array(DestinationCardSchema),
  }),
  bank_transfer: z.object({
    enabled: z.boolean(),
    minIrt: nonNegInt,
    maxIrt: nonNegInt,
    payWindowMinutes: z.number().positive(),
    ibanFa: z.string(),
    holderFa: z.string(),
  }),
  usdt: z.object({
    enabled: z.boolean(),
    networks: z.array(NetworkSchema).min(1),
    minMicroUsdt: nonNegInt,
    payWindowMinutes: z.number().positive(),
    confirmations: NetworkRecordInt,
    perOrderAddress: z.boolean(),
    underpayToleranceBps: nonNegInt,
  }),
  wallet: z.object({ enabled: z.boolean() }),
})

export const LatePaymentSchema = z.object({
  graceMs: nonNegInt,
  /** Accept a late payment at the locked price if the adverse rate move is below this fraction. */
  acceptIfMovePctBelow: frac,
  refundFeeIrt: nonNegInt,
})

// ───────────────────────────── exchanges / providers / regulation ─────────────────────────────
export const ExchangeParamsSchema = z.object({
  id: z.string(),
  name: z.string(),
  enabled: z.boolean(),
  takerFeeBps: nonNegInt,
  makerFeeBps: nonNegInt,
  /** typical half-spread around mid, bps */
  halfSpreadBps: nonNegInt,
  /** typical premium of this exchange vs the composite mid, bps (can be negative) */
  premiumBps: int,
  withdrawFeeMicroUsdt: NetworkRecordInt,
  withdrawMinMicroUsdt: NetworkRecordInt,
  apiAvailable: z.boolean(),
  /** probability of an outage window per month (sim) */
  outageProbPerMonth: frac,
  /** null → use regulatory caps */
  depositCapIrtPer24hOverride: nonNegInt.nullable(),
})

export const ProviderParamsSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['usdt_card', 'voucher_api', 'baas', 'vendor_direct']),
  enabled: z.boolean(),
  fees: z.object({
    issueUsdCents: nonNegInt,
    minLoadUsdCents: nonNegInt,
    topupBps: nonNegInt,
    topupFixedUsdCents: nonNegInt,
    fxNonUsdBps: nonNegInt,
    declineFeeUsdCents: nonNegInt,
    monthlyUsdCents: nonNegInt,
  }),
  limits: z.object({
    maxBalanceUsdCents: nonNegInt,
    maxTopupUsdCents: nonNegInt,
    dailySpendUsdCents: nonNegInt,
  }),
  networks: z.array(NetworkSchema).min(1),
  depositConfirmations: nonNegInt,
  /** minutes until a deposit is credited after confirmations (sim + treasury planning) */
  creditDelayMinutes: nonNegInt,
  capabilities: z.object({
    issue: z.enum(['api', 'panel', 'none']),
    topUp: z.enum(['api', 'panel', 'none']),
    reveal: z.enum(['api', 'panel', 'none']),
    freeze: z.enum(['api', 'panel', 'none']),
    webhooks: z.boolean(),
  }),
  risk: z.object({
    label: z.enum(['low', 'medium', 'high']),
    /** monthly probability of a freeze/exit event (sim; from risk register) */
    counterpartyFailurePerMonth: frac,
    /** never hold more than this at the provider (treasury cap) */
    maxFloatMicroUsdt: nonNegInt,
  }),
  restrictionNoteFa: z.string().optional(),
})

export const RegulatoryParamsSchema = z.object({
  /** CBI cap on identified (شناسه‌دار) deposits to crypto exchanges per national ID per 24h. null = no cap. */
  idDepositCapIrtPer24h: nonNegInt.nullable(),
  /** hours USDT bought/deposited with Toman is locked for on-chain withdrawal (FATA directive). */
  withdrawalLockHours: z.number().min(0),
  nightHalt: z.object({
    enabled: z.boolean(),
    fromHour: z.number().min(0).max(24),
    toHour: z.number().min(0).max(24),
  }),
  /** per-user daily USDT buy cap (temporary measures), null = none. */
  dailyBuyCapMicroUsdt: nonNegInt.nullable(),
  /** number of distinct legally-owned national IDs/accounts the business can deposit from (each has its own cap). */
  depositIdentitiesAvailable: z.number().int().positive(),
})

export const TaxParamsSchema = z.object({
  vatPct: frac,
  vatApplies: z.boolean(),
  corporateTaxPct: frac,
  incomeTaxBrackets: z.array(z.object({ upToIrtPerYear: nonNegInt.nullable(), pct: frac })),
  entityType: z.enum(['individual', 'company']),
  accrueMonthly: z.boolean(),
})

// ───────────────────────────── risk / treasury / fulfilment ─────────────────────────────
export const RiskParamsSchema = z.object({
  tiers: z.record(
    z.string(),
    z.object({
      maxOrderUsdCents: nonNegInt,
      maxDailyUsdCents: nonNegInt,
      maxOpenOrders: nonNegInt,
      methods: z.array(z.enum(['gateway', 'card_to_card', 'bank_transfer', 'usdt', 'wallet'])),
    }),
  ),
  velocity: z.object({ maxOrdersPerHourPerCustomer: nonNegInt, maxFailedPaymentsPerDay: nonNegInt }),
  killSwitch: z.object({
    staleAfterMs: nonNegInt,
    anomalyPct: frac,
    autoKillAfterMinutes: nonNegInt,
    providerFailureRateThreshold: frac,
    providerFailureWindow: nonNegInt,
  }),
  highRiskScoreThreshold: z.number().min(0).max(100),
})

export const TreasuryParamsSchema = z.object({
  targetCoverageDays: z.number().positive(),
  minCoverageDays: z.number().positive(),
  maxCoverageDays: z.number().positive(),
  forecastEmaDays: z.number().positive(),
  planIntervalMinutes: z.number().positive(),
  minBuyMicroUsdt: nonNegInt,
  buyBatchMicroUsdt: nonNegInt,
  sweepMinMicroUsdt: nonNegInt,
  /** keep at least this much Toman in the bank for refunds/opex */
  cashReserveIrt: nonNegInt,
  preferredNetwork: NetworkSchema,
  /** which exchange to prefer when asks are equal-ish */
  exchangePreference: z.array(z.string()),
  /** max share of float that may sit at a single provider */
  maxProviderShare: frac,
})

export const FulfilmentParamsSchema = z.object({
  maxAttempts: z.number().int().positive(),
  autoCompleteHours: z.number().positive(),
  slaWarnFraction: frac,
  revealTtlMinutes: z.number().positive(),
  maxReveals: z.number().int().positive(),
  /** auto-refund policy when fulfilment permanently fails */
  autoRefundOnFailure: z.boolean(),
})

export const OperationsParamsSchema = z.object({
  /** typical operator minutes per task kind (used by SLA/ETA estimates and the sim) */
  minutesPerTask: z.record(z.string(), z.number().positive()),
  businessHours: z.object({ fromHour: z.number().min(0).max(24), toHour: z.number().min(0).max(24) }),
})

export const PlatformParamsSchema = z.object({
  brand: BrandParamsSchema,
  pricing: PricingPolicySchema,
  paymentMethods: PaymentMethodsParamsSchema,
  latePayment: LatePaymentSchema,
  exchanges: z.array(ExchangeParamsSchema).min(1),
  providers: z.array(ProviderParamsSchema).min(1),
  regulatory: RegulatoryParamsSchema,
  tax: TaxParamsSchema,
  risk: RiskParamsSchema,
  treasury: TreasuryParamsSchema,
  fulfilment: FulfilmentParamsSchema,
  operations: OperationsParamsSchema,
})

export type BrandParams = z.infer<typeof BrandParamsSchema>
export type RushTier = z.infer<typeof RushTierSchema>
export type PricingPolicy = z.infer<typeof PricingPolicySchema>
export type DestinationCard = z.infer<typeof DestinationCardSchema>
export type PaymentMethodsParams = z.infer<typeof PaymentMethodsParamsSchema>
export type LatePaymentParams = z.infer<typeof LatePaymentSchema>
export type ExchangeParams = z.infer<typeof ExchangeParamsSchema>
export type ProviderParams = z.infer<typeof ProviderParamsSchema>
export type RegulatoryParams = z.infer<typeof RegulatoryParamsSchema>
export type TaxParams = z.infer<typeof TaxParamsSchema>
export type RiskParams = z.infer<typeof RiskParamsSchema>
export type TreasuryParams = z.infer<typeof TreasuryParamsSchema>
export type FulfilmentParams = z.infer<typeof FulfilmentParamsSchema>
export type OperationsParams = z.infer<typeof OperationsParamsSchema>
export type PlatformParams = z.infer<typeof PlatformParamsSchema>

/** Recursive partial for overrides. Arrays are replaced wholesale. */
export type DeepPartial<T> = T extends readonly unknown[] ? T : T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Deep merge: objects merge recursively, arrays and primitives are replaced. Pure; returns a new object. */
export function deepMerge<T>(base: T, ...overrides: (DeepPartial<T> | undefined)[]): T {
  let out: unknown = structuredClone(base)
  for (const o of overrides) {
    if (o === undefined) continue
    out = merge2(out, o)
  }
  return out as T
}

function merge2(a: unknown, b: unknown): unknown {
  if (isPlainObject(a) && isPlainObject(b)) {
    const res: Record<string, unknown> = { ...a }
    for (const [k, v] of Object.entries(b)) {
      if (v === undefined) continue
      res[k] = k in a ? merge2(a[k], v) : structuredClone(v)
    }
    return res
  }
  return structuredClone(b)
}

/** Validates unknown input against the platform schema (throws ZodError with paths). */
export function parsePlatformParams(input: unknown): PlatformParams {
  return PlatformParamsSchema.parse(input)
}
