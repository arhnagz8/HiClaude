import { defaultProducts, type Product, type ProductDto } from '@hiclaude/contracts'

const SLA_API = { normal: 15, fast: 10, express: 5 }
const SLA_OP = { normal: 120, fast: 30, express: 10 }

/** Extra demo SKUs on top of contracts' default catalog so the catalog page has categories, filters and every risk label. */
function extra(): Product[] {
  const base = {
    descriptionFa: '',
    inputs: [],
    providerId: 'vouchers',
    altProviderIds: [],
    fulfilmentMode: 'api' as const,
    includesCardIssue: false,
    slaMinutes: SLA_API,
    riskLabel: 'low' as const,
    active: true,
    tags: [] as string[],
    titleEn: '',
  }
  return [
    { ...base, id: 'gift-googleplay', slug: 'google-play-gift-card', kind: 'voucher', category: 'apps', family: 'gift_card', titleFa: 'گیفت‌کارت گوگل‌پلی', titleEn: 'Google Play gift card', descriptionFa: 'کد گیفت‌کارت گوگل‌پلی برای خرید برنامه، بازی و اشتراک.', amount: { kind: 'options', optionsUsdCents: [1000, 2500, 5000] }, riskLabel: 'medium', restrictionNoteFa: 'گیفت‌کارت فقط روی حساب هم‌منطقه فعال می‌شود.' },
    { ...base, id: 'gift-amazon', slug: 'amazon-gift-card', kind: 'voucher', category: 'shopping', family: 'gift_card', titleFa: 'گیفت‌کارت آمازون', titleEn: 'Amazon gift card', descriptionFa: 'کد گیفت‌کارت آمازون برای خرید از فروشگاه‌های آمازون.', amount: { kind: 'options', optionsUsdCents: [1000, 2500, 5000, 10000] }, riskLabel: 'medium', restrictionNoteFa: 'ارسال به ایران توسط آمازون پشتیبانی نمی‌شود؛ کد فقط برای نشانی‌های قابل‌ارسال کاربرد دارد.' },
    { ...base, id: 'gift-xbox', slug: 'xbox-gift-card', kind: 'voucher', category: 'gaming', family: 'gift_card', titleFa: 'گیفت‌کارت ایکس‌باکس', titleEn: 'Xbox gift card', descriptionFa: 'کد گیفت‌کارت ایکس‌باکس برای خرید بازی و Game Pass.', amount: { kind: 'options', optionsUsdCents: [1000, 2500, 5000] }, riskLabel: 'low' },
    { ...base, id: 'gift-spotify', slug: 'spotify-gift-card', kind: 'voucher', category: 'media', family: 'gift_card', titleFa: 'گیفت‌کارت اسپاتیفای', titleEn: 'Spotify gift card', descriptionFa: 'شارژ اشتراک موسیقی اسپاتیفای.', amount: { kind: 'options', optionsUsdCents: [1000, 3000, 6000] }, riskLabel: 'medium', restrictionNoteFa: 'اسپاتیفای در ایران رسماً ارائه نمی‌شود؛ ممکن است حساب محدود شود.' },
    { ...base, id: 'cloud-hosting', slug: 'hosting-payment', kind: 'service_payment', category: 'cloud', family: 'cloud', titleFa: 'پرداخت هزینه‌ی هاستینگ', titleEn: 'Hosting payment', descriptionFa: 'پرداخت صورت‌حساب هاستینگ و سرور ابری از طرف شما.', amount: { kind: 'range', minUsdCents: 500, maxUsdCents: 50000, stepUsdCents: 100 }, inputs: [{ key: 'invoiceRef', labelFa: 'شماره‌ی صورت‌حساب', type: 'text', required: true, helpFa: 'شماره‌ی فاکتور سرویس‌دهنده' }], providerId: 'mpay', fulfilmentMode: 'operator', slaMinutes: SLA_OP, riskLabel: 'medium', restrictionNoteFa: 'برخی سرویس‌دهنده‌ها حساب‌های ایرانی را محدود می‌کنند.' },
    { ...base, id: 'edu-course', slug: 'course-payment', kind: 'service_payment', category: 'education', family: 'education', titleFa: 'پرداخت هزینه‌ی دوره‌ی آنلاین', titleEn: 'Online course payment', descriptionFa: 'پرداخت شهریه‌ی دوره‌های آنلاین بین‌المللی.', amount: { kind: 'range', minUsdCents: 1000, maxUsdCents: 80000, stepUsdCents: 100 }, inputs: [{ key: 'courseUrl', labelFa: 'نشانی دوره', type: 'text', required: true }, { key: 'accountEmail', labelFa: 'ایمیل حساب شما', type: 'email', required: true }], providerId: 'mpay', fulfilmentMode: 'operator', slaMinutes: SLA_OP, riskLabel: 'low' },
  ] as Product[]
}

const DESC: Record<string, string> = {
  'vcard-topup': 'شارژ کارت مجازی‌ای که قبلاً از ما گرفته‌اید. شناسه‌ی کارت را وارد کنید و مبلغ را انتخاب کنید.',
  'gift-steam': 'کد گیفت‌کارت استیم برای خرید بازی و محتوا، پس از پرداخت و به‌صورت امن نمایش داده می‌شود.',
  'gift-psn': 'کد گیفت‌کارت پلی‌استیشن برای شارژ کیف پول فروشگاه.',
  'gift-appstore': 'کد گیفت‌کارت اپ‌استور برای خرید برنامه و اشتراک.',
  'cloud-credit': 'پرداخت صورت‌حساب سرور، دامنه و سرویس‌های ابری از طرف شما.',
  'exam-fee': 'پرداخت هزینه‌ی ثبت‌نام آزمون‌های بین‌المللی و درخواست پذیرش دانشگاه.',
  'ai-service-payment': 'پرداخت اشتراک ابزارهای هوش مصنوعی از طرف شما.',
  'streaming-sub': 'پرداخت اشتراک سرویس‌های پخش آنلاین.',
}

export function allProducts(): Product[] {
  return [...defaultProducts(), ...extra()].map((p) => ({ ...p, descriptionFa: p.descriptionFa || DESC[p.id] || p.titleFa }))
}

export function toProductDto(p: Product, fromPriceIrt?: number): ProductDto {
  return {
    id: p.id,
    slug: p.slug,
    kind: p.kind,
    category: p.category,
    family: p.family,
    titleFa: p.titleFa,
    descriptionFa: p.descriptionFa,
    amount: p.amount,
    inputs: p.inputs,
    fulfilmentMode: p.fulfilmentMode,
    slaMinutes: p.slaMinutes,
    riskLabel: p.riskLabel,
    restrictionNoteFa: p.restrictionNoteFa,
    fromPriceIrt,
    tags: p.tags,
    active: p.active,
  }
}
