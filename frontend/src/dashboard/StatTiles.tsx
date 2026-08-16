/**
 * Stat tiles and the last-run indicator.
 *
 * The last-run age is the cheapest monitoring this system has. A worker that
 * quietly died shows up here as a red number hours before anyone notices jobs
 * have stopped arriving — so it lives in the top bar, and it says the word
 * "stale" rather than relying on the colour to carry the message.
 */

import type { ReactNode } from 'react'

import type { Stats } from '../api/types'
import { IconAlert, IconBriefcase, IconSparkle, IconTarget } from '../components/icons'
import { Skeleton, cx } from '../components/ui'

/** Past this, the data is a day and a half old and something is wrong. */
const STALE_AFTER_HOURS = 36

export function StatTiles({ stats }: { stats: Stats }) {
  const tiers = stats.byTier ?? {}
  const high = tiers.High ?? 0
  const medium = tiers.Medium ?? 0

  return (
    <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Tile
        icon={<IconBriefcase size={15} />}
        label="Open jobs"
        value={stats.openCount}
        note="matching your profile"
      />
      <Tile
        icon={<IconSparkle size={15} />}
        label="New today"
        value={stats.newToday}
        note="since the last run"
        emphasis={stats.newToday > 0}
      />
      <Tile
        icon={<IconTarget size={15} />}
        label="High / Medium"
        value={`${high} / ${medium}`}
        note="worth a closer look"
      />
      <Tile
        label="Average score"
        value={Math.round(stats.avgScore ?? 0)}
        note="across your open jobs"
      />
    </dl>
  )
}

function Tile({
  icon,
  label,
  value,
  note,
  emphasis = false,
}: {
  icon?: ReactNode
  label: string
  value: string | number
  note?: string
  emphasis?: boolean
}) {
  return (
    <div className="rounded-lg border border-hairline bg-surface p-4">
      <dt className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-subtle">
        {icon}
        {label}
      </dt>
      <dd>
        <span
          className={cx(
            'tabular mt-1.5 block text-2xl font-semibold leading-none',
            emphasis && 'text-accent',
          )}
        >
          {value}
        </span>
        {note && <span className="mt-1.5 block text-xs text-subtle">{note}</span>}
      </dd>
    </div>
  )
}

export function StatTilesSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-hidden="true">
      {Array.from({ length: 4 }).map((_, index) => (
        <Skeleton key={index} className="h-[92px]" />
      ))}
    </div>
  )
}

export function lastRunAgeHours(lastRunAt: string | null | undefined): number | null {
  if (!lastRunAt) return null
  return (Date.now() - new Date(lastRunAt).getTime()) / 3_600_000
}

export function LastRunIndicator({ lastRunAt }: { lastRunAt: string | null | undefined }) {
  const hours = lastRunAgeHours(lastRunAt)
  const stale = hours === null || hours > STALE_AFTER_HOURS

  const text =
    hours === null
      ? 'never run'
      : hours < 1
        ? 'just now'
        : hours < 24
          ? `${Math.round(hours)}h ago`
          : `${Math.round(hours / 24)}d ago`

  return (
    <p
      aria-live="polite"
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs',
        stale ? 'border-danger-border bg-danger-bg text-danger' : 'border-hairline text-muted',
      )}
    >
      {stale && <IconAlert size={12} />}
      <span>
        Last run <span className="tabular">{text}</span>
      </span>
      {/* The word carries the meaning; the colour only reinforces it. */}
      {stale && <strong className="font-semibold">stale</strong>}
    </p>
  )
}
