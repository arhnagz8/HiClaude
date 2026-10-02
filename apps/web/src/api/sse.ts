/**
 * Server-Sent Events over fetch (so we can send Authorization / Last-Event-ID headers, which EventSource cannot).
 * Reconnects with exponential backoff + jitter; the caller may fall back to polling while `connected` is false.
 */
import { buildHeaders, buildUrl } from './client'

export interface SseMessage {
  id?: string
  event: string
  data: string
}

/** Incremental SSE parser: feed text chunks, get complete messages; keeps the unfinished tail in `rest`. */
export function parseSse(buffer: string): { messages: SseMessage[]; rest: string } {
  const normalized = buffer.replace(/\r\n?/g, '\n')
  const parts = normalized.split('\n\n')
  const rest = parts.pop() ?? ''
  const messages: SseMessage[] = []
  for (const part of parts) {
    let event = 'message'
    let id: string | undefined
    const data: string[] = []
    let any = false
    for (const line of part.split('\n')) {
      if (!line || line.startsWith(':')) continue
      any = true
      const idx = line.indexOf(':')
      const field = idx === -1 ? line : line.slice(0, idx)
      let value = idx === -1 ? '' : line.slice(idx + 1)
      if (value.startsWith(' ')) value = value.slice(1)
      if (field === 'event') event = value
      else if (field === 'data') data.push(value)
      else if (field === 'id') id = value
    }
    if (any && data.length) messages.push({ id, event, data: data.join('\n') })
  }
  return { messages, rest }
}

export function backoffMs(attempt: number, rand: () => number = Math.random): number {
  const base = Math.min(30_000, 1_000 * 2 ** Math.min(attempt, 5))
  return Math.round(base * (0.75 + rand() * 0.5))
}

export interface SseOptions {
  path: string
  onMessage: (m: SseMessage) => void
  onStatus?: (connected: boolean) => void
  fetchImpl?: typeof fetch
  /** injectable for tests */
  schedule?: (fn: () => void, ms: number) => unknown
  rand?: () => number
  maxAttempts?: number
}

/** Opens a stream and keeps it alive until the returned `close()` is called. */
export function openSse(opts: SseOptions): () => void {
  const doFetch = opts.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a))
  const schedule = opts.schedule ?? ((fn, ms) => setTimeout(fn, ms))
  let closed = false
  let attempt = 0
  let lastId: string | undefined
  let ctrl: AbortController | null = null

  const run = async (): Promise<void> => {
    if (closed) return
    ctrl = new AbortController()
    try {
      const headers = buildHeaders({ headers: { accept: 'text/event-stream', ...(lastId ? { 'last-event-id': lastId } : {}) } })
      const res = await doFetch(buildUrl(opts.path), { headers, credentials: 'include', signal: ctrl.signal })
      if (!res.ok || !res.body) throw new Error(`sse ${res.status}`)
      attempt = 0
      opts.onStatus?.(true)
      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let buf = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        const { messages, rest } = parseSse(buf)
        buf = rest
        for (const m of messages) {
          if (m.id) lastId = m.id
          opts.onMessage(m)
        }
      }
    } catch {
      /* fall through to reconnect */
    }
    opts.onStatus?.(false)
    if (closed) return
    attempt += 1
    if (opts.maxAttempts !== undefined && attempt > opts.maxAttempts) return
    schedule(() => void run(), backoffMs(attempt, opts.rand))
  }
  void run()
  return () => {
    closed = true
    ctrl?.abort()
  }
}
