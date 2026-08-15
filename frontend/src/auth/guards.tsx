/**
 * Route guards.
 *
 * `RequireAuth` remembers where the visitor was heading. Landing on /login and
 * then being dumped on the dashboard loses the thing they clicked — a link to a
 * specific job, usually — and there is no way back to it.
 */

import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { useAuth } from './AuthProvider'

function Checking() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-screen items-center justify-center text-sm text-muted"
    >
      Restoring your session…
    </div>
  )
}

export function RequireAuth() {
  const { status } = useAuth()
  const location = useLocation()

  // Never redirect while the silent refresh is still in flight: on a page reload
  // there is no access token yet, and deciding early logs everyone out.
  if (status === 'checking') return <Checking />

  if (status === 'anonymous') {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  return <Outlet />
}

export function RequireOnboarding() {
  const { user } = useAuth()
  const location = useLocation()

  if (user && !user.onboardingComplete && location.pathname !== '/welcome') {
    return <Navigate to="/welcome" replace />
  }

  return <Outlet />
}

/**
 * A logged-in visitor hitting a public auth page goes to the app instead.
 *
 * Not the landing page — that is deliberately reachable when logged in, via the
 * header link, so the marketing copy is available without logging out.
 */
export function RedirectIfAuthenticated({ to = '/app' }: { to?: string }) {
  const { status } = useAuth()

  if (status === 'checking') return <Checking />
  if (status === 'authenticated') return <Navigate to={to} replace />

  return <Outlet />
}
