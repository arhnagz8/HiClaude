/**
 * ArrivalProcess: visitors reaching us, sampled per 15-minute bucket as Poisson(λ·Δt).
 *   λ_seg(t) = Σ_sources visits/day(source) · mix_source(seg) · season(seg,t) · macro(t) · reputation(t) · scenarioSegmentMultiplier
 * Marketing contributes through `sources` (see marketing/), organic traffic is added automatically from the segments.
 * The competitor price effect is NOT applied here but in SellerChoice (conversion), to avoid double counting.
 */
import { startOfIrstDay, MS, type EpochMs, type Rng } from '@hiclaude/contracts'
import type { SeasonalityModel } from './seasonality'
import type { CustomerChannel, Segment, SegmentsConfig } from './types'
import { CUSTOMER_CHANNELS } from './types'

export interface SourceVisits {
  /** 'organic' | marketing channel id | 'referral' */
  source: string
  visitsPerDay: number
  /** Distribution over segments (normalised internally). Missing = organic segment shares. */
  segmentMix?: Record<string, number>
  /** Multiplicative tilt over segment channel affinity. */
  channelTilt?: Partial<Record<CustomerChannel, number>>
}

export interface ArrivalInputs {
  macroDemandMultiplier: number
  /** from Reputation.demandMultiplier() */
  reputationMultiplier: number
  /** marketing sources (organic is implicit; pass `includeOrganic:false` to suppress) */
  sources: SourceVisits[]
  /** scenario demand.marketMultiplier / shocks per segment (e.g. internet shutdown ⇒ 0.4) */
  scenarioMultiplier?: number
  segmentMultipliers?: Record<string, number>
  includeOrganic?: boolean
}

export interface ArrivalDraft {
  id: string
  at: EpochMs
  segmentId: string
  source: string
  channel: CustomerChannel
}

export interface RateCell {
  segmentId: string
  source: string
  /** expected arrivals in the bucket */
  lambda: number
}

export const BUCKET_MINUTES = 15

export class ArrivalProcess {
  private counter = 0
  private readonly rngs = new Map<string, Rng>()
  private readonly calCache = new Map<string, number>()
  private readonly bucketMs: number

  constructor(
    readonly cfg: SegmentsConfig,
    readonly seasonality: SeasonalityModel,
    private readonly rng: Rng,
    bucketMinutes: number = BUCKET_MINUTES,
    private readonly idPrefix = 'arr',
  ) {
    this.bucketMs = bucketMinutes * MS.minute
  }

  get bucketMinutes(): number {
    return this.bucketMs / MS.minute
  }

  private segRng(id: string): Rng {
    let r = this.rngs.get(id)
    if (!r) {
      r = this.rng.fork(`demand:${id}`)
      this.rngs.set(id, r)
    }
    return r
  }

  /** day-level calendar multiplier cached per (segment, IRST day); diurnal part computed per bucket. */
  private calendarMult(seg: Segment, ms: EpochMs): number {
    const key = `${seg.id}|${startOfIrstDay(ms)}`
    let v = this.calCache.get(key)
    if (v === undefined) {
      v = this.seasonality.calendar(seg, ms)
      if (this.calCache.size > 50_000) this.calCache.clear()
      this.calCache.set(key, v)
    }
    return v
  }

  /** Expected arrivals per (segment, source) for the bucket starting at t0. */
  expectedRates(t0: EpochMs, inputs: ArrivalInputs): RateCell[] {
    const mid = t0 + this.bucketMs / 2
    const dtDays = this.bucketMs / MS.day
    const global = inputs.macroDemandMultiplier * inputs.reputationMultiplier * (inputs.scenarioMultiplier ?? 1)
    const sources: SourceVisits[] = []
    if (inputs.includeOrganic !== false) sources.push({ source: 'organic', visitsPerDay: this.cfg.organicVisitsPerDay })
    for (const s of inputs.sources) sources.push(s)
    const out: RateCell[] = []
    for (const seg of this.cfg.segments) {
      const season = this.calendarMult(seg, mid) * this.seasonality.diurnal(seg, mid) * (inputs.segmentMultipliers?.[seg.id] ?? 1)
      for (const src of sources) {
        if (src.visitsPerDay <= 0) continue
        const mix = mixShare(this.cfg, src, seg)
        if (mix <= 0) continue
        out.push({ segmentId: seg.id, source: src.source, lambda: src.visitsPerDay * mix * season * global * dtDays })
      }
    }
    return out
  }

  /** Total expected arrivals in the bucket. */
  expectedTotal(t0: EpochMs, inputs: ArrivalInputs): number {
    let s = 0
    for (const c of this.expectedRates(t0, inputs)) s += c.lambda
    return s
  }

  /** Sample the arrivals of the bucket [t0, t0+Δ), sorted by time. */
  sampleBucket(t0: EpochMs, inputs: ArrivalInputs): ArrivalDraft[] {
    const cells = this.expectedRates(t0, inputs)
    const bySeg = new Map<string, RateCell[]>()
    for (const c of cells) {
      const l = bySeg.get(c.segmentId)
      if (l) l.push(c)
      else bySeg.set(c.segmentId, [c])
    }
    const out: ArrivalDraft[] = []
    const srcMeta = new Map<string, SourceVisits>()
    for (const s of inputs.sources) srcMeta.set(s.source, s)
    for (const seg of this.cfg.segments) {
      const list = bySeg.get(seg.id)
      if (!list) continue
      const r = this.segRng(seg.id)
      let total = 0
      for (const c of list) total += c.lambda
      const n = r.poisson(total)
      for (let i = 0; i < n; i++) {
        const cell = n === 1 && list.length === 1 ? (list[0] as RateCell) : r.weighted(list, list.map((c) => c.lambda))
        const tilt = srcMeta.get(cell.source)?.channelTilt
        const w = CUSTOMER_CHANNELS.map((ch) => seg.channelAffinity[ch] * (tilt?.[ch] ?? 1))
        const channel = r.weighted(CUSTOMER_CHANNELS, w.some((x) => x > 0) ? w : [1, 1, 1])
        out.push({ id: `${this.idPrefix}_${(++this.counter).toString(36)}`, at: t0 + Math.floor(r.next() * this.bucketMs), segmentId: seg.id, source: cell.source, channel })
      }
    }
    out.sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : 1))
    return out
  }
}

function mixShare(cfg: SegmentsConfig, src: SourceVisits, seg: Segment): number {
  if (!src.segmentMix || seg.fraud) return seg.share // fraud attempts scale with traffic, whatever its source
  let tot = 0
  for (const v of Object.values(src.segmentMix)) tot += v
  if (tot <= 0) return 0
  return (src.segmentMix[seg.id] ?? 0) / tot
}
