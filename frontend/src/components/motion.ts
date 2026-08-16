/**
 * Motion helpers.
 *
 * No animation library. Everything here is a few lines of state plus a CSS
 * transition — GSAP would be 60 KB to do what `transform` already does, on an
 * app whose landing page has to render on a slow mobile connection.
 *
 * **Every one renders its final state immediately under
 * `prefers-reduced-motion`.** Motion is decoration here, never information, so
 * removing it must cost nothing.
 */

import { useEffect, useState, type CSSProperties } from 'react'

/** Whether the visitor has asked for less motion. Re-reads if they change it. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
  )

  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!query) return
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  return reduced
}

/**
 * False on the first paint, true immediately after.
 *
 * Drives "animate from empty to full on load" — the score bars grow from zero
 * rather than appearing already filled.
 */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    // Two frames: one to commit the initial state, one to transition from it.
    const frame = requestAnimationFrame(() => requestAnimationFrame(() => setMounted(true)))
    return () => cancelAnimationFrame(frame)
  }, [])

  return mounted
}

/**
 * A staggered entrance for a list.
 *
 * Returns the inline style for the nth item. Capped, because a delay that grows
 * without limit means the fiftieth row arrives a second and a half late.
 */
export function stagger(index: number, step = 35, max = 8): CSSProperties {
  return { animationDelay: `${Math.min(index, max) * step}ms` }
}
