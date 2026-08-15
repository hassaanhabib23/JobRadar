/**
 * Run history.
 *
 * A failed source has to be impossible to miss. The most misleading thing this
 * UI could do is look healthy while half the sources are down, so failures are
 * counted in the header, listed first, and labelled in words rather than only
 * in red.
 */

import { useState } from 'react'
import { Link } from 'react-router-dom'

import { useRun, useRuns, useTriggerRun } from '../api/queries'
import type { Run } from '../api/types'
import { Button, Panel, Spinner, cx } from '../components/ui'

export default function Runs() {
  const runs = useRuns()
  const triggerRun = useTriggerRun()
  const [expanded, setExpanded] = useState<number | null>(null)

  const rows = runs.data?.results ?? []
  const latest = rows[0]
  // Poll while a run is in flight so progress appears without a manual refresh.
  const polling = latest?.status === 'running'

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/app" className="text-sm text-muted underline-offset-2 hover:underline">
            ← All jobs
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">Runs</h1>
        </div>
        <Button onClick={() => triggerRun.mutate()} disabled={triggerRun.isPending || polling}>
          {triggerRun.isPending ? 'Starting…' : polling ? 'Run in progress…' : 'Run now'}
        </Button>
      </header>

      {runs.isPending && <Spinner label="Loading run history" />}

      {runs.isError && (
        <Panel>
          <p role="alert" className="text-sm">
            Could not load the run history.{' '}
            <button
              type="button"
              onClick={() => void runs.refetch()}
              className="font-medium underline underline-offset-2"
            >
              Retry
            </button>
          </p>
        </Panel>
      )}

      {runs.data && rows.length === 0 && (
        <Panel className="text-center">
          <h2 className="font-medium">No runs yet</h2>
          <p className="mt-1 text-sm text-muted">
            The scheduled run happens each morning. You can start one now to fill your dashboard.
          </p>
        </Panel>
      )}

      <ul className="flex flex-col gap-3">
        {rows.map((run) => (
          <li key={run.id}>
            <RunRow
              run={run}
              expanded={expanded === run.id}
              onToggle={() => setExpanded(expanded === run.id ? null : run.id)}
              poll={run.status === 'running'}
            />
          </li>
        ))}
      </ul>
    </main>
  )
}

const STATUS_TONE: Record<string, string> = {
  success: 'border-high/50 bg-high/10 text-high',
  partial: 'border-medium/50 bg-medium/10 text-medium',
  failed: 'border-danger/50 bg-danger/10 text-danger',
  running: 'border-accent/50 bg-accent/10 text-accent',
}

function RunRow({
  run,
  expanded,
  onToggle,
  poll,
}: {
  run: Run
  expanded: boolean
  onToggle: () => void
  poll: boolean
}) {
  const detail = useRun(run.id, expanded && poll)
  const failed = run.sourcesFailed > 0

  return (
    <Panel className={cx('p-4', failed && 'border-medium/40')}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={cx(
              'rounded-full border px-2 py-0.5 text-xs font-medium',
              STATUS_TONE[run.status] ?? 'border-hairline',
            )}
          >
            {/* Spelled out, so the state is never carried by colour alone. */}
            {run.status}
          </span>
          <span className="text-sm">{new Date(run.startedAt).toLocaleString()}</span>
          <span className="text-xs text-muted">{run.triggeredBy}</span>
        </div>

        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="min-h-[44px] rounded-lg px-3 text-sm underline-offset-2 hover:underline"
        >
          {expanded ? 'Hide sources' : 'Show sources'}
        </button>
      </div>

      {failed && (
        <p className="mt-3 rounded-lg border border-medium/50 bg-medium/10 p-2 text-sm">
          <strong>{run.sourcesFailed}</strong> of {run.sourcesTotal} sources failed. The jobs below
          are from the sources that worked — this is not the full picture.
        </p>
      )}

      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
        <Fact
          label="Sources"
          value={`${run.sourcesTotal - run.sourcesFailed}/${run.sourcesTotal}`}
        />
        <Fact label="Fetched" value={run.postingsFetched} />
        <Fact label="New" value={run.jobsCreated} />
        <Fact label="Closed" value={run.jobsClosed} />
        <Fact
          label="Duration"
          value={run.durationSeconds ? `${Math.round(run.durationSeconds)}s` : '—'}
        />
      </dl>

      {expanded && (
        <div className="mt-4 border-t border-hairline pt-3">
          {detail.isPending && <Spinner label="Loading sources" />}
          {detail.data && (
            <ul className="flex flex-col gap-1 text-sm">
              {[...detail.data.sourceResults]
                // Failures first: they are the reason anyone opens this.
                .sort((a, b) => Number(a.ok) - Number(b.ok))
                .map((source) => (
                  <li key={source.id} className="flex flex-wrap items-baseline gap-2">
                    <span
                      className={cx(
                        'w-14 shrink-0 text-xs font-medium',
                        source.ok ? 'text-muted' : 'text-danger',
                      )}
                    >
                      {source.ok ? 'ok' : 'FAILED'}
                    </span>
                    <span className="min-w-[160px] flex-1">{source.label}</span>
                    <span className="tabular-nums text-muted">{source.postings} postings</span>
                    {source.error && (
                      <span className="w-full text-xs text-danger">{source.error}</span>
                    )}
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}
    </Panel>
  )
}

function Fact({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-0.5 tabular-nums">{value}</dd>
    </div>
  )
}
