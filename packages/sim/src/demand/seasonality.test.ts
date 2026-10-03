import { describe, expect, it } from 'vitest'
import { fromIrst, toGregorian, irstParts } from '@hiclaude/contracts'
import { SeasonalityModel, builtinCalendar, diurnalAt, eventMultiplier, isPublicHoliday, loadCalendar, mergeCalendarJson, normaliseProfile } from './seasonality'
import { loadSegmentsConfig } from './segments'

const cfg = loadSegmentsConfig({ useResearch: false })
const seg = (id: string) => cfg.segments.find((s) => s.id === id)!
const jal = (jy: number, jm: number, jd: number, h = 12) => {
  const g = toGregorian(jy, jm, jd)
  return fromIrst(g.gy, g.gm, g.gd, h)
}

describe('diurnal profile', () => {
  it('each shape is normalised to mean 1 over the day', () => {
    for (const k of ['default', 'office', 'night'] as const) {
      const p = normaliseProfile(cfg.diurnalProfiles[k])
      expect(p.reduce((a, b) => a + b, 0) / 24).toBeCloseTo(1, 9)
    }
  })
  it('default shape peaks 20-23 IRST and troughs 03-07', () => {
    const p = normaliseProfile(cfg.diurnalProfiles.default)
    const peak = p.indexOf(Math.max(...p))
    const trough = p.indexOf(Math.min(...p))
    expect(peak).toBeGreaterThanOrEqual(20)
    expect(peak).toBeLessThanOrEqual(23)
    expect(trough).toBeGreaterThanOrEqual(3)
    expect(trough).toBeLessThanOrEqual(7)
  })
  it('interpolation is continuous and wraps midnight', () => {
    const p = normaliseProfile(cfg.diurnalProfiles.default)
    expect(Math.abs(diurnalAt(p, 23.99) - diurnalAt(p, 0.01))).toBeLessThan(0.1)
    expect(diurnalAt(p, 0.5)).toBeCloseTo(p[0] as number, 9)
  })
  it('mean of fine-grained sampling is ~1', () => {
    const p = normaliseProfile(cfg.diurnalProfiles.night)
    let s = 0
    for (let i = 0; i < 96; i++) s += diurnalAt(p, (i + 0.5) / 4)
    expect(s / 96).toBeCloseTo(1, 1)
  })
})

describe('calendar', () => {
  const model = new SeasonalityModel(cfg, builtinCalendar())
  it('Friday uses the segment weekend factor', () => {
    const fri = fromIrst(2026, 10, 2, 12) // Friday 10 Mehr
    expect(irstParts(fri).weekday).toBe(5)
    expect(model.weekday(seg('ads_manager'), fri)).toBeCloseTo(seg('ads_manager').weekendFactor, 9)
    expect(model.weekday(seg('gamer'), fri)).toBeCloseTo(seg('gamer').weekendFactor, 9)
  })
  it('built-in solar holidays are detected (Nowruz, 22 Bahman)', () => {
    const cal = builtinCalendar()
    expect(isPublicHoliday(cal, jal(1406, 1, 2))).toBe(true)
    expect(isPublicHoliday(cal, jal(1405, 11, 22))).toBe(true)
    expect(isPublicHoliday(cal, jal(1405, 7, 11))).toBe(false)
  })
  it('Nowruz lull for general segments but a travel boost', () => {
    const t = jal(1406, 1, 2)
    expect(eventMultiplier(builtinCalendar(), t, 'student')).toBeLessThan(0.7)
    expect(eventMultiplier(builtinCalendar(), t, 'traveller') / eventMultiplier(builtinCalendar(), t, 'student')).toBeCloseTo(1.6, 6)
  })
  it('pre-Nowruz Esfand rush raises demand', () => {
    expect(eventMultiplier(builtinCalendar(), jal(1405, 12, 20), 'student')).toBeGreaterThan(1.1)
  })
  it('black friday boosts gamers only', () => {
    const t = jal(1405, 9, 6)
    expect(eventMultiplier(builtinCalendar(), t, 'gamer')).toBeGreaterThan(1.3)
    expect(eventMultiplier(builtinCalendar(), t, 'importer_trader')).toBe(1)
  })
  it('exam segments have an Aban-Esfand season', () => {
    const exam = seg('exam_applicant')
    expect(model.month(exam, jal(1405, 8, 10))).toBeGreaterThan(model.month(exam, jal(1405, 4, 10)))
  })
  it('mergeCalendarJson tolerates Record wrappers and unknown shapes', () => {
    const cal = mergeCalendarJson(builtinCalendar(), {
      holidays: [{ date: '2026-10-20', name: 'x' }, '2026-11-01', { gregorian: { value: 1 } }],
      seasonality: { month_index: { value: [1, 1, 1, 1, 1, 1, 1.5, 1, 1, 1, 1, 1], unit: 'x', as_of: '2026-10-02' } },
    })
    expect(cal.holidays.has('2026-10-20')).toBe(true)
    expect(cal.holidays.has('2026-11-01')).toBe(true)
    expect(cal.monthIndex?.[6]).toBe(1.5)
    expect(mergeCalendarJson(builtinCalendar(), 'junk').holidays.size).toBe(0)
  })
  it('explicit holidays use the weekend factor', () => {
    const cal = mergeCalendarJson(builtinCalendar(), { holidays: ['2026-10-20'] })
    const m = new SeasonalityModel(cfg, cal)
    const t = fromIrst(2026, 10, 20, 12)
    expect(irstParts(t).weekday).not.toBe(5)
    expect(m.weekday(seg('ads_manager'), t)).toBeCloseTo(seg('ads_manager').weekendFactor, 9)
  })
  it('loadCalendar without research file falls back to built-ins', () => {
    expect(loadCalendar({ useResearch: false }).events.length).toBeGreaterThan(5)
  })
})
