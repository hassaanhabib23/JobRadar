/**
 * The API client.
 *
 * Two rules shape everything here:
 *
 * 1. **The access token lives in memory only.** Not localStorage, not a
 *    JavaScript-readable cookie — anything an injected script can read, it can
 *    exfiltrate. Losing the token on a page refresh is fine, because the refresh
 *    token is in an httpOnly cookie the browser sends automatically.
 * 2. **A 401 gets exactly one silent refresh.** More than one and a genuinely
 *    expired session becomes an infinite loop; none at all and the user is
 *    thrown back to the login screen every fifteen minutes.
 */

import { loadConfig } from '../config'

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
    message?: string,
  ) {
    super(message ?? `Request failed with ${status}`)
    this.name = 'ApiError'
  }

  /** Field-level validation messages, as DRF returns them. */
  get fieldErrors(): Record<string, string[]> {
    if (this.status !== 400 || typeof this.body !== 'object' || this.body === null) return {}
    return Object.fromEntries(
      Object.entries(this.body as Record<string, unknown>).map(([key, value]) => [
        key,
        Array.isArray(value) ? value.map(String) : [String(value)],
      ]),
    )
  }

  /** The first human-readable message, for a form-level error line. */
  get detail(): string {
    if (typeof this.body === 'object' && this.body !== null) {
      const body = this.body as Record<string, unknown>
      if (typeof body.detail === 'string') return body.detail
      const first = Object.values(this.fieldErrors)[0]
      if (first?.length) return first[0]!
    }
    return this.message
  }
}

// Module-scoped rather than in React state: the request layer needs it without
// a hook, and it must not survive a page load.
let accessToken: string | null = null
let onUnauthenticated: (() => void) | null = null

/**
 * Bumped every time the token changes.
 *
 * A request sent with the old token can land *after* someone else has already
 * refreshed. Comparing generations tells those requests to simply retry rather
 * than start a second refresh — which would rotate the token again and
 * invalidate the one everybody else just started using.
 */
let tokenGeneration = 0

export function setAccessToken(token: string | null): void {
  accessToken = token
  tokenGeneration += 1
}

export function getAccessToken(): string | null {
  return accessToken
}

/** Called when even a refresh cannot rescue the session. */
export function setUnauthenticatedHandler(handler: (() => void) | null): void {
  onUnauthenticated = handler
}

async function apiBase(): Promise<string> {
  return (await loadConfig()).apiBaseUrl
}

/**
 * One in-flight refresh, shared.
 *
 * A dashboard fires several requests at once; if each starts its own refresh,
 * the first rotates the token and the rest fail on a token that has just been
 * blacklisted — logging the user out at the exact moment everything was fine.
 */
let refreshInFlight: Promise<boolean> | null = null

async function refreshAccessToken(): Promise<boolean> {
  refreshInFlight ??= (async () => {
    try {
      const base = await apiBase()
      const response = await fetch(`${base}/auth/refresh/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: '{}',
      })
      if (!response.ok) return false
      const body = (await response.json()) as { access?: string }
      if (!body.access) return false
      setAccessToken(body.access)
      return true
    } catch {
      return false
    } finally {
      // Cleared on the next tick so concurrent callers all see this attempt.
      queueMicrotask(() => {
        refreshInFlight = null
      })
    }
  })()

  return refreshInFlight
}

export interface RequestOptions {
  method?: string
  body?: unknown
  /** Skip the silent refresh — used by the auth calls themselves. */
  anonymous?: boolean
  signal?: AbortSignal
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, anonymous = false, signal } = options
  const base = await apiBase()

  const send = async (): Promise<Response> => {
    const isFormData = body instanceof FormData
    const headers: Record<string, string> = { Accept: 'application/json' }
    // A FormData body sets its own multipart boundary; declaring
    // Content-Type by hand here would omit that boundary and break parsing.
    if (body !== undefined && !isFormData) headers['Content-Type'] = 'application/json'
    if (accessToken && !anonymous) headers.Authorization = `Bearer ${accessToken}`

    // Built up rather than declared inline: `exactOptionalPropertyTypes` treats
    // an explicit `undefined` as a different thing from an absent key.
    const init: RequestInit = {
      method,
      headers,
      // Sends the httpOnly refresh cookie on the auth routes it is scoped to.
      credentials: 'include',
    }
    if (body !== undefined) init.body = isFormData ? body : JSON.stringify(body)
    if (signal) init.signal = signal

    return fetch(`${base}${path}`, init)
  }

  const generationAtSend = tokenGeneration
  let response = await send()

  if (response.status === 401 && !anonymous) {
    // Someone else refreshed while this request was in flight: retry with the
    // token that already exists instead of rotating it again.
    const refreshed = tokenGeneration !== generationAtSend ? true : await refreshAccessToken()

    if (refreshed) {
      response = await send()
    } else {
      setAccessToken(null)
      onUnauthenticated?.()
    }
  }

  if (response.status === 204) return undefined as T
  if (!response.ok) {
    throw new ApiError(response.status, await safeJson(response))
  }
  return (await safeJson(response)) as T
}

async function safeJson(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) => request<T>(path, { ...options }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'PATCH', body }),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'PUT', body }),
  delete: <T>(path: string, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'DELETE' }),
}

/** Exposed for tests, which need a clean slate between cases. */
export function resetClientState(): void {
  accessToken = null
  refreshInFlight = null
  onUnauthenticated = null
  tokenGeneration = 0
}
