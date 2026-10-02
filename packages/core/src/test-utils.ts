/** Test fixtures (not part of the public API). */
import { defaultPlatformParams, defaultProducts, type ExchangeLimits, type ExchangeTicker, type PlatformParams, type Product, type RateSnapshot } from '@hiclaude/contracts'
import type { PricingInput } from './pricing/types'

export const NOW = Date.UTC(2026, 9, 2, 8, 0, 0) // 2026-10-02 08:00 UTC = 11:30 IRST (Friday)

export function params(): PlatformParams {
  return defaultPlatformParams()
}

export function product(id = 'vcard-topup', patch: Partial<Product> = {}): Product {
  const p = defaultProducts().find((x) => x.id === id)
  if (!p) throw new Error(`unknown product ${id}`)
  return { ...p, ...patch }
}

export function snapshot(patch: Partial<RateSnapshot> = {}): RateSnapshot {
  return {
    id: 'rs_test',
    ts: NOW,
    tickers: [],
    executableAsk: 257_000,
    executableAskExchangeId: 'tabdeal',
    executableBid: 255_500,
    executableBidExchangeId: 'tabdeal',
    mid: 256_250,
    status: 'ok',
    volatility: { dailyPct: 0.012, driftPctPerDay: 0, windowHours: 168 },
    excluded: [],
    notes: [],
    ...patch,
  }
}

export function pricingInput(patch: Partial<PricingInput> = {}): PricingInput {
  const p = params()
  return {
    now: NOW,
    product: product('vcard-topup'),
    provider: p.providers.find((x) => x.id === 'mpay')!,
    exchangeTakerBps: 25,
    amountUsdCents: 10_000,
    rushTierId: 'normal',
    rate: snapshot(),
    policy: p.pricing,
    paymentMethods: p.paymentMethods,
    tax: { vatApplies: p.tax.vatApplies, vatPct: p.tax.vatPct },
    customerTier: 'new',
    methods: ['gateway', 'card_to_card', 'bank_transfer', 'usdt', 'wallet'],
    walletBalanceIrt: 0,
    ...patch,
  }
}

export function ticker(exchangeId: string, bid: number, ask: number, asOf = NOW, extra: Partial<ExchangeTicker> = {}): ExchangeTicker {
  return { exchangeId, bid, ask, asOf, ...extra }
}

export function limits(exchangeId: string, patch: Partial<ExchangeLimits> = {}): ExchangeLimits {
  return {
    exchangeId,
    tradingOpen: true,
    buyCapRemainingMicroUsdt: null,
    depositCapRemainingIrt: null,
    withdrawalLockHours: 72,
    withdrawCapRemainingMicroUsdt: null,
    minOrderIrt: 100_000,
    takerFeeBps: 25,
    withdrawFeeMicroUsdt: { TRC20: 1_000_000 },
    withdrawMinMicroUsdt: { TRC20: 10_000_000 },
    ...patch,
  }
}
