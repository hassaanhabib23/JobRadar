"""Multi-user data isolation.

The highest-priority tests in the suite. A bug here is a data breach, not an
inconvenience, so they are written now — while there is almost no data to leak
and they are cheap — rather than retrofitted once there is.

The `UserJob` half arrived with milestone 4 and is the most important part: those
rows carry the application history, which is the one thing here that cannot be
re-fetched.
"""

from __future__ import annotations

from datetime import date

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from jobs.models import ApplicationStatus, Job, Source, UserJob
from users.models import Profile

pytestmark = [pytest.mark.django_db, pytest.mark.isolation]

User = get_user_model()


@pytest.fixture
def alice(user_factory):
    return user_factory(email="alice@example.com")


@pytest.fixture
def bob(user_factory):
    return user_factory(email="bob@example.com")


def as_user(user) -> APIClient:
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def make_job(key: str = "greenhouse:careem:1", **overrides) -> Job:
    defaults = {
        "key": key,
        "source": "greenhouse",
        "company": "Careem",
        "title": "Associate Software Engineer",
        "location": "Islamabad, Pakistan",
        "posted_at": date(2026, 8, 13),
    }
    defaults.update(overrides)
    return Job.objects.create(**defaults)


def make_user_job(user, job, **overrides) -> UserJob:
    defaults = {"score": 80, "tier": "High", "is_open": True}
    defaults.update(overrides)
    return UserJob.objects.create(user=user, job=job, **defaults)


class TestUserJobIsolation:
    """The highest-risk area of the whole project."""

    def test_requesting_another_users_job_returns_404_not_403(self, alice, bob) -> None:
        """403 confirms the row exists, which leaks that somebody else has it.

        404 is indistinguishable from an id that was never issued.
        """
        bobs = make_user_job(bob, make_job())

        response = as_user(alice).get(f"/api/jobs/{bobs.pk}/")

        assert response.status_code == 404

    def test_patching_another_users_job_returns_404(self, alice, bob) -> None:
        bobs = make_user_job(bob, make_job())

        response = as_user(alice).patch(
            f"/api/jobs/{bobs.pk}/", {"status": "rejected"}, format="json"
        )

        assert response.status_code == 404
        bobs.refresh_from_db()
        assert bobs.status == ApplicationStatus.NOT_STARTED

    def test_bulk_status_silently_ignores_another_users_ids(self, alice, bob) -> None:
        """Erroring on a foreign id would confirm it exists just as loudly as a 403."""
        bobs = make_user_job(bob, make_job())
        mine = make_user_job(alice, make_job(key="greenhouse:careem:2"))

        response = as_user(alice).post(
            "/api/jobs/bulk_status/",
            {"ids": [mine.pk, bobs.pk], "status": "skipped"},
            format="json",
        )

        assert response.status_code == 200
        assert response.json()["updated"] == 1
        bobs.refresh_from_db()
        assert bobs.status == ApplicationStatus.NOT_STARTED

    @pytest.mark.parametrize(
        "query",
        [
            {},
            {"include_closed": "true"},
            {"min_score": 0},
            {"max_score": 100},
            {"ordering": "score"},
            {"ordering": "-score"},
            {"search": "engineer"},
            {"tier": "High"},
            {"status": "not_started"},
            {"is_new": "true"},
            {"is_new": "false"},
            {"has_date": "true"},
            {"has_date": "false"},
            {"location": "islamabad"},
            {"pinned": "false"},
            {"page_size": 100},
        ],
    )
    def test_alices_list_never_contains_bobs_rows_under_any_filter(
        self, alice, bob, query: dict
    ) -> None:
        """Under *any* filter combination — the parametrisation is the point."""
        shared_job = make_job()
        make_user_job(alice, shared_job)
        bobs = make_user_job(bob, make_job(key="greenhouse:careem:2"))
        make_user_job(bob, shared_job)

        body = as_user(alice).get("/api/jobs/", query).json()

        returned = {row["id"] for row in body["results"]}
        bobs_ids = set(UserJob.objects.filter(user=bob).values_list("pk", flat=True))
        assert not (returned & bobs_ids), f"leaked with query {query}"
        assert bobs.pk not in returned

    def test_the_same_job_row_is_shared_but_the_userjob_rows_are_not(self, alice, bob) -> None:
        """One posting in the world, two private relationships to it."""
        job = make_job()
        make_user_job(alice, job, score=90, status=ApplicationStatus.APPLIED)
        make_user_job(bob, job, score=40)

        alice_row = as_user(alice).get("/api/jobs/").json()["results"][0]
        bob_row = as_user(bob).get("/api/jobs/").json()["results"][0]

        assert alice_row["key"] == bob_row["key"] == job.key
        assert alice_row["score"] == 90
        assert bob_row["score"] == 40
        assert bob_row["status"] == "not_started"
        assert Job.objects.count() == 1

    def test_deleting_a_user_leaves_shared_jobs_and_the_other_users_rows(self, alice, bob) -> None:
        job = make_job()
        make_user_job(alice, job)
        bobs = make_user_job(bob, job)

        alice.delete()

        assert Job.objects.filter(pk=job.pk).exists(), "the posting is global"
        assert UserJob.objects.filter(pk=bobs.pk).exists()
        assert not UserJob.objects.filter(user_id=alice.pk).exists()


class TestPrivateSourceIsolation:
    def test_another_users_private_source_is_not_listed(self, alice, bob) -> None:
        Source.objects.create(kind="greenhouse", slug="bobs-secret", owner=bob)
        Source.objects.create(kind="greenhouse", slug="shared", owner=None)

        slugs = {row["slug"] for row in as_user(alice).get("/api/sources/").json()["results"]}

        assert slugs == {"shared"}

    def test_another_users_private_source_returns_404(self, alice, bob) -> None:
        bobs = Source.objects.create(kind="greenhouse", slug="bobs-secret", owner=bob)

        assert as_user(alice).get(f"/api/sources/{bobs.pk}/").status_code == 404

    def test_another_users_private_source_cannot_be_edited(self, alice, bob) -> None:
        bobs = Source.objects.create(kind="greenhouse", slug="bobs-secret", owner=bob)

        response = as_user(alice).patch(
            f"/api/sources/{bobs.pk}/", {"enabled": False}, format="json"
        )

        assert response.status_code == 404
        bobs.refresh_from_db()
        assert bobs.enabled is True

    def test_another_users_private_source_cannot_be_deleted(self, alice, bob) -> None:
        bobs = Source.objects.create(kind="greenhouse", slug="bobs-secret", owner=bob)

        assert as_user(alice).delete(f"/api/sources/{bobs.pk}/").status_code == 404
        assert Source.objects.filter(pk=bobs.pk).exists()

    def test_creating_a_source_cannot_assign_it_to_another_user(self, alice, bob) -> None:
        """The owner comes from the token, never from the payload."""
        as_user(alice).post(
            "/api/sources/",
            {"kind": "greenhouse", "slug": "planted", "owner": bob.pk},
            format="json",
        )

        assert Source.objects.get(slug="planted").owner_id == alice.pk


class TestProfileIsolation:
    def test_a_user_reads_only_their_own_profile(self, alice, bob) -> None:
        alice.profile.locations_preferred = ["islamabad"]
        alice.profile.save()
        bob.profile.locations_preferred = ["lahore"]
        bob.profile.save()

        response = as_user(alice).get("/api/profile/")

        assert response.status_code == 200
        assert response.json()["locationsPreferred"] == ["islamabad"]

    def test_writing_a_profile_cannot_touch_another_users(self, alice, bob) -> None:
        as_user(alice).patch("/api/profile/", {"locationsPreferred": ["karachi"]}, format="json")

        bob.profile.refresh_from_db()
        assert bob.profile.locations_preferred != ["karachi"]

    def test_a_client_supplied_user_id_is_ignored(self, alice, bob) -> None:
        """No endpoint accepts a user id — the user comes from the token, always."""
        response = as_user(alice).patch(
            "/api/profile/",
            {"user": bob.pk, "id": bob.profile.pk, "locationsPreferred": ["multan"]},
            format="json",
        )

        assert response.status_code == 200
        alice.profile.refresh_from_db()
        bob.profile.refresh_from_db()
        assert alice.profile.locations_preferred == ["multan"]
        assert bob.profile.locations_preferred != ["multan"]
        assert alice.profile.user_id == alice.pk

    def test_the_profile_endpoint_exposes_no_user_identifier(self, alice) -> None:
        """Nothing to guess at, and nothing to enumerate."""
        body = as_user(alice).get("/api/profile/").json()

        assert "user" not in body
        assert "id" not in body


class TestPreviewIsolation:
    def test_preview_scores_against_the_callers_own_profile(self, alice, bob) -> None:
        """The same posting must preview differently for differently-tuned users."""
        alice.profile.skills = {"react": 40.0}
        alice.profile.save()
        bob.profile.skills = {"react": 1.0}
        bob.profile.save()

        payload = {"title": "React Developer", "location": "Islamabad", "description": "React"}
        for_alice = as_user(alice).post("/api/profile/preview/", payload, format="json").json()
        for_bob = as_user(bob).post("/api/profile/preview/", payload, format="json").json()

        assert for_alice["detail"]["stack"] > for_bob["detail"]["stack"]


class TestAccountIsolation:
    def test_me_returns_only_the_authenticated_user(self, alice, bob) -> None:
        body = as_user(alice).get("/api/auth/me/").json()

        assert body["email"] == "alice@example.com"
        assert body["id"] == alice.pk

    def test_a_password_change_does_not_affect_another_user(self, alice, bob) -> None:
        response = as_user(alice).post(
            "/api/auth/password/",
            {"oldPassword": "pa55word!secure", "newPassword": "an0ther!passphrase"},
            format="json",
        )

        assert response.status_code == 204
        bob.refresh_from_db()
        assert bob.check_password("pa55word!secure")

    def test_deleting_a_user_leaves_the_other_intact(self, alice, bob) -> None:
        """Cascade must not reach across users."""
        bob_profile_pk = bob.profile.pk

        alice.delete()

        assert User.objects.filter(pk=bob.pk).exists()
        assert Profile.objects.filter(pk=bob_profile_pk).exists()
        assert not Profile.objects.filter(user_id=alice.pk).exists()


class TestAuthenticationIsRequired:
    @pytest.mark.parametrize(
        ("method", "path"),
        [
            ("get", "/api/profile/"),
            ("put", "/api/profile/"),
            ("patch", "/api/profile/"),
            ("post", "/api/profile/preview/"),
            ("get", "/api/auth/me/"),
            ("patch", "/api/auth/me/"),
            ("post", "/api/auth/password/"),
            ("post", "/api/auth/logout/"),
            ("get", "/api/jobs/"),
            ("get", "/api/jobs/statuses/"),
            ("post", "/api/jobs/bulk_status/"),
            ("get", "/api/sources/"),
            ("post", "/api/sources/"),
        ],
    )
    def test_anonymous_access_is_rejected(self, method: str, path: str) -> None:
        response = getattr(APIClient(), method)(path, {}, format="json")

        assert response.status_code == 401, f"{method.upper()} {path} was reachable anonymously"

    @pytest.mark.parametrize("path", ["/api/health/", "/api/locations/"])
    def test_public_endpoints_stay_public(self, path: str) -> None:
        """Health is for monitors; locations is needed by the register screen."""
        assert APIClient().get(path).status_code == 200

    def test_a_forged_token_is_rejected(self) -> None:
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION="Bearer not-a-real-token")

        assert client.get("/api/auth/me/").status_code == 401


class TestDifferentProfilesScoreDifferently:
    """The reason score lives on UserJob rather than on Job."""

    def test_two_users_score_the_same_posting_differently(self, alice, bob) -> None:
        alice.profile.seed_defaults(locations=("islamabad",), role_keywords=("dotnet",))
        alice.profile.save()
        bob.profile.seed_defaults(locations=("islamabad",), role_keywords=("react",))
        bob.profile.save()

        payload = {
            "title": "Software Engineer",
            "location": "Islamabad",
            "description": "ASP.NET Core and C#",
        }
        for_alice = as_user(alice).post("/api/profile/preview/", payload, format="json").json()
        for_bob = as_user(bob).post("/api/profile/preview/", payload, format="json").json()

        assert for_alice["score"] != for_bob["score"]
        assert for_alice["score"] > for_bob["score"]
