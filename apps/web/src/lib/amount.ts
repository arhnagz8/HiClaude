/** Amount handling per product AmountSpec (fixed | options | range). Pure + unit-tested. */
import type { AmountSpec } from '@hiclaude/contracts'
import { t } from '../copy'
import { formatUsdCents } from './format'

export interface AmountCheck {
  ok: boolean
  error?: string
}

export function amountOptions(spec: AmountSpec): number[] {
  if (spec.kind === 'fixed') return spec.fixedUsdCents ? [spec.fixedUsdCents] : []
  if (spec.kind === 'options') return [...(spec.optionsUsdCents ?? [])].sort((a, b) => a - b)
  return []
}

/** The amount pre-selected when the product page opens. */
export function defaultAmount(spec: AmountSpec): number | undefined {
  if (spec.kind === 'fixed') return spec.fixedUsdCents
  if (spec.kind === 'options') {
    const opts = amountOptions(spec)
    return opts.length ? (opts[Math.min(1, opts.length - 1)] as number) : undefined
  }
  if (spec.kind === 'range') {
    const min = spec.minUsdCents ?? 100
    const max = spec.maxUsdCents ?? min
    // a typical first purchase: ~2× min snapped to the step, never beyond max
    const step = spec.stepUsdCents ?? 100
    const guess = Math.min(max, Math.max(min, Math.round((min * 2) / step) * step))
    return guess
  }
  return undefined
}

export function validateAmount(spec: AmountSpec, cents: number | undefined): AmountCheck {
  if (cents === undefined || !Number.isFinite(cents) || !Number.isInteger(cents) || cents <= 0) {
    return { ok: false, error: t('common.validation.amountInvalid') }
  }
  switch (spec.kind) {
    case 'fixed':
      return cents === spec.fixedUsdCents ? { ok: true } : { ok: false, error: t('common.validation.amountOption') }
    case 'options':
      return (spec.optionsUsdCents ?? []).includes(cents) ? { ok: true } : { ok: false, error: t('common.validation.amountOption') }
    case 'range': {
      const { minUsdCents: min, maxUsdCents: max, stepUsdCents: step } = spec
      if (min !== undefined && cents < min) return { ok: false, error: t('common.validation.amountMin', { min: formatUsdCents(min) }) }
      if (max !== undefined && cents > max) return { ok: false, error: t('common.validation.amountMax', { max: formatUsdCents(max) }) }
      if (step && step > 0 && (cents - (min ?? 0)) % step !== 0) return { ok: false, error: t('common.validation.amountStep', { step: formatUsdCents(step) }) }
      return { ok: true }
    }
    default:
      return { ok: false, error: t('common.validation.amountInvalid') }
  }
}

/** Convert a typed USD number (e.g. 25 or 25.5) to cents, rounding to the nearest cent. */
export function usdToCentsSafe(usd: number): number | undefined {
  if (!Number.isFinite(usd) || usd <= 0) return undefined
  return Math.round(usd * 100)
}

/** Range hint text for the helper line under the input. */
export function rangeHint(spec: AmountSpec): string {
  if (spec.kind !== 'range') return ''
  if (spec.minUsdCents === undefined || spec.maxUsdCents === undefined) return ''
  return t('common.rangeHint', { min: formatUsdCents(spec.minUsdCents), max: formatUsdCents(spec.maxUsdCents) })
}
