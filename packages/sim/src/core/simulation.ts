import type { EpochMs } from '@hiclaude/contracts'
import { SimClock } from './clock'
import { EventQueue, type QueueItem } from './eventQueue'

export interface TimerHandle {
  cancel(): void
  readonly time: EpochMs
  readonly label: string
}

interface Task {
  fn: () => void
  label: string
}

export type HookName = 'beforeEvent' | 'afterEvent' | 'advanced'
export type HookFn = (info: { time: EpochMs; label: string }) => void

/** Per-step callbacks (used by the runner / stats / demo UI). Handlers run in registration order. */
export class Hooks {
  private readonly map: Record<HookName, HookFn[]> = { beforeEvent: [], afterEvent: [], advanced: [] }
  on(name: HookName, fn: HookFn): () => void {
    this.map[name].push(fn)
    return () => {
      const i = this.map[name].indexOf(fn)
      if (i >= 0) this.map[name].splice(i, 1)
    }
  }
  emit(name: HookName, info: { time: EpochMs; label: string }): void {
    for (const fn of this.map[name]) fn(info)
  }
}

/** Default scheduling priorities (lower runs first at the same instant). */
export const PRIORITY = { world: 10, market: 20, default: 100, agent: 200 } as const

/**
 * Virtual-time simulation loop: a clock plus an ordered event queue.
 * `runUntil(t)` processes every queued task with time <= t in (time, priority, seq) order, moving the clock to each task's time first.
 */
export class Simulation {
  readonly clock: SimClock
  readonly queue = new EventQueue<Task>()
  readonly hooks = new Hooks()
  private processed = 0

  constructor(start: EpochMs = 0) {
    this.clock = new SimClock(start)
  }

  now(): EpochMs {
    return this.clock.now()
  }

  get eventsProcessed(): number {
    return this.processed
  }

  /** Schedule `fn` at absolute time `time` (clamped to now: never in the past). */
  at(time: EpochMs, fn: () => void, opts: { priority?: number; label?: string } = {}): TimerHandle {
    const t = Math.max(time, this.clock.now())
    const label = opts.label ?? 'task'
    const item: QueueItem<Task> = this.queue.push(t, { fn, label }, opts.priority ?? PRIORITY.default)
    return { cancel: () => void this.queue.cancel(item), time: t, label }
  }

  after(delayMs: number, fn: () => void, opts: { priority?: number; label?: string } = {}): TimerHandle {
    return this.at(this.clock.now() + Math.max(0, delayMs), fn, opts)
  }

  /** Recurring timer; first fire at `startAt` (default now + interval). Cancelling the handle stops the series. */
  every(intervalMs: number, fn: (time: EpochMs) => void, opts: { startAt?: EpochMs; priority?: number; label?: string } = {}): TimerHandle {
    if (!(intervalMs > 0)) throw new RangeError('interval must be > 0')
    let cancelled = false
    let current: TimerHandle
    const label = opts.label ?? 'every'
    const fire = (t: EpochMs) => {
      if (cancelled) return
      fn(t)
      if (!cancelled) current = this.at(t + intervalMs, () => fire(t + intervalMs), { priority: opts.priority, label })
    }
    const first = opts.startAt ?? this.clock.now() + intervalMs
    current = this.at(first, () => fire(Math.max(first, this.clock.now())), { priority: opts.priority, label })
    return {
      cancel: () => {
        cancelled = true
        current.cancel()
      },
      get time() {
        return current.time
      },
      label,
    }
  }

  nextEventTime(): EpochMs | null {
    const p = this.queue.peek()
    return p ? p.time : null
  }

  /** Runs exactly one queued task (advancing the clock to it). Returns false if the queue is empty. */
  step(): boolean {
    const item = this.queue.pop()
    if (!item) return false
    this.clock.moveTo(Math.max(item.time, this.clock.now()))
    this.run(item.payload)
    return true
  }

  /** Process all tasks with time <= t, then move the clock to t. Returns the number of tasks executed. */
  runUntil(t: EpochMs): number {
    if (t < this.clock.now()) throw new RangeError(`runUntil(${t}) is in the past (now=${this.clock.now()})`)
    let n = 0
    for (;;) {
      const p = this.queue.peek()
      if (!p || p.time > t) break
      const item = this.queue.pop() as QueueItem<Task>
      this.clock.moveTo(Math.max(item.time, this.clock.now()))
      this.run(item.payload)
      n++
    }
    this.clock.moveTo(t)
    this.hooks.emit('advanced', { time: t, label: 'advance' })
    return n
  }

  private run(task: Task): void {
    const time = this.clock.now()
    this.hooks.emit('beforeEvent', { time, label: task.label })
    task.fn()
    this.processed++
    this.hooks.emit('afterEvent', { time, label: task.label })
  }
}
