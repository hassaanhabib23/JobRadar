/**
 * One job, in full.
 *
 * Notes autosave — a note you have to remember to save is a note you lose.
 */

import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { useJob, useStatuses, useUpdateJob } from '../api/queries'
import { Panel, Spinner } from '../components/ui'
import { Badges } from '../dashboard/badges'
import { ScoreBar, TIER_CLASS } from '../dashboard/ScoreBar'
import { StatusSelect } from '../dashboard/StatusSelect'
import { cx } from '../components/ui'

const COMPONENTS = [
  { key: 'stack', label: 'Stack', max: 40, hint: 'Weighted skills found in the posting' },
  { key: 'level', label: 'Level', max: 25, hint: 'Seniority signals in the title' },
  { key: 'location', label: 'Location', max: 20, hint: 'How well the city matches your profile' },
  { key: 'fresh', label: 'Freshness', max: 15, hint: 'How recently it was posted' },
] as const

export default function JobDetail() {
  const { id } = useParams()
  const jobId = Number(id)
  const job = useJob(jobId)
  const statuses = useStatuses()

  if (job.isPending) {
    return (
      <Wrapper>
        <Spinner label="Loading this job" />
      </Wrapper>
    )
  }

  if (job.isError || !job.data) {
    return (
      <Wrapper>
        <Panel>
          <p role="alert" className="text-sm">
            This job could not be loaded. It may have been removed from your list.{' '}
            <Link to="/app" className="font-medium underline underline-offset-2">
              Back to the dashboard
            </Link>
          </p>
        </Panel>
      </Wrapper>
    )
  }

  const data = job.data
  const detail = data.detail

  return (
    <Wrapper>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/app" className="text-sm text-muted underline-offset-2 hover:underline">
            ← All jobs
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">{data.title}</h1>
          <p className="mt-1 text-muted">
            {data.company}
            {data.location && ` · ${data.location}`}
          </p>
          <div className="mt-2">
            <Badges job={data} />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <StatusSelect job={data} choices={statuses.data ?? []} />
          {data.url && (
            <a
              href={data.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[44px] items-center rounded-lg bg-accent px-4 text-sm font-medium text-white"
            >
              Apply
            </a>
          )}
        </div>
      </div>

      <Panel className="flex flex-col gap-4">
        <div className="flex items-baseline gap-3">
          <span className="text-3xl font-semibold tabular-nums">{data.score}</span>
          <span className="text-muted">/ 100</span>
          <span
            className={cx(
              'rounded-full border px-2 py-0.5 text-xs font-medium',
              TIER_CLASS[data.tier] ?? 'border-hairline',
            )}
          >
            {data.tier}
          </span>
        </div>

        <ScoreBar detail={detail} score={data.score} />

        {detail && (
          <dl className="grid gap-3 sm:grid-cols-4">
            {COMPONENTS.map((component) => (
              <div key={component.key}>
                <dt className="text-xs uppercase tracking-wide text-muted" title={component.hint}>
                  {component.label}
                </dt>
                <dd className="mt-1 tabular-nums">
                  <strong>{detail[component.key].toFixed(1)}</strong>
                  <span className="text-muted"> / {component.max}</span>
                </dd>
              </div>
            ))}
          </dl>
        )}

        {detail?.notes?.length ? (
          <div>
            <h2 className="text-sm font-medium">Why it scored this</h2>
            <ul className="mt-1 list-inside list-disc text-sm text-muted">
              {detail.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {detail?.skillsHit?.length ? (
          <div>
            <h2 className="text-sm font-medium">Matched skills</h2>
            <p className="mt-1 text-sm text-muted">{detail.skillsHit.join(', ')}</p>
          </div>
        ) : (
          <p className="text-sm text-muted">
            No skills from your profile appeared in this posting.
          </p>
        )}
      </Panel>

      <Panel>
        <h2 className="text-sm font-medium">Timeline</h2>
        <dl className="mt-2 grid gap-3 text-sm sm:grid-cols-4">
          <Fact label="Posted" value={data.postedAt ?? 'not stated'} />
          <Fact label="First seen by you" value={formatDate(data.firstSeen)} />
          <Fact label="Last seen" value={formatDate(data.lastSeen)} />
          <Fact
            label="Times seen"
            value={`${data.seenCount}${data.closedAt ? ' · now closed' : ''}`}
          />
        </dl>
        {data.alsoSeenOn.length > 0 && (
          <p className="mt-3 text-sm text-muted">
            Also found on {data.alsoSeenOn.join(', ')}
            {data.dateFrom && ` — posting date came from ${data.dateFrom}`}
          </p>
        )}
      </Panel>

      <NotesPanel jobId={jobId} initial={data.notes} />

      {data.description && (
        <Panel>
          <h2 className="text-sm font-medium">Description</h2>
          {/* Rendered as text, never as HTML: a posting is untrusted input. */}
          <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{data.description}</p>
        </Panel>
      )}
    </Wrapper>
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
    // Autosave after a pause. A note you have to remember to save is a note you
    // lose, and this is the one thing here that cannot be re-fetched.
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
    // `update` is deliberately excluded: the mutation object is a new reference
    // on every render, and including it restarts the autosave timer forever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes, initial, jobId])

  return (
    <Panel>
      <div className="flex items-center justify-between">
        <label htmlFor="job-notes" className="text-sm font-medium">
          Your notes
        </label>
        <span aria-live="polite" className="text-xs text-muted">
          {update.isPending ? 'Saving…' : saved ? 'Saved' : ''}
          {update.isError && <span className="text-danger">Could not save</span>}
        </span>
      </div>
      <textarea
        id="job-notes"
        rows={4}
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        placeholder="Who referred you, what you tailored, when to follow up…"
        className="mt-2 w-full rounded-lg border border-hairline bg-surface p-3 text-sm"
      />
    </Panel>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-1">{value}</dd>
    </div>
  )
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  return new Date(value).toLocaleDateString()
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-5 p-4 sm:p-6">
      {children}
    </main>
  )
}
