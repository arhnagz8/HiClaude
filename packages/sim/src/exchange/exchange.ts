/**
 * ExchangeSim implements ExchangeAccountPort: our account at an Iranian crypto exchange.
 *
 * Modelled mechanics
 *  - ticker = mid x (1 + premium + noise) x (1 +/- halfSpread); price impact for large orders; taker fee on the Toman leg
 *  - trading hours: night halt window (IRST, from regulation) closes buy/sell (MARKET_CLOSED + nextTradingOpenAt); a closed exchange shows a STALE quote
 *    (price frozen at the close) so the open produces a gap; withdrawals/deposits stay allowed unless configured otherwise
 *  - per-user daily buy cap (regulation), per-identity IRT deposit cap over a rolling 24h (x depositIdentitiesAvailable identities; a single deposit
 *    is assigned to ONE identity and is never split across identities)
 *  - withdrawal lock: every Toman-bought lot is withdrawable only after withdrawalLockHours (LOCKED + withdrawableAt)
 *  - deposits: gateway/c2c instant (debit BankSim immediately), paya/id_deposit/satna credited at the Paya/Satna settlement time of the bank transfer
 *  - withdrawals: manual-review style delay -> broadcast via ChainSim from the exchange hot wallet -> completed on confirmation; network fee deducted from
 *    the amount (feeMode 'deducted', default) or added on top ('added')
 *  - outages (random per month + injected), freezes, hacks, fee/spread changes (scenario events)
 * Conservation (audit()): irt = deposited - withdrawn - spentOnBuys + receivedFromSells - hackLoss ; usdt = seeded + bought - sold - withdrawnGross - hackLoss ;
 * sum of lots = usdt.
 */
import {
  MICRO_PER_USDT,
  MS,
  err,
  inIrstWindow,
  irstHourFraction,
  irstIsoDate,
  irstParts,
  ok,
  portError,
  startOfIrstDay,
  type DepositMethod,
  type DepositResult,
  type EpochMs,
  type ExchangeAccountPort,
  type ExchangeBalances,
  type ExchangeLimits,
  type ExchangeParams,
  type ExchangeTicker,
  type Irt,
  type MicroUsdt,
  type Network,
  type Result,
  type Rng,
  type TradeResult,
  type WithdrawalTicket,
} from '@hiclaude/contracts'
import { BankSim } from '../bank/bank'
import { ChainSim } from '../chain/chain'
import { hashNormal, hashString32 } from '../core/hash'
import { newHandleId, pBool, pNum, pNumOrNull, pStr, type EventHandle, type Params, type SimComponent, type SimEnv } from '../core/types'
import { clamp, logNormalMedian } from '../core/util'
import { MacroEngine } from '../macro/engine'
import type { Regulation } from './regulation'

/** Behaviour knobs beyond ExchangeParams. Placeholders (UNVERIFIED) pending research 02. */
export interface ExchangeSimConfig {
  minOrderIrt: Irt
  /** USDT of top-of-book depth per 10 bps of price impact. */
  depthUsdtPer10Bps: number
  /** Std-dev (bps) of the 5-minute quote noise at calm volatility. */
  quoteNoiseBps: number
  /** Std-dev (bps) of the slowly varying (hourly) premium wobble. */
  premiumWobbleBps: number
  baseVolume24hUsdt: number
  withdraw: {
    medianDelayMinutes: number
    delaySigma: number
    failProb: number
    /** withdrawals at least this large wait for manual review */
    reviewThresholdMicro: MicroUsdt
    reviewMinHours: number
    reviewMaxHours: number
    /** multiplier on the median delay during the night window / Friday */
    offHoursMultiplier: number
    dailyCapMicro: MicroUsdt | null
    feeMode: 'deducted' | 'added'
  }
  deposit: {
    gatewayMaxIrt: Irt
    c2cMaxIrt: Irt
    gatewayFeeBps: number
    c2cFeeBps: number
    minIrt: Irt
    /** exchange-side processing delay after a Paya/Satna settlement (minutes, uniform) */
    creditMinMinutes: number
    creditMaxMinutes: number
  }
  irtWithdraw: { minIrt: Irt; feeIrt: Irt }
  /** If true, the night halt also blocks on-chain withdrawals. */
  haltBlocksWithdrawals: boolean
}

export function defaultExchangeSimConfig(id: string): ExchangeSimConfig {
  const bigDepth: Record<string, number> = { nobitex: 150_000, tabdeal: 80_000, wallex: 40_000, bitpin: 40_000, abantether: 25_000 }
  const vol: Record<string, number> = { nobitex: 12_000_000, tabdeal: 6_000_000, wallex: 2_500_000, bitpin: 2_500_000, abantether: 1_200_000 }
  return {
    minOrderIrt: 100_000,
    depthUsdtPer10Bps: bigDepth[id] ?? 30_000,
    quoteNoiseBps: 3,
    premiumWobbleBps: 4,
    baseVolume24hUsdt: vol[id] ?? 1_000_000,
    withdraw: {
      medianDelayMinutes: 6,
      delaySigma: 0.7,
      failProb: 0.004,
      reviewThresholdMicro: 5_000 * MICRO_PER_USDT,
      reviewMinHours: 2,
      reviewMaxHours: 8,
      offHoursMultiplier: 3,
      dailyCapMicro: null,
      feeMode: 'deducted',
    },
    deposit: { gatewayMaxIrt: 50_000_000, c2cMaxIrt: 15_000_000, gatewayFeeBps: 0, c2cFeeBps: 0, minIrt: 10_000, creditMinMinutes: 1, creditMaxMinutes: 20 },
    irtWithdraw: { minIrt: 100_000, feeIrt: 3_000 },
    haltBlocksWithdrawals: false,
  }
}

interface Lot {
  id: string
  qty: MicroUsdt
  boughtAt: EpochMs
  lockedUntil: EpochMs
  source: 'buy' | 'seed' | 'refund'
}

interface DepositRec {
  depositId: string
  identity: string
  amountIrt: Irt
  feeIrt: Irt
  method: DepositMethod
  requestedAt: EpochMs
  status: 'pending' | 'credited'
  creditAt: EpochMs
  creditedAt?: EpochMs
}

interface WithdrawalRec {
  ticket: WithdrawalTicket
  debited: MicroUsdt
  deliver: MicroUsdt
  fromLots: { qty: MicroUsdt }[]
}

type FreezeScope = 'all' | 'withdrawals' | 'trading' | 'deposits'

export interface ExchangeDeps {
  env: SimEnv
  rng: Rng
  macro: MacroEngine
  bank: BankSim
  chain: ChainSim
  regulation: Regulation
  /** IRST midnight of day 0 (anchor of the 30-day outage calendar). */
  originMs: EpochMs
}

export class ExchangeSim implements ExchangeAccountPort, SimComponent {
  readonly name: string
  readonly id: string
  readonly params: ExchangeParams
  readonly cfg: ExchangeSimConfig
  private readonly d: ExchangeDeps
  private readonly rng: Rng
  private readonly noiseSeed: number
  private irt = 0
  private lots: Lot[] = []
  private lotSeq = 0
  private deposits = new Map<string, DepositRec>()
  private depositOrder: DepositRec[] = []
  private idDeposits: { identity: string; amount: Irt; at: EpochMs }[] = []
  private withdrawals = new Map<string, WithdrawalRec>()
  private trades: TradeResult[] = []
  private buyDay = { key: '', usdt: 0 }
  private wdDay = { key: '', usdt: 0 }
  private freezes: { scope: FreezeScope; from: EpochMs; to: EpochMs }[] = []
  private outages: { from: EpochMs; to: EpochMs }[] = []
  private monthOutageCache = new Map<number, { from: EpochMs; to: EpochMs } | null>()
  private hot = new Map<Network, string>()
  private seq = 0
  // audit flows
  private f = { irtDeposited: 0, irtWithdrawn: 0, irtBuySpent: 0, irtSellReceived: 0, irtHackLoss: 0, usdtSeeded: 0, usdtBought: 0, usdtSold: 0, usdtWithdrawnGross: 0, usdtHackLoss: 0, usdtHackRecovered: 0, irtHackRecovered: 0, wdFeesRetained: 0, feesIrt: 0, pendingDepositsIrt: 0, pendingIrtWithdrawIrt: 0, usdtRefunded: 0 }

  constructor(params: ExchangeParams, deps: ExchangeDeps, cfg?: Partial<ExchangeSimConfig>) {
    this.id = params.id
    this.name = `exchange:${params.id}`
    this.params = structuredClone(params)
    const base = defaultExchangeSimConfig(params.id)
    this.cfg = { ...base, ...cfg, withdraw: { ...base.withdraw, ...cfg?.withdraw }, deposit: { ...base.deposit, ...cfg?.deposit }, irtWithdraw: { ...base.irtWithdraw, ...cfg?.irtWithdraw } }
    this.d = deps
    this.rng = deps.rng
    this.noiseSeed = hashString32(`${deps.rng.path}/noise`)
  }

  // ───────────────────────────── time / state helpers ─────────────────────────────
  private now(): EpochMs {
    return this.d.env.clock.now()
  }
  private reg() {
    return this.d.regulation.state
  }

  /** Is an injected or random outage active? */
  isDown(t: EpochMs = this.now()): boolean {
    if (this.outages.some((w) => t >= w.from && t < w.to)) return true
    const month = Math.floor((t - this.d.originMs) / (30 * MS.day))
    for (const k of [month - 1, month]) {
      const w = this.monthOutage(k)
      if (w && t >= w.from && t < w.to) return true
    }
    return false
  }

  private monthOutage(k: number): { from: EpochMs; to: EpochMs } | null {
    if (k < 0) return null
    if (this.monthOutageCache.has(k)) return this.monthOutageCache.get(k) ?? null
    const r = this.rng.fork(`outage:${k}`)
    let w: { from: EpochMs; to: EpochMs } | null = null
    if (r.bool(this.params.outageProbPerMonth)) {
      const from = this.d.originMs + k * 30 * MS.day + Math.floor(r.next() * 30 * MS.day)
      const dur = clamp(logNormalMedian(r, 90 * MS.minute, 0.8), 10 * MS.minute, 36 * MS.hour)
      w = { from, to: from + Math.round(dur) }
    }
    this.monthOutageCache.set(k, w)
    return w
  }

  private frozen(scope: FreezeScope, t: EpochMs = this.now()): boolean {
    return this.freezes.some((f) => t >= f.from && t < f.to && (f.scope === 'all' || f.scope === scope))
  }

  isHalted(t: EpochMs = this.now()): boolean {
    const nh = this.reg().nightHalt
    return nh.enabled && inIrstWindow(t, nh.fromHour, nh.toHour)
  }

  tradingOpen(t: EpochMs = this.now()): boolean {
    return !this.isHalted(t) && !this.frozen('trading', t) && !this.frozen('all', t)
  }

  /** Next time trading opens (night window end); undefined when not halted by the window. */
  nextOpenAt(t: EpochMs = this.now()): EpochMs | undefined {
    const nh = this.reg().nightHalt
    if (!(nh.enabled && inIrstWindow(t, nh.fromHour, nh.toHour))) return undefined
    const day = startOfIrstDay(t)
    const h = irstHourFraction(t)
    let open = day + nh.toHour * MS.hour
    if (nh.fromHour > nh.toHour && h >= nh.fromHour) open += MS.day // window wraps midnight and we are before it
    else if (open <= t) open += MS.day
    return open
  }

  /** The most recent instant at which the market was open (for stale quotes while halted). */
  private lastOpenInstant(t: EpochMs): EpochMs {
    const nh = this.reg().nightHalt
    const day = startOfIrstDay(t)
    const h = irstHourFraction(t)
    let close = day + nh.fromHour * MS.hour
    if (nh.fromHour > nh.toHour) {
      // window wraps midnight: closed from fromHour (yesterday) .. toHour (today)
      if (h < nh.toHour) close -= MS.day
    } else if (close > t) close -= MS.day
    return Math.min(close, t)
  }

  private quoteNoise(t: EpochMs): number {
    const volScale = clamp(Math.sqrt(this.d.macro.dailyVolPct(t) / 1.0), 0.7, 3)
    const smooth = (bucket: number, key: number, sd: number): number => {
      const k0 = Math.floor(t / bucket)
      const f = t / bucket - k0
      const a = hashNormal(this.noiseSeed, key, k0)
      const b = hashNormal(this.noiseSeed, key, k0 + 1)
      return (a + (b - a) * f) * sd
    }
    const fast = smooth(5 * MS.minute, 1, this.cfg.quoteNoiseBps)
    const slow = smooth(MS.hour, 2, this.cfg.premiumWobbleBps)
    return (fast + slow) * volScale
  }

  /** bid/ask/mid for the (possibly stale) market state. `asOf` is when the price was last live. */
  quoteAt(t: EpochMs = this.now()): { bid: number; ask: number; mid: number; asOf: EpochMs; stale: boolean } {
    const stale = this.isHalted(t)
    const pt = stale ? this.lastOpenInstant(t) : t
    const mid = this.d.macro.midAt(pt)
    const prem = (this.params.premiumBps + this.quoteNoise(pt)) / 10_000
    const centre = mid * (1 + prem)
    const hs = this.params.halfSpreadBps / 10_000
    return { bid: centre * (1 - hs), ask: centre * (1 + hs), mid, asOf: pt, stale }
  }

  private identities(): string[] {
    const n = Math.max(1, this.reg().depositIdentitiesAvailable)
    return Array.from({ length: n }, (_, i) => `identity-${i + 1}`)
  }

  private depositCap(): Irt | null {
    return this.params.depositCapIrtPer24hOverride ?? this.reg().idDepositCapIrtPer24h
  }

  private usedDeposit(identity: string, t: EpochMs): Irt {
    const from = t - MS.day
    let s = 0
    for (const d of this.idDeposits) if (d.identity === identity && d.at > from && d.at <= t) s += d.amount
    return s
  }

  /** Remaining rolling-24h deposit allowance per identity (null cap => Infinity). */
  depositAllowance(t: EpochMs = this.now()): { identity: string; remainingIrt: Irt | null }[] {
    const cap = this.depositCap()
    return this.identities().map((identity) => ({ identity, remainingIrt: cap === null ? null : Math.max(0, cap - this.usedDeposit(identity, t)) }))
  }

  private dayKey(t: EpochMs): string {
    return irstIsoDate(t)
  }
  private boughtToday(t: EpochMs): MicroUsdt {
    return this.buyDay.key === this.dayKey(t) ? this.buyDay.usdt : 0
  }
  private withdrawnToday(t: EpochMs): MicroUsdt {
    return this.wdDay.key === this.dayKey(t) ? this.wdDay.usdt : 0
  }

  private nextId(prefix: string): string {
    this.seq += 1
    return `${this.id}-${prefix}-${String(this.seq).padStart(6, '0')}`
  }

  private guard(opts: { viaPanel: boolean; scope?: FreezeScope; needsOpen?: boolean }): Result<never> | null {
    const now = this.now()
    if (!this.params.enabled) return err(portError('UNAVAILABLE', `${this.id} disabled`))
    if (!this.params.apiAvailable && !opts.viaPanel) return err(portError('REJECTED', `${this.id} has no API: use the operator panel`))
    if (this.isDown(now)) return err(portError('UNAVAILABLE', `${this.id} is down`, { retryAfterMs: 15 * MS.minute }))
    if (opts.scope && (this.frozen(opts.scope, now) || this.frozen('all', now))) return err(portError('FROZEN', `${this.id}: ${opts.scope} frozen`, { retryable: false }))
    if (opts.needsOpen && this.isHalted(now)) {
      const open = this.nextOpenAt(now)
      return err(portError('MARKET_CLOSED', `${this.id} trading halted`, { retryAfterMs: open ? open - now : undefined, details: { nextTradingOpenAt: open } }))
    }
    return null
  }

  // ───────────────────────────── port ─────────────────────────────
  async ticker(): Promise<Result<ExchangeTicker>> {
    const now = this.now()
    if (!this.params.enabled || this.isDown(now)) return err(portError('UNAVAILABLE', `${this.id} is down`, { retryAfterMs: 5 * MS.minute }))
    const q = this.quoteAt(now)
    const vol = this.cfg.baseVolume24hUsdt * this.d.macro.demandMultiplier(now)
    return ok({ exchangeId: this.id, asOf: q.asOf, bid: q.bid, ask: q.ask, last: (q.bid + q.ask) / 2, volume24hUsdt: Math.round(vol) })
  }

  async limits(): Promise<Result<ExchangeLimits>> {
    return this.limitsSync(false)
  }

  limitsSync(viaPanel: boolean): Result<ExchangeLimits> {
    const g = this.guard({ viaPanel })
    if (g) return g
    const now = this.now()
    const cap = this.reg().dailyBuyCapMicroUsdt
    const allow = this.depositAllowance(now)
    const depRem = allow.some((a) => a.remainingIrt === null) ? null : Math.max(0, ...allow.map((a) => a.remainingIrt as number))
    const wdCap = this.cfg.withdraw.dailyCapMicro
    return ok({
      exchangeId: this.id,
      tradingOpen: this.tradingOpen(now),
      nextTradingOpenAt: this.nextOpenAt(now),
      buyCapRemainingMicroUsdt: cap === null ? null : Math.max(0, cap - this.boughtToday(now)),
      depositCapRemainingIrt: depRem,
      withdrawalLockHours: this.reg().withdrawalLockHours,
      withdrawCapRemainingMicroUsdt: wdCap === null ? null : Math.max(0, wdCap - this.withdrawnToday(now)),
      minOrderIrt: this.cfg.minOrderIrt,
      takerFeeBps: this.params.takerFeeBps,
      withdrawFeeMicroUsdt: { ...this.params.withdrawFeeMicroUsdt },
      withdrawMinMicroUsdt: { ...this.params.withdrawMinMicroUsdt },
    })
  }

  async balances(): Promise<Result<ExchangeBalances>> {
    const g = this.guard({ viaPanel: false })
    if (g) return g
    return ok(this.balancesNow())
  }

  balancesNow(): ExchangeBalances {
    const now = this.now()
    let usdt = 0
    let wd = 0
    for (const l of this.lots) {
      usdt += l.qty
      if (l.lockedUntil <= now) wd += l.qty
    }
    return { irt: this.irt, usdt, usdtWithdrawable: wd }
  }

  async depositIrt(req: { amountIrt: Irt; method: DepositMethod; fromAccountId?: string }): Promise<Result<DepositResult>> {
    return this.doDeposit(req, false)
  }
  async buyUsdt(req: { irtBudget: Irt; maxPrice?: number }): Promise<Result<TradeResult>> {
    return this.doBuy(req, false)
  }
  async sellUsdt(req: { amountMicroUsdt: MicroUsdt; minPrice?: number }): Promise<Result<TradeResult>> {
    return this.doSell(req, false)
  }
  async withdrawUsdt(req: { amountMicroUsdt: MicroUsdt; network: Network; address: string }): Promise<Result<WithdrawalTicket>> {
    return this.doWithdrawUsdt(req, false)
  }
  async withdrawal(withdrawalId: string): Promise<Result<WithdrawalTicket>> {
    const g = this.guard({ viaPanel: false })
    if (g) return g
    const w = this.withdrawals.get(withdrawalId)
    return w ? ok({ ...w.ticket }) : err(portError('NOT_FOUND', 'unknown withdrawal'))
  }
  async withdrawIrt(req: { amountIrt: Irt; toIban: string }): Promise<Result<{ withdrawalId: string; settleAt: EpochMs; feeIrt: Irt }>> {
    return this.doWithdrawIrt(req, false)
  }

  /** Operator-panel facade for exchanges without an API (apiAvailable=false): same operations, panel access. */
  panel(): ExchangeAccountPort {
    return {
      id: this.id,
      ticker: () => this.ticker(),
      limits: async () => this.limitsSync(true),
      balances: async () => ok(this.balancesNow()),
      depositIrt: (r) => this.doDeposit(r, true),
      buyUsdt: (r) => this.doBuy(r, true),
      sellUsdt: (r) => this.doSell(r, true),
      withdrawUsdt: (r) => this.doWithdrawUsdt(r, true),
      withdrawal: async (id) => {
        const w = this.withdrawals.get(id)
        return w ? ok({ ...w.ticket }) : err(portError('NOT_FOUND', 'unknown withdrawal'))
      },
      withdrawIrt: (r) => this.doWithdrawIrt(r, true),
    }
  }

  // ───────────────────────────── deposits ─────────────────────────────
  private async doDeposit(req: { amountIrt: Irt; method: DepositMethod; fromAccountId?: string }, viaPanel: boolean): Promise<Result<DepositResult>> {
    const g = this.guard({ viaPanel, scope: 'deposits' })
    if (g) return g
    const now = this.now()
    const amount = req.amountIrt
    if (!Number.isSafeInteger(amount) || amount <= 0) return err(portError('VALIDATION', 'amountIrt must be a positive integer'))
    const dc = this.cfg.deposit
    if (amount < dc.minIrt) return err(portError('VALIDATION', `minimum deposit ${dc.minIrt}`))
    if (req.method === 'gateway' && amount > dc.gatewayMaxIrt) return err(portError('CAP_EXCEEDED', `gateway deposit max ${dc.gatewayMaxIrt}`, { details: { max: dc.gatewayMaxIrt }, retryable: false }))
    if (req.method === 'card_to_card' && amount > dc.c2cMaxIrt) return err(portError('CAP_EXCEEDED', `card-to-card deposit max ${dc.c2cMaxIrt}`, { details: { max: dc.c2cMaxIrt }, retryable: false }))

    // identity selection + rolling 24h cap (one identity per deposit; never split)
    const allow = this.depositAllowance(now)
    let identity: string
    if (req.fromAccountId !== undefined) {
      const found = allow.find((a) => a.identity === req.fromAccountId)
      if (!found) return err(portError('VALIDATION', `unknown fromAccountId ${req.fromAccountId}; valid: ${allow.map((a) => a.identity).join(',')}`))
      identity = found.identity
    } else {
      const sorted = [...allow].sort((a, b) => (b.remainingIrt ?? Infinity) - (a.remainingIrt ?? Infinity) || (a.identity < b.identity ? -1 : 1))
      identity = (sorted[0] as { identity: string }).identity
    }
    const rem = (allow.find((a) => a.identity === identity) as { remainingIrt: Irt | null }).remainingIrt
    if (rem !== null && amount > rem) {
      const maxSingle = Math.max(0, ...allow.map((a) => a.remainingIrt ?? 0))
      this.d.env.stats.inc(`exchange.${this.id}.deposit_cap_rejected`)
      return err(portError('CAP_EXCEEDED', `deposit cap per ID per 24h: remaining ${rem}`, { retryable: true, retryAfterMs: this.nextCapReleaseMs(identity, now), details: { remainingIrt: rem, maxSingleDepositIrt: maxSingle, identity } }))
    }

    const feeBps = req.method === 'gateway' ? dc.gatewayFeeBps : req.method === 'card_to_card' ? dc.c2cFeeBps : 0
    const feeIrt = Math.ceil((amount * feeBps) / 10_000)
    const rec: DepositRec = { depositId: this.nextId('dep'), identity, amountIrt: amount, feeIrt, method: req.method, requestedAt: now, status: 'pending', creditAt: now }

    if (req.method === 'gateway' || req.method === 'card_to_card') {
      const pay = this.d.bank.payNow({ amountIrt: amount, reason: `exchange_deposit:${this.id}:${req.method}` })
      if (!pay.ok) return pay
      rec.status = 'credited'
      rec.creditedAt = now
      this.creditDeposit(rec)
    } else {
      const channel = req.method === 'satna' ? 'satna' : 'paya'
      const pay = this.d.bank.transferOutSync({ toIban: `IR-${this.id.toUpperCase()}-DEPOSIT`, amountIrt: amount, reason: `exchange_deposit:${this.id}:${req.method}`, channel })
      if (!pay.ok) return pay
      const jitter = Math.round((dc.creditMinMinutes + this.rng.next() * (dc.creditMaxMinutes - dc.creditMinMinutes)) * MS.minute)
      rec.creditAt = pay.value.settleAt + jitter
      this.f.pendingDepositsIrt += amount - feeIrt
      this.d.env.sim.at(rec.creditAt, () => {
        this.f.pendingDepositsIrt -= amount - feeIrt
        rec.status = 'credited'
        rec.creditedAt = this.now()
        this.creditDeposit(rec, true)
      }, { label: `exchange.${this.id}.deposit_credit`, priority: 30 })
    }
    this.idDeposits.push({ identity, amount, at: now })
    if (this.idDeposits.length > 5000) this.idDeposits = this.idDeposits.filter((x) => x.at > now - MS.day)
    this.deposits.set(rec.depositId, rec)
    this.depositOrder.push(rec)
    this.d.env.stats.inc(`exchange.${this.id}.deposits`)
    this.d.env.log.emit('exchange.deposit_request', this.name, { id: rec.depositId, method: req.method, amount, identity, creditAt: rec.creditAt })
    return ok({ depositId: rec.depositId, amountIrt: amount - feeIrt, status: rec.status, creditedAt: rec.creditedAt, feeIrt, availableAt: rec.creditAt })
  }

  private creditDeposit(rec: DepositRec, logIt = true): void {
    this.irt += rec.amountIrt - rec.feeIrt
    this.f.irtDeposited += rec.amountIrt - rec.feeIrt
    this.f.feesIrt += rec.feeIrt
    if (logIt) this.d.env.log.emit('exchange.deposit_credited', this.name, { id: rec.depositId, amount: rec.amountIrt - rec.feeIrt })
  }

  private nextCapReleaseMs(identity: string, t: EpochMs): number {
    const first = this.idDeposits.filter((d) => d.identity === identity && d.at > t - MS.day).sort((a, b) => a.at - b.at)[0]
    return first ? Math.max(MS.minute, first.at + MS.day - t) : MS.hour
  }

  depositStatus(depositId: string): { status: 'pending' | 'credited'; creditAt: EpochMs } | undefined {
    const d = this.deposits.get(depositId)
    return d ? { status: d.status, creditAt: d.creditAt } : undefined
  }

  // ───────────────────────────── trading ─────────────────────────────
  private impactBps(usdt: number): number {
    return (10 * usdt) / Math.max(1, this.cfg.depthUsdtPer10Bps)
  }

  private async doBuy(req: { irtBudget: Irt; maxPrice?: number }, viaPanel: boolean): Promise<Result<TradeResult>> {
    const g = this.guard({ viaPanel, scope: 'trading', needsOpen: true })
    if (g) return g
    const now = this.now()
    const budget = req.irtBudget
    if (!Number.isSafeInteger(budget) || budget <= 0) return err(portError('VALIDATION', 'irtBudget must be a positive integer'))
    if (budget < this.cfg.minOrderIrt) return err(portError('VALIDATION', `min order ${this.cfg.minOrderIrt} Toman`))
    if (budget > this.irt) return err(portError('INSUFFICIENT_FUNDS', `exchange Toman balance ${this.irt} < ${budget}`, { retryable: false }))
    const q = this.quoteAt(now)
    const fee = this.params.takerFeeBps / 10_000
    const usdtEst = budget / (1 + fee) / q.ask
    const price = q.ask * (1 + this.impactBps(usdtEst) / 10_000)
    if (req.maxPrice !== undefined && price > req.maxPrice) return err(portError('REJECTED', `price ${price.toFixed(0)} above maxPrice ${req.maxPrice}`, { retryable: true, details: { price } }))
    let usdtMicro = Math.floor((budget * MICRO_PER_USDT) / ((1 + fee) * price))
    if (usdtMicro <= 0) return err(portError('VALIDATION', 'budget too small'))
    const cap = this.reg().dailyBuyCapMicroUsdt
    if (cap !== null) {
      const remaining = Math.max(0, cap - this.boughtToday(now))
      if (usdtMicro > remaining) return err(portError('CAP_EXCEEDED', `daily buy cap: remaining ${remaining} micro-USDT`, { retryable: remaining > 0, retryAfterMs: startOfIrstDay(now) + MS.day - now, details: { remainingMicroUsdt: remaining } }))
    }
    let irtSpent = Math.min(budget, Math.ceil((usdtMicro / MICRO_PER_USDT) * price * (1 + fee)))
    const gross = Math.round((usdtMicro / MICRO_PER_USDT) * price)
    let feeIrt = Math.max(0, irtSpent - gross)
    if (irtSpent > this.irt) {
      usdtMicro -= 1
      irtSpent = Math.min(this.irt, irtSpent)
      feeIrt = Math.max(0, irtSpent - gross)
    }
    this.irt -= irtSpent
    this.f.irtBuySpent += irtSpent
    this.f.usdtBought += usdtMicro
    this.f.feesIrt += feeIrt
    const lockedUntil = now + this.reg().withdrawalLockHours * MS.hour
    this.lots.push({ id: `${this.id}-lot-${++this.lotSeq}`, qty: usdtMicro, boughtAt: now, lockedUntil, source: 'buy' })
    const key = this.dayKey(now)
    if (this.buyDay.key !== key) this.buyDay = { key, usdt: 0 }
    this.buyDay.usdt += usdtMicro
    const trade: TradeResult = { tradeId: this.nextId('trd'), side: 'buy', irt: irtSpent, usdt: usdtMicro, price: irtSpent / (usdtMicro / MICRO_PER_USDT), feeIrt, at: now, withdrawableAt: lockedUntil }
    this.trades.push(trade)
    this.d.env.stats.inc(`exchange.${this.id}.buys`)
    this.d.env.stats.observe(`exchange.${this.id}.buy_slippage_bps`, ((price / q.ask) - 1) * 10_000)
    this.d.env.log.emit('exchange.buy', this.name, { id: trade.tradeId, irt: irtSpent, usdt: usdtMicro, price: Math.round(price) })
    return ok(trade)
  }

  private async doSell(req: { amountMicroUsdt: MicroUsdt; minPrice?: number }, viaPanel: boolean): Promise<Result<TradeResult>> {
    const g = this.guard({ viaPanel, scope: 'trading', needsOpen: true })
    if (g) return g
    const now = this.now()
    const amt = req.amountMicroUsdt
    if (!Number.isSafeInteger(amt) || amt <= 0) return err(portError('VALIDATION', 'amountMicroUsdt must be a positive integer'))
    const bal = this.balancesNow()
    if (amt > bal.usdt) return err(portError('INSUFFICIENT_FUNDS', `exchange USDT balance ${bal.usdt} < ${amt}`, { retryable: false }))
    const q = this.quoteAt(now)
    const usdt = amt / MICRO_PER_USDT
    const price = q.bid * (1 - this.impactBps(usdt) / 10_000)
    if (req.minPrice !== undefined && price < req.minPrice) return err(portError('REJECTED', `price ${price.toFixed(0)} below minPrice ${req.minPrice}`, { retryable: true, details: { price } }))
    const gross = Math.floor(usdt * price)
    const feeIrt = Math.ceil((gross * this.params.takerFeeBps) / 10_000)
    const net = gross - feeIrt
    if (net < this.cfg.minOrderIrt) return err(portError('VALIDATION', `min order ${this.cfg.minOrderIrt} Toman`))
    this.consumeLots(amt)
    this.irt += net
    this.f.irtSellReceived += net
    this.f.usdtSold += amt
    this.f.feesIrt += feeIrt
    const trade: TradeResult = { tradeId: this.nextId('trd'), side: 'sell', irt: net, usdt: amt, price: net / usdt, feeIrt, at: now }
    this.trades.push(trade)
    this.d.env.stats.inc(`exchange.${this.id}.sells`)
    this.d.env.log.emit('exchange.sell', this.name, { id: trade.tradeId, irt: net, usdt: amt })
    return ok(trade)
  }

  /** Remove `amt` from lots oldest-first (so a sell shrinks the withdrawable pool first). */
  private consumeLots(amt: MicroUsdt, onlyUnlocked = false): void {
    const now = this.now()
    let left = amt
    const ordered = [...this.lots].sort((a, b) => a.boughtAt - b.boughtAt || (a.id < b.id ? -1 : 1))
    for (const l of ordered) {
      if (left <= 0) break
      if (onlyUnlocked && l.lockedUntil > now) continue
      const take = Math.min(l.qty, left)
      l.qty -= take
      left -= take
    }
    this.lots = this.lots.filter((l) => l.qty > 0)
  }

  // ───────────────────────────── withdrawals ─────────────────────────────
  private hotWallet(network: Network): string {
    let a = this.hot.get(network)
    if (!a) {
      a = this.d.chain.newAddress(network)
      this.hot.set(network, a)
    }
    return a
  }

  private async doWithdrawUsdt(req: { amountMicroUsdt: MicroUsdt; network: Network; address: string }, viaPanel: boolean): Promise<Result<WithdrawalTicket>> {
    const g = this.guard({ viaPanel, scope: 'withdrawals', needsOpen: this.cfg.haltBlocksWithdrawals })
    if (g) return g
    const now = this.now()
    const { amountMicroUsdt: amt, network, address } = req
    const feeTable = this.params.withdrawFeeMicroUsdt
    const fee = feeTable[network]
    if (fee === undefined) return err(portError('VALIDATION', `${this.id} does not support ${network} withdrawals`))
    if (!Number.isSafeInteger(amt) || amt <= 0) return err(portError('VALIDATION', 'amountMicroUsdt must be a positive integer'))
    if (!this.d.chain.isValidAddress(network, address)) return err(portError('VALIDATION', `invalid ${network} address`))
    const min = this.params.withdrawMinMicroUsdt[network] ?? 0
    if (amt < min) return err(portError('VALIDATION', `minimum withdrawal ${min} micro-USDT on ${network}`, { details: { min } }))
    const feeMode = this.cfg.withdraw.feeMode
    const debit = feeMode === 'added' ? amt + fee : amt
    const deliver = feeMode === 'added' ? amt : amt - fee
    if (deliver <= 0) return err(portError('VALIDATION', 'amount does not cover the network fee'))
    const bal = this.balancesNow()
    if (debit > bal.usdt) return err(portError('INSUFFICIENT_FUNDS', `exchange USDT balance ${bal.usdt} < ${debit}`, { retryable: false }))
    if (debit > bal.usdtWithdrawable) {
      const unlock = this.unlockTimeFor(debit, now)
      this.d.env.stats.inc(`exchange.${this.id}.withdraw_locked`)
      return err(portError('LOCKED', `only ${bal.usdtWithdrawable} micro-USDT withdrawable (post-deposit lock)`, { retryable: true, retryAfterMs: Math.max(MS.minute, unlock - now), details: { usdtWithdrawable: bal.usdtWithdrawable, withdrawableAt: unlock } }))
    }
    const capMax = this.cfg.withdraw.dailyCapMicro
    if (capMax !== null && this.withdrawnToday(now) + debit > capMax) return err(portError('CAP_EXCEEDED', 'daily withdrawal cap', { retryable: true, retryAfterMs: startOfIrstDay(now) + MS.day - now, details: { remainingMicroUsdt: Math.max(0, capMax - this.withdrawnToday(now)) } }))

    this.consumeLots(debit, true)
    this.f.usdtWithdrawnGross += debit
    this.f.wdFeesRetained += debit - deliver
    const key = this.dayKey(now)
    if (this.wdDay.key !== key) this.wdDay = { key, usdt: 0 }
    this.wdDay.usdt += debit
    const ticket: WithdrawalTicket = { withdrawalId: this.nextId('wd'), network, address, amount: amt, feeMicroUsdt: fee, status: 'pending', requestedAt: now }
    const rec: WithdrawalRec = { ticket, debited: debit, deliver, fromLots: [] }
    this.withdrawals.set(ticket.withdrawalId, rec)
    this.d.env.stats.inc(`exchange.${this.id}.withdrawals`)
    this.d.env.log.emit('exchange.withdraw_request', this.name, { id: ticket.withdrawalId, network, amount: amt, fee })

    // processing delay
    const wc = this.cfg.withdraw
    const off = inIrstWindow(now, 21, 9) || irstParts(now).weekday === 5
    let delay = logNormalMedian(this.rng, wc.medianDelayMinutes * MS.minute * (off ? wc.offHoursMultiplier : 1), wc.delaySigma)
    if (debit >= wc.reviewThresholdMicro) delay += (wc.reviewMinHours + this.rng.next() * (wc.reviewMaxHours - wc.reviewMinHours)) * MS.hour
    this.d.env.sim.at(now + Math.round(delay), () => this.broadcastWithdrawal(rec), { label: `exchange.${this.id}.withdraw_broadcast`, priority: 30 })
    return ok({ ...ticket })
  }

  private unlockTimeFor(needed: MicroUsdt, now: EpochMs): EpochMs {
    let have = 0
    const lots = [...this.lots].sort((a, b) => a.lockedUntil - b.lockedUntil)
    for (const l of lots) {
      have += l.qty
      if (have >= needed) return Math.max(now, l.lockedUntil)
    }
    return now
  }

  private broadcastWithdrawal(rec: WithdrawalRec): void {
    const now = this.now()
    const t = rec.ticket
    // an outage or freeze delays the broadcast
    if (this.isDown(now)) {
      const w = this.outages.find((o) => now >= o.from && now < o.to)
      const month = Math.floor((now - this.d.originMs) / (30 * MS.day))
      const mw = [month - 1, month].map((k) => this.monthOutage(k)).find((x) => x && now >= x.from && now < x.to)
      const until = (w ?? mw)?.to ?? now + 10 * MS.minute
      this.d.env.sim.at(until + 1, () => this.broadcastWithdrawal(rec), { label: `exchange.${this.id}.withdraw_broadcast`, priority: 30 })
      return
    }
    const fz = this.freezes.find((f) => now >= f.from && now < f.to && (f.scope === 'all' || f.scope === 'withdrawals'))
    if (fz) {
      this.d.env.sim.at(Number.isFinite(fz.to) ? fz.to + 1 : now + 30 * MS.day, () => this.broadcastWithdrawal(rec), { label: `exchange.${this.id}.withdraw_broadcast`, priority: 30 })
      return
    }
    if (this.rng.bool(this.cfg.withdraw.failProb)) {
      t.status = 'failed'
      t.completedAt = now
      this.f.usdtWithdrawnGross -= rec.debited
      this.f.wdFeesRetained -= rec.debited - rec.deliver
      this.f.usdtRefunded += rec.debited
      this.lots.push({ id: `${this.id}-lot-${++this.lotSeq}`, qty: rec.debited, boughtAt: now, lockedUntil: 0, source: 'refund' })
      this.d.env.stats.inc(`exchange.${this.id}.withdraw_failed`)
      this.d.env.log.emit('exchange.withdraw_failed', this.name, { id: t.withdrawalId })
      return
    }
    const tx = this.d.chain.transfer({ network: t.network, from: this.hotWallet(t.network), to: t.address, amount: rec.deliver, fromOwner: this.name, bottomless: true, fee: 0 })
    if (!tx.ok) {
      // address rejected by the chain at broadcast: refund
      t.status = 'failed'
      t.completedAt = now
      this.f.usdtWithdrawnGross -= rec.debited
      this.f.wdFeesRetained -= rec.debited - rec.deliver
      this.f.usdtRefunded += rec.debited
      this.lots.push({ id: `${this.id}-lot-${++this.lotSeq}`, qty: rec.debited, boughtAt: now, lockedUntil: 0, source: 'refund' })
      return
    }
    t.status = 'broadcast'
    t.txHash = tx.value.txHash
    this.d.env.log.emit('exchange.withdraw_broadcast', this.name, { id: t.withdrawalId, tx: t.txHash })
    const done = this.d.chain.confirmAt(tx.value.txHash) ?? now
    if (Number.isFinite(done)) {
      this.d.env.sim.at(done, () => {
        t.status = 'completed'
        t.completedAt = this.now()
        this.d.env.log.emit('exchange.withdraw_completed', this.name, { id: t.withdrawalId })
      }, { label: `exchange.${this.id}.withdraw_complete`, priority: 30 })
    } else {
      // on-chain failure: the exchange re-credits the user (fee kept)
      const failAt = tx.value.includedAt
      this.d.env.sim.at(failAt, () => {
        t.status = 'failed'
        t.completedAt = this.now()
        this.f.usdtWithdrawnGross -= rec.deliver
        this.f.usdtRefunded += rec.deliver
        this.lots.push({ id: `${this.id}-lot-${++this.lotSeq}`, qty: rec.deliver, boughtAt: this.now(), lockedUntil: 0, source: 'refund' })
      }, { label: `exchange.${this.id}.withdraw_chainfail`, priority: 30 })
    }
  }

  private async doWithdrawIrt(req: { amountIrt: Irt; toIban: string }, viaPanel: boolean): Promise<Result<{ withdrawalId: string; settleAt: EpochMs; feeIrt: Irt }>> {
    const g = this.guard({ viaPanel, scope: 'withdrawals' })
    if (g) return g
    const now = this.now()
    const { amountIrt: amt, toIban } = req
    if (!Number.isSafeInteger(amt) || amt <= 0) return err(portError('VALIDATION', 'amountIrt must be a positive integer'))
    if (amt < this.cfg.irtWithdraw.minIrt) return err(portError('VALIDATION', `minimum Toman withdrawal ${this.cfg.irtWithdraw.minIrt}`))
    const fee = this.cfg.irtWithdraw.feeIrt
    if (amt + fee > this.irt) return err(portError('INSUFFICIENT_FUNDS', `Toman balance ${this.irt} < ${amt + fee}`, { retryable: false }))
    this.irt -= amt + fee
    this.f.irtWithdrawn += amt + fee
    this.f.feesIrt += fee
    const settleAt = this.d.bank.calendar.nextPayaSettlement(now)
    const id = this.nextId('irtwd')
    if (toIban === this.d.bank.iban) {
      this.f.pendingIrtWithdrawIrt += amt
      this.d.env.sim.at(settleAt, () => {
        this.f.pendingIrtWithdrawIrt -= amt
        this.d.bank.creditExternal({ amountIrt: amt, channel: 'paya', note: `${this.id} Toman withdrawal`, senderName: this.params.name })
      }, { label: `exchange.${this.id}.irt_withdraw`, priority: 30 })
    }
    this.d.env.log.emit('exchange.withdraw_irt', this.name, { id, amount: amt, settleAt })
    return ok({ withdrawalId: id, settleAt, feeIrt: fee })
  }

  // ───────────────────────────── seeding / introspection ─────────────────────────────
  /** Test/scenario seeding: credit Toman and/or unlocked USDT as external deposits. */
  seed(req: { irt?: Irt; usdt?: MicroUsdt }): void {
    if (req.irt) {
      this.irt += req.irt
      this.f.irtDeposited += req.irt
    }
    if (req.usdt) {
      this.lots.push({ id: `${this.id}-lot-${++this.lotSeq}`, qty: req.usdt, boughtAt: this.now(), lockedUntil: 0, source: 'seed' })
      this.f.usdtSeeded += req.usdt
    }
  }

  lotsView(): { id: string; qty: MicroUsdt; lockedUntil: EpochMs; source: string }[] {
    return this.lots.map((l) => ({ id: l.id, qty: l.qty, lockedUntil: l.lockedUntil, source: l.source }))
  }
  tradeHistory(): TradeResult[] {
    return [...this.trades]
  }
  pendingWithdrawalsMicro(): MicroUsdt {
    // debited from the exchange but not yet on the chain (status pending)
    let s = 0
    for (const w of this.withdrawals.values()) if (w.ticket.status === 'pending') s += w.deliver
    return s
  }

  audit(): { ok: boolean; irtExpected: Irt; irtActual: Irt; usdtExpected: MicroUsdt; usdtActual: MicroUsdt; lotsSum: MicroUsdt; pendingDepositsIrt: Irt; pendingWithdrawMicro: MicroUsdt; wdFeesRetainedMicro: MicroUsdt; flows: Record<string, number> } {
    const f = this.f
    const irtExpected = f.irtDeposited - f.irtWithdrawn - f.irtBuySpent + f.irtSellReceived - f.irtHackLoss + f.irtHackRecovered
    const usdtExpected = f.usdtSeeded + f.usdtBought - f.usdtSold - f.usdtWithdrawnGross - f.usdtHackLoss + f.usdtHackRecovered + f.usdtRefunded
    const lotsSum = this.lots.reduce((s, l) => s + l.qty, 0)
    return {
      ok: irtExpected === this.irt && usdtExpected === lotsSum,
      irtExpected,
      irtActual: this.irt,
      usdtExpected,
      usdtActual: lotsSum,
      lotsSum,
      pendingDepositsIrt: f.pendingDepositsIrt,
      pendingWithdrawMicro: this.pendingWithdrawalsMicro(),
      wdFeesRetainedMicro: f.wdFeesRetained,
      flows: { ...f },
    }
  }

  // ───────────────────────────── events ─────────────────────────────
  applyEvent(type: string, params: Params): EventHandle | null {
    const list = Array.isArray(params.exchanges) ? params.exchanges.map(String) : typeof params.exchange === 'string' ? [params.exchange] : null
    if (list && !list.includes(this.id) && !list.includes('*')) return null
    const target: string | undefined = list ? this.id : undefined
    const now = this.now()
    const log = (what: string, extra: Record<string, unknown> = {}) => this.d.env.log.emit(`exchange.${what}`, this.name, extra)
    switch (type) {
      case 'exchange_outage': {
        const w = { from: now, to: now + pNum(params, 'hours', 4) * MS.hour }
        this.outages.push(w)
        log('outage', { until: w.to })
        return this.handle('exchange_outage', () => {
          const i = this.outages.indexOf(w)
          if (i >= 0) this.outages.splice(i, 1)
        })
      }
      case 'exchange_freeze':
      case 'sanctions_freeze': {
        const scope = (pStr(params, 'scope') as FreezeScope | undefined) ?? 'all'
        if (type === 'sanctions_freeze' && target === undefined) return null // sanctions must name the exchange(s)
        const days = pNumOrNull(params, 'durationDays')
        const w = { scope, from: now, to: days === null || days === undefined ? Number.POSITIVE_INFINITY : now + days * MS.day }
        this.freezes.push(w)
        log('freeze', { scope, until: Number.isFinite(w.to) ? w.to : null })
        const lossFraction = pNum(params, 'lossFraction', 0)
        if (lossFraction > 0) this.applyLoss(lossFraction)
        return this.handle('exchange_freeze', () => {
          const i = this.freezes.indexOf(w)
          if (i >= 0) this.freezes.splice(i, 1)
        })
      }
      case 'exchange_hack': {
        if (target === undefined) return null
        const lossFraction = clamp(pNum(params, 'lossFraction', 0.3), 0, 1)
        const recovered = clamp(pNum(params, 'recoveredFraction', 0), 0, 1)
        const w = { scope: 'all' as FreezeScope, from: now, to: now + pNum(params, 'haltDays', 7) * MS.day }
        this.freezes.push(w)
        const { irtLoss, usdtLoss } = this.applyLoss(lossFraction)
        log('hack', { lossFraction, irtLoss, usdtLoss, until: w.to })
        let timer: { cancel(): void } | null = null
        if (recovered > 0) {
          timer = this.d.env.sim.at(w.to, () => {
            const rIrt = Math.floor(irtLoss * recovered)
            const rUsdt = Math.floor(usdtLoss * recovered)
            this.irt += rIrt
            this.f.irtHackRecovered += rIrt
            if (rUsdt > 0) {
              this.lots.push({ id: `${this.id}-lot-${++this.lotSeq}`, qty: rUsdt, boughtAt: this.now(), lockedUntil: 0, source: 'refund' })
              this.f.usdtHackRecovered += rUsdt
            }
            log('hack_recovery', { rIrt, rUsdt })
          }, { label: `exchange.${this.id}.hack_recovery`, priority: 30 })
        }
        return this.handle('exchange_hack', () => {
          const i = this.freezes.indexOf(w)
          if (i >= 0) this.freezes.splice(i, 1)
          void timer
        })
      }
      case 'exchange_fee_change': {
        const prev = this.params.takerFeeBps
        this.params.takerFeeBps = Math.max(0, Math.round(pNum(params, 'takerFeeBps', prev)))
        return this.handle('exchange_fee', () => {
          this.params.takerFeeBps = prev
        })
      }
      case 'exchange_spread_change': {
        const prevS = this.params.halfSpreadBps
        const prevP = this.params.premiumBps
        this.params.halfSpreadBps = Math.max(0, Math.round(pNum(params, 'halfSpreadBps', prevS)))
        this.params.premiumBps = Math.round(pNum(params, 'premiumBps', prevP))
        return this.handle('exchange_spread', () => {
          this.params.halfSpreadBps = prevS
          this.params.premiumBps = prevP
        })
      }
      case 'exchange_withdraw_fee_change': {
        const net = pStr(params, 'network') as Network | undefined
        if (!net) return null
        const prev = this.params.withdrawFeeMicroUsdt[net]
        this.params.withdrawFeeMicroUsdt[net] = Math.round(pNum(params, 'feeMicroUsdt', prev ?? 0))
        return this.handle('exchange_wd_fee', () => {
          if (prev === undefined) delete this.params.withdrawFeeMicroUsdt[net]
          else this.params.withdrawFeeMicroUsdt[net] = prev
        })
      }
      case 'exchange_halt_blocks_withdrawals': {
        const prev = this.cfg.haltBlocksWithdrawals
        this.cfg.haltBlocksWithdrawals = pBool(params, 'value', true)
        return this.handle('exchange_halt_wd', () => {
          this.cfg.haltBlocksWithdrawals = prev
        })
      }
      default:
        return null
    }
  }

  private applyLoss(irtFraction: number): { irtLoss: Irt; usdtLoss: MicroUsdt } {
    const irtLoss = Math.floor(this.irt * irtFraction)
    this.irt -= irtLoss
    this.f.irtHackLoss += irtLoss
    let usdtLoss = 0
    for (const l of this.lots) {
      const loss = Math.floor(l.qty * irtFraction)
      l.qty -= loss
      usdtLoss += loss
    }
    this.lots = this.lots.filter((l) => l.qty > 0)
    this.f.usdtHackLoss += usdtLoss
    return { irtLoss, usdtLoss }
  }

  private handle(prefix: string, revert: () => void): EventHandle {
    let done = false
    return {
      id: newHandleId(prefix),
      revert: () => {
        if (done) return
        done = true
        revert()
      },
    }
  }
}
