import { AppError, type DeliverySummary, type EpochMs, type FulfilmentTask, type TaskStatus } from '@hiclaude/contracts'
import type { Database } from '../db'
import { compact, fromJson, fromJsonOpt, nn, toJson, toJsonOpt } from './json'
import { DeliverySummarySchema, TaskInstructionsSchema, UnknownRecordSchema } from './schemas'

interface TaskRow {
  id: string
  order_id: string
  kind: FulfilmentTask['kind']
  mode: FulfilmentTask['mode']
  status: TaskStatus
  version: number
  priority: number
  rush_tier: string
  created_at: number
  due_at: number
  claimed_by: string | null
  claimed_at: number | null
  completed_at: number | null
  attempts: number
  provider_id: string
  instructions_json: string
  result_json: string | null
  failure_reason: string | null
}
export type StoredTask = FulfilmentTask & { version: number }

const toTask = (r: TaskRow): StoredTask =>
  compact({
    id: r.id,
    orderId: r.order_id,
    kind: r.kind,
    mode: r.mode,
    status: r.status,
    version: r.version,
    priority: r.priority,
    rushTier: r.rush_tier,
    createdAt: r.created_at,
    dueAt: r.due_at,
    claimedBy: nn(r.claimed_by),
    claimedAt: nn(r.claimed_at),
    completedAt: nn(r.completed_at),
    attempts: r.attempts,
    providerId: r.provider_id,
    instructions: fromJson(TaskInstructionsSchema, r.instructions_json, 'fulfilment_tasks.instructions_json'),
    result: fromJsonOpt(UnknownRecordSchema, r.result_json, 'fulfilment_tasks.result_json'),
    failureReason: nn(r.failure_reason),
  }) as StoredTask

const TASK_COLS: Record<string, string> = {
  status: 'status',
  priority: 'priority',
  rushTier: 'rush_tier',
  dueAt: 'due_at',
  claimedBy: 'claimed_by',
  claimedAt: 'claimed_at',
  completedAt: 'completed_at',
  attempts: 'attempts',
  providerId: 'provider_id',
  failureReason: 'failure_reason',
  mode: 'mode',
  kind: 'kind',
}

export type TaskPatch = Partial<Omit<FulfilmentTask, 'id' | 'orderId' | 'createdAt'>>

export class TasksRepo {
  constructor(private readonly db: Database) {}

  insert(t: FulfilmentTask): StoredTask {
    this.db.run(
      `INSERT INTO fulfilment_tasks (id, order_id, kind, mode, status, version, priority, rush_tier, created_at, due_at, claimed_by, claimed_at, completed_at,
         attempts, provider_id, instructions_json, result_json, failure_reason)
       VALUES (?,?,?,?,?,1,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [t.id, t.orderId, t.kind, t.mode, t.status, t.priority, t.rushTier, t.createdAt, t.dueAt, t.claimedBy, t.claimedAt, t.completedAt, t.attempts, t.providerId,
        toJson(TaskInstructionsSchema, t.instructions, 'task.instructions'), toJsonOpt(UnknownRecordSchema, t.result, 'task.result'), t.failureReason],
    )
    return this.get(t.id) as StoredTask
  }
  get(id: string): StoredTask | undefined {
    const r = this.db.get<TaskRow>('SELECT * FROM fulfilment_tasks WHERE id = ?', [id])
    return r && toTask(r)
  }
  /** Optimistic update (CONFLICT on stale `expectedVersion`); version always increments. */
  update(id: string, patch: TaskPatch, expectedVersion?: number): StoredTask {
    const sets: string[] = []
    const params: unknown[] = []
    for (const [k, v] of Object.entries(patch)) {
      if (k === 'instructions') (sets.push('instructions_json = ?'), params.push(toJson(TaskInstructionsSchema, v as FulfilmentTask['instructions'], 'task.instructions')))
      else if (k === 'result') (sets.push('result_json = ?'), params.push(toJsonOpt(UnknownRecordSchema, v as Record<string, unknown> | undefined, 'task.result')))
      else {
        const col = TASK_COLS[k]
        if (!col) throw new Error(`TasksRepo.update: unknown field ${k}`)
        sets.push(`${col} = ?`)
        params.push(v)
      }
    }
    sets.push('version = version + 1')
    const r = this.db.run(
      `UPDATE fulfilment_tasks SET ${sets.join(', ')} WHERE id = ?${expectedVersion === undefined ? '' : ' AND version = ?'}`,
      expectedVersion === undefined ? [...params, id] : [...params, id, expectedVersion],
    )
    if (r.changes === 0) {
      const ex = this.get(id)
      if (!ex) throw new AppError('NOT_FOUND', `task ${id} not found`)
      throw new AppError('CONFLICT', `task ${id} was modified concurrently`, { expectedVersion, actualVersion: ex.version })
    }
    return this.get(id) as StoredTask
  }
  listByOrder(orderId: string): StoredTask[] {
    return this.db.all<TaskRow>('SELECT * FROM fulfilment_tasks WHERE order_id = ? ORDER BY created_at, id', [orderId]).map(toTask)
  }
  /** The work queue: tasks in `statuses` (default queued) ordered by (priority asc, dueAt asc, createdAt asc). */
  queue(opts: { statuses?: readonly TaskStatus[]; mode?: 'api' | 'operator'; limit?: number } = {}): StoredTask[] {
    const st = opts.statuses ?? ['queued']
    const params: unknown[] = [...st]
    let sql = `SELECT * FROM fulfilment_tasks WHERE status IN (${st.map(() => '?').join(',')})`
    if (opts.mode) (sql += ' AND mode = ?', params.push(opts.mode))
    sql += ' ORDER BY priority, due_at, created_at, id LIMIT ?'
    params.push(opts.limit ?? 200)
    return this.db.all<TaskRow>(sql, params).map(toTask)
  }
  listByClaimant(userId: string, statuses: readonly TaskStatus[] = ['claimed', 'in_progress']): StoredTask[] {
    return this.db
      .all<TaskRow>(`SELECT * FROM fulfilment_tasks WHERE claimed_by = ? AND status IN (${statuses.map(() => '?').join(',')}) ORDER BY priority, due_at, id`, [userId, ...statuses])
      .map(toTask)
  }
  /** Open tasks whose due time passed (SLA breach scan). */
  listOverdue(now: EpochMs, limit = 200): StoredTask[] {
    return this.db
      .all<TaskRow>(`SELECT * FROM fulfilment_tasks WHERE status IN ('queued','claimed','in_progress') AND due_at < ? ORDER BY due_at, id LIMIT ?`, [now, limit])
      .map(toTask)
  }
  countsByStatus(): Record<string, number> {
    const out: Record<string, number> = {}
    for (const r of this.db.all<{ status: string; n: number }>('SELECT status, COUNT(*) AS n FROM fulfilment_tasks GROUP BY status')) out[r.status] = r.n
    return out
  }
  /** Tasks created in [from, to) per rush tier (capacity-per-hour checks). */
  countCreatedByTier(rushTier: string, from: EpochMs, to: EpochMs): number {
    return this.db.scalar<number>('SELECT COUNT(*) FROM fulfilment_tasks WHERE rush_tier = ? AND created_at >= ? AND created_at < ?', [rushTier, from, to]) ?? 0
  }
}

// ───────────────────────── deliveries ─────────────────────────
export interface DeliveryRecord {
  id: string
  orderId: string
  taskId?: string
  kind: DeliverySummary['kind']
  summary: DeliverySummary
  /** Envelope-encrypted secret payload (see crypto/envelope). Never logged, never exposed in DTOs. */
  secretEnc?: string
  revealCount: number
  lastRevealedAt?: EpochMs
  revealTokenHash?: string
  revealTokenExpiresAt?: EpochMs
  createdAt: EpochMs
}
interface DeliveryRow {
  id: string
  order_id: string
  task_id: string | null
  kind: DeliverySummary['kind']
  summary_json: string
  secret_enc: string | null
  reveal_count: number
  last_revealed_at: number | null
  reveal_token_hash: string | null
  reveal_token_expires_at: number | null
  created_at: number
}
const toDelivery = (r: DeliveryRow): DeliveryRecord =>
  compact({
    id: r.id,
    orderId: r.order_id,
    taskId: nn(r.task_id),
    kind: r.kind,
    summary: fromJson(DeliverySummarySchema, r.summary_json, 'deliveries.summary_json'),
    secretEnc: nn(r.secret_enc),
    revealCount: r.reveal_count,
    lastRevealedAt: nn(r.last_revealed_at),
    revealTokenHash: nn(r.reveal_token_hash),
    revealTokenExpiresAt: nn(r.reveal_token_expires_at),
    createdAt: r.created_at,
  }) as DeliveryRecord

export class DeliveriesRepo {
  constructor(private readonly db: Database) {}
  insert(d: DeliveryRecord): DeliveryRecord {
    this.db.run(
      `INSERT INTO deliveries (id, order_id, task_id, kind, summary_json, secret_enc, reveal_count, last_revealed_at, reveal_token_hash, reveal_token_expires_at, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [d.id, d.orderId, d.taskId, d.kind, toJson(DeliverySummarySchema, d.summary, 'delivery.summary'), d.secretEnc, d.revealCount, d.lastRevealedAt, d.revealTokenHash,
        d.revealTokenExpiresAt, d.createdAt],
    )
    return this.get(d.id) as DeliveryRecord
  }
  get(id: string): DeliveryRecord | undefined {
    const r = this.db.get<DeliveryRow>('SELECT * FROM deliveries WHERE id = ?', [id])
    return r && toDelivery(r)
  }
  listByOrder(orderId: string): DeliveryRecord[] {
    return this.db.all<DeliveryRow>('SELECT * FROM deliveries WHERE order_id = ? ORDER BY created_at, id', [orderId]).map(toDelivery)
  }
  update(id: string, patch: Partial<Pick<DeliveryRecord, 'summary' | 'revealCount' | 'lastRevealedAt' | 'revealTokenHash' | 'revealTokenExpiresAt'>>): DeliveryRecord {
    const sets: string[] = []
    const params: unknown[] = []
    for (const [k, v] of Object.entries(patch)) {
      if (k === 'summary') (sets.push('summary_json = ?'), params.push(toJson(DeliverySummarySchema, v as DeliverySummary, 'delivery.summary')))
      else {
        const col = { revealCount: 'reveal_count', lastRevealedAt: 'last_revealed_at', revealTokenHash: 'reveal_token_hash', revealTokenExpiresAt: 'reveal_token_expires_at' }[k]
        if (!col) throw new Error(`DeliveriesRepo.update: unknown field ${k}`)
        sets.push(`${col} = ?`)
        params.push(v)
      }
    }
    if (sets.length) this.db.run(`UPDATE deliveries SET ${sets.join(', ')} WHERE id = ?`, [...params, id])
    const d = this.get(id)
    if (!d) throw new AppError('NOT_FOUND', `delivery ${id} not found`)
    return d
  }
}
