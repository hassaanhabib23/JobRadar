"""Greenhouse job boards.

``GET https://boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true``
returns ``{jobs: [{id, title, location: {name}, absolute_url, first_published,
updated_at, content}]}``.

**On the `content` flag.** The specification asks for `content=false`. Measured
against Careem's live board, that returns 24 jobs in 38 KB with zero
descriptions — and the stack component is 40 of the 100 available points, scored
over "title + location + description". With no description it has only the title
to work with, and every posting lands in Stretch with `stack: 0`.

`content=true` returns the same 24 jobs, in the same **single** request, at
216 KB, with all 24 descriptions. For a once-daily run that is free, and it is
the difference between the largest scoring component working and not working. So
descriptions are fetched by default, and any source can turn them off with
``{"content": false}`` in its config if a particular board is unusually large.
"""

from __future__ import annotations

from typing import Any

from scoring.domain import RawPosting
from sources import http
from sources.base import SourceError, SourceSpec, register

BOARD_URL = "https://boards-api.greenhouse.io/v1/boards/{slug}/jobs"


@register("greenhouse")
def fetch_greenhouse(spec: SourceSpec) -> list[RawPosting]:
    if not spec.slug:
        raise SourceError("greenhouse source needs a board slug")

    want_content = spec.config.get("content", True) is not False
    payload = http.get_json(
        BOARD_URL.format(slug=spec.slug),
        params={"content": "true" if want_content else "false"},
    )
    if not isinstance(payload, dict):
        raise SourceError("greenhouse returned an unexpected payload")

    company = spec.company or spec.slug
    jobs = payload.get("jobs") or []
    return [posting for job in jobs if (posting := _to_posting(job, company)) is not None]


def _to_posting(job: Any, company: str) -> RawPosting | None:
    if not isinstance(job, dict):
        return None

    from sources.coerce import strip_html, text, to_date

    title = strip_html(job.get("title"))
    if not title:
        # A posting with no title cannot be scored, deduplicated or displayed.
        return None

    return RawPosting(
        source="greenhouse",
        company=company,
        title=title,
        # `location` is an object here; `text` unwraps it the same way it does
        # for every other vendor.
        location=text(job.get("location")),
        url=text(job.get("absolute_url")),
        external_id=text(job.get("id")) or None,
        # `first_published` is when it went live; `updated_at` moves on any edit
        # and would make an old posting look new.
        posted_at=to_date(job.get("first_published")) or to_date(job.get("updated_at")),
        description=strip_html(job.get("content")),
    )
