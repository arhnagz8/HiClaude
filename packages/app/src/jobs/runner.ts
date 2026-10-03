/**
 * JobRunner — deterministic, clock-driven job scheduler (architecture §10).
 *
 * Schedules
 *   interval:  `intervalMs`            slots are epoch-aligned (slot = floor(now / intervalMs)); a job runs at most once per slot.
 *   daily:     `atIrst: {hour, minute}` once per IRST calendar day, at/after hh:mm IRST.
 *   monthly:   `atIrst: {hour, minute, dayOfMonth}` once per *Jalali* month, at/after day `dayOfMonth` hh:mm IRST
 *              (dayOfMonth is clamped to the month length, e.g. 30 in Esfand of a non-leap year).
 *
 * Catch-up policy: if several slots were missed the job runs ONCE (skipping the missed ones) on the first tick after it became due.
 * A job that has never run is due immediately (unless `skipInitialCatchUp` — then its first slot is just recorded, not executed).
 * Failures never propagate: they are recorded in `jobs_state` and raised as a (deduped) warning alert. A failed run still consumes the slot.
 * `tick()` calls are serialised and a job already running is skipped, so a slow job cannot be started twice.
 */
import { AppError, MS, fromIrst, irstParts, jalaliMonthLength, jalaliOf, startOfIrstDay, toGregorian, type Clock, type EpochMs } from '@hiclaude/contracts'
import type { JobStateRecord, JobsStateRepo } from '../repos'
import type { AlertService } from '../services/alerts'

export interface JobContext {
  now: EpochMs
  name: string
  slot: number
}

export interface JobSpec {
  name: string
  /** Interval schedule (ms). Exactly one of `intervalMs` / `atIrst` must be given. */
  intervalMs?: number
  /** Daily (no dayOfMonth) or monthly-on-Jalali-day (with dayOfMonth) schedule, in IRST. */
  atIrst?: { hour: number; minute: number; dayOfMonth?: number }
  handler: (ctx: JobContext) => void | Promise<void>
  enabled?: boolean
  skipInitialCatchUp?: boolean
}

export interface JobTickResult {
  name: string
  ran: boolean
  ok?: boolean
  error?: string
}

interface Registered extends JobSpec {
  registeredAt: EpochMs
  running: boolean
}

export function validateJobSpec(spec: JobSpec): void {
  if (!spec.name) throw new AppError('VALIDATION', 'job name required')
  if ((spec.intervalMs === undefined) === (spec.atIrst === undefined)) throw new AppError('VALIDATION', `job ${spec.name}: give exactly one of intervalMs / atIrst`)
  if (spec.intervalMs !== undefined && !(Number.isInteger(spec.intervalMs) && spec.intervalMs > 0)) throw new AppError('VALIDATION', `job ${spec.name}: intervalMs must be a positive integer`)
  if (spec.atIrst) {
    const { hour, minute, dayOfMonth } = spec.atIrst
    if (!(Number.isInteger(hour) && hour >= 0 && hour <= 23 && Number.isInteger(minute) && minute >= 0 && minute <= 59)) throw new AppError('VALIDATION', `job ${spec.name}: bad atIrst time`)
    if (dayOfMonth !== undefined && !(Number.isInteger(dayOfMonth) && dayOfMonth >= 1 && dayOfMonth <= 31)) throw new AppError('VALIDATION', `job ${spec.name}: dayOfMonth must be 1..31`)
  }
}

/** The slot a job would run for at `now` (or undefined if not yet due in the current period) + helpers. */
export function dueSlot(spec: Pick<JobSpec, 'intervalMs' | 'atIrst'>, now: EpochMs): { slot: number; due: boolean } {
  if (spec.intervalMs !== undefined) return { slot: Math.floor(now / spec.intervalMs), due: true }
  const at = spec.atIrst as NonNullable<JobSpec['atIrst']>
  const p = irstParts(now)
  const minutesNow = p.hour * 60 + p.minute
  const minutesAt = at.hour * 60 + at.minute
  if (at.dayOfMonth === undefined) {
    const day = Math.round(startOfIrstDay(now) / MS.day)
    return { slot: day, due: minutesNow >= minutesAt }
  }
  const j = jalaliOf(now)
  const dom = Math.min(at.dayOfMonth, jalaliMonthLength(j.jy, j.jm))
  const slot = j.jy * 12 + (j.jm - 1)
  const due = j.jd > dom || (j.jd === dom && minutesNow >= minutesAt)
  return { slot, due }
}

/** Epoch ms at which the schedule's slot `slot` becomes due (used for lag computation). */
function slotStart(spec: Pick<JobSpec, 'intervalMs' | 'atIrst'>, slot: number): EpochMs {
  if (spec.intervalMs !== undefined) return slot * spec.intervalMs
  const at = spec.atIrst as NonNullable<JobSpec['atIrst']>
  if (at.dayOfMonth === undefined) return slot * MS.day - 3.5 * MS.hour + at.hour * MS.hour + at.minute * MS.minute
  const jy = Math.floor(slot / 12)
  const jm = (slot % 12) + 1
  const dom = Math.min(at.dayOfMonth, jalaliMonthLength(jy, jm))
  const g = toGregorian(jy, jm, dom)
  return fromIrst(g.gy, g.gm, g.gd, at.hour, at.minute)
}

export class JobRunner {
  private readonly jobs = new Map<string, Registered>()
  private chain: Promise<unknown> = Promise.resolve()

  constructor(private readonly deps: { clock: Clock; state: JobsStateRepo; alerts?: Pick<AlertService, 'raise'>; logger?: { error(msg: string, data?: Record<string, unknown>): void } }) {}

  /** Register a job (call order = execution order within a tick). Re-registering a name replaces the handler (state is kept). */
  register(spec: JobSpec): void {
    validateJobSpec(spec)
    const now = this.deps.clock.now()
    const prev = this.deps.state.get(spec.name)
    this.jobs.set(spec.name, { ...spec, registeredAt: prev?.registeredAt ?? now, running: false })
    if (!prev) this.deps.state.upsert({ name: spec.name, registeredAt: now, runs: 0, failures: 0 })
  }

  names(): string[] {
    return [...this.jobs.keys()]
  }

  has(name: string): boolean {
    return this.jobs.has(name)
  }

  setEnabled(name: string, enabled: boolean): void {
    const j = this.jobs.get(name)
    if (!j) throw new AppError('NOT_FOUND', `job ${name} not registered`)
    j.enabled = enabled
  }

  state(name: string): JobStateRecord | undefined {
    return this.deps.state.get(name)
  }

  /** All registered jobs with their persisted state (for admin/health). */
  list(): (JobStateRecord & { schedule: string; enabled: boolean })[] {
    return [...this.jobs.values()].map((j) => ({
      ...((this.deps.state.get(j.name) ?? { name: j.name, runs: 0, failures: 0 }) as JobStateRecord),
      schedule: j.intervalMs !== undefined ? `every ${j.intervalMs}ms` : j.atIrst?.dayOfMonth !== undefined ? `monthly j${j.atIrst.dayOfMonth} ${pad(j.atIrst.hour)}:${pad(j.atIrst.minute)} IRST` : `daily ${pad(j.atIrst!.hour)}:${pad(j.atIrst!.minute)} IRST`,
      enabled: j.enabled !== false,
    }))
  }

  /**
   * Run every due job once, in registration order. Resolves when all handlers finished. Safe to call repeatedly with the same
   * `now` (a slot never runs twice).
   */
  tick(now: EpochMs = this.deps.clock.now()): Promise<JobTickResult[]> {
    const run = this.chain.then(() => this.doTick(now))
    this.chain = run.catch(() => undefined)
    return run
  }

  private async doTick(now: EpochMs): Promise<JobTickResult[]> {
    const results: JobTickResult[] = []
    for (const job of [...this.jobs.values()]) {
      if (job.enabled === false || job.running) {
        results.push({ name: job.name, ran: false })
        continue
      }
      const st = this.deps.state.get(job.name) ?? { name: job.name, runs: 0, failures: 0 }
      const { slot, due } = dueSlot(job, now)
      const neverRan = st.lastSlot === undefined
      if (!due || (st.lastSlot !== undefined && st.lastSlot >= slot)) {
        results.push({ name: job.name, ran: false })
        continue
      }
      if (neverRan && job.skipInitialCatchUp) {
        this.deps.state.upsert({ ...st, lastSlot: slot, registeredAt: st.registeredAt ?? job.registeredAt })
        results.push({ name: job.name, ran: false })
        continue
      }
      results.push(await this.execute(job, now, slot, st))
    }
    return results
  }

  /** Run a job immediately, ignoring its schedule (does not consume the scheduled slot). */
  async runNow(name: string, now: EpochMs = this.deps.clock.now()): Promise<JobTickResult> {
    const job = this.jobs.get(name)
    if (!job) throw new AppError('NOT_FOUND', `job ${name} not registered`)
    const st = this.deps.state.get(name) ?? { name, runs: 0, failures: 0 }
    const { slot } = dueSlot(job, now)
    const run = this.chain.then(() => this.execute(job, now, st.lastSlot ?? slot - 1, st, true))
    this.chain = run.catch(() => undefined)
    return run
  }

  private async execute(job: Registered, now: EpochMs, slot: number, st: JobStateRecord, manual = false): Promise<JobTickResult> {
    job.running = true
    let error: string | undefined
    try {
      await job.handler({ now, name: job.name, slot })
    } catch (e) {
      error = e instanceof Error ? `${e.name}: ${e.message}` : String(e)
      this.deps.logger?.error(`job ${job.name} failed`, { error })
      try {
        this.deps.alerts?.raise({ severity: 'warning', code: `job.failed:${job.name}`, messageFa: `اجرای وظیفهٔ زمان‌بندی‌شده «${job.name}» با خطا مواجه شد.`, data: { error }, dedupeMs: 30 * MS.minute })
      } catch {
        /* alerting must not break the scheduler */
      }
    } finally {
      job.running = false
    }
    this.deps.state.upsert({
      name: job.name,
      registeredAt: st.registeredAt ?? job.registeredAt,
      lastRunAt: now,
      lastOkAt: error === undefined ? now : st.lastOkAt,
      lastSlot: manual ? st.lastSlot : slot,
      lastError: error,
      runs: st.runs + 1,
      failures: st.failures + (error === undefined ? 0 : 1),
    })
    return { name: job.name, ran: true, ok: error === undefined, error }
  }

  /**
   * How late the job is: 0 when it is not overdue, otherwise ms since it became due and had not (successfully started) running.
   * Never-run jobs are measured from the moment they were due after registration.
   */
  lagMs(name: string, now: EpochMs = this.deps.clock.now()): number {
    const job = this.jobs.get(name)
    if (!job) throw new AppError('NOT_FOUND', `job ${name} not registered`)
    const st = this.deps.state.get(name)
    if (job.intervalMs !== undefined) {
      const last = st?.lastRunAt ?? job.registeredAt
      return Math.max(0, now - (last + job.intervalMs))
    }
    const { slot, due } = dueSlot(job, now)
    if (!due) return 0
    if (st?.lastSlot !== undefined && st.lastSlot >= slot) return 0
    return Math.max(0, now - Math.max(slotStart(job, slot), st?.registeredAt ?? job.registeredAt))
  }
}

const pad = (n: number): string => String(n).padStart(2, '0')
