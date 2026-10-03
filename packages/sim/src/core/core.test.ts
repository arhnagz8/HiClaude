import { describe, expect, it } from 'vitest'
import { MS, fromIrst, irstParts } from '@hiclaude/contracts'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { EventQueue } from './eventQueue'
import { Simulation } from './simulation'
import { SimClock } from './clock'
import { StatsCollector } from './stats'
import { EventLog } from './eventLog'
import { hashNormal, hashObject, hashString32, hashUniform, mix, stableStringify } from './hash'
import { BankCalendar, loadHolidayFile } from './calendar'
import { isRecordWrapper, unwrapRecords } from './records'
import { deepAssign, median } from './util'

describe('EventQueue', () => {
  it('orders by time, then priority, then insertion', () => {
    const q = new EventQueue<string>()
    q.push(10, 'c', 5)
    q.push(5, 'b', 9)
    q.push(5, 'a', 1)
    q.push(5, 'b2', 9)
    q.push(1, 'first')
    const out: string[] = []
    for (;;) {
      const x = q.pop()
      if (!x) break
      out.push(x.payload)
    }
    expect(out).toEqual(['first', 'a', 'b', 'b2', 'c'])
  })
  it('cancel removes items lazily and size tracks live items', () => {
    const q = new EventQueue<number>()
    const a = q.push(1, 1)
    q.push(2, 2)
    q.cancel(a)
    expect(q.size).toBe(1)
    expect(q.peek()?.payload).toBe(2)
    expect(q.cancel(a)).toBe(false)
  })
  it('popDue returns only due items in order', () => {
    const q = new EventQueue<number>()
    for (const t of [9, 3, 7, 1]) q.push(t, t)
    expect(q.popDue(7).map((i) => i.payload)).toEqual([1, 3, 7])
    expect(q.size).toBe(1)
  })
  it('handles a large random workload in order', () => {
    const q = new EventQueue<number>()
    let x = 12345
    const times: number[] = []
    for (let i = 0; i < 2000; i++) {
      x = (x * 1103515245 + 12345) & 0x7fffffff
      times.push(x % 1000)
      q.push(x % 1000, i)
    }
    const out: number[] = []
    for (let it = q.pop(); it; it = q.pop()) out.push(it.time)
    expect(out).toEqual([...times].sort((a, b) => a - b))
  })
})

describe('Simulation', () => {
  it('runs tasks in order moving the clock and ends at the target time', () => {
    const sim = new Simulation(1000)
    const seen: [number, string][] = []
    sim.at(1500, () => seen.push([sim.now(), 'b']))
    sim.at(1200, () => seen.push([sim.now(), 'a']))
    sim.at(5000, () => seen.push([sim.now(), 'late']))
    const n = sim.runUntil(2000)
    expect(n).toBe(2)
    expect(seen).toEqual([[1200, 'a'], [1500, 'b']])
    expect(sim.now()).toBe(2000)
    expect(sim.nextEventTime()).toBe(5000)
  })
  it('tasks can schedule more tasks inside the window', () => {
    const sim = new Simulation(0)
    const hits: number[] = []
    sim.at(10, () => {
      hits.push(sim.now())
      sim.after(5, () => hits.push(sim.now()))
    })
    sim.runUntil(100)
    expect(hits).toEqual([10, 15])
  })
  it('never schedules in the past and rejects going backwards', () => {
    const sim = new Simulation(100)
    sim.at(50, () => undefined)
    expect(sim.nextEventTime()).toBe(100)
    expect(() => sim.runUntil(10)).toThrow()
  })
  it('every() repeats and cancel stops it', () => {
    const sim = new Simulation(0)
    let n = 0
    const h = sim.every(10, () => {
      n++
    })
    sim.runUntil(55)
    expect(n).toBe(5)
    h.cancel()
    sim.runUntil(200)
    expect(n).toBe(5)
  })
  it('hooks fire around events', () => {
    const sim = new Simulation(0)
    const log: string[] = []
    sim.hooks.on('beforeEvent', (i) => log.push(`b${i.time}`))
    sim.hooks.on('afterEvent', (i) => log.push(`a${i.time}`))
    sim.at(5, () => log.push('run'))
    sim.runUntil(10)
    expect(log).toEqual(['b5', 'run', 'a5'])
  })
  it('step() executes one task', () => {
    const sim = new Simulation(0)
    let n = 0
    sim.at(3, () => n++)
    sim.at(4, () => n++)
    expect(sim.step()).toBe(true)
    expect(n).toBe(1)
    expect(sim.now()).toBe(3)
    expect(sim.eventsProcessed).toBe(1)
  })
  it('SimClock cannot go backwards', () => {
    const c = new SimClock(10)
    c.moveTo(20)
    expect(() => c.moveTo(5)).toThrow()
    c.moveTo(20)
    expect(c.now()).toBe(20)
  })
})

describe('StatsCollector', () => {
  it('counts, gauges, histograms and series', () => {
    const s = new StatsCollector({ histogramSamples: 100, seriesPoints: 3 })
    s.inc('a')
    s.inc('a', 4)
    s.gauge('g', 7)
    for (let i = 1; i <= 100; i++) s.observe('h', i)
    for (let i = 0; i < 5; i++) s.record('s', i, i * 10)
    expect(s.counter('a')).toBe(5)
    expect(s.gaugeValue('g')).toBe(7)
    const h = s.histogram('h')
    expect(h?.count).toBe(100)
    expect(h?.p50).toBeGreaterThanOrEqual(50)
    expect(h?.p90).toBeGreaterThanOrEqual(90)
    expect(s.seriesOf('s').map((p) => p.v)).toEqual([20, 30, 40])
    const snap = s.snapshot()
    expect(snap.counters.a).toBe(5)
    expect(Object.keys(snap.histograms)).toEqual(['h'])
  })
  it('histogram ring forgets old samples for quantiles but keeps totals', () => {
    const s = new StatsCollector({ histogramSamples: 10 })
    for (let i = 0; i < 1000; i++) s.observe('h', i < 10 ? 100 : 1)
    const h = s.histogram('h')
    expect(h?.count).toBe(1000)
    expect(h?.max).toBe(100)
    expect(h?.p50).toBe(1)
  })
})

describe('EventLog', () => {
  it('hash is sensitive to content and order, equal for equal runs', () => {
    const mk = (fn: (l: EventLog) => void) => {
      const l = new EventLog(new SimClock(0))
      fn(l)
      return l.hash()
    }
    const h1 = mk((l) => {
      l.emit('a', 'x', { n: 1 })
      l.emit('b', 'x')
    })
    const h2 = mk((l) => {
      l.emit('a', 'x', { n: 1 })
      l.emit('b', 'x')
    })
    const h3 = mk((l) => {
      l.emit('b', 'x')
      l.emit('a', 'x', { n: 1 })
    })
    const h4 = mk((l) => {
      l.emit('a', 'x', { n: 2 })
      l.emit('b', 'x')
    })
    expect(h1).toBe(h2)
    expect(h1).not.toBe(h3)
    expect(h1).not.toBe(h4)
  })
  it('subscribe/filter/ring cap', () => {
    const clock = new SimClock(0)
    const l = new EventLog(clock, 3)
    const seen: string[] = []
    const off = l.subscribe('a', (e) => seen.push(e.type))
    l.emit('a', 's')
    l.emit('b', 's')
    off()
    l.emit('a', 's')
    for (let i = 0; i < 5; i++) l.emit('c', 'z')
    expect(seen).toEqual(['a'])
    expect(l.entries().length).toBe(3)
    expect(l.count).toBe(8)
    expect(l.entries({ type: 'c' }).length).toBe(3)
  })
})

describe('hash helpers', () => {
  it('are pure, in range and well distributed', () => {
    expect(mix(1, 2, 3)).toBe(mix(1, 2, 3))
    expect(mix(1, 2, 3)).not.toBe(mix(3, 2, 1))
    let sum = 0
    let sq = 0
    const n = 20000
    for (let i = 0; i < n; i++) {
      const u = hashUniform(7, i)
      expect(u).toBeGreaterThan(0)
      expect(u).toBeLessThan(1)
      sum += u
      const z = hashNormal(7, i)
      sq += z * z
    }
    expect(Math.abs(sum / n - 0.5)).toBeLessThan(0.01)
    expect(Math.abs(sq / n - 1)).toBeLessThan(0.05)
  })
  it('stableStringify sorts keys; hashObject is order independent', () => {
    expect(stableStringify({ b: 1, a: [2, { d: 1, c: 2 }] })).toBe('{"a":[2,{"c":2,"d":1}],"b":1}')
    expect(hashObject({ a: 1, b: 2 })).toBe(hashObject({ b: 2, a: 1 }))
    expect(hashString32('x')).toBe(hashString32('x'))
  })
  it('handles large epoch keys without collisions between adjacent ms', () => {
    const t = 1_790_000_000_000
    expect(mix(t)).not.toBe(mix(t + 1))
  })
})

describe('records and util', () => {
  it('unwraps nested record wrappers', () => {
    const v = { a: { value: 5, unit: 'x', as_of: '2026-10-02', confidence: 'low' }, b: [{ value: { c: { value: 1, confidence: 'high' } }, as_of: 'x' }], c: { value: 'keepme-not-a-record' } }
    expect(unwrapRecords(v)).toEqual({ a: 5, b: [{ c: 1 }], c: { value: 'keepme-not-a-record' } })
    expect(isRecordWrapper({ value: 1 })).toBe(false)
    expect(isRecordWrapper({ value: 1, unit: 'u' })).toBe(true)
  })
  it('deepAssign merges objects and replaces arrays', () => {
    expect(deepAssign({ a: { b: 1, c: 2 }, d: [1] }, { a: { b: 9 }, d: [2, 3] })).toEqual({ a: { b: 9, c: 2 }, d: [2, 3] })
    expect(median([3, 1, 2])).toBe(2)
    expect(median([1, 2, 3, 4])).toBe(2.5)
  })
})

describe('BankCalendar', () => {
  const cal = new BankCalendar()
  it('Friday is not a business day; Thursday is', () => {
    expect(cal.isBusinessDay(fromIrst(2026, 10, 2, 12))).toBe(false) // Friday
    expect(cal.isBusinessDay(fromIrst(2026, 10, 1, 12))).toBe(true) // Thursday
    expect(cal.isBusinessDay(fromIrst(2026, 10, 3, 12))).toBe(true) // Saturday
  })
  it('Nowruz and fixed solar holidays are holidays', () => {
    expect(cal.isHoliday(fromIrst(2027, 3, 21, 12))).toBe(true) // 1 Farvardin 1406
    expect(cal.isHoliday(fromIrst(2027, 4, 1, 12))).toBe(true) // 12 Farvardin
    expect(cal.isHoliday(fromIrst(2027, 4, 3, 12))).toBe(false)
    expect(cal.isHoliday(fromIrst(2027, 2, 11, 12))).toBe(true) // 22 Bahman 1405
  })
  it('Paya request on a weekday morning settles at the next cycle; evening goes to the next business day', () => {
    // Saturday 2026-10-03 09:00 -> 10:00 cycle
    expect(cal.nextPayaSettlement(fromIrst(2026, 10, 3, 9, 0))).toBe(fromIrst(2026, 10, 3, 10))
    // 09:45 -> not enough processing time for 10:00 (needs 30 min) -> 14:00
    expect(cal.nextPayaSettlement(fromIrst(2026, 10, 3, 9, 45))).toBe(fromIrst(2026, 10, 3, 14))
    // 19:00 -> next business day 10:00 (Sunday 4 Oct)
    expect(cal.nextPayaSettlement(fromIrst(2026, 10, 3, 19))).toBe(fromIrst(2026, 10, 4, 10))
  })
  it('Paya skips Thursday afternoon, Friday and goes to Saturday', () => {
    expect(cal.nextPayaSettlement(fromIrst(2026, 10, 1, 8))).toBe(fromIrst(2026, 10, 1, 10)) // Thu morning cycle exists
    expect(cal.nextPayaSettlement(fromIrst(2026, 10, 1, 10, 30))).toBe(fromIrst(2026, 10, 3, 10)) // Thu >= 13:00 cycles do not run
    expect(cal.nextPayaSettlement(fromIrst(2026, 10, 2, 9))).toBe(fromIrst(2026, 10, 3, 10)) // Friday
  })
  it('Paya skips holidays', () => {
    // Fri 2027-03-19 (28 Esfand 1405)... request on 29 Esfand (Sat 20 Mar 2027) holiday -> wait until after 1-4 Farvardin
    const t = cal.nextPayaSettlement(fromIrst(2027, 3, 19, 11))
    expect(cal.isBusinessDay(t)).toBe(true)
    expect(t).toBeGreaterThan(fromIrst(2027, 3, 25))
  })
  it('Satna settles within minutes in banking hours, else at next opening', () => {
    expect(cal.nextSatnaSettlement(fromIrst(2026, 10, 3, 9))).toBe(fromIrst(2026, 10, 3, 9, 15))
    expect(cal.nextSatnaSettlement(fromIrst(2026, 10, 3, 6))).toBe(fromIrst(2026, 10, 3, 8, 15))
    expect(cal.nextSatnaSettlement(fromIrst(2026, 10, 3, 17))).toBe(fromIrst(2026, 10, 4, 8, 15))
    expect(cal.nextSatnaSettlement(fromIrst(2026, 10, 1, 13))).toBe(fromIrst(2026, 10, 3, 8, 15)) // Thu after noon -> Saturday
  })
  it('nextBusinessMoment finds the next business-day hour', () => {
    const t = cal.nextBusinessMoment(fromIrst(2026, 10, 2, 5), 9) // Friday -> Saturday 09:00
    expect(t).toBe(fromIrst(2026, 10, 3, 9))
    expect(irstParts(t).weekday).toBe(6)
  })
  it('extra holidays from file are honoured', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cal-'))
    const f = join(dir, 'cal.json')
    writeFileSync(f, JSON.stringify({ public_holidays: [{ date: '2026-10-04', as_of: '2026-10-02', value: 'x' }], bank_holidays: ['2026-10-05'] }))
    const days = loadHolidayFile(f)
    expect(days).toContain('2026-10-05')
    const c2 = new BankCalendar(days)
    expect(c2.isHoliday(fromIrst(2026, 10, 5, 12))).toBe(true)
    expect(loadHolidayFile(join(dir, 'missing.json'))).toEqual([])
  })
  it('weekday helper sanity', () => {
    expect(MS.day).toBe(86_400_000)
  })
})
