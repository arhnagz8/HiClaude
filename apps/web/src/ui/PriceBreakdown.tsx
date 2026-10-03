import { useId, useState } from 'react'
import type { QuoteMethodDto } from '@hiclaude/contracts'
import { cn } from '../lib/cn'
import { reconcileLines } from '../lib/quote'
import { formatIrt, formatNumberFa, formatUsdtExact } from '../lib/format'
import { Icon } from './Icon'
import { t } from '../copy'

interface Props {
  method: QuoteMethodDto
  defaultOpen?: boolean
  className?: string
  /** highlight the total when it just changed */
  changed?: boolean
}

/** Itemised price: every line the server sends, plus an explicit balancing line if hidden internals made the visible lines not add up to the total. */
export function PriceBreakdown({ method, defaultOpen = false, className, changed }: Props) {
  const [open, setOpen] = useState(defaultOpen)
  const id = useId()
  const { lines, total, derivedDiff } = reconcileLines(method)
  const isUsdt = method.currency === 'USDT'
  return (
    <div className={cn('rounded-lg border border-line bg-surface', className)} data-testid="price-breakdown">
      <div className="flex items-end justify-between gap-3 p-4">
        <div>
          <p className="text-sm text-muted">{t('quote.payable')}</p>
          <p className={cn('mt-0.5 text-2xl font-extrabold num', changed && 'text-primary')} data-testid="price-total">
            {isUsdt && method.totalMicroUsdt !== undefined ? formatUsdtExact(method.totalMicroUsdt) : formatIrt(method.totalIrt ?? total)}
          </p>
          {isUsdt && method.totalIrt !== undefined ? <p className="mt-0.5 text-xs text-subtle">{t('quote.irtEquivalent', { amount: formatIrt(method.totalIrt) })}</p> : null}
        </div>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((o) => !o)}
          className="inline-flex min-h-10 items-center gap-1 rounded-md px-2 text-sm font-semibold text-primary hover:bg-primary-soft"
        >
          {open ? t('quote.hideBreakdown') : t('quote.showBreakdown')}
          <Icon name={open ? 'chevron-up' : 'chevron-down'} size={16} />
        </button>
      </div>
      <div id={id} hidden={!open}>
        {open ? (
          <div className="border-t border-line px-4 py-3">
            <dl className="space-y-2 text-sm">
              {lines.map((l) => (
                <div key={`${l.code}-${l.labelFa}`} className="flex items-baseline justify-between gap-3" data-line={l.code}>
                  <dt className="text-muted">{l.labelFa}</dt>
                  <dd className={cn('font-medium num', l.amountIrt < 0 && 'text-success')}>{l.amountIrt < 0 ? `−${formatNumberFa(-l.amountIrt)}` : formatNumberFa(l.amountIrt)}</dd>
                </div>
              ))}
              <div className="flex items-baseline justify-between gap-3 border-t border-dashed border-line-strong pt-2 font-bold">
                <dt>{t('quote.totalIrt')}</dt>
                <dd className="num">{formatIrt(total)}</dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-subtle">
              {t('quote.effectiveRate', { rate: formatIrt(Math.round(method.effectiveRateIrtPerUsd)) })}
              {derivedDiff !== 0 ? ` — ${t('quote.reconcileNote')}` : ''}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  )
}
