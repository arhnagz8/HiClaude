/** Synthetic MarketSignals / helpers for unit tests of the models (no world, no app). */
import { createRng, fromIrst, type PaymentMethod } from '@hiclaude/contracts'
import { ArrivalProcess } from './arrival'
import { loadSegmentsConfig } from './segments'
import { SeasonalityModel, builtinCalendar } from './seasonality'
import type { MarketSignals, SegmentsConfig } from './types'

export interface SignalOpts {
  now?: number
  macro?: number
  /** our price index (quote / reference); default 1.0 */
  ourIndex?: number
  ourSla?: number
  ourTrust?: number
  competitorIndex?: number
  competitorTrust?: number
  refRate?: number
  killed?: boolean
  gatewayDown?: boolean
}

export const T0 = fromIrst(2026, 10, 3, 0, 0, 0) // Saturday 11 Mehr 1405, 00:00 IRST

export function makeSignals(o: SignalOpts = {}): MarketSignals {
  const refRate = o.refRate ?? 257_000
  return {
    now: o.now ?? T0,
    macroDemandMultiplier: o.macro ?? 1,
    competitorPriceIndex: () => o.competitorIndex ?? 1,
    competitorTrust: () => o.competitorTrust ?? 0.6,
    ourTrust: o.ourTrust ?? 0.6,
    refRateIrtPerUsd: refRate,
    ourQuote: (req) => (o.killed ? null : { priceIrt: Math.round((req.amountUsdCents / 100) * refRate * (o.ourIndex ?? 1)), slaMinutes: o.ourSla ?? 30 }),
    methodAvailable: (m: PaymentMethod) => !(o.gatewayDown && m === 'gateway'),
  }
}

export function makeEnv(seed = 1, cfgOverride?: SegmentsConfig) {
  const cfg = cfgOverride ?? loadSegmentsConfig({ useResearch: false })
  const cal = builtinCalendar()
  const seasonality = new SeasonalityModel(cfg, cal)
  const rng = createRng(seed)
  const arrivals = new ArrivalProcess(cfg, seasonality, rng)
  return { cfg, cal, seasonality, rng, arrivals }
}
