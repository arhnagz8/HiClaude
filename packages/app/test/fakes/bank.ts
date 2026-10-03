import { err, ok, portError, type BankCredit, type BankPort, type Clock, type Irt, type Result } from '@hiclaude/contracts'
import { CallLog, FailureScript, type FailureSpec } from './common'

export class FakeBank implements BankPort {
  readonly id = 'fake-bank'
  readonly calls = new CallLog()
  readonly failures = new FailureScript()
  readonly credits: BankCredit[] = []
  readonly transfers: { ref: string; toIban: string; amountIrt: Irt; reason: string; at: number }[] = []
  balanceIrt: Irt
  private seq = 0

  constructor(private readonly clock: Clock, opening: Irt = 0) {
    this.balanceIrt = opening
  }

  fail(method: string, spec: FailureSpec, times = 1): void {
    this.failures.add(method, spec, times)
  }

  /** Simulate an incoming credit (card-to-card / Paya …). Returns the credit (with generated ref when omitted). */
  addCredit(c: Partial<BankCredit> & { amountIrt: Irt }): BankCredit {
    const credit: BankCredit = { ref: c.ref ?? `BANK-${String(++this.seq).padStart(6, '0')}`, at: this.clock.now(), channel: 'card_to_card', ...c }
    this.credits.push(credit)
    this.balanceIrt += credit.amountIrt
    return credit
  }

  async listCredits(req: { since: number }): Promise<Result<BankCredit[]>> {
    this.calls.record('listCredits', req)
    const f = this.failures.take('listCredits')
    if (f) return f
    return ok(this.credits.filter((c) => c.at >= req.since).map((c) => ({ ...c })))
  }

  async balance(): Promise<Result<Irt>> {
    this.calls.record('balance', undefined)
    const f = this.failures.take('balance')
    if (f) return f
    return ok(this.balanceIrt)
  }

  async transferOut(req: { toIban: string; amountIrt: Irt; reason: string }): Promise<Result<{ ref: string; settleAt: number; feeIrt: Irt }>> {
    this.calls.record('transferOut', req)
    const f = this.failures.take('transferOut')
    if (f) return f
    if (req.amountIrt > this.balanceIrt) return err(portError('INSUFFICIENT_FUNDS', 'insufficient bank balance'))
    this.balanceIrt -= req.amountIrt
    const ref = `OUT-${String(++this.seq).padStart(6, '0')}`
    this.transfers.push({ ref, ...req, at: this.clock.now() })
    return ok({ ref, settleAt: this.clock.now() + 3_600_000, feeIrt: 0 })
  }
}
