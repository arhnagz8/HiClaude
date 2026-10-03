/**
 * MessengerSim implements MessengerPort for Telegram or Bale. Records every outbound message (agents read them with messagesTo / onMessage) and
 * simulates blocked chats, per-chat/global rate limits, outages and Telegram filtering inside Iran.
 *
 * initData (Mini App auth) uses a documented FAKE format: `sim:<userId>:<authDateSeconds>[:<firstName>[:<username>]]` (authDate in epoch SECONDS like
 * Telegram; a value >= 1e11 is read as milliseconds). `makeInitData()` builds it. Freshness is NOT enforced here: the app decides using `authDate`.
 */
import { MS, err, ok, portError, type EpochMs, type MessengerButton, type MessengerPort, type Result, type Rng } from '@hiclaude/contracts'
import { newHandleId, pNum, type EventHandle, type Params, type SimComponent, type SimEnv } from '../core/types'

export interface SentMessage {
  messageId: string
  chatId: string
  textFa: string
  buttons?: MessengerButton[][]
  silent: boolean
  at: EpochMs
  /** false when delivery silently failed (user unreachable) */
  delivered: boolean
}

export interface MessengerSimConfig {
  failureProb: number
  /** probability a given chat has blocked the bot at first contact */
  blockedProb: number
  perChatPerMinute: number
  globalPerSecond: number
  /** fraction of messages that are never delivered while the channel is filtered */
  filteredLossProb: number
}

export const DEFAULT_MESSENGER_CONFIG: MessengerSimConfig = { failureProb: 0.002, blockedProb: 0.01, perChatPerMinute: 20, globalPerSecond: 30, filteredLossProb: 0 }

export class MessengerSim implements MessengerPort, SimComponent {
  readonly name: string
  readonly cfg: MessengerSimConfig
  private readonly env: SimEnv
  private readonly rng: Rng
  private sent: SentMessage[] = []
  private byChat = new Map<string, SentMessage[]>()
  private blocked = new Set<string>()
  private contacted = new Set<string>()
  private chatWindow = new Map<string, number[]>()
  private globalWindow: number[] = []
  private listeners: ((m: SentMessage) => void)[] = []
  private seq = 0
  private downCount = 0
  private filteredLoss = 0

  constructor(
    env: SimEnv,
    rng: Rng,
    readonly channel: 'telegram' | 'bale',
    cfg: Partial<MessengerSimConfig> = {},
  ) {
    this.env = env
    this.rng = rng
    this.name = `messenger:${channel}`
    this.cfg = { ...DEFAULT_MESSENGER_CONFIG, ...cfg }
  }

  async sendMessage(req: { chatId: string; textFa: string; buttons?: MessengerButton[][]; silent?: boolean }): Promise<Result<{ messageId: string }>> {
    const now = this.env.clock.now()
    if (this.downCount > 0) return err(portError('UNAVAILABLE', `${this.channel} API unreachable`, { retryAfterMs: 5 * MS.minute }))
    if (!req.chatId || !req.textFa) return err(portError('VALIDATION', 'chatId and text are required', { retryable: false }))
    if (!this.contacted.has(req.chatId)) {
      this.contacted.add(req.chatId)
      if (this.rng.bool(this.cfg.blockedProb)) this.blocked.add(req.chatId)
    }
    if (this.blocked.has(req.chatId)) return err(portError('REJECTED', 'Forbidden: bot was blocked by the user', { retryable: false }))
    // rate limits
    const gw = this.globalWindow.filter((t) => t > now - 1000)
    if (gw.length >= this.cfg.globalPerSecond) {
      this.globalWindow = gw
      return err(portError('RATE_LIMITED', 'Too Many Requests (global)', { retryAfterMs: 1000 }))
    }
    const cw = (this.chatWindow.get(req.chatId) ?? []).filter((t) => t > now - MS.minute)
    if (cw.length >= this.cfg.perChatPerMinute) {
      this.chatWindow.set(req.chatId, cw)
      return err(portError('RATE_LIMITED', 'Too Many Requests (chat)', { retryAfterMs: 10_000 }))
    }
    if (this.rng.bool(this.cfg.failureProb)) return err(portError('UNAVAILABLE', 'temporary API error', { retryAfterMs: 5_000 }))
    gw.push(now)
    this.globalWindow = gw
    cw.push(now)
    this.chatWindow.set(req.chatId, cw)
    this.seq += 1
    const delivered = !(this.filteredLoss > 0 && this.rng.bool(this.filteredLoss))
    const m: SentMessage = { messageId: `${this.channel}-m${String(this.seq).padStart(7, '0')}`, chatId: req.chatId, textFa: req.textFa, buttons: req.buttons, silent: !!req.silent, at: now, delivered }
    this.sent.push(m)
    const arr = this.byChat.get(req.chatId) ?? []
    arr.push(m)
    this.byChat.set(req.chatId, arr)
    this.env.stats.inc(`messenger.${this.channel}.sent`)
    if (!delivered) this.env.stats.inc(`messenger.${this.channel}.lost_filtered`)
    for (const l of this.listeners) l(m)
    return ok({ messageId: m.messageId })
  }

  verifyInitData(initData: string): Result<{ userId: string; firstName?: string; username?: string; authDate: EpochMs }> {
    const parts = initData.split(':')
    if (parts[0] !== 'sim' || parts.length < 3 || parts.length > 5) return err(portError('VALIDATION', 'initData must be sim:<userId>:<authDate>[:<firstName>[:<username>]]', { retryable: false }))
    const userId = parts[1] as string
    const raw = Number(parts[2])
    if (!/^\d{1,20}$/.test(userId) || !Number.isFinite(raw) || raw <= 0) return err(portError('VALIDATION', 'initData has a bad userId or authDate', { retryable: false }))
    const authDate = raw >= 1e11 ? Math.floor(raw) : Math.floor(raw * 1000)
    const firstName = parts[3] ? decodeURIComponent(parts[3]) : undefined
    const username = parts[4] ? decodeURIComponent(parts[4]) : undefined
    return ok({ userId, firstName, username, authDate })
  }

  // ───────────────────────────── agent API ─────────────────────────────
  makeInitData(userId: string, authDateMs: EpochMs = this.env.clock.now(), opts: { firstName?: string; username?: string } = {}): string {
    let s = `sim:${userId}:${Math.floor(authDateMs / 1000)}`
    if (opts.firstName !== undefined || opts.username !== undefined) s += `:${encodeURIComponent(opts.firstName ?? '')}`
    if (opts.username !== undefined) s += `:${encodeURIComponent(opts.username)}`
    return s
  }
  messagesTo(chatId: string): SentMessage[] {
    return [...(this.byChat.get(chatId) ?? [])]
  }
  allMessages(): SentMessage[] {
    return [...this.sent]
  }
  /** Fires synchronously whenever the bot sends a message (customer agents listen here to react to OTP/status messages). */
  onMessage(fn: (m: SentMessage) => void): () => void {
    this.listeners.push(fn)
    return () => {
      const i = this.listeners.indexOf(fn)
      if (i >= 0) this.listeners.splice(i, 1)
    }
  }
  blockBot(chatId: string): void {
    this.contacted.add(chatId)
    this.blocked.add(chatId)
  }
  unblockBot(chatId: string): void {
    this.contacted.add(chatId)
    this.blocked.delete(chatId)
  }

  applyEvent(type: string, params: Params): EventHandle | null {
    const ch = params.channel
    if (typeof ch === 'string' && ch !== this.channel && ch !== '*') return null
    switch (type) {
      case 'telegram_filter': {
        if (this.channel !== 'telegram') return null
        const loss = pNum(params, 'lossProb', 0.8)
        const prev = this.filteredLoss
        this.filteredLoss = loss
        return { id: newHandleId('telegram_filter'), revert: () => void (this.filteredLoss = prev) }
      }
      case 'internet_shutdown': {
        // international internet cut: Telegram is unreachable from Iran; Bale (domestic) keeps working
        if (this.channel !== 'telegram') return null
        this.downCount += 1
        let done = false
        return {
          id: newHandleId('messenger_down'),
          revert: () => {
            if (done) return
            done = true
            this.downCount -= 1
          },
        }
      }
      case 'messenger_outage': {
        this.downCount += 1
        let done = false
        const timer = this.env.sim.after(pNum(params, 'hours', 2) * MS.hour, () => {
          if (!done) {
            done = true
            this.downCount -= 1
          }
        }, { label: `${this.name}.outage_end` })
        return {
          id: newHandleId('messenger_outage'),
          revert: () => {
            if (done) return
            done = true
            timer.cancel()
            this.downCount -= 1
          },
        }
      }
      default:
        return null
    }
  }
}
