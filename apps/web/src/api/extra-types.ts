/**
 * Response/request shapes the web app needs that `packages/contracts/src/api.ts` does not define yet.
 * PROPOSED ADDITIONS (B6 should add them to contracts, additively); the mock backend implements exactly these.
 * Every one is documented in apps/web/README.md → "Contract gaps".
 */
import type { MeDto, OrderDto, PaymentInstructionsDto } from '@hiclaude/contracts'

/** POST /auth/otp/request → 200. `retryAfterSeconds` present when the phone is rate-limited (also sent with 429). */
export interface OtpRequestResult {
  ok: true
  /** how long the code is valid, seconds (default 120) */
  ttlSeconds?: number
  /** seconds before another code may be requested */
  resendAfterSeconds?: number
}

/** POST /auth/otp/verify and /auth/messenger → 200. Cookie `sid` is set for browsers; Mini Apps use `token` as Bearer. */
export interface AuthResult {
  me: MeDto
  token?: string
  /** true when the account was just created */
  created?: boolean
}

/** POST /orders/:id/reveal body (step-up): a *fresh* OTP code for the logged-in phone. */
export interface RevealRequest {
  code: string
}

export interface WalletTxDto {
  id: string
  at: number
  kind: 'topup' | 'spend' | 'refund' | 'credit'
  amountIrt: number
  balanceAfterIrt: number
  labelFa: string
  orderId?: string
}
/** GET /wallet */
export interface WalletDto {
  balanceIrt: number
  transactions: WalletTxDto[]
}
/** POST /wallet/topup → payment instructions of the top-up (same shapes as order payments). */
export interface WalletTopupResult {
  topupId: string
  payment: PaymentInstructionsDto
}

/** GET /referral */
export interface ReferralDto {
  code: string
  link: string
  invited: number
  qualified: number
  rewardIrt: number
  rulesFa: string
}

/** GET /orders?status=&page= (array form is also accepted by the client). */
export type OrderList = OrderDto[]
