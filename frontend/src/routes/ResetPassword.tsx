/**
 * Choose a new password, using the link from the email.
 *
 * `uid` and `token` arrive in the query string. Neither is validated here —
 * only the server can say whether a token is real, unexpired and unspent, and
 * a client-side guess would just be a second, wrong answer.
 */

import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

import { ApiError, api } from '../api/client'
import { AuthLayout } from '../components/AuthLayout'
import { IconAlert } from '../components/icons'
import { Button, Field, FormError, Panel } from '../components/ui'

export default function ResetPassword() {
  const [params] = useSearchParams()
  const navigate = useNavigate()

  const uid = params.get('uid') ?? ''
  const token = params.get('token') ?? ''

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
      await api.post('/auth/password/reset/confirm/', { uid, token, password })
      // Straight to login rather than signing them in: proving control of an
      // inbox is not the same as proving they know the new password, and
      // typing it once more confirms it went in as intended.
      navigate('/login?reset=1', { replace: true })
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(
          caught.status === 429
            ? 'Too many attempts. Wait a while and try again.'
            : (caught.fieldErrors.token?.[0] ?? caught.detail),
        )
        setFieldErrors(caught.fieldErrors)
      } else {
        setError('Could not reach the server. Check your connection and try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  // A link that arrived mangled — truncated by a mail client, or hand-edited.
  // Worth catching before asking someone to type a password for nothing.
  if (!uid || !token) {
    return (
      <AuthLayout title="That link is incomplete" subtitle="It may have been cut short in transit.">
        <Panel edge elevation="high" className="p-6 sm:p-7">
          <p className="flex items-start gap-3">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-danger-bg text-danger">
              <IconAlert size={16} />
            </span>
            <span className="text-muted">
              Copy the whole link from the email, or{' '}
              <Link
                to="/forgot-password"
                className="font-semibold text-accent underline underline-offset-2"
              >
                request a new one
              </Link>
              .
            </span>
          </p>
        </Panel>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Choose a new password"
      subtitle="Pick something long. Length beats punctuation."
      footer={
        <Link
          to="/forgot-password"
          className="font-semibold text-accent underline underline-offset-2"
        >
          Request a new link
        </Link>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <FormError>{error}</FormError>

        <Field
          label="New password"
          name="password"
          type="password"
          autoComplete="new-password"
          autoFocus
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          errors={fieldErrors.password}
          hint="At least 8 characters, and not something guessable."
        />

        <Button type="submit" size="lg" disabled={submitting} className="mt-2 w-full">
          {submitting ? 'Saving…' : 'Set my new password'}
        </Button>
      </form>
    </AuthLayout>
  )
}
