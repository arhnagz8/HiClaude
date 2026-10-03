import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { readStore, writeStore } from '../lib/storage'

export type ThemeMode = 'light' | 'dark' | 'system'
interface ThemeCtx {
  mode: ThemeMode
  /** the scheme actually applied */
  scheme: 'light' | 'dark'
  setMode: (m: ThemeMode) => void
  toggle: () => void
}
const Ctx = createContext<ThemeCtx | null>(null)
const KEY = 'hc.theme'

function systemDark(): boolean {
  try {
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
  } catch {
    return false
  }
}

export function ThemeProvider({ children, hostScheme }: { children: ReactNode; /** colour scheme dictated by the Mini App host (used while mode = system) */ hostScheme?: 'light' | 'dark' }) {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    const v = readStore(KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  })
  const [sysDark, setSysDark] = useState(systemDark)
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!mq) return
    const on = () => setSysDark(mq.matches)
    mq.addEventListener?.('change', on)
    return () => mq.removeEventListener?.('change', on)
  }, [])
  const scheme: 'light' | 'dark' = mode === 'system' ? (hostScheme ?? (sysDark ? 'dark' : 'light')) : mode
  useEffect(() => {
    const root = document.documentElement
    if (mode === 'system' && !hostScheme) root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', scheme)
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', scheme === 'dark' ? '#0b0e14' : '#4338ca'))
  }, [mode, scheme, hostScheme])
  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m)
    writeStore(KEY, m === 'system' ? null : m)
  }, [])
  const value = useMemo<ThemeCtx>(() => ({ mode, scheme, setMode, toggle: () => setMode(scheme === 'dark' ? 'light' : 'dark') }), [mode, scheme, setMode])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useTheme(): ThemeCtx {
  return useContext(Ctx) ?? { mode: 'system', scheme: 'light', setMode: () => undefined, toggle: () => undefined }
}
