/** Pure catalog validation helpers (amounts + customer inputs). */
import type { AmountSpec, Product, ProductInput } from '@hiclaude/contracts'
import { formatUsd, toLatinDigits } from '@hiclaude/contracts'

export interface ValidationIssue {
  field: string
  code: 'required' | 'invalid' | 'out_of_range' | 'not_allowed' | 'step'
  messageFa: string
}

/** null = valid. */
export function checkAmount(spec: AmountSpec, usdCents: number): ValidationIssue | null {
  const bad = (code: ValidationIssue['code'], messageFa: string): ValidationIssue => ({ field: 'amountUsdCents', code, messageFa })
  if (!Number.isSafeInteger(usdCents) || usdCents <= 0) return bad('invalid', 'مبلغ نامعتبر است.')
  switch (spec.kind) {
    case 'fixed':
      return usdCents === spec.fixedUsdCents ? null : bad('not_allowed', `مبلغ این محصول ثابت و برابر ${formatUsd(spec.fixedUsdCents ?? 0)} است.`)
    case 'options':
      return (spec.optionsUsdCents ?? []).includes(usdCents) ? null : bad('not_allowed', 'مبلغ انتخاب‌شده جزو گزینه‌های مجاز این محصول نیست.')
    case 'range': {
      const min = spec.minUsdCents ?? 1
      const max = spec.maxUsdCents ?? Number.MAX_SAFE_INTEGER
      if (usdCents < min) return bad('out_of_range', `حداقل مبلغ ${formatUsd(min)} است.`)
      if (usdCents > max) return bad('out_of_range', `حداکثر مبلغ ${formatUsd(max)} است.`)
      if (spec.stepUsdCents && (usdCents - min) % spec.stepUsdCents !== 0) return bad('step', `مبلغ باید مضربی از ${formatUsd(spec.stepUsdCents)} باشد.`)
      return null
    }
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const MAX_INPUT_LEN = 200

/** Validates raw customer inputs against the product definition; returns the sanitized inputs (known keys only, trimmed) and issues. */
export function checkInputs(product: Pick<Product, 'inputs'>, raw: Record<string, string>): { inputs: Record<string, string>; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = []
  const inputs: Record<string, string> = {}
  for (const def of product.inputs) {
    const value = (raw[def.key] ?? '').toString().trim()
    const issue = (code: ValidationIssue['code'], messageFa: string) => issues.push({ field: def.key, code, messageFa })
    if (value === '') {
      if (def.required) issue('required', `«${def.labelFa}» الزامی است.`)
      continue
    }
    if (value.length > MAX_INPUT_LEN) {
      issue('invalid', `«${def.labelFa}» بیش از حد طولانی است.`)
      continue
    }
    if (!validType(def, value)) {
      issue(def.type === 'select' ? 'not_allowed' : 'invalid', `«${def.labelFa}» معتبر نیست.`)
      continue
    }
    if (def.pattern) {
      let re: RegExp | undefined
      try {
        re = new RegExp(def.pattern)
      } catch {
        re = undefined // a broken pattern in data must not block sales; type checks still apply
      }
      if (re && !re.test(value)) {
        issue('invalid', def.helpFa ? `«${def.labelFa}» معتبر نیست: ${def.helpFa}` : `«${def.labelFa}» معتبر نیست.`)
        continue
      }
    }
    inputs[def.key] = value
  }
  return { inputs, issues }
}

function validType(def: ProductInput, value: string): boolean {
  switch (def.type) {
    case 'email':
      return EMAIL_RE.test(value)
    case 'number':
      return /^\d+(\.\d+)?$/.test(toLatinDigits(value))
    case 'select':
      return (def.options ?? []).some((o) => o.value === value)
    case 'card_ref':
      return /^[\w-]{3,64}$/.test(value)
    case 'text':
      return true
  }
}
