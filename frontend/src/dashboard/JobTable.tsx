/**
 * The results table.
 *
 * Sorting and paging are server-side — the dashboard has to stay responsive at
 * 5,000+ stored jobs, which rules out fetching everything and sorting in the
 * browser. TanStack Table is used purely for structure; it never sorts or
 * filters here.
 *
 * Under 900px the table becomes cards. A 9-column grid on a phone is unusable,
 * and this is checked on a phone as often as a laptop.
 */

import { Link } from 'react-router-dom'

import { WIDE_SCREEN, useMediaQuery } from '../components/useMediaQuery'

import type { Job, StatusChoice } from '../api/types'
import { cx } from '../components/ui'
import { Badges } from './badges'
import { ScoreCell } from './ScoreBar'
import { StatusSelect } from './StatusSelect'
import type { JobFilters } from './useJobFilters'

const COLUMNS: { key: string; label: string; ordering?: string; className?: string }[] = [
  { key: 'select', label: '', className: 'w-10' },
  { key: 'score', label: 'Score', ordering: 'score', className: 'w-[168px]' },
  { key: 'role', label: 'Role', ordering: 'title' },
  { key: 'company', label: 'Company', ordering: 'company', className: 'w-[150px]' },
  { key: 'posted', label: 'Posted', ordering: 'posted_at', className: 'w-[110px]' },
  { key: 'status', label: 'Status', className: 'w-[170px]' },
  { key: 'apply', label: '', className: 'w-[90px]' },
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
  const allSelected = jobs.length > 0 && jobs.every((job) => selected.has(job.id))
  // One layout at a time: rendering both and hiding one with CSS duplicates
  // every element id and announces every control twice.
  const wide = useMediaQuery(WIDE_SCREEN)

  function sortBy(ordering: string) {
    // Clicking the active column flips direction; a new column starts descending
    // for score and ascending for everything else, which is what reads naturally.
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
      <ul className="flex flex-col gap-3">
        {jobs.map((job) => (
          <li key={job.id} className="rounded-[10px] border border-hairline bg-surface p-4">
            <div className="flex items-start justify-between gap-3">
              <RoleCell job={job} />
              <input
                type="checkbox"
                aria-label={`Select ${job.title}`}
                checked={selected.has(job.id)}
                onChange={() => onToggleSelect(job.id)}
              />
            </div>
            <p className="mt-1 text-sm text-muted">
              {job.company} · <PostedCell job={job} />
            </p>
            <div className="mt-3">
              <ScoreCell score={job.score} tier={job.tier} detail={job.detail} />
            </div>
            <div className="mt-3 flex items-center gap-2">
              <StatusSelect job={job} choices={statuses} compact />
              <ApplyLink job={job} />
            </div>
          </li>
        ))}
      </ul>
    )
  }

  return (
    <>
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">
          Your jobs, sorted by {filters.ordering.replace('-', '')}
        </caption>
        <thead>
          <tr className="border-b border-hairline text-left text-xs uppercase tracking-wide text-muted">
            {COLUMNS.map((column) => (
              <th
                key={column.key}
                scope="col"
                aria-sort={ariaSort(column.ordering)}
                className={cx('px-2 py-2 font-medium', column.className)}
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
                    />
                  </>
                ) : column.ordering ? (
                  <button
                    type="button"
                    onClick={() => sortBy(column.ordering!)}
                    className="inline-flex items-center gap-1 hover:text-fg"
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
            <tr key={job.id} className="border-b border-hairline align-top hover:bg-surface">
              <td className="px-2 py-3">
                <label className="sr-only" htmlFor={`select-${job.id}`}>
                  Select {job.title}
                </label>
                <input
                  id={`select-${job.id}`}
                  type="checkbox"
                  checked={selected.has(job.id)}
                  onChange={() => onToggleSelect(job.id)}
                />
              </td>
              <td className="px-2 py-3">
                <ScoreCell score={job.score} tier={job.tier} detail={job.detail} />
              </td>
              <td className="px-2 py-3">
                <RoleCell job={job} />
              </td>
              <td className="px-2 py-3">{job.company}</td>
              <td className="px-2 py-3 text-muted">
                <PostedCell job={job} />
              </td>
              <td className="px-2 py-3">
                <StatusSelect job={job} choices={statuses} />
              </td>
              <td className="px-2 py-3">
                <ApplyLink job={job} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

function RoleCell({ job }: { job: Job }) {
  const detail = job.detail
  const reasons = detail?.notes ?? []
  const skills = detail?.skillsHit ?? []

  return (
    <div className="flex flex-col gap-1">
      <Link to={`/app/jobs/${job.id}`} className="font-medium underline-offset-2 hover:underline">
        {job.title}
      </Link>
      <p className="text-xs text-muted">{job.location || 'Location not stated'}</p>
      {reasons.length > 0 && (
        // The "show why" half of the promise. Without it the score is a number
        // with no argument behind it.
        <p className="text-xs text-muted">{reasons.join(' · ')}</p>
      )}
      {skills.length > 0 && (
        <p className="text-xs">
          <span className="text-muted">Matched: </span>
          {skills.slice(0, 6).join(', ')}
        </p>
      )}
      <Badges job={job} />
    </div>
  )
}

function PostedCell({ job }: { job: Job }) {
  if (!job.postedAt) return <span title="The source gave no date">no date</span>
  const posted = new Date(job.postedAt)
  const days = Math.round((Date.now() - posted.getTime()) / 86_400_000)
  return <span title={posted.toLocaleDateString()}>{days <= 0 ? 'today' : `${days}d ago`}</span>
}

function ApplyLink({ job }: { job: Job }) {
  if (!job.url) return null
  return (
    <a
      href={job.url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-[44px] items-center rounded-lg border border-hairline px-3 text-sm hover:bg-surface-strong"
    >
      Apply
      <span className="sr-only">
        {' '}
        to {job.title} at {job.company} (opens in a new tab)
      </span>
    </a>
  )
}

function SortMark({ direction }: { direction?: string | undefined }) {
  if (direction === 'ascending') return <span aria-hidden="true">↑</span>
  if (direction === 'descending') return <span aria-hidden="true">↓</span>
  return (
    <span aria-hidden="true" className="opacity-30">
      ↕
    </span>
  )
}
