/**
 * Run history.
 *
 * A failed source has to be impossible to miss. The most misleading thing this
 * UI could do is look healthy while half the sources are down — so failures are
 * counted in the row header, listed first inside it, and labelled in words
 * rather than only in red.
 */

import { useState } from 'react'

import { useRun, useRuns, useTriggerRun } from '../api/queries'
import type { Run } from '../api/types'
import { AppShell, Column } from '../components/AppShell'
import { IconAlert, IconCheck, IconChevronDown, IconHistory, IconRadar } from '../components/icons'
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Panel,
  Skeleton,
  Spinner,
  cx,
} from '../components/ui'

const STATUS_TONE = {
  success: 'high',
  partial: 'medium',
  failed: 'danger',
  running: 'accent',
} as const

export default function Runs() {
  const runs = useRuns()
  const triggerRun = useTriggerRun()
  const [expanded, setExpanded] = useState<number | null>(null)

  const rows = runs.data?.results ?? []
  // Poll while a run is in flight so progress appears without a manual refresh.
  const running = rows[0]?.status === 'running'

  return (
    <AppShell
      topbar={
        <div className="flex flex-1 items-center justify-between gap-3">
          <h1 className="text-md font-extrabold tracking-tight">Runs</h1>
          <Button
            size="sm"
            onClick={() => triggerRun.mutate()}
            disabled={triggerRun.isPending || running}
          >
            <IconRadar size={14} />
            {triggerRun.isPending ? 'Starting…' : running ? 'Run in progress' : 'Run now'}
          </Button>
        </div>
      }
    >
      <Column className="flex flex-col gap-3">
        {runs.isPending && (
          <>
            <span className="sr-only" role="status">
              Loading run history
            </span>
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-[120px]" />
            ))}
          </>
        )}

        {runs.isError && (
          <ErrorState
            message="Could not load the run history."
            onRetry={() => void runs.refetch()}
          />
        )}

        {runs.data && rows.length === 0 && (
          <EmptyState
            icon={<IconHistory size={18} />}
            title="No runs yet"
            description="The scheduled run happens each morning. You can start one now to fill your dashboard — it usually takes under a minute."
            action={
              <Button onClick={() => triggerRun.mutate()} disabled={triggerRun.isPending}>
                {triggerRun.isPending ? 'Starting…' : 'Run now'}
              </Button>
            }
          />
        )}

        {rows.map((run) => (
          <RunRow
            key={run.id}
            run={run}
            expanded={expanded === run.id}
            onToggle={() => setExpanded(expanded === run.id ? null : run.id)}
          />
        ))}
      </Column>
    </AppShell>
  )
}

function RunRow({
  run,
  expanded,
  onToggle,
}: {
  run: Run
  expanded: boolean
  onToggle: () => void
}) {
  const detail = useRun(run.id, expanded && run.status === 'running')
  const failed = run.sourcesFailed > 0

  return (
    // `overflow-hidden`: the stats band inside is a full-bleed fill, and
    // without clipping its square corners poke past the card's rounded ones.
    <Panel
      className={cx('overflow-hidden lift-sm', failed && 'border-medium-border')}
      edge={failed}
    >
      <div className="flex flex-wrap items-center gap-3 px-5 py-4">
        <Badge tone={STATUS_TONE[run.status as keyof typeof STATUS_TONE] ?? 'neutral'}>
          {/* Spelled out, so the state is never carried by colour alone. */}
          {run.status}
        </Badge>
        <span className="text-sm font-semibold">{new Date(run.startedAt).toLocaleString()}</span>
        <span className="text-xs text-subtle">{run.triggeredBy}</span>

        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="ml-auto inline-flex min-h-[36px] items-center gap-1.5 rounded-sm px-3 text-sm font-semibold text-muted transition-colors duration-fast hover:bg-surface-hover hover:text-fg"
        >
          {expanded ? 'Hide sources' : 'Show sources'}
          <IconChevronDown
            size={14}
            className={cx('transition-transform duration-fast', expanded && 'rotate-180')}
          />
        </button>
      </div>

      {failed && (
        <p className="flex items-start gap-2 border-y border-medium-border bg-medium-bg px-4 py-2.5 text-sm text-medium">
          <IconAlert size={15} className="mt-0.5" />
          <span>
            <strong className="font-semibold tabular">{run.sourcesFailed}</strong> of{' '}
            <span className="tabular">{run.sourcesTotal}</span> sources failed. What you see is from
            the ones that worked — this is not the full picture.
          </span>
        </p>
      )}

      <dl className="grid grid-cols-2 gap-3 border-t border-hairline bg-surface-inset px-5 py-4 text-sm sm:grid-cols-5">
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
        <div className="border-t border-hairline p-4">
          {detail.isPending && <Spinner label="Loading sources" />}

          {detail.data && (
            <ul className="space-y-1">
              {[...detail.data.sourceResults]
                // Failures first: they are the reason anyone opens this.
                .sort((a, b) => Number(a.ok) - Number(b.ok))
                .map((source) => (
                  <li
                    key={source.id}
                    className="flex flex-wrap items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-surface-hover"
                  >
                    {source.ok ? (
                      <IconCheck size={14} className="text-high" />
                    ) : (
                      <IconAlert size={14} className="text-danger" />
                    )}
                    <span className="min-w-[180px] flex-1">{source.label}</span>
                    <span className="tabular text-xs text-subtle">{source.postings} postings</span>
                    {source.error && (
                      <span className="w-full pl-6 text-xs text-danger">{source.error}</span>
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
      <dt className="text-2xs font-bold uppercase tracking-wide text-subtle">{label}</dt>
      <dd className="tabular mt-1 text-md font-bold">{value}</dd>
    </div>
  )
}
