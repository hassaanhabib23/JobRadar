import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import { ApiError } from '../api/client'
import { useAuth } from '../auth/AuthProvider'
import { Button, Field, FormError, Panel } from '../components/ui'

interface LocationState {
  from?: { pathname: string; search?: string }
}

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})
  const [submitting, setSubmitting] = useState(false)

  // Where they were heading before the guard intercepted them. Sending everyone
  // to the dashboard loses the job link they actually clicked.
  const state = location.state as LocationState | null
  const destination = state?.from ? `${state.from.pathname}${state.from.search ?? ''}` : '/app'

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    setFieldErrors({})

    try {
      const user = await login(email, password)
      navigate(user.onboardingComplete ? destination : '/welcome', { replace: true })
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught.detail)
        setFieldErrors(caught.fieldErrors)
      } else {
        setError('Could not reach the server. Check your connection and try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Sign in</h1>
        <p className="mt-1 text-sm text-muted">Your job list, scored for you.</p>
      </div>

      <Panel>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          <FormError>{error}</FormError>

          <Field
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            errors={fieldErrors.email}
          />
          <Field
            label="Password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            errors={fieldErrors.password}
          />

          <Button type="submit" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </Panel>

      <p className="text-center text-sm text-muted">
        No account?{' '}
        <Link to="/register" className="font-medium text-accent underline underline-offset-2">
          Create one
        </Link>
      </p>
    </main>
  )
}
