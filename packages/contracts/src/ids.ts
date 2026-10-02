/** Deterministic id generation. [CONTRACT] */
import type { Rng } from './rng'

export interface IdGen {
  /** e.g. next('ord') → "ord_00001f" */
  next(prefix: string): string
}

/** Counter-based ids per prefix: unique, ordered, deterministic. */
export function createIdGen(): IdGen {
  const counters = new Map<string, number>()
  return {
    next(prefix: string): string {
      const n = (counters.get(prefix) ?? 0) + 1
      counters.set(prefix, n)
      return `${prefix}_${n.toString(36).padStart(6, '0')}`
    },
  }
}

const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ' // no 0/O/1/I/L

/** Short human-friendly public code (orders, referrals), e.g. "KT-7F3A9B". */
export function publicCode(rng: Rng, prefix: string, length = 6): string {
  let s = ''
  for (let i = 0; i < length; i++) s += ALPHABET[rng.int(0, ALPHABET.length - 1)]
  return `${prefix}-${s}`
}
