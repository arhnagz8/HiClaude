/** Owner policy parameters: data/sim/owner_policies.json (three presets) + deep-merged overrides (scenario owner.overrides). */
import { z } from 'zod'
import { deepMerge, readRepoJson } from '../demand/common'

const n = z.number()
export const PolicyConfigSchema = z.object({
  pricing: z.object({
    winRateLow: n, winRateHigh: n, marginStepPct: n, maxMarginStepPerDecisionPct: n, maxCumulative30dPct: n, floorMarginPct: n, maxMarginPct: n, minQuotesForDecision: n, cadenceDays: n,
    fxLossBufferTrigger: z.object({ fxLossToGrossProfitRatio: n, bufferStepPct: n, maxVolMinBufferPct: n, calmWeeksToRelax: n }),
  }),
  treasury: z.object({
    baseCoverageDays: n, highVolCoverageDays: n, lowVolCoverageDays: n, highVolDailyPct: n, lowVolDailyPct: n, minRunwayDays: n, restoreRunwayDays: n, maxInjectionPerMonthIrt: n,
    drawCashMonthsOfOpexThreshold: n, drawFractionOfExcess: n, minRunwayDaysForDraw: n, cadenceDays: n,
  }),
  staffing: z.object({ slaMinutes: n, queueAgeBreachDaysToHire: n, hireCountPerDecision: n, lowUtilisation: n, lowUtilisationWeeksToFire: n, minOperators: n, maxOperators: n, cooldownDaysAfterHire: n, noFireDaysAfterHire: n }),
  marketing: z.object({
    cadenceDays: n, budgetShareOfCash: n, minBudgetIrt: n, maxBudgetIrt: n, ltvToCacIncrease: n, ltvToCacDecrease: n, increaseFactor: n, decreaseFactor: n, zeroBudgetRunwayDays: n, mixShiftMaxPct: n,
  }),
  providers: z.object({ failureRateMargin: n, feeBpsMargin: n, observationsRequired: n, cooldownDays: n }),
  risk: z.object({
    fraudLossRateTriggerPct: n, fraudSpikeMultiple: n, tightenFactor: n, minNewCustomerMaxOrderUsdCents: n, defaultNewCustomerMaxOrderUsdCents: n, holdScoreStep: n, minHoldScore: n, maxHoldScore: n, calmWeeksToRelax: n,
  }),
  rush: z.object({ saturationUtilisation: n, premiumStepRel: n, maxPremiumPct: n, cadenceDays: n }),
  tax: z.object({ vatPayDayOfMonthAfterQuarter: n, incomeTaxPayJalaliMonth: n, source: z.string() }),
  killSwitch: z.object({ onAlertCodes: z.array(z.string()), source: z.string() }),
})
export type PolicyConfig = z.infer<typeof PolicyConfigSchema>
export type PolicyPreset = 'conservative' | 'baseline' | 'aggressive'
export const POLICY_PRESETS: readonly PolicyPreset[] = ['conservative', 'baseline', 'aggressive']

export type DeepPartialConfig<T> = { [K in keyof T]?: T[K] extends object ? (T[K] extends unknown[] ? T[K] : DeepPartialConfig<T[K]>) : T[K] }

export function parsePolicyFile(raw: unknown): Record<PolicyPreset, PolicyConfig> {
  const f = z.object({ policies: z.object({ conservative: PolicyConfigSchema, baseline: PolicyConfigSchema, aggressive: PolicyConfigSchema }) }).parse(raw)
  return f.policies
}

export function loadPolicyConfig(preset: PolicyPreset = 'baseline', overrides?: DeepPartialConfig<PolicyConfig>): PolicyConfig {
  const raw = readRepoJson('data/sim/owner_policies.json')
  if (!raw) throw new Error('data/sim/owner_policies.json missing')
  const base = parsePolicyFile(raw)[preset]
  return overrides ? PolicyConfigSchema.parse(deepMerge(base, overrides)) : base
}
