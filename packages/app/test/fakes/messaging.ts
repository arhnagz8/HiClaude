import { err, ok, portError, type Clock, type IdentityPort, type Irt, type MessengerButton, type MessengerPort, type Result, type SmsPort } from '@hiclaude/contracts'
import { CallLog, FailureScript, type FailureSpec } from './common'

export interface SentMessage {
  chatId: string
  textFa: string
  buttons?: MessengerButton[][]
  messageId: string
  at: number
}

/**
 * Fake Telegram/Bale. initData format (NOT the real HMAC scheme): `fake:<userId>:<authDateMs>[:<firstName>]` —
 * build it with `makeInitData`. Anything else fails verification.
 */
export class FakeMessenger implements MessengerPort {
  readonly calls = new CallLog()
  readonly failures = new FailureScript()
  readonly sent: SentMessage[] = []
  private seq = 0

  constructor(readonly channel: 'telegram' | 'bale', private readonly clock: Clock) {}

  fail(method: string, spec: FailureSpec, times = 1): void {
    this.failures.add(method, spec, times)
  }

  makeInitData(userId: string, o: { authDate?: number; firstName?: string } = {}): string {
    return `fake:${userId}:${o.authDate ?? this.clock.now()}${o.firstName ? `:${o.firstName}` : ''}`
  }

  async sendMessage(req: { chatId: string; textFa: string; buttons?: MessengerButton[][]; silent?: boolean }): Promise<Result<{ messageId: string }>> {
    this.calls.record('sendMessage', req)
    const f = this.failures.take('sendMessage')
    if (f) return f
    const messageId = `${this.channel}-m-${++this.seq}`
    this.sent.push({ chatId: req.chatId, textFa: req.textFa, buttons: req.buttons, messageId, at: this.clock.now() })
    return ok({ messageId })
  }

  verifyInitData(initData: string): Result<{ userId: string; firstName?: string; username?: string; authDate: number }> {
    this.calls.record('verifyInitData', initData)
    const f = this.failures.take('verifyInitData')
    if (f) return f
    const m = /^fake:([^:]+):(\d+)(?::(.*))?$/.exec(initData)
    if (!m) return err(portError('VALIDATION', 'bad initData'))
    return ok({ userId: m[1] as string, authDate: Number(m[2]), firstName: m[3] })
  }

  messagesTo(chatId: string): SentMessage[] {
    return this.sent.filter((m) => m.chatId === chatId)
  }
}

export interface SentSms {
  phone: string
  textFa: string
  template?: string
  messageId: string
  at: number
}

export class FakeSms implements SmsPort {
  readonly calls = new CallLog()
  readonly failures = new FailureScript()
  readonly sent: SentSms[] = []
  costIrt: Irt = 300
  private seq = 0

  constructor(private readonly clock: Clock) {}

  fail(method: string, spec: FailureSpec, times = 1): void {
    this.failures.add(method, spec, times)
  }

  async send(req: { phone: string; textFa: string; template?: string }): Promise<Result<{ messageId: string; costIrt: Irt }>> {
    this.calls.record('send', req)
    const f = this.failures.take('send')
    if (f) return f
    const messageId = `sms-${++this.seq}`
    this.sent.push({ ...req, messageId, at: this.clock.now() })
    return ok({ messageId, costIrt: this.costIrt })
  }

  to(phone: string): SentSms[] {
    return this.sent.filter((s) => s.phone === phone)
  }
  /** Last OTP code sent to a phone (parsed from the text), if any. */
  lastOtp(phone: string): string | undefined {
    const m = [...this.to(phone)].reverse().find((s) => s.template === 'otp')
    return m ? /(\d{4,8})/.exec(m.textFa.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))))?.[1] : undefined
  }
}

export class FakeIdentity implements IdentityPort {
  readonly calls = new CallLog()
  readonly failures = new FailureScript()
  /** default answer for pairs without an explicit rule */
  defaultMatch = true
  costIrt: Irt = 2_000
  private readonly rules = new Map<string, boolean>()
  private readonly cardRules = new Map<string, boolean>()

  fail(method: string, spec: FailureSpec, times = 1): void {
    this.failures.add(method, spec, times)
  }
  setShahkar(nationalId: string, phone: string, match: boolean): void {
    this.rules.set(`${nationalId}|${phone}`, match)
  }
  setCardOwner(cardPan: string, nationalId: string, match: boolean): void {
    this.cardRules.set(`${cardPan}|${nationalId}`, match)
  }

  async shahkar(req: { nationalId: string; phone: string }): Promise<Result<{ match: boolean; costIrt: Irt }>> {
    this.calls.record('shahkar', req)
    const f = this.failures.take('shahkar')
    if (f) return f
    return ok({ match: this.rules.get(`${req.nationalId}|${req.phone}`) ?? this.defaultMatch, costIrt: this.costIrt })
  }

  async cardOwner(req: { cardPan: string; nationalId: string }): Promise<Result<{ match: boolean; ownerNameMasked?: string; costIrt: Irt }>> {
    this.calls.record('cardOwner', req)
    const f = this.failures.take('cardOwner')
    if (f) return f
    return ok({ match: this.cardRules.get(`${req.cardPan}|${req.nationalId}`) ?? this.defaultMatch, ownerNameMasked: 'ع*** ر***', costIrt: this.costIrt })
  }
}
