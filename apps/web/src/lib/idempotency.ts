/** Idempotency keys for money-moving calls (POST /orders, receipts, top-ups). One key per user *intent*, reused on retry. */
export function newIdempotencyKey(prefix = 'web'): string {
  const c = (globalThis as { crypto?: Crypto }).crypto
  if (c?.randomUUID) return `${prefix}-${c.randomUUID()}`
  const bytes = new Uint8Array(16)
  if (c?.getRandomValues) c.getRandomValues(bytes)
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
  return `${prefix}-${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`
}

/** Holds a key until the intent changes: retries of the same submit reuse the key, a changed payload gets a new one. */
export class IntentKey {
  private fingerprint: string | null = null
  private key: string | null = null
  constructor(private readonly prefix = 'web') {}
  for(payload: unknown): string {
    const fp = JSON.stringify(payload)
    if (this.key === null || fp !== this.fingerprint) {
      this.fingerprint = fp
      this.key = newIdempotencyKey(this.prefix)
    }
    return this.key
  }
  reset(): void {
    this.fingerprint = null
    this.key = null
  }
}
