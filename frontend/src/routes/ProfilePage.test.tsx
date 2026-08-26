/**
 * The résumé section of the profile settings page.
 *
 * Onboarding is not the only place a CV matters — this is where a user who
 * skipped it, or wants to update it, comes back to manage it.
 */

import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { renderWithProviders } from '../test/render'
import { state } from '../test/server'
import ProfilePage from './ProfilePage'

beforeEach(() => {
  state.refreshValid = true
})

describe('résumé section', () => {
  it('offers an upload when there is no résumé yet', async () => {
    renderWithProviders(<ProfilePage />)

    expect(await screen.findByText(/no cv uploaded yet/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/upload your cv/i)).toBeInTheDocument()
  })

  it('shows the detected signals for an existing résumé', async () => {
    state.resume = {
      detectedSkills: { react: 6, typescript: 4 },
      detectedRoleKeywords: ['react'],
      detectedSeniority: 'senior',
      uploadedAt: '2026-08-20T09:00:00Z',
      parsedAt: '2026-08-20T09:00:00Z',
    }

    renderWithProviders(<ProfilePage />)

    // The skills and seniority are one paragraph, split across a <strong>
    // and a trailing text node — match on the combined text of the <p>
    // itself (not any ancestor, which would also "contain" the same text),
    // so this doesn't collide with the per-skill labels below it.
    expect(
      await screen.findByText(
        (_, element) =>
          element?.tagName === 'P' && /react, typescript.*senior/i.test(element.textContent ?? ''),
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^remove$/i })).toBeInTheDocument()
  })

  it('uploading replaces the empty state with the new signals', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ProfilePage />)

    const input = await screen.findByLabelText(/upload your cv/i)
    await user.upload(input, new File(['fake pdf bytes'], 'cv.pdf', { type: 'application/pdf' }))

    // The mocked upload always returns react + typescript together.
    expect(
      await screen.findByText(
        (_, element) =>
          element?.tagName === 'P' && /react, typescript/i.test(element.textContent ?? ''),
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText(/no cv uploaded yet/i)).not.toBeInTheDocument()
  })

  it('shows the server’s actual rejection reason, not a generic message', async () => {
    state.nextResumeUploadError = {
      status: 400,
      body: { file: ['No text could be extracted from this file.'] },
    }
    const user = userEvent.setup()
    renderWithProviders(<ProfilePage />)

    const input = await screen.findByLabelText(/upload your cv/i)
    await user.upload(input, new File(['fake pdf bytes'], 'cv.pdf', { type: 'application/pdf' }))

    expect(
      await screen.findByText(/no text could be extracted from this file/i),
    ).toBeInTheDocument()
  })

  it('removing an uploaded résumé clears it', async () => {
    state.resume = {
      detectedSkills: { react: 6 },
      detectedRoleKeywords: ['react'],
      detectedSeniority: 'senior',
      uploadedAt: '2026-08-20T09:00:00Z',
      parsedAt: '2026-08-20T09:00:00Z',
    }
    const user = userEvent.setup()
    renderWithProviders(<ProfilePage />)

    await user.click(await screen.findByRole('button', { name: /^remove$/i }))

    await waitFor(() => expect(state.resume).toBeNull())
    expect(await screen.findByText(/no cv uploaded yet/i)).toBeInTheDocument()
  })
})
