/**
 * Onboarding.
 *
 * This matters more than it sounds: a user whose first screen is an empty
 * dashboard leaves. Three short steps, and the last one triggers a run so their
 * first dashboard has jobs in it.
 *
 * Skippable throughout — the defaults produce a working profile either way.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { api } from '../api/client'
import { ROLE_KEYWORDS, type Location, type Profile, type User } from '../api/types'
import { useAuth } from '../auth/AuthProvider'
import { Button, Chip, Panel, Spinner } from '../components/ui'

const DEFAULT_CITIES = ['islamabad', 'rawalpindi']

type Step = 1 | 2 | 3

export default function Welcome() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user, setUser } = useAuth()

  const [step, setStep] = useState<Step>(1)
  const [cities, setCities] = useState<string[]>(DEFAULT_CITIES)
  const [roles, setRoles] = useState<string[]>([])

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
    mutationFn: async () => {
      const updated = await api.patch<User>('/auth/me/', { onboardingComplete: true })
      return updated
    },
    onSuccess: (updated) => {
      setUser(updated)
      void queryClient.invalidateQueries()
      navigate('/app', { replace: true })
    },
  })

  async function goToStep3() {
    await saveProfile.mutateAsync()
    setStep(3)
    // Kick a run so their first dashboard is not empty.
    triggerRun.mutate()
  }

  function toggle(list: string[], value: string, setter: (next: string[]) => void) {
    setter(list.includes(value) ? list.filter((item) => item !== value) : [...list, value])
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center gap-6 p-6">
      <header>
        <p className="text-xs uppercase tracking-wide text-muted">Step {step} of 3</p>
        <h1 className="mt-1 text-2xl font-semibold">
          {step === 1 && 'Where do you want to work?'}
          {step === 2 && 'What kind of role?'}
          {step === 3 && "You're set up"}
        </h1>
      </header>

      <Panel className="flex flex-col gap-6">
        {step === 1 && (
          <>
            <p className="text-sm text-muted">
              Pick at least one. This drives both which jobs you see and how they score, and you can
              change it any time.
            </p>

            {locations.isPending && <Spinner label="Loading cities" />}
            {locations.isError && (
              <p role="alert" className="text-sm text-danger">
                Could not load the city list.{' '}
                <button
                  type="button"
                  onClick={() => void locations.refetch()}
                  className="underline underline-offset-2"
                >
                  Retry
                </button>
              </p>
            )}

            {locations.data && (
              <fieldset className="flex flex-wrap gap-2">
                <legend className="sr-only">Cities</legend>
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

            <div className="flex items-center justify-between gap-3">
              <p aria-live="polite" className="text-sm text-muted">
                {cities.length === 0
                  ? 'Choose at least one city to continue.'
                  : `${cities.length} selected`}
              </p>
              <Button type="button" disabled={cities.length === 0} onClick={() => setStep(2)}>
                Continue
              </Button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <p className="text-sm text-muted">
              Picking a few raises the weight of the matching skills. You can tune every weight
              individually later — this is just a faster start than a blank table.
            </p>

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

            <div className="flex items-center justify-between gap-3">
              <Button type="button" variant="ghost" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button
                type="button"
                onClick={() => void goToStep3()}
                disabled={saveProfile.isPending}
              >
                {saveProfile.isPending ? 'Saving…' : 'Continue'}
              </Button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div aria-live="polite" className="flex flex-col gap-2 text-sm">
              <p>
                Your profile is saved for{' '}
                <strong>
                  {cities.length} {cities.length === 1 ? 'city' : 'cities'}
                </strong>
                {roles.length > 0 && (
                  <>
                    {' '}
                    with <strong>{roles.length}</strong> role{roles.length === 1 ? '' : 's'}{' '}
                    weighted up
                  </>
                )}
                .
              </p>
              {triggerRun.isPending && (
                <p className="text-muted">Fetching jobs from every source…</p>
              )}
              {triggerRun.isSuccess && (
                <p className="text-muted">
                  A run has started. New postings appear on your dashboard as it finishes.
                </p>
              )}
              {triggerRun.isError && (
                <p className="text-muted">
                  Could not start a run just now — the next scheduled one will pick it up, and you
                  can trigger one from the Runs screen.
                </p>
              )}
            </div>

            <Button type="button" onClick={() => finish.mutate()} disabled={finish.isPending}>
              {finish.isPending ? 'Opening…' : 'Go to my dashboard'}
            </Button>
          </>
        )}
      </Panel>

      {step < 3 && (
        <p className="text-center text-sm text-muted">
          <button
            type="button"
            onClick={() => finish.mutate()}
            className="underline underline-offset-2"
          >
            Skip for now
          </button>{' '}
          — the defaults ({DEFAULT_CITIES.join(', ')}) already work.
          {user?.email ? '' : ''}
        </p>
      )}
    </main>
  )
}
