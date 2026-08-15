/**
 * Small shared primitives.
 *
 * Deliberately plain: this is a dense, information-first tool, closer to Linear
 * or GitHub than to a marketing page. Every interactive element carries a
 * visible focus ring and a real label — the whole app has to be usable with a
 * keyboard alone.
 */

import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ')
}

export function Button({
  variant = 'primary',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' }) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium ' +
    // 44px minimum target — this is used on a phone on a bus, not only a desktop.
    'min-h-[44px] transition-colors disabled:cursor-not-allowed disabled:opacity-50'
  const variants = {
    primary: 'bg-accent text-white hover:bg-accent-strong',
    secondary: 'border border-hairline bg-surface hover:bg-surface-strong',
    ghost: 'hover:bg-surface',
  }
  return <button className={cx(base, variants[variant], className)} {...props} />
}

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
      <label htmlFor={inputId} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={inputId}
        // Screen readers announce the error with the field rather than leaving
        // the user to hunt for red text.
        aria-invalid={invalid || undefined}
        aria-describedby={cx(invalid && errorId, hint && hintId) || undefined}
        className={cx(
          'min-h-[44px] rounded-lg border bg-surface px-3 text-sm',
          invalid ? 'border-danger' : 'border-hairline',
          className,
        )}
        {...props}
      />
      {hint && (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      )}
      {invalid && (
        <p id={errorId} className="text-xs text-danger">
          {errors!.join(' ')}
        </p>
      )}
    </div>
  )
}

export function FormError({ children }: { children: ReactNode }) {
  if (!children) return null
  return (
    <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm">
      {children}
    </p>
  )
}

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx('rounded-[10px] border border-hairline bg-surface p-6', className)}>
      {children}
    </div>
  )
}

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
        'inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-full border px-4 text-sm',
        'focus-within:outline focus-within:outline-2 focus-within:outline-offset-2',
        'focus-within:outline-accent',
        checked ? 'border-accent bg-accent/10 font-medium' : 'border-hairline hover:bg-surface',
      )}
    >
      <input
        type="checkbox"
        name={name}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        // Visually hidden, still focusable and still announced.
        className="sr-only"
      />
      <span aria-hidden="true">{checked ? '✓' : '+'}</span>
      {children}
    </label>
  )
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <span role="status" aria-live="polite" className="text-sm text-muted">
      {label}…
    </span>
  )
}
