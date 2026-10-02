import type { AuditFilter, AuditRecord } from '../repos'
import type { AppContext } from '../context'
import { toActor, type ActorLike } from '../util'

/** Thin audit-log writer/reader. Every mutating admin action must call `record`. Data must not contain secrets or PII beyond ids. */
export class AuditService {
  constructor(private readonly ctx: Pick<AppContext, 'clock' | 'repos'>) {}

  record(actor: ActorLike, action: string, target?: string, data?: Record<string, unknown>): AuditRecord {
    const a = toActor(actor)
    return this.ctx.repos.audit.append({ at: this.ctx.clock.now(), actorType: a.type, actorId: a.id, action, target, data })
  }

  list(filter: AuditFilter = {}): AuditRecord[] {
    return this.ctx.repos.audit.list(filter)
  }
}
