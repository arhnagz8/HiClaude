import type { EpochMs } from '@hiclaude/contracts'

export type Regime = 'calm' | 'stress' | 'crisis' | 'recovery'
export const REGIMES: readonly Regime[] = ['calm', 'stress', 'crisis', 'recovery']
/** Severity order used when several overlays force a regime on the same day. */
export const REGIME_SEVERITY: Record<Regime, number> = { calm: 0, recovery: 1, stress: 2, crisis: 3 }

export interface RegimeParams {
  /** Diffusion volatility of the daily log return (jumps are separate). */
  dailyVol: number
  /** Expected TOTAL daily log return in this regime (diffusion drift is compensated for the jump mean, so jumps do not add drift). */
  driftPerDay: number
  jumpRatePerYear: number
  /** Mean / sd of the log size of one jump. */
  jumpMean: number
  jumpSd: number
}

export interface MacroCalibration {
  /** USDT price in Toman at the scenario start (IRST midnight of day 0). */
  spot: number
  regimes: Record<Regime, RegimeParams>
  /** Daily Markov transition matrix: transition[from][to]; every row sums to 1. */
  transition: Record<Regime, Record<Regime, number>>
  initialRegime: Regime
  /** Volatility multiplier by JS weekday (0 = Sunday ... 5 = Friday ... 6 = Saturday); normalised to mean 1. */
  weekdayVol: number[]
  /** Share of the daily variance realised in each IRST hour (24 values; normalised to sum 1). Night hours are thin (exchanges halted). */
  intradayVarianceWeights: number[]
  premium: {
    /** Mean cash-dollar premium over USDT (fraction), AR(1) around a regime-dependent mean. */
    cashDollarMean: number
    cashDollarDailySd: number
    meanReversionPerDay: number
    regimeAddon: Record<Regime, number>
    min: number
    max: number
  }
  inflation: {
    /** Toman CPI annual rate in the reference FX drift environment. */
    annualRate: number
    /** Pass-through of excess FX depreciation (EMA) into inflation. */
    fxPassThrough: number
    fxEmaHalfLifeDays: number
    /** FX drift considered "already in" annualRate (log per day). */
    fxReferenceDriftPerDay: number
    dailyNoiseSd: number
  }
  demand: {
    regimeMultiplier: Record<Regime, number>
    /** Multiplier by JS weekday. */
    weekday: number[]
    smoothingDays: number
    /** Demand falls by exp(-e * realDepreciation) where realDepreciation = ln(P/P0) - ln(CPI). */
    realPriceElasticity: number
  }
}

export interface MacroCalibrationMeta {
  source: 'default' | string
  warnings: string[]
}

// ───────────────────────────── overlays ─────────────────────────────
interface OverlayBase {
  /** Start, in days from scenario start (IRST midnight). Ignored when atMs is given. */
  atDay?: number
  atMs?: EpochMs
}
export type MacroOverlay =
  /** Devaluation: price jumps by `pct` (0.2 = +20 %) linearly over `durationDays`; `retracePct` of the move is given back over 14 days. */
  | (OverlayBase & { type: 'shock'; pct: number; durationDays: number; retracePct?: number })
  /** Extra constant depreciation trend (compound pct per year) from the start until `untilDay` (default: forever). */
  | (OverlayBase & { type: 'trend'; pctPerYear: number; untilDay?: number; untilMs?: EpochMs })
  /** Rial strengthens: price falls by `pct` (0.15 = -15 %) over `days`. */
  | (OverlayBase & { type: 'recovery'; pct: number; days: number })
  /** Volatility x `multiplier` for `durationDays`; forces at least the stress regime. */
  | (OverlayBase & { type: 'volatility_spike'; multiplier?: number; durationDays: number })
  /** Demand x `multiplier` for `durationDays` (e.g. internet shutdown 0.4, panic buying 1.5). */
  | (OverlayBase & { type: 'demand_shock'; multiplier: number; durationDays: number })

export type MacroOverlayType = MacroOverlay['type']

export interface ResolvedOverlay {
  id: string
  spec: MacroOverlay
  fromMs: EpochMs
  toMs: EpochMs
  /** For volatility/regime effects that act on the stochastic generation. */
  forcedRegime?: Regime
  volMultiplier: number
}

export interface MacroScenarioState {
  t: EpochMs
  mid: number
  regime: Regime
  dailyVolPct: number
  inflationIndex: number
  demandMultiplier: number
  cashDollarPremium: number
  activeOverlays: { id: string; type: MacroOverlayType }[]
}
