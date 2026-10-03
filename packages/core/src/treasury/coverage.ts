/**
 * Coverage & float maths.
 *
 *  effectiveFloat = Σ provider balances + hot wallet + in-transit + ALL USDT at exchanges (locked pipeline included: bought USDT is ours
 *                   even if the 72 h lock keeps it from being withdrawn — the target already budgets for the lock)
 *  usableFloat    = effectiveFloat − locked exchange USDT        (what can fund orders within hours)
 *  targetFloat    = ceil(daily · targetCoverageDays) + backlog
 *  coverageDays   = (effectiveFloat − backlog) / daily           (999 when daily = 0 and float > 0)
 *  shortfall      = max(0, target − effective)
 *  requiredFloatUsdt(daily, lockDays, lagDays, safetyDays) = ceil(daily · (lockDays + lagDays + safetyDays))   — the default 5.5 d target = 3 + 1 + 1.5
 */
import type { Irt, MicroUsdt, TreasuryParams, UsdtLot } from '@hiclaude/contracts'
import { D, toInt } from '../money'
import { computeExchangeBuy } from '../ledger/templates'

export interface TreasuryState {
  bankIrt: Irt
  exchanges: Record<string, { irt: Irt; usdt: MicroUsdt; usdtWithdrawable: MicroUsdt }>
  walletUsdt: MicroUsdt
  inTransitUsdt: MicroUsdt
  /** `share` = fraction of daily consumption fulfilled through this provider (defaults to an equal split among listed providers). */
  providers: Record<string, { balanceMicro: MicroUsdt; share?: number }>
  /** From `forecastDemand().dailyMicro`. */
  dailyConsumptionMicro: MicroUsdt
  /** USDT needed by paid-but-undelivered orders. */
  backlogMicro: MicroUsdt
  /** Optional lot book (lock timing). Without it `usdtWithdrawable` is trusted and the locked rest is assumed to unlock after the lock period. */
  lots?: UsdtLot[]
}

export interface CoverageResult {
  dailyConsumption: MicroUsdt
  targetFloat: MicroUsdt
  effectiveFloat: MicroUsdt
  usableFloat: MicroUsdt
  lockedPipeline: MicroUsdt
  coverageDays: number
  shortfall: MicroUsdt
  surplus: MicroUsdt
  minFloat: MicroUsdt
  maxFloat: MicroUsdt
}

/** Closed-form float requirement; pass micro-USDT, get micro-USDT rounded UP. */
export function requiredFloatUsdt(dailyUsdt: number, lockDays: number, lagDays: number, safetyDays: number): number {
  return toInt(D(dailyUsdt).mul(D(lockDays).plus(lagDays).plus(safetyDays)), 'up', 'requiredFloat')
}

/** Coverage figures for the treasury state. */
export function coverage(state: TreasuryState, params: Pick<TreasuryParams, 'targetCoverageDays' | 'minCoverageDays' | 'maxCoverageDays'>): CoverageResult {
  const daily = state.dailyConsumptionMicro
  const providers = Object.values(state.providers).reduce((a, p) => a + p.balanceMicro, 0)
  const exchangesUsdt = Object.values(state.exchanges).reduce((a, e) => a + e.usdt, 0)
  const exchangesUnlocked = Object.values(state.exchanges).reduce((a, e) => a + e.usdtWithdrawable, 0)
  const effective = providers + state.walletUsdt + state.inTransitUsdt + exchangesUsdt
  const locked = Math.max(0, exchangesUsdt - exchangesUnlocked)
  const target = toInt(D(daily).mul(params.targetCoverageDays), 'up') + state.backlogMicro
  const net = effective - state.backlogMicro
  const days = daily > 0 ? net / daily : net > 0 ? 999 : 0
  return {
    dailyConsumption: daily,
    targetFloat: target,
    effectiveFloat: effective,
    usableFloat: effective - locked,
    lockedPipeline: locked,
    coverageDays: Math.max(-999, Math.min(999, days)),
    shortfall: Math.max(0, target - effective),
    surplus: Math.max(0, effective - target),
    minFloat: toInt(D(daily).mul(params.minCoverageDays), 'up') + state.backlogMicro,
    maxFloat: toInt(D(daily).mul(params.maxCoverageDays), 'up') + state.backlogMicro,
  }
}

export interface ConversionCost {
  spentIrt: Irt
  depositFeeIrt: Irt
  exchangeFeeIrt: Irt
  boughtMicro: MicroUsdt
  withdrawFeeMicro: MicroUsdt
  /** USDT that arrives at the provider/wallet. */
  creditedMicro: MicroUsdt
  /** All-in Toman per credited USDT (the number to rank exchanges by). */
  allInIrtPerUsdt: number
}

/**
 * All-in conversion of a Toman budget into USDT credited at the wallet/provider via one exchange:
 * `deposit fee` → taker fee (`ceil(B·φ/(1+φ))`) → buy at `ask` → withdrawal fee on `network`.
 */
export function conversionCost(i: { irtBudget: Irt; ask: number; takerBps: number; depositFeeIrt?: Irt; withdrawFeeMicro?: MicroUsdt }): ConversionCost {
  const depositFee = i.depositFeeIrt ?? 0
  const spend = Math.max(0, i.irtBudget - depositFee)
  const buy = computeExchangeBuy({ spentIrt: spend, takerBps: i.takerBps, askRate: i.ask })
  const wf = i.withdrawFeeMicro ?? 0
  const credited = Math.max(0, buy.qtyMicro - wf)
  return {
    spentIrt: i.irtBudget,
    depositFeeIrt: depositFee,
    exchangeFeeIrt: buy.feeIrt,
    boughtMicro: buy.qtyMicro,
    withdrawFeeMicro: wf,
    creditedMicro: credited,
    allInIrtPerUsdt: credited > 0 ? D(i.irtBudget).mul(1_000_000).div(credited).toNumber() : Number.POSITIVE_INFINITY,
  }
}
