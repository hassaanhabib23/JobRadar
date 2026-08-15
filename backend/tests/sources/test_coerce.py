"""The shared coercion helpers.

These exist because vendors disagree about basic shapes. One helper, used
everywhere, rather than a special case per vendor.
"""

from __future__ import annotations

from datetime import UTC, date, datetime

import pytest

from sources.coerce import days_ago, joined, strip_html, text, to_date, unwrap_redirect


class TestText:
    @pytest.mark.parametrize(
        ("value", "expected"),
        [
            ("Full-Time", "Full-Time"),
            ({"name": "Full-Time"}, "Full-Time"),
            ({"label": "Full-Time"}, "Full-Time"),
            ({"title": "Full-Time"}, "Full-Time"),
            ({"text": "Full-Time"}, "Full-Time"),
            ({"value": "Full-Time"}, "Full-Time"),
            ({"name": {"name": "Nested"}}, "Nested"),
            (None, ""),
            ({}, ""),
            (42, "42"),
            ("  padded  ", "padded"),
        ],
    )
    def test_unwraps_every_shape_vendors_use(self, value: object, expected: str) -> None:
        assert text(value) == expected

    def test_breezys_object_shaped_type_field_parses_without_raising(self) -> None:
        """Breezy sends `{"name": "Full-Time"}` where Workable sends a string."""
        assert text({"id": "fullTime", "name": "Full-Time"}) == "Full-Time"


class TestJoined:
    def test_multi_location_roles_surface_every_location(self) -> None:
        """A role listed in both Rawalpindi and Islamabad must show both."""
        assert joined(["Islamabad", "Rawalpindi"]) == "Islamabad, Rawalpindi"

    def test_drops_blanks_and_duplicates(self) -> None:
        assert joined(["Lahore", "", "Lahore", None, "Karachi"]) == "Lahore, Karachi"

    def test_handles_objects_in_the_list(self) -> None:
        assert joined([{"name": "Islamabad"}, {"name": "Lahore"}]) == "Islamabad, Lahore"


class TestStripHtml:
    def test_removes_markup_and_decodes_entities(self) -> None:
        assert strip_html("<p>Build&nbsp;things &amp; ship</p>").startswith("Build")
        assert "&amp;" not in strip_html("<p>a &amp; b</p>")

    def test_a_script_tag_cannot_survive(self) -> None:
        """A job title containing </script> must not be able to break the page."""
        cleaned = strip_html("Engineer</script><script>alert(1)</script>")

        assert "<script>" not in cleaned
        assert "</script>" not in cleaned

    def test_empty_input(self) -> None:
        assert strip_html(None) == ""


class TestToDate:
    @pytest.mark.parametrize(
        ("value", "expected"),
        [
            ("2026-08-12", date(2026, 8, 12)),
            ("2026-08-12T09:14:03-04:00", date(2026, 8, 12)),
            ("2026-08-12T13:14:03Z", date(2026, 8, 12)),
            (datetime(2026, 8, 12, tzinfo=UTC), date(2026, 8, 12)),
            (date(2026, 8, 12), date(2026, 8, 12)),
            ("Tue, 12 Aug 2026 09:14:03 +0000", date(2026, 8, 12)),
            ("12 Aug 2026", date(2026, 8, 12)),
        ],
    )
    def test_parses_the_shapes_vendors_emit(self, value: object, expected: date) -> None:
        assert to_date(value) == expected

    def test_lever_epoch_milliseconds(self) -> None:
        """Lever's createdAt is milliseconds, not seconds — off by 50 years if confused."""
        assert to_date(1786100149278) == datetime.fromtimestamp(1786100149.278, tz=UTC).date()

    @pytest.mark.parametrize("value", [None, "", "not a date", {}, []])
    def test_no_date_stays_no_date(self, value: object) -> None:
        """An absent date is a real answer, scored down deliberately. Never guess."""
        assert to_date(value) is None


class TestDaysAgo:
    TODAY = date(2026, 8, 15)

    @pytest.mark.parametrize(
        ("prose", "expected"),
        [
            ("Posted Today", date(2026, 8, 15)),
            ("Posted Yesterday", date(2026, 8, 14)),
            ("Posted 2 Days Ago", date(2026, 8, 13)),
            ("Posted 30+ Days Ago", date(2026, 7, 16)),
        ],
    )
    def test_workday_prose_becomes_a_real_date(self, prose: str, expected: date) -> None:
        assert days_ago(prose, self.TODAY) == expected

    def test_thirty_plus_is_treated_as_exactly_thirty(self) -> None:
        """That is the floor the wording guarantees; anything more is invention."""
        parsed = days_ago("Posted 30+ Days Ago", self.TODAY)
        assert parsed is not None
        assert (self.TODAY - parsed).days == 30

    def test_unparseable_prose_yields_no_date(self) -> None:
        assert days_ago("Posted a while back", self.TODAY) is None


class TestUnwrapRedirect:
    def test_recovers_the_real_url_from_a_google_alerts_link(self) -> None:
        """Otherwise every job from an alerts feed points at google.com."""
        wrapped = (
            "https://www.google.com/url?rct=j&sa=t&"
            "url=https://careers.example.com/jobs/123&ct=ga&usg=abc"
        )

        assert unwrap_redirect(wrapped) == "https://careers.example.com/jobs/123"

    def test_url_decodes_the_target(self) -> None:
        wrapped = "https://www.google.com/url?url=https%3A%2F%2Fx.com%2Fa%3Fb%3D1&ct=ga"

        assert unwrap_redirect(wrapped) == "https://x.com/a?b=1"

    def test_leaves_an_ordinary_url_alone(self) -> None:
        assert unwrap_redirect("https://careers.example.com/x") == "https://careers.example.com/x"

    def test_leaves_a_non_redirect_google_url_alone(self) -> None:
        assert unwrap_redirect("https://google.com/about") == "https://google.com/about"

    def test_empty(self) -> None:
        assert unwrap_redirect("") == ""
