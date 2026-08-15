/**
 * The dashboard — the screen this whole system exists to produce.
 *
 * Four states on every async surface: loading (skeletons, not spinners), empty,
 * error with a retry, and loaded. The empty state says *why* it is empty,
 * because "no sources", "no run yet" and "filters too narrow" need three
 * different responses from the reader.
 */

import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { useBulkStatus, useJobs, useStats, useStatuses, useTriggerRun } from '../api/queries'
import type { ApplicationStatus } from '../api/types'
import { useAuth } from '../auth/AuthProvider'
import { Button, Panel } from '../components/ui'
import { FilterBar } from '../dashboard/FilterBar'
import { JobTable } from '../dashboard/JobTable'
import { LastRunIndicator, StatTiles } from '../dashboard/StatTiles'
import { useJobFilters } from '../dashboard/useJobFilters'

export default function Dashboard() {
  const { user, logout } = useAuth()
  const { filters, setFilters, reset, queryString, activeCount } = useJobFilters()

  const jobs = useJobs(queryString)
  const stats = useStats()
  const statuses = useStatuses()
  const triggerRun = useTriggerRun()
  const bulkStatus = useBulkStatus()

  const [selected, setSelected] = useState<Set<number>>(new Set())

  const rows = jobs.data?.results ?? []
  const totalPages = useMemo(
    () => (jobs.data ? Math.max(1, Math.ceil(jobs.data.count / filters.pageSize)) : 1),
    [jobs.data, filters.pageSize],
  )

  function toggleSelect(id: number) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(rows.map((job) => job.id)) : new Set())
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[1400px] flex-col gap-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold">Jobs</h1>
          <LastRunIndicator lastRunAt={stats.data?.lastRunAt} />
        </div>

        <nav className="flex items-center gap-1" aria-label="Main">
          <NavLink to="/app/profile">Profile</NavLink>
          <NavLink to="/app/runs">Runs</NavLink>
          <Button
            variant="secondary"
            onClick={() => triggerRun.mutate()}
            disabled={triggerRun.isPending}
          >
            {triggerRun.isPending ? 'Starting…' : 'Run now'}
          </Button>
          <Button variant="ghost" onClick={() => void logout()}>
            Sign out
          </Button>
        </nav>
      </header>

      <p className="sr-only">Signed in as {user?.email}</p>

      {stats.isPending && <TileSkeleton />}
      {stats.data && <StatTiles stats={stats.data} />}

      <FilterBar
        filters={filters}
        setFilters={setFilters}
        reset={reset}
        activeCount={activeCount}
        statuses={statuses.data ?? []}
        resultCount={jobs.data?.count}
      />

      {selected.size > 0 && (
        <BulkBar
          count={selected.size}
          disabled={bulkStatus.isPending}
          statuses={statuses.data ?? []}
          onApply={(status) =>
            bulkStatus.mutate(
              { ids: [...selected], status },
              { onSuccess: () => setSelected(new Set()) },
            )
          }
          onClear={() => setSelected(new Set())}
        />
      )}

      {jobs.isPending && <RowSkeleton />}

      {jobs.isError && (
        <Panel>
          <p role="alert" className="text-sm">
            Could not load your jobs.{' '}
            <button
              type="button"
              onClick={() => void jobs.refetch()}
              className="font-medium underline underline-offset-2"
            >
              Retry
            </button>
          </p>
        </Panel>
      )}

      {jobs.data && rows.length === 0 && (
        <EmptyState
          hasFilters={activeCount > 0}
          neverRun={!stats.data?.lastRunAt}
          onClear={reset}
          onRun={() => triggerRun.mutate()}
          running={triggerRun.isPending}
        />
      )}

      {rows.length > 0 && (
        <>
          <JobTable
            jobs={rows}
            statuses={statuses.data ?? []}
            filters={filters}
            setFilters={setFilters}
            selected={selected}
            onToggleSelect={toggleSelect}
            onToggleAll={toggleAll}
          />

          <nav aria-label="Pagination" className="flex items-center justify-between gap-3 text-sm">
            <Button
              variant="secondary"
              disabled={filters.page <= 1}
              onClick={() => setFilters({ page: filters.page - 1 })}
            >
              Previous
            </Button>
            <p aria-live="polite" className="text-muted">
              Page {filters.page} of {totalPages}
            </p>
            <Button
              variant="secondary"
              disabled={filters.page >= totalPages}
              onClick={() => setFilters({ page: filters.page + 1 })}
            >
              Next
            </Button>
          </nav>
        </>
      )}
    </div>
  )
}

function NavLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="inline-flex min-h-[44px] items-center rounded-lg px-3 text-sm hover:bg-surface"
    >
      {children}
    </Link>
  )
}

function BulkBar({
  count,
  statuses,
  disabled,
  onApply,
  onClear,
}: {
  count: number
  statuses: { value: ApplicationStatus; label: string }[]
  disabled: boolean
  onApply: (status: ApplicationStatus) => void
  onClear: () => void
}) {
  return (
    <div
      role="region"
      aria-label="Bulk actions"
      className="flex flex-wrap items-center gap-3 rounded-[10px] border border-accent/40 bg-accent/5 p-3 text-sm"
    >
      <span aria-live="polite">{count} selected</span>
      <label htmlFor="bulk-status" className="sr-only">
        Set status for selected jobs
      </label>
      <select
        id="bulk-status"
        defaultValue=""
        disabled={disabled}
        onChange={(event) => {
          if (event.target.value) onApply(event.target.value as ApplicationStatus)
        }}
        className="min-h-[44px] rounded-lg border border-hairline bg-surface px-2 text-sm"
      >
        <option value="">Set status…</option>
        {statuses.map((status) => (
          <option key={status.value} value={status.value}>
            {status.label}
          </option>
        ))}
      </select>
      <Button variant="ghost" onClick={onClear}>
        Clear selection
      </Button>
    </div>
  )
}

/**
 * Three different empty states.
 *
 * "Nothing here" is useless advice. Whether to widen the filters, wait for a
 * run, or add a source are three different actions.
 */
function EmptyState({
  hasFilters,
  neverRun,
  onClear,
  onRun,
  running,
}: {
  hasFilters: boolean
  neverRun: boolean
  onClear: () => void
  onRun: () => void
  running: boolean
}) {
  if (hasFilters) {
    return (
      <Panel className="text-center">
        <h2 className="font-medium">No jobs match these filters</h2>
        <p className="mt-1 text-sm text-muted">
          Your filters are narrower than the current list. Widening them is usually enough.
        </p>
        <Button variant="secondary" onClick={onClear} className="mt-4">
          Clear filters
        </Button>
      </Panel>
    )
  }

  if (neverRun) {
    return (
      <Panel className="text-center">
        <h2 className="font-medium">Nothing fetched yet</h2>
        <p className="mt-1 text-sm text-muted">
          No run has finished. The scheduled run happens each morning, or you can start one now.
        </p>
        <Button onClick={onRun} disabled={running} className="mt-4">
          {running ? 'Starting…' : 'Run now'}
        </Button>
      </Panel>
    )
  }

  return (
    <Panel className="text-center">
      <h2 className="font-medium">No open jobs match your profile</h2>
      <p className="mt-1 text-sm text-muted">
        The last run found nothing that passes your filters. Widening your cities or lowering a
        weight on your profile usually helps.
      </p>
      <Link
        to="/app/profile"
        className="mt-4 inline-flex min-h-[44px] items-center rounded-lg border border-hairline px-4 text-sm"
      >
        Open profile
      </Link>
    </Panel>
  )
}

/** Skeletons rather than spinners: the layout does not jump when data lands. */
function TileSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-hidden="true">
      {[0, 1, 2, 3].map((index) => (
        <div key={index} className="h-[86px] rounded-[10px] border border-hairline bg-surface" />
      ))}
    </div>
  )
}

function RowSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      <span className="sr-only" role="status">
        Loading your jobs
      </span>
      {[0, 1, 2, 3, 4, 5].map((index) => (
        <div
          key={index}
          aria-hidden="true"
          className="h-[72px] rounded-lg border border-hairline bg-surface"
        />
      ))}
    </div>
  )
}
