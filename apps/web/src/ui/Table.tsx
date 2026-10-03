import type { ReactNode } from 'react'
import { cn } from '../lib/cn'

export interface Column<T> {
  key: string
  header: string
  cell: (row: T) => ReactNode
  /** hide this column's label in the stacked mobile layout (e.g. actions) */
  hideLabelOnMobile?: boolean
  align?: 'start' | 'end'
  className?: string
}

interface Props<T> {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string
  caption: string
  onRowClick?: (row: T) => void
  className?: string
}

/** Real <table> on ≥ md; each row becomes a labelled card on small screens (no horizontal scrolling). */
export function Table<T>({ columns, rows, rowKey, caption, onRowClick, className }: Props<T>) {
  return (
    <div className={className}>
      <table className="hidden w-full border-collapse text-sm md:table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-line text-muted">
            {columns.map((c) => (
              <th key={c.key} scope="col" className={cn('px-3 py-2 font-semibold', c.align === 'end' ? 'text-end' : 'text-start')}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={rowKey(r)} className={cn('border-b border-line last:border-0', onRowClick && 'cursor-pointer hover:bg-surface-2')} onClick={onRowClick ? () => onRowClick(r) : undefined}>
              {columns.map((c) => (
                <td key={c.key} className={cn('px-3 py-3 align-middle', c.align === 'end' ? 'text-end' : 'text-start', c.className)}>
                  {c.cell(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="space-y-3 md:hidden" aria-label={caption}>
        {rows.map((r) => (
          <li key={rowKey(r)} className={cn('card p-3', onRowClick && 'cursor-pointer')} onClick={onRowClick ? () => onRowClick(r) : undefined}>
            <dl className="space-y-1.5 text-sm">
              {columns.map((c) => (
                <div key={c.key} className="flex items-center justify-between gap-3">
                  {c.hideLabelOnMobile ? null : <dt className="text-muted">{c.header}</dt>}
                  <dd className={cn('min-w-0', c.hideLabelOnMobile && 'w-full')}>{c.cell(r)}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </div>
  )
}
