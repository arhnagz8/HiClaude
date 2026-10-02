import { randomBytes, randomInt } from 'node:crypto'
import type { Rng } from '@hiclaude/contracts'

export type RunMode = 'live' | 'demo' | 'sim' | 'test'

/** Random bytes: `crypto.randomBytes` in live mode, deterministic from the seeded Rng otherwise (reproducible simulations). */
export function randomBytesFor(rng: Rng, mode: RunMode, n: number): Uint8Array {
  if (mode === 'live') return new Uint8Array(randomBytes(n))
  const out = new Uint8Array(n)
  for (let i = 0; i < n; i++) out[i] = rng.int(0, 255)
  return out
}

/** URL-safe token (default 24 bytes = 192 bits). */
export function randomToken(rng: Rng, mode: RunMode = 'sim', bytes = 24): string {
  return Buffer.from(randomBytesFor(rng, mode, bytes)).toString('base64url')
}

/** Numeric code of `digits` digits (OTP). */
export function randomDigits(rng: Rng, mode: RunMode, digits: number): string {
  let s = ''
  if (mode === 'live') {
    for (let i = 0; i < digits; i++) s += String(randomInt(0, 10))
    return s
  }
  for (let i = 0; i < digits; i++) s += String(rng.int(0, 9))
  return s
}
