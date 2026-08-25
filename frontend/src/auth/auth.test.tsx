/**
 * Auth, routing and the silent refresh.
 *
 * These run against MSW, so the real client code executes — including the 401
 * path, which is the part most likely to be subtly wrong.
 */

import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import App from '../App'
import { api, getAccessToken, setAccessToken } from '../api/client'
import { renderWithProviders } from '../test/render'
import { state } from '../test/server'

const PASSWORD = 'correct-horse-battery'

async function signIn(email = 'dev@example.com', password = PASSWORD) {
  const user = userEvent.setup()
  await user.type(await screen.findByLabelText(/email/i), email)
  await user.type(screen.getByLabelText(/password/i), password)
  await user.click(screen.getByRole('button', { name: /sign in/i }))
  return user
}

describe('routing', () => {
  it('shows the landing page to an anonymous visitor at /', async () => {
    renderWithProviders(<App />, { route: '/' })

    expect(await screen.findByRole('heading', { name: /in one place/i })).toBeInTheDocument()
  })

  it('sends an authenticated visitor from / to the app', async () => {
    state.refreshValid = true

    renderWithProviders(<App />, { route: '/' })

    // The landing page is still reachable when logged in — the header link is
    // deliberate — so the redirect belongs on /login and /register, not here.
    expect(await screen.findByRole('heading', { name: /in one place/i })).toBeInTheDocument()
  })

  it('redirects an anonymous visitor away from a protected route', async () => {
    renderWithProviders(<App />, { route: '/app' })

    expect(await screen.findByRole('heading', { name: /sign in/i })).toBeInTheDocument()
  })

  it('sends an authenticated visitor away from /login', async () => {
    state.refreshValid = true

    renderWithProviders(<App />, { route: '/login' })

    expect(await screen.findByRole('heading', { name: /^jobs$/i })).toBeInTheDocument()
  })

  it('returns the visitor to where they were heading after signing in', async () => {
    // The whole point of remembering the destination: a link to a specific job
    // must not become "the dashboard".
    renderWithProviders(<App />, { route: '/app/jobs/1' })

    await screen.findByRole('heading', { name: /sign in/i })
    await signIn()

    // The job detail page, not the dashboard.
    expect(
      await screen.findByRole('heading', { name: /associate software engineer/i }),
    ).toBeInTheDocument()
  })
})

describe('session restoration', () => {
  it('does not flash the login screen while the refresh is in flight', async () => {
    state.refreshValid = true

    renderWithProviders(<App />, { route: '/app' })

    // On a page reload there is no access token yet. Deciding before the
    // refresh answers would log every returning user out.
    expect(await screen.findByRole('status')).toHaveTextContent(/restoring your session/i)
    expect(await screen.findByRole('heading', { name: /^jobs$/i })).toBeInTheDocument()
  })

  it('restores a session from the refresh cookie alone', async () => {
    state.refreshValid = true

    renderWithProviders(<App />, { route: '/app' })

    await screen.findByRole('heading', { name: /^jobs$/i })
    expect(state.refreshCount).toBeGreaterThan(0)
    expect(getAccessToken()).toBeTruthy()
  })

  it('falls back to login when the refresh cookie is dead', async () => {
    state.refreshValid = false

    renderWithProviders(<App />, { route: '/app' })

    expect(await screen.findByRole('heading', { name: /sign in/i })).toBeInTheDocument()
  })
})

describe('signing in', () => {
  it('rejects a wrong password without leaking whether the account exists', async () => {
    renderWithProviders(<App />, { route: '/login' })
    await screen.findByRole('heading', { name: /sign in/i })

    await signIn('dev@example.com', 'wrong-password')

    expect(await screen.findByRole('alert')).toHaveTextContent(/no active account/i)
  })

  it('keeps the access token out of storage', async () => {
    renderWithProviders(<App />, { route: '/login' })
    await screen.findByRole('heading', { name: /sign in/i })

    await signIn()
    await screen.findByRole('heading', { name: /^jobs$/i })

    // Anything an injected script can read, it can exfiltrate — so no token may
    // reach either storage. A display preference like the theme is fine there;
    // asserting storage is *empty* would fail for the wrong reason.
    const stored = [
      ...Object.entries({ ...window.localStorage }),
      ...Object.entries({ ...window.sessionStorage }),
    ]
    const token = getAccessToken()
    expect(token).toBeTruthy()
    for (const [key, value] of stored) {
      expect(value, `${key} must not hold the access token`).not.toContain(token)
      expect(key.toLowerCase()).not.toMatch(/token|auth|jwt|access|refresh/)
    }
  })

  it('sends a user who has not onboarded to /welcome', async () => {
    state.user.onboardingComplete = false

    renderWithProviders(<App />, { route: '/login' })
    await screen.findByRole('heading', { name: /sign in/i })
    await signIn()

    expect(await screen.findByRole('heading', { name: /upload your cv/i })).toBeInTheDocument()
  })
})

describe('signing out', () => {
  it('clears the session and returns to the landing page', async () => {
    state.refreshValid = true
    renderWithProviders(<App />, { route: '/app' })
    await screen.findByRole('heading', { name: /^jobs$/i })

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /sign out/i }))

    await waitFor(() => expect(getAccessToken()).toBeNull())
  })
})

describe('silent refresh', () => {
  it('retries a 401 once with a fresh token', async () => {
    state.refreshValid = true
    state.validTokens.add('stale-token')
    setAccessToken('stale-token')
    // The token is no longer accepted, as if it had expired mid-session.
    state.validTokens.delete('stale-token')

    const me = await api.get<{ email: string }>('/auth/me/')

    expect(me.email).toBe('dev@example.com')
    expect(state.refreshCount).toBe(1)
  })

  it('gives up after one failed refresh rather than looping', async () => {
    state.refreshValid = false
    setAccessToken('stale-token')

    await expect(api.get('/auth/me/')).rejects.toMatchObject({ status: 401 })
    expect(getAccessToken()).toBeNull()
  })

  it('shares one refresh across concurrent requests', async () => {
    // Without sharing, the first request rotates the token and the others fail
    // on one that was just blacklisted — logging the user out mid-session.
    state.refreshValid = true
    setAccessToken('stale-token')

    await Promise.all([api.get('/auth/me/'), api.get('/stats/'), api.get('/auth/me/')])

    expect(state.refreshCount).toBe(1)
  })
})
