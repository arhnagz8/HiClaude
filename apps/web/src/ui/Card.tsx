import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '../lib/cn'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padded?: boolean
  interactive?: boolean
  as?: 'div' | 'section' | 'article' | 'li'
}
export function Card({ padded = true, interactive, as: Tag = 'div', className, ...rest }: CardProps) {
  return <Tag className={cn('card', padded && 'p-4 sm:p-5', interactive && 'transition-shadow hover:shadow-pop focus-within:shadow-pop', className)} {...(rest as object)} />
}

export function CardHeader({ title, subtitle, action, icon }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="mb-3 flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        {icon ? <span className="mt-0.5 text-primary">{icon}</span> : null}
        <div className="min-w-0">
          <h2 className="text-base font-bold">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-sm text-muted">{subtitle}</p> : null}
        </div>
      </div>
      {action}
    </div>
  )
}

export function SectionTitle({ title, subtitle, action, id }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; id?: string }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        <h2 id={id} className="text-xl font-extrabold sm:text-2xl">{title}</h2>
        {subtitle ? <p className="mt-1 text-sm text-muted sm:text-base">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  )
}
