import { MS, type EpochMs, type Rng } from '@hiclaude/contracts'
import { clamp, logNormalMedian } from './util'

export interface OutageModel {
  /** probability of at least one outage window per 30-day month */
  probPerMonth: number
  medianMs: number
  sigma: number
  minMs: number
  maxMs: number
}

/**
 * Outage calendar: random windows (at most one per 30-day month, generated lazily from a per-month RNG fork so that
 * the schedule is independent of query order) plus explicitly injected windows (scenario events).
 */
export class OutageCalendar {
  private readonly injected: { from: EpochMs; to: EpochMs }[] = []
  private readonly cache = new Map<number, { from: EpochMs; to: EpochMs } | null>()

  constructor(
    private readonly originMs: EpochMs,
    private readonly rng: Rng,
    private model: OutageModel,
  ) {}

  setModel(m: Partial<OutageModel>): void {
    this.model = { ...this.model, ...m }
    this.cache.clear()
  }

  inject(from: EpochMs, to: EpochMs): () => void {
    const w = { from, to }
    this.injected.push(w)
    return () => {
      const i = this.injected.indexOf(w)
      if (i >= 0) this.injected.splice(i, 1)
    }
  }

  private month(k: number): { from: EpochMs; to: EpochMs } | null {
    if (k < 0) return null
    if (this.cache.has(k)) return this.cache.get(k) ?? null
    const r = this.rng.fork(`outage:${k}`)
    let w: { from: EpochMs; to: EpochMs } | null = null
    if (r.bool(this.model.probPerMonth)) {
      const from = this.originMs + k * 30 * MS.day + Math.floor(r.next() * 30 * MS.day)
      w = { from, to: from + Math.round(clamp(logNormalMedian(r, this.model.medianMs, this.model.sigma), this.model.minMs, this.model.maxMs)) }
    }
    this.cache.set(k, w)
    return w
  }

  /** The active window covering t (the one ending latest), or null. */
  windowAt(t: EpochMs): { from: EpochMs; to: EpochMs } | null {
    let best: { from: EpochMs; to: EpochMs } | null = null
    const consider = (w: { from: EpochMs; to: EpochMs } | null) => {
      if (w && t >= w.from && t < w.to && (!best || w.to > best.to)) best = w
    }
    for (const w of this.injected) consider(w)
    const k = Math.floor((t - this.originMs) / (30 * MS.day))
    consider(this.month(k - 1))
    consider(this.month(k))
    return best
  }

  isDown(t: EpochMs): boolean {
    return this.windowAt(t) !== null
  }
}
