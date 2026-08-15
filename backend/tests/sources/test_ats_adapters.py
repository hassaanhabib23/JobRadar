"""The eight remaining ATS adapters, each against a recorded fixture.

Every fixture is the shape the live endpoint actually returned. No test here
touches the real internet (NFR8).

Most of these tests exist because a vendor does something surprising, and the
surprise is named in the test rather than left for a future reader to rediscover.
"""

from __future__ import annotations

from datetime import UTC, date, datetime

import pytest
import responses

from sources import SourceError, fetch
from sources.ats import (
    ASHBY_URL,
    BREEZY_URL,
    LEVER_URL,
    RECRUITEE_URL,
    SMARTRECRUITERS_URL,
    WORKABLE_URL,
    WORKDAY_URL,
    fetch_workday,
)
from sources.base import SourceSpec

TODAY = date(2026, 8, 15)


# --- Lever ----------------------------------------------------------------

LEVER_FIXTURE = [
    {
        "id": "abc-123",
        "text": "Senior Backend Engineer — PHP/Symfony",
        "categories": {
            "commitment": "Full-Time | Remote",
            "location": "India",
            "allLocations": ["Pakistan", "Lahore", "Karachi", "Islamabad", "Rawalpindi"],
        },
        "createdAt": 1786100149278,
        "hostedUrl": "https://jobs.lever.co/sws/abc-123",
        "applyUrl": "https://jobs.lever.co/sws/abc-123/apply",
        "descriptionPlain": "We use PHP and Symfony.",
    }
]


class TestLever:
    @responses.activate
    def test_created_at_is_epoch_milliseconds(self) -> None:
        """Read as seconds it lands in 1970 and every posting looks ancient."""
        responses.add(responses.GET, LEVER_URL.format(slug="sws"), json=LEVER_FIXTURE, status=200)

        posting = fetch(SourceSpec(kind="lever", slug="sws"))[0]

        expected = datetime.fromtimestamp(1786100149.278, tz=UTC).date()
        assert posting.posted_at == expected
        assert posting.posted_at.year > 2000

    @responses.activate
    def test_every_location_is_surfaced_not_just_the_primary(self) -> None:
        """`location` says "India" while `allLocations` lists five Pakistani
        cities. Using the singular would hide this role from every user."""
        responses.add(responses.GET, LEVER_URL.format(slug="sws"), json=LEVER_FIXTURE, status=200)

        location = fetch(SourceSpec(kind="lever", slug="sws"))[0].location

        for city in ("Pakistan", "Lahore", "Karachi", "Islamabad", "Rawalpindi"):
            assert city in location

    @responses.activate
    def test_prefers_the_hosted_url_over_the_apply_url(self) -> None:
        responses.add(responses.GET, LEVER_URL.format(slug="sws"), json=LEVER_FIXTURE, status=200)

        assert fetch(SourceSpec(kind="lever", slug="sws"))[0].url.endswith("/abc-123")

    @responses.activate
    def test_an_unexpected_payload_raises(self) -> None:
        responses.add(responses.GET, LEVER_URL.format(slug="sws"), json={}, status=200)

        with pytest.raises(SourceError):
            fetch(SourceSpec(kind="lever", slug="sws"))


# --- Workable -------------------------------------------------------------

WORKABLE_FIXTURE = {
    "name": "JazzWorld",
    "jobs": [
        {
            "shortcode": "A1B2C3",
            "title": "Intermediate Analytics Engineer",
            "location": "Islamabad Pakistan",
            "city": "Islamabad",
            "country": "Pakistan",
            "url": "https://apply.workable.com/pmcl/j/A1B2C3/",
            "published_on": "2026-08-10",
            # A plain string where Breezy sends an object.
            "employment_type": "Full-time",
        },
        {
            "shortcode": "D4E5F6",
            "title": "Solution Engineer",
            "city": "Karachi",
            "country": "Pakistan",
            "url": "https://apply.workable.com/pmcl/j/D4E5F6/",
            "published_on": "2026-08-11",
        },
    ],
}


class TestWorkable:
    @responses.activate
    def test_parses_the_documented_shape(self) -> None:
        responses.add(
            responses.GET, WORKABLE_URL.format(slug="pmcl"), json=WORKABLE_FIXTURE, status=200
        )

        postings = fetch(SourceSpec(kind="workable", slug="pmcl"))

        assert len(postings) == 2
        assert postings[0].external_id == "A1B2C3"
        assert postings[0].posted_at == date(2026, 8, 10)

    @responses.activate
    def test_the_company_comes_from_the_feed(self) -> None:
        responses.add(
            responses.GET, WORKABLE_URL.format(slug="pmcl"), json=WORKABLE_FIXTURE, status=200
        )

        assert fetch(SourceSpec(kind="workable", slug="pmcl"))[0].company == "JazzWorld"

    @responses.activate
    def test_location_is_rebuilt_from_city_and_country_when_absent(self) -> None:
        responses.add(
            responses.GET, WORKABLE_URL.format(slug="pmcl"), json=WORKABLE_FIXTURE, status=200
        )

        assert fetch(SourceSpec(kind="workable", slug="pmcl"))[1].location == "Karachi, Pakistan"

    @responses.activate
    def test_a_string_employment_type_parses(self) -> None:
        responses.add(
            responses.GET, WORKABLE_URL.format(slug="pmcl"), json=WORKABLE_FIXTURE, status=200
        )

        assert fetch(SourceSpec(kind="workable", slug="pmcl"))[0].employment_type == "Full-time"


# --- Breezy ---------------------------------------------------------------

BREEZY_FIXTURE = [
    {
        "id": "c80c266fc34a01",
        "friendly_id": "c80c266fc34a01-android-developer",
        "name": "Android Developer",
        "url": "https://dubizzlelabs.breezy.hr/p/c80c266fc34a01",
        "published_date": "2026-08-05T10:23:40.438Z",
        # The object-shaped field the specification warns about.
        "type": {"id": "fullTime", "name": "Full-Time"},
        "location": {"city": "Lahore", "country": {"name": "Pakistan"}, "is_remote": False},
    },
    {
        "id": "remote-1",
        "name": "Remote QA Engineer",
        "url": "https://dubizzlelabs.breezy.hr/p/remote-1",
        "published_date": "2026-08-06T00:00:00.000Z",
        "type": {"id": "contract", "name": "Contract"},
        "location": {"city": "Karachi", "country": {"name": "Pakistan"}, "is_remote": True},
    },
]


class TestBreezy:
    @responses.activate
    def test_the_object_shaped_type_field_parses_without_raising(self) -> None:
        """Breezy sends `{"id": ..., "name": "Full-Time"}`; Workable sends a string.

        One coercion helper handles both — no vendor special case.
        """
        responses.add(
            responses.GET, BREEZY_URL.format(slug="dubizzlelabs"), json=BREEZY_FIXTURE, status=200
        )

        postings = fetch(SourceSpec(kind="breezy", slug="dubizzlelabs"))

        assert postings[0].employment_type == "Full-Time"
        assert postings[1].employment_type == "Contract"

    @responses.activate
    def test_the_nested_country_object_is_unwrapped(self) -> None:
        responses.add(
            responses.GET, BREEZY_URL.format(slug="dubizzlelabs"), json=BREEZY_FIXTURE, status=200
        )

        assert fetch(SourceSpec(kind="breezy", slug="dubizzlelabs"))[0].location == (
            "Lahore, Pakistan"
        )

    @responses.activate
    def test_a_remote_role_says_so_in_its_location(self) -> None:
        """Otherwise a user whose only choice is "Remote (Pakistan)" never sees it."""
        responses.add(
            responses.GET, BREEZY_URL.format(slug="dubizzlelabs"), json=BREEZY_FIXTURE, status=200
        )

        assert "Remote" in fetch(SourceSpec(kind="breezy", slug="dubizzlelabs"))[1].location

    @responses.activate
    def test_the_iso_timestamp_parses(self) -> None:
        responses.add(
            responses.GET, BREEZY_URL.format(slug="dubizzlelabs"), json=BREEZY_FIXTURE, status=200
        )

        assert fetch(SourceSpec(kind="breezy", slug="dubizzlelabs"))[0].posted_at == date(
            2026, 8, 5
        )


# --- Ashby ----------------------------------------------------------------

ASHBY_FIXTURE = {
    "jobs": [
        {
            "id": "ashby-1",
            "title": "Software Engineer, Platform",
            "location": "Islamabad, Pakistan",
            "secondaryLocations": ["Lahore, Pakistan", "Remote"],
            "jobUrl": "https://jobs.ashbyhq.com/acme/ashby-1",
            "applyUrl": "https://jobs.ashbyhq.com/acme/ashby-1/application",
            "publishedAt": "2026-08-09T12:00:00Z",
            "employmentType": "FullTime",
        }
    ]
}


class TestAshby:
    @responses.activate
    def test_parses_the_documented_shape(self) -> None:
        responses.add(responses.GET, ASHBY_URL.format(slug="acme"), json=ASHBY_FIXTURE, status=200)

        posting = fetch(SourceSpec(kind="ashby", slug="acme"))[0]

        assert posting.external_id == "ashby-1"
        assert posting.posted_at == date(2026, 8, 9)
        assert posting.url.endswith("/ashby-1")

    @responses.activate
    def test_secondary_locations_are_included(self) -> None:
        responses.add(responses.GET, ASHBY_URL.format(slug="acme"), json=ASHBY_FIXTURE, status=200)

        location = fetch(SourceSpec(kind="ashby", slug="acme"))[0].location

        assert "Islamabad" in location and "Lahore" in location


# --- SmartRecruiters ------------------------------------------------------


def smartrecruiters_page(offset: int, total: int, count: int) -> dict:
    return {
        "offset": offset,
        "limit": 100,
        "totalFound": total,
        "content": [
            {
                "id": f"7440001435{offset + index:03d}",
                "name": f"Full Stack .NET Developer {offset + index}",
                "location": {"city": "Lahore", "region": "Punjab", "country": "pk"},
                "releasedDate": "2026-08-08T00:00:00.000Z",
            }
            for index in range(count)
        ],
    }


class TestSmartRecruiters:
    @responses.activate
    def test_parses_the_documented_shape(self) -> None:
        responses.add(
            responses.GET,
            SMARTRECRUITERS_URL.format(slug="nagarro1"),
            json=smartrecruiters_page(0, 2, 2),
            status=200,
        )

        postings = fetch(SourceSpec(kind="smartrecruiters", slug="nagarro1"))

        assert len(postings) == 2
        assert postings[0].location == "Lahore, Punjab, pk"
        assert postings[0].posted_at == date(2026, 8, 8)

    @responses.activate
    def test_paginates_until_the_total_is_reached(self) -> None:
        responses.add(
            responses.GET,
            SMARTRECRUITERS_URL.format(slug="nagarro1"),
            json=smartrecruiters_page(0, 150, 100),
            status=200,
        )
        responses.add(
            responses.GET,
            SMARTRECRUITERS_URL.format(slug="nagarro1"),
            json=smartrecruiters_page(100, 150, 50),
            status=200,
        )

        postings = fetch(SourceSpec(kind="smartrecruiters", slug="nagarro1"))

        assert len(postings) == 150
        assert len(responses.calls) == 2

    @responses.activate
    def test_stops_at_the_configured_cap(self) -> None:
        """Nagarro alone has 928 postings; pulling all of them nightly is rude
        and floods the dashboard with roles in other countries."""
        for offset in range(0, 300, 100):
            responses.add(
                responses.GET,
                SMARTRECRUITERS_URL.format(slug="nagarro1"),
                json=smartrecruiters_page(offset, 1000, 100),
                status=200,
            )

        postings = fetch(SourceSpec(kind="smartrecruiters", slug="nagarro1"))

        assert len(postings) == 300
        assert len(responses.calls) == 3

    @responses.activate
    def test_an_empty_page_ends_pagination_rather_than_looping(self) -> None:
        """A total that overstates reality must not spin forever."""
        responses.add(
            responses.GET,
            SMARTRECRUITERS_URL.format(slug="nagarro1"),
            json=smartrecruiters_page(0, 999, 0),
            status=200,
        )

        assert fetch(SourceSpec(kind="smartrecruiters", slug="nagarro1")) == []


# --- Recruitee -----------------------------------------------------------

RECRUITEE_FIXTURE = {
    "offers": [
        {
            "id": 998877,
            "title": "Frontend Engineer",
            "careers_url": "https://acme.recruitee.com/o/frontend-engineer",
            "city": "Islamabad",
            "country": "Pakistan",
            "created_at": "2026-08-07 09:00:00 UTC",
            "published_at": "2026-08-07",
        }
    ]
}


class TestRecruitee:
    @responses.activate
    def test_parses_the_documented_shape(self) -> None:
        responses.add(
            responses.GET, RECRUITEE_URL.format(slug="acme"), json=RECRUITEE_FIXTURE, status=200
        )

        posting = fetch(SourceSpec(kind="recruitee", slug="acme"))[0]

        assert posting.title == "Frontend Engineer"
        assert posting.location == "Islamabad, Pakistan"
        assert posting.external_id == "998877"
        assert posting.posted_at == date(2026, 8, 7)


# --- Workday --------------------------------------------------------------

WORKDAY_HOST = "talentmanagementsolution.wd3.myworkdayjobs.com"
WORKDAY_ENDPOINT = WORKDAY_URL.format(
    host=WORKDAY_HOST, tenant="talentmanagementsolution", site="ContourSoftware-Careers"
)


def workday_page(total: int, count: int, posted: str = "Posted 2 Days Ago") -> dict:
    return {
        "total": total,
        "jobPostings": [
            {
                "title": f"Trainee Software Developer {index}",
                "externalPath": f"/job/PER---Lahore-PK/Trainee-Software-Developer_R{index}",
                "timeType": "Full time",
                "locationsText": "PER - Lahore, PK",
                "postedOn": posted,
                "bulletFields": [f"R{index}"],
            }
            for index in range(count)
        ],
    }


def workday_spec() -> SourceSpec:
    return SourceSpec(
        kind="workday",
        host=WORKDAY_HOST,
        tenant="talentmanagementsolution",
        site="ContourSoftware-Careers",
        company="Contour Software",
    )


class TestWorkday:
    @responses.activate
    def test_posts_rather_than_gets(self) -> None:
        responses.add(responses.POST, WORKDAY_ENDPOINT, json=workday_page(1, 1), status=200)

        fetch_workday(workday_spec(), today=TODAY)

        assert responses.calls[0].request.method == "POST"

    @responses.activate
    @pytest.mark.parametrize(
        ("prose", "expected"),
        [
            ("Posted Today", date(2026, 8, 15)),
            ("Posted 2 Days Ago", date(2026, 8, 13)),
            ("Posted 30+ Days Ago", date(2026, 7, 16)),
        ],
    )
    def test_prose_dates_become_real_dates(self, prose: str, expected: date) -> None:
        """ "Posted 30+ Days Ago" is prose, not a date. Stored raw it is useless
        for both the freshness score and the age filter."""
        responses.add(responses.POST, WORKDAY_ENDPOINT, json=workday_page(1, 1, prose), status=200)

        assert fetch_workday(workday_spec(), today=TODAY)[0].posted_at == expected

    @responses.activate
    def test_thirty_plus_days_parses_to_exactly_thirty(self) -> None:
        responses.add(
            responses.POST,
            WORKDAY_ENDPOINT,
            json=workday_page(1, 1, "Posted 30+ Days Ago"),
            status=200,
        )

        posting = fetch_workday(workday_spec(), today=TODAY)[0]

        assert posting.posted_at is not None
        assert (TODAY - posting.posted_at).days == 30

    @responses.activate
    def test_the_relative_path_is_made_absolute(self) -> None:
        """`externalPath` is relative — without the host every apply link is broken."""
        responses.add(responses.POST, WORKDAY_ENDPOINT, json=workday_page(1, 1), status=200)

        url = fetch_workday(workday_spec(), today=TODAY)[0].url

        assert url.startswith(f"https://{WORKDAY_HOST}/job/")

    @responses.activate
    def test_the_requisition_number_is_the_external_id(self) -> None:
        responses.add(responses.POST, WORKDAY_ENDPOINT, json=workday_page(1, 1), status=200)

        assert fetch_workday(workday_spec(), today=TODAY)[0].external_id == "R0"

    @responses.activate
    def test_paginates_to_the_total(self) -> None:
        responses.add(responses.POST, WORKDAY_ENDPOINT, json=workday_page(45, 20), status=200)
        responses.add(responses.POST, WORKDAY_ENDPOINT, json=workday_page(45, 20), status=200)
        responses.add(responses.POST, WORKDAY_ENDPOINT, json=workday_page(45, 5), status=200)

        postings = fetch_workday(workday_spec(), today=TODAY)

        assert len(postings) == 45
        assert len(responses.calls) == 3

    @responses.activate
    def test_stops_at_the_cap_on_a_huge_board(self) -> None:
        for _ in range(10):
            responses.add(responses.POST, WORKDAY_ENDPOINT, json=workday_page(9999, 20), status=200)

        postings = fetch_workday(workday_spec(), today=TODAY)

        assert len(postings) == 100
        assert len(responses.calls) == 5

    def test_missing_connection_details_are_rejected_before_any_request(self) -> None:
        with pytest.raises(SourceError, match="host"):
            fetch(SourceSpec(kind="workday", tenant="t", site="s"))


# --- Every adapter ---------------------------------------------------------


class TestEveryAdapterIsRegistered:
    def test_all_nine_kinds_have_an_adapter(self) -> None:
        from sources import ADAPTERS

        assert set(ADAPTERS) == {
            "greenhouse",
            "lever",
            "workable",
            "breezy",
            "ashby",
            "smartrecruiters",
            "recruitee",
            "workday",
            "rss",
        }

    def test_glassdoor_is_not_offered(self) -> None:
        """It does not serve Pakistan at all — the data does not exist."""
        from sources import ADAPTERS

        assert "glassdoor" not in ADAPTERS

    @pytest.mark.parametrize(
        ("kind", "spec"),
        [
            ("lever", SourceSpec(kind="lever", slug="x")),
            ("workable", SourceSpec(kind="workable", slug="x")),
            ("breezy", SourceSpec(kind="breezy", slug="x")),
            ("ashby", SourceSpec(kind="ashby", slug="x")),
            ("smartrecruiters", SourceSpec(kind="smartrecruiters", slug="x")),
            ("recruitee", SourceSpec(kind="recruitee", slug="x")),
        ],
    )
    @responses.activate
    def test_a_server_error_becomes_a_source_error(self, kind: str, spec: SourceSpec) -> None:
        """Never a bare requests exception — the run records it and carries on."""
        responses.add(responses.GET, _endpoint_for(kind), json={}, status=503)

        with pytest.raises(SourceError):
            fetch(spec)


def _endpoint_for(kind: str) -> str:
    return {
        "lever": LEVER_URL.format(slug="x"),
        "workable": WORKABLE_URL.format(slug="x"),
        "breezy": BREEZY_URL.format(slug="x"),
        "ashby": ASHBY_URL.format(slug="x"),
        "smartrecruiters": SMARTRECRUITERS_URL.format(slug="x"),
        "recruitee": RECRUITEE_URL.format(slug="x"),
    }[kind]
