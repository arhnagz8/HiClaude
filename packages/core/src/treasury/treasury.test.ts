import { describe, expect, it } from 'vitest'
import { MS, createRng, defaultPlatformParams, type RegulatoryParams, type UsdtLot } from '@hiclaude/contracts'
import { UsdtLotBook, WALLET_LOCATION } from './lots'
import { demandOn, forecastDemand } from './forecast'
import { conversionCost, coverage, requiredFloatUsdt, type TreasuryState } from './coverage'
import { planReplenishment, type PlanInput, type TreasuryPlanItem } from './plan'
import { NOW, limits, snapshot, ticker } from '../test-utils'

const U = 1_000_000 // micro per USDT
const P = defaultPlatformParams()
const EX = ['tabdeal', 'nobitex', 'wallex', 'bitpin', 'abantether']
const ASKS: Record<string, number> = { tabdeal: 257_000, nobitex: 257_100, wallex: 257_200, bitpin: 257_150, abantether: 257_400 }

function state(p: Partial<TreasuryState> = {}): TreasuryState {
  return {
    bankIrt: 5_000_000_000,
    exchanges: Object.fromEntries(EX.map((e) => [e, { irt: 0, usdt: 0, usdtWithdrawable: 0 }])),
    walletUsdt: 0,
    inTransitUsdt: 0,
    providers: { mpay: { balanceMicro: 0, share: 1 } },
    dailyConsumptionMicro: 1000 * U,
    backlogMicro: 0,
    ...p,
  }
}

function reg(p: Partial<RegulatoryParams> = {}): RegulatoryParams {
  return { ...P.regulatory, idDepositCapIrtPer24h: null, dailyBuyCapMicroUsdt: null, depositIdentitiesAvailable: 1, ...p }
}

function plan(p: Partial<PlanInput> = {}, st: Partial<TreasuryState> = {}): TreasuryPlanItem[] {
  return planReplenishment({
    now: NOW,
    state: state(st),
    limitsByExchange: Object.fromEntries(EX.map((e) => [e, limits(e, { takerFeeBps: P.exchanges.find((x) => x.id === e)!.takerFeeBps, minOrderIrt: 100_000 })])),
    rate: snapshot({ tickers: EX.map((e) => ticker(e, (ASKS[e] as number) - 1000, ASKS[e] as number)) }),
    params: { treasury: P.treasury, exchanges: P.exchanges, providers: P.providers },
    regulatory: reg(),
    ...p,
  })
}
const of = (items: TreasuryPlanItem[], type: TreasuryPlanItem['type']) => items.filter((i) => i.type === type)
const sumMicro = (items: TreasuryPlanItem[]) => items.reduce((a, i) => a + (i.amountMicroUsdt ?? 0), 0)

// ───────────────────────────────── lots ─────────────────────────────────
describe('UsdtLotBook', () => {
  const mk = () => {
    const b = new UsdtLotBook()
    b.addLot({ id: 'a', exchangeId: 'nobitex', qtyMicro: 100 * U, costIrt: 25_000_000, acquiredAt: 1000, withdrawableAt: 1000 + 72 * MS.hour })
    b.addLot({ id: 'b', exchangeId: 'nobitex', qtyMicro: 50 * U, costIrt: 13_100_000, acquiredAt: 2000, withdrawableAt: 2000 + 72 * MS.hour })
    b.addLot({ id: 'c', exchangeId: 'tabdeal', qtyMicro: 10 * U, costIrt: 2_600_000, acquiredAt: 500, withdrawableAt: 500 + 72 * MS.hour })
    return b
  }

  it('consumes FIFO by acquisition time with exact cost basis', () => {
    const b = mk()
    const r = b.consume(120 * U)
    // oldest: c (10), then a (100), then b (10)
    expect(r.consumed.map((x) => [x.lotId, x.qtyMicro])).toEqual([['c', 10 * U], ['a', 100 * U], ['b', 10 * U]])
    expect(r.costIrt).toBe(2_600_000 + 25_000_000 + Math.round((13_100_000 * 10) / 50))
    expect(b.total()).toBe(40 * U)
  })

  it('consuming everything takes exactly the whole cost (no leak) and over-consumption throws without side effects', () => {
    const b = mk()
    const total = 25_000_000 + 13_100_000 + 2_600_000
    expect(() => b.consume(161 * U)).toThrow(RangeError)
    expect(b.total()).toBe(160 * U)
    const rng = createRng('lots')
    let left = 160 * U
    let cost = 0
    while (left > 0) {
      const q = Math.min(left, rng.int(1, 37 * U))
      cost += b.consume(q).costIrt
      left -= q
    }
    expect(cost).toBe(total)
    expect(b.total()).toBe(0)
  })

  it('availability and lock tracking', () => {
    const b = mk()
    expect(b.available(1000, 'nobitex')).toBe(0)
    const t72 = 1000 + 72 * MS.hour
    expect(b.available(t72)).toBe(110 * U) // c (500+72h) and a unlocked, b not yet
    expect(b.locked(t72)).toBe(50 * U)
    expect(b.lockedUntil('nobitex')).toBe(2000 + 72 * MS.hour)
    expect(b.lockedUntil()).toBe(2000 + 72 * MS.hour)
    expect(new UsdtLotBook().lockedUntil()).toBeNull()
    const sched = b.unlockSchedule(0, 100 * MS.hour)
    expect(sched.map((s) => s.at)).toEqual([500 + 72 * MS.hour, 1000 + 72 * MS.hour, 2000 + 72 * MS.hour])
    expect(sched[2]!.cumulativeMicro).toBe(160 * U)
    expect(b.unlockSchedule(0, 72 * MS.hour + 1500, 'nobitex').length).toBe(1)
  })

  it('never withdraws locked lots; withdrawing moves unlocked lots to the wallet preserving cost', () => {
    const b = mk()
    expect(() => b.withdrawFromExchange('nobitex', 10 * U, 1000 + 71 * MS.hour, 'w1')).toThrow(RangeError)
    const now = 1000 + 72 * MS.hour
    const r = b.withdrawFromExchange('nobitex', 60 * U, now, 'w1')
    expect(r.qtyMicro).toBe(60 * U)
    expect(b.total('nobitex')).toBe(90 * U)
    expect(b.total(WALLET_LOCATION)).toBe(60 * U)
    expect(b.available(now, WALLET_LOCATION)).toBe(60 * U)
    expect(b.consume(60 * U, { exchangeId: WALLET_LOCATION }).costIrt).toBe(r.costIrt)
  })

  it('list() recomputes status; toJSON/fromJSON round-trips; guards on addLot', () => {
    const b = mk()
    const l = b.list(1000 + 72 * MS.hour)
    expect(l.find((x) => x.id === 'a')!.status).toBe('available')
    expect(l.find((x) => x.id === 'b')!.status).toBe('locked')
    b.consume(10 * U)
    expect(b.list(0).find((x) => x.id === 'c')!.status).toBe('withdrawn')
    const c = UsdtLotBook.fromJSON(JSON.parse(JSON.stringify(b.toJSON())))
    expect(c.total()).toBe(b.total())
    expect(c.consume(150 * U).costIrt).toBe(b.consume(150 * U).costIrt)
    expect(() => b.addLot({ id: 'a', exchangeId: 'x', qtyMicro: 1, costIrt: 1, acquiredAt: 0, withdrawableAt: 0 })).toThrow(/duplicate/)
    expect(() => b.addLot({ id: 'z', exchangeId: 'x', qtyMicro: 0, costIrt: 1, acquiredAt: 0, withdrawableAt: 0 })).toThrow(RangeError)
    const asContract: UsdtLot[] = b.list(0)
    expect(asContract.length).toBe(3)
  })
})

// ───────────────────────────────── forecast ─────────────────────────────────
describe('forecastDemand', () => {
  const day = (i: number) => {
    const d = new Date(Date.UTC(2026, 8, 1 + i))
    return d.toISOString().slice(0, 10)
  }

  it('empty history → zero demand but backlog still reported', () => {
    const f = forecastDemand({ history: [], backlogMicro: 5 * U, params: { forecastEmaDays: 7 } })
    expect(f.dailyMicro).toBe(0)
    expect(f.requiredNowMicro).toBe(5 * U)
    expect(f.weekdayFactors).toEqual([1, 1, 1, 1, 1, 1, 1])
  })

  it('constant consumption → that level; short history has flat weekday factors', () => {
    const h = Array.from({ length: 10 }, (_, i) => ({ day: day(i), usdtConsumedMicro: 800 * U }))
    const f = forecastDemand({ history: h, backlogMicro: 0, params: { forecastEmaDays: 7 } })
    expect(f.dailyMicro).toBe(800 * U)
    expect(f.weekdayFactors).toEqual([1, 1, 1, 1, 1, 1, 1])
    expect(f.sampleDays).toBe(10)
  })

  it('EMA follows a level shift and weights recent days more', () => {
    const h = [...Array.from({ length: 20 }, (_, i) => ({ day: day(i), usdtConsumedMicro: 500 * U })), ...Array.from({ length: 10 }, (_, i) => ({ day: day(20 + i), usdtConsumedMicro: 1500 * U }))]
    const fast = forecastDemand({ history: h, backlogMicro: 0, params: { forecastEmaDays: 3 } })
    const slow = forecastDemand({ history: h, backlogMicro: 0, params: { forecastEmaDays: 20 } })
    expect(fast.dailyMicro).toBeGreaterThan(slow.dailyMicro)
    expect(fast.dailyMicro).toBeGreaterThan(1300 * U)
  })

  it('learns weekday seasonality (Friday low) with mean-1 factors and demandOn applies them', () => {
    const h = Array.from({ length: 56 }, (_, i) => {
      const wd = new Date(Date.UTC(2026, 8, 1 + i)).getUTCDay()
      return { day: day(i), usdtConsumedMicro: (wd === 5 ? 200 : 1000) * U }
    })
    const f = forecastDemand({ history: h, backlogMicro: 0, params: { forecastEmaDays: 14 } })
    expect(f.weekdayFactors.reduce((a, b) => a + b, 0) / 7).toBeCloseTo(1, 10)
    expect(f.weekdayFactors[5]!).toBeLessThan(0.4)
    expect(f.weekdayFactors[1]!).toBeGreaterThan(1)
    const fri = '2026-10-02'
    const sat = '2026-10-03'
    expect(demandOn(f, fri)).toBeLessThan(demandOn(f, sat) / 3)
    // level is the average day, deseasonalised: (6·1000 + 200)/7 ≈ 885.7
    expect(f.dailyMicro / U).toBeGreaterThan(850)
    expect(f.dailyMicro / U).toBeLessThan(920)
  })

  it('gaps count as zero consumption days', () => {
    const f = forecastDemand({ history: [{ day: '2026-09-01', usdtConsumedMicro: 1000 * U }, { day: '2026-09-05', usdtConsumedMicro: 1000 * U }], backlogMicro: 0, params: { forecastEmaDays: 5 } })
    expect(f.sampleDays).toBe(5)
    expect(f.dailyMicro).toBeLessThan(800 * U)
  })

  it('duplicate days are summed and unordered input is fine', () => {
    const a = forecastDemand({ history: [{ day: '2026-09-02', usdtConsumedMicro: 3 * U }, { day: '2026-09-01', usdtConsumedMicro: 1 * U }, { day: '2026-09-01', usdtConsumedMicro: 1 * U }], backlogMicro: 0, params: { forecastEmaDays: 2 } })
    const b = forecastDemand({ history: [{ day: '2026-09-01', usdtConsumedMicro: 2 * U }, { day: '2026-09-02', usdtConsumedMicro: 3 * U }], backlogMicro: 0, params: { forecastEmaDays: 2 } })
    expect(a).toEqual(b)
  })
})

// ───────────────────────────────── coverage ─────────────────────────────────
describe('coverage & float maths', () => {
  it('requiredFloatUsdt = daily × (lock + lag + safety) rounded up (default target 5.5 d = 3 + 1 + 1.5)', () => {
    expect(requiredFloatUsdt(1000 * U, 3, 1, 1.5)).toBe(5500 * U)
    expect(requiredFloatUsdt(333, 3, 1, 1.5)).toBe(Math.ceil(333 * 5.5))
    expect(requiredFloatUsdt(0, 3, 1, 1)).toBe(0)
  })

  it('effective float counts provider + wallet + transit + all exchange USDT; locked pipeline reported separately', () => {
    const st = state({
      walletUsdt: 100 * U,
      inTransitUsdt: 50 * U,
      providers: { mpay: { balanceMicro: 700 * U } },
      exchanges: { tabdeal: { irt: 9, usdt: 1000 * U, usdtWithdrawable: 400 * U } },
      backlogMicro: 200 * U,
    })
    const c = coverage(st, P.treasury)
    expect(c.effectiveFloat).toBe(1850 * U)
    expect(c.usableFloat).toBe(1250 * U)
    expect(c.lockedPipeline).toBe(600 * U)
    expect(c.targetFloat).toBe(5500 * U + 200 * U)
    expect(c.coverageDays).toBeCloseTo((1850 - 200) / 1000, 10)
    expect(c.shortfall).toBe(5700 * U - 1850 * U)
    expect(c.surplus).toBe(0)
    expect(c.minFloat).toBe(3500 * U + 200 * U)
    expect(c.maxFloat).toBe(9000 * U + 200 * U)
  })

  it('surplus and zero-demand cases', () => {
    const rich = coverage(state({ walletUsdt: 8000 * U }), P.treasury)
    expect(rich.shortfall).toBe(0)
    expect(rich.surplus).toBe(2500 * U)
    expect(coverage(state({ dailyConsumptionMicro: 0, walletUsdt: 5 * U }), P.treasury).coverageDays).toBe(999)
    expect(coverage(state({ dailyConsumptionMicro: 0 }), P.treasury).coverageDays).toBe(0)
  })

  it('conversionCost: deposit fee → taker fee → buy → withdrawal fee, all-in per credited USDT', () => {
    const c = conversionCost({ irtBudget: 257_000_000, ask: 257_000, takerBps: 25, depositFeeIrt: 0, withdrawFeeMicro: 1 * U })
    expect(c.exchangeFeeIrt).toBe(Math.ceil((257_000_000 * 0.0025) / 1.0025))
    expect(c.boughtMicro).toBeLessThan(1000 * U)
    expect(c.creditedMicro).toBe(c.boughtMicro - U)
    expect(c.allInIrtPerUsdt).toBeCloseTo((257_000_000 * 1e6) / c.creditedMicro, 6)
    expect(c.allInIrtPerUsdt).toBeGreaterThan(257_000 * 1.0025)
    const withDep = conversionCost({ irtBudget: 257_000_000, ask: 257_000, takerBps: 25, depositFeeIrt: 5_000_000 })
    expect(withDep.boughtMicro).toBeLessThan(c.boughtMicro + U)
    expect(conversionCost({ irtBudget: 10, ask: 257_000, takerBps: 25, withdrawFeeMicro: U }).allInIrtPerUsdt).toBe(Number.POSITIVE_INFINITY)
  })
})

// ───────────────────────────────── planner ─────────────────────────────────
describe('planReplenishment', () => {
  it('surplus → no buy, no deposit (coverage ≥ target)', () => {
    const items = plan({}, { walletUsdt: 6000 * U, providers: { mpay: { balanceMicro: 0, share: 1 } } })
    expect(of(items, 'buy_usdt')).toEqual([])
    expect(of(items, 'deposit_irt')).toEqual([])
  })

  it('shortage → buys exactly the shortfall (batch-rounded) at the cheapest all-in exchange, depositing the missing Toman', () => {
    const st = { walletUsdt: 2000 * U }
    const items = plan({}, st)
    const buys = of(items, 'buy_usdt')
    expect(buys.length).toBe(1)
    expect(buys[0]!.exchangeId).toBe('tabdeal') // 257000·1.0025 + fee effect is cheapest
    expect(buys[0]!.blockedReason).toBeUndefined()
    // shortfall 3500 USDT (already a multiple of the 500 batch)
    expect(buys[0]!.amountMicroUsdt!).toBeGreaterThan(3499 * U)
    expect(buys[0]!.amountMicroUsdt!).toBeLessThanOrEqual(3500 * U)
    const dep = of(items, 'deposit_irt')
    expect(dep.length).toBe(1)
    expect(dep[0]!.exchangeId).toBe('tabdeal')
    expect(dep[0]!.amountIrt).toBe(buys[0]!.amountIrt)
    // deposit comes before the buy
    expect(items.indexOf(dep[0]!)).toBeLessThan(items.indexOf(buys[0]!))
    expect(buys[0]!.allInRate).toBeGreaterThan(257_000)
  })

  it('uses IRT already at the exchange before depositing', () => {
    const st = state({ walletUsdt: 2000 * U })
    st.exchanges.tabdeal = { irt: 2_000_000_000, usdt: 0, usdtWithdrawable: 0 }
    const items = plan({}, st)
    expect(of(items, 'deposit_irt')).toEqual([])
    expect(of(items, 'buy_usdt')[0]!.exchangeId).toBe('tabdeal')
  })

  it('buy need is capped by maxCoverageDays and rounded up to the batch', () => {
    const items = plan({}, { walletUsdt: 5100 * U, backlogMicro: 0 })
    // shortfall 400 → batch 500 → but room to max = 9000−5100 = 3900 fine → 500
    expect(sumMicro(of(items, 'buy_usdt'))).toBeGreaterThan(499 * U)
    expect(sumMicro(of(items, 'buy_usdt'))).toBeLessThanOrEqual(500 * U)
  })

  it('a tiny need below minBuy is dropped unless coverage is below the minimum', () => {
    expect(of(plan({}, { walletUsdt: 5450 * U }), 'buy_usdt')).toEqual([]) // shortfall 50 < 100, coverage 5.45 d ≥ min
    const urgent = of(plan({ params: { treasury: { ...P.treasury, buyBatchMicroUsdt: 1 }, exchanges: P.exchanges, providers: P.providers } }, { walletUsdt: 3450 * U }), 'buy_usdt')
    expect(sumMicro(urgent)).toBeGreaterThan(2000 * U) // below min coverage → real buy (shortfall 2050)
  })

  it('backlog raises the target', () => {
    const none = plan({}, { walletUsdt: 5500 * U })
    const backlog = plan({}, { walletUsdt: 5500 * U, backlogMicro: 1000 * U })
    expect(of(none, 'buy_usdt')).toEqual([])
    expect(sumMicro(of(backlog, 'buy_usdt'))).toBeGreaterThan(900 * U)
  })

  it('ranks exchanges by ALL-IN cost (taker fee included), ties by preference', () => {
    const lim = Object.fromEntries(EX.map((e) => [e, limits(e, { takerFeeBps: e === 'abantether' ? 0 : 35 })]))
    const rate = snapshot({ tickers: EX.map((e) => ticker(e, 256_000, 257_000 + (e === 'abantether' ? 100 : 0))) })
    const items = plan({ limitsByExchange: lim, rate }, { walletUsdt: 2000 * U })
    expect(of(items, 'buy_usdt')[0]!.exchangeId).toBe('abantether') // 0 bps beats 35 bps despite +100 Toman ask
    // equal all-in → preference order (tabdeal first)
    const eq = plan({ limitsByExchange: Object.fromEntries(EX.map((e) => [e, limits(e, { takerFeeBps: 25 })])), rate: snapshot({ tickers: EX.map((e) => ticker(e, 256_000, 257_000)) }) }, { walletUsdt: 2000 * U })
    expect(of(eq, 'buy_usdt')[0]!.exchangeId).toBe('tabdeal')
  })

  it('2,000 USDT/day per-user buy cap: need is split across exchanges in cost order', () => {
    const items = plan({ regulatory: reg({ dailyBuyCapMicroUsdt: 2000 * U }) }, { walletUsdt: 2000 * U })
    const buys = of(items, 'buy_usdt')
    expect(buys.length).toBe(2)
    expect(buys[0]!.exchangeId).toBe('tabdeal')
    expect(buys[0]!.amountMicroUsdt).toBe(2000 * U)
    expect(buys[1]!.amountMicroUsdt!).toBeGreaterThan(1499 * U)
    expect(buys[1]!.exchangeId).not.toBe('tabdeal')
    for (const b of buys) expect(b.amountMicroUsdt!).toBeLessThanOrEqual(2000 * U)
  })

  it('exchange-reported remaining buy cap wins over the regulatory default; exhausted caps are reported', () => {
    const lim = Object.fromEntries(EX.map((e) => [e, limits(e, { takerFeeBps: 25, buyCapRemainingMicroUsdt: e === 'tabdeal' ? 300 * U : 0 })]))
    const items = plan({ limitsByExchange: lim }, { walletUsdt: 5000 * U })
    const buys = of(items, 'buy_usdt')
    expect(buys[0]!.exchangeId).toBe('tabdeal')
    expect(buys[0]!.amountMicroUsdt).toBe(300 * U)
    // remaining need cannot be bought anywhere → blocked item explains why
    const blocked = buys.find((b) => b.blockedReason)
    expect(blocked).toBeDefined()
    expect(blocked!.blockedReason).toContain('سقف خرید')
  })

  it('25 M / 24 h deposit cap: 1 identity vs 3 identities (cap is shared across exchanges)', () => {
    const run = (ids: number) => plan({ regulatory: reg({ idDepositCapIrtPer24h: 25_000_000, depositIdentitiesAvailable: ids }) }, { walletUsdt: 2000 * U })
    const one = run(1)
    const three = run(3)
    const dep1 = of(one, 'deposit_irt').reduce((a, i) => a + (i.amountIrt ?? 0), 0)
    const dep3 = of(three, 'deposit_irt').reduce((a, i) => a + (i.amountIrt ?? 0), 0)
    expect(dep1).toBe(25_000_000)
    expect(dep3).toBe(75_000_000)
    // ≈ 97 USDT vs 291 USDT can be bought; rest is blocked with the deposit-cap explanation
    const q1 = sumMicro(of(one, 'buy_usdt').filter((b) => !b.blockedReason))
    const q3 = sumMicro(of(three, 'buy_usdt').filter((b) => !b.blockedReason))
    expect(q1 / U).toBeGreaterThan(90)
    expect(q1 / U).toBeLessThan(100)
    expect(q3 / U).toBeGreaterThan(3 * 90)
    expect(q3 / U).toBeLessThan(3 * 100)
    const blocked = of(one, 'buy_usdt').find((b) => b.blockedReason)!
    expect(blocked.blockedReason).toContain('سقف واریز')
    expect(blocked.blockedReason).toContain('شناسه')
  })

  it('exchange-reported deposit allowance is used per exchange; override replaces the regulatory cap', () => {
    const lim = Object.fromEntries(EX.map((e) => [e, limits(e, { takerFeeBps: 25, depositCapRemainingIrt: e === 'tabdeal' ? 10_000_000 : e === 'nobitex' ? 40_000_000 : 0 })]))
    const items = plan({ limitsByExchange: lim }, { walletUsdt: 2000 * U })
    const dep = Object.fromEntries(of(items, 'deposit_irt').map((i) => [i.exchangeId!, i.amountIrt!]))
    expect(dep.tabdeal).toBe(10_000_000)
    expect(dep.nobitex).toBe(40_000_000)
    expect(dep.wallex).toBeUndefined()
    const ov = P.exchanges.map((e) => (e.id === 'tabdeal' ? { ...e, depositCapIrtPer24hOverride: 5_000_000 } : e))
    const items2 = plan({ params: { treasury: P.treasury, exchanges: ov, providers: P.providers }, regulatory: reg({ idDepositCapIrtPer24h: 25_000_000 }) }, { walletUsdt: 2000 * U })
    expect(of(items2, 'deposit_irt').find((i) => i.exchangeId === 'tabdeal')!.amountIrt).toBe(5_000_000)
  })

  it('cash reserve is never touched; shortage of bank cash is explained', () => {
    const items = plan({}, { walletUsdt: 2000 * U, bankIrt: P.treasury.cashReserveIrt + 50_000_000 })
    expect(of(items, 'deposit_irt').reduce((a, i) => a + (i.amountIrt ?? 0), 0)).toBe(50_000_000)
    const none = plan({}, { walletUsdt: 2000 * U, bankIrt: P.treasury.cashReserveIrt })
    expect(of(none, 'deposit_irt')).toEqual([])
    const b = of(none, 'buy_usdt')
    expect(b.length).toBe(1)
    expect(b[0]!.blockedReason).toContain('نقدینگی بانک')
  })

  it('respects the exchange minimum order', () => {
    const lim = Object.fromEntries(EX.map((e) => [e, limits(e, { takerFeeBps: 25, minOrderIrt: 500_000_000 })]))
    const items = plan({ limitsByExchange: lim }, { walletUsdt: 2000 * U, bankIrt: P.treasury.cashReserveIrt + 100_000_000 })
    expect(of(items, 'deposit_irt')).toEqual([])
    expect(of(items, 'buy_usdt')[0]!.blockedReason).toContain('حداقل سفارش')
  })

  it('night halt: all exchanges closed → buys are scheduled at the next open with a Persian reason; deposits can still run now', () => {
    const open = NOW + 6 * MS.hour
    const lim = Object.fromEntries(EX.map((e) => [e, limits(e, { takerFeeBps: 25, tradingOpen: false, nextTradingOpenAt: open })]))
    const items = plan({ limitsByExchange: lim }, { walletUsdt: 2000 * U })
    const buys = of(items, 'buy_usdt')
    expect(buys.length).toBeGreaterThan(0)
    for (const b of buys) {
      expect(b.executeAt).toBe(open)
      expect(b.blockedReason).toContain('بسته')
    }
    for (const d of of(items, 'deposit_irt')) expect(d.executeAt).toBe(NOW)
    // deposits are ordered before the later buys
    expect(items.indexOf(of(items, 'deposit_irt')[0]!)).toBeLessThan(items.indexOf(buys[0]!))
  })

  it('night halt by regulation (window 21→9 IRST) closes exchanges even if the port says open', () => {
    const items = plan({ regulatory: reg({ nightHalt: { enabled: true, fromHour: 11, toHour: 14 } }) }, { walletUsdt: 2000 * U }) // NOW = 11:30 IRST
    const b = of(items, 'buy_usdt')[0]!
    expect(b.blockedReason).toContain('بسته')
    expect(b.executeAt).toBeGreaterThan(NOW)
  })

  it('prefers open exchanges over cheaper closed ones', () => {
    const lim = Object.fromEntries(EX.map((e) => [e, limits(e, { takerFeeBps: 25, tradingOpen: e !== 'tabdeal', nextTradingOpenAt: NOW + MS.hour })]))
    const items = plan({ limitsByExchange: lim }, { walletUsdt: 2000 * U })
    const b = of(items, 'buy_usdt')[0]!
    expect(b.exchangeId).toBe('nobitex')
    expect(b.blockedReason).toBeUndefined()
    expect(b.executeAt).toBe(NOW)
  })

  it('immediate withdrawal from UNLOCKED exchange USDT with fee/min respected; wallet funds sweep first', () => {
    const st = state({ providers: { mpay: { balanceMicro: 500 * U, share: 1 } }, walletUsdt: 1000 * U })
    st.exchanges.nobitex = { irt: 0, usdt: 4000 * U, usdtWithdrawable: 4000 * U }
    const items = plan({}, st)
    const sweeps = of(items, 'sweep_provider')
    expect(sweeps.length).toBe(1)
    expect(sweeps[0]!.providerId).toBe('mpay')
    expect(sweeps[0]!.amountMicroUsdt).toBe(1000 * U) // wallet limit (need is 2500)
    const wd = of(items, 'withdraw_usdt')
    expect(wd.length).toBe(1)
    expect(wd[0]!.exchangeId).toBe('nobitex')
    expect(wd[0]!.executeAt).toBe(NOW)
    expect(wd[0]!.network).toBe('TRC20')
    expect(wd[0]!.estimatedFeeMicro).toBe(1 * U)
    // unmet 1500 USDT → request 1500 + 1 fee
    expect(wd[0]!.amountMicroUsdt).toBe(1501 * U)
    expect(wd[0]!.blockedReason).toBeUndefined()
  })

  it('72 h lock: locked USDT is never withdrawn now; the withdrawal is scheduled at withdrawableAt', () => {
    const unlockAt = NOW + 48 * MS.hour
    const lots: UsdtLot[] = [{ id: 'l1', exchangeId: 'nobitex', qtyMicro: 6000 * U, remainingMicro: 6000 * U, costIrt: 1_500_000_000, acquiredAt: NOW - 24 * MS.hour, withdrawableAt: unlockAt, status: 'locked' }]
    const st = state({ providers: { mpay: { balanceMicro: 500 * U, share: 1 } }, lots })
    st.exchanges.nobitex = { irt: 0, usdt: 6000 * U, usdtWithdrawable: 0 }
    const items = plan({}, st)
    expect(of(items, 'buy_usdt')).toEqual([]) // coverage 6500/1000 days ≥ target
    const wd = of(items, 'withdraw_usdt')
    expect(wd.length).toBe(1)
    expect(wd[0]!.executeAt).toBe(unlockAt)
    expect(wd[0]!.blockedReason).toContain('قفل')
    expect(wd.every((w) => w.executeAt > NOW)).toBe(true)
    // need = min(3500, maxFloat 3000) − 500 = 2500 (+1 fee)
    expect(wd[0]!.amountMicroUsdt).toBe(2501 * U)
  })

  it('without a lot book the locked remainder is assumed to unlock after the lock period', () => {
    const st = state({ providers: { mpay: { balanceMicro: 500 * U, share: 1 } } })
    st.exchanges.nobitex = { irt: 0, usdt: 6000 * U, usdtWithdrawable: 0 }
    const wd = of(plan({}, st), 'withdraw_usdt')
    expect(wd.length).toBe(1)
    expect(wd[0]!.executeAt).toBe(NOW + 72 * MS.hour)
  })

  it("the plan's own purchases are scheduled for withdrawal only after their lock (buy now, withdraw at buy + 72 h)", () => {
    const st = state({ providers: { mpay: { balanceMicro: 0, share: 1 } }, walletUsdt: 0 })
    const items = plan({}, st)
    const buys = of(items, 'buy_usdt').filter((b) => !b.blockedReason)
    expect(buys.length).toBeGreaterThan(0)
    const wd = of(items, 'withdraw_usdt')
    expect(wd.length).toBeGreaterThan(0)
    for (const w of wd) {
      expect(w.executeAt).toBe(NOW + 72 * MS.hour)
      expect(w.blockedReason).toContain('قفل')
    }
  })

  it('provider float cap: no sweep beyond maxFloat; at the cap a blocked item explains', () => {
    const maxFloat = P.providers.find((p) => p.id === 'mpay')!.risk.maxFloatMicroUsdt // 3000 USDT
    const st1 = state({ providers: { mpay: { balanceMicro: 2800 * U, share: 1 } }, walletUsdt: 5000 * U })
    const s1 = of(plan({}, st1), 'sweep_provider')
    expect(s1[0]!.amountMicroUsdt).toBe(maxFloat - 2800 * U) // 200
    const st2 = state({ providers: { mpay: { balanceMicro: maxFloat, share: 1 } }, walletUsdt: 5000 * U })
    const s2 = of(plan({}, st2), 'sweep_provider')
    expect(s2.length).toBe(1)
    expect(s2[0]!.blockedReason).toContain('سقف موجودی')
    expect(s2[0]!.amountMicroUsdt).toBe(500 * U) // wanted 3500
  })

  it('maxProviderShare limits a provider relative to total float', () => {
    const big = P.providers.map((p) => (p.id === 'mpay' ? { ...p, risk: { ...p.risk, maxFloatMicroUsdt: 100_000 * U } } : p))
    const st = state({ providers: { mpay: { balanceMicro: 0, share: 1 } }, walletUsdt: 10_000 * U })
    const s = of(plan({ params: { treasury: P.treasury, exchanges: P.exchanges, providers: big } }, st), 'sweep_provider')
    // total float 10,000 → 60 % = 6,000 cap but target is only 3,500 → 3,500
    expect(s[0]!.amountMicroUsdt).toBe(3500 * U)
    const tight = plan({ params: { treasury: { ...P.treasury, maxProviderShare: 0.2 }, exchanges: P.exchanges, providers: big } }, st)
    expect(of(tight, 'sweep_provider')[0]!.amountMicroUsdt).toBe(2000 * U) // 20 % of 10,000
  })

  it('sweeps are skipped below sweepMin; several providers split by share', () => {
    const st = state({ providers: { mpay: { balanceMicro: 0, share: 0.5 }, altcard: { balanceMicro: 0, share: 0.5 } }, walletUsdt: 10_000 * U })
    const s = of(plan({}, st), 'sweep_provider')
    expect(s.map((x) => x.providerId).sort()).toEqual(['altcard', 'mpay'])
    for (const x of s) expect(x.amountMicroUsdt).toBe(1750 * U)
    const small = state({ providers: { mpay: { balanceMicro: 3450 * U, share: 1 } }, walletUsdt: 10_000 * U })
    expect(of(plan({}, small), 'sweep_provider')).toEqual([]) // need 50 < sweepMin 100
  })

  it('in-transit USDT reduces the withdrawal need', () => {
    const st = state({ providers: { mpay: { balanceMicro: 500 * U, share: 1 } }, walletUsdt: 0, inTransitUsdt: 3000 * U })
    st.exchanges.nobitex = { irt: 0, usdt: 2000 * U, usdtWithdrawable: 2000 * U }
    expect(of(plan({}, st), 'withdraw_usdt')).toEqual([])
  })

  it('withdrawal below the exchange minimum is blocked with a reason; daily withdraw cap respected', () => {
    const st = state({ providers: { mpay: { balanceMicro: 0, share: 1 } }, walletUsdt: 0 })
    st.exchanges.nobitex = { irt: 0, usdt: 5 * U, usdtWithdrawable: 5 * U }
    const w = of(plan({}, st), 'withdraw_usdt').find((x) => x.executeAt === NOW)
    expect(w?.blockedReason).toContain('حداقل برداشت')
    const st2 = state({ providers: { mpay: { balanceMicro: 500 * U, share: 1 } } })
    st2.exchanges.nobitex = { irt: 0, usdt: 9000 * U, usdtWithdrawable: 9000 * U }
    const lim2 = Object.fromEntries(EX.map((e) => [e, limits(e, { takerFeeBps: 25, withdrawCapRemainingMicroUsdt: 1000 * U })]))
    const w2 = of(plan({ limitsByExchange: lim2 }, st2), 'withdraw_usdt')[0]!
    expect(w2.amountMicroUsdt).toBe(1000 * U)
    expect(w2.blockedReason).toContain('سقف برداشت')
  })

  it('cheapest withdrawal fee exchange is used first', () => {
    const st = state({ providers: { mpay: { balanceMicro: 0, share: 1 } }, walletUsdt: 0 })
    st.exchanges.nobitex = { irt: 0, usdt: 5000 * U, usdtWithdrawable: 5000 * U }
    st.exchanges.wallex = { irt: 0, usdt: 5000 * U, usdtWithdrawable: 5000 * U }
    const lim = Object.fromEntries(EX.map((e) => [e, limits(e, { takerFeeBps: 25, withdrawFeeMicroUsdt: { TRC20: e === 'wallex' ? 0.5 * U : 2 * U } })]))
    const wd = of(plan({ limitsByExchange: lim }, st), 'withdraw_usdt')
    expect(wd[0]!.exchangeId).toBe('wallex')
  })

  it('items are ordered by time then deposit → buy → withdraw → sweep; every item has a Persian rationale', () => {
    const st = state({ providers: { mpay: { balanceMicro: 500 * U, share: 1 } }, walletUsdt: 600 * U })
    st.exchanges.nobitex = { irt: 0, usdt: 1000 * U, usdtWithdrawable: 1000 * U }
    const items = plan({}, st)
    const order = { deposit_irt: 0, buy_usdt: 1, withdraw_usdt: 2, sweep_provider: 3 }
    for (let i = 1; i < items.length; i++) {
      const a = items[i - 1]!
      const b = items[i]!
      expect(a.executeAt < b.executeAt || (a.executeAt === b.executeAt && order[a.type] <= order[b.type])).toBe(true)
    }
    for (const it of items) expect(it.rationaleFa.length).toBeGreaterThan(5)
  })

  it('is pure and deterministic; ignores outlier/stale/disabled exchanges and exchanges without ticker or limits', () => {
    const input: PlanInput = {
      now: NOW,
      state: state({ walletUsdt: 2000 * U }),
      limitsByExchange: Object.fromEntries(EX.filter((e) => e !== 'wallex').map((e) => [e, limits(e, { takerFeeBps: 25 })])),
      rate: snapshot({ tickers: EX.filter((e) => e !== 'bitpin').map((e) => ticker(e, 256_000, ASKS[e] as number)), excluded: [{ exchangeId: 'tabdeal', reason: 'outlier: mid deviates 9% from the median' }] }),
      params: { treasury: P.treasury, exchanges: P.exchanges, providers: P.providers },
      regulatory: reg(),
    }
    const snap = structuredClone(input)
    const a = planReplenishment(input)
    expect(planReplenishment(input)).toEqual(a)
    expect(input).toEqual(snap)
    const used = new Set(a.map((i) => i.exchangeId))
    expect(used.has('tabdeal')).toBe(false) // outlier
    expect(used.has('wallex')).toBe(false) // no limits
    expect(used.has('bitpin')).toBe(false) // no ticker
    expect(used.has('nobitex')).toBe(true)
  })

  it('no usable exchange → a single blocked buy item with an explanation', () => {
    const items = of(plan({ limitsByExchange: {} }, { walletUsdt: 2000 * U }), 'buy_usdt')
    expect(items.length).toBe(1)
    expect(items[0]!.blockedReason).toContain('هیچ صرافی')
  })

  it('PROPERTY: random states never plan more than max coverage, never violate caps, never touch the cash reserve, never withdraw locked USDT now', () => {
    const rng = createRng('plan-prop')
    for (let i = 0; i < 300; i++) {
      const daily = rng.int(100, 3000) * U
      const st = state({
        bankIrt: rng.int(0, 3_000_000_000),
        dailyConsumptionMicro: daily,
        walletUsdt: rng.int(0, 6000) * U,
        inTransitUsdt: rng.int(0, 500) * U,
        backlogMicro: rng.int(0, 400) * U,
        providers: { mpay: { balanceMicro: rng.int(0, 3500) * U, share: 1 } },
      })
      for (const e of EX) {
        const usdt = rng.int(0, 2000) * U
        st.exchanges[e] = { irt: rng.int(0, 300_000_000), usdt, usdtWithdrawable: Math.floor(usdt * rng.next()) }
      }
      const capPerDay = rng.bool() ? rng.int(500, 3000) * U : null
      const depCap = rng.bool() ? 25_000_000 * rng.int(1, 4) : null
      const r = reg({ dailyBuyCapMicroUsdt: capPerDay, idDepositCapIrtPer24h: depCap, depositIdentitiesAvailable: rng.int(1, 3) })
      const items = plan({ regulatory: r }, st)
      const cov = coverage(st, P.treasury)
      const executableBuys = of(items, 'buy_usdt').filter((b) => !b.blockedReason && b.executeAt === NOW)
      const planned = executableBuys.reduce((a, b) => a + (b.amountMicroUsdt ?? 0), 0)
      expect(cov.effectiveFloat + planned).toBeLessThanOrEqual(Math.max(cov.maxFloat, cov.effectiveFloat) + P.treasury.buyBatchMicroUsdt)
      if (cov.shortfall === 0) expect(of(items, 'buy_usdt')).toEqual([])
      const deposits = of(items, 'deposit_irt').reduce((a, d) => a + (d.amountIrt ?? 0), 0)
      expect(deposits).toBeLessThanOrEqual(Math.max(0, st.bankIrt - P.treasury.cashReserveIrt))
      if (depCap !== null) expect(deposits).toBeLessThanOrEqual(depCap * r.depositIdentitiesAvailable)
      if (capPerDay !== null) for (const b of of(items, 'buy_usdt')) if (b.exchangeId && !b.blockedReason) expect(b.amountMicroUsdt!).toBeLessThanOrEqual(capPerDay)
      for (const w of of(items, 'withdraw_usdt').filter((x) => x.executeAt === NOW && !x.blockedReason)) {
        expect(w.amountMicroUsdt!).toBeLessThanOrEqual(st.exchanges[w.exchangeId!]!.usdtWithdrawable)
      }
      for (const it of items) {
        expect(it.executeAt).toBeGreaterThanOrEqual(NOW)
        for (const v of [it.amountIrt, it.amountMicroUsdt]) if (v !== undefined) expect(Number.isSafeInteger(v)).toBe(true)
      }
    }
  })
})
