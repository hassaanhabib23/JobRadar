"""The Greenhouse adapter, against a recorded fixture.

No test here touches the real internet or a real job board (NFR8) — every
outbound call is stubbed. The fixture is the shape the live endpoint returned.
"""

from __future__ import annotations

from datetime import date

import pytest
import responses

from sources import SourceError, fetch
from sources.base import SourceSpec
from sources.greenhouse import BOARD_URL

BOARD = BOARD_URL.format(slug="careem")

FIXTURE = {
    "jobs": [
        {
            "id": 7004825002,
            "title": "Associate Software Engineer | NextGen",
            "location": {"name": "Islamabad, Pakistan"},
            "absolute_url": "https://job-boards.greenhouse.io/careem/jobs/7004825002",
            "first_published": "2026-08-12T09:14:03-04:00",
            "updated_at": "2026-08-14T11:00:00-04:00",
        },
        {
            "id": 8618945002,
            "title": "Senior Security Engineer II",
            "location": {"name": "Karachi, Pakistan"},
            "absolute_url": "https://job-boards.greenhouse.io/careem/jobs/8618945002",
            "first_published": None,
            "updated_at": "2026-08-01T00:00:00-04:00",
        },
    ]
}


def spec(**overrides) -> SourceSpec:
    return SourceSpec(kind="greenhouse", slug="careem", company="Careem", **overrides)


@responses.activate
def test_parses_the_documented_shape() -> None:
    responses.add(responses.GET, BOARD, json=FIXTURE, status=200)

    postings = fetch(spec())

    assert len(postings) == 2
    first = postings[0]
    assert first.source == "greenhouse"
    assert first.company == "Careem"
    assert first.title == "Associate Software Engineer | NextGen"
    assert first.location == "Islamabad, Pakistan"
    assert first.external_id == "7004825002"
    assert first.url.endswith("/7004825002")


@responses.activate
def test_the_object_shaped_location_is_unwrapped() -> None:
    """Greenhouse nests it; other vendors send a plain string. One helper handles both."""
    responses.add(responses.GET, BOARD, json=FIXTURE, status=200)

    assert fetch(spec())[0].location == "Islamabad, Pakistan"


@responses.activate
def test_prefers_first_published_over_updated_at() -> None:
    """`updated_at` moves on any edit and would make an old posting look new."""
    responses.add(responses.GET, BOARD, json=FIXTURE, status=200)

    assert fetch(spec())[0].posted_at == date(2026, 8, 12)


@responses.activate
def test_falls_back_to_updated_at_when_never_published() -> None:
    responses.add(responses.GET, BOARD, json=FIXTURE, status=200)

    assert fetch(spec())[1].posted_at == date(2026, 8, 1)


@responses.activate
def test_descriptions_are_requested_by_default() -> None:
    """The stack component is 40 of 100 points and is scored over the
    description. Without it, every posting lands in Stretch with stack 0."""
    responses.add(responses.GET, BOARD, json=FIXTURE, status=200)

    fetch(spec())

    requested = responses.calls[0].request.url
    assert requested is not None
    assert "content=true" in requested


@responses.activate
def test_descriptions_can_be_turned_off_per_source() -> None:
    """An escape hatch for a board large enough that the payload matters."""
    responses.add(responses.GET, BOARD, json=FIXTURE, status=200)

    fetch(spec(config={"content": False}))

    requested = responses.calls[0].request.url
    assert requested is not None
    assert "content=false" in requested


@responses.activate
def test_the_description_reaches_the_posting_as_plain_text() -> None:
    responses.add(
        responses.GET,
        BOARD,
        json={
            "jobs": [
                {
                    "id": 1,
                    "title": "Engineer",
                    "location": {"name": "ISB"},
                    "content": "<p>We use &lt;ASP.NET Core&gt; and C#</p>",
                }
            ]
        },
        status=200,
    )

    description = fetch(spec())[0].description

    assert "<p>" not in description
    assert "ASP.NET Core" in description


@responses.activate
def test_an_empty_board_is_not_an_error() -> None:
    """A company with nothing open is a normal state, not a failure."""
    responses.add(responses.GET, BOARD, json={"jobs": []}, status=200)

    assert fetch(spec()) == []


@responses.activate
def test_a_posting_without_a_title_is_skipped() -> None:
    """It could not be scored, deduplicated or displayed."""
    responses.add(
        responses.GET,
        BOARD,
        json={"jobs": [{"id": 1, "title": "", "location": {"name": "ISB"}}]},
        status=200,
    )

    assert fetch(spec()) == []


@responses.activate
def test_html_in_a_title_is_stripped() -> None:
    """A title containing markup must not reach the page as markup."""
    responses.add(
        responses.GET,
        BOARD,
        json={
            "jobs": [
                {
                    "id": 1,
                    "title": "Engineer <script>alert(1)</script>",
                    "location": {"name": "ISB"},
                }
            ]
        },
        status=200,
    )

    title = fetch(spec())[0].title

    assert "<script>" not in title
    assert "alert(1)" in title


@responses.activate
@pytest.mark.parametrize("status_code", [401, 403, 404, 429, 500, 503])
def test_an_http_error_raises_a_source_error(status_code: int) -> None:
    """Never a bare requests exception — the run records SourceError and moves on."""
    responses.add(responses.GET, BOARD, json={}, status=status_code)

    with pytest.raises(SourceError, match=str(status_code)):
        fetch(spec())


@responses.activate
def test_a_non_json_response_raises_a_source_error() -> None:
    responses.add(responses.GET, BOARD, body="<html>maintenance</html>", status=200)

    with pytest.raises(SourceError, match="did not return JSON"):
        fetch(spec())


@responses.activate
def test_an_unexpected_payload_shape_raises_a_source_error() -> None:
    responses.add(responses.GET, BOARD, json=["not", "a", "dict"], status=200)

    with pytest.raises(SourceError):
        fetch(spec())


def test_a_missing_slug_is_rejected_before_any_request() -> None:
    with pytest.raises(SourceError, match="slug"):
        fetch(SourceSpec(kind="greenhouse"))


def test_an_unregistered_kind_raises_rather_than_failing_silently() -> None:
    with pytest.raises(SourceError, match="No adapter"):
        fetch(SourceSpec(kind="nonexistent-ats"))


@responses.activate
def test_the_company_falls_back_to_the_slug() -> None:
    responses.add(responses.GET, BOARD, json=FIXTURE, status=200)

    assert fetch(SourceSpec(kind="greenhouse", slug="careem"))[0].company == "careem"
