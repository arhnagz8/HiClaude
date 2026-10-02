import type { Logger } from '@hiclaude/contracts'

export const noopLogger: Logger = { debug() {}, info() {}, warn() {}, error() {} }

export type Actor = { type: 'system' | 'customer' | 'staff' | 'sim'; id?: string }
export type ActorLike = Actor | string | undefined

const ACTOR_TYPES = new Set(['system', 'customer', 'staff', 'sim'])

/** Normalises 'system' | 'sim' | 'staff:usr_1' | 'usr_1' (=staff id) | {type,id} into an Actor. */
export function toActor(a: ActorLike): Actor {
  if (a === undefined) return { type: 'system' }
  if (typeof a !== 'string') return a
  if (a === 'system' || a === 'sim') return { type: a }
  const i = a.indexOf(':')
  if (i > 0 && ACTOR_TYPES.has(a.slice(0, i))) return { type: a.slice(0, i) as Actor['type'], id: a.slice(i + 1) }
  return { type: 'staff', id: a }
}

export function actorString(a: ActorLike): string {
  const x = toActor(a)
  return x.id ? `${x.type}:${x.id}` : x.type
}

export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Sets `obj[path]` (dotted path) creating intermediate objects. Mutates `obj`. */
export function setPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.')
  let cur = obj
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i] as string
    if (!isPlainObject(cur[k])) cur[k] = {}
    cur = cur[k] as Record<string, unknown>
  }
  cur[parts[parts.length - 1] as string] = structuredClone(value)
}

export function getPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj
  for (const k of path.split('.')) {
    if (!isPlainObject(cur)) return undefined
    cur = cur[k]
  }
  return cur
}

/** Flattens a nested patch into [dottedPath, leafValue] pairs. Arrays and primitives are leaves; empty objects are skipped. */
export function flattenLeaves(patch: unknown, prefix: string): [string, unknown][] {
  if (!isPlainObject(patch)) return [[prefix, patch]]
  const out: [string, unknown][] = []
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue
    if (k.includes('.')) throw new RangeError(`setting key segment must not contain '.': ${k}`)
    if (isPlainObject(v)) out.push(...flattenLeaves(v, `${prefix}.${k}`))
    else out.push([`${prefix}.${k}`, v])
  }
  return out
}

export const jsonEqual = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)

/** Deep-freeze (dev guard against accidental mutation of shared params). */
export function deepFreeze<T>(o: T): T {
  if (typeof o === 'object' && o !== null && !Object.isFrozen(o)) {
    Object.freeze(o)
    for (const v of Object.values(o as Record<string, unknown>)) deepFreeze(v)
  }
  return o
}

/** Third-party costs incurred by platform code (SMS, identity inquiries…). B3's LedgerService subscribes to book them (5040 PAYMENT_FEES). */
export interface CostEvent {
  kind: 'sms' | 'shahkar' | 'card_owner'
  costIrt: number
  at: number
  customerId?: string
  ref?: string
}
export class CostRecorder {
  private readonly listeners = new Set<(e: CostEvent) => void>()
  subscribe(fn: (e: CostEvent) => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
  record(e: CostEvent): void {
    if (!(e.costIrt > 0)) return
    for (const l of [...this.listeners]) {
      try {
        l(e)
      } catch {
        /* a failing cost listener must never break the caller */
      }
    }
  }
}
