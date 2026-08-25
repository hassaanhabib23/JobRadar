"""Error tracking.

Entirely opt-in: with no `SENTRY_DSN` this does nothing at all, so development
and CI never send anything anywhere. That is why it lives in `base.py` rather
than only in `prod.py` — a staging host gets it by setting one variable, and a
laptop never does by not setting it.

**The point of the scrubbing below.** An error tracker sees requests at the
moment they fail, which is exactly when they contain a password being changed, a
reset token being spent, or a JWT being refreshed. Sending that to a third party
would be a worse leak than the bug being reported.
"""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)

#: Header and body keys that must never leave this process.
SENSITIVE_KEYS = frozenset(
    {
        "password",
        "old_password",
        "new_password",
        "token",
        "access",
        "refresh",
        "authorization",
        "cookie",
        "set-cookie",
        "email_host_password",
        "django_secret_key",
    }
)


def scrub(event: dict[str, Any], _hint: dict[str, Any]) -> dict[str, Any] | None:
    """Strip credentials and personal data before an event is sent.

    Belt and braces alongside `send_default_pii=False`: that flag stops Sentry
    *attaching* the user and body, and this removes anything that reached the
    event by another route — a header it does not know about, or a value
    interpolated into a log message.
    """
    request = event.get("request")
    if isinstance(request, dict):
        # The body is never useful enough to justify the risk. A stack trace and
        # a URL identify a bug; the payload that triggered it is the user's data.
        request.pop("data", None)
        request.pop("cookies", None)

        headers = request.get("headers")
        if isinstance(headers, dict):
            for name in list(headers):
                if name.lower() in SENSITIVE_KEYS:
                    headers[name] = "[redacted]"

    # Which account hit the bug is not needed to fix it.
    user = event.get("user")
    if isinstance(user, dict):
        for field in ("email", "username", "ip_address"):
            user.pop(field, None)

    return event


def configure(dsn: str, environment: str, release: str = "") -> bool:
    """Start Sentry if a DSN was given. Returns whether it was started."""
    if not dsn:
        return False

    try:
        import sentry_sdk
        from sentry_sdk.integrations.celery import CeleryIntegration
        from sentry_sdk.integrations.django import DjangoIntegration
    except ImportError:  # pragma: no cover - the dependency is declared
        logger.warning("SENTRY_DSN is set but sentry-sdk is not installed")
        return False

    sentry_sdk.init(
        dsn=dsn,
        environment=environment,
        release=release or None,
        # Both, because half this system's work happens in the worker. Errors in
        # a run are invisible to a web-only integration, and a run failing
        # silently is the failure mode that matters most here.
        integrations=[DjangoIntegration(), CeleryIntegration()],
        send_default_pii=False,
        # `scrub` takes plain dicts rather than Sentry's Event/Hint TypedDicts so
        # it stays easy to unit-test with malformed/partial payloads.
        before_send=scrub,  # type: ignore[arg-type]
        # A sample of traces, not all of them: the daily run alone would
        # otherwise burn the quota on one long transaction a day.
        traces_sample_rate=0.05,
    )
    return True
