import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { ApiError } from '../api/client'
import { useAuth } from '../auth/AuthProvider'
import { AuthLayout } from '../components/AuthLayout'
import { Button, Field, FormError } from '../components/ui'

export default function Register() {
  const { register } = useAuth()
  const navigate = useNavigate()

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setFieldErrors({})

    // The backend accepts a blank name (an existing integration might not
    // send one), but this form asks for it, so the form is the one that
    // enforces it — `noValidate` is set on purpose, same as every other form
    // here, so the app's own error styling shows instead of the browser's.
    const missing: Record<string, string[]> = {}
    if (!firstName.trim()) missing.firstName = ['Enter your first name.']
    if (!lastName.trim()) missing.lastName = ['Enter your last name.']
    if (Object.keys(missing).length > 0) {
      setFieldErrors(missing)
      return
    }

    // Checked client-side, not sent to the server: the backend doesn't take a
    // confirmation field, and a mismatch here has nothing to do with whether
    // the password itself is valid.
    if (password !== confirmPassword) {
      setFieldErrors({ confirmPassword: ['Passwords do not match.'] })
      return
    }

    setSubmitting(true)
    try {
      await register({ email, password, firstName: firstName.trim(), lastName: lastName.trim() })
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

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="First name"
            name="firstName"
            autoComplete="given-name"
            autoFocus
            required
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
            errors={fieldErrors.firstName}
          />
          <Field
            label="Last name"
            name="lastName"
            autoComplete="family-name"
            required
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
            errors={fieldErrors.lastName}
          />
        </div>

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
          hint="At least 8 characters, and not one everybody else uses."
        />
        <Field
          label="Confirm password"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          errors={fieldErrors.confirmPassword}
        />

        <Button type="submit" size="lg" disabled={submitting} className="mt-2 w-full">
          {submitting ? 'Creating…' : 'Create account'}
        </Button>
      </form>
    </AuthLayout>
  )
}
