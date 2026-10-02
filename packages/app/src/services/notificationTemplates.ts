/**
 * Default Persian notification templates, keyed `event` × `channel`.
 * `default` is used when a channel has no specific text. Placeholders: `{{var}}` with optional filter `{{var|irt}}`.
 * Filters: irt, usd (cents), usdt (micro), num, date, datetime (Jalali, IRST), dur (ms), default:<text>.
 * Global vars always available: brand, support.
 * Overridable at runtime from data/copy.fa.json (flat keys `notify.<event>` / `notify.<event>.<channel>`).
 */
import { formatDurationFa, formatIrt, formatJalaliDate, formatJalaliDateTime, formatNumberFa, formatUsd, formatUsdt } from '@hiclaude/contracts'

export type NotificationChannelName = 'telegram' | 'bale' | 'sms' | 'in_app'

export type KnownNotificationEvent =
  | 'otp'
  | 'welcome'
  | 'order.created'
  | 'order.paid'
  | 'order.delivered'
  | 'order.failed'
  | 'order.refunded'
  | 'order.expired'
  | 'order.cancelled'
  | 'payment.review'
  | 'payment.mismatch'
  | 'payment.underpaid'
  | 'quote.expiring'
  | 'ticket.reply'
  | 'kyc.pending'
  | 'kyc.verified'
  | 'kyc.rejected'
  | 'wallet.credited'
  | 'referral.rewarded'

export type NotificationEvent = KnownNotificationEvent | (string & {})

export interface TemplateSet {
  default: string
  telegram?: string
  bale?: string
  sms?: string
  in_app?: string
}

/** Events that must reach the customer even if messengers are unavailable (SMS fallback). */
export const CRITICAL_EVENTS: ReadonlySet<string> = new Set([
  'otp',
  'order.paid',
  'order.delivered',
  'order.failed',
  'order.refunded',
  'payment.mismatch',
  'payment.underpaid',
  'kyc.rejected',
])

export const DEFAULT_TEMPLATES: Record<KnownNotificationEvent, TemplateSet> = {
  otp: {
    default: '{{brand}}\nکد ورود شما: {{otp}}\nاین کد را در اختیار هیچ‌کس، حتی پشتیبانی، قرار ندهید.',
    sms: '{{brand}}: کد ورود شما {{otp}} است. آن را به هیچ‌کس ندهید.',
  },
  welcome: {
    default: 'به {{brand}} خوش آمدید! هر زمان سؤالی داشتید از بخش پشتیبانی کمک بگیرید.',
  },
  'order.created': {
    default: 'سفارش {{code}} برای «{{product}}» ثبت شد. مبلغ قابل پرداخت {{payAmount|irt}} است و تا {{expiresAt|datetime}} فرصت پرداخت دارید.',
  },
  'order.paid': {
    default: 'پرداخت سفارش {{code}} تأیید شد و سفارش شما در صف انجام قرار گرفت. وضعیت را می‌توانید از حساب کاربری پیگیری کنید.',
    sms: '{{brand}}: پرداخت سفارش {{code}} تأیید شد.',
  },
  'order.delivered': {
    default: 'سفارش {{code}} («{{product}}») تحویل شد. برای مشاهدهٔ اطلاعات وارد حساب کاربری خود شوید. اطلاعات کارت یا کد را با کسی به اشتراک نگذارید.',
    sms: '{{brand}}: سفارش {{code}} تحویل شد. برای مشاهده وارد حساب خود شوید.',
  },
  'order.failed': {
    default: 'متأسفانه انجام سفارش {{code}} ممکن نشد (دلیل: {{reason|default:در حال بررسی}}). مطابق قوانین بازگشت وجه، مبلغ پرداختی شما برگردانده می‌شود. برای پیگیری با پشتیبانی در تماس باشید.',
    sms: '{{brand}}: انجام سفارش {{code}} ممکن نشد. مبلغ طبق قوانین بازگشت وجه برگردانده می‌شود.',
  },
  'order.refunded': {
    default: 'مبلغ {{amount|irt}} از سفارش {{code}} بازگردانده شد.',
    sms: '{{brand}}: مبلغ {{amount|irt}} سفارش {{code}} بازگردانده شد.',
  },
  'order.expired': {
    default: 'مهلت پرداخت سفارش {{code}} به پایان رسید و سفارش لغو شد. در صورت نیاز می‌توانید دوباره سفارش ثبت کنید. اگر مبلغی پرداخت کرده‌اید با پشتیبانی تماس بگیرید.',
  },
  'order.cancelled': {
    default: 'سفارش {{code}} لغو شد.',
  },
  'payment.review': {
    default: 'پرداخت سفارش {{code}} دریافت شد و در حال بررسی است. نتیجه به‌زودی اعلام می‌شود.',
  },
  'payment.mismatch': {
    default: 'مبلغ یا مشخصات پرداخت سفارش {{code}} با اطلاعات سفارش مطابقت ندارد و بررسی دستی لازم است. لطفاً با پشتیبانی ({{support}}) در تماس باشید.',
    sms: '{{brand}}: پرداخت سفارش {{code}} نیازمند بررسی است؛ با پشتیبانی تماس بگیرید.',
  },
  'payment.underpaid': {
    default: 'مبلغ پرداختی سفارش {{code}} به اندازهٔ {{missing|irt}} کمتر از مبلغ سفارش است. تا پایان مهلت می‌توانید مابه‌التفاوت را پرداخت کنید؛ در غیر این‌صورت مبلغ، پس از کسر کارمزد، بازگردانده می‌شود.',
    sms: '{{brand}}: مبلغ پرداختی سفارش {{code}} {{missing|irt}} کمتر است؛ لطفاً مابه‌التفاوت را بپردازید.',
  },
  'quote.expiring': {
    default: 'قیمت «{{product}}» تا {{minutes|num}} دقیقهٔ دیگر منقضی می‌شود. برای حفظ قیمت، پرداخت را تکمیل کنید.',
  },
  'ticket.reply': {
    default: 'پاسخ جدیدی برای تیکت «{{subject}}» ثبت شد.',
  },
  'kyc.pending': {
    default: 'مدارک هویتی شما دریافت شد و در حال بررسی است.',
  },
  'kyc.verified': {
    default: 'احراز هویت شما تأیید شد و سقف خرید شما افزایش یافت.',
  },
  'kyc.rejected': {
    default: 'احراز هویت شما تأیید نشد: {{reason|default:اطلاعات هم‌خوانی ندارد}}. شمارهٔ موبایل باید به نام همان کد ملی ثبت شده باشد.',
    sms: '{{brand}}: احراز هویت شما تأیید نشد. جزئیات را در حساب خود ببینید.',
  },
  'wallet.credited': {
    default: 'مبلغ {{amount|irt}} به کیف پول شما اضافه شد. موجودی فعلی: {{balance|irt}}.',
  },
  'referral.rewarded': {
    default: 'پاداش معرفی {{amount|irt}} به کیف پول شما اضافه شد. از اعتماد شما سپاسگزاریم.',
  },
}

type Vars = Record<string, unknown>

const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v))

function applyFilter(value: unknown, filter: string): string {
  const [name, ...rest] = filter.split(':')
  const arg = rest.join(':')
  switch (name) {
    case 'irt':
      return formatIrt(num(value))
    case 'usd':
      return formatUsd(num(value))
    case 'usdt':
      return formatUsdt(num(value))
    case 'num':
      return formatNumberFa(num(value))
    case 'date':
      return formatJalaliDate(num(value))
    case 'datetime':
      return formatJalaliDateTime(num(value))
    case 'dur':
      return formatDurationFa(num(value))
    case 'default':
      return value === undefined || value === null || value === '' ? arg : String(value)
    default:
      return String(value)
  }
}

/** `{{var}}` / `{{var|filter}}` interpolation. Missing variables render as an empty string (never "undefined"). */
export function interpolate(template: string, vars: Vars): string {
  return template.replace(/\{\{\s*([\w.]+)\s*(?:\|\s*([^}]+?)\s*)?\}\}/g, (_m, key: string, filter?: string) => {
    const v = vars[key]
    if (filter) return applyFilter(v, filter)
    return v === undefined || v === null ? '' : String(v)
  })
}
