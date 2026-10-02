/**
 * RBAC matrix (documented in packages/app/README.md; locked by a snapshot test).
 * Roles: owner | admin | operator | support | accountant | viewer.   `*` = every permission.
 */
import type { StaffRole } from '@hiclaude/contracts'

export const PERMISSIONS = [
  'dashboard.view',
  'orders.view',
  'orders.manage', // approve/reject payment, cancel, hold/release, retry
  'orders.refund',
  'tasks.view',
  'tasks.work', // claim / complete / fail / release fulfilment tasks
  'payments.view',
  'payments.match', // match bank credits / chain transfers manually
  'treasury.view',
  'treasury.act', // buy / withdraw / sweep
  'rates.view',
  'rates.killswitch',
  'policy.view',
  'policy.edit', // pricing policy
  'settings.view',
  'settings.edit',
  'catalog.view',
  'catalog.edit',
  'customers.view',
  'customers.manage', // block / limit / tier
  'tickets.view',
  'tickets.reply',
  'tickets.assign',
  'reports.view',
  'ledger.view',
  'expenses.manage',
  'audit.view',
  'users.view',
  'users.manage',
  'sim.control',
] as const

export type Permission = (typeof PERMISSIONS)[number]

const ALL: readonly Permission[] = PERMISSIONS

export const ROLE_PERMISSIONS: Record<StaffRole, readonly Permission[]> = {
  owner: ALL,
  admin: ALL.filter((p) => p !== 'users.manage' && p !== 'sim.control' && p !== 'expenses.manage'),
  operator: ['dashboard.view', 'orders.view', 'orders.manage', 'tasks.view', 'tasks.work', 'payments.view', 'rates.view', 'catalog.view', 'customers.view', 'tickets.view', 'tickets.reply'],
  support: ['dashboard.view', 'orders.view', 'payments.view', 'catalog.view', 'customers.view', 'tickets.view', 'tickets.reply', 'tickets.assign'],
  accountant: ['dashboard.view', 'orders.view', 'payments.view', 'payments.match', 'treasury.view', 'rates.view', 'reports.view', 'ledger.view', 'expenses.manage', 'audit.view', 'customers.view'],
  viewer: ['dashboard.view', 'orders.view', 'rates.view', 'catalog.view', 'reports.view'],
}

export function can(role: StaffRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false
}

export function permissionsOf(role: StaffRole): readonly Permission[] {
  return ROLE_PERMISSIONS[role] ?? []
}

/** Markdown table of the matrix (used in README generation/tests). */
export function rbacMatrixMarkdown(): string {
  const roles = Object.keys(ROLE_PERMISSIONS) as StaffRole[]
  const lines = [`| permission | ${roles.join(' | ')} |`, `|---|${roles.map(() => ':-:').join('|')}|`]
  for (const p of PERMISSIONS) lines.push(`| ${p} | ${roles.map((r) => (can(r, p) ? '✓' : '')).join(' | ')} |`)
  return lines.join('\n')
}
