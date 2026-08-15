/**
 * The filter bar.
 *
 * Search is debounced so typing does not fire a request per keystroke; every
 * other control commits immediately. All of it goes into the URL.
 */

import { useEffect, useState } from 'react'

import type { StatusChoice } from '../api/types'
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

/** One-click views for the things looked at most often. */
const QUICK_CHIPS: { key: keyof JobFilters; label: string; value?: string; title: string }[] = [
  { key: 'isNew', label: 'New today', title: 'Appeared for the first time on the last run' },
  { key: 'hasDate', label: 'Has real date', title: 'Excludes undated postings and estimated ages' },
  { key: 'pinned', label: 'Pinned', title: 'Jobs you have pinned' },
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
    <section aria-label="Filters" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-[200px] flex-1">
          <label htmlFor="job-search" className="sr-only">
            Search jobs
          </label>
          <input
            id="job-search"
            type="search"
            placeholder="Search title, company or location"
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
            className="min-h-[44px] w-full rounded-lg border border-hairline bg-surface px-3 text-sm"
          />
        </div>

        <Select
          label="Tier"
          value={filters.tier}
          onChange={(tier) => setFilters({ tier })}
          options={[
            { value: '', label: 'Any tier' },
            { value: 'High', label: 'High' },
            { value: 'Medium', label: 'Medium' },
            { value: 'Stretch', label: 'Stretch' },
          ]}
        />

        <Select
          label="Status"
          value={filters.status}
          onChange={(status) => setFilters({ status })}
          options={[
            { value: '', label: 'Any status' },
            ...statuses.map((s) => ({
              value: s.value as string,
              label: s.label,
            })),
          ]}
        />

        <Select
          label="Source"
          value={filters.source}
          onChange={(source) => setFilters({ source })}
          options={[
            { value: '', label: 'Any source' },
            ...SOURCES.map((value) => ({ value, label: value })),
          ]}
        />

        <Select
          label="City"
          value={filters.location}
          onChange={(location) => setFilters({ location })}
          options={[{ value: '', label: 'Any city' }, ...CITIES]}
        />

        <div className="flex items-center gap-1">
          <label htmlFor="min-score" className="text-xs text-muted">
            Min score
          </label>
          <input
            id="min-score"
            type="number"
            min={0}
            max={100}
            value={filters.minScore}
            onChange={(event) => setFilters({ minScore: event.target.value })}
            className="min-h-[44px] w-[76px] rounded-lg border border-hairline bg-surface px-2 text-sm"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {QUICK_CHIPS.map((chip) => (
          <Chip
            key={chip.key}
            checked={Boolean(filters[chip.key])}
            onChange={(checked) => setFilters({ [chip.key]: checked } as Partial<JobFilters>)}
          >
            <span title={chip.title}>{chip.label}</span>
          </Chip>
        ))}
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
          <Button variant="ghost" onClick={reset} className="text-sm">
            Clear {activeCount} filter{activeCount === 1 ? '' : 's'}
          </Button>
        )}

        <p
          // Announced, so a screen-reader user learns the list changed size.
          aria-live="polite"
          className={cx('ml-auto text-sm text-muted')}
        >
          {resultCount === undefined
            ? 'Loading…'
            : `${resultCount} job${resultCount === 1 ? '' : 's'}`}
        </p>
      </div>
    </section>
  )
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
}) {
  const id = `filter-${label.toLowerCase().replace(/\s+/g, '-')}`
  return (
    <div className="flex items-center gap-1">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-[44px] rounded-lg border border-hairline bg-surface px-2 text-sm"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}
