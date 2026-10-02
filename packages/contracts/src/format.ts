/**
 * Persian formatting helpers (shared by web UI, notifications and sim reports). [CONTRACT]
 * Toman: «۱٬۲۳۴٬۰۰۰ تومان». Decimal separator «٫». Thousands separator «٬».
 */
import type { EpochMs } from './units'
import { jalaliOf, JALALI_MONTHS_FA, WEEKDAYS_FA } from './calendar'

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹'
const THOUSANDS = '٬'
const DECIMAL = '٫'

export function toPersianDigits(input: string | number): string {
  return String(input).replace(/\d/g, (d) => FA_DIGITS[Number(d)] as string)
}

export function toLatinDigits(input: string): string {
  return input
    .replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
}

function groupThousands(intPart: string, sep: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, sep)
}

/** 1234567 → "۱٬۲۳۴٬۵۶۷" */
export function formatNumberFa(n: number, fractionDigits = 0): string {
  const neg = n < 0
  const abs = Math.abs(n)
  const fixed = abs.toFixed(fractionDigits)
  const [i = '0', f] = fixed.split('.')
  const body = groupThousands(i, ',') + (f ? `.${f}` : '')
  const fa = toPersianDigits(body).replace(/,/g, THOUSANDS).replace(/\./g, DECIMAL)
  return neg ? `−${fa}` : fa
}

/** Toman amount: "۱٬۲۳۴٬۰۰۰ تومان" (unit optional). */
export function formatIrt(amount: number, opts: { unit?: boolean } = {}): string {
  const s = formatNumberFa(Math.round(amount))
  return opts.unit === false ? s : `${s} تومان`
}

/** Compact Toman for dashboards: 12.5 میلیون / 3.2 میلیارد. */
export function formatIrtCompact(amount: number): string {
  const a = Math.abs(amount)
  const sign = amount < 0 ? '−' : ''
  if (a >= 1e12) return `${sign}${formatNumberFa(a / 1e12, 2)} همت`
  if (a >= 1e9) return `${sign}${formatNumberFa(a / 1e9, 2)} میلیارد`
  if (a >= 1e6) return `${sign}${formatNumberFa(a / 1e6, 2)} میلیون`
  if (a >= 1e3) return `${sign}${formatNumberFa(a / 1e3, 1)} هزار`
  return `${sign}${formatNumberFa(a)}`
}

export function formatUsd(cents: number): string {
  return `${formatNumberFa(cents / 100, 2)} دلار`
}

export function formatUsdt(micro: number, fractionDigits = 2): string {
  return `${formatNumberFa(micro / 1_000_000, fractionDigits)} تتر`
}

export function formatPct(fraction: number, fractionDigits = 1): string {
  return `${formatNumberFa(fraction * 100, fractionDigits)}٪`
}

/** "۱۰ مهر ۱۴۰۵" */
export function formatJalaliDate(ms: EpochMs): string {
  const j = jalaliOf(ms)
  return `${toPersianDigits(j.jd)} ${JALALI_MONTHS_FA[j.jm - 1]} ${toPersianDigits(j.jy)}`
}

/** "جمعه ۱۰ مهر ۱۴۰۵" */
export function formatJalaliDateLong(ms: EpochMs): string {
  const j = jalaliOf(ms)
  return `${WEEKDAYS_FA[j.weekday]} ${formatJalaliDate(ms)}`
}

/** "۱۰ مهر ۱۴۰۵ — ۱۴:۰۵" */
export function formatJalaliDateTime(ms: EpochMs): string {
  const j = jalaliOf(ms)
  const hh = String(j.hour).padStart(2, '0')
  const mm = String(j.minute).padStart(2, '0')
  return `${formatJalaliDate(ms)} — ${toPersianDigits(`${hh}:${mm}`)}`
}

/** Remaining time as «۱۴ دقیقه» / «۲ ساعت و ۱۰ دقیقه» */
export function formatDurationFa(ms: number): string {
  const totalMin = Math.max(0, Math.round(ms / 60_000))
  if (totalMin < 1) return 'کمتر از یک دقیقه'
  const d = Math.floor(totalMin / 1440)
  const h = Math.floor((totalMin % 1440) / 60)
  const m = totalMin % 60
  const parts: string[] = []
  if (d) parts.push(`${toPersianDigits(d)} روز`)
  if (h) parts.push(`${toPersianDigits(h)} ساعت`)
  if (m && !d) parts.push(`${toPersianDigits(m)} دقیقه`)
  return parts.join(' و ')
}

/** Normalises Iranian mobile numbers to "09xxxxxxxxx"; returns null if invalid. */
export function normalizeIranMobile(input: string): string | null {
  const s = toLatinDigits(input).replace(/[\s\-()]/g, '')
  const m = /^(?:\+98|0098|98|0)?(9\d{9})$/.exec(s)
  return m ? `0${m[1]}` : null
}

/** Iranian national id (کد ملی) checksum validation. */
export function isValidNationalId(input: string): boolean {
  const s = toLatinDigits(input)
  if (!/^\d{10}$/.test(s)) return false
  if (/^(\d)\1{9}$/.test(s)) return false
  let sum = 0
  for (let i = 0; i < 9; i++) sum += Number(s[i]) * (10 - i)
  const r = sum % 11
  const check = Number(s[9])
  return r < 2 ? check === r : check === 11 - r
}
