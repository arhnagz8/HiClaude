/**
 * IdentitySim implements IdentityPort (Shahkar mobile<->national-id match, bank-card owner match).
 * Ground truth is registered by agents (`registerPerson`); answers are deterministic per (query, seed) with configurable vendor error rates.
 * Unknown national ids (never registered) match with `unknownMatchProb` (default: the world is mostly honest). Costs are UNVERIFIED placeholders.
 */
import { err, ok, portError, type Irt, type IdentityPort, type Result, type Rng } from '@hiclaude/contracts'
import { hashString32, hashUniform } from '../core/hash'
import { newHandleId, pNum, type EventHandle, type Params, type SimComponent, type SimEnv } from '../core/types'

export interface IdentitySimConfig {
  shahkarCostIrt: Irt
  cardOwnerCostIrt: Irt
  /** P(match=true | truth true) */
  truePositiveProb: number
  /** P(match=true | truth false) */
  falsePositiveProb: number
  unknownMatchProb: number
  failureProb: number
}
export const DEFAULT_IDENTITY_CONFIG: IdentitySimConfig = { shahkarCostIrt: 1_500, cardOwnerCostIrt: 2_000, truePositiveProb: 0.985, falsePositiveProb: 0.001, unknownMatchProb: 0.9, failureProb: 0.004 }

interface Person {
  nationalId: string
  phones: Set<string>
  cards: Map<string, string | undefined>
}

export class IdentitySim implements IdentityPort, SimComponent {
  readonly name = 'identity'
  readonly cfg: IdentitySimConfig
  private people = new Map<string, Person>()
  private seed: number
  private down = 0
  private spent = 0
  private lookups = 0

  constructor(
    private readonly env: SimEnv,
    private readonly rng: Rng,
    cfg: Partial<IdentitySimConfig> = {},
  ) {
    this.cfg = { ...DEFAULT_IDENTITY_CONFIG, ...cfg }
    this.seed = hashString32(`${rng.path}/identity`)
  }

  registerPerson(p: { nationalId: string; phones?: string[]; cards?: { pan: string; ownerName?: string }[] }): void {
    const cur = this.people.get(p.nationalId) ?? { nationalId: p.nationalId, phones: new Set<string>(), cards: new Map<string, string | undefined>() }
    for (const ph of p.phones ?? []) cur.phones.add(ph)
    for (const c of p.cards ?? []) cur.cards.set(c.pan, c.ownerName)
    this.people.set(p.nationalId, cur)
  }

  private verdict(kind: string, key: string, truth: boolean | undefined): boolean {
    const u = hashUniform(this.seed, hashString32(kind), hashString32(key))
    if (truth === undefined) return u < this.cfg.unknownMatchProb
    return truth ? u < this.cfg.truePositiveProb : u < this.cfg.falsePositiveProb
  }

  private pre(cost: Irt): Result<never> | null {
    if (this.down > 0) return err(portError('UNAVAILABLE', 'identity vendor unavailable', { retryAfterMs: 60_000 }))
    if (this.rng.bool(this.cfg.failureProb)) return err(portError('UNAVAILABLE', 'identity vendor error', { retryAfterMs: 10_000 }))
    this.spent += cost
    this.lookups += 1
    this.env.stats.inc('identity.lookups')
    return null
  }

  async shahkar(req: { nationalId: string; phone: string }): Promise<Result<{ match: boolean; costIrt: Irt }>> {
    if (!/^\d{10}$/.test(req.nationalId)) return err(portError('VALIDATION', 'nationalId must be 10 digits', { retryable: false }))
    if (!/^09\d{9}$/.test(req.phone)) return err(portError('VALIDATION', 'phone must be 09xxxxxxxxx', { retryable: false }))
    const e = this.pre(this.cfg.shahkarCostIrt)
    if (e) return e
    const person = this.people.get(req.nationalId)
    const truth = person ? person.phones.has(req.phone) : undefined
    return ok({ match: this.verdict('shahkar', `${req.nationalId}|${req.phone}`, truth), costIrt: this.cfg.shahkarCostIrt })
  }

  async cardOwner(req: { cardPan: string; nationalId: string }): Promise<Result<{ match: boolean; ownerNameMasked?: string; costIrt: Irt }>> {
    if (!/^\d{16}$/.test(req.cardPan)) return err(portError('VALIDATION', 'cardPan must be 16 digits', { retryable: false }))
    if (!/^\d{10}$/.test(req.nationalId)) return err(portError('VALIDATION', 'nationalId must be 10 digits', { retryable: false }))
    const e = this.pre(this.cfg.cardOwnerCostIrt)
    if (e) return e
    const person = this.people.get(req.nationalId)
    const truth = person ? person.cards.has(req.cardPan) : undefined
    const match = this.verdict('card', `${req.cardPan}|${req.nationalId}`, truth)
    const name = person?.cards.get(req.cardPan)
    const masked = match && name ? `${name.slice(0, 1)}${'*'.repeat(Math.max(2, name.length - 1))}` : undefined
    return ok({ match, ownerNameMasked: masked, costIrt: this.cfg.cardOwnerCostIrt })
  }

  totalSpentIrt(): Irt {
    return this.spent
  }
  lookupCount(): number {
    return this.lookups
  }

  applyEvent(type: string, params: Params): EventHandle | null {
    switch (type) {
      case 'identity_outage': {
        this.down += 1
        let done = false
        return { id: newHandleId('identity_outage'), revert: () => void (!done && ((done = true), (this.down -= 1))) }
      }
      case 'identity_price_change': {
        const prev = { s: this.cfg.shahkarCostIrt, c: this.cfg.cardOwnerCostIrt }
        this.cfg.shahkarCostIrt = Math.round(pNum(params, 'shahkarCostIrt', prev.s))
        this.cfg.cardOwnerCostIrt = Math.round(pNum(params, 'cardOwnerCostIrt', prev.c))
        return { id: newHandleId('identity_price'), revert: () => void (this.cfg.shahkarCostIrt = prev.s, (this.cfg.cardOwnerCostIrt = prev.c)) }
      }
      default:
        return null
    }
  }
}
