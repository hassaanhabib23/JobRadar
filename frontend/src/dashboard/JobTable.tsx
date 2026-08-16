/**
 * The results table.
 *
 * Sorting and paging are server-side — the dashboard has to hold up at 5,000+
 * stored jobs, which rules out fetching everything and sorting in the browser.
 *
 * Under 1024px it becomes cards, and only one layout is ever in the DOM.
 * Hiding a duplicate with CSS leaves both there: duplicated element ids, and
 * every control announced twice.
 */

import { Link } from 'react-router-dom'

import type { Job, StatusChoice } from '../api/types'
import { IconArrowDown, IconArrowUp, IconExternal, IconSort } from '../components/icons'
import { WIDE_SCREEN, useMediaQuery } from '../components/useMediaQuery'
import { Badge, cx } from '../components/ui'
import { Badges } from './badges'
import { ScoreBar, TIER_TONE } from './ScoreBar'
import { StatusSelect } from './StatusSelect'
import type { JobFilters } from './useJobFilters'

const COLUMNS: { key: string; label: string; ordering?: string; className?: string }[] = [
  { key: 'select', label: '', className: 'w-9' },
  { key: 'score', label: 'Score', ordering: 'score', className: 'w-[150px]' },
  { key: 'role', label: 'Role' },
  { key: 'company', label: 'Company', ordering: 'company', className: 'w-[150px]' },
  { key: 'posted', label: 'Posted', ordering: 'posted_at', className: 'w-[92px]' },
  { key: 'status', label: 'Status', className: 'w-[150px]' },
  { key: 'apply', label: '', className: 'w-[76px]' },
]

export function JobTable({
  jobs,
  statuses,
  filters,
  setFilters,
  selected,
  onToggleSelect,
  onToggleAll,
}: {
  jobs: Job[]
  statuses: StatusChoice[]
  filters: JobFilters
  setFilters: (patch: Partial<JobFilters>) => void
  selected: Set<number>
  onToggleSelect: (id: number) => void
  onToggleAll: (checked: boolean) => void
}) {
  const wide = useMediaQuery(WIDE_SCREEN)
  const allSelected = jobs.length > 0 && jobs.every((job) => selected.has(job.id))

  function sortBy(ordering: string) {
    // Clicking the active column flips direction; a new column starts in the
    // direction that reads naturally for it.
    const current = filters.ordering
    if (current === ordering) return setFilters({ ordering: `-${ordering}` })
    if (current === `-${ordering}`) return setFilters({ ordering })
    return setFilters({ ordering: ordering === 'score' ? `-${ordering}` : ordering })
  }

  function ariaSort(ordering?: string): 'ascending' | 'descending' | 'none' | undefined {
    if (!ordering) return undefined
    if (filters.ordering === ordering) return 'ascending'
    if (filters.ordering === `-${ordering}`) return 'descending'
    return 'none'
  }

  if (!wide) {
    return (
      <ul className="flex flex-col gap-2.5">
        {jobs.map((job) => (
          <li
            key={job.id}
            className="rounded-lg border border-hairline bg-surface p-4 transition-colors duration-fast"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <RoleCell job={job} />
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <span className="tabular text-lg font-semibold leading-none">{job.score}</span>
                <Badge tone={TIER_TONE[job.tier as keyof typeof TIER_TONE] ?? 'neutral'}>
                  {job.tier}
                </Badge>
              </div>
            </div>

            <ScoreBar detail={job.detail} score={job.score} className="mt-3" />

            <p className="mt-2.5 text-xs text-subtle">
              {job.company} · <PostedCell job={job} />
            </p>

            <div className="mt-3 flex items-center gap-2">
              <label className="sr-only" htmlFor={`select-${job.id}`}>
                Select {job.title}
              </label>
              <input
                id={`select-${job.id}`}
                type="checkbox"
                checked={selected.has(job.id)}
                onChange={() => onToggleSelect(job.id)}
                className="h-4 w-4 accent-[var(--accent)]"
              />
              <StatusSelect job={job} choices={statuses} className="flex-1" />
              <ApplyLink job={job} />
            </div>
          </li>
        ))}
      </ul>
    )
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-hairline bg-surface">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">
          Your jobs, sorted by {filters.ordering.replace('-', '')}
        </caption>
        <thead>
          <tr className="border-b border-hairline bg-bg-subtle text-left">
            {COLUMNS.map((column) => (
              <th
                key={column.key}
                scope="col"
                aria-sort={ariaSort(column.ordering)}
                className={cx(
                  'px-3 py-2 text-2xs font-medium uppercase tracking-wide text-subtle',
                  column.className,
                )}
              >
                {column.key === 'select' ? (
                  <>
                    <label className="sr-only" htmlFor="select-all">
                      Select all jobs on this page
                    </label>
                    <input
                      id="select-all"
                      type="checkbox"
                      checked={allSelected}
                      onChange={(event) => onToggleAll(event.target.checked)}
                      className="h-4 w-4 accent-[var(--accent)]"
                    />
                  </>
                ) : column.ordering ? (
                  <button
                    type="button"
                    onClick={() => sortBy(column.ordering!)}
                    className="inline-flex items-center gap-1 uppercase tracking-wide transition-colors duration-fast hover:text-fg"
                  >
                    {column.label}
                    <SortMark direction={ariaSort(column.ordering)} />
                  </button>
                ) : (
                  column.label
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => (
            <tr
              key={job.id}
              className={cx(
                'border-b border-hairline align-top last:border-0',
                'transition-colors duration-fast hover:bg-surface-hover',
                selected.has(job.id) && 'bg-accent-subtle',
              )}
            >
              <td className="px-3 py-3">
                <label className="sr-only" htmlFor={`select-${job.id}`}>
                  Select {job.title}
                </label>
                <input
                  id={`select-${job.id}`}
                  type="checkbox"
                  checked={selected.has(job.id)}
                  onChange={() => onToggleSelect(job.id)}
                  className="h-4 w-4 accent-[var(--accent)]"
                />
              </td>

              <td className="px-3 py-3">
                <div className="flex items-baseline gap-2">
                  <span className="tabular text-md font-semibold leading-none">{job.score}</span>
                  <Badge tone={TIER_TONE[job.tier as keyof typeof TIER_TONE] ?? 'neutral'}>
                    {job.tier}
                  </Badge>
                </div>
                <ScoreBar detail={job.detail} score={job.score} className="mt-2" />
              </td>

              <td className="px-3 py-3">
                <RoleCell job={job} />
              </td>

              <td className="px-3 py-3 text-muted">{job.company}</td>

              <td className="px-3 py-3 text-subtle">
                <PostedCell job={job} />
              </td>

              <td className="px-3 py-3">
                <StatusSelect job={job} choices={statuses} />
              </td>

              <td className="px-3 py-3">
                <ApplyLink job={job} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function RoleCell({ job }: { job: Job }) {
  const reasons = job.detail?.notes ?? []
  const skills = job.detail?.skillsHit ?? []

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <Link
        to={`/app/jobs/${job.id}`}
        className="font-medium text-fg underline-offset-2 hover:text-accent hover:underline"
      >
        {job.title}
      </Link>

      <p className="text-xs text-subtle">{job.location || 'Location not stated'}</p>

      {reasons.length > 0 && (
        // The "show why" half of the promise. Without it the score is a number
        // with no argument behind it.
        <p className="text-xs text-muted">{reasons.join(' · ')}</p>
      )}

      {skills.length > 0 && (
        <p className="text-xs">
          <span className="text-subtle">Matched: </span>
          <span className="text-muted">{skills.slice(0, 6).join(', ')}</span>
        </p>
      )}

      <Badges job={job} />
    </div>
  )
}

function PostedCell({ job }: { job: Job }) {
  if (!job.postedAt) {
    return (
      <span className="text-subtle" title="The source gave no date">
        no date
      </span>
    )
  }
  const posted = new Date(job.postedAt)
  const days = Math.round((Date.now() - posted.getTime()) / 86_400_000)
  return (
    <span className="tabular" title={posted.toLocaleDateString()}>
      {days <= 0 ? 'today' : `${days}d`}
    </span>
  )
}

function ApplyLink({ job }: { job: Job }) {
  if (!job.url) return null
  return (
    <a
      href={job.url}
      target="_blank"
      rel="noopener noreferrer"
      className={cx(
        'inline-flex h-9 min-h-[36px] items-center gap-1.5 rounded border border-hairline px-2.5',
        'text-sm text-muted transition-colors duration-fast',
        'hover:border-accent-border hover:bg-accent-subtle hover:text-accent',
      )}
    >
      Apply
      <IconExternal size={12} />
      <span className="sr-only">
        {' '}
        to {job.title} at {job.company} (opens in a new tab)
      </span>
    </a>
  )
}

function SortMark({ direction }: { direction?: string | undefined }) {
  if (direction === 'ascending') return <IconArrowUp size={12} className="text-accent" />
  if (direction === 'descending') return <IconArrowDown size={12} className="text-accent" />
  return <IconSort size={12} className="opacity-40" />
}
