/**
 * makeTestApp — a fully wired App on in-memory SQLite with controllable fake ports and a ManualClock.
 *
 *   const { app, clock, ports, fakes } = makeTestApp()
 *   fakes.exchanges.nobitex.setRates(1_000_000, 1_003_000)
 *   clock.advance(60_000); await app.tick()
 *
 * Reused by B3 (engine tests), apps/api and sim smoke tests (import from '@hiclaude/app/testing').
 */
import {
  ManualClock,
  createRng,
  defaultPlatformParams,
  deepMerge,
  fromIrst,
  type AppDeps,
  type AppPorts,
  type DeepPartial,
  type PlatformParams,
  type Rng,
} from '@hiclaude/contracts'
import { createApp, type App, type CreateAppOptions } from '../../src/app'
import { FakeBank } from './bank'
import { FakeChain } from './chain'
import { FakeExchange } from './exchange'
import { FakeGateway } from './gateway'
import { FakeIdentity, FakeMessenger, FakeSms } from './messaging'
import { FakeProvider } from './provider'

/** 2026-10-02 12:00 IRST (Friday 10 Mehr 1405). */
export const TEST_START = fromIrst(2026, 10, 2, 12, 0)

export interface Fakes {
  exchanges: Record<string, FakeExchange>
  gateways: Record<string, FakeGateway>
  bank: FakeBank
  chain: FakeChain
  providers: Record<string, FakeProvider>
  telegram: FakeMessenger
  bale: FakeMessenger
  sms: FakeSms
  identity: FakeIdentity
}

export interface MakeTestAppOptions {
  params?: DeepPartial<PlatformParams>
  /** default 'test' */
  mode?: 'test' | 'demo' | 'sim'
  /** start instant (default 2026-10-02 12:00 IRST) */
  now?: number
  seed?: number | string
  dataDir?: string
  appOptions?: CreateAppOptions
  dbPath?: string
}

export interface TestApp {
  app: App
  clock: ManualClock
  rng: Rng
  params: PlatformParams
  ports: AppPorts
  fakes: Fakes
  /** advance the manual clock */
  advance(ms: number): void
}

export function makeTestApp(o: MakeTestAppOptions = {}): TestApp {
  const clock = new ManualClock(o.now ?? TEST_START)
  const rng = createRng(o.seed ?? 1)
  const params = deepMerge<PlatformParams>(defaultPlatformParams(), o.params)

  const exchanges: Record<string, FakeExchange> = {}
  for (const ex of params.exchanges) exchanges[ex.id] = new FakeExchange(ex.id, clock, { takerFeeBps: ex.takerFeeBps })
  const gateways: Record<string, FakeGateway> = { [params.paymentMethods.gateway.gatewayId]: new FakeGateway(params.paymentMethods.gateway.gatewayId, clock) }
  const providers: Record<string, FakeProvider> = {}
  for (const p of params.providers) providers[p.id] = new FakeProvider(p.id, clock, { mode: p.capabilities.issue === 'api' ? 'api' : 'panel' })
  const fakes: Fakes = {
    exchanges,
    gateways,
    bank: new FakeBank(clock),
    chain: new FakeChain(clock),
    providers,
    telegram: new FakeMessenger('telegram', clock),
    bale: new FakeMessenger('bale', clock),
    sms: new FakeSms(clock),
    identity: new FakeIdentity(),
  }
  const ports: AppPorts = {
    exchanges,
    gateways,
    bank: fakes.bank,
    chain: fakes.chain,
    providers,
    messengers: { telegram: fakes.telegram, bale: fakes.bale },
    sms: fakes.sms,
    identity: fakes.identity,
  }
  const deps: AppDeps = { clock, rng, params, dbPath: o.dbPath ?? ':memory:', ports, mode: o.mode ?? 'test' }
  const app = createApp(deps, { dataDir: o.dataDir, ...o.appOptions })
  return { app, clock, rng, params, ports, fakes, advance: (ms) => clock.advance(ms) }
}
