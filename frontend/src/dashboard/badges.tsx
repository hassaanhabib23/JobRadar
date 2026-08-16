/**
 * Badges derived from a job's flags and dates.
 *
 * Each exists because the underlying value means something specific that a
 * reader would otherwise get wrong.
 */

import type { Job } from '../api/types'
import {
  IconAlert,
  IconCalendar,
  IconGhost,
  IconLayers,
  IconRefresh,
  IconSparkle,
} from '../components/icons'
import { Badge, type BadgeTone } from '../components/ui'

export interface JobBadge {
  key: string
  label: string
  title: string
  tone: BadgeTone
  icon: React.ReactNode
}

export function badgesFor(job: Job): JobBadge[] {
  const badges: JobBadge[] = []

  if (job.isNew) {
    badges.push({
      key: 'new',
      // "New today", never "New": it means the first run this job appeared in
      // for this user, not that the job was posted recently.
      label: 'New today',
      title: 'First appeared in your list on the most recent run',
      tone: 'accent',
      icon: <IconSparkle size={11} />,
    })
  }

  if (!job.postedAt) {
    badges.push({
      key: 'no-date',
      label: 'No date',
      title: 'The source gave no posting date, so this is scored down deliberately',
      tone: 'neutral',
      icon: <IconCalendar size={11} />,
    })
  } else if (job.detail?.ageInferred) {
    badges.push({
      key: 'age-estimated',
      label: 'Age estimated',
      title: 'Age is how long we have tracked it, not a date the employer published',
      tone: 'neutral',
      icon: <IconCalendar size={11} />,
    })
  }

  if (job.flags?.includes('ghost?')) {
    badges.push({
      key: 'ghost',
      label: 'Ghost?',
      title: 'Listed for weeks without closing — often already filled',
      tone: 'medium',
      icon: <IconGhost size={11} />,
    })
  }

  if (job.flags?.includes('reposted')) {
    badges.push({
      key: 'reposted',
      label: 'Reposted',
      title: 'The source flagged this as a repost rather than a new listing',
      tone: 'neutral',
      icon: <IconRefresh size={11} />,
    })
  }

  const alsoSeenOn = job.alsoSeenOn ?? []
  if (alsoSeenOn.length > 0) {
    badges.push({
      key: 'also-seen',
      // Without this the row reads as thin coverage from a single source.
      label: `also on ${alsoSeenOn.join(', ')}`,
      title: 'Found on more than one source and merged into one row',
      tone: 'neutral',
      icon: <IconLayers size={11} />,
    })
  }

  if (job.closedAt) {
    badges.push({
      key: 'closed',
      label: 'Closed',
      title: 'This posting has disappeared from its source',
      tone: 'danger',
      icon: <IconAlert size={11} />,
    })
  }

  return badges
}

export function Badges({ job }: { job: Job }) {
  const badges = badgesFor(job)
  if (badges.length === 0) return null

  return (
    <ul className="flex flex-wrap items-center gap-1">
      {badges.map((badge) => (
        <li key={badge.key} className="min-w-0">
          <Badge tone={badge.tone} title={badge.title} icon={badge.icon}>
            {badge.label}
          </Badge>
        </li>
      ))}
    </ul>
  )
}
