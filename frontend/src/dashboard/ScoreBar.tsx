/**
 * The four-segment score breakdown.
 *
 * A score with no explanation is useless, so the bar is proportional to the
 * four components and every number is available — in the tooltip for a mouse,
 * in the aria-label for a screen reader, and spelled out on the detail page.
 *
 * Segment widths are each component's share of the 100 available points, so the
 * bar reads as "how full is this score, and with what".
 *
 * The segments grow from zero on first paint. That is decoration, not
 * information — the aria-label carries the real numbers from the first frame,
 * and under reduced motion the bar renders full immediately.
 */

import type { ScoreDetail } from '../api/types'
import { useMounted, useReducedMotion } from '../components/motion'
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
  const mounted = useMounted()
  const reduced = useReducedMotion()
  const grown = mounted || reduced

  if (!detail) return null

  return (
    <div
      className={cx(
        'flex h-2 gap-px overflow-hidden rounded-full bg-surface-strong shadow-e0',
        className,
      )}
      // One labelled image, not four anonymous divs: a screen reader gets the
      // numbers rather than nothing at all.
      role="img"
      aria-label={`Score ${score} of 100. ${summarise(detail)}.`}
      title={summarise(detail)}
    >
      {SEGMENTS.map((segment, index) => (
        <div
          key={segment.key}
          className={cx(segment.colour, 'transition-[flex-basis] duration-slow ease-out')}
          style={{
            flex: `0 0 ${grown ? detail[segment.key] : 0}%`,
            // Left to right, so the bar reads as filling rather than as four
            // things appearing at once.
            transitionDelay: `${index * 70}ms`,
          }}
        />
      ))}
    </div>
  )
}
