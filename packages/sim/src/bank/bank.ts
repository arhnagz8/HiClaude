/**
 * BankSim implements BankPort: our operating bank account.
 *  - credits: card-to-card (Shetab, near-instant with jitter / late posting), Paya/Satna inbound, gateway settlements, owner capital
 *  - debits: transferOut via Paya (cycle times, skips Thu-pm/Fri/holidays) or Satna (RTGS during banking hours), immediate internal payments
 *  - noise: late statement posting, duplicated statement lines (same ref), per-sender-card daily c2c cap, optional per-destination cap, outages
 * Agents drive it with injectCustomerTransfer(). Statement entries carry the TRANSACTION time in `at`; a late-posted credit becomes visible only
 * after its `postedAt` yet keeps its earlier `at`, so a naive `since = lastPollTime` cursor will miss it (the app must re-scan with overlap).
 */
import {
  MS,
  err,
  irstIsoDate,
  ok,
  portError,
  type BankCredit,
  type BankPort,
  type EpochMs,
  type Irt,
  type PlatformParams,
  type Result,
  type Rng,
} from '@hiclaude/contracts'
import { BankCalendar } from '../core/calendar'
import { newHandleId, pNum, type EventHandle, type Params, type SimComponent, type SimEnv } from '../core/types'
import { logNormalMedian, randomString } from '../core/util'

export interface BankConfig {
  id: string
  iban: string
  openingBalanceIrt: Irt
  /** Transfers above this use Satna instead of Paya. UNVERIFIED placeholder. */
  payaMaxPerTxIrt: Irt
  fees: {
    payaFixedIrt: Irt
    satnaPct: number
    satnaMinIrt: Irt
    satnaMaxIrt: Irt
    /** internal immediate payment (card-to-card out, bill pay) */
    instantOutIrt: Irt
  }
  c2c: {
    medianDelaySec: number
    delaySigma: number
    /** probability the statement line is posted late */
    lateProb: number
    lateMinMinutes: number
    lateMaxMinutes: number
    perSenderCardDailyCapIrt: Irt
    perDestCardDailyCapIrt: Irt | null
    minIrt: Irt
  }
  /** probability a posted statement line is listed twice (same ref) */
  duplicateProb: number
}

export function defaultBankConfig(p?: PlatformParams): BankConfig {
  return {
    id: 'bank',
    iban: 'IR060170000000100000000001',
    openingBalanceIrt: 0,
    payaMaxPerTxIrt: 100_000_000, // UNVERIFIED
    fees: { payaFixedIrt: 1_500, satnaPct: 0.0001, satnaMinIrt: 5_000, satnaMaxIrt: 30_000, instantOutIrt: 0 }, // UNVERIFIED
    c2c: {
      medianDelaySec: 6,
      delaySigma: 0.7,
      lateProb: 0.02,
      lateMinMinutes: 10,
      lateMaxMinutes: 360,
      perSenderCardDailyCapIrt: p?.paymentMethods.card_to_card.perCardDailyCapIrt ?? 15_000_000,
      perDestCardDailyCapIrt: null,
      minIrt: 1_000,
    },
    duplicateProb: 0.003,
  }
}

export interface StatementCredit extends BankCredit {
  postedAt: EpochMs
}

export interface OutgoingRecord {
  ref: string
  toIban: string
  amountIrt: Irt
  reason: string
  requestedAt: EpochMs
  settleAt: EpochMs
  feeIrt: Irt
  channel: 'paya' | 'satna' | 'instant'
}

export interface InjectResult {
  accepted: boolean
  ref?: string
  /** when the credit becomes visible on the statement (accepted only) */
  postedAt?: EpochMs
  reason?: 'SENDER_DAILY_CAP' | 'DEST_DAILY_CAP' | 'BANK_DOWN' | 'BELOW_MIN' | 'VALIDATION'
}

export class BankSim implements BankPort, SimComponent {
  readonly name = 'bank'
  readonly id: string
  readonly iban: string
  readonly calendar: BankCalendar
  private readonly cfg: BankConfig
  private readonly env: SimEnv
  private readonly rng: Rng
  private balanceIrt: Irt
  private credits: StatementCredit[] = []
  private outgoing: OutgoingRecord[] = []
  private refSeq = 0
  private senderDaily = new Map<string, number>()
  private destDaily = new Map<string, number>()
  private outageWindows: { from: EpochMs; to: EpochMs }[] = []
  private totalCredited = 0
  private totalDebited = 0
  private opening: Irt
  private pendingCredits = 0

  constructor(env: SimEnv, rng: Rng, cfg: BankConfig = defaultBankConfig(), calendar: BankCalendar = new BankCalendar()) {
    this.env = env
    this.rng = rng
    this.cfg = cfg
    this.id = cfg.id
    this.iban = cfg.iban
    this.calendar = calendar
    this.balanceIrt = cfg.openingBalanceIrt
    this.opening = cfg.openingBalanceIrt
  }

  config(): Readonly<BankConfig> {
    return this.cfg
  }
  setC2cDestinationCap(capIrt: Irt | null): void {
    this.cfg.c2c.perDestCardDailyCapIrt = capIrt
  }
  setC2cSenderCap(capIrt: Irt): void {
    this.cfg.c2c.perSenderCardDailyCapIrt = capIrt
  }

  // ───────────────────────────── BankPort ─────────────────────────────
  async listCredits(req: { since: EpochMs }): Promise<Result<BankCredit[]>> {
    if (this.isDown()) return err(portError('UNAVAILABLE', 'bank statement service unavailable'))
    const now = this.env.clock.now()
    const out: BankCredit[] = []
    for (const c of this.credits) {
      if (c.postedAt > now || c.at < req.since) continue
      const { postedAt: _p, ...line } = c
      void _p
      out.push({ ...line })
      if (this.isDuplicated(c)) out.push({ ...line })
    }
    out.sort((a, b) => a.at - b.at || (a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0))
    return ok(out)
  }

  async balance(): Promise<Result<Irt>> {
    if (this.isDown()) return err(portError('UNAVAILABLE', 'bank unavailable'))
    return ok(this.balanceIrt)
  }

  async transferOut(req: { toIban: string; amountIrt: Irt; reason: string }): Promise<Result<{ ref: string; settleAt: EpochMs; feeIrt: Irt }>> {
    const r = this.transferOutSync(req)
    if (!r.ok) return r
    return ok({ ref: r.value.ref, settleAt: r.value.settleAt, feeIrt: r.value.feeIrt })
  }

  // ───────────────────────────── sync internal API (ExchangeSim, GatewaySim, runner) ─────────────────────────────
  balanceNow(): Irt {
    return this.balanceIrt
  }

  isDown(t: EpochMs = this.env.clock.now()): boolean {
    return this.outageWindows.some((w) => t >= w.from && t < w.to)
  }

  /** Transfer via Paya (or Satna above payaMaxPerTxIrt, or if `channel` forces it). Funds leave the account immediately. */
  transferOutSync(req: { toIban: string; amountIrt: Irt; reason: string; channel?: 'paya' | 'satna' | 'instant' }): Result<OutgoingRecord> {
    if (!Number.isSafeInteger(req.amountIrt) || req.amountIrt <= 0) return err(portError('VALIDATION', 'amount must be a positive integer'))
    if (this.isDown()) return err(portError('UNAVAILABLE', 'bank unavailable'))
    const now = this.env.clock.now()
    const channel = req.channel ?? (req.amountIrt > this.cfg.payaMaxPerTxIrt ? 'satna' : 'paya')
    const f = this.cfg.fees
    let fee = 0
    let settleAt = now
    if (channel === 'paya') {
      fee = f.payaFixedIrt
      settleAt = this.calendar.nextPayaSettlement(now)
    } else if (channel === 'satna') {
      fee = Math.min(f.satnaMaxIrt, Math.max(f.satnaMinIrt, Math.ceil(req.amountIrt * f.satnaPct)))
      settleAt = this.calendar.nextSatnaSettlement(now)
    } else fee = f.instantOutIrt
    if (this.balanceIrt < req.amountIrt + fee) return err(portError('INSUFFICIENT_FUNDS', `bank balance ${this.balanceIrt} < ${req.amountIrt + fee}`))
    this.balanceIrt -= req.amountIrt + fee
    this.totalDebited += req.amountIrt + fee
    const rec: OutgoingRecord = { ref: this.nextRef('OUT'), toIban: req.toIban, amountIrt: req.amountIrt, reason: req.reason, requestedAt: now, settleAt, feeIrt: fee, channel }
    this.outgoing.push(rec)
    this.env.stats.inc('bank.transfers_out')
    this.env.log.emit('bank.transfer_out', 'bank', { ref: rec.ref, amount: rec.amountIrt, channel, reason: rec.reason, settleAt, fee })
    return ok(rec)
  }

  /** Immediate debit for card-based payments (e.g. paying an exchange via gateway/c2c from the owner's account). */
  payNow(req: { amountIrt: Irt; reason: string; toIban?: string }): Result<OutgoingRecord> {
    return this.transferOutSync({ toIban: req.toIban ?? 'IR-INTERNAL', amountIrt: req.amountIrt, reason: req.reason, channel: 'instant' })
  }

  /** Credit that arrives from inside the world (exchange IRT withdrawal, owner capital...). Posted at max(at, now). */
  creditExternal(req: { amountIrt: Irt; at?: EpochMs; channel?: BankCredit['channel']; note?: string; senderName?: string; ref?: string }): StatementCredit {
    const now = this.env.clock.now()
    const at = Math.max(req.at ?? now, now)
    return this.scheduleCredit({
      ref: req.ref ?? this.nextRef('CR'),
      amountIrt: req.amountIrt,
      at,
      postedAt: at,
      channel: req.channel ?? 'other',
      note: req.note,
      senderName: req.senderName,
    })
  }

  /** Gateway settlement batch (called by GatewaySim). */
  creditGatewaySettlement(req: { amountIrt: Irt; at: EpochMs; gatewayId: string; batchRef: string }): StatementCredit {
    return this.creditExternal({ amountIrt: req.amountIrt, at: req.at, channel: 'gateway_settlement', note: `${req.gatewayId} settlement ${req.batchRef}`, senderName: req.gatewayId, ref: `STL-${req.gatewayId}-${req.batchRef}` })
  }

  /**
   * Agent API: a customer pays us. For card_to_card the sender card's daily cap applies; paya/satna credit at the calendar cycle.
   * `at` defaults to now (never earlier). Returns whether the bank accepted it and when it shows on our statement.
   */
  injectCustomerTransfer(req: {
    amountIrt: Irt
    senderCardMasked: string
    destinationCardId?: string
    note?: string
    senderName?: string
    at?: EpochMs
    channel?: 'card_to_card' | 'paya' | 'satna'
  }): InjectResult {
    if (!Number.isSafeInteger(req.amountIrt) || req.amountIrt <= 0) return { accepted: false, reason: 'VALIDATION' }
    const now = this.env.clock.now()
    const at = Math.max(req.at ?? now, now)
    const channel = req.channel ?? 'card_to_card'
    const c = this.cfg.c2c
    if (channel === 'card_to_card') {
      if (req.amountIrt < c.minIrt) return { accepted: false, reason: 'BELOW_MIN' }
      const day = irstIsoDate(at)
      const sKey = `${req.senderCardMasked}|${day}`
      const used = this.senderDaily.get(sKey) ?? 0
      if (used + req.amountIrt > c.perSenderCardDailyCapIrt) {
        this.env.stats.inc('bank.c2c_rejected_sender_cap')
        return { accepted: false, reason: 'SENDER_DAILY_CAP' }
      }
      if (c.perDestCardDailyCapIrt !== null && req.destinationCardId) {
        const dKey = `${req.destinationCardId}|${day}`
        if ((this.destDaily.get(dKey) ?? 0) + req.amountIrt > c.perDestCardDailyCapIrt) {
          this.env.stats.inc('bank.c2c_rejected_dest_cap')
          return { accepted: false, reason: 'DEST_DAILY_CAP' }
        }
        this.destDaily.set(dKey, (this.destDaily.get(dKey) ?? 0) + req.amountIrt)
      }
      this.senderDaily.set(sKey, used + req.amountIrt)
    }
    let creditAt = at
    let postedAt = at
    if (channel === 'card_to_card') {
      const delay = Math.round(logNormalMedian(this.rng, c.medianDelaySec * 1000, c.delaySigma))
      creditAt = at + delay
      postedAt = creditAt
      if (this.rng.bool(c.lateProb)) {
        postedAt = creditAt + Math.round(this.rng.int(c.lateMinMinutes, c.lateMaxMinutes) * MS.minute)
        this.env.stats.inc('bank.late_posted')
      }
    } else {
      creditAt = channel === 'paya' ? this.calendar.nextPayaSettlement(at) : this.calendar.nextSatnaSettlement(at)
      postedAt = creditAt
    }
    // outage: statement lines appear when the bank is back
    for (const w of this.outageWindows) if (postedAt >= w.from && postedAt < w.to) postedAt = w.to + this.rng.int(0, 5 * MS.minute)
    const rec = this.scheduleCredit({
      ref: this.nextRef('TRK'),
      amountIrt: req.amountIrt,
      at: creditAt,
      postedAt,
      channel,
      senderCardMasked: req.senderCardMasked,
      senderName: req.senderName,
      destinationCardId: req.destinationCardId,
      note: req.note,
    })
    return { accepted: true, ref: rec.ref, postedAt }
  }

  private scheduleCredit(c: StatementCredit): StatementCredit {
    this.credits.push(c)
    this.pendingCredits += c.amountIrt
    const apply = (): void => {
      this.balanceIrt += c.amountIrt
      this.totalCredited += c.amountIrt
      this.pendingCredits -= c.amountIrt
      this.env.stats.inc('bank.credits_posted')
      this.env.log.emit('bank.credit', 'bank', { ref: c.ref, amount: c.amountIrt, channel: c.channel, at: c.at })
    }
    if (c.postedAt <= this.env.clock.now()) apply()
    else this.env.sim.at(c.postedAt, apply, { label: 'bank.credit', priority: 20 })
    return c
  }

  private isDuplicated(c: StatementCredit): boolean {
    // deterministic per ref so repeated polls agree
    if (this.cfg.duplicateProb <= 0) return false
    let h = 0
    for (let i = 0; i < c.ref.length; i++) h = (h * 31 + c.ref.charCodeAt(i)) >>> 0
    return (h % 100000) / 100000 < this.cfg.duplicateProb
  }

  private nextRef(prefix: string): string {
    this.refSeq += 1
    return `${prefix}${String(this.refSeq).padStart(7, '0')}${randomString(this.rng, '0123456789', 3)}`
  }

  // ───────────────────────────── introspection ─────────────────────────────
  statement(): StatementCredit[] {
    return this.credits.map((c) => ({ ...c }))
  }
  outgoingTransfers(): OutgoingRecord[] {
    return this.outgoing.map((o) => ({ ...o }))
  }
  /** Credits posted but not yet visible, plus visible-but-not-yet-posted. */
  pendingCreditsIrt(): Irt {
    return this.pendingCredits
  }

  /** balance = opening + posted credits - debits. */
  audit(): { opening: Irt; credited: Irt; debited: Irt; balance: Irt; pending: Irt; ok: boolean } {
    return { opening: this.opening, credited: this.totalCredited, debited: this.totalDebited, balance: this.balanceIrt, pending: this.pendingCredits, ok: this.opening + this.totalCredited - this.totalDebited === this.balanceIrt }
  }

  // ───────────────────────────── events ─────────────────────────────
  applyEvent(type: string, params: Params): EventHandle | null {
    switch (type) {
      case 'bank_outage': {
        const now = this.env.clock.now()
        const w = { from: now, to: now + pNum(params, 'hours', 6) * MS.hour }
        this.outageWindows.push(w)
        this.env.log.emit('bank.outage', 'bank', { until: w.to })
        return {
          id: newHandleId('bank_outage'),
          revert: () => {
            const i = this.outageWindows.indexOf(w)
            if (i >= 0) this.outageWindows.splice(i, 1)
          },
        }
      }
      case 'bank_late_posting': {
        const prev = this.cfg.c2c.lateProb
        this.cfg.c2c.lateProb = pNum(params, 'lateProb', 0.3)
        return {
          id: newHandleId('bank_late'),
          revert: () => {
            this.cfg.c2c.lateProb = prev
          },
        }
      }
      case 'c2c_cap_change': {
        const prev = this.cfg.c2c.perSenderCardDailyCapIrt
        this.cfg.c2c.perSenderCardDailyCapIrt = pNum(params, 'perCardDailyCapIrt', prev)
        return {
          id: newHandleId('c2c_cap'),
          revert: () => {
            this.cfg.c2c.perSenderCardDailyCapIrt = prev
          },
        }
      }
      default:
        return null
    }
  }
}
