/**
 * The four-segment score breakdown.
 *
 * A score with no explanation is useless, so the bar is proportional to the
 * four components and every number is available — in the tooltip for a mouse,
 * in the aria-label for a screen reader, and spelled out on the detail page.
 *
 * Segment widths are each component's share of the 100 available points, so the
 * bar reads as "how full is this score, and with what".
 */

import type { ScoreDetail } from '../api/types'
import { cx } from '../components/ui'

export const MAXIMUMS = { stack: 40, level: 25, location: 20, fresh: 15 } as const

export const SEGMENTS = [
  { key: 'stack', label: 'Stack', colour: 'bg-seg-stack' },
  { key: 'level', label: 'Level', colour: 'bg-seg-level' },
  { key: 'location', label: 'Location', colour: 'bg-seg-location' },
  { key: 'fresh', label: 'Freshness', colour: 'bg-seg-fresh' },
] as const

export const TIER_TONE = {
  High: 'high',
  Medium: 'medium',
  Stretch: 'stretch',
} as const

export function summarise(detail: ScoreDetail): string {
  return SEGMENTS.map(
    (segment) => `${segment.label} ${detail[segment.key].toFixed(1)} of ${MAXIMUMS[segment.key]}`,
  ).join(', ')
}

export function ScoreBar({
  detail,
  score,
  className,
}: {
  detail: ScoreDetail | null
  score: number
  className?: string
}) {
  if (!detail) return null

  return (
    <div
      className={cx('flex h-1.5 gap-px overflow-hidden rounded-full bg-surface-strong', className)}
      // One labelled image, not four anonymous divs: a screen reader gets the
      // numbers rather than nothing at all.
      role="img"
      aria-label={`Score ${score} of 100. ${summarise(detail)}.`}
      title={summarise(detail)}
    >
      {SEGMENTS.map((segment) => (
        <div
          key={segment.key}
          className={segment.colour}
          style={{ flex: `0 0 ${detail[segment.key]}%` }}
        />
      ))}
    </div>
  )
}
