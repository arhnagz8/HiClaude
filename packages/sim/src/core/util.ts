import type { Rng } from '@hiclaude/contracts'

/** Lognormal sample with the given MEDIAN and log-sd sigma. */
export function logNormalMedian(rng: Rng, median: number, sigma: number): number {
  return median * Math.exp(rng.normal(0, sigma))
}

export const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x)

/** Median of a numeric array (empty -> NaN). */
export function median(xs: number[]): number {
  if (xs.length === 0) return NaN
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2
}

/** Round half away from zero to an integer (balances must be integers). */
export const roundInt = (x: number): number => Math.round(x)

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
const HEX = '0123456789abcdef'
const B64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

export function randomString(rng: Rng, alphabet: string, len: number): string {
  let s = ''
  for (let i = 0; i < len; i++) s += alphabet[rng.int(0, alphabet.length - 1)]
  return s
}
export const randomBase58 = (rng: Rng, len: number): string => randomString(rng, B58, len)
export const randomHex = (rng: Rng, len: number): string => randomString(rng, HEX, len)
export const randomBase64Url = (rng: Rng, len: number): string => randomString(rng, B64URL, len)

/** Deep merge for plain objects (arrays replaced). Pure. */
export function deepAssign<T>(base: T, patch: unknown): T {
  if (patch === undefined) return base
  if (typeof base === 'object' && base !== null && !Array.isArray(base) && typeof patch === 'object' && patch !== null && !Array.isArray(patch)) {
    const out: Record<string, unknown> = { ...(base as Record<string, unknown>) }
    for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
      if (v === undefined) continue
      out[k] = k in out ? deepAssign(out[k], v) : structuredClone(v)
    }
    return out as T
  }
  return structuredClone(patch) as T
}
