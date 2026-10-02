/**
 * Ordered SQL migrations: `src/db/migrations/NNN_name.sql`, applied once each (tracked in `schema_migrations`).
 * Idempotent: re-running applies nothing. A stored checksum detects edits to an already-applied migration
 * (later agents must add `002_*.sql` … and never edit `001`).
 */
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Database } from './database'

export const MIGRATIONS_DIR = fileURLToPath(new URL('./migrations/', import.meta.url))

export interface MigrationFile {
  version: string
  name: string
  sql: string
  checksum: string
}

export function loadMigrations(dir: string = MIGRATIONS_DIR): MigrationFile[] {
  return readdirSync(dir)
    .filter((f) => /^\d{3}_[a-z0-9_]+\.sql$/.test(f))
    .sort()
    .map((f) => {
      const sql = readFileSync(`${dir}${dir.endsWith('/') ? '' : '/'}${f}`, 'utf8')
      return {
        version: f.slice(0, 3),
        name: f.slice(4, -4),
        sql,
        checksum: createHash('sha256').update(sql).digest('hex'),
      }
    })
}

export interface MigrationResult {
  applied: string[]
  skipped: string[]
}

/** @param now epoch ms recorded in `applied_at` (pass `clock.now()`; deterministic) */
export function migrate(db: Database, now = 0, dir: string = MIGRATIONS_DIR): MigrationResult {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    checksum TEXT NOT NULL,
    applied_at INTEGER NOT NULL
  )`)
  const done = new Map(db.all<{ version: string; checksum: string }>('SELECT version, checksum FROM schema_migrations').map((r) => [r.version, r.checksum]))
  const result: MigrationResult = { applied: [], skipped: [] }
  for (const m of loadMigrations(dir)) {
    const prev = done.get(m.version)
    if (prev !== undefined) {
      if (prev !== m.checksum) throw new Error(`Migration ${m.version}_${m.name} was modified after being applied (checksum mismatch)`)
      result.skipped.push(m.version)
      continue
    }
    // DDL + bookkeeping in one transaction so a failed migration leaves nothing behind.
    db.tx(() => {
      db.exec(m.sql)
      db.run('INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES (?,?,?,?)', [m.version, m.name, m.checksum, now])
    })
    result.applied.push(m.version)
  }
  return result
}
