/**
 * Quote helpers: reconciliation of itemised lines, per-method totals, price-lock countdown and the auto re-quote state machine.
 * Pure functions + a reducer so the behaviour is unit-tested without React.
 */
import type { PaymentMethod, QuoteDto, QuoteLineDto, QuoteMethodDto, QuoteRequest } from '@hiclaude/contracts'
import { t } from '../copy'

// ───────────────────────── reconciliation ─────────────────────────
export function sumLines(lines: readonly QuoteLineDto[]): number {
  return lines.reduce((s, l) => s + l.amountIrt, 0)
}

export interface ReconciledLines {
  lines: QuoteLineDto[]
  /** total the lines add up to (after the derived balancing line, if any) */
  total: number
  /** difference that had to be added as a derived line (0 when the server's lines already reconcile) */
  derivedDiff: number
}

/**
 * The totals shown to the customer must always equal the sum of the lines shown. If the server hid internal lines
 * (allowed by architecture §7) without folding them into a visible one, we add an explicit «سایر هزینه‌ها» line so nothing is silently missing.
 * The comparison target is `totalIrt` (Toman methods and Toman-equivalent for USDT).
 */
export function reconcileLines(m: QuoteMethodDto): ReconciledLines {
  const lines = m.lines.filter((l) => l.amountIrt !== 0 || l.code === 'rounding')
  const target = m.totalIrt
  if (target === undefined) return { lines, total: sumLines(lines), derivedDiff: 0 }
  const diff = target - sumLines(lines)
  if (diff === 0) return { lines, total: target, derivedDiff: 0 }
  return { lines: [...lines, { code: 'other', labelFa: t('quote.otherLine'), amountIrt: diff }], total: target, derivedDiff: diff }
}

export function methodOf(q: QuoteDto | undefined, method: PaymentMethod | undefined): QuoteMethodDto | undefined {
  return q?.perMethod.find((m) => m.method === method)
}

/** Toman-equivalent used to rank methods (USDT total converted at its own effective rate when totalIrt is absent). */
export function methodIrtEquivalent(m: QuoteMethodDto): number | undefined {
  if (m.totalIrt !== undefined) return m.totalIrt
  if (m.totalMicroUsdt !== undefined) return Math.round((m.totalMicroUsdt / 1_000_000) * m.effectiveRateIrtPerUsd)
  return undefined
}

export function availableMethods(q: QuoteDto | undefined): QuoteMethodDto[] {
  return (q?.perMethod ?? []).filter((m) => m.available)
}

export function cheapestMethod(q: QuoteDto | undefined): QuoteMethodDto | undefined {
  let best: QuoteMethodDto | undefined
  let bestV = Infinity
  for (const m of availableMethods(q)) {
    const v = methodIrtEquivalent(m)
    if (v !== undefined && v < bestV) {
      best = m
      bestV = v
    }
  }
  return best
}

/** The «from» price a product card should show: cheapest available Toman-equivalent total. */
export function fromPrice(q: QuoteDto | undefined): number | undefined {
  const m = cheapestMethod(q)
  return m ? methodIrtEquivalent(m) : undefined
}

/** How much the USDT-pay option saves vs the best Toman option (Toman-equivalent), for the «pay with USDT» message. */
export function usdtSaving(q: QuoteDto | undefined): { irt: number; pct: number } | undefined {
  const usdt = q?.perMethod.find((m) => m.method === 'usdt' && m.available)
  if (!usdt) return undefined
  const usdtV = methodIrtEquivalent(usdt)
  const tomans = q!.perMethod.filter((m) => m.available && m.method !== 'usdt').map(methodIrtEquivalent).filter((v): v is number => v !== undefined)
  if (usdtV === undefined || tomans.length === 0) return undefined
  const best = Math.min(...tomans)
  if (usdtV >= best) return undefined
  return { irt: best - usdtV, pct: ((best - usdtV) / best) * 100 }
}

// ───────────────────────── lock countdown ─────────────────────────
export const msLeft = (q: Pick<QuoteDto, 'lockedUntil'> | undefined, serverNow: number): number => (q ? Math.max(0, q.lockedUntil - serverNow) : 0)
export const isExpired = (q: Pick<QuoteDto, 'lockedUntil'> | undefined, serverNow: number): boolean => !q || serverNow >= q.lockedUntil
/** Fraction of the lock window still left (0..1) for progress rings. */
export function lockFraction(q: Pick<QuoteDto, 'createdAt' | 'lockedUntil'>, serverNow: number): number {
  const total = Math.max(1, q.lockedUntil - q.createdAt)
  return Math.min(1, Math.max(0, (q.lockedUntil - serverNow) / total))
}
/** Re-quote slightly before the lock ends so the user never checks out on a dead price. */
export const REQUOTE_LEAD_MS = 3_000
export const shouldAutoRequote = (q: QuoteDto | undefined, serverNow: number): boolean => !!q && q.lockedUntil - serverNow <= REQUOTE_LEAD_MS

// ───────────────────────── diff ─────────────────────────
export interface PriceDiff {
  method: PaymentMethod
  currency: 'IRT' | 'USDT'
  previous: number
  next: number
  delta: number
  pct: number
  direction: 'up' | 'down'
}

function primaryTotal(m: QuoteMethodDto): number | undefined {
  return m.currency === 'USDT' ? m.totalMicroUsdt : m.totalIrt
}

export function diffQuotes(prev: QuoteDto | undefined, next: QuoteDto | undefined): PriceDiff[] {
  if (!prev || !next) return []
  const out: PriceDiff[] = []
  for (const n of next.perMethod) {
    if (!n.available) continue
    const p = prev.perMethod.find((x) => x.method === n.method && x.available)
    if (!p) continue
    const a = primaryTotal(p)
    const b = primaryTotal(n)
    if (a === undefined || b === undefined || a === b) continue
    out.push({ method: n.method, currency: n.currency, previous: a, next: b, delta: b - a, pct: ((b - a) / a) * 100, direction: b > a ? 'up' : 'down' })
  }
  return out
}

// ───────────────────────── request key + state machine ─────────────────────────
export function paramsKey(r: Pick<QuoteRequest, 'productId' | 'rushTier'> & { amountUsdCents?: number; inputs?: Record<string, string> }): string {
  const inputs = Object.entries(r.inputs ?? {})
    .filter(([, v]) => v !== '')
    .sort(([a], [b]) => a.localeCompare(b))
  return JSON.stringify([r.productId, r.amountUsdCents ?? null, r.rushTier, inputs])
}

export interface QuoteState {
  phase: 'idle' | 'loading' | 'ready' | 'refreshing' | 'error'
  quote?: QuoteDto
  /** key of the params the current `quote` was computed for */
  key?: string
  /** previous quote of the SAME params, kept while a price change is unacknowledged */
  previous?: QuoteDto
  diffs: PriceDiff[]
  /** user has accepted the changed price (checkout may proceed) */
  acknowledged: boolean
  error?: string
}

export type QuoteAction =
  | { type: 'request'; key: string }
  | { type: 'success'; key: string; quote: QuoteDto }
  | { type: 'failure'; key: string; error: string }
  | { type: 'acknowledge' }
  | { type: 'reset' }

export const initialQuoteState: QuoteState = { phase: 'idle', diffs: [], acknowledged: true }

export function reduceQuote(state: QuoteState, a: QuoteAction): QuoteState {
  switch (a.type) {
    case 'reset':
      return initialQuoteState
    case 'request': {
      const sameParams = state.key === a.key && !!state.quote
      // same params ⇒ it's a refresh (keep showing the old price while loading); new params ⇒ start clean
      return sameParams ? { ...state, phase: 'refreshing', error: undefined } : { phase: 'loading', key: a.key, diffs: [], acknowledged: true }
    }
    case 'success': {
      if (state.key !== a.key) return state // stale response for params the user already left
      const diffs = state.quote && state.key === a.key ? diffQuotes(state.quote, a.quote) : []
      const changed = diffs.length > 0
      return {
        phase: 'ready',
        quote: a.quote,
        key: a.key,
        previous: changed ? state.quote : undefined,
        diffs: changed ? diffs : state.diffs.length && !state.acknowledged ? state.diffs : [],
        acknowledged: changed ? false : state.acknowledged,
      }
    }
    case 'failure':
      if (state.key !== a.key) return state
      return { ...state, phase: 'error', error: a.error }
    case 'acknowledge':
      return { ...state, acknowledged: true, diffs: [], previous: undefined }
  }
}
