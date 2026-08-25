import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { renderWithProviders } from '../test/render'
import { state } from '../test/server'
import { StatusTimeline } from './StatusTimeline'

beforeEach(() => {
  state.refreshValid = true
})

describe('StatusTimeline', () => {
  it('renders each transition, newest first', async () => {
    state.statusHistory[1] = [
      { fromStatus: 'researching', toStatus: 'applied', changedAt: '2026-08-20T09:00:00Z' },
      { fromStatus: 'not_started', toStatus: 'researching', changedAt: '2026-08-18T09:00:00Z' },
    ]
    renderWithProviders(<StatusTimeline jobId={1} />)

    const items = await screen.findAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent(/researching.*applied/i)
    expect(items[1]).toHaveTextContent(/not started.*researching/i)
  })

  it('says nothing has changed yet when there is no history', async () => {
    state.statusHistory[1] = []
    renderWithProviders(<StatusTimeline jobId={1} />)

    expect(await screen.findByText(/no status changes yet/i)).toBeInTheDocument()
  })
})
