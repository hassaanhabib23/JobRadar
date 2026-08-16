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
 * The table/card breakpoint.
 *
 * Matches the sidebar's own breakpoint on purpose: below it the sidebar is a
 * slide-over and the content has the full width, so a table would be squeezed
 * into whatever the sidebar left behind.
 */
export const WIDE_SCREEN = '(min-width: 1024px)'
