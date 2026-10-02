/**
 * Iranian banking calendar used by BankSim / GatewaySim / ExchangeSim.
 * Weekend = Friday. Thursday = half working day (no Paya settlement in the afternoon). Public holidays: built-in SOLAR-calendar holidays only
 * (Nowruz 1-4 & 12-13 Farvardin, 14-15 Khordad, 22 Bahman, 29 Esfand); lunar (religious) holidays move every year and are NOT built in -
 * supply them via `extraHolidays` (ISO "YYYY-MM-DD" in IRST) or `loadHolidayFile()` (data/calendar_ir.json when research 08 lands).
 * UNVERIFIED: the exact Paya cycle times below are placeholders (verify with the bank's published schedule).
 */
import { existsSync, readFileSync } from 'node:fs'
import { MS, irstHourFraction, irstIsoDate, irstParts, jalaliOf, startOfIrstDay, type EpochMs } from '@hiclaude/contracts'
import { unwrapRecords } from './records'

export interface PayaSchedule {
  /** IRST hours at which a Paya settlement cycle runs on a business day. */
  settleHours: number[]
  /** A request must be at least this old when the cycle runs. */
  minProcessingMs: number
  /** On Thursday only cycles strictly before this IRST hour run. */
  thursdayLastHour: number
}

export const DEFAULT_PAYA_SCHEDULE: PayaSchedule = {
  settleHours: [10, 14, 18], // placeholder, UNVERIFIED
  minProcessingMs: 30 * MS.minute,
  thursdayLastHour: 13,
}

export interface SatnaSchedule {
  openHour: number
  closeHour: number
  thursdayCloseHour: number
  processingMs: number
}
export const DEFAULT_SATNA_SCHEDULE: SatnaSchedule = { openHour: 8, closeHour: 16.5, thursdayCloseHour: 12, processingMs: 15 * MS.minute }

const SOLAR_HOLIDAYS: ReadonlyArray<[number, number]> = [
  [1, 1],
  [1, 2],
  [1, 3],
  [1, 4],
  [1, 12],
  [1, 13],
  [3, 14],
  [3, 15],
  [11, 22],
  [12, 29],
]

export class BankCalendar {
  private readonly extra: Set<string>

  constructor(
    extraHolidays: Iterable<string> = [],
    readonly paya: PayaSchedule = DEFAULT_PAYA_SCHEDULE,
    readonly satna: SatnaSchedule = DEFAULT_SATNA_SCHEDULE,
  ) {
    this.extra = new Set(extraHolidays)
  }

  addHoliday(iso: string): void {
    this.extra.add(iso)
  }

  isHoliday(ms: EpochMs): boolean {
    if (this.extra.has(irstIsoDate(ms))) return true
    const j = jalaliOf(ms)
    return SOLAR_HOLIDAYS.some(([m, d]) => m === j.jm && d === j.jd)
  }

  /** Bank business day: not Friday, not a holiday (Thursday counts, as a half day). */
  isBusinessDay(ms: EpochMs): boolean {
    return irstParts(ms).weekday !== 5 && !this.isHoliday(ms)
  }

  /** Start of the next IRST day (>= ms + 1 day boundary) that is a business day, searching strictly after `ms`'s own day when `strictlyAfter`. */
  nextBusinessDayStart(ms: EpochMs, strictlyAfter = false): EpochMs {
    let day = startOfIrstDay(ms)
    if (strictlyAfter) day += MS.day
    // fromIrst arithmetic is DST-free in Iran, so +24h steps are exact
    for (let i = 0; i < 20 && !this.isBusinessDay(day); i++) day += MS.day
    return day
  }

  /** Earliest moment >= ms that is a business-day wall-clock `hour` (IRST). */
  nextBusinessMoment(ms: EpochMs, hour: number): EpochMs {
    let day = startOfIrstDay(ms)
    for (let i = 0; i < 30; i++) {
      if (this.isBusinessDay(day)) {
        const t = day + hour * MS.hour
        if (t >= ms) return t
      }
      day += MS.day
    }
    return ms
  }

  /** Settlement time of a Paya transfer requested at `requestMs`. */
  nextPayaSettlement(requestMs: EpochMs): EpochMs {
    const earliest = requestMs + this.paya.minProcessingMs
    let day = startOfIrstDay(requestMs)
    for (let i = 0; i < 30; i++) {
      if (this.isBusinessDay(day)) {
        const isThu = irstParts(day).weekday === 4
        for (const h of this.paya.settleHours) {
          if (isThu && h >= this.paya.thursdayLastHour) continue
          const t = day + h * MS.hour
          if (t >= earliest) return t
        }
      }
      day += MS.day
    }
    return earliest
  }

  /** Settlement time of a Satna (RTGS) transfer: minutes inside the open window, otherwise at the next opening. */
  nextSatnaSettlement(requestMs: EpochMs): EpochMs {
    const s = this.satna
    let day = startOfIrstDay(requestMs)
    for (let i = 0; i < 30; i++) {
      if (this.isBusinessDay(day)) {
        const isThu = irstParts(day).weekday === 4
        const open = day + s.openHour * MS.hour
        const close = day + (isThu ? s.thursdayCloseHour : s.closeHour) * MS.hour
        const start = Math.max(requestMs, open)
        if (start + s.processingMs <= close) return start + s.processingMs
      }
      day += MS.day
    }
    return requestMs + s.processingMs
  }

  /** True when a Paya/Satna cycle could run at this instant's calendar day (business day). */
  paymentRailsOpen(ms: EpochMs): boolean {
    if (!this.isBusinessDay(ms)) return false
    if (irstParts(ms).weekday === 4) return irstHourFraction(ms) < this.paya.thursdayLastHour
    return true
  }
}

/** Reads data/calendar_ir.json (tolerant of Record wrappers). Returns ISO dates; unknown shapes yield []. */
export function loadHolidayFile(path: string): string[] {
  if (!existsSync(path)) return []
  let raw: unknown
  try {
    raw = unwrapRecords(JSON.parse(readFileSync(path, 'utf8')))
  } catch {
    return []
  }
  const out = new Set<string>()
  const visit = (v: unknown, keyHint: string): void => {
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && /holiday|bank|non_?settle|closed/i.test(keyHint)) out.add(v)
    else if (Array.isArray(v)) for (const x of v) visit(x, keyHint)
    else if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>
      const dateVal = o.date ?? o.gregorian ?? o.iso
      if (typeof dateVal === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateVal) && (o.is_holiday === true || o.holiday === true || /holiday|bank/i.test(keyHint))) out.add(dateVal)
      for (const [k, x] of Object.entries(o)) visit(x, `${keyHint}.${k}`)
    }
  }
  visit(raw, '')
  return [...out].sort()
}

