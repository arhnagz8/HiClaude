/**
 * Chart of accounts — exactly architecture §5.2.
 *
 * Sign convention used everywhere in `core/ledger`: a journal line's `irt` (and `qty`) is POSITIVE for a debit and NEGATIVE for a credit,
 * so Σ irt over an entry = 0. Normal balances: assets/expenses/cogs = debit; liabilities/equity/revenue = credit;
 * contra accounts (3020 drawings, 4900 discounts) carry debit balances; 7010/7020 are “other” (gain = credit balance).
 *
 * Qualified accounts: 1100/1110/1200 take an exchange/provider qualifier — `acct('1110', 'nobitex')` → `"1110:nobitex"`.
 */
import type { AccountType, LedgerAccount } from '@hiclaude/contracts'

export type NormalBalance = 'debit' | 'credit'

export interface AccountDef {
  code: string
  name: string
  nameFa: string
  type: AccountType
  currency: 'IRT' | 'USDT'
  normal: NormalBalance
  /** True when the code requires a `:qualifier` (exchange or provider id). */
  qualified: boolean
  /** True for contra accounts (balance opposite to their section). */
  contra?: boolean
}

const def = (
  code: string,
  name: string,
  nameFa: string,
  type: AccountType,
  currency: 'IRT' | 'USDT',
  normal: NormalBalance,
  extra: Partial<Pick<AccountDef, 'qualified' | 'contra'>> = {},
): AccountDef => ({ code, name, nameFa, type, currency, normal, qualified: false, ...extra })

/** The chart of accounts (base codes). */
export const CHART_OF_ACCOUNTS: readonly AccountDef[] = [
  // ASSETS
  def('1010', 'BANK_IRT', 'موجودی بانک', 'asset', 'IRT', 'debit'),
  def('1020', 'GATEWAY_RECEIVABLE', 'مطالبات درگاه پرداخت', 'asset', 'IRT', 'debit'),
  def('1100', 'EXCHANGE_IRT', 'موجودی تومانی صرافی', 'asset', 'IRT', 'debit', { qualified: true }),
  def('1110', 'EXCHANGE_USDT', 'موجودی تتر در صرافی', 'asset', 'USDT', 'debit', { qualified: true }),
  def('1120', 'WALLET_USDT', 'کیف پول تتر', 'asset', 'USDT', 'debit'),
  def('1130', 'USDT_IN_TRANSIT', 'تتر در مسیر انتقال', 'asset', 'USDT', 'debit'),
  def('1200', 'PROVIDER_BALANCE', 'موجودی نزد ارائه‌دهنده', 'asset', 'USDT', 'debit', { qualified: true }),
  def('1300', 'PREPAID_INVENTORY', 'موجودی پیش‌خرید', 'asset', 'IRT', 'debit'),
  def('1400', 'VAT_RECEIVABLE', 'مالیات بر ارزش افزوده‌ی دریافتنی', 'asset', 'IRT', 'debit'),
  // LIABILITIES
  def('2010', 'CUSTOMER_PREPAYMENTS', 'پیش‌دریافت مشتریان', 'liability', 'IRT', 'credit'),
  def('2020', 'CUSTOMER_WALLET', 'کیف پول مشتریان', 'liability', 'IRT', 'credit'),
  def('2030', 'REFUNDS_PAYABLE', 'بازپرداخت‌های پرداختنی', 'liability', 'IRT', 'credit'),
  def('2100', 'VAT_PAYABLE', 'مالیات بر ارزش افزوده‌ی پرداختنی', 'liability', 'IRT', 'credit'),
  def('2110', 'INCOME_TAX_PAYABLE', 'مالیات بر درآمد پرداختنی', 'liability', 'IRT', 'credit'),
  def('2200', 'ACCRUED_EXPENSES', 'هزینه‌های پرداخت‌نشده', 'liability', 'IRT', 'credit'),
  // EQUITY
  def('3010', 'OWNER_CAPITAL', 'سرمایه‌ی مالک', 'equity', 'IRT', 'credit'),
  def('3020', 'OWNER_DRAWINGS', 'برداشت مالک', 'equity', 'IRT', 'debit', { contra: true }),
  def('3900', 'RETAINED_EARNINGS', 'سود انباشته', 'equity', 'IRT', 'credit'),
  // REVENUE
  def('4010', 'SALES_CARD_ISSUE', 'فروش صدور کارت', 'revenue', 'IRT', 'credit'),
  def('4020', 'SALES_TOPUP', 'فروش شارژ کارت', 'revenue', 'IRT', 'credit'),
  def('4030', 'SALES_VOUCHER', 'فروش گیفت‌کارت', 'revenue', 'IRT', 'credit'),
  def('4040', 'SALES_SERVICE', 'فروش خدمات', 'revenue', 'IRT', 'credit'),
  def('4050', 'SALES_RUSH_PREMIUM', 'درآمد سرویس فوری', 'revenue', 'IRT', 'credit'),
  def('4060', 'SALES_OTHER', 'سایر فروش‌ها', 'revenue', 'IRT', 'credit'),
  def('4900', 'DISCOUNTS_AND_REFERRALS', 'تخفیف‌ها و معرفی', 'revenue', 'IRT', 'debit', { contra: true }),
  // COST OF SALES
  def('5010', 'COGS_PROVIDER_FACE', 'بهای تمام‌شده‌ی ارزش اسمی', 'cogs', 'IRT', 'debit'),
  def('5020', 'COGS_PROVIDER_FEES', 'کارمزد ارائه‌دهنده', 'cogs', 'IRT', 'debit'),
  def('5030', 'NETWORK_FEES', 'کارمزد شبکه و برداشت', 'cogs', 'IRT', 'debit'),
  def('5040', 'PAYMENT_FEES', 'کارمزد پرداخت', 'cogs', 'IRT', 'debit'),
  def('5050', 'EXCHANGE_FEES', 'کارمزد معاملات صرافی', 'cogs', 'IRT', 'debit'),
  def('5060', 'EXCHANGE_SPREAD_COST', 'هزینه‌ی اسپرد خرید', 'cogs', 'IRT', 'debit'),
  // OPERATING EXPENSES
  def('6010', 'SALARIES', 'حقوق و دستمزد', 'expense', 'IRT', 'debit'),
  def('6020', 'MARKETING', 'بازاریابی', 'expense', 'IRT', 'debit'),
  def('6030', 'HOSTING_TOOLS', 'هاستینگ و ابزار', 'expense', 'IRT', 'debit'),
  def('6040', 'RENT_OFFICE', 'اجاره و دفتر', 'expense', 'IRT', 'debit'),
  def('6050', 'LEGAL_ACCOUNTING', 'حقوقی و حسابداری', 'expense', 'IRT', 'debit'),
  def('6060', 'SUPPORT_COSTS', 'هزینه‌ی پشتیبانی', 'expense', 'IRT', 'debit'),
  def('6070', 'FRAUD_LOSSES', 'زیان کلاهبرداری', 'expense', 'IRT', 'debit'),
  def('6080', 'REFUND_COSTS', 'هزینه‌ی بازپرداخت', 'expense', 'IRT', 'debit'),
  def('6090', 'BANK_AND_MISC', 'هزینه‌های بانکی و متفرقه', 'expense', 'IRT', 'debit'),
  def('6100', 'DEPRECIATION', 'استهلاک', 'expense', 'IRT', 'debit'),
  // OTHER
  def('7010', 'FX_REVALUATION', 'تسعیر ارز', 'other', 'IRT', 'credit'),
  def('7020', 'PENALTIES_FINES', 'جریمه‌ها', 'other', 'IRT', 'debit'),
  def('8010', 'INCOME_TAX_EXPENSE', 'هزینه‌ی مالیات بر درآمد', 'other', 'IRT', 'debit'),
]

const BY_BASE = new Map(CHART_OF_ACCOUNTS.map((a) => [a.code, a]))

/** Builds an account code. Qualified accounts (1100/1110/1200) REQUIRE a qualifier; others reject one. */
export function acct(code: string, qualifier?: string): string {
  const d = BY_BASE.get(code)
  if (!d) throw new RangeError(`unknown account code ${code}`)
  if (d.qualified) {
    if (!qualifier) throw new RangeError(`account ${code} requires a qualifier (exchange/provider id)`)
    if (qualifier.includes(':')) throw new RangeError('qualifier must not contain ":"')
    return `${code}:${qualifier}`
  }
  if (qualifier) throw new RangeError(`account ${code} does not take a qualifier`)
  return code
}

/** Splits `"1110:nobitex"` into `{ base: '1110', qualifier: 'nobitex' }`. */
export function splitAccount(code: string): { base: string; qualifier?: string } {
  const i = code.indexOf(':')
  return i < 0 ? { base: code } : { base: code.slice(0, i), qualifier: code.slice(i + 1) }
}

export interface AccountMeta extends LedgerAccount {
  base: string
  qualifier?: string
  nameFa: string
  normal: NormalBalance
  contra: boolean
}

/** Metadata for any (possibly qualified) account code. Throws `RangeError` for unknown codes or missing qualifiers. */
export function accountMeta(code: string): AccountMeta {
  const { base, qualifier } = splitAccount(code)
  const d = BY_BASE.get(base)
  if (!d) throw new RangeError(`unknown account ${code}`)
  if (d.qualified && !qualifier) throw new RangeError(`account ${code} requires a qualifier`)
  if (!d.qualified && qualifier) throw new RangeError(`account ${base} does not take a qualifier (got ${code})`)
  return {
    code,
    base,
    ...(qualifier !== undefined ? { qualifier } : {}),
    name: qualifier ? `${d.name}:${qualifier}` : d.name,
    nameFa: qualifier ? `${d.nameFa} (${qualifier})` : d.nameFa,
    type: d.type,
    currency: d.currency,
    normal: d.normal,
    contra: !!d.contra,
  }
}

/** True when the account is USDT-denominated (qty in micro-USDT, `irt` = book value). */
export function isUsdtAccount(code: string): boolean {
  return accountMeta(code).currency === 'USDT'
}

/** True for the cash-like accounts used by the cash-flow statement: 1010, 1020 and every 1100:<exchange>. */
export function isCashAccount(code: string): boolean {
  const { base } = splitAccount(code)
  return base === '1010' || base === '1020' || base === '1100'
}

/** All concrete chart entries as `LedgerAccount[]` (unqualified base accounts only — qualified ones are created on demand). */
export function chartAsLedgerAccounts(): LedgerAccount[] {
  return CHART_OF_ACCOUNTS.map((a) => ({ code: a.code, name: a.name, type: a.type, currency: a.currency }))
}

/** Revenue account for a product kind (E5). */
export function salesAccountForKind(kind: 'virtual_card_issue' | 'card_topup' | 'voucher' | 'service_payment' | 'subscription' | string): string {
  switch (kind) {
    case 'virtual_card_issue':
      return '4010'
    case 'card_topup':
      return '4020'
    case 'voucher':
      return '4030'
    case 'service_payment':
    case 'subscription':
      return '4040'
    default:
      return '4060'
  }
}
