/**
 * Onboarding.
 *
 * This matters more than it looks: a user whose first screen is an empty
 * dashboard leaves. Four short steps, and the last one triggers a run so
 * their first dashboard has jobs in it.
 *
 * Progressive disclosure — one decision per screen, with a visible progress
 * indicator so nobody wonders how much more of this there is. Skippable
 * throughout, because the defaults already produce a working profile.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { api } from '../api/client'
import { resumeUploadErrorMessage, useUploadResume } from '../api/queries'
import {
  ROLE_KEYWORDS,
  type Location,
  type Profile,
  type ResumeSignals,
  type User,
} from '../api/types'
import { useAuth } from '../auth/AuthProvider'
import { AuthLayout } from '../components/AuthLayout'
import { IconCheck, IconMapPin, IconRadar } from '../components/icons'
import { Button, Chip, Skeleton, cx } from '../components/ui'

const DEFAULT_CITIES = ['islamabad', 'rawalpindi']
const STEPS = ['CV', 'Cities', 'Focus', 'Done'] as const

type Step = 1 | 2 | 3 | 4

export default function Welcome() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { setUser } = useAuth()

  const [step, setStep] = useState<Step>(1)
  const [cities, setCities] = useState<string[]>(DEFAULT_CITIES)
  const [roles, setRoles] = useState<string[]>([])
  const uploadResume = useUploadResume()

  const locations = useQuery({
    queryKey: ['locations'],
    queryFn: () => api.get<Location[]>('/locations/'),
    staleTime: Infinity,
  })

  const saveProfile = useMutation({
    mutationFn: () =>
      api.patch<Profile>('/profile/', {
        locationsAllowed: cities,
        locationsPreferred: cities,
        roleKeywords: roles,
      }),
  })

  const triggerRun = useMutation({
    mutationFn: () => api.post<{ runId?: number; taskId: string }>('/runs/', {}),
  })

  const finish = useMutation({
    mutationFn: () => api.patch<User>('/auth/me/', { onboardingComplete: true }),
    onSuccess: (updated) => {
      setUser(updated)
      void queryClient.invalidateQueries()
      navigate('/app', { replace: true })
    },
  })

  async function goToStep4() {
    await saveProfile.mutateAsync()
    setStep(4)
    // Kick a run so their first dashboard is not an empty state.
    triggerRun.mutate()
  }

  function toggle(list: string[], value: string, setter: (next: string[]) => void) {
    setter(list.includes(value) ? list.filter((item) => item !== value) : [...list, value])
  }

  const titles: Record<Step, string> = {
    1: 'Upload your CV',
    2: 'Where do you want to work?',
    3: 'What do you build?',
    4: "You're set up",
  }

  const subtitles: Record<Step, string> = {
    1: "Optional. We'll pre-fill your skills and focus from it — nothing is sent anywhere but your own profile.",
    2: 'This decides which jobs reach you and how they score. Change it any time.',
    3: 'Picking a few raises the weight of the matching skills. Optional — you can tune every weight individually later.',
    4: 'Your profile is saved and the first run is under way.',
  }

  return (
    <AuthLayout title={titles[step]} subtitle={subtitles[step]} wide>
      <div className="flex flex-col gap-6">
        <Progress current={step} />

        <div>
          {step === 1 && (
            <div className="flex flex-col gap-5">
              <label htmlFor="resume-upload" className="text-sm font-medium">
                Upload your CV
              </label>
              <input
                id="resume-upload"
                type="file"
                accept=".pdf,.docx"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (!file) return
                  uploadResume.mutate(file, {
                    onSuccess: (signals: ResumeSignals) => {
                      setRoles((current) => [
                        ...new Set([...current, ...signals.detectedRoleKeywords]),
                      ])
                    },
                  })
                }}
                className="w-full rounded border border-hairline-strong bg-surface-inset p-3.5 text-sm"
              />

              {uploadResume.isPending && <p className="text-sm text-muted">Reading your CV…</p>}
              {uploadResume.isError && (
                <p role="alert" className="text-sm text-danger">
                  {resumeUploadErrorMessage(uploadResume.error)}
                </p>
              )}
              {uploadResume.isSuccess && (
                <p aria-live="polite" className="text-sm text-muted">
                  Found:{' '}
                  <strong className="font-bold text-fg">
                    {Object.keys(uploadResume.data.detectedSkills).join(', ') ||
                      'no specific skills'}
                  </strong>
                  {uploadResume.data.detectedSeniority !== 'unknown' &&
                    ` · ${uploadResume.data.detectedSeniority}`}
                </p>
              )}

              <div className="flex items-center justify-end gap-3 border-t border-hairline pt-4">
                <Button size="lg" onClick={() => setStep(2)}>
                  Continue
                </Button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="flex flex-col gap-5">
              {locations.isPending && (
                <div className="flex flex-wrap gap-2" aria-busy="true">
                  <span className="sr-only" role="status">
                    Loading cities
                  </span>
                  {Array.from({ length: 8 }).map((_, index) => (
                    <Skeleton key={index} className="h-10 w-28 rounded-full" />
                  ))}
                </div>
              )}

              {locations.isError && (
                <p role="alert" className="text-sm text-danger">
                  Could not load the city list.{' '}
                  <button
                    type="button"
                    onClick={() => void locations.refetch()}
                    className="underline underline-offset-2"
                  >
                    Try again
                  </button>
                </p>
              )}

              {locations.data && (
                <fieldset className="flex flex-wrap gap-2">
                  <legend className="sr-only">Cities you want jobs in</legend>
                  {locations.data.map((location) => (
                    <Chip
                      key={location.key}
                      name="city"
                      checked={cities.includes(location.key)}
                      onChange={() => toggle(cities, location.key, setCities)}
                    >
                      {location.label}
                    </Chip>
                  ))}
                </fieldset>
              )}

              <div className="flex items-center justify-between gap-3 border-t border-hairline pt-4">
                <p aria-live="polite" className="flex items-center gap-1.5 text-sm text-muted">
                  <IconMapPin size={14} />
                  {cities.length === 0
                    ? 'Choose at least one city to continue'
                    : `${cities.length} selected`}
                </p>
                <Button size="lg" disabled={cities.length === 0} onClick={() => setStep(3)}>
                  Continue
                </Button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="flex flex-col gap-5">
              <fieldset className="flex flex-wrap gap-2">
                <legend className="sr-only">Role focus</legend>
                {ROLE_KEYWORDS.map((role) => (
                  <Chip
                    key={role.value}
                    name="role"
                    checked={roles.includes(role.value)}
                    onChange={() => toggle(roles, role.value, setRoles)}
                  >
                    {role.label}
                  </Chip>
                ))}
              </fieldset>

              <div className="flex items-center justify-between gap-3 border-t border-hairline pt-4">
                <Button variant="ghost" onClick={() => setStep(2)}>
                  Back
                </Button>
                <Button size="lg" onClick={() => void goToStep4()} disabled={saveProfile.isPending}>
                  {saveProfile.isPending ? 'Saving…' : 'Continue'}
                </Button>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="flex flex-col gap-5">
              <ul aria-live="polite" className="space-y-3 text-sm">
                <Done>
                  Profile saved for{' '}
                  <strong className="font-bold text-fg">
                    {cities.length} {cities.length === 1 ? 'city' : 'cities'}
                  </strong>
                  {roles.length > 0 && (
                    <>
                      {' '}
                      with <strong className="font-bold text-fg">{roles.length}</strong> role
                      {roles.length === 1 ? '' : 's'} weighted up
                    </>
                  )}
                  .
                </Done>

                <li className="flex items-start gap-2.5">
                  <span
                    className={cx(
                      'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
                      triggerRun.isSuccess
                        ? 'bg-high-bg text-high'
                        : 'bg-accent-subtle text-accent',
                    )}
                  >
                    {triggerRun.isSuccess ? <IconCheck size={12} /> : <IconRadar size={12} />}
                  </span>
                  <span className="text-muted">
                    {triggerRun.isPending && 'Starting a run across every source…'}
                    {triggerRun.isSuccess &&
                      'A run has started. Jobs appear on your dashboard as it finishes — usually under a minute.'}
                    {triggerRun.isError &&
                      'Could not start a run just now. The next scheduled one will pick it up, and you can trigger one from the Runs screen.'}
                  </span>
                </li>
              </ul>

              <div className="border-t border-hairline pt-4">
                <Button
                  size="lg"
                  className="w-full"
                  onClick={() => finish.mutate()}
                  disabled={finish.isPending}
                >
                  {finish.isPending ? 'Opening…' : 'Go to my dashboard'}
                </Button>
              </div>
            </div>
          )}
        </div>

        {step < 4 && (
          <p className="text-center text-sm text-subtle">
            <button
              type="button"
              onClick={() => finish.mutate()}
              className="underline underline-offset-2 hover:text-fg"
            >
              Skip for now
            </button>{' '}
            — the defaults ({DEFAULT_CITIES.join(', ')}) already work.
          </p>
        )}
      </div>
    </AuthLayout>
  )
}

function Done({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-high-bg text-high">
        <IconCheck size={12} />
      </span>
      <span className="text-muted">{children}</span>
    </li>
  )
}

/** Where you are and how much is left — the thing that stops people bailing. */
function Progress({ current }: { current: Step }) {
  return (
    <ol className="flex items-center gap-2" aria-label={`Step ${current} of ${STEPS.length}`}>
      {STEPS.map((label, index) => {
        const position = index + 1
        const done = position < current
        const active = position === current
        return (
          <li key={label} className="flex flex-1 items-center gap-2">
            <span
              className={cx(
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-2xs font-bold',
                'transition-all duration-fast ease-out',
                done && 'bg-high-bg text-high ring-1 ring-high-border',
                active && 'bg-accent text-on-accent shadow-e1',
                !done && !active && 'bg-surface-inset text-subtle ring-1 ring-hairline',
              )}
            >
              {done ? <IconCheck size={12} /> : position}
            </span>
            <span className={cx('text-xs font-semibold', active ? 'text-fg' : 'text-subtle')}>
              {label}
            </span>
            {position < STEPS.length && (
              <span
                aria-hidden="true"
                className={cx('h-px flex-1', done ? 'bg-high-border' : 'bg-hairline')}
              />
            )}
          </li>
        )
      })}
    </ol>
  )
}
