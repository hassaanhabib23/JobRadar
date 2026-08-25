"""When mail goes out.

Everything is a task, never an inline call from a request thread. SMTP is a
network hop to somebody else's server: it can hang for the full `EMAIL_TIMEOUT`
or fail outright, and neither may turn a registration into a 500 or stall a run.

Tasks take a **user id, not a user object** — a serialised model in a queue is a
snapshot that may already be stale by the time a worker picks it up.
"""

from __future__ import annotations

import logging

from celery import shared_task

from notifications.send import absolute_url, send_email

logger = logging.getLogger(__name__)


@shared_task(name="notifications.send_password_reset", bind=True, max_retries=3)
def send_password_reset(self: object, user_id: int) -> bool:
    """The reset link for one user.

    Enqueued only after the address has been matched to an account, so this
    never has to decide whether the user exists — that judgement (and the
    silence when they do not) belongs at the endpoint.
    """
    from users.models import User
    from users.tokens import encode_uid, password_reset_token

    user = User.objects.filter(pk=user_id).first()
    if user is None:
        # Deleted between the request and the worker picking this up. Not worth
        # a retry: it will never exist again.
        return False

    token = password_reset_token.make_token(user)
    link = absolute_url(f"/reset-password?uid={encode_uid(user)}&token={token}")

    return send_email(
        to=user.email,
        subject="Reset your JobRadar password",
        template="password_reset",
        context={"link": link, "email": user.email},
    )


@shared_task(name="notifications.send_email_verification", bind=True, max_retries=3)
def send_email_verification(self: object, user_id: int) -> bool:
    from users.models import User
    from users.tokens import email_verification_token, encode_uid

    user = User.objects.filter(pk=user_id).first()
    if user is None or user.email_verified_at is not None:
        return False

    token = email_verification_token.make_token(user)
    link = absolute_url(f"/verify-email?uid={encode_uid(user)}&token={token}")

    return send_email(
        to=user.email,
        subject="Confirm your email address",
        template="verify_email",
        context={"link": link, "email": user.email},
    )


@shared_task(name="notifications.send_job_reminders", bind=True, max_retries=3)
def send_job_reminders(self: object, user_id: int, reminders: list[dict]) -> bool:
    """The email for one user's due reminders, already grouped by the sweep."""
    from users.models import User

    user = User.objects.filter(pk=user_id).first()
    if user is None or not reminders:
        return False

    subject = "Follow-up reminder" if len(reminders) == 1 else f"{len(reminders)} follow-up reminders"
    return send_email(
        to=user.email, subject=subject, template="job_reminder", context={"reminders": reminders}
    )
