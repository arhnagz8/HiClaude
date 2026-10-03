import { describe, expect, it } from 'vitest'
import { MS } from '@hiclaude/contracts'
import { DEFAULT_REPUTATION_PARAMS, Reputation } from './reputation'

const rep = (staticBonus = 0) => new Reputation({ ...DEFAULT_REPUTATION_PARAMS, staticBonus })
const feed = (r: Reputation, n: number, ev: Parameters<Reputation['apply']>[0]) => {
  for (let i = 0; i < n; i++) r.apply(ev)
}

describe('Reputation', () => {
  it('starts at the prior trust', () => {
    expect(rep().trust).toBeCloseTo(DEFAULT_REPUTATION_PARAMS.priorTrust, 12)
  })
  it('on-time deliveries raise trust towards 1; failures lower it', () => {
    const a = rep()
    feed(a, 200, { type: 'delivered', onTime: true })
    expect(a.trust).toBeGreaterThan(0.9)
    const b = rep()
    feed(b, 20, { type: 'failed' })
    expect(b.trust).toBeLessThan(0.15)
  })
  it('failures hurt more than successes help (asymmetry)', () => {
    const r = rep()
    feed(r, 100, { type: 'delivered', onTime: true })
    const t0 = r.trust
    feed(r, 5, { type: 'failed' })
    const drop = t0 - r.trust
    const r2 = rep()
    feed(r2, 100, { type: 'delivered', onTime: true })
    const t1 = r2.trust
    feed(r2, 5, { type: 'delivered', onTime: true })
    expect(drop).toBeGreaterThan(r2.trust - t1)
  })
  it('equilibrium trust matches q/(q+4(1-q))', () => {
    const r = rep()
    expect(r.equilibriumTrust(0.98)).toBeCloseTo(0.98 / (0.98 + 0.08), 9)
    // simulate steady state: 98 successes + 2 failures per 100, long run with decay
    for (let d = 0; d < 1500; d++) {
      r.step(MS.day)
      for (let i = 0; i < 49; i++) r.apply({ type: 'delivered', onTime: true })
      if (d % 1 === 0) r.apply({ type: 'failed' })
    }
    expect(r.trust).toBeCloseTo(r.equilibriumTrust(49 / 50), 1)
  })
  it('late deliveries count as partial failures', () => {
    const a = rep()
    const b = rep()
    feed(a, 50, { type: 'delivered', onTime: true })
    feed(b, 50, { type: 'delivered', onTime: false })
    expect(b.trust).toBeLessThan(a.trust)
    expect(b.trust).toBeGreaterThan(rep().trust - 0.05)
  })
  it('reviews: 5★ raise, 1★ lower, 3★ pulls a high trust down less than 1★', () => {
    const base = rep()
    feed(base, 50, { type: 'delivered', onTime: true })
    const t = base.trust
    const up = new Reputation(DEFAULT_REPUTATION_PARAMS, base.snapshot())
    const dn = new Reputation(DEFAULT_REPUTATION_PARAMS, base.snapshot())
    feed(up, 10, { type: 'review', rating: 5 })
    feed(dn, 10, { type: 'review', rating: 1 })
    expect(up.trust).toBeGreaterThan(t)
    expect(dn.trust).toBeLessThan(t)
    const mid = new Reputation(DEFAULT_REPUTATION_PARAMS, base.snapshot())
    feed(mid, 10, { type: 'review', rating: 3 })
    expect(mid.trust).toBeLessThan(t)
    expect(mid.trust).toBeGreaterThan(dn.trust)
  })
  it('ratings outside 1..5 are clamped', () => {
    const r = rep()
    r.apply({ type: 'review', rating: 99 })
    r.apply({ type: 'review', rating: -4 })
    expect(Number.isFinite(r.trust)).toBe(true)
  })
  it('evidence decays towards the prior with the configured half-life', () => {
    const r = rep()
    feed(r, 300, { type: 'delivered', onTime: true })
    const t = r.trust
    r.step(DEFAULT_REPUTATION_PARAMS.halfLifeDays * MS.day)
    const half = r.trust
    expect(half).toBeLessThan(t)
    expect(half).toBeGreaterThan(DEFAULT_REPUTATION_PARAMS.priorTrust)
    r.step(50 * DEFAULT_REPUTATION_PARAMS.halfLifeDays * MS.day)
    expect(r.trust).toBeCloseTo(DEFAULT_REPUTATION_PARAMS.priorTrust, 3)
  })
  it('mature brands are inert, young brands move quickly (evidence volume)', () => {
    const young = rep()
    const old = rep()
    feed(old, 2000, { type: 'delivered', onTime: true })
    feed(young, 20, { type: 'delivered', onTime: true })
    const y0 = young.trust
    const o0 = old.trust
    for (const r of [young, old]) feed(r, 3, { type: 'failed' })
    expect(y0 - young.trust).toBeGreaterThan((o0 - old.trust) * 3)
    expect(old.evidence).toBeGreaterThan(young.evidence)
  })
  it('incident and negative review wave dent trust; positive wave lifts it', () => {
    const r = rep()
    feed(r, 100, { type: 'delivered', onTime: true })
    const t = r.trust
    r.apply({ type: 'incident', severity: 3 })
    expect(r.trust).toBeLessThan(t - 0.05)
    const lo = r.trust
    r.apply({ type: 'wave', sign: 1, magnitude: 30 })
    expect(r.trust).toBeGreaterThan(lo)
    const hi = r.trust
    r.apply({ type: 'wave', sign: -1, magnitude: 30 })
    expect(r.trust).toBeLessThan(hi)
  })
  it('trust stays in [0,1] even with a static bonus', () => {
    const r = rep(0.3)
    feed(r, 1000, { type: 'delivered', onTime: true })
    expect(r.trust).toBe(1)
    const z = rep(-0.9)
    expect(z.trust).toBe(0)
  })
  it('demand and word-of-mouth multipliers are monotone in trust and clamped', () => {
    const lo = rep()
    feed(lo, 50, { type: 'failed' })
    const hi = rep()
    feed(hi, 500, { type: 'delivered', onTime: true })
    expect(hi.demandMultiplier()).toBeGreaterThan(lo.demandMultiplier())
    expect(hi.wordOfMouthMultiplier()).toBeGreaterThan(lo.wordOfMouthMultiplier())
    expect(lo.demandMultiplier()).toBeGreaterThanOrEqual(DEFAULT_REPUTATION_PARAMS.demandMultiplierRange[0])
    expect(hi.demandMultiplier()).toBeLessThanOrEqual(DEFAULT_REPUTATION_PARAMS.demandMultiplierRange[1])
    const refTrust = new Reputation({ ...DEFAULT_REPUTATION_PARAMS, priorTrust: DEFAULT_REPUTATION_PARAMS.referenceTrust })
    expect(refTrust.demandMultiplier()).toBeCloseTo(1, 9)
  })
  it('public rating maps trust to 1..5 stars', () => {
    const r = rep()
    expect(r.publicRating).toBeCloseTo(1 + 4 * r.trust, 12)
  })
  it('snapshot/restore and step(dt, events) are consistent', () => {
    const a = rep()
    a.step(MS.day, [{ type: 'delivered', onTime: true }, { type: 'failed' }])
    const b = new Reputation(DEFAULT_REPUTATION_PARAMS, a.snapshot())
    a.step(MS.day, [{ type: 'delivered', onTime: false }])
    b.step(MS.day, [{ type: 'delivered', onTime: false }])
    expect(b.trust).toBeCloseTo(a.trust, 12)
  })
  it('recovery after a failure wave takes many successes', () => {
    const r = rep()
    feed(r, 300, { type: 'delivered', onTime: true })
    const t = r.trust
    feed(r, 15, { type: 'failed' })
    const low = r.trust
    let n = 0
    while (r.trust < t - 0.02 && n < 5000) {
      r.apply({ type: 'delivered', onTime: true })
      n++
    }
    expect(low).toBeLessThan(t - 0.1)
    expect(n).toBeGreaterThan(100)
  })
})
