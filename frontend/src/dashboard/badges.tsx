/**
 * Badges derived from a job's flags and dates.
 *
 * Each one exists because the underlying value means something specific that a
 * reader would otherwise get wrong.
 */

import type { Job } from '../api/types'
import { cx } from '../components/ui'

export interface Badge {
  key: string
  label: string
  title: string
  tone: 'neutral' | 'warning' | 'accent'
}

export function badgesFor(job: Job): Badge[] {
  const badges: Badge[] = []
  const detail = job.detail

  if (job.isNew) {
    badges.push({
      key: 'new',
      // "New today", never "New": it means the first run this job appeared in
      // for this user, not that the job was posted recently.
      label: 'New today',
      title: 'First appeared in your list on the most recent run',
      tone: 'accent',
    })
  }

  if (!job.postedAt) {
    badges.push({
      key: 'no-date',
      label: 'No date',
      title: 'The source gave no posting date, so this is scored down deliberately',
      tone: 'neutral',
    })
  } else if (detail?.ageInferred) {
    badges.push({
      key: 'age-estimated',
      label: 'Age estimated',
      title: 'Age is how long we have tracked it, not a date the employer published',
      tone: 'neutral',
    })
  }

  if (job.flags?.includes('ghost?')) {
    badges.push({
      key: 'ghost',
      label: 'Ghost?',
      title: 'Listed for weeks without closing — often already filled',
      tone: 'warning',
    })
  }

  if (job.flags?.includes('reposted')) {
    badges.push({
      key: 'reposted',
      label: 'Reposted',
      title: 'The source flagged this as a repost rather than a new listing',
      tone: 'neutral',
    })
  }

  const alsoSeenOn = job.alsoSeenOn ?? []
  if (alsoSeenOn.length > 0) {
    badges.push({
      key: 'also-seen',
      // Without this the row reads as thin coverage from one source.
      label: `also on ${alsoSeenOn.join(', ')}`,
      title: 'This posting was found on more than one source and merged',
      tone: 'neutral',
    })
  }

  if (job.closedAt) {
    badges.push({
      key: 'closed',
      label: 'Closed',
      title: 'This posting has disappeared from its source',
      tone: 'warning',
    })
  }

  return badges
}

const TONES = {
  neutral: 'border-hairline text-muted',
  warning: 'border-medium/50 bg-medium/10 text-medium',
  accent: 'border-accent/50 bg-accent/10 text-accent',
} as const

export function Badges({ job }: { job: Job }) {
  const badges = badgesFor(job)
  if (badges.length === 0) return null

  return (
    <ul className="flex flex-wrap gap-1">
      {badges.map((badge) => (
        <li key={badge.key}>
          <span
            title={badge.title}
            className={cx(
              'inline-block rounded-full border px-2 py-0.5 text-[11px] leading-4',
              TONES[badge.tone],
            )}
          >
            {badge.label}
          </span>
        </li>
      ))}
    </ul>
  )
}
