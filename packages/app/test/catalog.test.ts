import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AppError, defaultProducts } from '@hiclaude/contracts'
import { describe, expect, it } from 'vitest'
import { checkAmount, checkInputs, unwrapRecords } from '../src'
import { makeTestApp } from './helpers'

function withFile(content: unknown, fn: (path: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), 'hc-cat-'))
  try {
    const path = join(dir, 'catalog.json')
    writeFileSync(path, typeof content === 'string' ? content : JSON.stringify(content))
    fn(path)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('catalog loading', () => {
  it('uses defaultProducts() when no file exists', () => {
    const t = makeTestApp()
    expect(t.app.services.catalog.report.source).toBe('defaults')
    expect(t.app.services.catalog.list().map((p) => p.id).sort()).toEqual(defaultProducts().map((p) => p.id).sort())
  })

  it('loads data/catalog.json, unwrapping research Record wrappers, and skips invalid entries', () => {
    const base = defaultProducts()[2]!
    const wrapped = {
      ...base,
      id: 'file-1',
      slug: 'file-one',
      riskLabel: { value: 'high', unit: 'label', as_of: '2026-10-02', confidence: 'medium', sources: [{ url: 'u', title: 't' }], verify_how: 'x' },
      amount: { kind: 'fixed', fixedUsdCents: { value: 1500, unit: 'usd_cents', as_of: '2026-10-02', confidence: 'low', sources: [] } },
    }
    withFile({ products: [wrapped, { id: 'broken' }, { ...base, id: 'file-1', slug: 'dup' }, { ...base, id: 'file-2', slug: 'file-two' }] }, (path) => {
      const t = makeTestApp({ appOptions: { catalogPath: path } })
      const cat = t.app.services.catalog
      expect(cat.report).toMatchObject({ source: 'file', loaded: 2 })
      expect(cat.report.skipped.map((s) => s.id)).toEqual(['broken', 'file-1'])
      expect(cat.get('file-1')).toMatchObject({ riskLabel: 'high', amount: { kind: 'fixed', fixedUsdCents: 1500 } })
      expect(cat.get('gift-steam')).toBeUndefined() // file replaces defaults
      expect(cat.getBySlug('file-two')?.id).toBe('file-2')
    })
  })

  it('falls back to defaults for unreadable or empty files and reload() re-syncs', () => {
    withFile('{not json', (path) => {
      expect(makeTestApp({ appOptions: { catalogPath: path } }).app.services.catalog.report.source).toBe('defaults')
    })
    withFile([], (path) => {
      expect(makeTestApp({ appOptions: { catalogPath: path } }).app.services.catalog.report.source).toBe('defaults')
    })
    withFile([{ ...defaultProducts()[0]!, id: 'only' }], (path) => {
      const t = makeTestApp({ appOptions: { catalogPath: path } })
      expect(t.app.services.catalog.list().map((p) => p.id)).toEqual(['only'])
      writeFileSync(path, JSON.stringify([{ ...defaultProducts()[0]!, id: 'other' }]))
      t.app.services.catalog.reload()
      expect(t.app.services.catalog.list().map((p) => p.id)).toEqual(['other'])
    })
  })

  it('a research-format file (no products[] array) falls back to defaults with an explanatory note', () => {
    withFile({ meta: {}, skus: [{ id: 'chatgpt-go' }] }, (path) => {
      const t = makeTestApp({ appOptions: { catalogPath: path } })
      expect(t.app.services.catalog.report).toMatchObject({ source: 'defaults' })
      expect(t.app.services.catalog.report.note).toMatch(/calibration/)
    })
  })

  it('unwrapRecords only collapses provenance-shaped objects', () => {
    expect(unwrapRecords({ value: 5, as_of: 'x' })).toBe(5)
    expect(unwrapRecords({ value: 5, other: 1 })).toEqual({ value: 5, other: 1 })
    expect(unwrapRecords([{ a: { value: 'z', confidence: 'high' } }])).toEqual([{ a: 'z' }])
  })
})

describe('overrides', () => {
  it('merge active/margin/SLA over the base product and are audited; clear restores', () => {
    const t = makeTestApp()
    const cat = t.app.services.catalog
    const base = cat.get('gift-steam')!
    const p = cat.setOverride('gift-steam', { active: false, marginOverridePct: 0.05, slaMinutes: { normal: 7 }, lossLeader: true, minMarginOverrideIrt: 10 }, 'staff:u1')
    expect(p).toMatchObject({ active: false, marginOverridePct: 0.05, lossLeader: true, minMarginOverrideIrt: 10 })
    expect(p.slaMinutes).toEqual({ ...base.slaMinutes, normal: 7 })
    expect(cat.list().find((x) => x.id === 'gift-steam')).toBeUndefined()
    expect(cat.list({ includeInactive: true }).find((x) => x.id === 'gift-steam')).toBeDefined()
    // partial patch keeps earlier fields; null clears one
    const p2 = cat.setOverride('gift-steam', { active: true, marginOverridePct: null }, 'staff:u1')
    expect(p2).toMatchObject({ active: true, lossLeader: true })
    expect(p2.marginOverridePct).toBeUndefined()
    expect(t.app.services.audit.list({ action: 'catalog.override' })).toHaveLength(2)
    const cleared = cat.clearOverride('gift-steam', 'staff:u1')
    expect(cleared).toEqual(base)
  })

  it('survive a reload of the base catalog and reject bad values / unknown products', () => {
    const t = makeTestApp()
    const cat = t.app.services.catalog
    cat.setOverride('gift-psn', { active: false }, 'u')
    cat.reload()
    expect(cat.get('gift-psn')?.active).toBe(false)
    expect(() => cat.setOverride('gift-psn', { marginOverridePct: -1 }, 'u')).toThrowError(AppError)
    expect(() => cat.setOverride('gift-psn', { minMarginOverrideIrt: 1.5 }, 'u')).toThrowError(AppError)
    expect(() => cat.setOverride('nope', { active: false }, 'u')).toThrowError(/not found/)
    expect(() => cat.require('nope')).toThrowError(AppError)
  })
})

describe('availability', () => {
  it('available with the primary provider; transparency fields included', () => {
    const t = makeTestApp()
    const cat = t.app.services.catalog
    const a = cat.availability(cat.get('ai-service-payment')!)
    expect(a).toMatchObject({ available: true, providerId: 'mpay', riskLabel: 'high' })
    expect(a.restrictionNoteFa).toContain('مسدود')
  })

  it('inactive, disabled / unknown provider, kill switches, alternate provider fallback', () => {
    const t = makeTestApp()
    const cat = t.app.services.catalog
    const s = t.app.services.settings
    const vc = cat.get('vcard-new')! // primary mpay, alt altcard
    cat.setOverride('gift-steam', { active: false }, 'u')
    expect(cat.availability(cat.get('gift-steam')!).reason).toBe('inactive')
    s.setKillSwitch({ scope: 'provider', scopeId: 'mpay', on: true, reason: 'down' }, 'u')
    expect(cat.availability(vc)).toMatchObject({ available: true, providerId: 'altcard' })
    s.setKillSwitch({ scope: 'provider', scopeId: 'altcard', on: true, reason: 'down' }, 'u')
    expect(cat.availability(vc)).toMatchObject({ available: false, reason: 'kill_switch' })
    s.setKillSwitch({ scope: 'provider', scopeId: 'mpay', on: false, reason: 'ok' }, 'u')
    s.setKillSwitch({ scope: 'product', scopeId: 'vcard-new', on: true, reason: 'x' }, 'u')
    expect(cat.availability(vc).reason).toBe('kill_switch')
    s.setKillSwitch({ scope: 'product', scopeId: 'vcard-new', on: false, reason: 'x' }, 'u')
    s.setKillSwitch({ scope: 'provider', scopeId: 'altcard', on: false, reason: 'x' }, 'u')

    const t2 = makeTestApp({ params: { providers: [{ ...makeTestApp().params.providers[0]!, enabled: false }, ...makeTestApp().params.providers.slice(1)] } as never })
    expect(t2.app.services.catalog.availability(t2.app.services.catalog.get('ai-service-payment')!).reason).toBe('provider_disabled')
    const t3 = makeTestApp()
    const orphan = { ...t3.app.services.catalog.get('gift-steam')!, providerId: 'ghost' }
    expect(t3.app.services.catalog.availability(orphan).reason).toBe('provider_unknown')
  })

  it('blocked customers and tier-by-risk rule', () => {
    const t = makeTestApp()
    const cat = t.app.services.catalog
    const ai = cat.get('ai-service-payment')!
    expect(cat.availability(ai, t.clock.now(), { customer: { tier: 'new', status: 'blocked' } }).reason).toBe('customer_blocked')
    expect(cat.availability(ai, t.clock.now(), { customer: { tier: 'new' } }).available).toBe(true) // permissive default
    t.app.services.settings.set('catalog.minTierByRisk', { low: 'new', medium: 'new', high: 'verified' }, 'u')
    expect(cat.availability(ai, t.clock.now(), { customer: { tier: 'new' } }).reason).toBe('tier_not_allowed')
    expect(cat.availability(ai, t.clock.now(), { customer: { tier: 'verified' } }).available).toBe(true)
    expect(cat.availability(cat.get('gift-steam')!, t.clock.now(), { customer: { tier: 'new' } }).available).toBe(true)
  })

  it('toDto exposes no internal fields and falls back to the provider restriction note', () => {
    const t = makeTestApp()
    const dto = t.app.services.catalog.toDto(t.app.services.catalog.get('vcard-topup')!)
    expect(dto).not.toHaveProperty('marginOverridePct')
    expect(dto).not.toHaveProperty('providerId')
    expect(dto.restrictionNoteFa).toContain('ایران') // from provider mpay
  })
})

describe('amount & input validation', () => {
  it('amount kinds: fixed / options / range with step', () => {
    expect(checkAmount({ kind: 'fixed', fixedUsdCents: 1000 }, 1000)).toBeNull()
    expect(checkAmount({ kind: 'fixed', fixedUsdCents: 1000 }, 999)?.code).toBe('not_allowed')
    expect(checkAmount({ kind: 'options', optionsUsdCents: [500, 1000] }, 1000)).toBeNull()
    expect(checkAmount({ kind: 'options', optionsUsdCents: [500, 1000] }, 700)?.code).toBe('not_allowed')
    const range = { kind: 'range' as const, minUsdCents: 1000, maxUsdCents: 5000, stepUsdCents: 500 }
    expect(checkAmount(range, 1000)).toBeNull()
    expect(checkAmount(range, 3500)).toBeNull()
    expect(checkAmount(range, 500)?.code).toBe('out_of_range')
    expect(checkAmount(range, 5500)?.code).toBe('out_of_range')
    expect(checkAmount(range, 1250)?.code).toBe('step')
    for (const bad of [0, -5, 10.5, NaN]) expect(checkAmount(range, bad)?.code).toBe('invalid')
  })

  it('validateAmount throws AppError VALIDATION for a product', () => {
    const t = makeTestApp()
    const cat = t.app.services.catalog
    const p = cat.get('vcard-topup')!
    expect(() => cat.validateAmount(p, 2000)).not.toThrow()
    expect(() => cat.validateAmount(p, 999_999_99)).toThrowError(AppError)
    expect(cat.checkAmount(p, 1250)?.code).toBe('step')
  })

  it('inputs: required, email, select, number, card_ref, pattern, sanitisation', () => {
    const product = {
      inputs: [
        { key: 'accountEmail', labelFa: 'ایمیل', type: 'email' as const, required: true },
        { key: 'service', labelFa: 'سرویس', type: 'select' as const, required: true, options: [{ value: 'claude', labelFa: 'Claude' }] },
        { key: 'n', labelFa: 'عدد', type: 'number' as const, required: false },
        { key: 'cardRef', labelFa: 'کارت', type: 'card_ref' as const, required: false },
        { key: 'code', labelFa: 'کد', type: 'text' as const, required: false, pattern: '^[A-Z]{3}$', helpFa: 'سه حرف' },
      ],
    }
    const ok = checkInputs(product, { accountEmail: ' a@b.co ', service: 'claude', n: '۱۲', cardRef: 'crd_01', code: 'ABC', evil: '<script>' })
    expect(ok.issues).toEqual([])
    expect(ok.inputs).toEqual({ accountEmail: 'a@b.co', service: 'claude', n: '۱۲', cardRef: 'crd_01', code: 'ABC' })
    const bad = checkInputs(product, { accountEmail: 'nope', service: 'gpt', n: 'x', cardRef: '!!', code: 'abcd' })
    expect(bad.issues.map((i) => i.field)).toEqual(['accountEmail', 'service', 'n', 'cardRef', 'code'])
    expect(checkInputs(product, {}).issues.map((i) => [i.field, i.code])).toEqual([['accountEmail', 'required'], ['service', 'required']])
    expect(checkInputs(product, { accountEmail: 'a@b.co', service: 'claude', code: 'x'.repeat(300) }).issues[0]?.field).toBe('code')
    // a broken regex in data must not block the sale
    const broken = checkInputs({ inputs: [{ key: 'k', labelFa: 'k', type: 'text', required: true, pattern: '(' }] }, { k: 'v' })
    expect(broken.issues).toEqual([])
  })

  it('validateInputs returns sanitized inputs or throws with all issues', () => {
    const t = makeTestApp()
    const cat = t.app.services.catalog
    const p = cat.get('ai-service-payment')!
    expect(cat.validateInputs(p, { service: 'claude', accountEmail: 'me@x.com', junk: '1' })).toEqual({ service: 'claude', accountEmail: 'me@x.com' })
    try {
      cat.validateInputs(p, {})
      expect.unreachable()
    } catch (e) {
      expect((e as AppError).details?.issues).toHaveLength(2)
    }
  })
})
