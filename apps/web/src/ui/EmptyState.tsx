import type { ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

export function EmptyState({ icon = 'info', title, body, action }: { icon?: IconName; title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-line-strong bg-surface px-6 py-12 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-soft text-primary">
        <Icon name={icon} size={26} />
      </span>
      <h2 className="text-lg font-bold">{title}</h2>
      {body ? <p className="max-w-md text-sm text-muted">{body}</p> : null}
      {action}
    </div>
  )
}
