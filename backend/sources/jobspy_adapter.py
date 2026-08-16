"""LinkedIn / Indeed / Google Jobs / Bayt, via python-jobspy.

**Be honest about what this is.** It is scraping. LinkedIn's terms do not permit
it, their `robots.txt` disallows job pages, and IP blocks are a normal outcome
rather than a bug. Indeed and Bayt are considerably more tolerant, which is why
they lead the default list — but LinkedIn is included, because tested from a
residential connection it does return real Islamabad roles.

**Glassdoor can be configured, and will fail for Pakistan.** Verified live: the
API raises "Glassdoor is not available for PAKISTAN". That is their refusal, not
ours, so it is not blocked here — a configured Glassdoor scrape simply records
that message as a source error and the other sites in the same run carry on. If
the search location ever moves to a country Glassdoor does serve, it works with
no code change.

Results are **additive only**. A keyword search is not a full listing of anyone's
board, so a job's absence from today's results proves nothing about whether it is
still open, and must never trigger closed-detection.
"""

from __future__ import annotations

import logging
import math
import os
import time
from datetime import date
from typing import Any

from scoring.domain import RawPosting
from sources.base import SourceError, SourceSpec, register
from sources.coerce import strip_html, to_date

logger = logging.getLogger(__name__)

#: Indeed and Bayt tolerate scraping far better than LinkedIn, so they go first
#: — a run that gets blocked has already collected the tolerant sites' results
#: by the time it reaches the fragile one.
DEFAULT_SITES = ("indeed", "bayt", "google", "linkedin")

#: Sites known to refuse this market outright. Not blocked — a configured scrape
#: is attempted and its refusal recorded, so the run history shows the vendor's
#: own words rather than a decision made here.
KNOWN_UNAVAILABLE = {
    "glassdoor": "Glassdoor does not serve Pakistan — the API refuses the country",
}

#: LinkedIn rate-limits hard by IP after roughly 100 results.
DEFAULT_LIMIT = 40
MAX_LIMIT = 100

#: Sites are scraped one at a time with a pause between them. Greed here is what
#: triggers blocks.
DELAY_BETWEEN_SITES_SECONDS = 3.0


def _nan_to_none(value: Any) -> Any:
    """Pandas yields NaN for missing values, not None.

    Left alone, NaN serialises as the string "NaN" and poisons the database —
    every undated posting would claim a posting date of "NaN".
    """
    if value is None:
        return None
    if isinstance(value, float) and math.isnan(value):
        return None
    # Pandas NaT and friends: not equal to themselves.
    if value != value:
        return None
    if isinstance(value, str) and value.strip().lower() in {"nan", "nat", "none", "<na>"}:
        return None
    return value


def clean(value: Any) -> str:
    """A NaN-safe string."""
    cleaned = _nan_to_none(value)
    return strip_html(cleaned) if cleaned is not None else ""


def proxies_from_env() -> list[str]:
    raw = os.environ.get("JOBSPY_PROXIES", "")
    return [proxy.strip() for proxy in raw.split(",") if proxy.strip()]


@register("jobspy")
def fetch_jobspy(spec: SourceSpec, *, today: date | None = None) -> list[RawPosting]:
    """Scrape one location across the configured sites.

    A partial result is a success: whatever arrived is kept, and the shortfall is
    the caller's problem to record. Zero results is a source error rather than an
    exception — it is a normal, expected outcome from a blocked IP.
    """
    config = spec.config or {}
    sites = [str(site).lower() for site in (config.get("sites") or DEFAULT_SITES)]

    query = str(config.get("query") or "software engineer")
    location = str(spec.location_hint or config.get("location") or "")
    if not location:
        raise SourceError("jobspy source needs a location")

    limit = min(int(config.get("limit") or DEFAULT_LIMIT), MAX_LIMIT)
    country = str(config.get("country") or "pakistan")
    hours_old = int(config.get("hours_old") or 0) or None
    want_descriptions = bool(config.get("descriptions", True))
    today = today or date.today()

    scrape = _load_scraper()
    proxies = proxies_from_env()

    postings: list[RawPosting] = []
    failures: list[str] = []

    # Sequentially, never in parallel: three simultaneous scrapes from one IP is
    # the fastest way to get that IP blocked.
    for index, site in enumerate(sites):
        if index > 0:
            time.sleep(DELAY_BETWEEN_SITES_SECONDS)

        try:
            frame = scrape(
                site_name=[site],
                search_term=query,
                location=location,
                results_wanted=limit,
                country_indeed=country,
                hours_old=hours_old,
                linkedin_fetch_description=want_descriptions and site == "linkedin",
                proxies=proxies or None,
            )
        except Exception as exc:
            # A blocked or unavailable site is expected, not fatal. The message
            # is kept verbatim so the run history shows why rather than a
            # generic failure — "Glassdoor is not available for PAKISTAN" is a
            # far more useful thing to read than "scrape failed".
            note = KNOWN_UNAVAILABLE.get(site)
            detail = str(exc).strip() or exc.__class__.__name__
            logger.info("jobspy %s/%s failed: %s", site, location, detail)
            failures.append(f"{site}: {note or detail}"[:200])
            continue

        postings.extend(_rows_to_postings(frame, spec, location, today, site))

    if not postings:
        # Recorded against the source and visible in the run history. It closes
        # nothing, because a scrape proves nothing about what is still open.
        detail = "; ".join(failures) if failures else "no results"
        raise SourceError(f"jobspy returned nothing for {location} ({detail})")

    if failures:
        logger.info("jobspy %s: partial result, %s", location, "; ".join(failures))

    return postings


#: What each board is called in the UI. The user picked "LinkedIn", not the name
#: of the Python library that reads it.
BOARD_LABELS = {
    "indeed": "Indeed",
    "linkedin": "LinkedIn",
    "bayt": "Bayt",
    "google": "Google Jobs",
    "glassdoor": "Glassdoor",
    "zip_recruiter": "ZipRecruiter",
}


def _rows_to_postings(
    frame: Any, spec: SourceSpec, location: str, today: date, site: str
) -> list[RawPosting]:
    if frame is None or getattr(frame, "empty", True):
        return []

    postings: list[RawPosting] = []
    for row in frame.to_dict(orient="records"):
        title = clean(row.get("title"))
        company = clean(row.get("company"))
        if not title or not company:
            continue

        posted_at = to_date(_nan_to_none(row.get("date_posted")))
        # A scrape's location is often blank; the query's city is a better
        # answer than nothing, and it is the city the user actually asked for.
        row_location = clean(row.get("location")) or location

        # The board this posting actually came from, not the name of the
        # library that fetched it. Without this every scraped job is filed
        # under "jobspy" and you cannot ask for LinkedIn results specifically.
        board = (clean(row.get("site")) or site).lower().strip() or "jobspy"

        postings.append(
            RawPosting(
                source=board,
                company=company,
                title=title,
                location=row_location,
                # job_url_direct points at the employer; job_url at the board.
                url=clean(row.get("job_url_direct")) or clean(row.get("job_url")),
                external_id=clean(row.get("id")) or None,
                posted_at=posted_at,
                description=clean(row.get("description")),
                employment_type=clean(row.get("job_type")),
            )
        )

    return postings


def _load_scraper():
    """Import jobspy lazily.

    It drags in pandas, which is slow to import and heavy in memory. Nothing
    else in the app needs it, so the cost is paid only when a scrape runs — and
    a missing install becomes a recorded source error rather than an import
    error that takes the whole run down.
    """
    try:
        from jobspy import scrape_jobs
    except ImportError as exc:  # pragma: no cover - exercised by not installing the extra
        raise SourceError(
            "python-jobspy is not installed. Install the 'scrape' extra to enable this source."
        ) from exc
    return scrape_jobs


def scrape_locations_for_users(profiles: list[Any]) -> list[str]:
    """The distinct set of cities across all active users' profiles.

    ATS feeds are company-based, so one fetch serves everyone. Scraped sources
    are location-based, so the scrape list is built from **demand**: ten users
    wanting Islamabad produce one Islamabad scrape, and a new user in Lahore
    adds exactly one more. A city nobody selected is never scraped.
    """
    from scoring import locations as catalogue

    wanted: list[str] = []
    for profile in profiles:
        for key in profile.locations_allowed or []:
            location = catalogue.BY_KEY.get(str(key))
            if location is None:
                continue
            # Remote is not a place to search; the ATS feeds cover those, and a
            # scrape for "Remote (Pakistan)" returns noise.
            if location.key.startswith("remote"):
                continue
            if location.label not in wanted:
                wanted.append(location.label)

    return wanted
