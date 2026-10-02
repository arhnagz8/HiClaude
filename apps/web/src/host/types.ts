/** Messenger host abstraction: the same pages run in a browser, a Telegram Mini App or a Bale Mini App. */
export type HostKind = 'web' | 'telegram' | 'bale'
export type ColorScheme = 'light' | 'dark'
export type HapticKind = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error' | 'selection'

export interface SafeArea {
  top: number
  bottom: number
  start: number
  end: number
}

export interface MainButtonConfig {
  text: string
  onClick: () => void
  disabled?: boolean
  loading?: boolean
}

export interface ShareInput {
  text: string
  url: string
}
export type ShareResult = 'shared' | 'copied' | 'failed'

export interface MessengerHost {
  readonly kind: HostKind
  /** true when running inside a Mini App webview (real or simulated) */
  readonly isMiniApp: boolean
  /** true when the WebApp object is our stub (demo / E2E) */
  readonly simulated: boolean
  /** true when a native bottom MainButton exists and should replace the page's primary CTA */
  readonly hasMainButton: boolean
  /** Tell the host the app is ready (hides the splash) and expand to full height. */
  ready(): void
  /** Signed init data string for POST /auth/messenger (empty when not in a Mini App). */
  initData(): string
  /** Deep-link payload (`startapp=`), e.g. «ref_ABC123». */
  startParam(): string | undefined
  colorScheme(): ColorScheme | undefined
  themeParams(): Record<string, string>
  safeArea(): SafeArea
  viewportHeight(): number | undefined
  /** Subscribe to host changes (theme / viewport / safe area). Returns an unsubscribe fn. */
  subscribe(cb: () => void): () => void
  showBackButton(onClick: () => void): () => void
  setMainButton(cfg: MainButtonConfig | null): void
  haptic(kind: HapticKind): void
  openLink(url: string, opts?: { external?: boolean }): void
  share(input: ShareInput): Promise<ShareResult>
  close(): void
}

/** Minimal shape of Telegram's `WebApp` object (Bale's WebApp mirrors it). Only what we use. */
export interface WebAppLike {
  initData: string
  initDataUnsafe?: { start_param?: string; user?: { id?: number } }
  platform?: string
  version?: string
  colorScheme?: ColorScheme
  themeParams?: Record<string, string>
  viewportHeight?: number
  viewportStableHeight?: number
  safeAreaInset?: { top: number; bottom: number; left: number; right: number }
  contentSafeAreaInset?: { top: number; bottom: number; left: number; right: number }
  ready(): void
  expand?(): void
  close?(): void
  onEvent?(name: string, cb: () => void): void
  offEvent?(name: string, cb: () => void): void
  openLink?(url: string, opts?: { try_instant_view?: boolean }): void
  openTelegramLink?(url: string): void
  setHeaderColor?(c: string): void
  setBackgroundColor?(c: string): void
  disableVerticalSwipes?(): void
  BackButton?: { show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void; isVisible?: boolean }
  MainButton?: {
    setText(t: string): void
    show(): void
    hide(): void
    enable(): void
    disable(): void
    showProgress?(leave?: boolean): void
    hideProgress?(): void
    onClick(cb: () => void): void
    offClick(cb: () => void): void
    isVisible?: boolean
    text?: string
  }
  HapticFeedback?: {
    impactOccurred(s: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void
    notificationOccurred(t: 'error' | 'success' | 'warning'): void
    selectionChanged(): void
  }
}

declare global {
  interface Window {
    Telegram?: { WebApp?: WebAppLike }
    Bale?: { WebApp?: WebAppLike }
    __simHost?: unknown
  }
}
