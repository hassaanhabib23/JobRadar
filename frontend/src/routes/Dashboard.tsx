/**
 * The dashboard.
 *
 * A placeholder until milestone 8. It already proves the authenticated shell
 * works end to end: the session survives a reload, stats load, and signing out
 * clears everything.
 */

import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'

import { api } from '../api/client'
import type { Stats } from '../api/types'
import { useAuth } from '../auth/AuthProvider'
import { Button, Panel, Spinner } from '../components/ui'

export default function Dashboard() {
  const { user, logout } = useAuth()
  const stats = useQuery({ queryKey: ['stats'], queryFn: () => api.get<Stats>('/stats/') })

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-muted">{user?.email}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/"
            className="inline-flex min-h-[44px] items-center rounded-lg px-3 text-sm hover:bg-surface"
          >
            Home
          </Link>
          <Button variant="secondary" onClick={() => void logout()}>
            Sign out
          </Button>
        </div>
      </header>

      <Panel>
        {stats.isPending && <Spinner label="Loading your stats" />}
        {stats.isError && (
          <p role="alert" className="text-sm text-danger">
            Could not load your stats.{' '}
            <button
              type="button"
              onClick={() => void stats.refetch()}
              className="underline underline-offset-2"
            >
              Retry
            </button>
          </p>
        )}
        {stats.data && (
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Open" value={stats.data.openCount} />
            <Stat label="New today" value={stats.data.newToday} />
            <Stat label="Average score" value={Math.round(stats.data.avgScore ?? 0)} />
            <Stat
              label="Last run"
              value={
                stats.data.lastRunAt ? new Date(stats.data.lastRunAt).toLocaleString() : 'never'
              }
            />
          </dl>
        )}
      </Panel>

      <p className="text-sm text-muted">The full job table arrives in milestone 8.</p>
    </main>
  )
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-1 text-xl font-semibold">{value}</dd>
    </div>
  )
}
