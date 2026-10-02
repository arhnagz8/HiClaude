import { cn } from '../lib/cn'
import { t } from '../copy'

export function Spinner({ size = 18, className, label }: { size?: number; className?: string; label?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={cn('animate-spin', className)} role="status" aria-label={label ?? t('common.loading')}>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="3" opacity=".25" />
      <path d="M21 12a9 9 0 00-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}
