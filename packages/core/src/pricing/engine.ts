/**
 * Dynamic pricing engine — `priceQuote(input)`. Implements architecture §7 (normative).
 *
 * UNITS: every `*Pct` in inputs/outputs is a FRACTION (0.10 = 10 %). Money is integer Toman / micro-USDT; intermediates use decimal.js.
 *
 * Algorithm (IRT methods; all amounts Toman, integers after the stated rounding)
 *  1. funding (USD cents)  = A + (newCard ? issue : 0) + A·topupBps + topupFixed + A·vendorFxBps + declineBuffer
 *     fundingMicro (USDT)   = ceil[ funding·10⁴ · (1 + haircutBps) + networkFeeAlloc ]              (we must acquire at least this)
 *  2. unit cost            = executableAsk · (1 + takerBps)                                          (replacement cost of 1 USDT)
 *     C                    = ceil(fundingMicro · unit / 10⁶), shown as service_value + provider_fees + exchange_cost (cumulative ceil, sums exactly)
 *  3. volatility buffer    = clamp(z·σ·√τlock + max(0, max(μ, driftFloor))·τlag + z·σ·√τlag, minBufferPct, maxBufferPct) + (status≠ok ? haltPremiumPct : 0), of C, ceil
 *  4. risk buffer          = ceil(riskBufferPct · C)
 *  5. margin               = max(minMargin, pct·C); pct = clamp(product/family/default, floor, max); tier discount lowers pct but never below floor
 *                            (shown as a negative `discount` line); competitor guard lowers it toward the floor margin; promo discount is capped at
 *                            (margin − floor). Loss-leader products may go down to −(buffers) i.e. net price = C.
 *  6. rush                 = max(minPremiumIrt, premiumPct · (C + buffers + margin))
 *  7. N = C + buffers + margin + rush;  VAT = round_half_up(vatPct · N);  T = N + VAT              (VAT base excludes the passed-on payment fee — assumption, see README)
 *  8. payment fee gross-up: smallest P with P − fee(P) ≥ T (gateway: fee = min(cap, ceil(pct·P)+fixed));  total = ceil to roundingStepIrt (rounding line ≥ 0 absorbs the rest)
 *  9. USDT-pay variant (§7.10): F = fundingMicro; buffer = clamp(z·σ·√τlock, 0, max) only; margin = max(usdt.minMargin, usdt.marginPct·F) (tier-adjusted);
 *     rush converted at executableBid; VAT; round UP to roundStepMicroUsdt; capped so that its Toman equivalent at executableBid never exceeds the IRT price.
 *
 * All lines of every method sum EXACTLY to its total (`assert` at the end). Pure and idempotent.
 */
import { AppError, formatIrt, formatNumberFa, type PaymentMethod, type QuoteLine, type QuoteLineCode, type RateSnapshot, type UnitEconomics } from '@hiclaude/contracts'
import type { ExchangeParams, RushTier } from '@hiclaude/contracts'
import { D, ceilToStep, floorToStep, toInt, assertSafeInt } from '../money'
import { grossUpGateway, gatewayFee } from '../payments/fees'
import type {
  ComputedMethodQuote,
  CompetitorBreakdown,
  MarginBreakdown,
  MethodBreakdown,
  MethodEconomics,
  PricingBreakdown,
  PricingInput,
  QuoteComputation,
  RushOption,
  UsdtBreakdown,
} from './types'

const LABELS_FA: Record<string, string> = {
  service_value: 'ارزش سرویس',
  provider_fees: 'کارمزد ارائه‌دهنده',
  exchange_cost: 'هزینه‌ی تبدیل و انتقال ارز',
  volatility_buffer: 'ضریب احتیاط نوسان نرخ',
  risk_buffer: 'ضریب احتیاط عملیاتی',
  payment_fee: 'کارمزد پرداخت',
  margin: 'کارمزد خدمت',
  rush: 'هزینه‌ی سرعت',
  vat: 'مالیات بر ارزش افزوده',
  rounding: 'گرد کردن',
  discount_tier: 'تخفیف سطح کاربری',
  discount_promo: 'تخفیف ویژه',
}
const VISIBLE: Record<string, boolean> = {
  service_value: true,
  provider_fees: true,
  exchange_cost: true,
  volatility_buffer: false,
  risk_buffer: false,
  payment_fee: true,
  margin: false,
  rush: true,
  vat: true,
  rounding: false,
  discount_tier: true,
  discount_promo: true,
}

function mkLine(key: keyof typeof LABELS_FA, amount: number, code?: QuoteLineCode): QuoteLine {
  return {
    code: code ?? (key.startsWith('discount') ? 'discount' : (key as QuoteLineCode)),
    labelFa: LABELS_FA[key] as string,
    amountIrt: amount,
    visibleToCustomer: VISIBLE[key] as boolean,
  }
}

const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0)

/** Taker fee (bps) of the exchange behind `rate.executableAskExchangeId`; if unknown (halted) the highest enabled taker fee (conservative). */
export function resolveTakerBps(rate: RateSnapshot, exchanges: readonly ExchangeParams[]): number {
  const id = rate.executableAskExchangeId
  const found = id ? exchanges.find((e) => e.id === id) : undefined
  if (found) return found.takerFeeBps
  const enabled = exchanges.filter((e) => e.enabled)
  return enabled.length ? Math.max(...enabled.map((e) => e.takerFeeBps)) : 0
}

function volatilityPct(
  rate: RateSnapshot,
  policy: PricingInput['policy'],
  lockMinutes: number,
  mode: 'irt' | 'usdt',
): { sigma: number; mu: number; tauLock: number; tauLag: number; raw: number; clamped: number; halt: number; final: number } {
  const v = policy.volatility
  const sigma = rate.volatility.dailyPct
  if (!Number.isFinite(sigma) || sigma < 0) throw new RangeError(`rate.volatility.dailyPct invalid: ${sigma}`)
  if (!Number.isFinite(rate.volatility.driftPctPerDay)) throw new RangeError('rate.volatility.driftPctPerDay invalid')
  const mu = Math.max(0, Math.max(rate.volatility.driftPctPerDay, v.driftFloorPctPerDay))
  const tauLock = lockMinutes / 1440
  const tauLag = v.replenishmentLagDays
  if (mode === 'irt') {
    const raw = v.z * sigma * Math.sqrt(tauLock) + mu * tauLag + v.z * sigma * Math.sqrt(tauLag)
    const clamped = Math.min(v.maxBufferPct, Math.max(v.minBufferPct, raw))
    const halt = rate.status === 'ok' ? 0 : v.haltPremiumPct
    return { sigma, mu, tauLock, tauLag, raw, clamped, halt, final: clamped + halt }
  }
  const raw = v.z * sigma * Math.sqrt(tauLock)
  const clamped = Math.min(v.maxBufferPct, Math.max(0, raw))
  return { sigma, mu, tauLock, tauLag, raw, clamped, halt: 0, final: clamped }
}

/** Customer-safe unavailable reason per method (undefined = available). */
function methodUnavailable(
  method: PaymentMethod,
  input: PricingInput,
  totalIrt: number,
  totalMicroUsdt: number | undefined,
): string | undefined {
  const pm = input.paymentMethods
  if (input.allowedMethods && !input.allowedMethods.includes(method)) {
    return 'این روش پرداخت برای سطح حساب شما فعال نیست؛ پس از تکمیل احراز هویت در دسترس خواهد بود.'
  }
  switch (method) {
    case 'gateway': {
      const g = pm.gateway
      if (!g.enabled) return 'درگاه پرداخت در حال حاضر غیرفعال است.'
      if (totalIrt < g.minIrt) return `مبلغ کمتر از حداقل پرداخت با درگاه (${formatIrt(g.minIrt)}) است.`
      if (totalIrt > g.maxIrt) return `مبلغ بیشتر از سقف پرداخت با درگاه (${formatIrt(g.maxIrt)}) است.`
      return undefined
    }
    case 'card_to_card': {
      const c = pm.card_to_card
      if (!c.enabled || c.cards.length === 0) return 'پرداخت کارت‌به‌کارت در حال حاضر غیرفعال است.'
      if (totalIrt < c.minIrt) return `مبلغ کمتر از حداقل کارت‌به‌کارت (${formatIrt(c.minIrt)}) است.`
      if (totalIrt + c.uniqueOffsetMaxIrt > c.maxOrderIrt) return `مبلغ بیشتر از سقف سفارش کارت‌به‌کارت (${formatIrt(c.maxOrderIrt)}) است.`
      if (totalIrt + c.uniqueOffsetMaxIrt > c.perCardDailyCapIrt) return 'مبلغ از سقف روزانه‌ی هر کارت بیشتر است؛ از روش دیگری پرداخت کنید.'
      if (input.c2cCapacityRemainingIrt !== undefined && totalIrt + c.uniqueOffsetMaxIrt > input.c2cCapacityRemainingIrt) {
        return 'ظرفیت دریافت کارت‌به‌کارت امروز تکمیل شده است؛ از روش دیگری پرداخت کنید.'
      }
      return undefined
    }
    case 'bank_transfer': {
      const b = pm.bank_transfer
      if (!b.enabled) return 'پرداخت با انتقال بانکی در حال حاضر غیرفعال است.'
      if (totalIrt < b.minIrt) return `انتقال بانکی از ${formatIrt(b.minIrt)} به بالا امکان‌پذیر است.`
      if (totalIrt > b.maxIrt) return `مبلغ بیشتر از سقف انتقال بانکی (${formatIrt(b.maxIrt)}) است.`
      return undefined
    }
    case 'usdt': {
      const u = pm.usdt
      if (!u.enabled) return 'پرداخت با تتر در حال حاضر غیرفعال است.'
      if (totalMicroUsdt !== undefined && totalMicroUsdt < u.minMicroUsdt) {
        return `حداقل مبلغ پرداخت با تتر ${formatNumberFa(u.minMicroUsdt / 1_000_000, 2)} تتر است.`
      }
      return undefined
    }
    case 'wallet': {
      if (!pm.wallet.enabled) return 'پرداخت از کیف پول در حال حاضر غیرفعال است.'
      if (input.walletBalanceIrt === undefined) return 'برای پرداخت از کیف پول باید وارد حساب خود شوید.'
      if (input.walletBalanceIrt < totalIrt) return 'موجودی کیف پول برای این سفارش کافی نیست.'
      return undefined
    }
  }
}

function assertLinesSum(lines: QuoteLine[], total: number, label: string): void {
  const s = sum(lines.map((l) => l.amountIrt))
  if (s !== total) throw new Error(`pricing invariant violated (${label}): lines sum ${s} ≠ total ${total}`)
}

/**
 * Prices one product/amount/rush-tier for several payment methods. Throws `AppError('RATES_UNAVAILABLE')` if the snapshot is `killed`
 * or has non-positive prices, `AppError('VALIDATION')` for a bad amount / unknown rush tier. Everything else (disabled method, limits,
 * product/provider disabled, rush capacity) is reported per method via `available` + `unavailableReasonFa`.
 */
export function priceQuote(input: PricingInput): QuoteComputation {
  const { now, product, provider, policy, rate } = input
  const A = input.amountUsdCents
  if (!Number.isSafeInteger(A) || A <= 0) throw new AppError('VALIDATION', 'amountUsdCents must be a positive integer', { amountUsdCents: A })
  if (rate.status === 'killed') throw new AppError('RATES_UNAVAILABLE', 'rate snapshot is killed')
  for (const [k, v] of [['executableAsk', rate.executableAsk], ['executableBid', rate.executableBid], ['mid', rate.mid]] as const) {
    if (!Number.isFinite(v) || v <= 0) throw new AppError('RATES_UNAVAILABLE', `rate.${k} invalid: ${v}`)
  }
  const tier = policy.rushTiers.find((t) => t.id === input.rushTierId)
  if (!tier) throw new AppError('VALIDATION', `unknown rush tier ${input.rushTierId}`, { rushTier: input.rushTierId })
  if (!Number.isFinite(input.exchangeTakerBps) || input.exchangeTakerBps < 0) throw new RangeError('exchangeTakerBps invalid')

  const notes: string[] = []
  const warnings: string[] = []
  const warningCodes: string[] = []
  const lockMinutes = input.lockMinutes ?? policy.volatility.lockMinutes
  if (!(lockMinutes > 0)) throw new RangeError('lockMinutes must be > 0')
  const step = policy.roundingStepIrt

  // ── 0. product-level availability ────────────────────────────────────────────────────────────
  let productBlock: string | undefined
  if (!product.active) productBlock = 'این محصول در حال حاضر در دسترس نیست.'
  else if (!provider.enabled) productBlock = 'تأمین‌کننده‌ی این محصول موقتاً در دسترس نیست.'
  else if (A < provider.fees.minLoadUsdCents) productBlock = 'مبلغ کمتر از حداقل شارژ این سرویس است.'
  else if (provider.limits.maxTopupUsdCents > 0 && A > provider.limits.maxTopupUsdCents) productBlock = 'مبلغ بیشتر از سقف این سرویس است.'

  // ── 1. funding need ─────────────────────────────────────────────────────────────────────────
  const newCard = input.newCard ?? product.includesCardIssue
  const f = provider.fees
  const issueCents = newCard ? f.issueUsdCents : 0
  const topupCents = D(A).mul(f.topupBps).div(10_000)
  const fxCents = D(A).mul(product.vendorFxBps ?? 0).div(10_000)
  const providerFeeCents = D(issueCents).plus(topupCents).plus(f.topupFixedUsdCents).plus(fxCents).plus(policy.declineBufferUsdCents)
  const fundingCents = D(A).plus(providerFeeCents)
  const faceMicro = D(A).mul(10_000)
  const feesMicro = providerFeeCents.mul(10_000)
  const haircutFactor = D(1).plus(D(policy.stablecoin.parHaircutBps).div(10_000))
  const fundingMicroDec = faceMicro.plus(feesMicro).mul(haircutFactor).plus(policy.networkFeeAllocMicroUsdt)
  const fundingMicroUsdt = toInt(fundingMicroDec, 'up', 'fundingMicroUsdt')

  // ── 2. replacement cost ─────────────────────────────────────────────────────────────────────
  const ask = rate.executableAsk
  const unit = D(ask).mul(D(1).plus(D(input.exchangeTakerBps).div(10_000)))
  const x1 = faceMicro.mul(unit).div(1_000_000)
  const x12 = faceMicro.plus(feesMicro).mul(unit).div(1_000_000)
  const xAll = D(fundingMicroUsdt).mul(unit).div(1_000_000)
  const serviceValue = toInt(x1, 'up', 'serviceValue')
  const cum12 = toInt(x12, 'up', 'providerFees')
  const C = toInt(xAll, 'up', 'cost')
  const providerFees = cum12 - serviceValue
  const exchangeCost = C - cum12
  if (providerFees < 0 || exchangeCost < 0) throw new Error('pricing invariant: negative cost component')

  // ── 3/4. buffers ────────────────────────────────────────────────────────────────────────────
  const vol = volatilityPct(rate, policy, lockMinutes, 'irt')
  const bufVol = toInt(D(C).mul(vol.final), 'up', 'volBuffer')
  const bufRisk = toInt(D(C).mul(policy.riskBufferPct), 'up', 'riskBuffer')
  const basePre = C + bufVol + bufRisk
  if (rate.status !== 'ok') {
    warnings.push('نرخ بازار در حال حاضر نوسان یا محدودیت معاملاتی دارد؛ قیمت با ضریب احتیاط بیشتری محاسبه شده است.')
    warningCodes.push(`rates_${rate.status}`)
  }

  // ── VAT ─────────────────────────────────────────────────────────────────────────────────────
  const vatApplies = input.tax ? input.tax.vatApplies : policy.vat.applies
  const vatPct = input.tax ? input.tax.vatPct : policy.vat.pct
  const vatOf = (n: number): number => (vatApplies ? toInt(D(n).mul(vatPct), 'half_up', 'vat') : 0)

  // ── 5. margin ───────────────────────────────────────────────────────────────────────────────
  const lossLeader = !!product.lossLeader
  const famPct = product.marginOverridePct ?? policy.marginPctByFamily[product.family] ?? policy.marginPct
  const minM = product.minMarginOverrideIrt ?? policy.minMarginIrtByFamily[product.family] ?? policy.minMarginIrt
  const floorPct = policy.floorMarginPct
  const pctBase = lossLeader ? Math.min(famPct, policy.maxMarginPct) : Math.min(policy.maxMarginPct, Math.max(floorPct, famPct))
  const tierDiscPct = policy.tierDiscountPct[input.customerTier] ?? 0
  const pctTier = lossLeader ? pctBase - tierDiscPct : Math.max(floorPct, pctBase - tierDiscPct)
  const mFloor = lossLeader ? -(bufVol + bufRisk) : Math.max(minM, toInt(D(C).mul(floorPct), 'up', 'floorMargin'))
  const marginFromPct = (pct: number): number => {
    const m = toInt(D(C).mul(pct), 'up', 'margin')
    return lossLeader ? Math.max(mFloor, m) : Math.max(minM, m)
  }
  let mBase: number
  let mTier: number
  let tierDiscount: number
  let compReduction = 0
  let promo = 0
  let mFinal: number
  let overridden = false
  let competitor: CompetitorBreakdown = { enabled: policy.competitor.enabled, applied: false, uncompetitive: false }
  if (input.overrideMarginIrt !== undefined) {
    overridden = true
    mBase = assertSafeInt(input.overrideMarginIrt, 'overrideMarginIrt')
    mTier = mBase
    tierDiscount = 0
    mFinal = mBase
    notes.push('margin overridden (admin what-if)')
  } else {
    mBase = marginFromPct(pctBase)
    mTier = Math.max(mFloor, marginFromPct(pctTier))
    tierDiscount = Math.max(0, mBase - mTier)
    let mGuard = mTier
    // competitor guard (method-independent: compares price before rush and payment fee, VAT included)
    if (policy.competitor.enabled && input.competitorRefIrt !== undefined && input.competitorRefIrt > 0) {
      const ceilingIrt = toInt(D(input.competitorRefIrt).mul(D(1).plus(policy.competitor.tolerancePct)), 'down', 'competitorCeiling')
      const ceilingEff = floorToStep(ceilingIrt, step)
      let nMax = toInt(D(ceilingEff).div(D(1).plus(vatApplies ? vatPct : 0)), 'down', 'nMax')
      while (nMax + vatOf(nMax) > ceilingEff) nMax -= 1
      while (nMax + 1 + vatOf(nMax + 1) <= ceilingEff) nMax += 1
      const mNeeded = nMax - basePre
      competitor = { enabled: true, refIrt: input.competitorRefIrt, ceilingIrt: ceilingEff, applied: false, uncompetitive: false }
      if (mTier > mNeeded) {
        mGuard = Math.min(mTier, Math.max(mNeeded, mFloor))
        compReduction = mTier - mGuard
        competitor.applied = compReduction > 0
      }
      const pc = basePre + mGuard + vatOf(basePre + mGuard)
      competitor.uncompetitive = pc > ceilingEff
    }
    const promoReq = Math.max(0, input.promoDiscountIrt ?? 0)
    promo = Math.min(promoReq, Math.max(0, mGuard - mFloor))
    mFinal = mGuard - promo
  }
  const marginLine = mBase - compReduction
  const uncompetitive = competitor.uncompetitive
  if (uncompetitive) {
    warningCodes.push('uncompetitive')
    notes.push('price stays above competitor ceiling even at floor margin')
  }

  // ── 6/7. rush options + chosen tier ─────────────────────────────────────────────────────────
  const netBeforeRush = basePre + mFinal
  const rushFor = (t: RushTier): number => (t.enabled ? Math.max(t.minPremiumIrt, toInt(D(netBeforeRush).mul(t.premiumPct), 'up', 'rush')) : 0)
  const rushTiers: RushOption[] = policy.rushTiers
    .filter((t) => t.enabled || t.id === tier.id)
    .map((t) => {
      const cap = input.rushCapacity?.[t.id]
      const available = t.enabled && (cap ? cap.available : true)
      return {
        id: t.id,
        labelFa: t.labelFa,
        available,
        premiumIrt: rushFor(t),
        slaMinutes: t.slaMinutes,
        ...(cap?.nextSlotAt !== undefined ? { nextSlotAt: cap.nextSlotAt } : {}),
        ...(!available ? { reasonFa: !t.enabled ? 'این سطح سرعت غیرفعال است.' : (cap?.reasonFa ?? 'ظرفیت این سطح سرعت تکمیل است.') } : {}),
      }
    })
  const chosenOption = rushTiers.find((o) => o.id === tier.id) as RushOption
  const rush = rushFor(tier)
  const rushBlock = chosenOption.available ? undefined : (chosenOption.reasonFa as string)
  if (rushBlock) warningCodes.push('rush_unavailable')

  const N = netBeforeRush + rush
  const vat = vatOf(N)
  const T = N + vat

  // ── 8. IRT methods ──────────────────────────────────────────────────────────────────────────
  const costLinesBase: QuoteLine[] = [
    mkLine('service_value', serviceValue),
    mkLine('provider_fees', providerFees),
    mkLine('exchange_cost', exchangeCost),
    mkLine('volatility_buffer', bufVol),
    mkLine('risk_buffer', bufRisk),
    mkLine('margin', marginLine),
  ]
  const coreLines = (): QuoteLine[] => {
    const ls = [...costLinesBase]
    if (tierDiscount !== 0) ls.push(mkLine('discount_tier', -tierDiscount))
    if (promo !== 0) ls.push(mkLine('discount_promo', -promo))
    if (rush !== 0) ls.push(mkLine('rush', rush))
    if (vat !== 0) ls.push(mkLine('vat', vat))
    return ls
  }
  const core = coreLines()
  if (sum(core.map((l) => l.amountIrt)) !== T) throw new Error('pricing invariant violated: core lines ≠ T')

  const pricedIrt = (method: Exclude<PaymentMethod, 'usdt'>): { total: number; fee: number; lines: QuoteLine[]; rounding: number; branch: MethodBreakdown['grossUp'] } => {
    let fee = 0
    let total: number
    let branch: MethodBreakdown['grossUp'] = 'none'
    if (method === 'gateway') {
      const g = input.paymentMethods.gateway
      const gu = grossUpGateway(T, g)
      branch = gu.branch
      total = ceilToStep(gu.amount, step)
      fee = gatewayFee(total, g)
      while (total - fee < T) {
        total += step
        fee = gatewayFee(total, g)
      }
    } else {
      total = ceilToStep(T, step)
    }
    const lines = [...core]
    if (fee !== 0) lines.push(mkLine('payment_fee', fee))
    const rounding = total - T - fee
    if (rounding < 0) throw new Error('pricing invariant violated: negative rounding')
    if (rounding !== 0) lines.push(mkLine('rounding', rounding))
    assertLinesSum(lines, total, method)
    return { total, fee, lines, rounding, branch }
  }

  const methods = [...new Set(input.methods)]
  const byMethod: Partial<Record<PaymentMethod, MethodBreakdown>> = {}
  const economics: Partial<Record<PaymentMethod, MethodEconomics>> = {}
  const perMethod: ComputedMethodQuote[] = []
  const effRate = (irt: number): number => (irt * 100) / A

  // reference IRT price without payment fee (used to cap the USDT price)
  const refTotalNoFee = ceilToStep(T, step)

  const econFor = (total: number, fee: number, rounding: number, costIrt: number, bufferIrt: number, marginLine2: number): MethodEconomics => {
    const netRevenue = total - vat - fee
    const marginIrt = marginLine2 + rounding
    const unit2: UnitEconomics = {
      costIrt,
      marginIrt,
      feesIrt: fee,
      bufferIrt,
      vatIrt: vat,
      rushIrt: rush,
      grossMarginPct: netRevenue > 0 ? marginIrt / netRevenue : 0,
    }
    return { costIrt, bufferIrt, marginIrt, feeIrt: fee, vatIrt: vat, rushIrt: rush, discountIrt: tierDiscount + promo, netRevenueIrt: netRevenue, unit: unit2 }
  }

  let usdtBreakdown: UsdtBreakdown | undefined

  for (const method of methods) {
    if (method !== 'usdt') {
      const p = pricedIrt(method)
      const reason = productBlock ?? rushBlock ?? methodUnavailable(method, input, p.total, undefined)
      perMethod.push({
        method,
        currency: 'IRT',
        totalIrt: p.total,
        feeIrt: p.fee,
        lines: p.lines,
        effectiveRateIrtPerUsd: effRate(p.total),
        available: reason === undefined,
        ...(reason !== undefined ? { unavailableReasonFa: reason } : {}),
      })
      byMethod[method] = { netTargetIrt: T, grossUp: p.branch, feeIrt: p.fee, totalIrt: p.total, roundingIrt: p.rounding }
      economics[method] = econFor(p.total, p.fee, p.rounding, C, bufVol + bufRisk, mFinal)
      continue
    }

    // ── 9. USDT-pay variant ──────────────────────────────────────────────────────────────────
    const bid = rate.executableBid
    const F = fundingMicroUsdt
    const volU = volatilityPct(rate, policy, lockMinutes, 'usdt')
    const bufU = toInt(D(F).mul(volU.final), 'up', 'usdtBuffer')
    const riskU = toInt(D(F).mul(policy.riskBufferPct), 'up', 'usdtRisk')
    const uPct = Math.max(Math.min(policy.usdt.marginPct, floorPct), policy.usdt.marginPct - tierDiscPct)
    let mU = Math.max(policy.usdt.minMarginMicroUsdt, toInt(D(F).mul(uPct), 'up', 'usdtMargin'))
    if (overridden) mU = Math.max(0, toInt(D(mFinal).div(bid).mul(1_000_000), 'up', 'usdtMarginOverride'))
    const nU0 = F + bufU + riskU + mU
    const rushU = tier.enabled
      ? Math.max(toInt(D(tier.minPremiumIrt).div(bid).mul(1_000_000), 'up', 'usdtRushMin'), toInt(D(nU0).mul(tier.premiumPct), 'up', 'usdtRush'))
      : 0
    const nU = nU0 + rushU
    const vatU = vatApplies ? toInt(D(nU).mul(vatPct), 'half_up', 'usdtVat') : 0
    const tU = nU + vatU
    const roundU = policy.usdt.roundStepMicroUsdt
    let totalU = ceilToStep(tU, roundU)
    // cap: Toman equivalent (at bid, rounded down) must not exceed the IRT price without payment fee
    const capMicro = Math.max(ceilToStep(F, roundU), floorToStep(toInt(D(refTotalNoFee).div(bid).mul(1_000_000), 'down', 'usdtCap'), roundU))
    let capped = false
    let marginU = mU
    if (totalU > capMicro) {
      capped = true
      const over = Math.max(0, tU - capMicro)
      marginU = mU - over
      totalU = capMicro
    }
    // micro lines (before display conversion)
    const microLines: { code: string; key: keyof typeof LABELS_FA; amount: number }[] = [
      { code: 'service_value', key: 'service_value', amount: toInt(faceMicro, 'up', 'uFace') },
      { code: 'provider_fees', key: 'provider_fees', amount: toInt(feesMicro, 'up', 'uFees') },
    ]
    const costPart = F - microLines[0]!.amount - microLines[1]!.amount
    microLines.push({ code: 'exchange_cost', key: 'exchange_cost', amount: costPart })
    microLines.push({ code: 'volatility_buffer', key: 'volatility_buffer', amount: bufU })
    microLines.push({ code: 'risk_buffer', key: 'risk_buffer', amount: riskU })
    microLines.push({ code: 'margin', key: 'margin', amount: marginU })
    if (rushU !== 0) microLines.push({ code: 'rush', key: 'rush', amount: rushU })
    if (vatU !== 0) microLines.push({ code: 'vat', key: 'vat', amount: vatU })
    const preRounding = sum(microLines.map((l) => l.amount))
    const roundingMicro = totalU - preRounding
    if (roundingMicro !== 0) microLines.push({ code: 'rounding', key: 'rounding', amount: roundingMicro })
    if (sum(microLines.map((l) => l.amount)) !== totalU) throw new Error('pricing invariant violated: usdt lines ≠ total')
    // display conversion at bid with cumulative floor so the Toman lines sum EXACTLY to the equivalent
    let prefix = 0
    let prevCum = 0
    const lines: QuoteLine[] = []
    for (const l of microLines) {
      prefix += l.amount
      const cum = toInt(D(prefix).mul(bid).div(1_000_000), 'down', 'usdtDisplay')
      lines.push(mkLine(l.key, cum - prevCum, l.code as QuoteLineCode))
      prevCum = cum
    }
    const equivalent = prevCum
    const reason = productBlock ?? rushBlock ?? methodUnavailable('usdt', input, equivalent, totalU)
    perMethod.push({
      method: 'usdt',
      currency: 'USDT',
      totalMicroUsdt: totalU,
      equivalentIrt: equivalent,
      feeIrt: 0,
      lines,
      effectiveRateIrtPerUsd: effRate(equivalent),
      available: reason === undefined,
      ...(reason !== undefined ? { unavailableReasonFa: reason } : {}),
    })
    usdtBreakdown = {
      fundingMicroUsdt: F,
      bufferPct: volU.final,
      bufferMicroUsdt: bufU,
      riskMicroUsdt: riskU,
      marginMicroUsdt: marginU,
      rushMicroUsdt: rushU,
      vatMicroUsdt: vatU,
      totalMicroUsdt: totalU,
      cappedByIrtPrice: capped,
      equivalentIrt: equivalent,
      lines: microLines.map((l) => ({ code: l.code, amountMicroUsdt: l.amount })),
    }
    const costU = toInt(D(F).mul(bid).div(1_000_000), 'up', 'usdtCostIrt')
    const marginIrtU = toInt(D(marginU + roundingMicro).mul(bid).div(1_000_000), 'down', 'usdtMarginIrt')
    const bufU_irt = toInt(D(bufU + riskU).mul(bid).div(1_000_000), 'up', 'usdtBufferIrt')
    const vatIrtU = toInt(D(vatU).mul(bid).div(1_000_000), 'down', 'usdtVatIrt')
    const rushIrtU = toInt(D(rushU).mul(bid).div(1_000_000), 'down', 'usdtRushIrt')
    const net = equivalent - vatIrtU
    byMethod.usdt = { netTargetIrt: equivalent, grossUp: 'none', feeIrt: 0, totalIrt: equivalent, roundingIrt: toInt(D(roundingMicro).mul(bid).div(1_000_000), 'down', 'usdtRoundingIrt') }
    economics.usdt = {
      costIrt: costU,
      bufferIrt: bufU_irt,
      marginIrt: marginIrtU,
      feeIrt: 0,
      vatIrt: vatIrtU,
      rushIrt: rushIrtU,
      discountIrt: tierDiscount + promo,
      netRevenueIrt: net,
      unit: {
        costIrt: costU,
        marginIrt: marginIrtU,
        feesIrt: 0,
        bufferIrt: bufU_irt,
        vatIrt: vatIrtU,
        rushIrt: rushIrtU,
        grossMarginPct: net > 0 ? marginIrtU / net : 0,
      },
    }
  }

  // ── output ──────────────────────────────────────────────────────────────────────────────────
  const primary = perMethod.find((m) => m.available) ?? perMethod[0]
  const emptyEcon: MethodEconomics = econFor(refTotalNoFee, 0, refTotalNoFee - T, C, bufVol + bufRisk, mFinal)
  const primaryEcon = (primary && economics[primary.method]) || emptyEcon

  const margin: MarginBreakdown = {
    famPct,
    pctBase,
    pctAfterTier: pctTier,
    minMarginIrt: minM,
    floorIrt: mFloor,
    baseIrt: mBase,
    tierDiscountIrt: tierDiscount,
    competitorReductionIrt: compReduction,
    promoDiscountIrt: promo,
    finalIrt: mFinal,
    lossLeader,
    overridden,
  }
  const breakdown: PricingBreakdown = {
    amountUsdCents: A,
    newCard,
    fundingUsdCents: fundingCents.toNumber(),
    fundingMicroUsdt,
    parts: {
      faceMicroUsdt: toInt(faceMicro, 'up'),
      providerFeesMicroUsdt: toInt(feesMicro, 'up'),
      haircutAndNetworkMicroUsdt: fundingMicroUsdt - toInt(faceMicro, 'up') - toInt(feesMicro, 'up'),
    },
    askIrt: ask,
    takerBps: input.exchangeTakerBps,
    unitCostIrtPerUsdt: unit.toNumber(),
    costIrt: C,
    costLines: { serviceValue, providerFees, exchangeCost },
    volatility: {
      sigmaDaily: vol.sigma,
      driftUsedPerDay: vol.mu,
      z: policy.volatility.z,
      tauLockDays: vol.tauLock,
      tauLagDays: vol.tauLag,
      rawPct: vol.raw,
      clampedPct: vol.clamped,
      haltPremiumPct: vol.halt,
      finalPct: vol.final,
      bufferIrt: bufVol,
    },
    riskBufferIrt: bufRisk,
    margin,
    competitor,
    rushIrt: rush,
    vatIrt: vat,
    vatPct: vatApplies ? vatPct : 0,
    netBeforeRushIrt: netBeforeRush,
    netIrt: N,
    byMethod,
    ...(usdtBreakdown ? { usdt: usdtBreakdown } : {}),
    notes,
  }

  return {
    productId: product.id,
    amountUsdCents: A,
    rushTier: tier.id,
    createdAt: now,
    lockedUntil: now + Math.round(lockMinutes * 60_000),
    rateSnapshotId: rate.id,
    rateStatus: rate.status,
    policyVersion: policy.version,
    perMethod,
    fundingMicroUsdt,
    costIrt: C,
    marginIrt: mFinal,
    bufferIrt: bufVol + bufRisk,
    unitEconomics: primaryEcon.unit,
    economics,
    uncompetitive,
    ...(input.competitorRefIrt !== undefined ? { competitorRefIrt: input.competitorRefIrt } : {}),
    rushTiers,
    warnings,
    warningCodes,
    breakdown,
  }
}
