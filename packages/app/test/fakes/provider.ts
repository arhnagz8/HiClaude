import {
  err,
  ok,
  portError,
  type CardSecrets,
  type Clock,
  type MicroUsdt,
  type Network,
  type ProviderCapabilities,
  type ProviderCard,
  type ProviderPort,
  type Result,
  type UsdCents,
} from '@hiclaude/contracts'
import { CallLog, FailureScript, type FailureSpec } from './common'

export interface FakeProviderOptions {
  mode?: 'api' | 'panel'
  balanceMicroUsdt?: MicroUsdt
  issueFeeMicroUsdt?: MicroUsdt
  topupFeeBps?: number
}

/**
 * Card provider fake. `mode: 'api'` advertises API capabilities; `'panel'` advertises panel-only (operators do the work),
 * but the methods still work so tests can drive both. Balance is in micro-USDT (par with USD): issuing/topping up debits
 * `face + fee`.
 */
export class FakeProvider implements ProviderPort {
  readonly calls = new CallLog()
  readonly failures = new FailureScript()
  readonly capabilities: ProviderCapabilities
  readonly cards = new Map<string, ProviderCard>()
  readonly credited = new Map<string, MicroUsdt>()
  readonly vendorPayments: { vendor: string; amountUsdCents: UsdCents; reference: string }[] = []
  balance: MicroUsdt
  issueFeeMicroUsdt: MicroUsdt
  topupFeeBps: number
  private seq = 0

  constructor(readonly id: string, private readonly clock: Clock, o: FakeProviderOptions = {}) {
    const m = o.mode ?? 'panel'
    this.capabilities = { issue: m, topUp: m, reveal: m, freeze: m, webhooks: m === 'api' }
    this.balance = o.balanceMicroUsdt ?? 0
    this.issueFeeMicroUsdt = o.issueFeeMicroUsdt ?? 4_990_000
    this.topupFeeBps = o.topupFeeBps ?? 300
  }

  fail(method: string, spec: FailureSpec, times = 1): void {
    this.failures.add(method, spec, times)
  }
  /** Credit our deposit (what the provider does after seeing the on-chain tx). */
  credit(txHash: string, amount: MicroUsdt): void {
    this.credited.set(txHash, amount)
    this.balance += amount
  }

  private gate(method: string, args: unknown): Result<never> | undefined {
    this.calls.record(method, args)
    return this.failures.take(method)
  }

  async accountBalance(): Promise<Result<MicroUsdt>> {
    return this.gate('accountBalance', undefined) ?? ok(this.balance)
  }

  async depositAddress(network: Network): Promise<Result<{ address: string; memo?: string }>> {
    return this.gate('depositAddress', network) ?? ok({ address: `PROV-${this.id}-${network}-ADDR`.padEnd(34, '0'), memo: network === 'TON' ? `uid-${this.id}` : undefined })
  }

  async creditStatus(req: { txHash: string }): Promise<Result<{ credited: boolean; amountMicroUsdt?: MicroUsdt; creditedAt?: number }>> {
    const f = this.gate('creditStatus', req)
    if (f) return f
    const a = this.credited.get(req.txHash)
    return ok(a === undefined ? { credited: false } : { credited: true, amountMicroUsdt: a, creditedAt: this.clock.now() })
  }

  private card(face: UsdCents, label: string): ProviderCard {
    const n = ++this.seq
    return { cardRef: `${this.id}-card-${n}`, last4: String(1000 + n).slice(-4), brand: 'visa', region: undefined, balanceUsdCents: face, status: 'active', createdAt: this.clock.now() + 0 * label.length }
  }

  async issueCard(req: { initialLoadUsdCents: UsdCents; label: string; region?: string }): Promise<Result<{ card: ProviderCard; feeMicroUsdt: MicroUsdt }>> {
    const f = this.gate('issueCard', req)
    if (f) return f
    const need = req.initialLoadUsdCents * 10_000 + this.issueFeeMicroUsdt
    if (need > this.balance) return err(portError('INSUFFICIENT_FUNDS', 'provider balance too low', { details: { needMicroUsdt: need, balanceMicroUsdt: this.balance } }))
    this.balance -= need
    const card = { ...this.card(req.initialLoadUsdCents, req.label), region: req.region }
    this.cards.set(card.cardRef, card)
    return ok({ card: { ...card }, feeMicroUsdt: this.issueFeeMicroUsdt })
  }

  async topUpCard(req: { cardRef: string; amountUsdCents: UsdCents }): Promise<Result<{ card: ProviderCard; feeMicroUsdt: MicroUsdt }>> {
    const f = this.gate('topUpCard', req)
    if (f) return f
    const c = this.cards.get(req.cardRef)
    if (!c) return err(portError('NOT_FOUND', 'unknown card'))
    if (c.status !== 'active') return err(portError('FROZEN', 'card is not active'))
    const fee = Math.ceil((req.amountUsdCents * 10_000 * this.topupFeeBps) / 10_000)
    const need = req.amountUsdCents * 10_000 + fee
    if (need > this.balance) return err(portError('INSUFFICIENT_FUNDS', 'provider balance too low'))
    this.balance -= need
    c.balanceUsdCents += req.amountUsdCents
    return ok({ card: { ...c }, feeMicroUsdt: fee })
  }

  async getCard(cardRef: string): Promise<Result<ProviderCard>> {
    const f = this.gate('getCard', cardRef)
    if (f) return f
    const c = this.cards.get(cardRef)
    return c ? ok({ ...c }) : err(portError('NOT_FOUND', 'unknown card'))
  }

  async revealCard(cardRef: string): Promise<Result<CardSecrets>> {
    const f = this.gate('revealCard', cardRef)
    if (f) return f
    const c = this.cards.get(cardRef)
    if (!c) return err(portError('NOT_FOUND', 'unknown card'))
    // Obviously fake PAN (test BIN 4000 00…, not a real card).
    return ok({ pan: `40000000000${c.last4.padStart(4, '0')}`.slice(0, 12) + c.last4, expMonth: 12, expYear: 2030, cvv: '123', holderName: 'TEST HOLDER' })
  }

  async freezeCard(cardRef: string): Promise<Result<ProviderCard>> {
    const f = this.gate('freezeCard', cardRef)
    if (f) return f
    const c = this.cards.get(cardRef)
    if (!c) return err(portError('NOT_FOUND', 'unknown card'))
    c.status = 'frozen'
    return ok({ ...c })
  }

  async payVendor(req: { vendor: string; amountUsdCents: UsdCents; reference: string }): Promise<Result<{ receiptRef: string; feeMicroUsdt: MicroUsdt }>> {
    const f = this.gate('payVendor', req)
    if (f) return f
    const need = req.amountUsdCents * 10_000
    if (need > this.balance) return err(portError('INSUFFICIENT_FUNDS', 'provider balance too low'))
    this.balance -= need
    this.vendorPayments.push(req)
    return ok({ receiptRef: `${this.id}-rcpt-${++this.seq}`, feeMicroUsdt: 0 })
  }
}
