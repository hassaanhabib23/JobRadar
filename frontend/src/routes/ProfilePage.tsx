/**
 * The profile — cities, weights, blocklist, and the live score preview.
 *
 * Tuning weights blind is miserable, so the preview is the centrepiece: paste a
 * title and a description, see exactly what it would score and why.
 */

import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { api } from '../api/client'
import {
  queryKeys,
  useProfile,
  useScorePreview,
  useTriggerRun,
  useUpdateProfile,
} from '../api/queries'
import type { Location, Profile } from '../api/types'
import { Button, Chip, Panel, Spinner, cx } from '../components/ui'
import { ScoreBar } from '../dashboard/ScoreBar'

export default function ProfilePage() {
  const profile = useProfile()
  const update = useUpdateProfile()
  const triggerRun = useTriggerRun()

  const locations = useQuery({
    queryKey: queryKeys.locations(),
    queryFn: () => api.get<Location[]>('/locations/'),
    staleTime: Infinity,
  })

  const [citiesDirty, setCitiesDirty] = useState(false)

  if (profile.isPending) {
    return (
      <Wrapper>
        <Spinner label="Loading your profile" />
      </Wrapper>
    )
  }

  if (profile.isError || !profile.data) {
    return (
      <Wrapper>
        <Panel>
          <p role="alert" className="text-sm">
            Could not load your profile.{' '}
            <button
              type="button"
              onClick={() => void profile.refetch()}
              className="font-medium underline underline-offset-2"
            >
              Retry
            </button>
          </p>
        </Panel>
      </Wrapper>
    )
  }

  const data = profile.data
  const cities = data.locationsAllowed ?? []

  function toggleCity(key: string) {
    const next = cities.includes(key) ? cities.filter((c) => c !== key) : [...cities, key]
    if (next.length === 0) return // At least one, or nothing would ever match.
    setCitiesDirty(true)
    update.mutate({ locationsAllowed: next, locationsPreferred: next })
  }

  return (
    <Wrapper>
      <header className="flex items-center justify-between gap-3">
        <div>
          <Link to="/app" className="text-sm text-muted underline-offset-2 hover:underline">
            ← All jobs
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">Your profile</h1>
        </div>
        <span aria-live="polite" className="text-xs text-muted">
          {update.isPending ? 'Saving…' : update.isSuccess ? 'Saved' : ''}
        </span>
      </header>

      <Panel className="flex flex-col gap-4">
        <div>
          <h2 className="font-medium">Cities</h2>
          <p className="mt-1 text-sm text-muted">
            These drive both which jobs reach you and how they score. At least one is required.
          </p>
        </div>

        {locations.data && (
          <fieldset className="flex flex-wrap gap-2">
            <legend className="sr-only">Cities you want jobs in</legend>
            {locations.data.map((location) => (
              <Chip
                key={location.key}
                checked={cities.includes(location.key)}
                onChange={() => toggleCity(location.key)}
              >
                {location.label}
              </Chip>
            ))}
          </fieldset>
        )}

        {citiesDirty && (
          <div
            role="status"
            className="flex flex-wrap items-center gap-3 rounded-lg border border-hairline p-3 text-sm"
          >
            {/* Without this, a user changes their cities, sees the same list, and
                concludes the setting does nothing. */}
            <span>
              Saved. Your job list changes from the next run — the scores you see now were
              calculated with your previous cities.
            </span>
            <Button
              variant="secondary"
              onClick={() => triggerRun.mutate()}
              disabled={triggerRun.isPending}
            >
              {triggerRun.isPending ? 'Starting…' : 'Run now'}
            </Button>
          </div>
        )}
      </Panel>

      <ScorePreviewPanel />

      <WeightsPanel profile={data} onSave={(patch) => update.mutate(patch)} />

      <BlocklistPanel profile={data} onSave={(patch) => update.mutate(patch)} />
    </Wrapper>
  )
}

function ScorePreviewPanel() {
  const preview = useScorePreview()
  const [title, setTitle] = useState('Associate Software Engineer')
  const [location, setLocation] = useState('Islamabad, Pakistan')
  const [description, setDescription] = useState('ASP.NET Core, C#, Azure')

  const result = preview.data

  return (
    <Panel className="flex flex-col gap-4">
      <div>
        <h2 className="font-medium">Score preview</h2>
        <p className="mt-1 text-sm text-muted">
          Paste a real posting and see what your profile would give it. Change a weight below and
          run it again to see the effect immediately.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          Title
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="min-h-[44px] rounded-lg border border-hairline bg-surface px-3 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Location
          <input
            value={location}
            onChange={(event) => setLocation(event.target.value)}
            className="min-h-[44px] rounded-lg border border-hairline bg-surface px-3 text-sm"
          />
        </label>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        Description
        <textarea
          rows={3}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          className="rounded-lg border border-hairline bg-surface p-3 text-sm"
        />
      </label>

      <Button
        onClick={() => preview.mutate({ title, location, description })}
        disabled={preview.isPending}
        className="self-start"
      >
        {preview.isPending ? 'Scoring…' : 'Score it'}
      </Button>

      {result && (
        <div aria-live="polite" className="rounded-lg border border-hairline p-4">
          {result.filtered ? (
            <>
              <p className="font-medium">Filtered out</p>
              {/* "It scored nothing" and "it was excluded" are different answers,
                  and only one of them is actionable. */}
              <p className="mt-1 text-sm text-muted">{result.filteredReason}</p>
            </>
          ) : (
            <>
              <div className="flex items-baseline gap-3">
                <span className="text-2xl font-semibold tabular-nums">{result.score}</span>
                <span className="text-sm text-muted">/ 100 · {result.tier}</span>
              </div>
              <div className="mt-2">
                <ScoreBar detail={result.detail} score={result.score ?? 0} />
              </div>
              {result.detail?.notes?.length ? (
                <ul className="mt-3 list-inside list-disc text-sm text-muted">
                  {result.detail.notes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              ) : null}
            </>
          )}
        </div>
      )}
    </Panel>
  )
}

function WeightsPanel({
  profile,
  onSave,
}: {
  profile: Profile
  onSave: (patch: Partial<Profile>) => void
}) {
  const skills = profile.skills ?? {}
  const [draft, setDraft] = useState<Record<string, number>>(skills)
  const [newSkill, setNewSkill] = useState('')

  useEffect(() => setDraft(profile.skills ?? {}), [profile.skills])

  const entries = Object.entries(draft).sort((a, b) => b[1] - a[1])

  return (
    <Panel className="flex flex-col gap-4">
      <div>
        <h2 className="font-medium">Skill weights</h2>
        <p className="mt-1 text-sm text-muted">
          A posting's stack score is the sum of the weights it matches, capped at 40. Heavier
          weights pull matching jobs up the list.
        </p>
      </div>

      <div className="grid max-h-[320px] gap-2 overflow-y-auto sm:grid-cols-2">
        {entries.map(([skill, weight]) => (
          <div key={skill} className="flex items-center gap-2">
            <label htmlFor={`skill-${skill}`} className="flex-1 truncate text-sm">
              {skill}
            </label>
            <input
              id={`skill-${skill}`}
              type="number"
              min={0}
              max={50}
              value={weight}
              onChange={(event) => setDraft({ ...draft, [skill]: Number(event.target.value) || 0 })}
              className="min-h-[44px] w-[72px] rounded-lg border border-hairline bg-surface px-2 text-sm"
            />
            <button
              type="button"
              aria-label={`Remove ${skill}`}
              onClick={() => {
                const next = { ...draft }
                delete next[skill]
                setDraft(next)
              }}
              className="min-h-[44px] px-2 text-muted hover:text-danger"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="new-skill" className="sr-only">
          Add a skill
        </label>
        <input
          id="new-skill"
          value={newSkill}
          placeholder="Add a keyword, e.g. kubernetes"
          onChange={(event) => setNewSkill(event.target.value)}
          className="min-h-[44px] flex-1 rounded-lg border border-hairline bg-surface px-3 text-sm"
        />
        <Button
          variant="secondary"
          onClick={() => {
            const key = newSkill.trim().toLowerCase()
            if (!key) return
            setDraft({ ...draft, [key]: 5 })
            setNewSkill('')
          }}
        >
          Add
        </Button>
        <Button onClick={() => onSave({ skills: draft })}>Save weights</Button>
      </div>
    </Panel>
  )
}

function BlocklistPanel({
  profile,
  onSave,
}: {
  profile: Profile
  onSave: (patch: Partial<Profile>) => void
}) {
  const blocklist = profile.titleBlocklist ?? []
  const [draft, setDraft] = useState<string[]>(blocklist)
  const [term, setTerm] = useState('')

  useEffect(() => setDraft(profile.titleBlocklist ?? []), [profile.titleBlocklist])

  return (
    <Panel className="flex flex-col gap-4">
      <div>
        <h2 className="font-medium">Title blocklist</h2>
        <p className="mt-1 text-sm text-muted">
          Any posting whose title contains one of these is dropped entirely. Matching is by whole
          word, so "sales" would not block "Salesforce Developer".
        </p>
      </div>

      <ul className="flex flex-wrap gap-2">
        {draft.map((entry) => (
          <li key={entry}>
            <span
              className={cx(
                'inline-flex items-center gap-2 rounded-full border border-hairline px-3 py-1 text-sm',
              )}
            >
              {entry}
              <button
                type="button"
                aria-label={`Remove ${entry} from the blocklist`}
                onClick={() => setDraft(draft.filter((item) => item !== entry))}
                className="text-muted hover:text-danger"
              >
                ×
              </button>
            </span>
          </li>
        ))}
        {draft.length === 0 && <li className="text-sm text-muted">Nothing blocked.</li>}
      </ul>

      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="blocklist-term" className="sr-only">
          Add a blocked term
        </label>
        <input
          id="blocklist-term"
          value={term}
          placeholder="e.g. recruiter"
          onChange={(event) => setTerm(event.target.value)}
          className="min-h-[44px] flex-1 rounded-lg border border-hairline bg-surface px-3 text-sm"
        />
        <Button
          variant="secondary"
          onClick={() => {
            const value = term.trim().toLowerCase()
            if (!value || draft.includes(value)) return
            setDraft([...draft, value])
            setTerm('')
          }}
        >
          Add
        </Button>
        <Button onClick={() => onSave({ titleBlocklist: draft })}>Save blocklist</Button>
      </div>
    </Panel>
  )
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-5 p-4 sm:p-6">
      {children}
    </main>
  )
}
