import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { renderWithProviders } from '../test/render'
import { state } from '../test/server'
import { ReminderPicker } from './ReminderPicker'

beforeEach(() => {
  state.refreshValid = true
})

describe('ReminderPicker', () => {
  it('sets a reminder date', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ReminderPicker jobId={1} value={null} />)

    await user.type(await screen.findByLabelText(/remind me on/i), '2026-09-01')

    await waitFor(() =>
      expect(state.jobs.find((job) => job.id === 1)?.remindAt).toContain('2026-09-01'),
    )
  })

  it('clears an existing reminder', async () => {
    const user = userEvent.setup()
    state.jobs.find((job) => job.id === 1)!.remindAt = '2026-09-01T09:00:00Z'
    renderWithProviders(<ReminderPicker jobId={1} value="2026-09-01T09:00:00Z" />)

    await user.click(await screen.findByRole('button', { name: /clear reminder/i }))

    await waitFor(() => expect(state.jobs.find((job) => job.id === 1)?.remindAt).toBeNull())
  })
})
