/**
 * EventScheduler: maps scenario/runtime events to component applyEvent() calls, with start/end and automatic reversal; keeps an event history.
 * A component that does not handle an event returns null (several components may handle one type: see EVENT_REGISTRY targets).
 */
import { MS, type EpochMs } from '@hiclaude/contracts'
import type { EventHandle, Params, SimComponent, SimEnv } from '../core/types'
import type { TimerHandle } from '../core/simulation'
import { EVENT_REGISTRY, type ComponentKey } from './registry'

export interface ScheduledEventSpec {
  day: number
  type: string
  durationDays?: number | null
  /** optional start time within the day, IRST hours (default 0) */
  atHour?: number
  params?: Params
}

export interface ActiveEvent {
  id: string
  type: string
  params: Params
  startedAt: EpochMs
  /** null = permanent (never reverted automatically) */
  endsAt: EpochMs | null
  handled: number
  ended: boolean
  titleFa: string
}

export type ComponentMap = Partial<Record<ComponentKey, SimComponent[]>>

export class EventScheduler {
  private seq = 0
  private readonly all: ActiveEvent[] = []
  private readonly handles = new Map<string, EventHandle[]>()
  private readonly timers = new Map<string, TimerHandle>()
  private pending: { spec: ScheduledEventSpec; timer: TimerHandle }[] = []

  constructor(
    private readonly env: SimEnv,
    private readonly originMs: EpochMs,
    private readonly components: ComponentMap,
  ) {}

  /** Schedule scenario events at originMs + day (+ atHour). Events in the past start at the next processing step. */
  schedule(specs: ScheduledEventSpec[]): void {
    for (const spec of specs) {
      if (!(spec.type in EVENT_REGISTRY)) throw new RangeError(`unknown event type "${spec.type}"`)
      const at = this.originMs + Math.round(spec.day * MS.day + (spec.atHour ?? 0) * MS.hour)
      const timer = this.env.sim.at(at, () => void this.apply(spec.type, spec.params ?? {}, { durationDays: spec.durationDays }), { label: `event.${spec.type}`, priority: 10 })
      this.pending.push({ spec, timer })
    }
  }

  /** Apply an event now (runtime / demo control). `durationDays` null/undefined => permanent. */
  apply(type: string, params: Params = {}, opts: { durationDays?: number | null } = {}): ActiveEvent {
    const info = EVENT_REGISTRY[type]
    if (!info) throw new RangeError(`unknown event type "${type}"`)
    const now = this.env.clock.now()
    const dur = opts.durationDays ?? (typeof params.durationDays === 'number' ? params.durationDays : null)
    const full: Params = { ...params }
    if (dur !== null && full.durationDays === undefined) full.durationDays = dur
    const id = `ev${String(++this.seq).padStart(4, '0')}`
    const hs: EventHandle[] = []
    for (const key of info.targets) {
      for (const comp of this.components[key] ?? []) {
        const h = comp.applyEvent(type, full)
        if (h) hs.push(h)
      }
    }
    const ev: ActiveEvent = { id, type, params: full, startedAt: now, endsAt: dur === null ? null : now + Math.round(dur * MS.day), handled: hs.length, ended: false, titleFa: info.titleFa }
    this.all.push(ev)
    this.handles.set(id, hs)
    this.env.stats.inc('events.applied')
    this.env.log.emit('event.start', 'events', { id, type, params: full, handled: hs.length, endsAt: ev.endsAt })
    if (hs.length === 0) this.env.stats.inc('events.unhandled')
    if (ev.endsAt !== null) this.timers.set(id, this.env.sim.at(ev.endsAt, () => this.end(id), { label: `event.end.${type}`, priority: 10 }))
    return ev
  }

  /** Revert an event now (idempotent). */
  end(id: string): boolean {
    const ev = this.all.find((e) => e.id === id)
    if (!ev || ev.ended) return false
    ev.ended = true
    for (const h of this.handles.get(id) ?? []) h.revert()
    this.timers.get(id)?.cancel()
    this.env.log.emit('event.end', 'events', { id, type: ev.type })
    return true
  }

  active(): ActiveEvent[] {
    return this.all.filter((e) => !e.ended)
  }
  history(): ActiveEvent[] {
    return [...this.all]
  }
  pendingCount(): number {
    return this.pending.filter((p) => p.timer.time >= this.env.clock.now()).length
  }
}
