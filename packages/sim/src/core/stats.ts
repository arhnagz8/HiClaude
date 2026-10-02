import type { EpochMs } from '@hiclaude/contracts'

class Ring<T> {
  private buf: T[] = []
  private head = 0
  constructor(readonly capacity: number) {}
  push(v: T): void {
    if (this.buf.length < this.capacity) this.buf.push(v)
    else {
      this.buf[this.head] = v
      this.head = (this.head + 1) % this.capacity
    }
  }
  toArray(): T[] {
    if (this.buf.length < this.capacity) return this.buf.slice()
    return [...this.buf.slice(this.head), ...this.buf.slice(0, this.head)]
  }
  get length(): number {
    return this.buf.length
  }
}

export interface HistogramSummary {
  count: number
  sum: number
  mean: number
  min: number
  max: number
  p50: number
  p90: number
  p99: number
}

class Histogram {
  count = 0
  sum = 0
  min = Infinity
  max = -Infinity
  private readonly ring: Ring<number>
  constructor(capacity: number) {
    this.ring = new Ring<number>(capacity)
  }
  observe(v: number): void {
    this.count++
    this.sum += v
    if (v < this.min) this.min = v
    if (v > this.max) this.max = v
    this.ring.push(v)
  }
  summary(): HistogramSummary {
    const s = this.ring.toArray().sort((a, b) => a - b)
    const q = (p: number) => (s.length === 0 ? 0 : (s[Math.min(s.length - 1, Math.floor(p * s.length))] as number))
    return {
      count: this.count,
      sum: this.sum,
      mean: this.count ? this.sum / this.count : 0,
      min: this.count ? this.min : 0,
      max: this.count ? this.max : 0,
      p50: q(0.5),
      p90: q(0.9),
      p99: q(0.99),
    }
  }
}

export interface StatsSnapshot {
  counters: Record<string, number>
  gauges: Record<string, number>
  histograms: Record<string, HistogramSummary>
  series: Record<string, { t: EpochMs; v: number }[]>
}

/** Counters, gauges, histograms (quantiles over a ring of recent samples) and time series (ring buffers). Deterministic. */
export class StatsCollector {
  private readonly counters = new Map<string, number>()
  private readonly gauges = new Map<string, number>()
  private readonly hists = new Map<string, Histogram>()
  private readonly seriesMap = new Map<string, Ring<{ t: EpochMs; v: number }>>()

  constructor(private readonly opts: { histogramSamples?: number; seriesPoints?: number } = {}) {}

  inc(name: string, by = 1): void {
    this.counters.set(name, (this.counters.get(name) ?? 0) + by)
  }
  counter(name: string): number {
    return this.counters.get(name) ?? 0
  }
  gauge(name: string, v: number): void {
    this.gauges.set(name, v)
  }
  gaugeValue(name: string): number | undefined {
    return this.gauges.get(name)
  }
  observe(name: string, v: number): void {
    let h = this.hists.get(name)
    if (!h) {
      h = new Histogram(this.opts.histogramSamples ?? 2048)
      this.hists.set(name, h)
    }
    h.observe(v)
  }
  histogram(name: string): HistogramSummary | undefined {
    return this.hists.get(name)?.summary()
  }
  record(name: string, t: EpochMs, v: number): void {
    let r = this.seriesMap.get(name)
    if (!r) {
      r = new Ring(this.opts.seriesPoints ?? 4096)
      this.seriesMap.set(name, r)
    }
    r.push({ t, v })
  }
  seriesOf(name: string): { t: EpochMs; v: number }[] {
    return this.seriesMap.get(name)?.toArray() ?? []
  }
  snapshot(): StatsSnapshot {
    const sortedEntries = <V>(m: Map<string, V>) => [...m.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return {
      counters: Object.fromEntries(sortedEntries(this.counters)),
      gauges: Object.fromEntries(sortedEntries(this.gauges)),
      histograms: Object.fromEntries(sortedEntries(this.hists).map(([k, h]) => [k, h.summary()])),
      series: Object.fromEntries(sortedEntries(this.seriesMap).map(([k, r]) => [k, r.toArray()])),
    }
  }
}
