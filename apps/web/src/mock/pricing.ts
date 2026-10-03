/**
 * Mock pricing: a simplified, transparent version of architecture.md §7 so the UI shows believable itemised quotes.
 * Not the real engine (packages/core) — the web app only ever renders what the API returns.
 */
import type { PaymentMethod, Product, QuoteDto, QuoteLineDto, QuoteMethodDto, RushTierDto } from '@hiclaude/contracts'

export interface PricingEnv {
  /** Toman per USDT we sell at (executable ask) */
  ask: number
  /** Toman per USDT we buy back at (executable bid) */
  bid: number
  now: number
  lockMs: number
  rushTiers: RushTierDto[]
  methods: { method: PaymentMethod; enabled: boolean; minIrt?: number; maxIrt?: number }[]
  killed: boolean
  stale: boolean
}

const ROUND = 1000
const ceilTo = (n: number, step: number): number => Math.ceil(n / step) * step
const RUSH: Record<string, { pct: number; min: number }> = { normal: { pct: 0, min: 0 }, fast: { pct: 0.04, min: 100_000 }, express: { pct: 0.1, min: 300_000 } }

const LABEL: Record<string, string> = {
  service_value: 'ارزش سرویس',
  provider_fees: 'کارمزد ارائه‌دهنده‌ی سرویس',
  exchange_cost: 'هزینه‌ی تأمین ارز',
  volatility_buffer: 'حاشیه‌ی نوسان نرخ (تا پایان مهلت قیمت)',
  risk_buffer: 'حاشیه‌ی ریسک و پشتیبانی',
  margin: 'کارمزد خدمات',
  rush: 'هزینه‌ی سرویس سریع‌تر',
  payment_fee: 'کارمزد پرداخت',
  rounding: 'گردکردن',
  discount: 'تخفیف',
}

const line = (code: string, amountIrt: number): QuoteLineDto => ({ code, labelFa: LABEL[code] ?? code, amountIrt })

export function priceMethods(p: Product, amountUsdCents: number, rushTier: string, env: PricingEnv): { perMethod: QuoteMethodDto[]; warnings: string[]; funding: number } {
  const A = amountUsdCents / 100
  const topupPct = p.kind === 'voucher' ? 0.015 : p.kind === 'service_payment' ? 0.02 : 0.03
  const issueFee = p.includesCardIssue ? 4.99 : 0
  const fundingUsd = A + issueFee + A * topupPct + 0.3 + 0.25
  const providerFeesUsd = fundingUsd - A
  const serviceValue = A * env.ask
  const providerFees = providerFeesUsd * env.ask
  const exchangeCost = fundingUsd * env.ask * 0.006
  const volBuf = fundingUsd * env.ask * (env.stale ? 0.02 : 0.008)
  const cost = fundingUsd * env.ask * 1.006
  const riskBuf = cost * 0.01
  const margin = Math.max(150_000, cost * 0.1)
  const subtotal = serviceValue + providerFees + exchangeCost + volBuf + riskBuf + margin
  const rt = RUSH[rushTier] ?? { pct: 0, min: 0 }
  const rush = rushTier === 'normal' ? 0 : Math.max(rt.min, rt.pct * subtotal)

  const perMethod: QuoteMethodDto[] = env.methods.map((m) => {
    const baseLines: QuoteLineDto[] = [
      line('service_value', Math.round(serviceValue)),
      line('provider_fees', Math.round(providerFees)),
      line('exchange_cost', Math.round(exchangeCost)),
      line('volatility_buffer', Math.round(volBuf)),
      line('risk_buffer', Math.round(riskBuf)),
      line('margin', Math.round(margin)),
      ...(rush > 0 ? [line('rush', Math.round(rush))] : []),
    ]
    if (m.method === 'usdt') {
      // pay in USDT: no conversion/volatility exposure → smaller buffers, 4 % margin
      const usdtLines: QuoteLineDto[] = [
        line('service_value', Math.round(serviceValue)),
        line('provider_fees', Math.round(providerFees)),
        line('margin', Math.round(Math.max(0.5 * env.ask, cost * 0.04))),
        ...(rush > 0 ? [line('rush', Math.round(rush))] : []),
      ]
      const sum = usdtLines.reduce((s, l) => s + l.amountIrt, 0)
      const micro = Math.ceil((sum / env.ask) * 100) * 10_000 // up to 0.01 USDT
      const totalIrt = Math.round((micro / 1_000_000) * env.ask)
      const lines = [...usdtLines, ...(totalIrt - sum !== 0 ? [line('rounding', totalIrt - sum)] : [])]
      return { method: m.method, currency: 'USDT', totalMicroUsdt: micro, totalIrt, feeIrt: 0, lines, effectiveRateIrtPerUsd: totalIrt / A, available: m.enabled && !env.killed }
    }
    const feeOf = (gross: number): number => (m.method === 'gateway' ? Math.min(16_000, Math.round(gross * 0.005) + 500) : 0)
    const pre = baseLines.reduce((s, l) => s + l.amountIrt, 0)
    const fee = feeOf(pre)
    const total = ceilTo(pre + fee, ROUND)
    const lines = [...baseLines, ...(fee ? [line('payment_fee', fee)] : []), ...(total - pre - fee !== 0 ? [line('rounding', total - pre - fee)] : [])]
    const out: QuoteMethodDto = { method: m.method, currency: 'IRT', totalIrt: total, feeIrt: fee, lines, effectiveRateIrtPerUsd: total / A, available: m.enabled && !env.killed }
    if (m.minIrt !== undefined && total < m.minIrt) Object.assign(out, { available: false, unavailableReasonFa: 'مبلغ سفارش کمتر از حداقل این روش پرداخت است.' })
    if (m.maxIrt !== undefined && total > m.maxIrt) Object.assign(out, { available: false, unavailableReasonFa: 'مبلغ سفارش بیشتر از سقف این روش پرداخت است؛ روش دیگری انتخاب کنید.' })
    if (!m.enabled) Object.assign(out, { unavailableReasonFa: 'این روش پرداخت موقتاً غیرفعال است.' })
    return out
  })

  const warnings: string[] = []
  if (env.stale) warnings.push('نرخ لحظه‌ای کمی کهنه است؛ حاشیه‌ی احتیاط در قیمت لحاظ شده است.')
  if (rushTier !== 'normal') warnings.push('سرویس سریع‌تر زمان انجام را کوتاه می‌کند اما تضمین نتیجه‌ی ارائه‌دهنده نیست.')
  return { perMethod, warnings, funding: Math.round(fundingUsd * 100) }
}

export function makeQuote(id: string, p: Product, amountUsdCents: number, rushTier: string, env: PricingEnv): QuoteDto {
  const { perMethod, warnings } = priceMethods(p, amountUsdCents, rushTier, env)
  const q: QuoteDto = {
    id,
    productId: p.id,
    amountUsdCents,
    rushTier,
    createdAt: env.now,
    lockedUntil: env.now + env.lockMs,
    rateAsOf: env.now,
    perMethod,
    warnings,
  }
  if (p.kind === 'voucher') q.savingsVsMarketPct = 3.2
  return q
}

/** Cheapest total payable right now (Toman-equivalent) for catalog «from» prices. */
export function fromPriceFor(p: Product, amountUsdCents: number, env: PricingEnv): number | undefined {
  const { perMethod } = priceMethods(p, amountUsdCents, 'normal', env)
  const v = perMethod.filter((m) => m.available).map((m) => m.totalIrt).filter((x): x is number => x !== undefined)
  return v.length ? Math.min(...v) : undefined
}
