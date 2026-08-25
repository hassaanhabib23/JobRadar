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
    return Job.objects.create(
        key=key, source="greenhouse", company="Careem", title="SWE", **overrides
    )


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
            "/api/jobs/bulk_status/",
            {"ids": [first.pk, second.pk], "status": "applied"},
            format="json",
        )

        assert response.status_code == 200
        # `second` was already "applied" — no-op, no event.
        assert UserJobStatusEvent.objects.filter(user_job=second).count() == 0
        assert UserJobStatusEvent.objects.filter(user_job=first).count() == 1

    def test_does_not_log_for_another_users_rows(self, authed_client, user_factory):
        client, _user = authed_client
        stranger = user_factory()
        theirs = UserJob.objects.create(user=stranger, job=_job())

        client.post(
            "/api/jobs/bulk_status/", {"ids": [theirs.pk], "status": "applied"}, format="json"
        )

        assert UserJobStatusEvent.objects.filter(user_job=theirs).count() == 0


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

        client.patch(
            f"/api/jobs/{user_job.pk}/", {"remindAt": "2026-09-01T09:00:00Z"}, format="json"
        )

        user_job.refresh_from_db()
        assert user_job.reminder_sent_at is None
