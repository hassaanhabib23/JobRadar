/**
 * The dashboard — the screen this whole system exists to produce.
 *
 * A 3-column workspace on a wide screen: filters | job cards | detail panel.
 * Selecting a card opens its full breakdown inline, on the right, with no page
 * navigation — the list stays exactly where it was. Below the portal's
 * breakpoint (`PORTAL_WIDE`, matching Tailwind's `xl:`) there is no room for a
 * third column, so a card's title is a real link to `/app/jobs/:id` and
 * behaves like one.
 *
 * Full-bleed inside the app shell. A centred column would waste the right half
 * of a wide monitor on the one screen whose job is fitting more rows on it.
 *
 * Four states on every async surface: loading (skeletons, not spinners), empty,
 * error with a retry, and loaded. The empty state says *why* it is empty,
 * because "no run yet" and "filters too narrow" need different responses.
 */

import { useMemo, useState, type MouseEvent } from 'react'
import { useSearchParams } from 'react-router-dom'

import { useBulkStatus, useJobs, useStats, useStatuses, useTriggerRun } from '../api/queries'
import type { ApplicationStatus } from '../api/types'
import { AppShell } from '../components/AppShell'
import { IconBriefcase, IconRadar, IconSearch, IconTarget } from '../components/icons'
import { PORTAL_WIDE, useMediaQuery } from '../components/useMediaQuery'
import { Button, EmptyState, ErrorState, Panel, Skeleton, Spinner } from '../components/ui'
import { FilterBar } from '../dashboard/FilterBar'
import { JobCard } from '../dashboard/JobCard'
import { JobDetailContent } from '../dashboard/JobDetailContent'
import { LastRunIndicator, StatTiles, StatTilesSkeleton } from '../dashboard/StatTiles'
import { useJobFilters } from '../dashboard/useJobFilters'

const SORTS: { value: string; label: string }[] = [
  { value: '-posted_at', label: 'Newest first' },
  { value: 'posted_at', label: 'Oldest first' },
  { value: '-score', label: 'Highest score' },
  { value: 'score', label: 'Lowest score' },
  { value: 'company', label: 'Company A–Z' },
  { value: '-company', label: 'Company Z–A' },
]

export default function Dashboard() {
  const { filters, setFilters, reset, queryString, activeCount } = useJobFilters()

  const jobs = useJobs(queryString)
  const stats = useStats()
  const statuses = useStatuses()
  const triggerRun = useTriggerRun()
  const bulkStatus = useBulkStatus()

  const [selected, setSelected] = useState<Set<number>>(new Set())

  const wide = useMediaQuery(PORTAL_WIDE)

  // The selected job seeds from the URL (a shared link, a refresh right after
  // picking one) but is not fully round-tripped afterward: `useJobFilters`
  // rewrites the whole query string on every filter change, which would
  // otherwise fight over the same URL. The panel itself never depends on the
  // URL after mount, so that trade-off costs nothing visible.
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedJobId, setSelectedJobId] = useState<number | null>(() => {
    const raw = searchParams.get('job')
    return raw ? Number(raw) : null
  })

  function selectJob(id: number | null) {
    setSelectedJobId(id)
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous)
        if (id) next.set('job', String(id))
        else next.delete('job')
        return next
      },
      { replace: true },
    )
  }

  function openCard(id: number) {
    return (event: MouseEvent) => {
      // Below the portal's breakpoint there is no panel to open — let the
      // card's real `<Link>` navigate to the standalone page.
      if (!wide) return
      // A modified click (new tab, new window) should do what it always does.
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
        return
      }
      event.preventDefault()
      selectJob(id)
    }
  }

  const rows = jobs.data?.results ?? []
  const totalPages = useMemo(
    () => (jobs.data ? Math.max(1, Math.ceil(jobs.data.count / filters.pageSize)) : 1),
    [jobs.data, filters.pageSize],
  )
  const allSelected = rows.length > 0 && rows.every((job) => selected.has(job.id))

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
        // One row at every width. The bar has a fixed height, so anything that
        // wraps here pushes the heading out of the top of it.
        <div className="flex min-w-0 flex-1 items-center justify-between gap-2 sm:gap-3">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <h1 className="text-md font-extrabold tracking-tight">Jobs</h1>
            <LastRunIndicator lastRunAt={stats.data?.lastRunAt} />
          </div>
          <Button
            size="sm"
            className="shrink-0"
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

        {/* --- The 3-column workspace: filters | cards | detail panel --- */}
        <div className="grid gap-4 xl:grid-cols-[272px_minmax(0,1fr)_420px] xl:items-start">
          <FilterBar
            filters={filters}
            setFilters={setFilters}
            reset={reset}
            activeCount={activeCount}
            statuses={statuses.data ?? []}
            sources={stats.data?.bySource ?? {}}
            resultCount={jobs.data?.count}
          />

          <div className="flex min-w-0 flex-col gap-3">
            {rows.length > 0 && (
              <div className="surface flex flex-wrap items-center gap-3 p-2.5">
                <label className="flex items-center gap-2 pl-1.5 text-sm text-muted">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={(event) =>
                      setSelected(
                        event.target.checked ? new Set(rows.map((job) => job.id)) : new Set(),
                      )
                    }
                    className="h-4 w-4 accent-[var(--accent)]"
                  />
                  Select all jobs on this page
                </label>

                <label htmlFor="sort-by" className="ml-auto text-xs text-subtle">
                  Sort by
                </label>
                <select
                  id="sort-by"
                  value={filters.ordering}
                  onChange={(event) => setFilters({ ordering: event.target.value })}
                  className="h-9 rounded-sm border border-hairline-strong bg-surface-inset px-2.5 text-sm font-medium shadow-e0 focus:shadow-ring focus:outline-none"
                >
                  {SORTS.map((sort) => (
                    <option key={sort.value} value={sort.value}>
                      {sort.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {jobs.isPending && (
              <div className="flex flex-col gap-3">
                <span className="sr-only" role="status">
                  Loading your jobs
                </span>
                {Array.from({ length: 6 }).map((_, index) => (
                  <Skeleton key={index} className="h-[172px]" />
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
                <ul className="flex flex-col gap-3">
                  {rows.map((job) => (
                    <JobCard
                      key={job.id}
                      job={job}
                      statuses={statuses.data ?? []}
                      selected={selected.has(job.id)}
                      onToggleSelect={toggleSelect}
                      active={wide && selectedJobId === job.id}
                      onOpen={openCard(job.id)}
                    />
                  ))}
                </ul>

                <nav
                  aria-label="Pagination"
                  className="surface flex items-center justify-between gap-3 p-3 text-sm"
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

          {wide && (
            <aside className="sticky top-[calc(var(--topbar-h)+1rem)] max-h-[calc(100vh-var(--topbar-h)-2rem)] overflow-y-auto">
              {selectedJobId ? (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between px-1">
                    <h2 className="text-xs font-bold uppercase tracking-wide text-subtle">
                      Job details
                    </h2>
                    <button
                      type="button"
                      onClick={() => selectJob(null)}
                      className="text-xs font-semibold text-muted hover:text-fg"
                    >
                      Close
                    </button>
                  </div>
                  <JobDetailContent jobId={selectedJobId} />
                </div>
              ) : (
                <EmptyState
                  icon={<IconTarget size={18} />}
                  title="Select a job"
                  description="Pick a card from the list to see its full score breakdown, timeline and notes here."
                />
              )}
            </aside>
          )}
        </div>
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
      elevation="glass"
      className="sticky top-topbar z-10 flex flex-wrap items-center gap-3 border-accent-border bg-accent-subtle p-3.5 shadow-e2"
    >
      <span aria-live="polite" className="text-sm font-bold text-accent">
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
        className="h-9 rounded-sm border border-hairline-strong bg-surface px-2.5 text-sm font-medium shadow-e0 focus:shadow-ring focus:outline-none"
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
