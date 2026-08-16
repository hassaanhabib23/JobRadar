/**
 * The authenticated shell.
 *
 * Full-bleed, not a centred column. A centred 1400px page wastes the right half
 * of a wide monitor on a screen whose whole job is fitting more rows on it —
 * and the job table is the densest thing here.
 *
 * Layout: fixed sidebar for navigation, sticky top bar for the things that
 * change (last-run age, run trigger), and the content fills whatever is left.
 * Under 1024px the sidebar becomes a slide-over.
 */

import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'

import { useAuth } from '../auth/AuthProvider'
import { ThemeToggle } from './ThemeToggle'
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
      {/* Keyboard users should not have to tab through the whole sidebar to
          reach the table on every single page. */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded focus:bg-accent focus:px-4 focus:py-2 focus:text-on-accent"
      >
        Skip to content
      </a>

      {/* --- Sidebar --------------------------------------------------- */}
      <aside
        className={cx(
          'fixed inset-y-0 left-0 z-40 flex w-sidebar flex-col border-r border-hairline bg-surface',
          'transition-transform duration-200 lg:translate-x-0',
          navOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-topbar items-center gap-2 border-b border-hairline px-4">
          <IconRadar size={20} className="text-accent" />
          <span className="text-md font-semibold tracking-tight">JobRadar</span>
          <button
            type="button"
            onClick={() => setNavOpen(false)}
            className="ml-auto rounded p-2 text-muted hover:bg-surface-hover hover:text-fg lg:hidden"
          >
            <IconClose title="Close navigation" size={18} />
          </button>
        </div>

        <nav aria-label="Main" className="flex-1 space-y-0.5 p-2">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cx(
                  'flex min-h-[44px] items-center gap-2.5 rounded px-3 text-base transition-colors duration-fast',
                  isActive
                    ? 'bg-accent-subtle font-medium text-accent'
                    : 'text-muted hover:bg-surface-hover hover:text-fg',
                )
              }
            >
              <item.icon size={17} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-hairline p-2">
          <div className="px-3 pb-2 pt-1">
            <p className="truncate text-xs text-subtle" title={user?.email}>
              {user?.email}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void logout()}
              className="flex-1 justify-start"
            >
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
          className="fixed inset-0 z-30 bg-[var(--overlay)] lg:hidden"
        />
      )}

      {/* --- Content ---------------------------------------------------- */}
      <div className="lg:pl-sidebar">
        <header className="sticky top-0 z-20 flex h-topbar items-center gap-3 border-b border-hairline bg-bg/90 px-4 backdrop-blur">
          <button
            type="button"
            onClick={() => setNavOpen(true)}
            className="rounded p-2 text-muted hover:bg-surface-hover hover:text-fg lg:hidden"
          >
            <IconMenu title="Open navigation" size={20} />
          </button>
          {topbar}
        </header>

        <main id="main" className="px-4 py-5 sm:px-6">
          {children}
        </main>
      </div>
    </div>
  )
}

/**
 * A centred column for prose-shaped pages.
 *
 * The dashboard is full-bleed; a job description or a settings form is not —
 * a 200-character line is unreadable no matter how wide the monitor is.
 */
export function Column({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('mx-auto w-full max-w-4xl', className)}>{children}</div>
}
