/**
 * The mock API.
 *
 * MSW intercepts at the network layer, so the app's real client code runs —
 * headers, credentials, the 401 path and the silent refresh are all exercised
 * rather than stubbed away. No test may hit a real backend.
 */

import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'

// Relative, so handlers match whatever origin jsdom is serving from. An
// absolute origin here silently misses every request the app actually makes.
export const API = '/api'

export interface MockState {
  /** Whether the httpOnly refresh cookie would still be valid. */
  refreshValid: boolean
  user: {
    id: number
    email: string
    onboardingComplete: boolean
    dateJoined: string
  }
  /** Access tokens the API will accept. */
  validTokens: Set<string>
  refreshCount: number
  runsTriggered: number
}

export const state: MockState = createState()

function createState(): MockState {
  return {
    refreshValid: false,
    user: {
      id: 1,
      email: 'dev@example.com',
      onboardingComplete: true,
      dateJoined: '2026-08-01T00:00:00Z',
    },
    validTokens: new Set<string>(),
    refreshCount: 0,
    runsTriggered: 0,
  }
}

export function resetState(): void {
  Object.assign(state, createState())
}

function authed(request: Request): boolean {
  const header = request.headers.get('Authorization') ?? ''
  const token = header.replace('Bearer ', '')
  return Boolean(token) && state.validTokens.has(token)
}

const unauthorized = () =>
  HttpResponse.json({ detail: 'Authentication credentials were not provided.' }, { status: 401 })

export const handlers = [
  // The app reads its API base URL from /config.json at start-up, exactly as it
  // does in the container.
  http.get('/config.json', () => HttpResponse.json({ apiBaseUrl: '/api' })),

  http.post(`${API}/auth/refresh/`, () => {
    if (!state.refreshValid) {
      return HttpResponse.json({ detail: 'Token is invalid or expired.' }, { status: 401 })
    }
    state.refreshCount += 1
    const access = `access-after-refresh-${state.refreshCount}`
    state.validTokens.add(access)
    return HttpResponse.json({ access })
  }),

  http.post(`${API}/auth/login/`, async ({ request }) => {
    const body = (await request.json()) as { email: string; password: string }
    if (body.password !== 'correct-horse-battery') {
      return HttpResponse.json(
        { detail: 'No active account found with the given credentials.' },
        { status: 401 },
      )
    }
    const access = 'access-from-login'
    state.validTokens.add(access)
    state.refreshValid = true
    state.user.email = body.email
    return HttpResponse.json({ user: state.user, access })
  }),

  http.post(`${API}/auth/register/`, async ({ request }) => {
    const body = (await request.json()) as { email: string; password: string }
    if (body.password.length < 8) {
      return HttpResponse.json({ password: ['This password is too short.'] }, { status: 400 })
    }
    if (body.email === 'taken@example.com') {
      return HttpResponse.json(
        { email: ['An account with this email already exists.'] },
        { status: 400 },
      )
    }
    const access = 'access-from-register'
    state.validTokens.add(access)
    state.refreshValid = true
    state.user = { ...state.user, email: body.email, onboardingComplete: false }
    return HttpResponse.json({ user: state.user, access }, { status: 201 })
  }),

  http.post(`${API}/auth/logout/`, () => {
    state.validTokens.clear()
    state.refreshValid = false
    return new HttpResponse(null, { status: 204 })
  }),

  http.get(`${API}/auth/me/`, ({ request }) =>
    authed(request) ? HttpResponse.json(state.user) : unauthorized(),
  ),

  http.patch(`${API}/auth/me/`, async ({ request }) => {
    if (!authed(request)) return unauthorized()
    const body = (await request.json()) as { onboardingComplete?: boolean }
    if (body.onboardingComplete !== undefined) {
      state.user.onboardingComplete = body.onboardingComplete
    }
    return HttpResponse.json(state.user)
  }),

  http.get(`${API}/locations/`, () =>
    HttpResponse.json([
      { key: 'islamabad', label: 'Islamabad', aliases: ['isb'] },
      { key: 'rawalpindi', label: 'Rawalpindi', aliases: ['pindi'] },
      { key: 'lahore', label: 'Lahore', aliases: [] },
      { key: 'karachi', label: 'Karachi', aliases: [] },
      { key: 'remote_pk', label: 'Remote (Pakistan)', aliases: ['remote'] },
    ]),
  ),

  http.patch(`${API}/profile/`, async ({ request }) => {
    if (!authed(request)) return unauthorized()
    return HttpResponse.json(await request.json())
  }),

  http.post(`${API}/runs/`, ({ request }) => {
    if (!authed(request)) return unauthorized()
    state.runsTriggered += 1
    return HttpResponse.json({ taskId: 'task-1', runId: state.runsTriggered }, { status: 202 })
  }),

  http.get(`${API}/stats/`, ({ request }) =>
    authed(request)
      ? HttpResponse.json({
          openCount: 31,
          newToday: 4,
          byTier: { High: 1, Stretch: 30 },
          bySource: { greenhouse: 7 },
          byStatus: { not_started: 31 },
          avgScore: 42.3,
          lastRunAt: '2026-08-16T04:00:00Z',
          scoreHistogram: [],
        })
      : unauthorized(),
  ),
]

export const server = setupServer(...handlers)
