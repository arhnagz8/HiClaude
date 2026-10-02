/**
 * Jalali (Solar Hijri) calendar. [CONTRACT]
 * Port of the well-known jalaali algorithm (valid for Jalali years -61 … 3177).
 * Verified in calendar.test.ts: 2026-03-21 = 1405-01-01, 2026-10-02 = 1405-07-10, 2025-03-21 = 1404-01-01, 2024-03-20 = 1403-01-01.
 */
import type { EpochMs } from './units'
import { irstParts } from './time'

const BREAKS = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178]

const div = (a: number, b: number): number => Math.trunc(a / b)
const mod = (a: number, b: number): number => a - Math.trunc(a / b) * b

function jalCal(jy: number): { leap: number; gy: number; march: number } {
  const bl = BREAKS.length
  const gy = jy + 621
  let leapJ = -14
  let jp = BREAKS[0] as number
  let jm = 0
  let jump = 0
  if (jy < jp || jy >= (BREAKS[bl - 1] as number)) throw new RangeError(`Invalid Jalali year ${jy}`)
  for (let i = 1; i < bl; i += 1) {
    jm = BREAKS[i] as number
    jump = jm - jp
    if (jy < jm) break
    leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4)
    jp = jm
  }
  let n = jy - jp
  leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4)
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1
  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150
  const march = 20 + leapJ - leapG
  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33
  let leap = mod(mod(n + 1, 33) - 1, 4)
  if (leap === -1) leap = 4
  return { leap, gy, march }
}

function g2d(gy: number, gm: number, gd: number): number {
  let d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4) + div(153 * mod(gm + 9, 12) + 2, 5) + gd - 34840408
  d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752
  return d
}

function d2g(jdn: number): { gy: number; gm: number; gd: number } {
  let j = 4 * jdn + 139361631
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908
  const i = div(mod(j, 1461), 4) * 5 + 308
  const gd = div(mod(i, 153), 5) + 1
  const gm = mod(div(i, 153), 12) + 1
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6)
  return { gy, gm, gd }
}

function j2d(jy: number, jm: number, jd: number): number {
  const r = jalCal(jy)
  return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1
}

function d2j(jdn: number): { jy: number; jm: number; jd: number } {
  const gy = d2g(jdn).gy
  let jy = gy - 621
  const r = jalCal(jy)
  const jdn1f = g2d(gy, 3, r.march)
  let k = jdn - jdn1f
  if (k >= 0) {
    if (k <= 185) {
      return { jy, jm: 1 + div(k, 31), jd: mod(k, 31) + 1 }
    }
    k -= 186
  } else {
    jy -= 1
    k += 179
    if (r.leap === 1) k += 1
  }
  return { jy, jm: 7 + div(k, 30), jd: mod(k, 30) + 1 }
}

export interface JalaliDate {
  jy: number
  jm: number // 1-12
  jd: number
}

export const toJalali = (gy: number, gm: number, gd: number): JalaliDate => d2j(g2d(gy, gm, gd))
export const toGregorian = (jy: number, jm: number, jd: number): { gy: number; gm: number; gd: number } => d2g(j2d(jy, jm, jd))
export const isJalaliLeapYear = (jy: number): boolean => jalCal(jy).leap === 0
export const jalaliMonthLength = (jy: number, jm: number): number => (jm <= 6 ? 31 : jm <= 11 ? 30 : isJalaliLeapYear(jy) ? 30 : 29)

/** Jalali date of an instant in IRST. */
export function jalaliOf(ms: EpochMs): JalaliDate & { hour: number; minute: number; weekday: number } {
  const p = irstParts(ms)
  const j = toJalali(p.year, p.month, p.day)
  return { ...j, hour: p.hour, minute: p.minute, weekday: p.weekday }
}

export const JALALI_MONTHS_FA = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'] as const
/** Index = JS weekday (0 = Sunday). */
export const WEEKDAYS_FA = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه'] as const

/** "1405-07" style key for monthly reports. */
export function jalaliMonthKey(ms: EpochMs): string {
  const j = jalaliOf(ms)
  return `${j.jy}-${String(j.jm).padStart(2, '0')}`
}
