import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import App from './App'

afterEach(() => {
  vi.unstubAllGlobals()
})

/** MSW replaces this hand-rolled stub in milestone 7, once there is a real API surface. */
function stubFetch(handler: (url: string) => Response | Promise<Response>) {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => handler(String(input))),
  )
}

const healthResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('App', () => {
  it('shows a loading state before the API answers', () => {
    stubFetch(() => new Promise<Response>(() => {}))

    render(<App />)

    expect(screen.getByText(/checking the api/i)).toBeInTheDocument()
  })

  it('renders the health status once loaded', async () => {
    stubFetch((url) =>
      url.includes('/config.json')
        ? healthResponse({ apiBaseUrl: '/api' })
        : healthResponse({ status: 'ok', checks: { database: 'ok' } }),
    )

    render(<App />)

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('API ok · database ok'),
    )
  })

  it('surfaces an error rather than failing silently', async () => {
    stubFetch((url) =>
      url.includes('/config.json')
        ? healthResponse({ apiBaseUrl: '/api' })
        : healthResponse({ detail: 'boom' }, 503),
    )

    render(<App />)

    expect(await screen.findByRole('alert')).toHaveTextContent(/api unreachable/i)
  })
})
