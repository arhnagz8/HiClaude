/**
 * Pricing engine types. See `engine.ts` for the algorithm and README for how to call it.
 */
import type {
  CustomerTier,
  EpochMs,
  Irt,
  MicroUsdt,
  PaymentMethod,
  PaymentMethodsParams,
  PricingPolicy,
  Product,
  ProviderParams,
  QuotePerMethod,
  RateSnapshot,
  RushTierId,
  TaxParams,
  UnitEconomics,
  UsdCents,
} from '@hiclaude/contracts'

export interface RushCapacityInfo {
  available: boolean
  nextSlotAt?: EpochMs
  reasonFa?: string
}

export interface PricingInput {
  now: EpochMs
  product: Product
  /** Cost model of the provider that will fulfil this product (the caller chooses primary/alt provider). */
  provider: ProviderParams
  /** Taker fee (bps) of `rate.executableAskExchangeId`. Use `resolveTakerBps(rate, exchanges)` when unsure. */
  exchangeTakerBps: number
  amountUsdCents: UsdCents
  /** Defaults to `product.includesCardIssue`. */
  newCard?: boolean
  rushTierId: RushTierId
  rate: RateSnapshot
  policy: PricingPolicy
  paymentMethods: PaymentMethodsParams
  /** VAT settings. When omitted, `policy.vat` is used. */
  tax?: Pick<TaxParams, 'vatApplies' | 'vatPct'>
  customerTier: CustomerTier
  /** Competitor reference price (Toman, final customer price, standard speed). */
  competitorRefIrt?: Irt
  /** Capacity of rush tiers right now (from `rushCapacity()` in sla). Missing entry = available. */
  rushCapacity?: Record<RushTierId, RushCapacityInfo>
  /** Payment methods to quote, in display order. */
  methods: PaymentMethod[]
  /** Methods this customer tier may use (`risk.tiers[tier].methods`). Omitted = all. */
  allowedMethods?: PaymentMethod[]
  /** Customer wallet balance (Toman). Needed for `wallet` availability; omitted = wallet unavailable. */
  walletBalanceIrt?: Irt
  /** Card-to-card capacity still available today across destination cards (Toman). Omitted = not tracked. */
  c2cCapacityRemainingIrt?: Irt
  /** Promotional/referral discount requested (Toman). Capped so the margin never drops below the floor. */
  promoDiscountIrt?: Irt
  /**
   * ADMIN WHAT-IF ONLY: force the margin line to this exact amount (bypasses min/max/floor, tier discount, competitor guard and promo).
   * Never set this for customer quotes.
   */
  overrideMarginIrt?: Irt
  /** Override of `policy.volatility.lockMinutes` (what-if / sensitivity). */
  lockMinutes?: number
}

export interface RushOption {
  id: RushTierId
  labelFa: string
  available: boolean
  /** Premium in Toman at the current cost base (before VAT/payment fee). */
  premiumIrt: Irt
  slaMinutes: number
  nextSlotAt?: EpochMs
  reasonFa?: string
}

export interface MethodEconomics {
  /** Replacement cost of the USDT needed (Toman; for `usdt` method: value of the USDT at executableBid). */
  costIrt: Irt
  /** Volatility + risk buffers. */
  bufferIrt: Irt
  /** Margin line after discounts and competitor guard, plus the rounding remainder (rounding is booked as margin). */
  marginIrt: Irt
  /** Payment-method fee charged on this method (0 for c2c/bank/usdt/wallet). */
  feeIrt: Irt
  vatIrt: Irt
  rushIrt: Irt
  /** Sum of the (positive) discount amounts shown to the customer. */
  discountIrt: Irt
  /** total − vat − fee. */
  netRevenueIrt: Irt
  unit: UnitEconomics
}

export interface VolatilityBufferBreakdown {
  sigmaDaily: number
  driftUsedPerDay: number
  z: number
  tauLockDays: number
  tauLagDays: number
  rawPct: number
  clampedPct: number
  haltPremiumPct: number
  finalPct: number
  bufferIrt: Irt
}

export interface MarginBreakdown {
  famPct: number
  pctBase: number
  pctAfterTier: number
  minMarginIrt: Irt
  floorIrt: Irt
  baseIrt: Irt
  tierDiscountIrt: Irt
  competitorReductionIrt: Irt
  promoDiscountIrt: Irt
  finalIrt: Irt
  lossLeader: boolean
  overridden: boolean
}

export interface CompetitorBreakdown {
  enabled: boolean
  refIrt?: Irt
  ceilingIrt?: Irt
  applied: boolean
  uncompetitive: boolean
}

export interface MethodBreakdown {
  netTargetIrt: Irt
  grossUp: 'none' | 'closed_form' | 'cap'
  feeIrt: Irt
  totalIrt: Irt
  roundingIrt: Irt
}

export interface UsdtBreakdown {
  fundingMicroUsdt: MicroUsdt
  bufferPct: number
  bufferMicroUsdt: MicroUsdt
  riskMicroUsdt: MicroUsdt
  marginMicroUsdt: MicroUsdt
  rushMicroUsdt: MicroUsdt
  vatMicroUsdt: MicroUsdt
  totalMicroUsdt: MicroUsdt
  cappedByIrtPrice: boolean
  equivalentIrt: Irt
  /** USDT-denominated lines (micro-USDT), same order as `lines` of the usdt method. */
  lines: { code: string; amountMicroUsdt: MicroUsdt }[]
}

export interface PricingBreakdown {
  amountUsdCents: UsdCents
  newCard: boolean
  fundingUsdCents: number
  fundingMicroUsdt: MicroUsdt
  parts: { faceMicroUsdt: MicroUsdt; providerFeesMicroUsdt: MicroUsdt; haircutAndNetworkMicroUsdt: MicroUsdt }
  askIrt: number
  takerBps: number
  unitCostIrtPerUsdt: number
  costIrt: Irt
  costLines: { serviceValue: Irt; providerFees: Irt; exchangeCost: Irt }
  volatility: VolatilityBufferBreakdown
  riskBufferIrt: Irt
  margin: MarginBreakdown
  competitor: CompetitorBreakdown
  rushIrt: Irt
  vatIrt: Irt
  vatPct: number
  netBeforeRushIrt: Irt
  netIrt: Irt
  byMethod: Partial<Record<PaymentMethod, MethodBreakdown>>
  usdt?: UsdtBreakdown
  notes: string[]
}

export interface ComputedMethodQuote extends QuotePerMethod {
  /** For `usdt`: Toman-equivalent of `totalMicroUsdt` at executableBid (rounded down); lines are expressed in this Toman equivalent. */
  equivalentIrt?: Irt
}

export interface QuoteComputation {
  productId: string
  amountUsdCents: UsdCents
  rushTier: RushTierId
  createdAt: EpochMs
  lockedUntil: EpochMs
  rateSnapshotId: string
  rateStatus: RateSnapshot['status']
  policyVersion: number
  perMethod: ComputedMethodQuote[]
  fundingMicroUsdt: MicroUsdt
  /** INTERNAL replacement cost (Toman). */
  costIrt: Irt
  /** INTERNAL margin line after discounts/guard (before rounding remainder). */
  marginIrt: Irt
  /** INTERNAL buffers (volatility + risk). */
  bufferIrt: Irt
  /** Economics of the primary method (first available requested method, else the first requested). */
  unitEconomics: UnitEconomics
  /** Economics per requested method (used when an order is created with that method). */
  economics: Partial<Record<PaymentMethod, MethodEconomics>>
  uncompetitive: boolean
  competitorRefIrt?: Irt
  rushTiers: RushOption[]
  /** Persian, customer-safe. */
  warnings: string[]
  /** Machine-readable counterparts, e.g. `rates_halted`, `uncompetitive`. */
  warningCodes: string[]
  /** Admin-only “why this price”. */
  breakdown: PricingBreakdown
}
