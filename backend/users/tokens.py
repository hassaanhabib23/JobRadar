"""Signed, expiring, single-use links.

Both generators are Django's `PasswordResetTokenGenerator`, which is worth
understanding rather than replacing: the token is an HMAC over a few fields of
the user row plus a timestamp, keyed by `SECRET_KEY`. Nothing is stored.

That has two properties a hand-rolled token table would have to reimplement and
would probably get wrong:

* **Self-invalidating.** The hash covers the current password hash, so using a
  reset link changes the password, which changes the hash, which kills every
  outstanding link for that user — including the one just used. Single-use for
  free, with no row to clean up.
* **Expiring.** The timestamp is checked against `PASSWORD_RESET_TIMEOUT`
  (one hour here, not Django's three-day default).
"""

from __future__ import annotations

from typing import Any

from django.contrib.auth.tokens import PasswordResetTokenGenerator
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode

from users.models import User

password_reset_token = PasswordResetTokenGenerator()


class EmailVerificationTokenGenerator(PasswordResetTokenGenerator):
    """Same machinery, different fields under the hash.

    Deliberately **not** hashing the password: a user should still be able to
    confirm their address after changing their password. What it does hash is
    the address itself and whether it is already verified, so a link dies once
    used and is void if the address changes before it is clicked.
    """

    def _make_hash_value(self, user: Any, timestamp: int) -> str:
        verified = user.email_verified_at
        return f"{user.pk}{user.email}{verified}{timestamp}"


email_verification_token = EmailVerificationTokenGenerator()


def encode_uid(user: Any) -> str:
    """The user id, url-safe. Not a secret — the token is what proves anything."""
    return urlsafe_base64_encode(force_bytes(user.pk))


def decode_uid(uid: str) -> User | None:
    """The user a `uid` refers to, or None.

    Returns None for anything malformed rather than raising, because every
    caller is handling attacker-supplied input and treats "no such user" and
    "not a valid uid" identically.
    """
    try:
        pk = urlsafe_base64_decode(uid).decode()
    except (TypeError, ValueError, OverflowError, UnicodeDecodeError):
        return None

    try:
        return User.objects.get(pk=pk)
    except (User.DoesNotExist, ValueError, OverflowError):
        return None
