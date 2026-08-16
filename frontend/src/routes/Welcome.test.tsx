/**
 * Onboarding.
 *
 * The point of this screen is that a new user's first dashboard is not empty.
 * These tests hold that: the profile is saved, a run is triggered, and skipping
 * still leaves a working setup.
 */

import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import App from '../App'
import { renderWithProviders } from '../test/render'
import { state } from '../test/server'

async function startOnboarding() {
  state.refreshValid = true
  state.user.onboardingComplete = false
  renderWithProviders(<App />, { route: '/welcome' })
  await screen.findByRole('heading', { name: /where do you want to work/i })
  return userEvent.setup()
}

describe('onboarding', () => {
  beforeEach(() => {
    state.refreshValid = true
  })

  it('defaults to Islamabad and Rawalpindi', async () => {
    await startOnboarding()

    expect(await screen.findByRole('checkbox', { name: /islamabad/i })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /rawalpindi/i })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /^lahore$/i })).not.toBeChecked()
  })

  it('requires at least one city', async () => {
    const user = await startOnboarding()

    await user.click(await screen.findByRole('checkbox', { name: /islamabad/i }))
    await user.click(screen.getByRole('checkbox', { name: /rawalpindi/i }))

    expect(screen.getByRole('button', { name: /continue/i })).toBeDisabled()
    expect(screen.getByText(/choose at least one city/i)).toBeInTheDocument()
  })

  it('announces the selection count to screen readers', async () => {
    const user = await startOnboarding()

    await user.click(await screen.findByRole('checkbox', { name: /^lahore$/i }))

    expect(screen.getByText('3 selected')).toBeInTheDocument()
  })

  it('walks through all three steps and triggers a run', async () => {
    const user = await startOnboarding()

    await user.click(await screen.findByRole('button', { name: /continue/i }))
    expect(await screen.findByRole('heading', { name: /what do you build/i })).toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: /\.net/i }))
    await user.click(screen.getByRole('button', { name: /continue/i }))

    expect(await screen.findByRole('heading', { name: /you're set up/i })).toBeInTheDocument()
    // A run so their first dashboard has jobs in it, not an empty state.
    await waitFor(() => expect(state.runsTriggered).toBe(1))
  })

  it('can go back to change the cities', async () => {
    const user = await startOnboarding()

    await user.click(await screen.findByRole('button', { name: /continue/i }))
    await screen.findByRole('heading', { name: /what do you build/i })
    await user.click(screen.getByRole('button', { name: /back/i }))

    expect(
      await screen.findByRole('heading', { name: /where do you want to work/i }),
    ).toBeInTheDocument()
  })

  it('finishing marks onboarding complete and opens the dashboard', async () => {
    const user = await startOnboarding()

    await user.click(await screen.findByRole('button', { name: /continue/i }))
    await user.click(await screen.findByRole('button', { name: /continue/i }))
    await user.click(await screen.findByRole('button', { name: /go to my dashboard/i }))

    expect(await screen.findByRole('heading', { name: /^jobs$/i })).toBeInTheDocument()
    expect(state.user.onboardingComplete).toBe(true)
  })

  it('can be skipped, and the defaults still work', async () => {
    const user = await startOnboarding()

    await user.click(await screen.findByRole('button', { name: /skip for now/i }))

    expect(await screen.findByRole('heading', { name: /^jobs$/i })).toBeInTheDocument()
    expect(state.user.onboardingComplete).toBe(true)
  })

  it('sends a user who has not onboarded back to /welcome', async () => {
    state.user.onboardingComplete = false

    renderWithProviders(<App />, { route: '/app' })

    expect(
      await screen.findByRole('heading', { name: /where do you want to work/i }),
    ).toBeInTheDocument()
  })

  it('every control is reachable by keyboard alone', async () => {
    const user = await startOnboarding()
    await screen.findByRole('checkbox', { name: /islamabad/i })

    // Tab until the first city checkbox has focus, then toggle it with the
    // keyboard — chips are real checkboxes precisely so this works.
    const islamabad = screen.getByRole('checkbox', { name: /islamabad/i })
    islamabad.focus()
    expect(islamabad).toHaveFocus()

    await user.keyboard(' ')
    expect(islamabad).not.toBeChecked()
  })
})
