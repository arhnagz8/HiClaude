import type { Product, RushTierId, EpochMs, Irt } from '@hiclaude/contracts'
import type { Database } from '../db'
import { fromJson, fromJsonOpt, toJson } from './json'
import { ProductSchema } from './schemas'
import { z } from 'zod'

interface ProductRow {
  id: string
  slug: string
  family: string
  provider_id: string
  active: number
  data_json: string
  updated_at: number
}

export interface ProductOverride {
  productId: string
  active?: boolean
  marginOverridePct?: number
  minMarginOverrideIrt?: Irt
  lossLeader?: boolean
  slaMinutes?: Record<RushTierId, number>
  updatedAt: EpochMs
  updatedBy?: string
}
interface OverrideRow {
  product_id: string
  active: number | null
  margin_override_pct: number | null
  min_margin_override_irt: number | null
  loss_leader: number | null
  sla_json: string | null
  updated_at: number
  updated_by: string | null
}
const SlaSchema = z.record(z.string(), z.number().positive())

const toOverride = (r: OverrideRow): ProductOverride => {
  const o: ProductOverride = { productId: r.product_id, updatedAt: r.updated_at }
  if (r.active !== null) o.active = r.active === 1
  if (r.margin_override_pct !== null) o.marginOverridePct = r.margin_override_pct
  if (r.min_margin_override_irt !== null) o.minMarginOverrideIrt = r.min_margin_override_irt
  if (r.loss_leader !== null) o.lossLeader = r.loss_leader === 1
  const sla = fromJsonOpt(SlaSchema, r.sla_json, 'product_overrides.sla_json')
  if (sla) o.slaMinutes = sla
  if (r.updated_by !== null) o.updatedBy = r.updated_by
  return o
}

export class ProductsRepo {
  constructor(private readonly db: Database) {}

  /** Insert or replace the base (file/default) definition of a product. */
  upsert(p: Product, now: EpochMs): Product {
    const data = toJson(ProductSchema, p, `product ${p.id}`)
    this.db.run(
      `INSERT INTO products (id, slug, family, provider_id, active, data_json, updated_at) VALUES (?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET slug=excluded.slug, family=excluded.family, provider_id=excluded.provider_id, active=excluded.active,
         data_json=excluded.data_json, updated_at=excluded.updated_at`,
      [p.id, p.slug, p.family, p.providerId, p.active ? 1 : 0, data, now],
    )
    return this.get(p.id) as Product
  }
  get(id: string): Product | undefined {
    const r = this.db.get<ProductRow>('SELECT * FROM products WHERE id = ?', [id])
    return r && (fromJson(ProductSchema, r.data_json, 'products.data_json') as Product)
  }
  getBySlug(slug: string): Product | undefined {
    const r = this.db.get<ProductRow>('SELECT * FROM products WHERE slug = ?', [slug])
    return r && (fromJson(ProductSchema, r.data_json, 'products.data_json') as Product)
  }
  list(f: { family?: string; providerId?: string; activeOnly?: boolean } = {}): Product[] {
    const where: string[] = []
    const params: unknown[] = []
    if (f.family) (where.push('family = ?'), params.push(f.family))
    if (f.providerId) (where.push('provider_id = ?'), params.push(f.providerId))
    if (f.activeOnly) where.push('active = 1')
    return this.db
      .all<ProductRow>(`SELECT * FROM products ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id`, params)
      .map((r) => fromJson(ProductSchema, r.data_json, 'products.data_json') as Product)
  }
  delete(id: string): boolean {
    return this.db.run('DELETE FROM products WHERE id = ?', [id]).changes > 0
  }

  // overrides
  getOverride(productId: string): ProductOverride | undefined {
    const r = this.db.get<OverrideRow>('SELECT * FROM product_overrides WHERE product_id = ?', [productId])
    return r && toOverride(r)
  }
  listOverrides(): ProductOverride[] {
    return this.db.all<OverrideRow>('SELECT * FROM product_overrides ORDER BY product_id').map(toOverride)
  }
  putOverride(o: ProductOverride): ProductOverride {
    this.db.run(
      `INSERT INTO product_overrides (product_id, active, margin_override_pct, min_margin_override_irt, loss_leader, sla_json, updated_at, updated_by)
       VALUES (?,?,?,?,?,?,?,?)
       ON CONFLICT(product_id) DO UPDATE SET active=excluded.active, margin_override_pct=excluded.margin_override_pct,
         min_margin_override_irt=excluded.min_margin_override_irt, loss_leader=excluded.loss_leader, sla_json=excluded.sla_json,
         updated_at=excluded.updated_at, updated_by=excluded.updated_by`,
      [o.productId, o.active === undefined ? null : o.active ? 1 : 0, o.marginOverridePct, o.minMarginOverrideIrt, o.lossLeader === undefined ? null : o.lossLeader ? 1 : 0,
        o.slaMinutes ? toJson(SlaSchema, o.slaMinutes, 'sla') : null, o.updatedAt, o.updatedBy],
    )
    return this.getOverride(o.productId) as ProductOverride
  }
  deleteOverride(productId: string): boolean {
    return this.db.run('DELETE FROM product_overrides WHERE product_id = ?', [productId]).changes > 0
  }
}

