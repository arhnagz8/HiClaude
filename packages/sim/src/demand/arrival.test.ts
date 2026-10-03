import { describe, expect, it } from 'vitest'
import { MS, createRng, fromIrst } from '@hiclaude/contracts'
import { ArrivalProcess, type ArrivalInputs } from './arrival'
import { SeasonalityModel, builtinCalendar } from './seasonality'
import { loadSegmentsConfig } from './segments'
import { makeEnv } from './testing'
import { mean } from './common'

const baseInputs = (o: Partial<ArrivalInputs> = {}): ArrivalInputs => ({ macroDemandMultiplier: 1, reputationMultiplier: 1, sources: [], ...o })

describe('ArrivalProcess', () => {
  it('uses 15-minute buckets', () => {
    expect(makeEnv().arrivals.bucketMinutes).toBe(15)
  })
  it('sampled bucket counts match the expected Poisson mean', () => {
    const { arrivals } = makeEnv(7)
    const t0 = fromIrst(2026, 10, 3, 21, 0) // Saturday 21:00 peak
    const exp = arrivals.expectedTotal(t0, baseInputs({ sources: [{ source: 'seo', visitsPerDay: 3000 }] }))
    const counts: number[] = []
    for (let i = 0; i < 400; i++) counts.push(arrivals.sampleBucket(t0, baseInputs({ sources: [{ source: 'seo', visitsPerDay: 3000 }] })).length)
    expect(exp).toBeGreaterThan(10)
    expect(mean(counts) / exp).toBeGreaterThan(0.95)
    expect(mean(counts) / exp).toBeLessThan(1.05)
  })
  it('small-λ buckets are Poisson dispersed (var ≈ mean per segment-sum)', () => {
    const { arrivals, cfg } = makeEnv(3)
    const solo = new ArrivalProcess({ ...cfg, segments: [cfg.segments.find((s) => s.id === 'student')!].map((s) => ({ ...s, share: 1 })) }, new SeasonalityModel(cfg, builtinCalendar()), createRng(3))
    void arrivals
    const t0 = fromIrst(2026, 10, 3, 14, 0)
    const lam = solo.expectedTotal(t0, baseInputs())
    const xs: number[] = []
    for (let i = 0; i < 4000; i++) xs.push(solo.sampleBucket(t0, baseInputs()).length)
    const m = mean(xs)
    const v = xs.reduce((a, x) => a + (x - m) * (x - m), 0) / (xs.length - 1)
    expect(lam).toBeLessThan(10)
    expect(m).toBeCloseTo(lam, 0)
    expect(v / m).toBeGreaterThan(0.85)
    expect(v / m).toBeLessThan(1.15)
  })
  it('evening peak vs night trough ≥ 5x', () => {
    const { arrivals } = makeEnv()
    const peak = arrivals.expectedTotal(fromIrst(2026, 10, 3, 21, 0), baseInputs())
    const trough = arrivals.expectedTotal(fromIrst(2026, 10, 3, 4, 0), baseInputs())
    expect(peak / trough).toBeGreaterThan(5)
  })
  it('expected daily volume ≈ organic visits/day (diurnal mean 1) on a normal weekday', () => {
    const { arrivals, cfg } = makeEnv()
    const day = fromIrst(2026, 10, 4, 0, 0) // Sunday, no holiday
    let tot = 0
    for (let i = 0; i < 96; i++) tot += arrivals.expectedTotal(day + i * 15 * MS.minute, baseInputs())
    // seasonality of Mehr (student/exam months) can lift a few segments; allow ±25%
    expect(tot / cfg.organicVisitsPerDay).toBeGreaterThan(0.8)
    expect(tot / cfg.organicVisitsPerDay).toBeLessThan(1.3)
  })
  it('macro and reputation multipliers scale λ linearly', () => {
    const { arrivals } = makeEnv()
    const t0 = fromIrst(2026, 10, 3, 20, 0)
    const a = arrivals.expectedTotal(t0, baseInputs())
    expect(arrivals.expectedTotal(t0, baseInputs({ macroDemandMultiplier: 2 }))).toBeCloseTo(2 * a, 9)
    expect(arrivals.expectedTotal(t0, baseInputs({ reputationMultiplier: 0.5 }))).toBeCloseTo(0.5 * a, 9)
    expect(arrivals.expectedTotal(t0, baseInputs({ scenarioMultiplier: 0.4 }))).toBeCloseTo(0.4 * a, 9)
  })
  it('segment multipliers shock one segment only', () => {
    const { arrivals } = makeEnv()
    const t0 = fromIrst(2026, 10, 3, 20, 0)
    const a = arrivals.expectedRates(t0, baseInputs())
    const b = arrivals.expectedRates(t0, baseInputs({ segmentMultipliers: { gamer: 0 } }))
    expect(b.find((c) => c.segmentId === 'gamer')?.lambda ?? 0).toBe(0)
    expect(b.find((c) => c.segmentId === 'student')!.lambda).toBeCloseTo(a.find((c) => c.segmentId === 'student')!.lambda, 12)
  })
  it('marketing sources add traffic and respect their segment mix', () => {
    const { arrivals } = makeEnv()
    const t0 = fromIrst(2026, 10, 3, 20, 0)
    const cells = arrivals.expectedRates(t0, baseInputs({ includeOrganic: false, sources: [{ source: 'b2b', visitsPerDay: 100, segmentMix: { importer_trader: 1 } }] }))
    const nonFraud = cells.filter((c) => c.segmentId !== 'fraudster')
    expect(nonFraud.every((c) => c.segmentId === 'importer_trader')).toBe(true)
    expect(cells.some((c) => c.segmentId === 'fraudster')).toBe(true) // fraud scales with traffic
  })
  it('channel tilt steers the channel mix', () => {
    const { arrivals } = makeEnv(11)
    const t0 = fromIrst(2026, 10, 3, 21, 0)
    const inp = baseInputs({ includeOrganic: false, sources: [{ source: 'telegram_channels', visitsPerDay: 20000, channelTilt: { telegram: 20, web: 0.05, bale: 0.05 } }] })
    const drafts = Array.from({ length: 30 }, () => arrivals.sampleBucket(t0, inp)).flat()
    const tg = drafts.filter((d) => d.channel === 'telegram').length / drafts.length
    expect(drafts.length).toBeGreaterThan(200)
    expect(tg).toBeGreaterThan(0.9)
  })
  it('drafts are inside the bucket, sorted, with unique ids', () => {
    const { arrivals } = makeEnv(5)
    const t0 = fromIrst(2026, 10, 3, 21, 0)
    const d = arrivals.sampleBucket(t0, baseInputs({ sources: [{ source: 'seo', visitsPerDay: 5000 }] }))
    expect(d.length).toBeGreaterThan(5)
    for (let i = 0; i < d.length; i++) {
      expect(d[i]!.at).toBeGreaterThanOrEqual(t0)
      expect(d[i]!.at).toBeLessThan(t0 + 15 * MS.minute)
      if (i > 0) expect(d[i]!.at).toBeGreaterThanOrEqual(d[i - 1]!.at)
    }
    expect(new Set(d.map((x) => x.id)).size).toBe(d.length)
  })
  it('is deterministic per seed and differs across seeds', () => {
    const run = (seed: number) => {
      const { arrivals } = makeEnv(seed)
      const out: string[] = []
      for (let i = 0; i < 50; i++) out.push(...arrivals.sampleBucket(fromIrst(2026, 10, 3, 18, 0) + i * 15 * MS.minute, baseInputs({ sources: [{ source: 'seo', visitsPerDay: 800 }] })).map((d) => `${d.at}:${d.segmentId}:${d.source}:${d.channel}`))
      return out.join('|')
    }
    expect(run(1)).toBe(run(1))
    expect(run(1)).not.toBe(run(2))
  })
  it('adding a segment stream does not perturb other segments (named forks)', () => {
    const cfg = loadSegmentsConfig({ useResearch: false })
    const seas = new SeasonalityModel(cfg, builtinCalendar())
    const a = new ArrivalProcess(cfg, seas, createRng(9))
    const cfg2 = { ...cfg, segments: cfg.segments.filter((s) => s.id !== 'gamer').map((s) => ({ ...s })) }
    const b = new ArrivalProcess(cfg2, seas, createRng(9))
    const t0 = fromIrst(2026, 10, 3, 21, 0)
    const sa = a.sampleBucket(t0, baseInputs()).filter((d) => d.segmentId === 'student').map((d) => d.at)
    const sb = b.sampleBucket(t0, baseInputs()).filter((d) => d.segmentId === 'student').map((d) => d.at)
    expect(sa).toEqual(sb)
  })
})
