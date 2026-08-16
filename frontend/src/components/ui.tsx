/**
 * Shared primitives.
 *
 * Flat by design: no gradients, no decorative shadows, colour used to carry
 * meaning rather than to decorate. This is a tool that gets scanned in two
 * minutes each morning, so restraint is the feature.
 *
 * Every interactive element here is at least 44px on its smallest axis, keeps a
 * visible focus ring, and pairs any colour signal with a word.
 */

import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from 'react'

import { IconAlert, IconCheck, IconPlus } from './icons'

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ')
}

/* --- Button ------------------------------------------------------------- */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md'

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-on-accent hover:bg-accent-hover border border-transparent',
  secondary:
    'bg-surface text-fg border border-hairline hover:bg-surface-hover hover:border-hairline-strong',
  ghost: 'text-muted hover:text-fg hover:bg-surface-hover border border-transparent',
  danger:
    'bg-danger-bg text-danger border border-danger-border hover:bg-danger hover:text-on-accent',
}

const BUTTON_SIZES: Record<ButtonSize, string> = {
  // Both clear the 44px touch target on their smallest axis.
  sm: 'h-9 min-h-[36px] px-3 text-sm gap-1.5',
  md: 'h-11 min-h-[44px] px-4 text-base gap-2',
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
}) {
  return (
    <button
      type={type}
      className={cx(
        'inline-flex items-center justify-center rounded font-medium',
        'transition-colors duration-fast',
        'disabled:opacity-50 disabled:pointer-events-none',
        BUTTON_SIZES[size],
        BUTTON_VARIANTS[variant],
        className,
      )}
      {...props}
    />
  )
}

/* --- Form fields -------------------------------------------------------- */

const CONTROL =
  'w-full rounded border bg-surface px-3 text-base text-fg placeholder:text-subtle ' +
  'transition-colors duration-fast focus:border-accent'

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  /** Field-level messages from the API, shown under the input. */
  errors?: string[] | undefined
  hint?: string | undefined
}

export function Field({ label, errors, hint, id, className, ...props }: FieldProps) {
  const inputId = id ?? props.name ?? label.toLowerCase().replace(/\s+/g, '-')
  const errorId = `${inputId}-error`
  const hintId = `${inputId}-hint`
  const invalid = Boolean(errors?.length)

  return (
    <div className="flex flex-col gap-1.5">
      {/* A visible label, always. A placeholder disappears the moment you
          start typing, which is exactly when you need it. */}
      <label htmlFor={inputId} className="text-sm font-medium text-fg">
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={invalid || undefined}
        aria-describedby={cx(invalid && errorId, hint && hintId) || undefined}
        className={cx(
          CONTROL,
          'h-11 min-h-[44px]',
          invalid ? 'border-danger' : 'border-hairline',
          className,
        )}
        {...props}
      />
      {hint && !invalid && (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      )}
      {invalid && (
        // Beside the field it belongs to, not collected in a banner at the top
        // where you have to work out which input it refers to.
        <p id={errorId} className="flex items-start gap-1.5 text-xs text-danger">
          <IconAlert size={13} className="mt-0.5" />
          <span>{errors!.join(' ')}</span>
        </p>
      )}
    </div>
  )
}

export function Select({
  label,
  hideLabel = false,
  className,
  id,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string; hideLabel?: boolean }) {
  const selectId = id ?? props.name ?? label.toLowerCase().replace(/\s+/g, '-')
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={selectId} className={cx('text-sm font-medium', hideLabel && 'sr-only')}>
        {label}
      </label>
      <select
        id={selectId}
        className={cx(CONTROL, 'h-11 min-h-[44px] border-hairline pr-8', className)}
        {...props}
      >
        {children}
      </select>
    </div>
  )
}

export function Textarea({
  label,
  hint,
  id,
  className,
  ...props
}: InputHTMLAttributes<HTMLTextAreaElement> & { label: string; hint?: string }) {
  const areaId = id ?? props.name ?? label.toLowerCase().replace(/\s+/g, '-')
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={areaId} className="text-sm font-medium">
        {label}
      </label>
      <textarea
        id={areaId}
        className={cx(CONTROL, 'py-2.5 leading-relaxed', className)}
        {...(props as object)}
      />
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  )
}

export function FormError({ children }: { children: ReactNode }) {
  if (!children) return null
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded border border-danger-border bg-danger-bg p-3 text-sm text-danger"
    >
      <IconAlert size={15} className="mt-0.5" />
      <span>{children}</span>
    </p>
  )
}

/* --- Surfaces ----------------------------------------------------------- */

export function Panel({
  children,
  className,
  as: Tag = 'section',
}: {
  children: ReactNode
  className?: string
  as?: 'section' | 'div' | 'article'
}) {
  return (
    <Tag className={cx('rounded-lg border border-hairline bg-surface', className)}>{children}</Tag>
  )
}

export function PanelHeader({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-hairline px-5 py-4">
      <div className="min-w-0">
        <h2 className="text-md font-semibold">{title}</h2>
        {description && <p className="mt-0.5 max-w-measure text-sm text-muted">{description}</p>}
      </div>
      {action}
    </div>
  )
}

/* --- Chips and badges --------------------------------------------------- */

/** A checkbox-backed chip. Keyboard-operable because it really is a checkbox. */
export function Chip({
  checked,
  onChange,
  children,
  name,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  children: ReactNode
  name?: string
}) {
  return (
    <label
      className={cx(
        'inline-flex min-h-[40px] cursor-pointer select-none items-center gap-2 rounded-full',
        'border px-3.5 text-sm transition-colors duration-fast',
        'focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent',
        checked
          ? 'border-accent-border bg-accent-subtle font-medium text-accent'
          : 'border-hairline text-muted hover:border-hairline-strong hover:text-fg',
      )}
    >
      <input
        type="checkbox"
        name={name}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="sr-only"
      />
      {checked ? <IconCheck size={14} /> : <IconPlus size={14} className="opacity-60" />}
      {/* Never wraps to a second line mid-chip. */}
      <span className="whitespace-nowrap">{children}</span>
    </label>
  )
}

export type BadgeTone = 'neutral' | 'accent' | 'high' | 'medium' | 'stretch' | 'danger'

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: 'border-hairline text-muted',
  accent: 'border-accent-border bg-accent-subtle text-accent',
  high: 'border-high-border bg-high-bg text-high',
  medium: 'border-medium-border bg-medium-bg text-medium',
  stretch: 'border-stretch-border bg-stretch-bg text-stretch',
  danger: 'border-danger-border bg-danger-bg text-danger',
}

export function Badge({
  tone = 'neutral',
  icon,
  children,
  title,
  className,
}: {
  tone?: BadgeTone
  icon?: ReactNode
  children: ReactNode
  title?: string
  className?: string
}) {
  return (
    <span
      title={title}
      className={cx(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-2xs font-medium',
        // A badge that wraps mid-word looks broken; it truncates instead.
        'max-w-full whitespace-nowrap',
        BADGE_TONES[tone],
        className,
      )}
    >
      {icon}
      <span className="truncate">{children}</span>
    </span>
  )
}

/* --- States ------------------------------------------------------------- */

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2 text-sm text-muted">
      <span
        aria-hidden="true"
        className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-hairline-strong border-t-accent"
      />
      {label}…
    </span>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cx('skeleton', className)} />
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <Panel className="flex flex-col items-center gap-3 px-5 py-7 text-center">
      {icon && (
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-strong text-muted">
          {icon}
        </span>
      )}
      <div>
        <h2 className="text-md font-semibold">{title}</h2>
        <p className="mx-auto mt-1 max-w-measure text-sm text-muted">{description}</p>
      </div>
      {action}
    </Panel>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Panel className="flex flex-wrap items-center justify-between gap-3 p-4">
      <p role="alert" className="flex items-center gap-2 text-sm">
        <IconAlert size={15} className="text-danger" />
        {message}
      </p>
      <Button variant="secondary" size="sm" onClick={onRetry}>
        Try again
      </Button>
    </Panel>
  )
}
