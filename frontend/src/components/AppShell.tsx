/**
 * The authenticated shell.
 *
 * Full-bleed, not a centred column. A centred page wastes the right half of a
 * wide monitor on the one screen whose job is fitting more rows on it.
 *
 * The chrome — sidebar and top bar — is translucent and follows the
 * light/dark toggle exactly like the content underneath it: every colour
 * here is a theme token, never a fixed one, so a reader who switches themes
 * sees the whole screen change together instead of only part of it. That
 * translucency is what gives the app a sense of layers rather than of flat
 * panes butted against each other.
 */

import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'

import { useAuth } from '../auth/AuthProvider'
import { ThemeToggle } from './ThemeToggle'
import { VerifyBanner } from './VerifyBanner'
import { Button, cx } from './ui'
import {
  IconBriefcase,
  IconClose,
  IconHistory,
  IconLogout,
  IconMenu,
  IconRadar,
  IconSliders,
} from './icons'

const NAV = [
  { to: '/app', label: 'Jobs', icon: IconBriefcase, end: true },
  { to: '/app/profile', label: 'Profile', icon: IconSliders, end: false },
  { to: '/app/runs', label: 'Runs', icon: IconHistory, end: false },
]

export function AppShell({
  children,
  topbar,
}: {
  children: ReactNode
  /** Page-specific controls: the run button, the last-run age. */
  topbar?: ReactNode
}) {
  const { user, logout } = useAuth()
  const location = useLocation()
  const [navOpen, setNavOpen] = useState(false)

  // A slide-over that survives navigation traps the reader behind it.
  useEffect(() => setNavOpen(false), [location.pathname])

  return (
    <div className="min-h-screen bg-bg">
      {/* Keyboard users should not have to tab the whole sidebar to reach the
          table on every page. */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-accent focus:px-4 focus:py-2 focus:font-semibold focus:text-on-accent focus:shadow-e2"
      >
        Skip to content
      </a>

      {/* --- Sidebar ----------------------------------------------------- */}
      <aside
        className={cx(
          'glass-strong fixed inset-y-0 left-0 z-40 flex w-sidebar flex-col border-r',
          'transition-transform duration-slow ease-out lg:translate-x-0',
          navOpen ? 'translate-x-0 shadow-e3' : '-translate-x-full',
        )}
      >
        <div className="flex h-topbar items-center gap-2.5 px-5">
          <span className="flex h-8 w-8 items-center justify-center rounded-sm bg-accent text-on-accent shadow-e1">
            <IconRadar size={17} />
          </span>
          <span className="text-md font-extrabold tracking-tight">JobRadar</span>
          <button
            type="button"
            onClick={() => setNavOpen(false)}
            className="ml-auto rounded-sm p-2 text-muted transition-colors hover:bg-surface-hover hover:text-fg lg:hidden"
          >
            <IconClose title="Close navigation" size={18} />
          </button>
        </div>

        <nav aria-label="Main" className="flex-1 space-y-1 px-3 py-2">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cx(
                  'relative flex min-h-[44px] items-center gap-3 rounded px-3.5 font-semibold',
                  'transition-all duration-fast ease-out',
                  isActive
                    ? // A solid pill, not a tinted rectangle.
                      'bg-accent text-on-accent shadow-e1'
                    : 'text-muted hover:bg-surface-hover hover:text-fg',
                )
              }
            >
              <item.icon size={18} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Stacked, not side by side: the three-way theme switch and a labelled
            button do not both fit in 244px without the label wrapping. */}
        <div className="flex flex-col gap-2.5 border-t border-hairline p-3">
          <div className="truncate px-1.5">
            {/* Registration doesn't require a name — an account made before
                this existed, or via the API directly, just shows the email. */}
            {(user?.firstName || user?.lastName) && (
              <p className="truncate text-sm font-semibold text-fg">
                {[user.firstName, user.lastName].filter(Boolean).join(' ')}
              </p>
            )}
            <p className="truncate text-xs text-subtle" title={user?.email}>
              {user?.email}
            </p>
          </div>
          <div className="flex items-center justify-between gap-2">
            <ThemeToggle />
            <Button variant="ghost" size="sm" onClick={() => void logout()}>
              <IconLogout size={16} />
              Sign out
            </Button>
          </div>
        </div>
      </aside>

      {navOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setNavOpen(false)}
          className="fixed inset-0 z-30 bg-[var(--overlay)] backdrop-blur-sm lg:hidden"
        />
      )}

      {/* --- Content: follows the light/dark toggle, unlike the chrome --- */}
      <div className="lg:pl-sidebar">
        <header className="glass sticky top-0 z-20 flex h-topbar items-center gap-4 border-b px-5">
          <button
            type="button"
            onClick={() => setNavOpen(true)}
            className="rounded-sm p-2 text-muted transition-colors hover:bg-surface-hover hover:text-fg lg:hidden"
          >
            <IconMenu title="Open navigation" size={20} />
          </button>
          {topbar}
        </header>

        <VerifyBanner />

        <main id="main" className="page-enter px-4 py-5 sm:px-6 sm:py-6">
          {children}
        </main>
      </div>
    </div>
  )
}

/**
 * A centred column for prose-shaped pages.
 *
 * The dashboard is full-bleed; a job description or a settings form is not — a
 * 200-character line is unreadable no matter how wide the monitor.
 */
export function Column({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('mx-auto w-full max-w-5xl', className)}>{children}</div>
}
