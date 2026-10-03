/**
 * Reputation: trust ∈ [0,1] as a decaying Beta-posterior mean over pseudo-counts.
 *   trust = α / (α + β) (+ static trust signals such as Enamad), α,β decay towards the prior with half-life H.
 * Events add evidence asymmetrically (failures weigh several times a success — Slovic asymmetry), so a failure wave
 * dents a young brand fast while a mature brand with lots of evidence moves slowly. Pure state machine: step(dt, events).
 * Feeds: demand multiplier (SEO/review exposure, word of mouth), referral propensity, and `ourTrust` of the logit.
 */
import { MS } from '@hiclaude/contracts'

export interface ReputationParams {
  /** prior mean trust of an unknown young brand */
  priorTrust: number
  /** prior pseudo-count strength (higher = more inertia at launch) */
  priorStrength: number
  /** evidence half-life in days (decay towards the prior) */
  halfLifeDays: number
  weights: { onTime: number; lateSuccess: number; lateFailureShare: number; failure: number; refund: number; dispute: number; reviewWeight: number; incidentPerSeverity: number }
  /** constant additive trust from static signals (Enamad, registered company, published SLA) */
  staticBonus: number
  referenceTrust: number
  /** multiplier = exp(k·(trust − ref)), clamped */
  demandSensitivity: number
  womSensitivity: number
  demandMultiplierRange: [number, number]
  source: string
}

export const DEFAULT_REPUTATION_PARAMS: ReputationParams = {
  priorTrust: 0.4,
  priorStrength: 15,
  halfLifeDays: 150,
  weights: { onTime: 1, lateSuccess: 0.4, lateFailureShare: 0.6, failure: 4, refund: 2, dispute: 2, reviewWeight: 1.5, incidentPerSeverity: 5 },
  staticBonus: 0,
  referenceTrust: 0.6,
  demandSensitivity: 1.5,
  womSensitivity: 2.0,
  demandMultiplierRange: [0.4, 2.2],
  source: 'assumption (no empirical calibration; see data/ops_growth.json reputation dynamics when available). Equilibrium trust for success rate q is q/(q+4(1-q)).',
}

export type ReputationEvent =
  | { type: 'delivered'; onTime: boolean }
  | { type: 'failed' }
  | { type: 'refund' }
  | { type: 'dispute' }
  | { type: 'review'; rating: number }
  /** hack / freeze / public incident: severity 0..N (1 = noticeable, 3 = headline) */
  | { type: 'incident'; severity: number }
  /** external wave of reviews: sign +1/-1, magnitude in pseudo-count units */
  | { type: 'wave'; sign: 1 | -1; magnitude: number }

export interface ReputationState {
  alpha: number
  beta: number
}

export class Reputation {
  private alpha: number
  private beta: number
  private readonly a0: number
  private readonly b0: number

  constructor(readonly params: ReputationParams = DEFAULT_REPUTATION_PARAMS, state?: ReputationState) {
    this.a0 = params.priorTrust * params.priorStrength
    this.b0 = (1 - params.priorTrust) * params.priorStrength
    this.alpha = state?.alpha ?? this.a0
    this.beta = state?.beta ?? this.b0
  }

  /** Evidence decays towards the prior, then events are added. dt ≥ 0. */
  step(dtMs: number, events: readonly ReputationEvent[] = []): void {
    if (dtMs > 0) {
      const d = Math.pow(0.5, dtMs / (this.params.halfLifeDays * MS.day))
      this.alpha = this.a0 + (this.alpha - this.a0) * d
      this.beta = this.b0 + (this.beta - this.b0) * d
    }
    for (const e of events) this.apply(e)
  }

  apply(e: ReputationEvent): void {
    const w = this.params.weights
    switch (e.type) {
      case 'delivered':
        if (e.onTime) this.alpha += w.onTime
        else {
          this.alpha += w.lateSuccess
          this.beta += w.lateFailureShare
        }
        break
      case 'failed':
        this.beta += w.failure
        break
      case 'refund':
        this.beta += w.refund
        break
      case 'dispute':
        this.beta += w.dispute
        break
      case 'review': {
        const r = Math.min(5, Math.max(1, e.rating))
        this.alpha += ((r - 1) / 4) * w.reviewWeight
        this.beta += ((5 - r) / 4) * w.reviewWeight
        break
      }
      case 'incident':
        this.beta += Math.max(0, e.severity) * w.incidentPerSeverity
        break
      case 'wave':
        if (e.sign > 0) this.alpha += Math.max(0, e.magnitude)
        else this.beta += Math.max(0, e.magnitude)
        break
    }
  }

  /** Posterior-mean trust plus static signals, clamped to [0,1]. */
  get trust(): number {
    return Math.min(1, Math.max(0, this.alpha / (this.alpha + this.beta) + this.params.staticBonus))
  }

  /** 1..5 star rating as customers would see it. */
  get publicRating(): number {
    return 1 + 4 * this.trust
  }

  /** Amount of evidence beyond the prior (inertia indicator). */
  get evidence(): number {
    return this.alpha + this.beta - (this.a0 + this.b0)
  }

  /** multiplier on visitor arrivals (reviews, SEO snippets, brand search) */
  demandMultiplier(): number {
    const [lo, hi] = this.params.demandMultiplierRange
    return Math.min(hi, Math.max(lo, Math.exp(this.params.demandSensitivity * (this.trust - this.params.referenceTrust))))
  }

  /** multiplier on referral propensity (word of mouth) */
  wordOfMouthMultiplier(): number {
    return Math.min(2.5, Math.max(0.3, Math.exp(this.params.womSensitivity * (this.trust - this.params.referenceTrust))))
  }

  /** Equilibrium trust for a long-run success rate q (on-time successes vs failures), ignoring decay-to-prior. */
  equilibriumTrust(successRate: number): number {
    const w = this.params.weights
    const a = successRate * w.onTime
    const b = (1 - successRate) * w.failure
    return a / (a + b)
  }

  snapshot(): ReputationState {
    return { alpha: this.alpha, beta: this.beta }
  }
  restore(s: ReputationState): void {
    this.alpha = s.alpha
    this.beta = s.beta
  }
}
