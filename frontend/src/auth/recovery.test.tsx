/**
 * Password reset and email verification, from the browser's side.
 *
 * Run against MSW so the real client code executes. The interesting assertions
 * are about what the UI refuses to reveal, and about the states people actually
 * hit: a mangled link, a spent link, a link opened while signed out.
 */

import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import App from '../App'
import { renderWithProviders } from '../test/render'
import { state } from '../test/server'

describe('forgot password', () => {
  it('is reachable from the sign-in screen', async () => {
    const user = userEvent.setup()
    renderWithProviders(<App />, { route: '/login' })

    await user.click(await screen.findByRole('link', { name: /forgot your password/i }))

    expect(await screen.findByRole('heading', { name: /reset your password/i })).toBeInTheDocument()
  })

  it('sends the address to the server', async () => {
    const user = userEvent.setup()
    renderWithProviders(<App />, { route: '/forgot-password' })

    await user.type(await screen.findByLabelText(/email/i), 'dev@example.com')
    await user.click(screen.getByRole('button', { name: /email me a link/i }))

    await waitFor(() => expect(state.resetRequests).toEqual(['dev@example.com']))
  })

  it('says the same thing for an unknown address as a known one', async () => {
    /**
     * The API answers 204 either way on purpose. If the UI said "sent!" for one
     * and "no such account" for the other, it would hand back the account
     * enumeration the API just refused to give.
     */
    const user = userEvent.setup()
    renderWithProviders(<App />, { route: '/forgot-password' })

    await user.type(await screen.findByLabelText(/email/i), 'nobody@example.com')
    await user.click(screen.getByRole('button', { name: /email me a link/i }))

    const confirmation = await screen.findByRole('heading', { name: /check your inbox/i })
    expect(confirmation).toBeInTheDocument()
    expect(screen.getByText(/if that address has an account/i)).toBeInTheDocument()
  })

  it('surfaces a rejected address instead of pretending it worked', async () => {
    const user = userEvent.setup()
    renderWithProviders(<App />, { route: '/forgot-password' })

    await user.type(await screen.findByLabelText(/email/i), 'not-an-email')
    await user.click(screen.getByRole('button', { name: /email me a link/i }))

    expect(await screen.findByText(/enter a valid email address/i)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /check your inbox/i })).not.toBeInTheDocument()
  })
})

describe('choosing a new password', () => {
  it('accepts a good link and sends the user to sign in', async () => {
    const user = userEvent.setup()
    renderWithProviders(<App />, { route: '/reset-password?uid=abc&token=good-token' })

    await user.type(await screen.findByLabelText(/new password/i), 'a-brand-new-passphrase')
    await user.click(screen.getByRole('button', { name: /set my new password/i }))

    expect(await screen.findByText(/password updated/i)).toBeInTheDocument()
  })

  it('explains a dead link rather than failing silently', async () => {
    const user = userEvent.setup()
    renderWithProviders(<App />, { route: '/reset-password?uid=abc&token=stale' })

    await user.type(await screen.findByLabelText(/new password/i), 'a-brand-new-passphrase')
    await user.click(screen.getByRole('button', { name: /set my new password/i }))

    expect(await screen.findByText(/invalid or has expired/i)).toBeInTheDocument()
  })

  it('catches a truncated link before asking for a password', async () => {
    renderWithProviders(<App />, { route: '/reset-password?uid=abc' })

    expect(await screen.findByRole('heading', { name: /link is incomplete/i })).toBeInTheDocument()
    expect(screen.queryByLabelText(/new password/i)).not.toBeInTheDocument()
  })
})

describe('email verification', () => {
  it('confirms the address from the link', async () => {
    renderWithProviders(<App />, { route: '/verify-email?uid=abc&token=good-token' })

    expect(await screen.findByRole('heading', { name: /email confirmed/i })).toBeInTheDocument()
  })

  it('reports a spent link honestly', async () => {
    renderWithProviders(<App />, { route: '/verify-email?uid=abc&token=already-used' })

    expect(await screen.findByRole('heading', { name: /didn't work/i })).toBeInTheDocument()
  })

  it('works while signed out, because mail opens in whatever browser it likes', async () => {
    state.refreshValid = false

    renderWithProviders(<App />, { route: '/verify-email?uid=abc&token=good-token' })

    expect(await screen.findByRole('heading', { name: /email confirmed/i })).toBeInTheDocument()
    // Not bounced to /login with the token thrown away.
    expect(screen.getByRole('link', { name: /sign in/i })).toBeInTheDocument()
  })
})

describe('the unverified banner', () => {
  it('does not appear for a verified account', async () => {
    state.refreshValid = true
    state.user = { ...state.user, emailVerified: true }

    renderWithProviders(<App />, { route: '/app' })

    await screen.findByRole('heading', { name: 'Jobs' })
    expect(screen.queryByText(/to get the daily digest/i)).not.toBeInTheDocument()
  })

  it('appears for an unverified one and can send a fresh link', async () => {
    state.refreshValid = true
    state.user = { ...state.user, emailVerified: false }
    const user = userEvent.setup()

    renderWithProviders(<App />, { route: '/app' })

    expect(await screen.findByText(/to get the daily digest/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /resend the link/i }))

    await waitFor(() => expect(state.verifyResends).toBe(1))
    expect(await screen.findByText(/check your inbox/i)).toBeInTheDocument()
  })

  it('says what is actually being withheld', async () => {
    /** A banner that cannot explain itself gets dismissed and never acted on. */
    state.refreshValid = true
    state.user = { ...state.user, emailVerified: false }

    renderWithProviders(<App />, { route: '/app' })

    expect(await screen.findByText(/everything else works already/i)).toBeInTheDocument()
  })

  it('can be dismissed without blocking anything', async () => {
    state.refreshValid = true
    state.user = { ...state.user, emailVerified: false }
    const user = userEvent.setup()

    renderWithProviders(<App />, { route: '/app' })
    await screen.findByText(/to get the daily digest/i)

    await user.click(screen.getByRole('button', { name: /dismiss/i }))

    expect(screen.queryByText(/to get the daily digest/i)).not.toBeInTheDocument()
    // The app was never blocked in the first place.
    expect(screen.getByRole('heading', { name: 'Jobs' })).toBeInTheDocument()
  })
})
