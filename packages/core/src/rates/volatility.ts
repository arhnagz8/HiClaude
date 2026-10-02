/**
 * VolatilityEstimator — streaming EWMA volatility/drift of the USDT/IRT mid.
 *
 * Method
 *  1. Irregular `push(ts, mid)` ticks are resampled to HOURLY closes (last tick of each hour bucket, carried forward).
 *  2. When an hour bucket closes, its log-return `r = ln(close_h / close_{h-k})` over `k ≥ 1` hours (k > 1 when ticks were missing)
 *     updates two exponentially-decayed, bias-corrected sums (continuous-time EWMA with half-life `halflifeHours`):
 *        S_w ← d·S_w + k           S_v ← d·S_v + r²/k·k = d·S_v + r²      S_m ← d·S_m + r      with d = 0.5^(k/halflife)
 *     per-hour variance = S_v / S_w, per-hour drift = S_m / S_w   (bias-corrected: no initialisation bias).
 *  3. `dailyPct = sqrt(24·var_h)`, `driftPctPerDay = expm1(24·m_h)`.   **Both are FRACTIONS** (0.012 = 1.2 %).
 *  4. Fewer than `minSamples` hourly observations ⇒ fall back to `defaultDailyPct` and `defaultDriftPctPerDay`.
 *
 * Complexity: O(1) per `push` and O(1) memory (a ring buffer of the last `windowHours` hourly closes is kept only to report the window
 * and to support `state()/restore()`). Fully deterministic — no clock, no randomness.
 */
import { MS } from '@hiclaude/contracts'

export interface VolatilityEstimate {
  /** Daily volatility as a FRACTION (0.012 = 1.2 %). */
  dailyPct: number
  /** Expected drift per day as a signed FRACTION (0.001 = +0.1 %/day). */
  driftPctPerDay: number
  /** Hours of data currently backing the estimate (≤ capacity of the ring buffer). */
  windowHours: number
}

export interface VolatilityOptions {
  /** EWMA half-life in hours (default 72). */
  halflifeHours?: number
  /** Minimum number of hourly observations before the EWMA is trusted (default 24). */
  minSamples?: number
  /** Fallback daily volatility fraction (default 0.012 = 1.2 %). */
  defaultDailyPct?: number
  /** Fallback drift per day fraction (default 0). */
  defaultDriftPctPerDay?: number
  /** Ring-buffer capacity in hourly closes (default 336 = 14 days). */
  capacityHours?: number
}

export interface VolatilityState {
  /** Last finalised hourly close (bucket index = floor(ts / 1h), price). */
  lastBucket: number | null
  lastClose: number | null
  /** The hour bucket still open and its latest price. */
  pendingBucket: number | null
  pendingPrice: number | null
  sw: number
  sv: number
  sm: number
  samples: number
  ring: { bucket: number; close: number }[]
  lastTs: number | null
}

const HOUR = MS.hour

export class VolatilityEstimator {
  private readonly halflife: number
  private readonly minSamples: number
  private readonly defDaily: number
  private readonly defDrift: number
  private readonly cap: number

  /** Last FINALISED hourly close (bucket index, price). */
  private lastBucket: number | null = null
  private lastClose: number | null = null
  /** Currently open bucket and its latest price. */
  private pendingBucket: number | null = null
  private pendingPrice: number | null = null

  private sw = 0
  private sv = 0
  private sm = 0
  private samples = 0
  private lastTs: number | null = null

  // ring buffer of finalised hourly closes
  private ring: { bucket: number; close: number }[] = []
  private ringHead = 0

  constructor(opts: VolatilityOptions = {}) {
    this.halflife = opts.halflifeHours ?? 72
    this.minSamples = opts.minSamples ?? 24
    this.defDaily = opts.defaultDailyPct ?? 0.012
    this.defDrift = opts.defaultDriftPctPerDay ?? 0
    this.cap = opts.capacityHours ?? 336
    if (!(this.halflife > 0)) throw new RangeError('halflifeHours must be > 0')
    if (!(this.cap >= 2)) throw new RangeError('capacityHours must be ≥ 2')
  }

  /** Feeds a mid-price observation. Out-of-order or non-positive/non-finite ticks are ignored. O(1). */
  push(ts: number, mid: number): void {
    if (!Number.isFinite(ts) || !Number.isFinite(mid) || mid <= 0) return
    if (this.lastTs !== null && ts < this.lastTs) return
    this.lastTs = ts
    const bucket = Math.floor(ts / HOUR)
    if (this.pendingBucket === null) {
      this.pendingBucket = bucket
      this.pendingPrice = mid
      return
    }
    if (bucket === this.pendingBucket) {
      this.pendingPrice = mid
      return
    }
    // bucket rolled over: finalise the pending bucket's close
    this.finalise(this.pendingBucket, this.pendingPrice as number)
    this.pendingBucket = bucket
    this.pendingPrice = mid
  }

  private finalise(bucket: number, close: number): void {
    if (this.lastBucket !== null && this.lastClose !== null) {
      const k = bucket - this.lastBucket
      if (k >= 1) {
        const r = Math.log(close / this.lastClose)
        const d = Math.pow(0.5, k / this.halflife)
        this.sw = d * this.sw + k
        this.sv = d * this.sv + r * r
        this.sm = d * this.sm + r
        this.samples += 1
      }
    }
    this.lastBucket = bucket
    this.lastClose = close
    // ring buffer
    const item = { bucket, close }
    if (this.ring.length < this.cap) this.ring.push(item)
    else {
      this.ring[this.ringHead] = item
      this.ringHead = (this.ringHead + 1) % this.cap
    }
  }

  /** Number of hourly return observations absorbed so far. */
  get sampleCount(): number {
    return this.samples
  }

  /** Current estimate. Falls back to defaults until `minSamples` hourly observations exist. O(1). */
  estimate(): VolatilityEstimate {
    const windowHours = this.windowHours()
    if (this.samples < this.minSamples || this.sw <= 0) {
      return { dailyPct: this.defDaily, driftPctPerDay: this.defDrift, windowHours }
    }
    const varH = this.sv / this.sw
    const mH = this.sm / this.sw
    const daily = Math.sqrt(24 * varH)
    const drift = Math.expm1(24 * mH)
    return {
      dailyPct: Number.isFinite(daily) ? daily : this.defDaily,
      driftPctPerDay: Number.isFinite(drift) ? drift : this.defDrift,
      windowHours,
    }
  }

  private windowHours(): number {
    if (this.ring.length < 2) return 0
    let oldest: number
    let newest: number
    if (this.ring.length < this.cap) {
      oldest = (this.ring[0] as { bucket: number }).bucket
      newest = (this.ring[this.ring.length - 1] as { bucket: number }).bucket
    } else {
      oldest = (this.ring[this.ringHead] as { bucket: number }).bucket
      newest = (this.ring[(this.ringHead + this.cap - 1) % this.cap] as { bucket: number }).bucket
    }
    return newest - oldest
  }

  /** Serialisable state (for persistence across restarts). */
  state(): VolatilityState {
    const ordered = this.ring.length < this.cap ? [...this.ring] : [...this.ring.slice(this.ringHead), ...this.ring.slice(0, this.ringHead)]
    return {
      lastBucket: this.lastBucket,
      lastClose: this.lastClose,
      pendingBucket: this.pendingBucket,
      pendingPrice: this.pendingPrice,
      sw: this.sw,
      sv: this.sv,
      sm: this.sm,
      samples: this.samples,
      ring: ordered,
      lastTs: this.lastTs,
    }
  }

  /** Restores a state produced by `state()` (same options expected). */
  restore(s: VolatilityState): void {
    this.lastBucket = s.lastBucket
    this.lastClose = s.lastClose
    this.pendingBucket = s.pendingBucket
    this.pendingPrice = s.pendingPrice
    this.sw = s.sw
    this.sv = s.sv
    this.sm = s.sm
    this.samples = s.samples
    this.lastTs = s.lastTs
    this.ring = s.ring.slice(-this.cap)
    this.ringHead = 0
  }
}
