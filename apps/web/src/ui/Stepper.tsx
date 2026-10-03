import type { ReactNode } from 'react'
import { cn } from '../lib/cn'
import { Icon } from './Icon'
import { toPersianDigits } from '../lib/format'

export interface Step {
  id: string
  label: string
}

/** Horizontal progress stepper (checkout: انتخاب → پرداخت → دریافت). */
export function Stepper({ steps, current, label }: { steps: Step[]; current: number; label: string }) {
  return (
    <ol className="flex items-center gap-2" aria-label={label}>
      {steps.map((s, i) => {
        const state = i < current ? 'done' : i === current ? 'current' : 'todo'
        return (
          <li key={s.id} className="flex flex-1 items-center gap-2 last:flex-none" aria-current={state === 'current' ? 'step' : undefined}>
            <span
              className={cn(
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold',
                state === 'done' && 'border-success bg-success text-white dark:text-[#06210f]',
                state === 'current' && 'border-primary bg-primary text-on-primary',
                state === 'todo' && 'border-line-strong bg-surface text-subtle',
              )}
            >
              {state === 'done' ? <Icon name="check" size={14} /> : toPersianDigits(i + 1)}
            </span>
            <span className={cn('text-xs font-medium sm:text-sm', state === 'todo' ? 'text-subtle' : 'text-fg')}>{s.label}</span>
            {i < steps.length - 1 ? <span aria-hidden className={cn('h-px flex-1', i < current ? 'bg-success' : 'bg-line-strong')} /> : null}
          </li>
        )
      })}
    </ol>
  )
}

export interface TimelineItem {
  id: string
  title: ReactNode
  time?: ReactNode
  detail?: ReactNode
  state: 'done' | 'current' | 'todo' | 'failed'
}

/** Vertical timeline for order events. */
export function Timeline({ items, label }: { items: TimelineItem[]; label: string }) {
  return (
    <ol className="relative" aria-label={label}>
      {items.map((it, i) => (
        <li key={it.id} className="relative flex gap-3 pb-5 last:pb-0" aria-current={it.state === 'current' ? 'step' : undefined}>
          {i < items.length - 1 ? <span aria-hidden className={cn('absolute start-[0.8rem] top-7 bottom-0 w-px', it.state === 'done' ? 'bg-success/50' : 'bg-line-strong')} /> : null}
          <span
            className={cn(
              'relative z-[1] mt-0.5 flex h-[1.65rem] w-[1.65rem] shrink-0 items-center justify-center rounded-full border-2',
              it.state === 'done' && 'border-success bg-success text-white dark:text-[#06210f]',
              it.state === 'current' && 'border-primary bg-surface text-primary',
              it.state === 'failed' && 'border-danger bg-danger text-white dark:text-[#1a0505]',
              it.state === 'todo' && 'border-line-strong bg-surface text-subtle',
            )}
          >
            {it.state === 'done' ? <Icon name="check" size={13} /> : it.state === 'failed' ? <Icon name="close" size={13} /> : it.state === 'current' ? <span className="h-2 w-2 animate-pulse rounded-full bg-primary" /> : null}
          </span>
          <div className="min-w-0 flex-1">
            <p className={cn('text-sm font-semibold', it.state === 'todo' && 'text-subtle')}>{it.title}</p>
            {it.time ? <p className="text-xs text-subtle">{it.time}</p> : null}
            {it.detail ? <div className="mt-1 text-sm text-muted">{it.detail}</div> : null}
          </div>
        </li>
      ))}
    </ol>
  )
}
