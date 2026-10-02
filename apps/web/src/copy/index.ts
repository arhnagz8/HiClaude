import { fa } from './fa'

type Leaf = string
type Paths<T> = T extends Leaf
  ? never
  : T extends readonly unknown[]
    ? never
    : { [K in keyof T & string]: T[K] extends Leaf ? K : `${K}.${Paths<T[K]>}` }[keyof T & string]
type ListPaths<T> = T extends Leaf
  ? never
  : T extends readonly unknown[]
    ? never
    : { [K in keyof T & string]: T[K] extends readonly unknown[] ? K : T[K] extends Leaf ? never : `${K}.${ListPaths<T[K]>}` }[keyof T & string]
type Resolve<T, P extends string> = P extends `${infer H}.${infer R}` ? (H extends keyof T ? Resolve<T[H], R> : never) : P extends keyof T ? T[P] : never

export type CopyKey = Paths<typeof fa>
export type CopyListKey = ListPaths<typeof fa>
export type CopyVars = Record<string, string | number>

function lookup(path: string): unknown {
  let cur: unknown = fa
  for (const part of path.split('.')) {
    if (cur && typeof cur === 'object' && part in (cur as Record<string, unknown>)) cur = (cur as Record<string, unknown>)[part]
    else return undefined
  }
  return cur
}

export function interpolate(template: string, vars?: CopyVars): string {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m))
}

/** Typed copy lookup: t('common.save'), t('order.eta', { time: '۱۰ دقیقه' }). Missing key → the key itself (visible in QA, never throws). */
export function t(key: CopyKey, vars?: CopyVars): string {
  const v = lookup(key)
  return typeof v === 'string' ? interpolate(v, vars) : key
}

/** Typed list lookup (FAQ items, steps…). */
export function tl<K extends CopyListKey>(key: K): Resolve<typeof fa, K> {
  const v = lookup(key)
  return (Array.isArray(v) ? v : []) as Resolve<typeof fa, K>
}

export { fa }
