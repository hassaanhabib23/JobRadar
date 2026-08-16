/**
 * Stat tiles and the last-run indicator.
 *
 * The last-run age is the cheapest monitoring this system has. A worker that
 * quietly died shows up here as a red number hours before anyone notices jobs
 * have stopped arriving — so it lives in the top bar, and it says the word
 * "stale" rather than relying on the colour to carry the message.
 *
 * The tiles are elevated cards with a gradient top edge and numbers that count
 * up on arrival. The count-up is decoration: the final value is in the DOM from
 * the first frame for assistive tech, and renders instantly under reduced
 * motion.
 */

import type { ReactNode } from 'react'

import type { Stats } from '../api/types'
import { IconAlert, IconBriefcase, IconSparkle, IconTarget, IconTrend } from '../components/icons'
import { stagger } from '../components/motion'
import { CountUp, Skeleton, cx } from '../components/ui'

/** Past this, the data is a day and a half old and something is wrong. */
const STALE_AFTER_HOURS = 36

export function StatTiles({ stats }: { stats: Stats }) {
  const tiers = stats.byTier ?? {}
  const high = tiers.High ?? 0
  const medium = tiers.Medium ?? 0

  return (
    <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Tile
        index={0}
        icon={<IconBriefcase size={15} />}
        label="Open jobs"
        value={stats.openCount}
        note="matching your profile"
      />
      <Tile
        index={1}
        icon={<IconSparkle size={15} />}
        label="New to you"
        value={stats.newToday}
        note="first seen on the last run"
        emphasis={stats.newToday > 0}
      />
      <Tile
        index={2}
        icon={<IconTarget size={15} />}
        label="High / Medium"
        value={`${high} / ${medium}`}
        note="worth a closer look"
      />
      <Tile
        index={3}
        icon={<IconTrend size={15} />}
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
  index,
}: {
  icon?: ReactNode
  label: string
  value: string | number
  note?: string
  emphasis?: boolean
  index: number
}) {
  return (
    <div
      style={stagger(index, 60)}
      className={cx(
        'surface lift page-enter relative overflow-hidden p-4',
        // The tile that carries good news gets the gradient edge and a tinted
        // ground; the rest stay quiet so it can be seen.
        emphasis ? 'edge-top' : '',
      )}
    >
      <dt className="flex items-center gap-1.5 text-2xs font-bold uppercase tracking-wide text-subtle">
        <span
          className={cx(
            'flex h-6 w-6 items-center justify-center rounded-sm',
            emphasis ? 'bg-accent-subtle text-accent' : 'bg-surface-inset text-muted',
          )}
        >
          {icon}
        </span>
        {label}
      </dt>
      <dd>
        <span
          className={cx(
            // "15 / 19" must not break across two lines on a phone.
            'tabular mt-3 block whitespace-nowrap text-2xl font-extrabold leading-none',
            emphasis && 'text-accent',
          )}
        >
          {typeof value === 'number' ? <CountUp value={value} /> : value}
        </span>
        {note && <span className="mt-2 block text-xs text-subtle">{note}</span>}
      </dd>
    </div>
  )
}

export function StatTilesSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-hidden="true">
      {Array.from({ length: 4 }).map((_, index) => (
        <Skeleton key={index} className="h-[112px]" />
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
        'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium',
        stale
          ? 'border-danger-border bg-danger-bg text-danger'
          : 'border-hairline bg-surface text-muted shadow-e1',
      )}
    >
      {stale ? (
        <IconAlert size={12} />
      ) : (
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-high shadow-glow-high" />
      )}
      <span>
        {/* "Last run" is dropped on a phone so the top bar stays one row, but
            only visually — a screen reader still hears the whole phrase. */}
        <span className="sr-only sm:not-sr-only">Last run </span>
        <span className="tabular">{text}</span>
      </span>
      {/* The word carries the meaning; the colour only reinforces it. */}
      {stale && <strong className="font-bold">stale</strong>}
    </p>
  )
}
