"""The whole path, end to end: fetch → store once → score per user.

This is the milestone 4 exit criterion. If the global/per-user split is wrong,
it is wrong here, before eight more adapters are built on top of it.
"""

from __future__ import annotations

from datetime import date, timedelta

import pytest
import responses
from django.utils import timezone

from jobs.models import ApplicationStatus, Job, UserJob
from jobs.services import score_jobs_for_user, store_postings
from sources import fetch
from sources.base import SourceSpec
from sources.greenhouse import BOARD_URL

pytestmark = pytest.mark.django_db

BOARD = BOARD_URL.format(slug="careem")

CAREEM = {
    "jobs": [
        {
            "id": 7004825002,
            "title": "Associate Software Engineer | NextGen",
            "location": {"name": "Islamabad, Pakistan"},
            "absolute_url": "https://job-boards.greenhouse.io/careem/jobs/7004825002",
            "first_published": "2026-08-13T09:00:00+00:00",
        },
        {
            "id": 8618945002,
            "title": "Senior Data Scientist",
            "location": {"name": "Lahore, Pakistan"},
            "absolute_url": "https://job-boards.greenhouse.io/careem/jobs/8618945002",
            "first_published": "2026-08-13T09:00:00+00:00",
        },
    ]
}

TODAY = date(2026, 8, 15)


def careem_spec() -> SourceSpec:
    return SourceSpec(kind="greenhouse", slug="careem", company="Careem")


@pytest.fixture
def islamabad_dotnet_dev(user_factory):
    user = user_factory(email="isb@example.com")
    user.profile.seed_defaults(locations=("islamabad",), role_keywords=("dotnet",))
    user.profile.save()
    return user


@pytest.fixture
def lahore_react_dev(user_factory):
    user = user_factory(email="lhr@example.com")
    user.profile.seed_defaults(locations=("lahore",), role_keywords=("react",))
    user.profile.save()
    return user


@responses.activate
def _ingest() -> list[Job]:
    responses.add(responses.GET, BOARD, json=CAREEM, status=200)
    jobs, _ = store_postings(fetch(careem_spec()))
    return jobs


class TestFetchOnceStoreOnce:
    def test_one_posting_becomes_one_global_row(
        self, islamabad_dotnet_dev, lahore_react_dev
    ) -> None:
        jobs = _ingest()

        assert len(jobs) == 2
        assert Job.objects.count() == 2

    def test_a_second_run_does_not_duplicate(self, islamabad_dotnet_dev) -> None:
        _ingest()
        _ingest()

        assert Job.objects.count() == 2
        job = Job.objects.get(key="greenhouse:careem:7004825002")
        assert job.seen_count == 2

    def test_the_key_is_stable_across_runs(self) -> None:
        """Without a stable key, closed-detection and status persistence both break."""
        first = Job.build_key("greenhouse", "Careem", "7004825002")
        second = Job.build_key("GREENHOUSE", "careem", "7004825002")

        assert first == second == "greenhouse:careem:7004825002"

    def test_a_source_without_an_external_id_still_gets_a_stable_key(self) -> None:
        args = ("jobspy", "Systems Ltd", None, "QA Engineer", "Islamabad")

        assert Job.build_key(*args) == Job.build_key(*args)
        assert Job.build_key(*args) != Job.build_key(
            "jobspy", "Systems Ltd", None, "QA Engineer", "Lahore"
        )

    @responses.activate
    def test_ten_users_cause_one_http_request(self, user_factory) -> None:
        """NFR12: adding a user must not increase outbound traffic to job boards."""
        responses.add(responses.GET, BOARD, json=CAREEM, status=200)
        users = [user_factory(email=f"u{index}@example.com") for index in range(10)]

        # Phase 1 happens once, globally.
        postings = fetch(careem_spec())
        jobs, _ = store_postings(postings)

        # Phase 2 runs per user, against what phase 1 already stored.
        for user in users:
            score_jobs_for_user(user, jobs, today=TODAY)

        assert len(responses.calls) == 1, "the feed must be fetched once, not once per user"
        assert Job.objects.count() == 2
        assert UserJob.objects.count() > 0


class TestScorePerUser:
    def test_two_users_see_different_scores_for_the_same_job(
        self, islamabad_dotnet_dev, lahore_react_dev
    ) -> None:
        """The milestone 4 exit criterion, and the whole reason for the split."""
        jobs = _ingest()
        score_jobs_for_user(islamabad_dotnet_dev, jobs, today=TODAY)
        score_jobs_for_user(lahore_react_dev, jobs, today=TODAY)

        job = Job.objects.get(key="greenhouse:careem:7004825002")
        for_isb = UserJob.objects.get(user=islamabad_dotnet_dev, job=job)

        # The Lahore developer's filters exclude an Islamabad-only role entirely.
        assert not UserJob.objects.filter(user=lahore_react_dev, job=job).exists()
        assert for_isb.score > 0
        assert for_isb.tier in {"High", "Medium", "Stretch"}

    def test_each_user_gets_the_jobs_their_own_filters_allow(
        self, islamabad_dotnet_dev, lahore_react_dev
    ) -> None:
        jobs = _ingest()
        score_jobs_for_user(islamabad_dotnet_dev, jobs, today=TODAY)
        score_jobs_for_user(lahore_react_dev, jobs, today=TODAY)

        isb_titles = {uj.job.title for uj in UserJob.objects.filter(user=islamabad_dotnet_dev)}
        lhr_titles = {uj.job.title for uj in UserJob.objects.filter(user=lahore_react_dev)}

        assert "Associate Software Engineer | NextGen" in isb_titles
        assert "Senior Data Scientist" in lhr_titles
        assert isb_titles != lhr_titles

    def test_the_score_breakdown_is_stored(self, islamabad_dotnet_dev) -> None:
        """A score with no explanation is useless."""
        jobs = _ingest()
        score_jobs_for_user(islamabad_dotnet_dev, jobs, today=TODAY)

        first = UserJob.objects.filter(user=islamabad_dotnet_dev).first()
        assert first is not None
        detail = first.detail

        assert set(detail) >= {"stack", "level", "location", "fresh", "skills_hit", "notes"}
        assert detail["notes"]


class TestNewness:
    def test_a_job_is_new_on_the_first_run_it_appears_in(self, islamabad_dotnet_dev) -> None:
        jobs = _ingest()
        score_jobs_for_user(islamabad_dotnet_dev, jobs, today=TODAY)

        assert UserJob.objects.filter(user=islamabad_dotnet_dev, is_new=True).exists()

    def test_it_stops_being_new_on_the_next_run(self, islamabad_dotnet_dev) -> None:
        jobs = _ingest()
        score_jobs_for_user(islamabad_dotnet_dev, jobs, today=TODAY)
        score_jobs_for_user(islamabad_dotnet_dev, jobs, today=TODAY)

        assert not UserJob.objects.filter(user=islamabad_dotnet_dev, is_new=True).exists()

    def test_an_old_job_is_new_to_a_user_who_just_registered(
        self, islamabad_dotnet_dev, user_factory
    ) -> None:
        """New *to them*, which is the correct meaning — and why `is_new` lives
        on UserJob rather than on Job."""
        jobs = _ingest()
        score_jobs_for_user(islamabad_dotnet_dev, jobs, today=TODAY)
        score_jobs_for_user(islamabad_dotnet_dev, jobs, today=TODAY)

        newcomer = user_factory(email="newcomer@example.com")
        score_jobs_for_user(newcomer, jobs, today=TODAY)

        assert UserJob.objects.filter(user=newcomer, is_new=True).exists()
        assert not UserJob.objects.filter(user=islamabad_dotnet_dev, is_new=True).exists()


class TestUserDataSurvivesTheRun:
    def test_status_and_notes_survive_a_refetch_that_rewrites_the_score(
        self, islamabad_dotnet_dev
    ) -> None:
        """The one thing here that cannot be re-fetched."""
        jobs = _ingest()
        score_jobs_for_user(islamabad_dotnet_dev, jobs, today=TODAY)

        user_job = UserJob.objects.filter(user=islamabad_dotnet_dev).first()
        assert user_job is not None
        user_job.status = ApplicationStatus.APPLIED
        user_job.notes = "Referred by Ayesha, follow up Tuesday"
        user_job.save()
        original_score = user_job.score

        # A later run rewrites score, title and description.
        islamabad_dotnet_dev.profile.skills = {"associate": 40.0}
        islamabad_dotnet_dev.profile.save()
        score_jobs_for_user(islamabad_dotnet_dev, list(Job.objects.all()), today=TODAY)

        user_job.refresh_from_db()
        assert user_job.status == ApplicationStatus.APPLIED
        assert user_job.notes == "Referred by Ayesha, follow up Tuesday"
        assert user_job.score != original_score, "the score should have been recomputed"

    def test_a_job_that_stops_matching_is_removed_only_if_untouched(
        self, islamabad_dotnet_dev
    ) -> None:
        jobs = _ingest()
        score_jobs_for_user(islamabad_dotnet_dev, jobs, today=TODAY)

        applied, untouched = None, None
        for user_job in UserJob.objects.filter(user=islamabad_dotnet_dev):
            if applied is None:
                applied = user_job
                applied.status = ApplicationStatus.APPLIED
                applied.save()
            else:
                untouched = user_job

        # Nothing matches any more.
        islamabad_dotnet_dev.profile.title_blocklist = ["engineer", "scientist", "developer"]
        islamabad_dotnet_dev.profile.save()
        score_jobs_for_user(islamabad_dotnet_dev, list(Job.objects.all()), today=TODAY)

        assert applied is not None
        assert UserJob.objects.filter(pk=applied.pk).exists(), "their own record must survive"
        if untouched is not None:
            assert not UserJob.objects.filter(pk=untouched.pk).exists()


class TestPostedAtIsNeverErased:
    def test_a_known_date_is_not_overwritten_by_a_later_empty_one(self) -> None:
        """A source that stops sending dates must not erase what we already knew."""
        undated = dict(CAREEM["jobs"][0])
        undated["first_published"] = None
        undated["updated_at"] = None

        with responses.RequestsMock() as mock:
            mock.add(responses.GET, BOARD, json=CAREEM, status=200)
            store_postings(fetch(careem_spec()))

        with responses.RequestsMock() as mock:
            mock.add(responses.GET, BOARD, json={"jobs": [undated]}, status=200)
            store_postings(fetch(careem_spec()))

        job = Job.objects.get(key="greenhouse:careem:7004825002")
        assert job.posted_at == date(2026, 8, 13)


class TestGeneratedSearchVector:
    def test_postgres_maintains_it_without_the_application_remembering(self) -> None:
        """A column the application has to set goes stale on a bulk upsert."""
        _ingest()

        found = Job.objects.filter(search_vector="associate")

        assert found.count() == 1
        top = found.first()
        assert top is not None and "Associate" in top.title

    def test_it_updates_when_the_row_changes(self) -> None:
        _ingest()
        job = Job.objects.get(key="greenhouse:careem:7004825002")
        job.title = "Graduate Platform Engineer"
        job.save()

        assert Job.objects.filter(search_vector="graduate").count() == 1
        assert Job.objects.filter(search_vector="associate").count() == 0


class TestTrackingAndGhosts:
    def test_tracking_days_accumulate_and_produce_a_ghost(self, islamabad_dotnet_dev) -> None:
        jobs = _ingest()
        score_jobs_for_user(islamabad_dotnet_dev, jobs, today=TODAY)

        # Pretend this user first saw it 40 days ago.
        UserJob.objects.filter(user=islamabad_dotnet_dev).update(
            first_seen_by_user=timezone.now() - timedelta(days=40)
        )
        score_jobs_for_user(islamabad_dotnet_dev, list(Job.objects.all()), today=TODAY)

        user_job = UserJob.objects.filter(user=islamabad_dotnet_dev).first()
        assert user_job is not None
        assert user_job.tracking_days >= 25
        assert "ghost?" in user_job.flags
