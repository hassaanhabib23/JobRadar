/**
 * The four-segment score breakdown.
 *
 * The score alone is useless if you cannot see what drove it, so the bar is
 * proportional to the four components and every segment is labelled in the
 * tooltip. Segment widths are a fraction of the *maximum* for each component,
 * not of the total — otherwise a job with a weak stack score shows a stack
 * segment that looks generous.
 */

import type { ScoreDetail, Tier } from '../api/types'
import { cx } from '../components/ui'

const MAXIMUMS = { stack: 40, level: 25, location: 20, fresh: 15 } as const

const SEGMENTS = [
  { key: 'stack', label: 'Stack', className: 'bg-accent' },
  { key: 'level', label: 'Level', className: 'bg-high' },
  { key: 'location', label: 'Location', className: 'bg-stretch' },
  { key: 'fresh', label: 'Freshness', className: 'bg-medium' },
] as const

export const TIER_CLASS: Record<Tier | string, string> = {
  High: 'text-high border-high/40 bg-high/10',
  Medium: 'text-medium border-medium/40 bg-medium/10',
  Stretch: 'text-stretch border-stretch/40 bg-stretch/10',
}

export function ScoreBar({ detail, score }: { detail: ScoreDetail | null; score: number }) {
  if (!detail) return null

  const summary = SEGMENTS.map(
    (segment) => `${segment.label} ${detail[segment.key].toFixed(1)}/${MAXIMUMS[segment.key]}`,
  ).join(', ')

  return (
    <div
      className="flex h-1.5 w-full min-w-[120px] gap-0.5 overflow-hidden rounded-full bg-surface-strong"
      // The whole bar is one labelled image: a screen reader gets the numbers,
      // not four anonymous divs.
      role="img"
      aria-label={`Score ${score} of 100. ${summary}.`}
      title={summary}
    >
      {SEGMENTS.map((segment) => {
        const value = detail[segment.key]
        return (
          <div
            key={segment.key}
            className={cx('h-full', segment.className)}
            // Flex-basis by the component's share of 100, scaled by how much of
            // that component was actually earned.
            style={{ flex: `0 0 ${(value / 100) * 100}%` }}
          />
        )
      })}
    </div>
  )
}

export function ScoreCell({
  score,
  tier,
  detail,
}: {
  score: number
  tier: string
  detail: ScoreDetail | null
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline gap-2">
        <span className="text-base font-semibold tabular-nums">{score}</span>
        <span
          className={cx(
            'rounded-full border px-2 py-0.5 text-[11px] font-medium',
            TIER_CLASS[tier] ?? 'border-hairline text-muted',
          )}
        >
          {/* The tier is spelled out, never colour alone. */}
          {tier}
        </span>
      </div>
      <ScoreBar detail={detail} score={score} />
    </div>
  )
}
