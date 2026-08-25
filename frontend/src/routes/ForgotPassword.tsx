/**
 * Request a password reset link.
 *
 * The confirmation deliberately says "if that address has an account" rather
 * than "sent". The API answers identically whether or not the account exists —
 * saying "sent!" would undo that on the client, turning this screen into a way
 * to check who is registered.
 */

import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { ApiError, api } from '../api/client'
import { AuthLayout } from '../components/AuthLayout'
import { IconCheck } from '../components/icons'
import { Button, Field, FormError, Panel } from '../components/ui'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    setFieldErrors({})

    try {
      await api.post('/auth/password/reset/', { email })
      setSent(true)
    } catch (caught) {
      if (caught instanceof ApiError) {
        setFieldErrors(caught.fieldErrors)
        // A field-level message is shown under the input it belongs to, so
        // repeating it in the banner just says the same thing twice.
        const hasFieldError = Object.keys(caught.fieldErrors).length > 0
        setError(
          caught.status === 429
            ? 'Too many attempts. Wait a while and try again.'
            : hasFieldError
              ? ''
              : caught.detail,
        )
      } else {
        setError('Could not reach the server. Check your connection and try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (sent) {
    return (
      <AuthLayout
        title="Check your inbox"
        subtitle="If that address has an account, a reset link is on its way."
        footer={
          <Link to="/login" className="font-semibold text-accent underline underline-offset-2">
            Back to sign in
          </Link>
        }
      >
        <Panel edge elevation="high" className="p-6 sm:p-7">
          <p className="flex items-start gap-3">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-high-bg text-high">
              <IconCheck size={16} />
            </span>
            <span className="text-muted">
              The link works once and expires in an hour. If nothing arrives in a few minutes, check
              your spam folder — and make sure you typed the same address you signed up with.
            </span>
          </p>
        </Panel>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="We'll email you a link to choose a new one."
      footer={
        <>
          Remembered it?{' '}
          <Link to="/login" className="font-semibold text-accent underline underline-offset-2">
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

        <Button type="submit" size="lg" disabled={submitting} className="mt-2 w-full">
          {submitting ? 'Sending…' : 'Email me a link'}
        </Button>
      </form>
    </AuthLayout>
  )
}
