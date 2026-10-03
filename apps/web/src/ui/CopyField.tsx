import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '../lib/cn'
import { copyText } from '../lib/clipboard'
import { Icon } from './Icon'
import { t } from '../copy'
import { useToast } from './Toast'

interface Props {
  label: string
  /** text shown */
  value: string
  /** text copied (defaults to value) — e.g. plain Latin digits while the display uses Persian digits / separators */
  copyValue?: string
  /** render value LTR (card numbers, addresses, memos) */
  ltr?: boolean
  emphasis?: boolean
  hint?: ReactNode
  className?: string
  mono?: boolean
}

/** Read-only value with a copy button and visible + announced feedback. */
export function CopyField({ label, value, copyValue, ltr, emphasis, hint, className, mono }: Props) {
  const [done, setDone] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const toast = useToast()
  useEffect(() => () => clearTimeout(timer.current), [])
  const onCopy = async () => {
    const ok = await copyText(copyValue ?? value)
    if (ok) {
      setDone(true)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setDone(false), 2000)
    } else toast.error(t('common.copyFailed'))
  }
  return (
    <div className={cn('rounded-md border border-line bg-surface-2 p-3', className)}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted">{label}</p>
          <p className={cn('mt-0.5 break-all font-semibold', ltr && 'ltr', mono && 'font-mono', emphasis ? 'text-lg sm:text-xl' : 'text-base')} data-testid="copy-value">
            {value}
          </p>
        </div>
        <button
          type="button"
          onClick={onCopy}
          aria-label={`${t('common.copy')}: ${label}`}
          className={cn('inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-md border px-3 text-sm font-semibold transition-colors', done ? 'border-success/40 bg-success-soft text-success' : 'border-line-strong bg-surface text-fg hover:bg-surface-3')}
        >
          <Icon name={done ? 'check' : 'copy'} size={16} />
          <span>{done ? t('common.copied') : t('common.copy')}</span>
        </button>
      </div>
      {hint ? <p className="mt-2 text-xs text-muted">{hint}</p> : null}
      <span className="sr-only" role="status" aria-live="polite">{done ? t('common.copied') : ''}</span>
    </div>
  )
}
