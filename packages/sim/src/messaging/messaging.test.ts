import { describe, expect, it } from 'vitest'
import { MS } from '@hiclaude/contracts'
import { makeEnv } from '../core/testkit'
import { MessengerSim } from './messenger'
import { SmsSim } from './sms'
import { IdentitySim } from './identity'

const mk = (ch: 'telegram' | 'bale' = 'telegram', cfg = {}) => {
  const env = makeEnv({ seed: 3 })
  return { env, m: new MessengerSim(env, env.rng.fork('m'), ch, { failureProb: 0, blockedProb: 0, ...cfg }) }
}

describe('MessengerSim', () => {
  it('records messages and notifies listeners', async () => {
    const { m } = mk()
    const seen: string[] = []
    m.onMessage((x) => seen.push(x.textFa))
    const r = await m.sendMessage({ chatId: '42', textFa: 'سلام', buttons: [[{ textFa: 'باز کردن', webAppUrl: 'https://x' }]] })
    expect(r.ok).toBe(true)
    expect(m.messagesTo('42')[0]?.textFa).toBe('سلام')
    expect(seen).toEqual(['سلام'])
    expect(m.allMessages().length).toBe(1)
  })
  it('verifies the fake initData format and rejects garbage', () => {
    const { m, env } = mk()
    const v = m.verifyInitData('sim:12345:1790000000:Ali:ali_x')
    expect(v.ok && v.value).toEqual({ userId: '12345', firstName: 'Ali', username: 'ali_x', authDate: 1_790_000_000_000 })
    const ms = m.verifyInitData('sim:9:1790000000000')
    expect(ms.ok && ms.value.authDate).toBe(1_790_000_000_000)
    for (const bad of ['', 'x:1:2', 'sim:abc:1790000000', 'sim:1', 'sim:1:0', 'sim:1:2:3:4:5']) expect(m.verifyInitData(bad).ok).toBe(false)
    const made = m.makeInitData('77', env.clock.now(), { firstName: 'علی', username: 'a' })
    const back = m.verifyInitData(made)
    expect(back.ok && back.value.userId).toBe('77')
    expect(back.ok && back.value.firstName).toBe('علی')
    expect(back.ok && Math.abs(back.value.authDate - env.clock.now())).toBeLessThan(1000)
  })
  it('blocked chat is rejected permanently', async () => {
    const { m } = mk()
    m.blockBot('9')
    const r = await m.sendMessage({ chatId: '9', textFa: 'x' })
    expect(!r.ok && r.error.code).toBe('REJECTED')
    expect(!r.ok && r.error.retryable).toBe(false)
    m.unblockBot('9')
    expect((await m.sendMessage({ chatId: '9', textFa: 'x' })).ok).toBe(true)
  })
  it('first-contact block probability', async () => {
    const { m } = mk('telegram', { blockedProb: 0.3, globalPerSecond: 100000 })
    let blocked = 0
    for (let i = 0; i < 400; i++) if (!(await m.sendMessage({ chatId: `c${i}`, textFa: 'x' })).ok) blocked++
    expect(blocked).toBeGreaterThan(80)
    expect(blocked).toBeLessThan(160)
  })
  it('per-chat and global rate limits recover with time', async () => {
    const { m, env } = mk('bale', { perChatPerMinute: 3, globalPerSecond: 5 })
    for (let i = 0; i < 3; i++) expect((await m.sendMessage({ chatId: 'a', textFa: 'x' })).ok).toBe(true)
    const r = await m.sendMessage({ chatId: 'a', textFa: 'x' })
    expect(!r.ok && r.error.code).toBe('RATE_LIMITED')
    env.sim.runUntil(env.clock.now() + MS.minute + 1)
    expect((await m.sendMessage({ chatId: 'a', textFa: 'x' })).ok).toBe(true)
    for (let i = 0; i < 5; i++) await m.sendMessage({ chatId: `g${i}`, textFa: 'x' })
    const g = await m.sendMessage({ chatId: 'gX', textFa: 'x' })
    expect(!g.ok && g.error.code).toBe('RATE_LIMITED')
  })
  it('validation and failure probability', async () => {
    const { m } = mk('telegram', { failureProb: 1 })
    expect((await m.sendMessage({ chatId: '', textFa: 'x' })).ok).toBe(false)
    const r = await m.sendMessage({ chatId: '1', textFa: 'x' })
    expect(!r.ok && r.error.code).toBe('UNAVAILABLE')
  })
  it('internet shutdown takes Telegram down but not Bale; revert restores', async () => {
    const tg = mk('telegram')
    const bale = mk('bale')
    const h = tg.m.applyEvent('internet_shutdown', {})
    expect(bale.m.applyEvent('internet_shutdown', {})).toBeNull()
    const r = await tg.m.sendMessage({ chatId: '1', textFa: 'x' })
    expect(!r.ok && r.error.code).toBe('UNAVAILABLE')
    expect((await bale.m.sendMessage({ chatId: '1', textFa: 'x' })).ok).toBe(true)
    h?.revert()
    expect((await tg.m.sendMessage({ chatId: '1', textFa: 'x' })).ok).toBe(true)
  })
  it('telegram_filter marks messages as not delivered', async () => {
    const { m } = mk('telegram')
    m.applyEvent('telegram_filter', { lossProb: 1 })
    await m.sendMessage({ chatId: '1', textFa: 'x' })
    expect(m.messagesTo('1')[0]?.delivered).toBe(false)
  })
  it('timed outage ends by itself', async () => {
    const { m, env } = mk()
    m.applyEvent('messenger_outage', { hours: 1 })
    expect((await m.sendMessage({ chatId: '1', textFa: 'x' })).ok).toBe(false)
    env.sim.runUntil(env.clock.now() + 2 * MS.hour)
    expect((await m.sendMessage({ chatId: '1', textFa: 'x' })).ok).toBe(true)
  })
})

describe('SmsSim', () => {
  const mkSms = (cfg = {}) => {
    const env = makeEnv({ seed: 4 })
    return { env, s: new SmsSim(env, env.rng.fork('sms'), { failureProb: 0, silentLossProb: 0, ...cfg }) }
  }
  it('charges a cost and delivers after a delay (not instantly)', async () => {
    const { s, env } = mkSms()
    const got: number[] = []
    s.onDeliver((r) => got.push(r.deliverAt as number))
    const r = await s.send({ phone: '09120000000', textFa: 'کد: 123456', template: 'otp' })
    expect(r.ok && r.value.costIrt).toBe(120)
    expect(s.inbox('09120000000').length).toBe(0)
    env.sim.runUntil(env.clock.now() + 10 * 60_000)
    expect(s.inbox('09120000000').length).toBe(1)
    expect(got.length).toBe(1)
    expect(s.totalCostIrt()).toBe(120)
  })
  it('validates phone numbers and rate limits per number', async () => {
    const { s } = mkSms({ perPhonePerHour: 2 })
    expect((await s.send({ phone: '123', textFa: 'x' })).ok).toBe(false)
    await s.send({ phone: '09121111111', textFa: 'x' })
    await s.send({ phone: '09121111111', textFa: 'x' })
    const r = await s.send({ phone: '09121111111', textFa: 'x' })
    expect(!r.ok && r.error.code).toBe('RATE_LIMITED')
    expect((await s.send({ phone: '09122222222', textFa: 'x' })).ok).toBe(true)
  })
  it('failure and silent loss rates', async () => {
    const { s, env } = mkSms({ failureProb: 0.2, silentLossProb: 0.3, perPhonePerHour: 100000 })
    let fail = 0
    for (let i = 0; i < 500; i++) if (!(await s.send({ phone: `0912${String(i).padStart(7, '0')}`, textFa: 'x' })).ok) fail++
    env.sim.runUntil(env.clock.now() + MS.hour)
    expect(fail).toBeGreaterThan(70)
    expect(fail).toBeLessThan(130)
    const recs = s.allRecords()
    const lost = recs.filter((r) => r.deliverAt === undefined).length
    expect(lost / recs.length).toBeGreaterThan(0.2)
    expect(lost / recs.length).toBeLessThan(0.4)
    expect(s.totalCostIrt()).toBe(recs.length * 120) // lost ones are still charged
  })
  it('delay event multiplies latency; outage blocks', async () => {
    const a = mkSms()
    const b = mkSms()
    b.s.applyEvent('sms_delay', { multiplier: 100 })
    const lat = async (x: ReturnType<typeof mkSms>) => {
      const ds: number[] = []
      for (let i = 0; i < 50; i++) {
        await x.s.send({ phone: `0913${String(i).padStart(7, '0')}`, textFa: 'x' })
      }
      for (const r of x.s.allRecords()) ds.push((r.deliverAt as number) - r.sentAt)
      return ds.sort((p, q) => p - q)[25] as number
    }
    expect(await lat(b)).toBeGreaterThan((await lat(a)) * 20)
    const h = a.s.applyEvent('sms_outage', {})
    const r = await a.s.send({ phone: '09120000001', textFa: 'x' })
    expect(!r.ok && r.error.code).toBe('UNAVAILABLE')
    h?.revert()
    expect((await a.s.send({ phone: '09120000001', textFa: 'x' })).ok).toBe(true)
  })
  it('price change', async () => {
    const { s } = mkSms()
    const h = s.applyEvent('sms_price_change', { costIrt: 300 })
    const r = await s.send({ phone: '09120000000', textFa: 'x' })
    expect(r.ok && r.value.costIrt).toBe(300)
    h?.revert()
  })
})

describe('IdentitySim', () => {
  const mkId = (cfg = {}) => {
    const env = makeEnv({ seed: 5 })
    return new IdentitySim(env, env.rng.fork('id'), { failureProb: 0, ...cfg })
  }
  it('matches registered phone/card and rejects mismatches (deterministically)', async () => {
    const id = mkId({ truePositiveProb: 1, falsePositiveProb: 0 })
    id.registerPerson({ nationalId: '0012345678', phones: ['09120000000'], cards: [{ pan: '6037991234567890', ownerName: 'Ali Rezaei' }] })
    const a = await id.shahkar({ nationalId: '0012345678', phone: '09120000000' })
    expect(a.ok && a.value.match).toBe(true)
    expect(a.ok && a.value.costIrt).toBe(1500)
    const b = await id.shahkar({ nationalId: '0012345678', phone: '09129999999' })
    expect(b.ok && b.value.match).toBe(false)
    const c = await id.cardOwner({ cardPan: '6037991234567890', nationalId: '0012345678' })
    expect(c.ok && c.value.match).toBe(true)
    expect(c.ok && c.value.ownerNameMasked).toMatch(/^A\*+$/)
    const d = await id.cardOwner({ cardPan: '6037990000000001', nationalId: '0012345678' })
    expect(d.ok && d.value.match).toBe(false)
    expect(await id.shahkar({ nationalId: '0012345678', phone: '09129999999' })).toEqual(b)
    expect(id.totalSpentIrt()).toBe(1500 * 3 + 2000 * 2)
  })
  it('vendor error rates produce occasional wrong answers; same query is stable', async () => {
    const id = mkId({ truePositiveProb: 0.9, falsePositiveProb: 0.1 })
    let tp = 0
    let fp = 0
    for (let i = 0; i < 400; i++) {
      const nid = String(1000000000 + i)
      id.registerPerson({ nationalId: nid, phones: [`0912${String(i).padStart(7, '0')}`] })
      const t = await id.shahkar({ nationalId: nid, phone: `0912${String(i).padStart(7, '0')}` })
      const f = await id.shahkar({ nationalId: nid, phone: '09350000000' })
      if (t.ok && t.value.match) tp++
      if (f.ok && f.value.match) fp++
    }
    expect(tp / 400).toBeGreaterThan(0.85)
    expect(tp / 400).toBeLessThan(0.95)
    expect(fp / 400).toBeGreaterThan(0.05)
    expect(fp / 400).toBeLessThan(0.16)
  })
  it('unknown national ids use unknownMatchProb; validation; outage', async () => {
    const id = mkId({ unknownMatchProb: 1 })
    const r = await id.shahkar({ nationalId: '1111111111', phone: '09120000000' })
    expect(r.ok && r.value.match).toBe(true)
    expect((await id.shahkar({ nationalId: '12', phone: '09120000000' })).ok).toBe(false)
    expect((await id.shahkar({ nationalId: '1111111111', phone: '12' })).ok).toBe(false)
    expect((await id.cardOwner({ cardPan: '12', nationalId: '1111111111' })).ok).toBe(false)
    const h = id.applyEvent('identity_outage', {})
    const o = await id.shahkar({ nationalId: '1111111111', phone: '09120000000' })
    expect(!o.ok && o.error.code).toBe('UNAVAILABLE')
    h?.revert()
    expect((await id.shahkar({ nationalId: '1111111111', phone: '09120000000' })).ok).toBe(true)
  })
  it('price change event', async () => {
    const id = mkId()
    const h = id.applyEvent('identity_price_change', { shahkarCostIrt: 5000 })
    const r = await id.shahkar({ nationalId: '1111111111', phone: '09120000000' })
    expect(r.ok && r.value.costIrt).toBe(5000)
    h?.revert()
    expect(id.lookupCount()).toBe(1)
  })
})
