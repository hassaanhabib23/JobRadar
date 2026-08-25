/**
 * Every recorded transition for one job, newest first.
 */

import { useStatusHistory } from '../api/queries'
import { Panel, PanelHeader, Skeleton } from '../components/ui'

const LABELS: Record<string, string> = {
  not_started: 'Not started',
  researching: 'Researching',
  cv_tailored: 'CV tailored',
  applied: 'Applied',
  assessment: 'Assessment',
  interviewing: 'Interviewing',
  offer: 'Offer',
  rejected: 'Rejected',
  skipped: 'Skipped',
  '': 'Not started',
}

export function StatusTimeline({ jobId }: { jobId: number }) {
  const history = useStatusHistory(jobId)

  return (
    <Panel>
      <PanelHeader title="Status history" />
      <div className="p-5">
        {history.isPending && <Skeleton className="h-16" />}

        {!history.isPending && (history.data?.length ?? 0) === 0 && (
          <p className="text-sm text-muted">No status changes yet.</p>
        )}

        {(history.data?.length ?? 0) > 0 && (
          <ul className="space-y-2">
            {history.data!.map((event, index) => (
              <li key={`${event.changedAt}-${index}`} className="text-sm">
                <span className="text-muted">{LABELS[event.fromStatus] ?? event.fromStatus}</span>
                {' → '}
                <span className="font-semibold">{LABELS[event.toStatus] ?? event.toStatus}</span>
                <span className="ml-2 text-2xs text-subtle">
                  {new Date(event.changedAt).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  )
}
