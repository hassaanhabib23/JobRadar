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
    emailVerified: boolean
    dateJoined: string
  }
  /** Access tokens the API will accept. */
  validTokens: Set<string>
  refreshCount: number
  runsTriggered: number
  /** Addresses passed to the reset-request endpoint, in order. */
  resetRequests: string[]
  /** How many times a fresh verification link was asked for. */
  verifyResends: number
  /** The query string of the most recent job list request. */
  lastJobQuery: string
  bulkUpdates: { ids: number[]; status: string }[]
  statusHistory: Record<number, { fromStatus: string; toStatus: string; changedAt: string }[]>
  resume: {
    detectedSkills: Record<string, number>
    detectedRoleKeywords: string[]
    detectedSeniority: string
    uploadedAt: string
    parsedAt: string | null
  } | null
  /** Set by a test to make the next upload fail with a specific server reason. */
  nextResumeUploadError: { status: number; body: Record<string, unknown> } | null
  jobs: MockJob[]
}

export interface MockJob {
  id: number
  key: string
  source: string
  company: string
  title: string
  location: string
  url: string
  description: string
  postedAt: string | null
  firstSeen: string
  lastSeen: string
  closedAt: string | null
  seenCount: number
  score: number
  tier: string
  status: string
  notes: string
  pinned: boolean
  remindAt: string | null
  isNew: boolean
  flags: string[]
  detail: Record<string, unknown> | null
  alsoSeenOn: string[]
  dateFrom: string
  trackingDays: number
}

function job(overrides: Partial<MockJob> = {}): MockJob {
  return {
    id: 1,
    key: 'greenhouse:careem:1',
    source: 'greenhouse',
    company: 'Careem',
    title: 'Associate Software Engineer',
    location: 'Islamabad, Pakistan',
    url: 'https://example.com/job/1',
    description: 'Build things with ASP.NET Core.',
    postedAt: '2026-08-14',
    firstSeen: '2026-08-16T04:00:00Z',
    lastSeen: '2026-08-16T04:00:00Z',
    closedAt: null,
    seenCount: 3,
    score: 87,
    tier: 'High',
    status: 'not_started',
    notes: '',
    pinned: false,
    remindAt: null,
    isNew: true,
    flags: [],
    detail: {
      stack: 28.4,
      level: 23.8,
      location: 20,
      fresh: 15,
      skillsHit: ['asp.net core', 'asp.net', 'c#', 'azure'],
      notes: ['matched 4 skills', 'entry-level signal: associate', 'preferred location'],
      ageDays: 2,
      ageInferred: false,
    },
    alsoSeenOn: [],
    dateFrom: '',
    trackingDays: 0,
    ...overrides,
  }
}

export const state: MockState = createState()

function createState(): MockState {
  return {
    refreshValid: false,
    user: {
      id: 1,
      email: 'dev@example.com',
      onboardingComplete: true,
      emailVerified: true,
      dateJoined: '2026-08-01T00:00:00Z',
    },
    validTokens: new Set<string>(),
    refreshCount: 0,
    runsTriggered: 0,
    resetRequests: [],
    verifyResends: 0,
    lastJobQuery: '',
    bulkUpdates: [],
    statusHistory: {},
    resume: null,
    nextResumeUploadError: null,
    jobs: [
      job(),
      job({
        id: 2,
        key: 'greenhouse:careem:2',
        title: 'Junior React Developer',
        company: 'Arbisoft',
        score: 61,
        tier: 'Medium',
        isNew: false,
        flags: ['ghost?'],
        alsoSeenOn: ['linkedin'],
        trackingDays: 30,
        detail: {
          stack: 18,
          level: 25,
          location: 13,
          fresh: 1,
          skillsHit: ['react', 'typescript'],
          notes: ['matched 2 skills', 'listed 30d without closing'],
          ageDays: 30,
          ageInferred: true,
        },
      }),
    ],
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

  // Mirrors the real endpoint's most important property: 204 whether or not
  // the address is known, so a test can prove the UI does not leak it either.
  http.post(`${API}/auth/password/reset/`, async ({ request }) => {
    const body = (await request.json()) as { email?: string }
    if (!body.email?.includes('@')) {
      return HttpResponse.json({ email: ['Enter a valid email address.'] }, { status: 400 })
    }
    state.resetRequests.push(body.email)
    return new HttpResponse(null, { status: 204 })
  }),

  http.post(`${API}/auth/password/reset/confirm/`, async ({ request }) => {
    const body = (await request.json()) as { token?: string; password?: string }
    if (body.token !== 'good-token') {
      return HttpResponse.json(
        { token: ['This link is invalid or has expired. Request a new one.'] },
        { status: 400 },
      )
    }
    if ((body.password ?? '').length < 8) {
      return HttpResponse.json({ password: ['This password is too short.'] }, { status: 400 })
    }
    return new HttpResponse(null, { status: 204 })
  }),

  http.post(`${API}/auth/email/verify/`, async ({ request }) => {
    const body = (await request.json()) as { token?: string }
    if (body.token !== 'good-token') {
      return HttpResponse.json({ token: ['This link is invalid.'] }, { status: 400 })
    }
    state.user = { ...state.user, emailVerified: true }
    return new HttpResponse(null, { status: 204 })
  }),

  http.post(`${API}/auth/email/verify/resend/`, ({ request }) => {
    if (!authed(request)) return unauthorized()
    state.verifyResends += 1
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

  http.get(`${API}/jobs/statuses/`, () =>
    HttpResponse.json([
      { value: 'not_started', label: 'Not started' },
      { value: 'researching', label: 'Researching' },
      { value: 'applied', label: 'Applied' },
      { value: 'interviewing', label: 'Interviewing' },
      { value: 'rejected', label: 'Rejected' },
      { value: 'skipped', label: 'Skipped' },
    ]),
  ),

  http.get(`${API}/jobs/`, ({ request }) => {
    if (!authed(request)) return unauthorized()
    const url = new URL(request.url)
    state.lastJobQuery = url.search
    return HttpResponse.json({
      count: state.jobs.length,
      next: null,
      previous: null,
      results: state.jobs,
    })
  }),

  http.get(`${API}/jobs/:id/`, ({ request, params }) => {
    if (!authed(request)) return unauthorized()
    const found = state.jobs.find((entry) => entry.id === Number(params.id))
    return found ? HttpResponse.json(found) : HttpResponse.json({}, { status: 404 })
  }),

  http.patch(`${API}/jobs/:id/`, async ({ request, params }) => {
    if (!authed(request)) return unauthorized()
    const patch = (await request.json()) as Partial<MockJob>
    const found = state.jobs.find((entry) => entry.id === Number(params.id))
    if (!found) return HttpResponse.json({}, { status: 404 })
    Object.assign(found, patch)
    return HttpResponse.json(found)
  }),

  http.post(`${API}/jobs/bulk_status/`, async ({ request }) => {
    if (!authed(request)) return unauthorized()
    const body = (await request.json()) as { ids: number[]; status: string }
    state.bulkUpdates.push(body)
    state.jobs.forEach((entry) => {
      if (body.ids.includes(entry.id)) entry.status = body.status
    })
    return HttpResponse.json({ updated: body.ids.length })
  }),

  http.get(`${API}/jobs/:id/status_history/`, ({ request, params }) => {
    if (!authed(request)) return unauthorized()
    return HttpResponse.json(state.statusHistory[Number(params.id)] ?? [])
  }),

  http.get(`${API}/resume/`, ({ request }) => {
    if (!authed(request)) return unauthorized()
    return state.resume ? HttpResponse.json(state.resume) : HttpResponse.json({}, { status: 404 })
  }),

  http.post(`${API}/resume/`, ({ request }) => {
    if (!authed(request)) return unauthorized()

    // Lets a test simulate the real API's specific rejection reasons
    // (too large, unreadable, wrong type) without parsing the multipart
    // body — jsdom's File/FormData and Node's undici fetch don't
    // interoperate cleanly enough in tests to read it back reliably.
    if (state.nextResumeUploadError) {
      const { status, body } = state.nextResumeUploadError
      state.nextResumeUploadError = null
      return HttpResponse.json(body, { status })
    }

    state.resume = {
      detectedSkills: { react: 6, typescript: 4 },
      detectedRoleKeywords: ['react'],
      detectedSeniority: 'senior',
      uploadedAt: '2026-08-26T09:00:00Z',
      parsedAt: '2026-08-26T09:00:00Z',
    }
    return HttpResponse.json(state.resume, { status: 201 })
  }),

  http.delete(`${API}/resume/`, ({ request }) => {
    if (!authed(request)) return unauthorized()
    if (!state.resume) return HttpResponse.json({}, { status: 404 })
    state.resume = null
    return new HttpResponse(null, { status: 204 })
  }),

  http.get(`${API}/runs/`, ({ request }) =>
    authed(request)
      ? HttpResponse.json({ count: 0, next: null, previous: null, results: [] })
      : unauthorized(),
  ),

  http.get(`${API}/profile/`, ({ request }) =>
    authed(request)
      ? HttpResponse.json({
          skills: { 'asp.net core': 10, react: 6 },
          levelBonus: {},
          levelPenalty: {},
          titleBlocklist: ['recruiter'],
          locationsAllowed: ['islamabad'],
          locationsPreferred: ['islamabad'],
          locationsSecondary: ['pakistan'],
          stackSaturation: 45,
          freshness: { maxAgeDays: 60 },
          roleKeywords: ['dotnet'],
          updatedAt: '2026-08-16T04:00:00Z',
        })
      : unauthorized(),
  ),

  http.post(`${API}/profile/preview/`, ({ request }) =>
    authed(request)
      ? HttpResponse.json({
          score: 72,
          tier: 'Medium',
          detail: {
            stack: 24,
            level: 20,
            location: 20,
            fresh: 8,
            skillsHit: ['react'],
            notes: ['matched 1 skill'],
            ageDays: null,
            ageInferred: false,
          },
          flags: [],
          filtered: false,
          filteredReason: null,
        })
      : unauthorized(),
  ),

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
