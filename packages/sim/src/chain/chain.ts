/**
 * ChainSim implements ChainPort: simplified multi-network USDT ledger with block times, confirmations, fees, addresses, AML screening and anomaly injectors.
 *
 * Simplifications (documented in README):
 *  - USDT only (other tokens are recorded as "wrong token" deposits and never credited).
 *  - Our deposit addresses are custodial sub-addresses of one pool per network: funds sent to any allocated address count towards walletBalance()
 *    and sweeping is free/instant. EVM-family addresses are valid on every EVM network (a wrong-network EVM deposit lands on the other chain, unseen by the
 *    ordered network's listIncoming, as in reality).
 *  - A sender is debited (amount + fee) at broadcast; the receiver is credited when the tx reaches the required confirmations; a failed tx refunds the
 *    amount (the fee is burned).
 *  - Counterparties that are not ours (customers, exchanges' hot wallets, genesis) are "bottomless" sources: they mint USDT into the system.
 */
import {
  NETWORKS,
  err,
  ok,
  portError,
  usdtToMicro,
  type ChainPort,
  type ChainTransfer,
  type EpochMs,
  type MicroUsdt,
  type Network,
  type PlatformParams,
  type Result,
  type Rng,
} from '@hiclaude/contracts'
import { hashUniform, hashString32 } from '../core/hash'
import { newHandleId, pNum, pStr, type EventHandle, type Params, type SimComponent, type SimEnv } from '../core/types'
import { randomBase58, randomBase64Url, randomHex } from '../core/util'

export type AddressFamily = 'tron' | 'evm' | 'ton' | 'solana'
export const ADDRESS_FAMILY: Record<Network, AddressFamily> = { TRC20: 'tron', BEP20: 'evm', ERC20: 'evm', POLYGON: 'evm', ARBITRUM: 'evm', TON: 'ton', SOLANA: 'solana' }

export interface NetworkConfig {
  blockTimeSec: number
  requiredConfirmations: number
  /** Network fee charged to our wallet per send, USDT-equivalent (micro). TRC20 includes the energy-burn model in simplified form. */
  feeMicroUsdt: number
  /** +/- fraction of random fee jitter. */
  feeJitter: number
  /** Probability an outgoing tx fails on-chain (out of energy/gas, dropped). */
  failProb: number
}

export interface ChainConfig {
  networks: Record<Network, NetworkConfig>
  /** AML screening: probability an address is flagged. UNVERIFIED placeholders. */
  taint: { reviewProb: number; blockedProb: number }
}

/** Placeholder defaults (UNVERIFIED): block times from public chain docs; fees are rough USDT-transfer costs. */
export function defaultChainConfig(confirmations?: Partial<Record<Network, number>>): ChainConfig {
  const c = (n: Network, def: number) => confirmations?.[n] ?? def
  return {
    networks: {
      TRC20: { blockTimeSec: 3, requiredConfirmations: c('TRC20', 20), feeMicroUsdt: usdtToMicro(1.1), feeJitter: 0.25, failProb: 0.002 },
      BEP20: { blockTimeSec: 1.5, requiredConfirmations: c('BEP20', 15), feeMicroUsdt: usdtToMicro(0.06), feeJitter: 0.3, failProb: 0.0005 },
      TON: { blockTimeSec: 5, requiredConfirmations: c('TON', 1), feeMicroUsdt: usdtToMicro(0.03), feeJitter: 0.2, failProb: 0.0005 },
      ERC20: { blockTimeSec: 12, requiredConfirmations: c('ERC20', 12), feeMicroUsdt: usdtToMicro(2.5), feeJitter: 0.6, failProb: 0.001 },
      POLYGON: { blockTimeSec: 2, requiredConfirmations: c('POLYGON', 64), feeMicroUsdt: usdtToMicro(0.03), feeJitter: 0.3, failProb: 0.0005 },
      SOLANA: { blockTimeSec: 0.4, requiredConfirmations: c('SOLANA', 32), feeMicroUsdt: usdtToMicro(0.02), feeJitter: 0.2, failProb: 0.001 },
      ARBITRUM: { blockTimeSec: 0.25, requiredConfirmations: c('ARBITRUM', 20), feeMicroUsdt: usdtToMicro(0.1), feeJitter: 0.3, failProb: 0.0005 },
    },
    taint: { reviewProb: 0.01, blockedProb: 0.0005 },
  }
}

export function chainConfigFromParams(p: PlatformParams): ChainConfig {
  return defaultChainConfig(p.paymentMethods.usdt.confirmations)
}

export type AnomalyKind = 'wrong_network' | 'wrong_token' | 'underpay' | 'overpay' | 'duplicate'

export interface ChainTx {
  txHash: string
  network: Network
  from: string
  to: string
  amount: MicroUsdt
  memo?: string
  token: string
  at: EpochMs
  includedAt: EpochMs
  confirmedAt: EpochMs
  failed: boolean
  fee: MicroUsdt
  /** Where the sender's debit came from. */
  bottomless: boolean
  fromOwner: string
  settled: boolean
  /** debited amount incl fee at broadcast from a real account (0 for bottomless) */
  debited: MicroUsdt
  toKey: string | null // pool/account key credited at settlement (null for non-USDT tokens)
  fromKey: string | null
}

export interface TransferRequest {
  network: Network
  from: string
  to: string
  amount: MicroUsdt
  memo?: string
  /** Owner label of the sender, e.g. 'ours', 'exchange:nobitex', 'customer'. */
  fromOwner?: string
  /** True when the sender is not one of our tracked accounts (mints USDT). Default: derived from owner. */
  bottomless?: boolean
  /** Network fee to charge the (non-bottomless) sender; default = network fee. Pass 0 for none. */
  fee?: MicroUsdt
  token?: string
  at?: EpochMs
  txHash?: string
}

const OURS = '@ours'

export class ChainSim implements ChainPort, SimComponent {
  readonly name = 'chain'
  private readonly cfg: ChainConfig
  private readonly rng: Rng
  private readonly env: SimEnv
  private readonly seedInt: number
  private balances = new Map<string, number>()
  private ours = new Map<string, Set<string>>() // network -> our addresses
  private allocated = new Map<string, { address: string; memo?: string }>() // `${net}:${orderId}`
  private owners = new Map<string, string>() // `${net}:${addr}` -> owner label (non-ours)
  private txs = new Map<string, ChainTx>()
  private txOrder: ChainTx[] = []
  private incomingListeners = new Map<string, ((t: ChainTransfer) => void)[]>()
  private flagged = new Map<string, 'review' | 'blocked'>()
  private wallets = new Map<Network, string>()
  private tonSharedAddress: string
  private memoCounter = 0
  private taintMultiplier = 1
  private congestion: { network: Network | '*'; delayMult: number; feeMult: number }[] = []
  private minted = 0
  private burned = 0
  private inflight = 0
  private wrongTokenMicro = 0

  constructor(env: SimEnv, rng: Rng, cfg: ChainConfig = defaultChainConfig()) {
    this.env = env
    this.rng = rng
    this.cfg = cfg
    this.seedInt = hashString32(`${rng.path}/taint`)
    for (const n of NETWORKS) {
      this.ours.set(n, new Set())
      const addr = this.newAddress(n)
      this.wallets.set(n, addr)
      this.ours.get(n)?.add(addr)
    }
    this.tonSharedAddress = this.newAddress('TON')
    this.ours.get('TON')?.add(this.tonSharedAddress)
  }

  // ───────────────────────────── address helpers ─────────────────────────────
  newAddress(network: Network): string {
    switch (ADDRESS_FAMILY[network]) {
      case 'tron':
        return `T${randomBase58(this.rng, 33)}`
      case 'evm':
        return `0x${randomHex(this.rng, 40)}`
      case 'ton':
        return `UQ${randomBase64Url(this.rng, 46)}`
      case 'solana':
        return randomBase58(this.rng, 44)
    }
  }

  isValidAddress(network: Network, address: string): boolean {
    switch (ADDRESS_FAMILY[network]) {
      case 'tron':
        return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address)
      case 'evm':
        return /^0x[0-9a-fA-F]{40}$/.test(address)
      case 'ton':
        return /^(UQ|EQ)[A-Za-z0-9_-]{46}$/.test(address)
      case 'solana':
        return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)
    }
  }

  /** A fresh random external (customer / third party) address for the network. */
  newExternalAddress(network: Network): string {
    return this.newAddress(network)
  }

  private newTxHash(network: Network): string {
    switch (ADDRESS_FAMILY[network]) {
      case 'ton':
        return randomBase64Url(this.rng, 43)
      case 'solana':
        return randomBase58(this.rng, 88)
      default:
        return randomHex(this.rng, 64)
    }
  }

  walletAddress(network: Network): string {
    return this.wallets.get(network) as string
  }

  private keyFor(network: Network, address: string): string | null {
    if (this.ours.get(network)?.has(address)) return `${network}:${OURS}`
    return `${network}:${address}`
  }

  isOurAddress(network: Network, address: string): boolean {
    return this.ours.get(network)?.has(address) ?? false
  }

  registerAddress(network: Network, address: string, owner: string): void {
    this.owners.set(`${network}:${address}`, owner)
  }

  // ───────────────────────────── ChainPort ─────────────────────────────
  async allocateDepositAddress(req: { network: Network; orderId: string }): Promise<Result<{ address: string; memo?: string }>> {
    if (!NETWORKS.includes(req.network)) return err(portError('VALIDATION', `unsupported network ${req.network}`))
    const key = `${req.network}:${req.orderId}`
    const existing = this.allocated.get(key)
    if (existing) return ok(existing)
    let rec: { address: string; memo?: string }
    if (req.network === 'TON') {
      this.memoCounter += 1
      rec = { address: this.tonSharedAddress, memo: String(100_000_000 + this.memoCounter * 7919 + this.rng.int(0, 6000)) }
    } else {
      const address = this.newAddress(req.network)
      rec = { address }
      this.registerOurs(req.network, address)
    }
    this.allocated.set(key, rec)
    this.env.stats.inc('chain.addresses_allocated')
    return ok(rec)
  }

  private registerOurs(network: Network, address: string): void {
    this.ours.get(network)?.add(address)
    if (ADDRESS_FAMILY[network] === 'evm') for (const n of NETWORKS) if (ADDRESS_FAMILY[n] === 'evm') this.ours.get(n)?.add(address)
  }

  async listIncoming(req: { network: Network; address?: string; since: EpochMs }): Promise<Result<ChainTransfer[]>> {
    const now = this.env.clock.now()
    const out: ChainTransfer[] = []
    for (const tx of this.txOrder) {
      if (tx.network !== req.network || tx.token !== 'USDT' || tx.at < req.since || tx.at > now) continue
      if (!this.ours.get(tx.network)?.has(tx.to)) continue
      if (req.address !== undefined && tx.to !== req.address) continue
      out.push(this.view(tx, now))
    }
    return ok(out)
  }

  async send(req: { network: Network; to: string; amount: MicroUsdt; memo?: string }): Promise<Result<{ txHash: string; feeMicroUsdt: MicroUsdt }>> {
    if (!NETWORKS.includes(req.network)) return err(portError('VALIDATION', 'unsupported network'))
    if (!Number.isSafeInteger(req.amount) || req.amount <= 0) return err(portError('VALIDATION', 'amount must be a positive integer'))
    if (!this.isValidAddress(req.network, req.to)) return err(portError('VALIDATION', `invalid ${req.network} address`))
    const r = this.transfer({ network: req.network, from: this.walletAddress(req.network), to: req.to, amount: req.amount, memo: req.memo, fromOwner: 'ours' })
    if (!r.ok) return r
    return ok({ txHash: r.value.txHash, feeMicroUsdt: r.value.fee })
  }

  async txStatus(req: { network: Network; txHash: string }): Promise<Result<{ confirmations: number; status: 'pending' | 'confirmed' | 'failed' }>> {
    const tx = this.txs.get(req.txHash)
    if (!tx || tx.network !== req.network) return err(portError('NOT_FOUND', 'unknown tx'))
    const v = this.view(tx, this.env.clock.now())
    return ok({ confirmations: v.confirmations, status: v.status })
  }

  async screenAddress(req: { network: Network; address: string }): Promise<Result<{ risk: 'clear' | 'review' | 'blocked'; reasons: string[] }>> {
    const manual = this.flagged.get(req.address)
    if (manual) return ok({ risk: manual, reasons: [manual === 'blocked' ? 'sanctions_list_match' : 'manual_flag'] })
    const u = hashUniform(this.seedInt, hashString32(req.address))
    const m = this.taintMultiplier
    if (u < this.cfg.taint.blockedProb * m) return ok({ risk: 'blocked', reasons: ['sanctions_list_match'] })
    if (u < (this.cfg.taint.blockedProb + this.cfg.taint.reviewProb) * m) return ok({ risk: 'review', reasons: ['indirect_exposure_to_high_risk_counterparty'] })
    return ok({ risk: 'clear', reasons: [] })
  }

  async walletBalance(network: Network): Promise<Result<MicroUsdt>> {
    return ok(this.balanceOurs(network))
  }

  // ───────────────────────────── agent / internal API ─────────────────────────────
  balanceOurs(network: Network): MicroUsdt {
    return this.balances.get(`${network}:${OURS}`) ?? 0
  }
  balanceOf(network: Network, address: string): MicroUsdt {
    const k = this.keyFor(network, address)
    return k ? (this.balances.get(k) ?? 0) : 0
  }

  /** Flag an address for AML screening (testing / scenario control). */
  flagAddress(address: string, risk: 'review' | 'blocked'): void {
    this.flagged.set(address, risk)
  }

  /** Mint USDT into our pool (genesis seeding for tests / the initial float). Counted as external inflow. */
  fundWallet(network: Network, amount: MicroUsdt): void {
    this.credit(`${network}:${OURS}`, amount)
    this.minted += amount
    this.env.log.emit('chain.genesis', 'chain', { network, amount })
  }

  /** Subscribe to transfers addressed to `address` (fires at broadcast time, status pending). */
  onIncoming(address: string, fn: (t: ChainTransfer) => void): () => void {
    const arr = this.incomingListeners.get(address) ?? []
    arr.push(fn)
    this.incomingListeners.set(address, arr)
    return () => {
      const a = this.incomingListeners.get(address)
      const i = a ? a.indexOf(fn) : -1
      if (a && i >= 0) a.splice(i, 1)
    }
  }

  requiredConfirmations(network: Network): number {
    return this.cfg.networks[network].requiredConfirmations
  }
  blockTimeMs(network: Network): number {
    const c = this.congestionFor(network)
    return this.cfg.networks[network].blockTimeSec * 1000 * c.delayMult
  }
  networkFeeMicro(network: Network): number {
    return Math.round(this.cfg.networks[network].feeMicroUsdt * this.congestionFor(network).feeMult)
  }
  /** Exact time the tx reaches the required confirmations (Infinity when it fails). */
  confirmAt(txHash: string): EpochMs | null {
    const tx = this.txs.get(txHash)
    return tx ? (tx.failed ? Number.POSITIVE_INFINITY : tx.confirmedAt) : null
  }
  getTx(txHash: string): ChainTransfer | undefined {
    const tx = this.txs.get(txHash)
    return tx ? this.view(tx, this.env.clock.now()) : undefined
  }

  /** Customer -> our address (or any address). Returns the created transfer. `at` defaults to now. */
  injectIncoming(req: { network: Network; to: string; amount: MicroUsdt; from?: string; memo?: string; token?: string; at?: EpochMs; fee?: MicroUsdt }): Result<ChainTransfer & { confirmAt: EpochMs }> {
    const from = req.from ?? this.newExternalAddress(req.network)
    const r = this.transfer({ network: req.network, from, to: req.to, amount: req.amount, memo: req.memo, fromOwner: 'customer', bottomless: true, fee: 0, token: req.token, at: req.at })
    if (!r.ok) return r
    return ok({ ...this.view(r.value, this.env.clock.now()), confirmAt: r.value.confirmedAt })
  }

  /** Inject a payment anomaly relative to an expected deposit. Returns the transfers created. */
  injectAnomaly(req: {
    kind: AnomalyKind
    network: Network
    to: string
    expectedAmount: MicroUsdt
    memo?: string
    from?: string
    /** underpay/overpay fraction (default 0.05). */
    fraction?: number
    at?: EpochMs
    /** network used by wrong_network (default: another network). */
    otherNetwork?: Network
  }): Result<(ChainTransfer & { confirmAt: EpochMs })[]> {
    const at = req.at
    const frac = req.fraction ?? 0.05
    const results: (ChainTransfer & { confirmAt: EpochMs })[] = []
    const push = (r: Result<ChainTransfer & { confirmAt: EpochMs }>): Result<never> | null => {
      if (!r.ok) return r as Result<never>
      results.push(r.value)
      return null
    }
    let bad: Result<never> | null = null
    switch (req.kind) {
      case 'underpay':
        bad = push(this.injectIncoming({ network: req.network, to: req.to, amount: Math.max(1, Math.round(req.expectedAmount * (1 - frac))), from: req.from, memo: req.memo, at }))
        break
      case 'overpay':
        bad = push(this.injectIncoming({ network: req.network, to: req.to, amount: Math.round(req.expectedAmount * (1 + frac)), from: req.from, memo: req.memo, at }))
        break
      case 'wrong_token':
        bad = push(this.injectIncoming({ network: req.network, to: req.to, amount: req.expectedAmount, from: req.from, memo: req.memo, at, token: 'USDC' }))
        break
      case 'wrong_network': {
        const other = req.otherNetwork ?? (req.network === 'BEP20' ? 'ERC20' : 'BEP20')
        bad = push(this.injectIncoming({ network: other, to: req.to, amount: req.expectedAmount, from: req.from, memo: req.memo, at }))
        break
      }
      case 'duplicate': {
        const first = this.injectIncoming({ network: req.network, to: req.to, amount: req.expectedAmount, from: req.from, memo: req.memo, at })
        bad = push(first)
        if (!bad) {
          const t2 = (at ?? this.env.clock.now()) + this.rng.int(60_000, 10 * 60_000)
          bad = push(this.injectIncoming({ network: req.network, to: req.to, amount: req.expectedAmount, from: req.from, memo: req.memo, at: t2 }))
        }
        break
      }
    }
    this.env.stats.inc(`chain.anomaly.${req.kind}`)
    this.env.log.emit('chain.anomaly', 'chain', { kind: req.kind, network: req.network, to: req.to, expected: req.expectedAmount })
    return bad ?? ok(results)
  }

  /** Core transfer. Debits a tracked sender at broadcast; credits the receiver at confirmation. */
  transfer(req: TransferRequest): Result<ChainTx> {
    const net = req.network
    if (!(req.amount > 0) || !Number.isSafeInteger(req.amount)) return err(portError('VALIDATION', 'amount must be a positive integer'))
    if (!this.isValidAddress(net, req.to)) return err(portError('VALIDATION', `invalid ${net} destination address`))
    const owner = req.fromOwner ?? 'external'
    const bottomless = req.bottomless ?? !(owner === 'ours' || this.owners.get(`${net}:${req.from}`)?.startsWith('provider:'))
    const now = this.env.clock.now()
    const at = Math.max(req.at ?? now, now)
    const token = req.token ?? 'USDT'
    const feeDefault = this.networkFeeJittered(net)
    const fee = bottomless ? (req.fee ?? 0) : (req.fee ?? feeDefault)
    const fromKey = this.keyFor(net, req.from)
    const toKey = token === 'USDT' ? this.keyFor(net, req.to) : null
    let debited = 0
    if (!bottomless && token === 'USDT') {
      if (!fromKey) return err(portError('VALIDATION', 'unknown sender'))
      const bal = this.balances.get(fromKey) ?? 0
      if (bal < req.amount + fee) return err(portError('INSUFFICIENT_FUNDS', `balance ${bal} < ${req.amount + fee}`))
      this.balances.set(fromKey, bal - req.amount - fee)
      debited = req.amount + fee
    }
    const cfg = this.cfg.networks[net]
    const bt = this.blockTimeMs(net)
    const includedAt = at + Math.round(bt * (1 + this.rng.next() * 1.5))
    const failed = !bottomless && this.rng.bool(cfg.failProb)
    const confirmedAt = includedAt + Math.max(0, this.requiredConfirmations(net) - 1) * bt
    const tx: ChainTx = {
      txHash: req.txHash ?? this.newTxHash(net),
      network: net,
      from: req.from,
      to: req.to,
      amount: req.amount,
      memo: req.memo,
      token,
      at,
      includedAt,
      confirmedAt,
      failed,
      fee,
      bottomless,
      fromOwner: owner,
      settled: false,
      debited,
      toKey,
      fromKey,
    }
    if (token === 'USDT') {
      if (bottomless) this.minted += req.amount
      this.inflight += req.amount
    } else this.wrongTokenMicro += req.amount
    this.txs.set(tx.txHash, tx)
    this.txOrder.push(tx)
    this.env.stats.inc('chain.tx')
    this.env.log.emit('chain.tx', 'chain', { hash: tx.txHash, network: net, from: owner, to: req.to, amount: req.amount, token, fee, failed })
    if (token !== 'USDT') {
      this.env.stats.inc('chain.wrong_token_deposits')
      tx.settled = true
    } else this.env.sim.at(tx.confirmedAt, () => this.settle(tx), { label: `chain.settle.${net}` })
    for (const fn of this.incomingListeners.get(req.to) ?? []) fn(this.view(tx, now))
    return ok(tx)
  }

  private settle(tx: ChainTx): void {
    if (tx.settled) return
    tx.settled = true
    this.inflight -= tx.amount
    if (tx.failed) {
      if (tx.bottomless) this.minted -= tx.amount
      else if (tx.fromKey) {
        this.balances.set(tx.fromKey, (this.balances.get(tx.fromKey) ?? 0) + tx.amount)
        this.burned += tx.fee
      }
      this.env.stats.inc('chain.tx_failed')
      this.env.log.emit('chain.tx_failed', 'chain', { hash: tx.txHash, network: tx.network, amount: tx.amount })
      return
    }
    if (!tx.bottomless) this.burned += tx.fee
    if (tx.toKey) this.credit(tx.toKey, tx.amount)
    this.env.stats.inc('chain.tx_confirmed')
    this.env.log.emit('chain.tx_confirmed', 'chain', { hash: tx.txHash, network: tx.network, amount: tx.amount })
  }

  private credit(key: string, amount: number): void {
    this.balances.set(key, (this.balances.get(key) ?? 0) + amount)
  }

  private networkFeeJittered(net: Network): number {
    const c = this.cfg.networks[net]
    const base = this.networkFeeMicro(net)
    return Math.max(0, Math.round(base * (1 + (this.rng.next() * 2 - 1) * c.feeJitter)))
  }

  private congestionFor(network: Network): { delayMult: number; feeMult: number } {
    let delayMult = 1
    let feeMult = 1
    for (const c of this.congestion) {
      if (c.network === '*' || c.network === network) {
        delayMult *= c.delayMult
        feeMult *= c.feeMult
      }
    }
    return { delayMult, feeMult }
  }

  private view(tx: ChainTx, now: EpochMs): ChainTransfer {
    let confirmations = 0
    if (now >= tx.includedAt) confirmations = 1 + Math.floor((now - tx.includedAt) / Math.max(1, this.blockTimeMs(tx.network)))
    let status: ChainTransfer['status'] = 'pending'
    if (tx.failed && now >= tx.includedAt) status = 'failed'
    else if (!tx.failed && now >= tx.confirmedAt) status = 'confirmed'
    if (status === 'failed') confirmations = 0
    return { txHash: tx.txHash, network: tx.network, from: tx.from, to: tx.to, amount: tx.amount, memo: tx.memo, at: tx.at, confirmations, status }
  }

  // ───────────────────────────── audit ─────────────────────────────
  /** Conservation: holdings + inflight + burned === minted. */
  audit(): { holdings: MicroUsdt; inflight: MicroUsdt; burned: MicroUsdt; minted: MicroUsdt; wrongTokenMicro: number; ok: boolean } {
    let holdings = 0
    for (const v of this.balances.values()) holdings += v
    return { holdings, inflight: this.inflight, burned: this.burned, minted: this.minted, wrongTokenMicro: this.wrongTokenMicro, ok: holdings + this.inflight + this.burned === this.minted }
  }

  /** Balance held at non-our addresses (providers' custody, exchange targets, third parties). */
  balanceAt(network: Network, address: string): MicroUsdt {
    return this.balances.get(`${network}:${address}`) ?? 0
  }

  // ───────────────────────────── events ─────────────────────────────
  applyEvent(type: string, params: Params): EventHandle | null {
    switch (type) {
      case 'chain_congestion': {
        const network = (pStr(params, 'network') as Network | undefined) ?? '*'
        const entry: { network: Network | '*'; delayMult: number; feeMult: number } = { network, delayMult: pNum(params, 'delayMult', 4), feeMult: pNum(params, 'feeMult', 5) }
        this.congestion.push(entry)
        this.env.log.emit('chain.congestion', 'chain', { network, delayMult: entry.delayMult, feeMult: entry.feeMult })
        return {
          id: newHandleId('chain_congestion'),
          revert: () => {
            const i = this.congestion.indexOf(entry)
            if (i >= 0) this.congestion.splice(i, 1)
          },
        }
      }
      case 'sanctions_freeze':
      case 'taint_surge': {
        const mult = pNum(params, 'taintMultiplier', 20)
        const prev = this.taintMultiplier
        this.taintMultiplier = prev * mult
        return {
          id: newHandleId('taint'),
          revert: () => {
            this.taintMultiplier = prev
          },
        }
      }
      default:
        return null
    }
  }

  /** Test helper: deterministic tx listing. */
  allTransfers(): ChainTransfer[] {
    const now = this.env.clock.now()
    return this.txOrder.map((t) => this.view(t, now))
  }
}

