/** Safe wrappers around localStorage / sessionStorage: both can throw (private mode, blocked site data) — the app must render without them. */
type Kind = 'local' | 'session'
function store(kind: Kind): Storage | null {
  try {
    const s = kind === 'local' ? window.localStorage : window.sessionStorage
    return s ?? null
  } catch {
    return null
  }
}
export function readStore(key: string, kind: Kind = 'local'): string | null {
  try {
    return store(kind)?.getItem(key) ?? null
  } catch {
    return null
  }
}
export function writeStore(key: string, value: string | null, kind: Kind = 'local'): void {
  try {
    const s = store(kind)
    if (!s) return
    if (value === null) s.removeItem(key)
    else s.setItem(key, value)
  } catch {
    /* ignore quota / security errors */
  }
}
export function readJson<T>(key: string, fallback: T, kind: Kind = 'local'): T {
  const raw = readStore(key, kind)
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}
export function writeJson(key: string, value: unknown, kind: Kind = 'local'): void {
  writeStore(key, JSON.stringify(value), kind)
}
