/**
 * SellerChoice: multinomial logit over {us} ∪ competitors ∪ {outside option}.
 *   U_i = −β_p·ln(priceIndex_i) − β_s·ln(sla_i / refSla) + β_t·(trust_i − refTrust) + asc_i
 *   P_i = exp(U_i) / (exp(U_out) + Σ_j exp(U_j))
 * The outside-option utility is calibrated per segment so that, when we and every competitor sit at the reference
 * offer (priceIndex 1, reference SLA, reference trust), P(us) = segment.baseConversion.
 */
import type { Rng } from '@hiclaude/contracts'
import { clamp, softmax } from './common'
import type { CompetitorOffer, MarketSignals, Segment, SegmentsConfig } from './types'

export interface Offer {
  id: string
  priceIndex: number
  slaMinutes: number
  trust: number
  /** alternative-specific constant (loyalty, referral trust transfer, brand) */
  asc?: number
}

export interface ChoiceParams {
  betaPrice: number
  betaSpeed: number
  betaTrust: number
  refSlaMinutes: number
  refTrust: number
  /** utility of buying nothing / elsewhere-off-platform */
  outsideUtility: number
}

export interface ChoiceResult {
  /** 'us' | competitor id | 'outside' */
  outcome: string
  probs: Record<string, number>
}

export const PRICE_INDEX_MIN = 0.2
export const PRICE_INDEX_MAX = 5

export function utility(o: Offer, p: ChoiceParams): number {
  const pi = clamp(o.priceIndex, PRICE_INDEX_MIN, PRICE_INDEX_MAX)
  const sla = Math.max(1, o.slaMinutes)
  return -p.betaPrice * Math.log(pi) - p.betaSpeed * Math.log(sla / p.refSlaMinutes) + p.betaTrust * (o.trust - p.refTrust) + (o.asc ?? 0)
}

/** exp(u0) = 1/p* − 1 − k  ⇒ u0 = ln(1/p* − 1 − k); requires p* < 1/(1+k). */
export function calibrateOutsideUtility(baseConversion: number, competitors: number): number {
  const x = 1 / baseConversion - 1 - competitors
  if (x <= 0) throw new RangeError(`baseConversion ${baseConversion} too high for ${competitors} competitors (needs < ${1 / (1 + competitors)})`)
  return Math.log(x)
}

export function choiceParams(seg: Segment, cfg: SegmentsConfig, competitors = cfg.competitorsConsidered): ChoiceParams {
  // Cap k so calibration stays feasible for high base conversions.
  const kMax = Math.max(0, Math.ceil(1 / seg.baseConversion - 1) - 1)
  return {
    betaPrice: seg.beta.price,
    betaSpeed: seg.beta.speed,
    betaTrust: seg.beta.trust,
    refSlaMinutes: cfg.referenceSlaMinutes,
    refTrust: cfg.referenceTrust,
    outsideUtility: calibrateOutsideUtility(seg.baseConversion, Math.min(competitors, kMax)),
  }
}

/** Probabilities for [offers..., outside]; `offers[0]` is conventionally us. */
export function choiceProbabilities(offers: readonly Offer[], p: ChoiceParams, outsideShift = 0): { probs: number[]; outside: number } {
  const u = offers.map((o) => utility(o, p))
  u.push(p.outsideUtility + outsideShift)
  const pr = softmax(u)
  const outside = pr.pop() as number
  return { probs: pr, outside }
}

export function sampleChoice(rng: Rng, offers: readonly Offer[], p: ChoiceParams, outsideShift = 0): ChoiceResult {
  const { probs, outside } = choiceProbabilities(offers, p, outsideShift)
  const ids = [...offers.map((o) => o.id), 'outside']
  const all = [...probs, outside]
  const outcome = rng.weighted(ids, all)
  const rec: Record<string, number> = {}
  ids.forEach((id, i) => (rec[id] = all[i] as number))
  return { outcome, probs: rec }
}

/** d ln P_us / d ln price_us = −β_p (1 − P_us) — analytic own-price elasticity of our choice probability. */
export const ownPriceElasticity = (betaPrice: number, pUs: number): number => -betaPrice * (1 - pUs)

/** Competitor offers for a family from MarketSignals (explicit list, or the aggregate replicated k times). */
export function competitorOffersFor(signals: MarketSignals, family: string, cfg: SegmentsConfig): CompetitorOffer[] {
  const explicit = signals.competitorOffers?.(family)
  if (explicit && explicit.length > 0) return explicit
  const k = cfg.competitorsConsidered
  const idx = signals.competitorPriceIndex(family)
  const trust = signals.competitorTrust(family)
  const out: CompetitorOffer[] = []
  for (let i = 0; i < k; i++) out.push({ id: `competitor_${i + 1}`, priceIndex: idx, slaMinutes: cfg.referenceSlaMinutes, trust })
  return out
}

/** Our offer from a real quote; null when we cannot sell (then P(us)=0 by construction). */
export function ourOffer(
  signals: MarketSignals,
  req: { family: string; amountUsdCents: number; rushTier: string },
  asc = 0,
): Offer | null {
  const q = signals.ourQuote(req)
  if (!q) return null
  const ref = (req.amountUsdCents / 100) * signals.refRateIrtPerUsd
  if (!(ref > 0)) return null
  return { id: 'us', priceIndex: q.priceIrt / ref, slaMinutes: q.slaMinutes, trust: signals.ourTrust, asc }
}

export interface ChoiceContext {
  isReturning: boolean
  /** previous orders with us (loyalty) */
  orders: number
  satisfaction: number
  referred: boolean
  /** macro / scenario shift of the outside option (e.g. urgency during FX stress < 0 shifts demand towards buying) */
  outsideShift?: number
}

export function loyaltyAsc(ctx: ChoiceContext, cfg: SegmentsConfig): number {
  const b = cfg.behaviour
  let asc = 0
  if (ctx.isReturning) asc += Math.min(b.returningLoyaltyAscCap, b.returningLoyaltyAscPerOrder * Math.max(1, ctx.orders)) * (0.5 + ctx.satisfaction)
  if (ctx.referred) asc += b.referredConversionAsc
  return asc
}

/** Full evaluation for one prospective purchase (used by CustomerPlanner). */
export function evaluateChoice(
  rng: Rng,
  seg: Segment,
  cfg: SegmentsConfig,
  signals: MarketSignals,
  req: { family: string; amountUsdCents: number; rushTier: string },
  ctx: ChoiceContext,
): ChoiceResult {
  const comps = competitorOffersFor(signals, req.family, cfg)
  const params = choiceParams(seg, cfg, comps.length)
  const us = ourOffer(signals, req, loyaltyAsc(ctx, cfg))
  const offers: Offer[] = []
  if (us) offers.push(us)
  for (const c of comps) offers.push({ id: c.id, priceIndex: c.priceIndex, slaMinutes: c.slaMinutes, trust: c.trust })
  const res = sampleChoice(rng, offers, params, ctx.outsideShift ?? 0)
  if (!us) res.probs.us = 0
  return res
}
