/**
 * Session state.
 *
 * The access token lives in `api/client` (module memory, never storage). This
 * provider owns the *user*, and one piece of state that matters more than it
 * looks: `status`.
 *
 * On a page load there is no access token — it was in memory and the page just
 * reloaded — but there may still be a valid httpOnly refresh cookie. So the app
 * starts in `checking`, attempts one silent refresh, and only then decides. Skip
 * that and every refresh of an authenticated page bounces the user to /login.
 */

import { useQueryClient } from '@tanstack/react-query'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import { api, setAccessToken, setUnauthenticatedHandler } from '../api/client'
import type { AuthResponse, User } from '../api/types'

export type AuthStatus = 'checking' | 'authenticated' | 'anonymous'

interface AuthContextValue {
  status: AuthStatus
  user: User | null
  login: (email: string, password: string) => Promise<User>
  register: (input: RegisterInput) => Promise<User>
  logout: () => Promise<void>
  setUser: (user: User) => void
}

export interface RegisterInput {
  email: string
  password: string
  firstName: string
  lastName: string
  locations?: string[]
  roleKeywords?: string[]
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('checking')
  const [user, setUser] = useState<User | null>(null)
  const queryClient = useQueryClient()

  const clearSession = useCallback(() => {
    setAccessToken(null)
    setUser(null)
    setStatus('anonymous')
    queryClient.clear()
  }, [queryClient])

  // One attempt to restore the session from the refresh cookie.
  useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
        const { access } = await api.post<{ access: string }>(
          '/auth/refresh/',
          {},
          {
            anonymous: true,
          },
        )
        setAccessToken(access)
        const me = await api.get<User>('/auth/me/')
        if (!cancelled) {
          setUser(me)
          setStatus('authenticated')
        }
      } catch {
        if (!cancelled) {
          setAccessToken(null)
          setStatus('anonymous')
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  // When a refresh fails mid-session, the client tells us to stand down.
  useEffect(() => {
    setUnauthenticatedHandler(clearSession)
    return () => setUnauthenticatedHandler(null)
  }, [clearSession])

  const login = useCallback(async (email: string, password: string) => {
    const response = await api.post<AuthResponse>(
      '/auth/login/',
      { email, password },
      { anonymous: true },
    )
    setAccessToken(response.access)
    setUser(response.user)
    setStatus('authenticated')
    return response.user
  }, [])

  const register = useCallback(async (input: RegisterInput) => {
    const response = await api.post<AuthResponse>('/auth/register/', input, { anonymous: true })
    setAccessToken(response.access)
    setUser(response.user)
    setStatus('authenticated')
    return response.user
  }, [])

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout/', {})
    } finally {
      // Even if the server call fails, the local session must end.
      clearSession()
    }
  }, [clearSession])

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, login, register, logout, setUser }),
    [status, user, login, register, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside an AuthProvider')
  return context
}
