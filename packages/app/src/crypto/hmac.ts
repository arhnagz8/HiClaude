import { createHash, createHmac } from 'node:crypto'

export function hmacSha256(key: string | Uint8Array, data: string | Uint8Array): string {
  return createHmac('sha256', key).update(data).digest('hex')
}

export function sha256Hex(data: string | Uint8Array): string {
  return createHash('sha256').update(data).digest('hex')
}

/**
 * Constant-time string comparison. Both inputs are first reduced to fixed-length HMAC digests so neither content nor
 * length leaks through timing.
 */
export function timingSafeEqualStr(a: string, b: string): boolean {
  const k = 'hc-timing-safe'
  const da = createHmac('sha256', k).update(a).digest()
  const db = createHmac('sha256', k).update(b).digest()
  let diff = 0
  for (let i = 0; i < da.length; i++) diff |= (da[i] as number) ^ (db[i] as number)
  return diff === 0 && a.length === b.length
}
