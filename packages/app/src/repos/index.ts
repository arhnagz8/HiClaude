import type { Database } from '../db'
import { IdentitiesRepo, CustomersRepo, ReferralsRepo } from './customers'
import { OtpsRepo, SessionsRepo } from './auth'
import { ProductsRepo } from './catalog'
import { OrdersRepo, QuotesRepo } from './orders'
import { BankCreditsRepo, ChainTransfersRepo, PaymentsRepo } from './payments'
import { DeliveriesRepo, TasksRepo } from './tasks'
import { LotsRepo, RatesRepo, TreasuryActionsRepo } from './treasury'
import { LedgerRepo } from './ledger'
import { AlertsRepo, AuditRepo, JobsStateRepo, KillSwitchesRepo, KpiRepo, NotificationsRepo, SettingsRepo, TicketsRepo, UsersRepo } from './platform'

export interface Repos {
  customers: CustomersRepo
  identities: IdentitiesRepo
  referrals: ReferralsRepo
  sessions: SessionsRepo
  otps: OtpsRepo
  products: ProductsRepo
  quotes: QuotesRepo
  orders: OrdersRepo
  payments: PaymentsRepo
  bankCredits: BankCreditsRepo
  chainTransfers: ChainTransfersRepo
  tasks: TasksRepo
  deliveries: DeliveriesRepo
  lots: LotsRepo
  treasuryActions: TreasuryActionsRepo
  rates: RatesRepo
  ledger: LedgerRepo
  settings: SettingsRepo
  users: UsersRepo
  audit: AuditRepo
  notifications: NotificationsRepo
  tickets: TicketsRepo
  kpi: KpiRepo
  jobsState: JobsStateRepo
  killSwitches: KillSwitchesRepo
  alerts: AlertsRepo
}

export function createRepos(db: Database): Repos {
  return {
    customers: new CustomersRepo(db),
    identities: new IdentitiesRepo(db),
    referrals: new ReferralsRepo(db),
    sessions: new SessionsRepo(db),
    otps: new OtpsRepo(db),
    products: new ProductsRepo(db),
    quotes: new QuotesRepo(db),
    orders: new OrdersRepo(db),
    payments: new PaymentsRepo(db),
    bankCredits: new BankCreditsRepo(db),
    chainTransfers: new ChainTransfersRepo(db),
    tasks: new TasksRepo(db),
    deliveries: new DeliveriesRepo(db),
    lots: new LotsRepo(db),
    treasuryActions: new TreasuryActionsRepo(db),
    rates: new RatesRepo(db),
    ledger: new LedgerRepo(db),
    settings: new SettingsRepo(db),
    users: new UsersRepo(db),
    audit: new AuditRepo(db),
    notifications: new NotificationsRepo(db),
    tickets: new TicketsRepo(db),
    kpi: new KpiRepo(db),
    jobsState: new JobsStateRepo(db),
    killSwitches: new KillSwitchesRepo(db),
    alerts: new AlertsRepo(db),
  }
}

export * from './json'
export * from './schemas'
export * from './customers'
export * from './auth'
export * from './catalog'
export * from './orders'
export * from './payments'
export * from './tasks'
export * from './treasury'
export * from './ledger'
export * from './platform'
