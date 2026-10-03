import { describe, expect, it } from 'vitest'
import { MS } from '@hiclaude/contracts'
import { Marketing, averageCpvIrt, hill, loadMarketingConfig, marginalCpvIrt, normaliseMix, parseMarketingConfig, steadyVisitsPerDay, applyOpsGrowthChannelOverrides, ltvToCac } from './index'
import { readRepoJson } from '../demand/common'

const cfg = loadMarketingConfig({ useResearch: false })
const ch = (id: string) => cfg.channels.find((c) => c.id === id)!
const run = (m: Marketing, days: number, inp = {}) => {
  let o = m.step(MS.day, inp)
  for (let i = 1; i < days; i++) o = m.step(MS.day, inp)
  return o
}
const total = (o: ReturnType<Marketing['step']>) => o.channels.reduce((a, c) => a + c.visitsPerDay, 0)

describe('marketing config', () => {
  it('ships the 7 paid channels from the brief plus a referral programme', () => {
    expect(cfg.channels.map((c) => c.id).sort()).toEqual(['b2b', 'bale_eitaa', 'influencers', 'instagram', 'price_comparison', 'seo', 'telegram_channels'])
    expect(cfg.referral.rewardIrtPerFirstOrder).toBeGreaterThan(0)
  })
  it('derives maxVisitsPerDay so that visits at half-saturation spend cost the documented CPV', () => {
    for (const c of cfg.channels) expect(averageCpvIrt(c, c.halfSaturationIrtPerMonth)).toBeCloseTo(c.cpvAtHalfSaturationIrt, 4)
  })
  it('default mix sums to 1 and references real channels', () => {
    expect(Object.values(cfg.defaultMix).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9)
  })
  it('rejects a mix with unknown channels or zero total', () => {
    expect(() => normaliseMix(cfg, { tiktok: 1 })).toThrow()
    expect(() => normaliseMix(cfg, { seo: 0 })).toThrow()
  })
  it('rejects malformed files', () => {
    const raw = JSON.parse(JSON.stringify(readRepoJson('data/sim/marketing.json')))
    raw.channels = raw.channels.filter((c: { type: string }) => c.type !== 'referral')
    expect(() => parseMarketingConfig(raw)).toThrow()
  })
  it('tolerant research overrides: cac_irt, saturation, wrapped records, unknown ids ignored', () => {
    const rec = (v: number) => ({ value: v, unit: 'IRT', as_of: '2026-10-02', confidence: 'low' })
    const out = applyOpsGrowthChannelOverrides(cfg, { channels: [{ id: 'telegram', cac_irt: rec(200_000), conversion: rec(0.05), saturation_irt_month: rec(70_000_000) }, { id: 'tiktok', cac_irt: rec(1) }] })
    const tg = out.channels.find((c) => c.id === 'telegram_channels')!
    expect(tg.cpvAtHalfSaturationIrt).toBeCloseTo(10_000, 6)
    expect(tg.halfSaturationIrtPerMonth).toBe(70_000_000)
    expect(averageCpvIrt(tg, tg.halfSaturationIrtPerMonth)).toBeCloseTo(10_000, 4)
    expect(applyOpsGrowthChannelOverrides(cfg, 'junk')).toEqual(cfg)
  })
})

describe('saturation curves', () => {
  it('Hill is 0 at 0, 1/2 at K, monotone and bounded by 1', () => {
    expect(hill(0, 10, 1.1)).toBe(0)
    expect(hill(10, 10, 1.1)).toBeCloseTo(0.5, 12)
    let prev = 0
    for (const s of [1, 5, 10, 50, 500, 1e6]) {
      const v = hill(s, 10, 1.1)
      expect(v).toBeGreaterThan(prev)
      expect(v).toBeLessThan(1)
      prev = v
    }
  })
  it('diminishing returns: marginal cost per visit rises with spend (h ≤ ~1.1 beyond K)', () => {
    const c = ch('instagram')
    const m1 = marginalCpvIrt(c, c.halfSaturationIrtPerMonth)
    const m2 = marginalCpvIrt(c, c.halfSaturationIrtPerMonth * 4)
    const m3 = marginalCpvIrt(c, c.halfSaturationIrtPerMonth * 16)
    expect(m2).toBeGreaterThan(m1)
    expect(m3).toBeGreaterThan(m2)
  })
  it('average CPV increases beyond saturation and visits never exceed Vmax', () => {
    const c = ch('seo')
    expect(averageCpvIrt(c, c.halfSaturationIrtPerMonth * 10)).toBeGreaterThan(averageCpvIrt(c, c.halfSaturationIrtPerMonth))
    expect(steadyVisitsPerDay(c, 1e15)).toBeLessThanOrEqual(c.maxVisitsPerDay)
  })
})

describe('Marketing dynamics', () => {
  it('zero budget ⇒ zero visits and zero spend', () => {
    const m = new Marketing(cfg, { monthlyBudgetIrt: 0 })
    const o = run(m, 30)
    expect(total(o)).toBe(0)
    expect(o.spendIrt).toBe(0)
    expect(m.sources()).toEqual([])
  })
  it('spend accrues pro-rata to the monthly budget', () => {
    const m = new Marketing(cfg, { monthlyBudgetIrt: 30_000_000 })
    let spent = 0
    for (let d = 0; d < 30; d++) spent += m.step(MS.day).spendIrt
    expect(spent).toBeCloseTo(30_000_000, 0)
  })
  it('adstock lag: SEO needs months to ramp, price comparison responds in days', () => {
    const a = new Marketing(cfg, { monthlyBudgetIrt: 100_000_000, mix: { seo: 1 } })
    const b = new Marketing(cfg, { monthlyBudgetIrt: 100_000_000, mix: { price_comparison: 1 } })
    const seoWeek = total(run(a, 7))
    const seoYear = total(run(a, 400))
    const pcWeek = total(run(b, 7))
    const pcYear = total(run(b, 400))
    expect(seoWeek / seoYear).toBeLessThan(0.2)
    expect(pcWeek / pcYear).toBeGreaterThan(0.9)
  })
  it('converges to the steady-state Hill value (small fatigue allowed)', () => {
    const c = ch('bale_eitaa')
    const m = new Marketing(cfg, { monthlyBudgetIrt: c.halfSaturationIrtPerMonth, mix: { bale_eitaa: 1 } })
    const o = run(m, 400)
    const r = o.channels.find((x) => x.channel === 'bale_eitaa')!
    expect(r.visitsPerDay).toBeCloseTo(steadyVisitsPerDay(c, c.halfSaturationIrtPerMonth) * (1 - r.fatigue), 0)
    expect(r.fatigue).toBeLessThan(c.fatigueMax * 0.5)
  })
  it('inflation erodes purchasing power of a nominal budget', () => {
    const a = new Marketing(cfg, { monthlyBudgetIrt: 60_000_000 })
    const b = new Marketing(cfg, { monthlyBudgetIrt: 60_000_000 })
    expect(total(run(b, 200, { costIndex: 1.6 }))).toBeLessThan(total(run(a, 200, { costIndex: 1 })) * 0.8)
  })
  it('heavy spend causes audience fatigue which recovers after cutting the budget', () => {
    const m = new Marketing(cfg, { monthlyBudgetIrt: 2_000_000_000, mix: { telegram_channels: 1 } })
    const o = run(m, 180)
    const fatigued = o.channels.find((x) => x.channel === 'telegram_channels')!.fatigue
    expect(fatigued).toBeGreaterThan(0.2)
    m.setBudget(0)
    const after = run(m, 400)
    expect(after.channels.find((x) => x.channel === 'telegram_channels')!.fatigue).toBeLessThan(fatigued * 0.1)
  })
  it('visits multiplier (scenario shock) scales all channels', () => {
    const a = new Marketing(cfg)
    const b = new Marketing(cfg)
    expect(total(run(b, 100, { visitsMultiplier: 0.4 }))).toBeCloseTo(total(run(a, 100)) * 0.4, 6)
  })
  it('setBudget re-mixes spend; unknown channel rejected; negative budget rejected', () => {
    const m = new Marketing(cfg)
    m.setBudget(10_000_000, { seo: 3, instagram: 1 })
    expect(m.currentMix.seo).toBeCloseTo(0.75, 9)
    expect(() => m.setBudget(1, { nope: 1 })).toThrow()
    expect(() => m.setBudget(-1)).toThrow()
    const o = run(m, 100)
    expect(o.channels.find((c) => c.channel === 'telegram_channels')!.visitsPerDay).toBeLessThan(1)
  })
  it('sources carry segment mixes and channel tilts for the arrival process', () => {
    const m = new Marketing(cfg)
    run(m, 50)
    const s = m.sources().find((x) => x.source === 'bale_eitaa')!
    expect(s.channelTilt!.bale).toBeGreaterThan(s.channelTilt!.web!)
    expect(s.segmentMix!.student).toBeGreaterThan(0)
  })
  it('CAC is spend / acquisitions over an exponential window and undefined before any acquisition', () => {
    const m = new Marketing(cfg, { monthlyBudgetIrt: 30_000_000, mix: { seo: 1 } })
    expect(m.cac('seo')).toBeUndefined()
    for (let d = 0; d < 30; d++) m.step(MS.day)
    m.recordAcquisition('seo', 100)
    const cac = m.cac('seo')!
    expect(cac).toBeGreaterThan(0)
    expect(cac).toBeLessThan(30_000_000 / 100 + 1)
    expect(m.blendedCac()).toBeCloseTo(cac, 6)
    expect(m.cacByChannel().seo).toBeCloseTo(cac, 9)
    m.recordAcquisition('organic', 50) // unpaid sources are ignored
    expect(m.blendedCac()).toBeCloseTo(cac, 6)
  })
  it('CAC rises when the same budget is pushed into saturation', () => {
    const cacAt = (budget: number) => {
      const m = new Marketing(cfg, { monthlyBudgetIrt: budget, mix: { instagram: 1 } })
      let acquired = 0
      for (let d = 0; d < 200; d++) {
        const o = m.step(MS.day)
        const n = o.channels[2]!.visitsPerDay * 0.05
        m.recordAcquisition('instagram', n)
        acquired += n
      }
      return m.cac('instagram')!
    }
    expect(cacAt(1_000_000_000)).toBeGreaterThan(cacAt(50_000_000) * 2)
  })
  it('referral rewards respect the monthly cap and reset each month', () => {
    const m = new Marketing(cfg)
    const per = cfg.referral.rewardIrtPerFirstOrder
    const cap = cfg.referral.rewardCapPerMonthIrt
    const big = Math.ceil(cap / per) + 50
    expect(m.payReferralRewards(big, 1)).toBe(cap)
    expect(m.payReferralRewards(10, 1)).toBe(0)
    expect(m.payReferralRewards(10, 2)).toBe(10 * per)
  })
  it('snapshot/restore reproduces future behaviour exactly', () => {
    const a = new Marketing(cfg)
    run(a, 60)
    const snap = JSON.parse(JSON.stringify(a.snapshot()))
    const b = new Marketing(cfg)
    b.restore(snap)
    expect(total(run(a, 30))).toBeCloseTo(total(run(b, 30)), 9)
  })
  it('is deterministic (pure)', () => {
    const a = run(new Marketing(cfg), 120)
    const b = run(new Marketing(cfg), 120)
    expect(a).toEqual(b)
  })
  it('LTV/CAC helper', () => {
    expect(ltvToCac(600, 200)).toBe(3)
    expect(ltvToCac(600, undefined)).toBeUndefined()
    expect(ltvToCac(600, 0)).toBeUndefined()
  })
})
