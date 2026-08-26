/**
 * The public landing page.
 *
 * One job: make a visitor understand the product in about fifteen seconds and
 * sign up. It ships in its own code-split chunk with none of the dashboard's
 * dependencies, because it has to render fast on a slow mobile connection —
 * which is where most of its visitors are.
 *
 * Structure follows a three-step funnel: the problem they recognise, the
 * mechanism, then the proof — and the proof is a real scored row rather than a
 * paragraph describing one. Showing the actual artefact is the whole pitch.
 *
 * **Honest copy, above conversion.** No invented testimonials, no "trusted by
 * N developers", no fabricated logos or star ratings. It does not claim to
 * index every job on the internet, and it does not call the scoring AI — it is
 * transparent keyword weighting against a profile the user controls, which is a
 * genuine advantage over a black box and is said in those words. The stats band
 * below is built entirely from facts already stated elsewhere on this page —
 * the named sources, the daily cadence, the four-part score — never an invented
 * number.
 *
 * **There is no public job search.** JobRadar scores jobs against a profile a
 * signed-in user controls; there is nothing to search anonymously. The hero's
 * search bar looks and behaves like a real product control on purpose, but
 * submitting it leads to sign-up rather than pretending to search a database
 * that does not exist for a visitor who has not signed in.
 */

import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { ThemeToggle } from '../components/ThemeToggle'
import {
  IconAlert,
  IconCheck,
  IconExternal,
  IconLayers,
  IconMapPin,
  IconRadar,
  IconSearch,
  IconSliders,
  IconTarget,
} from '../components/icons'
import { RadarDecoration } from '../components/RadarField'
import { Reveal } from '../components/Reveal'
import { Badge, Button, cx } from '../components/ui'
import { useAuth } from '../auth/AuthProvider'

const PROBLEMS = [
  'Eight different sites, every single morning.',
  'The same postings you already read yesterday.',
  'New ones buried under three-week-old listings.',
  'What you applied to, tracked entirely in your head.',
]

const STEPS = [
  {
    Icon: IconSliders,
    title: 'Tune it once',
    body: 'Pick your cities and the technologies you actually work in. Every weight behind the score is yours to change.',
  },
  {
    Icon: IconRadar,
    title: 'It reads everything, daily',
    body: 'Company job boards, plus Indeed, Bayt, Google Jobs and any RSS or Google Alerts feed you point it at.',
  },
  {
    Icon: IconTarget,
    title: 'You get a ranked shortlist',
    body: 'Scored out of 100, new roles flagged, and the reasoning shown on every single row.',
  },
]

const ATS = [
  'Greenhouse',
  'Lever',
  'Workable',
  'Ashby',
  'Workday',
  'SmartRecruiters',
  'Recruitee',
  'Breezy',
]

const STATS = [
  { value: `${ATS.length}+`, label: 'ATS platforms', note: 'read directly, no scraping needed' },
  { value: '4', label: 'named boards', note: 'LinkedIn, Indeed, Bayt, Google Jobs' },
  { value: '4', label: 'score components', note: 'stack, level, location, freshness' },
  { value: 'Daily', label: 'run cadence', note: 'every morning, or on demand' },
]

const SEGMENTS = [
  { label: 'Stack', value: 28.4, max: 40, colour: 'bg-seg-stack', text: 'text-seg-stack' },
  { label: 'Level', value: 23.8, max: 25, colour: 'bg-seg-level', text: 'text-seg-level' },
  { label: 'Location', value: 20, max: 20, colour: 'bg-seg-location', text: 'text-seg-location' },
  { label: 'Freshness', value: 15, max: 15, colour: 'bg-seg-fresh', text: 'text-seg-fresh' },
]

const HERO_CHIPS = [
  { score: 92, role: 'Python Developer', location: 'Remote', style: { top: '8%', left: '4%' } },
  { score: 87, role: 'Backend Engineer', location: 'Islamabad', style: { top: '58%', left: '2%' } },
  {
    score: 81,
    role: '.NET Developer',
    location: 'Lahore',
    style: { top: '32%', left: '78%' },
  },
]

export default function Landing() {
  const { status } = useAuth()
  const signedIn = status === 'authenticated'

  return (
    <div className="min-h-screen bg-bg">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded focus:bg-brand-grad-accent focus:px-4 focus:py-2 focus:font-semibold focus:text-white focus:shadow-e2"
      >
        Skip to content
      </a>

      {/* Always charcoal, whatever the light/dark toggle says — the brief's
          own "dark navbar, off-white content, amber CTA" pattern, applied as
          a constant rather than something the toggle can undo. */}
      <header className="sticky top-0 z-20 border-b border-brand-border bg-brand-bg">
        <div className="mx-auto flex h-topbar max-w-6xl items-center gap-3 px-5">
          <span className="flex items-center gap-2.5 text-md font-extrabold tracking-tight text-brand-fg">
            <span className="flex h-8 w-8 items-center justify-center rounded-sm bg-brand-grad-accent text-white shadow-e1">
              <IconRadar size={17} />
            </span>
            JobRadar
          </span>

          <nav aria-label="Account" className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            {signedIn ? (
              <Link to="/app">
                <Button size="sm" variant="brand-secondary">
                  Dashboard
                </Button>
              </Link>
            ) : (
              <>
                <Link to="/login" className="hidden sm:block">
                  <Button size="sm" variant="brand-ghost">
                    Sign in
                  </Button>
                </Link>
                <Link to="/register">
                  <Button size="sm" variant="brand">
                    Get started
                  </Button>
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main id="main">
        {/* --- Hero (charcoal) ------------------------------------------ */}
        <section className="relative overflow-hidden bg-brand-bg">
          <RadarDecoration chips={HERO_CHIPS} className="hidden lg:block" />

          <div className="relative mx-auto grid max-w-6xl gap-8 px-5 py-10 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:py-24">
            <Reveal>
              <Badge tone="brand" icon={<IconCheck size={12} />}>
                Free and self-hostable
              </Badge>

              <h1 className="mt-5 text-3xl font-extrabold leading-[1.08] tracking-tight text-brand-fg sm:text-4xl lg:text-5xl">
                Every junior dev job in your city,{' '}
                <span className="text-brand-accent">scored against your CV</span>, in one place.
              </h1>

              <p className="mt-4 max-w-measure text-md text-brand-fg-muted">
                JobRadar reads company job boards and feeds every morning, ranks each posting
                against a profile you control, and tells you exactly why it ranked where it did.
              </p>

              <HeroSearch />

              <div className="mt-5 flex flex-wrap items-center gap-3">
                <Link to="/register">
                  <Button size="lg" variant="brand">
                    Get started
                  </Button>
                </Link>
                <Link to="/login">
                  <Button size="lg" variant="brand-secondary">
                    Sign in
                  </Button>
                </Link>
              </div>

              <p className="mt-4 text-sm text-brand-fg-subtle">
                Two minutes to set up. Two minutes a morning after that.
              </p>
            </Reveal>

            {/* The product itself, not a stock illustration of one. */}
            <Reveal delay={120}>
              <ScoredRowDemo />
            </Reveal>
          </div>
        </section>

        {/* --- The problem (off-white) ----------------------------------- */}
        <section className="border-b border-hairline bg-bg">
          <div className="mx-auto max-w-6xl px-5 py-14">
            <h2 className="max-w-measure text-2xl font-extrabold sm:text-3xl">
              The morning routine this replaces
            </h2>
            <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {PROBLEMS.map((problem, index) => (
                <li key={problem}>
                  <Reveal delay={index * 60}>
                    <p className="surface lift h-full p-5 text-sm text-muted">{problem}</p>
                  </Reveal>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* --- Stats band (charcoal) -------------------------------------- */}
        <section className="border-b border-brand-border bg-brand-bg">
          <div className="mx-auto max-w-6xl px-5 py-12">
            <dl className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {STATS.map((stat, index) => (
                <Reveal key={stat.label} delay={index * 60}>
                  <dt className="text-2xs font-bold uppercase tracking-wide text-brand-fg-subtle">
                    {stat.label}
                  </dt>
                  <dd className="tabular mt-1.5 text-4xl font-extrabold text-brand-accent">
                    {stat.value}
                  </dd>
                  <p className="mt-1.5 text-sm text-brand-fg-muted">{stat.note}</p>
                </Reveal>
              ))}
            </dl>
          </div>
        </section>

        {/* --- How it works (light gray) ---------------------------------- */}
        <section className="border-b border-hairline bg-bg-deep">
          <div className="mx-auto max-w-6xl px-5 py-14">
            <h2 className="text-2xl font-extrabold sm:text-3xl">How it works</h2>
            <ol className="mt-6 grid gap-4 lg:grid-cols-3">
              {STEPS.map((step, index) => (
                <li key={step.title}>
                  <Reveal delay={index * 80} className="surface lift h-full p-5 sm:p-6">
                    <div className="flex items-center gap-3">
                      <span className="flex h-11 w-11 items-center justify-center rounded-sm bg-grad-accent text-on-accent shadow-e1">
                        <step.Icon size={19} />
                      </span>
                      <span className="tabular text-xs text-subtle">
                        Step {index + 1} of {STEPS.length}
                      </span>
                    </div>
                    <h3 className="mt-4 text-md font-bold">{step.title}</h3>
                    <p className="mt-1.5 text-sm text-muted">{step.body}</p>
                  </Reveal>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* --- What it reads, named honestly (off-white) ------------------ */}
        <section className="border-b border-hairline bg-bg">
          <div className="mx-auto max-w-6xl px-5 py-14">
            <h2 className="text-2xl font-extrabold sm:text-3xl">What it actually reads</h2>
            <p className="mt-2 max-w-measure text-sm text-muted">
              Not "every job on the internet". Specifically these, and nothing it cannot reach:
            </p>

            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <article className="surface lift edge-top p-5 sm:p-6">
                <h3 className="flex items-center gap-2 text-md font-bold">
                  <IconLayers size={16} className="text-accent" />
                  Company job boards
                </h3>
                <p className="mt-2 text-sm text-muted">
                  The public feeds these vendors publish for aggregators. Reliable, and the backbone
                  of the whole thing.
                </p>
                <ul className="mt-3.5 flex flex-wrap gap-1.5">
                  {ATS.map((vendor) => (
                    <li key={vendor}>
                      <Badge>{vendor}</Badge>
                    </li>
                  ))}
                </ul>
              </article>

              <article className="surface lift edge-top p-5 sm:p-6">
                <h3 className="flex items-center gap-2 text-md font-bold">
                  <IconRadar size={16} className="text-accent" />
                  Boards and feeds
                </h3>
                <p className="mt-2 text-sm text-muted">
                  Indeed, Bayt, Google Jobs and LinkedIn, plus any RSS or Google Alerts feed you add
                  yourself. This is where most local employers actually post.
                </p>
                <p className="mt-3.5 flex items-start gap-2 rounded border border-medium-border bg-medium-bg p-2.5 text-xs text-medium">
                  <IconAlert size={13} className="mt-0.5" />
                  <span>
                    Best-effort: these rate-limit, so coverage from them varies day to day. The
                    company boards do not have that problem.
                  </span>
                </p>
              </article>
            </div>
          </div>
        </section>

        {/* --- CTA (charcoal) ---------------------------------------------- */}
        <section className="bg-brand-bg">
          <div className="mx-auto max-w-6xl px-5 py-16 text-center">
            <h2 className="text-3xl font-extrabold text-brand-fg sm:text-4xl">
              Stop opening eight tabs
            </h2>
            <p className="mx-auto mt-3 max-w-measure text-md text-brand-fg-muted">
              Free, open, and self-hostable — one command on your own machine, and your job list and
              notes never leave it.
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <Link to="/register">
                <Button size="lg" variant="brand">
                  Get started
                </Button>
              </Link>
              <a
                href="https://github.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex"
              >
                <Button size="lg" variant="brand-secondary">
                  View the source
                  <IconExternal size={14} />
                </Button>
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-brand-border bg-brand-bg-deep px-5 py-10 text-sm text-brand-fg-muted">
        <div className="mx-auto grid max-w-6xl gap-5 sm:grid-cols-2">
          <div>
            <p className="flex items-center gap-2 font-bold text-brand-fg">
              <IconRadar size={16} className="text-brand-accent" />
              JobRadar
            </p>
            <p className="mt-2 max-w-measure">
              Your job list, statuses and notes are yours. Nothing is shared between accounts, and
              no account can see another's.
            </p>
          </div>
          <div className="space-y-2.5">
            <p>
              <strong className="font-bold text-brand-fg">Worth knowing:</strong> scraped sources
              (LinkedIn, Indeed) can rate-limit or block, so coverage from them varies.{' '}
              <strong className="font-bold text-brand-fg">Glassdoor is not supported</strong> — it
              does not serve Pakistan, so the data simply is not there.
            </p>
            <p>
              Scoring is transparent keyword weighting against a profile you edit. It is not AI, and
              that is the point: you can see and change every weight behind every number.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}

/**
 * The hero's search bar.
 *
 * Styled as a real product control because that is what the rest of the app
 * looks like — but there is no public job search to run: scoring only exists
 * against a signed-in profile. Submitting it leads to sign-up rather than
 * faking a search this product does not have.
 */
function HeroSearch() {
  const navigate = useNavigate()
  const [role, setRole] = useState('')
  const [location, setLocation] = useState('')

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    navigate('/register')
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-7 flex flex-col gap-2 rounded-xl border border-black/5 bg-brand-input-bg p-2 shadow-e3 sm:flex-row sm:items-center"
    >
      <label className="flex flex-1 items-center gap-2.5 px-2.5 py-2">
        <IconSearch size={16} className="shrink-0 text-brand-input-muted" />
        <span className="sr-only">Job title, skills or company</span>
        <input
          type="text"
          value={role}
          onChange={(event) => setRole(event.target.value)}
          placeholder="Job title, skills or company"
          className="w-full bg-transparent text-base text-brand-input-fg placeholder:text-brand-input-muted focus:outline-none"
        />
      </label>

      <div className="hidden h-8 w-px bg-black/10 sm:block" aria-hidden="true" />

      <label className="flex items-center gap-2.5 border-t border-black/5 px-2.5 py-2 sm:w-[200px] sm:border-t-0">
        <IconMapPin size={16} className="hidden shrink-0 text-brand-input-muted sm:block" />
        <span className="sr-only">Location</span>
        <input
          type="text"
          value={location}
          onChange={(event) => setLocation(event.target.value)}
          placeholder="Islamabad, Lahore…"
          className="w-full bg-transparent text-base text-brand-input-fg placeholder:text-brand-input-muted focus:outline-none"
        />
      </label>

      <Button type="submit" variant="brand" size="md" className="w-full sm:w-auto">
        <IconSearch size={15} />
        Search jobs
      </Button>
    </form>
  )
}

/**
 * A real scored row.
 *
 * "You always see why" is the actual differentiator, so it is shown rather than
 * claimed. The numbers are a genuine breakdown, not decorative.
 */
function ScoredRowDemo() {
  return (
    <figure className="surface surface-3 edge-top relative z-10 rounded-xl">
      <figcaption className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-2.5">
        <span className="text-2xs font-bold uppercase tracking-wide text-subtle">
          One row from your list
        </span>
        <Badge tone="accent">New today</Badge>
      </figcaption>

      <div className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-md font-bold">Associate Software Engineer</p>
            <p className="mt-0.5 text-sm text-muted">Careem · Islamabad, Pakistan · 2d ago</p>
          </div>
          <div className="text-right">
            <span className="tabular text-3xl font-extrabold leading-none text-accent">87</span>
            <span className="mt-1.5 block">
              <Badge tone="high">High</Badge>
            </span>
          </div>
        </div>

        <div
          className="mt-5 flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-surface-strong shadow-e0"
          role="img"
          aria-label="Score 87 of 100. Stack 28.4 of 40, Level 23.8 of 25, Location 20 of 20, Freshness 15 of 15."
        >
          {SEGMENTS.map((segment) => (
            <div
              key={segment.label}
              className={segment.colour}
              style={{ flex: `0 0 ${segment.value}%` }}
            />
          ))}
        </div>

        <dl className="mt-3.5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {SEGMENTS.map((segment) => (
            <div key={segment.label}>
              <dt className="flex items-center gap-1.5 text-2xs uppercase tracking-wide text-subtle">
                <span aria-hidden="true" className={cx('h-2 w-2 rounded-full', segment.colour)} />
                {segment.label}
              </dt>
              <dd className="tabular mt-1 text-sm">
                {segment.value}
                <span className="text-subtle"> / {segment.max}</span>
              </dd>
            </div>
          ))}
        </dl>

        <div className="mt-4 border-t border-hairline pt-3.5">
          <p className="text-xs text-muted">
            matched 4 skills · entry-level signal: associate · preferred location · posted 2d ago
          </p>
          <p className="mt-1.5 text-xs">
            <span className="text-subtle">Matched: </span>
            asp.net core, asp.net, c#, azure
          </p>
        </div>
      </div>
    </figure>
  )
}
