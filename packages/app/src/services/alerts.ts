import type { AppContext } from '../context'
import type { AlertRecord } from '../repos'
import { toActor, type ActorLike } from '../util'

export interface RaiseAlertInput {
  severity: 'info' | 'warning' | 'critical'
  code: string
  messageFa: string
  data?: Record<string, unknown>
  /** Collapse repeats of the same `code` raised within this window into one row (count++). Default 0 = never collapse. */
  dedupeMs?: number
}

export class AlertService {
  constructor(private readonly ctx: Pick<AppContext, 'clock' | 'ids' | 'repos' | 'bus' | 'logger'>) {}

  raise(input: RaiseAlertInput): AlertRecord {
    const now = this.ctx.clock.now()
    try {
      if (input.dedupeMs && input.dedupeMs > 0) {
        const open = this.ctx.repos.alerts.findOpenByCode(input.code, now - input.dedupeMs)
        if (open) return this.ctx.repos.alerts.bump(open.id, now, input.data)
      }
      const rec = this.ctx.repos.alerts.insert({
        id: this.ctx.ids.next('alr'),
        at: now,
        lastAt: now,
        count: 1,
        severity: input.severity,
        code: input.code,
        messageFa: input.messageFa,
        data: input.data,
      })
      this.ctx.bus.publish({ type: 'alert.raised', at: now, severity: input.severity, code: input.code, messageFa: input.messageFa, data: input.data })
      return rec
    } finally {
      const lvl = input.severity === 'critical' ? 'error' : input.severity === 'warning' ? 'warn' : 'info'
      this.ctx.logger[lvl](`alert ${input.code}`, { severity: input.severity })
    }
  }

  list(filter: { openOnly?: boolean; unackedOnly?: boolean; severity?: 'info' | 'warning' | 'critical'; limit?: number } = {}): AlertRecord[] {
    return this.ctx.repos.alerts.list(filter)
  }
  get(id: string): AlertRecord | undefined {
    return this.ctx.repos.alerts.get(id)
  }
  ack(id: string, actor: ActorLike): AlertRecord {
    return this.ctx.repos.alerts.ack(id, toActor(actor).id ?? toActor(actor).type, this.ctx.clock.now())
  }
  resolve(id: string): AlertRecord {
    return this.ctx.repos.alerts.resolve(id, this.ctx.clock.now())
  }
  /** Resolve every open alert with this code (e.g. when a condition clears). */
  resolveByCode(code: string): number {
    let n = 0
    for (const a of this.ctx.repos.alerts.list({ openOnly: true, limit: 500 })) {
      if (a.code === code) {
        this.ctx.repos.alerts.resolve(a.id, this.ctx.clock.now())
        n++
      }
    }
    return n
  }
  openCount(): number {
    return this.ctx.repos.alerts.countOpen()
  }
}
