/** SmsSim implements SmsPort: records messages with a cost, per-message delivery delay, silent losses, rate limits and outages. */
import { MS, err, ok, portError, type EpochMs, type Irt, type Result, type Rng, type SmsPort } from '@hiclaude/contracts'
import { newHandleId, pNum, type EventHandle, type Params, type SimComponent, type SimEnv } from '../core/types'
import { logNormalMedian } from '../core/util'

export interface SmsSimConfig {
  /** UNVERIFIED placeholder cost per SMS (Toman). */
  costIrt: Irt
  medianDelayMs: number
  delaySigma: number
  /** API error (nothing sent, nothing charged) */
  failureProb: number
  /** accepted + charged but never delivered */
  silentLossProb: number
  perPhonePerHour: number
}
export const DEFAULT_SMS_CONFIG: SmsSimConfig = { costIrt: 120, medianDelayMs: 4_000, delaySigma: 0.9, failureProb: 0.005, silentLossProb: 0.005, perPhonePerHour: 10 }

export interface SmsRecord {
  messageId: string
  phone: string
  textFa: string
  template?: string
  sentAt: EpochMs
  /** undefined when lost */
  deliverAt?: EpochMs
  costIrt: Irt
}

export class SmsSim implements SmsPort, SimComponent {
  readonly name = 'sms'
  readonly cfg: SmsSimConfig
  private records: SmsRecord[] = []
  private listeners: ((r: SmsRecord) => void)[] = []
  private perPhone = new Map<string, number[]>()
  private seq = 0
  private totalCost = 0
  private down = 0
  private delayMult = 1

  constructor(
    private readonly env: SimEnv,
    private readonly rng: Rng,
    cfg: Partial<SmsSimConfig> = {},
  ) {
    this.cfg = { ...DEFAULT_SMS_CONFIG, ...cfg }
  }

  async send(req: { phone: string; textFa: string; template?: string }): Promise<Result<{ messageId: string; costIrt: Irt }>> {
    const now = this.env.clock.now()
    if (!/^09\d{9}$/.test(req.phone)) return err(portError('VALIDATION', 'phone must be 09xxxxxxxxx', { retryable: false }))
    if (!req.textFa) return err(portError('VALIDATION', 'empty message', { retryable: false }))
    if (this.down > 0) return err(portError('UNAVAILABLE', 'SMS provider down', { retryAfterMs: 10 * MS.minute }))
    const w = (this.perPhone.get(req.phone) ?? []).filter((t) => t > now - MS.hour)
    if (w.length >= this.cfg.perPhonePerHour) {
      this.perPhone.set(req.phone, w)
      return err(portError('RATE_LIMITED', 'per-number hourly limit reached', { retryAfterMs: 10 * MS.minute }))
    }
    if (this.rng.bool(this.cfg.failureProb)) return err(portError('UNAVAILABLE', 'SMS gateway error', { retryAfterMs: 30_000 }))
    w.push(now)
    this.perPhone.set(req.phone, w)
    this.seq += 1
    const lost = this.rng.bool(this.cfg.silentLossProb)
    const delay = Math.round(logNormalMedian(this.rng, this.cfg.medianDelayMs * this.delayMult, this.cfg.delaySigma))
    const rec: SmsRecord = { messageId: `sms-${String(this.seq).padStart(7, '0')}`, phone: req.phone, textFa: req.textFa, template: req.template, sentAt: now, deliverAt: lost ? undefined : now + delay, costIrt: this.cfg.costIrt }
    this.records.push(rec)
    this.totalCost += rec.costIrt
    this.env.stats.inc('sms.sent')
    this.env.stats.observe('sms.cost_irt', rec.costIrt)
    if (rec.deliverAt !== undefined) {
      this.env.sim.at(rec.deliverAt, () => {
        for (const l of this.listeners) l(rec)
      }, { label: 'sms.deliver', priority: 15 })
    } else this.env.stats.inc('sms.lost')
    return ok({ messageId: rec.messageId, costIrt: rec.costIrt })
  }

  /** Messages the phone has received by now (agent view). */
  inbox(phone: string): SmsRecord[] {
    const now = this.env.clock.now()
    return this.records.filter((r) => r.phone === phone && r.deliverAt !== undefined && r.deliverAt <= now)
  }
  allRecords(): SmsRecord[] {
    return [...this.records]
  }
  totalCostIrt(): Irt {
    return this.totalCost
  }
  /** Fires at DELIVERY time (virtual clock) so a customer agent can read the OTP when it arrives. */
  onDeliver(fn: (r: SmsRecord) => void): () => void {
    this.listeners.push(fn)
    return () => {
      const i = this.listeners.indexOf(fn)
      if (i >= 0) this.listeners.splice(i, 1)
    }
  }

  applyEvent(type: string, params: Params): EventHandle | null {
    switch (type) {
      case 'sms_outage': {
        this.down += 1
        let done = false
        const hours = pNum(params, 'hours', 0)
        const timer = hours > 0 ? this.env.sim.after(hours * MS.hour, () => void (!done && ((done = true), (this.down -= 1)))) : null
        return {
          id: newHandleId('sms_outage'),
          revert: () => {
            if (done) return
            done = true
            timer?.cancel()
            this.down -= 1
          },
        }
      }
      case 'sms_delay': {
        const prev = this.delayMult
        this.delayMult = pNum(params, 'multiplier', 10)
        return { id: newHandleId('sms_delay'), revert: () => void (this.delayMult = prev) }
      }
      case 'sms_price_change': {
        const prev = this.cfg.costIrt
        this.cfg.costIrt = Math.round(pNum(params, 'costIrt', prev))
        return { id: newHandleId('sms_price'), revert: () => void (this.cfg.costIrt = prev) }
      }
      default:
        return null
    }
  }
}
