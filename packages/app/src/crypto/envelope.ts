/**
 * Envelope encryption for card secrets / voucher codes (architecture §11).
 *
 * Every record gets a fresh random 256-bit data key (DEK). The payload is encrypted with AES-256-GCM under the DEK, and the DEK is
 * itself wrapped (AES-256-GCM) by the master key (KEK). Format (all base64url, dot separated):
 *
 *     hc1.<wrapIv 12B>.<wrapTag 16B>.<wrappedDek 32B>.<dataIv 12B>.<dataTag 16B>.<ciphertext>
 *
 * `aad` (e.g. the order id) is authenticated for both layers, so a blob copied to another record fails to decrypt.
 * Randomness for DEK/IV intentionally comes from `crypto.randomBytes` (never from the seeded Rng): ciphertexts need not be
 * reproducible, and IV reuse would be catastrophic.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

export const ENVELOPE_PREFIX = 'hc1'

/** DEV ONLY master key for demo / sim / tests. Never used in `mode: 'live'` (createApp refuses to start without a real key). */
export const DEV_MASTER_KEY_HEX = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff' // INSECURE: demo key, public in the repo

export class CryptoError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CryptoError'
  }
}

export function parseMasterKey(key: string | Uint8Array): Buffer {
  const buf = typeof key === 'string' ? Buffer.from(key, 'hex') : Buffer.from(key)
  if (buf.length !== 32 || (typeof key === 'string' && !/^[0-9a-fA-F]{64}$/.test(key))) {
    throw new CryptoError('master key must be 32 bytes (64 hex characters)')
  }
  return buf
}

const b64 = (b: Buffer): string => b.toString('base64url')

function seal(key: Buffer, plaintext: Buffer, aad?: Buffer): { iv: Buffer; tag: Buffer; ct: Buffer } {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', key, iv)
  if (aad) c.setAAD(aad)
  const ct = Buffer.concat([c.update(plaintext), c.final()])
  return { iv, tag: c.getAuthTag(), ct }
}

function open(key: Buffer, iv: Buffer, tag: Buffer, ct: Buffer, aad?: Buffer): Buffer {
  const d = createDecipheriv('aes-256-gcm', key, iv)
  if (aad) d.setAAD(aad)
  d.setAuthTag(tag)
  return Buffer.concat([d.update(ct), d.final()])
}

export function encryptSecret(plain: string | Uint8Array, masterKey: string | Uint8Array, aad?: string): string {
  const kek = parseMasterKey(masterKey)
  const dek = randomBytes(32)
  const aadBuf = aad === undefined ? undefined : Buffer.from(aad, 'utf8')
  const data = seal(dek, typeof plain === 'string' ? Buffer.from(plain, 'utf8') : Buffer.from(plain), aadBuf)
  const wrap = seal(kek, dek, aadBuf)
  return [ENVELOPE_PREFIX, b64(wrap.iv), b64(wrap.tag), b64(wrap.ct), b64(data.iv), b64(data.tag), b64(data.ct)].join('.')
}

function decryptToBuffer(envelope: string, masterKey: string | Uint8Array, aad?: string): Buffer {
  const kek = parseMasterKey(masterKey)
  const parts = envelope.split('.')
  if (parts.length !== 7 || parts[0] !== ENVELOPE_PREFIX) throw new CryptoError('unsupported or malformed envelope')
  const [, wIv, wTag, wCt, dIv, dTag, dCt] = parts.map((p, i) => (i === 0 ? Buffer.alloc(0) : Buffer.from(p as string, 'base64url'))) as Buffer[]
  if (wIv!.length !== 12 || wTag!.length !== 16 || wCt!.length !== 32 || dIv!.length !== 12 || dTag!.length !== 16) {
    throw new CryptoError('malformed envelope')
  }
  const aadBuf = aad === undefined ? undefined : Buffer.from(aad, 'utf8')
  try {
    const dek = open(kek, wIv!, wTag!, wCt!, aadBuf)
    return open(dek, dIv!, dTag!, dCt!, aadBuf)
  } catch {
    // never leak which layer failed
    throw new CryptoError('decryption failed (wrong key, wrong context, or tampered data)')
  }
}

export function decryptSecret(envelope: string, masterKey: string | Uint8Array, aad?: string): string {
  return decryptToBuffer(envelope, masterKey, aad).toString('utf8')
}

export function decryptSecretBytes(envelope: string, masterKey: string | Uint8Array, aad?: string): Uint8Array {
  return new Uint8Array(decryptToBuffer(envelope, masterKey, aad))
}

/** JSON convenience wrappers (card secrets etc.). */
export const encryptJson = (value: unknown, masterKey: string | Uint8Array, aad?: string): string => encryptSecret(JSON.stringify(value), masterKey, aad)
export const decryptJson = <T = unknown>(envelope: string, masterKey: string | Uint8Array, aad?: string): T => JSON.parse(decryptSecret(envelope, masterKey, aad)) as T
