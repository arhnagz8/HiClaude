/** Marketing configuration: data/sim/marketing.json (documented defaults) + tolerant overrides from data/ops_growth.json. */
import { z } from 'zod'
import { deepUnwrap, numOf, readRepoJson } from '../demand/common'
import type { CustomerChannel } from '../demand/types'

const ChannelSchema = z.object({
  id: z.string(),
  labelFa: z.string(),
  labelEn: z.string(),
  type: z.literal('paid'),
  halfSaturationIrtPerMonth: z.number().positive(),
  cpvAtHalfSaturationIrt: z.number().positive(),
  hill: z.number().positive(),
  lagDays: z.number().positive(),
  fatigueMax: z.number().min(0).max(0.95),
  fatigueRecoveryHalfLifeDays: z.number().positive(),
  visitToSignupRate: z.number().min(0).max(1),
  conversionMultiplier: z.number().positive(),
  trustAscPerOrder: z.number(),
  segmentMix: z.record(z.string(), z.number().min(0)),
  customerChannelTilt: z.object({ web: z.number().min(0), telegram: z.number().min(0), bale: z.number().min(0) }),
  source: z.string(),
})
const ReferralSchema = z.object({
  id: z.literal('referral'),
  labelFa: z.string(),
  labelEn: z.string(),
  type: z.literal('referral'),
  rewardIrtPerFirstOrder: z.number().min(0),
  referredConversionAsc: z.number(),
  rewardCapPerMonthIrt: z.number().min(0),
  source: z.string(),
})
const FileSchema = z.object({
  initialMonthlyBudgetIrt: z.object({ value: z.number().min(0) }),
  defaultMix: z.object({ value: z.record(z.string(), z.number().min(0)) }),
  cacAverageWindowDays: z.object({ value: z.number().positive() }),
  channels: z.array(z.union([ChannelSchema, ReferralSchema])),
})

export interface ChannelConfig {
  id: string
  labelFa: string
  labelEn: string
  halfSaturationIrtPerMonth: number
  cpvAtHalfSaturationIrt: number
  hill: number
  lagDays: number
  fatigueMax: number
  fatigueRecoveryHalfLifeDays: number
  visitToSignupRate: number
  conversionMultiplier: number
  trustAscPerOrder: number
  segmentMix: Record<string, number>
  customerChannelTilt: Record<CustomerChannel, number>
  source: string
  /** DERIVED: visits/day asymptote: Vmax_month = 2·K/cpv, per day = /30 */
  maxVisitsPerDay: number
}

export interface ReferralConfig {
  rewardIrtPerFirstOrder: number
  referredConversionAsc: number
  rewardCapPerMonthIrt: number
  source: string
}

export interface MarketingConfig {
  channels: ChannelConfig[]
  referral: ReferralConfig
  initialMonthlyBudgetIrt: number
  defaultMix: Record<string, number>
  cacWindowDays: number
}

export const deriveMaxVisitsPerDay = (k: number, cpv: number): number => (2 * k) / cpv / 30

export function parseMarketingConfig(raw: unknown): MarketingConfig {
  const f = FileSchema.parse(raw)
  const channels: ChannelConfig[] = []
  let referral: ReferralConfig | undefined
  for (const c of f.channels) {
    if (c.type === 'referral') referral = { rewardIrtPerFirstOrder: c.rewardIrtPerFirstOrder, referredConversionAsc: c.referredConversionAsc, rewardCapPerMonthIrt: c.rewardCapPerMonthIrt, source: c.source }
    else channels.push({ ...c, customerChannelTilt: c.customerChannelTilt, maxVisitsPerDay: deriveMaxVisitsPerDay(c.halfSaturationIrtPerMonth, c.cpvAtHalfSaturationIrt) })
  }
  if (!referral) throw new Error('marketing.json: referral channel missing')
  const ids = new Set(channels.map((c) => c.id))
  if (ids.size !== channels.length) throw new Error('marketing.json: duplicate channel id')
  for (const k of Object.keys(f.defaultMix.value)) if (!ids.has(k)) throw new Error(`marketing.json: defaultMix references unknown channel ${k}`)
  return { channels, referral, initialMonthlyBudgetIrt: f.initialMonthlyBudgetIrt.value, defaultMix: f.defaultMix.value, cacWindowDays: f.cacAverageWindowDays.value }
}

/** Assumed visit→first-order conversion used to turn a research CAC (per first order) into a cost per visit. */
export const ASSUMED_VISIT_TO_ORDER = 0.06

/**
 * Tolerant overrides from data/ops_growth.json: `channels` as array/object of `{id, cac_irt, conversion, saturation_irt_month, signup_rate}`.
 * cac_irt → cpv = cac × conversion (conversion default 6 %); saturation → halfSaturation.
 */
export function applyOpsGrowthChannelOverrides(cfg: MarketingConfig, opsRaw: unknown): MarketingConfig {
  const ops = deepUnwrap(opsRaw) as Record<string, unknown> | undefined
  const raw = ops && typeof ops === 'object' ? ops.channels : undefined
  const list: Array<Record<string, unknown>> = []
  if (Array.isArray(raw)) for (const r of raw) if (r && typeof r === 'object') list.push(r as Record<string, unknown>)
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) for (const [k, v] of Object.entries(raw as Record<string, unknown>)) if (v && typeof v === 'object') list.push({ id: k, ...(v as Record<string, unknown>) })
  if (list.length === 0) return cfg
  const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '_')
  const channels = cfg.channels.map((c) => {
    const r = list.find((x) => typeof x.id === 'string' && (norm(x.id) === c.id || norm(x.id).includes(c.id) || c.id.includes(norm(x.id))))
    if (!r) return c
    const cac = numOf(r.cac_irt)
    const conv = numOf(r.conversion)
    const sat = numOf(r.saturation_irt_month)
    const su = numOf(r.signup_rate)
    const next = { ...c }
    if (cac !== undefined && cac > 0) next.cpvAtHalfSaturationIrt = cac * (conv !== undefined && conv > 0 && conv < 1 ? conv : ASSUMED_VISIT_TO_ORDER)
    if (sat !== undefined && sat > 0) next.halfSaturationIrtPerMonth = sat
    if (su !== undefined && su >= 0 && su <= 1) next.visitToSignupRate = su
    next.maxVisitsPerDay = deriveMaxVisitsPerDay(next.halfSaturationIrtPerMonth, next.cpvAtHalfSaturationIrt)
    return next
  })
  return { ...cfg, channels }
}

export function loadMarketingConfig(opts: { useResearch?: boolean; opsGrowth?: unknown } = {}): MarketingConfig {
  const raw = readRepoJson('data/sim/marketing.json')
  if (!raw) throw new Error('data/sim/marketing.json missing')
  let cfg = parseMarketingConfig(raw)
  const ops = opts.opsGrowth ?? (opts.useResearch === false ? undefined : readRepoJson('data/ops_growth.json'))
  if (ops) cfg = applyOpsGrowthChannelOverrides(cfg, ops)
  return cfg
}
