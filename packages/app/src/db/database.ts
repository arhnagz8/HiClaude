/**
 * Thin wrapper over `node:sqlite` (DatabaseSync).
 *  - `:memory:` or file databases (files get WAL + synchronous=NORMAL), foreign keys always ON.
 *  - Prepared-statement cache, `run/get/all/exec`, nested transactions (outer = BEGIN IMMEDIATE, inner = SAVEPOINT).
 *  - The `node:sqlite` ExperimentalWarning is silenced (only that one message) while the module is loaded.
 *  - `node:sqlite` is loaded through `createRequire` so bundlers/vitest do not try to resolve it as a normal module.
 */
import { createRequire } from 'node:module'
import type { DatabaseSync as DatabaseSyncType, StatementSync } from 'node:sqlite'

type SqliteModule = typeof import('node:sqlite')

function loadSqlite(): SqliteModule {
  const require = createRequire(import.meta.url)
  const original = process.emitWarning
  // Filter ONLY the sqlite ExperimentalWarning; everything else passes through untouched.
  process.emitWarning = ((warning: string | Error, ...args: unknown[]) => {
    const msg = typeof warning === 'string' ? warning : warning?.message ?? ''
    const type = typeof args[0] === 'string' ? args[0] : (args[0] as { type?: string } | undefined)?.type
    if (type === 'ExperimentalWarning' && /sqlite/i.test(msg)) return
    return (original as (...a: unknown[]) => void).call(process, warning, ...args)
  }) as typeof process.emitWarning
  try {
    return require('node:sqlite') as SqliteModule
  } finally {
    process.emitWarning = original
  }
}

const sqlite = loadSqlite()

export type SqlValue = string | number | bigint | null | Uint8Array
export type SqlParams = readonly unknown[] | Record<string, unknown>
export interface RunResult {
  changes: number
  lastInsertRowid: number
}
export type Row = Record<string, unknown>

function norm(v: unknown): SqlValue {
  if (v === undefined || v === null) return null
  if (typeof v === 'boolean') return v ? 1 : 0
  if (typeof v === 'number' || typeof v === 'string' || typeof v === 'bigint' || v instanceof Uint8Array) return v
  throw new TypeError(`Unsupported SQL parameter type: ${typeof v}`)
}

function bind(params: SqlParams | undefined): { positional: SqlValue[]; named?: Record<string, SqlValue> } {
  if (!params) return { positional: [] }
  if (Array.isArray(params)) return { positional: params.map(norm) }
  const named: Record<string, SqlValue> = {}
  for (const [k, v] of Object.entries(params as Record<string, unknown>)) named[k] = norm(v)
  return { positional: [], named }
}

export class Database {
  private readonly raw: DatabaseSyncType
  private readonly cache = new Map<string, StatementSync>()
  private depth = 0
  private closed = false
  readonly path: string

  constructor(path = ':memory:') {
    this.path = path
    this.raw = new sqlite.DatabaseSync(path)
    this.raw.exec('PRAGMA foreign_keys = ON')
    if (path !== ':memory:') {
      this.raw.exec('PRAGMA journal_mode = WAL')
      this.raw.exec('PRAGMA synchronous = NORMAL')
    }
    this.raw.exec('PRAGMA busy_timeout = 5000')
  }

  static open(path = ':memory:'): Database {
    return new Database(path)
  }

  private stmt(sql: string): StatementSync {
    let s = this.cache.get(sql)
    if (!s) {
      s = this.raw.prepare(sql)
      this.cache.set(sql, s)
    }
    return s
  }

  /** Execute one or more statements without parameters (DDL, migrations). */
  exec(sql: string): void {
    this.raw.exec(sql)
  }

  run(sql: string, params?: SqlParams): RunResult {
    const b = bind(params)
    const s = this.stmt(sql)
    const r = b.named ? s.run(b.named) : s.run(...b.positional)
    return { changes: Number(r.changes), lastInsertRowid: Number(r.lastInsertRowid) }
  }

  get<T = Row>(sql: string, params?: SqlParams): T | undefined {
    const b = bind(params)
    const s = this.stmt(sql)
    const r = b.named ? s.get(b.named) : s.get(...b.positional)
    return r === undefined ? undefined : ({ ...(r as object) } as T)
  }

  all<T = Row>(sql: string, params?: SqlParams): T[] {
    const b = bind(params)
    const s = this.stmt(sql)
    const rows = b.named ? s.all(b.named) : s.all(...b.positional)
    return (rows as object[]).map((r) => ({ ...r }) as T)
  }

  /** Scalar helper: first column of first row. */
  scalar<T = number>(sql: string, params?: SqlParams): T | undefined {
    const r = this.get<Row>(sql, params)
    if (!r) return undefined
    return Object.values(r)[0] as T
  }

  get inTransaction(): boolean {
    return this.depth > 0
  }

  /**
   * Run `fn` atomically. The outermost call opens `BEGIN IMMEDIATE`; nested calls use SAVEPOINTs, so an inner failure
   * rolls back only the inner work (if the caller catches it) while an uncaught throw unwinds everything.
   * `fn` must be synchronous.
   */
  tx<T>(fn: (db: Database) => T): T {
    if (this.closed) throw new Error('Database is closed')
    const outer = this.depth === 0
    const sp = `sp_${this.depth}`
    this.raw.exec(outer ? 'BEGIN IMMEDIATE' : `SAVEPOINT ${sp}`)
    this.depth++
    try {
      const result = fn(this)
      if (result instanceof Promise) throw new Error('Database.tx callback must be synchronous (returned a Promise)')
      this.depth--
      this.raw.exec(outer ? 'COMMIT' : `RELEASE ${sp}`)
      return result
    } catch (e) {
      this.depth--
      try {
        this.raw.exec(outer ? 'ROLLBACK' : `ROLLBACK TO ${sp}; RELEASE ${sp}`)
      } catch {
        /* connection may already have rolled back */
      }
      throw e
    }
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    this.cache.clear()
    this.raw.close()
  }

  get isOpen(): boolean {
    return !this.closed
  }
}
