import { ManualClock, type EpochMs } from '@hiclaude/contracts'

/** Virtual clock owned by the world. Forward-only; no wall-clock access anywhere. */
export class SimClock extends ManualClock {
  constructor(start: EpochMs = 0) {
    super(start)
  }
  /** Move to `t` if it is in the future; no-op for the present; throws for the past. */
  moveTo(t: EpochMs): void {
    if (t === this.t) return
    this.set(t)
  }
}
