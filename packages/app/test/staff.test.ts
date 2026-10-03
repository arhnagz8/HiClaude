import { AppError, type StaffRole } from '@hiclaude/contracts'
import { describe, expect, it } from 'vitest'
import { createApp, LOGIN_LOCK_MS, MAX_FAILED_LOGINS, PERMISSIONS, ROLE_PERMISSIONS, STAFF_SESSION_TTL_MS, can, rbacMatrixMarkdown, totp } from '../src'
import { makeTestApp } from './helpers'

describe('RBAC matrix', () => {
  it('matches the documented snapshot', () => {
    expect(rbacMatrixMarkdown()).toMatchInlineSnapshot(`
      "| permission | owner | admin | operator | support | accountant | viewer |
      |---|:-:|:-:|:-:|:-:|:-:|:-:|
      | dashboard.view | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
      | orders.view | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
      | orders.manage | ✓ | ✓ | ✓ |  |  |  |
      | orders.refund | ✓ | ✓ |  |  |  |  |
      | tasks.view | ✓ | ✓ | ✓ |  |  |  |
      | tasks.work | ✓ | ✓ | ✓ |  |  |  |
      | payments.view | ✓ | ✓ | ✓ | ✓ | ✓ |  |
      | payments.match | ✓ | ✓ |  |  | ✓ |  |
      | treasury.view | ✓ | ✓ |  |  | ✓ |  |
      | treasury.act | ✓ | ✓ |  |  |  |  |
      | rates.view | ✓ | ✓ | ✓ |  | ✓ | ✓ |
      | rates.killswitch | ✓ | ✓ |  |  |  |  |
      | policy.view | ✓ | ✓ |  |  |  |  |
      | policy.edit | ✓ | ✓ |  |  |  |  |
      | settings.view | ✓ | ✓ |  |  |  |  |
      | settings.edit | ✓ | ✓ |  |  |  |  |
      | catalog.view | ✓ | ✓ | ✓ | ✓ |  | ✓ |
      | catalog.edit | ✓ | ✓ |  |  |  |  |
      | customers.view | ✓ | ✓ | ✓ | ✓ | ✓ |  |
      | customers.manage | ✓ | ✓ |  |  |  |  |
      | tickets.view | ✓ | ✓ | ✓ | ✓ |  |  |
      | tickets.reply | ✓ | ✓ | ✓ | ✓ |  |  |
      | tickets.assign | ✓ | ✓ |  | ✓ |  |  |
      | reports.view | ✓ | ✓ |  |  | ✓ | ✓ |
      | ledger.view | ✓ | ✓ |  |  | ✓ |  |
      | expenses.manage | ✓ |  |  |  | ✓ |  |
      | audit.view | ✓ | ✓ |  |  | ✓ |  |
      | users.view | ✓ | ✓ |  |  |  |  |
      | users.manage | ✓ |  |  |  |  |  |
      | sim.control | ✓ |  |  |  |  |  |"
    `)
  })

  it('invariants: owner has everything, viewer is read-only, only owner manages users', () => {
    for (const p of PERMISSIONS) expect(can('owner', p)).toBe(true)
    for (const p of ROLE_PERMISSIONS.viewer) expect(p.endsWith('.view')).toBe(true)
    const roles = Object.keys(ROLE_PERMISSIONS) as StaffRole[]
    expect(roles.filter((r) => can(r, 'users.manage'))).toEqual(['owner'])
    expect(can('operator', 'treasury.act')).toBe(false)
    expect(can('operator', 'tasks.work')).toBe(true)
  })

  it('require() throws FORBIDDEN for missing permission or inactive users', () => {
    const t = makeTestApp()
    const s = t.app.services.staff
    expect(() => s.require({ role: 'operator', active: true }, 'treasury.act')).toThrowError(AppError)
    expect(() => s.require({ role: 'owner', active: false }, 'orders.view')).toThrowError(/permission/)
    expect(() => s.require({ role: 'owner', active: true }, 'orders.view')).not.toThrow()
  })
})

describe('StaffService — users & sessions', () => {
  it('seeds demo accounts and logs in; the token is stored only as a hash', () => {
    const t = makeTestApp()
    const s = t.app.services.staff
    const sess = s.login('owner', 'owner')
    expect(sess.user.role).toBe('owner')
    expect(sess.expiresAt).toBe(t.clock.now() + STAFF_SESSION_TTL_MS)
    expect(s.authenticate(sess.token).id).toBe(sess.user.id)
    expect(t.app.repos.sessions.getByHash(sess.token)).toBeUndefined()
    expect(() => s.authenticate('nonsense')).toThrowError(AppError)
    expect(() => s.authenticate(undefined)).toThrowError(AppError)
  })

  it('live mode: no demo staff, demo seeding refused, a real master key is mandatory', () => {
    const t = makeTestApp()
    const base = { clock: t.clock, rng: t.rng, params: t.params, dbPath: ':memory:', ports: t.ports }
    expect(() => createApp({ ...base, mode: 'live' })).toThrow(/master key/)
    const live = createApp({ ...base, mode: 'live', masterKeyHex: 'ab'.repeat(32) })
    expect(live.services.staff.listUsers()).toEqual([])
    expect(() => live.services.staff.seedDemoStaff()).toThrowError(/live/)
    live.close()
  })

  it('sessions expire and can be logged out', () => {
    const t = makeTestApp()
    const s = t.app.services.staff
    const a = s.login('admin', 'admin', { ttlMs: 60_000 })
    t.advance(59_000)
    expect(s.authenticate(a.token).role).toBe('admin')
    t.advance(2_000)
    expect(() => s.authenticate(a.token)).toThrowError(/expired/)
    const b = s.login('admin', 'admin')
    s.logout(b.token)
    expect(() => s.authenticate(b.token)).toThrowError(AppError)
    expect(t.app.services.audit.list({ action: 'auth.logout' })).toHaveLength(1)
  })

  it('wrong password / unknown user give the same error; five failures lock the account', () => {
    const t = makeTestApp()
    const s = t.app.services.staff
    const msg = (fn: () => unknown) => {
      try {
        fn()
      } catch (e) {
        return (e as AppError).details?.reason
      }
    }
    expect(msg(() => s.login('ghost', 'x'))).toBe('invalid_credentials')
    for (let i = 0; i < MAX_FAILED_LOGINS; i++) expect(msg(() => s.login('operator', 'bad'))).toBe('invalid_credentials')
    expect(msg(() => s.login('operator', 'operator'))).toBe('locked')
    t.advance(LOGIN_LOCK_MS + 1)
    expect(s.login('operator', 'operator').user.role).toBe('operator')
    expect(t.app.repos.users.getByUsername('operator')?.failedLogins).toBe(0)
  })

  it('TOTP: required when enabled, wrong code rejected, valid code accepted', () => {
    const t = makeTestApp()
    const s = t.app.services.staff
    const owner = s.getByUsername('owner')!
    const { secret } = s.enableTotp(owner.id, 'system')
    expect(() => s.login('owner', 'owner')).toThrowError(/one-time code/)
    expect(() => s.login('owner', 'owner', { totp: '000000' })).toThrowError(AppError)
    expect(s.login('owner', 'owner', { totp: totp(secret, t.clock.now()) }).user.id).toBe(owner.id)
    expect(t.app.repos.users.get(owner.id)?.totpSecretEnc).toMatch(/^hc1\./)
  })

  it('createUser validates, rejects duplicates and audits; setActive revokes sessions', () => {
    const t = makeTestApp()
    const s = t.app.services.staff
    const { user } = s.createUser({ username: 'Sara', name: 'Sara', role: 'support', password: 'pw1234' }, 'staff:owner')
    expect(s.getByUsername('sara')?.id).toBe(user.id)
    expect(() => s.createUser({ username: 'sara', name: 'x', role: 'viewer', password: 'pw1234' })).toThrowError(/exists/)
    expect(() => s.createUser({ username: 'a', name: 'x', role: 'viewer', password: 'pw1234' })).toThrowError(AppError)
    expect(() => s.createUser({ username: 'okname', name: 'x', role: 'viewer', password: 'p' })).toThrowError(/short/)
    const sess = s.login('sara', 'pw1234')
    s.setActive(user.id, false, 'staff:owner')
    expect(() => s.authenticate(sess.token)).toThrowError(AppError)
    expect(() => s.login('sara', 'pw1234')).toThrowError(AppError)
    expect(t.app.services.audit.list({ action: 'user.create' }).length).toBeGreaterThanOrEqual(7)
  })

  it('the last active owner cannot be removed or demoted; password change revokes sessions', () => {
    const t = makeTestApp()
    const s = t.app.services.staff
    const owner = s.getByUsername('owner')!
    expect(() => s.setActive(owner.id, false, 'u')).toThrowError(/last active owner/)
    expect(() => s.setRole(owner.id, 'admin', 'u')).toThrowError(/last active owner/)
    const sess = s.login('owner', 'owner')
    s.changePassword(owner.id, 'brand-new-pw', 'u')
    expect(() => s.authenticate(sess.token)).toThrowError(AppError)
    expect(() => s.login('owner', 'owner')).toThrowError(AppError)
    expect(s.login('owner', 'brand-new-pw').user.id).toBe(owner.id)
  })

  it('audit helper accepts actor shorthands', () => {
    const t = makeTestApp()
    const a = t.app.services.staff.audit('staff:usr_7', 'x.y', 't1', { k: 1 })
    expect(a).toMatchObject({ actorType: 'staff', actorId: 'usr_7', action: 'x.y', target: 't1' })
    expect(t.app.services.staff.audit('system', 'z').actorType).toBe('system')
    expect(t.app.services.staff.audit('usr_8', 'z').actorId).toBe('usr_8')
  })
})
