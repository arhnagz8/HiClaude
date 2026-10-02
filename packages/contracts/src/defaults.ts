/**
 * Default parameters and a small default catalog so the platform and simulator run before research calibration lands.
 * All numbers are PLACEHOLDERS sourced from the first-pass research (docs/business-plan-full-context.md, 2026-10-02) and are
 * superseded by data/config/*.json (calibrated) and DB settings. `// src:` marks the origin; `UNVERIFIED` means confirm first-hand.
 */
import type { PlatformParams } from './params'
import type { Product } from './domain'
import { usdtToMicro } from './units'

export function defaultPlatformParams(): PlatformParams {
  return {
    brand: {
      nameFa: 'کارتینو',
      nameEn: 'Kartino',
      domain: 'kartino.example',
      taglineFa: 'پرداخت ارزی، ساده و شفاف',
      supportTelegram: '@kartino_support',
      supportBale: '@kartino_support',
      supportPhone: '021-00000000',
      supportHoursFa: 'هر روز ۹ تا ۲۳',
    },
    pricing: {
      version: 1,
      marginPct: 0.1, // src: first-pass model 10–15 % (competitor markups to be calibrated by 07)
      floorMarginPct: 0.03,
      maxMarginPct: 0.25,
      minMarginIrt: 150_000,
      marginPctByFamily: {},
      minMarginIrtByFamily: {},
      riskBufferPct: 0.01,
      declineBufferUsdCents: 25,
      volatility: {
        z: 1.64,
        minBufferPct: 0.004,
        maxBufferPct: 0.08,
        lockMinutes: 30,
        replenishmentLagDays: 3, // src: 72h withdrawal lock (FATA) — UNVERIFIED per exchange
        haltPremiumPct: 0.01,
        driftFloorPctPerDay: 0,
      },
      roundingStepIrt: 1_000,
      usdt: { marginPct: 0.04, minMarginMicroUsdt: usdtToMicro(0.5), roundStepMicroUsdt: 10_000 },
      competitor: { enabled: true, tolerancePct: 0.03 },
      tierDiscountPct: { new: 0, verified: 0.005, trusted: 0.01 },
      vat: { applies: false, pct: 0.1 }, // src: VAT 10 % (to be confirmed by 04); applicability to resold foreign digital services UNVERIFIED
      networkFeeAllocMicroUsdt: usdtToMicro(0.3),
      stablecoin: { parHaircutBps: 0 },
      rushTiers: [
        { id: 'normal', labelFa: 'عادی', premiumPct: 0, minPremiumIrt: 0, slaMinutes: 120, capacityPerHour: null, enabled: true },
        { id: 'fast', labelFa: 'سریع', premiumPct: 0.04, minPremiumIrt: 100_000, slaMinutes: 30, capacityPerHour: 20, enabled: true },
        { id: 'express', labelFa: 'فوری', premiumPct: 0.1, minPremiumIrt: 300_000, slaMinutes: 10, capacityPerHour: 6, enabled: true },
      ],
    },
    paymentMethods: {
      gateway: {
        enabled: true,
        gatewayId: 'zarinpal',
        feePct: 0.005, // src: per-search summary of zarinpal.com fee page — UNVERIFIED (03 will calibrate)
        feeCapIrt: 16_000,
        feeFixedIrt: 500,
        settlementDelayHours: 24,
        minIrt: 100_000,
        maxIrt: 50_000_000,
        payWindowMinutes: 20,
      },
      card_to_card: {
        enabled: true,
        perCardDailyCapIrt: 15_000_000, // src: 1405 c2c cap 15M Toman/day/card (zoomit/zarinpal summaries)
        maxOrderIrt: 15_000_000,
        minIrt: 100_000,
        payWindowMinutes: 45,
        uniqueOffsetMaxIrt: 999,
        receiptRequired: true,
        cards: [
          { id: 'card-1', bankFa: 'بانک نمونه ۱', holderFa: 'شرکت نمونه (دمو)', cardNumber: '6037990000000001' },
          { id: 'card-2', bankFa: 'بانک نمونه ۲', holderFa: 'شرکت نمونه (دمو)', cardNumber: '6219860000000002' },
        ],
      },
      bank_transfer: {
        enabled: true,
        minIrt: 15_000_000,
        maxIrt: 1_000_000_000,
        payWindowMinutes: 240,
        ibanFa: 'IR000000000000000000000000',
        holderFa: 'شرکت نمونه (دمو)',
      },
      usdt: {
        enabled: true,
        networks: ['TRC20', 'BEP20', 'TON'],
        minMicroUsdt: usdtToMicro(10),
        payWindowMinutes: 60,
        confirmations: { TRC20: 20, BEP20: 15, TON: 1, ERC20: 12, POLYGON: 64, SOLANA: 32, ARBITRUM: 20 },
        perOrderAddress: true,
        underpayToleranceBps: 50,
      },
      wallet: { enabled: true },
    },
    latePayment: { graceMs: 6 * 3_600_000, acceptIfMovePctBelow: 0.01, refundFeeIrt: 20_000 },
    exchanges: [
      ex('tabdeal', 'تبدیل', 25, 20, 8, 0, true),
      ex('nobitex', 'نوبیتکس', 35, 25, 8, 0, true),
      ex('wallex', 'والکس', 35, 25, 10, 5, true),
      ex('bitpin', 'بیت‌پین', 32, 25, 10, 5, true),
      ex('abantether', 'آبان‌تتر', 30, 30, 15, 12, true),
    ],
    providers: [
      {
        id: 'mpay',
        name: 'mpay (کارت مجازی)',
        type: 'usdt_card',
        enabled: true,
        fees: {
          issueUsdCents: 499, // src: linotool/maharatweb/webmastersalam summaries — UNVERIFIED first-hand
          minLoadUsdCents: 2500, // src: same
          topupBps: 300, // UNVERIFIED — not published; peers charge 250–400 bps
          topupFixedUsdCents: 0,
          fxNonUsdBps: 300,
          declineFeeUsdCents: 0,
          monthlyUsdCents: 0,
        },
        limits: { maxBalanceUsdCents: 500_000, maxTopupUsdCents: 100_000, dailySpendUsdCents: 200_000 },
        networks: ['TRC20', 'BEP20'],
        depositConfirmations: 20,
        creditDelayMinutes: 15,
        capabilities: { issue: 'panel', topUp: 'panel', reveal: 'panel', freeze: 'none', webhooks: false },
        risk: { label: 'high', counterpartyFailurePerMonth: 0.02, maxFloatMicroUsdt: usdtToMicro(3000) },
        restrictionNoteFa: 'شرایط استفاده از این ارائه‌دهنده برای ایران توسط خود ارائه‌دهنده تضمین نشده است؛ ریسک مسدودی حساب یا موجودی وجود دارد.',
      },
      {
        id: 'altcard',
        name: 'ارائه‌دهنده‌ی جایگزین کارت',
        type: 'usdt_card',
        enabled: true,
        fees: {
          issueUsdCents: 3500, // src: PintoPay-like peer (per search summary)
          minLoadUsdCents: 1000,
          topupBps: 250,
          topupFixedUsdCents: 0,
          fxNonUsdBps: 300,
          declineFeeUsdCents: 25,
          monthlyUsdCents: 0,
        },
        limits: { maxBalanceUsdCents: 1_000_000, maxTopupUsdCents: 200_000, dailySpendUsdCents: 300_000 },
        networks: ['TRC20', 'BEP20'],
        depositConfirmations: 20,
        creditDelayMinutes: 10,
        capabilities: { issue: 'panel', topUp: 'panel', reveal: 'panel', freeze: 'panel', webhooks: false },
        risk: { label: 'medium', counterpartyFailurePerMonth: 0.01, maxFloatMicroUsdt: usdtToMicro(2000) },
      },
      {
        id: 'vouchers',
        name: 'تأمین‌کننده‌ی گیفت‌کارت (API)',
        type: 'voucher_api',
        enabled: true,
        fees: {
          issueUsdCents: 0,
          minLoadUsdCents: 500,
          topupBps: 150, // placeholder aggregator spread
          topupFixedUsdCents: 0,
          fxNonUsdBps: 0,
          declineFeeUsdCents: 0,
          monthlyUsdCents: 0,
        },
        limits: { maxBalanceUsdCents: 300_000, maxTopupUsdCents: 100_000, dailySpendUsdCents: 300_000 },
        networks: ['TRC20', 'BEP20'],
        depositConfirmations: 20,
        creditDelayMinutes: 10,
        capabilities: { issue: 'api', topUp: 'api', reveal: 'api', freeze: 'none', webhooks: true },
        risk: { label: 'low', counterpartyFailurePerMonth: 0.003, maxFloatMicroUsdt: usdtToMicro(1500) },
      },
    ],
    regulatory: {
      idDepositCapIrtPer24h: 25_000_000, // src: CBI notice, per national ID (arzdigital/mihanblockchain/zarinpal blog summaries)
      withdrawalLockHours: 72, // src: FATA directive (peivast/pingi/nobitex help summaries)
      nightHalt: { enabled: false, fromHour: 21, toHour: 9 }, // temporary measure 8–12 Mehr 1405; scenario-driven
      dailyBuyCapMicroUsdt: null, // temporary 2,000 USDT/day cap during halt; scenario-driven
      depositIdentitiesAvailable: 1,
    },
    tax: {
      vatPct: 0.1,
      vatApplies: false,
      corporateTaxPct: 0.25, // placeholder — 04 will confirm
      incomeTaxBrackets: [
        { upToIrtPerYear: 600_000_000, pct: 0.15 },
        { upToIrtPerYear: 1_200_000_000, pct: 0.2 },
        { upToIrtPerYear: null, pct: 0.25 },
      ],
      entityType: 'company',
      accrueMonthly: true,
    },
    risk: {
      tiers: {
        new: { maxOrderUsdCents: 10_000, maxDailyUsdCents: 20_000, maxOpenOrders: 2, methods: ['gateway', 'card_to_card', 'usdt', 'wallet'] },
        verified: { maxOrderUsdCents: 50_000, maxDailyUsdCents: 150_000, maxOpenOrders: 5, methods: ['gateway', 'card_to_card', 'bank_transfer', 'usdt', 'wallet'] },
        trusted: { maxOrderUsdCents: 300_000, maxDailyUsdCents: 1_000_000, maxOpenOrders: 10, methods: ['gateway', 'card_to_card', 'bank_transfer', 'usdt', 'wallet'] },
      },
      velocity: { maxOrdersPerHourPerCustomer: 4, maxFailedPaymentsPerDay: 5 },
      killSwitch: {
        staleAfterMs: 15 * 60_000,
        anomalyPct: 0.05,
        autoKillAfterMinutes: 10,
        providerFailureRateThreshold: 0.4,
        providerFailureWindow: 20,
      },
      highRiskScoreThreshold: 70,
    },
    treasury: {
      targetCoverageDays: 5.5, // = lock 3d + settlement 1d + safety 1.5d
      minCoverageDays: 3.5,
      maxCoverageDays: 9,
      forecastEmaDays: 7,
      planIntervalMinutes: 30,
      minBuyMicroUsdt: usdtToMicro(100),
      buyBatchMicroUsdt: usdtToMicro(500),
      sweepMinMicroUsdt: usdtToMicro(100),
      cashReserveIrt: 20_000_000,
      preferredNetwork: 'TRC20',
      exchangePreference: ['tabdeal', 'nobitex', 'wallex', 'bitpin', 'abantether'],
      maxProviderShare: 0.6,
    },
    fulfilment: { maxAttempts: 3, autoCompleteHours: 24, slaWarnFraction: 0.75, revealTtlMinutes: 30, maxReveals: 3, autoRefundOnFailure: true },
    operations: {
      minutesPerTask: { issue_card: 6, topup_card: 4, deliver_voucher: 2, pay_service: 9, custom: 10 },
      businessHours: { fromHour: 9, toHour: 23 },
    },
  }
}

function ex(id: string, name: string, takerFeeBps: number, makerFeeBps: number, halfSpreadBps: number, premiumBps: number, apiAvailable: boolean) {
  return {
    id,
    name,
    enabled: true,
    takerFeeBps,
    makerFeeBps,
    halfSpreadBps,
    premiumBps,
    // src: Nobitex help/digitraderz summaries: TRC20 ≈ 1 USDT, BEP20 ≈ 0.8 USDT, ERC20 ≈ 3 USDT — UNVERIFIED per exchange
    withdrawFeeMicroUsdt: { TRC20: usdtToMicro(1), BEP20: usdtToMicro(0.8), TON: usdtToMicro(0.5), ERC20: usdtToMicro(3), ARBITRUM: usdtToMicro(2) },
    withdrawMinMicroUsdt: { TRC20: usdtToMicro(10), BEP20: usdtToMicro(10), TON: usdtToMicro(5), ERC20: usdtToMicro(20), ARBITRUM: usdtToMicro(10) },
    apiAvailable,
    outageProbPerMonth: 0.05,
    depositCapIrtPer24hOverride: null,
  }
}

const SLA_OPERATOR = { normal: 120, fast: 30, express: 10 }
const SLA_API = { normal: 15, fast: 10, express: 5 }

function product(p: Partial<Product> & Pick<Product, 'id' | 'slug' | 'kind' | 'category' | 'family' | 'titleFa' | 'titleEn' | 'amount'>): Product {
  return {
    descriptionFa: '',
    inputs: [],
    providerId: 'mpay',
    altProviderIds: [],
    fulfilmentMode: 'operator',
    includesCardIssue: false,
    slaMinutes: SLA_OPERATOR,
    riskLabel: 'medium',
    active: true,
    tags: [],
    ...p,
  }
}

/** Minimal catalog (the research specialist 06 produces the full ≥80-SKU catalog in data/catalog.json). */
export function defaultProducts(): Product[] {
  return [
    product({
      id: 'vcard-new',
      slug: 'virtual-card',
      kind: 'virtual_card_issue',
      category: 'cards',
      family: 'virtual_card',
      titleFa: 'ویزاکارت مجازی (صدور + شارژ اولیه)',
      titleEn: 'Virtual Visa card (issue + initial load)',
      descriptionFa: 'کارت مجازی بین‌المللی برای خرید اینترنتی. مشخصات کارت پس از تأیید به‌صورت امن به شما نمایش داده می‌شود.',
      amount: { kind: 'options', optionsUsdCents: [2500, 5000, 10000, 20000] },
      altProviderIds: ['altcard'],
      includesCardIssue: true,
      riskLabel: 'medium',
      restrictionNoteFa: 'صدور و پذیرش کارت توسط ارائه‌دهنده‌ی خارجی انجام می‌شود؛ رد تراکنش یا مسدودی در برخی فروشگاه‌ها ممکن است رخ دهد.',
      tags: ['best-seller'],
    }),
    product({
      id: 'vcard-topup',
      slug: 'card-topup',
      kind: 'card_topup',
      category: 'cards',
      family: 'virtual_card',
      titleFa: 'شارژ کارت مجازی',
      titleEn: 'Virtual card top-up',
      amount: { kind: 'range', minUsdCents: 1000, maxUsdCents: 100000, stepUsdCents: 500 },
      inputs: [{ key: 'cardRef', labelFa: 'شناسه‌ی کارت', type: 'card_ref', required: true }],
      altProviderIds: ['altcard'],
      riskLabel: 'medium',
    }),
    product({
      id: 'gift-steam',
      slug: 'steam-gift-card',
      kind: 'voucher',
      category: 'gaming',
      family: 'gift_card',
      titleFa: 'گیفت‌کارت استیم',
      titleEn: 'Steam gift card',
      amount: { kind: 'options', optionsUsdCents: [500, 1000, 2000, 5000, 10000] },
      providerId: 'vouchers',
      fulfilmentMode: 'api',
      slaMinutes: SLA_API,
      riskLabel: 'low',
    }),
    product({
      id: 'gift-psn',
      slug: 'psn-gift-card',
      kind: 'voucher',
      category: 'gaming',
      family: 'gift_card',
      titleFa: 'گیفت‌کارت پلی‌استیشن',
      titleEn: 'PlayStation gift card',
      amount: { kind: 'options', optionsUsdCents: [1000, 2000, 5000, 10000] },
      providerId: 'vouchers',
      fulfilmentMode: 'api',
      slaMinutes: SLA_API,
      riskLabel: 'low',
      restrictionNoteFa: 'گیفت‌کارت‌ها منطقه‌محدودند؛ پیش از خرید، منطقه‌ی حساب خود را بررسی کنید.',
    }),
    product({
      id: 'gift-appstore',
      slug: 'app-store-gift-card',
      kind: 'voucher',
      category: 'apps',
      family: 'gift_card',
      titleFa: 'گیفت‌کارت اپ‌استور',
      titleEn: 'App Store gift card',
      amount: { kind: 'options', optionsUsdCents: [1000, 2500, 5000, 10000] },
      providerId: 'vouchers',
      fulfilmentMode: 'api',
      slaMinutes: SLA_API,
      riskLabel: 'medium',
      restrictionNoteFa: 'گیفت‌کارت اپ‌استور فقط روی حساب هم‌منطقه قابل استفاده است.',
    }),
    product({
      id: 'cloud-credit',
      slug: 'cloud-credit',
      kind: 'service_payment',
      category: 'cloud',
      family: 'cloud',
      titleFa: 'پرداخت هزینه‌ی سرور و دامنه',
      titleEn: 'Cloud / domain payment',
      amount: { kind: 'range', minUsdCents: 500, maxUsdCents: 50000, stepUsdCents: 100 },
      inputs: [
        { key: 'vendor', labelFa: 'سرویس‌دهنده', type: 'text', required: true },
        { key: 'accountRef', labelFa: 'ایمیل/شناسه‌ی حساب', type: 'text', required: true },
      ],
      riskLabel: 'medium',
      restrictionNoteFa: 'برخی سرویس‌دهنده‌ها مشتریان ایرانی را محدود می‌کنند؛ مسئولیت شرایط استفاده با خریدار است.',
    }),
    product({
      id: 'exam-fee',
      slug: 'exam-fee',
      kind: 'service_payment',
      category: 'education',
      family: 'education',
      titleFa: 'پرداخت هزینه‌ی آزمون و پذیرش',
      titleEn: 'Exam / application fee payment',
      amount: { kind: 'range', minUsdCents: 2000, maxUsdCents: 100000, stepUsdCents: 100 },
      inputs: [
        { key: 'target', labelFa: 'نام آزمون/دانشگاه', type: 'text', required: true },
        { key: 'accountRef', labelFa: 'شناسه‌ی داوطلب', type: 'text', required: true },
      ],
      riskLabel: 'low',
    }),
    product({
      id: 'ai-service-payment',
      slug: 'ai-service-payment',
      kind: 'service_payment',
      category: 'ai',
      family: 'ai_subscription',
      titleFa: 'پرداخت اشتراک ابزارهای هوش مصنوعی',
      titleEn: 'AI service subscription payment',
      amount: { kind: 'options', optionsUsdCents: [800, 2000, 10000, 20000] },
      inputs: [
        { key: 'service', labelFa: 'سرویس', type: 'select', required: true, options: [{ value: 'chatgpt', labelFa: 'ChatGPT' }, { value: 'claude', labelFa: 'Claude' }, { value: 'gemini', labelFa: 'Gemini' }, { value: 'midjourney', labelFa: 'Midjourney' }, { value: 'other', labelFa: 'سایر' }] },
        { key: 'accountEmail', labelFa: 'ایمیل حساب شما', type: 'email', required: true },
      ],
      riskLabel: 'high',
      restrictionNoteFa:
        'بسیاری از سرویس‌های هوش مصنوعی ایران را به‌صورت رسمی پشتیبانی نمی‌کنند؛ حساب شما ممکن است محدود یا مسدود شود و پس از فعال‌سازی، بازگشت وجه ممکن نیست. با آگاهی از این ریسک خرید کنید.',
      tags: ['high-demand'],
    }),
    product({
      id: 'streaming-sub',
      slug: 'streaming-subscription',
      kind: 'service_payment',
      category: 'media',
      family: 'streaming',
      titleFa: 'پرداخت اشتراک پلتفرم‌های سرگرمی',
      titleEn: 'Streaming subscription payment',
      amount: { kind: 'options', optionsUsdCents: [1000, 1500, 2000] },
      inputs: [{ key: 'accountEmail', labelFa: 'ایمیل حساب شما', type: 'email', required: true }],
      riskLabel: 'high',
      restrictionNoteFa: 'برخی سرویس‌ها در ایران رسماً ارائه نمی‌شوند و ممکن است حساب را محدود کنند.',
    }),
  ]
}
