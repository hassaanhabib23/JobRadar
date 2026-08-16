/**
 * Inline application status.
 *
 * A native `<select>` rather than a custom menu: keyboard-operable,
 * screen-reader correct and touch-friendly for free, and there is nothing a
 * custom widget would do better here.
 *
 * The update is optimistic and **visibly** rolls back. A control that silently
 * reverts teaches the user not to trust it.
 */

import { useEffect, useState } from 'react'

import { useUpdateJob } from '../api/queries'
import type { ApplicationStatus, Job, StatusChoice } from '../api/types'
import { IconAlert } from '../components/icons'
import { cx } from '../components/ui'

/** Applied and beyond are worth seeing at a glance in a long list. */
const ACTIVE: ApplicationStatus[] = ['applied', 'assessment', 'interviewing', 'offer']

export function StatusSelect({
  job,
  choices,
  className,
}: {
  job: Job
  choices: StatusChoice[]
  className?: string
}) {
  const update = useUpdateJob()
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (update.isSuccess) setFailed(false)
  }, [update.isSuccess])

  const engaged = ACTIVE.includes(job.status)
  const rejected = job.status === 'rejected'

  return (
    <div className={cx('flex flex-col gap-1', className)}>
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
          'h-9 min-h-[36px] w-full rounded border bg-surface px-2 text-sm',
          'transition-colors duration-fast disabled:opacity-60',
          failed && 'border-danger text-danger',
          !failed && engaged && 'border-high-border bg-high-bg text-high font-medium',
          !failed && rejected && 'border-hairline text-subtle',
          !failed && !engaged && !rejected && 'border-hairline text-muted',
        )}
      >
        {choices.map((choice) => (
          <option key={choice.value} value={choice.value}>
            {choice.label}
          </option>
        ))}
      </select>
      {failed && (
        <p role="alert" className="flex items-center gap-1 text-2xs text-danger">
          <IconAlert size={11} />
          Could not save — reverted
        </p>
      )}
    </div>
  )
}
