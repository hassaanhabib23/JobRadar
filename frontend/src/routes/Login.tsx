import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'

import { ApiError } from '../api/client'
import { useAuth } from '../auth/AuthProvider'
import { AuthLayout } from '../components/AuthLayout'
import { IconCheck } from '../components/icons'
import { Button, Field, FormError } from '../components/ui'

interface LocationState {
  from?: { pathname: string; search?: string }
}

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  // Set by the reset flow, which sends people here rather than signing them in.
  const justReset = searchParams.get('reset') === '1'

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
        setError(
          caught.status === 429 ? 'Too many attempts. Wait a minute and try again.' : caught.detail,
        )
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
      title="Sign in"
      subtitle="Your ranked shortlist is waiting."
      footer={
        <>
          No account?{' '}
          <Link to="/register" className="font-semibold text-accent underline underline-offset-2">
            Create one
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        {justReset && (
          <p
            role="status"
            className="flex items-start gap-2.5 rounded border border-high-border bg-high-bg p-3.5 text-sm font-medium text-high"
          >
            <IconCheck size={16} className="mt-0.5 shrink-0" />
            <span>Password updated. Sign in with your new one.</span>
          </p>
        )}

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
        <div className="flex flex-col gap-2">
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
          {/* Under the field it rescues, not buried in the footer. */}
          <Link
            to="/forgot-password"
            className="self-end text-sm font-semibold text-accent underline-offset-2 hover:underline"
          >
            Forgot your password?
          </Link>
        </div>

        <Button type="submit" size="lg" disabled={submitting} className="mt-2 w-full">
          {submitting ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </AuthLayout>
  )
}
