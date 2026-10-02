import type { HostKind, MessengerHost, WebAppLike } from './types'
import { createWebAppHost } from './webapp'
import { createNoneHost } from './none'
import { createSimulatedWebApp, type SimHost } from './simulated'

/** Which Mini App flavour the URL asks for: path prefix (/tg, /bale) wins, then ?host=. */
export function requestedHost(pathname: string, search: string): HostKind {
  if (/^\/tg(\/|$)/.test(pathname)) return 'telegram'
  if (/^\/bale(\/|$)/.test(pathname)) return 'bale'
  const q = new URLSearchParams(search).get('host')
  return q === 'telegram' || q === 'bale' ? q : 'web'
}

/** Base path of the current mount: '' | '/tg' | '/bale'. */
export function basePathOf(pathname: string): '' | '/tg' | '/bale' {
  if (/^\/tg(\/|$)/.test(pathname)) return '/tg'
  if (/^\/bale(\/|$)/.test(pathname)) return '/bale'
  return ''
}

export const HOST_SCRIPTS: Record<'telegram' | 'bale', string> = {
  telegram: 'https://telegram.org/js/telegram-web-app.js',
  // UNVERIFIED: Bale's published Mini App SDK URL; confirm in Bale's developer docs before go-live.
  bale: 'https://tapi.bale.ai/miniapp.js',
}

export function realWebApp(kind: 'telegram' | 'bale', win: Window = window): WebAppLike | undefined {
  const app = kind === 'telegram' ? win.Telegram?.WebApp : win.Bale?.WebApp ?? win.Telegram?.WebApp
  // Outside a Mini App the Telegram script still defines WebApp but with empty initData — treat that as "no host".
  return app && typeof app.initData === 'string' && app.initData !== '' ? app : undefined
}

export interface HostResolution {
  host: MessengerHost
  sim?: SimHost
}

/** Synchronous resolution (the script, if needed, is loaded by `loadHostScript` before this runs). */
export function resolveHost(win: Window = window): HostResolution {
  const { pathname, search } = win.location
  const kind = requestedHost(pathname, search)
  if (kind === 'web') return { host: createNoneHost() }
  const real = realWebApp(kind, win)
  if (real) return { host: createWebAppHost(kind, real) }
  const sp = new URLSearchParams(search)
  if (sp.get('host') === kind || sp.get('sim') === '1') {
    const sim = createSimulatedWebApp(kind, { startParam: sp.get('startapp') ?? sp.get('tgWebAppStartParam') ?? undefined, colorScheme: sp.get('scheme') === 'dark' ? 'dark' : 'light' })
    win.__simHost = sim
    return { host: createWebAppHost(kind, sim.app, { simulated: true }), sim }
  }
  // Mini App route opened in a normal browser: Mini App chrome, no native host features.
  return { host: { ...createNoneHost(), kind, isMiniApp: true } }
}

/** Loads the host SDK script (only on /tg or /bale, only when not already present and not simulated). Resolves when loaded or after `timeoutMs`. */
export function loadHostScript(win: Window = window, timeoutMs = 2500): Promise<void> {
  const { pathname, search } = win.location
  const kind = requestedHost(pathname, search)
  if (kind === 'web') return Promise.resolve()
  if (new URLSearchParams(search).get('host')) return Promise.resolve() // simulated
  if (realWebApp(kind, win)) return Promise.resolve()
  return new Promise((resolve) => {
    const s = win.document.createElement('script')
    s.src = HOST_SCRIPTS[kind]
    s.async = true
    const done = (): void => resolve()
    s.onload = done
    s.onerror = done
    win.document.head.appendChild(s)
    setTimeout(done, timeoutMs)
  })
}
