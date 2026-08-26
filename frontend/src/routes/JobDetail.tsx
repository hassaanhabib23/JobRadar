/**
 * One job, in full.
 *
 * The score breakdown is the centrepiece: four components with their maximums,
 * the reasoning line by line, and the skills that matched. Notes autosave,
 * because a note you have to remember to save is a note you lose — and it is
 * the one thing here that cannot be re-fetched.
 */

import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { useJob, useStatuses, useUpdateJob } from '../api/queries'
import { AppShell, Column } from '../components/AppShell'
import { IconArrowLeft, IconCheck, IconExternal } from '../components/icons'
import { Badge, Panel, PanelHeader, Skeleton, cx } from '../components/ui'
import { Badges } from '../dashboard/badges'
import { ReminderPicker } from '../dashboard/ReminderPicker'
import { MAXIMUMS, SEGMENTS, ScoreBar, TIER_TONE } from '../dashboard/ScoreBar'
import { StatusSelect } from '../dashboard/StatusSelect'
import { StatusTimeline } from '../dashboard/StatusTimeline'

const HINTS: Record<string, string> = {
  stack: 'Weighted skills found in the title, location and description',
  level: 'Seniority signals in the title. An unstated level scores 14, not 0',
  location: 'How well the city matches your profile',
  fresh: 'How recently it was posted',
}

export default function JobDetail() {
  const { id } = useParams()
  const jobId = Number(id)
  const job = useJob(jobId)
  const statuses = useStatuses()
  const data = job.data

  return (
    <AppShell
      topbar={
        <Link
          to="/app"
          className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg"
        >
          <IconArrowLeft size={15} />
          All jobs
        </Link>
      }
    >
      <Column className="flex flex-col gap-4">
        {job.isPending && (
          <>
            <span className="sr-only" role="status">
              Loading this job
            </span>
            <Skeleton className="h-28" />
            <Skeleton className="h-64" />
          </>
        )}

        {(job.isError || (!job.isPending && !data)) && (
          <Panel className="p-5">
            <p role="alert" className="text-sm">
              This job could not be loaded. It may no longer be on your list.{' '}
              <Link to="/app" className="font-medium text-accent underline underline-offset-2">
                Back to your jobs
              </Link>
            </p>
          </Panel>
        )}

        {data && (
          <>
            <Panel edge elevation="high" className="p-4 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <h1 className="text-2xl font-extrabold tracking-tight">{data.title}</h1>
                  <p className="mt-2 text-md text-muted">
                    {data.company}
                    {data.location && ` · ${data.location}`}
                  </p>
                  <div className="mt-2.5">
                    <Badges job={data} />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <StatusSelect job={data} choices={statuses.data ?? []} className="w-[150px]" />
                  {data.url && (
                    <a
                      href={data.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-11 min-h-[44px] items-center gap-2 rounded bg-grad-accent px-5 text-base font-semibold text-on-accent shadow-e1 transition-all duration-fast ease-out hover:-translate-y-px hover:shadow-glow"
                    >
                      Apply
                      <IconExternal size={14} />
                    </a>
                  )}
                </div>
              </div>
            </Panel>

            <Panel>
              <PanelHeader
                title="Why it scored this"
                description="Every number here comes from a weight you control."
                action={
                  <div className="flex items-baseline gap-2">
                    <span className="tabular text-3xl font-extrabold leading-none">
                      {data.score}
                    </span>
                    <span className="text-sm text-subtle">/ 100</span>
                    <Badge tone={TIER_TONE[data.tier as keyof typeof TIER_TONE] ?? 'neutral'}>
                      {data.tier}
                    </Badge>
                  </div>
                }
              />

              <div className="p-5">
                <ScoreBar detail={data.detail} score={data.score} className="!h-3" />

                {data.detail && (
                  <dl className="mt-4 grid gap-4 sm:grid-cols-4">
                    {SEGMENTS.map((segment) => (
                      <div key={segment.key}>
                        <dt
                          className="flex items-center gap-1.5 text-2xs uppercase tracking-wide text-subtle"
                          title={HINTS[segment.key]}
                        >
                          <span
                            aria-hidden="true"
                            className={cx('h-2 w-2 rounded-full', segment.colour)}
                          />
                          {segment.label}
                        </dt>
                        <dd className="tabular mt-1.5">
                          <span className="text-lg font-extrabold">
                            {data.detail![segment.key].toFixed(1)}
                          </span>
                          <span className="text-subtle"> / {MAXIMUMS[segment.key]}</span>
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}

                {data.detail?.notes?.length ? (
                  <ul className="mt-5 space-y-1.5 border-t border-hairline pt-4">
                    {data.detail.notes.map((note) => (
                      <li key={note} className="flex items-start gap-2 text-sm text-muted">
                        <IconCheck size={13} className="mt-1 text-high" />
                        {note}
                      </li>
                    ))}
                  </ul>
                ) : null}

                {data.detail?.skillsHit?.length ? (
                  <div className="mt-4 border-t border-hairline pt-4">
                    <h3 className="text-2xs font-bold uppercase tracking-wide text-subtle">
                      Matched skills
                    </h3>
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {data.detail.skillsHit.map((skill) => (
                        <li key={skill}>
                          <Badge tone="accent">{skill}</Badge>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="mt-4 border-t border-hairline pt-4 text-sm text-muted">
                    No skills from your profile appeared in this posting — its score comes from
                    location, seniority and freshness alone.
                  </p>
                )}
              </div>
            </Panel>

            <Panel>
              <PanelHeader title="Timeline" />
              <dl className="grid gap-4 p-5 text-sm sm:grid-cols-4">
                <Fact label="Posted" value={data.postedAt ?? 'not stated'} />
                <Fact label="First seen by you" value={formatDate(data.firstSeen)} />
                <Fact label="Last seen" value={formatDate(data.lastSeen)} />
                <Fact
                  label="Times seen"
                  value={`${data.seenCount}${data.closedAt ? ' · now closed' : ''}`}
                />
              </dl>
              {data.alsoSeenOn.length > 0 && (
                <p className="border-t border-hairline px-5 py-3 text-sm text-muted">
                  Also found on {data.alsoSeenOn.join(', ')}
                  {data.dateFrom && ` — the posting date came from ${data.dateFrom}`}
                </p>
              )}
            </Panel>

            <StatusTimeline jobId={jobId} />

            <ReminderPicker jobId={jobId} value={data.remindAt} />

            <NotesPanel jobId={jobId} initial={data.notes} />

            {data.description && (
              <Panel>
                <PanelHeader title="Description" />
                {/* Rendered as text, never as HTML: a posting is untrusted input. */}
                <p className="whitespace-pre-wrap p-5 text-sm leading-relaxed text-muted">
                  {data.description}
                </p>
              </Panel>
            )}
          </>
        )}
      </Column>
    </AppShell>
  )
}

function NotesPanel({ jobId, initial }: { jobId: number; initial: string }) {
  const update = useUpdateJob()
  const [notes, setNotes] = useState(initial)
  const [saved, setSaved] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => setNotes(initial), [initial])

  useEffect(() => {
    if (notes === initial) return
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      update.mutate(
        { id: jobId, notes },
        {
          onSuccess: () => {
            setSaved(true)
            setTimeout(() => setSaved(false), 2000)
          },
        },
      )
    }, 800)
    return () => clearTimeout(timer.current)
    // `update` is a new reference every render; including it restarts the timer forever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes, initial, jobId])

  return (
    <Panel>
      <PanelHeader
        title="Your notes"
        description="Saved automatically. Private to your account."
        action={
          <span aria-live="polite" className="text-xs">
            {update.isPending && <span className="text-subtle">Saving…</span>}
            {saved && !update.isPending && (
              <span className="flex items-center gap-1 text-high">
                <IconCheck size={12} /> Saved
              </span>
            )}
            {update.isError && <span className="text-danger">Could not save</span>}
          </span>
        }
      />
      <div className="p-5">
        <label htmlFor="job-notes" className="sr-only">
          Notes
        </label>
        <textarea
          id="job-notes"
          rows={4}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Who referred you, what you tailored, when to follow up…"
          className="w-full rounded border border-hairline-strong bg-surface-inset p-3.5 text-base leading-relaxed transition-all duration-fast placeholder:text-subtle focus:border-accent focus:bg-surface focus:shadow-ring focus:outline-none"
        />
      </div>
    </Panel>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-2xs font-bold uppercase tracking-wide text-subtle">{label}</dt>
      <dd className="mt-1.5 font-semibold">{value}</dd>
    </div>
  )
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  return new Date(value).toLocaleDateString()
}
