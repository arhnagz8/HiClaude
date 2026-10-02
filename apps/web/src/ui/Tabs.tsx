import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { cn } from '../lib/cn'

export interface TabItem {
  id: string
  label: ReactNode
  panel: ReactNode
  badge?: ReactNode
}

interface Props {
  items: TabItem[]
  label: string
  value?: string
  onValueChange?: (id: string) => void
  defaultValue?: string
  className?: string
}

/** WAI-ARIA tabs with roving tabindex; works controlled or uncontrolled. */
export function Tabs({ items, label, value, onValueChange, defaultValue, className }: Props) {
  const uid = useId()
  const [inner, setInner] = useState(defaultValue ?? items[0]?.id ?? '')
  const current = value ?? inner
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const select = (id: string, focusIdx?: number) => {
    setInner(id)
    onValueChange?.(id)
    if (focusIdx !== undefined) refs.current[focusIdx]?.focus()
  }
  const onKey = (e: KeyboardEvent) => {
    const idx = items.findIndex((i) => i.id === current)
    const rtl = getComputedStyle(e.currentTarget as Element).direction === 'rtl'
    let next = idx
    if (e.key === 'ArrowRight') next = rtl ? idx - 1 : idx + 1
    else if (e.key === 'ArrowLeft') next = rtl ? idx + 1 : idx - 1
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = items.length - 1
    else return
    e.preventDefault()
    next = (next + items.length) % items.length
    select((items[next] as TabItem).id, next)
  }
  return (
    <div className={className}>
      <div role="tablist" aria-label={label} onKeyDown={onKey} className="flex gap-1 overflow-x-auto border-b border-line">
        {items.map((it, i) => {
          const sel = it.id === current
          return (
            <button
              key={it.id}
              ref={(el) => {
                refs.current[i] = el
              }}
              role="tab"
              id={`${uid}-t-${it.id}`}
              aria-selected={sel}
              aria-controls={`${uid}-p-${it.id}`}
              tabIndex={sel ? 0 : -1}
              type="button"
              onClick={() => select(it.id)}
              className={cn('relative -mb-px flex min-h-11 items-center gap-2 whitespace-nowrap border-b-2 px-4 text-sm font-semibold transition-colors', sel ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-fg')}
            >
              {it.label}
              {it.badge}
            </button>
          )
        })}
      </div>
      {items.map((it) => (
        <div key={it.id} role="tabpanel" id={`${uid}-p-${it.id}`} aria-labelledby={`${uid}-t-${it.id}`} hidden={it.id !== current} tabIndex={0} className="pt-4">
          {it.id === current ? it.panel : null}
        </div>
      ))}
    </div>
  )
}
