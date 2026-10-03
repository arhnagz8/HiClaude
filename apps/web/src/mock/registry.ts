/**
 * Route registry of the in-browser mock backend. Routes mirror docs/05-architecture/api-spec.md.
 * B7b (admin): add `src/mock/admin*.ts` files that call `route('GET', '/admin/dashboard', handler)` — they are auto-loaded by `mock/index.ts`.
 */
import { AppError, ERROR_MESSAGES_FA, type AppErrorCode } from '@hiclaude/contracts'
import type { MockServer } from './server'

export interface MockCtx {
  srv: MockServer
  method: string
  /** path below /api/v1, e.g. "/orders/ord_1" */
  path: string
  params: Record<string, string>
  query: URLSearchParams
  body: any // eslint-disable-line @typescript-eslint/no-explicit-any
  headers: Headers
  signal?: AbortSignal
}

export interface MockResult {
  status: number
  body?: unknown
  headers?: Record<string, string>
  /** Server-sent events: called once; push() writes an SSE message; return a cleanup fn. */
  stream?: (push: (event: string, data: unknown, id?: string) => void, signal?: AbortSignal) => () => void
}

export type Handler = (ctx: MockCtx) => MockResult | Promise<MockResult>

interface RouteDef {
  method: string
  pattern: string
  re: RegExp
  keys: string[]
  handler: Handler
}
const routes: RouteDef[] = []

export function route(method: string, pattern: string, handler: Handler): void {
  const keys: string[] = []
  const re = new RegExp('^' + pattern.replace(/:([A-Za-z]+)/g, (_, k: string) => (keys.push(k), '([^/]+)')) + '/?$')
  const i = routes.findIndex((r) => r.method === method && r.pattern === pattern)
  const def = { method, pattern, re, keys, handler }
  if (i >= 0) routes[i] = def
  else routes.push(def)
}

export function matchRoute(method: string, path: string): { handler: Handler; params: Record<string, string> } | undefined {
  for (const r of routes) {
    if (r.method !== method) continue
    const m = r.re.exec(path)
    if (m) {
      const params: Record<string, string> = {}
      r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1] as string)))
      return { handler: r.handler, params }
    }
  }
  return undefined
}

export const ok = (body: unknown, status = 200): MockResult => ({ status, body })
export const noContent = (): MockResult => ({ status: 204 })
export function fail(code: AppErrorCode, messageFa?: string, details?: Record<string, unknown>): MockResult {
  const status = new AppError(code).status
  return { status, body: { error: { code, messageFa: messageFa ?? ERROR_MESSAGES_FA[code], ...(details ? { details } : {}) } } }
}
/** Throwable form for deep helpers. */
export class MockHttpError extends Error {
  constructor(public readonly result: MockResult) {
    super('mock http error')
  }
}
export const failThrow = (code: AppErrorCode, messageFa?: string, details?: Record<string, unknown>): never => {
  throw new MockHttpError(fail(code, messageFa, details))
}
