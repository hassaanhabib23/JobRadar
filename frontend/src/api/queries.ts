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

import { ApiError, api } from './client'
import type {
  ApplicationStatus,
  Job,
  Paginated,
  Profile,
  ResumeSignals,
  Run,
  RunDetail,
  ScorePreview,
  Source,
  Stats,
  StatusChoice,
  StatusEvent,
} from './types'

export const queryKeys = {
  jobs: (params: string) => ['jobs', params] as const,
  job: (id: number) => ['job', id] as const,
  stats: () => ['stats'] as const,
  statuses: () => ['statuses'] as const,
  statusHistory: (id: number) => ['job', id, 'status-history'] as const,
  locations: () => ['locations'] as const,
  profile: () => ['profile'] as const,
  runs: () => ['runs'] as const,
  run: (id: number) => ['run', id] as const,
  sources: () => ['sources'] as const,
  resume: () => ['resume'] as const,
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

export function useStatusHistory(id: number): UseQueryResult<StatusEvent[]> {
  return useQuery({
    queryKey: queryKeys.statusHistory(id),
    queryFn: () => api.get<StatusEvent[]>(`/jobs/${id}/status_history/`),
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
  remindAt?: string | null
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

    onSettled: (_data, _error, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['jobs'] })
      void queryClient.invalidateQueries({ queryKey: queryKeys.stats() })
      void queryClient.invalidateQueries({ queryKey: queryKeys.statusHistory(variables.id) })
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

export function useResume(): UseQueryResult<ResumeSignals | null> {
  return useQuery({
    queryKey: queryKeys.resume(),
    queryFn: async () => {
      try {
        return await api.get<ResumeSignals>('/resume/')
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null
        throw error
      }
    },
  })
}

export function useUploadResume(): UseMutationResult<ResumeSignals, Error, File> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (file) => {
      const form = new FormData()
      form.append('file', file)
      return api.post<ResumeSignals>('/resume/', form)
    },
    onSuccess: (signals) => {
      queryClient.setQueryData(queryKeys.resume(), signals)
      void queryClient.invalidateQueries({ queryKey: queryKeys.profile() })
    },
  })
}

/**
 * The server's actual reason a resume upload was rejected — "File is too
 * large (max 5MB)", "This PDF is password-protected", etc. — rather than one
 * fixed string that hides which of several distinct causes actually happened.
 */
export function resumeUploadErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.detail
  return 'Could not read that file — PDF and DOCX only, up to 5MB.'
}

export function useDeleteResume(): UseMutationResult<void, Error, void> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => api.delete<void>('/resume/'),
    onSuccess: () => {
      queryClient.setQueryData(queryKeys.resume(), null)
    },
  })
}
