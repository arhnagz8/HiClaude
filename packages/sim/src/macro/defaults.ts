/**
 * Built-in macro calibration. PLACEHOLDERS: superseded by data/macro_calibration.json (research 08) when present.
 * spot 257,000 Toman/USDT at 2026-10-02 (first-pass research, UNVERIFIED first-hand); calm vol 1.0 %/day, stress 2.2 %, crisis 4.5 %;
 * calm/stress annual drift +45 % (log 0.001018/day, i.e. about 0.12 %/day simple); jumps 4/yr mean +4 % sd 3 %.
 */
import type { MacroCalibration } from './types'

const ANNUAL_45 = Math.log(1.45) / 365

export function defaultMacroCalibration(): MacroCalibration {
  return {
    spot: 257_000,
    regimes: {
      calm: { dailyVol: 0.01, driftPerDay: ANNUAL_45, jumpRatePerYear: 4, jumpMean: 0.04, jumpSd: 0.03 },
      stress: { dailyVol: 0.022, driftPerDay: ANNUAL_45, jumpRatePerYear: 8, jumpMean: 0.04, jumpSd: 0.03 },
      crisis: { dailyVol: 0.045, driftPerDay: 0.012, jumpRatePerYear: 30, jumpMean: 0.05, jumpSd: 0.04 },
      recovery: { dailyVol: 0.018, driftPerDay: -0.002, jumpRatePerYear: 2, jumpMean: -0.02, jumpSd: 0.02 },
    },
    transition: {
      calm: { calm: 0.985, stress: 0.012, crisis: 0.001, recovery: 0.002 },
      stress: { calm: 0.06, stress: 0.9, crisis: 0.03, recovery: 0.01 },
      crisis: { calm: 0, stress: 0.05, crisis: 0.85, recovery: 0.1 },
      recovery: { calm: 0.08, stress: 0.02, crisis: 0.005, recovery: 0.895 },
    },
    initialRegime: 'calm',
    // Sun Mon Tue Wed Thu Fri Sat ; Friday (weekend) thin, Thursday slightly thinner. Normalised to mean 1 by the engine.
    weekdayVol: [1.05, 1.05, 1.05, 1.05, 0.95, 0.75, 1.1],
    // IRST hours 0..23: exchanges are halted 21:00-09:00 in night-halt regimes; OTC still drifts at night, but thinly.
    intradayVarianceWeights: [
      0.012, 0.01, 0.008, 0.008, 0.008, 0.01, 0.014, 0.02, 0.03, 0.06, 0.075, 0.08, 0.07, 0.065, 0.07, 0.075, 0.075, 0.07, 0.065, 0.06, 0.05, 0.035, 0.02, 0.014,
    ],
    premium: {
      cashDollarMean: 0.008,
      cashDollarDailySd: 0.003,
      meanReversionPerDay: 0.1,
      regimeAddon: { calm: 0, stress: 0.004, crisis: 0.015, recovery: -0.002 },
      min: -0.03,
      max: 0.15,
    },
    inflation: { annualRate: 0.38, fxPassThrough: 0.25, fxEmaHalfLifeDays: 45, fxReferenceDriftPerDay: ANNUAL_45, dailyNoiseSd: 0.0002 },
    demand: {
      regimeMultiplier: { calm: 1, stress: 1.08, crisis: 1.3, recovery: 0.95 },
      weekday: [1, 1, 1, 1, 0.95, 0.8, 1],
      smoothingDays: 5,
      realPriceElasticity: 0.3,
    },
  }
}
