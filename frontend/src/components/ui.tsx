/**
 * Shared primitives.
 *
 * Layered depth rather than flat fills: surfaces sit at defined elevations with
 * a faint top sheen, chrome is translucent, and the primary action carries a
 * gradient. The point is that a card should read as a lit object, not as a
 * rectangle with a border drawn round it.
 *
 * Every interactive element is at least 44px on its smallest axis, keeps a
 * visible focus ring, and pairs any colour signal with a word.
 */

import { useEffect, useRef, useState } from 'react'
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from 'react'

import { IconAlert, IconCheck, IconPlus } from './icons'
import { useReducedMotion } from './motion'

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ')
}

/* --- Button ------------------------------------------------------------- */

type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'ghost'
  | 'glass'
  | 'danger'
  | 'brand'
  | 'brand-secondary'
  | 'brand-ghost'
type ButtonSize = 'sm' | 'md' | 'lg'

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  // Gradient, not a flat fill, with a lift and a coloured shadow on hover.
  primary:
    'bg-grad-accent text-on-accent shadow-e1 border border-transparent ' +
    'hover:bg-grad-accent-hover hover:shadow-glow hover:-translate-y-px active:translate-y-0',
  secondary:
    'surface text-fg hover:bg-surface-hover hover:border-hairline-strong ' +
    'hover:shadow-e2 hover:-translate-y-px active:translate-y-0',
  ghost: 'text-muted hover:text-fg hover:bg-surface-hover border border-transparent',
  glass: 'glass border text-fg hover:bg-surface-hover',
  danger:
    'bg-danger-bg text-danger border border-danger-border hover:bg-danger hover:text-on-accent',
  // The three above all key off the light/dark toggle via --fg-muted etc.,
  // which is wrong on a surface that stays charcoal regardless of it (the
  // marketing header, the hero/CTA, the login's brand panel). These three
  // are the brand-chrome equivalents, built from the fixed `--brand-*`
  // tokens instead.
  brand:
    'bg-brand-grad-accent text-white shadow-e1 border border-transparent ' +
    'hover:shadow-brand-glow hover:-translate-y-px active:translate-y-0',
  'brand-secondary':
    'border border-brand-border-strong bg-brand-surface text-brand-fg hover:bg-brand-surface-hover ' +
    'hover:-translate-y-px active:translate-y-0',
  'brand-ghost':
    'text-brand-fg-muted hover:text-brand-fg hover:bg-brand-surface-hover border border-transparent',
}

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'h-9 min-h-[36px] px-3.5 text-sm gap-1.5 rounded-sm',
  md: 'h-11 min-h-[44px] px-5 text-base gap-2 rounded',
  lg: 'h-12 min-h-[48px] px-6 text-md gap-2 rounded',
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
        // `whitespace-nowrap`: a button label broken across two lines reads as
        // a layout bug, and the fixed heights below would clip it anyway.
        'relative inline-flex items-center justify-center whitespace-nowrap font-semibold',
        'transition-all duration-fast ease-out',
        'disabled:opacity-50 disabled:pointer-events-none disabled:shadow-none',
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
  'w-full rounded border bg-surface-inset px-3.5 text-base text-fg placeholder:text-subtle ' +
  'transition-all duration-fast focus:border-accent focus:bg-surface focus:shadow-ring ' +
  'focus:outline-none'

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
    <div className="flex flex-col gap-2">
      {/* A visible label, always. A placeholder disappears the moment you start
          typing, which is exactly when you need it. */}
      <label htmlFor={inputId} className="text-sm font-semibold text-fg">
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={invalid || undefined}
        aria-describedby={cx(invalid && errorId, hint && hintId) || undefined}
        className={cx(
          CONTROL,
          'h-12 min-h-[48px]',
          invalid ? 'border-danger' : 'border-hairline-strong',
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
        <p id={errorId} className="flex items-start gap-1.5 text-xs font-medium text-danger">
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
    <div className="flex flex-col gap-2">
      <label htmlFor={selectId} className={cx('text-sm font-semibold', hideLabel && 'sr-only')}>
        {label}
      </label>
      <select
        id={selectId}
        className={cx(CONTROL, 'h-12 min-h-[48px] border-hairline-strong pr-8', className)}
        {...props}
      >
        {children}
      </select>
    </div>
  )
}

export function FormError({ children }: { children: ReactNode }) {
  if (!children) return null
  return (
    <p
      role="alert"
      className="flex items-start gap-2.5 rounded border border-danger-border bg-danger-bg p-3.5 text-sm font-medium text-danger"
    >
      <IconAlert size={16} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </p>
  )
}

/* --- Surfaces ----------------------------------------------------------- */

type Elevation = 'flat' | 'raised' | 'high' | 'glass'

const ELEVATIONS: Record<Elevation, string> = {
  flat: 'bg-surface border border-hairline rounded-lg',
  raised: 'surface',
  high: 'surface surface-2',
  glass: 'glass border rounded-lg shadow-e2',
}

export function Panel({
  children,
  className,
  elevation = 'raised',
  edge = false,
  as: Tag = 'section',
}: {
  children: ReactNode
  className?: string
  /** Defaults to `raised`, so every existing usage lifts without an edit. */
  elevation?: Elevation
  /** A gradient hairline along the top edge. For the cards that matter most. */
  edge?: boolean
  as?: 'section' | 'div' | 'article' | 'li'
}) {
  return (
    // Children are rendered directly, not inside a wrapper: callers put
    // `flex`/`grid` on the Panel itself and a wrapper div would swallow it.
    <Tag className={cx('relative', ELEVATIONS[elevation], edge && 'edge-top', className)}>
      {children}
    </Tag>
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
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-hairline px-5 py-4">
      <div className="min-w-0">
        <h2 className="text-md font-bold tracking-tight">{title}</h2>
        {description && <p className="mt-1 max-w-measure text-sm text-muted">{description}</p>}
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
        'inline-flex min-h-[42px] cursor-pointer select-none items-center gap-2 rounded-full',
        'border px-4 text-sm font-medium transition-all duration-fast ease-out',
        'focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent',
        checked
          ? 'border-accent-border bg-accent-subtle text-accent shadow-e1'
          : 'border-hairline bg-surface text-muted hover:-translate-y-px hover:border-hairline-strong hover:text-fg hover:shadow-e1',
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

export type BadgeTone = 'neutral' | 'accent' | 'high' | 'medium' | 'stretch' | 'danger' | 'brand'

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: 'border-hairline bg-surface-inset text-muted',
  accent: 'border-accent-border bg-accent-subtle text-accent',
  high: 'border-high-border bg-high-bg text-high',
  medium: 'border-medium-border bg-medium-bg text-medium',
  stretch: 'border-stretch-border bg-stretch-bg text-stretch',
  danger: 'border-danger-border bg-danger-bg text-danger',
  // For a badge sitting directly on brand chrome (the hero, the CTA, the
  // login's brand panel) — see the comment on the `brand` button variant.
  // A translucent border needs its alpha baked into the token (Tailwind
  // can't apply an opacity modifier to a colour it only knows as `var(...)`
  // — see the comment on `--brand-glass-bg` in tokens.css), so this reuses
  // the solid `--brand-border` rather than trying `/30` on the accent.
  brand: 'border-brand-border bg-brand-accent-subtle text-brand-accent',
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
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-2xs font-bold uppercase tracking-wide',
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
    <span role="status" className="inline-flex items-center gap-2.5 text-sm text-muted">
      <span
        aria-hidden="true"
        className="h-4 w-4 animate-spin rounded-full border-2 border-hairline-strong border-t-accent"
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
    <Panel className="flex flex-col items-center gap-4 px-5 py-7 text-center">
      {icon && (
        <span className="flex h-14 w-14 items-center justify-center rounded-full border border-hairline bg-surface-inset text-muted shadow-e1">
          {icon}
        </span>
      )}
      <div>
        <h2 className="text-lg font-bold tracking-tight">{title}</h2>
        <p className="mx-auto mt-1.5 max-w-measure text-muted">{description}</p>
      </div>
      {action}
    </Panel>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Panel className="flex flex-wrap items-center justify-between gap-4 p-4">
      <p role="alert" className="flex items-center gap-2.5 font-medium">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-danger-bg text-danger">
          <IconAlert size={16} />
        </span>
        {message}
      </p>
      <Button variant="secondary" size="sm" onClick={onRetry}>
        Try again
      </Button>
    </Panel>
  )
}

/* --- Motion ------------------------------------------------------------- */

/**
 * A number that counts up to its value.
 *
 * Rendered inside the element that would have held the plain number, so the
 * layout is identical whether it animates or not.
 */
export function CountUp({
  value,
  duration = 900,
  className,
}: {
  value: number
  duration?: number
  className?: string
}) {
  const reduced = useReducedMotion()
  const [shown, setShown] = useState(reduced ? value : 0)
  const frame = useRef<number>()

  useEffect(() => {
    if (reduced) {
      setShown(value)
      return
    }

    const start = performance.now()
    const from = 0

    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / duration)
      // Ease-out cubic: fast at first, settles gently — the opposite feels
      // sluggish because the interesting part is the arrival.
      const eased = 1 - Math.pow(1 - progress, 3)
      setShown(Math.round(from + (value - from) * eased))
      if (progress < 1) frame.current = requestAnimationFrame(step)
    }

    frame.current = requestAnimationFrame(step)
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current)
    }
  }, [value, duration, reduced])

  // The final value is always in the DOM for assistive tech, even mid-animation.
  return (
    <span className={className}>
      <span aria-hidden="true">{shown}</span>
      <span className="sr-only">{value}</span>
    </span>
  )
}
