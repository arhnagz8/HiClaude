/** Shared helpers for the in-memory fakes: scripted failures, call logs. */
import { portError, err, type PortError, type PortErrorCode, type Result } from '@hiclaude/contracts'

export type FailureSpec = PortError | PortErrorCode

/**
 * Scripted failures: `fakes.fail('buyUsdt', 'UNAVAILABLE', 2)` makes the next 2 calls of `buyUsdt` return that error.
 * `fail('*', …)` applies to every method. Failures are consumed in FIFO order.
 */
export class FailureScript {
  private readonly queue = new Map<string, { error: PortError; times: number }[]>()

  add(method: string, spec: FailureSpec, times = 1): void {
    const error = typeof spec === 'string' ? portError(spec, `scripted ${spec} on ${method}`) : spec
    const q = this.queue.get(method) ?? []
    q.push({ error, times })
    this.queue.set(method, q)
  }

  clear(method?: string): void {
    if (method) this.queue.delete(method)
    else this.queue.clear()
  }

  /** Returns a failure Result if one is scripted for `method` (consuming one use), else undefined. */
  take(method: string): Result<never> | undefined {
    for (const key of [method, '*']) {
      const q = this.queue.get(key)
      const head = q?.[0]
      if (q && head) {
        head.times--
        if (head.times <= 0) q.shift()
        return err(head.error)
      }
    }
    return undefined
  }
}

export interface Call {
  method: string
  args: unknown
}

export class CallLog {
  readonly calls: Call[] = []
  record(method: string, args: unknown): void {
    this.calls.push({ method, args })
  }
  count(method: string): number {
    return this.calls.filter((c) => c.method === method).length
  }
  of(method: string): Call[] {
    return this.calls.filter((c) => c.method === method)
  }
  clear(): void {
    this.calls.length = 0
  }
}
