import { useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import { resolveHost, basePathOf, type HostResolution } from './detect'
import type { HapticKind, MainButtonConfig, MessengerHost } from './types'
import { HostContextRef, type HostCtx } from './context'

const HostContext = HostContextRef

function applyHostVars(host: MessengerHost): void {
  const root = document.documentElement
  const sa = host.safeArea()
  const set = (name: string, px: number, env: string): void => root.style.setProperty(name, px > 0 ? `${px}px` : `env(${env}, 0px)`)
  set('--safe-top', sa.top, 'safe-area-inset-top')
  set('--safe-bottom', sa.bottom, 'safe-area-inset-bottom')
  set('--safe-start', sa.start, 'safe-area-inset-right')
  set('--safe-end', sa.end, 'safe-area-inset-left')
  const h = host.viewportHeight()
  if (h) root.style.setProperty('--app-h', `${h}px`)
}

export function HostProvider({ children, resolution }: { children: ReactNode; resolution?: HostResolution }) {
  const [res] = useState<HostResolution>(() => resolution ?? resolveHost())
  const base = typeof window === 'undefined' ? '' : basePathOf(window.location.pathname)
  useEffect(() => {
    res.host.ready()
    applyHostVars(res.host)
    return res.host.subscribe(() => applyHostVars(res.host))
  }, [res])
  const value = useMemo<HostCtx>(() => ({ host: res.host, sim: res.sim, base }), [res, base])
  return <HostContext.Provider value={value}>{children}</HostContext.Provider>
}

export function useHostContext(): HostCtx {
  const c = useContext(HostContext)
  if (!c) throw new Error('useHost must be used inside <HostProvider>')
  return c
}
export const useHost = (): MessengerHost => useHostContext().host
export const useBasePath = (): '' | '/tg' | '/bale' => useHostContext().base

/** Re-render when the host (theme / viewport) changes. */
export function useHostSnapshot(): { colorScheme: 'light' | 'dark' | undefined; viewportHeight: number | undefined } {
  const { host } = useHostContext()
  const cs = useSyncExternalStore((cb) => host.subscribe(cb), () => host.colorScheme())
  const vh = useSyncExternalStore((cb) => host.subscribe(cb), () => host.viewportHeight())
  return { colorScheme: cs, viewportHeight: vh }
}

/** Show the native BackButton while `enabled` (Mini App). Returns whether a native back button is active so the page can hide its own. */
export function useHostBackButton(onClick: () => void, enabled = true): boolean {
  const { host } = useHostContext()
  const active = enabled && host.isMiniApp
  useEffect(() => {
    if (!active) return
    return host.showBackButton(onClick)
  }, [host, active, onClick])
  return active && host.kind !== 'web'
}

/** Mirror the page's primary action into the host MainButton when it exists. Returns true when the native button handles it. */
export function useMainButton(cfg: (MainButtonConfig & { visible?: boolean }) | null): boolean {
  const { host } = useHostContext()
  const native = host.hasMainButton
  const text = cfg?.text
  const disabled = cfg?.disabled
  const loading = cfg?.loading
  const visible = cfg ? cfg.visible !== false : false
  const onClick = cfg?.onClick
  useEffect(() => {
    if (!native) return
    if (!visible || !text || !onClick) {
      host.setMainButton(null)
      return
    }
    host.setMainButton({ text, onClick, disabled, loading })
    return () => host.setMainButton(null)
  }, [host, native, visible, text, disabled, loading, onClick])
  return native && visible
}

export function useHaptic(): (k: HapticKind) => void {
  const host = useHost()
  return (k) => host.haptic(k)
}
