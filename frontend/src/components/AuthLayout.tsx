/**
 * The shell for login, register and onboarding.
 *
 * You said login looked unfinished, and it did: a bare form on a flat split.
 * It is now a glass card floating on a gradient mesh field, with the value
 * proposition on a darker panel beside it.
 *
 * Below a laptop the side panel drops away entirely rather than stacking —
 * nobody scrolls past a marketing pitch to reach a password field.
 */

import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { ThemeToggle } from './ThemeToggle'
import { IconCheck, IconRadar, IconShield, IconSparkle, IconTarget } from './icons'
import { Panel } from './ui'

const REASSURANCE = [
  {
    Icon: IconTarget,
    title: 'Scored against your profile',
    body: 'Every posting out of 100, with the four numbers behind it shown on the row.',
  },
  {
    Icon: IconSparkle,
    title: '17 sources, checked daily',
    body: 'Company job boards plus LinkedIn, Indeed, Bayt and Google Jobs.',
  },
  {
    Icon: IconShield,
    title: 'Your notes stay yours',
    body: 'Statuses and notes are private to your account. Nothing is shared between users.',
  },
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
    <div className="mesh relative min-h-screen bg-bg lg:grid lg:grid-cols-[1fr_minmax(0,42%)]">
      {/* --- Form side ------------------------------------------------- */}
      <div className="relative flex min-h-screen flex-col px-5 py-5 sm:px-7 lg:min-h-0">
        <header className="flex items-center justify-between gap-3">
          <Link to="/" className="flex items-center gap-2.5 font-extrabold tracking-tight">
            <span className="flex h-8 w-8 items-center justify-center rounded-sm bg-grad-accent text-on-accent shadow-e1">
              <IconRadar size={17} />
            </span>
            JobRadar
          </Link>
          <ThemeToggle />
        </header>

        <main
          className={`page-enter mx-auto flex w-full flex-1 flex-col justify-center py-7 ${
            wide ? 'max-w-2xl' : 'max-w-md'
          }`}
        >
          <div className="mb-6">
            <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
            {subtitle && <p className="mt-2.5 text-md text-muted">{subtitle}</p>}
          </div>

          {/* The card that makes this look finished: elevated, with a gradient
              hairline along its top edge. */}
          <Panel edge elevation="high" className="p-6 sm:p-7">
            {children}
          </Panel>

          {footer && <div className="mt-5 text-center text-muted">{footer}</div>}
        </main>
      </div>

      {/* --- Reassurance side ------------------------------------------ */}
      <aside className="relative hidden flex-col justify-center overflow-hidden border-l border-hairline bg-bg-deep px-8 lg:flex">
        {/* Decorative depth behind the panel. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.4]"
          style={{
            backgroundImage:
              'linear-gradient(to right, var(--border) 1px, transparent 1px), linear-gradient(to bottom, var(--border) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
            maskImage: 'radial-gradient(ellipse 70% 60% at 50% 40%, black 20%, transparent 80%)',
            WebkitMaskImage:
              'radial-gradient(ellipse 70% 60% at 50% 40%, black 20%, transparent 80%)',
          }}
        />

        <div className="relative max-w-md">
          <p className="text-xl font-extrabold leading-snug tracking-tight">
            Every junior dev job in your city, scored against your CV, in one place.
          </p>

          <ul className="mt-7 space-y-4">
            {REASSURANCE.map((item) => (
              <li key={item.title} className="flex items-start gap-3.5">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-sm border border-hairline bg-surface text-accent shadow-e1">
                  <item.Icon size={16} />
                </span>
                <span>
                  <span className="block font-semibold">{item.title}</span>
                  <span className="mt-0.5 block text-sm text-muted">{item.body}</span>
                </span>
              </li>
            ))}
          </ul>

          <p className="mt-8 flex items-start gap-2 border-t border-hairline pt-5 text-xs text-subtle">
            <IconCheck size={13} className="mt-0.5 text-high" />
            Free and self-hostable. Scoring is transparent keyword weighting, not AI — you can see
            and change every number behind every rank.
          </p>
        </div>
      </aside>
    </div>
  )
}
