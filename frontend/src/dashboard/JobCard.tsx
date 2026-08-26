/**
 * One job, as a card.
 *
 * The premium unit of the job portal — title as the visual anchor, a
 * generated letter-mark standing in for a company logo the data doesn't have,
 * and the score/tier as the one place amber is allowed to draw the eye. No
 * salary, no employment type: the data model doesn't carry them, and a card
 * that invents numbers is worse than one that leaves a line out.
 *
 * The title is a real `<Link>` to `/app/jobs/:id` — keyboard-focusable,
 * middle-click/ctrl-click opens a new tab — but on a wide screen its default
 * click is intercepted by the caller (`onOpen`) to open the inline detail
 * panel instead of navigating away. On a narrow screen the caller passes a
 * no-op and the link behaves like any other link.
 */

import type { MouseEvent } from 'react'
import { Link } from 'react-router-dom'

import type { Job, StatusChoice } from '../api/types'
import { IconExternal } from '../components/icons'
import { Badge, cx } from '../components/ui'
import { Badges } from './badges'
import { sourceLabel } from './FilterBar'
import { ScoreBar, TIER_TONE } from './ScoreBar'
import { StatusSelect } from './StatusSelect'

/**
 * Tested, on-brand token pairs — reused rather than invented, so the
 * generated avatar is never a colour combination nobody checked for
 * contrast.
 */
const AVATAR_TONES = [
  'bg-accent-subtle text-accent',
  'bg-high-bg text-high',
  'bg-medium-bg text-medium',
  'bg-stretch-bg text-stretch',
]

function avatarTone(company: string): string {
  let hash = 0
  for (let index = 0; index < company.length; index += 1) {
    hash = (hash * 31 + company.charCodeAt(index)) >>> 0
  }
  return AVATAR_TONES[hash % AVATAR_TONES.length]!
}

export function JobCard({
  job,
  statuses,
  selected,
  onToggleSelect,
  active,
  onOpen,
}: {
  job: Job
  statuses: StatusChoice[]
  selected: boolean
  onToggleSelect: (id: number) => void
  /** Whether this is the job currently open in the detail panel. */
  active?: boolean
  onOpen: (event: MouseEvent) => void
}) {
  const initial = (job.company.trim()[0] ?? '?').toUpperCase()
  const reasons = job.detail?.notes ?? []
  const skills = job.detail?.skillsHit ?? []

  return (
    <li
      className={cx(
        'surface lift-sm page-enter relative p-4',
        job.tier === 'High' && 'edge-top',
        active && 'border-accent shadow-glow',
      )}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className={cx(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-sm text-sm font-extrabold',
            avatarTone(job.company),
          )}
        >
          {initial}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <Link
              to={`/app/jobs/${job.id}`}
              onClick={onOpen}
              className="min-w-0 truncate text-base font-bold leading-snug text-fg underline-offset-2 hover:text-accent hover:underline"
            >
              {job.title}
            </Link>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <span
                className={cx(
                  'tabular text-lg font-extrabold leading-none',
                  job.tier === 'High' && 'text-accent',
                )}
              >
                {job.score}
              </span>
              <Badge tone={TIER_TONE[job.tier as keyof typeof TIER_TONE] ?? 'neutral'}>
                {job.tier}
              </Badge>
            </div>
          </div>

          <p className="mt-0.5 truncate text-sm text-muted">{job.company}</p>
          <p className="mt-1 truncate text-xs text-subtle">
            {job.location || 'Location not stated'} · via <span>{sourceLabel(job.source)}</span> ·{' '}
            <PostedLabel job={job} />
          </p>

          <ScoreBar detail={job.detail} score={job.score} className="mt-2.5" />

          {reasons.length > 0 && (
            <p className="mt-2 line-clamp-1 text-xs text-muted">{reasons.join(' · ')}</p>
          )}

          {skills.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {skills.slice(0, 6).map((skill) => (
                <li key={skill}>
                  <Badge>{skill}</Badge>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-2.5">
            <Badges job={job} />
          </div>

          <div className="mt-3 flex items-center gap-2 border-t border-hairline pt-3">
            <label className="sr-only" htmlFor={`select-${job.id}`}>
              Select {job.title}
            </label>
            <input
              id={`select-${job.id}`}
              type="checkbox"
              checked={selected}
              onChange={() => onToggleSelect(job.id)}
              className="h-4 w-4 accent-[var(--accent)]"
            />

            <StatusSelect job={job} choices={statuses} className="w-[150px]" />

            {job.url && (
              <a
                href={job.url}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto inline-flex items-center gap-1.5 text-sm font-semibold text-accent underline-offset-2 hover:underline"
              >
                Apply
                <IconExternal size={12} />
                <span className="sr-only">
                  {' '}
                  to {job.title} at {job.company} (opens in a new tab)
                </span>
              </a>
            )}
          </div>
        </div>
      </div>
    </li>
  )
}

function PostedLabel({ job }: { job: Job }) {
  if (!job.postedAt) {
    return (
      <span title="The source gave no date" className="text-subtle">
        no date
      </span>
    )
  }
  const posted = new Date(job.postedAt)
  const days = Math.round((Date.now() - posted.getTime()) / 86_400_000)
  return (
    <span className="tabular" title={posted.toLocaleDateString()}>
      {days <= 0 ? 'today' : `${days}d ago`}
    </span>
  )
}
