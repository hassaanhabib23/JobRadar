"""Error reporting must not become a data leak.

An error tracker sees a request at the moment it fails, which is exactly when it
holds a password being changed, a reset token being spent, or a JWT being
refreshed. These assert that none of that survives `scrub`.

No network anywhere: `configure` is only ever called with an empty DSN, and
`scrub` is a pure function on a dict.
"""

from __future__ import annotations

from typing import Any

from config.observability import configure, scrub


def event(**overrides: Any) -> dict[str, Any]:
    base: dict[str, Any] = {
        "request": {
            "url": "https://jobradar.example/api/auth/password/",
            "method": "POST",
            "data": {"old_password": "hunter2", "new_password": "hunter3"},
            "cookies": {"jobradar_refresh": "a.real.refresh.token"},
            "headers": {
                "Authorization": "Bearer a.real.access.token",
                "Cookie": "jobradar_refresh=a.real.refresh.token",
                "User-Agent": "Mozilla/5.0",
            },
        },
        "user": {"id": 7, "email": "dev@example.com", "ip_address": "203.0.113.9"},
    }
    base.update(overrides)
    return base


class TestScrub:
    def test_drops_the_request_body_entirely(self) -> None:
        """A stack trace and a URL identify a bug. The payload is user data."""
        cleaned = scrub(event(), {})

        assert cleaned is not None
        assert "data" not in cleaned["request"]

    def test_drops_cookies(self) -> None:
        cleaned = scrub(event(), {})

        assert cleaned is not None
        assert "cookies" not in cleaned["request"]

    def test_redacts_credential_headers(self) -> None:
        cleaned = scrub(event(), {})

        assert cleaned is not None
        headers = cleaned["request"]["headers"]
        assert headers["Authorization"] == "[redacted]"
        assert headers["Cookie"] == "[redacted]"

    def test_keeps_headers_that_help_debugging(self) -> None:
        cleaned = scrub(event(), {})

        assert cleaned is not None
        assert cleaned["request"]["headers"]["User-Agent"] == "Mozilla/5.0"

    def test_removes_identifying_user_fields(self) -> None:
        cleaned = scrub(event(), {})

        assert cleaned is not None
        assert "email" not in cleaned["user"]
        assert "ip_address" not in cleaned["user"]
        # The id stays: it correlates reports without naming anyone.
        assert cleaned["user"]["id"] == 7

    def test_no_secret_survives_anywhere_in_the_event(self) -> None:
        """The catch-all. Any future field carrying a secret trips this."""
        cleaned = scrub(event(), {})

        rendered = repr(cleaned)
        for secret in (
            "hunter2",
            "hunter3",
            "a.real.refresh.token",
            "a.real.access.token",
            "dev@example.com",
            "203.0.113.9",
        ):
            assert secret not in rendered, f"{secret} reached the error tracker"

    def test_survives_an_event_with_no_request_or_user(self) -> None:
        """Errors raised outside a request — a Celery task — look like this."""
        assert scrub({"exception": {}}, {}) == {"exception": {}}

    def test_survives_unexpected_shapes(self) -> None:
        """Sentry's event shape is not a contract; a wrong type must not raise."""
        assert scrub({"request": "not-a-dict", "user": None}, {}) is not None


class TestConfigure:
    def test_does_nothing_without_a_dsn(self) -> None:
        """The default everywhere except production, so it has to be inert."""
        assert configure(dsn="", environment="test") is False

    def test_is_off_in_the_test_settings(self) -> None:
        from django.conf import settings

        assert settings.SENTRY_ENABLED is False
