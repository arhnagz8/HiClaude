/**
 * Typed fetch wrapper for the HiClaude API (docs/05-architecture/api-spec.md).
 *  - credentials: 'include' (cookie sessions) + optional Bearer token (Mini Apps)
 *  - CSRF double-submit: reads cookie `csrf` and mirrors it in `X-CSRF-Token` on mutating calls
 *  - errors become ApiError with a Persian message (server `messageFa` wins, else contracts' ERROR_MESSAGES_FA, else generic)
 */
import { ERROR_MESSAGES_FA, type ApiErrorDto, type AppErrorCode } from '@hiclaude/contracts'
import { t } from '../copy'
import { readStore, writeStore } from '../lib/storage'

export const API_BASE = '/api/v1'
const TOKEN_KEY = 'hc.token'

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly messageFa: string
  readonly details?: Record<string, unknown>
  constructor(status: number, code: string, messageFa: string, details?: Record<string, unknown>) {
    super(`${code}: ${messageFa}`)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.messageFa = messageFa
    this.details = details
  }
  get isAuth(): boolean {
    return this.status === 401 || this.code === 'UNAUTHENTICATED'
  }
  get isNetwork(): boolean {
    return this.code === 'NETWORK'
  }
}

export function toApiError(e: unknown): ApiError {
  if (e instanceof ApiError) return e
  return new ApiError(0, 'UNKNOWN', t('system.unknownError'))
}
/** Persian message for any thrown value. */
export const errorMessage = (e: unknown): string => toApiError(e).messageFa

let token: string | null = readStore('hc.token', 'session')
export function setAuthToken(next: string | null): void {
  token = next
  writeStore(TOKEN_KEY, next, 'session')
}
export const getAuthToken = (): string | null => token

let onUnauthorized: (() => void) | null = null
/** AuthProvider registers a callback so a 401 on any call flips the session to «expired». */
export function setUnauthorizedHandler(fn: (() => void) | null): void {
  onUnauthorized = fn
}

function csrfToken(): string | null {
  try {
    const m = /(?:^|;\s*)csrf=([^;]+)/.exec(document.cookie)
    return m ? decodeURIComponent(m[1] as string) : null
  } catch {
    return null
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  body?: unknown
  query?: Record<string, string | number | boolean | undefined | null>
  idempotencyKey?: string
  signal?: AbortSignal
  headers?: Record<string, string>
  /** do not treat 401 as session expiry (login endpoints) */
  noAuthHandling?: boolean
}

export function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = path.startsWith('http') ? path : `${API_BASE}${path.startsWith('/') ? '' : '/'}${path}`
  if (!query) return url
  const qs = Object.entries(query)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&')
  return qs ? `${url}${url.includes('?') ? '&' : '?'}${qs}` : url
}

export function buildHeaders(opts: RequestOptions): Record<string, string> {
  const method = opts.method ?? 'GET'
  const h: Record<string, string> = { accept: 'application/json', ...opts.headers }
  if (opts.body !== undefined) h['content-type'] = 'application/json'
  if (token) h.authorization = `Bearer ${token}`
  if (method !== 'GET') {
    const csrf = csrfToken()
    if (csrf) h['x-csrf-token'] = csrf
  }
  if (opts.idempotencyKey) h['idempotency-key'] = opts.idempotencyKey
  return h
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(buildUrl(path, opts.query), {
      method: opts.method ?? 'GET',
      headers: buildHeaders(opts),
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      credentials: 'include',
      signal: opts.signal,
    })
  } catch (e) {
    if ((e as { name?: string }).name === 'AbortError') throw e
    throw new ApiError(0, 'NETWORK', t('system.networkError'))
  }
  if (res.status === 204) return undefined as T
  let data: unknown = null
  const text = await res.text()
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = null
    }
  }
  if (!res.ok) {
    const err = (data as ApiErrorDto | null)?.error
    const code = err?.code ?? (res.status === 401 ? 'UNAUTHENTICATED' : res.status === 429 ? 'RATE_LIMITED' : res.status >= 500 ? 'INTERNAL' : 'UNKNOWN')
    const fallback = (ERROR_MESSAGES_FA as Record<string, string | undefined>)[code as AppErrorCode] ?? t('system.unknownError')
    const apiErr = new ApiError(res.status, code, err?.messageFa || fallback, err?.details)
    if (apiErr.isAuth && !opts.noAuthHandling) onUnauthorized?.()
    throw apiErr
  }
  return data as T
}

export const api = {
  get: <T>(path: string, query?: RequestOptions['query'], signal?: AbortSignal) => request<T>(path, { query, signal }),
  post: <T>(path: string, body?: unknown, opts: Omit<RequestOptions, 'method' | 'body'> = {}) => request<T>(path, { ...opts, method: 'POST', body: body ?? {} }),
  patch: <T>(path: string, body?: unknown, opts: Omit<RequestOptions, 'method' | 'body'> = {}) => request<T>(path, { ...opts, method: 'PATCH', body: body ?? {} }),
  put: <T>(path: string, body?: unknown, opts: Omit<RequestOptions, 'method' | 'body'> = {}) => request<T>(path, { ...opts, method: 'PUT', body: body ?? {} }),
  del: <T>(path: string, opts: Omit<RequestOptions, 'method'> = {}) => request<T>(path, { ...opts, method: 'DELETE' }),
}
