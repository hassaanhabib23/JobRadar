"""Outbound email.

One function, so every message in the system is built the same way: a plain-text
part rendered from a template, an HTML part rendered from its sibling, and a
subject that never contains a newline.

**Nothing here raises into a caller.** A dead SMTP server must not turn a
registration into a 500 or abort a run half way. Failures are logged and
reported by return value; the caller decides whether that matters.

Every message is also sent from a Celery task rather than a request thread —
see `tasks.py`. This module is the "how", that one is the "when".
"""

from __future__ import annotations

import logging
from typing import Any

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string

logger = logging.getLogger(__name__)


def absolute_url(path: str) -> str:
    """A link that works from an inbox.

    Built from `PUBLIC_BASE_URL`, never from the request's `Host` header. `Host`
    is attacker-controlled: trusting it lets someone request a reset for your
    address and have the link in *your* inbox point at *their* server.
    """
    return f"{settings.PUBLIC_BASE_URL}/{path.lstrip('/')}"


def send_email(
    *,
    to: str,
    subject: str,
    template: str,
    context: dict[str, Any],
) -> bool:
    """Render `notifications/<template>.{txt,html}` and send it.

    Returns whether it went out. The text part is authoritative — it is what a
    plain-text client shows, and building the HTML from it by stripping tags
    would produce something unreadable, so both are real templates.
    """
    # A newline in a subject is header injection. Django raises on this, but the
    # subject can come from data, so it is flattened before it gets there.
    subject = " ".join(subject.split())

    try:
        text = render_to_string(f"notifications/{template}.txt", context)
    except Exception:
        logger.exception("Could not render the text part of %s", template)
        return False

    message = EmailMultiAlternatives(
        subject=subject,
        body=text,
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[to],
    )

    try:
        html = render_to_string(f"notifications/{template}.html", context)
    except Exception:
        # An HTML template that fails to render is a bug worth seeing, but the
        # text part is already good enough to send on its own.
        logger.exception("Could not render the HTML part of %s; sending text only", template)
    else:
        message.attach_alternative(html, "text/html")

    try:
        message.send(fail_silently=False)
    except Exception:
        logger.exception("Could not send %s to %s", template, _redact(to))
        return False

    logger.info("Sent %s to %s", template, _redact(to))
    return True


def _redact(email: str) -> str:
    """`h***@example.com` — enough to correlate a log line, not enough to leak.

    Logs get shipped to error trackers and read by people who have no business
    knowing who uses the app.
    """
    local, _, domain = email.partition("@")
    if not domain:
        return "***"
    return f"{local[:1]}***@{domain}"


__all__ = ["absolute_url", "send_email"]
