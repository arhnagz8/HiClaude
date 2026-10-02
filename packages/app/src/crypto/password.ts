/** scrypt password hashing. Format: `scrypt$N$r$p$<salt b64url>$<hash b64url>`. */
import { randomBytes, scryptSync } from 'node:crypto'
import { timingSafeEqualStr } from './hmac'

export interface ScryptCost {
  N: number
  r: number
  p: number
}
/** Production cost (OWASP-ish: N=2^15 would need maxmem; 2^14 is a sensible interactive baseline). */
export const SCRYPT_PROD: ScryptCost = { N: 16384, r: 8, p: 1 }
/** Cheap cost for demo/sim/tests (fast seeding of many staff accounts). NOT for live. */
export const SCRYPT_FAST: ScryptCost = { N: 1024, r: 8, p: 1 }

const KEYLEN = 32

export function hashPassword(password: string, opts: { cost?: ScryptCost; salt?: Uint8Array } = {}): string {
  const { N, r, p } = opts.cost ?? SCRYPT_PROD
  const salt = Buffer.from(opts.salt ?? randomBytes(16))
  const dk = scryptSync(password.normalize('NFKC'), salt, KEYLEN, { N, r, p, maxmem: 256 * N * r })
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64url')}$${dk.toString('base64url')}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false
  const N = Number(parts[1])
  const r = Number(parts[2])
  const p = Number(parts[3])
  if (![N, r, p].every((n) => Number.isInteger(n) && n > 0) || N > 1 << 20) return false
  const salt = Buffer.from(parts[4] as string, 'base64url')
  const expected = parts[5] as string
  const dk = scryptSync(password.normalize('NFKC'), salt, KEYLEN, { N, r, p, maxmem: 256 * N * r })
  return timingSafeEqualStr(dk.toString('base64url'), expected)
}
