import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { cn } from '../lib/cn'

export interface SegmentOption<T extends string> {
  value: T
  label: ReactNode
  /** secondary line (e.g. price premium) */
  sub?: ReactNode
  disabled?: boolean
}

interface Props<T extends string> {
  value: T
  onChange: (v: T) => void
  options: SegmentOption<T>[]
  label: string
  /** visually hide the group label */
  hideLabel?: boolean
  /** stack options vertically on narrow screens */
  stackOnMobile?: boolean
  className?: string
  columns?: number
}

/** Single-choice radio group rendered as segments / cards. Arrow keys move & select (WAI-ARIA radiogroup). */
export function Segmented<T extends string>({ value, onChange, options, label, hideLabel, stackOnMobile, className, columns }: Props<T>) {
  const id = useId()
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const enabled = options.filter((o) => !o.disabled)
  const move = (dir: 1 | -1) => {
    const idx = enabled.findIndex((o) => o.value === value)
    const next = enabled[(idx + dir + enabled.length) % enabled.length]
    if (next) {
      onChange(next.value)
      refs.current[options.indexOf(next)]?.focus()
    }
  }
  const onKey = (e: KeyboardEvent) => {
    // RTL: ArrowLeft goes to the NEXT item visually, ArrowRight to the previous — we follow DOM order which is reversed by dir=rtl.
    const rtl = getComputedStyle(e.currentTarget as Element).direction === 'rtl'
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault()
      move(e.key === 'ArrowRight' && rtl ? -1 : 1)
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault()
      move(e.key === 'ArrowLeft' && rtl ? 1 : -1)
    }
  }
  return (
    <div role="radiogroup" aria-labelledby={`${id}-l`} className={className}>
      <span id={`${id}-l`} className={cn('mb-2 block text-sm font-medium', hideLabel && 'sr-only')}>{label}</span>
      <div className={cn('grid gap-2', stackOnMobile ? 'grid-cols-1 sm:grid-flow-col sm:auto-cols-fr' : 'grid-flow-col auto-cols-fr')} style={columns ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gridAutoFlow: 'row' } : undefined} onKeyDown={onKey}>
        {options.map((o, i) => {
          const checked = o.value === value
          return (
            <button
              key={o.value}
              ref={(el) => {
                refs.current[i] = el
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              disabled={o.disabled}
              tabIndex={checked || (!enabled.some((x) => x.value === value) && i === options.findIndex((x) => !x.disabled)) ? 0 : -1}
              onClick={() => onChange(o.value)}
              className={cn(
                'min-h-11 rounded-md border px-3 py-2 text-center text-sm font-medium transition-colors disabled:opacity-45 disabled:cursor-not-allowed',
                checked ? 'border-primary bg-primary-soft text-primary ring-1 ring-primary' : 'border-line-strong bg-surface text-fg hover:bg-surface-2',
              )}
            >
              <span className="block">{o.label}</span>
              {o.sub ? <span className="mt-0.5 block text-xs font-normal text-muted">{o.sub}</span> : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}
