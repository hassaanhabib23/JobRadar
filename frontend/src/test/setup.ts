import '@testing-library/jest-dom/vitest'

import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll } from 'vitest'

import { resetClientState } from '../api/client'
import { resetConfigCache } from '../config'
import { resetState, server } from './server'

// `error` rather than `warn`: an unhandled request means a test is about to
// exercise something the mock does not describe, which is exactly the silent
// gap MSW exists to close.
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))

afterEach(() => {
  cleanup()
  server.resetHandlers()
  resetState()
  resetClientState()
  resetConfigCache()
})

afterAll(() => server.close())
