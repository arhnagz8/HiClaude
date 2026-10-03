/**
 * OwnerDecision: the closed set of actions an owner (rule policy, decision file, LLM persona) may take.
 * `OwnerDecisionSchema` includes the effective `date` (IRST, YYYY-MM-DD); `OwnerDecisionBodySchema` is the same without it
 * (policy output; the log/applier stamps the date). Add a decision type: add a variant in `VARIANTS`, extend `conflictKey`, handle it in the runner.
 */
import { z } from 'zod'

const frac = z.number().min(0).max(5)
const posInt = z.number().int().positive()
const irt = z.number().int().nonnegative()
export const SHIFTS = ['morning', 'evening', 'night'] as const
export const ShiftSchema = z.enum(SHIFTS)

const rationale = z.string().max(2000).optional()

const set_margin = z.object({ type: z.literal('set_margin'), family: z.string().min(1), marginPct: z.number().min(0).max(1), rationale })
const set_buffers = z
  .object({
    type: z.literal('set_buffers'),
    riskBufferPct: frac.optional(),
    volatilityMinBufferPct: frac.optional(),
    volatilityMaxBufferPct: frac.optional(),
    volatilityZ: z.number().positive().max(6).optional(),
    haltPremiumPct: frac.optional(),
    declineBufferUsdCents: irt.optional(),
    rationale,
  })
  .refine((d) => ['riskBufferPct', 'volatilityMinBufferPct', 'volatilityMaxBufferPct', 'volatilityZ', 'haltPremiumPct', 'declineBufferUsdCents'].some((k) => (d as Record<string, unknown>)[k] !== undefined), { message: 'set_buffers needs at least one buffer field' })
const set_rush = z
  .object({ type: z.literal('set_rush'), tier: z.string().min(1), premiumPct: frac.optional(), minPremiumIrt: irt.optional(), capacityPerHour: posInt.nullable().optional(), rationale })
  .refine((d) => d.premiumPct !== undefined || d.minPremiumIrt !== undefined || d.capacityPerHour !== undefined, { message: 'set_rush needs premiumPct, minPremiumIrt or capacityPerHour' })
const set_target_coverage = z.object({ type: z.literal('set_target_coverage'), days: z.number().min(0).max(60), rationale })
const hire_operator = z.object({ type: z.literal('hire_operator'), count: posInt.max(20), shift: ShiftSchema, rationale })
const fire_operator = z.object({ type: z.literal('fire_operator'), count: posInt.max(20).default(1), shift: ShiftSchema.optional(), operatorId: z.string().optional(), rationale })
const set_marketing_budget = z.object({ type: z.literal('set_marketing_budget'), monthlyIrt: irt, mix: z.record(z.string(), z.number().min(0)).optional(), rationale })
const capital_injection = z.object({ type: z.literal('capital_injection'), irt: irt.refine((x) => x > 0, 'must be > 0'), rationale })
const owner_draw = z.object({ type: z.literal('owner_draw'), irt: irt.refine((x) => x > 0, 'must be > 0'), rationale })
const switch_provider = z
  .object({ type: z.literal('switch_provider'), productId: z.string().optional(), family: z.string().optional(), providerId: z.string().min(1), rationale })
  .refine((d) => !!d.productId !== !!d.family, { message: 'switch_provider needs exactly one of productId | family' })
const set_product_active = z.object({ type: z.literal('set_product_active'), productId: z.string().min(1), active: z.boolean(), rationale })
const set_risk_limits = z
  .object({
    type: z.literal('set_risk_limits'),
    newCustomerMaxOrderUsdCents: posInt.optional(),
    /** risk score at/above which an order goes on risk hold (lower = stricter) */
    holdScoreThreshold: z.number().min(0).max(100).optional(),
    velocityMaxOrdersPerDay: posInt.optional(),
    requireKycAboveIrt: irt.optional(),
    rationale,
  })
  .refine((d) => d.newCustomerMaxOrderUsdCents !== undefined || d.holdScoreThreshold !== undefined || d.velocityMaxOrdersPerDay !== undefined || d.requireKycAboveIrt !== undefined, { message: 'set_risk_limits needs at least one limit' })
const run_promotion = z.object({ type: z.literal('run_promotion'), family: z.string().min(1), discountPct: z.number().gt(0).max(0.5), days: posInt.max(120), rationale })
const kill_switch = z.object({ type: z.literal('kill_switch'), on: z.boolean(), reason: z.string().min(1).max(500), rationale })
/** ADDITIVE to the brief list: statutory payments scheduled by the policy (VAT quarterly, income tax yearly). Not tax advice. */
const pay_tax = z.object({ type: z.literal('pay_tax'), kind: z.enum(['vat', 'income']), irt: irt.refine((x) => x > 0, 'must be > 0'), rationale })

export const DECISION_TYPES = [
  'set_margin', 'set_buffers', 'set_rush', 'set_target_coverage', 'hire_operator', 'fire_operator', 'set_marketing_budget', 'capital_injection', 'owner_draw',
  'switch_provider', 'set_product_active', 'set_risk_limits', 'run_promotion', 'kill_switch', 'pay_tax',
] as const
export type DecisionType = (typeof DECISION_TYPES)[number]

const dateStr = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD')
  .refine((s) => {
    const [y, m, d] = s.split('-').map(Number) as [number, number, number]
    const dt = new Date(Date.UTC(y, m - 1, d))
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
  }, 'not a real calendar date')

/** Plain ZodObjects/Effects: `refine` returns ZodEffects, so build the dated union via intersection. */
const VARIANTS = [set_margin, set_buffers, set_rush, set_target_coverage, hire_operator, fire_operator, set_marketing_budget, capital_injection, owner_draw, switch_provider, set_product_active, set_risk_limits, run_promotion, kill_switch, pay_tax] as const

export const OwnerDecisionBodySchema = z.union(VARIANTS as unknown as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]]) as unknown as z.ZodType<OwnerDecisionBody, z.ZodTypeDef, unknown>
export const OwnerDecisionSchema = z.intersection(OwnerDecisionBodySchema, z.object({ date: dateStr })) as unknown as z.ZodType<OwnerDecision, z.ZodTypeDef, unknown>

type Body<S extends z.ZodTypeAny> = z.infer<S>
export type OwnerDecisionBody =
  | Body<typeof set_margin>
  | Body<typeof set_buffers>
  | Body<typeof set_rush>
  | Body<typeof set_target_coverage>
  | Body<typeof hire_operator>
  | Body<typeof fire_operator>
  | Body<typeof set_marketing_budget>
  | Body<typeof capital_injection>
  | Body<typeof owner_draw>
  | Body<typeof switch_provider>
  | Body<typeof set_product_active>
  | Body<typeof set_risk_limits>
  | Body<typeof run_promotion>
  | Body<typeof kill_switch>
  | Body<typeof pay_tax>
export type OwnerDecision = OwnerDecisionBody & { date: string }

const BY_TYPE = new Map<string, z.ZodTypeAny>(VARIANTS.map((v, i) => [DECISION_TYPES[i] as string, v as z.ZodTypeAny]))

/** Dispatch on `type` so error messages name the offending field instead of "invalid union". */
function parseVariant(x: unknown): OwnerDecisionBody {
  const t = x && typeof x === 'object' ? (x as { type?: unknown }).type : undefined
  const schema = typeof t === 'string' ? BY_TYPE.get(t) : undefined
  if (!schema) throw new Error(`unknown decision type ${JSON.stringify(t)}; allowed: ${DECISION_TYPES.join(', ')}`)
  const r = schema.safeParse(x)
  if (!r.success) throw new Error(`${t}: ${r.error.issues.map((is) => `${is.path.join('.') || '(root)'}: ${is.message}`).join('; ')}`)
  return stripUndefined(r.data as OwnerDecisionBody)
}

/** Strict validation helpers (throw Error with readable paths). */
export const parseDecisionBody = (x: unknown): OwnerDecisionBody => parseVariant(x)
export function parseDecision(x: unknown): OwnerDecision {
  const body = parseVariant(x)
  const d = dateStr.safeParse((x as { date?: unknown }).date)
  if (!d.success) throw new Error(`${body.type}: date: ${d.error.issues.map((i) => i.message).join('; ')}`)
  return { ...body, date: d.data } as OwnerDecision
}

function stripUndefined<T>(x: T): T {
  const o = { ...(x as Record<string, unknown>) }
  for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k]
  return o as T
}

/** Decision file: a JSON array of decisions or `{ "decisions": [...] }`. Returns decisions stably sorted by date. */
export function parseDecisionsFile(raw: unknown): OwnerDecision[] {
  const arr = Array.isArray(raw) ? raw : raw && typeof raw === 'object' && Array.isArray((raw as { decisions?: unknown }).decisions) ? (raw as { decisions: unknown[] }).decisions : undefined
  if (!arr) throw new Error('decision file must be an array or { "decisions": [...] }')
  const out = arr.map((x, i) => {
    try {
      return parseDecision(x)
    } catch (e) {
      throw new Error(`decision #${i} invalid: ${(e as Error).message}`)
    }
  })
  return out.map((d, i) => ({ d, i })).sort((a, b) => (a.d.date < b.d.date ? -1 : a.d.date > b.d.date ? 1 : a.i - b.i)).map((x) => x.d)
}

/** Key under which two decisions "conflict" (same lever). The decision file wins over the policy for the same key and day. */
export function conflictKey(d: OwnerDecisionBody): string {
  switch (d.type) {
    case 'set_margin': return `set_margin:${d.family}`
    case 'set_rush': return `set_rush:${d.tier}`
    case 'hire_operator':
    case 'fire_operator': return 'staffing'
    case 'switch_provider': return `switch_provider:${d.productId ?? d.family}`
    case 'set_product_active': return `set_product_active:${d.productId}`
    case 'run_promotion': return `run_promotion:${d.family}`
    case 'capital_injection':
    case 'owner_draw': return 'capital'
    case 'pay_tax': return `pay_tax:${d.kind}`
    default: return d.type
  }
}

/** One-line human description (logs, digest). */
export function describeDecision(d: OwnerDecisionBody): string {
  switch (d.type) {
    case 'set_margin': return `margin ${d.family} → ${(d.marginPct * 100).toFixed(1)}%`
    case 'set_buffers': return `buffers ${Object.entries(d).filter(([k, v]) => k !== 'type' && k !== 'rationale' && v !== undefined).map(([k, v]) => `${k}=${v}`).join(' ')}`
    case 'set_rush': return `rush ${d.tier} ${d.premiumPct !== undefined ? `premium ${(d.premiumPct * 100).toFixed(0)}%` : ''}${d.capacityPerHour !== undefined ? ` cap/h ${d.capacityPerHour}` : ''}`.trim()
    case 'set_target_coverage': return `target coverage ${d.days}d`
    case 'hire_operator': return `hire ${d.count} operator(s) ${d.shift}`
    case 'fire_operator': return `release ${d.count} operator(s)`
    case 'set_marketing_budget': return `marketing budget ${Math.round(d.monthlyIrt).toLocaleString('en-US')} IRT/month`
    case 'capital_injection': return `capital injection ${d.irt.toLocaleString('en-US')} IRT`
    case 'owner_draw': return `owner draw ${d.irt.toLocaleString('en-US')} IRT`
    case 'switch_provider': return `route ${d.family ?? d.productId} → ${d.providerId}`
    case 'set_product_active': return `${d.active ? 'enable' : 'disable'} product ${d.productId}`
    case 'set_risk_limits': return `risk limits ${Object.entries(d).filter(([k, v]) => k !== 'type' && k !== 'rationale' && v !== undefined).map(([k, v]) => `${k}=${v}`).join(' ')}`
    case 'run_promotion': return `promotion ${d.family} −${(d.discountPct * 100).toFixed(0)}% for ${d.days}d`
    case 'kill_switch': return `kill switch ${d.on ? 'ON' : 'off'}: ${d.reason}`
    case 'pay_tax': return `pay ${d.kind} tax ${d.irt.toLocaleString('en-US')} IRT`
  }
}
