import { useEffect, useState } from 'react'

/**
 * Render one layout or the other, rather than both.
 *
 * Hiding a duplicate with CSS leaves it in the DOM, which means duplicated
 * element ids and every control announced twice to a screen reader. For a table
 * that collapses to cards, that is not a trade worth making.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false,
  )

  useEffect(() => {
    if (!window.matchMedia) return
    const list = window.matchMedia(query)
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches)
    setMatches(list.matches)
    list.addEventListener('change', onChange)
    return () => list.removeEventListener('change', onChange)
  }, [query])

  return matches
}

/**
 * The job portal's 3-column breakpoint (filters | cards | detail panel).
 *
 * Three real columns plus a sticky detail panel need real room, and this is
 * also the exact point at which a job card's title starts opening the inline
 * panel instead of navigating to the standalone page — the two have to agree,
 * or a click could intercept navigation into a panel that isn't on screen.
 * Matches Tailwind's `xl:` breakpoint (1280px) so the JS and the CSS grid
 * never disagree about which layout is showing.
 */
export const PORTAL_WIDE = '(min-width: 1280px)'
