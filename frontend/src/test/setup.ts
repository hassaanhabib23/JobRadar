import '@testing-library/jest-dom/vitest'

import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, vi } from 'vitest'

import { resetClientState } from '../api/client'
import { resetConfigCache } from '../config'
import { resetState, server } from './server'

// `error` rather than `warn`: an unhandled request means a test is about to
// exercise something the mock does not describe, which is exactly the silent
// gap MSW exists to close.
// jsdom implements no matchMedia at all. Without this the dashboard would
// always take the narrow branch, and the table would never be under test.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: query.includes('min-width: 1024px'),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }),
})

// jsdom has no IntersectionObserver either, and the landing page's scroll
// reveal needs one. This stub reveals immediately, which is the same end state
// a reduced-motion user gets.
class ImmediateObserver {
  constructor(private callback: IntersectionObserverCallback) {}
  observe(target: Element) {
    this.callback(
      [{ isIntersecting: true, target } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    )
  }
  unobserve() {}
  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] {
    return []
  }
  root = null
  rootMargin = ''
  thresholds = []
}
vi.stubGlobal('IntersectionObserver', ImmediateObserver)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))

afterEach(() => {
  cleanup()
  server.resetHandlers()
  resetState()
  resetClientState()
  resetConfigCache()
})

afterAll(() => server.close())
