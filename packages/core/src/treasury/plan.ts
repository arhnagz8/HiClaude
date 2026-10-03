/**
 * planReplenishment — turns the treasury state into an ORDERED list of actions (deposit → buy → withdraw → sweep) that respect every
 * real-world constraint, and tells the admin WHY when something cannot run now (`blockedReason`, Persian).
 *
 * Algorithm (deterministic, pure)
 *  1. coverage: buy only when `effectiveFloat < targetFloat` (surplus ⇒ no buy). Need = target − effective, capped by `maxCoverageDays`,
 *     rounded UP to `buyBatchMicroUsdt`; a need below `minBuyMicroUsdt` is dropped unless coverage < `minCoverageDays` (then `minBuy` is bought).
 *  2. candidates = enabled exchanges with a usable ticker and limits; open ones first, ranked by ALL-IN cost per credited USDT
 *     (ask·(1+taker) + withdrawal fee), ties within 0.02 % by `exchangePreference`. A closed exchange (night halt) gets a SCHEDULED buy at its next open.
 *  3. per exchange: qty ≤ remaining per-user daily buy cap (limit, else regulatory); IRT needed = qty·ask·(1+taker); missing IRT is deposited from the bank
 *     up to the 24 h deposit cap (limit remaining, else per-ID cap × `depositIdentitiesAvailable`) and bank cash above `cashReserveIrt`;
 *     the order must reach the exchange minimum order. Unfilled need becomes a blocked buy item explaining the binding constraint.
 *  4. provider float: target_p = share_p · daily · `minCoverageDays`, limited by provider `maxFloatMicroUsdt` and `maxProviderShare` of total float.
 *     Sweeps come from the hot wallet (≥ `sweepMinMicroUsdt`); the unmet part is withdrawn from exchanges (unlocked USDT now — cheapest withdrawal fee first,
 *     min amount and fee respected) and then SCHEDULED at `withdrawableAt` for locked lots (existing lots and the lots this very plan buys). Locked lots are never
 *     planned for immediate withdrawal.
 *  Withdrawal `amountMicroUsdt` is the GROSS amount requested (fee deducted by the exchange); `estimatedFeeMicro` is the fee.
 */
import { MS, formatIrt, formatJalaliDateTime, formatNumberFa, type ExchangeLimits, type ExchangeParams, type EpochMs, type Irt, type MicroUsdt, type Network, type ProviderParams, type RateSnapshot, type RegulatoryParams, type TreasuryParams, type UsdtLot } from '@hiclaude/contracts'
import { D, ceilToStep, toInt } from '../money'
import { computeExchangeBuy } from '../ledger/templates'
import { isTradingOpen, nextTradingOpen } from '../calendar'
import { coverage, conversionCost, type CoverageResult, type TreasuryState } from './coverage'
import { UsdtLotBook } from './lots'

export type TreasuryPlanItemType = 'deposit_irt' | 'buy_usdt' | 'withdraw_usdt' | 'sweep_provider'

export interface TreasuryPlanItem {
  type: TreasuryPlanItemType
  exchangeId?: string
  providerId?: string
  /** deposit: Toman to deposit; buy: Toman budget (fee included). */
  amountIrt?: Irt
  /** buy: expected USDT; withdraw: gross USDT requested; sweep: USDT to send. */
  amountMicroUsdt?: MicroUsdt
  network?: Network
  /** Earliest execution time (epoch ms). Items scheduled in the future are not executable before this. */
  executeAt: EpochMs
  /** Persian: present when the item cannot (fully) run now — closed market, caps, lock, cash, provider limits. */
  blockedReason?: string
  rationaleFa: string
  estimatedFeeIrt?: Irt
  estimatedFeeMicro?: MicroUsdt
  /** buy: all-in Toman per credited USDT used for ranking. */
  allInRate?: number
}

export interface PlanParams {
  treasury: TreasuryParams
  exchanges: readonly ExchangeParams[]
  providers: readonly ProviderParams[]
}

export interface PlanInput {
  now: EpochMs
  state: TreasuryState
  limitsByExchange: Record<string, ExchangeLimits>
  rate: RateSnapshot
  params: PlanParams
  regulatory: RegulatoryParams
  /** Withdrawal network (default `treasury.preferredNetwork`). */
  network?: Network
}

const TYPE_ORDER: Record<TreasuryPlanItemType, number> = { deposit_irt: 0, buy_usdt: 1, withdraw_usdt: 2, sweep_provider: 3 }

interface Cand {
  ex: ExchangeParams
  ask: number
  taker: number
  open: boolean
  openAt: EpochMs
  buyCap: number
  depCap: number
  minOrderIrt: number
  wFee: number
  wMin: number
  allIn: number
  pref: number
}

const usdtFa = (micro: number): string => `${formatNumberFa(micro / 1_000_000, 2)} تتر`

/** Ordered replenishment plan. See module docs. */
export function planReplenishment(input: PlanInput): TreasuryPlanItem[] {
  const { now, state, limitsByExchange, rate, params, regulatory } = input
  const t = params.treasury
  const network = input.network ?? t.preferredNetwork
  const cov: CoverageResult = coverage(state, t)
  const lockMs = regulatory.withdrawalLockHours * MS.hour
  const items: TreasuryPlanItem[] = []
  const identities = regulatory.depositIdentitiesAvailable

  // ── 1. buy need ──────────────────────────────────────────────────────────────────────────────
  let need = 0
  if (cov.shortfall > 0) {
    const room = Math.max(0, cov.maxFloat - cov.effectiveFloat)
    need = Math.min(cov.shortfall, room)
    if (need > 0 && t.buyBatchMicroUsdt > 1) need = Math.min(ceilToStep(need, t.buyBatchMicroUsdt), room)
    if (need < t.minBuyMicroUsdt) need = cov.coverageDays < t.minCoverageDays ? t.minBuyMicroUsdt : 0
  }

  // ── 2. candidates ────────────────────────────────────────────────────────────────────────────
  const excludedHard = new Set(rate.excluded.filter((e) => /^(outlier|stale|invalid|disabled)/.test(e.reason)).map((e) => e.exchangeId))
  const cands: Cand[] = []
  for (const ex of params.exchanges) {
    if (!ex.enabled || excludedHard.has(ex.id)) continue
    const tk = rate.tickers.find((x) => x.exchangeId === ex.id)
    const lim = limitsByExchange[ex.id]
    if (!tk || !lim || !(tk.ask > 0)) continue
    const open = lim.tradingOpen && isTradingOpen(now, regulatory)
    const openAt = open ? now : Math.max(now, lim.nextTradingOpenAt ?? nextTradingOpen(now, regulatory))
    const capPer = ex.depositCapIrtPer24hOverride ?? regulatory.idDepositCapIrtPer24h
    const depFallback = capPer === null ? Number.POSITIVE_INFINITY : capPer * identities
    cands.push({
      ex,
      ask: tk.ask,
      taker: lim.takerFeeBps,
      open,
      openAt,
      buyCap: lim.buyCapRemainingMicroUsdt ?? regulatory.dailyBuyCapMicroUsdt ?? Number.POSITIVE_INFINITY,
      depCap: lim.depositCapRemainingIrt ?? depFallback,
      minOrderIrt: lim.minOrderIrt,
      wFee: lim.withdrawFeeMicroUsdt[network] ?? ex.withdrawFeeMicroUsdt[network] ?? 0,
      wMin: lim.withdrawMinMicroUsdt[network] ?? ex.withdrawMinMicroUsdt[network] ?? 0,
      allIn: 0,
      pref: Math.max(0, t.exchangePreference.indexOf(ex.id)) + (t.exchangePreference.includes(ex.id) ? 0 : 1000),
    })
  }
  const probeQty = Math.max(1, Math.min(need || t.minBuyMicroUsdt, ...cands.map((c) => c.buyCap).filter((x) => Number.isFinite(x) && x > 0)))
  for (const c of cands) {
    const budget = toInt(D(probeQty).mul(c.ask).mul(D(1).plus(D(c.taker).div(10_000))).div(1_000_000), 'up') + 2
    c.allIn = conversionCost({ irtBudget: budget, ask: c.ask, takerBps: c.taker, withdrawFeeMicro: c.wFee }).allInIrtPerUsdt
  }
  const best = cands.length ? Math.min(...cands.map((c) => c.allIn)) : 1
  const bucket = (c: Cand): number => Math.round(c.allIn / (best * 0.0002))
  const ranked = [...cands].sort((a, b) => Number(!a.open) - Number(!b.open) || bucket(a) - bucket(b) || a.pref - b.pref || (a.ex.id < b.ex.id ? -1 : 1))

  // ── 3. fill the buy need ─────────────────────────────────────────────────────────────────────
  const virtualLots: { at: EpochMs; exchangeId: string; qty: number }[] = []
  let bankLeft = Math.max(0, state.bankIrt - t.cashReserveIrt)
  let remaining = need
  const reasons: string[] = []
  let plannedQty = 0
  for (const c of ranked) {
    if (remaining <= 0) break
    const name = c.ex.name
    const qtyCap = Math.min(remaining, c.buyCap)
    if (qtyCap <= 0) {
      reasons.push(`سقف خرید روزانه‌ی ${name} تکمیل شده است.`)
      continue
    }
    const unit = D(c.ask).mul(D(1).plus(D(c.taker).div(10_000)))
    const bNeed = toInt(D(qtyCap).mul(unit).div(1_000_000), 'up') + 2
    const have = state.exchanges[c.ex.id]?.irt ?? 0
    const deficit = Math.max(0, bNeed - have)
    const dep = Math.max(0, Math.min(deficit, c.depCap, bankLeft))
    const spend = Math.min(bNeed, have + dep)
    if (spend < Math.max(1, c.minOrderIrt)) {
      if (deficit > 0 && c.depCap <= 0) reasons.push(`سقف واریز ۲۴ ساعته به ${name} تکمیل است؛ با شناسه‌ی واریز بیشتر می‌توان ادامه داد.`)
      else if (deficit > 0 && bankLeft <= 0) reasons.push(`نقدینگی بانک پس از کسر ذخیره‌ی ${formatIrt(t.cashReserveIrt)} برای واریز به ${name} کافی نیست.`)
      else reasons.push(`مبلغ قابل خرید در ${name} کمتر از حداقل سفارش (${formatIrt(c.minOrderIrt)}) است.`)
      continue
    }
    const buy = computeExchangeBuy({ spentIrt: spend, takerBps: c.taker, askRate: c.ask })
    const qty = Math.min(buy.qtyMicro, qtyCap)
    if (qty <= 0) continue
    if (dep > 0) {
      items.push({
        type: 'deposit_irt',
        exchangeId: c.ex.id,
        amountIrt: dep,
        executeAt: now,
        rationaleFa: `واریز ${formatIrt(dep)} به ${name} برای خرید تتر.`,
        ...(dep < deficit ? { blockedReason: deficit > c.depCap ? `واریز به‌دلیل سقف ۲۴ ساعته محدود شد (${formatIrt(dep)} از ${formatIrt(deficit)}).` : `واریز به‌دلیل نقدینگی بانک محدود شد (${formatIrt(dep)} از ${formatIrt(deficit)}).` } : {}),
      })
      bankLeft -= dep
      c.depCap -= dep
    }
    const fee = buy.feeIrt
    items.push({
      type: 'buy_usdt',
      exchangeId: c.ex.id,
      amountIrt: spend,
      amountMicroUsdt: qty,
      executeAt: c.openAt,
      allInRate: c.allIn,
      estimatedFeeIrt: fee,
      rationaleFa: `خرید ${usdtFa(qty)} از ${name} (قیمت ${formatNumberFa(c.ask)}، هزینه‌ی کل هر تتر ${formatNumberFa(Math.round(c.allIn))} تومان).`,
      ...(!c.open ? { blockedReason: `بازار ${name} بسته است؛ اجرا از ${formatJalaliDateTime(c.openAt)}.` } : {}),
    })
    virtualLots.push({ at: c.openAt + lockMs, exchangeId: c.ex.id, qty })
    remaining -= qty
    plannedQty += qty
    c.buyCap -= qty
    if (qty < qtyCap && spend < bNeed) {
      reasons.push(deficit > dep ? (dep >= c.depCap ? `سقف واریز ۲۴ ساعته به ${name} محدودکننده بود.` : `نقدینگی بانک برای ${name} محدودکننده بود.`) : `سقف خرید ${name} محدودکننده بود.`)
    }
  }
  if (remaining > 0 && need > 0) {
    const first = ranked[0]
    items.push({
      type: 'buy_usdt',
      ...(first ? { exchangeId: first.ex.id } : {}),
      amountMicroUsdt: remaining,
      executeAt: first ? first.openAt : now,
      blockedReason: reasons.length ? reasons.join(' ') : 'هیچ صرافی فعالی برای خرید در دسترس نیست.',
      rationaleFa: `کسری ${usdtFa(remaining)} با محدودیت‌های فعلی قابل خرید نیست.`,
    })
  }

  // ── 4. provider sweeps & withdrawals ─────────────────────────────────────────────────────────
  const provs = params.providers.filter((p) => p.enabled && state.providers[p.id])
  const totalAfter = cov.effectiveFloat + plannedQty
  let walletLeft = state.walletUsdt
  let totalUnmet = 0
  const needs = provs.map((p) => {
    const st = state.providers[p.id] as { balanceMicro: number; share?: number }
    const share = st.share ?? 1 / provs.length
    const target = toInt(D(state.dailyConsumptionMicro).mul(share).mul(t.minCoverageDays), 'up')
    const shareCap = Math.floor(t.maxProviderShare * Math.max(totalAfter, 1))
    const limit = Math.min(p.risk.maxFloatMicroUsdt, shareCap)
    const eff = Math.min(target, limit)
    return { p, balance: st.balanceMicro, target, limit, need: Math.max(0, eff - st.balanceMicro), capped: target > limit, capBy: p.risk.maxFloatMicroUsdt <= shareCap ? 'float' : 'share' }
  })
  for (const n of [...needs].sort((a, b) => b.need - a.need || (a.p.id < b.p.id ? -1 : 1))) {
    const bal = (state.providers[n.p.id] as { balanceMicro: number }).balanceMicro
    if (n.capped && bal >= n.limit && n.target > bal) {
      items.push({
        type: 'sweep_provider',
        providerId: n.p.id,
        amountMicroUsdt: n.target - bal,
        network: n.p.networks.includes(network) ? network : (n.p.networks[0] as Network),
        executeAt: now,
        blockedReason: n.capBy === 'float' ? `سقف موجودی مجاز نزد ${n.p.name} (${usdtFa(n.p.risk.maxFloatMicroUsdt)}) تکمیل است.` : `سهم ${n.p.name} از کل موجودی به سقف ${formatNumberFa(t.maxProviderShare * 100)}٪ رسیده است.`,
        rationaleFa: `افزایش موجودی ${n.p.name} به‌دلیل سقف ریسک ممکن نیست.`,
      })
      continue
    }
    if (n.need < t.sweepMinMicroUsdt) continue
    const amt = Math.min(n.need, walletLeft)
    if (amt >= t.sweepMinMicroUsdt) {
      items.push({
        type: 'sweep_provider',
        providerId: n.p.id,
        amountMicroUsdt: amt,
        network: n.p.networks.includes(network) ? network : (n.p.networks[0] as Network),
        executeAt: now,
        rationaleFa: `شارژ حساب ${n.p.name} با ${usdtFa(amt)} (هدف ${usdtFa(Math.min(n.target, n.limit))}).`,
        ...(n.capped ? { blockedReason: `مقدار به سقف ریسک ${n.p.name} محدود شد.` } : {}),
      })
      walletLeft -= amt
    }
    totalUnmet += n.need - Math.max(0, amt >= t.sweepMinMicroUsdt ? amt : 0)
  }
  let withdrawNeed = Math.max(0, totalUnmet - state.inTransitUsdt)

  if (withdrawNeed > 0) {
    // immediate withdrawals from unlocked USDT
    const lotBook = state.lots ? new UsdtLotBook(state.lots as UsdtLot[]) : undefined
    const byFee = [...cands].filter((c) => (state.exchanges[c.ex.id]?.usdt ?? 0) > 0).sort((a, b) => a.wFee - b.wFee || (state.exchanges[b.ex.id]?.usdtWithdrawable ?? 0) - (state.exchanges[a.ex.id]?.usdtWithdrawable ?? 0) || (a.ex.id < b.ex.id ? -1 : 1))
    for (const c of byFee) {
      if (withdrawNeed <= 0) break
      const st = state.exchanges[c.ex.id] as { usdt: number; usdtWithdrawable: number }
      const unlocked = lotBook ? Math.min(lotBook.available(now, c.ex.id), st.usdtWithdrawable) : st.usdtWithdrawable
      const lim = limitsByExchange[c.ex.id] as ExchangeLimits
      const capLeft = lim.withdrawCapRemainingMicroUsdt ?? Number.POSITIVE_INFINITY
      const usable = Math.min(unlocked, capLeft)
      if (usable <= 0) continue
      const request = Math.min(usable, withdrawNeed + c.wFee)
      if (request < Math.max(c.wMin, c.wFee + 1)) {
        items.push({
          type: 'withdraw_usdt',
          exchangeId: c.ex.id,
          amountMicroUsdt: request,
          network,
          executeAt: now,
          estimatedFeeMicro: c.wFee,
          blockedReason: `مقدار قابل برداشت از ${c.ex.name} کمتر از حداقل برداشت (${usdtFa(Math.max(c.wMin, c.wFee + 1))}) است.`,
          rationaleFa: `برداشت از ${c.ex.name} ممکن نیست.`,
        })
        continue
      }
      items.push({
        type: 'withdraw_usdt',
        exchangeId: c.ex.id,
        amountMicroUsdt: request,
        network,
        executeAt: now,
        estimatedFeeMicro: c.wFee,
        rationaleFa: `برداشت ${usdtFa(request)} از ${c.ex.name} روی شبکه‌ی ${network} (کارمزد ${usdtFa(c.wFee)}).`,
        ...(capLeft < unlocked ? { blockedReason: 'مقدار به سقف برداشت روزانه محدود شد.' } : {}),
      })
      withdrawNeed -= request - c.wFee
    }
    // scheduled withdrawals from locked lots (existing + this plan's own buys)
    if (withdrawNeed > 0) {
      const sched = new Map<string, { at: EpochMs; exchangeId: string; qty: number }>()
      const add = (at: EpochMs, exchangeId: string, qty: number): void => {
        const k = `${at}|${exchangeId}`
        const cur = sched.get(k) ?? { at, exchangeId, qty: 0 }
        cur.qty += qty
        sched.set(k, cur)
      }
      if (lotBook) for (const u of lotBook.unlockSchedule(now, Number.MAX_SAFE_INTEGER / 2).filter((x) => x.exchangeId !== 'wallet')) add(u.at, u.exchangeId, u.qtyMicro)
      else for (const c of cands) {
        const st = state.exchanges[c.ex.id]
        const lockedQty = st ? Math.max(0, st.usdt - st.usdtWithdrawable) : 0
        if (lockedQty > 0) add(now + lockMs, c.ex.id, lockedQty)
      }
      for (const v of virtualLots) add(v.at, v.exchangeId, v.qty)
      for (const g of [...sched.values()].sort((a, b) => a.at - b.at || (a.exchangeId < b.exchangeId ? -1 : 1))) {
        if (withdrawNeed <= 0) break
        const c = cands.find((x) => x.ex.id === g.exchangeId)
        if (!c) continue
        const request = Math.min(g.qty, withdrawNeed + c.wFee)
        if (request < Math.max(c.wMin, c.wFee + 1)) continue
        items.push({
          type: 'withdraw_usdt',
          exchangeId: c.ex.id,
          amountMicroUsdt: request,
          network,
          executeAt: g.at,
          estimatedFeeMicro: c.wFee,
          blockedReason: `این USDT تا ${formatJalaliDateTime(g.at)} قفل است (قفل ${formatNumberFa(regulatory.withdrawalLockHours)} ساعته‌ی برداشت)؛ برداشت در زمان آزادسازی زمان‌بندی شد.`,
          rationaleFa: `برداشت ${usdtFa(request)} از ${c.ex.name} پس از آزادسازی.`,
        })
        withdrawNeed -= request - c.wFee
      }
    }
  }

  return items
    .map((it, i) => ({ it, i }))
    .sort((a, b) => a.it.executeAt - b.it.executeAt || TYPE_ORDER[a.it.type] - TYPE_ORDER[b.it.type] || a.i - b.i)
    .map((x) => x.it)
}
