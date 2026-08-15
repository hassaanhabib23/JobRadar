"""Registration, login, refresh, logout and password change."""

from __future__ import annotations

from typing import Any, cast

import pytest
from django.contrib.auth import get_user_model
from django.core.cache import cache
from rest_framework.test import APIClient

from users.models import Profile

pytestmark = pytest.mark.django_db

User = get_user_model()

REGISTRATION: dict[str, Any] = {
    "email": "new@example.com",
    "password": "a-strong-passphrase-42",
    "locations": ["islamabad", "rawalpindi"],
    "roleKeywords": ["dotnet"],
}


@pytest.fixture(autouse=True)
def _clear_throttle_cache():
    """Throttle counters live in the cache and would leak between tests."""
    cache.clear()
    yield
    cache.clear()


class TestRegistration:
    def test_creates_the_user_and_returns_tokens(self, api_client: APIClient) -> None:
        response = api_client.post("/api/auth/register/", REGISTRATION, format="json")

        assert response.status_code == 201
        assert response.json()["user"]["email"] == "new@example.com"
        assert response.json()["access"]
        assert User.objects.filter(email="new@example.com").exists()

    def test_the_refresh_token_goes_in_an_httponly_cookie(self, api_client: APIClient) -> None:
        """Never localStorage — an injected script must not be able to read it."""
        response = api_client.post("/api/auth/register/", REGISTRATION, format="json")

        cookie = response.cookies["jobradar_refresh"]
        assert cookie.value
        assert cookie["httponly"]
        assert cookie["samesite"] == "Lax"
        assert cookie["path"] == "/api/auth/"

    def test_the_refresh_token_is_not_in_the_response_body(self, api_client: APIClient) -> None:
        body = api_client.post("/api/auth/register/", REGISTRATION, format="json").json()

        assert "refresh" not in body

    def test_a_profile_is_created_with_the_chosen_cities(self, api_client: APIClient) -> None:
        api_client.post("/api/auth/register/", REGISTRATION, format="json")

        profile = Profile.objects.get(user__email="new@example.com")
        assert profile.locations_allowed == ["islamabad", "rawalpindi"]
        assert profile.locations_preferred == ["islamabad", "rawalpindi"]
        assert profile.locations_secondary == ["pakistan"]
        assert profile.skills, "a new user must get a working profile, not an empty one"

    def test_role_keywords_pre_weight_their_skills(self, api_client: APIClient) -> None:
        """A blank weight table is a screen nobody fills in."""
        api_client.post("/api/auth/register/", REGISTRATION, format="json")

        profile = Profile.objects.get(user__email="new@example.com")
        assert profile.skills["c#"] > profile.skills["react"]
        assert profile.role_keywords == ["dotnet"]

    def test_registering_without_locations_still_works(self, api_client: APIClient) -> None:
        response = api_client.post(
            "/api/auth/register/",
            {"email": "minimal@example.com", "password": "a-strong-passphrase-42"},
            format="json",
        )

        assert response.status_code == 201
        profile = Profile.objects.get(user__email="minimal@example.com")
        assert profile.locations_allowed == ["islamabad", "rawalpindi"]

    def test_the_password_is_hashed(self, api_client: APIClient) -> None:
        api_client.post("/api/auth/register/", REGISTRATION, format="json")

        user = User.objects.get(email="new@example.com")
        assert user.password != REGISTRATION["password"]
        assert user.check_password(REGISTRATION["password"])

    def test_a_duplicate_email_is_rejected(self, api_client: APIClient, user_factory) -> None:
        user_factory(email="taken@example.com")

        response = api_client.post(
            "/api/auth/register/",
            {"email": "taken@example.com", "password": "a-strong-passphrase-42"},
            format="json",
        )

        assert response.status_code == 400
        assert "email" in response.json()

    def test_email_uniqueness_ignores_case(self, api_client: APIClient, user_factory) -> None:
        user_factory(email="taken@example.com")

        response = api_client.post(
            "/api/auth/register/",
            {"email": "TAKEN@example.com", "password": "a-strong-passphrase-42"},
            format="json",
        )

        assert response.status_code == 400

    def test_a_weak_password_is_rejected(self, api_client: APIClient) -> None:
        response = api_client.post(
            "/api/auth/register/",
            {"email": "weak@example.com", "password": "12345"},
            format="json",
        )

        assert response.status_code == 400
        assert not User.objects.filter(email="weak@example.com").exists()

    def test_an_unknown_location_key_is_rejected(self, api_client: APIClient) -> None:
        response = api_client.post(
            "/api/auth/register/",
            {
                "email": "x@example.com",
                "password": "a-strong-passphrase-42",
                "locations": ["atlantis"],
            },
            format="json",
        )

        assert response.status_code == 400
        assert "locations" in response.json()

    def test_a_failed_registration_creates_nothing(self, api_client: APIClient) -> None:
        """The profile write and the user write share a transaction."""
        before = Profile.objects.count()

        api_client.post(
            "/api/auth/register/",
            {"email": "bad@example.com", "password": "12345"},
            format="json",
        )

        assert Profile.objects.count() == before


class TestLogin:
    def test_valid_credentials_return_an_access_token(
        self, api_client: APIClient, user_factory
    ) -> None:
        user_factory(email="dev@example.com", password="a-strong-passphrase-42")

        response = api_client.post(
            "/api/auth/login/",
            {"email": "dev@example.com", "password": "a-strong-passphrase-42"},
            format="json",
        )

        assert response.status_code == 200
        assert response.json()["access"]
        assert response.cookies["jobradar_refresh"]["httponly"]

    def test_a_wrong_password_is_rejected(self, api_client: APIClient, user_factory) -> None:
        user_factory(email="dev@example.com", password="a-strong-passphrase-42")

        response = api_client.post(
            "/api/auth/login/",
            {"email": "dev@example.com", "password": "wrong"},
            format="json",
        )

        assert response.status_code == 401

    def test_an_unknown_email_looks_identical_to_a_wrong_password(
        self, api_client: APIClient, user_factory
    ) -> None:
        """Distinguishing them tells an attacker which accounts exist."""
        user_factory(email="dev@example.com", password="a-strong-passphrase-42")

        wrong_password = api_client.post(
            "/api/auth/login/",
            {"email": "dev@example.com", "password": "wrong"},
            format="json",
        )
        unknown_email = api_client.post(
            "/api/auth/login/",
            {"email": "nobody@example.com", "password": "wrong"},
            format="json",
        )

        assert wrong_password.status_code == unknown_email.status_code
        assert wrong_password.json() == unknown_email.json()

    def test_an_inactive_user_cannot_log_in(self, api_client: APIClient, user_factory) -> None:
        user_factory(email="gone@example.com", password="a-strong-passphrase-42", is_active=False)

        response = api_client.post(
            "/api/auth/login/",
            {"email": "gone@example.com", "password": "a-strong-passphrase-42"},
            format="json",
        )

        assert response.status_code == 401


class TestRefresh:
    def test_the_cookie_alone_mints_a_new_access_token(
        self, api_client: APIClient, user_factory
    ) -> None:
        user_factory(email="dev@example.com", password="a-strong-passphrase-42")
        api_client.post(
            "/api/auth/login/",
            {"email": "dev@example.com", "password": "a-strong-passphrase-42"},
            format="json",
        )

        # No body — the browser sends only the cookie.
        response = api_client.post("/api/auth/refresh/", {}, format="json")

        assert response.status_code == 200
        assert response.json()["access"]

    def test_the_refresh_token_rotates(self, api_client: APIClient, user_factory) -> None:
        user_factory(email="dev@example.com", password="a-strong-passphrase-42")
        login = api_client.post(
            "/api/auth/login/",
            {"email": "dev@example.com", "password": "a-strong-passphrase-42"},
            format="json",
        )
        original = login.cookies["jobradar_refresh"].value

        response = api_client.post("/api/auth/refresh/", {}, format="json")

        assert response.cookies["jobradar_refresh"].value != original

    def test_no_token_is_a_401(self, api_client: APIClient) -> None:
        assert api_client.post("/api/auth/refresh/", {}, format="json").status_code == 401

    def test_a_garbage_token_clears_the_cookie(self, api_client: APIClient) -> None:
        """A dead cookie makes every future silent refresh fail on a token that
        can never work again."""
        api_client.cookies["jobradar_refresh"] = "not-a-token"

        response = api_client.post("/api/auth/refresh/", {}, format="json")

        assert response.status_code == 401
        assert response.cookies["jobradar_refresh"].value == ""


class TestLogout:
    def test_clears_the_cookie(self, api_client: APIClient, user_factory) -> None:
        user = user_factory(email="dev@example.com", password="a-strong-passphrase-42")
        api_client.post(
            "/api/auth/login/",
            {"email": "dev@example.com", "password": "a-strong-passphrase-42"},
            format="json",
        )
        api_client.force_authenticate(user=user)

        response = api_client.post("/api/auth/logout/", {}, format="json")

        assert response.status_code == 204
        assert response.cookies["jobradar_refresh"].value == ""

    def test_the_old_refresh_token_stops_working(self, api_client: APIClient, user_factory) -> None:
        user = user_factory(email="dev@example.com", password="a-strong-passphrase-42")
        login = api_client.post(
            "/api/auth/login/",
            {"email": "dev@example.com", "password": "a-strong-passphrase-42"},
            format="json",
        )
        refresh = login.cookies["jobradar_refresh"].value
        api_client.force_authenticate(user=user)
        api_client.post("/api/auth/logout/", {}, format="json")

        api_client.force_authenticate(user=None)
        replay = api_client.post("/api/auth/refresh/", {"refresh": refresh}, format="json")

        assert replay.status_code == 401


class TestPasswordChange:
    def test_changes_the_password(self, api_client: APIClient, user_factory) -> None:
        user = user_factory(password="a-strong-passphrase-42")
        api_client.force_authenticate(user=user)

        response = api_client.post(
            "/api/auth/password/",
            {"oldPassword": "a-strong-passphrase-42", "newPassword": "a-different-passphrase-99"},
            format="json",
        )

        assert response.status_code == 204
        user.refresh_from_db()
        assert user.check_password("a-different-passphrase-99")

    def test_the_current_password_must_be_correct(
        self, api_client: APIClient, user_factory
    ) -> None:
        user = user_factory(password="a-strong-passphrase-42")
        api_client.force_authenticate(user=user)

        response = api_client.post(
            "/api/auth/password/",
            {"oldPassword": "wrong", "newPassword": "a-different-passphrase-99"},
            format="json",
        )

        assert response.status_code == 400
        user.refresh_from_db()
        assert user.check_password("a-strong-passphrase-42")

    def test_a_weak_new_password_is_rejected(self, api_client: APIClient, user_factory) -> None:
        user = user_factory(password="a-strong-passphrase-42")
        api_client.force_authenticate(user=user)

        response = api_client.post(
            "/api/auth/password/",
            {"oldPassword": "a-strong-passphrase-42", "newPassword": "12345"},
            format="json",
        )

        assert response.status_code == 400


class TestThrottling:
    """Auth endpoints are rate-limited (NFR11).

    The test settings module sets deliberately low rates so the allowance can be
    exhausted in a few requests. `test_the_real_rates_are_configured` covers the
    production values, which is the part a typo would break.
    """

    def _rate_limit(self, scope: str) -> int:
        from django.conf import settings as django_settings

        rates = cast(dict[str, str], django_settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"])
        return int(rates[scope].split("/")[0])

    def test_registration_is_throttled(self, api_client: APIClient) -> None:
        allowance = self._rate_limit("register")

        for index in range(allowance):
            response = api_client.post(
                "/api/auth/register/",
                {"email": f"u{index}@example.com", "password": "a-strong-passphrase-42"},
                format="json",
            )
            assert response.status_code == 201, response.json()

        blocked = api_client.post(
            "/api/auth/register/",
            {"email": "one-too-many@example.com", "password": "a-strong-passphrase-42"},
            format="json",
        )

        assert blocked.status_code == 429
        assert not User.objects.filter(email="one-too-many@example.com").exists()

    def test_login_is_throttled(self, api_client: APIClient, user_factory) -> None:
        """Brute-forcing a known email must stop before it gets anywhere."""
        user_factory(email="dev@example.com", password="a-strong-passphrase-42")
        attempt = {"email": "dev@example.com", "password": "wrong"}

        for _ in range(self._rate_limit("login")):
            assert api_client.post("/api/auth/login/", attempt, format="json").status_code == 401

        assert api_client.post("/api/auth/login/", attempt, format="json").status_code == 429

    def test_throttling_does_not_leak_across_endpoints(
        self, api_client: APIClient, user_factory
    ) -> None:
        """Exhausting login must not lock a legitimate visitor out of signing up."""
        user_factory(email="dev@example.com", password="a-strong-passphrase-42")
        for _ in range(self._rate_limit("login") + 1):
            api_client.post(
                "/api/auth/login/",
                {"email": "dev@example.com", "password": "wrong"},
                format="json",
            )

        response = api_client.post(
            "/api/auth/register/",
            {"email": "fresh@example.com", "password": "a-strong-passphrase-42"},
            format="json",
        )

        assert response.status_code == 201

    def test_the_real_rates_are_configured(self) -> None:
        """A missing scope silently disables throttling for that endpoint."""
        from config.settings import base

        rates = cast(dict[str, str], base.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"])
        assert rates["register"] and rates["login"]


class TestMe:
    def test_returns_the_onboarding_flag(self, api_client: APIClient, user_factory) -> None:
        api_client.force_authenticate(user=user_factory())

        body = api_client.get("/api/auth/me/").json()

        assert body["onboardingComplete"] is False

    def test_onboarding_can_be_marked_complete(self, api_client: APIClient, user_factory) -> None:
        user = user_factory()
        api_client.force_authenticate(user=user)

        response = api_client.patch("/api/auth/me/", {"onboardingComplete": True}, format="json")

        assert response.json()["onboardingComplete"] is True
        user.refresh_from_db()
        assert user.onboarding_complete is True
