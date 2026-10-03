import { describe, expect, it } from 'vitest'
import { MS, createRng, fromIrst } from '@hiclaude/contracts'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { makeEnv, DEFAULT_START } from '../core/testkit'
import { MacroEngine } from '../macro/engine'
import { CompetitorSim } from './competitors'
import { defaultCompetitionConfig, loadCompetitorsConfig, type CompetitionConfig } from './config'

function setup(patch: (c: CompetitionConfig) => void = () => undefined, seed = 1) {
  const env = makeEnv({ seed })
  const macro = new MacroEngine({ rng: env.rng.fork('macro'), clock: env.clock, startMs: DEFAULT_START })
  const cfg = defaultCompetitionConfig()
  patch(cfg)
  const comp = new CompetitorSim({ env, rng: env.rng.fork('competitors'), macro, originMs: DEFAULT_START, config: cfg })
  return { env, macro, comp }
}
const noPromo = (c: CompetitionConfig) => {
  for (const x of [...c.competitors, ...c.entryPool]) {
    x.promosPerMonth = 0
    x.joinsSeasonalSales = false
  }
}

describe('CompetitorSim pricing', () => {
  it('has 6 default competitors with the four strategies', () => {
    const { comp } = setup()
    expect(comp.list().length).toBe(6)
    expect(new Set(comp.list().map((c) => c.strategy))).toEqual(new Set(['follow', 'undercut', 'premium', 'erratic']))
  })
  it('quotes follow the port contract and are above the USDT rate', async () => {
    const { comp, macro, env } = setup(noPromo)
    const q = await comp.quotes({ family: 'virtual_card', amountUsdCents: 10_000 })
    expect(q.ok).toBe(true)
    if (!q.ok) return
    expect(q.value.length).toBe(6)
    const mid = macro.midAt(env.clock.now())
    for (const x of q.value) {
      expect(x.priceIrt).toBeGreaterThan(100 * mid * 0.99)
      expect(x.priceIrt % 1000).toBe(0)
      expect(x.amountUsdCents).toBe(10_000)
    }
  })
  it('strategy ordering: premium > follow > undercut on average', () => {
    const { comp } = setup(noPromo)
    const offers = comp.offers('ai_subscription', 2000)
    const by = (s: string) => offers.filter((o) => o.strategy === s).map((o) => o.priceIrt)
    const premium = by('premium')[0] as number
    const undercut = Math.min(...by('undercut'))
    expect(premium).toBeGreaterThan(undercut)
  })
  it('price scales with the USDT rate with the competitor lag (stale reference)', () => {
    const { comp, macro } = setup(noPromo)
    const t1 = DEFAULT_START + 20 * MS.day
    const p1 = comp.priceFor('alpha-pay', 'virtual_card', 10_000, t1)?.priceIrt as number
    const ratio = p1 / 100 / macro.midAt(t1)
    expect(ratio).toBeGreaterThan(1)
    expect(ratio).toBeLessThan(1.3)
    // the reference rate used is at most (cadence + lag) hours old
    const lagged = macro.midAt(t1 - 12 * MS.hour)
    expect(Math.abs(p1 / 100 / lagged - ratio * (macro.midAt(t1) / lagged))).toBeLessThan(1e-9)
  })
  it('repricing is step-wise: prices are constant between repricing instants', () => {
    const { comp } = setup(noPromo)
    const m = comp.list()[0] as { id: string }
    const base = DEFAULT_START + 10 * MS.day
    const seen = new Set<number>()
    for (let i = 0; i < 24 * 4; i++) seen.add(comp.priceFor(m.id, 'virtual_card', 10_000, base + i * 15 * MS.minute)?.priceIrt as number)
    expect(seen.size).toBeLessThanOrEqual(24 / 6 + 2) // 6 h cadence
    expect(seen.size).toBeGreaterThan(1)
  })
  it('unknown family or competitor yields no quote', async () => {
    const { comp } = setup()
    expect(comp.priceFor('nobody', 'virtual_card', 1000)).toBeNull()
    const q = await comp.quotes({ family: 'nonexistent', amountUsdCents: 1000 })
    expect(q.ok && q.value.length).toBe(0)
    expect(comp.priceIndex('nonexistent')).toBe(0)
  })
  it('priceIndex and markupIndex are in a sane range', () => {
    const { comp } = setup(noPromo)
    for (const f of ['virtual_card', 'gift_card', 'ai_subscription', 'streaming', 'cloud', 'education']) {
      const mk = comp.markupIndex(f)
      expect(mk).toBeGreaterThan(0.0)
      expect(mk).toBeLessThan(0.5)
    }
    expect(comp.markupIndex('ai_subscription')).toBeGreaterThan(comp.markupIndex('cloud'))
  })
  it('is deterministic per seed and independent of query order', () => {
    const a = setup(undefined, 7)
    const b = setup(undefined, 7)
    const ts = [5, 40, 120, 3, 77].map((d) => DEFAULT_START + d * MS.day + 5 * MS.hour)
    const fa = ts.map((t) => a.comp.priceIndex('gift_card', t))
    const fb = [...ts].reverse().map((t) => b.comp.priceIndex('gift_card', t)).reverse()
    expect(fa).toEqual(fb)
    expect(setup(undefined, 8).comp.priceIndex('gift_card', ts[1])).not.toBe(fa[1])
  })
})

describe('CompetitorSim promos, war, lifecycle', () => {
  it('promo windows lower prices some of the time', () => {
    const { comp } = setup((c) => {
      for (const x of c.competitors) {
        x.promosPerMonth = 1
        x.joinsSeasonalSales = false
      }
    })
    let promoSteps = 0
    let total = 0
    for (let h = 0; h < 24 * 90; h += 3) {
      for (const o of comp.offers('gift_card', 5000, DEFAULT_START + h * MS.hour)) {
        total++
        if (o.promo) promoSteps++
      }
    }
    expect(promoSteps / total).toBeGreaterThan(0.05)
    expect(promoSteps / total).toBeLessThan(0.5)
  })
  it('Yalda seasonal sale applies', () => {
    const { comp } = setup((c) => {
      for (const x of c.competitors) {
        x.promosPerMonth = 0
        x.joinsSeasonalSales = true
      }
    })
    const yalda = fromIrst(2026, 12, 21, 12) // 30 Azar 1405
    expect(comp.offers('gift_card', 5000, yalda).some((o) => o.promo)).toBe(true)
    expect(comp.offers('gift_card', 5000, fromIrst(2026, 11, 10, 12)).some((o) => o.promo)).toBe(false)
  })
  it('price war lowers prices during the war (except mostly premium) and ends/reverts', () => {
    const { comp, env } = setup(noPromo)
    const before = comp.priceIndex('virtual_card')
    const h = comp.applyEvent('price_war', { discountPct: 0.08, durationDays: 30 })
    env.sim.runUntil(env.clock.now() + 5 * MS.day)
    const during = comp.markupIndex('virtual_card')
    env.sim.runUntil(env.clock.now() + 40 * MS.day)
    void before
    const after = comp.markupIndex('virtual_card')
    expect(during).toBeLessThan(after - 0.03)
    const h2 = comp.applyEvent('price_war', { discountPct: 0.1, durationDays: 100 })
    const m1 = comp.markupIndex('virtual_card', env.clock.now() + 5 * MS.day)
    h2?.revert()
    const m2 = comp.markupIndex('virtual_card', env.clock.now() + 5 * MS.day)
    expect(m1).toBeLessThan(m2)
    h?.revert()
  })
  it('entry event adds an active competitor with its own price; revert removes it', () => {
    const { comp } = setup()
    const n0 = comp.activeCount()
    const h = comp.applyEvent('competitor_entry', { count: 2 })
    expect(comp.activeCount()).toBe(n0 + 2)
    h?.revert()
    expect(comp.activeCount()).toBe(n0)
  })
  it('exit event deactivates; never removes the last competitor', () => {
    const { comp } = setup()
    comp.applyEvent('competitor_exit', { count: 10 })
    expect(comp.activeCount()).toBeGreaterThanOrEqual(1)
    const { comp: c2 } = setup()
    c2.applyEvent('competitor_exit', { competitor: 'prime-fx' })
    expect(c2.list().find((c) => c.id === 'prime-fx')?.active).toBe(false)
    expect(c2.priceFor('prime-fx', 'virtual_card', 1000)).toBeNull()
  })
  it('daily lifecycle produces entries and exits at roughly the hazard rates over many years', () => {
    let entries = 0
    let exits = 0
    for (let seed = 1; seed <= 6; seed++) {
      const { comp, env } = setup((c) => ((c.entryHazardPerYear = 2), (c.exitHazardPerYear = 1)), seed)
      comp.start()
      env.sim.runUntil(DEFAULT_START + 3 * 365 * MS.day)
      entries += env.stats.counter('competitors.entries')
      exits += env.stats.counter('competitors.exits')
    }
    expect(entries / 6).toBeGreaterThan(3)
    expect(entries / 6).toBeLessThan(9.5)
    expect(exits).toBeGreaterThan(0)
  })
  it('snapshot lists active competitors with relative price index > 1', () => {
    const { comp } = setup(noPromo)
    const s = comp.snapshot()
    expect(s.length).toBe(6)
    for (const x of s) expect(x.priceIndex).toBeGreaterThan(1)
  })
  it('entry hazard multiplier event', () => {
    const { comp } = setup()
    const h = comp.applyEvent('competitor_entry_rate', { multiplier: 5 })
    expect(h).not.toBeNull()
    h?.revert()
    expect(comp.applyEvent('whatever', {})).toBeNull()
  })
})

describe('loadCompetitorsConfig', () => {
  it('uses defaults when the file is missing', () => {
    const c = loadCompetitorsConfig(join(tmpdir(), 'nope-competitors.json'))
    expect(c.meta.source).toBe('default')
    expect(c.competitors.length).toBe(6)
  })
  it('reads research-shaped data with Record wrappers and null leaves', () => {
    const rec = (v: unknown) => ({ value: v, unit: 'x', as_of: '2026-10-02', confidence: 'low', status: 'UNVERIFIED' })
    const mkc = (id: string, segs: string[], trust: number | null, level = 'L1') => ({ id, name: id.toUpperCase(), segments: segs, evidence_level: level, trust_score_est: rec(trust), delivery_sla_minutes: rec(null), repricing_cadence_hours: rec(null) })
    const file = join(mkdtempSync(join(tmpdir(), 'comp-')), 'competitors.json')
    writeFileSync(
      file,
      JSON.stringify({ competitors: [mkc('a', ['virtual_card'], 55, 'L2'), mkc('b', ['gift_card'], null, 'L2'), mkc('c', ['subscription'], 40), mkc('d', ['exam_embassy'], null), mkc('e', ['fx_payment'], 20), mkc('f', ['virtual_card', 'gift_card'], 60), mkc('g', ['gift_card'], null), mkc('h', ['pm_digital_dollar'], null)] }),
    )
    const c = loadCompetitorsConfig(file)
    expect(c.meta.source).toBe(file)
    expect(c.competitors.length).toBeGreaterThanOrEqual(3)
    expect(c.competitors.length).toBeLessThanOrEqual(6)
    expect(c.competitors.find((x) => x.id === 'a')?.trust).toBeCloseTo(0.55, 5)
    expect(c.entryPool.length).toBeGreaterThan(0)
    expect(c.competitors.every((x) => Object.keys(x.markup).length > 0)).toBe(true)
    // usable in a sim
    const env = makeEnv()
    const macro = new MacroEngine({ rng: createRng(1).fork('m'), clock: env.clock, startMs: DEFAULT_START })
    const sim = new CompetitorSim({ env, rng: env.rng.fork('c'), macro, originMs: DEFAULT_START, config: c })
    expect(sim.activeCount()).toBe(c.competitors.length)
  })
  it('falls back on broken content', () => {
    const f = join(mkdtempSync(join(tmpdir(), 'comp-')), 'c.json')
    writeFileSync(f, '{"competitors": 5}')
    expect(loadCompetitorsConfig(f).meta.warnings.length).toBeGreaterThan(0)
    writeFileSync(f, 'not json')
    expect(loadCompetitorsConfig(f).meta.source).toBe('default')
  })
  it('loads the real repository file without throwing', () => {
    const c = loadCompetitorsConfig()
    expect(c.competitors.length).toBeGreaterThanOrEqual(3)
  })
})
