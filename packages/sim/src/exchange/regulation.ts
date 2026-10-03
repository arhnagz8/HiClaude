/**
 * Shared, mutable regulatory state seen by every exchange (CBI deposit caps, FATA withdrawal lock, night halt, per-user buy cap).
 * Scenario events mutate it via applyEvent and automatically revert it. Initial values come from PlatformParams.regulatory.
 */
import type { RegulatoryParams } from '@hiclaude/contracts'
import { usdtToMicro } from '@hiclaude/contracts'
import { newHandleId, pNum, pNumOrNull, type EventHandle, type Params, type SimComponent, type SimEnv } from '../core/types'

export type RegulationState = RegulatoryParams

export class Regulation implements SimComponent {
  readonly name = 'regulation'
  readonly state: RegulationState

  constructor(
    private readonly env: SimEnv,
    initial: RegulatoryParams,
  ) {
    this.state = structuredClone(initial)
  }

  private parseHour(v: unknown, dflt: number): number {
    if (typeof v === 'number') return v
    if (typeof v === 'string') {
      const m = /^(\d{1,2})(?::(\d{2}))?$/.exec(v)
      if (m) return Number(m[1]) + (m[2] ? Number(m[2]) / 60 : 0)
    }
    return dflt
  }

  applyEvent(type: string, params: Params): EventHandle | null {
    const s = this.state
    switch (type) {
      case 'cbi_deposit_cap': {
        const prev = s.idDepositCapIrtPer24h
        const v = pNumOrNull(params, 'valueIrt')
        s.idDepositCapIrtPer24h = v === undefined ? 10_000_000 : v
        this.env.log.emit('regulation.deposit_cap', 'regulation', { valueIrt: s.idDepositCapIrtPer24h })
        return this.handle('cbi_deposit_cap', () => {
          s.idDepositCapIrtPer24h = prev
          this.env.log.emit('regulation.deposit_cap', 'regulation', { valueIrt: prev, reverted: true })
        })
      }
      case 'night_halt': {
        const prev = { ...s.nightHalt }
        const prevCap = s.dailyBuyCapMicroUsdt
        s.nightHalt = { enabled: true, fromHour: this.parseHour(params.from, prev.fromHour), toHour: this.parseHour(params.to, prev.toHour) }
        const cap = pNumOrNull(params, 'dailyBuyCapUsdt')
        if (cap !== undefined) s.dailyBuyCapMicroUsdt = cap === null ? null : usdtToMicro(cap)
        this.env.log.emit('regulation.night_halt', 'regulation', { from: s.nightHalt.fromHour, to: s.nightHalt.toHour, dailyBuyCapMicroUsdt: s.dailyBuyCapMicroUsdt })
        return this.handle('night_halt', () => {
          s.nightHalt = prev
          s.dailyBuyCapMicroUsdt = prevCap
          this.env.log.emit('regulation.night_halt', 'regulation', { enabled: prev.enabled, reverted: true })
        })
      }
      case 'daily_buy_cap': {
        const prev = s.dailyBuyCapMicroUsdt
        const cap = pNumOrNull(params, 'dailyBuyCapUsdt')
        s.dailyBuyCapMicroUsdt = cap === undefined ? usdtToMicro(2000) : cap === null ? null : usdtToMicro(cap)
        return this.handle('daily_buy_cap', () => {
          s.dailyBuyCapMicroUsdt = prev
        })
      }
      case 'withdrawal_lock_change': {
        const prev = s.withdrawalLockHours
        s.withdrawalLockHours = pNum(params, 'hours', prev)
        return this.handle('withdrawal_lock', () => {
          s.withdrawalLockHours = prev
        })
      }
      case 'deposit_identities_change': {
        const prev = s.depositIdentitiesAvailable
        s.depositIdentitiesAvailable = Math.max(1, Math.floor(pNum(params, 'count', prev)))
        return this.handle('deposit_identities', () => {
          s.depositIdentitiesAvailable = prev
        })
      }
      default:
        return null
    }
  }

  private handle(prefix: string, revert: () => void): EventHandle {
    let done = false
    return {
      id: newHandleId(prefix),
      revert: () => {
        if (done) return
        done = true
        revert()
      },
    }
  }
}
