/**
 * evaluateKillSwitch — decides whether the automatic rate kill switch should be ON (architecture §8).
 *
 * Rules (fail closed; first match wins):
 *  R1 feed_dead      : newest snapshot older than `staleAfterMs` for ≥ `autoKillAfterMinutes` (counted from the moment it went stale).
 *  R2 persistent_bad : status `stale` or `anomaly` continuously for ≥ `autoKillAfterMinutes` (counted from the first bad snapshot of the run).
 *  R3 dispersion     : fresh exchange mids spread (max/min − 1) wider than `dispersionKillMultiple × anomalyPct` → immediate.
 *
 * `halted` is NOT a kill reason by itself (night halts are normal; pricing widens the buffer instead).
 * The function is pure; the app owns the sticky/manual part of the switch and resets it.
 */
import type { RateSnapshot, RiskParams } from '@hiclaude/contracts'

/** R3 trips when the spread between the best and worst fresh exchange mid exceeds this multiple of `anomalyPct` (default 4 ⇒ 20 % with the 5 % default). */
export const DISPERSION_KILL_MULTIPLE = 4

export interface KillSwitchInput {
  snapshot: RateSnapshot
  /** Recent snapshots (any order; may or may not include `snapshot`). */
  history: RateSnapshot[]
  params: { risk: Pick<RiskParams, 'killSwitch'> }
  now: number
  dispersionKillMultiple?: number
}

export interface KillSwitchDecision {
  on: boolean
  /** Machine-readable rule id when `on`. */
  rule?: 'feed_dead' | 'persistent_bad' | 'dispersion'
  /** English reason (logs). */
  reason?: string
  /** Persian reason (admin alert). */
  reasonFa?: string
  /** When the bad condition started (epoch ms), if any. */
  badSince?: number
}

/** Evaluates the automatic kill-switch rules. Pure. */
export function evaluateKillSwitch(input: KillSwitchInput): KillSwitchDecision {
  const { snapshot, params, now } = input
  const { staleAfterMs, anomalyPct, autoKillAfterMinutes } = params.risk.killSwitch
  const graceMs = autoKillAfterMinutes * 60_000
  const multiple = input.dispersionKillMultiple ?? DISPERSION_KILL_MULTIPLE

  const byTs = new Map<string, RateSnapshot>()
  for (const s of [...input.history, snapshot]) byTs.set(`${s.ts}|${s.id}`, s)
  const all = [...byTs.values()].sort((a, b) => a.ts - b.ts || (a.id < b.id ? -1 : 1))
  const latest = all[all.length - 1] as RateSnapshot

  // R3 dispersion (on the latest snapshot's fresh tickers)
  const fresh = latest.tickers.filter((t) => Number.isFinite(t.bid) && Number.isFinite(t.ask) && t.bid > 0 && t.ask >= t.bid && now - t.asOf <= staleAfterMs)
  if (fresh.length >= 2) {
    const mids = fresh.map((t) => (t.bid + t.ask) / 2)
    const spread = Math.max(...mids) / Math.min(...mids) - 1
    if (spread > multiple * anomalyPct) {
      return {
        on: true,
        rule: 'dispersion',
        reason: `exchange mids disagree by ${(spread * 100).toFixed(1)}% (limit ${(multiple * anomalyPct * 100).toFixed(1)}%)`,
        reasonFa: `اختلاف قیمت صرافی‌ها (${(spread * 100).toFixed(1)}٪) بیش از حد مجاز است؛ فروش متوقف شد.`,
      }
    }
  }

  // bad run ending at the latest snapshot
  let badSince: number | undefined
  for (let i = all.length - 1; i >= 0; i--) {
    const s = all[i] as RateSnapshot
    if (s.status === 'stale' || s.status === 'anomaly') badSince = s.ts
    else break
  }
  const feedDeadSince = now - latest.ts > staleAfterMs ? latest.ts + staleAfterMs : undefined

  if (feedDeadSince !== undefined) {
    const since = badSince !== undefined ? Math.min(badSince, feedDeadSince) : feedDeadSince
    if (now - since >= graceMs) {
      return {
        on: true,
        rule: 'feed_dead',
        badSince: since,
        reason: `no fresh rate snapshot for ${Math.round((now - since) / 60_000)} minutes`,
        reasonFa: `بیش از ${Math.round((now - since) / 60_000)} دقیقه است نرخ تازه‌ای دریافت نشده؛ فروش متوقف شد.`,
      }
    }
    return { on: false, badSince: since }
  }
  if (badSince !== undefined) {
    if (now - badSince >= graceMs) {
      return {
        on: true,
        rule: 'persistent_bad',
        badSince,
        reason: `rates ${latest.status} for ${Math.round((now - badSince) / 60_000)} minutes`,
        reasonFa: `نرخ‌ها به مدت ${Math.round((now - badSince) / 60_000)} دقیقه نامعتبر بوده است؛ فروش متوقف شد.`,
      }
    }
    return { on: false, badSince }
  }
  return { on: false }
}
