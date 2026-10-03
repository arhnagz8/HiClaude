import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { portError, MS } from '@hiclaude/contracts'
import { describe, expect, it } from 'vitest'
import { CRITICAL_EVENTS, DEFAULT_TEMPLATES, MAX_NOTIFICATION_ATTEMPTS, RETRY_BACKOFF_MS, interpolate } from '../src'
import { PHONE, PHONE2, makeTestApp, mkCustomer, mkOrder, mkQuote } from './helpers'

describe('templates', () => {
  it('interpolates variables and filters; missing vars render empty', () => {
    expect(interpolate('a {{x}} b {{y}}', { x: 1 })).toBe('a 1 b ')
    expect(interpolate('{{p|irt}}', { p: 1234567 })).toBe('۱٬۲۳۴٬۵۶۷ تومان')
    expect(interpolate('{{r|default:نامشخص}}', {})).toBe('نامشخص')
    expect(interpolate('{{r|default:نامشخص}}', { r: 'ok' })).toBe('ok')
    expect(interpolate('{{n|num}} {{u|usd}} {{t|usdt}}', { n: 1500, u: 2500, t: 3_000_000 })).toBe('۱٬۵۰۰ ۲۵٫۰۰ دلار ۳٫۰۰ تتر')
    expect(interpolate('{{d|date}}', { d: Date.UTC(2026, 9, 2, 8) })).toBe('۱۰ مهر ۱۴۰۵')
  })

  it('every event has a Persian default and critical events have a short SMS text', () => {
    for (const [ev, set] of Object.entries(DEFAULT_TEMPLATES)) expect(set.default, ev).toMatch(/[؀-ۿ]/)
    for (const ev of CRITICAL_EVENTS) expect(DEFAULT_TEMPLATES[ev as keyof typeof DEFAULT_TEMPLATES].sms ?? '', ev).toMatch(/[؀-ۿ]/)
  })

  it('renders with brand/support globals and channel-specific text', () => {
    const t = makeTestApp()
    const n = t.app.services.notifications
    expect(n.render('otp', 'sms', { otp: '12345' })).toContain('12345')
    expect(n.render('otp', 'sms', { otp: '12345' })).toContain('کارتینو')
    expect(n.render('payment.mismatch', 'telegram', { code: 'KT-1' })).toContain('@kartino_support')
    expect(n.render('order.delivered', 'sms', { code: 'KT-1' }).length).toBeLessThan(n.render('order.delivered', 'telegram', { code: 'KT-1', product: 'x' }).length)
    expect(n.render('custom.thing', 'sms', { text: 'hi' })).toBe('hi')
  })

  it('overrides from copy.fa.json (flat keys, aliases, Record wrappers)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hc-copy-'))
    try {
      const path = join(dir, 'copy.fa.json')
      writeFileSync(path, JSON.stringify({
        'notify.order.paid': 'پرداخت {{code}} OK',
        'notify.order.paid.sms': 'SMS {{code}}',
        'notifications.order_expired': { value: 'منقضی {{code}}', as_of: '2026-10-02' },
        'ui.other': 'ignored',
        'notify.order.cancelled': 42,
      }))
      const t = makeTestApp({ appOptions: { copyPath: path } })
      const n = t.app.services.notifications
      expect(n.render('order.paid', 'telegram', { code: 'A' })).toBe('پرداخت A OK')
      expect(n.render('order.paid', 'sms', { code: 'A' })).toBe('SMS A')
      expect(n.render('order.expired', 'in_app', { code: 'B' })).toBe('منقضی B')
      expect(n.templateFor('order.cancelled', 'sms')).toBe(DEFAULT_TEMPLATES['order.cancelled'].default)
      expect(n.loadCopyFile('/no/such/file')).toBe(0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('real data/copy.fa.json', () => {
  it('loads the UX copy (notif.<domain>.<name>.msg|sms|inapp.*, {var} placeholders, aliases)', () => {
    const t = makeTestApp({ dataDir: join(__dirname, '../../../data') })
    const n = t.app.services.notifications
    expect(n.render('otp', 'sms', { code: '12345' })).toMatch(/کد تأیید کارتینو: 12345/)
    expect(n.render('order.delivered', 'telegram', { code: 'KT-1', url: 'https://x' })).toContain('KT-1')
    expect(n.render('order.delivered', 'in_app', { code: 'KT-1' })).toMatch(/^سفارش شما آماده است\n/)
    expect(n.templateFor('order.payReminder', 'telegram')).toBeDefined() // events only the copy file knows
    expect(n.templateFor('payment.underpaid', 'telegram')).toContain('کمتر')
    expect(n.templateFor('btn.pay', 'telegram')).toBeUndefined()
    expect(n.render('order.delivered', 'telegram', { code: 'Z' })).not.toContain('{')
  })

  it('OTP flow uses the copy text and still never stores the clear code', async () => {
    const t = makeTestApp({ dataDir: join(__dirname, '../../../data') })
    await t.app.services.customers.requestOtp(PHONE)
    expect(t.fakes.sms.lastOtp(PHONE)).toBe('12345')
    expect(t.fakes.sms.to(PHONE)[0]?.textFa).toContain('کد تأیید')
    expect(t.app.db.all<{ text: string }>("SELECT text FROM notifications WHERE event = 'otp'")[0]?.text).not.toContain('12345')
  })

  it('order events format {amount}/{time}/{url} for copy-style placeholders', async () => {
    const t = makeTestApp({ dataDir: join(__dirname, '../../../data') })
    const c = mkCustomer(t)
    t.app.services.customers.linkMessenger(c.id, 'telegram', '9')
    const o = mkOrder(t, c.id, mkQuote(t, c.id).id, { code: 'KT-ZZZZZZ' })
    t.app.bus.publish({ type: 'order.created', at: t.clock.now(), orderId: o.id, customerId: c.id, method: 'gateway' })
    await t.app.tick()
    const text = t.fakes.telegram.messagesTo('9')[0]?.textFa ?? ''
    expect(text).toContain('KT-ZZZZZZ')
    expect(text).toContain('۳٬۰۰۰٬۰۰۰ تومان')
    expect(text).not.toMatch(/[{}]/)
  })
})

describe('routing', () => {
  it('customer with Telegram: in-app row + telegram message; no SMS for non-critical', async () => {
    const t = makeTestApp()
    const c = mkCustomer(t)
    t.app.services.customers.linkMessenger(c.id, 'telegram', '777')
    const r = await t.app.services.notifications.notify({ event: 'ticket.reply', customerId: c.id, vars: { subject: 'سلام' } })
    expect(r.ids).toHaveLength(2)
    expect(t.fakes.telegram.messagesTo('777')[0]?.textFa).toContain('سلام')
    expect(t.fakes.sms.sent).toEqual([])
    const rows = t.app.repos.notifications.listForCustomer(c.id).filter((n) => n.event === 'ticket.reply')
    expect(rows.map((n) => `${n.channel}:${n.status}`).sort()).toEqual(['in_app:delivered', 'telegram:sent'])
  })

  it('prefers the requested messenger and Bale when it is the only one', async () => {
    const t = makeTestApp()
    const c = mkCustomer(t)
    t.app.services.customers.linkMessenger(c.id, 'telegram', '1')
    t.app.services.customers.linkMessenger(c.id, 'bale', '2')
    await t.app.services.notifications.notify({ event: 'ticket.reply', customerId: c.id, preferredChannel: 'bale' })
    expect(t.fakes.bale.sent).toHaveLength(1)
    expect(t.fakes.telegram.sent).toHaveLength(0)
    const d = mkCustomer(t, PHONE2)
    t.app.services.customers.linkMessenger(d.id, 'bale', '3')
    await t.app.services.notifications.notify({ event: 'ticket.reply', customerId: d.id })
    expect(t.fakes.bale.messagesTo('3')).toHaveLength(1)
  })

  it('critical event without a messenger goes to SMS; non-critical stays in-app only', async () => {
    const t = makeTestApp()
    const c = mkCustomer(t)
    await t.app.services.notifications.notify({ event: 'order.delivered', customerId: c.id, vars: { code: 'KT-9', product: 'p' } })
    expect(t.fakes.sms.to(PHONE)).toHaveLength(1)
    expect(t.fakes.sms.to(PHONE)[0]?.textFa).toContain('KT-9')
    await t.app.services.notifications.notify({ event: 'ticket.reply', customerId: c.id })
    expect(t.fakes.sms.to(PHONE)).toHaveLength(1)
  })

  it('critical event fails over: telegram → bale → sms, one row per attempt', async () => {
    const t = makeTestApp()
    const c = mkCustomer(t)
    t.app.services.customers.linkMessenger(c.id, 'telegram', '1')
    t.app.services.customers.linkMessenger(c.id, 'bale', '2')
    t.fakes.telegram.fail('sendMessage', portError('UNAVAILABLE', 'tg down'))
    t.fakes.bale.fail('sendMessage', portError('TIMEOUT', 'bale down'))
    const r = await t.app.services.notifications.notify({ event: 'order.paid', customerId: c.id, vars: { code: 'KT-1' } })
    expect(t.fakes.sms.to(PHONE)).toHaveLength(1)
    const rows = t.app.repos.notifications.listByGroup(t.app.repos.notifications.get(r.ids[0]!)!.groupId)
    expect(rows.map((n) => `${n.channel}:${n.status}`)).toEqual(['in_app:delivered', 'telegram:failed', 'bale:failed', 'sms:sent'])
  })

  it('direct phone (no customer) → SMS only; unknown customer is reported, never thrown', async () => {
    const t = makeTestApp()
    const r = await t.app.services.notifications.notify({ event: 'kyc.pending', phone: '09120000000' })
    expect(r.ids).toHaveLength(1)
    expect(t.fakes.sms.to('09120000000')).toHaveLength(1)
    const bad = await t.app.services.notifications.notify({ event: 'kyc.pending', customerId: 'ghost' })
    expect(bad.ids).toEqual([])
    expect(bad.error).toMatch(/not found/)
  })

  it('dedupeKey suppresses repeats', async () => {
    const t = makeTestApp()
    const c = mkCustomer(t)
    const a = await t.app.services.notifications.notify({ event: 'order.expired', customerId: c.id, dedupeKey: 'k1', vars: { code: 'X' } })
    const b = await t.app.services.notifications.notify({ event: 'order.expired', customerId: c.id, dedupeKey: 'k1', vars: { code: 'X' } })
    expect(a.ids.length).toBeGreaterThan(0)
    expect(b).toEqual({ ids: [], skipped: true })
  })

  it('in-app inbox: unread count and mark read', async () => {
    const t = makeTestApp()
    const c = mkCustomer(t)
    const n = t.app.services.notifications
    await n.notify({ event: 'ticket.reply', customerId: c.id })
    await n.notify({ event: 'ticket.reply', customerId: c.id })
    const before = n.unreadCount(c.id)
    expect(before).toBeGreaterThanOrEqual(2) // + welcome
    const first = n.listForCustomer(c.id, { channel: 'in_app' })[0]!
    expect(n.markRead(c.id, [first.id])).toBe(1)
    expect(n.unreadCount(c.id)).toBe(before - 1)
    n.markRead(c.id)
    expect(n.unreadCount(c.id)).toBe(0)
  })
})

describe('retry queue', () => {
  it('non-critical retryable failures back off, then succeed via retryDue()', async () => {
    const t = makeTestApp()
    const c = mkCustomer(t)
    t.app.services.customers.linkMessenger(c.id, 'telegram', '1')
    t.fakes.telegram.fail('sendMessage', portError('UNAVAILABLE', 'down'), 2)
    const n = t.app.services.notifications
    const { ids } = await n.notify({ event: 'ticket.reply', customerId: c.id })
    const tgId = ids.find((i) => t.app.repos.notifications.get(i)?.channel === 'telegram')!
    expect(t.app.repos.notifications.get(tgId)).toMatchObject({ status: 'retry', attempts: 1, nextAttemptAt: t.clock.now() + RETRY_BACKOFF_MS[0] })
    expect((await n.retryDue()).sent).toBe(0) // not due yet
    t.advance(RETRY_BACKOFF_MS[0])
    expect(await n.retryDue()).toMatchObject({ retrying: 1, sent: 0 })
    expect(t.app.repos.notifications.get(tgId)).toMatchObject({ status: 'retry', attempts: 2 })
    t.advance(RETRY_BACKOFF_MS[1])
    expect((await n.retryDue()).sent).toBe(1)
    expect(t.app.repos.notifications.get(tgId)?.status).toBe('sent')
    expect(t.fakes.telegram.sent).toHaveLength(1)
  })

  it('gives up after the maximum number of attempts and for non-retryable errors', async () => {
    const t = makeTestApp()
    const c = mkCustomer(t)
    t.app.services.customers.linkMessenger(c.id, 'telegram', '1')
    t.fakes.telegram.fail('sendMessage', portError('UNAVAILABLE', 'down'), 100)
    const n = t.app.services.notifications
    const { ids } = await n.notify({ event: 'ticket.reply', customerId: c.id })
    const tgId = ids.find((i) => t.app.repos.notifications.get(i)?.channel === 'telegram')!
    for (let i = 0; i < MAX_NOTIFICATION_ATTEMPTS; i++) {
      t.advance(RETRY_BACKOFF_MS[RETRY_BACKOFF_MS.length - 1]!)
      await n.retryDue()
    }
    expect(t.app.repos.notifications.get(tgId)).toMatchObject({ status: 'failed', attempts: MAX_NOTIFICATION_ATTEMPTS })
    t.fakes.telegram.failures.clear()
    t.fakes.telegram.fail('sendMessage', portError('REJECTED', 'blocked by user'))
    const { ids: ids2 } = await n.notify({ event: 'ticket.reply', customerId: c.id })
    const id2 = ids2.find((i) => t.app.repos.notifications.get(i)?.channel === 'telegram')!
    expect(t.app.repos.notifications.get(id2)).toMatchObject({ status: 'failed', attempts: 1 })
  })

  it('never throws into the caller even if a port throws', async () => {
    const t = makeTestApp()
    const c = mkCustomer(t)
    t.app.services.customers.linkMessenger(c.id, 'telegram', '1')
    t.fakes.telegram.sendMessage = async () => {
      throw new Error('boom')
    }
    await expect(t.app.services.notifications.notify({ event: 'ticket.reply', customerId: c.id })).resolves.toBeDefined()
    expect(t.app.repos.notifications.countByStatus().failed).toBe(1)
  })

  it('records SMS costs for the ledger hook', async () => {
    const t = makeTestApp()
    const costs: { kind: string; costIrt: number }[] = []
    t.app.costs.subscribe((e) => costs.push(e))
    await t.app.services.customers.requestOtp(PHONE)
    await t.app.services.notifications.notify({ event: 'kyc.pending', phone: PHONE2 })
    expect(costs).toEqual([{ kind: 'sms', costIrt: 300, at: t.clock.now(), ref: 'sms-1' }, { kind: 'sms', costIrt: 300, at: t.clock.now(), customerId: undefined, ref: 'sms-2' }].map((x) => expect.objectContaining({ kind: x.kind, costIrt: x.costIrt })))
  })
})

describe('domain event wiring + dispatch job', () => {
  it('order events enqueue notifications; the notifications.dispatch job sends them', async () => {
    const t = makeTestApp()
    const c = mkCustomer(t)
    t.app.services.customers.linkMessenger(c.id, 'telegram', '55')
    const o = mkOrder(t, c.id, mkQuote(t, c.id).id, { code: 'KT-AAAAAA' })
    t.app.bus.publish({ type: 'order.created', at: t.clock.now(), orderId: o.id, customerId: c.id, method: 'gateway' })
    t.app.bus.publish({ type: 'payment.confirmed', at: t.clock.now(), orderId: o.id, paymentId: 'p1', amount: 1, currency: 'IRT' })
    t.app.bus.publish({ type: 'order.status_changed', at: t.clock.now(), orderId: o.id, from: 'fulfilling', to: 'delivered' })
    t.app.bus.publish({ type: 'order.status_changed', at: t.clock.now(), orderId: o.id, from: 'fulfilling', to: 'delivered' }) // duplicate → deduped
    expect(t.fakes.telegram.sent).toHaveLength(0) // outbox: nothing sent synchronously
    await t.app.tick()
    const texts = t.fakes.telegram.messagesTo('55').map((m) => m.textFa)
    expect(texts).toHaveLength(3)
    expect(texts[0]).toContain('KT-AAAAAA')
    expect(texts[0]).toContain('گیفت‌کارت استیم')
    expect(texts[1]).toContain('تأیید شد')
    expect(texts[2]).toContain('تحویل شد')
  })

  it('wiring can be disabled', async () => {
    const t = makeTestApp({ appOptions: { wireNotifications: false } })
    const c = mkCustomer(t)
    const o = mkOrder(t, c.id, mkQuote(t, c.id).id)
    t.app.bus.publish({ type: 'order.created', at: 0, orderId: o.id, customerId: c.id, method: 'gateway' })
    expect(t.app.repos.notifications.listForCustomer(c.id).some((n) => n.event === 'order.created')).toBe(false)
    expect(MS.minute).toBe(60_000)
  })
})
