/**
 * money — exact decimal helpers with explicit rounding.
 *
 * Rules (architecture §4): balances are integers; intermediates use decimal.js (40 significant digits);
 * every conversion to an integer names its rounding mode. Customer prices round UP, payouts round DOWN,
 * fees round UP, revaluation rounds HALF-UP.
 *
 * Rounding modes (relative to +infinity, so they are well defined for negative numbers too):
 *  - `up`       → ceil  (toward +∞)
 *  - `down`     → floor (toward −∞)
 *  - `half_up`  → floor(x + 0.5) (ties go toward +∞; this is what contracts `roundHalfUp` does)
 *  - `half_even`→ banker's rounding
 *
 * All guards throw `RangeError` on NaN / ±Infinity / unsafe integers.
 */
import Decimal from 'decimal.js'

/** Isolated Decimal constructor so global Decimal.set() calls elsewhere cannot change our semantics. */
export const Dec = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP, toExpNeg: -40, toExpPos: 40 })
export type Dec = Decimal

export type RoundMode = 'up' | 'down' | 'half_up' | 'half_even'

export type DecInput = number | string | bigint | Decimal

/** Wraps a number/string/bigint/Decimal in a Decimal. Throws `RangeError` for NaN and ±Infinity. */
export function D(x: DecInput): Decimal {
  if (typeof x === 'number') {
    if (!Number.isFinite(x)) throw new RangeError(`D(): non-finite number ${x}`)
    return new Dec(x)
  }
  if (typeof x === 'bigint') return new Dec(x.toString())
  const d = new Dec(x as Decimal | string)
  if (!d.isFinite()) throw new RangeError(`D(): non-finite value ${String(x)}`)
  return d
}

/** Rounds a Decimal to an integer Decimal with the given mode. */
export function roundDec(x: Decimal, mode: RoundMode): Decimal {
  switch (mode) {
    case 'up':
      return x.ceil()
    case 'down':
      return x.floor()
    case 'half_up':
      return x.plus(0.5).floor()
    case 'half_even':
      return x.toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN)
  }
}

/** Throws `RangeError` unless `n` is a safe integer; returns `n` (and normalises -0 to 0). */
export function assertSafeInt(n: number, label = 'amount'): number {
  if (!Number.isSafeInteger(n)) throw new RangeError(`${label} must be a safe integer, got ${n}`)
  return n === 0 ? 0 : n
}

/** Rounds a Decimal/number to a safe JS integer. Throws `RangeError` on overflow. */
export function toInt(x: DecInput, mode: RoundMode, label = 'value'): number {
  const r = roundDec(D(x), mode)
  const n = r.toNumber()
  return assertSafeInt(n, label)
}

/** Decimal-valued `a*b/c` rounded to an integer. `c` must be non-zero. */
export function mulDivRound(a: DecInput, b: DecInput, c: DecInput, mode: RoundMode): number {
  const den = D(c)
  if (den.isZero()) throw new RangeError('mulDivRound(): division by zero')
  return toInt(D(a).mul(D(b)).div(den), mode, 'mulDivRound')
}

/** Rounds `n` UP to a multiple of `step` (step ≥ 1, integer). */
export function ceilToStep(n: number, step: number): number {
  assertSafeInt(n, 'n')
  assertSafeInt(step, 'step')
  if (step < 1) throw new RangeError('ceilToStep(): step must be ≥ 1')
  if (step === 1) return n
  return toInt(D(n).div(step).ceil().mul(step), 'up', 'ceilToStep')
}

/** Rounds `n` DOWN to a multiple of `step` (step ≥ 1, integer). */
export function floorToStep(n: number, step: number): number {
  assertSafeInt(n, 'n')
  assertSafeInt(step, 'step')
  if (step < 1) throw new RangeError('floorToStep(): step must be ≥ 1')
  if (step === 1) return n
  return toInt(D(n).div(step).floor().mul(step), 'down', 'floorToStep')
}

/** `amount × bps / 10_000` rounded with `mode` (default UP — fees). */
export function bpsOf(amount: DecInput, bps: number, mode: RoundMode = 'up'): number {
  return toInt(D(amount).mul(D(bps)).div(10_000), mode, 'bpsOf')
}

/** `amount × fraction` where `fraction` is a FRACTION (0.10 = 10 %, the convention of every `*Pct` param). Default UP. */
export function pctOf(amount: DecInput, fraction: number, mode: RoundMode = 'up'): number {
  return toInt(D(amount).mul(D(fraction)), mode, 'pctOf')
}

/** Clamps `n` into [lo, hi]. Throws if lo > hi or any input is NaN. */
export function clamp(n: number, lo: number, hi: number): number {
  if (Number.isNaN(n) || Number.isNaN(lo) || Number.isNaN(hi)) throw new RangeError('clamp(): NaN')
  if (lo > hi) throw new RangeError(`clamp(): lo ${lo} > hi ${hi}`)
  return n < lo ? lo : n > hi ? hi : n
}

/** Sum of safe integers; throws if an element or the running total is not a safe integer. */
export function sumInts(xs: readonly number[]): number {
  let s = 0
  for (const x of xs) {
    assertSafeInt(x, 'sumInts element')
    s += x
    assertSafeInt(s, 'sumInts total')
  }
  return s
}

/** Number guard: returns `x` when finite, else throws `RangeError`. */
export function finite(x: number, label = 'value'): number {
  if (!Number.isFinite(x)) throw new RangeError(`${label} must be finite, got ${x}`)
  return x
}

/** Integer micro-USDT value of `usdt` USDT-denominated Decimal/number, with explicit rounding. */
export function usdtToMicroRound(usdt: DecInput, mode: RoundMode): number {
  return toInt(D(usdt).mul(1_000_000), mode, 'usdtToMicroRound')
}

/** `qtyMicro × rate / 1e6` → Toman, explicit rounding. `rate` = Toman per USDT. */
export function microToIrt(qtyMicro: number, rate: number, mode: RoundMode): number {
  return toInt(D(qtyMicro).mul(D(rate)).div(1_000_000), mode, 'microToIrt')
}

/** `irt / rate × 1e6` → micro-USDT, explicit rounding. */
export function irtToMicro(irt: number, rate: number, mode: RoundMode): number {
  const r = D(rate)
  if (r.lte(0)) throw new RangeError('irtToMicro(): rate must be > 0')
  return toInt(D(irt).mul(1_000_000).div(r), mode, 'irtToMicro')
}
