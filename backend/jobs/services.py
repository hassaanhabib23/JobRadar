"""Storing postings and scoring them per user.

Two phases, deliberately separate:

    Phase 1 — fetch and store globally, once per feed.
    Phase 2 — score per user, from what phase 1 stored.

Keeping them apart is what holds outbound traffic constant as users are added.
The full run lifecycle — Celery orchestration, closed-detection, run records —
arrives in milestone 6; these are the primitives it will call.
"""

from __future__ import annotations

import logging
from datetime import date

from django.db import transaction
from django.utils import timezone

from jobs.models import ApplicationStatus, Job, UserJob
from scoring.domain import RawPosting
from scoring.scorer import evaluate_job
from users.models import Profile

logger = logging.getLogger(__name__)


def store_postings(postings: list[RawPosting]) -> tuple[list[Job], set[str]]:
    """Upsert postings into the global `Job` table.

    Returns the affected jobs and the set of keys seen, which closed-detection
    needs in milestone 6 — an explicit key set rather than a timestamp, because
    timestamps break when two runs share a clock second.
    """
    now = timezone.now()
    seen_keys: set[str] = set()
    stored: list[Job] = []

    for posting in postings:
        key = Job.build_key(
            posting.source, posting.company, posting.external_id, posting.title, posting.location
        )
        seen_keys.add(key)
        stored.append(_upsert(posting, key, now))

    return stored, seen_keys


def _upsert(posting: RawPosting, key: str, now) -> Job:
    existing = Job.objects.filter(key=key).first()

    if existing is None:
        return Job.objects.create(
            key=key,
            source=posting.source,
            source_ref=posting.source_ref,
            company=posting.company,
            title=posting.title,
            location=posting.location,
            url=posting.url,
            description=posting.description,
            posted_at=posting.posted_at,
            date_from=posting.date_from or "",
            also_seen_on=list(posting.also_seen_on),
            first_seen=now,
            last_seen=now,
            seen_count=1,
        )

    existing.title = posting.title
    existing.company = posting.company
    existing.source_ref = posting.source_ref or existing.source_ref
    existing.location = posting.location or existing.location
    existing.url = posting.url or existing.url
    existing.description = posting.description or existing.description
    existing.also_seen_on = list(posting.also_seen_on) or existing.also_seen_on
    existing.last_seen = now
    existing.seen_count = existing.seen_count + 1
    # Seeing it again means it is open, whatever we concluded last time.
    existing.closed_at = None

    # Never overwrite a known date with an empty one. A source that stops
    # sending dates must not erase what a better source already told us.
    if posting.posted_at is not None:
        existing.posted_at = posting.posted_at
        existing.date_from = posting.date_from or ""

    existing.save(
        update_fields=[
            "title",
            "company",
            "location",
            "url",
            "description",
            "also_seen_on",
            "last_seen",
            "seen_count",
            "closed_at",
            "posted_at",
            "date_from",
        ]
    )
    return existing


@transaction.atomic
def score_jobs_for_user(user, jobs: list[Job], *, today: date | None = None) -> dict[str, int]:
    """Create or refresh this user's `UserJob` rows.

    Score, tier, detail and flags are recomputed every run. `status`, `notes` and
    `pinned` are never touched — they are the only things here that cannot be
    re-fetched.
    """
    profile, _ = Profile.objects.get_or_create(user=user)
    domain_profile = profile.to_domain()
    now = timezone.now()
    today = today or now.date()

    existing = {
        user_job.job_id: user_job for user_job in UserJob.objects.filter(user=user, job__in=jobs)
    }

    counts = {"created": 0, "updated": 0, "filtered": 0, "removed": 0}

    for job in jobs:
        user_job = existing.get(job.pk)
        tracked_days = _tracked_days(user_job, now)

        outcome = evaluate_job(
            _to_posting(job), domain_profile, tracked_days=tracked_days, today=today
        )

        if outcome.result is None:
            counts["filtered"] += 1
            if user_job is not None and not user_job.has_user_data:
                # Nothing invested in it, so it can go. If they had marked it
                # Applied, deleting it would destroy their own record.
                user_job.delete()
                counts["removed"] += 1
            continue

        result = outcome.result

        if user_job is None:
            UserJob.objects.create(
                user=user,
                job=job,
                score=result.score,
                tier=result.tier,
                detail=result.detail.as_dict(),
                flags=list(result.flags),
                first_seen_by_user=now,
                # New *to them*: a job that is weeks old globally is still new to
                # someone who registered yesterday, which is correct.
                is_new=True,
                tracking_days=0,
                is_open=job.closed_at is None,
            )
            counts["created"] += 1
            continue

        user_job.score = result.score
        user_job.tier = result.tier
        user_job.detail = result.detail.as_dict()
        user_job.flags = list(result.flags)
        user_job.tracking_days = tracked_days
        user_job.is_new = False
        user_job.is_open = job.closed_at is None
        user_job.save(
            update_fields=[
                "score",
                "tier",
                "detail",
                "flags",
                "tracking_days",
                "is_new",
                "is_open",
                "updated_at",
            ]
        )
        counts["updated"] += 1

    return counts


def _tracked_days(user_job: UserJob | None, now) -> int:
    if user_job is None:
        return 0
    return max(0, (now - user_job.first_seen_by_user).days)


def _to_posting(job: Job) -> RawPosting:
    """The framework-free view the scorer works with."""
    return RawPosting(
        source=job.source,
        source_ref=job.source_ref,
        company=job.company,
        title=job.title,
        location=job.location,
        url=job.url,
        posted_at=job.posted_at,
        description=job.description,
        also_seen_on=tuple(job.also_seen_on or ()),
        date_from=job.date_from or None,
    )


def statuses() -> list[dict[str, str]]:
    """Status choices with human labels, so the frontend never hardcodes them."""
    return [{"value": value, "label": label} for value, label in ApplicationStatus.choices]
