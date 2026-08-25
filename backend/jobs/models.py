"""The global/per-user split, which is the heart of the schema.

    A job posting is **global**. A score is **per user**.

Careem's "Associate Software Engineer" is one posting in the world. If ten users
watch Careem's board, the system fetches it once, stores one `Job` row, and
computes ten `UserJob` rows — one per user, each with that user's score, tier,
status and notes.

The naive alternative — copying every posting per user — means fetching the same
feed ten times and hammering job boards ten times harder for no reason.
"""

from __future__ import annotations

import hashlib

from django.conf import settings
from django.contrib.postgres.indexes import GinIndex
from django.contrib.postgres.search import SearchVector, SearchVectorField
from django.db import models
from django.db.models import Q
from django.utils import timezone

from sources.base import ADDITIVE_KINDS, SourceSpec


class SourceKind(models.TextChoices):
    GREENHOUSE = "greenhouse", "Greenhouse"
    LEVER = "lever", "Lever"
    WORKABLE = "workable", "Workable"
    BREEZY = "breezy", "Breezy"
    ASHBY = "ashby", "Ashby"
    SMARTRECRUITERS = "smartrecruiters", "SmartRecruiters"
    RECRUITEE = "recruitee", "Recruitee"
    WORKDAY = "workday", "Workday"
    RSS = "rss", "RSS / Atom"
    JOBSPY = "jobspy", "Job boards (jobspy)"


class ApplicationStatus(models.TextChoices):
    NOT_STARTED = "not_started", "Not started"
    RESEARCHING = "researching", "Researching"
    CV_TAILORED = "cv_tailored", "CV tailored"
    APPLIED = "applied", "Applied"
    ASSESSMENT = "assessment", "Assessment"
    INTERVIEWING = "interviewing", "Interviewing"
    OFFER = "offer", "Offer"
    REJECTED = "rejected", "Rejected"
    SKIPPED = "skipped", "Skipped"


# --- Global: shared by everyone, written by the run -----------------------


class Source(models.Model):
    """A feed to poll.

    `owner IS NULL` means a shared source every user gets. A set owner means the
    source is private to that user. Either way a given feed is fetched **once**
    per run — adding a user must not add outbound requests.
    """

    kind = models.CharField(max_length=32, choices=SourceKind.choices)
    slug = models.CharField(max_length=200, blank=True)
    company = models.CharField(max_length=200, blank=True)
    host = models.CharField(max_length=200, blank=True)
    tenant = models.CharField(max_length=200, blank=True)
    site = models.CharField(max_length=200, blank=True)
    url = models.URLField(max_length=500, blank=True)
    label = models.CharField(max_length=200, blank=True)
    location_hint = models.CharField(max_length=200, blank=True)
    config = models.JSONField(default=dict, blank=True)

    enabled = models.BooleanField(default=True)

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="sources",
        help_text="Null means shared with every user.",
    )

    last_run_at = models.DateTimeField(null=True, blank=True)
    last_status = models.CharField(max_length=32, blank=True)
    last_error = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("kind", "slug", "label")
        indexes = [
            models.Index(fields=["enabled", "kind"], name="source_enabled_kind"),
            models.Index(fields=["owner"], name="source_owner"),
        ]

    def __str__(self) -> str:
        return self.spec.display_name

    @property
    def spec(self) -> SourceSpec:
        """The framework-free view an adapter consumes."""
        return SourceSpec(
            kind=self.kind,
            slug=self.slug,
            company=self.company,
            host=self.host,
            tenant=self.tenant,
            site=self.site,
            url=self.url,
            label=self.label,
            location_hint=self.location_hint,
            config=self.config if isinstance(self.config, dict) else {},
        )

    @property
    def is_shared(self) -> bool:
        return self.owner_id is None

    @property
    def is_additive(self) -> bool:
        """Absence from this source's results proves nothing about closure."""
        return self.kind in ADDITIVE_KINDS


class RunStatus(models.TextChoices):
    RUNNING = "running", "Running"
    SUCCESS = "success", "Success"
    PARTIAL = "partial", "Partial — some sources failed"
    FAILED = "failed", "Failed"


class Run(models.Model):
    """One execution of the daily job, scheduled or manual.

    Kept forever: "Contour has failed every day for a week" should be visible in
    the UI rather than buried in logs.
    """

    started_at = models.DateTimeField(default=timezone.now)
    finished_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=16, choices=RunStatus.choices, default=RunStatus.RUNNING)
    triggered_by = models.CharField(max_length=32, default="schedule")

    sources_total = models.PositiveIntegerField(default=0)
    sources_failed = models.PositiveIntegerField(default=0)
    postings_fetched = models.PositiveIntegerField(default=0)
    jobs_created = models.PositiveIntegerField(default=0)
    jobs_updated = models.PositiveIntegerField(default=0)
    jobs_closed = models.PositiveIntegerField(default=0)
    users_scored = models.PositiveIntegerField(default=0)

    error = models.TextField(blank=True)

    class Meta:
        ordering = ("-started_at",)
        indexes = [
            # `last_run_at` must reflect only successful runs, so the lookup is
            # by status as well as time.
            models.Index(fields=["-started_at", "status"], name="run_recent_by_status"),
        ]

    def __str__(self) -> str:
        return f"Run {self.pk} ({self.status})"

    @property
    def duration_seconds(self) -> float | None:
        if self.finished_at is None:
            return None
        return (self.finished_at - self.started_at).total_seconds()

    @property
    def succeeded(self) -> bool:
        """Partial counts as success: most sources delivered.

        A run where one board was down still produced usable data, and treating
        it as a failure would make the staleness warning cry wolf.
        """
        return self.status in {RunStatus.SUCCESS, RunStatus.PARTIAL}


class RunSource(models.Model):
    """What one source did during one run.

    A partial failure must be visible, not silent (FR13). The list looking
    healthy while half the sources are down is the most misleading thing this
    system could do.
    """

    run = models.ForeignKey(Run, on_delete=models.CASCADE, related_name="source_results")
    source = models.ForeignKey(
        "Source", on_delete=models.SET_NULL, null=True, related_name="run_results"
    )

    #: Kept as text so a deleted source still reads sensibly in old runs.
    label = models.CharField(max_length=200)
    kind = models.CharField(max_length=32)

    ok = models.BooleanField(default=False)
    postings = models.PositiveIntegerField(default=0)
    error = models.TextField(blank=True)
    duration_ms = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ("-ok", "label")
        indexes = [models.Index(fields=["run", "ok"], name="runsource_run_ok")]

    def __str__(self) -> str:
        return f"{self.label}: {'ok' if self.ok else self.error[:40]}"


class Job(models.Model):
    """One row per real-world posting, shared by every user.

    No score, no status, no user foreign key — those are not properties of a
    posting, they are properties of a person's relationship to it.
    """

    key = models.CharField(max_length=255, unique=True)

    #: Which board this posting came from — an ATS vendor for a company feed,
    #: or the individual job board for a scrape ("linkedin", "indeed"). Not
    #: constrained to `SourceKind`: a single jobspy *source* produces postings
    #: from several boards, and filing them all under the adapter's name would
    #: put the name of a Python library in front of the user.
    source = models.CharField(max_length=32, db_index=True)
    #: The specific feed, e.g. "greenhouse:careem". Closed-detection scopes by
    #: this rather than by `source`, so one failing board cannot close another
    #: board's jobs just because they share a vendor.
    source_ref = models.CharField(max_length=255, blank=True, db_index=True)
    company = models.CharField(max_length=255)
    title = models.CharField(max_length=500)
    location = models.CharField(max_length=255, blank=True)
    url = models.URLField(max_length=1000, blank=True)
    description = models.TextField(blank=True)

    #: Null is a real answer, common with scraped results. Never invent one.
    posted_at = models.DateField(null=True, blank=True)
    #: Which source the date came from, when the winning source had none.
    date_from = models.CharField(max_length=32, blank=True)

    first_seen = models.DateTimeField(default=timezone.now)
    last_seen = models.DateTimeField(default=timezone.now)
    closed_at = models.DateTimeField(null=True, blank=True)
    seen_count = models.PositiveIntegerField(default=1)

    #: Other sources this posting was also found on.
    also_seen_on = models.JSONField(default=list, blank=True)

    #: Maintained by Postgres, so a bulk upsert cannot leave it stale — which is
    #: exactly what happens with a column the application has to remember to set.
    search_vector = models.GeneratedField(
        expression=SearchVector("title", "company", "location", config="english"),
        output_field=SearchVectorField(),
        db_persist=True,
    )

    class Meta:
        ordering = ("-last_seen",)
        indexes = [
            GinIndex(fields=["search_vector"], name="job_search_vector"),
            # The run's hot query: everything still open, most recent first.
            models.Index(
                fields=["-last_seen"],
                condition=Q(closed_at__isnull=True),
                name="job_open_by_last_seen",
            ),
            models.Index(fields=["source"], name="job_source"),
            models.Index(fields=["company"], name="job_company"),
        ]

    def __str__(self) -> str:
        return f"{self.company} — {self.title}"

    @property
    def is_open(self) -> bool:
        return self.closed_at is None

    @staticmethod
    def build_key(
        source: str, company: str, external_id: str | None, title: str = "", location: str = ""
    ) -> str:
        """A stable identity for a posting.

        `{source}:{company}:{external_id}` when the source gives an id. Without
        one, a SHA1 of company|title|location — deterministic, so the same
        posting produces the same key on every run, which is what makes
        closed-detection and status persistence work at all.
        """
        source = (source or "").strip().lower()
        company = (company or "").strip().lower()
        if external_id:
            return f"{source}:{company}:{str(external_id).strip().lower()}"[:255]

        digest = hashlib.sha1(
            f"{company}|{title.strip().lower()}|{location.strip().lower()}".encode()
        ).hexdigest()
        return f"{source}:{company}:{digest}"[:255]


# --- Per-user: private, never visible across users ------------------------


class UserJob(models.Model):
    """One user's relationship to one posting.

    Holds everything that differs between people looking at the same job: the
    score their profile produces, and the application state they have recorded.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="user_jobs"
    )
    job = models.ForeignKey(Job, on_delete=models.CASCADE, related_name="user_jobs")

    score = models.IntegerField(default=0)
    tier = models.CharField(max_length=16, blank=True)
    detail = models.JSONField(default=dict, blank=True)
    flags = models.JSONField(default=list, blank=True)

    #: User data. The run must never overwrite these.
    status = models.CharField(
        max_length=32, choices=ApplicationStatus.choices, default=ApplicationStatus.NOT_STARTED
    )
    notes = models.TextField(blank=True)
    pinned = models.BooleanField(default=False)

    #: When to email a follow-up nudge. Cleared to null has no special meaning
    #: beyond "no reminder set" — the run never touches this, same as `status`.
    remind_at = models.DateTimeField(null=True, blank=True)
    #: Set once the sweep has emailed this reminder, so it is never sent twice.
    #: Reset to null whenever `remind_at` is changed to a new value.
    reminder_sent_at = models.DateTimeField(null=True, blank=True)

    first_seen_by_user = models.DateTimeField(default=timezone.now)
    #: True only on the first run this job appeared in *for this user*. A job
    #: that is weeks old globally is still new to someone who just registered.
    is_new = models.BooleanField(default=True)
    tracking_days = models.PositiveIntegerField(default=0)

    #: Denormalised from `job.closed_at`, maintained by the run.
    #:
    #: The dashboard's default query is "my open jobs, by score", and a partial
    #: index is exactly the right tool — but Postgres cannot index a condition
    #: that lives on another table, and Django rejects a joined reference in an
    #: index condition outright. One boolean here buys the index.
    is_open = models.BooleanField(default=True)

    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-score", "-first_seen_by_user")
        constraints = [
            models.UniqueConstraint(fields=["user", "job"], name="userjob_unique_user_job"),
        ]
        indexes = [
            # The dashboard's default query, and nothing else.
            models.Index(
                fields=["user", "-score"],
                condition=Q(is_open=True),
                name="userjob_open_by_score",
            ),
            models.Index(fields=["user", "status"], name="userjob_user_status"),
            models.Index(fields=["user", "is_new"], name="userjob_user_is_new"),
            GinIndex(fields=["flags"], name="userjob_flags"),
            # The sweep's only query: reminders that are due and not yet sent.
            models.Index(
                fields=["remind_at"],
                condition=Q(reminder_sent_at__isnull=True),
                name="userjob_pending_reminder",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.user_id}:{self.job_id} ({self.score})"

    @property
    def has_user_data(self) -> bool:
        """Whether the user has invested anything in this row.

        A job that stops matching their filters is deleted — unless they have
        marked it Applied or written a note, in which case throwing it away would
        destroy the one thing here that cannot be re-fetched.
        """
        return (
            self.status != ApplicationStatus.NOT_STARTED or bool(self.notes.strip()) or self.pinned
        )


class UserJobStatusEvent(models.Model):
    """One recorded transition of a `UserJob.status`.

    Written explicitly by the API layer (see `jobs.services.record_status_change`)
    whenever a user's action changes status — never by a signal. `QuerySet.update()`
    (used by bulk status changes) does not fire signals, and the daily run's bulk
    writes never touch `status` at all, so a signal would either miss bulk changes
    or need the same special-casing this plan already needs anyway.
    """

    user_job = models.ForeignKey(UserJob, on_delete=models.CASCADE, related_name="status_history")
    from_status = models.CharField(max_length=32, choices=ApplicationStatus.choices, blank=True)
    to_status = models.CharField(max_length=32, choices=ApplicationStatus.choices)
    changed_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ("-changed_at",)
        indexes = [
            models.Index(fields=["user_job", "-changed_at"], name="statusevent_userjob_changed"),
        ]

    def __str__(self) -> str:
        return f"{self.user_job_id}: {self.from_status or '—'} → {self.to_status}"
