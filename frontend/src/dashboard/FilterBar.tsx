/**
 * The filter sidebar.
 *
 * Filters are visible, not hidden behind a "Filters" button — a filter you
 * cannot see is a filter you forget is on, and then the list looks wrong for
 * reasons you cannot explain. A vertical column rather than a wrapping bar: it
 * is the left third of the 3-column job portal (filters | results | detail),
 * so every control gets the full row width instead of being squeezed into a
 * compact select.
 *
 * Search is debounced so typing does not fire a request per keystroke;
 * everything else commits immediately. All of it goes into the URL.
 */

import { useEffect, useState, type ReactNode } from 'react'

import type { StatusChoice } from '../api/types'
import { IconClose, IconSearch } from '../components/icons'
import { Button, Chip, cx } from '../components/ui'
import type { JobFilters } from './useJobFilters'

/**
 * Human names for the places jobs come from.
 *
 * Built from the sources actually present in your data, so it never offers a
 * filter that would return nothing — and it never shows the name of a Python
 * library where a job board belongs.
 */
export const SOURCE_LABELS: Record<string, string> = {
  linkedin: 'LinkedIn',
  indeed: 'Indeed',
  bayt: 'Bayt',
  google: 'Google Jobs',
  glassdoor: 'Glassdoor',
  zip_recruiter: 'ZipRecruiter',
  greenhouse: 'Greenhouse',
  lever: 'Lever',
  workable: 'Workable',
  breezy: 'Breezy',
  ashby: 'Ashby',
  smartrecruiters: 'SmartRecruiters',
  recruitee: 'Recruitee',
  workday: 'Workday',
  rss: 'RSS feed',
  jobspy: 'Job boards',
}

export function sourceLabel(value: string): string {
  return SOURCE_LABELS[value] ?? value
}

const CITIES = [
  { value: 'islamabad', label: 'Islamabad' },
  { value: 'rawalpindi', label: 'Rawalpindi' },
  { value: 'lahore', label: 'Lahore' },
  { value: 'karachi', label: 'Karachi' },
  { value: 'remote_pk', label: 'Remote (PK)' },
]

export function FilterBar({
  filters,
  setFilters,
  reset,
  activeCount,
  statuses,
  sources,
  resultCount,
}: {
  filters: JobFilters
  setFilters: (patch: Partial<JobFilters>) => void
  reset: () => void
  activeCount: number
  statuses: StatusChoice[]
  /** Sources present in this user's data, with counts, from /api/stats/. */
  sources: Record<string, number>
  resultCount: number | undefined
}) {
  const [searchDraft, setSearchDraft] = useState(filters.search)

  // Keep the box in step when the URL changes underneath — the back button, or
  // a shared link opened in place.
  useEffect(() => setSearchDraft(filters.search), [filters.search])

  useEffect(() => {
    if (searchDraft === filters.search) return
    const timer = setTimeout(() => setFilters({ search: searchDraft }), 300)
    return () => clearTimeout(timer)
  }, [searchDraft, filters.search, setFilters])

  return (
    <section aria-label="Filters" className="surface flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold uppercase tracking-wide text-subtle">Filters</h2>
        {activeCount > 0 && (
          <Button variant="ghost" size="sm" onClick={reset} className="!h-7 !px-2 text-xs">
            <IconClose size={12} />
            Clear {activeCount} filter{activeCount === 1 ? '' : 's'}
          </Button>
        )}
      </div>

      <p aria-live="polite" className="-mt-2 text-sm text-muted">
        {resultCount === undefined ? (
          'Loading…'
        ) : (
          <>
            <span className="tabular text-md font-extrabold text-fg">{resultCount}</span> job
            {resultCount === 1 ? '' : 's'}
          </>
        )}
      </p>

      <div className="relative">
        <label htmlFor="job-search" className="sr-only">
          Search jobs
        </label>
        <IconSearch
          size={15}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle"
        />
        <input
          id="job-search"
          type="search"
          placeholder="Search title, company or location"
          value={searchDraft}
          onChange={(event) => setSearchDraft(event.target.value)}
          className="h-10 w-full rounded-sm border border-hairline-strong bg-surface-inset pl-9 pr-3 text-base transition-all duration-fast placeholder:text-subtle focus:border-accent focus:bg-surface focus:shadow-ring focus:outline-none"
        />
      </div>

      <LabeledField label="Tier" value={filters.tier} onChange={(tier) => setFilters({ tier })}>
        <option value="">Any tier</option>
        <option value="High">High</option>
        <option value="Medium">Medium</option>
        <option value="Stretch">Stretch</option>
      </LabeledField>

      <LabeledField
        label="Status"
        value={filters.status}
        onChange={(status) => setFilters({ status })}
      >
        <option value="">Any status</option>
        {statuses.map((status) => (
          <option key={status.value} value={status.value}>
            {status.label}
          </option>
        ))}
      </LabeledField>

      <LabeledField
        label="Source"
        value={filters.source}
        onChange={(source) => setFilters({ source })}
      >
        <option value="">Any source</option>
        {Object.entries(sources)
          // Most jobs first: the useful filters sit at the top of the list.
          .sort((a, b) => b[1] - a[1])
          .map(([source, count]) => (
            <option key={source} value={source}>
              {sourceLabel(source)} ({count})
            </option>
          ))}
      </LabeledField>

      <LabeledField
        label="City"
        value={filters.location}
        onChange={(location) => setFilters({ location })}
      >
        <option value="">Any city</option>
        {CITIES.map((city) => (
          <option key={city.value} value={city.value}>
            {city.label}
          </option>
        ))}
      </LabeledField>

      <div className="flex flex-col gap-2">
        <label htmlFor="min-score" className="text-xs font-semibold text-subtle">
          Minimum score
        </label>
        <input
          id="min-score"
          type="number"
          min={0}
          max={100}
          placeholder="0"
          value={filters.minScore}
          onChange={(event) => setFilters({ minScore: event.target.value })}
          className="tabular h-10 w-full rounded-sm border border-hairline-strong bg-surface-inset px-3 text-sm transition-all duration-fast focus:border-accent focus:bg-surface focus:shadow-ring focus:outline-none"
        />
      </div>

      <div className="flex flex-wrap gap-2 border-t border-hairline pt-3.5">
        <Chip checked={filters.postedToday} onChange={(postedToday) => setFilters({ postedToday })}>
          <span title="Published today, by the employer's own date. Undated postings are excluded — with no date there is no evidence.">
            Posted today
          </span>
        </Chip>
        <Chip checked={filters.isNew} onChange={(isNew) => setFilters({ isNew })}>
          {/* Deliberately not called "new today": a job posted three weeks ago
              is new *to you* the day it first reaches your list. */}
          <span title="First appeared in your list on the last run — regardless of when it was posted">
            New to you
          </span>
        </Chip>
        <Chip checked={filters.hasDate} onChange={(hasDate) => setFilters({ hasDate })}>
          <span title="Excludes undated postings and estimated ages">Has real date</span>
        </Chip>
        <Chip checked={filters.pinned} onChange={(pinned) => setFilters({ pinned })}>
          Pinned
        </Chip>
        <Chip
          checked={filters.flag === 'ghost?'}
          onChange={(checked) => setFilters({ flag: checked ? 'ghost?' : '' })}
        >
          <span title="Listed for weeks without closing">Ghosts</span>
        </Chip>
        <Chip
          checked={filters.includeClosed}
          onChange={(includeClosed) => setFilters({ includeClosed })}
        >
          Include closed
        </Chip>
      </div>
    </section>
  )
}

/** A visible-label select — the vertical sidebar has the room a compact
    horizontal bar didn't. */
function LabeledField({
  label,
  value,
  onChange,
  children,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  children: ReactNode
}) {
  const id = `filter-${label.toLowerCase()}`
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-xs font-semibold text-subtle">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cx(
          'h-10 w-full rounded-sm border px-2.5 text-sm font-medium transition-all duration-fast',
          'focus:shadow-ring focus:outline-none',
          value
            ? 'border-accent-border bg-accent-subtle text-accent shadow-e0'
            : 'border-hairline-strong bg-surface-inset text-muted hover:text-fg',
        )}
      >
        {children}
      </select>
    </div>
  )
}
