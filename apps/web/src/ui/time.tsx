import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

/**
 * Server-aligned clock. `config.now` from /public/config calibrates `offset`, so countdowns (price lock, pay window) follow the SERVER's clock
 * even when the phone's clock is wrong — and in demo mode where the world runs on a virtual clock.
 */
interface TimeCtx {
  offsetMs: number
  setServerNow: (serverNowMs: number) => void
  now: () => number
}
const Ctx = createContext<TimeCtx | null>(null)

export function TimeProvider({ children, nowFn }: { children: ReactNode; nowFn?: () => number }) {
  const offset = useRef(0)
  const wall = nowFn ?? Date.now
  const value = useMemo<TimeCtx>(
    () => ({
      get offsetMs() {
        return offset.current
      },
      setServerNow: (s) => {
        offset.current = s - wall()
      },
      now: () => wall() + offset.current,
    }),
    [wall],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

const FALLBACK: TimeCtx = { offsetMs: 0, setServerNow: () => undefined, now: () => Date.now() }
export const useTimeCtx = (): TimeCtx => useContext(Ctx) ?? FALLBACK

/** Current server time, re-rendering every `intervalMs` (pass 0 for no ticking). */
export function useServerNow(intervalMs = 1000): number {
  const ctx = useTimeCtx()
  const [now, setNow] = useState(() => ctx.now())
  useEffect(() => {
    setNow(ctx.now())
    if (intervalMs <= 0) return
    const id = setInterval(() => setNow(ctx.now()), intervalMs)
    return () => clearInterval(id)
  }, [ctx, intervalMs])
  return now
}
