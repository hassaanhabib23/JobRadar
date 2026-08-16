"""The jobspy adapter.

Nothing here touches a real board: `scrape_jobs` is replaced with a stub that
returns the shapes pandas actually produces — including NaN, which is the single
most damaging thing this adapter can get wrong.
"""

from __future__ import annotations

from datetime import date
from unittest import mock

import pytest

from sources import SourceError, fetch
from sources.base import SourceSpec
from sources.jobspy_adapter import (
    DEFAULT_SITES,
    KNOWN_UNAVAILABLE,
    _nan_to_none,
    clean,
    scrape_locations_for_users,
)

NAN = float("nan")


class FakeFrame:
    """The slice of a pandas DataFrame this adapter uses."""

    def __init__(self, rows: list[dict]) -> None:
        self._rows = rows
        self.empty = not rows

    def to_dict(self, orient: str = "records") -> list[dict]:
        return self._rows


def row(**overrides) -> dict:
    base = {
        "site": "indeed",
        "company": "Systems Limited",
        "title": "Associate Software Engineer",
        "location": "Islamabad, Pakistan",
        "job_url": "https://pk.indeed.com/viewjob?jk=abc",
        "job_url_direct": "https://careers.systemsltd.com/jobs/1",
        "date_posted": "2026-08-14",
        "id": "in-abc",
        "description": "ASP.NET Core and C#",
        "min_amount": NAN,
        "job_type": "fulltime",
    }
    base.update(overrides)
    return base


def spec(**overrides) -> SourceSpec:
    defaults = {"kind": "jobspy", "location_hint": "Islamabad", "config": {"limit": 10}}
    defaults.update(overrides)
    return SourceSpec(**defaults)  # type: ignore[arg-type]


def patched(frames: list[FakeFrame] | Exception):
    """Replace jobspy's scraper without importing pandas."""

    def scraper(**kwargs):
        if isinstance(frames, Exception):
            raise frames
        return frames.pop(0) if frames else FakeFrame([])

    return mock.patch("sources.jobspy_adapter._load_scraper", return_value=scraper)


class TestNanHandling:
    """Pandas yields NaN for missing values, not None.

    Left alone it serialises as the string "NaN" and poisons the database: every
    undated posting would claim a posting date of "NaN".
    """

    @pytest.mark.parametrize("value", [NAN, "NaN", "nan", "NaT", "None", "<NA>", None])
    def test_nan_shapes_become_none(self, value: object) -> None:
        assert _nan_to_none(value) is None

    def test_real_values_survive(self) -> None:
        assert _nan_to_none("Islamabad") == "Islamabad"
        assert _nan_to_none(0) == 0

    def test_clean_never_returns_the_string_nan(self) -> None:
        assert clean(NAN) == ""
        assert clean("NaN") == ""

    def test_a_nan_date_becomes_no_date_not_a_string(self) -> None:
        with patched([FakeFrame([row(date_posted=NAN)])]):
            posting = fetch(spec(config={"sites": ["indeed"]}))[0]

        assert posting.posted_at is None

    def test_a_nan_field_does_not_reach_a_posting(self) -> None:
        with patched([FakeFrame([row(description=NAN, location=NAN)])]):
            posting = fetch(spec(config={"sites": ["indeed"]}))[0]

        assert posting.description == ""
        assert "nan" not in posting.location.lower()
        # Falls back to the city that was actually searched.
        assert posting.location == "Islamabad"


class TestScraping:
    def test_maps_the_dataframe_onto_postings(self) -> None:
        with patched([FakeFrame([row()])]):
            posting = fetch(spec(config={"sites": ["indeed"]}))[0]

        # The board it actually came from, not the library that read it.
        # Filed under "jobspy", every scraped job looks like one source and you
        # cannot ask for LinkedIn results specifically.
        assert posting.source == "indeed"
        assert posting.company == "Systems Limited"
        assert posting.title == "Associate Software Engineer"
        assert posting.posted_at == date(2026, 8, 14)
        assert posting.external_id == "in-abc"

    def test_prefers_the_direct_employer_url(self) -> None:
        with patched([FakeFrame([row()])]):
            posting = fetch(spec(config={"sites": ["indeed"]}))[0]

        assert posting.url == "https://careers.systemsltd.com/jobs/1"

    def test_falls_back_to_the_board_url(self) -> None:
        with patched([FakeFrame([row(job_url_direct=NAN)])]):
            posting = fetch(spec(config={"sites": ["indeed"]}))[0]

        assert "indeed.com" in posting.url

    def test_a_row_without_a_company_is_skipped(self) -> None:
        with patched([FakeFrame([row(company=NAN), row()])]):
            postings = fetch(spec(config={"sites": ["indeed"]}))

        assert len(postings) == 1

    def test_sites_are_scraped_one_at_a_time(self) -> None:
        """Three simultaneous scrapes from one IP is the fastest way to be blocked."""
        calls: list[list[str]] = []

        def scraper(**kwargs):
            calls.append(kwargs["site_name"])
            return FakeFrame([row()])

        with (
            mock.patch("sources.jobspy_adapter._load_scraper", return_value=scraper),
            mock.patch("sources.jobspy_adapter.time.sleep") as sleep,
        ):
            fetch(spec(config={"sites": ["indeed", "bayt"]}))

        assert calls == [["indeed"], ["bayt"]]
        # And with a pause between them.
        assert sleep.call_count == 1

    def test_one_blocked_site_does_not_lose_the_others(self) -> None:
        """A partial result is a success: keep what arrived."""
        outcomes = [RuntimeError("429 blocked"), FakeFrame([row()])]

        def scraper(**kwargs):
            outcome = outcomes.pop(0)
            if isinstance(outcome, Exception):
                raise outcome
            return outcome

        with (
            mock.patch("sources.jobspy_adapter._load_scraper", return_value=scraper),
            mock.patch("sources.jobspy_adapter.time.sleep"),
        ):
            postings = fetch(spec(config={"sites": ["linkedin", "indeed"]}))

        assert len(postings) == 1

    def test_zero_results_is_a_recorded_error_not_a_crash(self) -> None:
        """A blocked IP returning nothing is normal and must close nothing."""
        with patched([FakeFrame([])]), pytest.raises(SourceError, match="returned nothing"):
            fetch(spec(config={"sites": ["indeed"]}))

    def test_the_limit_is_capped(self) -> None:
        """LinkedIn rate-limits hard by IP after roughly 100 results."""
        captured: dict = {}

        def scraper(**kwargs):
            captured.update(kwargs)
            return FakeFrame([row()])

        with mock.patch("sources.jobspy_adapter._load_scraper", return_value=scraper):
            fetch(spec(config={"sites": ["indeed"], "limit": 5000}))

        assert captured["results_wanted"] <= 100

    def test_a_missing_location_is_rejected(self) -> None:
        with pytest.raises(SourceError, match="location"):
            fetch(SourceSpec(kind="jobspy", config={"sites": ["indeed"]}))


class TestGlassdoor:
    """Glassdoor refuses this market, and that refusal is reported rather than
    pre-empted.

    Verified live against the real API: it raises "Glassdoor is not available for
    PAKISTAN". Blocking it here would replace the vendor's own words with ours,
    and would silently stop working the day they add the country.
    """

    def test_a_glassdoor_failure_does_not_lose_the_other_sites(self) -> None:
        outcomes = [Exception("Glassdoor is not available for PAKISTAN"), FakeFrame([row()])]

        def scraper(**kwargs):
            outcome = outcomes.pop(0)
            if isinstance(outcome, Exception):
                raise outcome
            return outcome

        with (
            mock.patch("sources.jobspy_adapter._load_scraper", return_value=scraper),
            mock.patch("sources.jobspy_adapter.time.sleep"),
        ):
            postings = fetch(spec(config={"sites": ["glassdoor", "indeed"]}))

        assert len(postings) == 1

    def test_the_reason_reaches_the_run_history(self) -> None:
        """ "Glassdoor is not available for PAKISTAN" is far more useful to read
        than "scrape failed"."""

        def scraper(**kwargs):
            raise Exception("Glassdoor is not available for PAKISTAN")

        with (
            mock.patch("sources.jobspy_adapter._load_scraper", return_value=scraper),
            pytest.raises(SourceError, match="does not serve Pakistan"),
        ):
            fetch(spec(config={"sites": ["glassdoor"]}))

    def test_it_is_documented_as_unavailable(self) -> None:
        assert "glassdoor" in KNOWN_UNAVAILABLE

    def test_it_is_not_in_the_defaults(self) -> None:
        """Configurable, but not on unless someone asks for it."""
        assert "glassdoor" not in DEFAULT_SITES

    def test_the_tolerant_boards_are_scraped_first(self) -> None:
        """A run blocked partway has already banked the reliable results."""
        assert DEFAULT_SITES.index("indeed") < DEFAULT_SITES.index("linkedin")
        assert DEFAULT_SITES.index("bayt") < DEFAULT_SITES.index("linkedin")

    def test_linkedin_is_included(self) -> None:
        """Tested from a residential connection it returns real Islamabad roles.
        It is fragile, not useless."""
        assert "linkedin" in DEFAULT_SITES


class TestAdditiveOnly:
    def test_jobspy_never_triggers_closed_detection(self) -> None:
        """A keyword search is not a full listing of anyone's board."""
        assert spec().is_additive

    @pytest.mark.parametrize("board", ["indeed", "linkedin", "bayt", "google", "glassdoor"])
    def test_every_scraped_board_is_additive(self, board: str) -> None:
        """Each board is now recorded under its own name, so each has to be
        marked additive individually — miss one and a quiet day on that board
        would close every job it ever found."""
        from sources.base import ADDITIVE_KINDS

        assert board in ADDITIVE_KINDS

    def test_the_board_is_recorded_per_row(self) -> None:
        """One scrape spans several boards; each row keeps its own."""
        frames = [FakeFrame([row(site="linkedin"), row(site="indeed")])]

        with patched(frames):
            postings = fetch(spec(config={"sites": ["linkedin"]}))

        assert {p.source for p in postings} == {"linkedin", "indeed"}

    def test_a_missing_site_column_falls_back_to_the_scraped_site(self) -> None:
        with patched([FakeFrame([row(site=NAN)])]):
            assert fetch(spec(config={"sites": ["bayt"]}))[0].source == "bayt"


class FakeProfile:
    def __init__(self, locations: list[str]) -> None:
        self.locations_allowed = locations


class TestScrapeLocationsFollowDemand:
    def test_ten_users_wanting_one_city_produce_one_scrape(self) -> None:
        profiles = [FakeProfile(["islamabad"]) for _ in range(10)]

        assert scrape_locations_for_users(profiles) == ["Islamabad"]

    def test_a_new_city_adds_exactly_one(self) -> None:
        profiles = [
            FakeProfile(["islamabad"]),
            FakeProfile(["islamabad"]),
            FakeProfile(["islamabad"]),
            FakeProfile(["lahore"]),
        ]

        assert scrape_locations_for_users(profiles) == ["Islamabad", "Lahore"]

    def test_a_city_nobody_selected_is_never_scraped(self) -> None:
        profiles = [FakeProfile(["islamabad", "rawalpindi"])]

        assert "Karachi" not in scrape_locations_for_users(profiles)

    def test_remote_is_not_a_place_to_search(self) -> None:
        """A keyword scrape for "Remote (Pakistan)" returns noise; the ATS feeds
        already cover remote roles."""
        profiles = [FakeProfile(["remote_pk", "remote_ww", "islamabad"])]

        assert scrape_locations_for_users(profiles) == ["Islamabad"]

    def test_an_unknown_key_is_ignored(self) -> None:
        assert scrape_locations_for_users([FakeProfile(["atlantis"])]) == []

    def test_no_users_means_no_scrapes(self) -> None:
        assert scrape_locations_for_users([]) == []
