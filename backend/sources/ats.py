"""The remaining ATS adapters.

Each vendor publishes a public JSON feed for aggregators. They agree on almost
nothing else, so every quirk below is handled explicitly rather than hopefully.
"""

from __future__ import annotations

from datetime import date
from typing import Any

from scoring.domain import RawPosting
from sources import http
from sources.base import SourceError, SourceSpec, register
from sources.coerce import days_ago, joined, strip_html, text, to_date

LEVER_URL = "https://api.lever.co/v0/postings/{slug}"
WORKABLE_URL = "https://apply.workable.com/api/v1/widget/accounts/{slug}"
BREEZY_URL = "https://{slug}.breezy.hr/json"
ASHBY_URL = "https://api.ashbyhq.com/posting-api/job-board/{slug}"
SMARTRECRUITERS_URL = "https://api.smartrecruiters.com/v1/companies/{slug}/postings"
RECRUITEE_URL = "https://{slug}.recruitee.com/api/offers/"
WORKDAY_URL = "https://{host}/wday/cxs/{tenant}/{site}/jobs"


def _require(spec: SourceSpec, *fields: str) -> None:
    missing = [field for field in fields if not getattr(spec, field, "")]
    if missing:
        raise SourceError(f"{spec.kind} source needs: {', '.join(missing)}")


# --- Lever ----------------------------------------------------------------


@register("lever")
def fetch_lever(spec: SourceSpec) -> list[RawPosting]:
    _require(spec, "slug")
    payload = http.get_json(LEVER_URL.format(slug=spec.slug), params={"mode": "json"})
    if not isinstance(payload, list):
        raise SourceError("lever returned an unexpected payload")

    company = spec.company or spec.slug
    postings = []
    for job in payload:
        if not isinstance(job, dict):
            continue
        title = strip_html(job.get("text"))
        if not title:
            continue

        categories = job.get("categories") or {}
        # `allLocations`, not `location`: a role listed in both Rawalpindi and
        # Islamabad must show both, or a user filtering on one of them loses it.
        locations = joined(categories.get("allLocations")) or text(categories.get("location"))

        postings.append(
            RawPosting(
                source="lever",
                company=company,
                title=title,
                location=locations,
                url=text(job.get("hostedUrl")) or text(job.get("applyUrl")),
                external_id=text(job.get("id")) or None,
                # createdAt is epoch **milliseconds**. Read as seconds it lands
                # in 1970 and every posting looks ancient.
                posted_at=to_date(job.get("createdAt")),
                description=strip_html(job.get("descriptionPlain") or job.get("description")),
                employment_type=text(categories.get("commitment")),
            )
        )
    return postings


# --- Workable -------------------------------------------------------------


@register("workable")
def fetch_workable(spec: SourceSpec) -> list[RawPosting]:
    _require(spec, "slug")
    payload = http.get_json(WORKABLE_URL.format(slug=spec.slug), params={"details": "true"})
    if not isinstance(payload, dict):
        raise SourceError("workable returned an unexpected payload")

    company = spec.company or text(payload.get("name")) or spec.slug
    postings = []
    for job in payload.get("jobs") or []:
        if not isinstance(job, dict):
            continue
        title = strip_html(job.get("title"))
        if not title:
            continue

        # `location` is sometimes a string, sometimes absent with city/country
        # split out. Build from whichever is present.
        location = text(job.get("location"))
        if not location:
            location = ", ".join(
                part for part in (text(job.get("city")), text(job.get("country"))) if part
            )

        postings.append(
            RawPosting(
                source="workable",
                company=company,
                title=title,
                location=location,
                url=text(job.get("url")) or text(job.get("application_url")),
                external_id=text(job.get("shortcode")) or text(job.get("id")) or None,
                posted_at=to_date(job.get("published_on") or job.get("created_at")),
                description=strip_html(job.get("description")),
                # Workable sends a plain string where Breezy sends an object.
                # `text` handles both, so there is no vendor special case here.
                employment_type=text(job.get("employment_type")),
            )
        )
    return postings


# --- Breezy ---------------------------------------------------------------


@register("breezy")
def fetch_breezy(spec: SourceSpec) -> list[RawPosting]:
    _require(spec, "slug")
    payload = http.get_json(BREEZY_URL.format(slug=spec.slug))
    if not isinstance(payload, list):
        raise SourceError("breezy returned an unexpected payload")

    company = spec.company or spec.slug
    postings = []
    for job in payload:
        if not isinstance(job, dict):
            continue
        title = strip_html(job.get("name"))
        if not title:
            continue

        location = job.get("location") or {}
        parts = [text(location.get("city"))]
        country = location.get("country")
        parts.append(text(country))
        if location.get("is_remote"):
            parts.append("Remote")
        joined_location = ", ".join(part for part in parts if part)

        postings.append(
            RawPosting(
                source="breezy",
                company=company,
                title=title,
                location=joined_location,
                url=text(job.get("url")),
                external_id=text(job.get("id")) or text(job.get("friendly_id")) or None,
                posted_at=to_date(job.get("published_date")),
                description=strip_html(job.get("description")),
                # Breezy wraps this in an object: {"id": "fullTime", "name": "Full-Time"}.
                employment_type=text(job.get("type")),
            )
        )
    return postings


# --- Ashby ----------------------------------------------------------------


@register("ashby")
def fetch_ashby(spec: SourceSpec) -> list[RawPosting]:
    _require(spec, "slug")
    payload = http.get_json(ASHBY_URL.format(slug=spec.slug))
    if not isinstance(payload, dict):
        raise SourceError("ashby returned an unexpected payload")

    company = spec.company or spec.slug
    postings = []
    for job in payload.get("jobs") or []:
        if not isinstance(job, dict):
            continue
        title = strip_html(job.get("title"))
        if not title:
            continue

        # Ashby lists extra locations separately from the primary one.
        locations = [text(job.get("location"))]
        secondary = job.get("secondaryLocations") or job.get("address")
        if isinstance(secondary, list):
            locations.extend(text(entry) for entry in secondary)

        postings.append(
            RawPosting(
                source="ashby",
                company=company,
                title=title,
                location=joined([part for part in locations if part]),
                url=text(job.get("jobUrl")) or text(job.get("applyUrl")),
                external_id=text(job.get("id")) or None,
                posted_at=to_date(job.get("publishedAt")),
                description=strip_html(job.get("descriptionPlain") or job.get("description")),
                employment_type=text(job.get("employmentType")),
            )
        )
    return postings


# --- SmartRecruiters ------------------------------------------------------

#: The API caps a page at 100. Paginate, but stop well short of pulling a
#: thousand-posting board every night — Nagarro alone has 928.
SMARTRECRUITERS_PAGE = 100
SMARTRECRUITERS_MAX = 300


@register("smartrecruiters")
def fetch_smartrecruiters(spec: SourceSpec) -> list[RawPosting]:
    _require(spec, "slug")
    company = spec.company or spec.slug
    limit = int(spec.config.get("max_postings") or SMARTRECRUITERS_MAX)

    postings: list[RawPosting] = []
    offset = 0
    while offset < limit:
        payload = http.get_json(
            SMARTRECRUITERS_URL.format(slug=spec.slug),
            params={"limit": SMARTRECRUITERS_PAGE, "offset": offset},
        )
        if not isinstance(payload, dict):
            raise SourceError("smartrecruiters returned an unexpected payload")

        page = payload.get("content") or []
        for job in page:
            if not isinstance(job, dict):
                continue
            title = strip_html(job.get("name"))
            if not title:
                continue

            location = job.get("location") or {}
            joined_location = ", ".join(
                part
                for part in (
                    text(location.get("city")),
                    text(location.get("region")),
                    text(location.get("country")),
                )
                if part
            )

            postings.append(
                RawPosting(
                    source="smartrecruiters",
                    company=company,
                    title=title,
                    location=joined_location,
                    url=text(job.get("applyUrl")) or text(job.get("ref")),
                    external_id=text(job.get("id")) or None,
                    posted_at=to_date(job.get("releasedDate") or job.get("createdOn")),
                    description=strip_html(job.get("jobAd")),
                    employment_type=text(job.get("typeOfEmployment")),
                )
            )

        total = int(payload.get("totalFound") or 0)
        offset += SMARTRECRUITERS_PAGE
        if offset >= total or not page:
            break

    return postings


# --- Recruitee -----------------------------------------------------------


@register("recruitee")
def fetch_recruitee(spec: SourceSpec) -> list[RawPosting]:
    _require(spec, "slug")
    payload = http.get_json(RECRUITEE_URL.format(slug=spec.slug))
    if not isinstance(payload, dict):
        raise SourceError("recruitee returned an unexpected payload")

    company = spec.company or spec.slug
    postings = []
    for job in payload.get("offers") or []:
        if not isinstance(job, dict):
            continue
        title = strip_html(job.get("title"))
        if not title:
            continue

        location = ", ".join(
            part for part in (text(job.get("city")), text(job.get("country"))) if part
        )

        postings.append(
            RawPosting(
                source="recruitee",
                company=company,
                title=title,
                location=location or text(job.get("location")),
                url=text(job.get("careers_url")) or text(job.get("careers_apply_url")),
                external_id=text(job.get("id")) or None,
                posted_at=to_date(job.get("published_at") or job.get("created_at")),
                description=strip_html(job.get("description")),
                employment_type=text(job.get("employment_type_code")),
            )
        )
    return postings


# --- Workday --------------------------------------------------------------

WORKDAY_PAGE = 20
WORKDAY_MAX = 100


@register("workday")
def fetch_workday(spec: SourceSpec, *, today: date | None = None) -> list[RawPosting]:
    _require(spec, "host", "tenant", "site")
    today = today or date.today()
    company = spec.company or spec.tenant
    url = WORKDAY_URL.format(host=spec.host, tenant=spec.tenant, site=spec.site)
    search_text = str(spec.config.get("search_text") or "")

    postings: list[RawPosting] = []
    offset = 0
    while offset < WORKDAY_MAX:
        payload = http.post_json(
            url,
            json={
                "appliedFacets": {},
                "limit": WORKDAY_PAGE,
                "offset": offset,
                "searchText": search_text,
            },
        )
        if not isinstance(payload, dict):
            raise SourceError("workday returned an unexpected payload")

        page = payload.get("jobPostings") or []
        for job in page:
            if not isinstance(job, dict):
                continue
            title = strip_html(job.get("title"))
            if not title:
                continue

            # `externalPath` is relative — without the host prefix every apply
            # link is broken.
            path = text(job.get("externalPath"))
            url_absolute = f"https://{spec.host}{path}" if path.startswith("/") else path

            postings.append(
                RawPosting(
                    source="workday",
                    company=company,
                    title=title,
                    location=text(job.get("locationsText")),
                    url=url_absolute,
                    # bulletFields carries the requisition number, the only
                    # stable id Workday exposes here.
                    external_id=_workday_id(job),
                    # postedOn is prose: "Posted 2 Days Ago", "Posted 30+ Days Ago".
                    posted_at=days_ago(job.get("postedOn"), today),
                    employment_type=text(job.get("timeType")),
                )
            )

        total = int(payload.get("total") or 0)
        offset += WORKDAY_PAGE
        if offset >= total or not page:
            break

    return postings


def _workday_id(job: dict[str, Any]) -> str | None:
    bullets = job.get("bulletFields")
    if isinstance(bullets, list) and bullets:
        return text(bullets[0]) or None
    return text(job.get("externalPath")) or None
