import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AppError, defaultPlatformParams, type DomainEvent } from '@hiclaude/contracts'
import { describe, expect, it } from 'vitest'
import { ConfigFileError, loadParamsFromDir, loadPlatformParams } from '../src'
import { makeTestApp } from './helpers'

function withDataDir(files: Record<string, unknown>, fn: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), 'hc-data-'))
  try {
    mkdirSync(join(dir, 'config'), { recursive: true })
    for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), typeof content === 'string' ? content : JSON.stringify(content))
    fn(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('SettingsService — layering', () => {
  it('returns defaults when no files and no DB overrides', () => {
    const t = makeTestApp()
    expect(t.app.params()).toEqual(defaultPlatformParams())
    t.app.close()
  })

  it('layers defaults ← config files ← DB overrides', () => {
    withDataDir(
      {
        'config/pricing.json': { marginPct: 0.2, riskBufferPct: 0.02 },
        'config/treasury.json': { treasury: { targetCoverageDays: 7 }, provenance: { targetCoverageDays: 'x' } }, // wrapped form
        'config/notes.json': { ignored: true }, // not a param section → ignored
      },
      (dir) => {
        const t = makeTestApp({ dataDir: dir })
        const p = t.app.params()
        expect(p.pricing.marginPct).toBe(0.2)
        expect(p.pricing.floorMarginPct).toBe(0.03) // default kept
        expect(p.treasury.targetCoverageDays).toBe(7)
        // DB wins over file
        t.app.services.settings.setParam('pricing.marginPct', 0.15, 'usr_1')
        expect(t.app.params().pricing.marginPct).toBe(0.15)
        expect(t.app.params().pricing.riskBufferPct).toBe(0.02)
        // clearing the override reverts to the file value
        t.app.services.settings.clearParam('pricing.marginPct', 'usr_1')
        expect(t.app.params().pricing.marginPct).toBe(0.2)
      },
    )
  })

  it('loadParamsFromDir / loadPlatformParams validate per file and name the culprit', () => {
    withDataDir({ 'config/pricing.json': { marginPct: -1 } }, (dir) => {
      expect(() => loadParamsFromDir(dir)).toThrow(ConfigFileError)
      expect(() => loadPlatformParams(dir)).toThrow(/pricing\.json/)
    })
    withDataDir({ 'config/risk.json': '{not json' }, (dir) => {
      expect(() => loadParamsFromDir(dir)).toThrow(/invalid JSON/)
    })
    expect(loadParamsFromDir('/definitely/not/here').files).toEqual([])
    withDataDir({ 'config/exchanges.json': [{ ...defaultPlatformParams().exchanges[0], id: 'solo' }] }, (dir) => {
      expect(loadPlatformParams(dir).exchanges.map((e) => e.id)).toEqual(['solo']) // arrays replaced wholesale
    })
  })

  it('returned params are frozen (accidental mutation fails fast)', () => {
    const t = makeTestApp()
    expect(() => {
      ;(t.app.params().pricing as { marginPct: number }).marginPct = 5
    }).toThrow(TypeError)
  })
})

describe('SettingsService — writes', () => {
  it('setParam validates against the schema and leaves state untouched on failure', () => {
    const t = makeTestApp()
    const s = t.app.services.settings
    expect(() => s.setParam('pricing.marginPct', -0.5, 'u')).toThrowError(AppError)
    expect(() => s.setParam('pricing.nope', 1, 'u')).not.toThrow() // unknown keys are stripped by the schema, not an error
    expect(t.app.repos.settings.get('params.pricing.marginPct')).toBeUndefined()
    expect(t.app.params().pricing.marginPct).toBe(0.1)
    s.setParam('regulatory.nightHalt.enabled', true, 'u')
    expect(t.app.params().regulatory.nightHalt.enabled).toBe(true)
  })

  it('updatePricingPolicy bumps the version once, writes audit rows and publishes an event', () => {
    const t = makeTestApp()
    const events: DomainEvent[] = []
    t.app.bus.subscribe('settings.changed', (e) => events.push(e))
    const before = t.app.params().pricing
    const after = t.app.services.settings.updatePricingPolicy({ marginPct: 0.12, volatility: { z: 2 }, rushTiers: [{ id: 'normal', labelFa: 'عادی', premiumPct: 0, minPremiumIrt: 0, slaMinutes: 60, capacityPerHour: null, enabled: true }] }, 'staff:usr_9', 'calibration')
    expect(after.version).toBe(before.version + 1)
    expect(after.marginPct).toBe(0.12)
    expect(after.volatility.z).toBe(2)
    expect(after.volatility.lockMinutes).toBe(before.volatility.lockMinutes) // untouched leaves preserved
    expect(after.rushTiers).toHaveLength(1)
    expect(t.app.params().pricing).toEqual(after)
    const audit = t.app.services.settings.audit({ keyPrefix: 'params.pricing' })
    expect(audit.map((a) => a.key)).toContain('params.pricing.version')
    expect(audit.every((a) => a.actor === 'staff:usr_9' && a.reason === 'calibration')).toBe(true)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ type: 'settings.changed', scope: 'params', actor: 'staff:usr_9' })
  })

  it('updatePricingPolicy is a no-op (no version bump) when nothing changes, and ignores a supplied version', () => {
    const t = makeTestApp()
    const s = t.app.services.settings
    expect(s.updatePricingPolicy({ marginPct: 0.1 }, 'u').version).toBe(1)
    expect(s.updatePricingPolicy({ version: 99 } as never, 'u').version).toBe(1)
    expect(s.updatePricingPolicy({ marginPct: 0.11 }, 'u').version).toBe(2)
    expect(s.updatePricingPolicy({ marginPct: 0.12 }, 'u').version).toBe(3)
  })

  it('updatePricingPolicy rejects invalid patches atomically', () => {
    const t = makeTestApp()
    const s = t.app.services.settings
    expect(() => s.updatePricingPolicy({ marginPct: 0.2, roundingStepIrt: 0 }, 'u')).toThrowError(AppError)
    expect(t.app.params().pricing.marginPct).toBe(0.1)
    expect(t.app.params().pricing.version).toBe(1)
    expect(t.app.repos.settings.list('params')).toHaveLength(0)
  })

  it('a corrupt DB override never breaks reads (falls back to base)', () => {
    const t = makeTestApp()
    t.app.repos.settings.put('params.pricing.marginPct', 'abc', { now: 1 })
    t.app.services.settings.invalidate()
    expect(t.app.params().pricing.marginPct).toBe(0.1)
  })

  it('flags: get/set with versions, defaults, audit and cache invalidation', () => {
    const t = makeTestApp()
    const s = t.app.services.settings
    expect(s.get('flag.x', 5)).toBe(5)
    s.set('flag.x', 7, 'u')
    expect(s.get('flag.x', 5)).toBe(7)
    expect(s.set('flag.x', 8, 'u').version).toBe(2)
    expect(() => s.set('flag.x', 9, 'u', 'r', 1)).toThrowError(/modified concurrently/)
    expect(() => s.set('params.pricing.marginPct', 1, 'u')).toThrowError(AppError)
    expect(s.listFlags('flag')).toHaveLength(1)
    expect(s.unset('flag.x', 'u')).toBe(true)
    expect(s.get('flag.x', 5)).toBe(5)
    expect(s.audit({ key: 'flag.x' })).toHaveLength(3)
  })

  it('banner and kill switches', () => {
    const t = makeTestApp()
    const s = t.app.services.settings
    expect(s.getBanner()).toBeUndefined()
    s.setBanner({ severity: 'warning', textFa: 'تعمیرات' }, 'u')
    expect(s.getBanner()?.textFa).toBe('تعمیرات')
    s.setBanner(null, 'u')
    expect(s.getBanner()).toBeUndefined()

    const events: DomainEvent[] = []
    t.app.bus.subscribe('killswitch.changed', (e) => events.push(e))
    expect(s.salesBlock({ productId: 'p', providerId: 'mpay' }).blocked).toBe(false)
    s.setKillSwitch({ scope: 'provider', scopeId: 'mpay', on: true, reason: 'provider down' }, 'staff:u1')
    expect(s.salesBlock({ productId: 'p', providerId: 'mpay' })).toMatchObject({ blocked: true, scope: 'provider' })
    expect(s.salesBlock({ providerId: 'other' }).blocked).toBe(false)
    s.setKillSwitch({ scope: 'all', on: true, reason: 'maintenance' }, 'u')
    expect(s.salesBlock({ providerId: 'other' }).blocked).toBe(true)
    s.setKillSwitch({ scope: 'all', on: false, reason: 'done' }, 'u')
    expect(s.isKilled('all')).toBe(false)
    expect(() => s.setKillSwitch({ scope: 'product', on: true, reason: 'x' }, 'u')).toThrowError(AppError)
    expect(events).toHaveLength(3)
    expect(t.app.services.audit.list({ action: 'killswitch.set' })).toHaveLength(3)
    expect(s.listKillSwitches(true).map((k) => k.key)).toEqual(['provider:mpay'])
  })
})
