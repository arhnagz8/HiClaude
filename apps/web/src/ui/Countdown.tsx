import { useEffect, useRef } from 'react'
import { cn } from '../lib/cn'
import { Icon } from './Icon'
import { formatClock } from '../lib/format'
import { useServerNow } from './time'

interface Props {
  /** epoch ms the countdown ends (server time) */
  until: number
  /** accessible prefix, e.g. «مهلت قیمت» */
  label: string
  /** total window length in ms (for the progress bar); optional */
  total?: number
  onElapsed?: () => void
  /** warn (amber) under this many ms; danger under dangerMs */
  warnMs?: number
  dangerMs?: number
  className?: string
  compact?: boolean
  /** text to show when elapsed */
  elapsedText?: string
}

/** Server-synced countdown. Announces only at coarse milestones (screen readers must not be spammed every second). */
export function Countdown({ until, label, total, onElapsed, warnMs = 120_000, dangerMs = 30_000, className, compact, elapsedText }: Props) {
  const now = useServerNow(1000)
  const left = Math.max(0, until - now)
  const fired = useRef(false)
  useEffect(() => {
    fired.current = false
  }, [until])
  useEffect(() => {
    if (left <= 0 && !fired.current) {
      fired.current = true
      onElapsed?.()
    }
  }, [left, onElapsed])
  const tone = left <= 0 ? 'text-danger' : left <= dangerMs ? 'text-danger' : left <= warnMs ? 'text-warning' : 'text-fg'
  const pct = total ? Math.min(100, Math.max(0, (left / total) * 100)) : undefined
  // coarse live-region text: changes only when the minute changes or under 1 minute
  const coarse = left <= 0 ? (elapsedText ?? '') : `${label}: ${formatClock(left < 60_000 ? 30_000 : Math.ceil(left / 60_000) * 60_000)}`
  return (
    <div className={cn('inline-flex flex-col gap-1', className)}>
      <span className={cn('inline-flex items-center gap-1.5 font-bold num', tone, compact ? 'text-sm' : 'text-base')}>
        <Icon name="clock" size={compact ? 15 : 18} />
        <span aria-hidden>{left <= 0 && elapsedText ? elapsedText : formatClock(left)}</span>
        <span className="sr-only" role="timer" aria-live="off">{`${label}: ${formatClock(left)}`}</span>
      </span>
      {pct !== undefined ? (
        <span aria-hidden className="block h-1 w-full overflow-hidden rounded-full bg-surface-3">
          <span className={cn('block h-full rounded-full transition-[width] duration-1000 ease-linear', left <= dangerMs ? 'bg-danger' : left <= warnMs ? 'bg-warning' : 'bg-primary')} style={{ width: `${pct}%` }} />
        </span>
      ) : null}
      <span className="sr-only" aria-live="polite" role="status">{coarse}</span>
    </div>
  )
}
