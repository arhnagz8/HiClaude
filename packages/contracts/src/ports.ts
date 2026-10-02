/**
 * Ports (interfaces to the outside world). [CONTRACT]
 * Implemented by `packages/sim` (mock, world-driven) and `packages/live` (real, fixture-tested).
 * All fallible calls return Result<T, PortError>; infrastructure failures are mapped to {ok:false}. Ports never throw for business outcomes.
 */
import type { Result } from './errors'
import type { CardSecrets, ExchangeTicker } from './domain'
import type { Bps, EpochMs, Irt, MicroUsdt, Network, UsdCents } from './units'
import type { Clock } from './time'
import type { IdGen } from './ids'
import type { Rng } from './rng'
import type { PlatformParams } from './params'

// ───────────────────────────── exchanges (our account at an Iranian exchange) ─────────────────────────────
export interface ExchangeLimits {
  exchangeId: string
  tradingOpen: boolean
  nextTradingOpenAt?: EpochMs
  /** Remaining USDT we may still buy today (null = unlimited). */
  buyCapRemainingMicroUsdt: MicroUsdt | null
  /** Remaining IRT deposit allowance in the current 24h window (null = unlimited). */
  depositCapRemainingIrt: Irt | null
  /** Hours USDT bought/deposited with Toman is locked before it can be withdrawn on-chain. */
  withdrawalLockHours: number
  withdrawCapRemainingMicroUsdt: MicroUsdt | null
  minOrderIrt: Irt
  takerFeeBps: Bps
  withdrawFeeMicroUsdt: Partial<Record<Network, MicroUsdt>>
  withdrawMinMicroUsdt: Partial<Record<Network, MicroUsdt>>
}

export interface ExchangeBalances {
  irt: Irt
  usdt: MicroUsdt
  /** Part of usdt that is NOT under the post-deposit withdrawal lock. */
  usdtWithdrawable: MicroUsdt
}

export type DepositMethod = 'gateway' | 'paya' | 'satna' | 'card_to_card' | 'id_deposit'

export interface DepositResult {
  depositId: string
  amountIrt: Irt
  status: 'pending' | 'credited'
  creditedAt?: EpochMs
  feeIrt: Irt
  /** When funds become usable (e.g. Paya cycle). */
  availableAt?: EpochMs
}

export interface TradeResult {
  tradeId: string
  side: 'buy' | 'sell'
  /** Toman actually spent (buy) or received (sell), including fee. */
  irt: Irt
  usdt: MicroUsdt
  price: number // Toman per USDT executed
  feeIrt: Irt
  at: EpochMs
  /** When the USDT becomes withdrawable (buy side). */
  withdrawableAt?: EpochMs
}

export interface WithdrawalTicket {
  withdrawalId: string
  network: Network
  address: string
  amount: MicroUsdt
  feeMicroUsdt: MicroUsdt
  status: 'pending' | 'broadcast' | 'completed' | 'failed'
  txHash?: string
  requestedAt: EpochMs
  completedAt?: EpochMs
}

export interface ExchangeAccountPort {
  readonly id: string
  ticker(): Promise<Result<ExchangeTicker>>
  limits(): Promise<Result<ExchangeLimits>>
  balances(): Promise<Result<ExchangeBalances>>
  depositIrt(req: { amountIrt: Irt; method: DepositMethod; fromAccountId?: string }): Promise<Result<DepositResult>>
  /** Spend up to `irtBudget` Toman (fee included) buying USDT at market (optionally with a max price). */
  buyUsdt(req: { irtBudget: Irt; maxPrice?: number }): Promise<Result<TradeResult>>
  sellUsdt(req: { amountMicroUsdt: MicroUsdt; minPrice?: number }): Promise<Result<TradeResult>>
  withdrawUsdt(req: { amountMicroUsdt: MicroUsdt; network: Network; address: string }): Promise<Result<WithdrawalTicket>>
  withdrawal(withdrawalId: string): Promise<Result<WithdrawalTicket>>
  withdrawIrt(req: { amountIrt: Irt; toIban: string }): Promise<Result<{ withdrawalId: string; settleAt: EpochMs; feeIrt: Irt }>>
}

// ───────────────────────────── payment gateway (Shaparak PSP) ─────────────────────────────
export interface GatewayCreateRequest {
  orderId: string
  amountIrt: Irt
  description: string
  callbackUrl: string
  payerPhone?: string
}
export interface GatewayVerifyResult {
  status: 'paid' | 'failed' | 'pending'
  amountIrt?: Irt
  refId?: string
  cardPanMasked?: string
  feeIrt?: Irt
  paidAt?: EpochMs
}
export interface PaymentGatewayPort {
  readonly id: string
  create(req: GatewayCreateRequest): Promise<Result<{ authority: string; payUrl: string }>>
  verify(req: { authority: string; amountIrt: Irt }): Promise<Result<GatewayVerifyResult>>
}

// ───────────────────────────── bank (our account: c2c / Paya statement) ─────────────────────────────
export interface BankCredit {
  ref: string
  amountIrt: Irt
  at: EpochMs
  channel: 'card_to_card' | 'paya' | 'satna' | 'gateway_settlement' | 'other'
  senderCardMasked?: string
  senderName?: string
  destinationCardId?: string
  note?: string
}
export interface BankPort {
  readonly id: string
  listCredits(req: { since: EpochMs }): Promise<Result<BankCredit[]>>
  balance(): Promise<Result<Irt>>
  /** Outgoing transfer (refunds, exchange deposit via Paya, salaries, taxes). */
  transferOut(req: { toIban: string; amountIrt: Irt; reason: string }): Promise<Result<{ ref: string; settleAt: EpochMs; feeIrt: Irt }>>
}

// ───────────────────────────── chain ─────────────────────────────
export interface ChainTransfer {
  txHash: string
  network: Network
  from: string
  to: string
  amount: MicroUsdt
  memo?: string
  at: EpochMs
  confirmations: number
  status: 'pending' | 'confirmed' | 'failed'
}
export interface ChainPort {
  allocateDepositAddress(req: { network: Network; orderId: string }): Promise<Result<{ address: string; memo?: string }>>
  listIncoming(req: { network: Network; address?: string; since: EpochMs }): Promise<Result<ChainTransfer[]>>
  send(req: { network: Network; to: string; amount: MicroUsdt; memo?: string }): Promise<Result<{ txHash: string; feeMicroUsdt: MicroUsdt }>>
  txStatus(req: { network: Network; txHash: string }): Promise<Result<{ confirmations: number; status: 'pending' | 'confirmed' | 'failed' }>>
  /** AML/sanctions screening of a counterparty address (OFAC SDN digital-currency list + analytics). */
  screenAddress(req: { network: Network; address: string }): Promise<Result<{ risk: 'clear' | 'review' | 'blocked'; reasons: string[] }>>
  /** Our own hot wallet address for a network. */
  walletAddress(network: Network): string
  walletBalance(network: Network): Promise<Result<MicroUsdt>>
}

// ───────────────────────────── card providers / vendors ─────────────────────────────
export interface ProviderCapabilities {
  issue: 'api' | 'panel' | 'none'
  topUp: 'api' | 'panel' | 'none'
  reveal: 'api' | 'panel' | 'none'
  freeze: 'api' | 'panel' | 'none'
  webhooks: boolean
}
export interface ProviderCard {
  cardRef: string
  last4: string
  brand: 'visa' | 'mastercard'
  region?: string
  balanceUsdCents: UsdCents
  status: 'active' | 'frozen' | 'closed'
  createdAt: EpochMs
}
export interface ProviderPort {
  readonly id: string
  readonly capabilities: ProviderCapabilities
  /** Our funded balance at the provider (USDT-denominated). */
  accountBalance(): Promise<Result<MicroUsdt>>
  /** Where we send USDT to fund the provider account. */
  depositAddress(network: Network): Promise<Result<{ address: string; memo?: string }>>
  /** Has the provider credited our deposit tx yet? */
  creditStatus(req: { txHash: string }): Promise<Result<{ credited: boolean; amountMicroUsdt?: MicroUsdt; creditedAt?: EpochMs }>>
  issueCard(req: { initialLoadUsdCents: UsdCents; label: string; region?: string }): Promise<Result<{ card: ProviderCard; feeMicroUsdt: MicroUsdt }>>
  topUpCard(req: { cardRef: string; amountUsdCents: UsdCents }): Promise<Result<{ card: ProviderCard; feeMicroUsdt: MicroUsdt }>>
  getCard(cardRef: string): Promise<Result<ProviderCard>>
  revealCard(cardRef: string): Promise<Result<CardSecrets>>
  freezeCard(cardRef: string): Promise<Result<ProviderCard>>
  /** Pay a vendor using provider funds (service_payment / subscription / voucher purchase). Operator-assisted providers implement this via their panel facade. */
  payVendor(req: { vendor: string; amountUsdCents: UsdCents; reference: string }): Promise<Result<{ receiptRef: string; feeMicroUsdt: MicroUsdt }>>
}

// ───────────────────────────── messaging / identity ─────────────────────────────
export interface MessengerButton {
  textFa: string
  url?: string
  callbackData?: string
  webAppUrl?: string
}
export interface MessengerPort {
  readonly channel: 'telegram' | 'bale'
  sendMessage(req: { chatId: string; textFa: string; buttons?: MessengerButton[][]; silent?: boolean }): Promise<Result<{ messageId: string }>>
  /** Validates Mini App initData and returns the platform user. */
  verifyInitData(initData: string): Result<{ userId: string; firstName?: string; username?: string; authDate: EpochMs }>
}
export interface SmsPort {
  send(req: { phone: string; textFa: string; template?: string }): Promise<Result<{ messageId: string; costIrt: Irt }>>
}
export interface IdentityPort {
  /** Shahkar: does this mobile number belong to this national id? */
  shahkar(req: { nationalId: string; phone: string }): Promise<Result<{ match: boolean; costIrt: Irt }>>
  /** Does this bank card belong to this national id? (for c2c anti-fraud / refunds) */
  cardOwner(req: { cardPan: string; nationalId: string }): Promise<Result<{ match: boolean; ownerNameMasked?: string; costIrt: Irt }>>
}

// ───────────────────────────── competitor price intelligence ─────────────────────────────
export interface CompetitorPriceQuote {
  competitorId: string
  family: string
  productId?: string
  amountUsdCents: UsdCents
  priceIrt: Irt
  asOf: EpochMs
}
export interface CompetitorPricePort {
  quotes(req: { family: string; productId?: string; amountUsdCents: UsdCents }): Promise<Result<CompetitorPriceQuote[]>>
}

// ───────────────────────────── dependency bundle ─────────────────────────────
export interface Logger {
  debug(msg: string, data?: Record<string, unknown>): void
  info(msg: string, data?: Record<string, unknown>): void
  warn(msg: string, data?: Record<string, unknown>): void
  error(msg: string, data?: Record<string, unknown>): void
}

export interface AppPorts {
  exchanges: Record<string, ExchangeAccountPort>
  gateways: Record<string, PaymentGatewayPort>
  bank: BankPort
  chain: ChainPort
  providers: Record<string, ProviderPort>
  messengers: Partial<Record<'telegram' | 'bale', MessengerPort>>
  sms: SmsPort
  identity: IdentityPort
  competitors?: CompetitorPricePort
}

export interface AppDeps {
  clock: Clock
  rng: Rng
  ids?: IdGen
  params: PlatformParams
  /** ':memory:' or a file path. */
  dbPath: string
  ports: AppPorts
  logger?: Logger
  /** 32-byte hex master key for card-secret envelope encryption. Demo/sim use a fixed dev key. */
  masterKeyHex?: string
  mode: 'live' | 'demo' | 'sim' | 'test'
}
