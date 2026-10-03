import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../lib/cn'
import { IconButton } from './Button'
import { t } from '../copy'
import { useHostOptional } from './hostOptional'

const FOCUSABLE = 'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),[tabindex]:not([tabindex="-1"])'

export type DialogVariant = 'modal' | 'sheet' | 'auto'

interface Props {
  open: boolean
  onClose: () => void
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  /** 'sheet' = bottom sheet (always in Mini Apps); 'auto' = sheet on mobile widths, centred modal from sm: up */
  variant?: DialogVariant
  /** prevent closing by backdrop/Escape (e.g. while a request is in flight) */
  dismissible?: boolean
  size?: 'sm' | 'md' | 'lg'
}

/** Accessible modal dialog / bottom sheet: focus trap, Escape, backdrop click, scroll lock, focus return, background inert. */
export function Dialog({ open, onClose, title, description, children, footer, variant = 'auto', dismissible = true, size = 'md' }: Props) {
  const id = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null)
  const host = useHostOptional()
  const inMini = !!host?.host.isMiniApp
  const sheetOnly = variant === 'sheet' || inMini

  useEffect(() => {
    if (!open) return
    returnFocus.current = document.activeElement as HTMLElement | null
    const root = document.getElementById('root')
    root?.setAttribute('inert', '')
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const first = panelRef.current?.querySelector<HTMLElement>('[data-autofocus]') ?? panelRef.current?.querySelector<HTMLElement>(FOCUSABLE)
    ;(first ?? panelRef.current)?.focus()
    return () => {
      root?.removeAttribute('inert')
      document.body.style.overflow = prevOverflow
      returnFocus.current?.focus?.()
    }
  }, [open])

  if (!open) return null
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && dismissible) {
      e.stopPropagation()
      onClose()
    } else if (e.key === 'Tab') {
      const nodes = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter((n) => n.offsetParent !== null || n === document.activeElement)
      if (nodes.length === 0) return e.preventDefault()
      const first = nodes[0] as HTMLElement
      const last = nodes[nodes.length - 1] as HTMLElement
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
  }
  const widths = { sm: 'sm:max-w-sm', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl' }
  return createPortal(
    <div className={cn('fixed inset-0 z-[60] flex justify-center', variant === 'modal' && !inMini ? 'items-center p-4' : sheetOnly ? 'items-end' : 'items-end sm:items-center sm:p-4')} onKeyDown={onKeyDown} data-theme-scope>
      <div className="absolute inset-0 animate-fade-in bg-black/50" onClick={dismissible ? onClose : undefined} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-t`}
        aria-describedby={description ? `${id}-d` : undefined}
        tabIndex={-1}
        className={cn(
          'relative flex max-h-[92dvh] w-full flex-col bg-surface text-fg shadow-pop outline-none',
          variant === 'modal' && !inMini ? 'animate-pop-in rounded-xl' : sheetOnly ? 'animate-sheet-up rounded-t-xl pb-[var(--safe-bottom)]' : 'animate-sheet-up rounded-t-xl pb-[var(--safe-bottom)] sm:animate-pop-in sm:rounded-xl sm:pb-0',
          !sheetOnly && widths[size],
          sheetOnly && 'sm:max-w-xl',
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 id={`${id}-t`} className="text-lg font-bold">{title}</h2>
            {description ? <p id={`${id}-d`} className="mt-1 text-sm text-muted">{description}</p> : null}
          </div>
          {dismissible ? <IconButton icon="close" label={t('common.close')} size="sm" onClick={onClose} /> : null}
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  )
}

export const Modal = Dialog
export const Sheet = (p: Omit<Props, 'variant'>) => <Dialog {...p} variant="sheet" />
