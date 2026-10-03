import { err, ok, portError, type Clock, type GatewayCreateRequest, type GatewayVerifyResult, type Irt, type PaymentGatewayPort, type Result } from '@hiclaude/contracts'
import { CallLog, FailureScript, type FailureSpec } from './common'

interface Session {
  authority: string
  req: GatewayCreateRequest
  state: 'pending' | 'paid' | 'failed'
  paidAmountIrt?: Irt
  paidAt?: number
  verified: boolean
}

export class FakeGateway implements PaymentGatewayPort {
  readonly calls = new CallLog()
  readonly failures = new FailureScript()
  readonly sessions = new Map<string, Session>()
  /** fee returned on verify (Toman) */
  feeIrt = 0
  private seq = 0

  constructor(readonly id: string, private readonly clock: Clock) {}

  fail(method: string, spec: FailureSpec, times = 1): void {
    this.failures.add(method, spec, times)
  }

  async create(req: GatewayCreateRequest): Promise<Result<{ authority: string; payUrl: string }>> {
    this.calls.record('create', req)
    const f = this.failures.take('create')
    if (f) return f
    const authority = `A${String(++this.seq).padStart(8, '0')}`
    this.sessions.set(authority, { authority, req, state: 'pending', verified: false })
    return ok({ authority, payUrl: `https://pay.fake/${this.id}/${authority}` })
  }

  /** Customer pays on the PSP page (amount defaults to the requested amount). */
  markPaid(authority: string, amountIrt?: Irt): void {
    const s = this.mustSession(authority)
    s.state = 'paid'
    s.paidAmountIrt = amountIrt ?? s.req.amountIrt
    s.paidAt = this.clock.now()
  }
  markFailed(authority: string): void {
    this.mustSession(authority).state = 'failed'
  }
  /** Convenience: the session created for an order id. */
  sessionForOrder(orderId: string): Session | undefined {
    return [...this.sessions.values()].find((s) => s.req.orderId === orderId)
  }

  private mustSession(authority: string): Session {
    const s = this.sessions.get(authority)
    if (!s) throw new Error(`FakeGateway: unknown authority ${authority}`)
    return s
  }

  async verify(req: { authority: string; amountIrt: Irt }): Promise<Result<GatewayVerifyResult>> {
    this.calls.record('verify', req)
    const f = this.failures.take('verify')
    if (f) return f
    const s = this.sessions.get(req.authority)
    if (!s) return err(portError('NOT_FOUND', 'unknown authority'))
    if (s.state === 'pending') return ok({ status: 'pending' })
    if (s.state === 'failed') return ok({ status: 'failed' })
    s.verified = true
    return ok({ status: 'paid', amountIrt: s.paidAmountIrt, refId: `REF-${s.authority}`, cardPanMasked: '603799******0001', feeIrt: this.feeIrt, paidAt: s.paidAt })
  }
}
