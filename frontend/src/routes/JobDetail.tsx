/**
 * The standalone job-detail page.
 *
 * Used on narrow screens (where the dashboard's 3-column layout collapses)
 * and for a direct/shared link to `/app/jobs/:id`. The actual content is
 * `JobDetailContent`, shared with the dashboard's inline detail panel so
 * there is exactly one implementation of "what a job's full detail looks
 * like".
 */

import { Link, useParams } from 'react-router-dom'

import { AppShell, Column } from '../components/AppShell'
import { IconArrowLeft } from '../components/icons'
import { JobDetailContent } from '../dashboard/JobDetailContent'

export default function JobDetail() {
  const { id } = useParams()
  const jobId = Number(id)

  return (
    <AppShell
      topbar={
        <Link
          to="/app"
          className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg"
        >
          <IconArrowLeft size={15} />
          All jobs
        </Link>
      }
    >
      <Column>
        <JobDetailContent jobId={jobId} backLink />
      </Column>
    </AppShell>
  )
}
