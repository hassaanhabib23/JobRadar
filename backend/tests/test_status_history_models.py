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
