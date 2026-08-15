"""The run lifecycle.

Two phases, deliberately separate:

    Phase 1 — fetch and store globally, once per feed.
    Phase 2 — score per user, from what phase 1 stored.

That split is what holds outbound traffic constant as users are added (NFR12).
Ten users watching Careem's board cause one HTTP request per run, not ten.

The whole thing is written so that a failing source degrades the run and never
breaks it: every fetch is wrapped, every failure is recorded against its source,
and closed-detection is scoped to the sources that actually succeeded.
"""

from __future__ import annotations

import logging
import time
from collections.abc import Iterable
from dataclasses import replace
from datetime import date

from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone

from jobs.models import Job, Run, RunSource, RunStatus, Source, UserJob
from jobs.services import score_jobs_for_user, store_postings
from scoring.domain import RawPosting
from scoring.reconcile import reconcile
from sources import SourceError, fetch

logger = logging.getLogger(__name__)

User = get_user_model()


class FetchOutcome:
    """What one source produced, successfully or not."""

    __slots__ = ("duration_ms", "error", "postings", "source")

    def __init__(
        self,
        source: Source,
        postings: list[RawPosting],
        error: str = "",
        duration_ms: int = 0,
    ) -> None:
        self.source = source
        self.postings = postings
        self.error = error
        self.duration_ms = duration_ms

    @property
    def ok(self) -> bool:
        return not self.error


def expand_location_sources(sources: list[Source]) -> list[Source]:
    """Turn each jobspy source into one source per city users actually want.

    ATS feeds are company-based: one fetch serves every user, and each user's
    filter picks their subset. Scraped sources are location-based, so the scrape
    list has to come from **demand** — the distinct union of cities across all
    active users' profiles.

    Ten users wanting Islamabad produce one Islamabad scrape; a new user in
    Lahore adds exactly one more; a city nobody selected is never scraped.
    """
    from sources.jobspy_adapter import scrape_locations_for_users
    from users.models import Profile

    scrape_sources = [source for source in sources if source.kind == "jobspy"]
    if not scrape_sources:
        return sources

    profiles = list(Profile.objects.filter(user__is_active=True))
    cities = scrape_locations_for_users(profiles)

    expanded = [source for source in sources if source.kind != "jobspy"]
    seen: set[tuple[str, str]] = set()

    for source in scrape_sources:
        for city in cities:
            query = str((source.config or {}).get("query") or "software engineer")
            key = (query.lower(), city.lower())
            # Never the same city twice in one run, even if two jobspy sources
            # ask the same question.
            if key in seen:
                continue
            seen.add(key)

            # An unsaved clone: it exists only for this run's fetch loop.
            clone = Source(
                id=source.id,
                kind=source.kind,
                slug=source.slug,
                company=source.company,
                label=f"{source.label or 'jobspy'} — {city}",
                location_hint=city,
                config=source.config,
                enabled=True,
                owner_id=source.owner_id,
            )
            expanded.append(clone)

    return expanded


def enabled_sources() -> list[Source]:
    """Every enabled source, deduplicated by feed identity.

    Shared sources plus every user's private ones. If three users each privately
    added `greenhouse/careem`, that is **one** fetch this run, not three — which
    is the entire point of FR17.
    """
    seen: dict[tuple[str, str], Source] = {}
    for source in Source.objects.filter(enabled=True).select_related("owner"):
        key = source.spec.dedupe_key
        # A shared source wins over a private duplicate, so the result is
        # visible to everyone rather than to one person.
        if key not in seen or (seen[key].owner_id is not None and source.owner_id is None):
            seen[key] = source
    return list(seen.values())


def fetch_source(source: Source) -> FetchOutcome:
    """Fetch one source. Never raises.

    Every failure mode ends up here as a recorded error rather than an
    exception, because one board being down must not end the run or, worse,
    make it look as though every job on a healthy board has closed.
    """
    started = time.monotonic()
    ref = source_ref(source)
    try:
        postings = [replace(posting, source_ref=ref) for posting in fetch(source.spec)]
    except SourceError as exc:
        return FetchOutcome(source, [], str(exc), _elapsed_ms(started))
    except Exception as exc:
        logger.exception("source %s raised unexpectedly", source)
        return FetchOutcome(
            source, [], f"unexpected {exc.__class__.__name__}: {exc}", _elapsed_ms(started)
        )

    return FetchOutcome(source, postings, "", _elapsed_ms(started))


def source_ref(source: Source) -> str:
    """A stable identity for one feed, e.g. "greenhouse:careem"."""
    kind, identity = source.spec.dedupe_key
    return f"{kind}:{identity}"


def _elapsed_ms(started: float) -> int:
    return int((time.monotonic() - started) * 1000)


def close_missing_jobs(seen_keys: set[str], succeeded_sources: Iterable[Source]) -> int:
    """Mark jobs that have disappeared from a healthy feed as closed.

    Three rules, each of which exists because breaking it corrupts data:

    1. Compare against the explicit **set of keys seen this run**, never
       timestamps. Two runs sharing a clock second, or any backwards clock
       adjustment, breaks timestamp comparison silently.
    2. Scope closures to the specific feeds that **succeeded** — by feed, not by
       vendor. Careem and Arbisoft are both Greenhouse boards, so scoping by
       vendor lets a failed Arbisoft fetch close every one of Careem's jobs.
    3. Skip additive sources entirely. A keyword search or an RSS window is not
       a full listing of anyone's board, so absence proves nothing.
    """
    closable_refs = {source_ref(source) for source in succeeded_sources if not source.is_additive}
    if not closable_refs:
        return 0

    now = timezone.now()
    stale = Job.objects.filter(source_ref__in=closable_refs, closed_at__isnull=True).exclude(
        key__in=seen_keys
    )

    closed_ids = list(stale.values_list("pk", flat=True))
    if not closed_ids:
        return 0

    Job.objects.filter(pk__in=closed_ids).update(closed_at=now)
    # Keep the denormalised flag the dashboard's partial index depends on in step.
    UserJob.objects.filter(job_id__in=closed_ids).update(is_open=False)
    return len(closed_ids)


def active_users() -> list:
    return list(User.objects.filter(is_active=True))


@transaction.atomic
def _record_source_results(run: Run, outcomes: list[FetchOutcome]) -> None:
    now = timezone.now()
    RunSource.objects.bulk_create(
        [
            RunSource(
                run=run,
                source_id=outcome.source.pk,
                label=outcome.source.label or str(outcome.source),
                kind=outcome.source.kind,
                ok=outcome.ok,
                postings=len(outcome.postings),
                error=outcome.error,
                duration_ms=outcome.duration_ms,
            )
            for outcome in outcomes
        ]
    )
    # Location-expanded clones share their parent's id, so keep one row per id —
    # bulk_update on duplicates would write the same row twice with whichever
    # outcome happened to be last.
    by_id: dict[int, Source] = {}
    for outcome in outcomes:
        if outcome.source.pk is None:
            continue
        source = by_id.setdefault(outcome.source.pk, outcome.source)
        source.last_run_at = now
        # A single failing city must not mark the whole source healthy.
        if not outcome.ok or source.last_status != "error":
            source.last_status = "ok" if outcome.ok else "error"
            source.last_error = outcome.error

    if by_id:
        Source.objects.bulk_update(
            list(by_id.values()), ["last_run_at", "last_status", "last_error"]
        )


def execute_run(*, triggered_by: str = "schedule", today: date | None = None) -> Run:
    """Perform one complete run and return its record.

    Synchronous and Celery-free so it can be tested directly and called from a
    management command. `run_now` is the task that wraps it.
    """
    run = Run.objects.create(triggered_by=triggered_by, status=RunStatus.RUNNING)
    today = today or timezone.localdate()

    try:
        sources = expand_location_sources(enabled_sources())
        run.sources_total = len(sources)

        # --- Phase 1: fetch and store globally, once per feed ---------------
        outcomes = [fetch_source(source) for source in sources]
        _record_source_results(run, outcomes)

        succeeded = [outcome.source for outcome in outcomes if outcome.ok]
        run.sources_failed = len(outcomes) - len(succeeded)

        postings: list[RawPosting] = []
        for outcome in outcomes:
            postings.extend(outcome.postings)
        run.postings_fetched = len(postings)

        merged = reconcile(postings)

        before = Job.objects.count()
        jobs, seen_keys = store_postings(merged)
        run.jobs_created = Job.objects.count() - before
        run.jobs_updated = len(jobs) - run.jobs_created

        run.jobs_closed = close_missing_jobs(seen_keys, succeeded)

        # --- Phase 2: score per user ---------------------------------------
        # Every open job, not only the ones touched this run: a user who changed
        # their profile since yesterday needs the rest rescored too.
        open_jobs = list(Job.objects.filter(closed_at__isnull=True))
        users = active_users()
        scored = 0
        for user in users:
            try:
                score_jobs_for_user(user, open_jobs, today=today)
                scored += 1
            except Exception:
                logger.exception("scoring failed for user %s", user.pk)
        run.users_scored = scored

        if run.sources_failed == 0:
            run.status = RunStatus.SUCCESS
        elif run.sources_failed < run.sources_total:
            run.status = RunStatus.PARTIAL
        else:
            run.status = RunStatus.FAILED

    except Exception as exc:
        logger.exception("run %s failed", run.pk)
        run.status = RunStatus.FAILED
        run.error = f"{exc.__class__.__name__}: {exc}"

    run.finished_at = timezone.now()
    run.save()

    logger.info(
        "run %s %s in %.1fs: %s sources (%s failed), %s postings, "
        "%s new, %s updated, %s closed, %s users scored",
        run.pk,
        run.status,
        run.duration_seconds or 0,
        run.sources_total,
        run.sources_failed,
        run.postings_fetched,
        run.jobs_created,
        run.jobs_updated,
        run.jobs_closed,
        run.users_scored,
    )
    return run


def last_successful_run() -> Run | None:
    """The most recent run that actually produced data.

    Attempted runs do not count: a run that failed outright tells a monitor
    nothing reassuring, and `last_run_at` going green on a failure is exactly
    the silent-failure mode this system is supposed to avoid.
    """
    return (
        Run.objects.filter(status__in=[RunStatus.SUCCESS, RunStatus.PARTIAL])
        .order_by("-started_at")
        .first()
    )
