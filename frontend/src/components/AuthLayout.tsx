/**
 * The shell for login, register and onboarding.
 *
 * An indigo brand panel on the left (~45%), the clean authentication
 * experience on the right (~55%) — reversed from the old form-left layout, to
 * match the same "dark chrome, off-white content" identity as the rest of the
 * marketing site. Below a laptop the brand panel drops away entirely rather
 * than stacking — nobody scrolls past a marketing pitch to reach a password
 * field.
 */

import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { RadarDecoration } from './RadarField'
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

// The reassurance list and footer sit in a vertically centred block whose
// exact height varies with viewport, so both chips stay in the safe band
// near the very top rather than risking a collision with that text.
const BRAND_CHIPS = [
  { score: 92, role: 'Python Developer', location: 'Remote', style: { top: '5%', left: '6%' } },
  { score: 87, role: 'Backend Engineer', location: 'London', style: { top: '5%', right: '6%' } },
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
    <div className="relative min-h-screen bg-bg lg:grid lg:grid-cols-[minmax(0,45%)_1fr]">
      {/* --- Brand side -------------------------------------------------- */}
      <aside className="relative hidden flex-col justify-center overflow-hidden bg-brand-bg px-8 lg:flex">
        <RadarDecoration chips={BRAND_CHIPS} />

        <div className="relative max-w-md">
          <p className="text-xl font-extrabold leading-snug tracking-tight text-brand-fg">
            Your next opportunity is waiting.
          </p>

          <ul className="mt-7 space-y-4">
            {REASSURANCE.map((item) => (
              <li key={item.title} className="flex items-start gap-3.5">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-sm border border-brand-border bg-brand-surface text-brand-accent shadow-e1">
                  <item.Icon size={16} />
                </span>
                <span>
                  <span className="block font-semibold text-brand-fg">{item.title}</span>
                  <span className="mt-0.5 block text-sm text-brand-fg-muted">{item.body}</span>
                </span>
              </li>
            ))}
          </ul>

          <p className="mt-8 flex items-start gap-2 border-t border-brand-border pt-5 text-xs text-brand-fg-subtle">
            <IconCheck size={13} className="mt-0.5 text-brand-accent" />
            Free and self-hostable. Scoring is transparent keyword weighting, not AI — you can see
            and change every number behind every rank.
          </p>
        </div>
      </aside>

      {/* --- Form side ----------------------------------------------------- */}
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
    </div>
  )
}
