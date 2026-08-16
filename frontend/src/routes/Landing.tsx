/**
 * The public landing page.
 *
 * One job: make a visitor understand the product in about fifteen seconds and
 * sign up. It ships in its own code-split chunk with none of the dashboard's
 * dependencies, because it has to render fast on a slow Pakistani mobile
 * connection — which is where most of its visitors are.
 *
 * Structure follows a three-step funnel: the problem they recognise, the
 * mechanism, then the proof — and the proof is a real scored row rather than a
 * paragraph describing one. Showing the actual artefact is the whole pitch.
 *
 * **Honest copy, above conversion.** No invented testimonials, no "trusted by
 * N developers", no fabricated logos or star ratings. It does not claim to
 * index every job on the internet, and it does not call the scoring AI — it is
 * transparent keyword weighting against a profile the user controls, which is a
 * genuine advantage over a black box and is said in those words.
 */

import { Link } from 'react-router-dom'

import { ThemeToggle } from '../components/ThemeToggle'
import {
  IconAlert,
  IconCheck,
  IconExternal,
  IconLayers,
  IconRadar,
  IconSliders,
  IconTarget,
} from '../components/icons'
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

const SEGMENTS = [
  { label: 'Stack', value: 28.4, max: 40, colour: 'bg-seg-stack', text: 'text-seg-stack' },
  { label: 'Level', value: 23.8, max: 25, colour: 'bg-seg-level', text: 'text-seg-level' },
  { label: 'Location', value: 20, max: 20, colour: 'bg-seg-location', text: 'text-seg-location' },
  { label: 'Freshness', value: 15, max: 15, colour: 'bg-seg-fresh', text: 'text-seg-fresh' },
]

export default function Landing() {
  const { status } = useAuth()
  const signedIn = status === 'authenticated'

  return (
    <div className="min-h-screen bg-bg">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded focus:bg-accent focus:px-4 focus:py-2 focus:text-on-accent"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-20 border-b border-hairline bg-bg/85 backdrop-blur">
        <div className="mx-auto flex h-topbar max-w-6xl items-center gap-3 px-5">
          <span className="flex items-center gap-2 font-semibold tracking-tight">
            <IconRadar size={19} className="text-accent" />
            JobRadar
          </span>

          <nav aria-label="Account" className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            {signedIn ? (
              <Link to="/app">
                <Button size="sm" variant="secondary">
                  Dashboard
                </Button>
              </Link>
            ) : (
              <>
                <Link to="/login" className="hidden sm:block">
                  <Button size="sm" variant="ghost">
                    Sign in
                  </Button>
                </Link>
                <Link to="/register">
                  <Button size="sm">Get started</Button>
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main id="main">
        {/* --- Hero ---------------------------------------------------- */}
        <section className="relative overflow-hidden border-b border-hairline">
          {/* Decorative only. A faint grid gives the page depth without the
              gradient-and-glow treatment every SaaS landing already has. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-[0.35]"
            style={{
              backgroundImage:
                'linear-gradient(to right, var(--border) 1px, transparent 1px), linear-gradient(to bottom, var(--border) 1px, transparent 1px)',
              backgroundSize: '56px 56px',
              maskImage: 'radial-gradient(ellipse 80% 60% at 50% 0%, black 40%, transparent 100%)',
              WebkitMaskImage:
                'radial-gradient(ellipse 80% 60% at 50% 0%, black 40%, transparent 100%)',
            }}
          />

          <div className="relative mx-auto grid max-w-6xl gap-7 px-5 py-7 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:py-[4.5rem]">
            <Reveal>
              <Badge tone="accent" icon={<IconCheck size={12} />}>
                Free and self-hostable
              </Badge>

              <h1 className="mt-4 text-3xl font-semibold leading-[1.12] tracking-tight sm:text-4xl">
                Every junior dev job in your city, scored against your CV, in one place.
              </h1>

              <p className="mt-4 max-w-measure text-md text-muted">
                JobRadar reads company job boards and feeds every morning, ranks each posting
                against a profile you control, and tells you exactly why it ranked where it did.
              </p>

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Link to="/register">
                  <Button className="px-5">Get started</Button>
                </Link>
                <Link to="/login">
                  <Button variant="secondary">Sign in</Button>
                </Link>
              </div>

              <p className="mt-4 text-sm text-subtle">
                Two minutes to set up. Two minutes a morning after that.
              </p>
            </Reveal>

            {/* The product itself, not a stock illustration of one. */}
            <Reveal delay={120}>
              <ScoredRowDemo />
            </Reveal>
          </div>
        </section>

        {/* --- The problem --------------------------------------------- */}
        <section className="border-b border-hairline bg-bg-subtle">
          <div className="mx-auto max-w-6xl px-5 py-7">
            <h2 className="text-xl font-semibold">The morning routine this replaces</h2>
            <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {PROBLEMS.map((problem, index) => (
                <li key={problem}>
                  <Reveal delay={index * 60}>
                    <p className="h-full rounded-lg border border-hairline bg-surface p-4 text-sm text-muted">
                      {problem}
                    </p>
                  </Reveal>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* --- How it works -------------------------------------------- */}
        <section className="border-b border-hairline">
          <div className="mx-auto max-w-6xl px-5 py-7">
            <h2 className="text-xl font-semibold">How it works</h2>
            <ol className="mt-5 grid gap-4 lg:grid-cols-3">
              {STEPS.map((step, index) => (
                <li key={step.title}>
                  <Reveal
                    delay={index * 80}
                    className="h-full rounded-lg border border-hairline bg-surface p-5"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-subtle text-accent">
                        <step.Icon size={17} />
                      </span>
                      <span className="tabular text-xs text-subtle">
                        Step {index + 1} of {STEPS.length}
                      </span>
                    </div>
                    <h3 className="mt-3.5 font-semibold">{step.title}</h3>
                    <p className="mt-1.5 text-sm text-muted">{step.body}</p>
                  </Reveal>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* --- What it reads, named honestly --------------------------- */}
        <section className="border-b border-hairline bg-bg-subtle">
          <div className="mx-auto max-w-6xl px-5 py-7">
            <h2 className="text-xl font-semibold">What it actually reads</h2>
            <p className="mt-2 max-w-measure text-sm text-muted">
              Not "every job on the internet". Specifically these, and nothing it cannot reach:
            </p>

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <article className="rounded-lg border border-hairline bg-surface p-5">
                <h3 className="flex items-center gap-2 font-semibold">
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

              <article className="rounded-lg border border-hairline bg-surface p-5">
                <h3 className="flex items-center gap-2 font-semibold">
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

        {/* --- CTA ----------------------------------------------------- */}
        <section className="border-b border-hairline">
          <div className="mx-auto max-w-6xl px-5 py-[3.5rem] text-center">
            <h2 className="text-2xl font-semibold">Stop opening eight tabs</h2>
            <p className="mx-auto mt-3 max-w-measure text-md text-muted">
              Free, open, and self-hostable — one command on your own machine, and your job list and
              notes never leave it.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link to="/register">
                <Button className="px-6">Get started</Button>
              </Link>
              <a
                href="https://github.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex"
              >
                <Button variant="secondary">
                  View the source
                  <IconExternal size={14} />
                </Button>
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="mx-auto max-w-6xl px-5 py-7 text-sm text-muted">
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <p className="flex items-center gap-2 font-medium text-fg">
              <IconRadar size={16} className="text-accent" />
              JobRadar
            </p>
            <p className="mt-2 max-w-measure">
              Your job list, statuses and notes are yours. Nothing is shared between accounts, and
              no account can see another's.
            </p>
          </div>
          <div className="space-y-2.5">
            <p>
              <strong className="font-medium text-fg">Worth knowing:</strong> scraped sources
              (LinkedIn, Indeed) can rate-limit or block, so coverage from them varies.{' '}
              <strong className="font-medium text-fg">Glassdoor is not supported</strong> — it does
              not serve Pakistan, so the data simply is not there.
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
 * A real scored row.
 *
 * "You always see why" is the actual differentiator, so it is shown rather than
 * claimed. The numbers are a genuine breakdown, not decorative.
 */
function ScoredRowDemo() {
  return (
    <figure className="rounded-lg border border-hairline bg-surface shadow">
      <figcaption className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-2.5">
        <span className="text-xs font-medium uppercase tracking-wide text-subtle">
          One row from your list
        </span>
        <Badge tone="accent">New today</Badge>
      </figcaption>

      <div className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-semibold">Associate Software Engineer</p>
            <p className="mt-0.5 text-sm text-muted">Careem · Islamabad, Pakistan · 2d ago</p>
          </div>
          <div className="text-right">
            <span className="tabular text-2xl font-semibold leading-none">87</span>
            <span className="mt-1.5 block">
              <Badge tone="high">High</Badge>
            </span>
          </div>
        </div>

        <div
          className="mt-4 flex h-2 gap-0.5 overflow-hidden rounded-full bg-surface-strong"
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
