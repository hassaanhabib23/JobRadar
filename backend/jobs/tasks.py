"""Celery tasks.

Three processes must be running for this to work at all: `web`, `worker` and
`beat`. Deploying only `web` is the single most common way this stops working,
and it fails silently — the dashboard keeps serving yesterday's data.
"""

from __future__ import annotations

import logging
from datetime import timedelta

from celery import shared_task
from celery.signals import worker_ready
from django.utils import timezone

logger = logging.getLogger(__name__)

#: Held for the duration of a run so a manual "Run now" during the scheduled run
#: cannot double-fetch. Longer than any plausible run, short enough that a
#: crashed worker does not block tomorrow's.
RUN_LOCK_KEY = "jobradar:run:lock"
RUN_LOCK_TIMEOUT = 60 * 30

#: How stale the last successful run must be before startup fires a catch-up.
CATCH_UP_AFTER = timedelta(hours=24)


def _lock():
    """The shared cache, which is Redis outside tests.

    This must not be a per-process cache. The worker runs several forks, so a
    local-memory lock is invisible to the others and two triggers double-fetch
    every source — which is exactly what happened before this was changed.
    """
    from django.core.cache import cache

    return cache


@shared_task(bind=True, name="jobs.run_now")
def run_now(self, triggered_by: str = "schedule") -> dict:
    """Execute one run, unless one is already in flight.

    Two overlapping triggers must result in one run, not two — a manual trigger
    landing during the scheduled run would otherwise double every fetch.
    """
    from jobs.runner import execute_run

    cache = _lock()
    # `add` is atomic: it only succeeds if the key does not already exist.
    acquired = cache.add(RUN_LOCK_KEY, self.request.id or "manual", RUN_LOCK_TIMEOUT)
    if not acquired:
        logger.info("run skipped: another run holds the lock")
        return {"skipped": True, "reason": "a run is already in progress"}

    try:
        run = execute_run(triggered_by=triggered_by)
    finally:
        cache.delete(RUN_LOCK_KEY)

    return {
        "skipped": False,
        "run_id": run.pk,
        "status": run.status,
        "jobs_created": run.jobs_created,
        "jobs_closed": run.jobs_closed,
        "sources_failed": run.sources_failed,
    }


@shared_task(name="jobs.catch_up_if_stale")
def catch_up_if_stale() -> dict:
    """Fire a run if the last successful one is older than the schedule.

    Beat does not backfill. If the machine was down at 09:00 that run simply
    never happens, and a weekend of downtime becomes a silent gap in the data
    with nothing in the UI to suggest anything was missed.
    """
    from jobs.runner import last_successful_run

    last = last_successful_run()
    if last is not None and timezone.now() - last.started_at < CATCH_UP_AFTER:
        return {"triggered": False, "last_run_at": last.started_at.isoformat()}

    logger.info("last successful run is stale or absent — starting a catch-up run")
    run_now.delay(triggered_by="catch-up")
    return {"triggered": True, "last_run_at": last.started_at.isoformat() if last else None}


@worker_ready.connect
def _schedule_catch_up_on_startup(**kwargs: object) -> None:
    """Check for a missed run as soon as a worker comes up."""
    from django.conf import settings

    if getattr(settings, "DISABLE_STARTUP_CATCH_UP", False):
        return
    try:
        catch_up_if_stale.delay()
    except Exception:
        logger.exception("could not schedule the startup catch-up check")
