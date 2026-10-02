/**
 * StaffService — users, passwords (scrypt) + optional TOTP, sessions, RBAC, audit.
 *
 * Login flow: `login(username, password, {totp?})` → `{ token, user, expiresAt }`; the token is a random bearer value, only its SHA-256 is stored.
 * Brute force: 5 consecutive failures lock the account for 15 minutes (clock-based). Responses never reveal which part was wrong.
 */
import { AppError, type StaffRole, type StaffUser } from '@hiclaude/contracts'
import type { AppContext } from '../context'
import { SCRYPT_FAST, SCRYPT_PROD, decryptSecret, encryptSecret, generateTotpSecret, hashPassword, randomBytesFor, randomToken, sha256Hex, totpUri, verifyPassword, verifyTotp } from '../crypto'
import type { AuditRecord, SessionRecord, UserRecord } from '../repos'
import { toActor, type ActorLike } from '../util'
import type { AuditService } from './audit'
import { PERMISSIONS, can as canRole, permissionsOf, type Permission } from './rbac'

export const STAFF_SESSION_TTL_MS = 12 * 3_600_000
export const MAX_FAILED_LOGINS = 5
export const LOGIN_LOCK_MS = 15 * 60_000

export type StaffCtx = Pick<AppContext, 'clock' | 'rng' | 'ids' | 'repos' | 'db' | 'mode' | 'masterKeyHex' | 'logger'>

export interface CreateUserInput {
  username: string
  name: string
  role: StaffRole
  password: string
  /** Enable TOTP right away (returns the secret once via `totpSecret`). */
  enableTotp?: boolean
}

export interface StaffSession {
  token: string
  user: StaffUser
  expiresAt: number
}

const toStaffUser = (u: UserRecord): StaffUser => ({ id: u.id, name: u.name, role: u.role, active: u.active, createdAt: u.createdAt })

export class StaffService {
  constructor(private readonly ctx: StaffCtx, private readonly auditSvc: AuditService) {}

  private get cost() {
    return this.ctx.mode === 'live' ? SCRYPT_PROD : SCRYPT_FAST
  }

  // ───────────────────────── RBAC ─────────────────────────
  can(role: StaffRole, permission: Permission): boolean {
    return canRole(role, permission)
  }
  permissionsOf(role: StaffRole): readonly Permission[] {
    return permissionsOf(role)
  }
  /** Throws FORBIDDEN unless the user's role grants `permission`. */
  require(user: Pick<StaffUser, 'role' | 'active'>, permission: Permission): void {
    if (!user.active || !canRole(user.role, permission)) throw new AppError('FORBIDDEN', `missing permission ${permission}`, { permission })
  }
  get permissions(): readonly Permission[] {
    return PERMISSIONS
  }

  // ───────────────────────── users ─────────────────────────
  createUser(input: CreateUserInput, actor?: ActorLike): { user: StaffUser; totpSecret?: string } {
    const username = input.username.trim().toLowerCase()
    if (!/^[a-z0-9_.-]{3,32}$/.test(username)) throw new AppError('VALIDATION', 'username must be 3–32 chars of a-z 0-9 _ . -')
    if (input.password.length < (this.ctx.mode === 'live' ? 10 : 4)) throw new AppError('VALIDATION', 'password too short')
    if (this.ctx.repos.users.getByUsername(username)) throw new AppError('CONFLICT', 'username already exists')
    let totpSecret: string | undefined
    let totpEnc: string | undefined
    if (input.enableTotp) {
      totpSecret = generateTotpSecret((n) => randomBytesFor(this.ctx.rng, this.ctx.mode, n))
      totpEnc = encryptSecret(totpSecret, this.ctx.masterKeyHex, 'totp')
    }
    const rec = this.ctx.repos.users.insert({
      id: this.ctx.ids.next('usr'),
      username,
      name: input.name,
      role: input.role,
      passwordHash: hashPassword(input.password, { cost: this.cost, salt: randomBytesFor(this.ctx.rng, this.ctx.mode, 16) }),
      totpSecretEnc: totpEnc,
      active: true,
      failedLogins: 0,
      createdAt: this.ctx.clock.now(),
    })
    this.audit(actor ?? 'system', 'user.create', rec.id, { username, role: rec.role, totp: !!totpEnc })
    return { user: toStaffUser(rec), totpSecret }
  }

  /** Demo/sim/test accounts: owner/owner, admin/admin, operator/operator, support/support, accountant/accountant, viewer/viewer. Idempotent. */
  seedDemoStaff(): StaffUser[] {
    if (this.ctx.mode === 'live') throw new AppError('FORBIDDEN', 'demo staff must never be seeded in live mode')
    if (this.ctx.repos.users.count() > 0) return this.listUsers()
    const roles: StaffRole[] = ['owner', 'admin', 'operator', 'support', 'accountant', 'viewer']
    for (const r of roles) this.createUser({ username: r, name: `${r} (demo)`, role: r, password: r }, 'system')
    return this.listUsers()
  }

  getUser(id: string): StaffUser | undefined {
    const u = this.ctx.repos.users.get(id)
    return u && toStaffUser(u)
  }
  getByUsername(username: string): StaffUser | undefined {
    const u = this.ctx.repos.users.getByUsername(username.trim().toLowerCase())
    return u && toStaffUser(u)
  }
  listUsers(): StaffUser[] {
    return this.ctx.repos.users.list().map(toStaffUser)
  }

  setActive(userId: string, active: boolean, actor: ActorLike): StaffUser {
    const u = this.mustUser(userId)
    this.guardLastOwner(u, { active })
    const rec = this.ctx.repos.users.update(userId, { active })
    if (!active) this.ctx.repos.sessions.revokeAllForSubject('staff', userId, this.ctx.clock.now())
    this.audit(actor, active ? 'user.activate' : 'user.deactivate', userId)
    return toStaffUser(rec)
  }

  setRole(userId: string, role: StaffRole, actor: ActorLike): StaffUser {
    const u = this.mustUser(userId)
    this.guardLastOwner(u, { role })
    const rec = this.ctx.repos.users.update(userId, { role })
    this.audit(actor, 'user.role', userId, { from: u.role, to: role })
    return toStaffUser(rec)
  }

  changePassword(userId: string, newPassword: string, actor: ActorLike): void {
    if (newPassword.length < (this.ctx.mode === 'live' ? 10 : 4)) throw new AppError('VALIDATION', 'password too short')
    this.mustUser(userId)
    this.ctx.repos.users.update(userId, {
      passwordHash: hashPassword(newPassword, { cost: this.cost, salt: randomBytesFor(this.ctx.rng, this.ctx.mode, 16) }),
      failedLogins: 0,
      lockedUntil: undefined,
    })
    this.ctx.repos.sessions.revokeAllForSubject('staff', userId, this.ctx.clock.now())
    this.audit(actor, 'user.password', userId)
  }

  /** Enable (or rotate) TOTP for a user. The secret is returned ONCE and stored encrypted. */
  enableTotp(userId: string, actor: ActorLike): { secret: string; uri: string } {
    const u = this.mustUser(userId)
    const secret = generateTotpSecret((n) => randomBytesFor(this.ctx.rng, this.ctx.mode, n))
    this.ctx.repos.users.update(userId, { totpSecretEnc: encryptSecret(secret, this.ctx.masterKeyHex, 'totp') })
    this.audit(actor, 'user.totp.enable', userId)
    return { secret, uri: totpUri(secret, u.username, 'HiClaude') }
  }

  // ───────────────────────── login / sessions ─────────────────────────
  login(username: string, password: string, opts: { totp?: string; ttlMs?: number } = {}): StaffSession {
    const now = this.ctx.clock.now()
    const fail = (): never => {
      throw new AppError('UNAUTHENTICATED', 'invalid credentials', { reason: 'invalid_credentials' })
    }
    const u = this.ctx.repos.users.getByUsername(username.trim().toLowerCase())
    if (!u) {
      // keep timing roughly uniform
      verifyPassword(password, hashPassword('x', { cost: this.cost, salt: new Uint8Array(16) }))
      return fail()
    }
    if (u.lockedUntil !== undefined && u.lockedUntil > now) throw new AppError('RATE_LIMITED', 'account temporarily locked', { reason: 'locked', retryAfterMs: u.lockedUntil - now })
    if (!u.active) return fail()

    let ok = verifyPassword(password, u.passwordHash)
    if (ok && u.totpSecretEnc) {
      const secret = decryptSecret(u.totpSecretEnc, this.ctx.masterKeyHex, 'totp')
      ok = !!opts.totp && verifyTotp(secret, opts.totp, now)
      if (!ok && !opts.totp) throw new AppError('UNAUTHENTICATED', 'one-time code required', { reason: 'totp_required' })
    }
    if (!ok) {
      const failed = u.failedLogins + 1
      this.ctx.repos.users.update(u.id, { failedLogins: failed, lockedUntil: failed >= MAX_FAILED_LOGINS ? now + LOGIN_LOCK_MS : undefined })
      this.audit({ type: 'staff', id: u.id }, failed >= MAX_FAILED_LOGINS ? 'auth.locked' : 'auth.failed', u.id)
      return fail()
    }
    this.ctx.repos.users.update(u.id, { failedLogins: 0, lockedUntil: undefined, lastLoginAt: now })
    const token = randomToken(this.ctx.rng, this.ctx.mode, 32)
    const expiresAt = now + (opts.ttlMs ?? STAFF_SESSION_TTL_MS)
    const rec: SessionRecord = { tokenHash: sha256Hex(token), subjectKind: 'staff', subjectId: u.id, createdAt: now, expiresAt, lastSeenAt: now, meta: {} }
    this.ctx.repos.sessions.insert(rec)
    this.audit({ type: 'staff', id: u.id }, 'auth.login', u.id)
    return { token, user: toStaffUser(u), expiresAt }
  }

  /** Resolve a bearer token to its user. Throws UNAUTHENTICATED when unknown/expired/revoked or the user is inactive. */
  authenticate(token: string | undefined): StaffUser {
    if (!token) throw new AppError('UNAUTHENTICATED', 'missing session')
    const now = this.ctx.clock.now()
    const s = this.ctx.repos.sessions.getByHash(sha256Hex(token))
    if (!s || s.subjectKind !== 'staff' || s.revokedAt !== undefined || s.expiresAt <= now) throw new AppError('UNAUTHENTICATED', 'session invalid or expired')
    const u = this.ctx.repos.users.get(s.subjectId)
    if (!u || !u.active) throw new AppError('UNAUTHENTICATED', 'user inactive')
    this.ctx.repos.sessions.touch(s.tokenHash, now)
    return toStaffUser(u)
  }

  logout(token: string): void {
    const hash = sha256Hex(token)
    const s = this.ctx.repos.sessions.getByHash(hash)
    if (s && this.ctx.repos.sessions.revoke(hash, this.ctx.clock.now())) this.audit({ type: 'staff', id: s.subjectId }, 'auth.logout', s.subjectId)
  }

  // ───────────────────────── audit ─────────────────────────
  /** Writes an audit-log row. Never include secrets in `data`. */
  audit(actor: ActorLike, action: string, target?: string, data?: Record<string, unknown>): AuditRecord {
    return this.auditSvc.record(toActor(actor), action, target, data)
  }

  // ───────────────────────── helpers ─────────────────────────
  private mustUser(id: string): UserRecord {
    const u = this.ctx.repos.users.get(id)
    if (!u) throw new AppError('NOT_FOUND', `user ${id} not found`)
    return u
  }
  /** The platform must always keep at least one active owner. */
  private guardLastOwner(u: UserRecord, change: { active?: boolean; role?: StaffRole }): void {
    if (u.role !== 'owner' || !u.active) return
    const demoting = (change.active === false) || (change.role !== undefined && change.role !== 'owner')
    if (!demoting) return
    const others = this.ctx.repos.users.list({ role: 'owner', activeOnly: true }).filter((o) => o.id !== u.id)
    if (others.length === 0) throw new AppError('CONFLICT', 'cannot remove the last active owner')
  }
}
