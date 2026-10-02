/**
 * Units & money primitives. [CONTRACT]
 * All balances are integers. Rates are floats (market data), never balances.
 */

/** Toman. Integer. 1 Toman = 10 Rial. */
export type Irt = number
/** USDT in micro-units (1 USDT = 1_000_000). Integer. */
export type MicroUsdt = number
/** USD in cents. Integer. 1 USD of provider balance is assumed to equal 1 USDT (par), see params.stablecoin.parHaircutBps. */
export type UsdCents = number
/** Basis points: 100 bps = 1 %. Integer. */
export type Bps = number
/** Milliseconds since Unix epoch (UTC). Integer. */
export type EpochMs = number

export const MICRO_PER_USDT = 1_000_000
export const CENTS_PER_USD = 100
export const MICRO_PER_CENT = 10_000

export const usdtToMicro = (usdt: number): MicroUsdt => Math.round(usdt * MICRO_PER_USDT)
export const microToUsdt = (micro: MicroUsdt): number => micro / MICRO_PER_USDT
export const usdCentsToMicroUsdt = (cents: UsdCents): MicroUsdt => cents * MICRO_PER_CENT
export const microUsdtToUsdCents = (micro: MicroUsdt): UsdCents => Math.round(micro / MICRO_PER_CENT)
export const usdToCents = (usd: number): UsdCents => Math.round(usd * CENTS_PER_USD)
export const centsToUsd = (cents: UsdCents): number => cents / CENTS_PER_USD

/** Toman → Rial (gateways and banks speak Rial). Only convert at adapter boundaries. */
export const toRial = (t: Irt): number => t * 10
export const fromRial = (rial: number): Irt => Math.round(rial / 10)

export const bpsToFraction = (b: Bps): number => b / 10_000
export const fractionToBps = (f: number): Bps => Math.round(f * 10_000)
export const pctToFraction = (pct: number): number => pct / 100

/** Throws unless `n` is a safe integer. Use at module boundaries that accept money. */
export function assertInt(n: number, label = 'amount'): number {
  if (!Number.isSafeInteger(n)) throw new RangeError(`${label} must be a safe integer, got ${n}`)
  return n
}

/** Integer helpers with explicit rounding (customer prices up, payouts down). */
export const ceilTo = (n: number, step: number): number => (step <= 1 ? Math.ceil(n) : Math.ceil(n / step) * step)
export const floorTo = (n: number, step: number): number => (step <= 1 ? Math.floor(n) : Math.floor(n / step) * step)
export const roundHalfUp = (n: number): number => Math.floor(n + 0.5)

export type Network = 'TRC20' | 'BEP20' | 'TON' | 'ERC20' | 'POLYGON' | 'SOLANA' | 'ARBITRUM'
export const NETWORKS: readonly Network[] = ['TRC20', 'BEP20', 'TON', 'ERC20', 'POLYGON', 'SOLANA', 'ARBITRUM']
