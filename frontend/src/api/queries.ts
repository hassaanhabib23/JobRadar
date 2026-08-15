/**
 * Server state.
 *
 * TanStack Query owns loading, error and caching — none of it is hand-rolled
 * into booleans. Mutations that change a job update the cache optimistically and
 * roll back visibly on failure, because a status silently reverting is worse
 * than one that never changed.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query'

import { api } from './client'
import type {
  ApplicationStatus,
  Job,
  Paginated,
  Profile,
  Run,
  RunDetail,
  ScorePreview,
  Source,
  Stats,
  StatusChoice,
} from './types'

export const queryKeys = {
  jobs: (params: string) => ['jobs', params] as const,
  job: (id: number) => ['job', id] as const,
  stats: () => ['stats'] as const,
  statuses: () => ['statuses'] as const,
  locations: () => ['locations'] as const,
  profile: () => ['profile'] as const,
  runs: () => ['runs'] as const,
  run: (id: number) => ['run', id] as const,
  sources: () => ['sources'] as const,
}

export function useJobs(search: string): UseQueryResult<Paginated<Job>> {
  return useQuery({
    queryKey: queryKeys.jobs(search),
    queryFn: () => api.get<Paginated<Job>>(`/jobs/${search ? `?${search}` : ''}`),
    // Keeps the previous page on screen while the next loads, so paging does
    // not blank the table out from under the reader.
    placeholderData: (previous) => previous,
  })
}

export function useJob(id: number): UseQueryResult<Job> {
  return useQuery({
    queryKey: queryKeys.job(id),
    queryFn: () => api.get<Job>(`/jobs/${id}/`),
  })
}

export function useStats(): UseQueryResult<Stats> {
  return useQuery({ queryKey: queryKeys.stats(), queryFn: () => api.get<Stats>('/stats/') })
}

export function useStatuses(): UseQueryResult<StatusChoice[]> {
  return useQuery({
    queryKey: queryKeys.statuses(),
    // Labels come from the API so the frontend never hardcodes them.
    queryFn: () => api.get<StatusChoice[]>('/jobs/statuses/'),
    staleTime: Infinity,
  })
}

export function useProfile(): UseQueryResult<Profile> {
  return useQuery({ queryKey: queryKeys.profile(), queryFn: () => api.get<Profile>('/profile/') })
}

export function useRuns(): UseQueryResult<Paginated<Run>> {
  return useQuery({
    queryKey: queryKeys.runs(),
    queryFn: () => api.get<Paginated<Run>>('/runs/'),
  })
}

export function useRun(id: number, poll = false): UseQueryResult<RunDetail> {
  return useQuery({
    queryKey: queryKeys.run(id),
    queryFn: () => api.get<RunDetail>(`/runs/${id}/`),
    refetchInterval: poll ? 3000 : false,
  })
}

export function useSources(): UseQueryResult<Paginated<Source>> {
  return useQuery({
    queryKey: queryKeys.sources(),
    queryFn: () => api.get<Paginated<Source>>('/sources/'),
  })
}

interface JobPatch {
  id: number
  status?: ApplicationStatus
  notes?: string
  pinned?: boolean
}

/**
 * Update a job, optimistically.
 *
 * The rollback is the important half. A dropdown that snaps back with no
 * explanation teaches the user not to trust it, so the caller is handed the
 * error and shows it.
 */
export function useUpdateJob(): UseMutationResult<Job, Error, JobPatch, { previous: unknown[] }> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, ...patch }: JobPatch) => api.patch<Job>(`/jobs/${id}/`, patch),

    onMutate: async ({ id, ...patch }) => {
      await queryClient.cancelQueries({ queryKey: ['jobs'] })
      const previous = queryClient.getQueriesData({ queryKey: ['jobs'] })

      queryClient.setQueriesData<Paginated<Job>>({ queryKey: ['jobs'] }, (old) =>
        old
          ? {
              ...old,
              results: old.results.map((job) => (job.id === id ? { ...job, ...patch } : job)),
            }
          : old,
      )
      queryClient.setQueryData<Job>(queryKeys.job(id), (old) => (old ? { ...old, ...patch } : old))

      return { previous }
    },

    onError: (_error, _variables, context) => {
      // Put every touched cache entry back exactly as it was.
      context?.previous.forEach((entry) => {
        const [key, data] = entry as [readonly unknown[], unknown]
        queryClient.setQueryData(key, data)
      })
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['jobs'] })
      void queryClient.invalidateQueries({ queryKey: queryKeys.stats() })
    },
  })
}

export function useBulkStatus(): UseMutationResult<
  { updated: number },
  Error,
  { ids: number[]; status: ApplicationStatus }
> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input) => api.post<{ updated: number }>('/jobs/bulk_status/', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['jobs'] })
      void queryClient.invalidateQueries({ queryKey: queryKeys.stats() })
    },
  })
}

export function useTriggerRun(): UseMutationResult<
  { taskId: string; runId?: number },
  Error,
  void
> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => api.post<{ taskId: string; runId?: number }>('/runs/', {}),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.runs() })
    },
  })
}

export function useScorePreview(): UseMutationResult<
  ScorePreview,
  Error,
  { title: string; description: string; location: string }
> {
  return useMutation({
    mutationFn: (input) => api.post<ScorePreview>('/profile/preview/', input),
  })
}

export function useUpdateProfile(): UseMutationResult<Profile, Error, Partial<Profile>> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (patch) => api.patch<Profile>('/profile/', patch),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.profile(), updated)
      void queryClient.invalidateQueries({ queryKey: ['jobs'] })
    },
  })
}
