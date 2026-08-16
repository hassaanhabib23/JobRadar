/**
 * The dashboard.
 *
 * The behaviours here are the ones a user notices when they break: a filter that
 * does not survive a refresh, a status that silently reverts, a sort that lies
 * about its direction.
 */

import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'

import App from '../App'
import { renderWithProviders } from '../test/render'
import { API, server, state } from '../test/server'

beforeEach(() => {
  state.refreshValid = true
})

async function openDashboard(route = '/app') {
  renderWithProviders(<App />, { route })
  await screen.findByRole('heading', { name: /^jobs$/i })
  return userEvent.setup()
}

describe('the job list', () => {
  it('shows a scored row with its reasoning', async () => {
    await openDashboard()

    expect(await screen.findByText('Associate Software Engineer')).toBeInTheDocument()
    expect(screen.getByText(/matched 4 skills/i)).toBeInTheDocument()
    // The score bar is one labelled image rather than four anonymous divs.
    expect(screen.getAllByRole('img', { name: /score 87 of 100/i })[0]).toBeInTheDocument()
  })

  it('announces how many jobs matched', async () => {
    await openDashboard()

    // The count sits in its own element for tabular figures, so the text is
    // split across nodes — match on the container instead.
    const summary = await screen.findByText((_, element) =>
      /^2 jobs$/i.test(element?.textContent?.trim() ?? ''),
    )
    expect(summary).toBeInTheDocument()
  })

  it('labels a first-run job "New to you", never "New today"', async () => {
    // It means the first run it appeared in *for this user*, not that it was
    // posted recently. "Posted today" is a separate filter backed by the
    // employer's own date, and conflating the two makes one of them a lie.
    await openDashboard()

    // Appears on the row badge and on the stat tile, and nowhere does the app
    // claim a job was posted today when it only means "new to your list".
    expect((await screen.findAllByText('New to you')).length).toBeGreaterThan(0)
    expect(screen.queryByText('New today')).not.toBeInTheDocument()
  })

  it('offers "posted today" and "new to you" as separate filters', async () => {
    await openDashboard()

    expect(await screen.findByRole('checkbox', { name: /posted today/i })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /new to you/i })).toBeInTheDocument()
  })

  it('names the board a job came from, not the library that read it', async () => {
    await openDashboard()

    // "Greenhouse" is a board; "jobspy" is the library that reads some of them
    // and has no business appearing in front of a reader. It shows up both in
    // the Source column and in the filter dropdown, hence findAll.
    expect((await screen.findAllByText('Greenhouse')).length).toBeGreaterThan(0)
    expect(screen.queryByText(/jobspy/i)).not.toBeInTheDocument()
  })

  it('warns about a ghost posting', async () => {
    await openDashboard()

    expect(await screen.findByText('Ghost?')).toBeInTheDocument()
  })

  it('shows that a merged posting was seen elsewhere', async () => {
    await openDashboard()

    // Labelled, not raw: "also on LinkedIn", never "also on linkedin".
    expect(await screen.findByText(/also on LinkedIn/)).toBeInTheDocument()
  })
})

describe('filters in the URL', () => {
  it('reads its initial state from the query string', async () => {
    await openDashboard('/app?tier=High')

    await waitFor(() => expect(state.lastJobQuery).toContain('tier=High'))
    expect(screen.getByLabelText(/^tier$/i)).toHaveValue('High')
  })

  it('writes a filter change back to the URL', async () => {
    const user = await openDashboard()

    await user.selectOptions(screen.getByLabelText(/^tier$/i), 'High')

    await waitFor(() => expect(state.lastJobQuery).toContain('tier=High'))
  })

  it('sends the search term to the server, not the browser', async () => {
    const user = await openDashboard()

    await user.type(screen.getByLabelText(/search jobs/i), 'react')

    // Server-side: the table has to stay responsive at 5,000+ stored jobs.
    await waitFor(() => expect(state.lastJobQuery).toContain('search=react'), { timeout: 3000 })
  })

  it('resets to page one when a filter changes', async () => {
    const user = await openDashboard('/app?page=3')
    await waitFor(() => expect(state.lastJobQuery).toContain('page=3'))

    await user.selectOptions(screen.getByLabelText(/^tier$/i), 'High')

    // Staying on page 3 of a two-page result shows an empty table for no
    // visible reason.
    await waitFor(() => expect(state.lastJobQuery).toContain('page=1'))
  })

  it('clears every filter at once', async () => {
    const user = await openDashboard('/app?tier=High&is_new=true')

    await user.click(await screen.findByRole('button', { name: /clear 2 filters/i }))

    await waitFor(() => expect(state.lastJobQuery).not.toContain('tier=High'))
  })
})

describe('sorting', () => {
  it('defaults to newest first', async () => {
    // What you open this for each morning is "what appeared since yesterday".
    await openDashboard()
    await screen.findByText('Associate Software Engineer')

    const postedHeader = screen.getByRole('columnheader', { name: /posted/i })
    expect(postedHeader).toHaveAttribute('aria-sort', 'descending')
    await waitFor(() => expect(state.lastJobQuery).toContain('ordering=-posted_at'))
  })

  it('reports its direction to screen readers', async () => {
    const user = await openDashboard()
    await screen.findByText('Associate Software Engineer')

    const scoreHeader = screen.getByRole('columnheader', { name: /score/i })
    // Not the active column yet.
    expect(scoreHeader).toHaveAttribute('aria-sort', 'none')

    await user.click(within(scoreHeader).getByRole('button'))
    await waitFor(() => expect(scoreHeader).toHaveAttribute('aria-sort', 'descending'))
  })

  it('sorts on the server', async () => {
    const user = await openDashboard()
    await screen.findByText('Associate Software Engineer')

    const header = screen.getByRole('columnheader', { name: /company/i })
    await user.click(within(header).getByRole('button'))

    await waitFor(() => expect(state.lastJobQuery).toContain('ordering=company'))
  })
})

describe('status updates', () => {
  it('updates optimistically', async () => {
    const user = await openDashboard()
    const select = await screen.findByLabelText(/application status for associate/i)

    await user.selectOptions(select, 'applied')

    expect(select).toHaveValue('applied')
  })

  it('rolls back visibly when the save fails', async () => {
    // A control that silently reverts teaches the user not to trust it.
    server.use(
      http.patch(`${API}/jobs/:id/`, () => HttpResponse.json({ detail: 'nope' }, { status: 500 })),
    )
    const user = await openDashboard()
    const select = await screen.findByLabelText(/application status for associate/i)

    await user.selectOptions(select, 'applied')

    expect(await screen.findByText(/could not save/i)).toBeInTheDocument()
    await waitFor(() => expect(select).toHaveValue('not_started'))
  })
})

describe('bulk actions', () => {
  it('applies one status across a selection', async () => {
    const user = await openDashboard()
    await screen.findByText('Associate Software Engineer')

    await user.click(screen.getByLabelText(/select all jobs on this page/i))
    expect(
      await screen.findByText((_, element) => element?.textContent?.trim() === '2 selected'),
    ).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText(/set status for selected jobs/i), 'skipped')

    await waitFor(() => expect(state.bulkUpdates).toHaveLength(1))
    expect(state.bulkUpdates[0]).toEqual({ ids: [1, 2], status: 'skipped' })
  })
})

describe('the empty states', () => {
  const emptyJobs = () =>
    http.get(`${API}/jobs/`, () =>
      HttpResponse.json({ count: 0, next: null, previous: null, results: [] }),
    )

  it('says the filters are too narrow when they are', async () => {
    server.use(emptyJobs())

    await openDashboard('/app?tier=High')

    expect(await screen.findByText(/no jobs match these filters/i)).toBeInTheDocument()
  })

  it('says nothing has been fetched when no run has finished', async () => {
    server.use(
      emptyJobs(),
      http.get(`${API}/stats/`, () =>
        HttpResponse.json({
          openCount: 0,
          newToday: 0,
          byTier: {},
          bySource: {},
          byStatus: {},
          avgScore: null,
          lastRunAt: null,
          scoreHistogram: [],
        }),
      ),
    )

    await openDashboard()

    // Three different empty states, because "widen your filters", "wait for a
    // run" and "add a source" are three different actions.
    expect(await screen.findByText(/nothing fetched yet/i)).toBeInTheDocument()
  })

  it('offers a retry when the list fails to load', async () => {
    server.use(http.get(`${API}/jobs/`, () => HttpResponse.json({}, { status: 500 })))

    await openDashboard()

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not load your jobs/i)
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
  })
})

describe('the last-run indicator', () => {
  it('marks stale data in words, not only in colour', async () => {
    server.use(
      http.get(`${API}/stats/`, () =>
        HttpResponse.json({
          openCount: 2,
          newToday: 0,
          byTier: {},
          bySource: {},
          byStatus: {},
          avgScore: 50,
          // Well past the 36-hour threshold.
          lastRunAt: new Date(Date.now() - 72 * 3600_000).toISOString(),
          scoreHistogram: [],
        }),
      ),
    )

    await openDashboard()

    expect(await screen.findByText('stale')).toBeInTheDocument()
  })
})
