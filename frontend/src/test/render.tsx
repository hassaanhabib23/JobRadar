/**
 * Test helper: the app inside its real providers.
 *
 * Rendering the real router and the real QueryClientProvider means route
 * guards, redirects and the silent-refresh path are all under test rather than
 * mocked out.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, type RenderResult } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router-dom'

import { AuthProvider } from '../auth/AuthProvider'

export function renderWithProviders(
  ui: ReactElement,
  { route = '/' }: { route?: string } = {},
): RenderResult {
  const queryClient = new QueryClient({
    defaultOptions: {
      // Retries turn a deliberate 4xx into a multi-second wait.
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <AuthProvider>{ui}</AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}
