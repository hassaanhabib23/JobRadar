/**
 * Consume an email verification link.
 *
 * No form — the link itself is the whole interaction, so this posts on mount
 * and reports what happened. Works signed out, because mail clients open links
 * in whichever browser they feel like.
 */

import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { api } from '../api/client'
import { useAuth } from '../auth/AuthProvider'
import { AuthLayout } from '../components/AuthLayout'
import { IconAlert, IconCheck } from '../components/icons'
import { Button, Panel, Spinner } from '../components/ui'

type State = 'checking' | 'done' | 'failed'

export default function VerifyEmail() {
  const { status, user, setUser } = useAuth()
  const [params] = useSearchParams()
  const [state, setState] = useState<State>('checking')
  // StrictMode double-invokes effects in development; a verification token is
  // single-use, so the second call would "fail" and show an error after a
  // success. Guarding here keeps the reported outcome honest.
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true

    const uid = params.get('uid') ?? ''
    const token = params.get('token') ?? ''

    if (!uid || !token) {
      setState('failed')
      return
    }

    api
      .post('/auth/email/verify/', { uid, token })
      .then(() => {
        setState('done')
        // Clear the banner immediately for a signed-in user rather than making
        // them reload to notice.
        if (user) setUser({ ...user, emailVerified: true })
      })
      .catch(() => setState('failed'))
    // Runs once, on mount, by design.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const signedIn = status === 'authenticated'

  if (state === 'checking') {
    return (
      <AuthLayout title="Confirming your email" subtitle="One moment.">
        <Panel edge elevation="high" className="p-6 sm:p-7">
          <Spinner label="Confirming" />
        </Panel>
      </AuthLayout>
    )
  }

  if (state === 'done') {
    return (
      <AuthLayout title="Email confirmed" subtitle="You'll get your matches in the morning digest.">
        <Panel edge elevation="high" className="flex flex-col gap-5 p-6 sm:p-7">
          <p className="flex items-start gap-3">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-high-bg text-high">
              <IconCheck size={16} />
            </span>
            <span className="text-muted">
              That's everything. You can change how often you hear from us, or turn the digest off
              entirely, on your profile.
            </span>
          </p>
          <Link to={signedIn ? '/app' : '/login'}>
            <Button size="lg" className="w-full">
              {signedIn ? 'Back to my jobs' : 'Sign in'}
            </Button>
          </Link>
        </Panel>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="That link didn't work"
      subtitle="It may have already been used, or it expired."
    >
      <Panel edge elevation="high" className="flex flex-col gap-5 p-6 sm:p-7">
        <p className="flex items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-danger-bg text-danger">
            <IconAlert size={16} />
          </span>
          <span className="text-muted">
            Verification links work once. If you've already confirmed this address, you're done —
            nothing else is needed. Otherwise sign in and send yourself a fresh one.
          </span>
        </p>
        <Link to={signedIn ? '/app' : '/login'}>
          <Button size="lg" variant="secondary" className="w-full">
            {signedIn ? 'Back to my jobs' : 'Sign in'}
          </Button>
        </Link>
      </Panel>
    </AuthLayout>
  )
}
