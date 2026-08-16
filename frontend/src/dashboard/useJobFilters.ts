/**
 * Filter state lives in the URL.
 *
 * Every filter, the sort and the page are query parameters, so a view is
 * shareable, survives a refresh, and the back button does what the reader
 * expects. Holding this in component state instead means the browser's own
 * navigation silently loses their work.
 */

import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'

export interface JobFilters {
  search: string
  tier: string
  source: string
  status: string
  location: string
  flag: string
  minScore: string
  isNew: boolean
  postedToday: boolean
  hasDate: boolean
  pinned: boolean
  includeClosed: boolean
  ordering: string
  page: number
  pageSize: number
}

export const DEFAULT_FILTERS: JobFilters = {
  search: '',
  tier: '',
  source: '',
  status: '',
  location: '',
  flag: '',
  minScore: '',
  isNew: false,
  postedToday: false,
  hasDate: false,
  pinned: false,
  includeClosed: false,
  // Newest first. Score still breaks ties within a day, so a strong match
  // is not buried under a weak one posted the same morning.
  ordering: '-posted_at',
  page: 1,
  pageSize: 50,
}

/** Query-parameter names, kept short enough that a shared link stays readable. */
const PARAM: Record<keyof JobFilters, string> = {
  search: 'search',
  tier: 'tier',
  source: 'source',
  status: 'status',
  location: 'location',
  flag: 'flag',
  minScore: 'min_score',
  isNew: 'is_new',
  postedToday: 'posted_today',
  hasDate: 'has_date',
  pinned: 'pinned',
  includeClosed: 'include_closed',
  ordering: 'ordering',
  page: 'page',
  pageSize: 'page_size',
}

export function useJobFilters() {
  const [searchParams, setSearchParams] = useSearchParams()

  const filters = useMemo<JobFilters>(() => {
    const read = (key: keyof JobFilters) => searchParams.get(PARAM[key])
    const flag = (key: keyof JobFilters) => read(key) === 'true'

    return {
      search: read('search') ?? '',
      tier: read('tier') ?? '',
      source: read('source') ?? '',
      status: read('status') ?? '',
      location: read('location') ?? '',
      flag: read('flag') ?? '',
      minScore: read('minScore') ?? '',
      isNew: flag('isNew'),
      postedToday: flag('postedToday'),
      hasDate: flag('hasDate'),
      pinned: flag('pinned'),
      includeClosed: flag('includeClosed'),
      ordering: read('ordering') ?? DEFAULT_FILTERS.ordering,
      page: Number(read('page') ?? 1) || 1,
      pageSize: Number(read('pageSize') ?? DEFAULT_FILTERS.pageSize) || DEFAULT_FILTERS.pageSize,
    }
  }, [searchParams])

  const setFilters = useCallback(
    (patch: Partial<JobFilters>, { replace = false } = {}) => {
      const next = { ...filters, ...patch }

      // Changing any filter resets to page one. Staying on page 7 of a result
      // set that now has two pages shows an empty table for no visible reason.
      if (!('page' in patch)) next.page = 1

      const params = new URLSearchParams()
      ;(Object.keys(PARAM) as (keyof JobFilters)[]).forEach((key) => {
        const value = next[key]
        const fallback = DEFAULT_FILTERS[key]
        // Only non-default values reach the URL, so a plain dashboard link has
        // no query string at all.
        if (value === fallback || value === '' || value === false) return
        params.set(PARAM[key], String(value))
      })

      setSearchParams(params, { replace })
    },
    [filters, setSearchParams],
  )

  const reset = useCallback(() => setSearchParams(new URLSearchParams()), [setSearchParams])

  /** The query string sent to the API. */
  const queryString = useMemo(() => {
    const params = new URLSearchParams()
    if (filters.search) params.set('search', filters.search)
    if (filters.tier) params.set('tier', filters.tier)
    if (filters.source) params.set('source', filters.source)
    if (filters.status) params.set('status', filters.status)
    if (filters.location) params.set('location', filters.location)
    if (filters.flag) params.set('flag', filters.flag)
    if (filters.minScore) params.set('min_score', filters.minScore)
    if (filters.isNew) params.set('is_new', 'true')
    if (filters.postedToday) params.set('posted_today', 'true')
    if (filters.hasDate) params.set('has_date', 'true')
    if (filters.pinned) params.set('pinned', 'true')
    if (filters.includeClosed) params.set('include_closed', 'true')
    params.set('ordering', filters.ordering)
    params.set('page', String(filters.page))
    params.set('page_size', String(filters.pageSize))
    return params.toString()
  }, [filters])

  const activeCount = useMemo(
    () =>
      (Object.keys(DEFAULT_FILTERS) as (keyof JobFilters)[]).filter(
        (key) =>
          key !== 'page' &&
          key !== 'pageSize' &&
          key !== 'ordering' &&
          filters[key] !== DEFAULT_FILTERS[key],
      ).length,
    [filters],
  )

  return { filters, setFilters, reset, queryString, activeCount }
}
