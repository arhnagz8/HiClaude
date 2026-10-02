/**
 * Deterministic hashing helpers (no wall-clock, no global RNG).
 * `mix`/`hashUniform`/`hashNormal` are PURE functions of their integer keys: the same keys give the same value regardless of
 * call order, which is what makes lazily evaluated processes (macro intraday path, exchange quote noise) query-order independent.
 */
import { createHash } from 'node:crypto'

export function fmix32(h0: number): number {
  let h = h0 | 0
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return h >>> 0
}

/** 32-bit FNV-1a + finalizer of a string. */
export function hashString32(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return fmix32(h)
}

/** Mix any number of numeric keys (safe integers or floats; both 32-bit halves of the integer part are used). */
export function mix(...keys: number[]): number {
  let h = 0x9e3779b9
  for (const k of keys) {
    const f = Math.floor(k)
    const lo = f % 4294967296
    const hi = Math.floor(f / 4294967296)
    h = fmix32((h ^ (lo | 0)) + 0x7f4a7c15)
    h = fmix32((h ^ (hi | 0)) + 0x165667b1)
  }
  return h
}

/** Uniform in the open interval (0, 1). */
export function hashUniform(...keys: number[]): number {
  return (mix(...keys) + 0.5) / 4294967296
}

/** Standard normal (Box–Muller, cosine branch) from integer keys. */
export function hashNormal(...keys: number[]): number {
  const u1 = hashUniform(...keys, 0x51)
  const u2 = hashUniform(...keys, 0xa7)
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
}

export function sha256Hex(s: string): string {
  return createHash('sha256').update(s).digest('hex')
}

/** JSON with sorted object keys: canonical for hashing. */
export function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null'
  if (Array.isArray(v)) return `[${v.map((x) => stableStringify(x)).join(',')}]`
  const o = v as Record<string, unknown>
  const keys = Object.keys(o).filter((k) => o[k] !== undefined).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`).join(',')}}`
}

export function hashObject(v: unknown): string {
  return sha256Hex(stableStringify(v))
}
