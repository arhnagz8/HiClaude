/**
 * createApp(deps) — composition root of the engine.
 *
 * Builds: database (+ migrations), event bus, id generator, repositories, platform services, job runner.
 * Engine services (pricing, rates, orders, payments, fulfilment, treasury, ledger, reports, support, expenses) are written by B3
 * and plug into the `AppServices` slots below; they receive `app.ctx` (everything a service needs) and register their jobs on `app.jobs`.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { MS, createEventBus, createIdGen, deepMerge, parsePlatformParams, type AppDeps, type EventBus, type IdGen, type PlatformParams, type Rng, type Clock, type AppPorts } from '@hiclaude/contracts'
import type { AppContext } from './context'
import { DEV_MASTER_KEY_HEX, parseMasterKey, type RunMode } from './crypto'
import { Database, migrate } from './db'
import { JobRunner, type JobTickResult } from './jobs'
import { createRepos, type Repos } from './repos'
import { AlertService } from './services/alerts'
import { AuditService } from './services/audit'
import { CatalogService } from './services/catalog'
import { CustomerService } from './services/customers'
import { NotificationService } from './services/notifications'
import { loadParamsFromDir } from './services/paramsLoader'
import { SettingsService } from './services/settings'
import { StaffService } from './services/staff'
import { CostRecorder, noopLogger } from './util'

export interface AppServices {
  // ── foundation (B2) ──
  settings: SettingsService
  staff: StaffService
  customers: CustomerService
  catalog: CatalogService
  notifications: NotificationService
  alerts: AlertService
  audit: AuditService
  // ── engine slots (B3 fills these in; typed `unknown` until the concrete service classes exist) ──
  pricing?: unknown // B3: PricingService
  rates?: unknown // B3: RateService
  orders?: unknown // B3: OrderService
  payments?: unknown // B3: PaymentService
  fulfilment?: unknown // B3: FulfilmentService
  treasury?: unknown // B3: TreasuryService
  ledger?: unknown // B3: LedgerService
  reports?: unknown // B3: ReportService
  support?: unknown // B3: SupportService
  expenses?: unknown // B3: ExpenseService
}

export interface CreateAppOptions {
  /** Directory holding `config/*.json`, `catalog.json`, `copy.fa.json` (default: none → defaults only). */
  dataDir?: string
  /** Override the catalog file path (default `<dataDir>/catalog.json`). */
  catalogPath?: string
  /** Override the notification copy file (default `<dataDir>/copy.fa.json`). */
  copyPath?: string
  /** Seed owner/admin/operator/… demo accounts (default: true unless mode === 'live'). */
  seedDemoStaff?: boolean
  /** Subscribe NotificationService to domain events (default true). */
  wireNotifications?: boolean
}

export interface App {
  deps: AppDeps
  ctx: AppContext
  clock: Clock
  rng: Rng
  ids: IdGen
  db: Database
  repos: Repos
  bus: EventBus
  ports: AppPorts
  mode: RunMode
  services: AppServices
  jobs: JobRunner
  costs: CostRecorder
  /** Effective params (defaults ← files ← DB overrides). */
  params(): PlatformParams
  /** Shortcut for `jobs.tick(now)`. */
  tick(now?: number): Promise<JobTickResult[]>
  close(): void
}

export function createApp(deps: AppDeps, opts: CreateAppOptions = {}): App {
  const mode = deps.mode as RunMode
  const logger = deps.logger ?? noopLogger
  const masterKeyHex = deps.masterKeyHex ?? (mode === 'live' ? '' : DEV_MASTER_KEY_HEX)
  parseMasterKey(masterKeyHex) // throws a clear CryptoError in live mode without a valid key
  const ids = deps.ids ?? createIdGen()

  const db = Database.open(deps.dbPath)
  try {
    migrate(db, deps.clock.now())
  } catch (e) {
    db.close()
    throw e
  }
  const repos = createRepos(db)
  const bus = createEventBus((e, ev) => logger.error('event handler failed', { error: String(e), event: ev.type }))
  const costs = new CostRecorder()

  // ── params: deps.params (defaults) ← data/config/*.json ← DB (SettingsService) ──
  let base = deps.params
  if (opts.dataDir) base = parsePlatformParams(deepMerge(base, loadParamsFromDir(opts.dataDir, base).partial))
  else base = parsePlatformParams(base)

  let settingsRef: SettingsService | undefined
  const ctx: AppContext = {
    clock: deps.clock,
    rng: deps.rng,
    ids,
    db,
    repos,
    bus,
    ports: deps.ports,
    logger,
    mode,
    masterKeyHex,
    params: () => (settingsRef as SettingsService).getParams(),
    costs,
    publish: (e) => bus.publish(e),
  }
  const settings = new SettingsService(ctx, base)
  settingsRef = settings

  const audit = new AuditService(ctx)
  const alerts = new AlertService(ctx)
  const staff = new StaffService(ctx, audit)
  const catalogPath = opts.catalogPath ?? (opts.dataDir ? join(opts.dataDir, 'catalog.json') : undefined)
  const catalog = new CatalogService(ctx, { settings, audit, catalogPath })
  const notifications = new NotificationService(ctx)
  const copyPath = opts.copyPath ?? (opts.dataDir ? join(opts.dataDir, 'copy.fa.json') : undefined)
  if (copyPath && existsSync(copyPath)) notifications.loadCopyFile(copyPath)
  const customers = new CustomerService(ctx, { settings, notifications, audit })

  const jobs = new JobRunner({ clock: deps.clock, state: repos.jobsState, alerts, logger })
  jobs.register({ name: 'notifications.dispatch', intervalMs: MS.minute, handler: async () => void (await notifications.flush()) })
  jobs.register({
    name: 'platform.housekeeping',
    atIrst: { hour: 3, minute: 30 },
    skipInitialCatchUp: true,
    handler: ({ now }) => {
      repos.sessions.deleteExpired(now)
      repos.otps.deleteBefore(now - MS.day)
    },
  })

  const unwire = opts.wireNotifications === false ? () => {} : notifications.wireEvents(bus)
  if ((opts.seedDemoStaff ?? mode !== 'live') && mode !== 'live') staff.seedDemoStaff()

  let closed = false
  return {
    deps,
    ctx,
    clock: deps.clock,
    rng: deps.rng,
    ids,
    db,
    repos,
    bus,
    ports: deps.ports,
    mode,
    services: { settings, staff, customers, catalog, notifications, alerts, audit },
    jobs,
    costs,
    params: () => settings.getParams(),
    tick: (now) => jobs.tick(now),
    close() {
      if (closed) return
      closed = true
      unwire()
      db.close()
    },
  }
}
