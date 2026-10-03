import { cn } from '../lib/cn'

export function ProgressBar({ value, max = 100, label, tone = 'primary', className }: { value: number; max?: number; label: string; tone?: 'primary' | 'success' | 'warning'; className?: string }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100))
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.round(value)} className={cn('h-2 w-full overflow-hidden rounded-full bg-surface-3', className)}>
      <div className={cn('h-full rounded-full transition-[width] duration-500', tone === 'success' ? 'bg-success' : tone === 'warning' ? 'bg-warning' : 'bg-primary')} style={{ width: `${pct}%` }} />
    </div>
  )
}
