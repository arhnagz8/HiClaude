import { err, ok, portError, type ChainPort, type ChainTransfer, type Clock, type MicroUsdt, type Network, type Result } from '@hiclaude/contracts'
import { CallLog, FailureScript, type FailureSpec } from './common'

export class FakeChain implements ChainPort {
  readonly calls = new CallLog()
  readonly failures = new FailureScript()
  readonly transfers: ChainTransfer[] = []
  readonly sent: { network: Network; to: string; amount: MicroUsdt; memo?: string; txHash: string }[] = []
  readonly addresses = new Map<string, { network: Network; orderId: string; address: string; memo?: string }>()
  private readonly screen = new Map<string, { risk: 'clear' | 'review' | 'blocked'; reasons: string[] }>()
  private readonly balances: Partial<Record<Network, MicroUsdt>> = {}
  sendFeeMicroUsdt: MicroUsdt = 1_000_000
  private seq = 0

  constructor(private readonly clock: Clock) {}

  fail(method: string, spec: FailureSpec, times = 1): void {
    this.failures.add(method, spec, times)
  }
  setScreening(address: string, risk: 'clear' | 'review' | 'blocked', reasons: string[] = []): void {
    this.screen.set(address, { risk, reasons })
  }
  setWalletBalance(network: Network, amount: MicroUsdt): void {
    this.balances[network] = amount
  }

  /** Simulate an incoming transfer to `to`. Increases the wallet balance when `to` is the hot wallet. */
  addIncoming(t: Partial<ChainTransfer> & { network: Network; to: string; amount: MicroUsdt }): ChainTransfer {
    const transfer: ChainTransfer = {
      txHash: `0xTX${String(++this.seq).padStart(8, '0')}`,
      from: 'TSenderAddress000000000000000000000',
      at: this.clock.now(),
      confirmations: 0,
      status: 'pending',
      ...t,
    }
    this.transfers.push(transfer)
    if (transfer.to === this.walletAddress(transfer.network) && transfer.status === 'confirmed') this.balances[transfer.network] = (this.balances[transfer.network] ?? 0) + transfer.amount
    return transfer
  }
  confirm(txHash: string, confirmations: number, status: ChainTransfer['status'] = 'confirmed'): void {
    const t = this.transfers.find((x) => x.txHash === txHash)
    if (!t) throw new Error(`FakeChain: unknown tx ${txHash}`)
    t.confirmations = confirmations
    t.status = status
  }

  async allocateDepositAddress(req: { network: Network; orderId: string }): Promise<Result<{ address: string; memo?: string }>> {
    this.calls.record('allocateDepositAddress', req)
    const f = this.failures.take('allocateDepositAddress')
    if (f) return f
    const address = `T${req.network}${req.orderId}`.padEnd(34, 'x').slice(0, 34)
    const memo = req.network === 'TON' ? `memo-${req.orderId}` : undefined
    this.addresses.set(req.orderId, { network: req.network, orderId: req.orderId, address, memo })
    return ok({ address, memo })
  }

  async listIncoming(req: { network: Network; address?: string; since: number }): Promise<Result<ChainTransfer[]>> {
    this.calls.record('listIncoming', req)
    const f = this.failures.take('listIncoming')
    if (f) return f
    return ok(this.transfers.filter((t) => t.network === req.network && t.at >= req.since && (!req.address || t.to === req.address)).map((t) => ({ ...t })))
  }

  async send(req: { network: Network; to: string; amount: MicroUsdt; memo?: string }): Promise<Result<{ txHash: string; feeMicroUsdt: MicroUsdt }>> {
    this.calls.record('send', req)
    const f = this.failures.take('send')
    if (f) return f
    const bal = this.balances[req.network] ?? 0
    if (req.amount + this.sendFeeMicroUsdt > bal) return err(portError('INSUFFICIENT_FUNDS', 'insufficient wallet balance'))
    this.balances[req.network] = bal - req.amount - this.sendFeeMicroUsdt
    const txHash = `0xOUT${String(++this.seq).padStart(8, '0')}`
    this.sent.push({ ...req, txHash })
    this.transfers.push({ txHash, network: req.network, from: this.walletAddress(req.network), to: req.to, amount: req.amount, memo: req.memo, at: this.clock.now(), confirmations: 0, status: 'pending' })
    return ok({ txHash, feeMicroUsdt: this.sendFeeMicroUsdt })
  }

  async txStatus(req: { network: Network; txHash: string }): Promise<Result<{ confirmations: number; status: 'pending' | 'confirmed' | 'failed' }>> {
    this.calls.record('txStatus', req)
    const f = this.failures.take('txStatus')
    if (f) return f
    const t = this.transfers.find((x) => x.txHash === req.txHash && x.network === req.network)
    if (!t) return err(portError('NOT_FOUND', 'unknown transaction'))
    return ok({ confirmations: t.confirmations, status: t.status })
  }

  async screenAddress(req: { network: Network; address: string }): Promise<Result<{ risk: 'clear' | 'review' | 'blocked'; reasons: string[] }>> {
    this.calls.record('screenAddress', req)
    const f = this.failures.take('screenAddress')
    if (f) return f
    return ok(this.screen.get(req.address) ?? { risk: 'clear', reasons: [] })
  }

  walletAddress(network: Network): string {
    return `HOTWALLET-${network}-0000000000000000`
  }

  async walletBalance(network: Network): Promise<Result<MicroUsdt>> {
    this.calls.record('walletBalance', network)
    const f = this.failures.take('walletBalance')
    if (f) return f
    return ok(this.balances[network] ?? 0)
  }
}
