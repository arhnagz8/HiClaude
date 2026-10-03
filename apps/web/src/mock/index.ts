/**
 * Mock backend entry. `installMock()` (called from main.tsx when VITE_MOCK=1) replaces window.fetch for /api/v1/* with an in-memory server;
 * `createMockFetch(server)` is the same thing for tests. B7b: drop `admin*.ts` files next to this one — they are loaded automatically.
 */
import { MockServer, type MockOptions } from './server'
import { matchRoute, MockHttpError, type MockCtx, type MockResult } from './registry'
import './routes'

// Admin routes (B7b): any file matching ./admin*.ts registers its routes via `route()` on import.
import.meta.glob('./admin*.ts', { eager: true })

export { MockServer, route, ok, fail, noContent } from './index-exports'
export type { MockCtx, MockResult }

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

type FetchLike = typeof fetch

export function createMockFetch(srv: MockServer, passthrough?: FetchLike): FetchLike {
  return async (input, init) => {
    const href = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url
    const url = new URL(href, 'http://localhost')
    if (!url.pathname.startsWith('/api/v1/')) {
      if (passthrough) return passthrough(input, init)
      return new Response('not found', { status: 404 })
    }
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    const path = url.pathname.slice('/api/v1'.length)
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
    let body: unknown = undefined
    const raw = init?.body
    if (typeof raw === 'string' && raw) {
      try {
        body = JSON.parse(raw)
      } catch {
        body = undefined
      }
    }
    srv.tick()
    if (srv.opts.latencyMs > 0 && !path.endsWith('/stream')) await sleep(srv.opts.latencyMs * (0.6 + Math.random() * 0.8))
    const m = matchRoute(method, path)
    if (!m) return json(404, { error: { code: 'NOT_FOUND', messageFa: 'مسیر یافت نشد.' } })
    const ctx: MockCtx = { srv, method, path, params: m.params, query: url.searchParams, body, headers, signal: init?.signal ?? undefined }
    let result: MockResult
    try {
      result = await m.handler(ctx)
    } catch (e) {
      if (e instanceof MockHttpError) result = e.result
      else {
        console.error('[mock] handler error', e)
        result = { status: 500, body: { error: { code: 'INTERNAL', messageFa: 'خطای داخلی رخ داد؛ لطفاً دوباره تلاش کنید.' } } }
      }
    }
    srv.save()
    if (result.stream) return sse(result, ctx.signal)
    if (result.status === 204) return new Response(null, { status: 204 })
    return json(result.status, result.body, result.headers)
  }
}

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body ?? null), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...headers } })
}

function sse(result: MockResult, signal?: AbortSignal): Response {
  const enc = new TextEncoder()
  let cleanup: (() => void) | undefined
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const push = (event: string, data: unknown, id?: string) => {
        try {
          controller.enqueue(enc.encode(`${id ? `id: ${id}\n` : ''}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
        } catch {
          /* closed */
        }
      }
      cleanup = result.stream!(push, signal)
      signal?.addEventListener('abort', () => {
        cleanup?.()
        try {
          controller.close()
        } catch {
          /* already closed */
        }
      })
    },
    cancel() {
      cleanup?.()
    },
  })
  return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' } })
}

declare global {
  interface Window {
    __mock?: Record<string, unknown>
  }
}

/** Installs the mock as window.fetch. Query params: ?mockLatency=ms ?mockLock=seconds ?mockSpeed=x */
export function installMock(): MockServer {
  const sp = new URLSearchParams(window.location.search)
  const opts: MockOptions = {
    persist: true,
    latencyMs: sp.has('mockLatency') ? Number(sp.get('mockLatency')) : 120,
    lockMs: sp.has('mockLock') ? Number(sp.get('mockLock')) * 1000 : undefined,
    speed: sp.has('mockSpeed') ? Number(sp.get('mockSpeed')) : 1,
  }
  const srv = new MockServer(opts)
  const real = window.fetch.bind(window)
  window.fetch = createMockFetch(srv, real)
  setInterval(() => srv.tick(), 1000)
  // Dev / QA controls: window.__mock.setStatus('stale'), .killSwitch(true), .expressFull(true), .jumpRate(5), .reset()
  window.__mock = {
    server: srv,
    setStatus: (s: 'ok' | 'halted' | 'stale' | 'anomaly' | 'killed') => ((srv.db.flags.rateStatus = s), srv.notifyAll()),
    killSwitch: (on: boolean) => ((srv.db.flags.killSwitch = on), srv.save(), srv.notifyAll()),
    expressFull: (on: boolean) => ((srv.db.flags.expressFull = on), srv.save()),
    banner: (b?: { severity: 'info' | 'warning' | 'critical'; textFa: string }) => ((srv.db.flags.banner = b), srv.save()),
    jumpRate: (pct: number) => srv.jumpRate(pct),
    reset: () => srv.reset(),
  }
  return srv
}
