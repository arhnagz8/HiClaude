/** Results and errors. [CONTRACT] */

export type PortErrorCode =
  | 'UNAVAILABLE'
  | 'TIMEOUT'
  | 'RATE_LIMITED'
  | 'CAP_EXCEEDED'
  | 'INSUFFICIENT_FUNDS'
  | 'MARKET_CLOSED'
  | 'LOCKED'
  | 'REJECTED'
  | 'NOT_FOUND'
  | 'FROZEN'
  | 'VALIDATION'
  | 'DECLINED'
  | 'UNKNOWN'

export interface PortError {
  code: PortErrorCode
  message: string
  /** Safe to retry later? */
  retryable: boolean
  retryAfterMs?: number
  details?: Record<string, unknown>
}

export type Result<T, E = PortError> = { ok: true; value: T } | { ok: false; error: E }

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value })
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error })

export function portError(
  code: PortErrorCode,
  message: string,
  extra: Partial<Omit<PortError, 'code' | 'message'>> = {},
): PortError {
  const retryableDefault = code === 'UNAVAILABLE' || code === 'TIMEOUT' || code === 'RATE_LIMITED' || code === 'MARKET_CLOSED' || code === 'LOCKED'
  return { code, message, retryable: extra.retryable ?? retryableDefault, ...extra }
}

export type AppErrorCode =
  | 'VALIDATION'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATES_UNAVAILABLE'
  | 'KILL_SWITCH'
  | 'QUOTE_EXPIRED'
  | 'PRODUCT_UNAVAILABLE'
  | 'LIMIT_EXCEEDED'
  | 'ORDER_INVALID_TRANSITION'
  | 'PAYMENT_MISMATCH'
  | 'PAYMENT_METHOD_UNAVAILABLE'
  | 'RATE_LIMITED'
  | 'PROVIDER_ERROR'
  | 'INSUFFICIENT_FUNDS'
  | 'RUSH_UNAVAILABLE'
  | 'INTERNAL'

const STATUS_BY_CODE: Record<AppErrorCode, number> = {
  VALIDATION: 422,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATES_UNAVAILABLE: 503,
  KILL_SWITCH: 503,
  QUOTE_EXPIRED: 409,
  PRODUCT_UNAVAILABLE: 409,
  LIMIT_EXCEEDED: 422,
  ORDER_INVALID_TRANSITION: 409,
  PAYMENT_MISMATCH: 409,
  PAYMENT_METHOD_UNAVAILABLE: 409,
  RATE_LIMITED: 429,
  PROVIDER_ERROR: 502,
  INSUFFICIENT_FUNDS: 409,
  RUSH_UNAVAILABLE: 409,
  INTERNAL: 500,
}

export const ERROR_MESSAGES_FA: Record<AppErrorCode, string> = {
  VALIDATION: 'اطلاعات واردشده معتبر نیست.',
  UNAUTHENTICATED: 'لطفاً ابتدا وارد حساب کاربری خود شوید.',
  FORBIDDEN: 'شما به این بخش دسترسی ندارید.',
  NOT_FOUND: 'مورد درخواستی پیدا نشد.',
  CONFLICT: 'درخواست با وضعیت فعلی هم‌خوانی ندارد. صفحه را تازه‌سازی کنید.',
  RATES_UNAVAILABLE: 'نرخ لحظه‌ای در دسترس نیست؛ چند دقیقه دیگر دوباره تلاش کنید.',
  KILL_SWITCH: 'فروش این سرویس موقتاً متوقف شده است.',
  QUOTE_EXPIRED: 'مهلت قیمت تمام شده است؛ قیمت جدید را دریافت کنید.',
  PRODUCT_UNAVAILABLE: 'این محصول در حال حاضر در دسترس نیست.',
  LIMIT_EXCEEDED: 'سقف مجاز سفارش یا خرید شما رعایت نشده است.',
  ORDER_INVALID_TRANSITION: 'این عملیات در وضعیت فعلی سفارش مجاز نیست.',
  PAYMENT_MISMATCH: 'مبلغ یا مشخصات پرداخت با سفارش مطابقت ندارد.',
  PAYMENT_METHOD_UNAVAILABLE: 'این روش پرداخت در حال حاضر فعال نیست.',
  RATE_LIMITED: 'تعداد درخواست‌ها زیاد است؛ کمی بعد تلاش کنید.',
  PROVIDER_ERROR: 'ارائه‌دهنده‌ی سرویس موقتاً در دسترس نیست.',
  INSUFFICIENT_FUNDS: 'موجودی کافی نیست.',
  RUSH_UNAVAILABLE: 'ظرفیت سرویس فوری پر است؛ گزینه‌ی دیگری انتخاب کنید.',
  INTERNAL: 'خطای داخلی رخ داد؛ لطفاً دوباره تلاش کنید.',
}

export class AppError extends Error {
  readonly code: AppErrorCode
  readonly status: number
  readonly details?: Record<string, unknown>
  constructor(code: AppErrorCode, message?: string, details?: Record<string, unknown>, status?: number) {
    super(message ?? code)
    this.name = 'AppError'
    this.code = code
    this.status = status ?? STATUS_BY_CODE[code]
    this.details = details
  }
  get messageFa(): string {
    return ERROR_MESSAGES_FA[this.code]
  }
}
