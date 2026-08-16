/**
 * The shell for login, register and onboarding.
 *
 * A split layout: the form on the left at a comfortable reading width, and a
 * panel on the right that reminds the visitor what they are signing up for.
 * On anything narrower than a laptop the panel drops away entirely rather than
 * stacking — nobody scrolls past a value proposition to reach a password field.
 */

import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { ThemeToggle } from './ThemeToggle'
import { IconCheck, IconRadar } from './icons'

const REASSURANCE = [
  'Free, and self-hostable on your own machine.',
  'Your statuses and notes stay private to your account.',
  'Every weight behind every score is yours to edit.',
]

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
  wide = false,
}: {
  title: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
  /** Onboarding needs more room than a two-field sign-in form. */
  wide?: boolean
}) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_minmax(0,44%)]">
      {/* --- Form side ------------------------------------------------- */}
      <div className="flex flex-col px-5 py-5 sm:px-7">
        <header className="flex items-center justify-between gap-3">
          <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <IconRadar size={19} className="text-accent" />
            JobRadar
          </Link>
          <ThemeToggle />
        </header>

        <main
          className={`mx-auto flex w-full flex-1 flex-col justify-center py-7 ${
            wide ? 'max-w-2xl' : 'max-w-sm'
          }`}
        >
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-2 text-md text-muted">{subtitle}</p>}

          <div className="mt-6">{children}</div>

          {footer && <div className="mt-5 text-sm text-muted">{footer}</div>}
        </main>
      </div>

      {/* --- Reassurance side ------------------------------------------ */}
      <aside className="hidden flex-col justify-center border-l border-hairline bg-bg-subtle px-7 lg:flex">
        <p className="text-xl font-semibold leading-snug">
          Every junior dev job in your city, scored against your CV, in one place.
        </p>
        <ul className="mt-6 space-y-3">
          {REASSURANCE.map((line) => (
            <li key={line} className="flex items-start gap-2.5 text-sm text-muted">
              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-high-bg text-high">
                <IconCheck size={11} />
              </span>
              {line}
            </li>
          ))}
        </ul>

        <p className="mt-7 border-t border-hairline pt-5 text-xs text-subtle">
          Scoring is transparent keyword weighting, not AI — you can see and change every number
          behind every rank.
        </p>
      </aside>
    </div>
  )
}
