/**
 * The route table.
 *
 * `/` belongs to the public landing page (milestone 11), not the dashboard —
 * a logged-out visitor must land on marketing copy, not a login redirect.
 *
 * Authenticated routes are lazily loaded so the landing page ships none of the
 * dashboard bundle. That split is a hard requirement, not an optimisation: the
 * landing page has to render fast on a slow mobile connection.
 */

import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'

import { RedirectIfAuthenticated, RequireAuth, RequireOnboarding } from './auth/guards'
import Login from './routes/Login'
import Register from './routes/Register'

const Landing = lazy(() => import('./routes/Landing'))
const Welcome = lazy(() => import('./routes/Welcome'))
const Dashboard = lazy(() => import('./routes/Dashboard'))
const JobDetail = lazy(() => import('./routes/JobDetail'))
const ProfilePage = lazy(() => import('./routes/ProfilePage'))
const Runs = lazy(() => import('./routes/Runs'))
const NotFound = lazy(() => import('./routes/NotFound'))

function RouteFallback() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-screen items-center justify-center text-sm text-muted"
    >
      Loading…
    </div>
  )
}

export default function App() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        {/* Public */}
        <Route path="/" element={<Landing />} />

        <Route element={<RedirectIfAuthenticated />}>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
        </Route>

        {/* Authenticated */}
        <Route element={<RequireAuth />}>
          <Route path="/welcome" element={<Welcome />} />

          <Route element={<RequireOnboarding />}>
            <Route path="/app" element={<Dashboard />} />
            <Route path="/app/jobs/:id" element={<JobDetail />} />
            <Route path="/app/profile" element={<ProfilePage />} />
            <Route path="/app/runs" element={<Runs />} />
          </Route>
        </Route>

        {/* A silent redirect to "/" hides the mistake; a 404 names it. */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  )
}
