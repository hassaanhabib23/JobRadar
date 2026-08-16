/**
 * A subtle on-scroll reveal.
 *
 * IntersectionObserver plus a CSS transition — no animation library. GSAP would
 * be 60 KB on the one page whose whole job is rendering fast on a slow mobile
 * connection, to do something twelve lines of CSS already does.
 *
 * Motion here is decoration, never information: `prefers-reduced-motion` skips
 * straight to the final state.
 *
 * **It fails visible, in three ways.** Without `IntersectionObserver` it never
 * hides at all; if the element is already on screen when it mounts it reveals
 * on the spot; and a timer reveals it regardless after a second. An entrance
 * animation that can strand the copy at `opacity: 0` is worse than no animation
 * — the page would simply have a hole in it.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react'

import { cx } from './ui'

export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode
  /** Stagger, in ms. Keep it small — this should be felt, not watched. */
  delay?: number
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  // Visible by default where the observer does not exist to hide it.
  const [shown, setShown] = useState(() => typeof IntersectionObserver === 'undefined')

  useEffect(() => {
    const element = ref.current
    if (!element) return

    // Anyone who has asked for less motion gets the final state immediately.
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setShown(true)
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setShown(true)
          observer.disconnect()
        }
      },
      // Fires slightly before it reaches the viewport, so it has finished
      // moving by the time it is properly in view.
      { rootMargin: '0px 0px -10% 0px', threshold: 0.05 },
    )

    observer.observe(element)

    // The backstop. If the observer has not fired within a second — a page
    // captured full-height, a viewport resized past it, anything unusual — the
    // copy appears anyway rather than staying invisible forever.
    const fallback = setTimeout(() => {
      setShown(true)
      observer.disconnect()
    }, 1000)

    return () => {
      clearTimeout(fallback)
      observer.disconnect()
    }
  }, [])

  return (
    <div
      ref={ref}
      style={shown ? { transitionDelay: `${delay}ms` } : undefined}
      className={cx(
        'transition-[opacity,transform] duration-500 ease-out motion-reduce:transition-none',
        shown ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0',
        className,
      )}
    >
      {children}
    </div>
  )
}
