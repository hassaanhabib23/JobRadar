# Application Status History & Follow-up Reminders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record every change to a `UserJob`'s application status as a timestamped history event, and let a user set a "remind me" date on a job that triggers a follow-up email when it comes due.

**Architecture:** Two additive backend features layered onto the existing `UserJob` model — no change to the existing 9-stage `ApplicationStatus` enum, which already covers the lifecycle (Not started → … → Offer/Rejected/Skipped). A new `UserJobStatusEvent` model logs transitions, written explicitly at the two call sites that mutate `status` (`JobViewSet.partial_update` and `bulk_status`) rather than via a signal — `QuerySet.update()` doesn't fire signals, and the daily run's bulk writes never touch `status` at all, so signal-based logging would either miss `bulk_status` or need special-casing anyway. Reminders reuse the existing `notifications` app's send-email pattern (`send.py` renders a template and sends; `tasks.py` decides when) with a new Celery-beat sweep in `jobs/tasks.py` that finds due reminders, marks them sent, and hands off to a new `notifications.send_job_reminders` task.

**Tech Stack:** Django 5.2 / DRF / Celery + django-celery-beat / pytest-django / factory-free `user_factory` fixture — React + TanStack Query + MSW/vitest/testing-library, camelCase wire format via `djangorestframework-camel-case`.

**Spec:** No external spec document — this plan was scoped directly against the current codebase (see file references throughout) after confirming the status *lifecycle* already exists (`backend/jobs/models.py:41-50`, `frontend/src/dashboard/StatusSelect.tsx`) and only *history* and *reminders* are missing.

## Global Constraints

- Never let the daily run touch `status`, `notes`, `pinned`, `remind_at`, or `reminder_sent_at` — those are user-owned fields (`backend/jobs/models.py:323`). `score_jobs_for_user` in `jobs/services.py` must remain untouched by this plan.
- Every `UserJob` write path that changes `status` must produce exactly one `UserJobStatusEvent` per row whose status actually changed (a same-value write logs nothing).
- All outbound email goes through `notifications/send.py::send_email` from a Celery task, never inline from a request thread (`backend/notifications/tasks.py:1-9`).
- Wire format is snake_case in Django, camelCase in JSON (drf-spectacular's camelize contrib, already configured) — new fields follow the same automatic conversion; no manual camelCasing needed.
- Every list/detail response stays scoped to `request.user` — a status-history or reminder read must 404 (not 403) for another user's `UserJob` id (`backend/jobs/views.py:1-6`).

---

## File Structure

| File | Responsibility |
|---|---|
| `backend/jobs/models.py` | `UserJob.remind_at` / `reminder_sent_at` fields; new `UserJobStatusEvent` model |
| `backend/jobs/migrations/0005_status_history_and_reminders.py` | Schema for the above |
| `backend/jobs/services.py` | `record_status_change()` — the one place a status transition becomes a logged event |
| `backend/jobs/serializers.py` | `UserJobStatusEventSerializer`; `remind_at` added to `JobSerializer`/`JobUpdateSerializer` |
| `backend/jobs/views.py` | Wire `record_status_change` into `partial_update` / `bulk_status`; new `status_history` action |
| `backend/jobs/tasks.py` | `jobs.send_due_reminders` — the periodic sweep |
| `backend/notifications/tasks.py` | `notifications.send_job_reminders` — the actual send |
| `backend/notifications/templates/notifications/job_reminder.{txt,html}` | The reminder email |
| `backend/config/settings/base.py` | Beat schedule entry for the sweep |
| `backend/jobs/admin.py` | Surface `remind_at` / status history in the admin |
| `frontend/src/api/types.ts` | `Job.remindAt`; new `StatusEvent` type |
| `frontend/src/api/queries.ts` | `useStatusHistory`; `JobPatch.remindAt` |
| `frontend/src/test/server.ts` | Mock `status_history` endpoint + `remindAt` on the mock job |
| `frontend/src/dashboard/StatusTimeline.tsx` | Renders the history list |
| `frontend/src/dashboard/ReminderPicker.tsx` | Date input to set/clear `remind_at` |
| `frontend/src/routes/JobDetail.tsx` | Mounts the two new panels |

---

### Task 1: Backend models — status history + reminder fields

**Files:**
- Modify: `backend/jobs/models.py:306-377` (the `UserJob` class)
- Create: `backend/jobs/migrations/0005_status_history_and_reminders.py`
- Modify: `backend/jobs/admin.py:59-65`
- Test: `backend/tests/test_status_history_models.py`

**Interfaces:**
- Produces: `UserJob.remind_at: datetime | None`, `UserJob.reminder_sent_at: datetime | None`; `UserJobStatusEvent(user_job, from_status, to_status, changed_at)` with reverse accessor `user_job.status_history` (ordered `-changed_at`).

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_status_history_models.py
from __future__ import annotations

import pytest
from django.utils import timezone

from jobs.models import ApplicationStatus, Job, UserJob, UserJobStatusEvent

pytestmark = pytest.mark.django_db


@pytest.fixture
def user_job(user_factory):
    user = user_factory()
    job = Job.objects.create(key="greenhouse:careem:1", source="greenhouse", company="Careem", title="SWE")
    return UserJob.objects.create(user=user, job=job)


def test_userjob_has_reminder_fields(user_job):
    assert user_job.remind_at is None
    assert user_job.reminder_sent_at is None


def test_status_event_records_a_transition(user_job):
    event = UserJobStatusEvent.objects.create(
        user_job=user_job, from_status=ApplicationStatus.NOT_STARTED, to_status=ApplicationStatus.APPLIED
    )
    assert event.changed_at is not None
    assert list(user_job.status_history.all()) == [event]


def test_status_history_orders_newest_first(user_job):
    older = UserJobStatusEvent.objects.create(
        user_job=user_job, from_status="", to_status=ApplicationStatus.RESEARCHING,
        changed_at=timezone.now() - timezone.timedelta(days=1),
    )
    newer = UserJobStatusEvent.objects.create(
        user_job=user_job, from_status=ApplicationStatus.RESEARCHING, to_status=ApplicationStatus.APPLIED,
    )
    assert list(user_job.status_history.all()) == [newer, older]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose -f docker-compose.yml -f docker-compose.dev.yml run --rm web pytest tests/test_status_history_models.py -v`
Expected: FAIL with `ImportError: cannot import name 'UserJobStatusEvent'`

- [ ] **Step 3: Add the model fields and the new model**

In `backend/jobs/models.py`, inside `class UserJob`, add after the `pinned` field (line 328):

```python
    pinned = models.BooleanField(default=False)

    #: When to email a follow-up nudge. Cleared to null has no special meaning
    #: beyond "no reminder set" — the run never touches this, same as `status`.
    remind_at = models.DateTimeField(null=True, blank=True)
    #: Set once the sweep has emailed this reminder, so it is never sent twice.
    #: Reset to null whenever `remind_at` is changed to a new value.
    reminder_sent_at = models.DateTimeField(null=True, blank=True)
```

Add an index to `UserJob.Meta.indexes` (after the `userjob_flags` entry, line 360):

```python
            GinIndex(fields=["flags"], name="userjob_flags"),
            # The sweep's only query: reminders that are due and not yet sent.
            models.Index(
                fields=["remind_at"],
                condition=Q(reminder_sent_at__isnull=True),
                name="userjob_pending_reminder",
            ),
```

Add the new model at the end of the file, after `UserJob` (after line 377):

```python


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
```

- [ ] **Step 4: Generate and apply the migration**

Run: `docker compose -f docker-compose.yml -f docker-compose.dev.yml run --rm web python manage.py makemigrations jobs`

Verify the generated file is named `0005_...py`, depends on `0004_alter_job_source`, and contains two `AddField` ops, one `AddIndex`, one `CreateModel`, one more `AddIndex` for the new model's index. Rename it to `0005_status_history_and_reminders.py` if Django's auto-generated name differs.

- [ ] **Step 5: Register the new model in admin**

In `backend/jobs/admin.py`, add an inline and extend `UserJobAdmin`:

```python
class StatusEventInline(admin.TabularInline):
    model = UserJobStatusEvent
    extra = 0
    can_delete = False
    readonly_fields = ("from_status", "to_status", "changed_at")


@admin.register(UserJob)
class UserJobAdmin(admin.ModelAdmin):
    list_display = ("user", "job", "score", "tier", "status", "remind_at", "is_new", "is_open")
    list_filter = ("tier", "status", "is_new", "is_open")
    search_fields = ("user__email", "job__title", "job__company")
    readonly_fields = ("score", "tier", "detail", "flags", "tracking_days")
    inlines = (StatusEventInline,)
```

and import `UserJobStatusEvent` alongside the existing model imports at the top of the file.

- [ ] **Step 6: Run test to verify it passes**

Run: `docker compose -f docker-compose.yml -f docker-compose.dev.yml run --rm web pytest tests/test_status_history_models.py -v`
Expected: PASS (3 tests)

- [ ] **Step 7: Commit**

```bash
git add backend/jobs/models.py backend/jobs/migrations/0005_status_history_and_reminders.py backend/jobs/admin.py backend/tests/test_status_history_models.py
git commit -m "feat: add UserJobStatusEvent model and reminder fields on UserJob"
```

---

### Task 2: Log status transitions on write

**Files:**
- Modify: `backend/jobs/services.py` (add `record_status_change`, after `statuses()` at line 209-211)
- Modify: `backend/jobs/views.py:125-150` (`partial_update`, `bulk_status`)
- Test: `backend/tests/test_status_history_api.py`

**Interfaces:**
- Consumes: `UserJobStatusEvent` from Task 1.
- Produces: `record_status_change(user_job: UserJob, *, from_status: str, to_status: str) -> UserJobStatusEvent | None` — used by Task 3's `status_history` action indirectly (it just reads `status_history`, so no direct dependency, but the event rows it reads are created here).

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_status_history_api.py
from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from jobs.models import ApplicationStatus, Job, UserJob, UserJobStatusEvent

pytestmark = pytest.mark.django_db


@pytest.fixture
def authed_client(api_client: APIClient, user_factory):
    user = user_factory()
    api_client.force_authenticate(user=user)
    return api_client, user


def _job(key="greenhouse:careem:1", **overrides):
    return Job.objects.create(key=key, source="greenhouse", company="Careem", title="SWE", **overrides)


class TestPartialUpdateLogsHistory:
    def test_changing_status_creates_one_event(self, authed_client):
        client, user = authed_client
        user_job = UserJob.objects.create(user=user, job=_job())

        response = client.patch(f"/api/jobs/{user_job.pk}/", {"status": "applied"}, format="json")

        assert response.status_code == 200
        events = list(UserJobStatusEvent.objects.filter(user_job=user_job))
        assert len(events) == 1
        assert events[0].from_status == ApplicationStatus.NOT_STARTED
        assert events[0].to_status == ApplicationStatus.APPLIED

    def test_writing_the_same_status_logs_nothing(self, authed_client):
        client, user = authed_client
        user_job = UserJob.objects.create(user=user, job=_job(), status=ApplicationStatus.APPLIED)

        client.patch(f"/api/jobs/{user_job.pk}/", {"status": "applied"}, format="json")

        assert UserJobStatusEvent.objects.filter(user_job=user_job).count() == 0

    def test_updating_notes_only_logs_nothing(self, authed_client):
        client, user = authed_client
        user_job = UserJob.objects.create(user=user, job=_job())

        client.patch(f"/api/jobs/{user_job.pk}/", {"notes": "referred by a friend"}, format="json")

        assert UserJobStatusEvent.objects.filter(user_job=user_job).count() == 0


class TestBulkStatusLogsHistory:
    def test_logs_one_event_per_changed_row(self, authed_client):
        client, user = authed_client
        first = UserJob.objects.create(user=user, job=_job("greenhouse:careem:1"))
        second = UserJob.objects.create(
            user=user, job=_job("greenhouse:careem:2"), status=ApplicationStatus.APPLIED
        )

        response = client.post(
            "/api/jobs/bulk_status/", {"ids": [first.pk, second.pk], "status": "applied"}, format="json"
        )

        assert response.status_code == 200
        # `second` was already "applied" — no-op, no event.
        assert UserJobStatusEvent.objects.filter(user_job=second).count() == 0
        assert UserJobStatusEvent.objects.filter(user_job=first).count() == 1

    def test_does_not_log_for_another_users_rows(self, authed_client, user_factory):
        client, _user = authed_client
        stranger = user_factory()
        theirs = UserJob.objects.create(user=stranger, job=_job())

        client.post("/api/jobs/bulk_status/", {"ids": [theirs.pk], "status": "applied"}, format="json")

        assert UserJobStatusEvent.objects.filter(user_job=theirs).count() == 0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose -f docker-compose.yml -f docker-compose.dev.yml run --rm web pytest tests/test_status_history_api.py -v`
Expected: FAIL — `record_status_change` doesn't exist yet, so no events are ever created; `test_changing_status_creates_one_event` fails on the `len(events) == 1` assertion (0 events).

- [ ] **Step 3: Implement `record_status_change`**

In `backend/jobs/services.py`, add after `statuses()` (end of file):

```python
def record_status_change(user_job: UserJob, *, from_status: str, to_status: str) -> UserJobStatusEvent | None:
    """Log one transition. A no-op write (`from_status == to_status`) logs nothing."""
    if from_status == to_status:
        return None
    return UserJobStatusEvent.objects.create(
        user_job=user_job, from_status=from_status, to_status=to_status
    )
```

and add `UserJobStatusEvent` to the existing `from jobs.models import ...` line at the top of `services.py`.

- [ ] **Step 4: Wire it into `partial_update`**

In `backend/jobs/views.py`, replace the `partial_update` method (lines 125-132):

```python
    @extend_schema(request=JobUpdateSerializer, responses={200: JobSerializer})
    def partial_update(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        instance = self.get_object()
        previous_status = instance.status
        serializer = JobUpdateSerializer(instance, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        instance.refresh_from_db()
        record_status_change(instance, from_status=previous_status, to_status=instance.status)
        return Response(JobSerializer(instance).data)
```

- [ ] **Step 5: Wire it into `bulk_status`**

Replace the `bulk_status` action (lines 139-150):

```python
    @extend_schema(
        request=BulkStatusSerializer,
        responses={200: dict},
        description="Set one status across many jobs. Ids belonging to another user are ignored.",
    )
    @action(detail=False, methods=["post"], url_path="bulk_status")
    def bulk_status(self, request: Request) -> Response:
        serializer = BulkStatusSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        new_status = serializer.validated_data["status"]

        # Only rows that actually change get an event — a row already at the
        # target status is excluded before the update, not filtered after.
        changing = list(
            UserJob.objects.filter(user=_user(request), pk__in=serializer.validated_data["ids"])
            .exclude(status=new_status)
            .values_list("pk", "status")
        )
        updated = UserJob.objects.filter(pk__in=[pk for pk, _ in changing]).update(status=new_status)
        UserJobStatusEvent.objects.bulk_create(
            UserJobStatusEvent(user_job_id=pk, from_status=old_status, to_status=new_status)
            for pk, old_status in changing
        )

        return Response({"updated": updated})
```

Add `UserJobStatusEvent` and `record_status_change` to the imports at the top of `views.py` (`from jobs.models import ...` and `from jobs.services import statuses, record_status_change`).

- [ ] **Step 6: Run test to verify it passes**

Run: `docker compose -f docker-compose.yml -f docker-compose.dev.yml run --rm web pytest tests/test_status_history_api.py -v`
Expected: PASS (5 tests)

- [ ] **Step 7: Commit**

```bash
git add backend/jobs/services.py backend/jobs/views.py backend/tests/test_status_history_api.py
git commit -m "feat: log a UserJobStatusEvent on every status change"
```

---

### Task 3: Expose status history over the API, and `remind_at` as writable

**Files:**
- Modify: `backend/jobs/serializers.py:36-75` (`JobSerializer`, `JobUpdateSerializer`); add `UserJobStatusEventSerializer`
- Modify: `backend/jobs/views.py` (new `status_history` action, on `JobViewSet`)
- Test: `backend/tests/test_status_history_api.py` (extend from Task 2)

**Interfaces:**
- Consumes: `UserJobStatusEvent`, `record_status_change` (Task 1/2).
- Produces: `GET /api/jobs/{id}/status_history/` → `[{fromStatus, toStatus, changedAt}]`; `PATCH /api/jobs/{id}/` now also accepts `remind_at`.

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_status_history_api.py`:

```python
class TestStatusHistoryEndpoint:
    def test_lists_events_newest_first(self, authed_client):
        client, user = authed_client
        user_job = UserJob.objects.create(user=user, job=_job())
        client.patch(f"/api/jobs/{user_job.pk}/", {"status": "researching"}, format="json")
        client.patch(f"/api/jobs/{user_job.pk}/", {"status": "applied"}, format="json")

        response = client.get(f"/api/jobs/{user_job.pk}/status_history/")

        assert response.status_code == 200
        body = response.json()
        assert [event["toStatus"] for event in body] == ["applied", "researching"]

    def test_404s_for_another_users_job(self, authed_client, user_factory):
        client, _user = authed_client
        stranger = user_factory()
        theirs = UserJob.objects.create(user=stranger, job=_job())

        response = client.get(f"/api/jobs/{theirs.pk}/status_history/")

        assert response.status_code == 404


class TestRemindAt:
    def test_can_be_set_via_patch(self, authed_client):
        client, user = authed_client
        user_job = UserJob.objects.create(user=user, job=_job())

        response = client.patch(
            f"/api/jobs/{user_job.pk}/", {"remindAt": "2026-09-01T09:00:00Z"}, format="json"
        )

        assert response.status_code == 200
        user_job.refresh_from_db()
        assert user_job.remind_at is not None

    def test_changing_it_clears_reminder_sent_at(self, authed_client):
        from django.utils import timezone

        client, user = authed_client
        user_job = UserJob.objects.create(
            user=user, job=_job(), remind_at=timezone.now(), reminder_sent_at=timezone.now()
        )

        client.patch(f"/api/jobs/{user_job.pk}/", {"remindAt": "2026-09-01T09:00:00Z"}, format="json")

        user_job.refresh_from_db()
        assert user_job.reminder_sent_at is None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose -f docker-compose.yml -f docker-compose.dev.yml run --rm web pytest tests/test_status_history_api.py -v`
Expected: FAIL — `status_history` returns 404 (no such route), `remindAt` patch is silently ignored by `JobUpdateSerializer` (200 but `remind_at` stays null).

- [ ] **Step 3: Add the serializer and extend the existing ones**

In `backend/jobs/serializers.py`, add `remind_at` to `JobSerializer.Meta.fields` (line 38-63), right after `"pinned"`:

```python
            "pinned",
            "remind_at",
            "is_new",
```

`remind_at` falls into the auto-computed `read_only_fields` (everything not in `{"status", "notes", "pinned"}`), which is correct for this serializer — it's output-only here; writes go through `JobUpdateSerializer` below.

Replace `JobUpdateSerializer` (lines 70-75):

```python
class JobUpdateSerializer(serializers.ModelSerializer):
    """The four fields a user may write."""

    class Meta:
        model = UserJob
        fields = ("status", "notes", "pinned", "remind_at")

    def update(self, instance: UserJob, validated_data: dict) -> UserJob:
        # A new reminder date means the old "already sent" fact no longer
        # applies — otherwise moving the date forward would never re-fire.
        if "remind_at" in validated_data and validated_data["remind_at"] != instance.remind_at:
            validated_data["reminder_sent_at"] = None
        return super().update(instance, validated_data)
```

Add a new serializer near `StatusChoiceSerializer` (after line 86):

```python
class UserJobStatusEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserJobStatusEvent
        fields = ("from_status", "to_status", "changed_at")
```

Add `UserJobStatusEvent` to the `from jobs.models import ...` line at the top of the file.

- [ ] **Step 4: Add the `status_history` action**

In `backend/jobs/views.py`, add after the `statuses` action (after line 156):

```python
    @extend_schema(responses={200: UserJobStatusEventSerializer(many=True)})
    @action(detail=True, methods=["get"], url_path="status_history")
    def status_history(self, request: Request, pk: str | None = None) -> Response:
        """Every recorded transition for this job, newest first.

        `get_object` resolves against the user-scoped queryset, so another
        user's id 404s here exactly as it does for retrieve.
        """
        instance = self.get_object()
        return Response(UserJobStatusEventSerializer(instance.status_history.all(), many=True).data)
```

Add `UserJobStatusEventSerializer` to the `from jobs.serializers import (...)` block at the top of `views.py`.

- [ ] **Step 5: Run test to verify it passes**

Run: `docker compose -f docker-compose.yml -f docker-compose.dev.yml run --rm web pytest tests/test_status_history_api.py -v`
Expected: PASS (9 tests total in the file)

- [ ] **Step 6: Regenerate the OpenAPI contract**

Run: `make gen-schema` then `make gen-client`

Verify `git diff contracts/jobradar-v1.json` shows the new `remindAt` field and a `status_history` path, and `frontend/src/api/schema.d.ts` picks up both.

- [ ] **Step 7: Commit**

```bash
git add backend/jobs/serializers.py backend/jobs/views.py backend/tests/test_status_history_api.py contracts/jobradar-v1.json frontend/src/api/schema.d.ts
git commit -m "feat: expose status_history endpoint and writable remind_at"
```

---

### Task 4: Reminder sweep + email

**Files:**
- Modify: `backend/jobs/tasks.py` (new `send_due_reminders`, after `catch_up_if_stale`, before line 91)
- Modify: `backend/notifications/tasks.py` (new `send_job_reminders`, after `send_email_verification`)
- Create: `backend/notifications/templates/notifications/job_reminder.txt`
- Create: `backend/notifications/templates/notifications/job_reminder.html`
- Modify: `backend/config/settings/base.py:238-245` (`CELERY_BEAT_SCHEDULE`)
- Test: `backend/tests/test_job_reminders.py`

**Interfaces:**
- Consumes: `UserJob.remind_at` / `reminder_sent_at` (Task 1); `notifications.send.send_email` (existing).
- Produces: `jobs.send_due_reminders() -> dict` (task name `"jobs.send_due_reminders"`); `notifications.send_job_reminders(user_id: int, reminders: list[dict]) -> bool` (task name `"notifications.send_job_reminders"`), where each `reminders` entry is `{"title": str, "company": str, "url": str, "notes": str}`.

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_job_reminders.py
from __future__ import annotations

import pytest
from django.core import mail
from django.utils import timezone

from jobs.models import Job, UserJob
from jobs.tasks import send_due_reminders
from notifications.tasks import send_job_reminders

pytestmark = pytest.mark.django_db


def _job(key="greenhouse:careem:1"):
    return Job.objects.create(key=key, source="greenhouse", company="Careem", title="SWE")


@pytest.fixture(autouse=True)
def _empty_outbox():
    mail.outbox.clear()
    yield


class TestSweep:
    def test_marks_a_due_reminder_sent_and_enqueues_the_email(self, user_factory, settings):
        settings.CELERY_TASK_ALWAYS_EAGER = True
        user = user_factory()
        user_job = UserJob.objects.create(
            user=user, job=_job(), remind_at=timezone.now() - timezone.timedelta(minutes=1)
        )

        result = send_due_reminders()

        user_job.refresh_from_db()
        assert user_job.reminder_sent_at is not None
        assert result == {"sent_to": 1, "reminders": 1}
        assert len(mail.outbox) == 1
        assert mail.outbox[0].to == [user.email]

    def test_ignores_a_reminder_not_yet_due(self, user_factory):
        user = user_factory()
        user_job = UserJob.objects.create(
            user=user, job=_job(), remind_at=timezone.now() + timezone.timedelta(days=1)
        )

        send_due_reminders()

        user_job.refresh_from_db()
        assert user_job.reminder_sent_at is None
        assert mail.outbox == []

    def test_never_resends_an_already_sent_reminder(self, user_factory):
        user = user_factory()
        UserJob.objects.create(
            user=user,
            job=_job(),
            remind_at=timezone.now() - timezone.timedelta(days=1),
            reminder_sent_at=timezone.now(),
        )

        result = send_due_reminders()

        assert result == {"sent_to": 0, "reminders": 0}
        assert mail.outbox == []

    def test_groups_multiple_due_jobs_for_one_user_into_one_email(self, user_factory, settings):
        settings.CELERY_TASK_ALWAYS_EAGER = True
        user = user_factory()
        due = timezone.now() - timezone.timedelta(minutes=1)
        UserJob.objects.create(user=user, job=_job("greenhouse:careem:1"), remind_at=due)
        UserJob.objects.create(user=user, job=_job("greenhouse:careem:2"), remind_at=due)

        result = send_due_reminders()

        assert result == {"sent_to": 1, "reminders": 2}
        assert len(mail.outbox) == 1


class TestSendJobRemindersTask:
    def test_sends_titles_and_urls_in_the_body(self, user_factory):
        user = user_factory(email="dev@example.com")

        send_job_reminders(
            user.pk,
            [{"title": "SWE", "company": "Careem", "url": "https://example.com/job/1", "notes": ""}],
        )

        assert len(mail.outbox) == 1
        assert "SWE" in mail.outbox[0].body
        assert "Careem" in mail.outbox[0].body
        assert "https://example.com/job/1" in mail.outbox[0].body

    def test_does_nothing_for_a_deleted_user(self):
        assert send_job_reminders(999999, [{"title": "x", "company": "y", "url": "", "notes": ""}]) is False
        assert mail.outbox == []
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose -f docker-compose.yml -f docker-compose.dev.yml run --rm web pytest tests/test_job_reminders.py -v`
Expected: FAIL with `ImportError: cannot import name 'send_due_reminders'`

- [ ] **Step 3: Implement the sweep task**

In `backend/jobs/tasks.py`, add after `catch_up_if_stale` (before the `worker_ready` handler at line 91):

```python
@shared_task(name="jobs.send_due_reminders")
def send_due_reminders() -> dict:
    """Every reminder whose date has come, grouped into one email per user.

    Marked sent *before* the email goes out: a slow or failing SMTP call must
    never leave the row free for the next sweep to pick up again.
    """
    from collections import defaultdict

    from jobs.models import UserJob
    from notifications.tasks import send_job_reminders

    now = timezone.now()
    due = list(
        UserJob.objects.filter(remind_at__lte=now, reminder_sent_at__isnull=True, is_open=True)
        .select_related("job", "user")
    )
    if not due:
        return {"sent_to": 0, "reminders": 0}

    by_user: dict[int, list[UserJob]] = defaultdict(list)
    for user_job in due:
        by_user[user_job.user_id].append(user_job)

    UserJob.objects.filter(pk__in=[user_job.pk for user_job in due]).update(reminder_sent_at=now)

    for user_id, rows in by_user.items():
        payload = [
            {
                "title": user_job.job.title,
                "company": user_job.job.company,
                "url": user_job.job.url,
                "notes": user_job.notes,
            }
            for user_job in rows
        ]
        send_job_reminders.delay(user_id, payload)

    return {"sent_to": len(by_user), "reminders": len(due)}
```

- [ ] **Step 4: Implement the email task**

In `backend/notifications/tasks.py`, add after `send_email_verification` (end of file):

```python
@shared_task(name="notifications.send_job_reminders", bind=True, max_retries=3)
def send_job_reminders(self: object, user_id: int, reminders: list[dict]) -> bool:
    """The email for one user's due reminders, already grouped by the sweep."""
    from users.models import User

    user = User.objects.filter(pk=user_id).first()
    if user is None or not reminders:
        return False

    subject = "Follow-up reminder" if len(reminders) == 1 else f"{len(reminders)} follow-up reminders"
    return send_email(to=user.email, subject=subject, template="job_reminder", context={"reminders": reminders})
```

- [ ] **Step 5: Add the email templates**

`backend/notifications/templates/notifications/job_reminder.txt`:

```
Follow-up reminders

You asked to be reminded about these jobs:
{% for reminder in reminders %}
- {{ reminder.title }} at {{ reminder.company }}{% if reminder.notes %} — {{ reminder.notes }}{% endif %}
  {{ reminder.url }}
{% endfor %}

--
JobRadar
```

`backend/notifications/templates/notifications/job_reminder.html`:

```html
{% extends "notifications/base_email.html" %}

{% block title %}Follow-up reminders{% endblock %}

{% block content %}
  <h1 style="margin:0 0 12px 0; font-size:22px; font-weight:800; letter-spacing:-0.022em;
             color:#0b1220;">Follow-up reminders</h1>

  <p style="margin:0 0 20px 0; color:#46536b;">
    You asked to be reminded about these jobs:
  </p>

  {% for reminder in reminders %}
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"
           style="margin:0 0 16px 0; width:100%;">
      <tr>
        <td>
          <a href="{{ reminder.url }}" style="color:#1f5fd8; font-weight:600; text-decoration:none;">
            {{ reminder.title }}
          </a>
          <div style="color:#63708a; font-size:13px;">{{ reminder.company }}</div>
          {% if reminder.notes %}
            <div style="color:#46536b; font-size:13px; margin-top:4px;">{{ reminder.notes }}</div>
          {% endif %}
        </td>
      </tr>
    </table>
  {% endfor %}
{% endblock %}

{% block footer %}
  You received this because you set a follow-up reminder on a job in JobRadar.
{% endblock %}
```

- [ ] **Step 6: Register the periodic sweep**

In `backend/config/settings/base.py`, extend `CELERY_BEAT_SCHEDULE` (lines 238-245):

```python
CELERY_BEAT_SCHEDULE = {
    "daily-run": {
        "task": "jobs.run_now",
        # 09:00 Asia/Karachi — CELERY_TIMEZONE above, not the server's clock.
        "schedule": crontab(hour="9", minute="0"),
        "kwargs": {"triggered_by": "schedule"},
    },
    "job-reminders": {
        "task": "jobs.send_due_reminders",
        # Hourly: a date-level reminder does not need finer granularity, and
        # this is 24x more sweeps than the run without being noisy.
        "schedule": crontab(minute=0),
    },
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `docker compose -f docker-compose.yml -f docker-compose.dev.yml run --rm web pytest tests/test_job_reminders.py -v`
Expected: PASS (6 tests)

- [ ] **Step 8: Commit**

```bash
git add backend/jobs/tasks.py backend/notifications/tasks.py backend/notifications/templates/notifications/job_reminder.txt backend/notifications/templates/notifications/job_reminder.html backend/config/settings/base.py backend/tests/test_job_reminders.py
git commit -m "feat: sweep due reminders hourly and email them"
```

---

### Task 5: Frontend types, queries and mock server

**Files:**
- Modify: `frontend/src/api/types.ts:34-59` (`Job`), add `StatusEvent` near line 174
- Modify: `frontend/src/api/queries.ts:32-42,65-72,100-105`
- Modify: `frontend/src/test/server.ts:40-65,67-104,317-330`

**Interfaces:**
- Produces: `Job.remindAt: string | null`; `StatusEvent { fromStatus: ApplicationStatus | ''; toStatus: ApplicationStatus; changedAt: string }`; `useStatusHistory(jobId: number): UseQueryResult<StatusEvent[]>`; `JobPatch.remindAt?: string | null`.

- [ ] **Step 1: Add the types**

In `frontend/src/api/types.ts`, add to the `Job` interface (after `pinned` at line 52):

```ts
  pinned: boolean
  remindAt: string | null
  isNew: boolean
```

Add after the `StatusChoice` interface (around line 174-176):

```ts
export interface StatusEvent {
  fromStatus: ApplicationStatus | ''
  toStatus: ApplicationStatus
  changedAt: string
}
```

- [ ] **Step 2: Add the query hook and extend `JobPatch`**

In `frontend/src/api/queries.ts`, add to `queryKeys` (after `statuses`, line 36):

```ts
  statuses: () => ['statuses'] as const,
  statusHistory: (id: number) => ['job', id, 'status-history'] as const,
```

Add the hook after `useStatuses` (after line 72):

```ts
export function useStatusHistory(id: number): UseQueryResult<StatusEvent[]> {
  return useQuery({
    queryKey: queryKeys.statusHistory(id),
    queryFn: () => api.get<StatusEvent[]>(`/jobs/${id}/status_history/`),
  })
}
```

Add `StatusEvent` to the `import type { ... } from './types'` block (line 19-30).

Extend `JobPatch` (lines 100-105):

```ts
interface JobPatch {
  id: number
  status?: ApplicationStatus
  notes?: string
  pinned?: boolean
  remindAt?: string | null
}
```

`useUpdateJob`'s existing optimistic-update logic (lines 114-150) needs no change — it spreads `...patch` generically, so `remindAt` flows through it for free. Add invalidation of the status-history query to `onSettled` (line 145-148), since a status-changing patch can affect it:

```ts
    onSettled: (_data, _error, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['jobs'] })
      void queryClient.invalidateQueries({ queryKey: queryKeys.stats() })
      void queryClient.invalidateQueries({ queryKey: queryKeys.statusHistory(variables.id) })
    },
```

- [ ] **Step 3: Extend the mock server**

In `frontend/src/test/server.ts`, add to the `MockJob` interface (after `pinned`, line 58):

```ts
  pinned: boolean
  remindAt: string | null
  isNew: boolean
```

Add a default in the `job()` factory (after `pinned: false,`, line 86):

```ts
    pinned: false,
    remindAt: null,
```

Add mock state for history and a handler. Extend `MockState` (after `bulkUpdates`, line 36):

```ts
  bulkUpdates: { ids: number[]; status: string }[]
  statusHistory: Record<number, { fromStatus: string; toStatus: string; changedAt: string }[]>
  jobs: MockJob[]
```

Initialise it in `createState()` (after `bulkUpdates: [],`, line 121):

```ts
    bulkUpdates: [],
    statusHistory: {},
```

Add a handler after the `bulk_status` handler (after line 340):

```ts
  http.get(`${API}/jobs/:id/status_history/`, ({ request, params }) => {
    if (!authed(request)) return unauthorized()
    return HttpResponse.json(state.statusHistory[Number(params.id)] ?? [])
  }),
```

- [ ] **Step 4: Verify the frontend still typechecks and existing tests pass**

Run: `cd frontend && npm run typecheck && npm run test -- --run`
Expected: PASS — no test yet exercises the new hook/handler, so this step only confirms nothing broke.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/types.ts frontend/src/api/queries.ts frontend/src/test/server.ts
git commit -m "feat: add remindAt and status history to the frontend API layer"
```

---

### Task 6: `StatusTimeline` component

**Files:**
- Create: `frontend/src/dashboard/StatusTimeline.tsx`
- Create: `frontend/src/dashboard/StatusTimeline.test.tsx`
- Modify: `frontend/src/routes/JobDetail.tsx:179-196` (mount it after the existing "Timeline" panel)

**Interfaces:**
- Consumes: `useStatusHistory` (Task 5).
- Produces: `<StatusTimeline jobId={number} />`, a self-fetching panel.

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/dashboard/StatusTimeline.test.tsx
import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { renderWithProviders } from '../test/render'
import { state } from '../test/server'
import { StatusTimeline } from './StatusTimeline'

describe('StatusTimeline', () => {
  it('renders each transition, newest first', async () => {
    state.statusHistory[1] = [
      { fromStatus: 'researching', toStatus: 'applied', changedAt: '2026-08-20T09:00:00Z' },
      { fromStatus: 'not_started', toStatus: 'researching', changedAt: '2026-08-18T09:00:00Z' },
    ]
    renderWithProviders(<StatusTimeline jobId={1} />)

    const items = await screen.findAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent(/researching.*applied/i)
    expect(items[1]).toHaveTextContent(/not started.*researching/i)
  })

  it('says nothing has changed yet when there is no history', async () => {
    state.statusHistory[1] = []
    renderWithProviders(<StatusTimeline jobId={1} />)

    expect(await screen.findByText(/no status changes yet/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm run test -- --run StatusTimeline`
Expected: FAIL — `Cannot find module './StatusTimeline'`

- [ ] **Step 3: Implement the component**

```tsx
// frontend/src/dashboard/StatusTimeline.tsx
/**
 * Every recorded transition for one job, newest first.
 */

import { useStatusHistory } from '../api/queries'
import { Panel, PanelHeader, Skeleton } from '../components/ui'

const LABELS: Record<string, string> = {
  not_started: 'Not started',
  researching: 'Researching',
  cv_tailored: 'CV tailored',
  applied: 'Applied',
  assessment: 'Assessment',
  interviewing: 'Interviewing',
  offer: 'Offer',
  rejected: 'Rejected',
  skipped: 'Skipped',
  '': 'Not started',
}

export function StatusTimeline({ jobId }: { jobId: number }) {
  const history = useStatusHistory(jobId)

  return (
    <Panel>
      <PanelHeader title="Status history" />
      <div className="p-5">
        {history.isPending && <Skeleton className="h-16" />}

        {!history.isPending && (history.data?.length ?? 0) === 0 && (
          <p className="text-sm text-muted">No status changes yet.</p>
        )}

        {(history.data?.length ?? 0) > 0 && (
          <ul className="space-y-2">
            {history.data!.map((event, index) => (
              <li key={`${event.changedAt}-${index}`} className="text-sm">
                <span className="text-muted">{LABELS[event.fromStatus] ?? event.fromStatus}</span>
                {' → '}
                <span className="font-semibold">{LABELS[event.toStatus] ?? event.toStatus}</span>
                <span className="ml-2 text-2xs text-subtle">
                  {new Date(event.changedAt).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm run test -- --run StatusTimeline`
Expected: PASS (2 tests)

- [ ] **Step 5: Mount it in `JobDetail`**

In `frontend/src/routes/JobDetail.tsx`, add the import (near line 19):

```tsx
import { StatusTimeline } from '../dashboard/StatusTimeline'
```

and render it right after the existing "Timeline" `<Panel>` closes (after line 196, before `<NotesPanel ... />` at line 198):

```tsx
            </Panel>

            <StatusTimeline jobId={jobId} />

            <NotesPanel jobId={jobId} initial={data.notes} />
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/dashboard/StatusTimeline.tsx frontend/src/dashboard/StatusTimeline.test.tsx frontend/src/routes/JobDetail.tsx
git commit -m "feat: show status history on the job detail screen"
```

---

### Task 7: `ReminderPicker` component

**Files:**
- Create: `frontend/src/dashboard/ReminderPicker.tsx`
- Create: `frontend/src/dashboard/ReminderPicker.test.tsx`
- Modify: `frontend/src/routes/JobDetail.tsx` (mount it next to `StatusTimeline`)

**Interfaces:**
- Consumes: `useUpdateJob` (existing, extended in Task 5 to accept `remindAt`).
- Produces: `<ReminderPicker jobId={number} value={string | null} />`.

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/dashboard/ReminderPicker.test.tsx
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { renderWithProviders } from '../test/render'
import { state } from '../test/server'
import { ReminderPicker } from './ReminderPicker'

describe('ReminderPicker', () => {
  it('sets a reminder date', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ReminderPicker jobId={1} value={null} />)

    await user.type(screen.getByLabelText(/remind me on/i), '2026-09-01')

    await waitFor(() => expect(state.jobs.find((job) => job.id === 1)?.remindAt).toContain('2026-09-01'))
  })

  it('clears an existing reminder', async () => {
    const user = userEvent.setup()
    state.jobs.find((job) => job.id === 1)!.remindAt = '2026-09-01T09:00:00Z'
    renderWithProviders(<ReminderPicker jobId={1} value="2026-09-01T09:00:00Z" />)

    await user.click(screen.getByRole('button', { name: /clear reminder/i }))

    await waitFor(() => expect(state.jobs.find((job) => job.id === 1)?.remindAt).toBeNull())
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm run test -- --run ReminderPicker`
Expected: FAIL — `Cannot find module './ReminderPicker'`

- [ ] **Step 3: Implement the component**

```tsx
// frontend/src/dashboard/ReminderPicker.tsx
/**
 * A follow-up date for one job. Saved immediately on change — a date field
 * has no "still typing" state the way a text note does, so there is nothing
 * to debounce.
 */

import { useUpdateJob } from '../api/queries'
import { Panel, PanelHeader } from '../components/ui'

export function ReminderPicker({ jobId, value }: { jobId: number; value: string | null }) {
  const update = useUpdateJob()

  const asDateInput = value ? value.slice(0, 10) : ''

  return (
    <Panel>
      <PanelHeader
        title="Follow-up reminder"
        description="We'll email you when this date arrives."
      />
      <div className="flex items-center gap-3 p-5">
        <label htmlFor={`remind-${jobId}`} className="text-sm font-medium">
          Remind me on
        </label>
        <input
          id={`remind-${jobId}`}
          type="date"
          value={asDateInput}
          onChange={(event) => {
            const remindAt = event.target.value ? `${event.target.value}T09:00:00Z` : null
            update.mutate({ id: jobId, remindAt })
          }}
          className="h-9 rounded-sm border border-hairline-strong bg-surface px-2.5 text-sm"
        />
        {asDateInput && (
          <button
            type="button"
            onClick={() => update.mutate({ id: jobId, remindAt: null })}
            className="text-sm text-muted underline underline-offset-2 hover:text-fg"
          >
            Clear reminder
          </button>
        )}
      </div>
    </Panel>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm run test -- --run ReminderPicker`
Expected: PASS (2 tests)

- [ ] **Step 5: Mount it in `JobDetail`**

In `frontend/src/routes/JobDetail.tsx`, add the import next to `StatusTimeline`'s:

```tsx
import { ReminderPicker } from '../dashboard/ReminderPicker'
```

and render it next to `StatusTimeline`:

```tsx
            <StatusTimeline jobId={jobId} />

            <ReminderPicker jobId={jobId} value={data.remindAt} />

            <NotesPanel jobId={jobId} initial={data.notes} />
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/dashboard/ReminderPicker.tsx frontend/src/dashboard/ReminderPicker.test.tsx frontend/src/routes/JobDetail.tsx
git commit -m "feat: let a user set a follow-up reminder on a job"
```

---

## Verification (end to end)

1. Backend suite: `docker compose -f docker-compose.yml -f docker-compose.dev.yml run --rm web pytest` — all tests pass, including the four new files.
2. Backend lint/types: `make lint-backend`.
3. Frontend suite + types: `cd frontend && npm run test -- --run && npm run typecheck && npm run lint`.
4. Contract drift check: `make gen-schema && git diff --exit-code contracts/jobradar-v1.json` (should be empty after Task 3's regeneration is committed).
5. Manual smoke test against the running dev stack (`make dev`):
   - Open a job's detail page, change its status twice via the dropdown, confirm "Status history" shows both transitions with correct labels and newest-first order.
   - Set a "Remind me on" date in the past, then run `docker compose -f docker-compose.yml -f docker-compose.dev.yml exec web python manage.py shell -c "from jobs.tasks import send_due_reminders; print(send_due_reminders())"` and confirm an email appears in the `web` container logs (dev email backend) addressed to the logged-in demo user, listing that job.
   - Confirm setting a *future* date sends nothing, and confirm re-running the sweep after a successful send does not send a second email for the same job.
