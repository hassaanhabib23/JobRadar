/**
 * The radar motif and its floating opportunity chips.
 *
 * Shared between the landing hero and the login's side panel, so the two
 * places that need "a quiet radar, a couple of illustrative job cards" build
 * it once. Everything here follows the light/dark toggle — every colour is a
 * theme token (`--border`, `--accent`, `--fg`...), never a fixed value, so it
 * always matches whatever the reader has chosen, the same as the rest of the
 * page around it. Everything is also `aria-hidden`: it is set dressing, not
 * information, and none of it claims to be a real job, a real user or a real
 * statistic — see `FloatingChip`'s comment. The motion freezes under
 * `prefers-reduced-motion` via the global rule in `index.css`, not
 * per-component logic.
 */

import type { ReactNode } from 'react'

import { IconMapPin } from './icons'
import { cx } from './ui'

/**
 * Concentric rings and a scan line, built from the same idea as `IconRadar`
 * but scaled up as a background field rather than a 24px glyph.
 *
 * Flat fill, not a gradient: the sweep wedge is a single translucent accent
 * colour, same rule as everywhere else in the app.
 */
export function RadarField({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 400 400" className={cx('pointer-events-none', className)}>
      <circle cx="200" cy="200" r="170" fill="none" stroke="var(--border)" strokeWidth="1" />
      <circle cx="200" cy="200" r="120" fill="none" stroke="var(--border)" strokeWidth="1" />
      <circle cx="200" cy="200" r="70" fill="none" stroke="var(--border)" strokeWidth="1" />
      <circle cx="200" cy="200" r="4" fill="var(--accent)" opacity="0.7" />
      <g className="radar-sweep">
        <path d="M200 200 L200 30 A170 170 0 0 1 340 115 Z" fill="var(--accent)" opacity="0.14" />
      </g>
    </svg>
  )
}

/**
 * A faint dot grid behind the radar rings, masked so it fades at the edges
 * rather than ending in a hard rectangle.
 */
export function BrandGrid({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cx('pointer-events-none', className)}
      style={{
        backgroundImage:
          'linear-gradient(to right, var(--border) 1px, transparent 1px), ' +
          'linear-gradient(to bottom, var(--border) 1px, transparent 1px)',
        backgroundSize: '48px 48px',
        maskImage: 'radial-gradient(ellipse 75% 65% at 50% 40%, black 25%, transparent 85%)',
        WebkitMaskImage: 'radial-gradient(ellipse 75% 65% at 50% 40%, black 25%, transparent 85%)',
      }}
    />
  )
}

/**
 * One illustrative "opportunity" chip: a small, unmistakably decorative
 * mock-up of a scored row, not a claim about a real job or a real match.
 * It sits over the radar as texture, the same way a product screenshot
 * would, and is always `aria-hidden` — the real proof on both pages that use
 * this (the hero's `ScoredRowDemo`, the actual score breakdown once signed
 * in) is a genuine artefact, not this decoration.
 */
export function FloatingChip({
  score,
  role,
  location,
  className,
  style,
}: {
  score: number
  role: string
  location: string
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <div
      aria-hidden="true"
      style={style}
      className={cx('float glass absolute w-[178px] rounded-lg p-3 shadow-e2', className)}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-2xs font-bold uppercase tracking-wide text-accent">
          {score}% Match
        </span>
        <span className="h-1.5 w-1.5 rounded-full bg-accent" />
      </div>
      <p className="mt-1.5 text-sm font-bold text-fg">{role}</p>
      <p className="mt-0.5 flex items-center gap-1 text-xs text-muted">
        <IconMapPin size={11} />
        {location}
      </p>
    </div>
  )
}

/**
 * The full decorative field: grid, rings and 2-3 floating chips, positioned
 * by the caller via `chips`. One instance behind the hero copy, another
 * behind the login's reassurance panel.
 */
export function RadarDecoration({
  chips,
  children,
  className,
}: {
  chips: { score: number; role: string; location: string; style: React.CSSProperties }[]
  children?: ReactNode
  className?: string
}) {
  return (
    <div aria-hidden="true" className={cx('pointer-events-none absolute inset-0', className)}>
      <BrandGrid className="absolute inset-0 opacity-70" />
      <RadarField className="absolute left-1/2 top-1/2 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 opacity-80" />
      {chips.map((chip) => (
        <FloatingChip key={chip.role} {...chip} />
      ))}
      {children}
    </div>
  )
}
