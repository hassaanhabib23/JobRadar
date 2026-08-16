/**
 * The dashboard — the screen this whole system exists to produce.
 *
 * Full-bleed inside the app shell. A centred column would waste the right half
 * of a wide monitor on the one screen whose job is fitting more rows on it.
 *
 * Four states on every async surface: loading (skeletons, not spinners), empty,
 * error with a retry, and loaded. The empty state says *why* it is empty,
 * because "no run yet" and "filters too narrow" need different responses.
 */

import { useMemo, useState } from 'react'

import { useBulkStatus, useJobs, useStats, useStatuses, useTriggerRun } from '../api/queries'
import type { ApplicationStatus } from '../api/types'
import { AppShell } from '../components/AppShell'
import { IconBriefcase, IconRadar, IconSearch } from '../components/icons'
import { Button, EmptyState, ErrorState, Panel, Skeleton, Spinner } from '../components/ui'
import { FilterBar } from '../dashboard/FilterBar'
import { JobTable } from '../dashboard/JobTable'
import { LastRunIndicator, StatTiles, StatTilesSkeleton } from '../dashboard/StatTiles'
import { useJobFilters } from '../dashboard/useJobFilters'

export default function Dashboard() {
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

  return (
    <AppShell
      topbar={
        <div className="flex flex-1 flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-md font-semibold">Jobs</h1>
            <LastRunIndicator lastRunAt={stats.data?.lastRunAt} />
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => triggerRun.mutate()}
            disabled={triggerRun.isPending}
          >
            <IconRadar size={14} />
            {triggerRun.isPending ? 'Starting…' : 'Run now'}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {stats.isPending ? <StatTilesSkeleton /> : stats.data && <StatTiles stats={stats.data} />}

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

        {jobs.isPending && (
          <div className="flex flex-col gap-2">
            <span className="sr-only" role="status">
              Loading your jobs
            </span>
            {Array.from({ length: 8 }).map((_, index) => (
              <Skeleton key={index} className="h-[76px]" />
            ))}
          </div>
        )}

        {jobs.isError && (
          <ErrorState message="Could not load your jobs." onRetry={() => void jobs.refetch()} />
        )}

        {jobs.data && rows.length === 0 && (
          <DashboardEmpty
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
              onToggleAll={(checked) =>
                setSelected(checked ? new Set(rows.map((job) => job.id)) : new Set())
              }
            />

            <nav
              aria-label="Pagination"
              className="flex items-center justify-between gap-3 pb-2 text-sm"
            >
              <Button
                variant="secondary"
                size="sm"
                disabled={filters.page <= 1}
                onClick={() => setFilters({ page: filters.page - 1 })}
              >
                Previous
              </Button>
              <p aria-live="polite" className="text-muted">
                Page <span className="tabular">{filters.page}</span> of{' '}
                <span className="tabular">{totalPages}</span>
                {jobs.isFetching && <span className="ml-2 text-subtle">updating…</span>}
              </p>
              <Button
                variant="secondary"
                size="sm"
                disabled={filters.page >= totalPages}
                onClick={() => setFilters({ page: filters.page + 1 })}
              >
                Next
              </Button>
            </nav>
          </>
        )}
      </div>
    </AppShell>
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
    <Panel
      as="div"
      className="sticky top-topbar z-10 flex flex-wrap items-center gap-3 border-accent-border bg-accent-subtle p-3"
    >
      <span aria-live="polite" className="text-sm font-medium">
        <span className="tabular">{count}</span> selected
      </span>

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
        className="h-9 rounded border border-hairline bg-surface px-2 text-sm"
      >
        <option value="">Set status…</option>
        {statuses.map((status) => (
          <option key={status.value} value={status.value}>
            {status.label}
          </option>
        ))}
      </select>

      {disabled && <Spinner label="Updating" />}

      <Button variant="ghost" size="sm" onClick={onClear} className="ml-auto">
        Clear selection
      </Button>
    </Panel>
  )
}

/**
 * Three different empty states.
 *
 * "Nothing here" is useless advice. Whether to widen the filters, wait for a
 * run, or loosen the profile are three different actions.
 */
function DashboardEmpty({
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
      <EmptyState
        icon={<IconSearch size={18} />}
        title="No jobs match these filters"
        description="Your filters are narrower than the current list. Widening them is usually enough."
        action={
          <Button variant="secondary" onClick={onClear}>
            Clear filters
          </Button>
        }
      />
    )
  }

  if (neverRun) {
    return (
      <EmptyState
        icon={<IconRadar size={18} />}
        title="Nothing fetched yet"
        description="No run has finished. The scheduled run happens each morning, or you can start one now — it usually takes under a minute."
        action={
          <Button onClick={onRun} disabled={running}>
            {running ? 'Starting…' : 'Run now'}
          </Button>
        }
      />
    )
  }

  return (
    <EmptyState
      icon={<IconBriefcase size={18} />}
      title="No open jobs match your profile"
      description="The last run found nothing that passes your filters. Widening your cities, or lowering a weight on your profile, usually helps."
      action={
        <a href="/app/profile">
          <Button variant="secondary">Open profile</Button>
        </a>
      }
    />
  )
}
