/**
 * ProviderSim implements ProviderPort for one card provider / voucher supplier / vendor account, driven by ProviderParams.
 *
 *  - Funding: USDT sent to depositAddress(network) on ChainSim is detected at broadcast and credited after the chain confirmations + creditDelayMinutes.
 *  - Operations (issueCard/topUpCard/payVendor/reveal/freeze) honour `capabilities`: an operation whose capability is 'panel' is REJECTED through the
 *    API port and only works through ProviderPanel (the operator-side facade with human latency); 'none' is rejected everywhere.
 *  - Fees: issue fee + topup bps/fixed on every load; fx bps on non-USD vendor spend; decline fee; min load / max topup / max balance / daily spend limits.
 *  - Failure modes: plain failures (no state change), AMBIGUOUS failures (state changed but the call reports TIMEOUT: retry carefully),
 *    merchant/vendor declines by product risk label x provider quality, outages, freeze events (partial or total), counterparty exit with a recovered fraction.
 *  - Latency is sampled per call (lognormal) and exposed via lastLatencyMs / sampleLatencyMs(); virtual time does not advance inside a call, so the
 *    caller (operator pool, fulfilment worker) decides when the result "arrives".
 *  - Cards are FAKE: Luhn-valid numbers on clearly fake test BINs (400000... visa, 555555... mastercard); never real PANs.
 */
import {
  MS,
  err,
  ok,
  portError,
  usdCentsToMicroUsdt,
  type CardSecrets,
  type EpochMs,
  type MicroUsdt,
  type Network,
  type ProviderCapabilities,
  type ProviderCard,
  type ProviderParams,
  type ProviderPort,
  type Result,
  type RiskLabel,
  type Rng,
  type UsdCents,
  irstIsoDate,
} from '@hiclaude/contracts'
import { ChainSim } from '../chain/chain'
import { OutageCalendar } from '../core/outages'
import { newHandleId, pNum, pNumOrNull, type EventHandle, type Params, type SimComponent, type SimEnv } from '../core/types'
import { clamp, logNormalMedian, randomString } from '../core/util'

export type ProviderOp = 'issue' | 'topUp' | 'reveal' | 'freeze' | 'payVendor' | 'read'
export type AccessMode = 'api' | 'panel'

export interface ProviderSimConfig {
  /** 1 = nominal; < 1 worse (more declines/failures), > 1 better. */
  quality: number
  failureProb: number
  ambiguousFailureProb: number
  latency: { api: { medianMs: number; sigma: number }; panel: { medianMs: number; sigma: number } }
  panelSessionExpiryProb: number
  /** Base merchant/vendor decline probability by risk label. UNVERIFIED placeholders. */
  declineProb: Record<RiskLabel, number>
  outageProbPerMonth: number
  /** random counterparty failures (params.risk.counterpartyFailurePerMonth) */
  randomHazards: boolean
  failure: { medianFreezeDays: number; permanentExitShare: number; recoveredFraction: number; recoveryDays: number }
  /** vendor name (lower case) -> risk label; unknown vendors are 'medium' */
  vendorRisk: Record<string, RiskLabel>
  /** vendors billed in a non-USD currency (fxNonUsdBps applies) */
  nonUsdVendors: string[]
}

export function defaultProviderSimConfig(p?: ProviderParams): ProviderSimConfig {
  const api = p?.capabilities.issue === 'api'
  return {
    quality: p?.risk.label === 'high' ? 0.8 : p?.risk.label === 'medium' ? 0.9 : 1,
    failureProb: api ? 0.004 : 0.01,
    ambiguousFailureProb: 0.002,
    latency: { api: { medianMs: 2500, sigma: 0.6 }, panel: { medianMs: 4 * MS.minute, sigma: 0.7 } },
    panelSessionExpiryProb: 0.01,
    declineProb: { low: 0.01, medium: 0.04, high: 0.12 },
    outageProbPerMonth: api ? 0.04 : 0.08,
    randomHazards: true,
    failure: { medianFreezeDays: 7, permanentExitShare: 0.2, recoveredFraction: 0.3, recoveryDays: 30 },
    vendorRisk: { openai: 'high', anthropic: 'high', chatgpt: 'high', claude: 'high', midjourney: 'high', netflix: 'high', spotify: 'high', steam: 'low', aws: 'medium', digitalocean: 'medium', namecheap: 'medium' },
    nonUsdVendors: [],
  }
}

interface CardRec {
  cardRef: string
  pan: string
  cvv: string
  expMonth: number
  expYear: number
  last4: string
  brand: 'visa' | 'mastercard'
  region?: string
  balanceCents: UsdCents
  status: 'active' | 'frozen' | 'closed'
  createdAt: EpochMs
  label: string
  revealCount: number
}

interface DepositRec {
  txHash: string
  amountMicro: MicroUsdt
  creditAt: EpochMs
  credited: boolean
  creditedAt?: EpochMs
  lost?: boolean
}

function luhnCheckDigit(partial: string): number {
  let sum = 0
  for (let i = 0; i < partial.length; i++) {
    let d = Number(partial[partial.length - 1 - i])
    if (i % 2 === 0) {
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
  }
  return (10 - (sum % 10)) % 10
}
export function luhnValid(pan: string): boolean {
  if (!/^\d{12,19}$/.test(pan)) return false
  return luhnCheckDigit(pan.slice(0, -1)) === Number(pan[pan.length - 1])
}

export interface ProviderDeps {
  env: SimEnv
  rng: Rng
  chain: ChainSim
  originMs: EpochMs
}

export class ProviderSim implements ProviderPort, SimComponent {
  readonly name: string
  readonly id: string
  readonly params: ProviderParams
  readonly cfg: ProviderSimConfig
  readonly capabilities: ProviderCapabilities
  /** latency (ms) sampled for the most recent call */
  lastLatencyMs = 0
  private readonly d: ProviderDeps
  private readonly rng: Rng
  private readonly outages: OutageCalendar
  private balance: MicroUsdt = 0
  private frozenMicro: MicroUsdt = 0
  private status: 'active' | 'frozen' | 'closed' = 'active'
  private addresses = new Map<Network, string>()
  private deposits = new Map<string, DepositRec>()
  private cards = new Map<string, CardRec>()
  private receipts = new Map<string, { receiptRef: string; feeMicro: MicroUsdt; amountCents: UsdCents; at: EpochMs; code?: string }>()
  private spendDay = { key: '', cents: 0 }
  private seq = 0
  private f = { credited: 0, loaded: 0, fees: 0, vendorPaid: 0, lost: 0, recoveredOut: 0, spentOnCards: 0, cardRefund: 0 }
  private unreachable = 0

  constructor(params: ProviderParams, deps: ProviderDeps, cfg?: Partial<ProviderSimConfig>) {
    this.id = params.id
    this.name = `provider:${params.id}`
    this.params = structuredClone(params)
    this.capabilities = { ...params.capabilities }
    this.cfg = { ...defaultProviderSimConfig(params), ...cfg }
    this.d = deps
    this.rng = deps.rng
    this.outages = new OutageCalendar(deps.originMs, deps.rng.fork('outages'), { probPerMonth: this.cfg.outageProbPerMonth, medianMs: 3 * MS.hour, sigma: 0.8, minMs: 15 * MS.minute, maxMs: 48 * MS.hour })
    if (this.cfg.randomHazards && params.risk.counterpartyFailurePerMonth > 0) this.scheduleHazard(0)
  }

  /** @internal used by ProviderPanel (keeps all randomness on the provider's own stream) */
  rngBool(p: number): boolean {
    return this.rng.bool(p)
  }

  private now(): EpochMs {
    return this.d.env.clock.now()
  }

  // ───────────────────────────── hazards ─────────────────────────────
  private scheduleHazard(k: number): void {
    const start = this.d.originMs + k * 30 * MS.day
    this.d.env.sim.at(Math.max(start, this.now()), () => {
      const r = this.rng.fork(`hazard:${k}`)
      if (r.bool(this.params.risk.counterpartyFailurePerMonth)) {
        const at = start + Math.floor(r.next() * 30 * MS.day)
        const permanent = r.bool(this.cfg.failure.permanentExitShare)
        const days = clamp(logNormalMedian(r, this.cfg.failure.medianFreezeDays, 0.7), 1, 90)
        this.d.env.sim.at(Math.max(at, this.now()), () => {
          if (permanent) this.exit(this.cfg.failure.recoveredFraction, this.cfg.failure.recoveryDays)
          else this.freeze(r.bool(0.5) ? 1 : clamp(r.next(), 0.1, 0.9), days)
        }, { label: `provider.${this.id}.hazard`, priority: 30 })
      }
      this.scheduleHazard(k + 1)
    }, { label: `provider.${this.id}.hazard_bucket`, priority: 30 })
  }

  /** Freeze `fraction` of the account balance for `days` (null = until reverted). Cards freeze when fraction == 1. */
  freeze(fraction: number, days: number | null): EventHandle {
    const frac = clamp(fraction, 0, 1)
    const frozen = Math.floor(this.balance * frac)
    this.frozenMicro += frozen
    const prevStatus = this.status
    if (frac >= 1 && this.status === 'active') this.status = 'frozen'
    this.d.env.stats.inc(`provider.${this.id}.freezes`)
    this.d.env.log.emit('provider.freeze', this.name, { fraction: frac, frozen, days })
    let released = false
    const release = () => {
      if (released) return
      released = true
      this.frozenMicro = Math.max(0, this.frozenMicro - frozen)
      if (this.status === 'frozen' && prevStatus === 'active') this.status = 'active'
      this.d.env.log.emit('provider.unfreeze', this.name, { frozen })
    }
    if (days !== null) this.d.env.sim.at(this.now() + days * MS.day, release, { label: `provider.${this.id}.unfreeze`, priority: 30 })
    return { id: newHandleId('provider_freeze'), revert: release }
  }

  /** Counterparty exit: account closed; `recovered` fraction of the balance is paid out to `walletNetwork` after `days`; the rest is lost. */
  exit(recovered: number, days: number): void {
    if (this.status === 'closed') return
    const bal = this.balance
    this.status = 'closed'
    this.d.env.stats.inc(`provider.${this.id}.exits`)
    const back = Math.floor(bal * clamp(recovered, 0, 1))
    this.f.lost += bal - back
    this.f.recoveredOut += back // promised; reverted to lost if the payout cannot be made
    this.balance = 0
    this.frozenMicro = 0
    this.d.env.log.emit('provider.exit', this.name, { balance: bal, recovered: back, days })
    if (back > 0) {
      this.d.env.sim.at(this.now() + days * MS.day, () => {
        const net = (this.params.networks[0] ?? 'TRC20') as Network
        const addr = this.depositAddressSync(net)
        const fee = this.d.chain.networkFeeMicro(net)
        const amount = Math.max(0, back - fee)
        if (amount <= 0) return
        const r = this.d.chain.transfer({ network: net, from: addr, to: this.d.chain.walletAddress(net), amount, fromOwner: this.name, bottomless: false, fee })
        if (r.ok) this.d.env.log.emit('provider.recovery_payout', this.name, { amount })
        else {
          this.f.lost += back
          this.f.recoveredOut -= back
        }
      }, { label: `provider.${this.id}.recovery`, priority: 30 })
    }
  }

  // ───────────────────────────── funding ─────────────────────────────
  private depositAddressSync(network: Network): string {
    let a = this.addresses.get(network)
    if (!a) {
      a = this.d.chain.newAddress(network)
      this.addresses.set(network, a)
      this.d.chain.registerAddress(network, a, this.name)
      this.d.chain.onIncoming(a, (t) => this.onIncoming(t.txHash, t.amount))
    }
    return a
  }

  private onIncoming(txHash: string, amount: MicroUsdt): void {
    const confirmAt = this.d.chain.confirmAt(txHash)
    if (confirmAt === null || !Number.isFinite(confirmAt)) return
    const creditAt = confirmAt + this.params.creditDelayMinutes * MS.minute
    const rec: DepositRec = { txHash, amountMicro: amount, creditAt, credited: false }
    this.deposits.set(txHash, rec)
    this.d.env.sim.at(creditAt, () => {
      rec.credited = true
      rec.creditedAt = this.now()
      if (this.status === 'closed') {
        rec.lost = true
        this.f.lost += amount
        return
      }
      this.balance += amount
      this.f.credited += amount
      this.d.env.stats.inc(`provider.${this.id}.deposits`)
      this.d.env.log.emit('provider.credit', this.name, { tx: txHash, amount })
    }, { label: `provider.${this.id}.credit`, priority: 30 })
  }

  async depositAddress(network: Network): Promise<Result<{ address: string; memo?: string }>> {
    if (!this.params.networks.includes(network)) return err(portError('VALIDATION', `${this.id} does not accept ${network}`, { retryable: false }))
    return ok({ address: this.depositAddressSync(network) })
  }

  async creditStatus(req: { txHash: string }): Promise<Result<{ credited: boolean; amountMicroUsdt?: MicroUsdt; creditedAt?: EpochMs }>> {
    const g = this.gate('read', 'api', false)
    if (g) return g
    const d = this.deposits.get(req.txHash)
    if (!d || !d.credited) return ok({ credited: false })
    return ok({ credited: true, amountMicroUsdt: d.amountMicro, creditedAt: d.creditedAt })
  }

  async accountBalance(): Promise<Result<MicroUsdt>> {
    const g = this.gate('read', 'api', false)
    if (g) return g
    return ok(this.balance)
  }

  /** Spendable = balance - frozen part. */
  spendable(): MicroUsdt {
    return Math.max(0, this.balance - this.frozenMicro)
  }
  balanceNow(): MicroUsdt {
    return this.balance
  }
  accountStatus(): 'active' | 'frozen' | 'closed' {
    return this.status
  }

  // ───────────────────────────── gating / latency ─────────────────────────────
  sampleLatencyMs(mode: AccessMode): number {
    const l = this.cfg.latency[mode]
    return Math.round(logNormalMedian(this.rng, l.medianMs, l.sigma))
  }

  /** Common pre-checks. `random` = whether plain random failures may occur. */
  private gate(op: ProviderOp, mode: AccessMode, random: boolean): Result<never> | null {
    const now = this.now()
    if (!this.params.enabled) return err(portError('UNAVAILABLE', `${this.id} disabled`, { retryable: false }))
    this.lastLatencyMs = this.sampleLatencyMs(mode)
    this.d.env.stats.observe(`provider.${this.id}.latency_ms`, this.lastLatencyMs)
    if (op !== 'read') {
      const cap = op === 'payVendor' ? this.capabilityFor('payVendor') : this.capabilities[op]
      if (cap === 'none') return err(portError('REJECTED', `${this.id}: ${op} not supported`, { retryable: false }))
      if (cap === 'panel' && mode === 'api') return err(portError('REJECTED', `${this.id}: ${op} is panel-only (use ProviderPanel / operator task)`, { retryable: false }))
    }
    if (this.unreachable > 0 || this.outages.isDown(now)) return err(portError('UNAVAILABLE', `${this.id} unreachable`, { retryAfterMs: 10 * MS.minute }))
    if (this.status === 'closed') return err(portError('FROZEN', `${this.id} account closed`, { retryable: false }))
    if (random && this.rng.bool(this.cfg.failureProb)) return err(portError('UNAVAILABLE', `${this.id} temporary error`, { retryAfterMs: 60_000 }))
    return null
  }

  /** payVendor uses the topUp capability (funds movement) unless it is 'none', then issue. */
  private capabilityFor(_op: 'payVendor'): 'api' | 'panel' | 'none' {
    void _op
    const c = this.capabilities
    if (c.topUp !== 'none') return c.topUp
    return c.issue
  }

  private ambiguous(): boolean {
    return this.rng.bool(this.cfg.ambiguousFailureProb)
  }

  private declineProbability(risk: RiskLabel): number {
    return clamp(this.cfg.declineProb[risk] / Math.max(0.2, this.cfg.quality), 0, 0.95)
  }

  private feeCents(amountCents: UsdCents, extra: { fxBps?: number; issue?: boolean } = {}): UsdCents {
    const f = this.params.fees
    let cents = Math.ceil((amountCents * f.topupBps) / 10_000) + f.topupFixedUsdCents
    if (extra.issue) cents += f.issueUsdCents
    if (extra.fxBps) cents += Math.ceil((amountCents * extra.fxBps) / 10_000)
    return cents
  }

  private cardView(c: CardRec): ProviderCard {
    return { cardRef: c.cardRef, last4: c.last4, brand: c.brand, region: c.region, balanceUsdCents: c.balanceCents, status: c.status, createdAt: c.createdAt }
  }

  private newPan(brand: 'visa' | 'mastercard'): string {
    const bin = brand === 'visa' ? '400000' : '555555'
    const body = bin + randomString(this.rng, '0123456789', 9)
    return body + String(luhnCheckDigit(body))
  }

  // ───────────────────────────── port: cards ─────────────────────────────
  async issueCard(req: { initialLoadUsdCents: UsdCents; label: string; region?: string }): Promise<Result<{ card: ProviderCard; feeMicroUsdt: MicroUsdt }>> {
    return this.doIssue(req, 'api')
  }
  async topUpCard(req: { cardRef: string; amountUsdCents: UsdCents }): Promise<Result<{ card: ProviderCard; feeMicroUsdt: MicroUsdt }>> {
    return this.doTopUp(req, 'api')
  }
  async getCard(cardRef: string): Promise<Result<ProviderCard>> {
    return this.doGetCard(cardRef, 'api')
  }
  async revealCard(cardRef: string): Promise<Result<CardSecrets>> {
    return this.doReveal(cardRef, 'api')
  }
  async freezeCard(cardRef: string): Promise<Result<ProviderCard>> {
    return this.doFreezeCard(cardRef, 'api')
  }
  async payVendor(req: { vendor: string; amountUsdCents: UsdCents; reference: string }): Promise<Result<{ receiptRef: string; feeMicroUsdt: MicroUsdt }>> {
    return this.doPayVendor(req, 'api')
  }

  /** @internal shared by the API port and ProviderPanel */
  doIssue(req: { initialLoadUsdCents: UsdCents; label: string; region?: string }, mode: AccessMode): Result<{ card: ProviderCard; feeMicroUsdt: MicroUsdt }> {
    const g = this.gate('issue', mode, true)
    if (g) return g
    const load = req.initialLoadUsdCents
    const lim = this.params.limits
    const fees = this.params.fees
    if (!Number.isSafeInteger(load) || load <= 0) return err(portError('VALIDATION', 'initial load must be a positive integer (USD cents)'))
    if (load < fees.minLoadUsdCents) return err(portError('VALIDATION', `minimum load ${fees.minLoadUsdCents} cents`, { retryable: false, details: { min: fees.minLoadUsdCents } }))
    if (load > lim.maxTopupUsdCents || load > lim.maxBalanceUsdCents) return err(portError('CAP_EXCEEDED', `maximum load ${lim.maxTopupUsdCents} cents`, { retryable: false }))
    const feeCents = this.feeCents(load, { issue: true })
    const needMicro = usdCentsToMicroUsdt(load + feeCents)
    if (this.spendable() < needMicro) return err(portError('INSUFFICIENT_FUNDS', `provider balance ${this.spendable()} < ${needMicro}`, { retryable: false, details: { need: needMicro, have: this.spendable() } }))
    this.balance -= needMicro
    this.f.loaded += usdCentsToMicroUsdt(load)
    this.f.fees += usdCentsToMicroUsdt(feeCents)
    const brand: 'visa' | 'mastercard' = this.rng.bool(0.7) ? 'visa' : 'mastercard'
    this.seq += 1
    const now = this.now()
    const exp = new Date(now)
    const card: CardRec = {
      cardRef: `${this.id}_card_${String(this.seq).padStart(6, '0')}${randomString(this.rng, 'abcdef0123456789', 4)}`,
      pan: this.newPan(brand),
      cvv: randomString(this.rng, '0123456789', 3),
      expMonth: this.rng.int(1, 12),
      expYear: exp.getUTCFullYear() + 3,
      last4: '',
      brand,
      region: req.region,
      balanceCents: load,
      status: 'active',
      createdAt: now,
      label: req.label,
      revealCount: 0,
    }
    card.last4 = card.pan.slice(-4)
    this.cards.set(card.cardRef, card)
    this.d.env.stats.inc(`provider.${this.id}.cards_issued`)
    this.d.env.log.emit('provider.issue', this.name, { card: card.cardRef, load, fee: feeCents })
    const res = ok({ card: this.cardView(card), feeMicroUsdt: usdCentsToMicroUsdt(feeCents) })
    return this.ambiguous() ? err(portError('TIMEOUT', 'request timed out (outcome unknown)', { retryAfterMs: 30_000, details: { ambiguous: true } })) : res
  }

  doTopUp(req: { cardRef: string; amountUsdCents: UsdCents }, mode: AccessMode): Result<{ card: ProviderCard; feeMicroUsdt: MicroUsdt }> {
    const g = this.gate('topUp', mode, true)
    if (g) return g
    const c = this.cards.get(req.cardRef)
    if (!c) return err(portError('NOT_FOUND', 'unknown card', { retryable: false }))
    if (c.status !== 'active') return err(portError('FROZEN', `card is ${c.status}`, { retryable: false }))
    const amt = req.amountUsdCents
    const lim = this.params.limits
    if (!Number.isSafeInteger(amt) || amt <= 0) return err(portError('VALIDATION', 'amount must be a positive integer (USD cents)'))
    if (amt < this.params.fees.minLoadUsdCents) return err(portError('VALIDATION', `minimum load ${this.params.fees.minLoadUsdCents} cents`, { retryable: false }))
    if (amt > lim.maxTopupUsdCents) return err(portError('CAP_EXCEEDED', `maximum top-up ${lim.maxTopupUsdCents} cents`, { retryable: false }))
    if (c.balanceCents + amt > lim.maxBalanceUsdCents) return err(portError('CAP_EXCEEDED', `card balance would exceed ${lim.maxBalanceUsdCents} cents`, { retryable: false }))
    const feeCents = this.feeCents(amt)
    const needMicro = usdCentsToMicroUsdt(amt + feeCents)
    if (this.spendable() < needMicro) return err(portError('INSUFFICIENT_FUNDS', `provider balance ${this.spendable()} < ${needMicro}`, { retryable: false, details: { need: needMicro, have: this.spendable() } }))
    this.balance -= needMicro
    c.balanceCents += amt
    this.f.loaded += usdCentsToMicroUsdt(amt)
    this.f.fees += usdCentsToMicroUsdt(feeCents)
    this.d.env.stats.inc(`provider.${this.id}.topups`)
    this.d.env.log.emit('provider.topup', this.name, { card: c.cardRef, amount: amt, fee: feeCents })
    const res = ok({ card: this.cardView(c), feeMicroUsdt: usdCentsToMicroUsdt(feeCents) })
    return this.ambiguous() ? err(portError('TIMEOUT', 'request timed out (outcome unknown)', { retryAfterMs: 30_000, details: { ambiguous: true } })) : res
  }

  doGetCard(cardRef: string, mode: AccessMode): Result<ProviderCard> {
    const g = this.gate('read', mode, false)
    if (g) return g
    const c = this.cards.get(cardRef)
    return c ? ok(this.cardView(c)) : err(portError('NOT_FOUND', 'unknown card', { retryable: false }))
  }

  doReveal(cardRef: string, mode: AccessMode): Result<CardSecrets> {
    const g = this.gate('reveal', mode, true)
    if (g) return g
    const c = this.cards.get(cardRef)
    if (!c) return err(portError('NOT_FOUND', 'unknown card', { retryable: false }))
    c.revealCount += 1
    return ok({ pan: c.pan, expMonth: c.expMonth, expYear: c.expYear, cvv: c.cvv, holderName: 'SIM TEST', billingAddress: { line1: '1 Test Street', city: 'Testville', country: 'US', postalCode: '00000' } })
  }

  doFreezeCard(cardRef: string, mode: AccessMode): Result<ProviderCard> {
    const g = this.gate('freeze', mode, true)
    if (g) return g
    const c = this.cards.get(cardRef)
    if (!c) return err(portError('NOT_FOUND', 'unknown card', { retryable: false }))
    c.status = 'frozen'
    return ok(this.cardView(c))
  }

  // ───────────────────────────── port: vendor payments ─────────────────────────────
  vendorRiskOf(vendor: string): RiskLabel {
    return this.cfg.vendorRisk[vendor.toLowerCase()] ?? 'medium'
  }
  setVendorRisk(vendor: string, risk: RiskLabel): void {
    this.cfg.vendorRisk[vendor.toLowerCase()] = risk
  }

  /** Idempotent by `reference`: repeating a successful payment returns the same receipt without charging again. */
  doPayVendor(req: { vendor: string; amountUsdCents: UsdCents; reference: string }, mode: AccessMode, riskOverride?: RiskLabel): Result<{ receiptRef: string; feeMicroUsdt: MicroUsdt }> {
    const g = this.gate('payVendor', mode, true)
    if (g) return g
    const existing = this.receipts.get(req.reference)
    if (existing) return ok({ receiptRef: existing.receiptRef, feeMicroUsdt: existing.feeMicro })
    const amt = req.amountUsdCents
    if (!Number.isSafeInteger(amt) || amt <= 0) return err(portError('VALIDATION', 'amount must be a positive integer (USD cents)'))
    const now = this.now()
    const key = irstIsoDate(now)
    if (this.spendDay.key !== key) this.spendDay = { key, cents: 0 }
    if (this.spendDay.cents + amt > this.params.limits.dailySpendUsdCents) return err(portError('CAP_EXCEEDED', 'provider daily spend limit', { retryable: true, retryAfterMs: MS.hour }))
    const nonUsd = this.cfg.nonUsdVendors.includes(req.vendor.toLowerCase())
    const feeCents = this.feeCents(amt, { fxBps: nonUsd ? this.params.fees.fxNonUsdBps : 0 })
    const need = usdCentsToMicroUsdt(amt + feeCents)
    if (this.spendable() < need) return err(portError('INSUFFICIENT_FUNDS', `provider balance ${this.spendable()} < ${need}`, { retryable: false, details: { need, have: this.spendable() } }))
    const risk = riskOverride ?? this.vendorRiskOf(req.vendor)
    if (this.rng.bool(this.declineProbability(risk))) {
      const dec = Math.min(this.params.fees.declineFeeUsdCents, Math.floor(this.spendable() / 10_000))
      if (dec > 0) {
        this.balance -= usdCentsToMicroUsdt(dec)
        this.f.fees += usdCentsToMicroUsdt(dec)
      }
      this.d.env.stats.inc(`provider.${this.id}.declines`)
      this.d.env.log.emit('provider.decline', this.name, { vendor: req.vendor, amount: amt, risk })
      return err(portError('DECLINED', `vendor payment declined (${risk}-risk merchant)`, { retryable: true, details: { risk, declineFeeUsdCents: dec } }))
    }
    this.balance -= need
    this.spendDay.cents += amt
    this.f.vendorPaid += usdCentsToMicroUsdt(amt)
    this.f.fees += usdCentsToMicroUsdt(feeCents)
    this.seq += 1
    const rec = { receiptRef: `RCPT-${this.id}-${String(this.seq).padStart(7, '0')}`, feeMicro: usdCentsToMicroUsdt(feeCents), amountCents: amt, at: now, code: this.params.type === 'voucher_api' ? `${randomString(this.rng, 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 4)}-${randomString(this.rng, 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 4)}-${randomString(this.rng, 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 4)}` : undefined }
    this.receipts.set(req.reference, rec)
    this.d.env.stats.inc(`provider.${this.id}.vendor_payments`)
    this.d.env.log.emit('provider.pay_vendor', this.name, { vendor: req.vendor, amount: amt, fee: feeCents, ref: rec.receiptRef })
    const res = ok({ receiptRef: rec.receiptRef, feeMicroUsdt: rec.feeMicro })
    return this.ambiguous() ? err(portError('TIMEOUT', 'request timed out (outcome unknown; reuse the same reference to retry safely)', { retryAfterMs: 30_000, details: { ambiguous: true } })) : res
  }

  /** Voucher code of a voucher_api receipt. */
  voucherCode(receiptRef: string): string | undefined {
    for (const r of this.receipts.values()) if (r.receiptRef === receiptRef) return r.code
    return undefined
  }

  /**
   * Agent API: spend from a provider card at a merchant (the customer using the delivered card). Declines by merchant risk x quality; a decline fee is
   * charged to the card when it can afford it; non-USD merchants pay fxNonUsdBps.
   */
  chargeCard(req: { cardRef: string; merchant: string; amountUsdCents: UsdCents; riskLabel?: RiskLabel; nonUsd?: boolean }): Result<{ approved: true; chargedCents: UsdCents }> {
    const c = this.cards.get(req.cardRef)
    if (!c) return err(portError('NOT_FOUND', 'unknown card', { retryable: false }))
    if (c.status !== 'active') return err(portError('DECLINED', `card ${c.status}`, { retryable: false }))
    if (this.status !== 'active' && this.status !== 'frozen') return err(portError('DECLINED', 'issuer unavailable', { retryable: false }))
    if (this.status === 'frozen') return err(portError('DECLINED', 'issuer account frozen', { retryable: false }))
    const risk = req.riskLabel ?? this.vendorRiskOf(req.merchant)
    const fx = req.nonUsd ? Math.ceil((req.amountUsdCents * this.params.fees.fxNonUsdBps) / 10_000) : 0
    const total = req.amountUsdCents + fx
    if (c.balanceCents < total) return err(portError('DECLINED', 'insufficient card balance', { retryable: false }))
    if (this.rng.bool(this.declineProbability(risk))) {
      const dec = Math.min(this.params.fees.declineFeeUsdCents, c.balanceCents)
      c.balanceCents -= dec
      this.f.spentOnCards += dec
      this.d.env.stats.inc(`provider.${this.id}.card_declines`)
      return err(portError('DECLINED', `merchant declined (${risk}-risk)`, { retryable: true, details: { risk, declineFeeUsdCents: dec } }))
    }
    c.balanceCents -= total
    this.f.spentOnCards += total
    this.d.env.stats.inc(`provider.${this.id}.card_charges`)
    return ok({ approved: true, chargedCents: total })
  }

  cardRecordFor(cardRef: string): { balanceCents: UsdCents; status: string; label: string } | undefined {
    const c = this.cards.get(cardRef)
    return c ? { balanceCents: c.balanceCents, status: c.status, label: c.label } : undefined
  }
  cardCount(): number {
    return this.cards.size
  }

  // ───────────────────────────── audit ─────────────────────────────
  /**
   * credited = balance + loaded onto cards + vendor payments + fees + lost + recovered payouts (all in micro-USDT; custody on ChainSim holds the credited funds).
   */
  audit(): { ok: boolean; credited: MicroUsdt; accounted: MicroUsdt; balance: MicroUsdt; flows: Record<string, number> } {
    const f = this.f
    const accounted = this.balance + f.loaded + f.vendorPaid + f.fees + f.lost + f.recoveredOut
    return { ok: accounted === f.credited + this.lostDepositsMicro(), credited: f.credited, accounted, balance: this.balance, flows: { ...f } }
  }
  private lostDepositsMicro(): number {
    // deposits credited after closure are counted in f.lost already and not in f.credited
    let s = 0
    for (const d of this.deposits.values()) if (d.lost) s += d.amountMicro
    return s
  }

  // ───────────────────────────── events ─────────────────────────────
  applyEvent(type: string, params: Params): EventHandle | null {
    const list = Array.isArray(params.providers) ? params.providers.map(String) : typeof params.provider === 'string' ? [params.provider] : null
    if (list && !list.includes(this.id) && !list.includes('*')) return null
    switch (type) {
      case 'provider_freeze':
        return this.freeze(pNum(params, 'fractionFrozen', 0.1), pNumOrNull(params, 'durationDays') ?? null)
      case 'sanctions_freeze': {
        if (!list) return null
        return this.freeze(pNum(params, 'fractionFrozen', 1), pNumOrNull(params, 'durationDays') ?? null)
      }
      case 'provider_exit': {
        this.exit(pNum(params, 'recoveredFraction', this.cfg.failure.recoveredFraction), pNum(params, 'recoveryDays', this.cfg.failure.recoveryDays))
        return { id: newHandleId('provider_exit'), revert: () => undefined }
      }
      case 'provider_outage': {
        const now = this.now()
        const off = this.outages.inject(now, now + pNum(params, 'hours', 6) * MS.hour)
        return { id: newHandleId('provider_outage'), revert: off }
      }
      case 'internet_shutdown': {
        // foreign providers cannot be reached from Iran during a shutdown
        this.unreachable += 1
        let done = false
        return {
          id: newHandleId('provider_unreachable'),
          revert: () => {
            if (done) return
            done = true
            this.unreachable -= 1
          },
        }
      }
      case 'provider_fee_change': {
        const prev = { ...this.params.fees }
        this.params.fees.topupBps = Math.round(pNum(params, 'topupBps', prev.topupBps))
        this.params.fees.issueUsdCents = Math.round(pNum(params, 'issueUsdCents', prev.issueUsdCents))
        this.params.fees.fxNonUsdBps = Math.round(pNum(params, 'fxNonUsdBps', prev.fxNonUsdBps))
        return {
          id: newHandleId('provider_fee'),
          revert: () => {
            Object.assign(this.params.fees, prev)
          },
        }
      }
      case 'provider_quality': {
        const prev = this.cfg.quality
        this.cfg.quality = pNum(params, 'quality', prev)
        return {
          id: newHandleId('provider_quality'),
          revert: () => {
            this.cfg.quality = prev
          },
        }
      }
      default:
        return null
    }
  }
}

