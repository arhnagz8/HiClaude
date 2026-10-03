/** Bilingual labels + number formatting for reports. Persian first, English fallback shown muted. */
import { formatNumberFa, toPersianDigits, JALALI_MONTHS_FA, jalaliOf, parseIrstDate, formatPct as faPct } from '@hiclaude/contracts'
import type { ReportLang } from './types'

export interface Bi {
  fa: string
  en: string
}
const b = (fa: string, en: string): Bi => ({ fa, en })

export const L = {
  title: b('گزارش شبیه‌سازی', 'Simulation report'),
  scenario: b('سناریو', 'Scenario'),
  seed: b('بذر', 'Seed'),
  period: b('بازه', 'Period'),
  headline: b('شاخص‌های کلیدی', 'Headline'),
  revenue: b('درآمد', 'Revenue'),
  grossProfit: b('سود ناخالص', 'Gross profit'),
  netProfit: b('سود خالص', 'Net profit'),
  cash: b('موجودی نقد', 'Cash'),
  runway: b('کفاف نقدی', 'Runway'),
  breakEven: b('نقطه سربه‌سر', 'Break-even'),
  roi: b('بازده سرمایه', 'ROI on capital'),
  sla: b('رعایت SLA', 'SLA attainment'),
  orders: b('سفارش‌ها', 'Orders'),
  gmv: b('حجم فروش (GMV)', 'GMV'),
  aov: b('میانگین سفارش', 'AOV'),
  grossMargin: b('حاشیه سود ناخالص', 'Gross margin'),
  netMargin: b('حاشیه سود خالص', 'Net margin'),
  takeRate: b('نرخ برداشت', 'Take rate'),
  maxDrawdown: b('بیشینه افت', 'Max drawdown'),
  refundRate: b('نرخ بازپرداخت', 'Refund rate'),
  fraudRate: b('نرخ زیان تقلب', 'Fraud loss rate'),
  never: b('در بازه حاصل نشد', 'not reached'),
  notBurning: b('بدون مصرف نقدی', 'not burning'),
  incomeStatement: b('صورت سود و زیان ماهانه', 'Monthly income statement'),
  balanceSheet: b('ترازنامه', 'Balance sheet'),
  cashFlow: b('صورت جریان نقد', 'Cash flow'),
  annual: b('خلاصه سالانه', 'Annual summary'),
  views: b('نمای اسمی / واقعی / دلاری', 'Nominal / real / USD views'),
  nominal: b('اسمی (تومان)', 'Nominal (IRT)'),
  real: b('واقعی (تومان ثابت شروع)', 'Real (start-date IRT)'),
  usd: b('دلاری', 'USD'),
  charts: b('نمودارها', 'Charts'),
  identity: b('کنترل‌های هویت حسابداری', 'Accounting identity checks'),
  assumptions: b('فرضیات و منابع پارامترها', 'Assumptions & parameter sources'),
  decisions: b('تصمیمات مالک', 'Owner decisions'),
  sensitivity: b('تحلیل حساسیت', 'Sensitivity'),
  disclaimer: b('این گزارش خروجی یک مدل شبیه‌سازی است، نه پیش‌بینی؛ فرضیات بالا را ببینید. مشاوره حقوقی یا مالیاتی نیست.', 'This report is the output of a model, not a forecast; see the assumptions. Not legal or tax advice.'),
  dataTable: b('جدول داده', 'Data table'),
  month: b('ماه', 'Month'),
  totalRevenue: b('درآمد', 'Revenue'),
  cogs: b('بهای تمام‌شده', 'COGS'),
  opex: b('هزینه عملیاتی', 'Opex'),
  operatingProfit: b('سود عملیاتی', 'Operating profit'),
  fx: b('تسعیر ارز', 'FX reval.'),
  tax: b('مالیات', 'Tax'),
  closingCash: b('نقد پایان دوره', 'Closing cash'),
  operating: b('عملیاتی', 'Operating'),
  financing: b('تأمین مالی', 'Financing'),
  netChange: b('تغییر خالص', 'Net change'),
  assets: b('دارایی‌ها', 'Assets'),
  liabilities: b('بدهی‌ها', 'Liabilities'),
  equity: b('حقوق صاحبان سهام', 'Equity'),
  ok: b('سالم', 'OK'),
  fail: b('ناسالم', 'FAIL'),
  noData: b('داده‌ای موجود نیست', 'no data'),
}

export const bi = (x: Bi, lang: ReportLang = 'fa'): string => (lang === 'fa' ? x.fa : x.en)

/** Plain-text number formatting honouring the language (Persian digits + Persian separators for fa). */
export function num(n: number, lang: ReportLang = 'fa', digits = 0): string {
  if (!Number.isFinite(n)) return '—'
  if (lang === 'fa') return formatNumberFa(n, digits)
  const neg = n < 0
  const s = Math.abs(n).toFixed(digits).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return neg ? `−${s}` : s
}
export function pct(f: number, lang: ReportLang = 'fa', digits = 1): string {
  if (!Number.isFinite(f)) return '—'
  return lang === 'fa' ? faPct(f, digits) : `${(f * 100).toFixed(digits)}%`
}
export const digitsFa = (x: string | number, lang: ReportLang = 'fa'): string => (lang === 'fa' ? toPersianDigits(x) : String(x))

export interface Unit {
  div: number
  fa: string
  en: string
}
/** Pick a display unit for Toman amounts so axis labels stay short. */
export function irtUnit(maxAbs: number): Unit {
  if (maxAbs >= 1e10) return { div: 1e9, fa: 'میلیارد تومان', en: 'B IRT' }
  if (maxAbs >= 1e7) return { div: 1e6, fa: 'میلیون تومان', en: 'M IRT' }
  if (maxAbs >= 1e4) return { div: 1e3, fa: 'هزار تومان', en: 'K IRT' }
  return { div: 1, fa: 'تومان', en: 'IRT' }
}

/** Amount with unit in text: 12.3 میلیارد تومان */
export function irtText(n: number, lang: ReportLang = 'fa', digits = 1): string {
  if (!Number.isFinite(n)) return '—'
  const u = irtUnit(Math.abs(n))
  return `${num(n / u.div, lang, u.div === 1 ? 0 : digits)} ${lang === 'fa' ? u.fa : u.en}`
}

export function jalaliMonthLabel(isoDate: string, lang: ReportLang = 'fa'): string {
  const j = jalaliOf(parseIrstDate(isoDate))
  if (lang === 'fa') return `${JALALI_MONTHS_FA[j.jm - 1]} ${toPersianDigits(j.jy)}`
  return `${j.jy}-${String(j.jm).padStart(2, '0')}`
}
export function jalaliDayLabel(isoDate: string, lang: ReportLang = 'fa'): string {
  const j = jalaliOf(parseIrstDate(isoDate))
  return lang === 'fa' ? `${toPersianDigits(j.jd)} ${JALALI_MONTHS_FA[j.jm - 1]} ${toPersianDigits(j.jy)}` : `${j.jy}-${String(j.jm).padStart(2, '0')}-${String(j.jd).padStart(2, '0')}`
}
export const jalaliMonthKeyOfIso = (isoDate: string): string => {
  const j = jalaliOf(parseIrstDate(isoDate))
  return `${j.jy}-${String(j.jm).padStart(2, '0')}`
}
export const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)
