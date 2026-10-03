/**
 * ProviderPanel: the operator-side facade of a provider (web panel / Telegram bot). Same operations as the API port, but available for capabilities
 * marked 'panel', with HUMAN latency. Virtual time does not advance inside a call: the operator pool samples `estimateLatencyMs(op)` (or reads
 * `lastLatencyMs`) and schedules the call at (taskStart + latency); hooks let the runner record the latency.
 */
import { err, portError, type CardSecrets, type MicroUsdt, type ProviderCard, type Result, type RiskLabel, type UsdCents } from '@hiclaude/contracts'
import { ProviderSim, type ProviderOp } from './provider'

export interface PanelHooks {
  onCall?: (info: { providerId: string; op: ProviderOp; latencyMs: number; ok: boolean; errorCode?: string }) => void
}

export class ProviderPanel {
  lastLatencyMs = 0
  /** the next call fails once with a session-expiry error when true (test hook) */
  forceSessionExpiry = false

  constructor(
    readonly provider: ProviderSim,
    private readonly hooks: PanelHooks = {},
  ) {}

  get id(): string {
    return this.provider.id
  }
  get capabilities() {
    return this.provider.capabilities
  }

  /** Sample the human latency of one operation (task execution time on the panel). */
  estimateLatencyMs(): number {
    return this.provider.sampleLatencyMs('panel')
  }

  private wrap<T>(op: ProviderOp, fn: () => Result<T>): Result<T> {
    const latency = this.provider.sampleLatencyMs('panel')
    this.lastLatencyMs = latency
    const expired = this.forceSessionExpiry || this.provider.rngBool(this.provider.cfg.panelSessionExpiryProb)
    this.forceSessionExpiry = false
    const r: Result<T> = expired ? err(portError('UNAVAILABLE', 'panel session expired: log in again and retry', { retryAfterMs: 60_000 })) : fn()
    this.hooks.onCall?.({ providerId: this.id, op, latencyMs: latency, ok: r.ok, errorCode: r.ok ? undefined : r.error.code })
    return r
  }

  issueCard(req: { initialLoadUsdCents: UsdCents; label: string; region?: string }): Result<{ card: ProviderCard; feeMicroUsdt: MicroUsdt }> {
    return this.wrap('issue', () => this.provider.doIssue(req, 'panel'))
  }
  topUpCard(req: { cardRef: string; amountUsdCents: UsdCents }): Result<{ card: ProviderCard; feeMicroUsdt: MicroUsdt }> {
    return this.wrap('topUp', () => this.provider.doTopUp(req, 'panel'))
  }
  getCard(cardRef: string): Result<ProviderCard> {
    return this.wrap('read', () => this.provider.doGetCard(cardRef, 'panel'))
  }
  revealCard(cardRef: string): Result<CardSecrets> {
    return this.wrap('reveal', () => this.provider.doReveal(cardRef, 'panel'))
  }
  freezeCard(cardRef: string): Result<ProviderCard> {
    return this.wrap('freeze', () => this.provider.doFreezeCard(cardRef, 'panel'))
  }
  payVendor(req: { vendor: string; amountUsdCents: UsdCents; reference: string }, riskOverride?: RiskLabel): Result<{ receiptRef: string; feeMicroUsdt: MicroUsdt }> {
    return this.wrap('payVendor', () => this.provider.doPayVendor(req, 'panel', riskOverride))
  }
}
