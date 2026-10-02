/**
 * Formatting helpers. Core formatters come from @hiclaude/contracts (single source for web + notifications + reports);
 * this module re-exports them and adds web-only view helpers (countdown clock, relative time, card masks).
 */
import {
  formatDurationFa,
  formatIrt,
  formatIrtCompact,
  formatJalaliDate,
  formatJalaliDateTime,
  formatNumberFa,
  formatPct,
  formatUsd,
  formatUsdt,
  isValidNationalId,
  normalizeIranMobile,
  toLatinDigits,
  toPersianDigits,
} from '@hiclaude/contracts'
import { t } from '../copy'

export {
  formatDurationFa,
  formatIrt,
  formatIrtCompact,
  formatJalaliDate,
  formatJalaliDateTime,
  formatNumberFa,
  formatPct,
  formatUsd,
  formatUsdt,
  isValidNationalId,
  normalizeIranMobile,
  toLatinDigits,
  toPersianDigits,
}

/** "۱۲۰ دلار" without trailing decimals when whole: 12000 cents → «۱۲۰ دلار»; 1250 → «۱۲٫۵۰ دلار». */
export function formatUsdCents(cents: number): string {
  const whole = cents % 100 === 0
  return `${formatNumberFa(cents / 100, whole ? 0 : 2)} دلار`
}
/** Compact «$۱۲۰» style used on chips. */
export function formatUsdShort(cents: number): string {
  const whole = cents % 100 === 0
  return `${formatNumberFa(cents / 100, whole ? 0 : 2)}$`
}

/** USDT micro → «۱۲٫۳۴ تتر» using the amount's own precision (trailing zeros trimmed to ≥2 decimals). */
export function formatUsdtExact(micro: number): string {
  const v = micro / 1_000_000
  const s = v.toFixed(6).replace(/0+$/, '')
  const [i = '0', f = ''] = s.split('.')
  const frac = f.padEnd(2, '0')
  return `${toPersianDigits(i.replace(/\B(?=(\d{3})+(?!\d))/g, ','))
    .replace(/,/g, '٬')}٫${toPersianDigits(frac)} تتر`
}
/** Plain latin decimal string for copying into a wallet app: 12.34 */
export function usdtPlain(micro: number): string {
  const s = (micro / 1_000_000).toFixed(6).replace(/0+$/, '')
  const [i = '0', f = ''] = s.split('.')
  return `${i}.${f.padEnd(2, '0')}`
}

/** mm:ss or h:mm:ss in Persian digits, for countdown chips. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number): string => String(n).padStart(2, '0')
  return toPersianDigits(h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`)
}

/** «۵ دقیقه پیش». */
export function relativeTimeFa(at: number, now: number): string {
  const diff = Math.max(0, now - at)
  const s = Math.floor(diff / 1000)
  if (s < 10) return t('common.justNow')
  if (s < 60) return t('common.secondsAgo', { n: toPersianDigits(s) })
  const m = Math.floor(s / 60)
  if (m < 60) return t('common.minutesAgo', { n: toPersianDigits(m) })
  const h = Math.floor(m / 60)
  if (h < 24) return t('common.hoursAgo', { n: toPersianDigits(h) })
  return t('common.daysAgo', { n: toPersianDigits(Math.floor(h / 24)) })
}

/** Card number groups of four, always LTR: 6037 9900 0000 0001 */
export function groupCard(pan: string): string {
  return pan.replace(/\D/g, '').replace(/(\d{4})(?=\d)/g, '$1 ')
}
export function maskPan(last4?: string): string {
  return `•••• •••• •••• ${last4 ?? '••••'}`
}
export function formatExpiry(month: number, year: number): string {
  return `${String(month).padStart(2, '0')}/${String(year % 100).padStart(2, '0')}`
}

/** Parse a user-typed number (Persian/Arabic/Latin digits, separators) to a plain number; NaN when invalid. */
export function parseNumberInput(raw: string): number {
  const s = toLatinDigits(raw).replace(/[,٬\s]/g, '').replace(/٫/g, '.')
  if (s === '' || !/^\d*\.?\d*$/.test(s)) return NaN
  return Number(s)
}

/** Percent move «+۰٫۸٪» / «−۱٫۲٪» with explicit sign. */
export function formatSignedPct(pct: number, digits = 1): string {
  const body = formatNumberFa(Math.abs(pct), digits)
  if (Math.abs(pct) < 0.05) return `${body}٪`
  return `${pct > 0 ? '+' : '−'}${body}٪`
}
