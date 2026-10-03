/**
 * Competitor configuration. Built-in defaults: 6 competitors with strategies follow/undercut/premium/erratic. `loadCompetitorsConfig()` additionally reads
 * data/competitors.json (research 07; tolerant of Record wrappers and of null/UNVERIFIED leaves: unknown values keep the defaults) to take names, trust
 * scores, SLA and segments from real competitors: the best-evidenced ones become the initial K, the rest form the ENTRY POOL for entry events.
 * Markup defaults are placeholders anchored on research 07 (ChatGPT Plus median markup 25.7 %, explicit card-load fees 2-6 %).
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { hashString32 } from '../core/hash'
import { unwrapRecords } from '../core/records'

export type Strategy = 'follow' | 'undercut' | 'premium' | 'erratic'
export const STRATEGIES: readonly Strategy[] = ['follow', 'undercut', 'premium', 'erratic']
export const DEFAULT_FAMILIES = ['virtual_card', 'gift_card', 'ai_subscription', 'streaming', 'cloud', 'education'] as const

export interface CompetitorConfig {
  id: string
  name: string
  strategy: Strategy
  /** base markup over their cost, by family (fraction) */
  markup: Record<string, number>
  /** extra fixed fee per order (Toman) */
  fixedFeeIrt: number
  repriceEveryHours: number
  /** how stale their FX reference is when they reprice (hours) */
  lagHours: number
  /** their FX cost vs mid (fraction): exchange spread, fees, withdrawals */
  costPremium: number
  trust: number
  slaMinutes: Record<string, number>
  promosPerMonth: number
  /** std-dev of per-reprice price noise (fraction) */
  noiseSd: number
  joinsSeasonalSales: boolean
}

export interface CompetitionConfig {
  competitors: CompetitorConfig[]
  /** candidates for entry events (same shape) */
  entryPool: CompetitorConfig[]
  entryHazardPerYear: number
  exitHazardPerYear: number
  /** percentage points added/removed by strategy */
  undercutDelta: number
  premiumDelta: number
  erraticSd: number
  followPull: number
  minMarkup: number
  roundingStepIrt: number
}

export const FAMILY_MARKUP_DEFAULT: Record<string, number> = { virtual_card: 0.06, gift_card: 0.08, ai_subscription: 0.2, streaming: 0.15, cloud: 0.05, education: 0.06 }
export const FAMILY_SLA_DEFAULT: Record<string, number> = { virtual_card: 180, gift_card: 30, ai_subscription: 240, streaming: 240, cloud: 360, education: 720 }

function mk(id: string, name: string, strategy: Strategy, o: Partial<CompetitorConfig> = {}): CompetitorConfig {
  return {
    id,
    name,
    strategy,
    markup: { ...FAMILY_MARKUP_DEFAULT },
    fixedFeeIrt: 0,
    repriceEveryHours: 12,
    lagHours: 6,
    costPremium: 0.012,
    trust: 0.5,
    slaMinutes: { ...FAMILY_SLA_DEFAULT },
    promosPerMonth: 0.4,
    noiseSd: 0.004,
    joinsSeasonalSales: true,
    ...o,
  }
}

export function defaultCompetitionConfig(): CompetitionConfig {
  return {
    competitors: [
      mk('alpha-pay', 'آلفاپی', 'follow', { trust: 0.7, repriceEveryHours: 6, lagHours: 3 }),
      mk('beta-card', 'بتاکارت', 'undercut', { trust: 0.5, repriceEveryHours: 12, lagHours: 6, costPremium: 0.01 }),
      mk('prime-fx', 'پرایم‌اف‌ایکس', 'premium', { trust: 0.85, repriceEveryHours: 24, lagHours: 12, costPremium: 0.015, slaMinutes: { ...FAMILY_SLA_DEFAULT, virtual_card: 60, gift_card: 10 } }),
      mk('gamma-gift', 'گاما گیفت', 'follow', { trust: 0.45, repriceEveryHours: 24, lagHours: 24, promosPerMonth: 0.8 }),
      mk('delta-arz', 'دلتا ارز', 'erratic', { trust: 0.3, repriceEveryHours: 8, lagHours: 4, noiseSd: 0.012, costPremium: 0.02 }),
      mk('omega-pay', 'امگاپی', 'undercut', { trust: 0.4, repriceEveryHours: 4, lagHours: 2, costPremium: 0.008, promosPerMonth: 0.6 }),
    ],
    entryPool: [
      mk('entrant-1', 'ورودی ۱', 'undercut', { trust: 0.3 }),
      mk('entrant-2', 'ورودی ۲', 'follow', { trust: 0.35 }),
      mk('entrant-3', 'ورودی ۳', 'erratic', { trust: 0.25, noiseSd: 0.01 }),
    ],
    entryHazardPerYear: 0.5,
    exitHazardPerYear: 0.12,
    undercutDelta: 0.03,
    premiumDelta: 0.06,
    erraticSd: 0.04,
    followPull: 0.35,
    minMarkup: 0.01,
    roundingStepIrt: 1000,
  }
}

export function defaultCompetitorsFilePath(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), '../../../../data/competitors.json')
}

const SEGMENT_FAMILIES: Record<string, string[]> = {
  virtual_card: ['virtual_card'],
  gift_card: ['gift_card'],
  subscription: ['ai_subscription', 'streaming'],
  fx_payment: ['cloud'],
  exam_embassy: ['education'],
}

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)

export function loadCompetitorsConfig(path?: string): CompetitionConfig & { meta: { source: string; warnings: string[] } } {
  const base = defaultCompetitionConfig()
  const file = path ?? defaultCompetitorsFilePath()
  const warnings: string[] = []
  if (!existsSync(file)) return Object.assign(base, { meta: { source: 'default', warnings } })
  let raw: unknown
  try {
    raw = unwrapRecords(JSON.parse(readFileSync(file, 'utf8')))
  } catch (e) {
    warnings.push(`cannot parse ${file}: ${(e as Error).message}`)
    return Object.assign(base, { meta: { source: 'default', warnings } })
  }
  const list = (raw as { competitors?: unknown }).competitors
  if (!Array.isArray(list)) {
    warnings.push('no competitors[] array; using defaults')
    return Object.assign(base, { meta: { source: 'default', warnings } })
  }
  const built: { level: number; cfg: CompetitorConfig }[] = []
  for (const c of list as Record<string, unknown>[]) {
    const id = typeof c.id === 'string' ? c.id : undefined
    if (!id) continue
    const segs = Array.isArray(c.segments) ? (c.segments as string[]) : []
    const fams = [...new Set(segs.flatMap((s) => SEGMENT_FAMILIES[s] ?? []))]
    if (fams.length === 0) continue
    const h = hashString32(id)
    const strategy = STRATEGIES[h % STRATEGIES.length] as Strategy
    const trustScore = num(c.trust_score_est)
    const sla = num(c.delivery_sla_minutes)
    const repr = num(c.repricing_cadence_hours)
    const markup: Record<string, number> = {}
    const slaMap: Record<string, number> = {}
    for (const f of fams) {
      markup[f] = (FAMILY_MARKUP_DEFAULT[f] ?? 0.08) * (0.8 + ((h >>> 3) % 40) / 100) // deterministic spread 0.8..1.19 around the default
      slaMap[f] = sla !== undefined ? Math.min(sla, 1440) : (FAMILY_SLA_DEFAULT[f] ?? 240)
    }
    const level = typeof c.evidence_level === 'string' ? Number(c.evidence_level.replace(/\D/g, '')) || 0 : 0
    built.push({
      level,
      cfg: mk(id, typeof c.name === 'string' ? c.name : id, strategy, {
        markup,
        slaMinutes: slaMap,
        trust: trustScore !== undefined ? Math.max(0.05, Math.min(0.95, trustScore / 100)) : 0.3 + ((h >>> 7) % 30) / 100,
        repriceEveryHours: repr !== undefined && repr > 0 ? repr : 6 + ((h >>> 11) % 19),
        lagHours: 2 + ((h >>> 5) % 12),
      }),
    })
  }
  if (built.length < 3) {
    warnings.push('fewer than 3 usable competitors in file; using defaults')
    return Object.assign(base, { meta: { source: 'default', warnings } })
  }
  built.sort((a, b) => b.level - a.level || (a.cfg.id < b.cfg.id ? -1 : 1))
  // initial K = 6 covering as many families as possible, remainder is the entry pool
  const initial: CompetitorConfig[] = []
  const covered = new Set<string>()
  for (const b of built) {
    if (initial.length >= 6) break
    const newFam = Object.keys(b.cfg.markup).some((f) => !covered.has(f))
    if (newFam || initial.length < 3) {
      initial.push(b.cfg)
      for (const f of Object.keys(b.cfg.markup)) covered.add(f)
    }
  }
  const pool = built.map((b) => b.cfg).filter((c) => !initial.includes(c))
  base.competitors = initial
  base.entryPool = pool.length ? pool.slice(0, 12) : base.entryPool
  warnings.push(...(base.competitors.length < 6 ? [`only ${base.competitors.length} initial competitors from file`] : []))
  return Object.assign(base, { meta: { source: file, warnings } })
}
