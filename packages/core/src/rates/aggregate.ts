/**
 * aggregateRates — builds a `RateSnapshot` from exchange tickers + our per-exchange limits (architecture §8).
 *
 * Pipeline
 *  1. Validate tickers (finite, > 0, ask ≥ bid) and drop disabled exchanges / stale tickers (older than `risk.killSwitch.staleAfterMs`).
 *  2. Outlier rejection: with ≥ 3 usable tickers, any whose mid deviates from the median mid by more than `risk.killSwitch.anomalyPct`
 *     is rejected (reason `outlier`) and does not contribute to `mid` or to the executable prices.
 *  3. `mid` = median of the remaining mids.
 *  4. Executable ask: among remaining exchanges that are `tradingOpen`, have buy-cap left (≥ their min order) and are enabled,
 *     choose the one with the lowest ALL-IN price `ask·(1 + takerBps/10⁴)` (taker fee from `ExchangeLimits.takerFeeBps`);
 *     `executableAsk` is that exchange's ask and `executableAskExchangeId` identifies it (pricing applies its taker fee again —
 *     see pricing docs; the snapshot keeps the *quoted* ask so it stays comparable with the contract wording "cheapest ask").
 *     Ties break by exchange id (deterministic). Executable bid is the symmetric choice (highest `bid·(1 − takerBps/10⁴)`) among open exchanges.
 *  5. No executable exchange ⇒ status `halted` and `executableAsk = lastKnownAsk·(1 + haltPremiumPct)` where `lastKnownAsk` is the lowest ask
 *     among the usable tickers (market asks are still visible while trading is closed) or, if none, `prev.executableAsk`.
 *  6. Status precedence: `stale` > `anomaly` > `halted` > `ok`. (`killed` is never produced here — it comes from the app's switch.)
 *       stale   : no usable (fresh) ticker at all → values carried from `prev`.
 *       anomaly : majority of tickers rejected as outliers, OR spread between usable mids > anomalyPct when < 3 tickers,
 *                 OR the mid jumped more than anomalyPct vs `prev.mid`.
 *
 * Pure: no clock (pass `now`), no randomness. The snapshot id is `id` (caller-generated) or `rs_<now>`.
 */
import type { ExchangeTicker, RateSnapshot, RateStatus } from '@hiclaude/contracts'
import type { ExchangeLimits } from '@hiclaude/contracts'
import type { ExchangeParams, PricingPolicy, RiskParams } from '@hiclaude/contracts'
import { D } from '../money'

export interface AggregateRatesInput {
  now: number
  /** Optional caller-generated snapshot id (use IdGen). Defaults to `rs_<now>`. */
  id?: string
  tickers: ExchangeTicker[]
  limits: ExchangeLimits[]
  exchangesParams: ExchangeParams[]
  prev?: RateSnapshot
  /** Output of `VolatilityEstimator.estimate()` (fractions). */
  vol: { dailyPct: number; driftPctPerDay: number; windowHours: number }
  params: { risk: Pick<RiskParams, 'killSwitch'>; pricing: Pick<PricingPolicy, 'volatility'> }
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const n = s.length
  if (n === 0) return NaN
  const m = Math.floor(n / 2)
  return n % 2 === 1 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2
}

const validTicker = (t: ExchangeTicker): boolean =>
  Number.isFinite(t.bid) && Number.isFinite(t.ask) && t.bid > 0 && t.ask > 0 && t.ask >= t.bid && Number.isFinite(t.asOf)

/** Builds a rate snapshot. See module docs for the exact algorithm. */
export function aggregateRates(input: AggregateRatesInput): RateSnapshot {
  const { now, tickers, limits, exchangesParams, prev, vol, params } = input
  const { staleAfterMs, anomalyPct } = params.risk.killSwitch
  const haltPremium = params.pricing.volatility.haltPremiumPct
  const excluded: { exchangeId: string; reason: string }[] = []
  const notes: string[] = []
  const limitsById = new Map(limits.map((l) => [l.exchangeId, l]))
  const paramsById = new Map(exchangesParams.map((p) => [p.id, p]))

  // 1. validation / freshness
  let usable: ExchangeTicker[] = []
  const sorted = [...tickers].sort((a, b) => (a.exchangeId < b.exchangeId ? -1 : a.exchangeId > b.exchangeId ? 1 : 0))
  for (const t of sorted) {
    const p = paramsById.get(t.exchangeId)
    if (p && !p.enabled) {
      excluded.push({ exchangeId: t.exchangeId, reason: 'disabled: exchange disabled in settings' })
      continue
    }
    if (!validTicker(t)) {
      excluded.push({ exchangeId: t.exchangeId, reason: 'invalid: non-positive, crossed or non-finite quote' })
      continue
    }
    if (now - t.asOf > staleAfterMs) {
      excluded.push({ exchangeId: t.exchangeId, reason: `stale: ticker is ${Math.round((now - t.asOf) / 1000)}s old` })
      continue
    }
    usable.push(t)
  }
  const freshCount = usable.length

  // 2. outlier rejection
  let outliers = 0
  if (usable.length >= 3) {
    const med = median(usable.map((t) => (t.bid + t.ask) / 2))
    const keep: ExchangeTicker[] = []
    for (const t of usable) {
      const mid = (t.bid + t.ask) / 2
      const dev = Math.abs(mid / med - 1)
      if (dev > anomalyPct) {
        outliers++
        excluded.push({ exchangeId: t.exchangeId, reason: `outlier: mid deviates ${(dev * 100).toFixed(2)}% from the median` })
      } else keep.push(t)
    }
    usable = keep
  }

  // stale: nothing usable
  if (usable.length === 0) {
    const status: RateStatus = 'stale'
    notes.push(freshCount === 0 && tickers.length > 0 ? 'no fresh ticker available' : 'no usable ticker')
    return {
      id: input.id ?? `rs_${now}`,
      ts: now,
      tickers: [...tickers],
      executableAsk: prev?.executableAsk ?? 0,
      executableAskExchangeId: undefined,
      executableBid: prev?.executableBid ?? 0,
      executableBidExchangeId: undefined,
      mid: prev?.mid ?? 0,
      status,
      volatility: { ...vol },
      excluded,
      notes,
    }
  }

  // 3. mid
  const mid = median(usable.map((t) => (t.bid + t.ask) / 2))

  // 4. executable ask / bid
  let bestAsk: { t: ExchangeTicker; allIn: number } | undefined
  let bestBid: { t: ExchangeTicker; allIn: number } | undefined
  for (const t of usable) {
    const lim = limitsById.get(t.exchangeId)
    if (!lim) {
      excluded.push({ exchangeId: t.exchangeId, reason: 'no_limits: no limits info, not executable' })
      continue
    }
    const taker = lim.takerFeeBps / 10_000
    if (!lim.tradingOpen) {
      excluded.push({ exchangeId: t.exchangeId, reason: 'closed: trading closed' + (lim.nextTradingOpenAt ? ` until ${lim.nextTradingOpenAt}` : '') })
    } else {
      // bid side only needs the exchange to be open
      const allInBid = t.bid * (1 - taker)
      if (!bestBid || allInBid > bestBid.allIn) bestBid = { t, allIn: allInBid }
      // ask side also needs buy-cap left ≥ min order
      const minQtyMicro = lim.minOrderIrt > 0 ? D(lim.minOrderIrt).mul(1_000_000).div(t.ask).ceil().toNumber() : 0
      if (lim.buyCapRemainingMicroUsdt !== null && lim.buyCapRemainingMicroUsdt < Math.max(1, minQtyMicro)) {
        excluded.push({ exchangeId: t.exchangeId, reason: 'cap_exhausted: daily buy cap left is below the minimum order' })
      } else {
        const allInAsk = t.ask * (1 + taker)
        if (!bestAsk || allInAsk < bestAsk.allIn) bestAsk = { t, allIn: allInAsk }
      }
    }
  }

  let executableAsk: number
  let executableAskExchangeId: string | undefined
  let halted = false
  if (bestAsk) {
    executableAsk = bestAsk.t.ask
    executableAskExchangeId = bestAsk.t.exchangeId
  } else {
    halted = true
    const lastKnown = Math.min(...usable.map((t) => t.ask))
    executableAsk = (Number.isFinite(lastKnown) ? lastKnown : (prev?.executableAsk ?? 0)) * (1 + haltPremium)
    notes.push(`no exchange can be bought from right now; using last-known ask × (1 + ${haltPremium})`)
  }
  let executableBid: number
  let executableBidExchangeId: string | undefined
  if (bestBid) {
    executableBid = bestBid.t.bid
    executableBidExchangeId = bestBid.t.exchangeId
  } else {
    const lastKnownBid = Math.max(...usable.map((t) => t.bid))
    executableBid = Number.isFinite(lastKnownBid) ? lastKnownBid : (prev?.executableBid ?? 0)
    notes.push('no exchange is open for selling; bid is last-known')
  }

  // 6. status
  let status: RateStatus = halted ? 'halted' : 'ok'
  let anomaly = false
  if (usable.length >= 1 && freshCount >= 3 && outliers * 2 >= freshCount) {
    anomaly = true
    notes.push('anomaly: half or more of the exchanges disagree with the median')
  }
  if (freshCount < 3 && usable.length >= 2) {
    const mids = usable.map((t) => (t.bid + t.ask) / 2)
    const spread = Math.max(...mids) / Math.min(...mids) - 1
    if (spread > anomalyPct) {
      anomaly = true
      notes.push(`anomaly: spread between exchanges ${(spread * 100).toFixed(2)}% exceeds ${(anomalyPct * 100).toFixed(2)}%`)
    }
  }
  if (prev && prev.mid > 0 && Math.abs(mid / prev.mid - 1) > anomalyPct) {
    anomaly = true
    notes.push(`anomaly: mid jumped ${(Math.abs(mid / prev.mid - 1) * 100).toFixed(2)}% since the previous snapshot`)
  }
  if (anomaly) status = 'anomaly'

  return {
    id: input.id ?? `rs_${now}`,
    ts: now,
    tickers: [...tickers],
    executableAsk,
    executableAskExchangeId,
    executableBid,
    executableBidExchangeId,
    mid,
    status,
    volatility: { ...vol },
    excluded,
    notes,
  }
}
