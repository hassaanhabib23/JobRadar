import { useEffect, useState } from 'react'

import { loadConfig } from './config'

type HealthState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'loaded'; status: string; database: string }

/**
 * Milestone 1 placeholder: proves the frontend container, the dev proxy and the
 * backend are actually wired together. Replaced by the router in milestone 7.
 */
export default function App() {
  const [health, setHealth] = useState<HealthState>({ kind: 'loading' })

  useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
        const { apiBaseUrl } = await loadConfig()
        const response = await fetch(`${apiBaseUrl}/health/`)
        if (!response.ok) throw new Error(`API returned ${response.status}`)
        const body = (await response.json()) as {
          status: string
          checks: { database: string }
        }
        if (!cancelled) {
          setHealth({ kind: 'loaded', status: body.status, database: body.checks.database })
        }
      } catch (error) {
        if (!cancelled) {
          setHealth({ kind: 'error', message: (error as Error).message })
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-4 p-8">
      <h1 className="text-2xl font-semibold">JobRadar</h1>
      <p className="text-sm opacity-70">
        Skeleton — milestone 1. The dashboard arrives in milestone 8.
      </p>

      {/* role="status" is an implicit polite live region — screen readers announce
          the result when it arrives rather than leaving it silent. */}
      <section role="status" className="rounded-lg border border-hairline p-4 text-sm">
        {health.kind === 'loading' && <p>Checking the API…</p>}
        {health.kind === 'error' && <p role="alert">API unreachable: {health.message}</p>}
        {health.kind === 'loaded' && (
          <p>
            API <strong>{health.status}</strong> · database <strong>{health.database}</strong>
          </p>
        )}
      </section>
    </main>
  )
}
