import type { Clock, EpochMs } from '@hiclaude/contracts'
import { sha256Hex, stableStringify } from './hash'

export interface WorldEvent {
  seq: number
  t: EpochMs
  type: string
  source: string
  data: Record<string, unknown>
}

export type WorldEventListener = (e: WorldEvent) => void

/**
 * Append-only world event log with a rolling hash over ALL events (even those dropped from the in-memory ring).
 * Two runs with the same (scenario, seed, calls) must produce the same `hash()`.
 */
export class EventLog {
  private readonly ring: WorldEvent[] = []
  private chain = sha256Hex('hiclaude-sim-event-log')
  private seq = 0
  private readonly listeners = new Map<string, WorldEventListener[]>()

  constructor(
    private readonly clock: Clock,
    private readonly maxEntries = 500_000,
  ) {}

  emit(type: string, source: string, data: Record<string, unknown> = {}): WorldEvent {
    const e: WorldEvent = { seq: ++this.seq, t: this.clock.now(), type, source, data }
    this.chain = sha256Hex(`${this.chain}|${e.seq}|${e.t}|${type}|${source}|${stableStringify(data)}`)
    this.ring.push(e)
    if (this.ring.length > this.maxEntries) this.ring.splice(0, this.ring.length - this.maxEntries)
    for (const fn of this.listeners.get(type) ?? []) fn(e)
    for (const fn of this.listeners.get('*') ?? []) fn(e)
    return e
  }

  /** Listen to one event type (or '*'). Returns an unsubscribe function. */
  subscribe(type: string, fn: WorldEventListener): () => void {
    const arr = this.listeners.get(type) ?? []
    arr.push(fn)
    this.listeners.set(type, arr)
    return () => {
      const a = this.listeners.get(type)
      if (!a) return
      const i = a.indexOf(fn)
      if (i >= 0) a.splice(i, 1)
    }
  }

  get count(): number {
    return this.seq
  }

  entries(filter?: { type?: string; source?: string; since?: EpochMs }): WorldEvent[] {
    return this.ring.filter((e) => (!filter?.type || e.type === filter.type) && (!filter?.source || e.source === filter.source) && (filter?.since === undefined || e.t >= filter.since))
  }

  hash(): string {
    return this.chain
  }

  toJsonl(): string {
    return this.ring.map((e) => JSON.stringify(e)).join('\n')
  }
}
