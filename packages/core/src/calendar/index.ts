/**
 * calendar — settlement/trading-hour helpers on top of the contracts calendar (IRST = UTC+03:30, weekend = Friday, Thursday = half day).
 *
 * Holiday lists are passed in as IRST ISO dates (`"2026-10-02"`), never hard-coded here (they are perishable data).
 * Paya cycle times are UNVERIFIED defaults (see `DEFAULT_PAYA_CYCLES`): confirm with the bank and pass the real ones.
 */
import { MS, fromIrst, inIrstWindow, irstIsoDate, irstParts, startOfIrstDay, type EpochMs, type RegulatoryParams } from '@hiclaude/contracts'

export interface CalendarOptions {
  /** IRST dates (YYYY-MM-DD) that are official holidays. */
  holidays?: readonly string[]
}

/** Paya (ACH) settlement cycles in IRST. UNVERIFIED — verify_how: ask the bank / read the Paya cycle schedule. */
export const DEFAULT_PAYA_CYCLES: readonly { hour: number; minute: number }[] = [
  { hour: 9, minute: 30 },
  { hour: 13, minute: 30 },
  { hour: 17, minute: 30 },
]

const isHoliday = (ms: EpochMs, o: CalendarOptions): boolean => (o.holidays ?? []).includes(irstIsoDate(ms))

/** True when the day of `ms` (IRST) is a bank business day: not Friday and not a listed holiday (Thursday is a half day, see `payaCycles`). */
export function isBankBusinessDay(ms: EpochMs, o: CalendarOptions = {}): boolean {
  return irstParts(ms).weekday !== 5 && !isHoliday(ms, o)
}

/** Start (00:00 IRST) of the first bank business day strictly AFTER the IRST day of `ms`. */
export function nextBankBusinessDay(ms: EpochMs, o: CalendarOptions = {}): EpochMs {
  let d = startOfIrstDay(ms) + MS.day
  for (let i = 0; i < 40; i++) {
    // startOfIrstDay is DST-free, so adding 24 h is exact
    if (isBankBusinessDay(d, o)) return d
    d += MS.day
  }
  throw new RangeError('nextBankBusinessDay(): no business day within 40 days (holiday list wrong?)')
}

/**
 * The next `count` Paya cycles at or after `ms`. Business days only; on Thursday only the first cycle runs (half day).
 * `cycles` default = `DEFAULT_PAYA_CYCLES` (UNVERIFIED).
 */
export function payaCycles(ms: EpochMs, count = 3, o: CalendarOptions & { cycles?: readonly { hour: number; minute: number }[] } = {}): EpochMs[] {
  const cycles = [...(o.cycles ?? DEFAULT_PAYA_CYCLES)].sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute))
  const out: EpochMs[] = []
  let day = startOfIrstDay(ms)
  for (let guard = 0; out.length < count && guard < 60; guard++, day += MS.day) {
    if (!isBankBusinessDay(day, o)) continue
    const todays = irstParts(day).weekday === 4 ? cycles.slice(0, 1) : cycles
    for (const c of todays) {
      const t = day + (c.hour * 60 + c.minute) * MS.minute
      if (t >= ms && out.length < count) out.push(t)
    }
  }
  return out
}

/** Hour (IRST) at which a postponed gateway settlement is booked on the next working day. */
export const SETTLEMENT_HOUR_IRST = 8

/**
 * When a gateway settlement paid at `paidAt` with delay `delayHours` actually lands: `paidAt + delay`, pushed to 08:00 IRST of the next
 * working day when it falls on Thursday afternoon (from 12:00), Friday or a listed holiday.
 */
export function gatewaySettlementAt(paidAt: EpochMs, delayHours: number, o: CalendarOptions = {}): EpochMs {
  let t = paidAt + Math.round(delayHours * MS.hour)
  for (let i = 0; i < 40; i++) {
    const p = irstParts(t)
    const blocked = p.weekday === 5 || isHoliday(t, o) || (p.weekday === 4 && p.hour >= 12)
    if (!blocked) return t
    t = startOfIrstDay(t) + MS.day + SETTLEMENT_HOUR_IRST * MS.hour
  }
  throw new RangeError('gatewaySettlementAt(): no settlement day within 40 days')
}

/** True when exchanges are open for trading at `ms` (outside the regulatory night halt window). */
export function isTradingOpen(ms: EpochMs, regulatory: Pick<RegulatoryParams, 'nightHalt'>): boolean {
  const h = regulatory.nightHalt
  if (!h.enabled) return true
  return !inIrstWindow(ms, h.fromHour, h.toHour)
}

/** The instant trading (re)opens: `ms` itself when open, else the next `toHour:00` IRST. */
export function nextTradingOpen(ms: EpochMs, regulatory: Pick<RegulatoryParams, 'nightHalt'>): EpochMs {
  if (isTradingOpen(ms, regulatory)) return ms
  const to = regulatory.nightHalt.toHour
  const p = irstParts(ms)
  let t = fromIrst(p.year, p.month, p.day, Math.floor(to), Math.round((to % 1) * 60))
  if (t <= ms) t += MS.day
  return t
}
