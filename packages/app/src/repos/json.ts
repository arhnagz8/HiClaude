/** JSON column helpers: zod-validated on both read and write so bad data never crosses the repository boundary. */
import type { ZodTypeAny, z } from 'zod'

export class RowDataError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message)
    this.name = 'RowDataError'
  }
}

export function toJson<S extends ZodTypeAny>(schema: S, value: z.input<S>, label: string): string {
  const r = schema.safeParse(value)
  if (!r.success) throw new RowDataError(`invalid ${label}: ${r.error.message}`, r.error)
  return JSON.stringify(r.data)
}

export function fromJson<S extends ZodTypeAny>(schema: S, text: string | null | undefined, label: string): z.output<S> {
  let raw: unknown
  try {
    raw = JSON.parse(text ?? 'null')
  } catch (e) {
    throw new RowDataError(`corrupt JSON in ${label}`, e)
  }
  const r = schema.safeParse(raw)
  if (!r.success) throw new RowDataError(`invalid ${label}: ${r.error.message}`, r.error)
  return r.data
}

export function fromJsonOpt<S extends ZodTypeAny>(schema: S, text: string | null | undefined, label: string): z.output<S> | undefined {
  return text === null || text === undefined ? undefined : fromJson(schema, text, label)
}

export function toJsonOpt<S extends ZodTypeAny>(schema: S, value: z.input<S> | undefined, label: string): string | null {
  return value === undefined ? null : toJson(schema, value, label)
}

/** Remove keys whose value is undefined (keeps domain objects tidy when optional columns are NULL). */
export function compact<T extends object>(o: T): T {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null) out[k] = v
  return out as T
}

export const nn = <T>(v: T | null | undefined): T | undefined => (v === null ? undefined : v)
export const b2i = (b: boolean | undefined | null): number => (b ? 1 : 0)
