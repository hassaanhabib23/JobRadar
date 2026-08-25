"""Password reset and email verification.

The security properties matter more than the happy path here, so most of this
file is about what the endpoints refuse to do:

* the request endpoint answers identically whether or not the account exists,
* a link works once and then never again,
* a link expires,
* and neither endpoint is an open relay for mailing strangers.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

import pytest
from django.contrib.auth import get_user_model
from django.core import mail
from django.core.cache import cache
from django.utils import timezone as django_timezone
from rest_framework.test import APIClient

from users.tokens import email_verification_token, encode_uid, password_reset_token

pytestmark = pytest.mark.django_db

User = get_user_model()

NEW_PASSWORD = "a-brand-new-passphrase-99"


@pytest.fixture(autouse=True)
def _clear_throttle_cache():
    cache.clear()
    yield
    cache.clear()


@pytest.fixture(autouse=True)
def _empty_outbox():
    mail.outbox.clear()
    yield


def request_reset(client: APIClient, email: str) -> Any:
    return client.post("/api/auth/password/reset/", {"email": email}, format="json")


def link_parts(user: Any) -> tuple[str, str]:
    return encode_uid(user), password_reset_token.make_token(user)


class TestResetRequest:
    def test_emails_a_link_to_a_real_account(self, api_client: APIClient, user_factory) -> None:
        user_factory(email="dev@example.com")

        response = request_reset(api_client, "dev@example.com")

        assert response.status_code == 204
        assert len(mail.outbox) == 1
        assert mail.outbox[0].to == ["dev@example.com"]
        assert "/reset-password" in mail.outbox[0].body

    def test_says_nothing_about_whether_the_account_exists(
        self, api_client: APIClient, user_factory
    ) -> None:
        """The response must be byte-identical for a real and a fake address.

        Otherwise this endpoint answers "is this person registered?" for anyone
        who asks, which is exactly what the login endpoint already refuses to
        leak.
        """
        user_factory(email="real@example.com")

        real = request_reset(api_client, "real@example.com")
        cache.clear()  # the throttle, not the behaviour under test
        missing = request_reset(api_client, "nobody@example.com")

        assert real.status_code == missing.status_code == 204
        assert real.content == missing.content

    def test_sends_nothing_to_an_address_with_no_account(self, api_client: APIClient) -> None:
        request_reset(api_client, "nobody@example.com")

        assert mail.outbox == []

    def test_matches_the_address_regardless_of_case(
        self, api_client: APIClient, user_factory
    ) -> None:
        user_factory(email="dev@example.com")

        assert request_reset(api_client, "DEV@Example.com").status_code == 204
        assert len(mail.outbox) == 1

    def test_is_throttled(self, api_client: APIClient, user_factory) -> None:
        """3/hour under test settings; 5/hour in production.

        Unauthenticated, and it sends mail to an address the caller picks. An
        unlimited version is an email bomb aimed at anyone.
        """
        user_factory(email="dev@example.com")

        codes = [request_reset(api_client, "dev@example.com").status_code for _ in range(4)]

        assert codes[:3] == [204, 204, 204]
        assert codes[3] == 429

    def test_rejects_a_malformed_address(self, api_client: APIClient) -> None:
        assert request_reset(api_client, "not-an-email").status_code == 400


class TestResetConfirm:
    def test_sets_the_new_password(self, api_client: APIClient, user_factory) -> None:
        user = user_factory(email="dev@example.com", password="old-passphrase-11")
        uid, token = link_parts(user)

        response = api_client.post(
            "/api/auth/password/reset/confirm/",
            {"uid": uid, "token": token, "password": NEW_PASSWORD},
            format="json",
        )

        assert response.status_code == 204
        user.refresh_from_db()
        assert user.check_password(NEW_PASSWORD)

    def test_the_new_password_works_on_login(self, api_client: APIClient, user_factory) -> None:
        user = user_factory(email="dev@example.com", password="old-passphrase-11")
        uid, token = link_parts(user)
        api_client.post(
            "/api/auth/password/reset/confirm/",
            {"uid": uid, "token": token, "password": NEW_PASSWORD},
            format="json",
        )

        login = api_client.post(
            "/api/auth/login/",
            {"email": "dev@example.com", "password": NEW_PASSWORD},
            format="json",
        )

        assert login.status_code == 200

    def test_a_link_cannot_be_used_twice(self, api_client: APIClient, user_factory) -> None:
        """Single-use falls out of the token hashing the password.

        Using the link changes the password, which changes the hash, which
        invalidates the token that was just spent.
        """
        user = user_factory(email="dev@example.com", password="old-passphrase-11")
        uid, token = link_parts(user)
        payload = {"uid": uid, "token": token, "password": NEW_PASSWORD}

        first = api_client.post("/api/auth/password/reset/confirm/", payload, format="json")
        second = api_client.post("/api/auth/password/reset/confirm/", payload, format="json")

        assert first.status_code == 204
        assert second.status_code == 400

    def test_a_token_from_one_account_does_not_work_on_another(
        self, api_client: APIClient, user_factory
    ) -> None:
        victim = user_factory(email="victim@example.com")
        attacker = user_factory(email="attacker@example.com")

        response = api_client.post(
            "/api/auth/password/reset/confirm/",
            {
                "uid": encode_uid(victim),
                "token": password_reset_token.make_token(attacker),
                "password": NEW_PASSWORD,
            },
            format="json",
        )

        assert response.status_code == 400
        victim.refresh_from_db()
        assert not victim.check_password(NEW_PASSWORD)

    def test_a_link_expires(self, api_client: APIClient, user_factory, monkeypatch) -> None:
        """Minted two hours ago, checked against the real one-hour timeout.

        Deliberately not `sleep()` with a shortened timeout: the token's
        timestamp has one-second granularity, so that races on sub-second
        rounding and fails a few percent of the time. Moving the clock back
        while minting is exact, and it exercises the production value rather
        than an overridden one.
        """
        user = user_factory(email="dev@example.com")

        two_hours_ago = datetime.now() - timedelta(hours=2)
        monkeypatch.setattr(password_reset_token, "_now", lambda: two_hours_ago)
        token = password_reset_token.make_token(user)
        monkeypatch.undo()

        response = api_client.post(
            "/api/auth/password/reset/confirm/",
            {"uid": encode_uid(user), "token": token, "password": NEW_PASSWORD},
            format="json",
        )

        assert response.status_code == 400
        user.refresh_from_db()
        assert not user.check_password(NEW_PASSWORD)

    def test_a_link_minted_just_now_still_works(
        self, api_client: APIClient, user_factory, monkeypatch
    ) -> None:
        """The other side of the expiry boundary.

        Without this, `test_a_link_expires` would still pass if the timeout were
        misconfigured to zero and every link were born dead.
        """
        user = user_factory(email="dev@example.com")

        just_inside = datetime.now() - timedelta(minutes=59)
        monkeypatch.setattr(password_reset_token, "_now", lambda: just_inside)
        token = password_reset_token.make_token(user)
        monkeypatch.undo()

        response = api_client.post(
            "/api/auth/password/reset/confirm/",
            {"uid": encode_uid(user), "token": token, "password": NEW_PASSWORD},
            format="json",
        )

        assert response.status_code == 204

    def test_rejects_a_garbage_uid_without_raising(self, api_client: APIClient) -> None:
        response = api_client.post(
            "/api/auth/password/reset/confirm/",
            {"uid": "!!!not-base64!!!", "token": "whatever", "password": NEW_PASSWORD},
            format="json",
        )

        assert response.status_code == 400

    def test_enforces_password_strength(self, api_client: APIClient, user_factory) -> None:
        user = user_factory(email="dev@example.com")
        uid, token = link_parts(user)

        response = api_client.post(
            "/api/auth/password/reset/confirm/",
            {"uid": uid, "token": token, "password": "123"},
            format="json",
        )

        assert response.status_code == 400
        user.refresh_from_db()
        assert not user.check_password("123")


class TestEmailVerification:
    def test_registration_sends_a_verification_email(self, api_client: APIClient) -> None:
        api_client.post(
            "/api/auth/register/",
            {"email": "new@example.com", "password": "a-strong-passphrase-42"},
            format="json",
        )

        assert len(mail.outbox) == 1
        assert mail.outbox[0].to == ["new@example.com"]
        assert "/verify-email" in mail.outbox[0].body

    def test_a_new_account_starts_unverified(self, api_client: APIClient) -> None:
        api_client.post(
            "/api/auth/register/",
            {"email": "new@example.com", "password": "a-strong-passphrase-42"},
            format="json",
        )

        assert User.objects.get(email="new@example.com").email_verified_at is None

    def test_an_unverified_user_can_still_use_the_app(self, api_client: APIClient) -> None:
        """Soft gate. Verification withholds the digest, not the product."""
        registered = api_client.post(
            "/api/auth/register/",
            {"email": "new@example.com", "password": "a-strong-passphrase-42"},
            format="json",
        )
        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {registered.json()['access']}")

        assert api_client.get("/api/jobs/").status_code == 200
        assert api_client.get("/api/auth/me/").json()["emailVerified"] is False

    def test_confirming_marks_the_address_verified(
        self, api_client: APIClient, user_factory
    ) -> None:
        user = user_factory(email="dev@example.com")

        response = api_client.post(
            "/api/auth/email/verify/",
            {"uid": encode_uid(user), "token": email_verification_token.make_token(user)},
            format="json",
        )

        assert response.status_code == 204
        user.refresh_from_db()
        assert user.email_verified_at is not None

    def test_a_verification_link_cannot_be_replayed(
        self, api_client: APIClient, user_factory
    ) -> None:
        user = user_factory(email="dev@example.com")
        payload = {"uid": encode_uid(user), "token": email_verification_token.make_token(user)}

        first = api_client.post("/api/auth/email/verify/", payload, format="json")
        second = api_client.post("/api/auth/email/verify/", payload, format="json")

        assert first.status_code == 204
        # The hash covers `email_verified_at`, so confirming changes it and the
        # spent link stops matching.
        assert second.status_code == 400

    def test_a_reset_token_is_not_a_verification_token(
        self, api_client: APIClient, user_factory
    ) -> None:
        """Two generators, two purposes. One must never satisfy the other."""
        user = user_factory(email="dev@example.com")

        response = api_client.post(
            "/api/auth/email/verify/",
            {"uid": encode_uid(user), "token": password_reset_token.make_token(user)},
            format="json",
        )

        assert response.status_code == 400
        user.refresh_from_db()
        assert user.email_verified_at is None

    def test_resend_requires_authentication(self, api_client: APIClient) -> None:
        assert api_client.post("/api/auth/email/verify/resend/").status_code == 401

    def test_resend_sends_to_the_authenticated_user_only(
        self, api_client: APIClient, user_factory
    ) -> None:
        """No address in the body — it comes from the token.

        Accepting an address here would turn an authenticated endpoint into a
        way to mail anyone.
        """
        user = user_factory(email="dev@example.com")
        api_client.force_authenticate(user=user)

        response = api_client.post(
            "/api/auth/email/verify/resend/", {"email": "someone@else.com"}, format="json"
        )

        assert response.status_code == 204
        assert [message.to for message in mail.outbox] == [["dev@example.com"]]

    def test_resend_does_nothing_once_verified(self, api_client: APIClient, user_factory) -> None:
        user = user_factory(email="dev@example.com")
        user.email_verified_at = django_timezone.now()
        user.save(update_fields=["email_verified_at"])
        api_client.force_authenticate(user=user)

        response = api_client.post("/api/auth/email/verify/resend/")

        assert response.status_code == 204
        assert mail.outbox == []
