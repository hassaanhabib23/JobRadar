/**
 * The filter bar.
 *
 * Filters are visible, not hidden behind a "Filters" button — a filter you
 * cannot see is a filter you forget is on, and then the list looks wrong for
 * reasons you cannot explain.
 *
 * Search is debounced so typing does not fire a request per keystroke;
 * everything else commits immediately. All of it goes into the URL.
 */

import { useEffect, useState } from 'react'

import type { StatusChoice } from '../api/types'
import { IconClose, IconSearch } from '../components/icons'
import { Button, Chip, cx } from '../components/ui'
import type { JobFilters } from './useJobFilters'

const SOURCES = [
  'greenhouse',
  'lever',
  'workable',
  'breezy',
  'ashby',
  'smartrecruiters',
  'recruitee',
  'workday',
  'rss',
  'jobspy',
]

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
  resultCount,
}: {
  filters: JobFilters
  setFilters: (patch: Partial<JobFilters>) => void
  reset: () => void
  activeCount: number
  statuses: StatusChoice[]
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
    <section aria-label="Filters" className="rounded-lg border border-hairline bg-surface p-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
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
            className="h-9 w-full rounded border border-hairline bg-bg pl-9 pr-3 text-base placeholder:text-subtle"
          />
        </div>

        <Compact label="Tier" value={filters.tier} onChange={(tier) => setFilters({ tier })}>
          <option value="">Any tier</option>
          <option value="High">High</option>
          <option value="Medium">Medium</option>
          <option value="Stretch">Stretch</option>
        </Compact>

        <Compact
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
        </Compact>

        <Compact
          label="Source"
          value={filters.source}
          onChange={(source) => setFilters({ source })}
        >
          <option value="">Any source</option>
          {SOURCES.map((source) => (
            <option key={source} value={source}>
              {source}
            </option>
          ))}
        </Compact>

        <Compact
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
        </Compact>

        <div className="flex items-center gap-1.5">
          <label htmlFor="min-score" className="text-xs text-subtle">
            Min
          </label>
          <input
            id="min-score"
            type="number"
            min={0}
            max={100}
            placeholder="0"
            value={filters.minScore}
            onChange={(event) => setFilters({ minScore: event.target.value })}
            className="tabular h-9 w-[68px] rounded border border-hairline bg-bg px-2 text-sm"
          />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-hairline pt-3">
        <Chip checked={filters.isNew} onChange={(isNew) => setFilters({ isNew })}>
          <span title="Appeared for the first time on the last run">New today</span>
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

        {activeCount > 0 && (
          <Button variant="ghost" size="sm" onClick={reset}>
            <IconClose size={13} />
            Clear {activeCount} filter{activeCount === 1 ? '' : 's'}
          </Button>
        )}

        <p aria-live="polite" className={cx('ml-auto text-sm text-muted')}>
          {resultCount === undefined ? (
            'Loading…'
          ) : (
            <>
              <span className="tabular font-medium text-fg">{resultCount}</span> job
              {resultCount === 1 ? '' : 's'}
            </>
          )}
        </p>
      </div>
    </section>
  )
}

/** A compact labelled select for the filter row. */
function Compact({
  label,
  value,
  onChange,
  children,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  children: React.ReactNode
}) {
  const id = `filter-${label.toLowerCase()}`
  return (
    <>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cx(
          'h-9 rounded border bg-bg px-2 text-sm',
          value ? 'border-accent-border text-accent' : 'border-hairline text-muted',
        )}
      >
        {children}
      </select>
    </>
  )
}
