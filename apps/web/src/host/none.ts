/** Plain browser host: no native chrome; haptics via Vibration API, share via Web Share / clipboard. */
import type { HapticKind, MessengerHost } from './types'
import { fallbackShare } from './webapp'

const VIBRATE: Record<HapticKind, number> = { light: 8, medium: 14, heavy: 24, success: 12, warning: 20, error: 30, selection: 4 }

export function createNoneHost(): MessengerHost {
  return {
    kind: 'web',
    isMiniApp: false,
    simulated: false,
    hasMainButton: false,
    ready: () => undefined,
    initData: () => '',
    startParam: () => undefined,
    colorScheme: () => undefined,
    themeParams: () => ({}),
    safeArea: () => ({ top: 0, bottom: 0, start: 0, end: 0 }),
    viewportHeight: () => undefined,
    subscribe: () => () => undefined,
    showBackButton: () => () => undefined,
    setMainButton: () => undefined,
    haptic(k) {
      try {
        navigator.vibrate?.(VIBRATE[k])
      } catch {
        /* unsupported */
      }
    },
    openLink(url, o) {
      if (o?.external === false && url.startsWith('/')) window.location.assign(url)
      else window.open(url, '_blank', 'noopener,noreferrer')
    },
    share: fallbackShare,
    close: () => undefined,
  }
}
