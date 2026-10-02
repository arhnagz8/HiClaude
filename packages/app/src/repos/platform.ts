/** Settings, staff users, audit log, notifications, tickets, KPIs, job state, kill switches, alerts. */
import { AppError, type EpochMs, type KpiRow, type StaffRole } from '@hiclaude/contracts'
import { z } from 'zod'
import type { Database } from '../db'
import { compact, fromJson, fromJsonOpt, nn, toJsonOpt } from './json'
import { UnknownRecordSchema } from './schemas'

// ───────────────────────── settings ─────────────────────────
export interface SettingRecord<T = unknown> {
  key: string
  value: T
  version: number
  updatedAt: EpochMs
  updatedBy?: string
}
export interface SettingAuditRecord {
  id: number
  key: string
  oldValue?: unknown
  newValue?: unknown
  version: number
  at: EpochMs
  actor?: string
  reason?: string
}

export class SettingsRepo {
  constructor(private readonly db: Database) {}

  get<T = unknown>(key: string): SettingRecord<T> | undefined {
    const r = this.db.get<{ key: string; value_json: string; version: number; updated_at: number; updated_by: string | null }>('SELECT * FROM settings WHERE key = ?', [key])
    return r && (compact({ key: r.key, value: JSON.parse(r.value_json) as T, version: r.version, updatedAt: r.updated_at, updatedBy: nn(r.updated_by) }) as SettingRecord<T>)
  }

  list(prefix?: string): SettingRecord[] {
    const rows = prefix
      ? this.db.all<{ key: string; value_json: string; version: number; updated_at: number; updated_by: string | null }>(`SELECT * FROM settings WHERE key = ? OR key LIKE ? ORDER BY key`, [prefix, `${prefix}.%`])
      : this.db.all<{ key: string; value_json: string; version: number; updated_at: number; updated_by: string | null }>('SELECT * FROM settings ORDER BY key')
    return rows.map((r) => compact({ key: r.key, value: JSON.parse(r.value_json) as unknown, version: r.version, updatedAt: r.updated_at, updatedBy: nn(r.updated_by) }) as SettingRecord)
  }

  /**
   * Upsert with version bump and audit row, atomically. With `expectedVersion` the write is rejected (CONFLICT) if the stored version differs
   * (0 = must not exist yet). Returns the stored record.
   */
  put<T>(key: string, value: T, meta: { now: EpochMs; actor?: string; reason?: string; expectedVersion?: number }): SettingRecord<T> {
    return this.db.tx(() => {
      const prev = this.get(key)
      if (meta.expectedVersion !== undefined && (prev?.version ?? 0) !== meta.expectedVersion) {
        throw new AppError('CONFLICT', `setting ${key} was modified concurrently`, { expectedVersion: meta.expectedVersion, actualVersion: prev?.version ?? 0 })
      }
      const version = (prev?.version ?? 0) + 1
      const json = JSON.stringify(value)
      if (json === undefined) throw new AppError('VALIDATION', `setting ${key}: value is not JSON-serialisable`)
      this.db.run(
        `INSERT INTO settings (key, value_json, version, updated_at, updated_by) VALUES (?,?,?,?,?)
         ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, version = excluded.version, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
        [key, json, version, meta.now, meta.actor],
      )
      this.db.run('INSERT INTO settings_audit (key, old_json, new_json, version, at, actor, reason) VALUES (?,?,?,?,?,?,?)', [
        key, prev === undefined ? null : JSON.stringify(prev.value), json, version, meta.now, meta.actor, meta.reason,
      ])
      return this.get<T>(key) as SettingRecord<T>
    })
  }

  delete(key: string, meta: { now: EpochMs; actor?: string; reason?: string }): boolean {
    return this.db.tx(() => {
      const prev = this.get(key)
      if (!prev) return false
      this.db.run('DELETE FROM settings WHERE key = ?', [key])
      this.db.run('INSERT INTO settings_audit (key, old_json, new_json, version, at, actor, reason) VALUES (?,?,?,?,?,?,?)', [
        key, JSON.stringify(prev.value), null, prev.version + 1, meta.now, meta.actor, meta.reason,
      ])
      return true
    })
  }

  listAudit(f: { key?: string; keyPrefix?: string; limit?: number } = {}): SettingAuditRecord[] {
    const w: string[] = []
    const params: unknown[] = []
    if (f.key) (w.push('key = ?'), params.push(f.key))
    if (f.keyPrefix) (w.push('(key = ? OR key LIKE ?)'), params.push(f.keyPrefix, `${f.keyPrefix}.%`))
    return this.db
      .all<{ id: number; key: string; old_json: string | null; new_json: string | null; version: number; at: number; actor: string | null; reason: string | null }>(
        `SELECT * FROM settings_audit ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY id DESC LIMIT ?`,
        [...params, f.limit ?? 100],
      )
      .map(
        (r) =>
          compact({
            id: r.id,
            key: r.key,
            oldValue: r.old_json === null ? undefined : (JSON.parse(r.old_json) as unknown),
            newValue: r.new_json === null ? undefined : (JSON.parse(r.new_json) as unknown),
            version: r.version,
            at: r.at,
            actor: nn(r.actor),
            reason: nn(r.reason),
          }) as SettingAuditRecord,
      )
  }
}

// ───────────────────────── users (staff) ─────────────────────────
export interface UserRecord {
  id: string
  username: string
  name: string
  role: StaffRole
  passwordHash: string
  totpSecretEnc?: string
  active: boolean
  failedLogins: number
  lockedUntil?: EpochMs
  createdAt: EpochMs
  lastLoginAt?: EpochMs
}
interface UserRow {
  id: string
  username: string
  name: string
  role: StaffRole
  password_hash: string
  totp_secret_enc: string | null
  active: number
  failed_logins: number
  locked_until: number | null
  created_at: number
  last_login_at: number | null
}
const toUser = (r: UserRow): UserRecord =>
  compact({
    id: r.id,
    username: r.username,
    name: r.name,
    role: r.role,
    passwordHash: r.password_hash,
    totpSecretEnc: nn(r.totp_secret_enc),
    active: r.active === 1,
    failedLogins: r.failed_logins,
    lockedUntil: nn(r.locked_until),
    createdAt: r.created_at,
    lastLoginAt: nn(r.last_login_at),
  }) as UserRecord

export class UsersRepo {
  constructor(private readonly db: Database) {}
  insert(u: UserRecord): UserRecord {
    this.db.run(
      'INSERT INTO users (id, username, name, role, password_hash, totp_secret_enc, active, failed_logins, locked_until, created_at, last_login_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      [u.id, u.username, u.name, u.role, u.passwordHash, u.totpSecretEnc, u.active ? 1 : 0, u.failedLogins, u.lockedUntil, u.createdAt, u.lastLoginAt],
    )
    return this.get(u.id) as UserRecord
  }
  get(id: string): UserRecord | undefined {
    const r = this.db.get<UserRow>('SELECT * FROM users WHERE id = ?', [id])
    return r && toUser(r)
  }
  getByUsername(username: string): UserRecord | undefined {
    const r = this.db.get<UserRow>('SELECT * FROM users WHERE username = ?', [username])
    return r && toUser(r)
  }
  update(id: string, patch: Partial<Omit<UserRecord, 'id' | 'createdAt'>>): UserRecord {
    const map: Record<string, string> = {
      username: 'username', name: 'name', role: 'role', passwordHash: 'password_hash', totpSecretEnc: 'totp_secret_enc', active: 'active',
      failedLogins: 'failed_logins', lockedUntil: 'locked_until', lastLoginAt: 'last_login_at',
    }
    const sets: string[] = []
    const params: unknown[] = []
    for (const [k, v] of Object.entries(patch)) {
      if (!map[k]) throw new Error(`UsersRepo.update: unknown field ${k}`)
      sets.push(`${map[k]} = ?`)
      params.push(k === 'active' ? (v ? 1 : 0) : v)
    }
    if (sets.length) {
      if (this.db.run(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, [...params, id]).changes === 0) throw new AppError('NOT_FOUND', `user ${id} not found`)
    }
    return this.get(id) as UserRecord
  }
  list(f: { role?: StaffRole; activeOnly?: boolean } = {}): UserRecord[] {
    const w: string[] = []
    const params: unknown[] = []
    if (f.role) (w.push('role = ?'), params.push(f.role))
    if (f.activeOnly) w.push('active = 1')
    return this.db.all<UserRow>(`SELECT * FROM users ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY created_at, id`, params).map(toUser)
  }
  count(): number {
    return this.db.scalar<number>('SELECT COUNT(*) FROM users') ?? 0
  }
}

// ───────────────────────── audit log ─────────────────────────
export interface AuditRecord {
  id: number
  at: EpochMs
  actorType: 'system' | 'customer' | 'staff' | 'sim'
  actorId?: string
  action: string
  target?: string
  data?: Record<string, unknown>
}
export interface AuditFilter {
  actorId?: string
  actorType?: AuditRecord['actorType']
  action?: string
  /** action prefix, e.g. 'settings.' */
  actionPrefix?: string
  target?: string
  from?: EpochMs
  to?: EpochMs
  limit?: number
  offset?: number
}

export class AuditRepo {
  constructor(private readonly db: Database) {}
  append(e: Omit<AuditRecord, 'id'>): AuditRecord {
    const r = this.db.run('INSERT INTO audit_log (at, actor_type, actor_id, action, target, data_json) VALUES (?,?,?,?,?,?)', [
      e.at, e.actorType, e.actorId, e.action, e.target, toJsonOpt(UnknownRecordSchema, e.data, 'audit data'),
    ])
    return { ...e, id: r.lastInsertRowid }
  }
  list(f: AuditFilter = {}): AuditRecord[] {
    const w: string[] = []
    const params: unknown[] = []
    if (f.actorId) (w.push('actor_id = ?'), params.push(f.actorId))
    if (f.actorType) (w.push('actor_type = ?'), params.push(f.actorType))
    if (f.action) (w.push('action = ?'), params.push(f.action))
    if (f.actionPrefix) (w.push('action LIKE ?'), params.push(`${f.actionPrefix}%`))
    if (f.target) (w.push('target = ?'), params.push(f.target))
    if (f.from !== undefined) (w.push('at >= ?'), params.push(f.from))
    if (f.to !== undefined) (w.push('at < ?'), params.push(f.to))
    return this.db
      .all<{ id: number; at: number; actor_type: AuditRecord['actorType']; actor_id: string | null; action: string; target: string | null; data_json: string | null }>(
        `SELECT * FROM audit_log ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY id DESC LIMIT ? OFFSET ?`,
        [...params, f.limit ?? 100, f.offset ?? 0],
      )
      .map(
        (r) =>
          compact({
            id: r.id,
            at: r.at,
            actorType: r.actor_type,
            actorId: nn(r.actor_id),
            action: r.action,
            target: nn(r.target),
            data: fromJsonOpt(UnknownRecordSchema, r.data_json, 'audit_log.data_json'),
          }) as AuditRecord,
      )
  }
  count(f: Pick<AuditFilter, 'action' | 'actorId'> = {}): number {
    const w: string[] = []
    const params: unknown[] = []
    if (f.actorId) (w.push('actor_id = ?'), params.push(f.actorId))
    if (f.action) (w.push('action = ?'), params.push(f.action))
    return this.db.scalar<number>(`SELECT COUNT(*) FROM audit_log ${w.length ? 'WHERE ' + w.join(' AND ') : ''}`, params) ?? 0
  }
}

// ───────────────────────── notifications ─────────────────────────
export type NotificationChannel = 'telegram' | 'bale' | 'sms' | 'in_app'
export type NotificationStatus = 'pending' | 'sent' | 'delivered' | 'retry' | 'failed' | 'read'
export interface NotificationRecord {
  id: string
  groupId: string
  customerId?: string
  event: string
  channel: NotificationChannel
  /** chat id (messengers) or phone (sms); undefined for in_app */
  target?: string
  status: NotificationStatus
  critical: boolean
  text: string
  data?: Record<string, unknown>
  dedupeKey?: string
  attempts: number
  nextAttemptAt?: EpochMs
  lastError?: string
  createdAt: EpochMs
  sentAt?: EpochMs
  readAt?: EpochMs
}
interface NotificationRow {
  id: string
  group_id: string
  customer_id: string | null
  event: string
  channel: NotificationChannel
  target: string | null
  status: NotificationStatus
  critical: number
  text: string
  data_json: string | null
  dedupe_key: string | null
  attempts: number
  next_attempt_at: number | null
  last_error: string | null
  created_at: number
  sent_at: number | null
  read_at: number | null
}
const toNotification = (r: NotificationRow): NotificationRecord =>
  compact({
    id: r.id,
    groupId: r.group_id,
    customerId: nn(r.customer_id),
    event: r.event,
    channel: r.channel,
    target: nn(r.target),
    status: r.status,
    critical: r.critical === 1,
    text: r.text,
    data: fromJsonOpt(UnknownRecordSchema, r.data_json, 'notifications.data_json'),
    dedupeKey: nn(r.dedupe_key),
    attempts: r.attempts,
    nextAttemptAt: nn(r.next_attempt_at),
    lastError: nn(r.last_error),
    createdAt: r.created_at,
    sentAt: nn(r.sent_at),
    readAt: nn(r.read_at),
  }) as NotificationRecord

export class NotificationsRepo {
  constructor(private readonly db: Database) {}
  insert(n: NotificationRecord): NotificationRecord {
    this.db.run(
      `INSERT INTO notifications (id, group_id, customer_id, event, channel, target, status, critical, text, data_json, dedupe_key, attempts, next_attempt_at,
         last_error, created_at, sent_at, read_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [n.id, n.groupId, n.customerId, n.event, n.channel, n.target, n.status, n.critical ? 1 : 0, n.text, toJsonOpt(UnknownRecordSchema, n.data, 'notification data'),
        n.dedupeKey, n.attempts, n.nextAttemptAt, n.lastError, n.createdAt, n.sentAt, n.readAt],
    )
    return this.get(n.id) as NotificationRecord
  }
  get(id: string): NotificationRecord | undefined {
    const r = this.db.get<NotificationRow>('SELECT * FROM notifications WHERE id = ?', [id])
    return r && toNotification(r)
  }
  getByDedupe(dedupeKey: string, channel: NotificationChannel): NotificationRecord | undefined {
    const r = this.db.get<NotificationRow>('SELECT * FROM notifications WHERE dedupe_key = ? AND channel = ?', [dedupeKey, channel])
    return r && toNotification(r)
  }
  update(id: string, patch: Partial<Pick<NotificationRecord, 'status' | 'attempts' | 'nextAttemptAt' | 'lastError' | 'sentAt' | 'readAt' | 'target'>>): NotificationRecord {
    const map: Record<string, string> = { status: 'status', attempts: 'attempts', nextAttemptAt: 'next_attempt_at', lastError: 'last_error', sentAt: 'sent_at', readAt: 'read_at', target: 'target' }
    const sets: string[] = []
    const params: unknown[] = []
    for (const [k, v] of Object.entries(patch)) {
      if (!map[k]) throw new Error(`NotificationsRepo.update: unknown field ${k}`)
      sets.push(`${map[k]} = ?`)
      params.push(v)
    }
    if (sets.length) this.db.run(`UPDATE notifications SET ${sets.join(', ')} WHERE id = ?`, [...params, id])
    const n = this.get(id)
    if (!n) throw new AppError('NOT_FOUND', `notification ${id} not found`)
    return n
  }
  /** Rows waiting for a first send attempt, oldest first. */
  listPending(limit = 200): NotificationRecord[] {
    return this.db.all<NotificationRow>(`SELECT * FROM notifications WHERE status = 'pending' ORDER BY created_at, id LIMIT ?`, [limit]).map(toNotification)
  }
  /** Rows scheduled for retry whose time has come. */
  listRetryDue(now: EpochMs, limit = 200): NotificationRecord[] {
    return this.db
      .all<NotificationRow>(`SELECT * FROM notifications WHERE status = 'retry' AND next_attempt_at <= ? ORDER BY next_attempt_at, id LIMIT ?`, [now, limit])
      .map(toNotification)
  }
  listByGroup(groupId: string): NotificationRecord[] {
    return this.db.all<NotificationRow>('SELECT * FROM notifications WHERE group_id = ? ORDER BY created_at, id', [groupId]).map(toNotification)
  }
  listForCustomer(customerId: string, opts: { channel?: NotificationChannel; unreadOnly?: boolean; limit?: number } = {}): NotificationRecord[] {
    const w = ['customer_id = ?']
    const params: unknown[] = [customerId]
    if (opts.channel) (w.push('channel = ?'), params.push(opts.channel))
    if (opts.unreadOnly) w.push("channel = 'in_app' AND status <> 'read'")
    return this.db.all<NotificationRow>(`SELECT * FROM notifications WHERE ${w.join(' AND ')} ORDER BY created_at DESC, id DESC LIMIT ?`, [...params, opts.limit ?? 50]).map(toNotification)
  }
  markRead(customerId: string, ids: string[] | 'all', now: EpochMs): number {
    if (ids === 'all') return this.db.run(`UPDATE notifications SET status = 'read', read_at = ? WHERE customer_id = ? AND channel = 'in_app' AND status <> 'read'`, [now, customerId]).changes
    if (ids.length === 0) return 0
    return this.db.run(
      `UPDATE notifications SET status = 'read', read_at = ? WHERE customer_id = ? AND channel = 'in_app' AND status <> 'read' AND id IN (${ids.map(() => '?').join(',')})`,
      [now, customerId, ...ids],
    ).changes
  }
  countByStatus(): Record<string, number> {
    const out: Record<string, number> = {}
    for (const r of this.db.all<{ status: string; n: number }>('SELECT status, COUNT(*) AS n FROM notifications GROUP BY status')) out[r.status] = r.n
    return out
  }
}

// ───────────────────────── tickets ─────────────────────────
export interface TicketRecord {
  id: string
  customerId: string
  orderId?: string
  subject: string
  status: 'open' | 'pending' | 'closed'
  assignedTo?: string
  createdAt: EpochMs
  updatedAt: EpochMs
}
export interface TicketMessageRecord {
  id: string
  ticketId: string
  at: EpochMs
  fromKind: 'customer' | 'staff'
  authorId?: string
  text: string
}
interface TicketRow {
  id: string
  customer_id: string
  order_id: string | null
  subject: string
  status: TicketRecord['status']
  assigned_to: string | null
  created_at: number
  updated_at: number
}
const toTicket = (r: TicketRow): TicketRecord =>
  compact({ id: r.id, customerId: r.customer_id, orderId: nn(r.order_id), subject: r.subject, status: r.status, assignedTo: nn(r.assigned_to), createdAt: r.created_at, updatedAt: r.updated_at }) as TicketRecord

export class TicketsRepo {
  constructor(private readonly db: Database) {}
  insert(t: TicketRecord): TicketRecord {
    this.db.run('INSERT INTO tickets (id, customer_id, order_id, subject, status, assigned_to, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)', [
      t.id, t.customerId, t.orderId, t.subject, t.status, t.assignedTo, t.createdAt, t.updatedAt,
    ])
    return this.get(t.id) as TicketRecord
  }
  get(id: string): TicketRecord | undefined {
    const r = this.db.get<TicketRow>('SELECT * FROM tickets WHERE id = ?', [id])
    return r && toTicket(r)
  }
  update(id: string, patch: Partial<Pick<TicketRecord, 'status' | 'assignedTo' | 'updatedAt'>>): TicketRecord {
    const map: Record<string, string> = { status: 'status', assignedTo: 'assigned_to', updatedAt: 'updated_at' }
    const sets: string[] = []
    const params: unknown[] = []
    for (const [k, v] of Object.entries(patch)) (sets.push(`${map[k]} = ?`), params.push(v))
    if (sets.length) this.db.run(`UPDATE tickets SET ${sets.join(', ')} WHERE id = ?`, [...params, id])
    const t = this.get(id)
    if (!t) throw new AppError('NOT_FOUND', `ticket ${id} not found`)
    return t
  }
  listByCustomer(customerId: string, limit = 50): TicketRecord[] {
    return this.db.all<TicketRow>('SELECT * FROM tickets WHERE customer_id = ? ORDER BY updated_at DESC, id DESC LIMIT ?', [customerId, limit]).map(toTicket)
  }
  list(f: { status?: TicketRecord['status']; assignedTo?: string; limit?: number; offset?: number } = {}): TicketRecord[] {
    const w: string[] = []
    const params: unknown[] = []
    if (f.status) (w.push('status = ?'), params.push(f.status))
    if (f.assignedTo) (w.push('assigned_to = ?'), params.push(f.assignedTo))
    return this.db.all<TicketRow>(`SELECT * FROM tickets ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY updated_at DESC, id DESC LIMIT ? OFFSET ?`, [...params, f.limit ?? 50, f.offset ?? 0]).map(toTicket)
  }
  addMessage(m: TicketMessageRecord): TicketMessageRecord {
    this.db.run('INSERT INTO ticket_messages (id, ticket_id, at, from_kind, author_id, text) VALUES (?,?,?,?,?,?)', [m.id, m.ticketId, m.at, m.fromKind, m.authorId, m.text])
    return m
  }
  listMessages(ticketId: string): TicketMessageRecord[] {
    return this.db
      .all<{ id: string; ticket_id: string; at: number; from_kind: 'customer' | 'staff'; author_id: string | null; text: string }>('SELECT * FROM ticket_messages WHERE ticket_id = ? ORDER BY at, rowid', [ticketId])
      .map((r) => compact({ id: r.id, ticketId: r.ticket_id, at: r.at, fromKind: r.from_kind, authorId: nn(r.author_id), text: r.text }) as TicketMessageRecord)
  }
  countByStatus(): Record<string, number> {
    const out: Record<string, number> = {}
    for (const r of this.db.all<{ status: string; n: number }>('SELECT status, COUNT(*) AS n FROM tickets GROUP BY status')) out[r.status] = r.n
    return out
  }
}

// ───────────────────────── kpi_daily ─────────────────────────
const KpiRowSchema = z.object({ date: z.string() }).passthrough()

export class KpiRepo {
  constructor(private readonly db: Database) {}
  /** Insert or replace the KPI row of an IRST date. */
  upsert(row: KpiRow, now: EpochMs): KpiRow {
    this.db.run('INSERT INTO kpi_daily (date, data_json, updated_at) VALUES (?,?,?) ON CONFLICT(date) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at', [
      row.date, JSON.stringify(row), now,
    ])
    return row
  }
  get(date: string): KpiRow | undefined {
    const r = this.db.get<{ data_json: string }>('SELECT data_json FROM kpi_daily WHERE date = ?', [date])
    return r && (fromJson(KpiRowSchema, r.data_json, 'kpi_daily.data_json') as unknown as KpiRow)
  }
  /** Inclusive ISO date range, ascending. */
  range(fromDate: string, toDate: string): KpiRow[] {
    return this.db
      .all<{ data_json: string }>('SELECT data_json FROM kpi_daily WHERE date >= ? AND date <= ? ORDER BY date', [fromDate, toDate])
      .map((r) => fromJson(KpiRowSchema, r.data_json, 'kpi_daily.data_json') as unknown as KpiRow)
  }
  latest(limit = 30): KpiRow[] {
    return this.db
      .all<{ data_json: string }>('SELECT data_json FROM (SELECT * FROM kpi_daily ORDER BY date DESC LIMIT ?) ORDER BY date', [limit])
      .map((r) => fromJson(KpiRowSchema, r.data_json, 'kpi_daily.data_json') as unknown as KpiRow)
  }
}

// ───────────────────────── jobs_state ─────────────────────────
export interface JobStateRecord {
  name: string
  registeredAt?: EpochMs
  lastRunAt?: EpochMs
  lastOkAt?: EpochMs
  lastSlot?: number
  lastError?: string
  runs: number
  failures: number
}
export class JobsStateRepo {
  constructor(private readonly db: Database) {}
  get(name: string): JobStateRecord | undefined {
    const r = this.db.get<{ name: string; registered_at: number | null; last_run_at: number | null; last_ok_at: number | null; last_slot: number | null; last_error: string | null; runs: number; failures: number }>(
      'SELECT * FROM jobs_state WHERE name = ?',
      [name],
    )
    return (
      r &&
      (compact({
        name: r.name,
        registeredAt: nn(r.registered_at),
        lastRunAt: nn(r.last_run_at),
        lastOkAt: nn(r.last_ok_at),
        lastSlot: nn(r.last_slot),
        lastError: nn(r.last_error),
        runs: r.runs,
        failures: r.failures,
      }) as JobStateRecord)
    )
  }
  upsert(s: JobStateRecord): JobStateRecord {
    this.db.run(
      `INSERT INTO jobs_state (name, registered_at, last_run_at, last_ok_at, last_slot, last_error, runs, failures) VALUES (?,?,?,?,?,?,?,?)
       ON CONFLICT(name) DO UPDATE SET registered_at = excluded.registered_at, last_run_at = excluded.last_run_at, last_ok_at = excluded.last_ok_at,
         last_slot = excluded.last_slot, last_error = excluded.last_error, runs = excluded.runs, failures = excluded.failures`,
      [s.name, s.registeredAt, s.lastRunAt, s.lastOkAt, s.lastSlot, s.lastError, s.runs, s.failures],
    )
    return this.get(s.name) as JobStateRecord
  }
  list(): JobStateRecord[] {
    return this.db.all<{ name: string }>('SELECT name FROM jobs_state ORDER BY name').map((r) => this.get(r.name) as JobStateRecord)
  }
}

// ───────────────────────── kill switches ─────────────────────────
export type KillScope = 'all' | 'rates' | 'provider' | 'product'
export interface KillSwitchRecord {
  key: string
  scope: KillScope
  scopeId?: string
  active: boolean
  reason?: string
  setBy?: string
  setAt: EpochMs
  clearedAt?: EpochMs
}
export const killSwitchKey = (scope: KillScope, scopeId?: string): string => (scope === 'provider' || scope === 'product' ? `${scope}:${scopeId ?? ''}` : scope)

const toKill = (r: { key: string; scope: KillScope; scope_id: string | null; active: number; reason: string | null; set_by: string | null; set_at: number; cleared_at: number | null }): KillSwitchRecord =>
  compact({ key: r.key, scope: r.scope, scopeId: nn(r.scope_id), active: r.active === 1, reason: nn(r.reason), setBy: nn(r.set_by), setAt: r.set_at, clearedAt: nn(r.cleared_at) }) as KillSwitchRecord

export class KillSwitchesRepo {
  constructor(private readonly db: Database) {}
  set(k: { scope: KillScope; scopeId?: string; active: boolean; reason?: string; setBy?: string; now: EpochMs }): KillSwitchRecord {
    const key = killSwitchKey(k.scope, k.scopeId)
    this.db.run(
      `INSERT INTO kill_switches (key, scope, scope_id, active, reason, set_by, set_at, cleared_at) VALUES (?,?,?,?,?,?,?,?)
       ON CONFLICT(key) DO UPDATE SET active = excluded.active, reason = excluded.reason, set_by = excluded.set_by, set_at = excluded.set_at, cleared_at = excluded.cleared_at`,
      [key, k.scope, k.scopeId, k.active ? 1 : 0, k.reason, k.setBy, k.now, k.active ? null : k.now],
    )
    return this.get(key) as KillSwitchRecord
  }
  get(key: string): KillSwitchRecord | undefined {
    const r = this.db.get<Parameters<typeof toKill>[0]>('SELECT * FROM kill_switches WHERE key = ?', [key])
    return r && toKill(r)
  }
  list(activeOnly = false): KillSwitchRecord[] {
    return this.db.all<Parameters<typeof toKill>[0]>(`SELECT * FROM kill_switches ${activeOnly ? 'WHERE active = 1' : ''} ORDER BY key`).map(toKill)
  }
  isActive(scope: KillScope, scopeId?: string): boolean {
    return (this.db.scalar<number>('SELECT active FROM kill_switches WHERE key = ?', [killSwitchKey(scope, scopeId)]) ?? 0) === 1
  }
}

// ───────────────────────── alerts ─────────────────────────
export interface AlertRecord {
  id: string
  at: EpochMs
  lastAt: EpochMs
  count: number
  severity: 'info' | 'warning' | 'critical'
  code: string
  messageFa: string
  data?: Record<string, unknown>
  ackedBy?: string
  ackedAt?: EpochMs
  resolvedAt?: EpochMs
}
interface AlertRow {
  id: string
  at: number
  last_at: number
  count: number
  severity: AlertRecord['severity']
  code: string
  message_fa: string
  data_json: string | null
  acked_by: string | null
  acked_at: number | null
  resolved_at: number | null
}
const toAlert = (r: AlertRow): AlertRecord =>
  compact({
    id: r.id,
    at: r.at,
    lastAt: r.last_at,
    count: r.count,
    severity: r.severity,
    code: r.code,
    messageFa: r.message_fa,
    data: fromJsonOpt(UnknownRecordSchema, r.data_json, 'alerts.data_json'),
    ackedBy: nn(r.acked_by),
    ackedAt: nn(r.acked_at),
    resolvedAt: nn(r.resolved_at),
  }) as AlertRecord

export class AlertsRepo {
  constructor(private readonly db: Database) {}
  insert(a: AlertRecord): AlertRecord {
    this.db.run('INSERT INTO alerts (id, at, last_at, count, severity, code, message_fa, data_json, acked_by, acked_at, resolved_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)', [
      a.id, a.at, a.lastAt, a.count, a.severity, a.code, a.messageFa, toJsonOpt(UnknownRecordSchema, a.data, 'alert data'), a.ackedBy, a.ackedAt, a.resolvedAt,
    ])
    return this.get(a.id) as AlertRecord
  }
  get(id: string): AlertRecord | undefined {
    const r = this.db.get<AlertRow>('SELECT * FROM alerts WHERE id = ?', [id])
    return r && toAlert(r)
  }
  /** Latest unresolved alert with this code raised at or after `since` (dedupe window). */
  findOpenByCode(code: string, since: EpochMs): AlertRecord | undefined {
    const r = this.db.get<AlertRow>('SELECT * FROM alerts WHERE code = ? AND resolved_at IS NULL AND last_at >= ? ORDER BY last_at DESC LIMIT 1', [code, since])
    return r && toAlert(r)
  }
  bump(id: string, now: EpochMs, data?: Record<string, unknown>): AlertRecord {
    this.db.run('UPDATE alerts SET count = count + 1, last_at = ?, data_json = COALESCE(?, data_json) WHERE id = ?', [now, toJsonOpt(UnknownRecordSchema, data, 'alert data'), id])
    return this.get(id) as AlertRecord
  }
  ack(id: string, by: string | undefined, now: EpochMs): AlertRecord {
    this.db.run('UPDATE alerts SET acked_by = ?, acked_at = ? WHERE id = ? AND acked_at IS NULL', [by, now, id])
    const a = this.get(id)
    if (!a) throw new AppError('NOT_FOUND', `alert ${id} not found`)
    return a
  }
  resolve(id: string, now: EpochMs): AlertRecord {
    this.db.run('UPDATE alerts SET resolved_at = ? WHERE id = ? AND resolved_at IS NULL', [now, id])
    const a = this.get(id)
    if (!a) throw new AppError('NOT_FOUND', `alert ${id} not found`)
    return a
  }
  list(f: { openOnly?: boolean; unackedOnly?: boolean; severity?: AlertRecord['severity']; limit?: number } = {}): AlertRecord[] {
    const w: string[] = []
    const params: unknown[] = []
    if (f.openOnly) w.push('resolved_at IS NULL')
    if (f.unackedOnly) w.push('acked_at IS NULL')
    if (f.severity) (w.push('severity = ?'), params.push(f.severity))
    return this.db.all<AlertRow>(`SELECT * FROM alerts ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY last_at DESC, id DESC LIMIT ?`, [...params, f.limit ?? 50]).map(toAlert)
  }
  countOpen(): number {
    return this.db.scalar<number>('SELECT COUNT(*) FROM alerts WHERE resolved_at IS NULL') ?? 0
  }
}
