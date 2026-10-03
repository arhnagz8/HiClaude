import { useId, useState, type ReactNode } from 'react'
import { cn } from '../lib/cn'
import { Icon } from './Icon'

export interface AccordionItem {
  id: string
  title: ReactNode
  body: ReactNode
}

/** Disclosure list (FAQ). Buttons with aria-expanded; only one open unless `multiple`. */
export function Accordion({ items, multiple, className }: { items: AccordionItem[]; multiple?: boolean; className?: string }) {
  const uid = useId()
  const [open, setOpen] = useState<string[]>([])
  const toggle = (id: string) => setOpen((o) => (o.includes(id) ? o.filter((x) => x !== id) : multiple ? [...o, id] : [id]))
  return (
    <div className={cn('divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface', className)}>
      {items.map((it) => {
        const isOpen = open.includes(it.id)
        return (
          <div key={it.id}>
            <h3>
              <button type="button" aria-expanded={isOpen} aria-controls={`${uid}-${it.id}`} onClick={() => toggle(it.id)} className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-3 text-start text-[0.95rem] font-semibold hover:bg-surface-2">
                <span>{it.title}</span>
                <Icon name="chevron-down" size={18} className={cn('text-subtle transition-transform', isOpen && 'rotate-180')} />
              </button>
            </h3>
            <div id={`${uid}-${it.id}`} role="region" hidden={!isOpen} className="px-4 pb-4 text-sm leading-8 text-muted">
              {isOpen ? it.body : null}
            </div>
          </div>
        )
      })}
    </div>
  )
}
