import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { cn } from '../lib/cn'
import { Icon, type IconName } from './Icon'
import { IconButton } from './Button'
import { t } from '../copy'

type ToastTone = 'success' | 'danger' | 'info' | 'warning'
interface ToastItem {
  id: number
  tone: ToastTone
  text: string
}
interface ToastApi {
  show: (text: string, tone?: ToastTone, ms?: number) => void
  success: (text: string) => void
  error: (text: string) => void
  info: (text: string) => void
}

const Ctx = createContext<ToastApi | null>(null)
const ICON: Record<ToastTone, IconName> = { success: 'check-circle', danger: 'alert', info: 'info', warning: 'warning' }
const TONE: Record<ToastTone, string> = { success: '[&_.ico]:text-success', danger: '[&_.ico]:text-danger', info: '[&_.ico]:text-info', warning: '[&_.ico]:text-warning' }

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const seq = useRef(0)
  const dismiss = useCallback((id: number) => setItems((l) => l.filter((x) => x.id !== id)), [])
  const show = useCallback(
    (text: string, tone: ToastTone = 'info', ms = 4500) => {
      const id = ++seq.current
      setItems((l) => [...l.slice(-3), { id, tone, text }])
      if (ms > 0) setTimeout(() => dismiss(id), ms)
    },
    [dismiss],
  )
  const api = useMemo<ToastApi>(() => ({ show, success: (x) => show(x, 'success'), error: (x) => show(x, 'danger', 6500), info: (x) => show(x, 'info') }), [show])
  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--bottom-nav-h)+var(--safe-bottom)+0.75rem)] z-[70] flex flex-col items-center gap-2 px-4 sm:bottom-6" role="region" aria-label={t('common.dismiss')}>
        <div aria-live="polite" aria-atomic="false" className="flex w-full max-w-md flex-col gap-2">
          {items.map((it) => (
            <div key={it.id} className={cn('pointer-events-auto flex animate-pop-in items-start gap-3 rounded-md border border-line bg-surface p-3 text-sm shadow-pop', TONE[it.tone])} role={it.tone === 'danger' ? 'alert' : 'status'}>
              <Icon name={ICON[it.tone]} className="ico mt-1" />
              <p className="flex-1 leading-7 text-fg">{it.text}</p>
              <IconButton icon="close" label={t('common.dismiss')} size="sm" onClick={() => dismiss(it.id)} />
            </div>
          ))}
        </div>
      </div>
    </Ctx.Provider>
  )
}

const NOOP: ToastApi = { show: () => undefined, success: () => undefined, error: () => undefined, info: () => undefined }
export const useToast = (): ToastApi => useContext(Ctx) ?? NOOP
