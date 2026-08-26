"""`/api/runs/`, `/api/stats/` and the health endpoint's run age."""

from __future__ import annotations

from datetime import timedelta
from unittest import mock

import pytest
import responses
from django.utils import timezone
from rest_framework.test import APIClient

from jobs.models import ApplicationStatus, Job, Run, RunSource, RunStatus, Source, UserJob
from sources.greenhouse import BOARD_URL

pytestmark = pytest.mark.django_db

CAREEM_BOARD = BOARD_URL.format(slug="careem")


@pytest.fixture
def user(user_factory):
    user = user_factory(email="dev@example.com")
    user.profile.seed_defaults(locations=("islamabad", "rawalpindi"))
    user.profile.save()
    return user


@pytest.fixture
def client(api_client: APIClient, user) -> APIClient:
    api_client.force_authenticate(user=user)
    return api_client


def make_job(key: str = "greenhouse:careem:1", **overrides) -> Job:
    defaults = {
        "key": key,
        "source": "greenhouse",
        "source_ref": "greenhouse:careem",
        "company": "Careem",
        "title": "Associate Software Engineer",
        "location": "Islamabad, Pakistan",
    }
    defaults.update(overrides)
    return Job.objects.create(**defaults)


class TestRunList:
    def test_lists_runs_newest_first(self, client: APIClient) -> None:
        Run.objects.create(status=RunStatus.SUCCESS, started_at=timezone.now() - timedelta(days=1))
        Run.objects.create(status=RunStatus.PARTIAL, started_at=timezone.now())

        results = client.get("/api/runs/").json()["results"]

        assert [row["status"] for row in results] == ["partial", "success"]

    def test_detail_includes_per_source_results(self, client: APIClient) -> None:
        """A failed source must be impossible to miss (FR13)."""
        run = Run.objects.create(status=RunStatus.PARTIAL)
        source = Source.objects.create(kind="greenhouse", slug="careem")
        RunSource.objects.create(
            run=run, source=source, label="Careem", kind="greenhouse", ok=True, postings=12
        )
        RunSource.objects.create(
            run=run,
            source=source,
            label="Arbisoft",
            kind="greenhouse",
            ok=False,
            error="GET ... returned HTTP 503",
        )

        body = client.get(f"/api/runs/{run.pk}/").json()

        assert len(body["sourceResults"]) == 2
        failed = [row for row in body["sourceResults"] if not row["ok"]]
        assert len(failed) == 1
        assert "503" in failed[0]["error"]

    def test_duration_is_exposed(self, client: APIClient) -> None:
        started = timezone.now() - timedelta(seconds=42)
        Run.objects.create(
            status=RunStatus.SUCCESS,
            started_at=started,
            finished_at=started + timedelta(seconds=42),
        )

        assert client.get("/api/runs/").json()["results"][0]["durationSeconds"] == pytest.approx(
            42, abs=1
        )

    @responses.activate
    def test_triggering_a_run_returns_202(self, client: APIClient) -> None:
        Source.objects.create(kind="greenhouse", slug="careem", company="Careem")
        responses.add(responses.GET, CAREEM_BOARD, json={"jobs": []}, status=200)

        response = client.post("/api/runs/", {}, format="json")

        assert response.status_code == 202
        assert Run.objects.count() == 1

    def test_runs_require_authentication(self, api_client: APIClient) -> None:
        assert api_client.get("/api/runs/").status_code == 401
        assert api_client.post("/api/runs/", {}, format="json").status_code == 401


class TestRunTrigger:
    """`hoursOld` — how far back the scraped sources should look."""

    def test_hours_old_reaches_the_task(self, client: APIClient) -> None:
        with mock.patch("jobs.views.run_now.delay") as delayed:
            response = client.post("/api/runs/", {"hoursOld": 168}, format="json")

        assert response.status_code == 202
        assert delayed.call_args.kwargs["hours_old"] == 168

    def test_omitting_it_passes_none(self, client: APIClient) -> None:
        """No override — the scrape uses whatever each source is normally
        configured for, exactly like before this existed."""
        with mock.patch("jobs.views.run_now.delay") as delayed:
            response = client.post("/api/runs/", {}, format="json")

        assert response.status_code == 202
        assert delayed.call_args.kwargs["hours_old"] is None

    def test_zero_is_rejected(self, client: APIClient) -> None:
        """0 means everything since the epoch, not "no limit" — that spelling
        belongs to omitting the field entirely."""
        response = client.post("/api/runs/", {"hoursOld": 0}, format="json")

        assert response.status_code == 400

    def test_a_negative_value_is_rejected(self, client: APIClient) -> None:
        response = client.post("/api/runs/", {"hoursOld": -5}, format="json")

        assert response.status_code == 400


class TestStats:
    def test_counts_only_the_requesting_users_jobs(
        self, client: APIClient, user, user_factory
    ) -> None:
        other = user_factory(email="other@example.com")
        job = make_job()
        UserJob.objects.create(user=user, job=job, score=80, tier="High", is_open=True)
        UserJob.objects.create(user=other, job=job, score=20, tier="Stretch", is_open=True)

        body = client.get("/api/stats/").json()

        assert body["openCount"] == 1
        assert body["byTier"] == {"High": 1}
        assert body["avgScore"] == 80

    def test_new_today_counts_only_new_rows(self, client: APIClient, user) -> None:
        UserJob.objects.create(user=user, job=make_job(), is_open=True, is_new=True)
        UserJob.objects.create(
            user=user, job=make_job("greenhouse:careem:2"), is_open=True, is_new=False
        )

        assert client.get("/api/stats/").json()["newToday"] == 1

    def test_closed_jobs_are_excluded(self, client: APIClient, user) -> None:
        UserJob.objects.create(user=user, job=make_job(), is_open=False)

        assert client.get("/api/stats/").json()["openCount"] == 0

    def test_by_status_and_by_source_are_grouped(self, client: APIClient, user) -> None:
        UserJob.objects.create(
            user=user, job=make_job(), is_open=True, status=ApplicationStatus.APPLIED
        )
        UserJob.objects.create(user=user, job=make_job("greenhouse:careem:2"), is_open=True)

        body = client.get("/api/stats/").json()

        assert body["byStatus"] == {"applied": 1, "not_started": 1}
        assert body["bySource"] == {"greenhouse": 2}

    def test_status_keys_are_not_camelised(self, client: APIClient, user) -> None:
        """`by_status` is keyed by status *value*, not by field name.

        The client also receives `not_started` verbatim from
        /api/jobs/statuses/. Camelising it here to `notStarted` would leave the
        frontend unable to match the two, and the bug would look like a missing
        label rather than a serialisation problem.
        """
        UserJob.objects.create(user=user, job=make_job(), is_open=True)

        body = client.get("/api/stats/").json()

        assert "not_started" in body["byStatus"]
        assert "notStarted" not in body["byStatus"]

    def test_the_score_histogram_covers_every_decile(self, client: APIClient, user) -> None:
        UserJob.objects.create(user=user, job=make_job(), score=85, is_open=True)

        histogram = client.get("/api/stats/").json()["scoreHistogram"]

        assert len(histogram) == 10
        assert sum(bucket["count"] for bucket in histogram) == 1
        assert next(b for b in histogram if b["min"] == 80)["count"] == 1

    def test_last_run_at_reflects_only_successful_runs(self, client: APIClient) -> None:
        """A failed run going green here would hide exactly the failure this
        element exists to surface."""
        success_at = timezone.now() - timedelta(hours=5)
        Run.objects.create(status=RunStatus.SUCCESS, started_at=success_at)
        Run.objects.create(status=RunStatus.FAILED, started_at=timezone.now())

        last_run_at = client.get("/api/stats/").json()["lastRunAt"]

        assert last_run_at.startswith(success_at.strftime("%Y-%m-%dT%H:%M"))

    def test_last_run_at_is_null_before_any_run(self, client: APIClient) -> None:
        assert client.get("/api/stats/").json()["lastRunAt"] is None

    def test_stats_require_authentication(self, api_client: APIClient) -> None:
        assert api_client.get("/api/stats/").status_code == 401


class TestHealthReportsRunAge:
    def test_reports_the_age_of_the_last_successful_run(self, api_client: APIClient) -> None:
        """The cheapest possible monitoring: a worker that quietly died shows up
        as a growing number long before anyone notices missing jobs."""
        Run.objects.create(status=RunStatus.SUCCESS, started_at=timezone.now() - timedelta(hours=3))

        age = api_client.get("/api/health/").json()["lastSuccessfulRunAgeSeconds"]

        assert age == pytest.approx(3 * 3600, abs=60)

    def test_is_null_when_nothing_has_ever_run(self, api_client: APIClient) -> None:
        assert api_client.get("/api/health/").json()["lastSuccessfulRunAgeSeconds"] is None

    def test_a_failed_run_does_not_reset_the_age(self, api_client: APIClient) -> None:
        Run.objects.create(status=RunStatus.SUCCESS, started_at=timezone.now() - timedelta(days=2))
        Run.objects.create(status=RunStatus.FAILED, started_at=timezone.now())

        age = api_client.get("/api/health/").json()["lastSuccessfulRunAgeSeconds"]

        assert age > 3600, "a failed run must not make the system look healthy"
