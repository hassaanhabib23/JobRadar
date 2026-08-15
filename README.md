# JobRadar

A personal job-aggregation system. It polls job sources on a schedule, scores every
posting against your own configurable profile, tracks what is new and what has closed,
and puts it on one screen you check for two minutes each morning.

**Status: milestone 6 of 13 — the backend is complete.** `docker compose up` brings
up six services, seeds 14 boards, and runs itself daily. A live run reads 911
postings from 14 sources in 26 seconds, merges them to 623 jobs, and scores them
separately for each user. The React app is next.

## Quick start

```bash
cp .env.example .env      # edit DJANGO_SECRET_KEY and POSTGRES_PASSWORD
docker compose up --build
```

| URL | What |
|---|---|
| http://localhost:3000 | Frontend |
| http://localhost:8000/api/health/ | Health check — database status and last-run age |
| http://localhost:8000/api/docs/ | API documentation (Swagger UI) |
| http://localhost:8000/admin/ | Django admin |

For hot reload and exposed database/Redis ports:

```bash
make dev      # http://localhost:5173, /api proxied to the backend
```

## Common tasks

```bash
make help          # every target, described
make test          # backend pytest + frontend vitest
make lint          # ruff + mypy + eslint + prettier + tsc
make migrate       # apply migrations
make gen-schema    # regenerate contracts/jobradar-v1.json
make clean         # DESTROYS all data — see the warning below
```

## Architecture

One repository, two independently deployable apps, sharing only the OpenAPI contract
in `contracts/`.

```
                        ┌──────────────┐
   job boards  ────────▶│    worker    │  fetches every source ONCE per run
   (ATS, RSS, scrapes)  │   (celery)   │  then scores per user
                        └──────┬───────┘
                               │
                    ┌──────────▼──────────┐
                    │   postgres  redis   │
                    └──────────┬──────────┘
                               │
   browser ──▶ nginx ──▶ ┌─────▼─────┐
              (frontend) │    web    │  Django REST API
                         └───────────┘
```

The central design decision: **a job posting is global, a score is per user.** One
`Job` row per real-world posting, plus one `UserJob` row per user watching it with
that user's score, tier, status and notes. Adding a user must never increase outbound
traffic to job boards.

### Layout

```
backend/
  config/     settings (base/dev/prod/test), urls, celery app
  users/      custom user model — email is the username
  scoring/    PURE domain logic, no Django imports  (milestone 2)
  sources/    one adapter module per ATS + scraper  (milestones 4–5, 10)
  jobs/       models, serializers, views, admin, tasks  (milestone 4+)
  tests/
frontend/
  src/
contracts/    OpenAPI 3 — written by the backend, read by the frontend
```

`scoring/` must not import Django. Scoring, reconciliation and staleness are pure
functions over plain dataclasses, which is what makes them fast and pleasant to test.
There is a test that enforces it rather than trusting the convention.

### How a score is built

Hard filters run first — a blocked title, a city you did not ask for, a posting
older than your cutoff — and produce a reason rather than a score. What survives is
scored out of 100 across four components, and the breakdown is always shown:

| Component | Out of | What it measures |
|---|---|---|
| Stack | 40 | Weighted skill keywords found in the title, location and description |
| Level | 25 | Seniority signals in the title. An unstated level scores 14, not 0 |
| Location | 20 | Preferred city 20, secondary 13, elsewhere 8 |
| Freshness | 15 | Age bands, with an undated posting scoring 4 and a ghost 1 |

Tiers: **High** ≥75, **Medium** ≥60, **Stretch** below that.

Keyword matching tokenises on `[a-z0-9+#.]+`, joins with single spaces, pads both
ends and then substring-matches. That is what stops `.net` from matching
`kubernetes`, `telnet` and `subnet` while still matching `.NET Developer`.

## Configuration

Everything comes from the environment. `.env.example` lists every variable with
placeholder values; **no secrets are ever committed.**

| Variable | Purpose |
|---|---|
| `DJANGO_SECRET_KEY` | Django signing key. Must be a real random value outside dev |
| `DJANGO_SETTINGS_MODULE` | `config.settings.dev` / `.prod` / `.test` |
| `DJANGO_ALLOWED_HOSTS` | Comma-separated hostnames; required in production |
| `POSTGRES_*` | Database name, user, password, host, port |
| `CELERY_BROKER_URL` / `CELERY_RESULT_BACKEND` | Redis URLs |
| `CELERY_TIMEZONE` | Schedule timezone — `Asia/Karachi`, while timestamps stay UTC |
| `API_BASE_URL` | Written into `/config.json` by the frontend entrypoint at start-up |
| `JOBSPY_PROXIES` | Optional residential proxies for scraping. Off by default |

## Data and backups

> **`docker compose down -v` (and `make clean`) deletes every application status and
> note you have ever recorded.** Postings can always be re-fetched; your application
> history cannot. Use `make down` unless you genuinely mean to wipe it.

A nightly `pg_dump` and a tested restore command arrive in milestone 12.

## Operating it

Three backend processes must be running, not one. Deploying only `web` is the
single most common way this stops working, and it fails *silently* — the API keeps
serving yesterday's data.

| Process | Job | If it dies |
|---|---|---|
| `web` | Serves the API | UI breaks — you notice immediately |
| `worker` | Executes run tasks | Runs never finish — **you may not notice for days** |
| `beat` | Fires the daily schedule | Nothing ever starts — **you definitely won't notice** |

All three have `restart: unless-stopped`. Beyond that:

- **`GET /api/health/` reports the age of the last *successful* run.** Point an uptime
  monitor at it. A failed run does not reset the clock, so a worker that quietly died
  shows up as a growing number long before anyone notices missing jobs.
- **Beat does not backfill.** If the machine was down at 09:00 that run never happens,
  so a worker checks on startup and fires a catch-up if the last success is over 24
  hours old.
- **A Redis lock stops two runs overlapping.** A manual "Run now" during the scheduled
  run is skipped rather than double-fetching every source.
- **Per-source results are kept forever**, so "Contour has failed every day for a week"
  is visible in the run history rather than buried in logs.

## Honest limitations

- **Scraped sources are best-effort.** LinkedIn's terms do not permit scraping and
  their `robots.txt` disallows job pages; IP blocks are a normal outcome, not a bug.
  The ATS feeds (Greenhouse, Lever, Workable, Ashby, Workday, RSS) are the reliable
  backbone. A scrape returning nothing never means "no jobs today".
- **Glassdoor is not supported.** It does not serve Pakistan at all — the API returns
  "Glassdoor is not available for PAKISTAN". This is missing data, not a limitation to
  work around.
- Scoring is transparent keyword weighting against a profile you control. It is not
  AI, and that is the point: you can always see exactly why something ranked where it did.

## Roadmap

Milestones are tracked in the plan; each leaves something runnable.

1. ✅ Skeleton — compose, custom user model, health check, CI
2. ✅ Scoring core (pure, no Django)
3. ✅ Auth + per-user profile
4. ✅ First vertical slice — Greenhouse end to end
5. ✅ Remaining ATS adapters + widen the source list
6. ✅ Run lifecycle — two-phase Celery task, NEW/CLOSED detection
7. ✅ Auth + onboarding UI
8. Dashboard
9. Detail, profile and runs screens
10. jobspy adapter
11. Landing page
12. Deployment hardening
13. Polish — a11y, e2e, screenshots

Deliberate departures from the specification are recorded in [DEVIATIONS.md](DEVIATIONS.md).
