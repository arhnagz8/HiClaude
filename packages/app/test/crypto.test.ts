import { createRng } from '@hiclaude/contracts'
import { describe, expect, it } from 'vitest'
import {
  CryptoError, DEV_MASTER_KEY_HEX, SCRYPT_FAST, base32Decode, base32Encode, decryptJson, decryptSecret, encryptJson, encryptSecret, hashPassword, hmacSha256,
  parseMasterKey, randomDigits, randomToken, sha256Hex, timingSafeEqualStr, totp, verifyPassword, verifyTotp,
} from '../src/crypto'

const KEY = DEV_MASTER_KEY_HEX
const OTHER = 'ff'.repeat(32)

describe('envelope encryption', () => {
  it('round-trips strings, unicode and JSON; ciphertexts differ each time', () => {
    const plain = '4111111111111111|123|۱۲/۳۰'
    const a = encryptSecret(plain, KEY)
    const b = encryptSecret(plain, KEY)
    expect(a).not.toBe(b)
    expect(a.startsWith('hc1.')).toBe(true)
    expect(a).not.toContain('4111')
    expect(decryptSecret(a, KEY)).toBe(plain)
    expect(decryptSecret(b, KEY)).toBe(plain)
    const j = encryptJson({ pan: '4000', cvv: '123' }, KEY)
    expect(decryptJson(j, KEY)).toEqual({ pan: '4000', cvv: '123' })
  })

  it('fails with the wrong key', () => {
    expect(() => decryptSecret(encryptSecret('x', KEY), OTHER)).toThrow(CryptoError)
  })

  it('detects tampering in every segment', () => {
    const env = encryptSecret('top secret', KEY)
    const parts = env.split('.')
    for (let i = 1; i < parts.length; i++) {
      const bad = [...parts]
      const buf = Buffer.from(bad[i] as string, 'base64url')
      buf[0] = (buf[0] as number) ^ 1
      bad[i] = buf.toString('base64url')
      expect(() => decryptSecret(bad.join('.'), KEY), `segment ${i}`).toThrow(CryptoError)
    }
    expect(() => decryptSecret('garbage', KEY)).toThrow(CryptoError)
    expect(() => decryptSecret(parts.slice(0, 5).join('.'), KEY)).toThrow(CryptoError)
  })

  it('binds ciphertext to its context (aad)', () => {
    const env = encryptSecret('x', KEY, 'order:1')
    expect(decryptSecret(env, KEY, 'order:1')).toBe('x')
    expect(() => decryptSecret(env, KEY, 'order:2')).toThrow(CryptoError)
    expect(() => decryptSecret(env, KEY)).toThrow(CryptoError)
  })

  it('validates master keys', () => {
    expect(() => parseMasterKey('abcd')).toThrow(CryptoError)
    expect(() => parseMasterKey('zz'.repeat(32))).toThrow(CryptoError)
    expect(parseMasterKey(KEY)).toHaveLength(32)
  })
})

describe('hmac / constant-time compare', () => {
  it('hmacSha256 matches a known vector and compare works', () => {
    // RFC 4231 test case 2
    expect(hmacSha256('Jefe', 'what do ya want for nothing?')).toBe('5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843')
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    expect(timingSafeEqualStr('abc', 'abc')).toBe(true)
    expect(timingSafeEqualStr('abc', 'abd')).toBe(false)
    expect(timingSafeEqualStr('abc', 'abcd')).toBe(false)
    expect(timingSafeEqualStr('', '')).toBe(true)
  })
})

describe('passwords (scrypt)', () => {
  it('hash/verify, unique salts, rejects wrong and malformed', () => {
    const h1 = hashPassword('s3cret-ß', { cost: SCRYPT_FAST })
    const h2 = hashPassword('s3cret-ß', { cost: SCRYPT_FAST })
    expect(h1).not.toBe(h2)
    expect(verifyPassword('s3cret-ß', h1)).toBe(true)
    expect(verifyPassword('s3cret-b', h1)).toBe(false)
    expect(verifyPassword('x', 'plain')).toBe(false)
    expect(verifyPassword('x', 'scrypt$1$1$1$a$b')).toBe(false)
  })
})

describe('TOTP (RFC 6238)', () => {
  const sha1 = new TextEncoder().encode('12345678901234567890')
  const sha256 = new TextEncoder().encode('12345678901234567890123456789012')
  const sha512 = new TextEncoder().encode('1234567890123456789012345678901234567890123456789012345678901234')
  const cases: [number, string, string, string][] = [
    [59, '94287082', '46119246', '90693936'],
    [1111111109, '07081804', '68084774', '25091201'],
    [1111111111, '14050471', '67062674', '99943326'],
    [1234567890, '89005924', '91819424', '93441116'],
    [2000000000, '69279037', '90698825', '38618901'],
    [20000000000, '65353130', '77737706', '47863826'],
  ]
  it.each(cases)('official vectors at T=%i (SHA1/256/512, 8 digits)', (t, a, b, c) => {
    expect(totp(sha1, t * 1000, { digits: 8 })).toBe(a)
    expect(totp(sha256, t * 1000, { digits: 8, algorithm: 'sha256' })).toBe(b)
    expect(totp(sha512, t * 1000, { digits: 8, algorithm: 'sha512' })).toBe(c)
  })

  it('base32 round trip and 6-digit default; verify honours the window', () => {
    const secret = base32Encode(sha1)
    expect(secret).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ')
    expect(Array.from(base32Decode(secret))).toEqual(Array.from(sha1))
    const now = 1_700_000_000_000
    const code = totp(secret, now)
    expect(code).toMatch(/^\d{6}$/)
    expect(verifyTotp(secret, code, now)).toBe(true)
    expect(verifyTotp(secret, code, now + 30_000)).toBe(true) // previous step still accepted
    expect(verifyTotp(secret, code, now + 90_000)).toBe(false)
    expect(verifyTotp(secret, code, now + 90_000, { window: 3 })).toBe(true)
    expect(verifyTotp(secret, '000000x', now)).toBe(false)
    expect(() => base32Decode('1!')).toThrow()
  })
})

describe('tokens', () => {
  it('are deterministic from the Rng in non-live modes and random in live mode', () => {
    expect(randomToken(createRng(7), 'sim')).toBe(randomToken(createRng(7), 'sim'))
    expect(randomToken(createRng(7), 'sim')).not.toBe(randomToken(createRng(8), 'sim'))
    expect(randomToken(createRng(7), 'live')).not.toBe(randomToken(createRng(7), 'live'))
    expect(randomToken(createRng(1), 'test', 32)).toHaveLength(43)
    expect(randomDigits(createRng(3), 'sim', 6)).toMatch(/^\d{6}$/)
    expect(randomDigits(createRng(3), 'live', 6)).toMatch(/^\d{6}$/)
  })
})
