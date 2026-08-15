"""The job list, detail, status updates and source management."""

from __future__ import annotations

from datetime import date, timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from jobs.models import ApplicationStatus, Job, Source, UserJob

pytestmark = pytest.mark.django_db


def make_job(**overrides) -> Job:
    defaults = {
        "key": overrides.pop("key", None) or f"greenhouse:careem:{Job.objects.count() + 1}",
        "source": "greenhouse",
        "company": "Careem",
        "title": "Associate Software Engineer",
        "location": "Islamabad, Pakistan",
        "url": "https://example.com/job",
        "posted_at": date(2026, 8, 13),
    }
    defaults.update(overrides)
    return Job.objects.create(**defaults)


def make_user_job(user, job, **overrides) -> UserJob:
    defaults = {
        "score": 80,
        "tier": "High",
        "detail": {"stack": 30.0, "level": 20.0, "location": 20.0, "fresh": 10.0},
        "flags": [],
        "is_open": True,
    }
    defaults.update(overrides)
    return UserJob.objects.create(user=user, job=job, **defaults)


@pytest.fixture
def user(user_factory):
    return user_factory(email="dev@example.com")


@pytest.fixture
def client(api_client: APIClient, user) -> APIClient:
    api_client.force_authenticate(user=user)
    return api_client


class TestJobList:
    def test_returns_the_flattened_shape(self, client: APIClient, user) -> None:
        """The client never sees the Job / UserJob split — that is storage."""
        make_user_job(user, make_job())

        row = client.get("/api/jobs/").json()["results"][0]

        assert row["company"] == "Careem"
        assert row["title"] == "Associate Software Engineer"
        assert row["score"] == 80
        assert row["tier"] == "High"
        assert row["status"] == "not_started"
        assert row["postedAt"] == "2026-08-13"
        assert "detail" in row and "flags" in row

    def test_is_paginated_in_drfs_shape(self, client: APIClient, user) -> None:
        for _ in range(3):
            make_user_job(user, make_job())

        body = client.get("/api/jobs/", {"page_size": 2}).json()

        assert set(body) == {"count", "next", "previous", "results"}
        assert body["count"] == 3

    def test_closed_jobs_are_excluded_by_default(self, client: APIClient, user) -> None:
        make_user_job(user, make_job(), is_open=True)
        make_user_job(user, make_job(closed_at=timezone.now()), is_open=False)

        assert client.get("/api/jobs/").json()["count"] == 1
        assert client.get("/api/jobs/", {"include_closed": "true"}).json()["count"] == 2

    def test_defaults_to_highest_score_first(self, client: APIClient, user) -> None:
        make_user_job(user, make_job(), score=40)
        make_user_job(user, make_job(), score=90)

        scores = [row["score"] for row in client.get("/api/jobs/").json()["results"]]

        assert scores == [90, 40]

    def test_does_not_issue_a_query_per_row(
        self, client: APIClient, user, django_assert_max_num_queries
    ) -> None:
        """A 50-row page without select_related is 51 queries."""
        for _ in range(25):
            make_user_job(user, make_job())

        with django_assert_max_num_queries(6):
            client.get("/api/jobs/")


class TestFilters:
    def test_by_tier(self, client: APIClient, user) -> None:
        make_user_job(user, make_job(), tier="High")
        make_user_job(user, make_job(), tier="Stretch")

        assert client.get("/api/jobs/", {"tier": "High"}).json()["count"] == 1

    def test_by_score_range(self, client: APIClient, user) -> None:
        make_user_job(user, make_job(), score=30)
        make_user_job(user, make_job(), score=85)

        assert client.get("/api/jobs/", {"min_score": 50}).json()["count"] == 1
        assert client.get("/api/jobs/", {"max_score": 50}).json()["count"] == 1

    def test_by_status(self, client: APIClient, user) -> None:
        make_user_job(user, make_job(), status=ApplicationStatus.APPLIED)
        make_user_job(user, make_job())

        assert client.get("/api/jobs/", {"status": "applied"}).json()["count"] == 1

    def test_by_new_only(self, client: APIClient, user) -> None:
        make_user_job(user, make_job(), is_new=True)
        make_user_job(user, make_job(), is_new=False)

        assert client.get("/api/jobs/", {"is_new": "true"}).json()["count"] == 1

    def test_by_flag_uses_the_gin_index(self, client: APIClient, user) -> None:
        make_user_job(user, make_job(), flags=["ghost?"])
        make_user_job(user, make_job(), flags=[])

        assert client.get("/api/jobs/", {"flag": "ghost?"}).json()["count"] == 1

    def test_by_location_matches_aliases(self, client: APIClient, user) -> None:
        """A posting reading "Pindi" is still Rawalpindi."""
        make_user_job(user, make_job(location="Pindi office"))
        make_user_job(user, make_job(location="Karachi"))

        assert client.get("/api/jobs/", {"location": "rawalpindi"}).json()["count"] == 1

    def test_full_text_search(self, client: APIClient, user) -> None:
        make_user_job(user, make_job(title="Associate Software Engineer"))
        make_user_job(user, make_job(title="Warehouse Supervisor"))

        assert client.get("/api/jobs/", {"search": "software"}).json()["count"] == 1

    def test_search_covers_company_and_location_too(self, client: APIClient, user) -> None:
        make_user_job(user, make_job(company="Arbisoft", title="QA Engineer"))
        make_user_job(user, make_job(company="Careem", title="QA Engineer"))

        assert client.get("/api/jobs/", {"search": "arbisoft"}).json()["count"] == 1

    def test_has_date_excludes_inferred_ages_as_well_as_nulls(
        self, client: APIClient, user
    ) -> None:
        """An estimate is not a real date."""
        make_user_job(user, make_job(posted_at=date(2026, 8, 13)), detail={"age_inferred": False})
        make_user_job(user, make_job(posted_at=None), detail={"age_inferred": False})
        make_user_job(user, make_job(posted_at=date(2026, 8, 13)), detail={"age_inferred": True})

        assert client.get("/api/jobs/", {"has_date": "true"}).json()["count"] == 1
        assert client.get("/api/jobs/", {"has_date": "false"}).json()["count"] == 2

    def test_filters_combine(self, client: APIClient, user) -> None:
        make_user_job(user, make_job(title="React Developer"), tier="High", score=90)
        make_user_job(user, make_job(title="React Developer"), tier="Stretch", score=30)

        body = client.get("/api/jobs/", {"search": "react", "tier": "High"}).json()

        assert body["count"] == 1


class TestOrdering:
    @pytest.mark.parametrize(("ordering", "expected"), [("score", [40, 90]), ("-score", [90, 40])])
    def test_by_score(self, client: APIClient, user, ordering: str, expected: list[int]) -> None:
        make_user_job(user, make_job(), score=40)
        make_user_job(user, make_job(), score=90)

        rows = client.get("/api/jobs/", {"ordering": ordering}).json()["results"]

        assert [row["score"] for row in rows] == expected

    def test_by_company(self, client: APIClient, user) -> None:
        make_user_job(user, make_job(company="Zephyr"))
        make_user_job(user, make_job(company="Arbisoft"))

        rows = client.get("/api/jobs/", {"ordering": "company"}).json()["results"]

        assert [row["company"] for row in rows] == ["Arbisoft", "Zephyr"]

    def test_undated_jobs_sort_last_not_first(self, client: APIClient, user) -> None:
        """Nulls first would put every scraped result at the top of a date sort."""
        make_user_job(user, make_job(posted_at=None))
        make_user_job(user, make_job(posted_at=date(2026, 8, 14)))

        rows = client.get("/api/jobs/", {"ordering": "-posted_at"}).json()["results"]

        assert rows[0]["postedAt"] == "2026-08-14"
        assert rows[-1]["postedAt"] is None

    def test_an_unknown_ordering_falls_back_rather_than_erroring(
        self, client: APIClient, user
    ) -> None:
        make_user_job(user, make_job())

        assert client.get("/api/jobs/", {"ordering": "; DROP TABLE"}).status_code == 200


class TestStatusUpdates:
    def test_setting_a_status(self, client: APIClient, user) -> None:
        user_job = make_user_job(user, make_job())

        response = client.patch(f"/api/jobs/{user_job.pk}/", {"status": "applied"}, format="json")

        assert response.status_code == 200
        assert response.json()["status"] == "applied"
        user_job.refresh_from_db()
        assert user_job.status == ApplicationStatus.APPLIED

    def test_writing_notes(self, client: APIClient, user) -> None:
        user_job = make_user_job(user, make_job())

        client.patch(f"/api/jobs/{user_job.pk}/", {"notes": "Follow up"}, format="json")

        user_job.refresh_from_db()
        assert user_job.notes == "Follow up"

    def test_the_score_cannot_be_written_by_the_client(self, client: APIClient, user) -> None:
        """Only the run computes scores."""
        user_job = make_user_job(user, make_job(), score=80)

        client.patch(f"/api/jobs/{user_job.pk}/", {"score": 100}, format="json")

        user_job.refresh_from_db()
        assert user_job.score == 80

    def test_an_invalid_status_is_rejected(self, client: APIClient, user) -> None:
        user_job = make_user_job(user, make_job())

        response = client.patch(f"/api/jobs/{user_job.pk}/", {"status": "vibing"}, format="json")

        assert response.status_code == 400

    def test_bulk_status(self, client: APIClient, user) -> None:
        ids = [make_user_job(user, make_job()).pk for _ in range(3)]

        response = client.post(
            "/api/jobs/bulk_status/", {"ids": ids, "status": "skipped"}, format="json"
        )

        assert response.json()["updated"] == 3
        assert UserJob.objects.filter(status="skipped").count() == 3

    def test_statuses_are_exposed_with_labels(self, client: APIClient) -> None:
        """So the frontend never hardcodes them."""
        body = client.get("/api/jobs/statuses/").json()

        values = {entry["value"] for entry in body}
        assert values == {
            "not_started",
            "researching",
            "cv_tailored",
            "applied",
            "assessment",
            "interviewing",
            "offer",
            "rejected",
            "skipped",
        }
        assert all(entry["label"] for entry in body)


class TestJobDetail:
    def test_returns_the_full_record(self, client: APIClient, user) -> None:
        user_job = make_user_job(user, make_job(), flags=["ghost?"])

        body = client.get(f"/api/jobs/{user_job.pk}/").json()

        assert body["id"] == user_job.pk
        assert body["flags"] == ["ghost?"]
        assert body["seenCount"] == 1

    def test_html_in_a_title_is_returned_as_data_not_markup(self, client: APIClient, user) -> None:
        """A job title containing </script> must not be able to break the page."""
        user_job = make_user_job(user, make_job(title="Engineer </script><script>alert(1)"))

        body = client.get(f"/api/jobs/{user_job.pk}/").json()

        # JSON-encoded, so it arrives as text for React to escape on render.
        assert body["title"] == "Engineer </script><script>alert(1)"

    def test_four_byte_characters_survive_a_round_trip(self, client: APIClient, user) -> None:
        """Em-dashes and emoji — utf8mb4 territory, free on Postgres."""
        title = "Engineer — Backend 🚀"
        user_job = make_user_job(user, make_job(title=title))

        assert client.get(f"/api/jobs/{user_job.pk}/").json()["title"] == title


class TestSources:
    def test_a_user_sees_shared_sources(self, client: APIClient) -> None:
        Source.objects.create(kind="greenhouse", slug="careem", owner=None)

        body = client.get("/api/sources/").json()

        assert body["count"] == 1
        assert body["results"][0]["isShared"] is True

    def test_a_user_can_add_a_private_source(self, client: APIClient, user) -> None:
        response = client.post(
            "/api/sources/", {"kind": "greenhouse", "slug": "arbisoft"}, format="json"
        )

        assert response.status_code == 201
        assert Source.objects.get(slug="arbisoft").owner_id == user.pk

    def test_a_shared_source_cannot_be_edited_through_the_api(self, client: APIClient) -> None:
        shared = Source.objects.create(kind="greenhouse", slug="careem", owner=None)

        response = client.patch(f"/api/sources/{shared.pk}/", {"enabled": False}, format="json")

        assert response.status_code == 403
        shared.refresh_from_db()
        assert shared.enabled is True

    def test_a_user_can_disable_their_own_source(self, client: APIClient, user) -> None:
        mine = Source.objects.create(kind="greenhouse", slug="mine", owner=user)

        response = client.patch(f"/api/sources/{mine.pk}/", {"enabled": False}, format="json")

        assert response.status_code == 200
        mine.refresh_from_db()
        assert mine.enabled is False


class TestTrackingDaysDisplay:
    def test_a_ghost_flag_reaches_the_client(self, client: APIClient, user) -> None:
        make_user_job(
            user,
            make_job(),
            flags=["ghost?"],
            first_seen_by_user=timezone.now() - timedelta(days=30),
            tracking_days=30,
        )

        row = client.get("/api/jobs/").json()["results"][0]

        assert "ghost?" in row["flags"]
        assert row["trackingDays"] == 30
