/**
 * Stat tiles and the last-run indicator.
 *
 * The last-run age is the cheapest monitoring this system has. A worker that
 * quietly died shows up here as a red number hours before anyone notices jobs
 * have stopped arriving, so it is deliberately prominent and deliberately not
 * colour-only.
 */

import type { Stats } from '../api/types'
import { cx } from '../components/ui'

/** Past this, the data is a day and a half old and something is wrong. */
const STALE_AFTER_HOURS = 36

export function StatTiles({ stats }: { stats: Stats }) {
  const tiers = stats.byTier ?? {}

  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Tile label="Open" value={stats.openCount} />
      <Tile label="New today" value={stats.newToday} accent={stats.newToday > 0} />
      <Tile label="High / Medium" value={`${tiers.High ?? 0} / ${tiers.Medium ?? 0}`} />
      <Tile label="Average score" value={Math.round(stats.avgScore ?? 0)} />
    </dl>
  )
}

function Tile({
  label,
  value,
  accent = false,
}: {
  label: string
  value: string | number
  accent?: boolean
}) {
  return (
    <div className="rounded-[10px] border border-hairline bg-surface p-4">
      <dt className="text-xs uppercase tracking-wide text-muted">{label}</dt>
      <dd className={cx('mt-1 text-2xl font-semibold tabular-nums', accent && 'text-accent')}>
        {value}
      </dd>
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
      className={cx(
        'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs',
        stale ? 'border-danger/50 bg-danger/10 text-danger' : 'border-hairline text-muted',
      )}
      // Announced when it changes, and the word "stale" carries the meaning so
      // the red is reinforcement rather than the message itself.
      aria-live="polite"
    >
      <span>Last run: {text}</span>
      {stale && <strong>stale</strong>}
    </p>
  )
}
