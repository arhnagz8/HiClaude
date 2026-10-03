import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Database, loadMigrations, migrate } from '../src/db'

const TABLES = [
  'customers', 'identities', 'sessions', 'otps', 'products', 'product_overrides', 'quotes', 'orders', 'order_events', 'payments', 'bank_credits',
  'chain_transfers', 'fulfilment_tasks', 'deliveries', 'usdt_lots', 'treasury_actions', 'rate_snapshots', 'ledger_accounts', 'ledger_entries',
  'ledger_lines', 'settings', 'settings_audit', 'users', 'audit_log', 'tickets', 'ticket_messages', 'notifications', 'referrals', 'kpi_daily',
  'jobs_state', 'kill_switches', 'alerts',
]

describe('Database wrapper', () => {
  it('runs/gets/alls with positional and named params and normalises undefined/boolean', () => {
    const db = Database.open()
    db.exec('CREATE TABLE t (a INTEGER, b TEXT, c INTEGER)')
    db.run('INSERT INTO t VALUES (?,?,?)', [1, 'x', true])
    db.run('INSERT INTO t VALUES ($a,$b,$c)', { a: 2, b: undefined, c: false })
    expect(db.all('SELECT * FROM t ORDER BY a')).toEqual([
      { a: 1, b: 'x', c: 1 },
      { a: 2, b: null, c: 0 },
    ])
    expect(db.get<{ b: string }>('SELECT b FROM t WHERE a = ?', [1])?.b).toBe('x')
    expect(db.get('SELECT * FROM t WHERE a = ?', [99])).toBeUndefined()
    expect(db.scalar('SELECT COUNT(*) FROM t')).toBe(2)
    db.close()
  })

  it('enforces foreign keys', () => {
    const db = Database.open()
    db.exec('CREATE TABLE p (id INTEGER PRIMARY KEY); CREATE TABLE c (pid INTEGER REFERENCES p(id))')
    expect(() => db.run('INSERT INTO c VALUES (1)')).toThrow(/FOREIGN KEY/)
  })

  it('commits a transaction and rolls back on throw', () => {
    const db = Database.open()
    db.exec('CREATE TABLE t (a INTEGER)')
    db.tx(() => db.run('INSERT INTO t VALUES (1)'))
    expect(() =>
      db.tx(() => {
        db.run('INSERT INTO t VALUES (2)')
        throw new Error('boom')
      }),
    ).toThrow('boom')
    expect(db.all('SELECT a FROM t')).toEqual([{ a: 1 }])
    expect(db.inTransaction).toBe(false)
  })

  it('nested tx uses savepoints: an inner failure caught by the caller keeps the outer work', () => {
    const db = Database.open()
    db.exec('CREATE TABLE t (a INTEGER)')
    db.tx(() => {
      db.run('INSERT INTO t VALUES (1)')
      expect(() =>
        db.tx(() => {
          db.run('INSERT INTO t VALUES (2)')
          throw new Error('inner')
        }),
      ).toThrow('inner')
      db.tx(() => db.run('INSERT INTO t VALUES (3)'))
    })
    expect(db.all('SELECT a FROM t ORDER BY a')).toEqual([{ a: 1 }, { a: 3 }])
  })

  it('an uncaught inner failure unwinds the whole outer transaction', () => {
    const db = Database.open()
    db.exec('CREATE TABLE t (a INTEGER)')
    expect(() =>
      db.tx(() => {
        db.run('INSERT INTO t VALUES (1)')
        db.tx(() => {
          throw new Error('x')
        })
      }),
    ).toThrow('x')
    expect(db.scalar('SELECT COUNT(*) FROM t')).toBe(0)
  })

  it('rejects asynchronous tx callbacks', () => {
    const db = Database.open()
    expect(() => db.tx((async () => 1) as never)).toThrow(/synchronous/)
  })

  it('file databases use WAL and persist', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hc-db-'))
    try {
      const path = join(dir, 'x.sqlite')
      const a = Database.open(path)
      expect(a.scalar<string>('PRAGMA journal_mode')).toBe('wal')
      a.exec('CREATE TABLE t (a INTEGER)')
      a.run('INSERT INTO t VALUES (7)')
      a.close()
      const b = Database.open(path)
      expect(b.scalar('SELECT a FROM t')).toBe(7)
      b.close()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('migrations', () => {
  it('001_init creates every architecture table', () => {
    const db = Database.open()
    const r = migrate(db, 123)
    expect(r.applied).toContain('001')
    const names = db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table'").map((x) => x.name)
    for (const t of TABLES) expect(names, t).toContain(t)
  })

  it('is idempotent', () => {
    const db = Database.open()
    migrate(db, 1)
    const again = migrate(db, 2)
    expect(again.applied).toEqual([])
    expect(again.skipped).toContain('001')
    expect(db.scalar('SELECT COUNT(*) FROM schema_migrations')).toBe(loadMigrations().length)
  })

  it('applies newly added migration files in order and detects edits to applied ones', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hc-mig-'))
    try {
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, '001_a.sql'), 'CREATE TABLE a (x INTEGER);')
      const db = Database.open()
      expect(migrate(db, 0, dir + '/').applied).toEqual(['001'])
      writeFileSync(join(dir, '002_b.sql'), 'CREATE TABLE b (x INTEGER);')
      expect(migrate(db, 0, dir + '/').applied).toEqual(['002'])
      writeFileSync(join(dir, '001_a.sql'), 'CREATE TABLE a (x INTEGER, y INTEGER);')
      expect(() => migrate(db, 0, dir + '/')).toThrow(/modified after being applied/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('a failing migration leaves nothing behind', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hc-mig-'))
    try {
      writeFileSync(join(dir, '001_bad.sql'), 'CREATE TABLE ok (x INTEGER); CREATE TABLE ok (x INTEGER);')
      const db = Database.open()
      expect(() => migrate(db, 0, dir + '/')).toThrow()
      expect(db.scalar("SELECT COUNT(*) FROM sqlite_master WHERE name = 'ok'")).toBe(0)
      expect(db.scalar('SELECT COUNT(*) FROM schema_migrations')).toBe(0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('ledger tables are append-only (triggers)', () => {
    const db = Database.open()
    migrate(db, 0)
    db.run("INSERT INTO ledger_entries (id, ts, kind, memo) VALUES ('e1', 1, 'X', 'm')")
    db.run("INSERT INTO ledger_lines (entry_id, line_no, account, qty, irt, ts) VALUES ('e1', 0, '1010', 5, 5, 1)")
    expect(() => db.run("UPDATE ledger_entries SET memo = 'z'")).toThrow(/append-only/)
    expect(() => db.run('DELETE FROM ledger_entries')).toThrow(/append-only/)
    expect(() => db.run('UPDATE ledger_lines SET irt = 9')).toThrow(/append-only/)
    expect(() => db.run('DELETE FROM ledger_lines')).toThrow(/append-only/)
  })
})
