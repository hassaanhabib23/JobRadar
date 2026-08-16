import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { ApiError } from '../api/client'
import { useAuth } from '../auth/AuthProvider'
import { AuthLayout } from '../components/AuthLayout'
import { Button, Field, FormError } from '../components/ui'

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
    <AuthLayout
      title="Create your account"
      subtitle="Two minutes to set up. You pick your cities on the next screen."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-accent underline underline-offset-2">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <FormError>{error}</FormError>

        <Field
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          autoFocus
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
          hint="At least 8 characters, and not one everybody else uses."
        />

        <Button type="submit" disabled={submitting} className="mt-1">
          {submitting ? 'Creating…' : 'Create account'}
        </Button>
      </form>
    </AuthLayout>
  )
}
