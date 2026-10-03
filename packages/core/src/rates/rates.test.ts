import { describe, expect, it } from 'vitest'
import { MS, createRng, defaultPlatformParams, type RateSnapshot } from '@hiclaude/contracts'
import { aggregateRates, type AggregateRatesInput } from './aggregate'
import { VolatilityEstimator } from './volatility'
import { DISPERSION_KILL_MULTIPLE, evaluateKillSwitch } from './killswitch'
import { NOW, limits, snapshot, ticker } from '../test-utils'

const P = defaultPlatformParams()
const VOL = { dailyPct: 0.012, driftPctPerDay: 0, windowHours: 100 }

function agg(patch: Partial<AggregateRatesInput> = {}): RateSnapshot {
  return aggregateRates({
    now: NOW,
    tickers: [
      ticker('tabdeal', 256_000, 257_000),
      ticker('nobitex', 256_200, 257_300),
      ticker('wallex', 255_900, 257_500),
      ticker('bitpin', 256_100, 257_200),
    ],
    limits: ['tabdeal', 'nobitex', 'wallex', 'bitpin'].map((id) => limits(id, { takerFeeBps: P.exchanges.find((e) => e.id === id)!.takerFeeBps })),
    exchangesParams: P.exchanges,
    vol: VOL,
    params: { risk: P.risk, pricing: P.pricing },
    ...patch,
  })
}

describe('aggregateRates', () => {
  it('picks the cheapest all-in ask among open exchanges and records the exchange', () => {
    const s = agg()
    expect(s.status).toBe('ok')
    // all-in: tabdeal 257000*1.0025=257642.5 ; nobitex 257300*1.0035=258200 ; wallex 257500*1.0035 ; bitpin 257200*1.0032
    expect(s.executableAsk).toBe(257_000)
    expect(s.executableAskExchangeId).toBe('tabdeal')
    expect(s.executableBid).toBeGreaterThan(0)
    expect(s.executableBidExchangeId).toBeDefined()
    expect(s.id).toBe(`rs_${NOW}`)
    expect(s.ts).toBe(NOW)
    expect(s.volatility).toEqual(VOL)
  })

  it('all-in ranking can prefer a higher quoted ask with a lower fee', () => {
    const s = agg({
      tickers: [ticker('tabdeal', 256_000, 257_000), ticker('nobitex', 256_000, 257_100), ticker('wallex', 256_000, 257_050)],
      limits: [limits('tabdeal', { takerFeeBps: 60 }), limits('nobitex', { takerFeeBps: 10 }), limits('wallex', { takerFeeBps: 35 })],
    })
    expect(s.executableAskExchangeId).toBe('nobitex') // 257100*1.001 < 257000*1.006
    expect(s.executableAsk).toBe(257_100)
  })

  it('mid is the median of exchange mids', () => {
    const s = agg({ tickers: [ticker('a', 100_000, 102_000), ticker('b', 100_400, 102_400), ticker('c', 100_800, 102_800)], limits: [limits('a'), limits('b'), limits('c')], exchangesParams: [] })
    expect(s.mid).toBe(101_400)
    const s2 = agg({ tickers: [ticker('a', 100_000, 102_000), ticker('b', 100_400, 102_400)], limits: [limits('a'), limits('b')], exchangesParams: [] })
    expect(s2.mid).toBe(101_200)
  })

  it('excludes closed exchanges from execution but keeps them in the mid', () => {
    const s = agg({
      limits: [limits('tabdeal', { tradingOpen: false, nextTradingOpenAt: NOW + 3_600_000 }), limits('nobitex', { takerFeeBps: 35 }), limits('wallex', { takerFeeBps: 35 }), limits('bitpin', { takerFeeBps: 32 })],
    })
    expect(s.executableAskExchangeId).not.toBe('tabdeal')
    expect(s.excluded.find((e) => e.exchangeId === 'tabdeal')!.reason).toMatch(/^closed/)
    expect(s.status).toBe('ok')
  })

  it('excludes exchanges whose buy cap is below the minimum order', () => {
    const s = agg({
      limits: [
        limits('tabdeal', { buyCapRemainingMicroUsdt: 100 }), // < 100k IRT worth
        limits('nobitex', { takerFeeBps: 35 }),
        limits('wallex', { takerFeeBps: 35 }),
        limits('bitpin', { takerFeeBps: 32 }),
      ],
    })
    expect(s.executableAskExchangeId).toBe('bitpin')
    expect(s.excluded.find((e) => e.exchangeId === 'tabdeal')!.reason).toMatch(/^cap_exhausted/)
    // a cap that is still large enough keeps the exchange
    const s2 = agg({ limits: [limits('tabdeal', { buyCapRemainingMicroUsdt: 50_000_000 }), limits('nobitex'), limits('wallex'), limits('bitpin')] })
    expect(s2.executableAskExchangeId).toBe('tabdeal')
  })

  it('halted: every exchange closed → last-known ask × (1 + haltPremium), status halted', () => {
    const closed = ['tabdeal', 'nobitex', 'wallex', 'bitpin'].map((id) => limits(id, { tradingOpen: false }))
    const s = agg({ limits: closed })
    expect(s.status).toBe('halted')
    expect(s.executableAskExchangeId).toBeUndefined()
    expect(s.executableAsk).toBeCloseTo(257_000 * 1.01, 6)
    expect(s.notes.join(' ')).toContain('last-known')
  })

  it('halted when all caps are exhausted', () => {
    const s = agg({ limits: ['tabdeal', 'nobitex', 'wallex', 'bitpin'].map((id) => limits(id, { buyCapRemainingMicroUsdt: 0 })) })
    expect(s.status).toBe('halted')
  })

  it('stale tickers are excluded; all stale ⇒ status stale and values carried from prev', () => {
    const old = NOW - P.risk.killSwitch.staleAfterMs - 1000
    const prev = snapshot({ executableAsk: 250_000, executableBid: 249_000, mid: 249_500 })
    const s = agg({ tickers: [ticker('tabdeal', 256_000, 257_000, old), ticker('nobitex', 256_200, 257_300, old)], prev })
    expect(s.status).toBe('stale')
    expect(s.executableAsk).toBe(250_000)
    expect(s.mid).toBe(249_500)
    expect(s.excluded.every((e) => e.reason.startsWith('stale'))).toBe(true)
    // one stale, one fresh → ok and stale one excluded
    const s2 = agg({ tickers: [ticker('tabdeal', 256_000, 257_000, old), ticker('nobitex', 256_200, 257_300)] })
    expect(s2.status).toBe('ok')
    expect(s2.excluded.find((e) => e.exchangeId === 'tabdeal')!.reason).toMatch(/^stale/)
    expect(s2.executableAskExchangeId).toBe('nobitex')
  })

  it('no tickers and no prev ⇒ stale with zeros (pricing refuses these)', () => {
    const s = agg({ tickers: [], limits: [] })
    expect(s.status).toBe('stale')
    expect(s.executableAsk).toBe(0)
  })

  it('rejects a single outlier among ≥3 exchanges (anomalyPct around the median) without raising anomaly', () => {
    const s = agg({
      tickers: [ticker('tabdeal', 256_000, 257_000), ticker('nobitex', 256_200, 257_300), ticker('wallex', 255_900, 257_500), ticker('bitpin', 300_000, 301_000)],
    })
    const out = s.excluded.find((e) => e.exchangeId === 'bitpin')!
    expect(out.reason).toMatch(/^outlier/)
    expect(s.status).toBe('ok')
    expect(s.executableAskExchangeId).not.toBe('bitpin')
    expect(s.mid).toBeLessThan(260_000)
  })

  it('an outlier that is the cheapest ask is not used for execution', () => {
    const s = agg({
      tickers: [ticker('tabdeal', 100_000, 100_500), ticker('nobitex', 256_200, 257_300), ticker('wallex', 255_900, 257_500), ticker('bitpin', 256_100, 257_200)],
    })
    expect(s.executableAskExchangeId).not.toBe('tabdeal')
    expect(s.executableAsk).toBeGreaterThan(200_000)
  })

  it('anomaly when half of the exchanges disagree, when two exchanges differ too much, or when mid jumps vs prev', () => {
    const half = agg({ tickers: [ticker('a', 100, 101), ticker('b', 200_000, 201_000), ticker('c', 100_000, 100_500), ticker('d', 300_000, 301_000)], limits: ['a', 'b', 'c', 'd'].map((x) => limits(x)), exchangesParams: [] })
    expect(half.status).toBe('anomaly')
    const two = agg({ tickers: [ticker('a', 256_000, 257_000), ticker('b', 290_000, 291_000)], limits: [limits('a'), limits('b')], exchangesParams: [] })
    expect(two.status).toBe('anomaly')
    const prev = snapshot({ mid: 200_000 })
    const jump = agg({ prev })
    expect(jump.status).toBe('anomaly')
    expect(jump.notes.join(' ')).toContain('jumped')
    const calm = agg({ prev: snapshot({ mid: 256_300 }) })
    expect(calm.status).toBe('ok')
  })

  it('status precedence: stale > anomaly > halted', () => {
    const closed = ['tabdeal', 'nobitex', 'wallex', 'bitpin'].map((id) => limits(id, { tradingOpen: false }))
    const s = agg({ limits: closed, prev: snapshot({ mid: 200_000 }) })
    expect(s.status).toBe('anomaly') // both halted and jumped
    expect(s.executableAskExchangeId).toBeUndefined()
  })

  it('exchanges disabled in settings, invalid or crossed quotes are excluded', () => {
    const exParams = P.exchanges.map((e) => (e.id === 'tabdeal' ? { ...e, enabled: false } : e))
    const s = agg({
      exchangesParams: exParams,
      tickers: [ticker('tabdeal', 256_000, 257_000), ticker('nobitex', 257_000, 256_000), ticker('wallex', 255_900, 257_500), ticker('bitpin', -1, 257_200)],
    })
    const reasons = Object.fromEntries(s.excluded.map((e) => [e.exchangeId, e.reason.split(':')[0]]))
    expect(reasons.tabdeal).toBe('disabled')
    expect(reasons.nobitex).toBe('invalid')
    expect(reasons.bitpin).toBe('invalid')
    expect(s.executableAskExchangeId).toBe('wallex')
  })

  it('exchange without limits info is not executable but still feeds the mid', () => {
    const s = agg({ limits: [limits('nobitex', { takerFeeBps: 35 })] })
    expect(s.executableAskExchangeId).toBe('nobitex')
    expect(s.excluded.filter((e) => e.reason.startsWith('no_limits')).length).toBe(3)
  })

  it('never emits `killed`, is deterministic and does not mutate inputs', () => {
    const input: AggregateRatesInput = {
      now: NOW,
      tickers: [ticker('tabdeal', 256_000, 257_000), ticker('nobitex', 256_200, 257_300)],
      limits: [limits('tabdeal'), limits('nobitex')],
      exchangesParams: P.exchanges,
      vol: VOL,
      params: { risk: P.risk, pricing: P.pricing },
    }
    const copy = structuredClone(input)
    const a = aggregateRates(input)
    const b = aggregateRates(input)
    expect(a).toEqual(b)
    expect(input).toEqual(copy)
    expect(a.status).not.toBe('killed')
    expect(aggregateRates({ ...input, id: 'rs_custom' }).id).toBe('rs_custom')
  })

  it('bid side only needs the exchange to be open (not buy cap)', () => {
    const s = agg({ limits: ['tabdeal', 'nobitex', 'wallex', 'bitpin'].map((id) => limits(id, { buyCapRemainingMicroUsdt: 0 })) })
    expect(s.status).toBe('halted')
    expect(s.executableBidExchangeId).toBeDefined()
    expect(s.executableBid).toBeGreaterThan(255_000)
  })
})

describe('VolatilityEstimator', () => {
  function walk(sigmaDaily: number, mu: number, hours: number, seed: string, ticksPerHour = 4) {
    const rng = createRng(seed)
    const est = new VolatilityEstimator({ halflifeHours: 200, minSamples: 24 })
    let p = 250_000
    const sigH = sigmaDaily / Math.sqrt(24)
    const muH = Math.log1p(mu) / 24
    for (let h = 0; h < hours; h++) {
      for (let k = 0; k < ticksPerHour; k++) {
        // intra-hour wiggles that do not accumulate (the hourly close carries the return)
        const ts = (h * 60 + k * Math.floor(60 / ticksPerHour)) * 60_000 + 1000
        est.push(ts, p * (1 + (k < ticksPerHour - 1 ? rng.normal(0, sigH * 0.1) : 0)))
      }
      p *= Math.exp(muH + rng.normal(0, sigH))
    }
    return est
  }

  it('falls back to defaults before minSamples hourly returns', () => {
    const e = new VolatilityEstimator({ defaultDailyPct: 0.012, defaultDriftPctPerDay: 0.0005 })
    expect(e.estimate()).toEqual({ dailyPct: 0.012, driftPctPerDay: 0.0005, windowHours: 0 })
    for (let h = 0; h < 10; h++) e.push(h * MS.hour, 250_000 + h * 100)
    const est = e.estimate()
    expect(est.dailyPct).toBe(0.012)
    expect(e.sampleCount).toBeLessThan(24)
  })

  it('recovers the true daily volatility within tolerance on a simulated walk', () => {
    for (const sigma of [0.006, 0.012, 0.03]) {
      const e = walk(sigma, 0, 24 * 40, `vol-${sigma}`)
      const est = e.estimate()
      expect(est.dailyPct / sigma).toBeGreaterThan(0.75)
      expect(est.dailyPct / sigma).toBeLessThan(1.3)
    }
  })

  it('detects positive and negative drift', () => {
    const up = walk(0.004, 0.01, 24 * 40, 'drift-up').estimate()
    expect(up.driftPctPerDay).toBeGreaterThan(0.004)
    const down = walk(0.004, -0.01, 24 * 40, 'drift-down').estimate()
    expect(down.driftPctPerDay).toBeLessThan(-0.004)
  })

  it('a constant price gives ~0 volatility once past the minimum sample size', () => {
    const e = new VolatilityEstimator({ minSamples: 24 })
    for (let h = 0; h < 100; h++) e.push(h * MS.hour + 5, 250_000)
    expect(e.estimate().dailyPct).toBe(0)
    expect(e.estimate().driftPctPerDay).toBe(0)
  })

  it('reacts to a volatility spike faster than a long window would and then decays', () => {
    const e = new VolatilityEstimator({ halflifeHours: 24, minSamples: 24 })
    let p = 250_000
    const rng = createRng('spike')
    for (let h = 0; h < 200; h++) {
      p *= Math.exp(rng.normal(0, 0.002))
      e.push(h * MS.hour + 1, p)
    }
    const calm = e.estimate().dailyPct
    for (let h = 200; h < 224; h++) {
      p *= Math.exp(rng.normal(0, 0.02))
      e.push(h * MS.hour + 1, p)
    }
    const spike = e.estimate().dailyPct
    expect(spike).toBeGreaterThan(calm * 2)
    for (let h = 224; h < 400; h++) {
      p *= Math.exp(rng.normal(0, 0.002))
      e.push(h * MS.hour + 1, p)
    }
    expect(e.estimate().dailyPct).toBeLessThan(spike)
  })

  it('handles irregular ticks and gaps (multi-hour gap counts as one k-hour return)', () => {
    const a = new VolatilityEstimator({ minSamples: 3 })
    const b = new VolatilityEstimator({ minSamples: 3 })
    const times = [0, 0.4, 1.2, 1.9, 3.5, 3.6, 9.0, 9.4, 20, 21.5, 22]
    let p = 100_000
    for (const t of times) {
      p *= 1.001
      a.push(Math.round(t * MS.hour), p)
      b.push(Math.round(t * MS.hour), p)
    }
    expect(a.estimate()).toEqual(b.estimate()) // deterministic
    expect(Number.isFinite(a.estimate().dailyPct)).toBe(true)
    expect(a.sampleCount).toBeGreaterThanOrEqual(3)
  })

  it('ignores out-of-order, non-positive and non-finite ticks', () => {
    const e = new VolatilityEstimator({ minSamples: 2 })
    for (let h = 0; h < 30; h++) e.push(h * MS.hour, 100_000 * (1 + (h % 2) * 0.01))
    const before = JSON.stringify(e.state())
    e.push(5 * MS.hour, 1)
    e.push(40 * MS.hour, NaN)
    e.push(40 * MS.hour, -5)
    e.push(Infinity, 100)
    expect(JSON.stringify(e.state())).toBe(before)
  })

  it('ring buffer is bounded and windowHours reports covered span', () => {
    const e = new VolatilityEstimator({ capacityHours: 48, minSamples: 5 })
    for (let h = 0; h < 500; h++) e.push(h * MS.hour + 1, 100_000 + (h % 7) * 50)
    expect(e.state().ring.length).toBeLessThanOrEqual(48)
    expect(e.estimate().windowHours).toBeLessThanOrEqual(48)
    expect(e.estimate().windowHours).toBeGreaterThan(40)
  })

  it('state() / restore() round-trips and continues identically', () => {
    const a = new VolatilityEstimator({ minSamples: 5 })
    const rng = createRng('restore')
    let p = 100_000
    for (let h = 0; h < 100; h++) {
      p *= Math.exp(rng.normal(0, 0.003))
      a.push(h * MS.hour + 7, p)
    }
    const b = new VolatilityEstimator({ minSamples: 5 })
    b.restore(JSON.parse(JSON.stringify(a.state())))
    expect(b.estimate()).toEqual(a.estimate())
    for (let h = 100; h < 130; h++) {
      p *= Math.exp(rng.normal(0, 0.003))
      a.push(h * MS.hour + 7, p)
      b.push(h * MS.hour + 7, p)
    }
    expect(b.estimate()).toEqual(a.estimate())
  })

  it('same inputs ⇒ same outputs (determinism)', () => {
    const r1 = walk(0.01, 0.001, 24 * 10, 'det').estimate()
    const r2 = walk(0.01, 0.001, 24 * 10, 'det').estimate()
    expect(r1).toEqual(r2)
  })

  it('validates constructor options', () => {
    expect(() => new VolatilityEstimator({ halflifeHours: 0 })).toThrow(RangeError)
    expect(() => new VolatilityEstimator({ capacityHours: 1 })).toThrow(RangeError)
  })
})

describe('evaluateKillSwitch', () => {
  const KS = P.risk.killSwitch
  const min = (n: number) => n * 60_000
  const snap = (ts: number, status: RateSnapshot['status'], extra: Partial<RateSnapshot> = {}): RateSnapshot =>
    snapshot({ id: `s${ts}`, ts, status, tickers: [ticker('a', 256_000, 257_000, ts), ticker('b', 256_100, 257_100, ts)], ...extra })

  it('healthy feed ⇒ off', () => {
    const s = snap(NOW, 'ok')
    expect(evaluateKillSwitch({ snapshot: s, history: [], params: P, now: NOW }).on).toBe(false)
  })

  it('halted alone never trips the switch (night halts are normal)', () => {
    const hist = Array.from({ length: 30 }, (_, i) => snap(NOW - min(60 - i * 2), 'halted'))
    const r = evaluateKillSwitch({ snapshot: snap(NOW, 'halted'), history: hist, params: P, now: NOW })
    expect(r.on).toBe(false)
  })

  it('persistent anomaly for ≥ autoKillAfterMinutes trips; shorter does not', () => {
    const run = (minutes: number) => {
      const hist = [snap(NOW - min(minutes + 5), 'ok')]
      for (let m = minutes; m >= 1; m -= 1) hist.push(snap(NOW - min(m), 'anomaly'))
      return evaluateKillSwitch({ snapshot: snap(NOW, 'anomaly'), history: hist, params: P, now: NOW })
    }
    expect(run(KS.autoKillAfterMinutes - 2).on).toBe(false)
    const tripped = run(KS.autoKillAfterMinutes + 1)
    expect(tripped.on).toBe(true)
    expect(tripped.rule).toBe('persistent_bad')
    expect(tripped.reasonFa).toContain('دقیقه')
  })

  it('an anomaly that cleared (ok after bad) does not trip', () => {
    const hist = [snap(NOW - min(30), 'anomaly'), snap(NOW - min(25), 'anomaly'), snap(NOW - min(20), 'ok'), snap(NOW - min(10), 'ok')]
    expect(evaluateKillSwitch({ snapshot: snap(NOW, 'ok'), history: hist, params: P, now: NOW }).on).toBe(false)
  })

  it('stale status persisting trips like anomaly', () => {
    const hist = [snap(NOW - min(20), 'stale'), snap(NOW - min(15), 'stale'), snap(NOW - min(5), 'stale')]
    const r = evaluateKillSwitch({ snapshot: snap(NOW, 'stale'), history: hist, params: P, now: NOW })
    expect(r.on).toBe(true)
  })

  it('feed dead: newest snapshot older than staleAfterMs for ≥ autoKillAfterMinutes', () => {
    const latest = snap(NOW - KS.staleAfterMs - min(5), 'ok')
    const soon = evaluateKillSwitch({ snapshot: latest, history: [], params: P, now: NOW })
    expect(soon.on).toBe(false) // only 5 minutes past the stale threshold
    const later = evaluateKillSwitch({ snapshot: latest, history: [], params: P, now: NOW + min(KS.autoKillAfterMinutes) })
    expect(later.on).toBe(true)
    expect(later.rule).toBe('feed_dead')
  })

  it('dispersion rule trips immediately on extreme exchange disagreement', () => {
    const wide = snap(NOW, 'anomaly', { tickers: [ticker('a', 100_000, 101_000), ticker('b', 100_000 * (1 + DISPERSION_KILL_MULTIPLE * KS.anomalyPct + 0.05), 130_000)] })
    const r = evaluateKillSwitch({ snapshot: wide, history: [], params: P, now: NOW })
    expect(r.on).toBe(true)
    expect(r.rule).toBe('dispersion')
    const mild = snap(NOW, 'ok', { tickers: [ticker('a', 100_000, 101_000), ticker('b', 103_000, 104_000)] })
    expect(evaluateKillSwitch({ snapshot: mild, history: [], params: P, now: NOW }).on).toBe(false)
  })

  it('history order does not matter and duplicates are tolerated', () => {
    const hist = [snap(NOW - min(1), 'anomaly'), snap(NOW - min(30), 'ok'), snap(NOW - min(20), 'anomaly'), snap(NOW - min(20), 'anomaly')]
    const a = evaluateKillSwitch({ snapshot: snap(NOW, 'anomaly'), history: hist, params: P, now: NOW })
    const b = evaluateKillSwitch({ snapshot: snap(NOW, 'anomaly'), history: [...hist].reverse(), params: P, now: NOW })
    expect(a).toEqual(b)
    expect(a.on).toBe(true)
  })
})
