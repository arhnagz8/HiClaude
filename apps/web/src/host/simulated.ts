/**
 * Simulated Mini App host for demo / E2E: a stub `WebApp` object with observable state, so Mini App flows run in plain Chromium
 * (`/tg?host=telegram`, `/bale?host=bale`). The real adapter code (webapp.ts) wraps this stub — exactly what runs inside Telegram/Bale.
 * `window.__simHost` exposes the state for Playwright (`await page.evaluate(() => window.__simHost.pressMainButton())`).
 */
import type { ColorScheme, WebAppLike } from './types'

export interface SimState {
  backVisible: boolean
  mainVisible: boolean
  mainText: string
  mainEnabled: boolean
  mainProgress: boolean
  colorScheme: ColorScheme
  lastHaptic?: string
  closed: boolean
  ready: boolean
  openedLinks: string[]
}

export interface SimHost {
  app: WebAppLike
  state: SimState
  subscribe(cb: () => void): () => void
  pressBack(): void
  pressMain(): void
  setColorScheme(c: ColorScheme): void
}

export function createSimulatedWebApp(kind: 'telegram' | 'bale', init: { startParam?: string; colorScheme?: ColorScheme; userId?: number } = {}): SimHost {
  const listeners = new Set<() => void>()
  const eventCbs = new Map<string, Set<() => void>>()
  const backCbs = new Set<() => void>()
  const mainCbs = new Set<() => void>()
  const state: SimState = { backVisible: false, mainVisible: false, mainText: '', mainEnabled: true, mainProgress: false, colorScheme: init.colorScheme ?? 'light', closed: false, ready: false, openedLinks: [] }
  const notify = (): void => listeners.forEach((l) => l())
  const emit = (name: string): void => eventCbs.get(name)?.forEach((cb) => cb())

  const themeFor = (c: ColorScheme): Record<string, string> =>
    c === 'dark' ? { bg_color: '#0b0e14', text_color: '#eef1f6', button_color: '#9aa3ff', button_text_color: '#0e1030' } : { bg_color: '#f7f8fb', text_color: '#111827', button_color: '#4338ca', button_text_color: '#ffffff' }

  const app: WebAppLike = {
    // Not a real signature: the simulated API accepts `sim:<kind>:<userId>` (see mock backend / demo mode).
    initData: `sim:${kind}:${init.userId ?? 424242}`,
    initDataUnsafe: { start_param: init.startParam, user: { id: init.userId ?? 424242 } },
    platform: 'simulated',
    version: '8.0',
    get colorScheme() {
      return state.colorScheme
    },
    get themeParams() {
      return themeFor(state.colorScheme)
    },
    viewportHeight: 780,
    viewportStableHeight: 780,
    safeAreaInset: { top: 0, bottom: 0, left: 0, right: 0 },
    contentSafeAreaInset: { top: 0, bottom: 0, left: 0, right: 0 },
    ready() {
      state.ready = true
      notify()
    },
    expand() {},
    close() {
      state.closed = true
      notify()
    },
    onEvent(n, cb) {
      if (!eventCbs.has(n)) eventCbs.set(n, new Set())
      eventCbs.get(n)!.add(cb)
    },
    offEvent(n, cb) {
      eventCbs.get(n)?.delete(cb)
    },
    openLink(url) {
      state.openedLinks.push(url)
      notify()
    },
    openTelegramLink(url) {
      state.openedLinks.push(url)
      notify()
    },
    setHeaderColor() {},
    setBackgroundColor() {},
    disableVerticalSwipes() {},
    BackButton: {
      show() {
        state.backVisible = true
        notify()
      },
      hide() {
        state.backVisible = false
        notify()
      },
      onClick: (cb) => void backCbs.add(cb),
      offClick: (cb) => void backCbs.delete(cb),
    },
    MainButton: {
      setText(t) {
        state.mainText = t
        notify()
      },
      show() {
        state.mainVisible = true
        notify()
      },
      hide() {
        state.mainVisible = false
        notify()
      },
      enable() {
        state.mainEnabled = true
        notify()
      },
      disable() {
        state.mainEnabled = false
        notify()
      },
      showProgress() {
        state.mainProgress = true
        notify()
      },
      hideProgress() {
        state.mainProgress = false
        notify()
      },
      onClick: (cb) => void mainCbs.add(cb),
      offClick: (cb) => void mainCbs.delete(cb),
    },
    HapticFeedback: {
      impactOccurred(s) {
        state.lastHaptic = `impact:${s}`
        notify()
      },
      notificationOccurred(t) {
        state.lastHaptic = `notification:${t}`
        notify()
      },
      selectionChanged() {
        state.lastHaptic = 'selection'
        notify()
      },
    },
  }

  return {
    app,
    state,
    subscribe(cb) {
      listeners.add(cb)
      return () => void listeners.delete(cb)
    },
    pressBack: () => backCbs.forEach((cb) => cb()),
    pressMain: () => {
      if (state.mainEnabled) mainCbs.forEach((cb) => cb())
    },
    setColorScheme(c) {
      state.colorScheme = c
      emit('themeChanged')
      notify()
    },
  }
}
