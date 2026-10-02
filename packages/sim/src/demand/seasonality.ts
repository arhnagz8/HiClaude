/**
 * Calendar & seasonality: IRST diurnal profile, weekday, Jalali-month seasonality, Nowruz / shopping events, public holidays.
 * Built-ins are documented ASSUMPTIONS (data/competitors.json seasonality.index_prior is null / UNVERIFIED: "default to 1.0 and apply
 * as a scenario axis"). data/calendar_ir.json (research 08) is merged when present.
 */
import { irstIsoDate, irstParts, jalaliOf, type EpochMs } from '@hiclaude/contracts'
import { clamp, deepUnwrap, readRepoJson } from './common'
import type { DiurnalShape, Segment, SegmentsConfig } from './types'

export interface SeasonEvent {
  id: string
  /** Jalali [month 1-12, day] inclusive range (does not wrap the year; split wrapping events in two). */
  from: [number, number]
  to: [number, number]
  multiplier: number
  /** undefined = all segments */
  segments?: string[]
  note: string
}

export interface SeasonalityCalendar {
  /** "YYYY-MM-DD" IRST dates that are public holidays (Friday-like demand). */
  holidays: Set<string>
  /** Fixed Jalali (month, day) holidays that repeat every year. */
  solarHolidays: Array<[number, number]>
  events: SeasonEvent[]
  /** optional extra multipliers from calendar_ir.json (length 12 / 7) */
  monthIndex?: number[]
  dowIndex?: number[]
}

export const BUILTIN_EVENTS: SeasonEvent[] = [
  { id: 'nowruz_holidays', from: [1, 1], to: [1, 4], multiplier: 0.6, note: 'assumption: holiday lull (banks/Paya closed; supply-side constraint modelled in BankSim)' },
  { id: 'nowruz_travel', from: [1, 1], to: [1, 13], multiplier: 1.6, segments: ['traveller'], note: 'assumption: travellers buy around Nowruz' },
  { id: 'nowruz_week2', from: [1, 5], to: [1, 13], multiplier: 0.85, note: 'assumption' },
  { id: 'pre_nowruz_rush', from: [12, 10], to: [12, 29], multiplier: 1.2, note: 'assumption: pre-holiday payments and shopping' },
  { id: 'black_friday', from: [9, 1], to: [9, 9], multiplier: 1.35, segments: ['gamer', 'casual_subscriber', 'student', 'designer'], note: 'competitors.json seasonality: black-friday-2026 (6-9 Azar), direction up, magnitude UNVERIFIED' },
  { id: 'yalda_christmas', from: [9, 27], to: [10, 10], multiplier: 1.2, segments: ['gamer', 'casual_subscriber'], note: 'competitors.json: yalda / christmas gift-card campaigns, magnitude UNVERIFIED' },
  { id: 'steam_summer', from: [4, 4], to: [4, 15], multiplier: 1.2, segments: ['gamer'], note: 'competitors.json: steam seasonal sale, UNVERIFIED' },
  { id: 'steam_winter', from: [10, 1], to: [10, 15], multiplier: 1.15, segments: ['gamer'], note: 'competitors.json: steam seasonal sale, UNVERIFIED' },
  { id: 'application_deadlines', from: [10, 1], to: [11, 15], multiplier: 1.15, segments: ['exam_applicant'], note: 'competitors.json: overseas university application deadlines (Nov-Jan), UNVERIFIED' },
]

export const BUILTIN_SOLAR_HOLIDAYS: Array<[number, number]> = [
  [1, 1], [1, 2], [1, 3], [1, 4], [1, 12], [1, 13], [3, 14], [3, 15], [11, 22], [12, 29],
]

export function builtinCalendar(): SeasonalityCalendar {
  return { holidays: new Set(), solarHolidays: [...BUILTIN_SOLAR_HOLIDAYS], events: [...BUILTIN_EVENTS] }
}

const ISO = /^\d{4}-\d{2}-\d{2}$/

/**
 * Merge data/calendar_ir.json (tolerant). Understood: `holidays: [ "YYYY-MM-DD" | {date|gregorian: "YYYY-MM-DD"} ]`
 * (also under `public_holidays`/`bank_holidays`), `seasonality.month_index` / `monthly_index` (12 numbers),
 * `seasonality.dow_index` (7 numbers, JS weekday order). Anything else is ignored.
 */
export function mergeCalendarJson(base: SeasonalityCalendar, raw: unknown): SeasonalityCalendar {
  const j = deepUnwrap(raw) as Record<string, unknown> | undefined
  if (!j || typeof j !== 'object') return base
  const out: SeasonalityCalendar = { ...base, holidays: new Set(base.holidays) }
  for (const key of ['holidays', 'public_holidays', 'bank_holidays']) {
    const arr = j[key]
    if (!Array.isArray(arr)) continue
    for (const h of arr) {
      const d = typeof h === 'string' ? h : h && typeof h === 'object' ? ((h as Record<string, unknown>).date ?? (h as Record<string, unknown>).gregorian) : undefined
      if (typeof d === 'string' && ISO.test(d.slice(0, 10))) out.holidays.add(d.slice(0, 10))
    }
  }
  const seas = (j.seasonality ?? j.seasonality_index ?? {}) as Record<string, unknown>
  const mi = seas.month_index ?? seas.monthly_index ?? j.monthly_index
  if (Array.isArray(mi) && mi.length === 12 && mi.every((x) => typeof x === 'number' && x > 0)) out.monthIndex = mi as number[]
  const di = seas.dow_index
  if (Array.isArray(di) && di.length === 7 && di.every((x) => typeof x === 'number' && x > 0)) out.dowIndex = di as number[]
  return out
}

export function loadCalendar(opts: { raw?: unknown; useResearch?: boolean } = {}): SeasonalityCalendar {
  const base = builtinCalendar()
  const raw = opts.raw ?? (opts.useResearch === false ? undefined : readRepoJson('data/calendar_ir.json'))
  return raw ? mergeCalendarJson(base, raw) : base
}

export function isPublicHoliday(cal: SeasonalityCalendar, ms: EpochMs): boolean {
  if (cal.holidays.has(irstIsoDate(ms))) return true
  const j = jalaliOf(ms)
  return cal.solarHolidays.some(([m, d]) => m === j.jm && d === j.jd)
}

const inRange = (jm: number, jd: number, from: [number, number], to: [number, number]): boolean => {
  const v = jm * 100 + jd
  return v >= from[0] * 100 + from[1] && v <= to[0] * 100 + to[1]
}

/** Product of active season events for a segment (clamped to [0.2, 3]). */
export function eventMultiplier(cal: SeasonalityCalendar, ms: EpochMs, segmentId?: string): number {
  const j = jalaliOf(ms)
  let m = 1
  for (const e of cal.events) {
    if (e.segments && (!segmentId || !e.segments.includes(segmentId))) continue
    if (inRange(j.jm, j.jd, e.from, e.to)) m *= e.multiplier
  }
  return clamp(m, 0.2, 3)
}

/** Normalise an hourly weight table so its mean over the day is exactly 1. */
export function normaliseProfile(w: readonly number[]): number[] {
  const mean = w.reduce((a, b) => a + b, 0) / w.length
  return w.map((x) => x / mean)
}

/**
 * Diurnal multiplier at an IRST hour fraction (0..24), linear interpolation between hour mid-points of the
 * (normalised) hourly table, wrapping around midnight. Mean over a day ≈ 1.
 */
export function diurnalAt(profile: readonly number[], hourFraction: number): number {
  const x = (((hourFraction - 0.5) % 24) + 24) % 24
  const i = Math.floor(x)
  const f = x - i
  const a = profile[i] as number
  const b = profile[(i + 1) % 24] as number
  return a + (b - a) * f
}

export class SeasonalityModel {
  private readonly profiles: Record<DiurnalShape, number[]>
  constructor(readonly cfg: SegmentsConfig, readonly cal: SeasonalityCalendar = builtinCalendar()) {
    this.profiles = {
      default: normaliseProfile(cfg.diurnalProfiles.default),
      office: normaliseProfile(cfg.diurnalProfiles.office),
      night: normaliseProfile(cfg.diurnalProfiles.night),
    }
    // weekday weights normalised so that the average over Sat..Thu + Fri(=1) is 1 is not required; they are relative multipliers
  }

  diurnal(seg: Segment, ms: EpochMs): number {
    const p = irstParts(ms)
    return diurnalAt(this.profiles[seg.diurnal], p.hour + p.minute / 60)
  }

  /** weekday × weekend/holiday factor of a segment. Friday and public holidays use `weekendFactor`. */
  weekday(seg: Segment, ms: EpochMs): number {
    const wd = irstParts(ms).weekday
    const dow = this.cal.dowIndex ? (this.cal.dowIndex[wd] as number) : 1
    if (wd === 5 || isPublicHoliday(this.cal, ms)) return seg.weekendFactor * dow
    return (this.cfg.weekday[wd] as number) * dow
  }

  month(seg: Segment, ms: EpochMs): number {
    const j = jalaliOf(ms)
    const base = seg.monthSeasonality[j.jm - 1] as number
    return base * (this.cal.monthIndex ? (this.cal.monthIndex[j.jm - 1] as number) : 1)
  }

  event(seg: Segment, ms: EpochMs): number {
    return eventMultiplier(this.cal, ms, seg.id)
  }

  /** Total non-diurnal calendar multiplier (weekday × month × events). */
  calendar(seg: Segment, ms: EpochMs): number {
    return this.weekday(seg, ms) * this.month(seg, ms) * this.event(seg, ms)
  }

  /** Full seasonal multiplier at an instant. */
  multiplier(seg: Segment, ms: EpochMs): number {
    return this.calendar(seg, ms) * this.diurnal(seg, ms)
  }
}
