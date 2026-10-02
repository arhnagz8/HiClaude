import type { ReactNode } from 'react'
import { cn } from '../lib/cn'
import { Icon, type IconName } from './Icon'
import { IconButton } from './Button'
import { t } from '../copy'

export type AlertTone = 'info' | 'success' | 'warning' | 'danger'
const TONE: Record<AlertTone, { box: string; icon: IconName }> = {
  info: { box: 'bg-info-soft border-info/30 text-fg [&_.ico]:text-info', icon: 'info' },
  success: { box: 'bg-success-soft border-success/30 text-fg [&_.ico]:text-success', icon: 'check-circle' },
  warning: { box: 'bg-warning-soft border-warning/40 text-fg [&_.ico]:text-warning', icon: 'warning' },
  danger: { box: 'bg-danger-soft border-danger/40 text-fg [&_.ico]:text-danger', icon: 'alert' },
}

interface Props {
  tone?: AlertTone
  title?: ReactNode
  children?: ReactNode
  action?: ReactNode
  onDismiss?: () => void
  className?: string
  /** banner = full-width strip at the top of the page */
  banner?: boolean
  /** announce assertively (errors); default: danger/warning → alert, others → status */
  live?: 'polite' | 'assertive' | 'off'
}

export function Alert({ tone = 'info', title, children, action, onDismiss, className, banner, live }: Props) {
  const role = live === 'off' ? undefined : live === 'assertive' || (!live && (tone === 'danger' || tone === 'warning')) ? 'alert' : 'status'
  return (
    <div role={role} className={cn('flex items-start gap-3 border p-3 text-sm leading-7', banner ? 'rounded-none border-x-0 px-4' : 'rounded-md', TONE[tone].box, className)}>
      <Icon name={TONE[tone].icon} size={20} className="ico mt-1" />
      <div className="min-w-0 flex-1">
        {title ? <p className="font-bold">{title}</p> : null}
        {children ? <div className={cn(title && 'text-muted')}>{children}</div> : null}
        {action ? <div className="mt-2">{action}</div> : null}
      </div>
      {onDismiss ? <IconButton icon="close" label={t('common.dismiss')} size="sm" onClick={onDismiss} /> : null}
    </div>
  )
}
