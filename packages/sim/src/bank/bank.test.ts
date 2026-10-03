import { describe, expect, it } from 'vitest'
import { MS, fromIrst } from '@hiclaude/contracts'
import { makeEnv } from '../core/testkit'
import { BankSim, defaultBankConfig } from './bank'

function setup(cfgPatch: (c: ReturnType<typeof defaultBankConfig>) => void = () => undefined, start = fromIrst(2026, 10, 3, 9)) {
  const env = makeEnv({ start, seed: 4 })
  const cfg = defaultBankConfig()
  cfg.openingBalanceIrt = 100_000_000
  cfgPatch(cfg)
  const bank = new BankSim(env, env.rng.fork('bank'), cfg)
  return { env, bank }
}

describe('BankSim credits', () => {
  it('c2c credit appears on the statement and the balance after a short delay', async () => {
    const { env, bank } = setup((c) => {
      c.c2c.lateProb = 0
    })
    const r = bank.injectCustomerTransfer({ amountIrt: 1_000_000, senderCardMasked: '6037****1234', destinationCardId: 'card-1' })
    expect(r.accepted).toBe(true)
    env.sim.runUntil(env.clock.now() + 5 * MS.minute)
    const list = await bank.listCredits({ since: 0 })
    expect(list.ok && list.value.length).toBe(1)
    expect(list.ok && list.value[0]?.amountIrt).toBe(1_000_000)
    expect(list.ok && list.value[0]?.channel).toBe('card_to_card')
    expect(list.ok && list.value[0]?.destinationCardId).toBe('card-1')
    const bal = await bank.balance()
    expect(bal.ok && bal.value).toBe(101_000_000)
  })
  it('sender card daily cap rejects, resets next IRST day, and is per card', () => {
    const { env, bank } = setup((c) => {
      c.c2c.perSenderCardDailyCapIrt = 15_000_000
    })
    expect(bank.injectCustomerTransfer({ amountIrt: 10_000_000, senderCardMasked: 'A', destinationCardId: 'c' }).accepted).toBe(true)
    const over = bank.injectCustomerTransfer({ amountIrt: 6_000_000, senderCardMasked: 'A', destinationCardId: 'c' })
    expect(over.accepted).toBe(false)
    expect(over.reason).toBe('SENDER_DAILY_CAP')
    expect(bank.injectCustomerTransfer({ amountIrt: 6_000_000, senderCardMasked: 'B', destinationCardId: 'c' }).accepted).toBe(true)
    env.sim.runUntil(env.clock.now() + MS.day)
    expect(bank.injectCustomerTransfer({ amountIrt: 6_000_000, senderCardMasked: 'A', destinationCardId: 'c' }).accepted).toBe(true)
  })
  it('destination card daily cap', () => {
    const { bank } = setup((c) => {
      c.c2c.perDestCardDailyCapIrt = 5_000_000
    })
    expect(bank.injectCustomerTransfer({ amountIrt: 4_000_000, senderCardMasked: 'A', destinationCardId: 'c1' }).accepted).toBe(true)
    const r = bank.injectCustomerTransfer({ amountIrt: 2_000_000, senderCardMasked: 'B', destinationCardId: 'c1' })
    expect(r.reason).toBe('DEST_DAILY_CAP')
    expect(bank.injectCustomerTransfer({ amountIrt: 2_000_000, senderCardMasked: 'B', destinationCardId: 'c2' }).accepted).toBe(true)
  })
  it('below minimum and invalid amounts are rejected', () => {
    const { bank } = setup()
    expect(bank.injectCustomerTransfer({ amountIrt: 10, senderCardMasked: 'A' }).reason).toBe('BELOW_MIN')
    expect(bank.injectCustomerTransfer({ amountIrt: 1.5, senderCardMasked: 'A' }).reason).toBe('VALIDATION')
  })
  it('late posting: the line is invisible until postedAt, keeps its earlier `at`, and a since-cursor at poll time misses it', async () => {
    const { env, bank } = setup((c) => {
      c.c2c.lateProb = 1
      c.c2c.lateMinMinutes = 60
      c.c2c.lateMaxMinutes = 60
    })
    const t0 = env.clock.now()
    const r = bank.injectCustomerTransfer({ amountIrt: 2_000_000, senderCardMasked: 'A' })
    expect(r.postedAt).toBeGreaterThanOrEqual(t0 + 60 * MS.minute)
    env.sim.runUntil(t0 + 30 * MS.minute)
    expect((await bank.listCredits({ since: 0 })).ok && (await bank.listCredits({ since: 0 })).ok).toBe(true)
    const early = await bank.listCredits({ since: 0 })
    expect(early.ok && early.value.length).toBe(0)
    const pollCursor = env.clock.now() // naive app cursor
    env.sim.runUntil(t0 + 90 * MS.minute)
    const naive = await bank.listCredits({ since: pollCursor })
    expect(naive.ok && naive.value.length).toBe(0) // missed: at < cursor
    const overlap = await bank.listCredits({ since: t0 })
    expect(overlap.ok && overlap.value.length).toBe(1)
  })
  it('duplicated statement lines repeat the same ref but are not double counted in the balance', async () => {
    const { env, bank } = setup((c) => {
      c.duplicateProb = 1
      c.c2c.lateProb = 0
    })
    bank.injectCustomerTransfer({ amountIrt: 1_000_000, senderCardMasked: 'A' })
    env.sim.runUntil(env.clock.now() + MS.minute)
    const list = await bank.listCredits({ since: 0 })
    expect(list.ok && list.value.length).toBe(2)
    expect(list.ok && list.value[0]?.ref).toBe(list.ok && list.value[1]?.ref)
    const bal = await bank.balance()
    expect(bal.ok && bal.value).toBe(101_000_000)
  })
  it('listCredits is ordered by time and filters by since', async () => {
    const { env, bank } = setup((c) => {
      c.c2c.lateProb = 0
    })
    for (let i = 0; i < 5; i++) {
      bank.injectCustomerTransfer({ amountIrt: 100_000 * (i + 1), senderCardMasked: `S${i}` })
      env.sim.runUntil(env.clock.now() + 10 * MS.minute)
    }
    const all = await bank.listCredits({ since: 0 })
    expect(all.ok && all.value.map((c) => c.amountIrt)).toEqual([100_000, 200_000, 300_000, 400_000, 500_000])
    const part = await bank.listCredits({ since: env.clock.now() - 35 * MS.minute })
    expect(part.ok && part.value.length).toBe(3)
  })
  it('paya inbound credits at the next cycle', async () => {
    const { env, bank } = setup(undefined, fromIrst(2026, 10, 3, 9))
    const r = bank.injectCustomerTransfer({ amountIrt: 50_000_000, senderCardMasked: 'IBAN', channel: 'paya' })
    expect(r.postedAt).toBe(fromIrst(2026, 10, 3, 10))
    env.sim.runUntil(fromIrst(2026, 10, 3, 9, 59))
    expect((await bank.balance()).ok && (await bank.balance()).ok).toBe(true)
    const b1 = await bank.balance()
    expect(b1.ok && b1.value).toBe(100_000_000)
    env.sim.runUntil(fromIrst(2026, 10, 3, 10, 1))
    const b2 = await bank.balance()
    expect(b2.ok && b2.value).toBe(150_000_000)
  })
})

describe('BankSim transfers out', () => {
  it('Paya settles at the cycle, debits immediately incl. fee, and records the transfer', async () => {
    const { bank } = setup()
    const r = await bank.transferOut({ toIban: 'IR1', amountIrt: 10_000_000, reason: 'exchange deposit' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.settleAt).toBe(fromIrst(2026, 10, 3, 10)) // 09:00 request + 30 min processing <= 10:00 cycle
    expect(r.value.feeIrt).toBe(1_500)
    const bal = await bank.balance()
    expect(bal.ok && bal.value).toBe(100_000_000 - 10_000_000 - 1_500)
    expect(bank.outgoingTransfers().length).toBe(1)
  })
  it('requested on Friday settles Saturday; Thursday afternoon settles Saturday', async () => {
    const fri = setup(undefined, fromIrst(2026, 10, 2, 11))
    const r1 = await fri.bank.transferOut({ toIban: 'IR1', amountIrt: 1_000_000, reason: 'x' })
    expect(r1.ok && r1.value.settleAt).toBe(fromIrst(2026, 10, 3, 10))
    const thu = setup(undefined, fromIrst(2026, 10, 1, 14))
    const r2 = await thu.bank.transferOut({ toIban: 'IR1', amountIrt: 1_000_000, reason: 'x' })
    expect(r2.ok && r2.value.settleAt).toBe(fromIrst(2026, 10, 3, 10))
  })
  it('amounts above the Paya limit use Satna with a bounded percentage fee', async () => {
    const { bank } = setup((c) => {
      c.openingBalanceIrt = 5_000_000_000
    })
    const r = bank.transferOutSync({ toIban: 'IR1', amountIrt: 500_000_000, reason: 'big' })
    expect(r.ok && r.value.channel).toBe('satna')
    expect(r.ok && r.value.feeIrt).toBe(30_000)
    const small = bank.transferOutSync({ toIban: 'IR1', amountIrt: 100_000_000, reason: 'edge' })
    expect(small.ok && small.value.channel).toBe('paya')
  })
  it('insufficient funds and validation errors', async () => {
    const { bank } = setup()
    const r = await bank.transferOut({ toIban: 'IR1', amountIrt: 1_000_000_000, reason: 'x' })
    expect(!r.ok && r.error.code).toBe('INSUFFICIENT_FUNDS')
    const v = await bank.transferOut({ toIban: 'IR1', amountIrt: -5, reason: 'x' })
    expect(!v.ok && v.error.code).toBe('VALIDATION')
  })
  it('gateway settlement and capital credits are visible with the right channel', async () => {
    const { env, bank } = setup()
    bank.creditGatewaySettlement({ amountIrt: 7_000_000, at: env.clock.now() + MS.hour, gatewayId: 'zarinpal', batchRef: 'b1' })
    bank.creditExternal({ amountIrt: 3_000_000, note: 'capital' })
    expect(bank.balanceNow()).toBe(103_000_000)
    env.sim.runUntil(env.clock.now() + 2 * MS.hour)
    const l = await bank.listCredits({ since: 0 })
    expect(l.ok && l.value.map((c) => c.channel).sort()).toEqual(['gateway_settlement', 'other'])
    expect(bank.balanceNow()).toBe(110_000_000)
  })
  it('outage makes calls unavailable and revert restores service', async () => {
    const { bank } = setup()
    const h = bank.applyEvent('bank_outage', { hours: 3 })
    const r = await bank.balance()
    expect(!r.ok && r.error.code).toBe('UNAVAILABLE')
    expect((await bank.listCredits({ since: 0 })).ok).toBe(false)
    expect(bank.transferOutSync({ toIban: 'x', amountIrt: 1000, reason: 'r' }).ok).toBe(false)
    h?.revert()
    expect((await bank.balance()).ok).toBe(true)
  })
  it('outage delays visibility of c2c credits until the bank is back', async () => {
    const { env, bank } = setup((c) => {
      c.c2c.lateProb = 0
    })
    bank.applyEvent('bank_outage', { hours: 2 })
    const r = bank.injectCustomerTransfer({ amountIrt: 1_000_000, senderCardMasked: 'A' })
    expect(r.postedAt).toBeGreaterThanOrEqual(env.clock.now() + 2 * MS.hour)
  })
  it('audit identity holds across mixed activity', async () => {
    const { env, bank } = setup((c) => {
      c.openingBalanceIrt = 1_000_000_000
    })
    for (let i = 0; i < 40; i++) {
      bank.injectCustomerTransfer({ amountIrt: 1_000_000 + i, senderCardMasked: `S${i % 7}` })
      if (i % 3 === 0) bank.transferOutSync({ toIban: 'IR', amountIrt: 2_000_000 + i, reason: 'r' })
      env.sim.runUntil(env.clock.now() + 17 * MS.minute)
    }
    env.sim.runUntil(env.clock.now() + 2 * MS.day)
    const a = bank.audit()
    expect(a.ok).toBe(true)
    expect(a.pending).toBe(0)
  })
  it('is deterministic for equal seeds', async () => {
    const run = async () => {
      const { env, bank } = setup()
      for (let i = 0; i < 10; i++) bank.injectCustomerTransfer({ amountIrt: 100_000 + i, senderCardMasked: 'A' })
      env.sim.runUntil(env.clock.now() + MS.day)
      return env.log.hash() + JSON.stringify(bank.statement())
    }
    expect(await run()).toBe(await run())
  })
})
