/**
 * Segment definitions: loaded from data/sim/segments.json (documented defaults, each carrying a `source`),
 * optionally overridden from research output data/ops_growth.json (tolerates absence + Record wrappers).
 */
import { z } from 'zod'
import { clamp, deepUnwrap, numOf, readRepoJson, sum } from './common'
import type { CustomerChannel, Segment, SegmentsConfig } from './types'

const frac = z.number().min(0)
const methodRec = z.object({ gateway: frac, card_to_card: frac, bank_transfer: frac.default(0), usdt: frac, wallet: frac })
const mistakeRec = z.record(z.string(), z.number().min(0).max(1))

const BasketSchema = z.object({
  family: z.string(),
  weight: z.number().positive(),
  medianUsd: z.number().positive(),
  sigma: z.number().min(0),
  minUsd: z.number().positive(),
  maxUsd: z.number().positive(),
})

export const SegmentSchema = z.object({
  id: z.string(),
  labelFa: z.string(),
  labelEn: z.string(),
  share: frac,
  basket: z.array(BasketSchema).min(1),
  rushProbability: z.object({ fast: frac, express: frac }),
  beta: z.object({ price: frac, speed: frac, trust: frac }),
  baseConversion: z.number().gt(0).lt(1),
  paymentPreference: methodRec,
  channelAffinity: z.object({ web: frac, telegram: frac, bale: frac }),
  repeat: z.object({ baseProbability: z.number().min(0).max(0.99), weibullShape: z.number().positive(), weibullScaleDays: z.number().positive(), maxOrders: z.number().int().positive() }),
  referral: z.object({ propensity: z.number().min(0).max(1), meanReferred: frac, delayMeanDays: z.number().positive() }),
  weekendFactor: frac,
  diurnal: z.enum(['default', 'office', 'night']),
  patienceFactor: z.number().positive(),
  carelessness: frac,
  kycWillingness: z.number().min(0).max(1),
  reviewProbability: z.number().min(0).max(1),
  monthSeasonality: z.array(frac).length(12),
  fraud: z
    .object({
      propensity: frac,
      kinds: z.object({ fake_receipt: frac, stolen_card_dispute: frac, account_takeover: frac, velocity_abuse: frac }),
      velocityBurst: z.object({ min: z.number().int().positive(), max: z.number().int().positive(), spacingMinutes: z.number().positive() }),
      disputeProbabilityAfterDelivery: z.number().min(0).max(1),
      note: z.string().optional(),
    })
    .optional(),
  source: z.string(),
})

const hours24 = z.array(frac).length(24)
export const SegmentsFileSchema = z.object({
  organicVisitsPerDay: z.object({ value: z.number().positive() }),
  referenceSlaMinutes: z.object({ value: z.number().positive() }),
  referenceTrust: z.object({ value: z.number().min(0).max(1) }),
  consideration: z.object({ competitorsConsidered: z.number().int().min(0) }),
  weekday: z.object({ weights: z.array(frac).length(7) }),
  diurnalProfiles: z.object({ default: hours24, office: hours24, night: hours24 }),
  mistakes: z.object({ gateway: mistakeRec, card_to_card: mistakeRec, bank_transfer: mistakeRec, usdt: mistakeRec, wallet: mistakeRec }),
  behaviour: z.object({
    ticketProbabilityWhenLate: z.number(),
    ticketProbabilityOnFailure: z.number(),
    disputeProbabilityOnFailure: z.number(),
    leadSignupRate: z.number(),
    newCustomerMistakeMultiplier: z.number(),
    returningMistakeMultiplier: z.number(),
    referredConversionAsc: z.number(),
    returningLoyaltyAscPerOrder: z.number(),
    returningLoyaltyAscCap: z.number(),
  }),
  satisfaction: z.object({
    base: z.number(),
    lateSlaPenaltyMax: z.number(),
    failurePenalty: z.number(),
    refundedPenalty: z.number(),
    priceBonusMax: z.number(),
    supportResolvedBonus: z.number(),
    initial: z.number(),
    emaAlpha: z.number(),
  }),
  segments: z.array(SegmentSchema).min(1),
})

export function parseSegmentsConfig(raw: unknown): SegmentsConfig {
  const f = SegmentsFileSchema.parse(raw)
  const segments = f.segments as unknown as Segment[]
  const total = sum(segments.map((s) => s.share))
  if (Math.abs(total - 1) > 1e-6) throw new Error(`segment shares must sum to 1, got ${total}`)
  const ids = new Set<string>()
  for (const s of segments) {
    if (ids.has(s.id)) throw new Error(`duplicate segment id ${s.id}`)
    ids.add(s.id)
  }
  return {
    organicVisitsPerDay: f.organicVisitsPerDay.value,
    referenceSlaMinutes: f.referenceSlaMinutes.value,
    referenceTrust: f.referenceTrust.value,
    competitorsConsidered: f.consideration.competitorsConsidered,
    weekday: f.weekday.weights,
    diurnalProfiles: f.diurnalProfiles,
    mistakes: f.mistakes as SegmentsConfig['mistakes'],
    behaviour: f.behaviour,
    satisfaction: f.satisfaction,
    segments,
  }
}

/** Load the shipped defaults; optionally apply research overrides (data/ops_growth.json) and caller overrides. */
export function loadSegmentsConfig(opts: { useResearch?: boolean; opsGrowth?: unknown; segmentOverrides?: Record<string, DeepPartial<Segment>> } = {}): SegmentsConfig {
  const raw = readRepoJson('data/sim/segments.json')
  if (!raw) throw new Error('data/sim/segments.json missing')
  let cfg = parseSegmentsConfig(raw)
  const ops = opts.opsGrowth ?? (opts.useResearch === false ? undefined : readRepoJson('data/ops_growth.json'))
  if (ops) cfg = applyOpsGrowthOverrides(cfg, ops)
  if (opts.segmentOverrides) cfg = applySegmentOverrides(cfg, opts.segmentOverrides)
  return cfg
}

export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] }

/** Scenario `demand.segmentOverrides`: shallow-deep merge per segment id, then re-validate. */
export function applySegmentOverrides(cfg: SegmentsConfig, overrides: Record<string, DeepPartial<Segment>>): SegmentsConfig {
  const segments = cfg.segments.map((s) => {
    const o = overrides[s.id]
    return o ? (mergeDeep(s as unknown as Record<string, unknown>, o as Record<string, unknown>) as unknown as Segment) : s
  })
  for (const s of segments) SegmentSchema.parse(s)
  return { ...cfg, segments }
}

function mergeDeep(a: Record<string, unknown>, b: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...a }
  for (const [k, v] of Object.entries(b)) {
    const av = out[k]
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && av && typeof av === 'object' && !Array.isArray(av) ? mergeDeep(av as Record<string, unknown>, v as Record<string, unknown>) : v
  }
  return out
}

// ───────────────────────── research overrides (tolerant) ─────────────────────────

/** Lanczos gamma, used to convert a target mean inter-purchase interval into a Weibull scale. */
export function gamma(z: number): number {
  const g = 7
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7]
  if (z < 0.5) return Math.PI / (Math.sin(Math.PI * z) * gamma(1 - z))
  const zz = z - 1
  let x = c[0] as number
  const t = zz + g + 0.5
  for (let i = 1; i < g + 2; i++) x += (c[i] as number) / (zz + i)
  return Math.sqrt(2 * Math.PI) * Math.pow(t, zz + 0.5) * Math.exp(-t) * x
}

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
const ALIASES: Record<string, string> = {
  freelancer: 'freelance_dev', freelancer_dev: 'freelance_dev', freelance_developer: 'freelance_dev', developer: 'freelance_dev',
  ads_manager: 'ads_manager', small_business_ads_manager: 'ads_manager', small_business: 'ads_manager',
  importer: 'importer_trader', trader: 'importer_trader', immigration: 'exam_applicant', exam: 'exam_applicant', immigration_applicant: 'exam_applicant',
  parent: 'parent_tuition', tuition: 'parent_tuition', subscriber: 'casual_subscriber',
}
function matchSegmentId(raw: string, ids: string[]): string | undefined {
  const n = norm(raw)
  if (ids.includes(n)) return n
  if (ALIASES[n] && ids.includes(ALIASES[n] as string)) return ALIASES[n]
  return ids.find((id) => n.includes(id) || id.includes(n))
}

/**
 * Apply `data/ops_growth.json` (research 10). Understood (all optional, Record wrappers unwrapped):
 *  segments: array of {id, share, aov_usd, orders_per_year, price_sensitivity, preferred_channel} OR object keyed by id;
 *  referral_coefficient (mean referred customers per customer); organic_visits_per_day.
 * Unknown shapes are ignored (the defaults stay). Shares are renormalised including the fraud segment.
 */
export function applyOpsGrowthOverrides(cfg: SegmentsConfig, opsRaw: unknown): SegmentsConfig {
  const ops = deepUnwrap(opsRaw) as Record<string, unknown> | undefined
  if (!ops || typeof ops !== 'object') return cfg
  const ids = cfg.segments.map((s) => s.id)
  const list: Array<Record<string, unknown>> = []
  const segRaw = ops.segments
  if (Array.isArray(segRaw)) {
    for (const r of segRaw) if (r && typeof r === 'object') list.push(r as Record<string, unknown>)
  } else if (segRaw && typeof segRaw === 'object') {
    for (const [k, v] of Object.entries(segRaw as Record<string, unknown>)) if (v && typeof v === 'object') list.push({ id: k, ...(v as Record<string, unknown>) })
  }
  let segments = cfg.segments.map((s) => ({ ...s, basket: s.basket.map((b) => ({ ...b })), repeat: { ...s.repeat }, beta: { ...s.beta }, channelAffinity: { ...s.channelAffinity } }))
  const newShares = new Map<string, number>()
  for (const r of list) {
    const id = typeof r.id === 'string' ? matchSegmentId(r.id, ids) : undefined
    if (!id) continue
    const s = segments.find((x) => x.id === id) as Segment
    const share = numOf(r.share)
    if (share !== undefined && share > 0 && share <= 1) newShares.set(id, share)
    const aov = numOf(r.aov_usd)
    if (aov !== undefined && aov > 0) {
      const wsum = sum(s.basket.map((b) => b.weight))
      const cur = sum(s.basket.map((b) => (b.weight / wsum) * b.medianUsd * Math.exp((b.sigma * b.sigma) / 2)))
      const k = aov / cur
      for (const b of s.basket) b.medianUsd = Math.max(1, b.medianUsd * k)
    }
    const opy = numOf(r.orders_per_year)
    if (opy !== undefined && opy > 0) {
      const p = s.repeat.baseProbability
      // mean orders per customer over the active period ≈ 1/(1-p); spread across a year ⇒ interval ≈ 365 / opy
      s.repeat.weibullScaleDays = clamp(365 / opy / gamma(1 + 1 / s.repeat.weibullShape), 1, 720)
      void p
    }
    const ps = numOf(r.price_sensitivity)
    if (ps !== undefined && ps !== 0) s.beta.price = clamp(Math.abs(ps), 0.5, 40)
    const pc = typeof r.preferred_channel === 'string' ? r.preferred_channel : undefined
    if (pc && (pc === 'web' || pc === 'telegram' || pc === 'bale')) {
      const ch = pc as CustomerChannel
      s.channelAffinity[ch] = Math.max(s.channelAffinity[ch], 0.6)
    }
  }
  if (newShares.size > 0) {
    const fixed = sum([...newShares.values()])
    const rest = segments.filter((s) => !newShares.has(s.id))
    const restTotal = sum(rest.map((s) => s.share))
    const remaining = Math.max(0.0001, 1 - fixed)
    segments = segments.map((s) => (newShares.has(s.id) ? { ...s, share: newShares.get(s.id) as number } : { ...s, share: (s.share / restTotal) * remaining }))
    const tot = sum(segments.map((s) => s.share))
    segments = segments.map((s) => ({ ...s, share: s.share / tot }))
  }
  const refCoef = numOf(ops.referral_coefficient)
  if (refCoef !== undefined && refCoef >= 0) {
    const cur = sum(segments.map((s) => s.share * s.referral.propensity * s.referral.meanReferred))
    if (cur > 0) {
      const k = refCoef / cur
      segments = segments.map((s) => ({ ...s, referral: { ...s.referral, propensity: clamp(s.referral.propensity * k, 0, 1) } }))
    }
  }
  const organic = numOf(ops.organic_visits_per_day)
  return { ...cfg, segments: segments as Segment[], organicVisitsPerDay: organic !== undefined && organic > 0 ? organic : cfg.organicVisitsPerDay }
}

/** Base organic visits per day of a segment at launch (share × organic). */
export const baseArrivalPerDay = (cfg: SegmentsConfig, seg: Segment): number => cfg.organicVisitsPerDay * seg.share
