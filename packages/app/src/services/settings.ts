/**
 * SettingsService — effective platform params + flags + kill switches.
 *
 * Layering (architecture §17):  base (defaults ← data/config/*.json, resolved by the caller/createApp)  ←  DB overrides.
 * DB overrides live in the `settings` table under keys `params.<dotted.path>` (e.g. `params.pricing.marginPct`), each versioned and audited.
 * Other keys (`flag.*`, `banner.*`, `otp.*`, `catalog.*`, …) are free-form JSON flags readable with `get`.
 * The effective params are cached and recomputed after any write.
 */
import { AppError, parsePlatformParams, type DeepPartial, type PlatformParams, type PricingPolicy } from '@hiclaude/contracts'
import { ZodError } from 'zod'
import type { AppContext } from '../context'
import type { KillScope, KillSwitchRecord, SettingAuditRecord, SettingRecord } from '../repos'
import { actorString, deepFreeze, flattenLeaves, getPath, jsonEqual, setPath, toActor, type ActorLike } from '../util'

export const PARAM_PREFIX = 'params.'

export interface Banner {
  severity: 'info' | 'warning' | 'critical'
  textFa: string
}

type SettingsCtx = Pick<AppContext, 'clock' | 'repos' | 'db' | 'bus' | 'logger'>

function zodToApp(e: unknown): never {
  if (e instanceof ZodError) {
    throw new AppError('VALIDATION', e.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '), { issues: e.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) })
  }
  throw e
}

export class SettingsService {
  private effective?: PlatformParams
  private flagCache = new Map<string, unknown>()
  private killCache?: Map<string, KillSwitchRecord>
  private listeners = new Set<(keys: string[]) => void>()

  /** @param base params after defaults ← files (already validated). Never mutated. */
  constructor(private readonly ctx: SettingsCtx, private readonly base: PlatformParams) {}

  // ───────────────────────── params ─────────────────────────
  /** Effective, deep-frozen params (base ← DB overrides). */
  getParams(): PlatformParams {
    if (!this.effective) this.effective = deepFreeze(this.compute())
    return this.effective
  }

  /** Params without DB overrides (defaults ← files). */
  getBaseParams(): PlatformParams {
    return this.base
  }

  /** Raw `params.*` override rows. */
  listParamOverrides(): SettingRecord[] {
    return this.ctx.repos.settings.list('params')
  }

  private compute(): PlatformParams {
    const draft = structuredClone(this.base) as unknown as Record<string, unknown>
    for (const row of this.ctx.repos.settings.list('params')) setPath(draft, row.key.slice(PARAM_PREFIX.length), row.value)
    try {
      return parsePlatformParams(draft)
    } catch (e) {
      // Fail safe: a corrupt override must never take the platform down; fall back to the validated base and shout.
      this.ctx.logger.error('invalid params override in DB — falling back to base params', { error: String(e) })
      return structuredClone(this.base)
    }
  }

  private validateCandidate(mutate: (draft: Record<string, unknown>) => void): PlatformParams {
    const draft = structuredClone(this.getParams()) as unknown as Record<string, unknown>
    mutate(draft)
    try {
      return parsePlatformParams(draft)
    } catch (e) {
      return zodToApp(e)
    }
  }

  /** Set one param by dotted path (e.g. `pricing.marginPct`). Validated against the full schema before it is stored. */
  setParam(path: string, value: unknown, actor: ActorLike, reason?: string): PlatformParams {
    return this.setParams([[path, value]], actor, reason)
  }

  /** Atomically set several params. All-or-nothing: validation covers the final combined result. */
  setParams(entries: readonly (readonly [string, unknown])[], actor: ActorLike, reason?: string): PlatformParams {
    if (entries.length === 0) return this.getParams()
    this.validateCandidate((d) => entries.forEach(([p, v]) => setPath(d, p, v)))
    const now = this.ctx.clock.now()
    const who = actorString(actor)
    this.ctx.db.tx(() => {
      for (const [p, v] of entries) this.ctx.repos.settings.put(PARAM_PREFIX + p, v, { now, actor: who, reason })
    })
    this.invalidate()
    this.changed(entries.map(([p]) => PARAM_PREFIX + p), who, 'params')
    return this.getParams()
  }

  /** Remove a DB override (value reverts to the file/default layer). */
  clearParam(path: string, actor: ActorLike, reason?: string): PlatformParams {
    const who = actorString(actor)
    if (this.ctx.repos.settings.delete(PARAM_PREFIX + path, { now: this.ctx.clock.now(), actor: who, reason })) {
      this.invalidate()
      this.changed([PARAM_PREFIX + path], who, 'params')
    }
    return this.getParams()
  }

  /**
   * Patch the pricing policy. Validates the merged policy, stores each changed leaf as a versioned override, bumps `pricing.version`
   * (+1, only when something actually changed), writes audit rows and publishes `settings.changed`. Returns the new policy.
   */
  updatePricingPolicy(patch: DeepPartial<PricingPolicy>, actor: ActorLike, reason?: string): PricingPolicy {
    const current = this.getParams().pricing
    const { version: _ignored, ...rest } = patch as { version?: number }
    let leaves: [string, unknown][]
    try {
      leaves = flattenLeaves(rest, 'pricing')
    } catch (e) {
      throw new AppError('VALIDATION', (e as Error).message)
    }
    const changed = leaves.filter(([p, v]) => !jsonEqual(getPath(current, p.slice('pricing.'.length)), v))
    if (changed.length === 0) return current
    const entries: [string, unknown][] = [...changed, ['pricing.version', current.version + 1]]
    return this.setParams(entries, actor, reason ?? 'pricing policy update').pricing
  }

  // ───────────────────────── free-form flags ─────────────────────────
  /** Read a flag/setting (non-params). Returns `def` when unset. */
  get<T = unknown>(key: string, def?: T): T {
    if (this.flagCache.has(key)) {
      const v = this.flagCache.get(key)
      return (v === undefined ? def : v) as T
    }
    const rec = this.ctx.repos.settings.get(key)
    this.flagCache.set(key, rec?.value)
    return (rec === undefined ? def : rec.value) as T
  }

  getRecord<T = unknown>(key: string): SettingRecord<T> | undefined {
    return this.ctx.repos.settings.get<T>(key)
  }

  set<T>(key: string, value: T, actor: ActorLike, reason?: string, expectedVersion?: number): SettingRecord<T> {
    if (key.startsWith(PARAM_PREFIX)) throw new AppError('VALIDATION', 'use setParam() for params.* keys')
    const who = actorString(actor)
    const rec = this.ctx.repos.settings.put(key, value, { now: this.ctx.clock.now(), actor: who, reason, expectedVersion })
    this.invalidate()
    this.changed([key], who, 'flag')
    return rec
  }

  unset(key: string, actor: ActorLike, reason?: string): boolean {
    const who = actorString(actor)
    const done = this.ctx.repos.settings.delete(key, { now: this.ctx.clock.now(), actor: who, reason })
    if (done) {
      this.invalidate()
      this.changed([key], who, 'flag')
    }
    return done
  }

  listFlags(prefix?: string): SettingRecord[] {
    return this.ctx.repos.settings.list(prefix).filter((r) => !r.key.startsWith(PARAM_PREFIX))
  }

  audit(filter: { key?: string; keyPrefix?: string; limit?: number } = {}): SettingAuditRecord[] {
    return this.ctx.repos.settings.listAudit(filter)
  }

  // ───────────────────────── banner ─────────────────────────
  getBanner(): Banner | undefined {
    return this.get<Banner | undefined>('banner.public', undefined)
  }
  setBanner(banner: Banner | null, actor: ActorLike): void {
    if (banner === null) this.unset('banner.public', actor)
    else this.set('banner.public', banner, actor)
  }

  // ───────────────────────── kill switches ─────────────────────────
  private kills(): Map<string, KillSwitchRecord> {
    if (!this.killCache) this.killCache = new Map(this.ctx.repos.killSwitches.list(true).map((k) => [k.key, k]))
    return this.killCache
  }

  isKilled(scope: KillScope, scopeId?: string): boolean {
    return this.kills().has(scope === 'provider' || scope === 'product' ? `${scope}:${scopeId ?? ''}` : scope)
  }

  /** Sales are blocked if the global switch, the product's switch or the provider's switch is active. */
  salesBlock(target: { productId?: string; providerId?: string } = {}): { blocked: boolean; scope?: KillScope; reason?: string } {
    const hit = (scope: KillScope, id?: string): KillSwitchRecord | undefined => this.kills().get(scope === 'provider' || scope === 'product' ? `${scope}:${id ?? ''}` : scope)
    const k = hit('all') ?? (target.productId ? hit('product', target.productId) : undefined) ?? (target.providerId ? hit('provider', target.providerId) : undefined)
    return k ? { blocked: true, scope: k.scope, reason: k.reason } : { blocked: false }
  }

  setKillSwitch(input: { scope: KillScope; scopeId?: string; on: boolean; reason: string }, actor: ActorLike): KillSwitchRecord {
    if ((input.scope === 'provider' || input.scope === 'product') && !input.scopeId) throw new AppError('VALIDATION', `scopeId is required for scope ${input.scope}`)
    const now = this.ctx.clock.now()
    const who = actorString(actor)
    const rec = this.ctx.repos.killSwitches.set({ scope: input.scope, scopeId: input.scopeId, active: input.on, reason: input.reason, setBy: who, now })
    this.killCache = undefined
    const a = toActor(actor)
    this.ctx.repos.audit.append({ at: now, actorType: a.type, actorId: a.id, action: 'killswitch.set', target: rec.key, data: { on: input.on, reason: input.reason } })
    this.ctx.bus.publish({ type: 'killswitch.changed', at: now, on: input.on, reason: input.reason, scope: rec.key })
    this.changed([`killSwitch.${rec.key}`], who, 'killswitch')
    return rec
  }

  listKillSwitches(activeOnly = false): KillSwitchRecord[] {
    return this.ctx.repos.killSwitches.list(activeOnly)
  }

  // ───────────────────────── plumbing ─────────────────────────
  /** Subscribe to settings writes (called after the cache has been invalidated). */
  onChange(fn: (keys: string[]) => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  invalidate(): void {
    this.effective = undefined
    this.flagCache.clear()
    this.killCache = undefined
  }

  private changed(keys: string[], actor: string, scope: 'params' | 'flag' | 'catalog' | 'killswitch'): void {
    this.ctx.bus.publish({ type: 'settings.changed', at: this.ctx.clock.now(), keys, actor, scope })
    for (const l of [...this.listeners]) {
      try {
        l(keys)
      } catch (e) {
        this.ctx.logger.error('settings listener failed', { error: String(e) })
      }
    }
  }
}
