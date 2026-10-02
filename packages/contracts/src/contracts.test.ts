import { describe, expect, it } from 'vitest'
import {
  AppError,
  ManualClock,
  PlatformParamsSchema,
  createEventBus,
  createIdGen,
  createRng,
  defaultPlatformParams,
  defaultProducts,
  deepMerge,
  formatIrt,
  formatJalaliDate,
  formatNumberFa,
  fromIrst,
  inIrstWindow,
  irstIsoDate,
  irstParts,
  isIranWeekend,
  isJalaliLeapYear,
  isValidNationalId,
  jalaliMonthLength,
  jalaliOf,
  normalizeIranMobile,
  parseIrstDate,
  toGregorian,
  toJalali,
  toPersianDigits,
  usdtToMicro,
} from './index'

describe('calendar', () => {
  it('converts known Nowruz dates', () => {
    expect(toJalali(2026, 3, 21)).toEqual({ jy: 1405, jm: 1, jd: 1 })
    expect(toJalali(2025, 3, 21)).toEqual({ jy: 1404, jm: 1, jd: 1 })
    expect(toJalali(2024, 3, 20)).toEqual({ jy: 1403, jm: 1, jd: 1 })
  })
  it('2026-10-02 is 10 Mehr 1405 and a Friday', () => {
    expect(toJalali(2026, 10, 2)).toEqual({ jy: 1405, jm: 7, jd: 10 })
    const t = fromIrst(2026, 10, 2, 12)
    expect(isIranWeekend(t)).toBe(true)
    expect(formatJalaliDate(t)).toBe('۱۰ مهر ۱۴۰۵')
  })
  it('round-trips over several years', () => {
    for (let ms = parseIrstDate('2024-01-01'); ms < parseIrstDate('2030-01-01'); ms += 86_400_000 * 7) {
      const p = irstParts(ms)
      const j = toJalali(p.year, p.month, p.day)
      expect(toGregorian(j.jy, j.jm, j.jd)).toEqual({ gy: p.year, gm: p.month, gd: p.day })
    }
  })
  it('knows leap years and month lengths', () => {
    expect(isJalaliLeapYear(1403)).toBe(true)
    expect(isJalaliLeapYear(1404)).toBe(false)
    expect(jalaliMonthLength(1403, 12)).toBe(30)
    expect(jalaliMonthLength(1404, 12)).toBe(29)
    expect(jalaliMonthLength(1405, 6)).toBe(31)
    expect(jalaliMonthLength(1405, 7)).toBe(30)
  })
  it('jalaliOf uses IRST', () => {
    // 2026-10-02 21:00 UTC is 2026-10-03 00:30 IRST → 11 Mehr
    const j = jalaliOf(Date.UTC(2026, 9, 2, 21, 0, 0))
    expect(j).toMatchObject({ jy: 1405, jm: 7, jd: 11 })
  })
})

describe('time helpers', () => {
  it('IRST parts and windows', () => {
    const t = fromIrst(2026, 10, 2, 22, 30)
    expect(irstParts(t)).toMatchObject({ year: 2026, month: 10, day: 2, hour: 22, minute: 30 })
    expect(irstIsoDate(t)).toBe('2026-10-02')
    expect(inIrstWindow(t, 21, 9)).toBe(true)
    expect(inIrstWindow(fromIrst(2026, 10, 2, 12), 21, 9)).toBe(false)
    expect(inIrstWindow(fromIrst(2026, 10, 2, 3), 21, 9)).toBe(true)
  })
  it('ManualClock never goes backwards', () => {
    const c = new ManualClock(100)
    c.advance(50)
    expect(c.now()).toBe(150)
    expect(() => c.set(10)).toThrow()
  })
})

describe('rng', () => {
  it('is deterministic per seed path and forks are independent of parent consumption', () => {
    const a = createRng(1)
    const b = createRng(1)
    expect([a.next(), a.next(), a.next()]).toEqual([b.next(), b.next(), b.next()])
    const c = createRng(1)
    for (let i = 0; i < 100; i++) c.next()
    expect(c.fork('macro').next()).toBe(createRng(1).fork('macro').next())
    expect(createRng(1).fork('x').next()).not.toBe(createRng(1).fork('y').next())
  })
  it('distribution sanity', () => {
    const r = createRng('stats')
    let sum = 0
    let sumSq = 0
    const n = 20000
    for (let i = 0; i < n; i++) {
      const v = r.normal(0, 1)
      sum += v
      sumSq += v * v
    }
    expect(Math.abs(sum / n)).toBeLessThan(0.03)
    expect(Math.abs(sumSq / n - 1)).toBeLessThan(0.05)
    let p = 0
    for (let i = 0; i < 5000; i++) p += r.poisson(4)
    expect(Math.abs(p / 5000 - 4)).toBeLessThan(0.15)
    for (let i = 0; i < 200; i++) {
      const v = r.int(3, 7)
      expect(v).toBeGreaterThanOrEqual(3)
      expect(v).toBeLessThanOrEqual(7)
    }
    expect(r.weighted(['a', 'b'], [0, 1])).toBe('b')
  })
})

describe('ids, bus, errors', () => {
  it('ids are unique and ordered', () => {
    const g = createIdGen()
    expect(g.next('ord')).toBe('ord_000001')
    expect(g.next('ord')).toBe('ord_000002')
    expect(g.next('pay')).toBe('pay_000001')
  })
  it('event bus delivers typed and wildcard events', () => {
    const bus = createEventBus()
    const seen: string[] = []
    bus.subscribe('order.created', (e) => seen.push(`typed:${e.orderId}`))
    bus.subscribeAll((e) => seen.push(`all:${e.type}`))
    bus.publish({ type: 'order.created', at: 1, orderId: 'o1', customerId: 'c1', method: 'gateway' })
    expect(seen).toEqual(['typed:o1', 'all:order.created'])
  })
  it('AppError maps to status and Persian message', () => {
    const e = new AppError('QUOTE_EXPIRED')
    expect(e.status).toBe(409)
    expect(e.messageFa).toContain('مهلت')
  })
})

describe('format & validation helpers', () => {
  it('formats Toman in Persian', () => {
    expect(formatNumberFa(1234567)).toBe('۱٬۲۳۴٬۵۶۷')
    expect(formatIrt(1234000)).toBe('۱٬۲۳۴٬۰۰۰ تومان')
    expect(toPersianDigits('09121234567')).toBe('۰۹۱۲۱۲۳۴۵۶۷')
  })
  it('normalises Iranian mobiles', () => {
    expect(normalizeIranMobile('+98 912 123 4567')).toBe('09121234567')
    expect(normalizeIranMobile('۰۹۱۲۱۲۳۴۵۶۷')).toBe('09121234567')
    expect(normalizeIranMobile('12345')).toBeNull()
  })
  it('validates national ids', () => {
    expect(isValidNationalId('0499370899')).toBe(true)
    expect(isValidNationalId('1111111111')).toBe(false)
    expect(isValidNationalId('0499370890')).toBe(false)
  })
})

describe('params', () => {
  it('default params validate against the schema', () => {
    expect(() => PlatformParamsSchema.parse(defaultPlatformParams())).not.toThrow()
  })
  it('deepMerge replaces arrays, merges objects, never mutates base', () => {
    const base = defaultPlatformParams()
    const snapshot = JSON.stringify(base)
    const merged = deepMerge(base, { pricing: { marginPct: 0.2, volatility: { z: 2 } }, treasury: { exchangePreference: ['nobitex'] } })
    expect(merged.pricing.marginPct).toBe(0.2)
    expect(merged.pricing.volatility.z).toBe(2)
    expect(merged.pricing.volatility.lockMinutes).toBe(base.pricing.volatility.lockMinutes)
    expect(merged.treasury.exchangePreference).toEqual(['nobitex'])
    expect(JSON.stringify(base)).toBe(snapshot)
    expect(() => PlatformParamsSchema.parse(merged)).not.toThrow()
  })
  it('default catalog has risk labels and notes for high-risk items', () => {
    const products = defaultProducts()
    expect(products.length).toBeGreaterThanOrEqual(8)
    for (const p of products) {
      expect(['low', 'medium', 'high']).toContain(p.riskLabel)
      if (p.riskLabel === 'high') expect(p.restrictionNoteFa).toBeTruthy()
    }
    expect(usdtToMicro(1.5)).toBe(1_500_000)
  })
})
