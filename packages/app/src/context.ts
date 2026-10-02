import type { AppPorts, Clock, DomainEvent, EventBus, IdGen, Logger, PlatformParams, Rng } from '@hiclaude/contracts'
import type { Database } from './db'
import type { Repos } from './repos'
import type { RunMode } from './crypto'
import type { CostRecorder } from './util'

/**
 * Everything a service needs. Engine services written later (B3) receive the same context:
 *   new OrderService(app.ctx)
 * `params()` always returns the *effective* params (defaults ← files ← DB overrides), so never cache its result across awaits
 * if you must observe admin edits.
 */
export interface AppContext {
  clock: Clock
  rng: Rng
  ids: IdGen
  db: Database
  repos: Repos
  bus: EventBus
  ports: AppPorts
  logger: Logger
  mode: RunMode
  /** 32-byte hex master key for envelope encryption (dev key in non-live modes). */
  masterKeyHex: string
  params: () => PlatformParams
  /** Third-party cost events (SMS, KYC inquiries); subscribe to book them in the ledger. */
  costs: CostRecorder
  /** Publish helper that stamps nothing — convenience alias for `bus.publish`. */
  publish: (e: DomainEvent) => void
}
