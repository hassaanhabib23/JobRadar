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
