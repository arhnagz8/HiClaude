/**
 * CatalogService — products (data/catalog.json or defaults) + DB overrides + availability + validation.
 *
 * Source of truth at runtime: `products` table (re-seeded from the file/defaults at every start via `reload()`), merged with
 * `product_overrides` (active flag, margin override, min margin, loss-leader, SLA). Research files carry provenance Records
 * (`{value, unit, as_of, confidence, sources, verify_how}`); `unwrapRecords()` collapses those to their `.value`.
 */
import { existsSync, readFileSync } from 'node:fs'
import { AppError, defaultProducts, type CustomerTier, type Product, type ProductDto } from '@hiclaude/contracts'
import type { AppContext } from '../context'
import { ProductSchema, type ProductOverride } from '../repos'
import { actorString, isPlainObject, toActor, type ActorLike } from '../util'
import { checkAmount, checkInputs, type ValidationIssue } from './catalogValidation'
import type { AuditService } from './audit'
import type { SettingsService } from './settings'

type CatalogCtx = Pick<AppContext, 'clock' | 'repos' | 'db' | 'params' | 'logger' | 'bus'>

const RECORD_KEYS = ['as_of', 'confidence', 'sources', 'verify_how', 'unit']

/** Collapses research provenance wrappers `{value, as_of, …}` to their value, recursively. */
export function unwrapRecords(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(unwrapRecords)
  if (isPlainObject(v)) {
    if ('value' in v && RECORD_KEYS.some((k) => k in v) && Object.keys(v).every((k) => k === 'value' || RECORD_KEYS.includes(k) || k === 'notes')) return unwrapRecords(v.value)
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, unwrapRecords(x)]))
  }
  return v
}

export interface CatalogLoadReport {
  source: 'file' | 'defaults'
  loaded: number
  skipped: { index: number; id?: string; error: string }[]
}

export type AvailabilityReason = 'inactive' | 'provider_unknown' | 'provider_disabled' | 'kill_switch' | 'tier_not_allowed' | 'customer_blocked'

export interface Availability {
  available: boolean
  reason?: AvailabilityReason
  reasonFa?: string
  /** First usable provider (primary, else first usable alternative). */
  providerId?: string
  /** Transparency fields to show customers (CLAUDE.md §3). */
  riskLabel: Product['riskLabel']
  restrictionNoteFa?: string
}

export interface AvailabilityCtx {
  customer?: { tier: CustomerTier; status?: 'active' | 'blocked' }
}

const TIER_RANK: Record<CustomerTier, number> = { new: 0, verified: 1, trusted: 2 }

export class CatalogService {
  private cache?: Map<string, Product>
  report: CatalogLoadReport = { source: 'defaults', loaded: 0, skipped: [] }

  constructor(
    private readonly ctx: CatalogCtx,
    private readonly deps: { settings: SettingsService; audit: AuditService; catalogPath?: string },
  ) {
    this.reload()
  }

  // ───────────────────────── loading ─────────────────────────
  /** Re-read the source (file or defaults) into the `products` table; rows no longer in the source are deleted. */
  reload(): CatalogLoadReport {
    const report: CatalogLoadReport = { source: 'defaults', loaded: 0, skipped: [] }
    let products: Product[] = []
    const path = this.deps.catalogPath
    if (path && existsSync(path)) {
      try {
        const raw = unwrapRecords(JSON.parse(readFileSync(path, 'utf8'))) as unknown
        const arr = Array.isArray(raw) ? raw : isPlainObject(raw) && Array.isArray(raw.products) ? raw.products : undefined
        if (arr) {
          report.source = 'file'
          const seen = new Set<string>()
          arr.forEach((item, index) => {
            const r = ProductSchema.safeParse(item)
            if (!r.success) report.skipped.push({ index, id: isPlainObject(item) ? String(item.id ?? '') : undefined, error: r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') })
            else if (seen.has(r.data.id)) report.skipped.push({ index, id: r.data.id, error: 'duplicate id' })
            else {
              seen.add(r.data.id)
              products.push(r.data as Product)
            }
          })
        }
      } catch (e) {
        this.ctx.logger.error('catalog file unreadable — using defaults', { error: String(e) })
      }
      if (report.source === 'file' && products.length === 0) {
        report.source = 'defaults'
        this.ctx.logger.warn('catalog file contains no valid products — using defaults')
      }
    }
    if (report.source === 'defaults') products = defaultProducts()
    report.loaded = products.length
    const now = this.ctx.clock.now()
    this.ctx.db.tx(() => {
      const ids = new Set(products.map((p) => p.id))
      for (const p of products) this.ctx.repos.products.upsert(p, now)
      for (const old of this.ctx.repos.products.list()) if (!ids.has(old.id)) this.ctx.repos.products.delete(old.id)
    })
    this.report = report
    this.cache = undefined
    return report
  }

  private load(): Map<string, Product> {
    if (!this.cache) {
      const overrides = new Map(this.ctx.repos.products.listOverrides().map((o) => [o.productId, o]))
      this.cache = new Map(this.ctx.repos.products.list().map((p) => [p.id, applyOverride(p, overrides.get(p.id))]))
    }
    return this.cache
  }

  // ───────────────────────── reads ─────────────────────────
  /** Products with overrides applied. By default only active ones. */
  list(opts: { includeInactive?: boolean; family?: string; category?: string } = {}): Product[] {
    return [...this.load().values()].filter((p) => (opts.includeInactive || p.active) && (!opts.family || p.family === opts.family) && (!opts.category || p.category === opts.category))
  }

  get(id: string): Product | undefined {
    return this.load().get(id)
  }

  require(id: string): Product {
    const p = this.get(id)
    if (!p) throw new AppError('NOT_FOUND', `product ${id} not found`)
    return p
  }

  getBySlug(slug: string): Product | undefined {
    return [...this.load().values()].find((p) => p.slug === slug)
  }

  getOverride(id: string): ProductOverride | undefined {
    return this.ctx.repos.products.getOverride(id)
  }

  /** Public DTO (no cost/margin data; `fromPriceIrt` is filled in by the API from PricingService). */
  toDto(p: Product): ProductDto {
    const prov = this.ctx.params().providers.find((x) => x.id === p.providerId)
    return {
      id: p.id,
      slug: p.slug,
      kind: p.kind,
      category: p.category,
      family: p.family,
      titleFa: p.titleFa,
      descriptionFa: p.descriptionFa,
      amount: p.amount,
      inputs: p.inputs,
      fulfilmentMode: p.fulfilmentMode,
      slaMinutes: p.slaMinutes,
      riskLabel: p.riskLabel,
      restrictionNoteFa: p.restrictionNoteFa ?? prov?.restrictionNoteFa,
      tags: p.tags,
      active: p.active,
    }
  }

  // ───────────────────────── overrides (admin) ─────────────────────────
  setOverride(
    productId: string,
    patch: { active?: boolean | null; marginOverridePct?: number | null; minMarginOverrideIrt?: number | null; lossLeader?: boolean | null; slaMinutes?: Record<string, number> | null },
    actor: ActorLike,
  ): Product {
    const base = this.ctx.repos.products.get(productId)
    if (!base) throw new AppError('NOT_FOUND', `product ${productId} not found`)
    if (patch.marginOverridePct !== undefined && patch.marginOverridePct !== null && !(patch.marginOverridePct >= 0 && patch.marginOverridePct <= 5)) throw new AppError('VALIDATION', 'marginOverridePct must be a fraction in [0, 5]')
    if (patch.minMarginOverrideIrt !== undefined && patch.minMarginOverrideIrt !== null && !(Number.isSafeInteger(patch.minMarginOverrideIrt) && patch.minMarginOverrideIrt >= 0)) throw new AppError('VALIDATION', 'minMarginOverrideIrt must be a non-negative integer')
    const prev = this.ctx.repos.products.getOverride(productId)
    const merged: ProductOverride = { productId, updatedAt: this.ctx.clock.now(), updatedBy: actorString(actor) }
    const pick = <K extends 'active' | 'marginOverridePct' | 'minMarginOverrideIrt' | 'lossLeader' | 'slaMinutes'>(k: K): void => {
      const incoming = patch[k]
      const v = incoming === undefined ? prev?.[k] : incoming === null ? undefined : incoming
      if (v !== undefined) (merged as unknown as Record<string, unknown>)[k] = v
    }
    pick('active')
    pick('marginOverridePct')
    pick('minMarginOverrideIrt')
    pick('lossLeader')
    pick('slaMinutes')
    this.ctx.repos.products.putOverride(merged)
    this.cache = undefined
    const a = toActor(actor)
    this.deps.audit.record(a, 'catalog.override', productId, patch as Record<string, unknown>)
    this.ctx.bus.publish({ type: 'settings.changed', at: this.ctx.clock.now(), keys: [`catalog.${productId}`], actor: actorString(actor), scope: 'catalog' })
    return this.require(productId)
  }

  clearOverride(productId: string, actor: ActorLike): Product {
    this.ctx.repos.products.deleteOverride(productId)
    this.cache = undefined
    this.deps.audit.record(actor, 'catalog.override.clear', productId)
    return this.require(productId)
  }

  // ───────────────────────── availability ─────────────────────────
  /**
   * Can this product be sold right now? Checks (in order): product active; customer not blocked; tier vs risk-label rule
   * (`catalog.minTierByRisk` flag, default permissive); global/product kill switches; first provider (primary → alternates)
   * that exists, is enabled and not killed. Pure read, no side effects.
   */
  availability(product: Product, _now: number = this.ctx.clock.now(), ctx: AvailabilityCtx = {}): Availability {
    const tr = { riskLabel: product.riskLabel, restrictionNoteFa: product.restrictionNoteFa ?? this.ctx.params().providers.find((p) => p.id === product.providerId)?.restrictionNoteFa }
    const no = (reason: AvailabilityReason, reasonFa: string): Availability => ({ available: false, reason, reasonFa, ...tr })
    if (!product.active) return no('inactive', 'این محصول در حال حاضر در دسترس نیست.')
    if (ctx.customer?.status === 'blocked') return no('customer_blocked', 'حساب شما مسدود است؛ با پشتیبانی تماس بگیرید.')
    if (ctx.customer) {
      const min = this.deps.settings.get<Record<string, CustomerTier>>('catalog.minTierByRisk', { low: 'new', medium: 'new', high: 'new' })[product.riskLabel] ?? 'new'
      if (TIER_RANK[ctx.customer.tier] < TIER_RANK[min]) return no('tier_not_allowed', 'برای خرید این محصول ابتدا باید احراز هویت خود را تکمیل کنید.')
    }
    const sw = this.deps.settings.salesBlock({ productId: product.id })
    if (sw.blocked) return no('kill_switch', 'فروش این سرویس موقتاً متوقف شده است.')
    const providers = this.ctx.params().providers
    let sawEnabled = false
    for (const pid of [product.providerId, ...product.altProviderIds]) {
      const prov = providers.find((p) => p.id === pid)
      if (!prov || !prov.enabled) continue
      sawEnabled = true
      if (this.deps.settings.isKilled('provider', pid)) continue
      return { available: true, providerId: pid, ...tr }
    }
    return sawEnabled ? no('kill_switch', 'ارائه‌دهندهٔ این سرویس موقتاً در دسترس نیست.') : providers.some((p) => p.id === product.providerId) ? no('provider_disabled', 'ارائه‌دهندهٔ این سرویس غیرفعال است.') : no('provider_unknown', 'ارائه‌دهندهٔ این سرویس تعریف نشده است.')
  }

  // ───────────────────────── validation ─────────────────────────
  /** null when valid. */
  checkAmount(product: Product, usdCents: number): ValidationIssue | null {
    return checkAmount(product.amount, usdCents)
  }

  /** Throws AppError VALIDATION (details.issues) when the amount is not allowed for the product. */
  validateAmount(product: Product, usdCents: number): void {
    const issue = checkAmount(product.amount, usdCents)
    if (issue) throw new AppError('VALIDATION', issue.messageFa, { field: issue.field, code: issue.code, productId: product.id })
  }

  /** Returns sanitized inputs or throws AppError VALIDATION with all issues. */
  validateInputs(product: Product, raw: Record<string, string>): Record<string, string> {
    const { inputs, issues } = checkInputs(product, raw)
    if (issues.length) throw new AppError('VALIDATION', issues.map((i) => i.messageFa).join(' '), { issues, productId: product.id })
    return inputs
  }
}

function applyOverride(p: Product, o: ProductOverride | undefined): Product {
  if (!o) return p
  const out: Product = { ...p }
  if (o.active !== undefined) out.active = o.active
  if (o.marginOverridePct !== undefined) out.marginOverridePct = o.marginOverridePct
  if (o.minMarginOverrideIrt !== undefined) out.minMarginOverrideIrt = o.minMarginOverrideIrt
  if (o.lossLeader !== undefined) out.lossLeader = o.lossLeader
  if (o.slaMinutes) out.slaMinutes = { ...p.slaMinutes, ...o.slaMinutes }
  return out
}
