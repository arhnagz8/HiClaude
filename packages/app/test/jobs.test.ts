import { ManualClock, MS, fromIrst, jalaliOf, toGregorian } from '@hiclaude/contracts'
import { describe, expect, it } from 'vitest'
import { sha256Hex, Database, JobRunner, createRepos, dueSlot, migrate } from '../src'
import { AlertService } from '../src/services/alerts'
import { createIdGen, createEventBus } from '@hiclaude/contracts'
import { makeTestApp } from './helpers'

function mk(start = fromIrst(2026, 10, 2, 12, 0)) {
  const clock = new ManualClock(start)
  const db = Database.open()
  migrate(db, 0)
  const repos = createRepos(db)
  const alerts = new AlertService({ clock, ids: createIdGen(), repos, bus: createEventBus(), logger: { debug() {}, info() {}, warn() {}, error() {} } })
  const runner = new JobRunner({ clock, state: repos.jobsState, alerts })
  return { clock, db, repos, runner, alerts }
}

describe('JobRunner — interval jobs', () => {
  it('runs once per slot, in registration order, and not twice for the same instant', async () => {
    const { clock, runner } = mk()
    const log: string[] = []
    runner.register({ name: 'a', intervalMs: MS.minute, handler: () => void log.push('a') })
    runner.register({ name: 'b', intervalMs: 5 * MS.minute, handler: () => void log.push('b') })
    await runner.tick()
    await runner.tick() // same instant
    expect(log).toEqual(['a', 'b'])
    clock.advance(30_000)
    await runner.tick()
    expect(log).toEqual(['a', 'b'])
    clock.advance(30_000)
    await runner.tick()
    expect(log).toEqual(['a', 'b', 'a'])
    for (let i = 0; i < 4; i++) {
      clock.advance(MS.minute)
      await runner.tick()
    }
    expect(log.filter((x) => x === 'b')).toHaveLength(2)
    expect(log.filter((x) => x === 'a')).toHaveLength(6)
  })

  it('catch-up: a long pause runs the job once and skips the missed intervals', async () => {
    const { clock, runner } = mk()
    let n = 0
    runner.register({ name: 'x', intervalMs: MS.minute, handler: () => void n++ })
    await runner.tick()
    clock.advance(3 * MS.hour)
    await runner.tick()
    expect(n).toBe(2)
    expect(runner.state('x')).toMatchObject({ runs: 2, lastRunAt: clock.now() })
  })

  it('persists state, records failures, raises a deduped alert and keeps going', async () => {
    const { clock, runner, repos } = mk()
    runner.register({ name: 'bad', intervalMs: MS.minute, handler: () => { throw new Error('kaboom') } })
    runner.register({ name: 'good', intervalMs: MS.minute, handler: () => undefined })
    const r1 = await runner.tick()
    expect(r1).toEqual([{ name: 'bad', ran: true, ok: false, error: 'Error: kaboom' }, { name: 'good', ran: true, ok: true, error: undefined }])
    clock.advance(MS.minute)
    await runner.tick()
    expect(runner.state('bad')).toMatchObject({ runs: 2, failures: 2, lastError: 'Error: kaboom' })
    expect(runner.state('good')).toMatchObject({ runs: 2, failures: 0, lastOkAt: clock.now() })
    const alerts = repos.alerts.list()
    expect(alerts).toHaveLength(1) // deduped
    expect(alerts[0]).toMatchObject({ code: 'job.failed:bad', count: 2 })
  })

  it('handles async handlers and serialises overlapping ticks', async () => {
    const { clock, runner } = mk()
    let running = 0
    let max = 0
    runner.register({
      name: 'slow',
      intervalMs: MS.minute,
      handler: async () => {
        running++
        max = Math.max(max, running)
        await new Promise((r) => setTimeout(r, 10))
        running--
      },
    })
    const p1 = runner.tick()
    clock.advance(MS.minute)
    const p2 = runner.tick()
    await Promise.all([p1, p2])
    expect(max).toBe(1)
    expect(runner.state('slow')?.runs).toBe(2)
  })

  it('runNow ignores the schedule and does not consume the slot; disabled jobs are skipped', async () => {
    const { runner } = mk()
    let n = 0
    runner.register({ name: 'm', intervalMs: MS.hour, handler: () => void n++ })
    await runner.runNow('m')
    expect(n).toBe(1)
    await runner.tick()
    expect(n).toBe(2) // scheduled slot still pending
    runner.setEnabled('m', false)
    await runner.tick()
    expect(n).toBe(2)
    await expect(runner.runNow('ghost')).rejects.toThrow(/not registered/)
  })

  it('lagMs reflects how overdue an interval job is', async () => {
    const { clock, runner } = mk()
    runner.register({ name: 'l', intervalMs: MS.minute, handler: () => undefined })
    expect(runner.lagMs('l')).toBe(0)
    clock.advance(5 * MS.minute)
    expect(runner.lagMs('l')).toBe(4 * MS.minute)
    await runner.tick()
    expect(runner.lagMs('l')).toBe(0)
    expect(() => runner.lagMs('ghost')).toThrow()
  })

  it('validates specs', () => {
    const { runner } = mk()
    const h = () => undefined
    expect(() => runner.register({ name: 'e', handler: h })).toThrow()
    expect(() => runner.register({ name: 'e', intervalMs: 5, atIrst: { hour: 1, minute: 0 }, handler: h })).toThrow()
    expect(() => runner.register({ name: 'e', intervalMs: 0, handler: h })).toThrow()
    expect(() => runner.register({ name: 'e', atIrst: { hour: 24, minute: 0 }, handler: h })).toThrow()
    expect(() => runner.register({ name: 'e', atIrst: { hour: 1, minute: 0, dayOfMonth: 32 }, handler: h })).toThrow()
  })
})

describe('JobRunner — daily IRST schedule', () => {
  it('runs once per IRST day at/after 00:05 (not at 00:04)', async () => {
    const { clock, runner } = mk(fromIrst(2026, 10, 2, 23, 0)) // Fri 23:00
    const runs: number[] = []
    runner.register({ name: 'reval', atIrst: { hour: 0, minute: 5 }, skipInitialCatchUp: true, handler: ({ now }) => void runs.push(now) })
    await runner.tick()
    expect(runs).toHaveLength(0) // skipInitialCatchUp seeded today's slot
    clock.set(fromIrst(2026, 10, 3, 0, 4))
    await runner.tick()
    expect(runs).toHaveLength(0)
    clock.set(fromIrst(2026, 10, 3, 0, 5))
    await runner.tick()
    expect(runs).toEqual([fromIrst(2026, 10, 3, 0, 5)])
    clock.set(fromIrst(2026, 10, 3, 18, 0))
    await runner.tick()
    expect(runs).toHaveLength(1)
    clock.set(fromIrst(2026, 10, 4, 0, 5))
    await runner.tick()
    expect(runs).toHaveLength(2)
  })

  it('without skipInitialCatchUp a never-run daily job is due immediately once its time passed; missed days run once', async () => {
    const { clock, runner } = mk(fromIrst(2026, 10, 2, 12, 0))
    let n = 0
    runner.register({ name: 'd', atIrst: { hour: 0, minute: 5 }, handler: () => void n++ })
    await runner.tick()
    expect(n).toBe(1)
    clock.set(fromIrst(2026, 10, 9, 9, 0)) // a week later
    await runner.tick()
    expect(n).toBe(2)
  })

  it('uses IRST (UTC+3:30) not UTC for the day boundary', () => {
    // 2026-10-02 20:45 UTC = 2026-10-03 00:15 IRST → already the next IRST day
    const utc = Date.UTC(2026, 9, 2, 20, 45)
    const before = Date.UTC(2026, 9, 2, 20, 30) // 00:00 IRST sharp
    expect(dueSlot({ atIrst: { hour: 0, minute: 5 } }, utc).slot).toBe(dueSlot({ atIrst: { hour: 0, minute: 5 } }, before).slot)
    expect(dueSlot({ atIrst: { hour: 0, minute: 5 } }, utc).due).toBe(true)
    expect(dueSlot({ atIrst: { hour: 0, minute: 5 } }, before).due).toBe(false)
    expect(dueSlot({ atIrst: { hour: 0, minute: 5 } }, before - MS.minute).slot).toBe(dueSlot({ atIrst: { hour: 0, minute: 5 } }, before).slot - 1)
  })
})

describe('JobRunner — monthly Jalali schedule', () => {
  const g = (jy: number, jm: number, jd: number, h = 0, m = 0) => {
    const x = toGregorian(jy, jm, jd)
    return fromIrst(x.gy, x.gm, x.gd, h, m)
  }

  it('fires on Jalali day 1 (not Gregorian), once per Jalali month', async () => {
    const { clock, runner } = mk(g(1405, 7, 5, 12)) // 5 Mehr
    const runs: string[] = []
    runner.register({
      name: 'expenses',
      atIrst: { hour: 0, minute: 10, dayOfMonth: 1 },
      skipInitialCatchUp: true,
      handler: ({ now }) => {
        const j = jalaliOf(now)
        runs.push(`${j.jy}-${j.jm}-${j.jd}`)
      },
    })
    await runner.tick()
    expect(runs).toEqual([])
    clock.set(g(1405, 7, 30, 23, 59)) // last day of Mehr
    await runner.tick()
    expect(runs).toEqual([])
    clock.set(g(1405, 8, 1, 0, 9))
    await runner.tick()
    expect(runs).toEqual([])
    clock.set(g(1405, 8, 1, 0, 10))
    await runner.tick()
    expect(runs).toEqual(['1405-8-1'])
    clock.set(g(1405, 8, 20, 10))
    await runner.tick()
    expect(runs).toHaveLength(1)
    clock.set(g(1405, 9, 1, 3))
    await runner.tick()
    expect(runs).toEqual(['1405-8-1', '1405-9-1'])
  })

  it('crosses the Gregorian month/year boundary correctly (1 Farvardin 1406 = 2027-03-21)', async () => {
    const { clock, runner } = mk(g(1405, 12, 29, 12))
    const runs: number[] = []
    runner.register({ name: 'ny', atIrst: { hour: 0, minute: 0, dayOfMonth: 1 }, skipInitialCatchUp: true, handler: ({ now }) => void runs.push(now) })
    await runner.tick()
    clock.set(g(1406, 1, 1, 0, 0))
    expect(jalaliOf(clock.now())).toMatchObject({ jy: 1406, jm: 1, jd: 1 })
    await runner.tick()
    expect(runs).toHaveLength(1)
  })

  it('clamps dayOfMonth to the month length (day 31 in a 30-day month runs on the last day)', () => {
    const spec = { atIrst: { hour: 0, minute: 0, dayOfMonth: 31 } }
    expect(dueSlot(spec, g(1405, 8, 29, 12)).due).toBe(false)
    expect(dueSlot(spec, g(1405, 8, 30, 12)).due).toBe(true) // Aban has 30 days
    expect(dueSlot(spec, g(1405, 1, 30, 12)).due).toBe(false) // Farvardin has 31
    expect(dueSlot(spec, g(1405, 1, 31, 12)).due).toBe(true)
  })

  it('lagMs for a monthly job counts from when it became due', async () => {
    const { clock, runner } = mk(g(1405, 7, 5, 12))
    runner.register({ name: 'm', atIrst: { hour: 0, minute: 0, dayOfMonth: 1 }, skipInitialCatchUp: true, handler: () => undefined })
    await runner.tick()
    expect(runner.lagMs('m')).toBe(0)
    clock.set(g(1405, 8, 1, 6, 0))
    expect(runner.lagMs('m')).toBe(6 * MS.hour)
    await runner.tick()
    expect(runner.lagMs('m')).toBe(0)
  })
})

describe('app jobs', () => {
  it('lists registered platform jobs; housekeeping purges expired sessions', async () => {
    const t = makeTestApp()
    expect(t.app.jobs.list().map((j) => j.name)).toEqual(['notifications.dispatch', 'platform.housekeeping'])
    const s = t.app.services.staff.login('owner', 'owner', { ttlMs: 1000 })
    await t.app.tick() // seeds housekeeping slot (skipInitialCatchUp)
    expect(t.app.repos.sessions.getByHash(sha256Hex(s.token))).toBeDefined()
    t.advance(MS.day + 4 * MS.hour) // next 03:30 IRST has passed; the 1 s session is long expired
    await t.app.tick()
    expect(t.app.repos.sessions.getByHash(sha256Hex(s.token))).toBeUndefined()
    expect(t.app.jobs.state('platform.housekeeping')?.runs).toBe(1)
  })
})
