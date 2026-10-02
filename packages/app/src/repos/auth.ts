import type { EpochMs } from '@hiclaude/contracts'
import type { Database } from '../db'
import { compact, nn } from './json'

// ───────────────────────── sessions (customer + staff) ─────────────────────────
export interface SessionRecord {
  tokenHash: string
  subjectKind: 'customer' | 'staff'
  subjectId: string
  channel?: string
  createdAt: EpochMs
  expiresAt: EpochMs
  lastSeenAt: EpochMs
  revokedAt?: EpochMs
  meta: Record<string, unknown>
}
interface SessionRow {
  token_hash: string
  subject_kind: 'customer' | 'staff'
  subject_id: string
  channel: string | null
  created_at: number
  expires_at: number
  last_seen_at: number
  revoked_at: number | null
  meta_json: string
}
const toSession = (r: SessionRow): SessionRecord =>
  compact({
    tokenHash: r.token_hash,
    subjectKind: r.subject_kind,
    subjectId: r.subject_id,
    channel: nn(r.channel),
    createdAt: r.created_at,
    expiresAt: r.expires_at,
    lastSeenAt: r.last_seen_at,
    revokedAt: nn(r.revoked_at),
    meta: JSON.parse(r.meta_json) as Record<string, unknown>,
  }) as SessionRecord

export class SessionsRepo {
  constructor(private readonly db: Database) {}
  insert(s: SessionRecord): SessionRecord {
    this.db.run(
      'INSERT INTO sessions (token_hash, subject_kind, subject_id, channel, created_at, expires_at, last_seen_at, revoked_at, meta_json) VALUES (?,?,?,?,?,?,?,?,?)',
      [s.tokenHash, s.subjectKind, s.subjectId, s.channel, s.createdAt, s.expiresAt, s.lastSeenAt, s.revokedAt, JSON.stringify(s.meta ?? {})],
    )
    return s
  }
  getByHash(tokenHash: string): SessionRecord | undefined {
    const r = this.db.get<SessionRow>('SELECT * FROM sessions WHERE token_hash = ?', [tokenHash])
    return r && toSession(r)
  }
  touch(tokenHash: string, now: EpochMs): void {
    this.db.run('UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?', [now, tokenHash])
  }
  revoke(tokenHash: string, now: EpochMs): boolean {
    return this.db.run('UPDATE sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL', [now, tokenHash]).changes > 0
  }
  revokeAllForSubject(kind: 'customer' | 'staff', subjectId: string, now: EpochMs): number {
    return this.db.run('UPDATE sessions SET revoked_at = ? WHERE subject_kind = ? AND subject_id = ? AND revoked_at IS NULL', [now, kind, subjectId]).changes
  }
  listBySubject(kind: 'customer' | 'staff', subjectId: string): SessionRecord[] {
    return this.db.all<SessionRow>('SELECT * FROM sessions WHERE subject_kind = ? AND subject_id = ? ORDER BY created_at', [kind, subjectId]).map(toSession)
  }
  deleteExpired(now: EpochMs): number {
    return this.db.run('DELETE FROM sessions WHERE expires_at < ? OR revoked_at IS NOT NULL AND revoked_at < ?', [now, now - 86_400_000]).changes
  }
}

// ───────────────────────── otps ─────────────────────────
export interface OtpRecord {
  id: string
  phone: string
  codeHash: string
  purpose: string
  createdAt: EpochMs
  expiresAt: EpochMs
  attempts: number
  consumedAt?: EpochMs
}
interface OtpRow {
  id: string
  phone: string
  code_hash: string
  purpose: string
  created_at: number
  expires_at: number
  attempts: number
  consumed_at: number | null
}
const toOtp = (r: OtpRow): OtpRecord =>
  compact({ id: r.id, phone: r.phone, codeHash: r.code_hash, purpose: r.purpose, createdAt: r.created_at, expiresAt: r.expires_at, attempts: r.attempts, consumedAt: nn(r.consumed_at) }) as OtpRecord

export class OtpsRepo {
  constructor(private readonly db: Database) {}
  insert(o: OtpRecord): OtpRecord {
    this.db.run('INSERT INTO otps (id, phone, code_hash, purpose, created_at, expires_at, attempts, consumed_at) VALUES (?,?,?,?,?,?,?,?)', [
      o.id, o.phone, o.codeHash, o.purpose, o.createdAt, o.expiresAt, o.attempts, o.consumedAt,
    ])
    return o
  }
  get(id: string): OtpRecord | undefined {
    const r = this.db.get<OtpRow>('SELECT * FROM otps WHERE id = ?', [id])
    return r && toOtp(r)
  }
  /** Most recent OTP for a phone (any state). */
  latestForPhone(phone: string): OtpRecord | undefined {
    const r = this.db.get<OtpRow>('SELECT * FROM otps WHERE phone = ? ORDER BY created_at DESC, id DESC LIMIT 1', [phone])
    return r && toOtp(r)
  }
  countSince(phone: string, since: EpochMs): number {
    return this.db.scalar<number>('SELECT COUNT(*) FROM otps WHERE phone = ? AND created_at >= ?', [phone, since]) ?? 0
  }
  /** Sum of failed verify attempts on OTPs issued since `since`. */
  attemptsSince(phone: string, since: EpochMs): number {
    return this.db.scalar<number>('SELECT COALESCE(SUM(attempts), 0) FROM otps WHERE phone = ? AND created_at >= ?', [phone, since]) ?? 0
  }
  incrementAttempts(id: string): number {
    this.db.run('UPDATE otps SET attempts = attempts + 1 WHERE id = ?', [id])
    return this.db.scalar<number>('SELECT attempts FROM otps WHERE id = ?', [id]) ?? 0
  }
  /** Marks consumed; returns false if it was already consumed (single-use). */
  consume(id: string, now: EpochMs): boolean {
    return this.db.run('UPDATE otps SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL', [now, id]).changes > 0
  }
  /** Invalidate every open OTP of a phone (a fresh request supersedes older codes). */
  consumeAllOpen(phone: string, now: EpochMs): number {
    return this.db.run('UPDATE otps SET consumed_at = ? WHERE phone = ? AND consumed_at IS NULL', [now, phone]).changes
  }
  deleteBefore(ts: EpochMs): number {
    return this.db.run('DELETE FROM otps WHERE created_at < ?', [ts]).changes
  }
}
