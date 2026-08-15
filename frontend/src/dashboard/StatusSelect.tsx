/**
 * Inline application status.
 *
 * A native `<select>` rather than a custom menu: it is keyboard-operable,
 * screen-reader correct and touch-friendly for free, and there is nothing here
 * a custom widget would do better.
 *
 * The update is optimistic and **visibly** rolls back. A control that silently
 * reverts teaches the user not to trust it.
 */

import { useEffect, useState } from 'react'

import { useUpdateJob } from '../api/queries'
import type { ApplicationStatus, Job, StatusChoice } from '../api/types'
import { cx } from '../components/ui'

export function StatusSelect({
  job,
  choices,
  compact = false,
}: {
  job: Job
  choices: StatusChoice[]
  compact?: boolean
}) {
  const update = useUpdateJob()
  const [failed, setFailed] = useState(false)

  // Clear the warning once the row settles on a new value.
  useEffect(() => {
    if (update.isSuccess) setFailed(false)
  }, [update.isSuccess])

  return (
    <div className="flex flex-col gap-1">
      <label className="sr-only" htmlFor={`status-${job.id}`}>
        Application status for {job.title} at {job.company}
      </label>
      <select
        id={`status-${job.id}`}
        value={job.status}
        disabled={update.isPending}
        onChange={(event) => {
          setFailed(false)
          update.mutate(
            { id: job.id, status: event.target.value as ApplicationStatus },
            { onError: () => setFailed(true) },
          )
        }}
        className={cx(
          'min-h-[44px] rounded-lg border bg-surface px-2 text-sm',
          compact ? 'w-full' : 'w-[150px]',
          failed ? 'border-danger' : 'border-hairline',
        )}
      >
        {choices.map((choice) => (
          <option key={choice.value} value={choice.value}>
            {choice.label}
          </option>
        ))}
      </select>
      {failed && (
        <p role="alert" className="text-[11px] text-danger">
          Could not save — reverted
        </p>
      )}
    </div>
  )
}
