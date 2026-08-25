/**
 * "Confirm your email" — shown until the address is verified.
 *
 * Deliberately a strip, not a modal. Verification is a soft gate: nothing is
 * blocked, so nothing should be blocking. It also says exactly what is being
 * withheld ("the daily digest") rather than nagging without a reason — a
 * banner that cannot explain itself gets dismissed and never acted on.
 *
 * Dismissal lasts the session only. A permanent dismissal means the user never
 * gets a digest and has forgotten why.
 */

import { useState } from 'react'

import { api } from '../api/client'
import { useAuth } from '../auth/AuthProvider'
import { IconAlert, IconCheck, IconClose } from './icons'
import { Button, cx } from './ui'

type Send = 'idle' | 'sending' | 'sent' | 'failed'

export function VerifyBanner() {
  const { user } = useAuth()
  const [dismissed, setDismissed] = useState(false)
  const [send, setSend] = useState<Send>('idle')

  if (!user || user.emailVerified || dismissed) return null

  async function resend() {
    setSend('sending')
    try {
      await api.post('/auth/email/verify/resend/', {})
      setSend('sent')
    } catch {
      setSend('failed')
    }
  }

  return (
    <div
      className={cx(
        'flex flex-wrap items-center gap-3 border-b border-medium-border bg-medium-bg',
        'px-4 py-2.5 text-sm text-medium sm:px-6',
      )}
    >
      <IconAlert size={15} className="shrink-0" />

      <p className="min-w-0 flex-1">
        {send === 'sent' ? (
          <span className="flex items-center gap-1.5 font-semibold">
            <IconCheck size={14} />
            Sent — check your inbox for {user.email}.
          </span>
        ) : send === 'failed' ? (
          <>Could not send that just now. Try again in a minute.</>
        ) : (
          <>
            Confirm <strong className="font-semibold">{user.email}</strong> to get the daily digest.
            Everything else works already.
          </>
        )}
      </p>

      {send !== 'sent' && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void resend()}
          disabled={send === 'sending'}
          className="text-medium hover:bg-medium-border/40 hover:text-medium"
        >
          {send === 'sending' ? 'Sending…' : 'Resend the link'}
        </Button>
      )}

      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss until next time"
        className="rounded-sm p-1.5 text-medium/70 transition-colors hover:bg-medium-border/40 hover:text-medium"
      >
        <IconClose size={15} />
      </button>
    </div>
  )
}
