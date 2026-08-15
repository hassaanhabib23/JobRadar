import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { ApiError } from '../api/client'
import { useAuth } from '../auth/AuthProvider'
import { Button, Field, FormError, Panel } from '../components/ui'

export default function Register() {
  const { register } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    setFieldErrors({})

    try {
      await register({ email, password })
      // Cities and role chips are picked in onboarding rather than crammed into
      // the signup form — one decision per screen.
      navigate('/welcome', { replace: true })
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught.status === 429 ? 'Too many attempts. Try again shortly.' : caught.detail)
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
        <h1 className="text-2xl font-semibold">Create your account</h1>
        <p className="mt-1 text-sm text-muted">
          Two minutes to set up. You pick your cities on the next screen.
        </p>
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
            autoComplete="new-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            errors={fieldErrors.password}
            hint="At least 8 characters, and not a password everyone else uses."
          />

          <Button type="submit" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create account'}
          </Button>
        </form>
      </Panel>

      <p className="text-center text-sm text-muted">
        Already have an account?{' '}
        <Link to="/login" className="font-medium text-accent underline underline-offset-2">
          Sign in
        </Link>
      </p>
    </main>
  )
}
