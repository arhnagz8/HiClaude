import { forwardRef, useEffect, useId, useRef, type ChangeEvent, type ClipboardEvent, type InputHTMLAttributes, type KeyboardEvent, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { cn } from '../lib/cn'
import { formatNumberFa, toLatinDigits, toPersianDigits, parseNumberInput } from '../lib/format'
import { Icon } from './Icon'
import { t } from '../copy'

// ───────────────────────── Field wrapper ─────────────────────────
export interface FieldProps {
  label?: ReactNode
  hint?: ReactNode
  error?: string | null
  required?: boolean
  optional?: boolean
  children: (a: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode
  className?: string
}

/** Label + control + hint/error with correct aria wiring. */
export function Field({ label, hint, error, required, optional, children, className }: FieldProps) {
  const id = useId()
  const hintId = hint ? `${id}-hint` : undefined
  const errId = error ? `${id}-err` : undefined
  const describedBy = [hintId, errId].filter(Boolean).join(' ') || undefined
  return (
    <div className={cn('block', className)}>
      {label ? (
        <label htmlFor={id} className="mb-1.5 flex items-center gap-2 text-sm font-medium text-fg">
          <span>{label}</span>
          {required ? <span className="text-danger" aria-hidden>*</span> : null}
          {optional ? <span className="text-xs font-normal text-subtle">({t('common.optional')})</span> : null}
        </label>
      ) : null}
      {children({ id, describedBy, invalid: !!error })}
      {hint && !error ? <p id={hintId} className="mt-1.5 text-xs text-subtle">{hint}</p> : null}
      {error ? (
        <p id={errId} role="alert" className="mt-1.5 flex items-start gap-1.5 text-xs font-medium text-danger">
          <Icon name="alert" size={14} className="mt-0.5" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  )
}

const controlBase =
  'w-full min-h-11 rounded-md border bg-surface px-3 text-fg placeholder:text-subtle transition-colors focus-visible:outline-2 disabled:bg-surface-2 disabled:text-subtle read-only:bg-surface-2'
const controlBorder = (invalid: boolean): string => (invalid ? 'border-danger' : 'border-line-strong hover:border-primary/60')

// ───────────────────────── Input ─────────────────────────
export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: ReactNode
  hint?: ReactNode
  error?: string | null
  optional?: boolean
  /** adornment rendered at the inline start / end (e.g. unit label) */
  startAdornment?: ReactNode
  endAdornment?: ReactNode
  fieldClassName?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ label, hint, error, optional, startAdornment, endAdornment, className, fieldClassName, required, ...rest }, ref) {
  return (
    <Field label={label} hint={hint} error={error} required={required} optional={optional} className={fieldClassName}>
      {({ id, describedBy, invalid }) => (
        <div className="relative">
          {startAdornment ? <span className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-sm text-subtle">{startAdornment}</span> : null}
          <input
            ref={ref}
            id={id}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            required={required}
            className={cn(controlBase, controlBorder(invalid), startAdornment && 'ps-12', endAdornment && 'pe-14', className)}
            {...rest}
          />
          {endAdornment ? <span className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-sm text-subtle">{endAdornment}</span> : null}
        </div>
      )}
    </Field>
  )
})

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: ReactNode; hint?: ReactNode; error?: string | null; optional?: boolean }>(function Textarea(
  { label, hint, error, optional, className, required, ...rest },
  ref,
) {
  return (
    <Field label={label} hint={hint} error={error} required={required} optional={optional}>
      {({ id, describedBy, invalid }) => (
        <textarea ref={ref} id={id} aria-describedby={describedBy} aria-invalid={invalid || undefined} required={required} className={cn(controlBase, controlBorder(invalid), 'py-2 min-h-24 resize-y', className)} {...rest} />
      )}
    </Field>
  )
})

// ───────────────────────── Numeric inputs ─────────────────────────
interface NumericProps extends Omit<InputProps, 'value' | 'onChange' | 'type' | 'inputMode'> {
  /** numeric value (undefined = empty) */
  value: number | undefined
  onValueChange: (v: number | undefined) => void
}

/** Toman amount: Persian digits, thousands separators, integer only. Numbers are LTR-isolated by design (right-aligned digits). */
export const CurrencyInput = forwardRef<HTMLInputElement, NumericProps>(function CurrencyInput({ value, onValueChange, endAdornment, ...rest }, ref) {
  const text = value === undefined ? '' : formatNumberFa(value)
  return (
    <Input
      ref={ref}
      inputMode="numeric"
      autoComplete="off"
      dir="ltr"
      className="text-end font-medium num"
      value={text}
      endAdornment={endAdornment ?? t('common.toman')}
      onChange={(e: ChangeEvent<HTMLInputElement>) => {
        const n = parseNumberInput(e.target.value)
        onValueChange(Number.isFinite(n) ? Math.floor(n) : undefined)
      }}
      {...rest}
    />
  )
})

/** USD amount with optional decimals (cents). Keeps the raw text while typing so «۲۵٫» doesn't jump. */
export const AmountInput = forwardRef<HTMLInputElement, Omit<NumericProps, 'value' | 'onValueChange'> & { cents: number | undefined; onCentsChange: (c: number | undefined, raw: string) => void }>(function AmountInput(
  { cents, onCentsChange, endAdornment, ...rest },
  ref,
) {
  const lastRaw = useRef<string | null>(null)
  const rawMatches = lastRaw.current !== null && Math.round(parseNumberInput(lastRaw.current) * 100) === (cents ?? NaN)
  const shown = rawMatches ? (lastRaw.current as string) : cents === undefined ? '' : toPersianDigits(String(cents / 100)).replace('.', '٫')
  return (
    <Input
      ref={ref}
      inputMode="decimal"
      autoComplete="off"
      dir="ltr"
      className="text-end font-medium num"
      value={shown}
      endAdornment={endAdornment ?? t('common.usd')}
      onChange={(e: ChangeEvent<HTMLInputElement>) => {
        const raw = toPersianDigits(toLatinDigits(e.target.value).replace(/[^\d.٫]/g, ''))
        lastRaw.current = raw
        const n = parseNumberInput(raw)
        onCentsChange(Number.isFinite(n) && n > 0 ? Math.round(n * 100) : undefined, raw)
      }}
      {...rest}
    />
  )
})

/** Iranian mobile number: accepts Persian/Latin digits, +98 / 0098 / 0 prefixes; shows Persian digits, LTR. */
export const PhoneInput = forwardRef<HTMLInputElement, Omit<InputProps, 'value' | 'onChange' | 'type'> & { value: string; onValueChange: (v: string) => void }>(function PhoneInput({ value, onValueChange, ...rest }, ref) {
  return (
    <Input
      ref={ref}
      type="tel"
      inputMode="tel"
      autoComplete="tel-national"
      dir="ltr"
      maxLength={16}
      className="text-end tracking-wide num"
      value={toPersianDigits(value)}
      onChange={(e: ChangeEvent<HTMLInputElement>) => onValueChange(toLatinDigits(e.target.value).replace(/[^\d+]/g, ''))}
      {...rest}
    />
  )
})

// ───────────────────────── OTP ─────────────────────────
interface OtpProps {
  length?: number
  value: string
  onChange: (v: string) => void
  onComplete?: (v: string) => void
  label: string
  error?: string | null
  disabled?: boolean
  autoFocus?: boolean
}

/** One box per digit; auto-advance, backspace-back, paste of the whole code, SMS autofill (`one-time-code`). Boxes are LTR so the code reads left→right. */
export function OtpInput({ length = 5, value, onChange, onComplete, label, error, disabled, autoFocus }: OtpProps) {
  const refs = useRef<(HTMLInputElement | null)[]>([])
  const groupId = useId()
  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus()
  }, [autoFocus])
  const digits = Array.from({ length }, (_, i) => value[i] ?? '')
  const commit = (next: string): void => {
    const clean = toLatinDigits(next).replace(/\D/g, '').slice(0, length)
    onChange(clean)
    if (clean.length === length) onComplete?.(clean)
  }
  const onKey = (i: number) => (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) {
      e.preventDefault()
      commit(value.slice(0, i - 1))
      refs.current[i - 1]?.focus()
    } else if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus()
    else if (e.key === 'ArrowRight' && i < length - 1) refs.current[i + 1]?.focus()
  }
  const onInput = (i: number) => (e: ChangeEvent<HTMLInputElement>) => {
    const d = toLatinDigits(e.target.value).replace(/\D/g, '')
    if (!d) return commit(value.slice(0, i) + value.slice(i + 1))
    if (d.length > 1) {
      commit(value.slice(0, i) + d)
      refs.current[Math.min(length - 1, i + d.length)]?.focus()
      return
    }
    commit(value.slice(0, i) + d + value.slice(i + 1))
    refs.current[Math.min(length - 1, i + 1)]?.focus()
  }
  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text')
    if (text) {
      e.preventDefault()
      commit(text)
      refs.current[Math.min(length - 1, toLatinDigits(text).replace(/\D/g, '').length)]?.focus()
    }
  }
  return (
    <div role="group" aria-labelledby={`${groupId}-l`}>
      <span id={`${groupId}-l`} className="mb-2 block text-sm font-medium">{label}</span>
      <div className="flex justify-center gap-2" dir="ltr">
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => {
              refs.current[i] = el
            }}
            value={toPersianDigits(d)}
            onChange={onInput(i)}
            onKeyDown={onKey(i)}
            onPaste={onPaste}
            onFocus={(e) => e.target.select()}
            inputMode="numeric"
            autoComplete={i === 0 ? 'one-time-code' : 'off'}
            aria-label={`${label} — ${toPersianDigits(i + 1)}`}
            aria-invalid={!!error || undefined}
            disabled={disabled}
            maxLength={length}
            className={cn('h-12 w-11 rounded-md border bg-surface text-center text-xl font-bold focus-visible:outline-2 sm:w-12', error ? 'border-danger' : 'border-line-strong')}
          />
        ))}
      </div>
      {error ? <p role="alert" className="mt-2 text-center text-xs font-medium text-danger">{error}</p> : null}
    </div>
  )
}

// ───────────────────────── Select ─────────────────────────
export interface SelectOption {
  value: string
  label: string
}
export const Select = forwardRef<HTMLSelectElement, Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> & { label?: ReactNode; hint?: ReactNode; error?: string | null; options: SelectOption[]; placeholder?: string; optional?: boolean }>(function Select(
  { label, hint, error, options, placeholder, optional, className, required, ...rest },
  ref,
) {
  return (
    <Field label={label} hint={hint} error={error} required={required} optional={optional}>
      {({ id, describedBy, invalid }) => (
        <div className="relative">
          <select ref={ref} id={id} aria-describedby={describedBy} aria-invalid={invalid || undefined} required={required} className={cn(controlBase, controlBorder(invalid), 'appearance-none pe-10', className)} {...rest}>
            {placeholder ? <option value="">{placeholder}</option> : null}
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <Icon name="chevron-down" size={18} className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-subtle" />
        </div>
      )}
    </Field>
  )
})

// ───────────────────────── Checkbox ─────────────────────────
export const Checkbox = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { label: ReactNode; error?: string | null; tone?: 'default' | 'danger' }>(function Checkbox({ label, error, tone = 'default', className, id, ...rest }, ref) {
  const gen = useId()
  const cid = id ?? gen
  return (
    <div>
      <label htmlFor={cid} className={cn('flex cursor-pointer items-start gap-3 rounded-md p-3 text-sm leading-7', tone === 'danger' ? 'border border-danger/40 bg-danger-soft' : 'bg-surface-2', className)}>
        <input ref={ref} id={cid} type="checkbox" aria-invalid={!!error || undefined} aria-describedby={error ? `${cid}-err` : undefined} className="mt-1.5 h-5 w-5 shrink-0 accent-[rgb(var(--c-primary))]" {...rest} />
        <span>{label}</span>
      </label>
      {error ? (
        <p id={`${cid}-err`} role="alert" className="mt-1.5 text-xs font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  )
})
