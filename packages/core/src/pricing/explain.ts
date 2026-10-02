/**
 * explainQuote — human-readable “why this price” bullets for the admin panel (Persian by default, English optional).
 * Pure; reads only the computation's `breakdown`/`economics` (never recomputes money).
 */
import { formatIrt, formatNumberFa, formatPct } from '@hiclaude/contracts'
import type { QuoteComputation } from './types'

const nfmt = (n: number): string => n.toLocaleString('en-US')

/** Returns bullet lines explaining each component of the quote. */
export function explainQuote(c: QuoteComputation, lang: 'fa' | 'en' = 'fa'): string[] {
  const b = c.breakdown
  const out: string[] = []
  if (lang === 'fa') {
    out.push(`تأمین ارز: ${formatNumberFa(c.fundingMicroUsdt / 1e6, 2)} تتر (ارزش ${formatNumberFa(b.amountUsdCents / 100, 2)} دلار + کارمزدهای ارائه‌دهنده${b.newCard ? ' + صدور کارت' : ''}).`)
    out.push(`هزینه‌ی جایگزینی: نرخ خرید ${formatNumberFa(b.askIrt)} با کارمزد صرافی ${formatNumberFa(b.takerBps / 100, 2)}٪ ⇒ ${formatIrt(b.costIrt)}.`)
    out.push(
      `ضریب نوسان: ${formatPct(b.volatility.finalPct, 2)} (σ روزانه ${formatPct(b.volatility.sigmaDaily, 2)}، z=${formatNumberFa(b.volatility.z, 2)}، قفل قیمت ${formatNumberFa(b.volatility.tauLockDays * 1440)} دقیقه، تأخیر تأمین مجدد ${formatNumberFa(b.volatility.tauLagDays, 1)} روز${b.volatility.haltPremiumPct > 0 ? `، پریمیوم توقف ${formatPct(b.volatility.haltPremiumPct, 2)}` : ''}) ⇒ ${formatIrt(b.volatility.bufferIrt)}.`,
    )
    out.push(`ضریب ریسک عملیاتی: ${formatIrt(b.riskBufferIrt)}.`)
    const m = b.margin
    out.push(
      `حاشیه‌ی سود: پایه ${formatPct(m.pctBase, 2)} (حداقل ${formatIrt(m.minMarginIrt)}) ⇒ ${formatIrt(m.baseIrt)}` +
        (m.tierDiscountIrt ? `؛ تخفیف سطح ${formatIrt(m.tierDiscountIrt)}` : '') +
        (m.competitorReductionIrt ? `؛ کاهش به‌دلیل قیمت رقبا ${formatIrt(m.competitorReductionIrt)}` : '') +
        (m.promoDiscountIrt ? `؛ تخفیف ویژه ${formatIrt(m.promoDiscountIrt)}` : '') +
        ` ⇒ نهایی ${formatIrt(m.finalIrt)}.`,
    )
    if (b.competitor.refIrt !== undefined) {
      out.push(`مرجع رقبا: ${formatIrt(b.competitor.refIrt)} (سقف ${formatIrt(b.competitor.ceilingIrt ?? 0)})${b.competitor.uncompetitive ? ' — حتی با حداقل حاشیه‌ی سود گران‌تر است.' : b.competitor.applied ? ' — حاشیه‌ی سود کاهش یافت.' : ' — بدون نیاز به تعدیل.'}`)
    }
    if (b.rushIrt) out.push(`هزینه‌ی سرعت (${c.rushTier}): ${formatIrt(b.rushIrt)}.`)
    if (b.vatIrt) out.push(`مالیات بر ارزش افزوده (${formatPct(b.vatPct, 1)}): ${formatIrt(b.vatIrt)}.`)
    for (const pm of c.perMethod) {
      const mb = b.byMethod[pm.method]
      const e = c.economics[pm.method]
      if (pm.currency === 'USDT') {
        out.push(`پرداخت با تتر: ${formatNumberFa((pm.totalMicroUsdt ?? 0) / 1e6, 2)} تتر (معادل ${formatIrt(pm.equivalentIrt ?? 0)} به نرخ فروش)${b.usdt?.cappedByIrtPrice ? ' — به سقف قیمت تومانی محدود شد' : ''}.`)
      } else {
        out.push(`پرداخت ${pm.method}: ${formatIrt(pm.totalIrt ?? 0)} (کارمزد ${formatIrt(pm.feeIrt)}${mb && mb.grossUp === 'cap' ? '، سقف کارمزد اعمال شد' : ''}، گرد کردن ${formatIrt(mb?.roundingIrt ?? 0)}، حاشیه‌ی سود خالص ${formatIrt(e?.marginIrt ?? 0)}).`)
      }
      if (!pm.available) out.push(`  ⚠ ${pm.method} در دسترس نیست: ${pm.unavailableReasonFa}`)
    }
    if (c.uncompetitive) out.push('هشدار: قیمت غیررقابتی است؛ نشان «بهترین قیمت» نمایش داده نشود.')
    for (const w of c.warnings) out.push(`هشدار: ${w}`)
  } else {
    out.push(`Funding: ${nfmt(c.fundingMicroUsdt / 1e6)} USDT (face $${b.amountUsdCents / 100} + provider fees${b.newCard ? ' + card issue' : ''}).`)
    out.push(`Replacement cost: ask ${nfmt(b.askIrt)} × (1 + ${b.takerBps} bps taker) ⇒ ${nfmt(b.costIrt)} IRT.`)
    out.push(
      `Volatility buffer: ${(b.volatility.finalPct * 100).toFixed(2)}% (σ_day ${(b.volatility.sigmaDaily * 100).toFixed(2)}%, z=${b.volatility.z}, lock ${(b.volatility.tauLockDays * 1440).toFixed(0)} min, replenishment lag ${b.volatility.tauLagDays} d${b.volatility.haltPremiumPct > 0 ? `, halt premium ${(b.volatility.haltPremiumPct * 100).toFixed(2)}%` : ''}) ⇒ ${nfmt(b.volatility.bufferIrt)} IRT.`,
    )
    out.push(`Risk buffer: ${nfmt(b.riskBufferIrt)} IRT.`)
    const m = b.margin
    out.push(
      `Margin: base ${(m.pctBase * 100).toFixed(2)}% (min ${nfmt(m.minMarginIrt)}) ⇒ ${nfmt(m.baseIrt)}` +
        (m.tierDiscountIrt ? `; tier discount ${nfmt(m.tierDiscountIrt)}` : '') +
        (m.competitorReductionIrt ? `; competitor guard −${nfmt(m.competitorReductionIrt)}` : '') +
        (m.promoDiscountIrt ? `; promo −${nfmt(m.promoDiscountIrt)}` : '') +
        ` ⇒ final ${nfmt(m.finalIrt)} IRT.`,
    )
    if (b.competitor.refIrt !== undefined) {
      out.push(`Competitor ref ${nfmt(b.competitor.refIrt)} (ceiling ${nfmt(b.competitor.ceilingIrt ?? 0)})${b.competitor.uncompetitive ? ' — still above even at floor margin' : b.competitor.applied ? ' — margin reduced' : ' — no adjustment'}.`)
    }
    if (b.rushIrt) out.push(`Rush (${c.rushTier}): ${nfmt(b.rushIrt)} IRT.`)
    if (b.vatIrt) out.push(`VAT (${(b.vatPct * 100).toFixed(1)}%): ${nfmt(b.vatIrt)} IRT.`)
    for (const pm of c.perMethod) {
      const mb = b.byMethod[pm.method]
      if (pm.currency === 'USDT') {
        out.push(`USDT payment: ${nfmt((pm.totalMicroUsdt ?? 0) / 1e6)} USDT (≈ ${nfmt(pm.equivalentIrt ?? 0)} IRT at bid)${b.usdt?.cappedByIrtPrice ? ' — capped by IRT price' : ''}.`)
      } else {
        out.push(`${pm.method}: ${nfmt(pm.totalIrt ?? 0)} IRT (fee ${nfmt(pm.feeIrt)}${mb && mb.grossUp === 'cap' ? ', fee cap applied' : ''}, rounding ${nfmt(mb?.roundingIrt ?? 0)}).`)
      }
      if (!pm.available) out.push(`  ! ${pm.method} unavailable: ${pm.unavailableReasonFa}`)
    }
    if (c.uncompetitive) out.push('Warning: uncompetitive — hide “best price” badges.')
    for (const code of c.warningCodes) out.push(`Warning code: ${code}`)
  }
  return out
}
