/**
 * Shared pure helpers for the sim "models" layer (demand, marketing, reputation, owner, kpi, reports, tooling).
 * No wall-clock, no Math.random: randomness always comes from a contracts `Rng`.
 */
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

export const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x)
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t
export const sum = (xs: readonly number[]): number => {
  let s = 0
  for (const x of xs) s += x
  return s
}
export const mean = (xs: readonly number[]): number => (xs.length === 0 ? 0 : sum(xs) / xs.length)
export function stdev(xs: readonly number[]): number {
  if (xs.length < 2) return 0
  const m = mean(xs)
  let s = 0
  for (const x of xs) s += (x - m) * (x - m)
  return Math.sqrt(s / (xs.length - 1))
}
/** Linear-interpolated percentile (p in [0,100]) of an unsorted array. Empty -> 0. */
export function percentile(xs: readonly number[], p: number): number {
  if (xs.length === 0) return 0
  const a = [...xs].sort((x, y) => x - y)
  const idx = (clamp(p, 0, 100) / 100) * (a.length - 1)
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  const lv = a[lo] as number
  const hv = a[hi] as number
  return lo === hi ? lv : lv + (hv - lv) * (idx - lo)
}
export const safeDiv = (a: number, b: number, fallback = 0): number => (b === 0 || !Number.isFinite(b) ? fallback : a / b)

/** Root of the monorepo (…/packages/sim/src/demand -> repo root). */
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')

/** Unwrap a research Record `{value, unit, as_of, …}` to its value; plain values pass through. */
export function unwrap<T = unknown>(x: unknown): T {
  if (x && typeof x === 'object' && !Array.isArray(x)) {
    const o = x as Record<string, unknown>
    if ('value' in o && ('unit' in o || 'as_of' in o || 'confidence' in o || 'sources' in o || 'verify_how' in o || 'status' in o)) return o.value as T
  }
  return x as T
}

/** Recursively unwrap Record wrappers. */
export function deepUnwrap(x: unknown): unknown {
  const u = unwrap(x)
  if (Array.isArray(u)) return u.map(deepUnwrap)
  if (u && typeof u === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(u as Record<string, unknown>)) out[k] = deepUnwrap(v)
    return out
  }
  return u
}

/** Read JSON relative to the repo root; `undefined` when missing or unparsable (research outputs are optional). */
export function readRepoJson(relPath: string): unknown | undefined {
  try {
    const p = resolve(REPO_ROOT, relPath)
    if (!existsSync(p)) return undefined
    return JSON.parse(readFileSync(p, 'utf8'))
  } catch {
    return undefined
  }
}

/** Number or undefined: accepts numbers, numeric strings, Record wrappers and `{base}` distributions. */
export function numOf(x: unknown): number | undefined {
  const u = unwrap(x)
  if (typeof u === 'number' && Number.isFinite(u)) return u
  if (typeof u === 'string' && u.trim() !== '' && Number.isFinite(Number(u))) return Number(u)
  if (u && typeof u === 'object' && 'base' in (u as object)) return numOf((u as { base: unknown }).base)
  return undefined
}

/** Numerically stable softmax over utilities plus one extra "outside" utility (last element). */
export function softmax(utils: readonly number[]): number[] {
  let mx = -Infinity
  for (const u of utils) if (u > mx) mx = u
  if (!Number.isFinite(mx)) return utils.map(() => 0)
  const ex = utils.map((u) => Math.exp(u - mx))
  const s = sum(ex)
  return ex.map((e) => e / s)
}

/** Weibull(shape k, scale λ) sample via inverse CDF. */
export function weibull(u: number, shape: number, scale: number): number {
  const uu = clamp(u, 1e-12, 1 - 1e-12)
  return scale * Math.pow(-Math.log(uu), 1 / shape)
}

/** Deterministic string hash (FNV-1a, 32 bit) for params hashes and stable ids. */
export function hashString(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

/** Stable JSON (sorted keys) for hashing/snapshots. */
export function stableStringify(x: unknown): string {
  return JSON.stringify(x, (_k, v) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const o: Record<string, unknown> = {}
      for (const k of Object.keys(v as object).sort()) o[k] = (v as Record<string, unknown>)[k]
      return o
    }
    return v
  })
}

/** Deep merge plain objects (arrays replaced). Used for scenario/policy overrides. */
export function deepMerge<T>(base: T, over: unknown): T {
  if (over === undefined || over === null) return base
  if (typeof base !== 'object' || base === null || Array.isArray(base) || typeof over !== 'object' || Array.isArray(over)) return over as T
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) }
  for (const [k, v] of Object.entries(over as Record<string, unknown>)) out[k] = deepMerge((out as Record<string, unknown>)[k], v)
  return out as T
}
