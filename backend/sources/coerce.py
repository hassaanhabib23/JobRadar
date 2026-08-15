"""Shared coercion helpers.

Vendors are inconsistent about whether a field is a scalar or an object wrapping
one — Breezy returns ``type`` as ``{"name": "Full-Time"}`` where Workable returns
a plain string. There is **one** unwrapping helper used everywhere rather than a
special case per vendor, because the next vendor will do it too.
"""

from __future__ import annotations

import html
import re
from datetime import UTC, date, datetime
from typing import Any
from urllib.parse import parse_qs, unquote, urlparse

#: The keys vendors use to wrap a scalar in an object, in preference order.
_VALUE_KEYS = ("name", "label", "title", "text", "value")

_TAG_RE = re.compile(r"<[^>]+>")
_WHITESPACE_RE = re.compile(r"\s+")

#: Workday states ages in prose: "Posted 2 Days Ago", "Posted 30+ Days Ago".
_POSTED_AGO_RE = re.compile(r"(\d+)\s*\+?\s*day", re.IGNORECASE)


def text(value: Any) -> str:
    """Unwrap a scalar that may have arrived inside an object.

    >>> text({"name": "Full-Time"})
    'Full-Time'
    >>> text("Full-Time")
    'Full-Time'
    """
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, dict):
        for key in _VALUE_KEYS:
            if key in value:
                return text(value[key])
        return ""
    if isinstance(value, (list, tuple)):
        parts = [text(item) for item in value]
        return ", ".join(part for part in parts if part)
    return str(value).strip()


def joined(values: Any, separator: str = ", ") -> str:
    """Flatten a list of scalars-or-objects into one string.

    A role listed in both Rawalpindi and Islamabad must show both.
    """
    if not isinstance(values, (list, tuple)):
        return text(values)
    parts = [text(item) for item in values]
    # Preserve order, drop blanks and duplicates.
    return separator.join(dict.fromkeys(part for part in parts if part))


def strip_html(value: Any) -> str:
    """Plain text from an HTML fragment, entities decoded.

    RSS descriptions and several ATS feeds carry markup. It has no business in a
    title, and stripping it here means no template has to think about it.
    """
    raw = text(value)
    if not raw:
        return ""
    return _WHITESPACE_RE.sub(" ", html.unescape(_TAG_RE.sub(" ", raw))).strip()


def to_date(value: Any) -> date | None:
    """Parse the many date shapes vendors emit. `None` when there is no date.

    An absent date is a real answer — it is scored down deliberately — so this
    never guesses one.
    """
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value

    if isinstance(value, (int, float)):
        # Lever sends epoch milliseconds; treat anything implausibly large as ms.
        seconds = value / 1000 if value > 1e11 else value
        try:
            return datetime.fromtimestamp(seconds, tz=UTC).date()
        except (OverflowError, OSError, ValueError):
            return None

    raw = text(value)
    if not raw:
        return None

    if raw.isdigit():
        return to_date(int(raw))

    # ISO 8601, with or without a timezone, with or without a time.
    candidate = raw.replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(candidate).date()
    except ValueError:
        pass

    for fmt in (
        "%Y-%m-%d",
        "%d/%m/%Y",
        "%m/%d/%Y",
        "%a, %d %b %Y %H:%M:%S %z",
        "%a, %d %b %Y %H:%M:%S %Z",
        "%d %b %Y",
        "%b %d, %Y",
    ):
        try:
            return datetime.strptime(raw, fmt).date()
        except ValueError:
            continue

    return None


def days_ago(value: Any, today: date) -> date | None:
    """Turn prose like "Posted 30+ Days Ago" into a real date.

    "Posted Today" is today; "30+" is treated as exactly 30, which is the floor
    the wording guarantees.
    """
    raw = text(value).lower()
    if not raw:
        return None
    if "today" in raw or "just posted" in raw:
        return today
    if "yesterday" in raw:
        return date.fromordinal(today.toordinal() - 1)

    match = _POSTED_AGO_RE.search(raw)
    if match:
        return date.fromordinal(today.toordinal() - int(match.group(1)))

    return to_date(raw)


def unwrap_redirect(url: str) -> str:
    """Recover the real destination from a Google Alerts redirect.

    Google Alerts links look like
    ``https://www.google.com/url?rct=j&url=<REAL>&ct=ga``. Storing the redirect
    means every job from an alerts feed points at google.com, and two different
    jobs can look like the same URL.
    """
    if not url:
        return ""
    parsed = urlparse(url)
    if "google." not in parsed.netloc or parsed.path not in ("/url", "/url/"):
        return url

    params = parse_qs(parsed.query)
    for key in ("url", "q"):
        if params.get(key):
            return unquote(params[key][0])
    return url
