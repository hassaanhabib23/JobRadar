/**
 * The radar motif and its floating opportunity chips.
 *
 * Shared between the landing hero and the login's brand panel, so the two
 * places that need "dark indigo, a quiet radar, a couple of illustrative
 * job cards" build it once. Everything here is `aria-hidden`: it is set
 * dressing for a brand surface, not information, and none of it claims to be
 * a real job, a real user or a real statistic — see `FloatingChip`'s
 * comment. The motion freezes under `prefers-reduced-motion` via the global
 * rule in `index.css`, not per-component logic.
 */

import type { ReactNode } from 'react'

import { IconMapPin } from './icons'
import { cx } from './ui'

/**
 * Concentric rings and a scan line, built from the same idea as `IconRadar`
 * but scaled up as a background field rather than a 24px glyph.
 */
export function RadarField({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 400 400" className={cx('pointer-events-none', className)}>
      <circle cx="200" cy="200" r="170" fill="none" stroke="var(--brand-line)" strokeWidth="1" />
      <circle cx="200" cy="200" r="120" fill="none" stroke="var(--brand-line)" strokeWidth="1" />
      <circle cx="200" cy="200" r="70" fill="none" stroke="var(--brand-line)" strokeWidth="1" />
      <circle cx="200" cy="200" r="4" fill="var(--brand-accent)" opacity="0.7" />
      <g className="radar-sweep">
        <path
          d="M200 200 L200 30 A170 170 0 0 1 340 115 Z"
          fill="url(#radar-sweep-gradient)"
          opacity="0.5"
        />
      </g>
      <defs>
        <linearGradient id="radar-sweep-gradient" x1="200" y1="30" x2="340" y2="115">
          <stop offset="0%" stopColor="var(--brand-accent)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--brand-accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
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
          'linear-gradient(to right, var(--brand-line) 1px, transparent 1px), ' +
          'linear-gradient(to bottom, var(--brand-line) 1px, transparent 1px)',
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
      className={cx(
        'float absolute w-[178px] rounded-lg border border-brand-border bg-brand-glass p-3',
        'shadow-e2 backdrop-blur-sm',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-2xs font-bold uppercase tracking-wide text-brand-accent">
          {score}% Match
        </span>
        <span className="h-1.5 w-1.5 rounded-full bg-brand-accent" />
      </div>
      <p className="mt-1.5 text-sm font-bold text-brand-fg">{role}</p>
      <p className="mt-0.5 flex items-center gap-1 text-xs text-brand-fg-muted">
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
