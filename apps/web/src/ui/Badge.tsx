import type { ReactNode } from 'react'
import type { RiskLabel } from '@hiclaude/contracts'
import { cn } from '../lib/cn'
import { Icon, type IconName } from './Icon'
import { t } from '../copy'

export type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info'

const TONE: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-muted border-line',
  primary: 'bg-primary-soft text-primary border-primary/20',
  success: 'bg-success-soft text-success border-success/25',
  warning: 'bg-warning-soft text-warning border-warning/30',
  danger: 'bg-danger-soft text-danger border-danger/30',
  info: 'bg-info-soft text-info border-info/25',
}

export function Badge({ tone = 'neutral', icon, children, className }: { tone?: Tone; icon?: IconName; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold', TONE[tone], className)}>
      {icon ? <Icon name={icon} size={13} /> : null}
      {children}
    </span>
  )
}

const RISK_TONE: Record<RiskLabel, Tone> = { low: 'success', medium: 'warning', high: 'danger' }
const RISK_ICON: Record<RiskLabel, IconName> = { low: 'shield', medium: 'info', high: 'warning' }

/** Mandatory risk label (CLAUDE.md §3.2). Colour is never the only signal: icon + text. */
export function RiskBadge({ level, className }: { level: RiskLabel; className?: string }) {
  return (
    <Badge tone={RISK_TONE[level]} icon={RISK_ICON[level]} className={className}>
      {t(`risk.${level}`)}
    </Badge>
  )
}
