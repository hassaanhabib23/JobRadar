/**
 * The profile — cities, weights, blocklist, and the live score preview.
 *
 * The preview is the centrepiece, and it is deliberately at the top: tuning
 * weights blind is miserable, so the first thing this page offers is "paste a
 * real posting and watch the number move".
 */

import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

import { api } from '../api/client'
import {
  queryKeys,
  useDeleteResume,
  useProfile,
  useResume,
  useScorePreview,
  useTriggerRun,
  useUpdateProfile,
  useUploadResume,
} from '../api/queries'
import type { Location, Profile } from '../api/types'
import { AppShell, Column } from '../components/AppShell'
import { IconAlert, IconCheck, IconClose, IconRadar, IconTarget } from '../components/icons'
import { Badge, Button, Chip, Panel, PanelHeader, Skeleton, cx } from '../components/ui'
import { MAXIMUMS, SEGMENTS, ScoreBar } from '../dashboard/ScoreBar'

export default function ProfilePage() {
  const profile = useProfile()
  const update = useUpdateProfile()
  const triggerRun = useTriggerRun()
  const [citiesDirty, setCitiesDirty] = useState(false)

  const locations = useQuery({
    queryKey: queryKeys.locations(),
    queryFn: () => api.get<Location[]>('/locations/'),
    staleTime: Infinity,
  })

  const data = profile.data
  const cities = data?.locationsAllowed ?? []

  function toggleCity(key: string) {
    const next = cities.includes(key) ? cities.filter((city) => city !== key) : [...cities, key]
    // At least one, or nothing would ever match.
    if (next.length === 0) return
    setCitiesDirty(true)
    update.mutate({ locationsAllowed: next, locationsPreferred: next })
  }

  return (
    <AppShell
      topbar={
        <div className="flex flex-1 items-center justify-between gap-3">
          <h1 className="text-md font-extrabold tracking-tight">Profile</h1>
          <span aria-live="polite" className="text-xs">
            {update.isPending && <span className="text-subtle">Saving…</span>}
            {update.isSuccess && !update.isPending && (
              <span className="flex items-center gap-1 text-high">
                <IconCheck size={12} /> Saved
              </span>
            )}
          </span>
        </div>
      }
    >
      <Column className="flex flex-col gap-4">
        {profile.isPending && (
          <>
            <span className="sr-only" role="status">
              Loading your profile
            </span>
            <Skeleton className="h-64" />
            <Skeleton className="h-40" />
          </>
        )}

        {profile.isError && (
          <Panel className="p-5">
            <p role="alert" className="text-sm">
              Could not load your profile.{' '}
              <button
                type="button"
                onClick={() => void profile.refetch()}
                className="font-medium text-accent underline underline-offset-2"
              >
                Try again
              </button>
            </p>
          </Panel>
        )}

        {data && (
          <>
            <ScorePreviewPanel />

            <Panel>
              <PanelHeader
                title="Cities"
                description="These decide which jobs reach you and how they score. At least one is required."
              />
              <div className="p-5">
                {locations.isPending && (
                  <div className="flex flex-wrap gap-2">
                    {Array.from({ length: 8 }).map((_, index) => (
                      <Skeleton key={index} className="h-10 w-28 rounded-full" />
                    ))}
                  </div>
                )}

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
                    className="mt-4 flex flex-wrap items-center gap-3 rounded border border-medium-border bg-medium-bg p-3 text-sm text-medium"
                  >
                    <IconAlert size={15} />
                    {/* Without this, a user changes their cities, sees the same
                        list, and concludes the setting does nothing. */}
                    <span className="flex-1">
                      Saved — but your job list only changes from the next run. The scores on screen
                      were calculated with your previous cities.
                    </span>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => triggerRun.mutate()}
                      disabled={triggerRun.isPending}
                    >
                      <IconRadar size={14} />
                      {triggerRun.isPending ? 'Starting…' : 'Run now'}
                    </Button>
                  </div>
                )}
              </div>
            </Panel>

            <ResumePanel />

            <WeightsPanel profile={data} onSave={(patch) => update.mutate(patch)} />
            <BlocklistPanel profile={data} onSave={(patch) => update.mutate(patch)} />
          </>
        )}
      </Column>
    </AppShell>
  )
}

function ScorePreviewPanel() {
  const preview = useScorePreview()
  const [title, setTitle] = useState('Associate Software Engineer')
  const [location, setLocation] = useState('Islamabad, Pakistan')
  const [description, setDescription] = useState('ASP.NET Core, C#, Azure')
  const result = preview.data

  return (
    <Panel edge>
      <PanelHeader
        title="Score preview"
        description="Paste a real posting and see exactly what your profile gives it. Change a weight below, run it again, watch it move."
        action={
          <span className="flex h-10 w-10 items-center justify-center rounded-sm bg-grad-accent text-on-accent shadow-e1">
            <IconTarget size={18} />
          </span>
        }
      />

      <div className="grid gap-5 p-5 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Title
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="h-12 min-h-[48px] rounded-sm border border-hairline-strong bg-surface-inset px-3 text-base font-normal transition-all duration-fast focus:border-accent focus:bg-surface focus:shadow-ring focus:outline-none"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Location
            <input
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              className="h-12 min-h-[48px] rounded-sm border border-hairline-strong bg-surface-inset px-3 text-base font-normal transition-all duration-fast focus:border-accent focus:bg-surface focus:shadow-ring focus:outline-none"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Description
            <textarea
              rows={4}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="rounded-sm border border-hairline-strong bg-surface-inset p-3.5 text-base font-normal leading-relaxed transition-all duration-fast focus:border-accent focus:bg-surface focus:shadow-ring focus:outline-none"
            />
          </label>

          <Button
            onClick={() => preview.mutate({ title, location, description })}
            disabled={preview.isPending}
            className="self-start"
          >
            {preview.isPending ? 'Scoring…' : 'Score it'}
          </Button>
        </div>

        <div
          aria-live="polite"
          className="flex min-h-[200px] flex-col justify-center rounded-lg border border-hairline bg-surface-inset p-5 shadow-e0"
        >
          {!result && (
            <p className="text-center text-sm text-subtle">
              The breakdown appears here — the same four components the dashboard shows.
            </p>
          )}

          {result?.filtered && (
            <div className="text-center">
              <Badge tone="danger" icon={<IconClose size={11} />}>
                Filtered out
              </Badge>
              {/* "It scored nothing" and "it was excluded" are different
                  answers, and only one of them is actionable. */}
              <p className="mt-2.5 text-sm text-muted">{result.filteredReason}</p>
            </div>
          )}

          {result && !result.filtered && (
            <>
              <div className="flex items-baseline gap-2">
                <span className="tabular text-3xl font-extrabold leading-none">{result.score}</span>
                <span className="text-sm text-subtle">/ 100</span>
                <span className="ml-auto text-sm font-bold">{result.tier}</span>
              </div>

              <ScoreBar detail={result.detail} score={result.score ?? 0} className="mt-4 !h-3" />

              {result.detail && (
                <dl className="mt-3 grid grid-cols-2 gap-2.5">
                  {SEGMENTS.map((segment) => (
                    <div key={segment.key} className="flex items-center gap-1.5 text-xs">
                      <span
                        aria-hidden="true"
                        className={cx('h-2 w-2 rounded-full', segment.colour)}
                      />
                      <span className="text-subtle">{segment.label}</span>
                      <span className="tabular ml-auto">
                        {result.detail![segment.key].toFixed(1)}
                        <span className="text-subtle">/{MAXIMUMS[segment.key]}</span>
                      </span>
                    </div>
                  ))}
                </dl>
              )}

              {result.detail?.notes?.length ? (
                <ul className="mt-3 space-y-1 border-t border-hairline pt-3 text-xs text-muted">
                  {result.detail.notes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              ) : null}
            </>
          )}
        </div>
      </div>
    </Panel>
  )
}

function ResumePanel() {
  const resume = useResume()
  const uploadResume = useUploadResume()
  const deleteResume = useDeleteResume()
  const data = resume.data

  return (
    <Panel>
      <PanelHeader
        title="CV"
        description="Upload a CV to pre-fill your skill weights and role focus. Re-uploading replaces it."
      />
      <div className="flex flex-col gap-4 p-5">
        {resume.isPending && <Skeleton className="h-10" />}

        {!resume.isPending && !data && <p className="text-sm text-muted">No CV uploaded yet.</p>}

        {data && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-hairline bg-surface-inset p-3.5">
            <div className="min-w-0 text-sm">
              <p>
                <strong className="font-bold text-fg">
                  {Object.keys(data.detectedSkills).join(', ') || 'No specific skills detected'}
                </strong>
                {data.detectedSeniority !== 'unknown' && ` · ${data.detectedSeniority}`}
              </p>
              <p className="mt-1 text-2xs text-subtle">
                Uploaded {new Date(data.uploadedAt).toLocaleDateString()}
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => deleteResume.mutate()}
              disabled={deleteResume.isPending}
            >
              {deleteResume.isPending ? 'Removing…' : 'Remove'}
            </Button>
          </div>
        )}

        <div>
          <label htmlFor="profile-resume-upload" className="text-sm font-medium">
            {data ? 'Replace your CV' : 'Upload your CV'}
          </label>
          <input
            id="profile-resume-upload"
            type="file"
            accept=".pdf,.docx"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (!file) return
              uploadResume.mutate(file)
              event.target.value = ''
            }}
            className="mt-1.5 w-full rounded border border-hairline-strong bg-surface-inset p-3.5 text-sm"
          />
          {uploadResume.isPending && <p className="mt-1.5 text-sm text-muted">Reading your CV…</p>}
          {uploadResume.isError && (
            <p role="alert" className="mt-1.5 text-sm text-danger">
              Could not read that file — PDF and DOCX only, up to 5MB.
            </p>
          )}
        </div>
      </div>
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
  const [draft, setDraft] = useState<Record<string, number>>(profile.skills ?? {})
  const [newSkill, setNewSkill] = useState('')

  useEffect(() => setDraft(profile.skills ?? {}), [profile.skills])

  const entries = Object.entries(draft).sort((a, b) => b[1] - a[1])
  const dirty = JSON.stringify(draft) !== JSON.stringify(profile.skills ?? {})

  return (
    <Panel>
      <PanelHeader
        title="Skill weights"
        description="A posting's stack score is the sum of the weights it matches, capped at 40. Heavier weights pull matching jobs up the list."
        action={
          dirty ? (
            <Button size="sm" onClick={() => onSave({ skills: draft })}>
              Save weights
            </Button>
          ) : (
            <span className="text-xs text-subtle">
              <span className="tabular">{entries.length}</span> skills
            </span>
          )
        }
      />

      <div className="p-5">
        <div className="grid max-h-[340px] gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2">
          {entries.map(([skill, weight]) => (
            <div
              key={skill}
              className="flex items-center gap-2 rounded-sm border border-transparent px-2.5 py-1.5 transition-colors duration-fast hover:border-hairline hover:bg-surface-hover"
            >
              <label htmlFor={`skill-${skill}`} className="min-w-0 flex-1 truncate text-sm">
                {skill}
              </label>
              <input
                id={`skill-${skill}`}
                type="number"
                min={0}
                max={50}
                value={weight}
                onChange={(event) =>
                  setDraft({ ...draft, [skill]: Number(event.target.value) || 0 })
                }
                className="tabular h-9 w-[64px] rounded-sm border border-hairline-strong bg-surface-inset px-2 text-sm transition-all duration-fast focus:border-accent focus:bg-surface focus:shadow-ring focus:outline-none"
              />
              <button
                type="button"
                aria-label={`Remove ${skill}`}
                onClick={() => {
                  const next = { ...draft }
                  delete next[skill]
                  setDraft(next)
                }}
                className="rounded p-2 text-subtle transition-colors duration-fast hover:bg-danger-bg hover:text-danger"
              >
                <IconClose size={13} />
              </button>
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-hairline pt-4">
          <label htmlFor="new-skill" className="sr-only">
            Add a skill
          </label>
          <input
            id="new-skill"
            value={newSkill}
            placeholder="Add a keyword, e.g. kubernetes"
            onChange={(event) => setNewSkill(event.target.value)}
            className="h-12 min-h-[48px] flex-1 rounded-sm border border-hairline-strong bg-surface-inset px-3 text-base font-normal transition-all duration-fast focus:border-accent focus:bg-surface focus:shadow-ring focus:outline-none"
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
        </div>
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
  const [draft, setDraft] = useState<string[]>(profile.titleBlocklist ?? [])
  const [term, setTerm] = useState('')

  useEffect(() => setDraft(profile.titleBlocklist ?? []), [profile.titleBlocklist])

  const dirty = JSON.stringify(draft) !== JSON.stringify(profile.titleBlocklist ?? [])

  return (
    <Panel>
      <PanelHeader
        title="Title blocklist"
        description="Any posting whose title contains one of these is dropped entirely. Matching is by whole word, so “sales” would not block “Salesforce Developer”."
        action={
          dirty ? (
            <Button size="sm" onClick={() => onSave({ titleBlocklist: draft })}>
              Save blocklist
            </Button>
          ) : (
            <span className="text-xs text-subtle">
              <span className="tabular">{draft.length}</span> blocked
            </span>
          )
        }
      />

      <div className="p-5">
        <ul className="flex flex-wrap gap-1.5">
          {draft.map((entry) => (
            <li key={entry}>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-surface py-1.5 pl-3.5 pr-1.5 text-sm font-medium text-muted shadow-e0">
                {entry}
                <button
                  type="button"
                  aria-label={`Remove ${entry} from the blocklist`}
                  onClick={() => setDraft(draft.filter((item) => item !== entry))}
                  className="rounded-full p-1 text-subtle transition-colors duration-fast hover:bg-danger-bg hover:text-danger"
                >
                  <IconClose size={12} />
                </button>
              </span>
            </li>
          ))}
          {draft.length === 0 && <li className="text-sm text-subtle">Nothing blocked.</li>}
        </ul>

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-hairline pt-4">
          <label htmlFor="blocklist-term" className="sr-only">
            Add a blocked term
          </label>
          <input
            id="blocklist-term"
            value={term}
            placeholder="e.g. recruiter, graphic designer"
            onChange={(event) => setTerm(event.target.value)}
            className="h-12 min-h-[48px] flex-1 rounded-sm border border-hairline-strong bg-surface-inset px-3 text-base font-normal transition-all duration-fast focus:border-accent focus:bg-surface focus:shadow-ring focus:outline-none"
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
        </div>
      </div>
    </Panel>
  )
}
