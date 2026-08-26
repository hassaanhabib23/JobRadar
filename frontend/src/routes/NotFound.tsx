/**
 * 404.
 *
 * A dead end should still offer a way onward, and it should say which address
 * failed — "page not found" with no path leaves you unsure whether you mistyped
 * something or the link was wrong.
 */

import { Link, useLocation } from 'react-router-dom'

import { IconArrowLeft, IconRadar } from '../components/icons'
import { Button, Panel } from '../components/ui'
import { useAuth } from '../auth/AuthProvider'

export default function NotFound() {
  const { status } = useAuth()
  const location = useLocation()
  const home = status === 'authenticated' ? '/app' : '/'

  return (
    <div className="mesh flex min-h-screen items-center justify-center bg-bg px-5">
      <main className="page-enter w-full max-w-md">
        <Panel
          edge
          elevation="high"
          className="flex flex-col items-center gap-5 p-5 text-center sm:p-7"
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-on-accent shadow-e2">
            <IconRadar size={24} />
          </span>

          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">Nothing at that address</h1>
            <p className="mt-3 text-muted">
              <code className="rounded-sm border border-hairline bg-surface-inset px-2 py-0.5 font-mono text-sm">
                {location.pathname}
              </code>{' '}
              does not exist. It may have been a job that has since closed.
            </p>
          </div>

          <Link to={home}>
            <Button size="lg">
              <IconArrowLeft size={15} />
              {status === 'authenticated' ? 'Back to your jobs' : 'Back to the home page'}
            </Button>
          </Link>
        </Panel>
      </main>
    </div>
  )
}
