"""The run lifecycle.

Most of these encode a way the run can corrupt data rather than merely fail:
closing a healthy board because the network blipped, closing everything because
two runs shared a clock second, or letting one malformed profile end the run for
everyone.
"""

from __future__ import annotations

from datetime import date, timedelta
from unittest import mock

import pytest
import responses
from django.core.cache import cache
from django.utils import timezone

from jobs.models import ApplicationStatus, Job, Run, RunSource, RunStatus, Source, UserJob
from jobs.runner import (
    close_missing_jobs,
    enabled_sources,
    execute_run,
    expand_location_sources,
    last_successful_run,
)
from jobs.tasks import RUN_LOCK_KEY, catch_up_if_stale, run_now
from sources.greenhouse import BOARD_URL

pytestmark = pytest.mark.django_db

CAREEM_BOARD = BOARD_URL.format(slug="careem")
ARBISOFT_BOARD = BOARD_URL.format(slug="arbisoft")


def board(*jobs: dict) -> dict:
    return {"jobs": list(jobs)}


def gh_job(job_id: int, title: str | None = None, location: str = "Islamabad, Pakistan") -> dict:
    """A Greenhouse posting.

    Titles differ per id by default: two postings sharing a company and a title
    are the *same role* to reconciliation and would legitimately merge into one
    job, which is not what most of these tests are about.
    """
    title = title or f"Associate Software Engineer {job_id}"
    return {
        "id": job_id,
        "title": title,
        "location": {"name": location},
        "absolute_url": f"https://boards.greenhouse.io/careem/jobs/{job_id}",
        "first_published": "2026-08-13T09:00:00+00:00",
    }


@pytest.fixture(autouse=True)
def _clear_lock():
    cache.delete(RUN_LOCK_KEY)
    yield
    cache.delete(RUN_LOCK_KEY)


@pytest.fixture
def careem() -> Source:
    return Source.objects.create(kind="greenhouse", slug="careem", company="Careem")


@pytest.fixture
def arbisoft() -> Source:
    return Source.objects.create(kind="greenhouse", slug="arbisoft", company="Arbisoft")


@pytest.fixture
def isb_user(user_factory):
    user = user_factory(email="isb@example.com")
    user.profile.seed_defaults(locations=("islamabad", "rawalpindi"))
    user.profile.save()
    return user


class TestFetchOnce:
    """NFR12 / FR17: adding a user must not add outbound requests."""

    @responses.activate
    def test_ten_users_cause_one_request_per_source(self, careem, user_factory) -> None:
        responses.add(responses.GET, CAREEM_BOARD, json=board(gh_job(1)), status=200)
        for index in range(10):
            user_factory(email=f"u{index}@example.com")

        execute_run()

        assert len(responses.calls) == 1

    def test_the_same_feed_added_privately_by_three_users_is_fetched_once(
        self, user_factory
    ) -> None:
        """FR17: three users each adding greenhouse/careem is one fetch, not three."""
        for index in range(3):
            user = user_factory(email=f"p{index}@example.com")
            Source.objects.create(kind="greenhouse", slug="careem", owner=user)

        assert len(enabled_sources()) == 1

    def test_a_shared_source_wins_over_a_private_duplicate(self, user_factory) -> None:
        """So the result is visible to everyone rather than only its adder."""
        user = user_factory()
        Source.objects.create(kind="greenhouse", slug="careem", owner=user)
        Source.objects.create(kind="greenhouse", slug="careem", owner=None)

        sources = enabled_sources()

        assert len(sources) == 1
        assert sources[0].owner_id is None

    def test_disabled_sources_are_not_fetched(self, careem) -> None:
        careem.enabled = False
        careem.save()

        assert enabled_sources() == []


class TestExpandLocationSources:
    """`hours_old` narrows only the scraped sources' recency window."""

    @pytest.fixture
    def jobspy_source(self) -> Source:
        return Source.objects.create(kind="jobspy", slug="scrape", config={"query": "engineer"})

    def test_overrides_hours_old_on_every_jobspy_clone(self, jobspy_source, isb_user) -> None:
        expanded = expand_location_sources(enabled_sources(), hours_old=24)

        clones = [source for source in expanded if source.kind == "jobspy"]
        assert clones, "isb_user's cities should have produced at least one clone"
        assert all(clone.config["hours_old"] == 24 for clone in clones)

    def test_without_an_override_the_sources_own_config_is_untouched(
        self, jobspy_source, isb_user
    ) -> None:
        expanded = expand_location_sources(enabled_sources())

        clones = [source for source in expanded if source.kind == "jobspy"]
        assert clones
        assert all("hours_old" not in clone.config for clone in clones)
        # The original row itself was never written to.
        jobspy_source.refresh_from_db()
        assert "hours_old" not in jobspy_source.config

    def test_the_override_does_not_leak_into_the_stored_source(
        self, jobspy_source, isb_user
    ) -> None:
        expand_location_sources(enabled_sources(), hours_old=72)

        jobspy_source.refresh_from_db()
        assert "hours_old" not in jobspy_source.config

    def test_ats_sources_are_never_touched(self, careem, isb_user) -> None:
        """The one kind of source with no date filter to narrow, and the one
        whose absence *does* trigger closed-detection — an override reaching
        it here would be a config it silently ignores at best."""
        expanded = expand_location_sources(enabled_sources(), hours_old=24)

        (greenhouse,) = [source for source in expanded if source.kind == "greenhouse"]
        assert "hours_old" not in (greenhouse.config or {})


class TestPartialFailure:
    """NFR4: a failing source degrades the run, never breaks it."""

    @responses.activate
    def test_one_failing_source_leaves_the_others_intact(self, careem, arbisoft) -> None:
        responses.add(responses.GET, CAREEM_BOARD, json=board(gh_job(1)), status=200)
        responses.add(responses.GET, ARBISOFT_BOARD, json={}, status=503)

        run = execute_run()

        assert run.status == RunStatus.PARTIAL
        assert run.sources_failed == 1
        assert Job.objects.count() == 1

    @responses.activate
    def test_a_failed_source_closes_nothing(self, careem, arbisoft) -> None:
        """The most dangerous bug available here: a network blip marking every
        job on a healthy board as closed."""
        responses.add(responses.GET, CAREEM_BOARD, json=board(gh_job(1)), status=200)
        responses.add(responses.GET, ARBISOFT_BOARD, json=board(gh_job(2)), status=200)
        execute_run()
        assert Job.objects.filter(closed_at__isnull=True).count() == 2

        responses.reset()
        responses.add(responses.GET, CAREEM_BOARD, json=board(gh_job(1)), status=200)
        responses.add(responses.GET, ARBISOFT_BOARD, json={}, status=503)

        run = execute_run()

        assert run.jobs_closed == 0
        assert Job.objects.filter(closed_at__isnull=True).count() == 2

    @responses.activate
    def test_the_failure_is_recorded_against_its_source(self, careem, arbisoft) -> None:
        """A partial failure must be visible, not silent (FR13)."""
        responses.add(responses.GET, CAREEM_BOARD, json=board(gh_job(1)), status=200)
        responses.add(responses.GET, ARBISOFT_BOARD, json={}, status=503)

        run = execute_run()

        failed = RunSource.objects.get(run=run, ok=False)
        assert "503" in failed.error
        arbisoft.refresh_from_db()
        assert arbisoft.last_status == "error"
        assert "503" in arbisoft.last_error

    @responses.activate
    def test_an_adapter_raising_unexpectedly_is_contained(self, careem, arbisoft) -> None:
        """An adapter bug is still a source failure, not a dead run."""
        responses.add(responses.GET, CAREEM_BOARD, json=board(gh_job(1)), status=200)
        with mock.patch("jobs.runner.fetch") as fetcher:
            fetcher.side_effect = [ValueError("boom"), []]

            run = execute_run()

        assert run.sources_failed >= 1
        assert Run.objects.filter(pk=run.pk).exists()

    @responses.activate
    def test_every_source_failing_is_a_failed_run(self, careem, arbisoft) -> None:
        responses.add(responses.GET, CAREEM_BOARD, json={}, status=500)
        responses.add(responses.GET, ARBISOFT_BOARD, json={}, status=500)

        run = execute_run()

        assert run.status == RunStatus.FAILED
        assert run.jobs_closed == 0


class TestClosedDetection:
    @responses.activate
    def test_a_job_that_disappears_is_closed(self, careem) -> None:
        responses.add(responses.GET, CAREEM_BOARD, json=board(gh_job(1), gh_job(2)), status=200)
        execute_run()

        responses.reset()
        responses.add(responses.GET, CAREEM_BOARD, json=board(gh_job(1)), status=200)
        run = execute_run()

        assert run.jobs_closed == 1
        assert Job.objects.get(key="greenhouse:careem:2").closed_at is not None
        assert Job.objects.get(key="greenhouse:careem:1").closed_at is None

    @responses.activate
    def test_a_reappearing_job_is_reopened(self, careem) -> None:
        responses.add(responses.GET, CAREEM_BOARD, json=board(gh_job(1)), status=200)
        execute_run()
        responses.reset()
        responses.add(responses.GET, CAREEM_BOARD, json=board(), status=200)
        execute_run()
        assert Job.objects.get(key="greenhouse:careem:1").closed_at is not None

        responses.reset()
        responses.add(responses.GET, CAREEM_BOARD, json=board(gh_job(1)), status=200)
        execute_run()

        assert Job.objects.get(key="greenhouse:careem:1").closed_at is None

    @responses.activate
    def test_closed_detection_works_when_two_runs_share_a_timestamp(self, careem) -> None:
        """Comparing timestamps instead of an explicit key set breaks here, and
        also on any backwards clock adjustment."""
        frozen = timezone.now()
        with mock.patch("django.utils.timezone.now", return_value=frozen):
            responses.add(responses.GET, CAREEM_BOARD, json=board(gh_job(1), gh_job(2)), status=200)
            execute_run()

            responses.reset()
            responses.add(responses.GET, CAREEM_BOARD, json=board(gh_job(1)), status=200)
            run = execute_run()

        assert run.jobs_closed == 1
        assert Job.objects.get(key="greenhouse:careem:2").closed_at is not None

    def test_an_additive_source_never_closes_anything(self) -> None:
        """A keyword search is not a full listing of anyone's board."""
        rss = Source.objects.create(kind="rss", url="https://example.com/feed", label="Alerts")
        Job.objects.create(
            key="rss:acme:1",
            source="rss",
            source_ref="rss:https://example.com/feed",
            company="Acme",
            title="Engineer",
        )

        closed = close_missing_jobs(seen_keys=set(), succeeded_sources=[rss])

        assert closed == 0
        assert Job.objects.get(key="rss:acme:1").closed_at is None

    @responses.activate
    def test_two_boards_from_the_same_vendor_are_scoped_separately(self, careem, arbisoft) -> None:
        """Careem and Arbisoft are both Greenhouse. Scoping closures by vendor
        rather than by feed lets one board's outage close the other's jobs."""
        responses.add(responses.GET, CAREEM_BOARD, json=board(gh_job(1)), status=200)
        responses.add(responses.GET, ARBISOFT_BOARD, json=board(gh_job(2)), status=200)
        execute_run()

        careem_job = Job.objects.get(key="greenhouse:careem:1")
        arbisoft_job = Job.objects.get(key="greenhouse:arbisoft:2")
        assert careem_job.source_ref != arbisoft_job.source_ref

        responses.reset()
        responses.add(responses.GET, CAREEM_BOARD, json=board(), status=200)
        responses.add(responses.GET, ARBISOFT_BOARD, json={}, status=503)
        execute_run()

        careem_job.refresh_from_db()
        arbisoft_job.refresh_from_db()
        assert careem_job.closed_at is not None, "Careem's board really was empty"
        assert arbisoft_job.closed_at is None, "Arbisoft's fetch failed — close nothing"

    def test_closing_updates_the_denormalised_user_flag(self, careem, isb_user) -> None:
        """`is_open` backs the dashboard's partial index; letting it drift would
        leave closed jobs on the default view."""
        job = Job.objects.create(
            key="greenhouse:careem:9",
            source="greenhouse",
            source_ref="greenhouse:careem",
            company="Careem",
            title="Engineer",
        )
        UserJob.objects.create(user=isb_user, job=job, is_open=True)

        close_missing_jobs(seen_keys=set(), succeeded_sources=[careem])

        assert UserJob.objects.get(job=job).is_open is False


class TestPerUserScoring:
    @responses.activate
    def test_each_active_user_is_scored(self, careem, user_factory) -> None:
        responses.add(responses.GET, CAREEM_BOARD, json=board(gh_job(1)), status=200)
        user_factory(email="a@example.com")
        user_factory(email="b@example.com")

        run = execute_run()

        assert run.users_scored == 2

    @responses.activate
    def test_an_inactive_user_is_skipped(self, careem, user_factory) -> None:
        responses.add(responses.GET, CAREEM_BOARD, json=board(gh_job(1)), status=200)
        user_factory(email="active@example.com")
        user_factory(email="gone@example.com", is_active=False)

        run = execute_run()

        assert run.users_scored == 1

    @responses.activate
    def test_one_broken_profile_does_not_break_everyone_elses_run(
        self, careem, user_factory
    ) -> None:
        responses.add(responses.GET, CAREEM_BOARD, json=board(gh_job(1)), status=200)
        healthy = user_factory(email="healthy@example.com")
        broken = user_factory(email="broken@example.com")

        original = type(broken.profile).to_domain

        def explode(self):
            if self.user_id == broken.pk:
                raise ValueError("malformed profile")
            return original(self)

        with mock.patch.object(type(broken.profile), "to_domain", explode):
            run = execute_run()

        assert run.users_scored == 1
        assert UserJob.objects.filter(user=healthy).exists()
        assert not UserJob.objects.filter(user=broken).exists()

    @responses.activate
    def test_status_and_notes_survive_a_run_that_rewrites_the_score(self, careem, isb_user) -> None:
        responses.add(responses.GET, CAREEM_BOARD, json=board(gh_job(1)), status=200)
        execute_run()

        user_job = UserJob.objects.get(user=isb_user)
        user_job.status = ApplicationStatus.APPLIED
        user_job.notes = "Applied on Tuesday"
        user_job.save()

        responses.reset()
        responses.add(
            responses.GET,
            CAREEM_BOARD,
            json=board(gh_job(1, title="Associate Software Engineer 1 (Updated)")),
            status=200,
        )
        execute_run()

        user_job.refresh_from_db()
        assert user_job.status == ApplicationStatus.APPLIED
        assert user_job.notes == "Applied on Tuesday"
        assert user_job.job.title == "Associate Software Engineer 1 (Updated)"


class TestRunRecord:
    @responses.activate
    def test_a_run_records_its_counts(self, careem) -> None:
        responses.add(responses.GET, CAREEM_BOARD, json=board(gh_job(1), gh_job(2)), status=200)

        run = execute_run()

        assert run.sources_total == 1
        assert run.postings_fetched == 2
        assert run.jobs_created == 2
        assert run.finished_at is not None
        assert run.duration_seconds is not None

    @responses.activate
    def test_per_source_results_are_kept(self, careem) -> None:
        responses.add(responses.GET, CAREEM_BOARD, json=board(gh_job(1)), status=200)

        run = execute_run()

        result = RunSource.objects.get(run=run)
        assert result.ok is True
        assert result.postings == 1
        assert result.label

    def test_a_run_with_no_sources_still_completes(self) -> None:
        run = execute_run()

        assert run.status == RunStatus.SUCCESS
        assert run.finished_at is not None


class TestLastSuccessfulRun:
    def test_only_successful_runs_count(self) -> None:
        """`last_run_at` going green on a failure hides exactly the failure it
        exists to surface."""
        Run.objects.create(status=RunStatus.SUCCESS, started_at=timezone.now() - timedelta(days=2))
        Run.objects.create(status=RunStatus.FAILED, started_at=timezone.now())

        last = last_successful_run()

        assert last is not None
        assert last.status == RunStatus.SUCCESS

    def test_a_partial_run_counts_as_successful(self) -> None:
        """Most sources delivered; treating it as a failure would cry wolf."""
        Run.objects.create(status=RunStatus.PARTIAL, started_at=timezone.now())

        assert last_successful_run() is not None

    def test_no_runs_at_all(self) -> None:
        assert last_successful_run() is None


class TestRunLock:
    """Two overlapping triggers must result in one run, not two."""

    @responses.activate
    def test_a_second_trigger_while_one_holds_the_lock_is_skipped(self, careem) -> None:
        responses.add(responses.GET, CAREEM_BOARD, json=board(gh_job(1)), status=200)
        cache.add(RUN_LOCK_KEY, "someone-else", 300)

        result = run_now()

        assert result["skipped"] is True
        assert Run.objects.count() == 0

    @responses.activate
    def test_the_lock_is_released_afterwards(self, careem) -> None:
        responses.add(responses.GET, CAREEM_BOARD, json=board(gh_job(1)), status=200)

        run_now()

        assert cache.get(RUN_LOCK_KEY) is None

    @responses.activate
    def test_the_lock_is_released_even_when_the_run_fails(self, careem) -> None:
        with (
            mock.patch("jobs.runner.execute_run", side_effect=RuntimeError("boom")),
            pytest.raises(RuntimeError),
        ):
            run_now()

        assert cache.get(RUN_LOCK_KEY) is None

    @responses.activate
    def test_a_run_can_start_again_after_the_previous_one_finished(self, careem) -> None:
        responses.add(responses.GET, CAREEM_BOARD, json=board(gh_job(1)), status=200)

        run_now()
        second = run_now()

        assert second["skipped"] is False
        assert Run.objects.count() == 2


class TestCatchUp:
    """Beat does not backfill. A weekend of downtime would otherwise be a silent
    gap in the data."""

    def test_a_stale_last_run_triggers_a_catch_up(self, careem) -> None:
        Run.objects.create(status=RunStatus.SUCCESS, started_at=timezone.now() - timedelta(days=3))

        with mock.patch("jobs.tasks.run_now.delay") as delayed:
            result = catch_up_if_stale()

        assert result["triggered"] is True
        delayed.assert_called_once()

    def test_a_recent_run_does_not_trigger_one(self, careem) -> None:
        Run.objects.create(status=RunStatus.SUCCESS, started_at=timezone.now())

        with mock.patch("jobs.tasks.run_now.delay") as delayed:
            result = catch_up_if_stale()

        assert result["triggered"] is False
        delayed.assert_not_called()

    def test_no_runs_at_all_triggers_one(self) -> None:
        """A fresh install should populate itself rather than sit empty."""
        with mock.patch("jobs.tasks.run_now.delay") as delayed:
            result = catch_up_if_stale()

        assert result["triggered"] is True
        delayed.assert_called_once()

    def test_a_failed_run_does_not_count_as_recent(self) -> None:
        Run.objects.create(status=RunStatus.FAILED, started_at=timezone.now())

        with mock.patch("jobs.tasks.run_now.delay") as delayed:
            result = catch_up_if_stale()

        assert result["triggered"] is True
        delayed.assert_called_once()


class TestZeroResults:
    @responses.activate
    def test_a_source_returning_nothing_closes_nothing_for_others(self, careem, arbisoft) -> None:
        responses.add(responses.GET, CAREEM_BOARD, json=board(gh_job(1)), status=200)
        responses.add(responses.GET, ARBISOFT_BOARD, json=board(gh_job(2)), status=200)
        execute_run()

        responses.reset()
        responses.add(responses.GET, CAREEM_BOARD, json=board(gh_job(1)), status=200)
        responses.add(responses.GET, ARBISOFT_BOARD, json=board(), status=200)
        run = execute_run()

        # Arbisoft genuinely returned an empty board, so its job does close —
        # but Careem's is untouched.
        assert Job.objects.get(key="greenhouse:careem:1").closed_at is None
        assert run.status == RunStatus.SUCCESS


class TestPostedAtPreservation:
    @responses.activate
    def test_a_known_date_is_not_overwritten_by_a_later_blank_one(self, careem) -> None:
        responses.add(responses.GET, CAREEM_BOARD, json=board(gh_job(1)), status=200)
        execute_run()
        assert Job.objects.get(key="greenhouse:careem:1").posted_at == date(2026, 8, 13)

        undated = gh_job(1)
        undated["first_published"] = None
        responses.reset()
        responses.add(responses.GET, CAREEM_BOARD, json=board(undated), status=200)
        execute_run()

        assert Job.objects.get(key="greenhouse:careem:1").posted_at == date(2026, 8, 13)
