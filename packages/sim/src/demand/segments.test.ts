import { describe, expect, it } from 'vitest'
import { applyOpsGrowthOverrides, applySegmentOverrides, baseArrivalPerDay, gamma, loadSegmentsConfig, parseSegmentsConfig } from './segments'
import { readRepoJson, sum } from './common'

describe('segments config', () => {
  const cfg = loadSegmentsConfig({ useResearch: false })

  it('ships >= 8 customer segments plus a fraudster', () => {
    const normal = cfg.segments.filter((s) => !s.fraud)
    expect(normal.length).toBeGreaterThanOrEqual(8)
    expect(cfg.segments.some((s) => s.id === 'fraudster' && s.fraud)).toBe(true)
  })
  it('covers the briefed archetypes', () => {
    const ids = cfg.segments.map((s) => s.id)
    for (const id of ['student', 'freelance_dev', 'designer', 'gamer', 'ads_manager', 'importer_trader', 'exam_applicant', 'traveller', 'parent_tuition']) expect(ids).toContain(id)
  })
  it('shares sum to 1 and fraud share is small', () => {
    expect(sum(cfg.segments.map((s) => s.share))).toBeCloseTo(1, 9)
    expect(cfg.segments.find((s) => s.fraud)!.share).toBeLessThanOrEqual(0.03)
  })
  it('every segment documents its source and has sane parameters', () => {
    for (const s of cfg.segments) {
      expect(s.source.length).toBeGreaterThan(5)
      expect(s.baseConversion).toBeGreaterThan(0)
      expect(s.baseConversion).toBeLessThan(s.fraud ? 0.5 : 1 / (1 + cfg.competitorsConsidered))
      expect(sum(Object.values(s.paymentPreference))).toBeGreaterThan(0.99)
      expect(s.monthSeasonality).toHaveLength(12)
    }
  })
  it('base arrival rates add up to the organic visits/day', () => {
    expect(sum(cfg.segments.map((s) => baseArrivalPerDay(cfg, s)))).toBeCloseTo(cfg.organicVisitsPerDay, 6)
  })
  it('rejects shares that do not sum to 1', () => {
    const raw = JSON.parse(JSON.stringify(readRepoJson('data/sim/segments.json')))
    raw.segments[0].share = 0.5
    expect(() => parseSegmentsConfig(raw)).toThrow()
  })
  it('rejects duplicate segment ids', () => {
    const raw = JSON.parse(JSON.stringify(readRepoJson('data/sim/segments.json')))
    raw.segments[1].id = raw.segments[0].id
    expect(() => parseSegmentsConfig(raw)).toThrow(/duplicate/)
  })
  it('gamma function', () => {
    expect(gamma(5)).toBeCloseTo(24, 6)
    expect(gamma(0.5)).toBeCloseTo(Math.sqrt(Math.PI), 6)
    expect(gamma(1)).toBeCloseTo(1, 8)
  })
})

describe('research overrides (tolerant)', () => {
  const cfg = loadSegmentsConfig({ useResearch: false })
  it('absent / garbage research data leaves defaults untouched', () => {
    expect(applyOpsGrowthOverrides(cfg, undefined)).toEqual(cfg)
    expect(applyOpsGrowthOverrides(cfg, 'nope')).toEqual(cfg)
    expect(applyOpsGrowthOverrides(cfg, { segments: 42 }).segments.map((s) => s.share)).toEqual(cfg.segments.map((s) => s.share))
  })
  it('applies Record-wrapped overrides by id/alias and renormalises shares', () => {
    const rec = (v: unknown) => ({ value: v, unit: 'x', as_of: '2026-10-02', confidence: 'low' })
    const out = applyOpsGrowthOverrides(cfg, {
      segments: [
        { id: 'freelancer', share: rec(0.2), aov_usd: rec(100), price_sensitivity: rec(-10), orders_per_year: rec(12), preferred_channel: 'telegram' },
        { id: 'gamer', share: rec(0.1) },
      ],
    })
    expect(sum(out.segments.map((s) => s.share))).toBeCloseTo(1, 9)
    const fl = out.segments.find((s) => s.id === 'freelance_dev')!
    expect(fl.share).toBeGreaterThan(0.15)
    expect(fl.beta.price).toBe(10)
    expect(fl.channelAffinity.telegram).toBeGreaterThanOrEqual(0.6)
    const aov = fl.basket.reduce((a, b, _i, arr) => a + (b.weight / sum(arr.map((x) => x.weight))) * b.medianUsd * Math.exp((b.sigma * b.sigma) / 2), 0)
    expect(aov).toBeCloseTo(100, 4)
    const g = gamma(1 + 1 / fl.repeat.weibullShape)
    expect(fl.repeat.weibullScaleDays * g).toBeCloseTo(365 / 12, 4)
  })
  it('accepts segments as an object keyed by id', () => {
    const out = applyOpsGrowthOverrides(cfg, { segments: { student: { share: 0.3 } } })
    expect(out.segments.find((s) => s.id === 'student')!.share).toBeGreaterThan(0.25)
    expect(sum(out.segments.map((s) => s.share))).toBeCloseTo(1, 9)
  })
  it('referral coefficient rescales referral propensity', () => {
    const cur = sum(cfg.segments.map((s) => s.share * s.referral.propensity * s.referral.meanReferred))
    const out = applyOpsGrowthOverrides(cfg, { referral_coefficient: { value: cur / 2, unit: 'x', as_of: 'a', confidence: 'low' } })
    const now = sum(out.segments.map((s) => s.share * s.referral.propensity * s.referral.meanReferred))
    expect(now).toBeCloseTo(cur / 2, 4)
  })
  it('scenario segment overrides are deep-merged and validated', () => {
    const out = applySegmentOverrides(cfg, { gamer: { beta: { price: 20 } } })
    const g = out.segments.find((s) => s.id === 'gamer')!
    expect(g.beta.price).toBe(20)
    expect(g.beta.speed).toBe(cfg.segments.find((s) => s.id === 'gamer')!.beta.speed)
    expect(() => applySegmentOverrides(cfg, { gamer: { baseConversion: 5 } })).toThrow()
  })
})
