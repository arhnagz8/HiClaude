/** RFC 6238 TOTP (HMAC-SHA1 by default) + base32 helpers (RFC 4648). */
import { createHmac } from 'node:crypto'
import type { Rng } from '@hiclaude/contracts'
import { timingSafeEqualStr } from './hmac'

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0
  let value = 0
  let out = ''
  for (const b of bytes) {
    value = (value << 8) | b
    bits += 8
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31]
  return out
}

export function base32Decode(s: string): Uint8Array {
  const clean = s.toUpperCase().replace(/=+$/g, '').replace(/[\s-]/g, '')
  let bits = 0
  let value = 0
  const out: number[] = []
  for (const ch of clean) {
    const idx = B32.indexOf(ch)
    if (idx < 0) throw new RangeError(`invalid base32 character: ${ch}`)
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Uint8Array.from(out)
}

export interface TotpOptions {
  digits?: number
  stepSeconds?: number
  algorithm?: 'sha1' | 'sha256' | 'sha512'
}

/** @param secret raw key bytes or a base32 string */
export function totp(secret: Uint8Array | string, nowMs: number, opts: TotpOptions = {}): string {
  const digits = opts.digits ?? 6
  const step = opts.stepSeconds ?? 30
  const counter = Math.floor(nowMs / 1000 / step)
  return hotp(typeof secret === 'string' ? base32Decode(secret) : secret, counter, digits, opts.algorithm ?? 'sha1')
}

export function hotp(key: Uint8Array, counter: number, digits = 6, algorithm: 'sha1' | 'sha256' | 'sha512' = 'sha1'): string {
  const msg = Buffer.alloc(8)
  msg.writeBigUInt64BE(BigInt(counter))
  const h = createHmac(algorithm, key).update(msg).digest()
  const off = (h[h.length - 1] as number) & 0xf
  const bin = (((h[off] as number) & 0x7f) << 24) | (((h[off + 1] as number) & 0xff) << 16) | (((h[off + 2] as number) & 0xff) << 8) | ((h[off + 3] as number) & 0xff)
  return String(bin % 10 ** digits).padStart(digits, '0')
}

/** Verifies `code` against steps [-window, +window] around `nowMs` (default ±1 step = ±30 s). Constant-time per candidate. */
export function verifyTotp(secret: Uint8Array | string, code: string, nowMs: number, opts: TotpOptions & { window?: number } = {}): boolean {
  const window = opts.window ?? 1
  const step = (opts.stepSeconds ?? 30) * 1000
  const digits = opts.digits ?? 6
  if (!new RegExp(`^\\d{${digits}}$`).test(code)) return false
  let ok = false
  for (let w = -window; w <= window; w++) {
    if (timingSafeEqualStr(totp(secret, nowMs + w * step, opts), code)) ok = true
  }
  return ok
}

/** New 160-bit base32 secret from the seeded Rng (demo) — live callers should pass bytes from crypto.randomBytes via `randomToken`. */
export function generateTotpSecret(randomBytesFn: (n: number) => Uint8Array): string {
  return base32Encode(randomBytesFn(20))
}

export function totpUri(secretBase32: string, account: string, issuer: string): string {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secretBase32}&issuer=${encodeURIComponent(issuer)}`
}

export type { Rng }
