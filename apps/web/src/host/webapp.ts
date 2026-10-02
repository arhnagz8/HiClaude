/** Adapter for Telegram-style WebApp objects (Telegram's real one, Bale's mirror, and our simulated stub). */
import type { ColorScheme, HapticKind, MainButtonConfig, MessengerHost, SafeArea, ShareInput, ShareResult, WebAppLike } from './types'
import { copyText } from '../lib/clipboard'

const EVENTS = ['themeChanged', 'viewportChanged', 'safeAreaChanged', 'contentSafeAreaChanged']

export function createWebAppHost(kind: 'telegram' | 'bale', app: WebAppLike, opts: { simulated?: boolean } = {}): MessengerHost {
  let mainHandler: (() => void) | null = null
  const hasMain = !!app.MainButton

  const clearMain = (): void => {
    if (!app.MainButton) return
    if (mainHandler) app.MainButton.offClick(mainHandler)
    mainHandler = null
    app.MainButton.hideProgress?.()
    app.MainButton.hide()
  }

  return {
    kind,
    isMiniApp: true,
    simulated: !!opts.simulated,
    hasMainButton: hasMain,
    ready() {
      try {
        app.ready()
        app.expand?.()
        app.disableVerticalSwipes?.()
      } catch {
        /* host quirks must never break the app */
      }
    },
    initData: () => app.initData ?? '',
    startParam: () => app.initDataUnsafe?.start_param || undefined,
    colorScheme: (): ColorScheme | undefined => (app.colorScheme === 'dark' || app.colorScheme === 'light' ? app.colorScheme : undefined),
    themeParams: () => ({ ...(app.themeParams ?? {}) }),
    safeArea(): SafeArea {
      const a = app.safeAreaInset ?? { top: 0, bottom: 0, left: 0, right: 0 }
      const c = app.contentSafeAreaInset ?? { top: 0, bottom: 0, left: 0, right: 0 }
      // RTL: start = right edge. Content inset (under the host's own header) adds to the top.
      return { top: a.top + c.top, bottom: a.bottom + c.bottom, start: a.right + c.right, end: a.left + c.left }
    },
    viewportHeight: () => app.viewportStableHeight ?? app.viewportHeight,
    subscribe(cb) {
      if (!app.onEvent) return () => undefined
      EVENTS.forEach((e) => app.onEvent?.(e, cb))
      return () => EVENTS.forEach((e) => app.offEvent?.(e, cb))
    },
    showBackButton(onClick) {
      const b = app.BackButton
      if (!b) return () => undefined
      b.onClick(onClick)
      b.show()
      return () => {
        b.offClick(onClick)
        b.hide()
      }
    },
    setMainButton(cfg: MainButtonConfig | null) {
      const mb = app.MainButton
      if (!mb) return
      if (!cfg) return clearMain()
      if (mainHandler) mb.offClick(mainHandler)
      mainHandler = cfg.onClick
      mb.onClick(mainHandler)
      mb.setText(cfg.text)
      if (cfg.disabled || cfg.loading) mb.disable()
      else mb.enable()
      if (cfg.loading) mb.showProgress?.(true)
      else mb.hideProgress?.()
      mb.show()
    },
    haptic(k: HapticKind) {
      const h = app.HapticFeedback
      if (!h) return
      try {
        if (k === 'success' || k === 'warning' || k === 'error') h.notificationOccurred(k)
        else if (k === 'selection') h.selectionChanged()
        else h.impactOccurred(k)
      } catch {
        /* ignore */
      }
    },
    openLink(url, o) {
      if (!o?.external && /^https?:\/\/(t\.me|telegram\.me)\//i.test(url) && app.openTelegramLink) return app.openTelegramLink(url)
      if (app.openLink) return app.openLink(url)
      window.open(url, '_blank', 'noopener')
    },
    async share(input: ShareInput): Promise<ShareResult> {
      if (kind === 'telegram' && app.openTelegramLink) {
        app.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(input.url)}&text=${encodeURIComponent(input.text)}`)
        return 'shared'
      }
      return fallbackShare(input)
    },
    close() {
      app.close?.()
    },
  }
}

/** Web Share API when available, else clipboard. */
export async function fallbackShare(input: ShareInput): Promise<ShareResult> {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      await navigator.share({ text: input.text, url: input.url })
      return 'shared'
    }
  } catch (e) {
    if ((e as { name?: string }).name === 'AbortError') return 'failed'
  }
  return (await copyText(`${input.text}\n${input.url}`)) ? 'copied' : 'failed'
}
