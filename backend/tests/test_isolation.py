"""Multi-user data isolation.

The highest-priority tests in the suite. A bug here is a data breach, not an
inconvenience, so they are written now — while there is almost no data to leak
and they are cheap — rather than retrofitted once there is.

The `UserJob` half of the suite lands in milestone 4, when that model exists.
What is testable now is every endpoint that already touches user data.
"""

from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

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
