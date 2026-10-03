import {
  err,
  ok,
  portError,
  type Bps,
  type Clock,
  type DepositMethod,
  type DepositResult,
  type ExchangeAccountPort,
  type ExchangeBalances,
  type ExchangeLimits,
  type ExchangeTicker,
  type Irt,
  type MicroUsdt,
  type Network,
  type Result,
  type TradeResult,
  type WithdrawalTicket,
} from '@hiclaude/contracts'
import { CallLog, FailureScript, type FailureSpec } from './common'

export interface FakeExchangeOptions {
  bid?: number
  ask?: number
  takerFeeBps?: Bps
  lockHours?: number
  irt?: Irt
  usdt?: MicroUsdt
  minOrderIrt?: Irt
}

/**
 * Controllable exchange account. Buys lock the purchased USDT for `limits.withdrawalLockHours`; withdrawals need
 * `amount + fee <= withdrawable`. Withdrawals complete `withdrawalDelayMs` after the request (clock-driven).
 */
export class FakeExchange implements ExchangeAccountPort {
  readonly calls = new CallLog()
  readonly failures = new FailureScript()
  tickerState: { bid: number; ask: number; volume24hUsdt?: number }
  limitsState: ExchangeLimits
  irt: Irt
  usdt: MicroUsdt
  withdrawalDelayMs = 10 * 60_000
  /** buy lots: {qty, withdrawableAt} used to compute `usdtWithdrawable` */
  private readonly lots: { qty: MicroUsdt; withdrawableAt: number }[] = []
  private readonly withdrawals = new Map<string, WithdrawalTicket & { completeAt: number }>()
  private seq = 0

  constructor(readonly id: string, private readonly clock: Clock, o: FakeExchangeOptions = {}) {
    this.tickerState = { bid: o.bid ?? 1_000_000, ask: o.ask ?? 1_002_000 }
    this.irt = o.irt ?? 0
    this.usdt = o.usdt ?? 0
    this.limitsState = {
      exchangeId: id,
      tradingOpen: true,
      buyCapRemainingMicroUsdt: null,
      depositCapRemainingIrt: null,
      withdrawalLockHours: o.lockHours ?? 72,
      withdrawCapRemainingMicroUsdt: null,
      minOrderIrt: o.minOrderIrt ?? 100_000,
      takerFeeBps: o.takerFeeBps ?? 30,
      withdrawFeeMicroUsdt: { TRC20: 1_000_000, BEP20: 800_000, TON: 500_000 },
      withdrawMinMicroUsdt: { TRC20: 10_000_000, BEP20: 10_000_000, TON: 5_000_000 },
    }
    // opening USDT (if any) is considered unlocked
    if (this.usdt > 0) this.lots.push({ qty: this.usdt, withdrawableAt: 0 })
  }

  // ── controls ──
  setRates(bid: number, ask: number): void {
    this.tickerState = { ...this.tickerState, bid, ask }
  }
  setLimits(patch: Partial<ExchangeLimits>): void {
    this.limitsState = { ...this.limitsState, ...patch }
  }
  setBalances(irt: Irt, usdt: MicroUsdt, unlocked = true): void {
    this.irt = irt
    this.usdt = usdt
    this.lots.length = 0
    if (usdt > 0) this.lots.push({ qty: usdt, withdrawableAt: unlocked ? 0 : this.clock.now() + this.limitsState.withdrawalLockHours * 3_600_000 })
  }
  fail(method: string, spec: FailureSpec, times = 1): void {
    this.failures.add(method, spec, times)
  }

  private withdrawable(): MicroUsdt {
    const now = this.clock.now()
    return this.lots.filter((l) => l.withdrawableAt <= now).reduce((s, l) => s + l.qty, 0)
  }

  private gate(method: string, args: unknown): Result<never> | undefined {
    this.calls.record(method, args)
    return this.failures.take(method)
  }

  // ── port ──
  async ticker(): Promise<Result<ExchangeTicker>> {
    const f = this.gate('ticker', undefined)
    if (f) return f
    return ok({ exchangeId: this.id, asOf: this.clock.now(), bid: this.tickerState.bid, ask: this.tickerState.ask, last: (this.tickerState.bid + this.tickerState.ask) / 2, volume24hUsdt: this.tickerState.volume24hUsdt })
  }

  async limits(): Promise<Result<ExchangeLimits>> {
    const f = this.gate('limits', undefined)
    if (f) return f
    return ok({ ...this.limitsState })
  }

  async balances(): Promise<Result<ExchangeBalances>> {
    const f = this.gate('balances', undefined)
    if (f) return f
    return ok({ irt: this.irt, usdt: this.usdt, usdtWithdrawable: Math.min(this.usdt, this.withdrawable()) })
  }

  async depositIrt(req: { amountIrt: Irt; method: DepositMethod; fromAccountId?: string }): Promise<Result<DepositResult>> {
    const f = this.gate('depositIrt', req)
    if (f) return f
    const cap = this.limitsState.depositCapRemainingIrt
    if (cap !== null && req.amountIrt > cap) return err(portError('CAP_EXCEEDED', 'deposit cap exceeded', { details: { remaining: cap } }))
    if (cap !== null) this.limitsState.depositCapRemainingIrt = cap - req.amountIrt
    this.irt += req.amountIrt
    return ok({ depositId: `${this.id}-dep-${++this.seq}`, amountIrt: req.amountIrt, status: 'credited', creditedAt: this.clock.now(), feeIrt: 0 })
  }

  async buyUsdt(req: { irtBudget: Irt; maxPrice?: number }): Promise<Result<TradeResult>> {
    const f = this.gate('buyUsdt', req)
    if (f) return f
    const l = this.limitsState
    if (!l.tradingOpen) return err(portError('MARKET_CLOSED', 'trading closed', { details: { nextTradingOpenAt: l.nextTradingOpenAt } }))
    if (req.irtBudget < l.minOrderIrt) return err(portError('VALIDATION', 'below minimum order'))
    if (req.irtBudget > this.irt) return err(portError('INSUFFICIENT_FUNDS', 'insufficient IRT balance'))
    const price = this.tickerState.ask
    if (req.maxPrice !== undefined && price > req.maxPrice) return err(portError('REJECTED', 'price above maxPrice'))
    // fee = B·φ/(1+φ) rounded up; notional = B − fee; qty = notional / ask (round down to micro)
    const phi = l.takerFeeBps / 10_000
    const feeIrt = Math.ceil((req.irtBudget * phi) / (1 + phi))
    const qty = Math.floor(((req.irtBudget - feeIrt) / price) * 1_000_000)
    if (l.buyCapRemainingMicroUsdt !== null && qty > l.buyCapRemainingMicroUsdt) return err(portError('CAP_EXCEEDED', 'daily buy cap exceeded', { details: { remaining: l.buyCapRemainingMicroUsdt } }))
    if (l.buyCapRemainingMicroUsdt !== null) l.buyCapRemainingMicroUsdt -= qty
    const now = this.clock.now()
    const withdrawableAt = now + l.withdrawalLockHours * 3_600_000
    this.irt -= req.irtBudget
    this.usdt += qty
    this.lots.push({ qty, withdrawableAt })
    return ok({ tradeId: `${this.id}-t-${++this.seq}`, side: 'buy', irt: req.irtBudget, usdt: qty, price, feeIrt, at: now, withdrawableAt })
  }

  async sellUsdt(req: { amountMicroUsdt: MicroUsdt; minPrice?: number }): Promise<Result<TradeResult>> {
    const f = this.gate('sellUsdt', req)
    if (f) return f
    if (!this.limitsState.tradingOpen) return err(portError('MARKET_CLOSED', 'trading closed'))
    if (req.amountMicroUsdt > this.usdt) return err(portError('INSUFFICIENT_FUNDS', 'insufficient USDT balance'))
    const price = this.tickerState.bid
    if (req.minPrice !== undefined && price < req.minPrice) return err(portError('REJECTED', 'price below minPrice'))
    const gross = Math.floor((req.amountMicroUsdt / 1_000_000) * price)
    const feeIrt = Math.ceil((gross * this.limitsState.takerFeeBps) / 10_000)
    this.consumeUsdt(req.amountMicroUsdt)
    this.irt += gross - feeIrt
    return ok({ tradeId: `${this.id}-t-${++this.seq}`, side: 'sell', irt: gross - feeIrt, usdt: req.amountMicroUsdt, price, feeIrt, at: this.clock.now() })
  }

  /** Removes USDT from the oldest lots first. */
  private consumeUsdt(qty: MicroUsdt): void {
    let left = qty
    this.usdt -= qty
    for (const lot of [...this.lots].sort((a, b) => a.withdrawableAt - b.withdrawableAt)) {
      const take = Math.min(lot.qty, left)
      lot.qty -= take
      left -= take
      if (left === 0) break
    }
    for (let i = this.lots.length - 1; i >= 0; i--) if ((this.lots[i] as { qty: number }).qty === 0) this.lots.splice(i, 1)
  }

  async withdrawUsdt(req: { amountMicroUsdt: MicroUsdt; network: Network; address: string }): Promise<Result<WithdrawalTicket>> {
    const f = this.gate('withdrawUsdt', req)
    if (f) return f
    const l = this.limitsState
    const fee = l.withdrawFeeMicroUsdt[req.network]
    if (fee === undefined) return err(portError('VALIDATION', `network ${req.network} not supported`))
    const min = l.withdrawMinMicroUsdt[req.network] ?? 0
    if (req.amountMicroUsdt < min) return err(portError('VALIDATION', 'below withdrawal minimum', { details: { min } }))
    if (req.amountMicroUsdt + fee > this.usdt) return err(portError('INSUFFICIENT_FUNDS', 'insufficient USDT balance'))
    if (req.amountMicroUsdt + fee > this.withdrawable()) return err(portError('LOCKED', 'funds are under the post-purchase withdrawal lock'))
    if (l.withdrawCapRemainingMicroUsdt !== null && req.amountMicroUsdt > l.withdrawCapRemainingMicroUsdt) return err(portError('CAP_EXCEEDED', 'withdrawal cap exceeded'))
    if (l.withdrawCapRemainingMicroUsdt !== null) l.withdrawCapRemainingMicroUsdt -= req.amountMicroUsdt
    this.consumeUsdt(req.amountMicroUsdt + fee)
    const now = this.clock.now()
    const t: WithdrawalTicket & { completeAt: number } = {
      withdrawalId: `${this.id}-w-${++this.seq}`, network: req.network, address: req.address, amount: req.amountMicroUsdt, feeMicroUsdt: fee, status: 'pending', requestedAt: now,
      completeAt: now + this.withdrawalDelayMs,
    }
    this.withdrawals.set(t.withdrawalId, t)
    return ok(this.view(t))
  }

  async withdrawal(withdrawalId: string): Promise<Result<WithdrawalTicket>> {
    const f = this.gate('withdrawal', withdrawalId)
    if (f) return f
    const t = this.withdrawals.get(withdrawalId)
    if (!t) return err(portError('NOT_FOUND', 'unknown withdrawal'))
    if (t.status === 'pending' && this.clock.now() >= t.completeAt) {
      t.status = 'completed'
      t.completedAt = t.completeAt
      t.txHash = `0x${withdrawalId}`
    }
    return ok(this.view(t))
  }

  /** Force a pending withdrawal to complete/fail (refunding the debit on failure). */
  settleWithdrawal(withdrawalId: string, outcome: 'completed' | 'failed' = 'completed'): void {
    const t = this.withdrawals.get(withdrawalId)
    if (!t || t.status === 'completed' || t.status === 'failed') return
    t.status = outcome
    if (outcome === 'completed') {
      t.completedAt = this.clock.now()
      t.txHash = `0x${withdrawalId}`
    } else {
      this.usdt += t.amount + t.feeMicroUsdt
      this.lots.push({ qty: t.amount + t.feeMicroUsdt, withdrawableAt: 0 })
    }
  }

  private view(t: WithdrawalTicket & { completeAt: number }): WithdrawalTicket {
    const { completeAt: _c, ...rest } = t
    return { ...rest }
  }

  async withdrawIrt(req: { amountIrt: Irt; toIban: string }): Promise<Result<{ withdrawalId: string; settleAt: number; feeIrt: Irt }>> {
    const f = this.gate('withdrawIrt', req)
    if (f) return f
    if (req.amountIrt > this.irt) return err(portError('INSUFFICIENT_FUNDS', 'insufficient IRT balance'))
    this.irt -= req.amountIrt
    return ok({ withdrawalId: `${this.id}-wi-${++this.seq}`, settleAt: this.clock.now() + 24 * 3_600_000, feeIrt: 0 })
  }
}
