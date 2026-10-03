/** Event type registry: which world components receive each scenario/runtime event, plus Persian labels for the demo UI. */
export type ComponentKey = 'macro' | 'regulation' | 'exchanges' | 'gateways' | 'bank' | 'chain' | 'providers' | 'messengers' | 'sms' | 'identity' | 'competitors'

export interface EventTypeInfo {
  titleFa: string
  titleEn: string
  targets: ComponentKey[]
  /** documented params (name -> description) for the scenario author / demo UI */
  params: Record<string, string>
}

export const EVENT_REGISTRY: Record<string, EventTypeInfo> = {
  cbi_deposit_cap: { titleFa: 'کاهش سقف واریز شناسه‌دار به صرافی‌ها', titleEn: 'CBI per-ID exchange deposit cap', targets: ['regulation'], params: { valueIrt: 'cap per ID per 24h (null = no cap)' } },
  night_halt: { titleFa: 'توقف معاملات شبانه تتر', titleEn: 'Night trading halt (+ optional daily buy cap)', targets: ['regulation'], params: { from: '"21:00"', to: '"09:00"', dailyBuyCapUsdt: 'per-user daily USDT buy cap' } },
  daily_buy_cap: { titleFa: 'سقف خرید روزانه تتر', titleEn: 'Per-user daily USDT buy cap', targets: ['regulation'], params: { dailyBuyCapUsdt: 'USDT per user per day (null = none)' } },
  withdrawal_lock_change: { titleFa: 'تغییر مدت قفل برداشت', titleEn: 'Withdrawal lock hours change', targets: ['regulation'], params: { hours: 'lock hours' } },
  deposit_identities_change: { titleFa: 'تغییر تعداد شناسه‌های مجاز واریز', titleEn: 'Number of legally-owned deposit identities', targets: ['regulation'], params: { count: 'identities' } },
  gateway_blackout: { titleFa: 'قطعی درگاه‌های پرداخت', titleEn: 'Payment gateway blackout', targets: ['gateways'], params: { gateway: 'id or all', durationDays: 'days' } },
  gateway_outage: { titleFa: 'اختلال کوتاه درگاه', titleEn: 'Short gateway outage', targets: ['gateways'], params: { hours: 'hours' } },
  gateway_fee_change: { titleFa: 'تغییر کارمزد درگاه', titleEn: 'Gateway fee change', targets: ['gateways'], params: { feePct: '', feeCapIrt: '', feeFixedIrt: '' } },
  gateway_failure_rate: { titleFa: 'افزایش خطای درگاه', titleEn: 'Gateway failure rates', targets: ['gateways'], params: { createFailProb: '', verifyTimeoutProb: '' } },
  internet_shutdown: { titleFa: 'قطع اینترنت بین‌الملل', titleEn: 'International internet shutdown', targets: ['macro', 'messengers', 'providers'], params: { durationDays: 'days', trafficMultiplier: 'remaining traffic share (0.4 = -60%)' } },
  provider_freeze: { titleFa: 'مسدودی بخشی از موجودی نزد ارائه‌دهنده', titleEn: 'Provider freezes part of our balance', targets: ['providers'], params: { provider: 'id', fractionFrozen: '0..1', durationDays: 'days or null' } },
  provider_exit: { titleFa: 'خروج/ورشکستگی ارائه‌دهنده', titleEn: 'Provider exit (counterparty failure)', targets: ['providers'], params: { provider: 'id', recoveredFraction: '0..1', recoveryDays: 'days' } },
  provider_outage: { titleFa: 'اختلال ارائه‌دهنده', titleEn: 'Provider outage', targets: ['providers'], params: { provider: 'id', hours: 'hours' } },
  provider_fee_change: { titleFa: 'تغییر کارمزد ارائه‌دهنده', titleEn: 'Provider fee change', targets: ['providers'], params: { provider: 'id', topupBps: '', issueUsdCents: '', fxNonUsdBps: '' } },
  provider_quality: { titleFa: 'افت کیفیت تأیید تراکنش ارائه‌دهنده', titleEn: 'Provider decline quality', targets: ['providers'], params: { provider: 'id', quality: '0.2..2' } },
  sanctions_freeze: { titleFa: 'اقدام تحریمی و مسدودی', titleEn: 'Sanctions action: named exchanges/providers frozen, taint surge', targets: ['exchanges', 'providers', 'chain'], params: { exchanges: 'ids', providers: 'ids', durationDays: 'days or null', lossFraction: '0..1', taintMultiplier: '' } },
  exchange_hack: { titleFa: 'هک صرافی', titleEn: 'Exchange hack', targets: ['exchanges'], params: { exchange: 'id', lossFraction: '0..1', recoveredFraction: '0..1', haltDays: 'days' } },
  exchange_outage: { titleFa: 'اختلال صرافی', titleEn: 'Exchange outage', targets: ['exchanges'], params: { exchange: 'id or all', hours: 'hours' } },
  exchange_freeze: { titleFa: 'مسدودی حساب نزد صرافی', titleEn: 'Exchange account freeze', targets: ['exchanges'], params: { exchange: 'id', scope: 'all|withdrawals|trading|deposits', durationDays: 'days or null' } },
  exchange_fee_change: { titleFa: 'تغییر کارمزد صرافی', titleEn: 'Exchange taker fee change', targets: ['exchanges'], params: { exchange: 'id or all', takerFeeBps: '' } },
  exchange_spread_change: { titleFa: 'تغییر اسپرد صرافی', titleEn: 'Exchange spread/premium change', targets: ['exchanges'], params: { exchange: 'id or all', halfSpreadBps: '', premiumBps: '' } },
  exchange_withdraw_fee_change: { titleFa: 'تغییر کارمزد برداشت صرافی', titleEn: 'Exchange withdrawal fee change', targets: ['exchanges'], params: { exchange: 'id', network: '', feeMicroUsdt: '' } },
  exchange_halt_blocks_withdrawals: { titleFa: 'برداشت در زمان توقف معاملات ممنوع', titleEn: 'Halt also blocks withdrawals', targets: ['exchanges'], params: { value: 'bool' } },
  price_war: { titleFa: 'جنگ قیمتی رقبا', titleEn: 'Competitor price war', targets: ['competitors'], params: { discountPct: '', durationDays: '' } },
  competitor_entry: { titleFa: 'ورود رقیب جدید', titleEn: 'New competitor enters', targets: ['competitors'], params: { count: '' } },
  competitor_exit: { titleFa: 'خروج رقیب', titleEn: 'Competitor exits', targets: ['competitors'], params: { competitor: 'id', count: '' } },
  competitor_entry_rate: { titleFa: 'افزایش نرخ ورود رقبا', titleEn: 'Entry hazard multiplier', targets: ['competitors'], params: { multiplier: '' } },
  devaluation_shock: { titleFa: 'شوک ارزی (جهش قیمت دلار)', titleEn: 'Devaluation shock', targets: ['macro'], params: { pct: '0.2 = +20%', durationDays: '', retracePct: '' } },
  rial_recovery: { titleFa: 'تقویت ریال', titleEn: 'Rial recovery', targets: ['macro'], params: { pct: '0.15 = -15%', days: '' } },
  volatility_spike: { titleFa: 'جهش نوسان بازار', titleEn: 'Volatility spike', targets: ['macro'], params: { multiplier: '', durationDays: '' } },
  demand_shock: { titleFa: 'شوک تقاضا', titleEn: 'Demand shock', targets: ['macro'], params: { multiplier: '', durationDays: '' } },
  macro_trend: { titleFa: 'روند افزایشی ملایم قیمت', titleEn: 'Extra depreciation trend', targets: ['macro'], params: { pctPerYear: '' } },
  macro_overlay: { titleFa: 'اورلی کلان', titleEn: 'Raw macro overlay', targets: ['macro'], params: { overlay: 'MacroOverlay object' } },
  telegram_filter: { titleFa: 'فیلتر تلگرام', titleEn: 'Telegram filtering', targets: ['messengers'], params: { lossProb: '' } },
  messenger_outage: { titleFa: 'اختلال پیام‌رسان', titleEn: 'Messenger outage', targets: ['messengers'], params: { channel: 'telegram|bale', hours: '' } },
  sms_outage: { titleFa: 'اختلال پیامک', titleEn: 'SMS outage', targets: ['sms'], params: { hours: '' } },
  sms_delay: { titleFa: 'تأخیر پیامک', titleEn: 'SMS delay multiplier', targets: ['sms'], params: { multiplier: '' } },
  sms_price_change: { titleFa: 'تغییر هزینه پیامک', titleEn: 'SMS price change', targets: ['sms'], params: { costIrt: '' } },
  identity_outage: { titleFa: 'اختلال سرویس احراز هویت', titleEn: 'Identity vendor outage', targets: ['identity'], params: {} },
  identity_price_change: { titleFa: 'تغییر هزینه استعلام', titleEn: 'Identity lookup price change', targets: ['identity'], params: { shahkarCostIrt: '', cardOwnerCostIrt: '' } },
  bank_outage: { titleFa: 'اختلال بانک', titleEn: 'Bank outage', targets: ['bank'], params: { hours: '' } },
  bank_late_posting: { titleFa: 'تأخیر ثبت تراکنش در صورتحساب', titleEn: 'Bank late-posting surge', targets: ['bank'], params: { lateProb: '' } },
  c2c_cap_change: { titleFa: 'تغییر سقف کارت‌به‌کارت', titleEn: 'Card-to-card daily cap change', targets: ['bank'], params: { perCardDailyCapIrt: '' } },
  chain_congestion: { titleFa: 'ازدحام شبکه بلاکچین', titleEn: 'Chain congestion', targets: ['chain'], params: { network: '', delayMult: '', feeMult: '' } },
  taint_surge: { titleFa: 'افزایش آدرس‌های پرریسک', titleEn: 'AML taint surge', targets: ['chain'], params: { taintMultiplier: '' } },
}

export const EVENT_TYPES: readonly string[] = Object.keys(EVENT_REGISTRY)
export function isKnownEventType(t: string): boolean {
  return t in EVENT_REGISTRY
}
