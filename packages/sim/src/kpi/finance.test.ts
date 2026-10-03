import { describe, expect, it } from 'vitest'
import { breakEvenMonth, capitalPaybackMonths, cagr, cumulativeBreakEvenMonth, describe as desc, maxDrawdown, roiOnCapital, runwayDays, toRealIrt, toUsd, type MonthlyPoint } from './finance'

const pts = (xs: number[]): MonthlyPoint[] => xs.map((n, i) => ({ key: `m${i}`, to: i, netProfitIrt: n }))

describe('finance metrics', () => {
  it('break-even month requires staying non-negative afterwards', () => {
    expect(breakEvenMonth(pts([-5, -3, 1, 2, 3, 4]))!.key).toBe('m2')
    expect(breakEvenMonth(pts([-5, 1, -2, 2, 3, 4]))!.key).toBe('m3')
    expect(breakEvenMonth(pts([-5, -4, -3]))).toBeNull()
    expect(breakEvenMonth(pts([-1, 1]))!.key).toBe('m1')
  })
  it('operating variant uses operatingProfitIrt', () => {
    const p = pts([-1, -1, -1]).map((x, i) => ({ ...x, operatingProfitIrt: i >= 1 ? 5 : -5 }))
    expect(breakEvenMonth(p, 'operating')!.key).toBe('m1')
    expect(breakEvenMonth(p, 'net')).toBeNull()
  })
  it('cumulative break-even', () => {
    expect(cumulativeBreakEvenMonth(pts([-10, 4, 4, 4]))!.key).toBe('m3')
    expect(cumulativeBreakEvenMonth(pts([-10, 1, 1]))).toBeNull()
  })
  it('runway', () => {
    expect(runwayDays(900, -10)).toBe(90)
    expect(runwayDays(900, 5)).toBe(Infinity)
    expect(runwayDays(-5, -10)).toBe(0)
  })
  it('max drawdown', () => {
    const d = maxDrawdown([100, 120, 90, 130, 60, 140])
    expect(d.absolute).toBe(70)
    expect(d.fraction).toBeCloseTo(70 / 130, 12)
    expect(d.peakIndex).toBe(3)
    expect(d.troughIndex).toBe(4)
    expect(maxDrawdown([1, 2, 3]).absolute).toBe(0)
    expect(maxDrawdown([]).absolute).toBe(0)
  })
  it('ROI on capital includes draws', () => {
    expect(roiOnCapital(150, 50, 100)).toBe(1)
    expect(roiOnCapital(50, 0, 100)).toBe(-0.5)
    expect(roiOnCapital(1, 1, 0)).toBe(0)
  })
  it('capital payback', () => {
    expect(capitalPaybackMonths(pts([10, 10, 10]), 25)).toBe(3)
    expect(capitalPaybackMonths(pts([1, 1]), 25)).toBeNull()
  })
  it('real & USD views', () => {
    expect(toRealIrt(150, 1.5)).toBe(100)
    expect(toUsd(2570, 257)).toBe(10)
    expect(toRealIrt(10, 0)).toBe(10)
  })
  it('cagr and describe', () => {
    expect(cagr(100, 121, 2)).toBeCloseTo(0.1, 12)
    expect(cagr(-1, 1, 1)).toBe(0)
    const s = desc([1, 2, 3, 4, 5])
    expect(s.p50).toBe(3)
    expect(s.mean).toBe(3)
    expect(desc([]).n).toBe(0)
  })
})
