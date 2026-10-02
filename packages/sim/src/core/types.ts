import type { Clock, EpochMs } from '@hiclaude/contracts'
import type { EventLog } from './eventLog'
import type { Simulation } from './simulation'
import type { StatsCollector } from './stats'

export type Params = Record<string, unknown>

/** Handle returned when a scenario/runtime event is applied; `revert()` undoes it (idempotent). */
export interface EventHandle {
  id: string
  revert(): void
}

/** Every world component can receive scenario/runtime events. Returns null when it does not handle `type`. */
export interface SimComponent {
  readonly name: string
  applyEvent(type: string, params: Params): EventHandle | null
}

/** Shared environment handed to every component by the World (or by a test harness). */
export interface SimEnv {
  sim: Simulation
  log: EventLog
  stats: StatsCollector
  /** convenience: sim.clock */
  clock: Clock
}

export const EVENT_HANDLE_SEQ = { n: 0 }
/** Deterministic handle ids (per process counter is fine: ids are not part of the hashed log). */
export function newHandleId(prefix: string): string {
  EVENT_HANDLE_SEQ.n += 1
  return `${prefix}#${EVENT_HANDLE_SEQ.n}`
}

export interface TimeWindow {
  from: EpochMs
  to: EpochMs
}

export function inWindow(t: EpochMs, w: TimeWindow): boolean {
  return t >= w.from && t < w.to
}

// ───────── small param readers for applyEvent(params) ─────────
export function pNum(p: Params, key: string, dflt: number): number {
  const v = p[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : dflt
}
export function pNumOrNull(p: Params, key: string): number | null | undefined {
  const v = p[key]
  if (v === null) return null
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}
export function pStr(p: Params, key: string): string | undefined {
  const v = p[key]
  return typeof v === 'string' ? v : undefined
}
export function pBool(p: Params, key: string, dflt: boolean): boolean {
  const v = p[key]
  return typeof v === 'boolean' ? v : dflt
}
