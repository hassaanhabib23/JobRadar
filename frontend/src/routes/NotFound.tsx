/**
 * 404.
 *
 * A dead end should still offer a way onward, and it should say which address
 * failed — "page not found" with no path leaves you unsure whether you mistyped
 * something or the link was wrong.
 */

import { Link, useLocation } from 'react-router-dom'

import { IconArrowLeft, IconRadar } from '../components/icons'
import { Button } from '../components/ui'
import { useAuth } from '../auth/AuthProvider'

export default function NotFound() {
  const { status } = useAuth()
  const location = useLocation()
  const home = status === 'authenticated' ? '/app' : '/'

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-5 px-5 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-strong text-muted">
        <IconRadar size={22} />
      </span>

      <div>
        <h1 className="text-2xl font-semibold">Nothing at that address</h1>
        <p className="mt-2 text-muted">
          <code className="rounded bg-surface-strong px-1.5 py-0.5 font-mono text-sm">
            {location.pathname}
          </code>{' '}
          does not exist. It may have been a job that has since closed.
        </p>
      </div>

      <Link to={home}>
        <Button>
          <IconArrowLeft size={15} />
          {status === 'authenticated' ? 'Back to your jobs' : 'Back to the home page'}
        </Button>
      </Link>
    </main>
  )
}
