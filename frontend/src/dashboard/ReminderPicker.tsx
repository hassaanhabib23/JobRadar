/**
 * A follow-up date for one job. Saved immediately on change — a date field
 * has no "still typing" state the way a text note does, so there is nothing
 * to debounce.
 */

import { useUpdateJob } from '../api/queries'
import { Panel, PanelHeader } from '../components/ui'

export function ReminderPicker({ jobId, value }: { jobId: number; value: string | null }) {
  const update = useUpdateJob()

  const asDateInput = value ? value.slice(0, 10) : ''

  return (
    <Panel>
      <PanelHeader
        title="Follow-up reminder"
        description="We'll email you when this date arrives."
      />
      <div className="flex items-center gap-3 p-5">
        <label htmlFor={`remind-${jobId}`} className="text-sm font-medium">
          Remind me on
        </label>
        <input
          id={`remind-${jobId}`}
          type="date"
          value={asDateInput}
          onChange={(event) => {
            const remindAt = event.target.value ? `${event.target.value}T09:00:00Z` : null
            update.mutate({ id: jobId, remindAt })
          }}
          className="h-9 rounded-sm border border-hairline-strong bg-surface px-2.5 text-sm"
        />
        {asDateInput && (
          <button
            type="button"
            onClick={() => update.mutate({ id: jobId, remindAt: null })}
            className="text-sm text-muted underline underline-offset-2 hover:text-fg"
          >
            Clear reminder
          </button>
        )}
      </div>
    </Panel>
  )
}
