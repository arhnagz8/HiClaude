import { describe, expect, it } from 'vitest'
import { createRng } from '@hiclaude/contracts'
import { D, assertSafeInt, bpsOf, ceilToStep, clamp, floorToStep, irtToMicro, microToIrt, mulDivRound, pctOf, roundDec, sumInts, toInt } from './index'

describe('money', () => {
  it('D rejects NaN and Infinity', () => {
    expect(() => D(NaN)).toThrow(RangeError)
    expect(() => D(Infinity)).toThrow(RangeError)
    expect(() => D('abc')).toThrow()
    expect(D('1.5').toNumber()).toBe(1.5)
    expect(D(10n).toNumber()).toBe(10)
  })

  it('rounding modes behave for positive and negative values', () => {
    const cases: [number, number, number, number, number][] = [
      // x, up, down, half_up, half_even
      [2.5, 3, 2, 3, 2],
      [3.5, 4, 3, 4, 4],
      [-2.5, -2, -3, -2, -2],
      [-2.4, -2, -3, -2, -2],
      [2.4, 3, 2, 2, 2],
      [2.0, 2, 2, 2, 2],
    ]
    for (const [x, up, down, hu, he] of cases) {
      expect(roundDec(D(x), 'up').toNumber()).toBe(up)
      expect(roundDec(D(x), 'down').toNumber()).toBe(down)
      expect(roundDec(D(x), 'half_up').toNumber()).toBe(hu)
      expect(roundDec(D(x), 'half_even').toNumber()).toBe(he)
    }
  })

  it('toInt guards unsafe results', () => {
    expect(() => toInt('1e30', 'up')).toThrow(RangeError)
    expect(toInt('12.0000001', 'up')).toBe(13)
    expect(Object.is(toInt(-0.2, 'up'), 0)).toBe(true) // never -0
  })

  it('mulDivRound is exact where floats are not', () => {
    // 0.1 + 0.2 style traps: 257000.5 * 3 / 7
    expect(mulDivRound(257_000.5, 3, 7, 'up')).toBe(110_144) // 110143.07…
    expect(mulDivRound(257_000.5, 3, 7, 'down')).toBe(110_143)
    expect(mulDivRound(1, 1, 3, 'up')).toBe(1)
    expect(mulDivRound(1, 1, 3, 'down')).toBe(0)
    expect(mulDivRound(2, 1, 4, 'half_up')).toBe(1)
    expect(() => mulDivRound(1, 1, 0, 'up')).toThrow(RangeError)
    expect(() => mulDivRound(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, 1, 'up')).toThrow(RangeError)
  })

  it('ceilToStep / floorToStep', () => {
    expect(ceilToStep(30_001, 1000)).toBe(31_000)
    expect(ceilToStep(30_000, 1000)).toBe(30_000)
    expect(floorToStep(30_999, 1000)).toBe(30_000)
    expect(ceilToStep(-1500, 1000)).toBe(-1000)
    expect(floorToStep(-1500, 1000)).toBe(-2000)
    expect(ceilToStep(7, 1)).toBe(7)
    expect(() => ceilToStep(1.5, 10)).toThrow(RangeError)
    expect(() => ceilToStep(5, 0)).toThrow(RangeError)
  })

  it('bpsOf and pctOf round with the requested mode (fees up by default)', () => {
    expect(bpsOf(1_000_001, 35)).toBe(3501) // 3500.0035 → up
    expect(bpsOf(1_000_001, 35, 'down')).toBe(3500)
    expect(pctOf(1_000_001, 0.005)).toBe(5001)
    expect(pctOf(1_000_001, 0.005, 'half_up')).toBe(5000)
  })

  it('clamp and sumInts', () => {
    expect(clamp(5, 0, 3)).toBe(3)
    expect(clamp(-5, 0, 3)).toBe(0)
    expect(clamp(2, 0, 3)).toBe(2)
    expect(() => clamp(NaN, 0, 1)).toThrow(RangeError)
    expect(() => clamp(1, 2, 1)).toThrow(RangeError)
    expect(sumInts([1, 2, 3])).toBe(6)
    expect(() => sumInts([1, 1.5])).toThrow(RangeError)
    expect(() => sumInts([Number.MAX_SAFE_INTEGER, 1])).toThrow(RangeError)
  })

  it('assertSafeInt', () => {
    expect(assertSafeInt(5)).toBe(5)
    expect(() => assertSafeInt(NaN)).toThrow(RangeError)
    expect(() => assertSafeInt(2 ** 60)).toThrow(RangeError)
  })

  it('micro/irt conversions round as asked and are consistent', () => {
    const rng = createRng('money-conv')
    for (let i = 0; i < 500; i++) {
      const q = rng.int(1, 5_000_000_000)
      const rate = 200_000 + rng.next() * 100_000
      const up = microToIrt(q, rate, 'up')
      const down = microToIrt(q, rate, 'down')
      expect(up - down).toBeLessThanOrEqual(1)
      expect(up).toBeGreaterThanOrEqual(down)
      // round-trip never creates USDT
      expect(irtToMicro(down, rate, 'down')).toBeLessThanOrEqual(q)
    }
    expect(() => irtToMicro(1, 0, 'up')).toThrow(RangeError)
  })
})
