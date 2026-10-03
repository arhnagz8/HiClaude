import { describe, expect, it } from 'vitest'
import { fromIrst, irstParts, parseIrstDate } from '@hiclaude/contracts'
import { gatewaySettlementAt, isBankBusinessDay, isTradingOpen, nextBankBusinessDay, nextTradingOpen, payaCycles } from './index'

// 2026-10-02 is a Friday; 2026-10-03 Saturday; 2026-10-01 Thursday
const FRI = fromIrst(2026, 10, 2, 11, 30)
const THU_AM = fromIrst(2026, 10, 1, 9, 0)
const THU_PM = fromIrst(2026, 10, 1, 14, 0)
const SAT = fromIrst(2026, 10, 3, 9, 0)

describe('calendar', () => {
  it('weekday sanity', () => {
    expect(irstParts(FRI).weekday).toBe(5)
    expect(irstParts(THU_AM).weekday).toBe(4)
  })

  it('nextBankBusinessDay skips Friday and listed holidays', () => {
    expect(nextBankBusinessDay(THU_PM)).toBe(parseIrstDate('2026-10-03')) // Thu → Fri skipped → Sat
    expect(nextBankBusinessDay(FRI)).toBe(parseIrstDate('2026-10-03'))
    expect(nextBankBusinessDay(SAT)).toBe(parseIrstDate('2026-10-04'))
    expect(nextBankBusinessDay(SAT, { holidays: ['2026-10-04', '2026-10-05'] })).toBe(parseIrstDate('2026-10-06'))
    expect(isBankBusinessDay(FRI)).toBe(false)
    expect(isBankBusinessDay(THU_AM)).toBe(true)
    expect(isBankBusinessDay(SAT, { holidays: ['2026-10-03'] })).toBe(false)
  })

  it('payaCycles: business days only, Thursday only first cycle', () => {
    const c = payaCycles(THU_AM - 3_600_000 * 2, 4)
    expect(c[0]).toBe(fromIrst(2026, 10, 1, 9, 30)) // Thursday first cycle only
    expect(c[1]).toBe(fromIrst(2026, 10, 3, 9, 30)) // Friday skipped
    expect(c[2]).toBe(fromIrst(2026, 10, 3, 13, 30))
    expect(c.length).toBe(4)
    expect(payaCycles(FRI, 1)[0]).toBe(fromIrst(2026, 10, 3, 9, 30))
    expect(payaCycles(SAT, 2, { cycles: [{ hour: 8, minute: 0 }] })).toEqual([fromIrst(2026, 10, 4, 8, 0), fromIrst(2026, 10, 5, 8, 0)])
    expect(payaCycles(SAT, 1, { holidays: ['2026-10-03'] })[0]).toBe(fromIrst(2026, 10, 4, 9, 30))
  })

  it('gatewaySettlementAt: T+24h lands normally mid-week, is pushed past Thu-pm / Fri / holidays', () => {
    const sat = fromIrst(2026, 10, 3, 10, 0)
    expect(gatewaySettlementAt(sat, 24)).toBe(fromIrst(2026, 10, 4, 10, 0))
    // paid Wednesday 14:00 + 24 h = Thursday 14:00 (afternoon) → Saturday 08:00
    expect(gatewaySettlementAt(fromIrst(2026, 9, 30, 14, 0), 24)).toBe(fromIrst(2026, 10, 3, 8, 0))
    // Thursday morning is fine
    expect(gatewaySettlementAt(fromIrst(2026, 9, 30, 8, 0), 24)).toBe(fromIrst(2026, 10, 1, 8, 0))
    // paid Thursday 10:00 +24h = Friday → Saturday 08:00
    expect(gatewaySettlementAt(fromIrst(2026, 10, 1, 10, 0), 24)).toBe(fromIrst(2026, 10, 3, 8, 0))
    // holiday on Sunday 2026-10-04 pushes to Monday 08:00
    expect(gatewaySettlementAt(fromIrst(2026, 10, 3, 10, 0), 24, { holidays: ['2026-10-04'] })).toBe(fromIrst(2026, 10, 5, 8, 0))
    expect(gatewaySettlementAt(sat, 0)).toBe(sat)
  })

  it('isTradingOpen / nextTradingOpen honour the (wrapping) night halt', () => {
    const reg = { nightHalt: { enabled: true, fromHour: 21, toHour: 9 } }
    expect(isTradingOpen(fromIrst(2026, 10, 3, 12, 0), reg)).toBe(true)
    expect(isTradingOpen(fromIrst(2026, 10, 3, 21, 0), reg)).toBe(false)
    expect(isTradingOpen(fromIrst(2026, 10, 3, 2, 0), reg)).toBe(false)
    expect(isTradingOpen(fromIrst(2026, 10, 3, 9, 0), reg)).toBe(true)
    expect(isTradingOpen(fromIrst(2026, 10, 3, 2, 0), { nightHalt: { enabled: false, fromHour: 21, toHour: 9 } })).toBe(true)
    expect(nextTradingOpen(fromIrst(2026, 10, 3, 23, 0), reg)).toBe(fromIrst(2026, 10, 4, 9, 0))
    expect(nextTradingOpen(fromIrst(2026, 10, 3, 2, 0), reg)).toBe(fromIrst(2026, 10, 3, 9, 0))
    expect(nextTradingOpen(fromIrst(2026, 10, 3, 12, 0), reg)).toBe(fromIrst(2026, 10, 3, 12, 0))
  })
})
