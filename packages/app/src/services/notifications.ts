/**
 * NotificationService — outbox-style notifications with Persian templates.
 *
 *   enqueue(input)  synchronous: renders + stores rows (in-app rows are delivered immediately; messenger/SMS rows are `pending`).
 *   flush()         async: sends pending rows + rows whose retry time has come. Serialised (never double-sends).
 *   notify(input)   enqueue + flush (awaitable convenience). NEVER throws.
 *
 * Routing: in-app (DB) always for customers. Messenger: first available of [preferredChannel, telegram, bale] (customer has an id AND
 * the platform has a port). Critical events (see CRITICAL_EVENTS) fall back to the next messenger and finally SMS when sending fails or the
 * customer has no messenger. Non-critical failures retry with backoff (1m, 5m, 30m, 2h, 6h; 5 attempts) then give up.
 * OTP codes are never persisted in clear text (the stored text is redacted).
 */
import { existsSync, readFileSync } from 'node:fs'
import { formatIrt, formatJalaliDateTime, formatUsdt, type DomainEvent, type EventBus, type Customer, type PortError } from '@hiclaude/contracts'
import type { AppContext } from '../context'
import type { NotificationChannel, NotificationRecord } from '../repos'
import { isPlainObject } from '../util'
import { COPY_EVENT_ALIASES, CRITICAL_EVENTS, DEFAULT_TEMPLATES, interpolate, type NotificationEvent, type TemplateSet } from './notificationTemplates'

export const RETRY_BACKOFF_MS = [60_000, 300_000, 1_800_000, 7_200_000, 21_600_000] as const
export const MAX_NOTIFICATION_ATTEMPTS = RETRY_BACKOFF_MS.length

export interface NotifyInput {
  event: NotificationEvent
  /** Recipient customer (routing by identities). */
  customerId?: string
  /** Direct phone (SMS only) when there is no customer record. */
  phone?: string
  vars?: Record<string, unknown>
  /** Skip if a notification with the same key was already created (per channel). */
  dedupeKey?: string
  preferredChannel?: 'telegram' | 'bale'
  /** Override the default criticality of the event. */
  critical?: boolean
}

export interface NotifyResult {
  /** ids of rows created by this call (before any fallback rows added during flush) */
  ids: string[]
  skipped?: boolean
  error?: string
}

export interface FlushResult {
  sent: number
  failed: number
  retrying: number
}

type NotifCtx = Pick<AppContext, 'clock' | 'ids' | 'repos' | 'db' | 'ports' | 'params' | 'logger' | 'costs'>

const MESSENGERS = ['telegram', 'bale'] as const
type Messenger = (typeof MESSENGERS)[number]

export class NotificationService {
  private templates = new Map<string, TemplateSet>()
  private lock: Promise<unknown> = Promise.resolve()

  constructor(private readonly ctx: NotifCtx) {
    for (const [ev, set] of Object.entries(DEFAULT_TEMPLATES)) this.templates.set(ev, { ...set })
  }

  // ───────────────────────── templates ─────────────────────────
  /** Register/override a template. `channel` 'default' replaces the fallback text. */
  registerTemplate(event: NotificationEvent, channel: NotificationChannel | 'default' | 'in_app_title', text: string): void {
    const set = this.templates.get(event) ?? { default: text }
    set[channel] = text
    this.templates.set(event, set)
  }

  templateFor(event: NotificationEvent, channel: NotificationChannel): string | undefined {
    const set = this.templates.get(event)
    return set ? (set[channel] ?? set.default) : undefined
  }

  listTemplates(): Record<string, TemplateSet> {
    return Object.fromEntries([...this.templates].map(([k, v]) => [k, { ...v }]))
  }

  /**
   * Apply a flat copy map (data/copy.fa.json). Accepted keys:
   *   `notif.<domain>.<name>.msg`          messenger text (telegram + bale, and the fallback for other channels)
   *   `notif.<domain>.<name>.sms`          SMS text
   *   `notif.<domain>.<name>.inapp.body`   in-app body        (`.inapp.title` = in-app title)
   *   `notify.<event>[.<channel>]`         our own flat form (channel: telegram|bale|sms|in_app|default)
   * Placeholders are `{var}` (copy file) or `{{var|filter}}`. Values may also be `{ value: "…" }` Records.
   * Event names are mapped through COPY_EVENT_ALIASES (e.g. `auth.otp` → `otp`). `.email.*`, `notif.btn.*` and `notif.admin.*` keys are ignored.
   * Returns the number of templates applied.
   */
  loadCopy(map: Record<string, unknown>): number {
    let n = 0
    for (const [key, raw] of Object.entries(map)) {
      const text = typeof raw === 'string' ? raw : isPlainObject(raw) && typeof raw.value === 'string' ? raw.value : undefined
      if (text === undefined) continue
      const c = /^notif\.(.+?)\.(msg|sms|inapp\.body|inapp\.title)$/.exec(key)
      if (c) {
        const name = c[1] as string
        if (name.startsWith('btn.') || name.startsWith('admin.')) continue
        const event = COPY_EVENT_ALIASES[name] ?? name
        switch (c[2]) {
          case 'msg':
            this.registerTemplate(event, 'default', text)
            this.registerTemplate(event, 'telegram', text)
            this.registerTemplate(event, 'bale', text)
            break
          case 'sms':
            this.registerTemplate(event, 'sms', text)
            break
          case 'inapp.body':
            this.registerTemplate(event, 'in_app', text)
            break
          default:
            this.registerTemplate(event, 'in_app_title', text)
        }
        n++
        continue
      }
      const m = /^(?:notify|notifications)\.(.+)$/.exec(key)
      if (!m) continue
      let event = m[1] as string
      let channel: NotificationChannel | 'default' = 'default'
      const cm = /^(.+)\.(telegram|bale|sms|in_app|default)$/.exec(event)
      if (cm) {
        event = cm[1] as string
        channel = cm[2] as NotificationChannel | 'default'
      }
      this.registerTemplate(event.replace(/_/g, '.'), channel, text)
      n++
    }
    return n
  }

  loadCopyFile(path: string): number {
    if (!existsSync(path)) return 0
    const raw = JSON.parse(readFileSync(path, 'utf8')) as unknown
    return isPlainObject(raw) ? this.loadCopy(raw) : 0
  }

  render(event: NotificationEvent, channel: NotificationChannel, vars: Record<string, unknown> = {}): string {
    const tpl = this.templateFor(event, channel)
    const b = this.ctx.params().brand
    const support = b.supportTelegram ?? b.supportBale ?? b.supportPhone ?? ''
    if (tpl === undefined) return typeof vars.text === 'string' ? vars.text : String(event)
    const all = { brand: b.nameFa, support, domain: b.domain, ...vars }
    const body = interpolate(tpl, all)
    const title = channel === 'in_app' ? this.templates.get(event)?.in_app_title : undefined
    return title ? `${interpolate(title, all)}\n${body}` : body
  }

  // ───────────────────────── enqueue ─────────────────────────
  private messengersFor(c: Customer, preferred?: Messenger): Messenger[] {
    const avail = MESSENGERS.filter((m) => (m === 'telegram' ? c.telegramId : c.baleId) && this.ctx.ports.messengers[m])
    return preferred && avail.includes(preferred) ? [preferred, ...avail.filter((m) => m !== preferred)] : [...avail]
  }

  private targetFor(c: Customer, ch: Messenger): string {
    return (ch === 'telegram' ? c.telegramId : c.baleId) as string
  }

  /** Synchronous: store the notification rows. Safe to call from event handlers. Never throws. */
  enqueue(input: NotifyInput): NotifyResult {
    try {
      const { clock, ids, repos } = this.ctx
      const now = clock.now()
      const critical = input.critical ?? CRITICAL_EVENTS.has(input.event)
      const customer = input.customerId ? repos.customers.get(input.customerId) : undefined
      if (input.customerId && !customer) return { ids: [], error: `customer ${input.customerId} not found` }
      const groupId = ids.next('ntg')
      const rows: NotificationRecord[] = []
      const base = { groupId, customerId: customer?.id, event: input.event, critical, data: input.vars, dedupeKey: input.dedupeKey, attempts: 0, createdAt: now }
      const text = (ch: NotificationChannel) => this.render(input.event, ch, input.vars)

      // channel plan
      if (customer) rows.push({ ...base, id: ids.next('ntf'), channel: 'in_app', status: 'delivered', text: text('in_app'), sentAt: now })
      const messengers = customer ? this.messengersFor(customer, input.preferredChannel) : []
      const first = messengers[0]
      if (customer && first) {
        rows.push({ ...base, id: ids.next('ntf'), channel: first, target: this.targetFor(customer, first), status: 'pending', text: text(first) })
      } else {
        const phone = customer?.phone ?? input.phone
        if (phone && (critical || !customer)) rows.push({ ...base, id: ids.next('ntf'), channel: 'sms', target: phone, status: 'pending', text: text('sms') })
      }
      if (rows.length === 0) return { ids: [] }

      if (input.dedupeKey && rows.some((r) => repos.notifications.getByDedupe(input.dedupeKey as string, r.channel))) return { ids: [], skipped: true }

      return { ids: this.ctx.db.tx(() => rows.map((r) => repos.notifications.insert(r).id)) }
    } catch (e) {
      this.ctx.logger.error('notification enqueue failed', { error: String(e), event: input.event })
      return { ids: [], error: String(e) }
    }
  }

  /** enqueue + flush; resolves when sending finished. Never rejects. */
  async notify(input: NotifyInput): Promise<NotifyResult> {
    const r = this.enqueue(input)
    if (r.ids.length > 0) await this.flush()
    return r
  }

  /**
   * Send an OTP by SMS right now. The persisted row is redacted; the clear code only lives in memory for the send.
   * Resolves `{ ok:false }` instead of throwing.
   */
  async sendOtp(phone: string, code: string): Promise<{ ok: boolean; error?: string }> {
    const now = this.ctx.clock.now()
    const text = this.render('otp', 'sms', { otp: code, code, time: '۵ دقیقه' })
    let rowId: string | undefined
    try {
      const redacted = this.render('otp', 'sms', { otp: '•'.repeat(code.length), code: '•'.repeat(code.length), time: '۵ دقیقه' })
      rowId = this.ctx.repos.notifications.insert({
        id: this.ctx.ids.next('ntf'), groupId: this.ctx.ids.next('ntg'), event: 'otp', channel: 'sms', target: phone, status: 'pending', critical: true, text: redacted, attempts: 0, createdAt: now,
      }).id
      const res = await this.ctx.ports.sms.send({ phone, textFa: text, template: 'otp' })
      if (res.ok) {
        this.ctx.costs.record({ kind: 'sms', costIrt: res.value.costIrt, at: now, ref: res.value.messageId })
        this.ctx.repos.notifications.update(rowId, { status: 'sent', attempts: 1, sentAt: this.ctx.clock.now() })
        return { ok: true }
      }
      this.ctx.repos.notifications.update(rowId, { status: 'failed', attempts: 1, lastError: `${res.error.code}: ${res.error.message}` })
      return { ok: false, error: res.error.code }
    } catch (e) {
      if (rowId) {
        try {
          this.ctx.repos.notifications.update(rowId, { status: 'failed', attempts: 1, lastError: String(e) })
        } catch {
          /* ignore */
        }
      }
      return { ok: false, error: 'UNKNOWN' }
    }
  }

  // ───────────────────────── sending ─────────────────────────
  /** Send all pending rows and retry rows that are due. Calls are serialised. */
  flush(opts: { now?: number; limit?: number } = {}): Promise<FlushResult> {
    const run = this.lock.then(() => this.doFlush(opts.now ?? this.ctx.clock.now(), opts.limit ?? 200, true))
    this.lock = run.catch(() => undefined)
    return run
  }

  /** Retry rows whose `nextAttemptAt <= now` (pending rows are left to `flush`). */
  retryDue(now: number = this.ctx.clock.now()): Promise<FlushResult> {
    const run = this.lock.then(() => this.doFlush(now, 200, false))
    this.lock = run.catch(() => undefined)
    return run
  }

  private async doFlush(now: number, limit: number, includePending: boolean): Promise<FlushResult> {
    const repo = this.ctx.repos.notifications
    const result: FlushResult = { sent: 0, failed: 0, retrying: 0 }
    const queue: NotificationRecord[] = [...(includePending ? repo.listPending(limit) : []), ...repo.listRetryDue(now, limit)]
    const seen = new Set<string>()
    while (queue.length > 0) {
      const row = queue.shift() as NotificationRecord
      if (seen.has(row.id)) continue
      seen.add(row.id)
      try {
        const extra = await this.sendRow(row, now, result)
        if (extra) queue.push(...extra)
      } catch (e) {
        // Never let one bad row stop the queue.
        this.ctx.logger.error('notification send crashed', { id: row.id, error: String(e) })
        repo.update(row.id, { status: 'failed', attempts: row.attempts + 1, lastError: String(e) })
        result.failed++
      }
    }
    return result
  }

  private async sendRow(row: NotificationRecord, now: number, result: FlushResult): Promise<NotificationRecord[] | undefined> {
    const repo = this.ctx.repos.notifications
    const attempts = row.attempts + 1
    let err: PortError | undefined
    if (!row.target) {
      err = { code: 'VALIDATION', message: 'no target', retryable: false }
    } else if (row.channel === 'sms') {
      const r = await this.ctx.ports.sms.send({ phone: row.target, textFa: row.text, template: row.event })
      if (r.ok) this.ctx.costs.record({ kind: 'sms', costIrt: r.value.costIrt, at: now, customerId: row.customerId, ref: r.value.messageId })
      else err = r.error
    } else if (row.channel === 'telegram' || row.channel === 'bale') {
      const port = this.ctx.ports.messengers[row.channel]
      if (!port) err = { code: 'UNAVAILABLE', message: `no ${row.channel} messenger`, retryable: false }
      else {
        const r = await port.sendMessage({ chatId: row.target, textFa: row.text })
        if (!r.ok) err = r.error
      }
    } else {
      repo.update(row.id, { status: 'delivered' })
      return undefined
    }

    if (!err) {
      repo.update(row.id, { status: 'sent', attempts, sentAt: now, nextAttemptAt: undefined, lastError: undefined })
      result.sent++
      return undefined
    }

    const lastError = `${err.code}: ${err.message}`
    // Critical events: fail over immediately (next messenger → SMS).
    if (row.critical) {
      const next = this.fallbackRow(row, now)
      if (next) {
        repo.update(row.id, { status: 'failed', attempts, lastError: `${lastError} (fallback ${next.channel})` })
        result.failed++
        return [repo.insert(next)]
      }
    }
    if (err.retryable && attempts < MAX_NOTIFICATION_ATTEMPTS) {
      const delay = Math.max(err.retryAfterMs ?? 0, RETRY_BACKOFF_MS[attempts - 1] as number)
      repo.update(row.id, { status: 'retry', attempts, lastError, nextAttemptAt: now + delay })
      result.retrying++
    } else {
      repo.update(row.id, { status: 'failed', attempts, lastError, nextAttemptAt: undefined })
      result.failed++
    }
    return undefined
  }

  /** Next channel for a failed critical row, or undefined when the chain is exhausted. */
  private fallbackRow(row: NotificationRecord, now: number): NotificationRecord | undefined {
    if (!row.customerId) return undefined
    const customer = this.ctx.repos.customers.get(row.customerId)
    if (!customer) return undefined
    const tried = new Set(this.ctx.repos.notifications.listByGroup(row.groupId).map((r) => r.channel))
    const nextMessenger = this.messengersFor(customer).find((m) => !tried.has(m))
    const mk = (channel: NotificationChannel, target: string): NotificationRecord => ({
      id: this.ctx.ids.next('ntf'),
      groupId: row.groupId,
      customerId: row.customerId,
      event: row.event,
      channel,
      target,
      status: 'pending',
      critical: true,
      text: this.render(row.event, channel, row.data),
      data: row.data,
      dedupeKey: row.dedupeKey,
      attempts: 0,
      createdAt: now,
    })
    if (nextMessenger) return mk(nextMessenger, this.targetFor(customer, nextMessenger))
    if (!tried.has('sms') && customer.phone) return mk('sms', customer.phone)
    return undefined
  }

  // ───────────────────────── reading ─────────────────────────
  listForCustomer(customerId: string, opts: { channel?: NotificationChannel; unreadOnly?: boolean; limit?: number } = {}): NotificationRecord[] {
    return this.ctx.repos.notifications.listForCustomer(customerId, opts)
  }
  unreadCount(customerId: string): number {
    return this.ctx.repos.notifications.listForCustomer(customerId, { unreadOnly: true, limit: 1000 }).length
  }
  markRead(customerId: string, ids: string[] | 'all' = 'all'): number {
    return this.ctx.repos.notifications.markRead(customerId, ids, this.ctx.clock.now())
  }
  stats(): Record<string, number> {
    return this.ctx.repos.notifications.countByStatus()
  }

  // ───────────────────────── domain event wiring ─────────────────────────
  /**
   * Subscribes to domain events and enqueues the matching notifications (sync; sending happens in `flush`, driven by the
   * `notifications.dispatch` job). Dedupe keys make republished events harmless.
   */
  wireEvents(bus: EventBus): () => void {
    return bus.subscribeAll((e) => this.onEvent(e))
  }

  private orderVars(orderId: string): { customerId: string; vars: Record<string, unknown> } | undefined {
    const o = this.ctx.repos.orders.get(orderId)
    if (!o) return undefined
    const product = this.ctx.repos.products.get(o.productId)
    return {
      customerId: o.customerId,
      vars: {
        code: o.code,
        product: product?.titleFa ?? o.productId,
        payAmount: o.payAmount,
        expiresAt: o.payExpiresAt,
        // pre-formatted for copy.fa.json style `{amount}` / `{time}` / `{url}` placeholders
        amount: o.payCurrency === 'IRT' ? formatIrt(o.payAmount) : formatUsdt(o.payAmount),
        time: formatJalaliDateTime(o.payExpiresAt),
        url: `https://${this.ctx.params().brand.domain}/orders/${o.id}`,
      },
    }
  }

  private onEvent(e: DomainEvent): void {
    const send = (event: NotificationEvent, orderId: string, extra: Record<string, unknown> = {}) => {
      const o = this.orderVars(orderId)
      if (o) this.enqueue({ event, customerId: o.customerId, vars: { ...o.vars, ...extra }, dedupeKey: `${event}:${orderId}` })
    }
    switch (e.type) {
      case 'order.created':
        return send('order.created', e.orderId)
      case 'payment.confirmed':
        return send('order.paid', e.orderId)
      case 'payment.rejected':
        return send('payment.mismatch', e.orderId, { reason: e.reason })
      case 'order.status_changed':
        switch (e.to) {
          case 'payment_review':
            return send('payment.review', e.orderId)
          case 'delivered':
            return send('order.delivered', e.orderId)
          case 'failed':
            return send('order.failed', e.orderId)
          case 'refunded':
            return send('order.refunded', e.orderId)
          case 'expired':
            return send('order.expired', e.orderId)
          case 'cancelled':
            return send('order.cancelled', e.orderId)
        }
        return
      default:
        return
    }
  }
}
