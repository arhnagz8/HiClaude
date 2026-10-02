import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router-dom'
import { cn } from '../lib/cn'
import { Spinner } from './Spinner'
import { Icon, type IconName } from './Icon'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'soft'
export type ButtonSize = 'sm' | 'md' | 'lg'

export function buttonClasses(o: { variant?: ButtonVariant; size?: ButtonSize; block?: boolean; className?: string } = {}): string {
  const { variant = 'primary', size = 'md', block, className } = o
  return cn(
    'inline-flex items-center justify-center gap-2 rounded-md font-semibold transition-colors select-none',
    'disabled:opacity-50 disabled:pointer-events-none aria-disabled:opacity-50 aria-disabled:pointer-events-none',
    size === 'sm' && 'min-h-9 px-3 text-sm',
    size === 'md' && 'min-h-11 px-4 text-[0.95rem]',
    size === 'lg' && 'min-h-12 px-6 text-base',
    variant === 'primary' && 'bg-primary text-on-primary hover:bg-primary-hover shadow-sm',
    variant === 'secondary' && 'bg-surface text-fg border border-line-strong hover:bg-surface-2',
    variant === 'soft' && 'bg-primary-soft text-primary hover:brightness-95',
    variant === 'ghost' && 'text-primary hover:bg-primary-soft',
    variant === 'danger' && 'bg-danger text-white hover:brightness-110 dark:text-[#1a0505]',
    block && 'w-full',
    className,
  )
}

interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  block?: boolean
  loading?: boolean
  icon?: IconName
  iconEnd?: IconName
}

export const Button = forwardRef<HTMLButtonElement, BtnProps>(function Button({ variant, size, block, loading, icon, iconEnd, className, children, disabled, type = 'button', ...rest }, ref) {
  return (
    <button ref={ref} type={type} className={buttonClasses({ variant, size, block, className })} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <Spinner size={16} /> : icon ? <Icon name={icon} size={18} /> : null}
      {children}
      {iconEnd && !loading ? <Icon name={iconEnd} size={18} /> : null}
    </button>
  )
})

interface BtnLinkProps extends LinkProps {
  variant?: ButtonVariant
  size?: ButtonSize
  block?: boolean
  icon?: IconName
  iconEnd?: IconName
  children?: ReactNode
}
export function ButtonLink({ variant, size, block, icon, iconEnd, className, children, ...rest }: BtnLinkProps) {
  return (
    <Link className={buttonClasses({ variant, size, block, className })} {...rest}>
      {icon ? <Icon name={icon} size={18} /> : null}
      {children}
      {iconEnd ? <Icon name={iconEnd} size={18} /> : null}
    </Link>
  )
}

interface IconBtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName
  /** required accessible name */
  label: string
  size?: 'sm' | 'md'
  variant?: 'ghost' | 'soft' | 'plain'
}
export const IconButton = forwardRef<HTMLButtonElement, IconBtnProps>(function IconButton({ icon, label, size = 'md', variant = 'ghost', className, type = 'button', ...rest }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex items-center justify-center rounded-md transition-colors disabled:opacity-50',
        size === 'md' ? 'h-11 w-11' : 'h-9 w-9',
        variant === 'ghost' && 'text-fg hover:bg-surface-2',
        variant === 'soft' && 'bg-surface-2 text-fg hover:bg-surface-3',
        variant === 'plain' && 'text-muted hover:text-fg',
        className,
      )}
      {...rest}
    >
      <Icon name={icon} size={size === 'md' ? 22 : 18} />
    </button>
  )
})
