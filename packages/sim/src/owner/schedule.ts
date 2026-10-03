/** Decision-file scheduling, policy/file merging and the decision log. */
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { parseIrstDate, type EpochMs } from '@hiclaude/contracts'
import { conflictKey, describeDecision, parseDecisionsFile, type OwnerDecision, type OwnerDecisionBody } from './decisions'
import type { PolicyDecision } from './policy'

/** Decisions from a `--decisions` file, released when virtual time reaches their date (IRST midnight). Each is applied exactly once. */
export class DecisionSchedule {
  private readonly items: Array<{ d: OwnerDecision; at: EpochMs; done: boolean }>
  constructor(decisions: readonly OwnerDecision[]) {
    this.items = decisions.map((d) => ({ d, at: parseIrstDate(d.date), done: false })).sort((a, b) => a.at - b.at)
  }
  static fromFile(raw: unknown): DecisionSchedule {
    return new DecisionSchedule(parseDecisionsFile(raw))
  }
  /** All not-yet-applied decisions with date ≤ now, in (date, file order). Marks them applied. */
  popDue(now: EpochMs): OwnerDecision[] {
    const out: OwnerDecision[] = []
    for (const it of this.items) {
      if (it.at > now) break
      if (!it.done) {
        it.done = true
        out.push(it.d)
      }
    }
    return out
  }
  get pending(): number {
    return this.items.filter((i) => !i.done).length
  }
  nextAt(): EpochMs | undefined {
    return this.items.find((i) => !i.done)?.at
  }
  get size(): number {
    return this.items.length
  }
}

/** Convenience: validate a raw decision file and return those due at `now` that are not in `applied` (mutated). */
export function applyDecisionsFile(raw: unknown, now: EpochMs, applied: Set<number> = new Set()): OwnerDecision[] {
  const all = parseDecisionsFile(raw)
  const out: OwnerDecision[] = []
  all.forEach((d, i) => {
    if (!applied.has(i) && parseIrstDate(d.date) <= now) {
      applied.add(i)
      out.push(d)
    }
  })
  return out
}

/** File decisions win over policy decisions on the same lever; suppressed policy decisions are returned for the log. */
export function mergeDecisionStreams(policy: readonly PolicyDecision[], file: readonly OwnerDecision[]): { merged: Array<{ decision: OwnerDecisionBody; source: 'file' | 'policy'; policy?: PolicyDecision }>; suppressed: PolicyDecision[] } {
  const fileKeys = new Set(file.map((d) => conflictKey(d)))
  const merged: Array<{ decision: OwnerDecisionBody; source: 'file' | 'policy'; policy?: PolicyDecision }> = file.map((d) => ({ decision: stripDate(d), source: 'file' as const }))
  const suppressed: PolicyDecision[] = []
  for (const p of policy) {
    if (fileKeys.has(conflictKey(p.decision))) suppressed.push(p)
    else merged.push({ decision: p.decision, source: 'policy', policy: p })
  }
  return { merged, suppressed }
}

function stripDate(d: OwnerDecision): OwnerDecisionBody {
  const { date: _date, ...rest } = d
  return rest as OwnerDecisionBody
}

export interface DecisionLogEntry {
  seq: number
  at: EpochMs
  date: string
  source: 'policy' | 'file' | 'manual'
  rule?: string
  decision: OwnerDecisionBody
  summary: string
  rationale: string
  kpiSeen: Record<string, number | string>
  /** false when the application rejected it */
  applied?: boolean
  note?: string
}

/** Append-only decision log → `decisions.log.json`. */
export class DecisionLog {
  private readonly entries: DecisionLogEntry[] = []
  record(at: EpochMs, date: string, source: DecisionLogEntry['source'], decision: OwnerDecisionBody, extra: { rule?: string; rationale?: string; kpiSeen?: Record<string, number | string>; applied?: boolean; note?: string } = {}): DecisionLogEntry {
    const e: DecisionLogEntry = { seq: this.entries.length + 1, at, date, source, rule: extra.rule, decision, summary: describeDecision(decision), rationale: extra.rationale ?? decision.rationale ?? '', kpiSeen: extra.kpiSeen ?? {}, applied: extra.applied, note: extra.note }
    this.entries.push(e)
    return e
  }
  recordPolicy(at: EpochMs, date: string, p: PolicyDecision, applied?: boolean): DecisionLogEntry {
    return this.record(at, date, 'policy', p.decision, { rule: p.rule, rationale: p.rationale, kpiSeen: p.kpiSeen, applied })
  }
  get all(): readonly DecisionLogEntry[] {
    return this.entries
  }
  last(n: number): DecisionLogEntry[] {
    return this.entries.slice(-n)
  }
  countByType(): Record<string, number> {
    const o: Record<string, number> = {}
    for (const e of this.entries) o[e.decision.type] = (o[e.decision.type] ?? 0) + 1
    return o
  }
  toJSON(): { schema: string; entries: DecisionLogEntry[] } {
    return { schema: 'hiclaude.decisions.log/1', entries: [...this.entries] }
  }
}

export function writeDecisionLog(path: string, log: DecisionLog): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(log.toJSON(), null, 1))
}
