/**
 * The public landing page.
 *
 * Its one job is to make a visitor understand the product in about fifteen
 * seconds and sign up. It is a static page in its own code-split chunk — it must
 * not pull in the table, the query client or anything else the dashboard needs,
 * because it has to render fast on a slow mobile connection.
 *
 * **The copy is honest, and that matters more than conversion.** No invented
 * testimonials, no "trusted by N developers", no fabricated logos or ratings,
 * and no claim to index every job on the internet. The scoring is not called AI,
 * because it isn't: it is transparent keyword weighting against a profile the
 * user controls, which is a real advantage over a black box and is said that way.
 */

import { Link } from 'react-router-dom'

import { useAuth } from '../auth/AuthProvider'

const SOURCE_TYPES = [
  'Greenhouse',
  'Lever',
  'Workable',
  'Ashby',
  'Workday',
  'SmartRecruiters',
  'Recruitee',
  'Breezy',
]

const STEPS = [
  {
    title: 'Pick your cities and stack',
    body: 'Islamabad, Rawalpindi, Lahore, Karachi, remote — one or several. Then say which technologies you work in.',
  },
  {
    title: 'It checks every source daily',
    body: 'Company job boards, plus Indeed, Bayt, Google Jobs and any RSS or Google Alerts feed you add.',
  },
  {
    title: 'You get a ranked shortlist',
    body: 'Scored against your profile, with anything new since yesterday flagged, and the reasoning shown on every row.',
  },
]

export default function Landing() {
  const { status } = useAuth()
  const signedIn = status === 'authenticated'

  return (
    <>
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 p-6">
        <span className="text-lg font-semibold">JobRadar</span>
        <nav aria-label="Account" className="flex items-center gap-2 text-sm">
          {signedIn ? (
            <Link
              to="/app"
              className="inline-flex min-h-[44px] items-center rounded-lg border border-hairline px-4 font-medium"
            >
              Dashboard
            </Link>
          ) : (
            <>
              <Link
                to="/login"
                className="inline-flex min-h-[44px] items-center rounded-lg px-4 hover:bg-surface"
              >
                Sign in
              </Link>
              <Link
                to="/register"
                className="inline-flex min-h-[44px] items-center rounded-lg bg-accent px-4 font-medium text-white"
              >
                Get started
              </Link>
            </>
          )}
        </nav>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-col gap-20 px-6 pb-20">
        {/* 1. Hero */}
        <section className="pt-10">
          <h1 className="max-w-3xl text-4xl font-semibold leading-tight sm:text-5xl">
            Every junior dev job in your city, scored against your CV, in one place.
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-muted">
            JobRadar reads company job boards and feeds every morning, ranks each posting against a
            profile you control, and tells you exactly why it ranked where it did.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/register"
              className="inline-flex min-h-[48px] items-center rounded-lg bg-accent px-6 font-medium text-white"
            >
              Get started
            </Link>
            <Link
              to="/login"
              className="inline-flex min-h-[48px] items-center rounded-lg border border-hairline px-6 font-medium"
            >
              Sign in
            </Link>
          </div>
        </section>

        {/* 2. The problem */}
        <section>
          <h2 className="text-2xl font-semibold">The morning routine this replaces</h2>
          <ul className="mt-5 grid gap-3 text-muted sm:grid-cols-2">
            <li className="rounded-[10px] border border-hairline p-4">
              Eight different sites, every single morning.
            </li>
            <li className="rounded-[10px] border border-hairline p-4">
              Re-reading the same postings you already saw yesterday.
            </li>
            <li className="rounded-[10px] border border-hairline p-4">
              Missing new ones because they are buried under stale listings.
            </li>
            <li className="rounded-[10px] border border-hairline p-4">
              Keeping track of what you applied to entirely in your head.
            </li>
          </ul>
        </section>

        {/* 3. How it works */}
        <section>
          <h2 className="text-2xl font-semibold">How it works</h2>
          <ol className="mt-5 grid gap-4 sm:grid-cols-3">
            {STEPS.map((step, index) => (
              <li key={step.title} className="rounded-[10px] border border-hairline p-5">
                <span
                  aria-hidden="true"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-accent/10 font-semibold text-accent"
                >
                  {index + 1}
                </span>
                <h3 className="mt-3 font-medium">{step.title}</h3>
                <p className="mt-1 text-sm text-muted">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* 4. The score, shown rather than described */}
        <section>
          <h2 className="text-2xl font-semibold">You always see why</h2>
          <p className="mt-2 max-w-2xl text-muted">
            Every posting is scored out of 100 across four parts. Nothing is hidden behind a number
            — the breakdown and the reasoning are on the row itself.
          </p>

          <figure className="mt-6 rounded-[10px] border border-hairline bg-surface p-5">
            <figcaption className="sr-only">An example scored job row</figcaption>

            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="font-medium">Associate Software Engineer</p>
                <p className="text-sm text-muted">Careem · Islamabad, Pakistan</p>
              </div>
              <div className="text-right">
                <span className="text-2xl font-semibold tabular-nums">87</span>
                <span className="ml-2 rounded-full border border-high/40 bg-high/10 px-2 py-0.5 text-xs font-medium text-high">
                  High
                </span>
              </div>
            </div>

            <div
              className="mt-4 flex h-2 gap-0.5 overflow-hidden rounded-full bg-surface-strong"
              role="img"
              aria-label="Stack 28.4 of 40, Level 23.8 of 25, Location 20 of 20, Freshness 15 of 15"
            >
              <div className="bg-accent" style={{ flex: '0 0 28.4%' }} />
              <div className="bg-high" style={{ flex: '0 0 23.8%' }} />
              <div className="bg-stretch" style={{ flex: '0 0 20%' }} />
              <div className="bg-medium" style={{ flex: '0 0 15%' }} />
            </div>

            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <Part colour="bg-accent" label="Stack" value="28.4 / 40" />
              <Part colour="bg-high" label="Level" value="23.8 / 25" />
              <Part colour="bg-stretch" label="Location" value="20 / 20" />
              <Part colour="bg-medium" label="Freshness" value="15 / 15" />
            </dl>

            <p className="mt-4 text-sm text-muted">
              matched 4 skills · entry-level signal: associate · preferred location · posted 2d ago
            </p>
            <p className="mt-1 text-sm">
              <span className="text-muted">Matched: </span>asp.net core, asp.net, c#, azure
            </p>
          </figure>
        </section>

        {/* 5. What it covers — named honestly */}
        <section>
          <h2 className="text-2xl font-semibold">What it actually reads</h2>
          <p className="mt-2 max-w-2xl text-muted">
            Not "every job on the internet". Specifically:
          </p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="rounded-[10px] border border-hairline p-5">
              <h3 className="font-medium">Company job boards</h3>
              <p className="mt-1 text-sm text-muted">
                {SOURCE_TYPES.join(', ')} — the public feeds these vendors publish. Reliable, and
                the backbone of the whole thing.
              </p>
            </div>
            <div className="rounded-[10px] border border-hairline p-5">
              <h3 className="font-medium">Boards and feeds</h3>
              <p className="mt-1 text-sm text-muted">
                Indeed, Bayt, Google Jobs and LinkedIn, plus any RSS or Google Alerts feed you add
                yourself. Best-effort: these can rate-limit.
              </p>
            </div>
          </div>
        </section>

        {/* 6. CTA */}
        <section className="rounded-[10px] border border-hairline bg-surface p-8 text-center">
          <h2 className="text-2xl font-semibold">Two minutes each morning</h2>
          <p className="mx-auto mt-2 max-w-xl text-muted">
            Free, and self-hostable — it runs on your own machine with one command, and your data
            stays there.
          </p>
          <Link
            to="/register"
            className="mt-6 inline-flex min-h-[48px] items-center rounded-lg bg-accent px-6 font-medium text-white"
          >
            Get started
          </Link>
        </section>
      </main>

      <footer className="mx-auto w-full max-w-5xl border-t border-hairline px-6 py-8 text-sm text-muted">
        <p>
          Your job list, statuses and notes are yours. Nothing is shared between accounts, and no
          account can see another's.
        </p>
        <p className="mt-3">
          <strong className="font-medium text-fg">Worth knowing:</strong> scraped sources (LinkedIn,
          Indeed) can rate-limit or block, so coverage from those varies day to day — the company
          boards do not have that problem. Glassdoor is not supported at all: it does not serve
          Pakistan, so the data simply is not there.
        </p>
        <p className="mt-3">
          Scoring is transparent keyword weighting against a profile you edit. It is not AI, and
          that is the point — you can see and change every weight behind every number.
        </p>
      </footer>
    </>
  )
}

function Part({ colour, label, value }: { colour: string; label: string; value: string }) {
  return (
    <div>
      <dt className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted">
        <span aria-hidden="true" className={`h-2 w-2 rounded-full ${colour}`} />
        {label}
      </dt>
      <dd className="mt-1 tabular-nums">{value}</dd>
    </div>
  )
}
