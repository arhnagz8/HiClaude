/**
 * Time. [CONTRACT]
 * Business logic must NEVER call Date.now()/new Date() without an argument; use a Clock.
 * Iran Standard Time (IRST) = UTC+03:30, no DST since 2022.
 */
import type { EpochMs } from './units'

export interface Clock {
  now(): EpochMs
}

/** Wall clock — only for live mode entrypoints. */
export class SystemClock implements Clock {
  now(): EpochMs {
    return Date.now()
  }
}

/** Manually advanced clock (tests, simulator). Never goes backwards. */
export class ManualClock implements Clock {
  protected t: EpochMs
  constructor(start: EpochMs = 0) {
    this.t = start
  }
  now(): EpochMs {
    return this.t
  }
  set(t: EpochMs): void {
    if (t < this.t) throw new RangeError(`ManualClock cannot go backwards (${this.t} -> ${t})`)
    this.t = t
  }
  advance(ms: number): void {
    this.set(this.t + ms)
  }
}

export const MS = {
  second: 1_000,
  minute: 60_000,
  hour: 3_600_000,
  day: 86_400_000,
  week: 604_800_000,
} as const

export const IRST_OFFSET_MS = 3.5 * MS.hour

export interface IrstParts {
  year: number
  month: number // 1-12 (Gregorian)
  day: number
  hour: number
  minute: number
  second: number
  /** 0 = Sunday … 6 = Saturday */
  weekday: number
}

/** Gregorian calendar fields of an instant, expressed in IRST. */
export function irstParts(ms: EpochMs): IrstParts {
  const d = new Date(ms + IRST_OFFSET_MS)
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    second: d.getUTCSeconds(),
    weekday: d.getUTCDay(),
  }
}

/** Epoch ms of an IRST wall-clock time (Gregorian fields). */
export function fromIrst(year: number, month: number, day: number, hour = 0, minute = 0, second = 0): EpochMs {
  return Date.UTC(year, month - 1, day, hour, minute, second) - IRST_OFFSET_MS
}

export function startOfIrstDay(ms: EpochMs): EpochMs {
  const p = irstParts(ms)
  return fromIrst(p.year, p.month, p.day)
}

/** Iranian official weekend is Friday. */
export function isIranWeekend(ms: EpochMs): boolean {
  return irstParts(ms).weekday === 5
}

/** Thursday is a half working day for banks; Paya/Satna usually do not settle on Thursday afternoon. */
export function isIranBankHalfDay(ms: EpochMs): boolean {
  return irstParts(ms).weekday === 4
}

/** Hour of day (0-23.99) in IRST as a fraction. */
export function irstHourFraction(ms: EpochMs): number {
  const p = irstParts(ms)
  return p.hour + p.minute / 60 + p.second / 3600
}

/** True when `ms` falls in [fromHour, toHour) IRST; handles windows that wrap midnight (e.g. 21 → 9). */
export function inIrstWindow(ms: EpochMs, fromHour: number, toHour: number): boolean {
  const h = irstHourFraction(ms)
  return fromHour <= toHour ? h >= fromHour && h < toHour : h >= fromHour || h < toHour
}

/** Whole IRST days between two instants (by IRST calendar day boundaries). */
export function irstDaysBetween(a: EpochMs, b: EpochMs): number {
  return Math.round((startOfIrstDay(b) - startOfIrstDay(a)) / MS.day)
}

/** "YYYY-MM-DD" of an instant in IRST (Gregorian). */
export function irstIsoDate(ms: EpochMs): string {
  const p = irstParts(ms)
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
}

/** Parse "YYYY-MM-DD" (IRST midnight) → epoch ms. */
export function parseIrstDate(iso: string): EpochMs {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) throw new RangeError(`Invalid ISO date: ${iso}`)
  return fromIrst(Number(m[1]), Number(m[2]), Number(m[3]))
}
