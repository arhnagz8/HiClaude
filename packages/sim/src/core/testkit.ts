/** Small helpers to build isolated component environments (unit tests of one component, or B5 tests). */
import { createRng, fromIrst, type EpochMs, type Rng } from '@hiclaude/contracts'
import { EventLog } from './eventLog'
import { Simulation } from './simulation'
import { StatsCollector } from './stats'
import type { SimEnv } from './types'

export const DEFAULT_START: EpochMs = fromIrst(2026, 10, 2) // Friday 2 Oct 2026 00:00 IRST

export interface TestEnv extends SimEnv {
  rng: Rng
}

export function makeEnv(opts: { start?: EpochMs; seed?: number | string } = {}): TestEnv {
  const sim = new Simulation(opts.start ?? DEFAULT_START)
  const log = new EventLog(sim.clock)
  const stats = new StatsCollector()
  const rng = createRng(opts.seed ?? 1)
  return { sim, log, stats, clock: sim.clock, rng }
}
