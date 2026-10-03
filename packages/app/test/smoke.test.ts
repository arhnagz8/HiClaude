import { describe, expect, it } from 'vitest'
import { makeTestApp } from './fakes'

describe('makeTestApp smoke', () => {
  it('boots, migrates, seeds staff and exposes services', async () => {
    const t = makeTestApp()
    expect(t.app.services.staff.listUsers().map((u) => u.role)).toEqual(['owner', 'admin', 'operator', 'support', 'accountant', 'viewer'])
    expect(t.app.params().pricing.version).toBe(1)
    expect(t.app.services.catalog.list().length).toBeGreaterThan(5)
    const r = await t.app.tick()
    expect(r.map((x) => x.name)).toContain('notifications.dispatch')
    t.app.close()
  })
})
